const db = require("../config/db");


/*
=========================================================
GET ALL FINISHED GOODS
=========================================================

Returns all products that have entered Finished Goods.

Workflow:

PACKAGING
    ↓
DISPATCHED
    ↓
COMPLETED
=========================================================
*/

async function getFinishedGoods() {

    const [rows] =
        await db.query(
            `
            SELECT

                fg.id,

                fg.production_id,
                fg.order_id,

                fg.quantity,
                fg.status,

                fg.created_at,
                fg.dispatched_at,
                fg.completed_at,

                o.order_number,

                oi.product_id,

                p.sku AS product_sku,
                p.name AS product_name

            FROM finished_goods fg

            JOIN orders o
                ON fg.order_id = o.id

            JOIN order_items oi
                ON o.id = oi.order_id

            JOIN products p
                ON oi.product_id = p.id

            ORDER BY
                fg.id DESC
            `
        );


    return rows.map(
        (row) => ({

            id:
                row.id,

            productionId:
                row.production_id,

            orderId:
                row.order_id,

            orderNumber:
                row.order_number,

            productId:
                row.product_id,

            productSku:
                row.product_sku,

            productName:
                row.product_name,

            quantity:
                Number(
                    row.quantity
                ),

            status:
                row.status,

            createdAt:
                row.created_at,

            dispatchedAt:
                row.dispatched_at,

            completedAt:
                row.completed_at,

        })
    );
}


/*
=========================================================
GET SINGLE FINISHED GOOD
=========================================================
*/

async function getFinishedGood(
    finishedGoodsId
) {

    const [rows] =
        await db.query(
            `
            SELECT

                fg.id,

                fg.production_id,
                fg.order_id,

                fg.quantity,
                fg.status,

                fg.created_at,
                fg.dispatched_at,
                fg.completed_at,

                o.order_number,

                oi.product_id,

                p.sku AS product_sku,
                p.name AS product_name

            FROM finished_goods fg

            JOIN orders o
                ON fg.order_id = o.id

            JOIN order_items oi
                ON o.id = oi.order_id

            JOIN products p
                ON oi.product_id = p.id

            WHERE fg.id = ?

            ORDER BY
                oi.id

            LIMIT 1
            `,
            [
                finishedGoodsId
            ]
        );


    if (
        rows.length === 0
    ) {

        throw new Error(
            "Finished goods record not found"
        );

    }


    const row =
        rows[0];


    return {

        id:
            row.id,

        productionId:
            row.production_id,

        orderId:
            row.order_id,

        orderNumber:
            row.order_number,

        productId:
            row.product_id,

        productSku:
            row.product_sku,

        productName:
            row.product_name,

        quantity:
            Number(
                row.quantity
            ),

        status:
            row.status,

        createdAt:
            row.created_at,

        dispatchedAt:
            row.dispatched_at,

        completedAt:
            row.completed_at,

    };
}


/*
=========================================================
CREATE FINISHED GOODS RECORD
=========================================================

This function will eventually be called when QC passes.

Example:

QC PASS
    ↓
40 approved
    ↓
Create Finished Goods
    ↓
PACKAGING
=========================================================
*/

async function createFinishedGood(
    productionId,
    orderId,
    quantity,
    connection = null
) {

    const ownsConnection =
        !connection;


    if (ownsConnection) {

        connection =
            await db.getConnection();

    }


    try {

        /*
        -------------------------------------------------
        VALIDATE QUANTITY
        -------------------------------------------------
        */

        if (
            !Number.isInteger(
                quantity
            ) ||
            quantity <= 0
        ) {

            throw new Error(
                "Finished goods quantity must be a positive integer"
            );

        }


        /*
        -------------------------------------------------
        CHECK PRODUCTION ORDER
        -------------------------------------------------
        */

        const [
            productionRows
        ] =
            await connection.query(
                `
                SELECT
                    id,
                    order_id
                FROM production_orders
                WHERE id = ?
                LIMIT 1
                `,
                [
                    productionId
                ]
            );


        if (
            productionRows.length === 0
        ) {

            throw new Error(
                "Production order not found"
            );

        }


        /*
        -------------------------------------------------
        CHECK ORDER
        -------------------------------------------------
        */

        const [
            orderRows
        ] =
            await connection.query(
                `
                SELECT
                    id,
                    order_number,
                    status
                FROM orders
                WHERE id = ?
                LIMIT 1
                `,
                [
                    orderId
                ]
            );


        if (
            orderRows.length === 0
        ) {

            throw new Error(
                "Order not found"
            );

        }


        /*
        -------------------------------------------------
        MAKE SURE PRODUCTION BELONGS TO ORDER
        -------------------------------------------------
        */

        if (
            Number(
                productionRows[0].order_id
            ) !==
            Number(orderId)
        ) {

            throw new Error(
                "Production order does not belong to the specified order"
            );

        }


        /*
        -------------------------------------------------
        CREATE FINISHED GOODS RECORD
        -------------------------------------------------
        */

        const [result] =
            await connection.query(
                `
                INSERT INTO finished_goods
                (
                    production_id,
                    order_id,
                    quantity,
                    status
                )

                VALUES
                (
                    ?,
                    ?,
                    ?,
                    'PACKAGING'
                )
                `,
                [
                    productionId,
                    orderId,
                    quantity
                ]
            );


        /*
        -------------------------------------------------
        CHANGE MAIN ORDER STATUS
        -------------------------------------------------

        QC PASS means the product can enter
        the Packaging stage.
        -------------------------------------------------
        */

        await connection.query(
            `
            UPDATE orders

            SET
                status = 'PACKAGING',
                updated_at = CURRENT_TIMESTAMP

            WHERE id = ?

              AND status NOT IN
              (
                  'DISPATCHED',
                  'COMPLETED'
              )
            `,
            [
                orderId
            ]
        );


        return {

            success: true,

            finishedGoodsId:
                result.insertId,

            productionId,

            orderId,

            quantity,

            status:
                "PACKAGING",

            message:
                "Finished goods created successfully"

        };

    } finally {

        if (ownsConnection) {

            connection.release();

        }

    }
}


