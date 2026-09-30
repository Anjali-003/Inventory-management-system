const db = require("../config/db");


/*
=========================================================
GET THE PRODUCT INSIDE AN ORDER
=========================================================

For the current project, one order contains one product.

Example:

Order:
100 × LED Display

This function returns:
- product
- ordered quantity
*/
async function getSingleOrderItem(connection, orderId) {

    const [rows] = await connection.query(
        `
        SELECT
            oi.product_id,
            oi.quantity AS ordered_quantity,
            p.sku AS product_sku,
            p.name AS product_name
        FROM order_items oi
        JOIN products p
            ON oi.product_id = p.id
        WHERE oi.order_id = ?
        ORDER BY oi.id
        `,
        [orderId]
    );


    if (rows.length === 0) {

        throw new Error(
            "Order has no products or BOM data"
        );

    }


    /*
        Partial production currently works
        with one product per order.
    */
    if (rows.length > 1) {

        throw new Error(
            "Partial production currently supports one product per order"
        );

    }


    return rows[0];
}


/*
=========================================================
GET MATERIAL REQUIREMENTS FOR A SPECIFIC QUANTITY
=========================================================

Example:

1 LED Display needs:

9 resistors
1 PCB
1 display

If we start:

20 LED Displays

Required becomes:

180 resistors
20 PCB
20 displays
*/
async function getRequiredMaterialsForQuantity(
    connection,
    orderId,
    productionQuantity
) {

    if (
        !Number.isInteger(productionQuantity) ||
        productionQuantity <= 0
    ) {

        throw new Error(
            "Production quantity must be a positive integer"
        );

    }


    const orderItem =
        await getSingleOrderItem(
            connection,
            orderId
        );


    const [rows] =
        await connection.query(
            `
            SELECT
                pb.component_id,
                c.sku AS component_sku,
                c.name AS component_name,
                c.unit,
                pb.quantity_required
            FROM product_bom pb
            JOIN components c
                ON pb.component_id = c.id
            WHERE pb.product_id = ?
            ORDER BY c.id
            `,
            [orderItem.product_id]
        );


    if (rows.length === 0) {

        throw new Error(
            "Order has no products or BOM data"
        );

    }


    /*
        Combine the same component if it
        appears more than once in the BOM.
    */
    const materialMap = {};


    for (const row of rows) {

        const componentId =
            row.component_id;


        const perUnitRequired =
            Number(row.quantity_required);


        const requiredQuantity =
            productionQuantity *
            perUnitRequired;


        if (!materialMap[componentId]) {

            materialMap[componentId] = {

                componentId:
                    componentId,

                sku:
                    row.component_sku,

                name:
                    row.component_name,

                unit:
                    row.unit,

                required:
                    0,

                requiredPerUnit:
                    0

            };

        }


        materialMap[componentId].required +=
            requiredQuantity;


        materialMap[componentId].requiredPerUnit +=
            perUnitRequired;

    }


    return Object.values(materialMap);
}


/*
=========================================================
CALCULATE MAXIMUM POSSIBLE PRODUCTION
=========================================================

This answers:

"How many more products can I start
with the currently available inventory?"

Example:

Resistor:
750 available
9 required per product

750 / 9 = 83 products

PCB:
100 available
1 required per product

100 / 1 = 100 products

Display:
80 available
1 required per product

80 / 1 = 80 products

Maximum = 80

Also compare it with the order quantity still
remaining to start.
*/
async function calculateMaxProductionQuantity(
    connection,
    materialsPerUnit,
    remainingToStart
) {

    if (remainingToStart <= 0) {

        return 0;

    }


    let maximum =
        remainingToStart;


    for (
        const material
        of materialsPerUnit
    ) {

        const [inventoryRows] =
            await connection.query(
                `
                SELECT
                    quantity_on_hand,
                    quantity_reserved
                FROM inventory
                WHERE component_id = ?
                `,
                [material.componentId]
            );


        if (inventoryRows.length === 0) {

            return 0;

        }


        const inventory =
            inventoryRows[0];


        const onHand =
            Number(
                inventory.quantity_on_hand
            );


        const reserved =
            Number(
                inventory.quantity_reserved
            );


        const available =
            Math.max(
                0,
                onHand - reserved
            );


        const requiredPerUnit =
            Number(
                material.requiredPerUnit
            );


        if (requiredPerUnit <= 0) {

            continue;

        }


        const possibleFromThisComponent =
            Math.floor(
                available /
                requiredPerUnit
            );


        maximum =
            Math.min(
                maximum,
                possibleFromThisComponent
            );


        if (maximum <= 0) {

            return 0;

        }

    }


    return maximum;
}


