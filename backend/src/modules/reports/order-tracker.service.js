const db = require("../../config/db");
const AppError = require("../../shared/AppError");

/*
    Order Tracker: where every order is, who it waits for and for how long; and for one order its whole journey
    (approval -> buying -> IQC -> Store -> production -> QC -> packing -> Store -> bill -> delivery), one line per
    event with who did it and when. Read only, worked out from the records each step already writes.
*/

// after QC, the finished-goods step decides who acts next (same owners as frontend fgFlow.js)
const FG_NEXT = {
    PACKAGING: ["Packing", "QUALITY_FG_MANAGER"],
    PACKED: ["Packed, to hand over to Store", "OPERATIONS_ADMIN"],
    HANDED_OVER: ["Store to receive", "STORE_MANAGER"],
    IN_STORE: ["In stock, to bill", "MARKETING_MANAGER"],
    BILLED: ["Billed, Store to give out", "STORE_MANAGER"],
    DISPATCHED: ["On the way to customer", "MARKETING_MANAGER"],
    DELIVERED: ["Delivered", null],
};

/* the stage of an order and the role it waits for, from its own row plus a few counts */
function stageOf(o) {
    if (o.approval_status === "PENDING_APPROVAL") return ["Waiting for approval", "OPERATIONS_ADMIN"];
    if (o.approval_status === "QUANTITY_REVISED") return ["Marketing to accept the new quantity", "MARKETING_MANAGER"];
    if (o.approval_status === "REJECTED") return ["Rejected", null];
    if (o.approval_status === "CANCELLED") return ["Cancelled", null];
    if (o.fg_status) return FG_NEXT[o.fg_status] || [o.fg_status, null];
    if (o.status === "TESTING") return ["In quality check", "QUALITY_FG_MANAGER"];
    if (n(o.qc_failed_open) > 0) return ["Rework after QC fail", "PRODUCTION_MANAGER"];
    if (o.status === "IN_PRODUCTION") return ["In production", "PRODUCTION_MANAGER"];
    if (n(o.to_buy) > 0) return ["Components to buy", "PURCHASE_MANAGER"];
    if (n(o.po_received) > 0) return ["Arrived: Purchase to send to IQC", "PURCHASE_MANAGER"];
    if (n(o.po_iqc) > 0) return ["IQC to check the components", "IQC_MANAGER"];
    if (n(o.po_store) > 0) return ["Store to accept from IQC", "STORE_MANAGER"];
    if (n(o.buying) > 0) return ["Waiting for supplier delivery", "PURCHASE_MANAGER"];
    if (n(o.requests_open) > 0) return ["Store to hand over material", "STORE_MANAGER"];
    return ["Production to start", "PRODUCTION_MANAGER"];
}

const n = (v) => Number(v || 0);

async function list() {
    const [rows] = await db.query(
        `SELECT o.id, o.order_number, o.status, o.approval_status, o.created_at, o.updated_at, o.estimated_delivery_date,
                u.name AS created_by_name, fg.status AS fg_status,
                GREATEST(o.updated_at, COALESCE(fg.delivered_at, fg.dispatched_at, fg.received_at, fg.handed_over_at, fg.packed_at, fg.created_at, o.updated_at)) AS last_change_at,
                (SELECT GROUP_CONCAT(CONCAT(p.name, ' × ', CAST(oi.quantity AS SIGNED)) ORDER BY oi.id SEPARATOR ', ')
                   FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id) AS products,
                (SELECT COUNT(*) FROM order_purchase_items r WHERE r.order_id = o.id AND r.purchase_order_id IS NULL) AS to_buy,
                (SELECT COUNT(DISTINCT r.purchase_order_id) FROM order_purchase_items r JOIN purchase_orders po ON po.id = r.purchase_order_id
                  WHERE r.order_id = o.id AND po.status NOT IN ('STORED', 'REJECTED')) AS buying,
                (SELECT COUNT(DISTINCT r.purchase_order_id) FROM order_purchase_items r JOIN purchase_orders po ON po.id = r.purchase_order_id
                  WHERE r.order_id = o.id AND po.status = 'RECEIVED') AS po_received,
                (SELECT COUNT(DISTINCT r.purchase_order_id) FROM order_purchase_items r JOIN purchase_orders po ON po.id = r.purchase_order_id
                  WHERE r.order_id = o.id AND po.status = 'PENDING_IQC') AS po_iqc,
                (SELECT COUNT(DISTINCT r.purchase_order_id) FROM order_purchase_items r JOIN purchase_orders po ON po.id = r.purchase_order_id
                  WHERE r.order_id = o.id AND po.status = 'PENDING_STORE') AS po_store,
                (SELECT COUNT(*) FROM production_material_requests m WHERE m.order_id = o.id AND m.status <> 'ISSUED') AS requests_open,
                (SELECT COUNT(*) FROM quality_control_rework_cycles rc JOIN production_orders po ON po.id = rc.production_id
                  WHERE po.order_id = o.id AND rc.status <> 'QC_REVIEWED') AS qc_failed_open
         FROM orders o
         LEFT JOIN users u ON u.id = o.created_by
         LEFT JOIN finished_goods fg ON fg.order_id = o.id
         WHERE o.approval_status <> 'DRAFT'
         ORDER BY o.id DESC`
    );
    const now = Date.now();
    return rows.map((o) => {
        const [stage, waitingFor] = stageOf(o);
        const since = o.last_change_at ? new Date(o.last_change_at).getTime() : now;
        return {
            id: o.id,
            orderNumber: o.order_number,
            products: o.products,
            createdByName: o.created_by_name,
            createdAt: o.created_at,
            promisedDate: o.estimated_delivery_date,
            stage,
            waitingFor,
            done: !waitingFor,
            daysWaiting: waitingFor ? Math.floor((now - since) / 86400000) : null,
        };
    });
}

