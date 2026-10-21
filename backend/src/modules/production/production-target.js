/*
  How many units of ONE product a production run has to build (the "target"):
    - orders approved with materials issued (orders.inventory_issued_at set): the quantity the Operations Admin
      approved for that product, summed over every approval pass (order_production_items);
    - older orders: the ordered quantity (order_items).
  Used by production, QC and finished goods so they all agree. po / o are the aliases of production_orders / orders.
*/
function targetQuantitySql(po = "po", o = "o") {
  return `CASE WHEN ${o}.inventory_issued_at IS NOT NULL
      THEN COALESCE((SELECT SUM(opi.quantity) FROM order_production_items opi WHERE opi.order_id = ${po}.order_id AND opi.product_id = ${po}.product_id), 0)
      ELSE COALESCE((SELECT SUM(oit.quantity) FROM order_items oit WHERE oit.order_id = ${po}.order_id AND oit.product_id = ${po}.product_id), 0)
    END`
}

module.exports = { targetQuantitySql }
