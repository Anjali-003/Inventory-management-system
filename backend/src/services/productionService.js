// const db = require("../config/db");


// /*
//     This function gets all the raw materials
//     required for an order.

//     Example:

//     100 × LED Display

//     Red LED = 64 per product

//     Required = 64 × 100 = 6400
// */
// async function getRequiredMaterials(connection, orderId) {

//     const [rows] = await connection.query(
//         `
//         SELECT
//             oi.product_id,
//             oi.quantity AS ordered_quantity,

//             pb.component_id,
//             c.sku AS component_sku,
//             c.name AS component_name,
//             c.unit,

//             pb.quantity_required AS bom_quantity

//         FROM order_items oi

//         JOIN product_bom pb
//             ON oi.product_id = pb.product_id

//         JOIN components c
//             ON pb.component_id = c.id

//         WHERE oi.order_id = ?

//         ORDER BY c.id
//         `,
//         [orderId]
//     );


//     if (rows.length === 0) {
//         throw new Error(
//             "Order has no products or BOM data"
//         );
//     }


//     /*
//         We use an object to combine
//         shared components.

//         Example:

//         LED Display needs 400 resistors
//         Control Board needs 500 resistors

//         Total = 900
//     */
//     const materialMap = {};


//     for (const row of rows) {

//         const orderedQuantity =
//             Number(row.ordered_quantity);

//         const bomQuantity =
//             Number(row.bom_quantity);


//         const requiredQuantity =
//             orderedQuantity * bomQuantity;


//         const componentId =
//             row.component_id;


//         if (!materialMap[componentId]) {

//             materialMap[componentId] = {

//                 componentId: componentId,

//                 sku: row.component_sku,

//                 name: row.component_name,

//                 unit: row.unit,

//                 required: 0

//             };

//         }


//         materialMap[componentId].required
//             += requiredQuantity;
//     }


//     return Object.values(materialMap);
// }


// /*
//     START PRODUCTION
// */
// async function startProduction(
//     orderId,
//     userId = 1
// ) {

//     const connection =
//         await db.getConnection();


//     try {

//         /*
//             Start a MySQL transaction.

//             Everything after this should either
//             completely succeed or completely fail.
//         */
//         await connection.beginTransaction();


//         /*
//             Lock the order row.

//             FOR UPDATE prevents another transaction
//             from modifying this order at the same time.
//         */
//         const [orders] = await connection.query(
//             `
//             SELECT
//                 id,
//                 order_number,
//                 status
//             FROM orders
//             WHERE id = ?
//             FOR UPDATE
//             `,
//             [orderId]
//         );


//         if (orders.length === 0) {

//             throw new Error(
//                 "Order not found"
//             );

//         }


//         const order = orders[0];


//         /*
//             Don't allow production to start again
//             if it has already started or completed.
//         */
//         if (order.status === "IN_PRODUCTION") {

//             throw new Error(
//                 "Production has already started"
//             );

//         }


//         if (order.status === "COMPLETED") {

//             throw new Error(
//                 "Order is already completed"
//             );

//         }


//         /*
//             Check whether a production record
//             already exists.
//         */
//         const [existingProduction] =
//             await connection.query(
//                 `
//                 SELECT
//                     id,
//                     status
//                 FROM production_orders
//                 WHERE order_id = ?
//                 FOR UPDATE
//                 `,
//                 [orderId]
//             );


//         if (
//             existingProduction.length > 0 &&
//             existingProduction[0].status === "IN_PRODUCTION"
//         ) {

//             throw new Error(
//                 "Production has already started"
//             );

//         }


//         /*
//             Get the actual material requirements.
//         */
//         const materials =
//             await getRequiredMaterials(
//                 connection,
//                 orderId
//             );


//         const shortages = [];


//         /*
//             Check and LOCK each inventory row.

//             This is extremely important.

//             The check and reservation happen
//             inside the SAME transaction.
//         */
//         for (const material of materials) {

//             const [inventoryRows] =
//                 await connection.query(
//                     `
//                     SELECT
//                         id,
//                         component_id,
//                         quantity_on_hand,
//                         quantity_reserved

//                     FROM inventory

//                     WHERE component_id = ?

//                     FOR UPDATE
//                     `,
//                     [material.componentId]
//                 );