/*
=========================================================
GET PRODUCTION INFORMATION FOR AN ORDER
=========================================================

Used by the Orders page.

Returns:

Ordered
Started
Completed
Currently in production
Remaining to start
Maximum possible from inventory
*/
async function getProductionInfo(orderId) {

    const connection =
        await db.getConnection();


    try {

        const [orderRows] =
            await connection.query(
                `
                SELECT
                    id,
                    order_number,
                    status
                FROM orders
                WHERE id = ?
                `,
                [orderId]
            );


        if (orderRows.length === 0) {

            throw new Error(
                "Order not found"
            );

        }


        const order =
            orderRows[0];


        const orderItem =
            await getSingleOrderItem(
                connection,
                orderId
            );


        const [productionRows] =
            await connection.query(
                `
                SELECT
                    id,
                    status,
                    quantity_to_produce,
                    quantity_completed,
                    started_at,
                    completed_at
                FROM production_orders
                WHERE order_id = ?
                ORDER BY id DESC
                LIMIT 1
                `,
                [orderId]
            );


        const production =
            productionRows.length > 0
                ? productionRows[0]
                : null;


        const orderedQuantity =
            Number(
                orderItem.ordered_quantity
            );


        const quantityToProduce =
            production
                ? Number(
                    production.quantity_to_produce
                )
                : 0;


        const quantityCompleted =
            production
                ? Number(
                    production.quantity_completed
                )
                : 0;


        const quantityInProduction =
            Math.max(
                0,
                quantityToProduce -
                quantityCompleted
            );


        const remainingToStart =
            Math.max(
                0,
                orderedQuantity -
                quantityToProduce
            );


        /*
            Get material requirement for
            exactly ONE finished product.
        */
        const materialsPerUnit =
            await getRequiredMaterialsForQuantity(
                connection,
                orderId,
                1
            );


        const maxProductionQuantity =
            await calculateMaxProductionQuantity(
                connection,
                materialsPerUnit,
                remainingToStart
            );


        return {

            success: true,

            orderId:
                order.id,

            orderNumber:
                order.order_number,

            orderStatus:
                order.status,

            productId:
                orderItem.product_id,

            productSku:
                orderItem.product_sku,

            productName:
                orderItem.product_name,

            orderedQuantity,

            quantityToProduce,

            quantityCompleted,

            quantityInProduction,

            remainingToStart,

            maxProductionQuantity,

            productionId:
                production
                    ? production.id
                    : null,

            productionStatus:
                production
                    ? production.status
                    : "NOT_STARTED",

            startedAt:
                production
                    ? production.started_at
                    : null,

            completedAt:
                production
                    ? production.completed_at
                    : null

        };

    } finally {

        connection.release();

    }
}


