const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");
const purchases = require("../purchase/purchase.service");

/*
    IQC (incoming quality control). For every purchased component the IQC manager records
        received   how many pieces actually arrived (can be less / more than ordered)
        defective  how many of those are bad
    The inspector then TICKS every component line that is fine (approve: true). For a ticked line
    approved = received - defective and it goes to the store manager. An unticked line is REJECTED
    (approved = 0) and stays with IQC. If no line is ticked the whole purchase is REJECTED.
*/

function parseInspection(body) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new AppError(422, "Inspect every component of the purchase", "VALIDATION");
    }
    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : "";
    if (remarks.length > 500) throw new AppError(422, "Remarks must be 500 characters or fewer", "VALIDATION");

    const seen = new Set();
    const items = body.items.map((raw, line) => {
        const id = Number(raw && raw.id);
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
            throw new AppError(422, "Invalid inspection line", "VALIDATION", { line });
        }
        seen.add(id);

        const field = (name, label, value, opts) => {
            try {
                return inventory.parseQty(value, label, opts);
            } catch (error) {
                error.extra = { line, field: name };
                throw error;
            }
        };
        if (typeof raw.approve !== "boolean") {
            throw new AppError(422, "Tick or untick every component", "VALIDATION", { line, field: "approve" });
        }
        const received = field("received", "Received quantity", raw.received, { allowZero: true });
        const defective =
            raw.defective === undefined || raw.defective === null || raw.defective === ""
                ? 0
                : field("defective", "Defective quantity", raw.defective, { allowZero: true });

        if (defective > received) {
            throw new AppError(422, "Defective quantity cannot be more than the received quantity", "VALIDATION", { line, field: "defective" });
        }
        const note = typeof raw.remarks === "string" ? raw.remarks.trim() : "";
        if (note.length > 255) throw new AppError(422, "Line remarks must be 255 characters or fewer", "VALIDATION", { line, field: "remarks" });

        const good = received - defective;
        if (raw.approve && good <= 0) {
            throw new AppError(422, "Nothing to approve on this line. Untick it to reject it.", "VALIDATION", { line, field: "approve" });
        }
        // a rejected line sends nothing to the store, whatever the counts say
        return { id, received, defective, approved: raw.approve ? good : 0, decision: raw.approve ? "APPROVED" : "REJECTED", remarks: note || null };
    });

    return { items, remarks: remarks || null };
}

async function inspect(purchaseId, body, userId) {
    const { items, remarks } = parseInspection(body || {});

    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(`SELECT id, status FROM purchase_orders WHERE id = ? FOR UPDATE`, [purchaseId]);
        if (rows.length === 0) throw AppError.notFound("Purchase not found", "NOT_FOUND");
        if (rows[0].status !== "PENDING_IQC") {
            throw AppError.conflict("This purchase has already been inspected. Refresh the page.", "ALREADY_INSPECTED");
        }

        const [lines] = await conn.query(`SELECT id FROM purchase_order_items WHERE purchase_order_id = ?`, [purchaseId]);
        const byId = new Map(items.map((i) => [i.id, i]));
        if (lines.length !== items.length || lines.some((l) => !byId.has(l.id))) {
            throw new AppError(422, "Inspect every component of the purchase", "VALIDATION");
        }

        let approvedTotal = 0;
        for (const l of lines) {
            const it = byId.get(l.id);
            approvedTotal += it.approved;
            await conn.query(
                `UPDATE purchase_order_items
                    SET quantity_received = ?, quantity_defective = ?, quantity_approved = ?, iqc_decision = ?, remarks = ?
                  WHERE id = ?`,
                [inventory.fromCents(it.received), inventory.fromCents(it.defective), inventory.fromCents(it.approved), it.decision, it.remarks, l.id]
            );
        }

        await conn.query(
            `UPDATE purchase_orders
                SET status = ?, iqc_by = ?, iqc_at = NOW(), iqc_remarks = ?
              WHERE id = ?`,
            [approvedTotal > 0 ? "PENDING_STORE" : "REJECTED", userId, remarks, purchaseId]
        );

        return purchases.getPurchase(purchaseId, conn);
    });
}

module.exports = { inspect };
