const express = require("express");
const db = require("../config/db");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM components ORDER BY id"
        );

        res.json(rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch components"
        });
    }
});

module.exports = router;