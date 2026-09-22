const express = require("express");
const db = require("../config/db");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT
                i.id,
                c.sku,
                c.name AS component_name,
                c.unit,
                i.quantity_on_hand,
                i.quantity_reserved,
                (i.quantity_on_hand - i.quantity_reserved) AS available,
                c.minimum_stock_level
            FROM inventory i
            JOIN components c
                ON i.component_id = c.id
            ORDER BY i.id
            `
        );

        res.json(rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch inventory"
        });
    }
});

module.exports = router;