/*
=========================================================
CHECK MATERIALS FOR A PARTIAL PRODUCTION QUANTITY
=========================================================
*/
async function checkProductionMaterials(
    orderId,
    productionQuantity
) {

    const connection =
        await db.getConnection();


    try {

        const [orderRows] =
            await connection.query(
                `
                SELECT
                    id,
                    order_number,
                    status
                FROM orders
                WHERE id = ?
                `,
                [orderId]
            );


        if (orderRows.length === 0) {

            throw new Error(
                "Order not found"
            );

        }


        const orderItem =
            await getSingleOrderItem(
                connection,
                orderId
            );


        const [productionRows] =
            await connection.query(
                `
                SELECT
                    quantity_to_produce,
                    quantity_completed
                FROM production_orders
                WHERE order_id = ?
                ORDER BY id DESC
                LIMIT 1
                `,
                [orderId]
            );


        const existingProduction =
            productionRows.length > 0
                ? productionRows[0]
                : null;


        const orderedQuantity =
            Number(
                orderItem.ordered_quantity
            );


        const quantityAlreadyStarted =
            existingProduction
                ? Number(
                    existingProduction.quantity_to_produce
                )
                : 0;


        const remainingToStart =
            Math.max(
                0,
                orderedQuantity -
                quantityAlreadyStarted
            );


        if (
            productionQuantity >
            remainingToStart
        ) {

            throw new Error(
                `Requested quantity exceeds remaining quantity to start. Remaining: ${remainingToStart}`
            );

        }


        const materials =
            await getRequiredMaterialsForQuantity(
                connection,
                orderId,
                productionQuantity
            );


        const shortages = [];


        for (
            const material
            of materials
        ) {

            const [inventoryRows] =
                await connection.query(
                    `
                    SELECT
                        quantity_on_hand,
                        quantity_reserved
                    FROM inventory
                    WHERE component_id = ?
                    `,
                    [material.componentId]
                );


            if (
                inventoryRows.length === 0
            ) {

                material.available = 0;

                material.shortage =
                    material.required;

                material.status =
                    "INSUFFICIENT";

                shortages.push(
                    material
                );

                continue;

            }


            const inventory =
                inventoryRows[0];


            const onHand =
                Number(
                    inventory.quantity_on_hand
                );


            const reserved =
                Number(
                    inventory.quantity_reserved
                );


            const available =
                Math.max(
                    0,
                    onHand - reserved
                );


            material.available =
                available;


            if (
                available <
                material.required
            ) {

                material.shortage =
                    material.required -
                    available;

                material.status =
                    "INSUFFICIENT";

                shortages.push(
                    material
                );

            } else {

                material.shortage =
                    0;

                material.status =
                    "SUFFICIENT";

            }

        }


        return {

            success:
                shortages.length === 0,

            canProduce:
                shortages.length === 0,

            orderId,

            orderNumber:
                orderRows[0].order_number,

            requestedQuantity:
                productionQuantity,

            remainingToStart,

            materials,

            shortages,

            status:
                shortages.length === 0
                    ? "READY"
                    : "MATERIAL_SHORTAGE"

        };

    } finally {

        connection.release();

    }
}


