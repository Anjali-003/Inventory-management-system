const crypto = require("crypto");
const AppError = require("../../shared/AppError");
const inventory = require("../../store/inventory/inventory.service");
const purchases = require("../purchase-orders/purchase-order.service");
const notifications = require("../../core/notifications/notification.service");

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

        // Purchase closes its loop; the Operations Admin hears it for EVERY order this purchase covered (a combined
        // purchase serves several orders, a purchase for stock none)
        const [orders] = await conn.query(
            `SELECT DISTINCT o.id, o.order_number FROM order_purchase_items r JOIN orders o ON o.id = r.order_id
             WHERE r.purchase_order_id = ? ORDER BY o.id`,
            [purchaseId]
        );
        const numbers = orders.map((o) => o.order_number);
        const forWhat = numbers.length === 0 ? " for stock" : ` for order${numbers.length > 1 ? "s" : ""} ${numbers.join(", ")}`;
        await notifications.notify(conn, {
            role: "PURCHASE_MANAGER",
            type: "PURCHASE_STORED",
            title: `Purchase ${po.po_number} is in stock`,
            body: `The Store Manager accepted the IQC approved parts${forWhat}.`.slice(0, 500),
            severity: "success",
            link: "/purchase",
            orderId: orders.length === 1 ? orders[0].id : null,
            payload: { purchase_id: purchaseId, po_number: po.po_number, order_numbers: numbers },
            userId,
        });
        for (const o of orders) {
            await notifications.notify(conn, {
                role: "OPERATIONS_ADMIN",
                type: "PURCHASE_STORED",
                title: `Parts for order ${o.order_number} are in stock`,
                body: `Purchase ${po.po_number} passed IQC and was accepted into the store.`,
                severity: "info",
                link: `/order-approvals?order=${o.id}`,
                orderId: o.id,
                payload: { purchase_id: purchaseId, po_number: po.po_number, order_number: o.order_number },
                userId,
            });
        }
        return purchases.getPurchase(purchaseId, conn);
    });
}

module.exports = { list, accept };