//             /*
//                 If there is no inventory row,
//                 treat available stock as zero.
//             */
//             if (inventoryRows.length === 0) {

//                 material.available = 0;

//                 material.shortage =
//                     material.required;

//                 material.status =
//                     "INSUFFICIENT";

//                 shortages.push(material);

//                 continue;
//             }


//             const inventory =
//                 inventoryRows[0];


//             const onHand =
//                 Number(
//                     inventory.quantity_on_hand
//                 );


//             const reserved =
//                 Number(
//                     inventory.quantity_reserved
//                 );


//             const available =
//                 onHand - reserved;


//             material.available =
//                 available;


//             /*
//                 Check whether enough is available.
//             */
//             if (
//                 available <
//                 material.required
//             ) {

//                 material.shortage =
//                     material.required - available;

//                 material.status =
//                     "INSUFFICIENT";

//                 shortages.push(material);

//             } else {

//                 material.shortage = 0;

//                 material.status =
//                     "SUFFICIENT";
//             }

//         }


//         /*
//             If ANY component is insufficient,
//             don't start production.
//         */
//         if (shortages.length > 0) {

//             await connection.rollback();


//             return {

//                 success: false,

//                 canProduce: false,

//                 status: "MATERIAL_SHORTAGE",

//                 shortages: shortages

//             };
//         }


//         /*
//             Everything is available.

//             Create production record.
//         */
//         const [productionResult] =
//             await connection.query(
//                 `
//                 INSERT INTO production_orders
//                 (
//                     order_id,
//                     status,
//                     started_by,
//                     started_at
//                 )

//                 VALUES
//                 (
//                     ?,
//                     'IN_PRODUCTION',
//                     ?,
//                     NOW()
//                 )
//                 `,
//                 [
//                     orderId,
//                     userId
//                 ]
//             );


//         const productionId =
//             productionResult.insertId;


//         /*
//             Now reserve the inventory.
//         */
//         for (const material of materials) {

//             await connection.query(
//                 `
//                 UPDATE inventory

//                 SET
//                     quantity_reserved =
//                     quantity_reserved + ?

//                 WHERE component_id = ?
//                 `,
//                 [
//                     material.required,
//                     material.componentId
//                 ]
//             );


//             /*
//                 Create history record.
//             */
//             await connection.query(
//                 `
//                 INSERT INTO inventory_transactions
//                 (
//                     component_id,
//                     transaction_type,
//                     quantity,
//                     reference_type,
//                     reference_id,
//                     created_by
//                 )

//                 VALUES
//                 (
//                     ?,
//                     'RESERVED',
//                     ?,
//                     'PRODUCTION_ORDER',
//                     ?,
//                     ?
//                 )
//                 `,
//                 [
//                     material.componentId,
//                     material.required,
//                     productionId,
//                     userId
//                 ]
//             );

//         }


//         /*
//             Change the main order status.
//         */
//         await connection.query(
//             `
//             UPDATE orders

//             SET status = 'IN_PRODUCTION'

//             WHERE id = ?
//             `,
//             [orderId]
//         );


//         /*
//             Everything succeeded.
//         */
//         await connection.commit();


//         return {

//             success: true,

//             productionId: productionId,

//             orderId: order.id,

//             orderNumber: order.order_number,

//             status: "IN_PRODUCTION"

//         };


//     } catch (error) {

//         /*
//             If anything fails, undo EVERYTHING.
//         */
//         await connection.rollback();

//         throw error;

//     } finally {

//         /*
//             Give the MySQL connection back
//             to the connection pool.
//         */
//         connection.release();

//     }
// }


// /*
//     GET ALL PRODUCTION ORDERS
// */
// async function getProductionOrders() {

//     const [rows] = await db.query(
//         `
//         SELECT
//             po.id,
//             po.order_id,
//             o.order_number,
//             po.status,
//             po.started_at,
//             po.completed_at

//         FROM production_orders po

//         JOIN orders o
//             ON po.order_id = o.id

//         ORDER BY po.id DESC
//         `
//     );

//     return rows;
// }


// /*
//     COMPLETE PRODUCTION
// */
// async function completeProduction(
//     productionId,
//     userId = 1
// ) {

//     const connection =
//         await db.getConnection();


//     try {

//         await connection.beginTransaction();