/*
=========================================================
START PARTIAL PRODUCTION
=========================================================

The important change:

OLD:

Start production
→ reserve materials for entire order

NEW:

Start production for 20
→ reserve materials for 20 only
*/
async function startProduction(
    orderId,
    quantity,
    userId = 1
) {

    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        /*
            Lock the order so two users cannot
            start conflicting quantities at the
            exact same time.
        */
        const [orders] =
            await connection.query(
                `
                SELECT
                    id,
                    order_number,
                    status
                FROM orders
                WHERE id = ?
                FOR UPDATE
                `,
                [orderId]
            );


        if (orders.length === 0) {

            throw new Error(
                "Order not found"
            );

        }


        const order =
            orders[0];


        if (order.status === "COMPLETED") {

            throw new Error(
                "Order is already completed"
            );

        }


        if (
            !Number.isInteger(quantity) ||
            quantity <= 0
        ) {

            throw new Error(
                "Production quantity must be a positive integer"
            );

        }


        const orderItem =
            await getSingleOrderItem(
                connection,
                orderId
            );


        const orderedQuantity =
            Number(
                orderItem.ordered_quantity
            );


        /*
            Lock the existing production
            record, if one exists.
        */
        const [existingProductionRows] =
            await connection.query(
                `
                SELECT
                    id,
                    status,
                    quantity_to_produce,
                    quantity_completed
                FROM production_orders
                WHERE order_id = ?
                ORDER BY id DESC
                LIMIT 1
                FOR UPDATE
                `,
                [orderId]
            );


        const existingProduction =
            existingProductionRows.length > 0
                ? existingProductionRows[0]
                : null;


        const quantityAlreadyStarted =
            existingProduction
                ? Number(
                    existingProduction.quantity_to_produce
                )
                : 0;


        const quantityAlreadyCompleted =
            existingProduction
                ? Number(
                    existingProduction.quantity_completed
                )
                : 0;


        const remainingToStart =
            Math.max(
                0,
                orderedQuantity -
                quantityAlreadyStarted
            );


        if (quantity > remainingToStart) {

            throw new Error(
                `Requested quantity exceeds remaining quantity to start. Remaining: ${remainingToStart}`
            );

        }


        /*
            Get material requirement for
            ONLY the requested quantity.
        */
        const materials =
            await getRequiredMaterialsForQuantity(
                connection,
                orderId,
                quantity
            );


        const shortages = [];


        /*
            Lock inventory rows and check
            available quantity.
        */
        for (
            const material
            of materials
        ) {

            const [inventoryRows] =
                await connection.query(
                    `
                    SELECT
                        id,
                        component_id,
                        quantity_on_hand,
                        quantity_reserved
                    FROM inventory
                    WHERE component_id = ?
                    FOR UPDATE
                    `,
                    [material.componentId]
                );


            if (
                inventoryRows.length === 0
            ) {

                material.available = 0;

                material.shortage =
                    material.required;

                material.status =
                    "INSUFFICIENT";

                shortages.push(
                    material
                );

                continue;

            }


            const inventory =
                inventoryRows[0];


            const onHand =
                Number(
                    inventory.quantity_on_hand
                );


            const reserved =
                Number(
                    inventory.quantity_reserved
                );


            const available =
                Math.max(
                    0,
                    onHand - reserved
                );


            material.available =
                available;


            if (
                available <
                material.required
            ) {

                material.shortage =
                    material.required -
                    available;

                material.status =
                    "INSUFFICIENT";

                shortages.push(
                    material
                );

            } else {

                material.shortage =
                    0;

                material.status =
                    "SUFFICIENT";

            }

        }


        /*
            If any material is short,
            do not reserve anything.
        */
        if (shortages.length > 0) {

            await connection.rollback();


            return {

                success:
                    false,

                canProduce:
                    false,

                status:
                    "MATERIAL_SHORTAGE",

                shortages

            };

        }


        let productionId;


        /*
            If a production record already exists,
            increase the total quantity started.

            Example:

            Existing:
            20 started

            New:
            +30

            New total:
            50 started
        */
        if (existingProduction) {

            productionId =
                existingProduction.id;


            await connection.query(
                `
                UPDATE production_orders

                SET
                    quantity_to_produce =
                        quantity_to_produce + ?,

                    status =
                        'IN_PRODUCTION',

                    completed_at =
                        NULL

                WHERE id = ?
                `,
                [
                    quantity,
                    productionId
                ]
            );

        } else {

            /*
                First production batch.
            */
            const [productionResult] =
                await connection.query(
                    `
                    INSERT INTO production_orders
                    (
                        order_id,
                        quantity_to_produce,
                        quantity_completed,
                        status,
                        started_by,
                        started_at
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        0,
                        'IN_PRODUCTION',
                        ?,
                        NOW()
                    )
                    `,
                    [
                        orderId,
                        quantity,
                        userId
                    ]
                );


            productionId =
                productionResult.insertId;

        }


        /*
            Reserve inventory only for
            the quantity just started.
        */
        for (
            const material
            of materials
        ) {

            await connection.query(
                `
                UPDATE inventory

                SET
                    quantity_reserved =
                        quantity_reserved + ?

                WHERE component_id = ?
                `,
                [
                    material.required,
                    material.componentId
                ]
            );


            /*
                Audit history.
            */
            await connection.query(
                `
                INSERT INTO inventory_transactions
                (
                    component_id,
                    transaction_type,
                    quantity,
                    reference_type,
                    reference_id,
                    created_by
                )

                VALUES
                (
                    ?,
                    'RESERVED',
                    ?,
                    'PRODUCTION_ORDER',
                    ?,
                    ?
                )
                `,
                [
                    material.componentId,
                    material.required,
                    productionId,
                    userId
                ]
            );

        }


        /*
            Put the main order into production.
        */
        await connection.query(
            `
            UPDATE orders

            SET
                status = 'IN_PRODUCTION'

            WHERE id = ?
            `,
            [orderId]
        );


        await connection.commit();


        const newQuantityStarted =
            quantityAlreadyStarted +
            quantity;


        const newQuantityCompleted =
            quantityAlreadyCompleted;


        return {

            success: true,

            productionId,

            orderId:
                order.id,

            orderNumber:
                order.order_number,

            status:
                "IN_PRODUCTION",

            quantityStarted:
                quantity,

            totalStarted:
                newQuantityStarted,

            quantityCompleted:
                newQuantityCompleted,

            remainingToStart:
                orderedQuantity -
                newQuantityStarted

        };

    } catch (error) {

        await connection.rollback();

        throw error;

    } finally {

        connection.release();

    }
}


