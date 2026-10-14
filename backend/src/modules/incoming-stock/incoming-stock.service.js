const crypto = require("crypto");
const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");
const purchases = require("../purchase/purchase.service");

/*
    Store manager side. A purchase shows up here once IQC approved it (PENDING_STORE).
    Accepting it is the ONLY way those pieces enter inventory: the approved quantity of every line is
    stocked in (ledger row per line, reference = PO number) and the purchase becomes STORED, all in one
    DB transaction. There is deliberately no "reject" here: IQC has already decided.
*/

async function list() {
    return purchases.listPurchases({ statuses: ["PENDING_STORE", "STORED"] });
}

async function accept(purchaseId, userId) {
    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(
            `SELECT id, po_number, supplier, status FROM purchase_orders WHERE id = ? FOR UPDATE`,
            [purchaseId]
        );
        if (rows.length === 0) throw AppError.notFound("Purchase not found", "NOT_FOUND");
        const po = rows[0];

        if (po.status === "STORED") {
            throw AppError.conflict("This purchase is already accepted into stock.", "ALREADY_ACCEPTED");
        }
        if (po.status !== "PENDING_STORE") {
            throw AppError.conflict("This purchase has not been approved by IQC yet.", "NOT_APPROVED");
        }

        const [items] = await conn.query(
            `SELECT id, component_id, quantity_approved FROM purchase_order_items
              WHERE purchase_order_id = ? AND quantity_approved > 0 ORDER BY id`,
            [purchaseId]
        );

        const reason = `Purchase ${po.po_number} from ${po.supplier} (IQC approved)`.slice(0, 255);
        const lines = items.map((it) => ({
            componentId: it.component_id,
            cents: inventory.toCents(it.quantity_approved),
            reason,
            referenceNo: po.po_number,
            // one stable key per PO line: even a replayed request can never stock the same line twice
            key: crypto.createHash("sha1").update(`po-accept:${purchaseId}:${it.id}`).digest("hex"),
        }));
        await inventory.postReceiptLines(conn, lines, userId);

        await conn.query(
            `UPDATE purchase_orders SET status = 'STORED', accepted_by = ?, accepted_at = NOW() WHERE id = ?`,
            [userId, purchaseId]
        );
        return purchases.getPurchase(purchaseId, conn);
    });
}

module.exports = { list, accept };
