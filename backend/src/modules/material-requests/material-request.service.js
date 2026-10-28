const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const inventory = require("../inventory/inventory.service");
const notifications = require("../notifications/notification.service");

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
  // what the Operations Admin approved per product (all rounds): its stock was deducted, so only that much can be handed
  // over. The rest of the order waits until the admin approves it once the purchased parts are in.
  const orderIds = [...new Set(lines.map((line) => Number(line.order_id)))];
  const [approvedRows] = await conn.query(
    `SELECT order_id, product_id, SUM(quantity) AS quantity FROM order_production_items WHERE order_id IN (?) GROUP BY order_id, product_id`,
    [orderIds]
  );
  const approvedOf = new Map(approvedRows.map((r) => [`${r.order_id}:${r.product_id}`, Number(r.quantity)]));
  const [usageRows] = await conn.query(`
    SELECT r.order_item_id, ri.component_id,
           COALESCE(SUM(ri.requested_quantity), 0) AS requested_quantity,
           COALESCE(SUM(ri.issued_quantity), 0) AS issued_quantity
    FROM production_material_requests r
    JOIN production_material_request_items ri ON ri.request_id = r.id
    WHERE r.order_item_id IN (?)
    GROUP BY r.order_item_id, ri.component_id
  `, [orderItemIds]);
  // Include both the current product-unit request model and older component-only
  // requests created before requested_product_quantity was introduced. Without this
  // compatibility calculation, legacy component quantities consume the BOM budget
  // while the product summary incorrectly shows Requested: 0.
  const [requestRows] = await conn.query(`
    SELECT r.id AS request_id, r.order_item_id,
           r.requested_product_quantity, r.issued_product_quantity,
           ri.component_id, ri.requested_quantity, ri.issued_quantity,
           COALESCE(ri.quantity_per_product, pb.quantity_required) AS quantity_per_product,
           (SELECT COUNT(*)
            FROM product_bom pb2
            WHERE pb2.product_id = oi.product_id
              AND pb2.quantity_required IS NOT NULL
              AND pb2.quantity_required > 0) AS bom_component_count,
           (SELECT COUNT(*)
            FROM production_material_request_items ri2
            WHERE ri2.request_id = r.id) AS request_component_count
    FROM production_material_requests r
    JOIN order_items oi ON oi.id = r.order_item_id
    JOIN production_material_request_items ri ON ri.request_id = r.id
    LEFT JOIN product_bom pb
      ON pb.product_id = oi.product_id AND pb.component_id = ri.component_id
    WHERE r.order_item_id IN (?)
    ORDER BY r.id, ri.id
  `, [orderItemIds]);

  const requestsById = new Map();
  for (const row of requestRows) {
    const requestId = Number(row.request_id);
    if (!requestsById.has(requestId)) {
      requestsById.set(requestId, {
        requestId,
        orderItemId: Number(row.order_item_id),
        requestedProductQuantity: row.requested_product_quantity,
        issuedProductQuantity: row.issued_product_quantity,
        bomComponentCount: Number(row.bom_component_count || 0),
        requestComponentCount: Number(row.request_component_count || 0),
        components: [],
      });
    }
    requestsById.get(requestId).components.push({
      requestedCents: toCents(row.requested_quantity),
      issuedCents: toCents(row.issued_quantity),
      perProductCents: toCents(row.quantity_per_product),
    });
  }

  const productUsageByLine = new Map();
  for (const request of requestsById.values()) {
    let requestedProducts = 0;
    let issuedProducts = 0;
    const isProductQuantityRequest = request.requestedProductQuantity !== null &&
      request.requestedProductQuantity !== undefined;

    if (isProductQuantityRequest) {
      requestedProducts = Math.max(0, Number(request.requestedProductQuantity || 0));
      issuedProducts = Math.max(0, Number(request.issuedProductQuantity || 0));
    } else {
      // Only infer units when the legacy request contains the whole BOM. Using a
      // partial component list would falsely imply that a complete product can be made.
      const hasCompleteRatios = request.bomComponentCount > 0 &&
        request.requestComponentCount === request.bomComponentCount &&
        request.components.length === request.bomComponentCount &&
        request.components.every((component) => component.perProductCents > 0);
      if (hasCompleteRatios) {
        requestedProducts = Math.max(0, Math.min(...request.components.map((component) =>
          Math.floor(component.requestedCents / component.perProductCents)
        )));
        issuedProducts = Math.max(0, Math.min(...request.components.map((component) =>
          Math.floor(component.issuedCents / component.perProductCents)
        )));
      }
    }

    const current = productUsageByLine.get(request.orderItemId) || {
      requested: 0, issued: 0, outstanding: 0,
    };
    current.requested += requestedProducts;
    current.issued += issuedProducts;
    current.outstanding += Math.max(0, requestedProducts - issuedProducts);
    productUsageByLine.set(request.orderItemId, current);
  }

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
    // material can be asked for the approved units only (never more than the order line)
    const approvedQuantity = Math.min(targetQuantity, approvedOf.get(`${Number(line.order_id)}:${Number(line.product_id)}`) || 0);
    const started = Math.max(0, Number(line.quantity_started || 0));
    const productUsage = productUsageByLine.get(itemId) || { requested: 0, issued: 0, outstanding: 0 };
    const bom = bomByProduct.get(Number(line.product_id)) || [];
    const bomComplete = bom.length > 0 && bom.every((row) => row.quantity_required !== null && Number(row.quantity_required) > 0);

    const components = bom.map((row) => {
      const perUnitCents = toCents(row.quantity_required);
      const budgetCents = toCents(Number(row.quantity_required || 0) * approvedQuantity);
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
      requestableProductQuantity: authorized && bomComplete && components.length
        ? Math.max(0, Math.min(
            Math.floor(approvedQuantity - productUsage.requested),
            ...components.map((component) => component.perUnitCents > 0
              ? Math.floor(toCents(component.requestable_quantity) / component.perUnitCents)
              : 0)
          ))
        : 0,
      materialRequestOutstandingQuantity: fromCents(components.reduce((sum, component) => sum + toCents(component.outstanding_quantity), 0)),
      approvedQuantity,
      requestedProductQuantity: productUsage.requested,
      issuedProductQuantity: productUsage.issued,
      materialRequestOutstandingProductQuantity: productUsage.outstanding,
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
      approved_quantity: state.approvedQuantity, quantity_started: Number(item.quantity_started),
      requested_product_quantity: state.requestedProductQuantity,
      issued_product_quantity: state.issuedProductQuantity,
      outstanding_product_quantity: state.materialRequestOutstandingProductQuantity,
      allotted_product_quantity: Math.min(Number(item.target_quantity), Number(item.quantity_started) + Number(state.maxStartQuantity || 0)),
      requestable_quantity: state.materialRequestableQuantity,
      requestable_product_quantity: state.requestableProductQuantity,
      items: state.components.filter((component) => component.requestable_quantity > 0).map((component) => ({
        ...component,
        quantity_per_product: component.quantity_per_unit,
      })),
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
  const productQuantity = Number(body.product_quantity);
  if (!Number.isInteger(productQuantity) || productQuantity <= 0) throw new AppError(422, "Select a whole number of products to request", "VALIDATION");
  if (!Array.isArray(body.items) || body.items.length === 0) throw new AppError(422, "No BOM component quantities were supplied", "VALIDATION");

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

    if (productQuantity > state.requestableProductQuantity) {
      throw AppError.conflict(`You can request materials for at most ${state.requestableProductQuantity} more product units. Refresh and try again.`, "REQUEST_LIMIT_EXCEEDED");
    }
    const options = new Map(state.components.map((component) => [component.component_id, component]));
    if (requested.size !== options.size) throw new AppError(422, "The request must include every component in the product BOM", "INVALID_COMPONENTS");
    for (const [componentId, component] of options) {
      const quantityCents = requested.get(componentId);
      const expectedCents = toCents(component.quantity_per_unit * productQuantity);
      if (quantityCents === undefined || quantityCents !== expectedCents) {
        throw new AppError(422, `${component.name}: component quantity must match the selected product quantity (${fromCents(expectedCents)} ${component.unit}).`, "BOM_QUANTITY_MISMATCH");
      }
      if (quantityCents > toCents(component.requestable_quantity)) {
        throw AppError.conflict(`${component.name}: only ${component.requestable_quantity} ${component.unit} remain available to request. Refresh and try again.`, "REQUEST_LIMIT_EXCEEDED");
      }
    }

    const [header] = await conn.query(`
      INSERT INTO production_material_requests
        (order_id, order_item_id, requested_product_quantity, issued_product_quantity, requested_by, request_key, status, notes)
      VALUES (?, ?, ?, 0, ?, ?, 'PENDING', ?)
    `, [item.order_id, item.order_item_id, productQuantity, userId, key || null, notes]);
    await conn.query(
      `INSERT INTO production_material_request_items (request_id, component_id, quantity_per_product, requested_quantity) VALUES ?`,
      [[...options.values()].map((component) => [header.insertId, component.component_id, component.quantity_per_unit, fromCents(toCents(component.quantity_per_unit) * productQuantity)])]
    );
    // Store hands these over (saved with the request, pushed after commit; a replayed key never gets here)
    await notifications.notify(conn, {
      role: "STORE_MANAGER",
      type: "MATERIAL_REQUESTED",
      title: `Production needs materials for order ${item.order_number}`,
      body: `${item.product_name} × ${productQuantity}: ${options.size} component${options.size === 1 ? "" : "s"} to issue.`,
      severity: "action",
      link: "/store-material-requests",
      orderId: Number(item.order_id),
      payload: { order_number: item.order_number, request_id: Number(header.insertId), product_name: item.product_name, product_quantity: productQuantity },
      userId,
    });
    return { id: Number(header.insertId), replayed: false };
  });

  return { success: true, request_id: result.id, replayed: result.replayed };
}