/* every event of one order, oldest first */
async function timeline(orderId) {
    const [[o]] = await db.query(
        `SELECT o.*, cu.name AS created_by_name, au.name AS approved_by_name, ru.name AS revised_by_name
         FROM orders o
         LEFT JOIN users cu ON cu.id = o.created_by
         LEFT JOIN users au ON au.id = o.approved_by
         LEFT JOIN users ru ON ru.id = o.revised_by
         WHERE o.id = ?`,
        [orderId]
    );
    if (!o || o.approval_status === "DRAFT") throw AppError.notFound("Order not found", "NOT_FOUND");

    const events = [];
    const add = (at, stage, title, by = null, detail = null, tone = "done") => { if (at) events.push({ at, stage, title, by, detail, tone }); };

    add(o.created_at, "Order", "Order created", o.created_by_name);
    add(o.sent_to_admin_at, "Order", "Sent to Operations Admin for approval", o.created_by_name);
    add(o.revised_at, "Order", "Quantity revised by Operations Admin", o.revised_by_name, null, "warning");
    if (o.approval_status === "REJECTED") add(o.updated_at, "Order", "Rejected", null, o.approval_remarks, "danger");
    add(o.approved_at, "Order", "Approved: components taken from stock", o.approved_by_name);
    if (o.approval_status === "CANCELLED") add(o.updated_at, "Order", "Cancelled: components back in stock", null, o.approval_remarks, "danger");

    const [pos] = await db.query(
        `SELECT DISTINCT po.id, po.po_number, po.supplier, po.status, po.created_at, po.received_at, po.sent_to_iqc_at, po.iqc_at, po.accepted_at,
                po.expected_delivery_date, cu.name AS created_by_name, ru.name AS received_by_name, iu.name AS iqc_by_name, au.name AS accepted_by_name,
                (SELECT COALESCE(SUM(quantity_defective), 0) FROM purchase_order_items WHERE purchase_order_id = po.id) AS rejected
         FROM order_purchase_items r JOIN purchase_orders po ON po.id = r.purchase_order_id
         LEFT JOIN users cu ON cu.id = po.created_by LEFT JOIN users ru ON ru.id = po.received_by
         LEFT JOIN users iu ON iu.id = po.iqc_by LEFT JOIN users au ON au.id = po.accepted_by
         WHERE r.order_id = ?`,
        [orderId]
    );
    for (const p of pos) {
        add(p.created_at, "Buying", `${p.po_number} placed with ${p.supplier}`, p.created_by_name,
            p.expected_delivery_date ? `Promised by ${new Date(p.expected_delivery_date).toLocaleDateString("en-IN")}` : null);
        add(p.received_at, "Buying", `${p.po_number} received from supplier`, p.received_by_name);
        add(p.iqc_at, "IQC", `${p.po_number} checked by IQC`, p.iqc_by_name, n(p.rejected) ? `${n(p.rejected)} pieces rejected (kept with IQC)` : "Nothing rejected", n(p.rejected) ? "warning" : "done");
        add(p.accepted_at, "Store", `${p.po_number} accepted into stock`, p.accepted_by_name);
    }
    const [[toBuy]] = await db.query(`SELECT COUNT(*) AS n FROM order_purchase_items WHERE order_id = ? AND purchase_order_id IS NULL`, [orderId]);

    const [reqs] = await db.query(
        `SELECT m.id, m.created_at, m.status, m.requested_product_quantity, p.name AS product, u.name AS by_name,
                (SELECT MAX(i.issued_at) FROM production_material_issues i JOIN production_material_request_items ri ON ri.id = i.request_item_id WHERE ri.request_id = m.id) AS issued_at,
                (SELECT iu.name FROM production_material_issues i JOIN production_material_request_items ri ON ri.id = i.request_item_id
                   JOIN users iu ON iu.id = i.issued_by WHERE ri.request_id = m.id ORDER BY i.issued_at DESC LIMIT 1) AS issued_by_name
         FROM production_material_requests m
         JOIN order_items oi ON oi.id = m.order_item_id JOIN products p ON p.id = oi.product_id
         LEFT JOIN users u ON u.id = m.requested_by
         WHERE m.order_id = ?`,
        [orderId]
    );
    for (const r of reqs) {
        const units = r.requested_product_quantity ? ` for ${n(r.requested_product_quantity)} units` : "";
        add(r.created_at, "Store", `Production asked for material: ${r.product}${units}`, r.by_name);
        add(r.issued_at, "Store", `Store handed over material: ${r.product}`, r.issued_by_name);
    }

    const [extras] = await db.query(
        `SELECT e.requested_at, e.decided_at, e.status, e.quantity, e.reason, c.name AS component, c.unit, ru.name AS by_name, du.name AS decided_by_name
         FROM extra_material_requests e JOIN components c ON c.id = e.component_id
         LEFT JOIN users ru ON ru.id = e.requested_by LEFT JOIN users du ON du.id = e.decided_by
         WHERE e.order_id = ?`,
        [orderId]
    );
    for (const e of extras) {
        add(e.requested_at, "Production", `Extra material asked: ${e.component} × ${n(e.quantity)} ${e.unit}`, e.by_name, e.reason, "warning");
        add(e.decided_at, "Store", `Extra material ${e.status === "ISSUED" ? "issued" : "rejected"}: ${e.component}`, e.decided_by_name, null, e.status === "ISSUED" ? "done" : "danger");
    }

    const [runs] = await db.query(
        `SELECT po.id, po.started_at, po.completed_at, po.quantity_to_produce, po.quantity_completed, p.name AS product, su.name AS started_by_name
         FROM production_orders po JOIN order_items oi ON oi.id = po.order_item_id JOIN products p ON p.id = oi.product_id
         LEFT JOIN users su ON su.id = po.started_by
         WHERE po.order_id = ?`,
        [orderId]
    );
    for (const r of runs) {
        add(r.started_at, "Production", `Production started: ${r.product}`, r.started_by_name);
        add(r.completed_at, "Production", `Production finished: ${r.product} (${n(r.quantity_completed)} units)`);
    }
    const [qc] = await db.query(
        `SELECT d.decided_at, d.decision, d.attempt_number, d.sample_size, d.sample_failed, d.remarks, p.name AS product, u.name AS by_name
         FROM quality_control_batch_decisions d JOIN production_orders po ON po.id = d.production_id
         JOIN order_items oi ON oi.id = po.order_item_id JOIN products p ON p.id = oi.product_id
         LEFT JOIN users u ON u.id = d.decided_by
         WHERE po.order_id = ?`,
        [orderId]
    );
    for (const d of qc) {
        const sample = d.sample_size ? `${n(d.sample_failed)} of ${n(d.sample_size)} sample pieces failed` : null;
        add(d.decided_at, "QC", `QC ${d.decision === "PASS" ? "passed" : "failed"}: ${d.product} (try ${d.attempt_number})`, d.by_name,
            [sample, d.decision === "FAIL" ? d.remarks : null].filter(Boolean).join(". ") || null, d.decision === "PASS" ? "done" : "danger");
    }

    const [[fg]] = await db.query(
        `SELECT fg.*, pu.name AS packed_by_name, hu.name AS handed_over_by_name, ru.name AS received_by_name,
                du.name AS dispatched_by_name, lu.name AS delivered_by_name,
                b.bill_number, b.total, b.customer_name, b.created_at AS billed_at, bu.name AS billed_by_name
         FROM finished_goods fg
         LEFT JOIN users pu ON pu.id = fg.packed_by LEFT JOIN users hu ON hu.id = fg.handed_over_by
         LEFT JOIN users ru ON ru.id = fg.received_by LEFT JOIN users du ON du.id = fg.dispatched_by
         LEFT JOIN users lu ON lu.id = fg.delivered_by
         LEFT JOIN bills b ON b.finished_goods_id = fg.id LEFT JOIN users bu ON bu.id = b.created_by
         WHERE fg.order_id = ?`,
        [orderId]
    );
    if (fg) {
        add(fg.created_at, "Dispatch", "Passed QC, sent for packing");
        add(fg.packed_at, "Dispatch", "Packed", fg.packed_by_name);
        add(fg.handed_over_at, "Dispatch", "Handed over to Store", fg.handed_over_by_name);
        add(fg.received_at, "Dispatch", "Received into product stock", fg.received_by_name);
        add(fg.billed_at, "Dispatch", `Bill ${fg.bill_number} made for ${fg.customer_name}`, fg.billed_by_name, `₹${n(fg.total).toLocaleString("en-IN")}`);
        add(fg.dispatched_at, "Dispatch", "Given out for delivery", fg.dispatched_by_name, fg.dispatch_note);
        add(fg.delivered_at, "Dispatch", "Delivered to customer", fg.delivered_by_name, fg.delivery_note);
    }

    events.sort((a, b) => new Date(a.at) - new Date(b.at));
    // how long each step took = time since the event before it
    events.forEach((e, i) => { e.daysTaken = i ? Number(((new Date(e.at) - new Date(events[i - 1].at)) / 86400000).toFixed(1)) : null; });

    const [summary] = (await list()).filter((x) => x.id === orderId);
    return { ...summary, toBuy: n(toBuy.n), events };
}

module.exports = { list, timeline };
