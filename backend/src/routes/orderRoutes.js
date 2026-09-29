// const express = require("express");
// const db = require("../config/db");
// const {
//     checkMaterialAvailability
// } = require("../services/materialRequirementService");

// const router = express.Router();
// const {
//     startProduction
// } = require("../services/productionService");

// router.get("/", async (req, res) => {
//     try {
//         const [rows] = await db.query(
//             `
//             SELECT
//                 o.id,
//                 o.order_number,
//                 o.status,
//                 o.created_at,
//                 oi.product_id,
//                 p.name AS product_name,
//                 oi.quantity
//             FROM orders o
//             JOIN order_items oi
//                 ON o.id = oi.order_id
//             JOIN products p
//                 ON oi.product_id = p.id
//             ORDER BY o.id DESC
//             `
//         );

//         res.json(rows);
//     } catch (error) {
//         console.error(error);

//         res.status(500).json({
//             message: "Failed to fetch orders"
//         });
//     }
// });

// module.exports = router;

// router.get("/:id", async (req, res) => {
//     try {
//         const orderId = Number(req.params.id);

//         const [rows] = await db.query(
//             `
//             SELECT
//                 o.id AS order_id,
//                 o.order_number,
//                 o.status,
//                 o.created_at,
//                 oi.product_id,
//                 p.sku AS product_sku,
//                 p.name AS product_name,
//                 oi.quantity
//             FROM orders o
//             JOIN order_items oi
//                 ON o.id = oi.order_id
//             JOIN products p
//                 ON oi.product_id = p.id
//             WHERE o.id = ?
//             `,
//             [orderId]
//         );

//         if (rows.length === 0) {
//             return res.status(404).json({
//                 message: "Order not found"
//             });
//         }

//         res.json({
//             orderId: rows[0].order_id,
//             orderNumber: rows[0].order_number,
//             status: rows[0].status,
//             createdAt: rows[0].created_at,
//             items: rows.map(row => ({
//                 productId: row.product_id,
//                 productSku: row.product_sku,
//                 productName: row.product_name,
//                 quantity: row.quantity
//             }))
//         });

//     } catch (error) {
//         console.error(error);

//         res.status(500).json({
//             message: "Failed to fetch order"
//         });
//     }
// });

// router.post("/", async (req, res) => {
//     const connection = await db.getConnection();

//     try {
//         const { items } = req.body;

//         if (!items || !Array.isArray(items) || items.length === 0) {
//             return res.status(400).json({
//                 message: "Order must contain at least one item"
//             });
//         }

//         for (const item of items) {
//             if (!item.productId || !item.quantity || item.quantity <= 0) {
//                 return res.status(400).json({
//                     message: "Each item needs a valid productId and quantity"
//                 });
//             }
//         }

//         await connection.beginTransaction();

//         const orderNumber = `ORD-${Date.now()}`;

//         const [orderResult] = await connection.query(
//             `
//             INSERT INTO orders (order_number, status)
//             VALUES (?, 'PENDING')
//             `,
//             [orderNumber]
//         );

//         const orderId = orderResult.insertId;

//         for (const item of items) {
//             await connection.query(
//                 `
//                 INSERT INTO order_items
//                 (order_id, product_id, quantity)
//                 VALUES (?, ?, ?)
//                 `,
//                 [
//                     orderId,
//                     item.productId,
//                     item.quantity
//                 ]
//             );
//         }

//         await connection.commit();

//         res.status(201).json({
//             message: "Order created successfully",
//             orderId,
//             orderNumber,
//             status: "PENDING"
//         });

//     } catch (error) {
//         await connection.rollback();

//         console.error(error);

//         res.status(500).json({
//             message: "Failed to create order"
//         });
//     } finally {
//         connection.release();
//     }
// });

// router.get("/:id/material-check", async (req, res) => {
//     try {
//         const orderId = Number(req.params.id);

//         if (!Number.isInteger(orderId) || orderId <= 0) {
//             return res.status(400).json({
//                 message: "Invalid order ID"
//             });
//         }

//         const result =
//             await checkMaterialAvailability(orderId);

//         res.json(result);

//     } catch (error) {
//         console.error(error);

//         if (error.message === "Order not found") {
//             return res.status(404).json({
//                 message: "Order not found"
//             });
//         }

//         if (error.message === "Order has no products or BOM data") {
//             return res.status(400).json({
//                 message: error.message
//             });
//         }

//         res.status(500).json({
//             message: "Failed to check material availability"
//         });
//     }
// });

// router.post("/:id/start-production", async (req, res) => {

//     try {

//         const orderId =
//             Number(req.params.id);

//         if (
//             !Number.isInteger(orderId) ||
//             orderId <= 0
//         ) {

//             return res.status(400).json({
//                 message: "Invalid order ID"
//             });

//         }

//         const userId = 1;

//         const result =
//             await startProduction(
//                 orderId,
//                 userId
//             );

//         if (!result.success) {

//             return res.status(409).json(result);

//         }

//         res.status(200).json(result);

//     } catch (error) {

//         console.error(error);

//         if (
//             error.message ===
//             "Order not found"
//         ) {

//             return res.status(404).json({
//                 message: error.message
//             });

//         }

