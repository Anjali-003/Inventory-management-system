const express = require("express");

const db = require("../config/db");


const {
    checkMaterialAvailability
} = require("../services/materialRequirementService");


const {
    startProduction,
    getProductionInfo,
    checkProductionMaterials
} = require("../services/productionService");


const router = express.Router();


/*
=========================================================
GET ALL ORDERS
=========================================================
*/
router.get("/", async (req, res) => {

    try {

        const [rows] =
            await db.query(
                `
                SELECT
                    o.id,
                    o.order_number,
                    o.status,
                    o.created_at,

                    oi.product_id,

                    p.name AS product_name,

                    oi.quantity

                FROM orders o

                JOIN order_items oi
                    ON o.id = oi.order_id

                JOIN products p
                    ON oi.product_id = p.id

                ORDER BY o.id DESC
                `
            );


        res.json(rows);

    } catch (error) {

        console.error(error);


        res.status(500).json({

            message:
                "Failed to fetch orders"

        });

    }

});


/*
=========================================================
GET SINGLE ORDER
=========================================================
*/
router.get("/:id", async (req, res) => {

    try {

        const orderId =
            Number(req.params.id);


        if (
            !Number.isInteger(orderId) ||
            orderId <= 0
        ) {

            return res.status(400).json({

                message:
                    "Invalid order ID"

            });

        }


        const [rows] =
            await db.query(
                `
                SELECT
                    o.id AS order_id,
                    o.order_number,
                    o.status,
                    o.created_at,

                    oi.product_id,

                    p.sku AS product_sku,
                    p.name AS product_name,

                    oi.quantity

                FROM orders o

                JOIN order_items oi
                    ON o.id = oi.order_id

                JOIN products p
                    ON oi.product_id = p.id

                WHERE o.id = ?
                `,
                [orderId]
            );


        if (rows.length === 0) {

            return res.status(404).json({

                message:
                    "Order not found"

            });

        }


        res.json({

            orderId:
                rows[0].order_id,

            orderNumber:
                rows[0].order_number,

            status:
                rows[0].status,

            createdAt:
                rows[0].created_at,

            items:
                rows.map(
                    (row) => ({

                        productId:
                            row.product_id,

                        productSku:
                            row.product_sku,

                        productName:
                            row.product_name,

                        quantity:
                            row.quantity

                    })
                )

        });

    } catch (error) {

        console.error(error);


        res.status(500).json({

            message:
                "Failed to fetch order"

        });

    }

});


/*
=========================================================
CREATE ORDER
=========================================================
*/
router.post("/", async (req, res) => {

    const connection =
        await db.getConnection();


    try {

        const { items } =
            req.body;


        if (
            !items ||
            !Array.isArray(items) ||
            items.length === 0
        ) {

            return res.status(400).json({

                message:
                    "Order must contain at least one item"

            });

        }


        for (
            const item
            of items
        ) {

            if (
                !item.productId ||
                !item.quantity ||
                item.quantity <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Each item needs a valid productId and quantity"

                });

            }

        }


        await connection.beginTransaction();


        /*
            Temporary order number.

            We first insert the order because
            we need the MySQL-generated ID for
            the sequence number.
        */
        const temporaryOrderNumber =
            `TEMP-${Date.now()}`;


        const [orderResult] =
            await connection.query(
                `
                INSERT INTO orders
                (
                    order_number,
                    status
                )

                VALUES
                (
                    ?,
                    'PENDING'
                )
                `,
                [temporaryOrderNumber]
            );


        const orderId =
            orderResult.insertId;


        /*
            Date
        */
        const now =
            new Date();


        const year =
            now.getFullYear();


        const month =
            String(
                now.getMonth() + 1
            ).padStart(2, "0");


        const day =
            String(
                now.getDate()
            ).padStart(2, "0");


        /*
            Normal 24-hour format:

            00 = midnight
            01 = 1 AM
            ...
            23 = 11 PM
        */
        const hour =
            String(
                now.getHours()
            ).padStart(2, "0");


        /*
            Sequence:

            1   -> 001
            2   -> 002
            10  -> 010
            100 -> 100
        */
        const sequenceNumber =
            String(orderId)
                .padStart(3, "0");


        /*
            Final format:

            ORD-20260929-15-001
        */
        const orderNumber =
            `ORD-${year}${month}${day}-${hour}-${sequenceNumber}`;


        await connection.query(
            `
            UPDATE orders

            SET
                order_number = ?

            WHERE id = ?
            `,
            [
                orderNumber,
                orderId
            ]
        );


        /*
            Create order items.
        */
        for (
            const item
            of items
        ) {

            await connection.query(
                `
                INSERT INTO order_items
                (
                    order_id,
                    product_id,
                    quantity
                )

                VALUES
                (
                    ?,
                    ?,
                    ?
                )
                `,
                [
                    orderId,
                    item.productId,
                    item.quantity
                ]
            );

        }


        await connection.commit();


        res.status(201).json({

            message:
                "Order created successfully",

            orderId,

            orderNumber,

            status:
                "PENDING"

        });

    } catch (error) {

        await connection.rollback();

        console.error(error);


        res.status(500).json({

            message:
                "Failed to create order"

        });

    } finally {

        connection.release();

    }

});