/*
=========================================================
MARK AS DISPATCHED
=========================================================

PACKAGING
    ↓
DISPATCHED
=========================================================
*/

async function markDispatched(
    finishedGoodsId
) {

    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        /*
        -------------------------------------------------
        LOCK FINISHED GOODS RECORD
        -------------------------------------------------
        */

        const [
            finishedGoodsRows
        ] =
            await connection.query(
                `
                SELECT
                    id,
                    order_id,
                    status

                FROM finished_goods

                WHERE id = ?

                FOR UPDATE
                `,
                [
                    finishedGoodsId
                ]
            );


        if (
            finishedGoodsRows.length === 0
        ) {

            throw new Error(
                "Finished goods record not found"
            );

        }


        const finishedGoods =
            finishedGoodsRows[0];


        /*
        -------------------------------------------------
        ONLY PACKAGING CAN BE DISPATCHED
        -------------------------------------------------
        */

        if (
            finishedGoods.status !==
            "PACKAGING"
        ) {

            throw new Error(
                `Cannot dispatch finished goods with status ${finishedGoods.status}`
            );

        }


        /*
        -------------------------------------------------
        UPDATE FINISHED GOODS
        -------------------------------------------------
        */

        await connection.query(
            `
            UPDATE finished_goods

            SET
                status = 'DISPATCHED',
                dispatched_at = CURRENT_TIMESTAMP

            WHERE id = ?
            `,
            [
                finishedGoodsId
            ]
        );


        /*
        -------------------------------------------------
        UPDATE MAIN ORDER
        -------------------------------------------------
        */

        await connection.query(
            `
            UPDATE orders

            SET
                status = 'DISPATCHED',
                updated_at = CURRENT_TIMESTAMP

            WHERE id = ?
            `,
            [
                finishedGoods.order_id
            ]
        );


        await connection.commit();


        return {

            success: true,

            finishedGoodsId,

            status:
                "DISPATCHED",

            message:
                "Finished goods marked as dispatched successfully"

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
MARK AS COMPLETED
=========================================================

DISPATCHED
    ↓
COMPLETED
=========================================================
*/

async function markCompleted(
    finishedGoodsId
) {

    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        /*
        -------------------------------------------------
        LOCK FINISHED GOODS RECORD
        -------------------------------------------------
        */

        const [
            finishedGoodsRows
        ] =
            await connection.query(
                `
                SELECT
                    id,
                    order_id,
                    status

                FROM finished_goods

                WHERE id = ?

                FOR UPDATE
                `,
                [
                    finishedGoodsId
                ]
            );


        if (
            finishedGoodsRows.length === 0
        ) {

            throw new Error(
                "Finished goods record not found"
            );

        }


        const finishedGoods =
            finishedGoodsRows[0];


        /*
        -------------------------------------------------
        ONLY DISPATCHED CAN BE COMPLETED
        -------------------------------------------------
        */

        if (
            finishedGoods.status !==
            "DISPATCHED"
        ) {

            throw new Error(
                `Cannot complete finished goods with status ${finishedGoods.status}`
            );

        }


        /*
        -------------------------------------------------
        UPDATE FINISHED GOODS
        -------------------------------------------------
        */

        await connection.query(
            `
            UPDATE finished_goods

            SET
                status = 'COMPLETED',
                completed_at = CURRENT_TIMESTAMP

            WHERE id = ?
            `,
            [
                finishedGoodsId
            ]
        );


        /*
        -------------------------------------------------
        UPDATE MAIN ORDER
        -------------------------------------------------
        */

        await connection.query(
            `
            UPDATE orders

            SET
                status = 'COMPLETED',
                updated_at = CURRENT_TIMESTAMP

            WHERE id = ?
            `,
            [
                finishedGoods.order_id
            ]
        );


        await connection.commit();


        return {

            success: true,

            finishedGoodsId,

            status:
                "COMPLETED",

            message:
                "Finished goods marked as completed successfully"

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
EXPORTS
=========================================================
*/

module.exports = {

    getFinishedGoods,

    getFinishedGood,

    createFinishedGood,

    markDispatched,

    markCompleted,

};