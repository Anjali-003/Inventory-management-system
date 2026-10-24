const crypto = require("crypto");
const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");
const purchases = require("../purchase/purchase.service");
const notifications = require("../notifications/notification.service");

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
            `SELECT id, po_number, supplier, status, order_id FROM purchase_orders WHERE id = ? FOR UPDATE`,
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

        // Purchase closes its loop; the Operations Admin knows the shortfall of that order is now on the shelf
        const [orders] = po.order_id ? await conn.query(`SELECT order_number FROM orders WHERE id = ?`, [po.order_id]) : [[]];
        const orderNumber = orders[0] && orders[0].order_number;
        const payload = { purchase_id: purchaseId, po_number: po.po_number, order_number: orderNumber || null };
        await notifications.notify(conn, {
            role: "PURCHASE_MANAGER",
            type: "PURCHASE_STORED",
            title: `Purchase ${po.po_number} is in stock`,
            body: `The Store Manager accepted the IQC approved parts${orderNumber ? ` for order ${orderNumber}` : ""}.`,
            severity: "success",
            link: "/purchase",
            orderId: po.order_id || null,
            payload,
            userId,
        });
        if (po.order_id) {
            await notifications.notify(conn, {
                role: "OPERATIONS_ADMIN",
                type: "PURCHASE_STORED",
                title: `Parts for order ${orderNumber || `#${po.order_id}`} are in stock`,
                body: `Purchase ${po.po_number} passed IQC and was accepted into the store.`,
                severity: "info",
                link: `/order-approvals?order=${po.order_id}`,
                orderId: po.order_id,
                payload,
                userId,
            });
        }
        return purchases.getPurchase(purchaseId, conn);
    });
}

module.exports = { list, accept };
