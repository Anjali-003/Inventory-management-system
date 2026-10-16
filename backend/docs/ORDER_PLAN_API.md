# Operations Admin: stock check + dispatch

## Set up
Run `npm run migrate` (adds migrations `022_order_dispatch.sql` and
`024_issue_inventory_on_order_approval.sql`: approval request tables and the inventory-issue marker).

## What was added

| Where | What |
|-------|------|
| `middleware/permissions.js` | `OPERATIONS_ADMIN` can now VIEW inventory, inventoryHistory, finishedGoods, incomingStock, iqc and purchase (GET only). Same change is in `frontend/src/lib/permissions.js`. |
| `modules/order-approvals/order-planner.js` | Pure function `planOrder()`: what can be built now, what is short. |
| `GET /order-approvals/:id/plan` | Plan for a waiting order (409 `ALREADY_DECIDED` if it was decided). |
| `POST /order-approvals/:id/dispatch` | Rechecks stock under inventory row locks, deducts BOM materials for approved production quantities, and saves both request lists in one transaction. |
| `POST /order-approvals/:id/approve` | Uses the same locked stock plan and material issue flow without client-supplied lists. |
| `GET /order-approvals`, `GET /approved-orders` | Every order now has `production_request` and `purchase_request` (`null` when nothing was sent). |

## Plan response
```json
{ "order_id": 7, "fully_producible": false,
  "lines": [{ "product_id": 1, "sku": "PRD-001", "name": "Smart Controller", "ordered": 10, "can_make": 6, "remaining": 4, "has_bom": true }],
  "shortages": [{ "component_id": 1, "sku": "CMP-001", "name": "Resistor", "unit": "pcs", "required": 8, "available": 0, "shortage": 8 }],
  "missing_bom": [] }
```
`available` = on hand - reserved. Lines are served in order, so two products that share a component never
promise the same stock twice. `required` / `available` / `shortage` are for the units that cannot be made yet
(`available` = what is left after the producible units are set aside). A product with no BOM, or a BOM line
without a quantity, is listed in `missing_bom` and gets `can_make: 0`.

## Dispatch
`POST /order-approvals/:id/dispatch`
```json
{ "remarks": "optional",
  "production_items": [{ "product_id": 1, "quantity": 6 }],
  "purchase_items":   [{ "component_id": 1, "quantity": 8 }] }
```
The lists are what the admin saw. The plan is recalculated with the stock rows locked; if the lists no longer
match, the answer is **409 `STALE_PLAN`** and nothing is saved (the frontend refetches the plan). The admin may
select any whole-number production quantity from zero up to each product's `can_make`; the purchase list must
still match the current shortage plan. At least one production or purchase line must be non-empty.

Materials for each approved product quantity are deducted immediately from on-hand stock and recorded as
`CONSUMED` / `OUT` ledger movements with reason `ISSUED_TO_PRODUCTION`, linked to the order. Shared components are totaled across all approved
product lines. Inventory component rows are locked in ascending component-id order and decremented only when
`quantity_on_hand - quantity_reserved` still covers the requirement, so concurrent approvals cannot oversell.
The order's `inventory_issued_at` marker prevents production start/completion from reserving or consuming these
materials again. Orders approved before migration 024 retain the legacy production inventory behavior.

## For the Production Manager (teammate)
`order.production_request = { sent_at, sent_by_name, items: [{ product_id, sku, name, quantity }] }`
comes with every order from `GET /order-approvals`. Table: `order_production_items`. The frontend already
refreshes the `Production` cache tag on dispatch. The Production Manager role itself is not added here.

## Tests
`npm test`: `tests/order-planner.test.js` (planner) and `tests/order-dispatch.test.js` (plan + dispatch, with an
in-memory fake DB, not a real MySQL run).

Planning remains advisory until an order is approved. Once approved, its stock-covered production quantities are
issued immediately; another pending order's plan therefore sees the reduced on-hand balance.