//         if (
//             error.message ===
//             "Production has already started" ||
//             error.message ===
//             "Order is already completed"
//         ) {

//             return res.status(409).json({
//                 message: error.message
//             });

//         }

//         res.status(500).json({
//             message: "Failed to start production"
//         });

//     }

// });

const express = require("express");
const db = require("../config/db");

const {
    checkMaterialAvailability
} = require("../services/materialRequirementService");

const {
    startProduction
} = require("../services/productionService");

const router = express.Router();


// GET ALL ORDERS
router.get("/", async (req, res) => {

    try {

        const [rows] = await db.query(
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
            message: "Failed to fetch orders"
        });

    }

});


// GET SINGLE ORDER
router.get("/:id", async (req, res) => {

    try {

        const orderId = Number(req.params.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({
                message: "Invalid order ID"
            });
        }

        const [rows] = await db.query(
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
                message: "Order not found"
            });

        }

        res.json({
            orderId: rows[0].order_id,
            orderNumber: rows[0].order_number,
            status: rows[0].status,
            createdAt: rows[0].created_at,

            items: rows.map(row => ({
                productId: row.product_id,
                productSku: row.product_sku,
                productName: row.product_name,
                quantity: row.quantity
            }))
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Failed to fetch order"
        });

    }

});


// CREATE ORDER
router.post("/", async (req, res) => {

    const connection = await db.getConnection();

    try {

        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {

            return res.status(400).json({
                message: "Order must contain at least one item"
            });

        }


        for (const item of items) {

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
            STEP 1:
            Create the order first with a temporary
            unique order number.

            We need the MySQL-generated ID because
            that ID will become the sequence number.
        */
        const temporaryOrderNumber =
            `TEMP-${Date.now()}`;


        const [orderResult] =
            await connection.query(
                `
                INSERT INTO orders
                (order_number, status)

                VALUES (?, 'PENDING')
                `,
                [temporaryOrderNumber]
            );


        /*
            MySQL automatically creates:

            1
            2
            3
            4
            ...

            We use this as the sequence number.
        */
        const orderId =
            orderResult.insertId;


        /*
            STEP 2:
            Get current date and time.
        */
        const now = new Date();


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
            getHours() returns:

            0 = midnight
            1 = 1 AM
            ...
            23 = 11 PM

            This is the normal 24-hour clock format.
        */
        const hour =
            String(
                now.getHours()
            ).padStart(2, "0");


        /*
            STEP 3:
            Convert order ID into a 3-digit sequence.

            1   → 001
            2   → 002
            10  → 010
            100 → 100
        */
        const sequenceNumber =
            String(orderId).padStart(3, "0");


        /*
            STEP 4:
            Create final order number.

            Example:

            ORD-20260929-15-001
        */
        const orderNumber =
            `ORD-${year}${month}${day}-${hour}-${sequenceNumber}`;


        /*
            STEP 5:
            Replace temporary order number
            with the final order number.
        */
        await connection.query(
            `
            UPDATE orders

            SET order_number = ?

            WHERE id = ?
            `,
            [
                orderNumber,
                orderId
            ]
        );


        /*
            STEP 6:
            Create order items.
        */
        for (const item of items) {

            await connection.query(
                `
                INSERT INTO order_items
                (order_id, product_id, quantity)

                VALUES (?, ?, ?)
                `,
                [
                    orderId,
                    item.productId,
                    item.quantity
                ]
            );

        }


        /*
            STEP 7:
            Save the transaction.
        */
        await connection.commit();


        /*
            Return the final order number
            to the frontend.
        */
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
            message: "Failed to create order"
        });

    } finally {

        connection.release();

    }

});


// CHECK MATERIAL AVAILABILITY
router.get("/:id/material-check", async (req, res) => {

    try {

        const orderId =
            Number(req.params.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {

            return res.status(400).json({
                message: "Invalid order ID"
            });

        }

        const result =
            await checkMaterialAvailability(orderId);

        res.json(result);

    } catch (error) {

        console.error(error);

        if (
            error.message ===
            "Order not found"
        ) {

            return res.status(404).json({
                message: "Order not found"
            });

        }

        if (
            error.message ===
            "Order has no products or BOM data"
        ) {

            return res.status(400).json({
                message: error.message
            });

        }

        res.status(500).json({
            message:
                "Failed to check material availability"
        });

    }

});


// START PRODUCTION
router.post("/:id/start-production", async (req, res) => {

    try {

        const orderId =
            Number(req.params.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {

            return res.status(400).json({
                message: "Invalid order ID"
            });

        }


        // Temporary single-admin setup
        const userId = 1;


        const result =
            await startProduction(
                orderId,
                userId
            );


        if (!result.success) {

            return res.status(409).json(result);

        }


        res.status(200).json(result);

    } catch (error) {

        console.error(error);


        if (
            error.message ===
            "Order not found"
        ) {

            return res.status(404).json({
                message: error.message
            });

        }


        if (
            error.message ===
            "Production has already started" ||
            error.message ===
            "Order is already completed"
        ) {

            return res.status(409).json({
                message: error.message
            });

        }


        res.status(500).json({
            message:
                "Failed to start production"
        });

    }

});


module.exports = router;