const crypto = require("crypto");
const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");
const hub = require("../../realtime/hub");

const toCents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (value) => Number((Number(value || 0) / 100).toFixed(2));
const cleanText = (value, max = 500) => {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (text.length > max) throw new AppError(422, `Text must be ${max} characters or fewer`, "VALIDATION");
  return text || null;
};

function parseQuantity(value, label = "Quantity") {
  if (value === undefined || value === null || value === "" || !Number.isFinite(Number(value)) || Number(value) <= 0) {
    throw new AppError(422, `${label} must be a positive quantity`, "VALIDATION");
  }
  const cents = toCents(value);
  if (cents <= 0 || Math.abs(Number(value) * 100 - cents) > 0.00001) {
    throw new AppError(422, `${label} must have at most 2 decimal places`, "VALIDATION");
  }
  return cents;
}

async function getLineContext(conn, orderItemId, { lockOrder = false } = {}) {
  const [ids] = await conn.query("SELECT order_id FROM order_items WHERE id = ?", [orderItemId]);
  if (!ids.length) throw AppError.notFound("Order product was not found", "NOT_FOUND");

  if (lockOrder) {
    const [lockedOrders] = await conn.query("SELECT id FROM orders WHERE id = ? FOR UPDATE", [ids[0].order_id]);
    if (!lockedOrders.length) throw AppError.notFound("Order not found", "NOT_FOUND");
  }

  const [rows] = await conn.query(`
    SELECT oi.id AS order_item_id, oi.order_id, oi.product_id, oi.quantity AS line_quantity,
           o.order_number, o.status AS order_status, o.approval_status, o.inventory_issued_at,
           p.sku AS product_sku, p.name AS product_name,
           COALESCE((SELECT SUM(po.quantity_to_produce) FROM production_orders po
                     WHERE po.order_item_id = oi.id), 0) AS quantity_started
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE oi.id = ?
    LIMIT 1
  `, [orderItemId]);

  const item = rows[0];
  if (!item) throw AppError.notFound("Order product was not found", "NOT_FOUND");
  // The order line remains the target even if only some materials were available
  // at approval. Remaining components can be purchased and issued by Store later.
  item.target_quantity = Math.max(0, Number(item.line_quantity));
  item.quantity_started = Number(item.quantity_started || 0);
  return item;
}

