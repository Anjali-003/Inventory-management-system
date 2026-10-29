const crypto = require("crypto");
const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const { inTransaction } = require("../inventory/inventory.service");
const notifications = require("../notifications/notification.service");

const MARKETING = new Set(["MARKETING_MANAGER", "SUPER_ADMIN"]);
const APPROVERS = new Set(["PRODUCTION_ADMIN", "SUPER_ADMIN"]);
const PRODUCTION = new Set(["PRODUCTION_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"]);
const QC = new Set(["QUALITY_FG_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"]);
const RETURNERS = new Set(["MARKETING_MANAGER", "PRODUCTION_ADMIN", "SUPER_ADMIN"]);
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
            dispatcher.name AS dispatched_by_name
     FROM repair_requests r
     JOIN products p ON p.id = r.product_id
     JOIN users creator ON creator.id = r.created_by
     LEFT JOIN users approver ON approver.id = r.approved_by
     LEFT JOIN users dispatcher ON dispatcher.id = r.dispatched_by
     WHERE r.id = ?`, [id]
  );
  if (!rows.length) throw AppError.notFound("Repair request not found", "NOT_FOUND");
  const [events] = await conn.query(
    `SELECT e.id, e.action, e.from_status, e.to_status, e.quantity, e.remarks, e.created_at, u.name AS actor_name
     FROM repair_events e JOIN users u ON u.id = e.created_by
     WHERE e.repair_id = ? ORDER BY e.id DESC LIMIT 100`, [id]
  );
  return { ...rows[0], events };
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
    await addEvent(conn, insert.insertId, user.id, "REQUEST_SUBMITTED", "DRAFT", "PENDING_APPROVAL", quantity, problem);
    await notifications.notify(conn, { role: "PRODUCTION_ADMIN", type: "REPAIR_REQUESTED", title: `Repair request ${repairNumber} needs approval`, body: `${quantity} × product repair requested by Marketing.`, severity: "action", link: "/repair-approvals", payload: { repair_number: repairNumber }, userId: user.id });
    return getOne(insert.insertId, conn);
  });
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
    if (decision === "APPROVE") await notifications.notify(conn, { role: "PRODUCTION_MANAGER", type: "REPAIR_APPROVED", title: `Repair ${r.repair_number} ready for production`, body: `Repair ${r.requested_quantity} items and update progress in Repair Register.`, severity: "action", link: "/repair-register", payload: { repair_id: id }, userId: user.id });
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
    if (!["APPROVED", "IN_REPAIR", "QC_FAILED", "READY_FOR_QC", "QC_PASSED", "PARTIALLY_DISPATCHED"].includes(r.status)) throw AppError.conflict("This repair is not currently available for repair work.", "INVALID_STATUS");
    const outstanding = r.requested_quantity - r.repaired_quantity;
    if (quantity > outstanding) throw new AppError(422, `Only ${outstanding} item(s) remain to be repaired.`, "QUANTITY_EXCEEDED");
    const nextQty = r.repaired_quantity + quantity;
    await conn.query(`UPDATE repair_requests SET repaired_quantity = ?, diagnosis = COALESCE(?, diagnosis), repair_notes = COALESCE(?, repair_notes), status = 'READY_FOR_QC' WHERE id = ?`, [nextQty, diagnosis, notes, id]);
    await addEvent(conn, id, user.id, "REPAIR_PROGRESS", r.status, "READY_FOR_QC", quantity, notes || diagnosis);
    await notifications.notify(conn, { role: "QUALITY_FG_MANAGER", type: "REPAIR_READY_FOR_QC", title: `Repair ${r.repair_number} ready for QC`, body: `${nextQty} of ${r.requested_quantity} item(s) have been repaired; inspect the untested quantity.`, severity: "action", link: "/repair-register", payload: { repair_id: id }, userId: user.id });
    return getOne(id, conn);
  });
}

async function inspect(id, body, user) {
  if (!QC.has(roleOf(user))) throw AppError.forbidden("Only Quality Control can inspect repairs.");
  const quantity = positiveInt(body.quantity, "QC quantity");
  const decision = String(body.decision || "").toUpperCase();
  if (!["PASS", "FAIL"].includes(decision)) throw new AppError(422, "Choose Pass or Fail", "VALIDATION");
  const remarks = optionalText(body.remarks, 4000);
  if (decision === "FAIL" && !remarks) throw new AppError(422, "A failure remark is required", "VALIDATION");
  return inTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT * FROM repair_requests WHERE id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw AppError.notFound("Repair request not found", "NOT_FOUND");
    const r = rows[0];
    const awaitingQc = r.repaired_quantity - r.qc_passed_quantity;
    if (!awaitingQc || quantity > awaitingQc) throw new AppError(422, `Only ${Math.max(0, awaitingQc)} item(s) are awaiting QC.`, "QUANTITY_EXCEEDED");
    const nextStatus = decision === "PASS"
      ? ((r.qc_passed_quantity + quantity) === r.requested_quantity ? "QC_PASSED" : "READY_FOR_QC")
      : "QC_FAILED";
    const repairedQty = decision === "FAIL" ? r.repaired_quantity - quantity : r.repaired_quantity;
    const passedQty = decision === "PASS" ? r.qc_passed_quantity + quantity : r.qc_passed_quantity;
    // A failed unit returns to the repair queue, so it can be counted again when fixed.
    const status = decision === "FAIL" ? "QC_FAILED" : (repairedQty > passedQty ? "READY_FOR_QC" : (passedQty > r.dispatched_quantity ? "QC_PASSED" : "APPROVED"));
    await conn.query(`UPDATE repair_requests SET repaired_quantity = ?, qc_passed_quantity = ?, qc_remarks = ?, status = ? WHERE id = ?`, [repairedQty, passedQty, remarks, status, id]);
    await addEvent(conn, id, user.id, `QC_${decision}`, r.status, status, quantity, remarks);
    if (decision === "FAIL") await notifications.notify(conn, { role: "PRODUCTION_MANAGER", type: "REPAIR_QC_FAILED", title: `Repair ${r.repair_number} needs rework`, body: `${quantity} item(s) failed QC. ${remarks}`, severity: "action", link: "/repair-register", payload: { repair_id: id }, userId: user.id });
    if (decision === "PASS") await notifications.notify(conn, { role: "MARKETING_MANAGER", type: "REPAIR_QC_PASSED", title: `Repair ${r.repair_number} passed QC`, body: `${quantity} additional item(s) passed inspection.`, severity: "success", link: "/repair-requests", payload: { repair_id: id }, userId: user.id });
    return getOne(id, conn);
  });
}

async function dispatch(id, body, user) {
  if (!RETURNERS.has(roleOf(user))) throw AppError.forbidden("Only Marketing or Production Admin can record the repaired items as dispatched.");
  const quantity = positiveInt(body.quantity, "Dispatch quantity");
  const reference = optionalText(body.dispatchReference, 120);
  if (!reference) throw new AppError(422, "Dispatch reference is required", "VALIDATION");
  const remarks = optionalText(body.remarks, 2000);
  return inTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT * FROM repair_requests WHERE id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw AppError.notFound("Repair request not found", "NOT_FOUND");
    const r = rows[0];
    const available = r.qc_passed_quantity - r.dispatched_quantity;
    if (quantity > available || quantity <= 0) throw new AppError(422, `Only ${Math.max(0, available)} QC-passed item(s) are available to dispatch.`, "QUANTITY_EXCEEDED");
    const dispatched = r.dispatched_quantity + quantity;
    const allPassed = r.repaired_quantity === r.requested_quantity && r.qc_passed_quantity === r.requested_quantity;
    const status = dispatched === r.requested_quantity ? "RETURNED" : (allPassed ? "PARTIALLY_DISPATCHED" : r.status);
    await conn.query(`UPDATE repair_requests SET dispatched_quantity = ?, dispatch_reference = ?, dispatch_remarks = ?, dispatched_by = ?, dispatched_at = NOW(), status = ? WHERE id = ?`, [dispatched, reference, remarks, user.id, status, id]);
    await addEvent(conn, id, user.id, "DISPATCHED", r.status, status, quantity, [reference, remarks].filter(Boolean).join(" — "));
    await notifications.notify(conn, { role: "MARKETING_MANAGER", type: "REPAIR_DISPATCHED", title: `Repair ${r.repair_number} dispatched`, body: `${quantity} repaired item(s) dispatched. Reference: ${reference}. Total returned: ${dispatched}/${r.requested_quantity}.`, severity: "success", link: "/repair-requests", payload: { repair_id: id, quantity, dispatch_reference: reference }, userId: user.id });
    return getOne(id, conn);
  });
}

module.exports = { list, productOptions, create, decide, updateProgress, inspect, dispatch };