async function listRequests() {
  const conn = await db.getConnection();
  try {
    const [headers] = await conn.query(`
      SELECT r.id, r.order_id, r.order_item_id, r.requested_product_quantity, r.issued_product_quantity, r.requested_by, r.status, r.notes, r.created_at, r.updated_at,
             o.order_number, oi.product_id, p.name AS product_name, p.sku AS product_sku,
             requester.name AS requested_by_name
      FROM production_material_requests r
      JOIN orders o ON o.id = r.order_id
      JOIN order_items oi ON oi.id = r.order_item_id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN users requester ON requester.id = r.requested_by
      WHERE o.approval_status <> 'CANCELLED'
      ORDER BY CASE r.status WHEN 'PENDING' THEN 0 WHEN 'PARTIALLY_ISSUED' THEN 1 ELSE 2 END,
               r.created_at DESC, r.id DESC
      LIMIT 300
    `);
    if (!headers.length) return [];
    const requestIds = headers.map((row) => row.id);
    const [items] = await conn.query(`
      SELECT ri.id, ri.request_id, ri.component_id, ri.quantity_per_product, c.sku, c.name, c.unit,
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
  const productQuantity = Number(body && body.product_quantity);
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
      `SELECT id, order_id, order_item_id, requested_product_quantity, issued_product_quantity, status FROM production_material_requests WHERE id = ? FOR UPDATE`,
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

    const productMode = requests[0].requested_product_quantity !== null && requests[0].requested_product_quantity !== undefined;
    let expectedQuantities = quantities;
    if (productMode) {
      if (!Number.isInteger(productQuantity) || productQuantity <= 0) throw new AppError(422, "Select a whole number of product units to allot", "VALIDATION");
      const remainingProducts = Number(requests[0].requested_product_quantity) - Number(requests[0].issued_product_quantity || 0);
      if (productQuantity > remainingProducts) throw AppError.conflict(`You can allot at most ${remainingProducts} more product units.`, "ISSUE_EXCEEDS_REMAINING_PRODUCTS");
      const [requestItemRows] = await conn.query(`
        SELECT id, component_id, quantity_per_product, requested_quantity, issued_quantity
        FROM production_material_request_items WHERE request_id = ? ORDER BY id FOR UPDATE
      `, [requestId]);
      expectedQuantities = new Map();
      for (const row of requestItemRows) {
        if (row.quantity_per_product === null || row.quantity_per_product === undefined) {
          throw AppError.conflict("This request has no saved per-product component ratio. Use the legacy component allotment workflow or create a new request.", "MISSING_COMPONENT_RATIO");
        }
        const expected = toCents(Number(row.quantity_per_product) * productQuantity);
        const remaining = toCents(row.requested_quantity) - toCents(row.issued_quantity);
        if (expected > remaining) throw AppError.conflict(`Component #${row.component_id} does not have enough remaining quantity for ${productQuantity} product units.`, "COMPONENTS_NOT_READY");
        expectedQuantities.set(Number(row.id), expected);
      }
      if (quantities.size !== expectedQuantities.size || [...expectedQuantities].some(([id, qty]) => quantities.get(id) !== qty)) {
        throw new AppError(422, "Component allotment quantities must match the selected number of product units", "BOM_QUANTITY_MISMATCH");
      }
    }

    for (const [requestItemId, cents] of [...expectedQuantities].sort(([a], [b]) => a - b)) {
      const [rows] = await conn.query(`
        SELECT id, component_id, requested_quantity, issued_quantity
        FROM production_material_request_items
        WHERE id = ? AND request_id = ?
        LIMIT 1 FOR UPDATE
      `, [requestItemId, requestId]);
      if (!rows.length) throw new AppError(422, "A component does not belong to this material request", "INVALID_REQUEST_ITEM");
      const requestItem = rows[0];
      const remainingCents = toCents(requestItem.requested_quantity) - toCents(requestItem.issued_quantity);
      if (cents > remainingCents) {
        throw AppError.conflict(`You can allot at most ${fromCents(Math.max(0, remainingCents))} for this component. Refresh and try again.`, "ISSUE_EXCEEDS_REMAINING");
      }

      // Inventory is deducted by Operations approval. Store allotment records the
      // physical handover only and must never check or deduct inventory again.

      await conn.query(
        `UPDATE production_material_request_items SET issued_quantity = issued_quantity + ? WHERE id = ?`,
        [fromCents(cents), requestItemId]
      );
      await conn.query(
        `INSERT INTO production_material_issues (request_item_id, quantity, issued_by, remarks, idempotency_key) VALUES (?, ?, ?, ?, ?)`,
        [requestItemId, fromCents(cents), userId, remarks, idempotencyKey]
      );
    }

    if (requests[0].requested_product_quantity !== null && requests[0].requested_product_quantity !== undefined) {
      await conn.query(`UPDATE production_material_requests SET issued_product_quantity = issued_product_quantity + ? WHERE id = ?`, [productQuantity, requestId]);
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

    // Production can start building with what the store handed over
    const [context] = await conn.query(
      `SELECT o.order_number, p.name AS product_name FROM order_items oi
       JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id WHERE oi.id = ?`,
      [requests[0].order_item_id]
    );
    const orderNumber = (context[0] && context[0].order_number) || `#${requests[0].order_id}`;
    const productName = (context[0] && context[0].product_name) || "the product";
    await notifications.notify(conn, {
      role: "PRODUCTION_MANAGER",
      type: "MATERIAL_ISSUED",
      title: status === "ISSUED"
        ? `Materials issued for order ${orderNumber}`
        : `Materials partly issued for order ${orderNumber}`,
      body: status === "ISSUED"
        ? `The store handed over every component for ${productName}. You can start production.`
        : `The store handed over part of the components for ${productName}. The rest will follow.`,
      severity: status === "ISSUED" ? "success" : "info",
      link: "/production",
      orderId: Number(requests[0].order_id),
      payload: { order_number: orderNumber, request_id: requestId, status },
      userId,
    });
    return { id: requestId, status };
  });

  // other Store Managers' lists still refresh live through the activity broadcast of this request
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
