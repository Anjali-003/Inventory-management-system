const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");
const purchases = require("../purchase/purchase.service");
const notifications = require("../notifications/notification.service");

/*
    IQC (incoming quality control). The purchase manager has already counted what arrived (quantity_received, set
    when he marked the purchase received). For every component the IQC manager only says
        rejected   how many of the received pieces failed (0 = all fine)
        remarks    why (required when anything is rejected)
    accepted = received - rejected goes to the store manager; the rejected pieces stay with IQC. A component with
    nothing accepted is REJECTED; if nothing at all is accepted the whole purchase is REJECTED.
    (Older screens sent { received, defective, approve }: "defective" is read as "rejected", the rest is ignored.)
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

        const value = raw.rejected !== undefined ? raw.rejected : raw.defective;
        let rejected = 0;
        if (value !== undefined && value !== null && value !== "") {
            try {
                rejected = inventory.parseQty(value, "Rejected quantity", { allowZero: true });
            } catch (error) {
                error.extra = { line, field: "rejected" };
                throw error;
            }
        }
        const note = typeof raw.remarks === "string" ? raw.remarks.trim() : "";
        if (note.length > 255) throw new AppError(422, "Line remarks must be 255 characters or fewer", "VALIDATION", { line, field: "remarks" });
        return { id, line, rejected, remarks: note || null };
    });

    return { items, remarks: remarks || null };
}

async function inspect(purchaseId, body, userId) {
    const { items, remarks } = parseInspection(body || {});

    return inventory.inTransaction(async (conn) => {
        const [rows] = await conn.query(`SELECT id, po_number, status FROM purchase_orders WHERE id = ? FOR UPDATE`, [purchaseId]);
        if (rows.length === 0) throw AppError.notFound("Purchase not found", "NOT_FOUND");
        if (rows[0].status !== "PENDING_IQC") {
            throw AppError.conflict("This purchase has already been inspected. Refresh the page.", "ALREADY_INSPECTED");
        }

        const [lines] = await conn.query(
            `SELECT id, COALESCE(quantity_received, quantity_ordered) AS received FROM purchase_order_items WHERE purchase_order_id = ?`,
            [purchaseId]
        );
        const byId = new Map(items.map((i) => [i.id, i]));
        if (lines.length !== items.length || lines.some((l) => !byId.has(l.id))) {
            throw new AppError(422, "Inspect every component of the purchase", "VALIDATION");
        }
        // the received count comes from the purchase manager; IQC can only reject part (or all) of it
        for (const l of lines) {
            const it = byId.get(l.id);
            it.received = inventory.toCents(l.received);
            if (it.rejected > it.received) {
                throw new AppError(422, "Rejected pieces cannot be more than the received pieces", "VALIDATION", { line: it.line, field: "rejected" });
            }
            if (it.rejected > 0 && !it.remarks) {
                throw new AppError(422, "Enter the reason for the rejected pieces", "VALIDATION", { line: it.line, field: "remarks" });
            }
            it.defective = it.rejected;
            it.approved = it.received - it.rejected;
            it.decision = it.approved > 0 ? "APPROVED" : "REJECTED";
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

        // Tell the Store Manager ONLY after the transaction has committed (never for a rolled-back inspection)
        const poNumber = rows[0].po_number || `#${purchaseId}`;
        if (approvedTotal > 0) {
            await notifications.notify(conn, {
                role: "STORE_MANAGER",
                type: "PURCHASE_READY_FOR_STORE",
                title: `Purchase ${poNumber} passed IQC`,
                body: "Accept the approved components into stock.",
                severity: "action",
                link: "/incoming-stock?status=PENDING_STORE",
                payload: { purchase_id: purchaseId, po_number: poNumber },
                userId
            });
        }

        // the Purchase Manager hears the result, above all what was rejected (to raise a replacement)
        const rejected = items.filter((it) => it.decision === "REJECTED").length;
        const defective = items.some((it) => it.defective > 0);
        await notifications.notify(conn, {
            role: "PURCHASE_MANAGER",
            type: "IQC_RESULT",
            title: approvedTotal === 0
                ? `Purchase ${poNumber} was rejected by IQC`
                : rejected
                    ? `Purchase ${poNumber} partly rejected by IQC`
                    : `Purchase ${poNumber} passed IQC`,
            body: approvedTotal === 0
                ? "Nothing was approved. Check the inspection and arrange a replacement."
                : rejected
                    ? `${rejected} component line${rejected === 1 ? "" : "s"} rejected. The approved parts went to the store.`
                    : defective
                        ? "Some pieces were rejected and stay with IQC. The accepted pieces went to the store."
                        : "Every component was approved and sent to the store.",
            severity: approvedTotal === 0 || rejected || defective ? "warning" : "success",
            link: "/purchase",
            payload: { purchase_id: purchaseId, po_number: poNumber, rejected_lines: rejected },
            userId
        });

        return purchases.getPurchase(purchaseId, conn);
    });
}

module.exports = { inspect };
