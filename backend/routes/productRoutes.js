const express = require("express");
const db = require("../config/db");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM products ORDER BY id"
        );

        res.json(rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch products"
        });
    }
});

module.exports = router;

router.get("/:id", async (req, res) => {
    try {
        const productId = Number(req.params.id);

        const [rows] = await db.query(
            "SELECT * FROM products WHERE id = ?",
            [productId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch product"
        });
    }
});

router.get("/:id/bom", async (req, res) => {
    try {
        const productId = Number(req.params.id);

        const [rows] = await db.query(
            `
            SELECT
                c.id AS component_id,
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
            [productId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "BOM not found for this product"
            });
        }

        res.json(rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch BOM"
        });
    }
});