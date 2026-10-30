const crypto = require("crypto");
const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const { inTransaction } = require("../../store/inventory/inventory.service");
const notifications = require("../../core/notifications/notification.service");

const MARKETING = new Set(["MARKETING_MANAGER", "SUPER_ADMIN"]);
const APPROVERS = new Set(["PRODUCTION_ADMIN", "SUPER_ADMIN"]);
const PRODUCTION = new Set(["PRODUCTION_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"]);
const QC = new Set(["QUALITY_FG_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"]);
const RETURNERS = new Set(["QUALITY_FG_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"]);
const roleOf = (user) => String(user && user.role || "").toUpperCase();
const positiveInt = (value, label) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError(422, `${label} must be a whole number greater than zero`, "VALIDATION");
  return n;
};
const optionalText = (value, max = 4000) => {
  if (value == null) return null;
  const text = String(value).trim();
  if (text.length > max) throw new AppError(422, `Text must be ${max} characters or fewer`, "VALIDATION");
  return text || null;
};

function parseCustomerImage(image) {
  if (image == null) return null;
  if (!image || typeof image !== "object" || Array.isArray(image)) {
    throw new AppError(422, "The attached picture is invalid.", "VALIDATION");
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(image.dataUrl || ""));
  if (!match) throw new AppError(422, "Attach a valid JPG, PNG or WEBP picture.", "VALIDATION");

  const mimeType = match[1].toLowerCase();
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > 1024 * 1024) {
    throw new AppError(422, "The compressed picture must be 1 MB or smaller.", "VALIDATION");
  }

  const validSignature = mimeType === "image/jpeg"
    ? data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
    : mimeType === "image/png"
      ? data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  if (!validSignature) throw new AppError(422, "The attached file does not match its image type.", "VALIDATION");

  const rawName = String(image.fileName || "repair-picture").split(/[\\/]/).pop().trim();
  const fileName = (rawName || "repair-picture").replace(/[\r\n\"<>]/g, "_").slice(0, 255);
  return { data, mimeType, fileName: fileName || "repair-picture" };
}

async function addEvent(conn, repairId, userId, action, fromStatus, toStatus, quantity = null, remarks = null) {
  await conn.query(
    `INSERT INTO repair_events (repair_id, action, from_status, to_status, quantity, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [repairId, action, fromStatus, toStatus, quantity, remarks, userId]
  );
}

async function getOne(id, conn = db) {
  const [rows] = await conn.query(
    `SELECT r.*, p.sku AS product_sku, p.name AS product_name,
            creator.name AS created_by_name, approver.name AS approved_by_name,
            dispatcher.name AS dispatched_by_name,
            attachment.file_name AS customer_image_file_name,
            attachment.mime_type AS customer_image_mime_type,
            attachment.file_size AS customer_image_file_size
     FROM repair_requests r
     JOIN products p ON p.id = r.product_id
     JOIN users creator ON creator.id = r.created_by
     LEFT JOIN users approver ON approver.id = r.approved_by
     LEFT JOIN users dispatcher ON dispatcher.id = r.dispatched_by
     LEFT JOIN repair_attachments attachment ON attachment.repair_id = r.id
     WHERE r.id = ?`, [id]
  );
  if (!rows.length) throw AppError.notFound("Repair request not found", "NOT_FOUND");
  const [events] = await conn.query(
    `SELECT e.id, e.action, e.from_status, e.to_status, e.quantity, e.remarks, e.created_at, u.name AS actor_name
     FROM repair_events e JOIN users u ON u.id = e.created_by
     WHERE e.repair_id = ? ORDER BY e.id DESC LIMIT 100`, [id]
  );
  const {
    customer_image_file_name: imageName,
    customer_image_mime_type: imageMimeType,
    customer_image_file_size: imageSize,
    ...repair
  } = rows[0];
  const customerImage = imageName ? { file_name: imageName, mime_type: imageMimeType, file_size: imageSize } : null;
  return { ...repair, customer_image: customerImage, events };
}

async function list(user) {
  const role = roleOf(user);
  let where = "";
  const params = [];
  if (role === "MARKETING_MANAGER") where = "JOIN users creator_filter ON creator_filter.id = r.created_by WHERE creator_filter.role IN ('MARKETING_MANAGER', 'SUPER_ADMIN')";
  const [rows] = await db.query(
    `SELECT r.id FROM repair_requests r ${where} ORDER BY r.id DESC LIMIT 500`, params
  );
  const result = [];
  for (const row of rows) result.push(await getOne(row.id));
  return result;
}

async function productOptions() {
  const [rows] = await db.query(`SELECT id, sku, name FROM products WHERE is_active = TRUE ORDER BY name`);
  return rows;
}

async function create(body, user) {
  if (!MARKETING.has(roleOf(user))) throw AppError.forbidden("Only Marketing can raise a repair request.");
  const productId = positiveInt(body.productId, "Product");
  const quantity = positiveInt(body.quantity, "Quantity");
  const customerName = optionalText(body.customerName, 180);
  const problem = optionalText(body.problemDescription, 4000);
  if (!customerName) throw new AppError(422, "Customer name is required", "VALIDATION");
  if (!problem) throw new AppError(422, "Describe the reported problem", "VALIDATION");
  const customerReference = optionalText(body.customerReference, 120);
  const customerImage = parseCustomerImage(body.customerImage);
  return inTransaction(async (conn) => {
    const [products] = await conn.query(`SELECT id FROM products WHERE id = ? AND is_active = TRUE`, [productId]);
    if (!products.length) throw AppError.notFound("Product not found or inactive", "NOT_FOUND");
    const [insert] = await conn.query(
      `INSERT INTO repair_requests (repair_number, product_id, requested_quantity, customer_name, customer_reference, problem_description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`TEMP-${Date.now()}-${user.id}-${crypto.randomBytes(4).toString("hex")}`, productId, quantity, customerName, customerReference, problem, user.id]
    );
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const repairNumber = `RPR-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${String(insert.insertId).padStart(4, "0")}`;
    await conn.query(`UPDATE repair_requests SET repair_number = ?, status = 'PENDING_APPROVAL' WHERE id = ?`, [repairNumber, insert.insertId]);
    if (customerImage) {
      await conn.query(
        `INSERT INTO repair_attachments (repair_id, file_name, mime_type, file_size, file_data)
         VALUES (?, ?, ?, ?, ?)`,
        [insert.insertId, customerImage.fileName, customerImage.mimeType, customerImage.data.length, customerImage.data]
      );
    }
    await addEvent(conn, insert.insertId, user.id, "REQUEST_SUBMITTED", "DRAFT", "PENDING_APPROVAL", quantity, problem);
    await notifications.notify(conn, { role: "PRODUCTION_ADMIN", type: "REPAIR_REQUESTED", title: `Repair request ${repairNumber} needs approval`, body: `${quantity} × product repair requested by Marketing.`, severity: "action", link: "/repair-approvals", payload: { repair_number: repairNumber }, userId: user.id });
    return getOne(insert.insertId, conn);
  });
}

