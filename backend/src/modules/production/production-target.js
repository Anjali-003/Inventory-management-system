/*
  Approved production target for ONE order line. When Operations has deducted inventory,
  the approved quantity is distributed across repeated lines for the same product in order-item
  order. This keeps totals from being duplicated by product-level joins.
*/
function targetQuantitySql(itemAlias = "oi", orderAlias = "o") {
  return `CASE WHEN ${orderAlias}.inventory_issued_at IS NOT NULL
      THEN LEAST(${itemAlias}.quantity, GREATEST(0,
        COALESCE((SELECT SUM(opi.quantity) FROM order_production_items opi
                  WHERE opi.order_id = ${itemAlias}.order_id AND opi.product_id = ${itemAlias}.product_id), 0)
        - COALESCE((SELECT SUM(previous.quantity) FROM order_items previous
                    WHERE previous.order_id = ${itemAlias}.order_id
                      AND previous.product_id = ${itemAlias}.product_id
                      AND previous.id < ${itemAlias}.id), 0)
      ))
      ELSE ${itemAlias}.quantity
    END`;
}

module.exports = { targetQuantitySql };