/* Batch-load BOM requirements and issued/requested totals to avoid per-card query loops on Production. */
async function getMaterialStatesForItems(conn, lines) {
  if (!lines.length) return new Map();
  const orderItemIds = [...new Set(lines.map((line) => Number(line.order_item_id)))];
  const productIds = [...new Set(lines.map((line) => Number(line.product_id)))];

  const [bomRows] = await conn.query(`
    SELECT pb.product_id, pb.component_id, pb.quantity_required,
           c.sku, c.name, c.unit
    FROM product_bom pb
    JOIN components c ON c.id = pb.component_id
    WHERE pb.product_id IN (?)
    ORDER BY pb.product_id, c.id
  `, [productIds]);
  const [usageRows] = await conn.query(`
    SELECT r.order_item_id, ri.component_id,
           COALESCE(SUM(ri.requested_quantity), 0) AS requested_quantity,
           COALESCE(SUM(ri.issued_quantity), 0) AS issued_quantity
    FROM production_material_requests r
    JOIN production_material_request_items ri ON ri.request_id = r.id
    WHERE r.order_item_id IN (?)
    GROUP BY r.order_item_id, ri.component_id
  `, [orderItemIds]);

  const bomByProduct = new Map();
  for (const row of bomRows) {
    if (!bomByProduct.has(Number(row.product_id))) bomByProduct.set(Number(row.product_id), []);
    bomByProduct.get(Number(row.product_id)).push(row);
  }
  const usageByLine = new Map();
  for (const row of usageRows) {
    const key = `${row.order_item_id}:${row.component_id}`;
    usageByLine.set(key, {
      requestedCents: toCents(row.requested_quantity),
      issuedCents: toCents(row.issued_quantity),
    });
  }

  const states = new Map();
  for (const line of lines) {
    const itemId = Number(line.order_item_id);
    const targetQuantity = Math.max(0, Number(line.target_quantity || 0));
    const started = Math.max(0, Number(line.quantity_started || 0));
    const bom = bomByProduct.get(Number(line.product_id)) || [];
    const bomComplete = bom.length > 0 && bom.every((row) => row.quantity_required !== null && Number(row.quantity_required) > 0);

    const components = bom.map((row) => {
      const perUnitCents = toCents(row.quantity_required);
      const budgetCents = toCents(Number(row.quantity_required || 0) * targetQuantity);
      const usage = usageByLine.get(`${itemId}:${row.component_id}`) || { requestedCents: 0, issuedCents: 0 };
      const outstandingCents = Math.max(0, usage.requestedCents - usage.issuedCents);
      return {
        component_id: Number(row.component_id),
        sku: row.sku,
        name: row.name,
        unit: row.unit || "pcs",
        quantity_per_unit: Number(row.quantity_required || 0),
        budget_quantity: fromCents(budgetCents),
        requested_quantity: fromCents(usage.requestedCents),
        issued_quantity: fromCents(usage.issuedCents),
        outstanding_quantity: fromCents(outstandingCents),
        requestable_quantity: fromCents(Math.max(0, budgetCents - usage.requestedCents)),
        startable_units: perUnitCents > 0
          ? Math.max(0, Math.floor((usage.issuedCents - started * perUnitCents) / perUnitCents))
          : 0,
        perUnitCents,
        issuedCents: usage.issuedCents,
      };
    });

    const remainingToStart = Math.max(0, targetQuantity - started);
    let maxStartQuantity = 0;
    let status = "WAITING_FOR_STORE";
    const authorized = Boolean(line.inventory_issued_at) && line.approval_status === "APPROVED";
    if (!authorized || targetQuantity <= 0) {
      status = "NOT_APPROVED";
    } else if (!bomComplete) {
      status = "UNKNOWN";
    } else {
      maxStartQuantity = Math.min(remainingToStart, ...components.map((component) => component.startable_units));
      maxStartQuantity = Math.max(0, maxStartQuantity);
      const hasUnconsumedIssuedMaterials = components.some(
        (component) => component.issuedCents > started * component.perUnitCents
      );
      if (remainingToStart <= 0) status = "NOT_REQUIRED";
      else if (maxStartQuantity >= remainingToStart) status = "MATERIALS_ISSUED";
      else if (maxStartQuantity > 0 || hasUnconsumedIssuedMaterials) status = "PARTIAL_ISSUE";
      else status = "WAITING_FOR_STORE";
    }

    states.set(itemId, {
      status,
      bomComplete,
      maxStartQuantity,
      materialRequestableQuantity: authorized
        ? fromCents(components.reduce((sum, component) => sum + toCents(component.requestable_quantity), 0))
        : 0,
      materialRequestOutstandingQuantity: fromCents(components.reduce((sum, component) => sum + toCents(component.outstanding_quantity), 0)),
      components: components.map(({ perUnitCents, issuedCents, startable_units, ...component }) => component),
    });
  }
  return states;
}

async function getOptions(orderItemId) {
  const conn = await db.getConnection();
  try {
    const item = await getLineContext(conn, orderItemId);
    assertRequestableOrder(item);
    const states = await getMaterialStatesForItems(conn, [{
      order_item_id: Number(item.order_item_id), order_id: Number(item.order_id), product_id: Number(item.product_id),
      approval_status: item.approval_status, inventory_issued_at: item.inventory_issued_at,
      target_quantity: item.target_quantity, quantity_started: item.quantity_started,
    }]);
    const state = states.get(Number(item.order_item_id));
    if (!state.bomComplete) throw AppError.conflict("This product has no complete BOM. Fix its component requirements before requesting materials.", "INCOMPLETE_BOM");
    return {
      order_id: Number(item.order_id), order_item_id: Number(item.order_item_id), order_number: item.order_number,
      product_id: Number(item.product_id), product_name: item.product_name, product_sku: item.product_sku,
      approved_quantity: Number(item.target_quantity), quantity_started: Number(item.quantity_started),
      requestable_quantity: state.materialRequestableQuantity,
      items: state.components.filter((component) => component.requestable_quantity > 0),
    };
  } finally {
    conn.release();
  }
}