/*
=========================================================
CHECK FULL ORDER MATERIAL AVAILABILITY
=========================================================

This remains your old material check.

It checks the complete order quantity.
*/
router.get(
    "/:id/material-check",
    async (req, res) => {

        try {

            const orderId =
                Number(req.params.id);


            if (
                !Number.isInteger(orderId) ||
                orderId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid order ID"

                });

            }


            const result =
                await checkMaterialAvailability(
                    orderId
                );


            res.json(result);


        } catch (error) {

            console.error(error);


            if (
                error.message ===
                "Order not found"
            ) {

                return res.status(404).json({

                    message:
                        "Order not found"

                });

            }


            if (
                error.message ===
                "Order has no products or BOM data"
            ) {

                return res.status(400).json({

                    message:
                        error.message

                });

            }


            res.status(500).json({

                message:
                    "Failed to check material availability"

            });

        }

    }
);


/*
=========================================================
GET PARTIAL PRODUCTION INFORMATION
=========================================================

Example:

GET /api/orders/15/production-info

Returns:

Ordered = 100
Started = 30
Completed = 10
In production = 20
Remaining to start = 70
Maximum from inventory = 55
*/
router.get(
    "/:id/production-info",
    async (req, res) => {

        try {

            const orderId =
                Number(req.params.id);


            if (
                !Number.isInteger(orderId) ||
                orderId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid order ID"

                });

            }


            const result =
                await getProductionInfo(
                    orderId
                );


            res.json(result);


        } catch (error) {

            console.error(error);


            if (
                error.message ===
                "Order not found"
            ) {

                return res.status(404).json({

                    message:
                        error.message

                });

            }


            if (
                error.message ===
                    "Order has no products or BOM data" ||

                error.message ===
                    "Partial production currently supports one product per order"
            ) {

                return res.status(400).json({

                    message:
                        error.message

                });

            }


            res.status(500).json({

                message:
                    "Failed to get production information"

            });

        }

    }
);


/*
=========================================================
CHECK MATERIALS FOR PARTIAL QUANTITY
=========================================================

Example:

GET /api/orders/15/production-check?quantity=20
*/
router.get(
    "/:id/production-check",
    async (req, res) => {

        try {

            const orderId =
                Number(req.params.id);


            const quantity =
                Number(
                    req.query.quantity
                );


            if (
                !Number.isInteger(orderId) ||
                orderId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid order ID"

                });

            }


            if (
                !Number.isInteger(quantity) ||
                quantity <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Quantity must be a positive integer"

                });

            }


            const result =
                await checkProductionMaterials(
                    orderId,
                    quantity
                );


            res.json(result);


        } catch (error) {

            console.error(error);


            if (
                error.message ===
                "Order not found"
            ) {

                return res.status(404).json({

                    message:
                        error.message

                });

            }


            if (
                error.message.startsWith(
                    "Requested quantity exceeds"
                )
            ) {

                return res.status(409).json({

                    message:
                        error.message

                });

            }


            if (
                error.message ===
                    "Order has no products or BOM data" ||

                error.message ===
                    "Partial production currently supports one product per order"
            ) {

                return res.status(400).json({

                    message:
                        error.message

                });

            }


            res.status(500).json({

                message:
                    "Failed to check partial production materials"

            });

        }

    }
);


/*
=========================================================
START PARTIAL PRODUCTION
=========================================================

Body:

{
    "quantity": 20
}
*/
router.post(
    "/:id/start-production",
    async (req, res) => {

        try {

            const orderId =
                Number(req.params.id);


            if (
                !Number.isInteger(orderId) ||
                orderId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid order ID"

                });

            }


            const quantity =
                Number(
                    req.body?.quantity
                );


            if (
                !Number.isInteger(quantity) ||
                quantity <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Production quantity must be a positive integer"

                });

            }


            /*
                Temporary single-admin setup.
            */
            const userId = 1;


            const result =
                await startProduction(
                    orderId,
                    quantity,
                    userId
                );


            /*
                Material shortage returns
                success:false rather than throwing.
            */
            if (!result.success) {

                return res.status(409).json(
                    result
                );

            }


            res.status(200).json(
                result
            );


        } catch (error) {

            console.error(error);


            if (
                error.message ===
                "Order not found"
            ) {

                return res.status(404).json({

                    message:
                        error.message

                });

            }


            if (
                error.message ===
                    "Order is already completed" ||

                error.message.startsWith(
                    "Requested quantity exceeds"
                )
            ) {

                return res.status(409).json({

                    message:
                        error.message

                });

            }


            if (
                error.message ===
                    "Order has no products or BOM data" ||

                error.message ===
                    "Partial production currently supports one product per order"
            ) {

                return res.status(400).json({

                    message:
                        error.message

                });

            }


            res.status(500).json({

                message:
                    "Failed to start production"

            });

        }

    }
);


module.exports = router;