/*
=========================================================
GET ALL PRODUCTION ORDERS
=========================================================
*/
async function getProductionOrders() {

    const [rows] =
        await db.query(
            `
            SELECT

                po.id,

                po.order_id,

                o.order_number,

                o.status AS order_status,

                po.status,

                po.quantity_to_produce,

                po.quantity_completed,

                (
                    po.quantity_to_produce -
                    po.quantity_completed
                ) AS quantity_in_production,

                oi.ordered_quantity,

                oi.product_name,

                po.started_at,

                po.completed_at

            FROM production_orders po

            JOIN orders o
                ON po.order_id = o.id

            JOIN
            (
                SELECT
                    oi.order_id,

                    SUM(oi.quantity)
                        AS ordered_quantity,

                    MAX(p.name)
                        AS product_name

                FROM order_items oi

                JOIN products p
                    ON oi.product_id = p.id

                GROUP BY oi.order_id

            ) oi

                ON po.order_id =
                   oi.order_id

            ORDER BY po.id DESC
            `
        );


    return rows;
}


/*
=========================================================
UPDATE PRODUCTION PROGRESS
=========================================================

Example:

Started:
50

Completed:
20

User enters:
10

New:

Started:
50

Completed:
30

Currently producing:
20
*/
async function updateProductionProgress(
    productionId,
    quantity,
    userId = 1
) {

    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        if (
            !Number.isInteger(quantity) ||
            quantity <= 0
        ) {

            throw new Error(
                "Completed quantity must be a positive integer"
            );

        }


        /*
            Lock production + order.
        */
        const [productionRows] =
            await connection.query(
                `
                SELECT
                    po.id,
                    po.order_id,
                    po.status,
                    po.quantity_to_produce,
                    po.quantity_completed,

                    o.order_number,
                    o.status AS order_status

                FROM production_orders po

                JOIN orders o
                    ON po.order_id = o.id

                WHERE po.id = ?

                FOR UPDATE
                `,
                [productionId]
            );


        if (
            productionRows.length === 0
        ) {

            throw new Error(
                "Production order not found"
            );

        }


        const production =
            productionRows[0];


        if (
            production.status !==
            "IN_PRODUCTION"
        ) {

            throw new Error(
                "Production is not currently in progress"
            );

        }


        const orderItem =
            await getSingleOrderItem(
                connection,
                production.order_id
            );


        const orderedQuantity =
            Number(
                orderItem.ordered_quantity
            );


        const quantityToProduce =
            Number(
                production.quantity_to_produce
            );


        const quantityCompleted =
            Number(
                production.quantity_completed
            );


        const quantityInProduction =
            Math.max(
                0,
                quantityToProduce -
                quantityCompleted
            );


        /*
            You cannot mark 30 products as completed
            if only 20 have been started.
        */
        if (
            quantity >
            quantityInProduction
        ) {

            throw new Error(
                `Cannot complete more than the currently started quantity. Currently in production: ${quantityInProduction}`
            );

        }


        /*
            Find materials needed for the
            products being completed NOW.

            Example:

            10 products completed
            →
            consume materials for 10
        */
        const materials =
            await getRequiredMaterialsForQuantity(
                connection,
                production.order_id,
                quantity
            );


        for (
            const material
            of materials
        ) {

            /*
                Lock inventory row.
            */
            const [inventoryRows] =
                await connection.query(
                    `
                    SELECT
                        id,
                        quantity_on_hand,
                        quantity_reserved

                    FROM inventory

                    WHERE component_id = ?

                    FOR UPDATE
                    `,
                    [material.componentId]
                );


            if (
                inventoryRows.length === 0
            ) {

                throw new Error(
                    `Inventory not found for ${material.name}`
                );

            }


            const inventory =
                inventoryRows[0];


            const onHand =
                Number(
                    inventory.quantity_on_hand
                );


            const reserved =
                Number(
                    inventory.quantity_reserved
                );


            /*
                We should have enough reserved
                material for these products.
            */
            if (
                reserved <
                material.required
            ) {

                throw new Error(
                    `Reserved inventory is insufficient for ${material.name}`
                );

            }


            if (
                onHand <
                material.required
            ) {

                throw new Error(
                    `On-hand inventory is insufficient for ${material.name}`
                );

            }


            /*
                Consume the materials.

                On-hand decreases.
                Reserved decreases.
            */
            await connection.query(
                `
                UPDATE inventory

                SET
                    quantity_on_hand =
                        quantity_on_hand - ?,

                    quantity_reserved =
                        quantity_reserved - ?

                WHERE component_id = ?
                `,
                [
                    material.required,
                    material.required,
                    material.componentId
                ]
            );


            /*
                Audit transaction.
            */
            await connection.query(
                `
                INSERT INTO inventory_transactions
                (
                    component_id,
                    transaction_type,
                    quantity,
                    reference_type,
                    reference_id,
                    created_by
                )

                VALUES
                (
                    ?,
                    'CONSUMED',
                    ?,
                    'PRODUCTION_ORDER',
                    ?,
                    ?
                )
                `,
                [
                    material.componentId,
                    material.required,
                    productionId,
                    userId
                ]
            );

        }


        const newQuantityCompleted =
            quantityCompleted +
            quantity;


        /*
            The order is completed only when
            the TOTAL ordered quantity is completed.

            Example:

            Order = 100
            Started = 20
            Completed = 20

            Order is NOT completed yet.

            Order = 100
            Started = 100
            Completed = 100

            Order IS completed.
        */
        const orderCompleted =
            newQuantityCompleted >=
            orderedQuantity;


        await connection.query(
            `
            UPDATE production_orders

            SET
                quantity_completed = ?,

                status = ?,

                completed_at = ?

            WHERE id = ?
            `,
            [
                newQuantityCompleted,

                orderCompleted
                    ? "COMPLETED"
                    : "IN_PRODUCTION",

                orderCompleted
                    ? new Date()
                    : null,

                productionId
            ]
        );


        await connection.query(
            `
            UPDATE orders

            SET
                status = ?

            WHERE id = ?
            `,
            [
                orderCompleted
                    ? "COMPLETED"
                    : "IN_PRODUCTION",

                production.order_id
            ]
        );


        await connection.commit();


        return {

            success: true,

            productionId:
                production.id,

            orderId:
                production.order_id,

            orderNumber:
                production.order_number,

            quantityCompleted:
                newQuantityCompleted,

            quantityStarted:
                quantityToProduce,

            quantityInProduction:
                quantityToProduce -
                newQuantityCompleted,

            orderedQuantity,

            progressPercentage:
                Math.min(
                    100,
                    Math.round(
                        (
                            newQuantityCompleted /
                            orderedQuantity
                        ) *
                        100
                    )
                ),

            status:
                orderCompleted
                    ? "COMPLETED"
                    : "IN_PRODUCTION"

        };

    } catch (error) {

        await connection.rollback();

        throw error;

    } finally {

        connection.release();

    }
}


/*
=========================================================
OLD "COMPLETE PRODUCTION" ENDPOINT SUPPORT
=========================================================

This keeps your existing endpoint working.

Instead of blindly completing the whole order,
it completes whatever quantity has currently
been started but is not completed yet.
*/
async function completeProduction(
    productionId,
    userId = 1
) {

    const [rows] =
        await db.query(
            `
            SELECT
                quantity_to_produce,
                quantity_completed
            FROM production_orders
            WHERE id = ?
            `,
            [productionId]
        );


    if (rows.length === 0) {

        throw new Error(
            "Production order not found"
        );

    }


    const quantityToProduce =
        Number(
            rows[0].quantity_to_produce
        );


    const quantityCompleted =
        Number(
            rows[0].quantity_completed
        );


    const remaining =
        quantityToProduce -
        quantityCompleted;


    if (remaining <= 0) {

        throw new Error(
            "No products are currently waiting to be completed"
        );

    }


    return updateProductionProgress(
        productionId,
        remaining,
        userId
    );
}


module.exports = {

    startProduction,

    getProductionOrders,

    completeProduction,

    updateProductionProgress,

    getProductionInfo,

    checkProductionMaterials

};