function assertRequestableOrder(item) {
  if (item.approval_status !== "APPROVED" || !item.inventory_issued_at) {
    throw AppError.conflict("Materials can only be requested after Operations Admin approval and inventory deduction.", "ORDER_NOT_ISSUED");
  }
  if (Number(item.target_quantity) <= 0) {
    throw AppError.conflict("There is no remaining quantity to supply for this product line.", "NO_REMAINING_QUANTITY");
  }
}

async function createRequest(body, userId) {
  const orderItemId = Number(body && body.order_item_id);
  if (!Number.isInteger(orderItemId) || orderItemId <= 0) throw new AppError(422, "A valid order item is required", "VALIDATION");
  const notes = cleanText(body.notes);
  const key = typeof body.request_key === "string" ? body.request_key.trim() : "";
  if (key && !/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw new AppError(422, "Invalid request key", "VALIDATION");
  if (!Array.isArray(body.items) || body.items.length === 0) throw new AppError(422, "Select at least one component quantity", "VALIDATION");

  const requested = new Map();
  for (const raw of body.items) {
    const componentId = Number(raw && raw.component_id);
    if (!Number.isInteger(componentId) || componentId <= 0) throw new AppError(422, "A component is invalid", "VALIDATION");
    if (requested.has(componentId)) throw new AppError(422, "A component was listed more than once", "VALIDATION");
    requested.set(componentId, parseQuantity(raw.quantity));
  }

  const result = await inventory.inTransaction(async (conn) => {
    if (key) {
      const [existing] = await conn.query("SELECT id, order_item_id FROM production_material_requests WHERE request_key = ?", [key]);
      if (existing.length) {
        if (Number(existing[0].order_item_id) !== orderItemId) throw AppError.conflict("This request key was already used for another order item", "REQUEST_KEY_REUSED");
        return { id: Number(existing[0].id), replayed: true };
      }
    }

    const item = await getLineContext(conn, orderItemId, { lockOrder: true });
    assertRequestableOrder(item);
    const states = await getMaterialStatesForItems(conn, [{
      order_item_id: Number(item.order_item_id), order_id: Number(item.order_id), product_id: Number(item.product_id),
      approval_status: item.approval_status, inventory_issued_at: item.inventory_issued_at,
      target_quantity: item.target_quantity, quantity_started: item.quantity_started,
    }]);
    const state = states.get(Number(item.order_item_id));
    if (!state.bomComplete) throw AppError.conflict("This product has no complete BOM. Fix its component requirements before requesting materials.", "INCOMPLETE_BOM");

    const options = new Map(state.components.map((component) => [component.component_id, component]));
    for (const [componentId, quantityCents] of requested) {
      const component = options.get(componentId);
      if (!component) throw new AppError(422, "One selected component is not in this product's BOM", "INVALID_COMPONENT");
      if (quantityCents > toCents(component.requestable_quantity)) {
        throw AppError.conflict(`${component.name}: only ${component.requestable_quantity} ${component.unit} remain available to request. Refresh and try again.`, "REQUEST_LIMIT_EXCEEDED");
      }
    }

    const [header] = await conn.query(`
      INSERT INTO production_material_requests (order_id, order_item_id, requested_by, request_key, status, notes)
      VALUES (?, ?, ?, ?, 'PENDING', ?)
    `, [item.order_id, item.order_item_id, userId, key || null, notes]);
    await conn.query(
      `INSERT INTO production_material_request_items (request_id, component_id, requested_quantity) VALUES ?`,
      [[...requested].map(([componentId, cents]) => [header.insertId, componentId, fromCents(cents)])]
    );
    return { id: Number(header.insertId), replayed: false };
  });

  if (!result.replayed) {
    hub.notifyRole("STORE_MANAGER", { type: "MATERIAL_REQUESTS_CHANGED", message: `New production material request for order item #${orderItemId}` });
  }
  return { success: true, request_id: result.id, replayed: result.replayed };
}

async function listRequests() {
  const conn = await db.getConnection();
  try {
    const [headers] = await conn.query(`
      SELECT r.id, r.order_id, r.order_item_id, r.requested_by, r.status, r.notes, r.created_at, r.updated_at,
             o.order_number, oi.product_id, p.name AS product_name, p.sku AS product_sku,
             requester.name AS requested_by_name
      FROM production_material_requests r
      JOIN orders o ON o.id = r.order_id
      JOIN order_items oi ON oi.id = r.order_item_id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN users requester ON requester.id = r.requested_by
      ORDER BY CASE r.status WHEN 'PENDING' THEN 0 WHEN 'PARTIALLY_ISSUED' THEN 1 ELSE 2 END,
               r.created_at DESC, r.id DESC
      LIMIT 300
    `);
    if (!headers.length) return [];
    const requestIds = headers.map((row) => row.id);
    const [items] = await conn.query(`
      SELECT ri.id, ri.request_id, ri.component_id, c.sku, c.name, c.unit,
             ri.requested_quantity, ri.issued_quantity,
             GREATEST(ri.requested_quantity - ri.issued_quantity, 0) AS remaining_quantity
      FROM production_material_request_items ri
      JOIN components c ON c.id = ri.component_id
      WHERE ri.request_id IN (?)
      ORDER BY ri.id
    `, [requestIds]);
    const itemIds = items.map((row) => row.id);
    const [issues] = itemIds.length ? await conn.query(`
      SELECT i.id, i.request_item_id, i.quantity, i.remarks, i.issued_at, u.name AS issued_by_name
      FROM production_material_issues i
      LEFT JOIN users u ON u.id = i.issued_by
      WHERE i.request_item_id IN (?)
      ORDER BY i.issued_at DESC, i.id DESC
    `, [itemIds]) : [[]];

    const issuesByItem = new Map();
    for (const issue of issues) {
      if (!issuesByItem.has(issue.request_item_id)) issuesByItem.set(issue.request_item_id, []);
      issuesByItem.get(issue.request_item_id).push(issue);
    }
    const itemsByRequest = new Map();
    for (const row of items) {
      const item = {
        ...row,
        component_id: Number(row.component_id),
        requested_quantity: Number(row.requested_quantity),
        issued_quantity: Number(row.issued_quantity),
        remaining_quantity: Number(row.remaining_quantity),
        issues: issuesByItem.get(row.id) || [],
      };
      if (!itemsByRequest.has(row.request_id)) itemsByRequest.set(row.request_id, []);
      itemsByRequest.get(row.request_id).push(item);
    }
    return headers.map((row) => ({
      ...row,
      order_id: Number(row.order_id),
      order_item_id: Number(row.order_item_id),
      items: itemsByRequest.get(row.id) || [],
    }));
  } finally {
    conn.release();
  }
}

async function issueRequest(requestId, body, userId) {
  const lines = body && body.items;
  const remarks = cleanText(body && body.remarks, 255);
  const idempotencyKey = typeof body?.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) {
    throw new AppError(422, "A valid allotment idempotency key is required", "VALIDATION");
  }
  if (!Array.isArray(lines) || lines.length === 0) throw new AppError(422, "Enter at least one quantity to allot", "VALIDATION");
  const quantities = new Map();
  for (const line of lines) {
    const itemId = Number(line && line.request_item_id);
    if (!Number.isInteger(itemId) || itemId <= 0) throw new AppError(422, "A requested component is invalid", "VALIDATION");
    if (quantities.has(itemId)) throw new AppError(422, "A component was listed more than once", "VALIDATION");
    quantities.set(itemId, parseQuantity(line.quantity, "Issue quantity"));
  }

  const out = await inventory.inTransaction(async (conn) => {
    const [requests] = await conn.query(
      `SELECT id, order_id, order_item_id, status FROM production_material_requests WHERE id = ? FOR UPDATE`,
      [requestId]
    );
    if (!requests.length) throw AppError.notFound("Material request not found", "NOT_FOUND");

    // An allotment key is replayed before any new stock movement is considered.
    const [previousIssues] = await conn.query(`
      SELECT i.request_item_id, i.quantity, r.request_id
      FROM production_material_issues i
      JOIN production_material_request_items r ON r.id = i.request_item_id
      WHERE i.idempotency_key = ?
      ORDER BY i.request_item_id
      FOR UPDATE
    `, [idempotencyKey]);
    if (previousIssues.length) {
      const wrongRequest = previousIssues.some((row) => Number(row.request_id) !== Number(requestId));
      const previous = new Map(previousIssues.map((row) => [Number(row.request_item_id), toCents(row.quantity)]));
      const samePayload = !wrongRequest && previous.size === quantities.size &&
        [...quantities].every(([itemId, cents]) => previous.get(itemId) === cents);
      if (!samePayload) throw AppError.conflict("This allotment key was already used with different quantities. Refresh and submit again.", "IDEMPOTENCY_KEY_REUSED");
      return { id: requestId, status: requests[0].status, replayed: true };
    }
    if (requests[0].status === "ISSUED") throw AppError.conflict("This request has already been fully issued", "REQUEST_ALREADY_ISSUED");

    const orderId = Number(requests[0].order_id);
    // Serialize allotments for the whole order. Multiple product lines can consume
    // the same component, and their handovers share the approval-time deduction budget.
    const [lockedOrder] = await conn.query(`SELECT id FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
    if (!lockedOrder.length) throw AppError.notFound("Order not found", "NOT_FOUND");

    for (const [requestItemId, cents] of [...quantities].sort(([a], [b]) => a - b)) {
      const [rows] = await conn.query(`
        SELECT id, component_id, requested_quantity, issued_quantity
        FROM production_material_request_items
        WHERE id = ? AND request_id = ?
        LIMIT 1 FOR UPDATE
      `, [requestItemId, requestId]);
      if (!rows.length) throw new AppError(422, "A component does not belong to this material request", "INVALID_REQUEST_ITEM");
      const requestItem = rows[0];
      const componentId = Number(requestItem.component_id);
      const remainingCents = toCents(requestItem.requested_quantity) - toCents(requestItem.issued_quantity);
      if (cents > remainingCents) {
        throw AppError.conflict(`You can allot at most ${fromCents(Math.max(0, remainingCents))} for this component. Refresh and try again.`, "ISSUE_EXCEEDS_REMAINING");
      }

      // The approval workflow already deducted the quantity that could be made
      // from then-available stock. A physical handover within that allowance is
      // record-only. Anything beyond that allowance came from later replenishment
      // and must be deducted now, exactly once, from current on-hand inventory.
      const [handedRows] = await conn.query(`
        SELECT COALESCE(SUM(i.quantity), 0) AS handed_quantity
        FROM production_material_issues i
        JOIN production_material_request_items ri ON ri.id = i.request_item_id
        JOIN production_material_requests r ON r.id = ri.request_id
        WHERE r.order_id = ? AND ri.component_id = ?
      `, [orderId, componentId]);
      const handedAfterCents = toCents(handedRows[0]?.handed_quantity || 0) + cents;

      const [approvalRows] = await conn.query(`
        SELECT COALESCE(SUM(quantity), 0) AS deducted_quantity
        FROM inventory_transactions
        WHERE order_id = ? AND component_id = ?
          AND direction = 'OUT' AND reason_code = 'ISSUED_TO_PRODUCTION'
          AND reference_type = 'ORDER_APPROVAL'
      `, [orderId, componentId]);
      const approvalDeductedCents = toCents(approvalRows[0]?.deducted_quantity || 0);
      const [allotmentDeductionRows] = await conn.query(`
        SELECT COALESCE(SUM(quantity), 0) AS deducted_quantity
        FROM inventory_transactions
        WHERE order_id = ? AND component_id = ?
          AND direction = 'OUT' AND reason_code = 'ISSUED_TO_PRODUCTION'
          AND reference_type = 'MATERIAL_ALLOTMENT'
      `, [orderId, componentId]);
      const previouslyDeductedAfterApprovalCents = toCents(allotmentDeductionRows[0]?.deducted_quantity || 0);
      const requiredAfterApprovalCents = Math.max(0, handedAfterCents - approvalDeductedCents);
      // Reconcile against the ledger, not just prior handovers, so retries and
      // already-recorded late-stock deductions can never charge the same quantity twice.
      const deductCents = Math.max(0, requiredAfterApprovalCents - previouslyDeductedAfterApprovalCents);

      if (deductCents > 0) {
        const deductQuantity = fromCents(deductCents);
        const [stockUpdate] = await conn.query(`
          UPDATE inventory
          SET quantity_on_hand = quantity_on_hand - ?
          WHERE component_id = ? AND quantity_on_hand >= ?
        `, [deductQuantity, componentId, deductQuantity]);
        if (stockUpdate.affectedRows !== 1) {
          throw AppError.conflict(
            `Insufficient stock for component #${componentId}. The additional material must be received into inventory before it can be allotted.`,
            "INSUFFICIENT_STOCK"
          );
        }
        const [stockRows] = await conn.query(`SELECT quantity_on_hand FROM inventory WHERE component_id = ?`, [componentId]);
        if (!stockRows.length) throw AppError.conflict(`Inventory record for component #${componentId} was not found.`, "INVENTORY_NOT_FOUND");
        const ledgerKey = crypto.createHash("sha256")
          .update(`material-allotment|${idempotencyKey}|${requestItemId}`)
          .digest("hex");
        await conn.query(`
          INSERT INTO inventory_transactions
            (component_id, transaction_type, direction, quantity, balance_after, reason,
             reason_code, reference_type, reference_id, created_by, order_id, idempotency_key)
          VALUES (?, 'CONSUMED', 'OUT', ?, ?, ?, 'ISSUED_TO_PRODUCTION', 'MATERIAL_ALLOTMENT', ?, ?, ?, ?)
        `, [
          componentId,
          deductQuantity,
          stockRows[0].quantity_on_hand,
          `Additional material supplied to production for order #${orderId}`,
          requestId,
          userId,
          orderId,
          ledgerKey,
        ]);
      }

      await conn.query(
        `UPDATE production_material_request_items SET issued_quantity = issued_quantity + ? WHERE id = ?`,
        [fromCents(cents), requestItemId]
      );
      await conn.query(
        `INSERT INTO production_material_issues (request_item_id, quantity, issued_by, remarks, idempotency_key) VALUES (?, ?, ?, ?, ?)`,
        [requestItemId, fromCents(cents), userId, remarks, idempotencyKey]
      );
    }

    const [totals] = await conn.query(`
      SELECT COUNT(*) AS item_count,
             SUM(CASE WHEN issued_quantity >= requested_quantity THEN 1 ELSE 0 END) AS fully_issued_count,
             SUM(CASE WHEN issued_quantity > 0 THEN 1 ELSE 0 END) AS started_issue_count
      FROM production_material_request_items
      WHERE request_id = ?
    `, [requestId]);
    const itemCount = Number(totals[0]?.item_count || 0);
    const fullyIssuedCount = Number(totals[0]?.fully_issued_count || 0);
    const startedIssueCount = Number(totals[0]?.started_issue_count || 0);
    const status = itemCount > 0 && fullyIssuedCount === itemCount
      ? "ISSUED"
      : startedIssueCount > 0 ? "PARTIALLY_ISSUED" : "PENDING";
    await conn.query(`UPDATE production_material_requests SET status = ? WHERE id = ?`, [status, requestId]);
    return { id: requestId, status };
  });

  if (!out.replayed) {
    hub.notifyRole("STORE_MANAGER", { type: "MATERIAL_REQUESTS_CHANGED", message: `Material request #${requestId} updated: ${out.status.toLowerCase().replace(/_/g, " ")}` });
    hub.notifyRole("PRODUCTION_MANAGER", { type: "MATERIAL_REQUESTS_CHANGED", message: `Material allotment updated for request #${requestId}` });
  }
  return { success: true, request_id: out.id, status: out.status, replayed: Boolean(out.replayed) };
}

async function getItemMaterialState(conn, orderItemId, targetQuantity, quantityStarted = 0) {
  const [rows] = await conn.query(`
    SELECT oi.id AS order_item_id, oi.order_id, oi.product_id,
           o.approval_status, o.inventory_issued_at,
           ? AS target_quantity, ? AS quantity_started
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = ?
  `, [targetQuantity, quantityStarted, orderItemId]);
  if (!rows.length) throw AppError.notFound("Order product was not found", "NOT_FOUND");
  const states = await getMaterialStatesForItems(conn, rows);
  return states.get(Number(orderItemId));
}

module.exports = { getOptions, createRequest, listRequests, issueRequest, getMaterialStatesForItems, getItemMaterialState };