async function getImage(id) {
  const [rows] = await db.query(
    `SELECT file_name, mime_type, file_size, file_data FROM repair_attachments WHERE repair_id = ? LIMIT 1`, [id]
  );
  if (!rows.length) throw AppError.notFound("Repair picture not found", "NOT_FOUND");
  return {
    file_name: rows[0].file_name,
    mime_type: rows[0].mime_type,
    file_size: rows[0].file_size,
    data: rows[0].file_data,
  };
}

async function decide(id, body, user) {
  if (!APPROVERS.has(roleOf(user))) throw AppError.forbidden("Only Production Admin can approve or reject repair requests.");
  const decision = String(body.decision || "").toUpperCase();
  if (!["APPROVE", "REJECT"].includes(decision)) throw new AppError(422, "Choose approve or reject", "VALIDATION");
  const remarks = optionalText(body.remarks, 2000);
  if (decision === "REJECT" && !remarks) throw new AppError(422, "A rejection reason is required", "VALIDATION");
  return inTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT * FROM repair_requests WHERE id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw AppError.notFound("Repair request not found", "NOT_FOUND");
    const r = rows[0];
    if (r.status !== "PENDING_APPROVAL") throw AppError.conflict("This repair request has already been reviewed.", "INVALID_STATUS");
    const next = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    await conn.query(`UPDATE repair_requests SET status = ?, approval_remarks = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`, [next, remarks, user.id, id]);
    await addEvent(conn, id, user.id, decision, r.status, next, null, remarks);
    await notifications.notify(conn, { role: "MARKETING_MANAGER", type: decision === "APPROVE" ? "REPAIR_APPROVED" : "REPAIR_REJECTED", title: `Repair ${r.repair_number || `#${id}`} ${decision === "APPROVE" ? "approved" : "rejected"}`, body: remarks || "The repair request has been reviewed.", severity: decision === "APPROVE" ? "success" : "warning", link: "/repair-requests", payload: { repair_id: id }, userId: user.id });
    if (decision === "APPROVE") await notifications.notify(conn, { role: "PRODUCTION_MANAGER", type: "REPAIR_APPROVED", title: `Repair ${r.repair_number} ready for production`, body: `Repair ${r.requested_quantity} items and update progress in Repair Production.`, severity: "action", link: "/repair-production", payload: { repair_id: id }, userId: user.id });
    return getOne(id, conn);
  });
}

