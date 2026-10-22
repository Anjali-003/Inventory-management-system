/*
  The production target is each order item's full ordered quantity.
  Approval-time stock availability is tracked separately so purchase shortages
  can be supplied later through Store without hiding units from production/QC.
*/
function targetQuantitySql(itemAlias = "oi", _orderAlias = "o") {
  return `GREATEST(0, ${itemAlias}.quantity)`;
}

module.exports = { targetQuantitySql };