//         /*
//             Lock the production record.
//         */
//         const [productionRows] =
//             await connection.query(
//                 `
//                 SELECT
//                     po.id,
//                     po.order_id,
//                     po.status,
//                     o.order_number,
//                     o.status AS order_status

//                 FROM production_orders po

//                 JOIN orders o
//                     ON po.order_id = o.id

//                 WHERE po.id = ?

//                 FOR UPDATE
//                 `,
//                 [productionId]
//             );


//         if (productionRows.length === 0) {

//             throw new Error(
//                 "Production order not found"
//             );

//         }


//         const production =
//             productionRows[0];


//         if (
//             production.status !==
//             "IN_PRODUCTION"
//         ) {

//             throw new Error(
//                 "Production is not currently in progress"
//             );

//         }


//         /*
//             Get material requirements again.

//             We do this because we need to know
//             exactly what was reserved.
//         */
//         const materials =
//             await getRequiredMaterials(
//                 connection,
//                 production.order_id
//             );


//         /*
//             Now consume each reserved component.
//         */
//         for (const material of materials) {

//             /*
//                 Lock inventory row.
//             */
//             const [inventoryRows] =
//                 await connection.query(
//                     `
//                     SELECT
//                         id,
//                         quantity_on_hand,
//                         quantity_reserved

//                     FROM inventory

//                     WHERE component_id = ?

//                     FOR UPDATE
//                     `,
//                     [material.componentId]
//                 );


//             if (inventoryRows.length === 0) {

//                 throw new Error(
//                     `Inventory not found for ${material.name}`
//                 );

//             }


//             const inventory =
//                 inventoryRows[0];


//             const onHand =
//                 Number(
//                     inventory.quantity_on_hand
//                 );


//             const reserved =
//                 Number(
//                     inventory.quantity_reserved
//                 );


//             /*
//                 Safety check.

//                 We should have at least the
//                 required amount reserved.
//             */
//             if (
//                 reserved <
//                 material.required
//             ) {

//                 throw new Error(
//                     `Reserved inventory is insufficient for ${material.name}`
//                 );

//             }


//             if (
//                 onHand <
//                 material.required
//             ) {

//                 throw new Error(
//                     `On-hand inventory is insufficient for ${material.name}`
//                 );

//             }


//             /*
//                 Consume the material.

//                 On Hand decreases.
//                 Reserved also decreases.
//             */
//             await connection.query(
//                 `
//                 UPDATE inventory

//                 SET
//                     quantity_on_hand =
//                     quantity_on_hand - ?,

//                     quantity_reserved =
//                     quantity_reserved - ?

//                 WHERE component_id = ?
//                 `,
//                 [
//                     material.required,
//                     material.required,
//                     material.componentId
//                 ]
//             );


//             /*
//                 Record the consumption.
//             */
//             await connection.query(
//                 `
//                 INSERT INTO inventory_transactions
//                 (
//                     component_id,
//                     transaction_type,
//                     quantity,
//                     reference_type,
//                     reference_id,
//                     created_by
//                 )

//                 VALUES
//                 (
//                     ?,
//                     'CONSUMED',
//                     ?,
//                     'PRODUCTION_ORDER',
//                     ?,
//                     ?
//                 )
//                 `,
//                 [
//                     material.componentId,
//                     material.required,
//                     productionId,
//                     userId
//                 ]
//             );

//         }


//         /*
//             Production is now completed.
//         */
//         await connection.query(
//             `
//             UPDATE production_orders

//             SET
//                 status = 'COMPLETED',
//                 completed_at = NOW()

//             WHERE id = ?
//             `,
//             [productionId]
//         );


//         /*
//             Main order is completed too.
//         */
//         await connection.query(
//             `
//             UPDATE orders

//             SET status = 'COMPLETED'

//             WHERE id = ?
//             `,
//             [production.order_id]
//         );


//         await connection.commit();


//         return {

//             success: true,

//             productionId: production.id,

//             orderId: production.order_id,

//             orderNumber:
//                 production.order_number,

//             status: "COMPLETED"

//         };


//     } catch (error) {

//         await connection.rollback();

//         throw error;

//     } finally {

//         connection.release();

//     }
// }


// module.exports = {
//     startProduction,
//     getProductionOrders,
//     completeProduction
// };