async function updateProgress(id, body, user) {
  if (!PRODUCTION.has(roleOf(user))) throw AppError.forbidden("Only Production can update repair progress.");
  const quantity = positiveInt(body.quantity, "Fixed quantity");
  const diagnosis = optionalText(body.diagnosis, 4000);
  const notes = optionalText(body.notes, 4000);
  return inTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT * FROM repair_requests WHERE id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw AppError.notFound("Repair request not found", "NOT_FOUND");
    const r = rows[0];
    if (!["APPROVED", "IN_REPAIR", "QC_FAILED", "READY_FOR_QC"].includes(r.status)) {
      throw AppError.conflict("This repair is not currently available for repair work.", "INVALID_STATUS");
    }

    const outstanding = r.requested_quantity - r.repaired_quantity;
    if (outstanding <= 0) throw AppError.conflict("All requested items are already repaired and waiting for QC.", "INVALID_STATUS");
    if (quantity > outstanding) throw new AppError(422, `Only ${outstanding} item(s) remain to be repaired.`, "QUANTITY_EXCEEDED");

    const nextQty = r.repaired_quantity + quantity;
    const nextStatus = nextQty === r.requested_quantity ? "READY_FOR_QC" : "IN_REPAIR";
    await conn.query(
      `UPDATE repair_requests
       SET repaired_quantity = ?, diagnosis = COALESCE(?, diagnosis), repair_notes = COALESCE(?, repair_notes), status = ?
       WHERE id = ?`,
      [nextQty, diagnosis, notes, nextStatus, id]
    );
    await addEvent(conn, id, user.id, "REPAIR_PROGRESS", r.status, nextStatus, quantity, notes || diagnosis);

    if (nextStatus === "READY_FOR_QC") {
      await notifications.notify(conn, {
        role: "QUALITY_FG_MANAGER",
        type: "REPAIR_READY_FOR_QC",
        title: `Repair ${r.repair_number} ready for final QC`,
        body: `All ${r.requested_quantity} requested item(s) have been repaired. Make one pass/fail decision for the complete repair batch.`,
        severity: "action",
        link: "/repair-qc",
        payload: { repair_id: id },
        userId: user.id,
      });
    }

    return getOne(id, conn);
  });
}

async function inspect(id, body, user) {
  if (!QC.has(roleOf(user))) throw AppError.forbidden("Only Quality Control can inspect repairs.");
  const decision = String(body.decision || "").toUpperCase();
  if (!["PASS", "FAIL"].includes(decision)) throw new AppError(422, "Choose Pass or Fail", "VALIDATION");
  const remarks = optionalText(body.remarks, 4000);
  if (decision === "FAIL" && !remarks) throw new AppError(422, "A failure remark is required", "VALIDATION");

  return inTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT * FROM repair_requests WHERE id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw AppError.notFound("Repair request not found", "NOT_FOUND");
    const r = rows[0];
    const requested = Number(r.requested_quantity);
    const repaired = Number(r.repaired_quantity);

    if (r.status !== "READY_FOR_QC" || requested <= 0 || repaired !== requested) {
      throw AppError.conflict("QC is available only after every requested item has been repaired.", "INVALID_STATUS");
    }

    const passed = decision === "PASS";
    const nextStatus = passed ? "QC_PASSED" : "QC_FAILED";
    // QC is a single decision for the entire repair batch. A failure resets the
    // repaired and passed counters so the complete batch must be reworked.
    const nextRepairedQuantity = passed ? requested : 0;
    const nextPassedQuantity = passed ? requested : 0;

    await conn.query(
      `UPDATE repair_requests
       SET repaired_quantity = ?, qc_passed_quantity = ?, qc_remarks = ?, status = ?
       WHERE id = ?`,
      [nextRepairedQuantity, nextPassedQuantity, remarks, nextStatus, id]
    );
    await addEvent(conn, id, user.id, `QC_${decision}`, r.status, nextStatus, requested, remarks);

    if (passed) {
      await notifications.notify(conn, {
        role: "QUALITY_FG_MANAGER",
        type: "REPAIR_QC_PASSED",
        title: `Repair ${r.repair_number} passed QC`,
        body: `All ${requested} repaired item(s) passed QC and are ready for dispatch.`,
        severity: "success",
        link: "/repair-dispatch",
        payload: { repair_id: id },
        userId: user.id,
      });
    } else {
      await notifications.notify(conn, {
        role: "PRODUCTION_MANAGER",
        type: "REPAIR_QC_FAILED",
        title: `Repair ${r.repair_number} needs rework`,
        body: `The complete batch of ${requested} item(s) failed QC and has been returned to Repair Production. ${remarks}`,
        severity: "action",
        link: "/repair-production",
        payload: { repair_id: id },
        userId: user.id,
      });
    }

    return getOne(id, conn);
  });
}

async function dispatch(id, body, user) {
  if (!RETURNERS.has(roleOf(user))) throw AppError.forbidden("Only Production Admin or Quality Control & Finished Goods can record repaired items as dispatched.");
  const remarks = optionalText(body.remarks, 2000);
  return inTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT * FROM repair_requests WHERE id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw AppError.notFound("Repair request not found", "NOT_FOUND");
    const r = rows[0];
    const requested = Number(r.requested_quantity);
    const qcPassed = Number(r.qc_passed_quantity);
    const alreadyDispatched = Number(r.dispatched_quantity);

    if (!["QC_PASSED", "PARTIALLY_DISPATCHED"].includes(r.status)
      || requested <= 0
      || qcPassed !== requested
      || alreadyDispatched >= requested) {
      throw AppError.conflict("Dispatch is available only for a complete batch that has passed QC and has not been fully dispatched.", "INVALID_STATUS");
    }

    // Dispatch is a single batch-level action. Legacy partially-dispatched
    // records are completed by dispatching their remaining balance in one step.
    const remaining = requested - alreadyDispatched;
    const remarksText = remarks || "Complete repair batch marked as dispatched.";
    await conn.query(
      `UPDATE repair_requests
       SET dispatched_quantity = ?, dispatch_remarks = ?,
           dispatched_by = ?, dispatched_at = NOW(), status = 'RETURNED'
       WHERE id = ?`,
      [requested, remarksText, user.id, id]
    );
    await addEvent(conn, id, user.id, "DISPATCHED", r.status, "RETURNED", remaining, remarksText);
    await notifications.notify(conn, {
      role: "MARKETING_MANAGER",
      type: "REPAIR_DISPATCHED",
      title: `Repair ${r.repair_number} marked as dispatched`,
      body: `The complete repair batch of ${requested} item(s) has been marked as dispatched and returned to the customer.`,
      severity: "success",
      link: "/repair-requests",
      payload: { repair_id: id, quantity: requested },
      userId: user.id,
    });
    return getOne(id, conn);
  });
}

module.exports = { list, productOptions, create, getImage, decide, updateProgress, inspect, dispatch };
