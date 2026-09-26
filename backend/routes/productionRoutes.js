const express = require("express");

const {
    getProductionOrders,
    completeProduction
} = require("../services/productionService");

const router = express.Router();


/*
    GET ALL PRODUCTION ORDERS
*/
router.get("/", async (req, res) => {

    try {

        const productionOrders =
            await getProductionOrders();

        res.json(productionOrders);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Failed to fetch production orders"
        });

    }

});


/*
    COMPLETE PRODUCTION
*/
router.post("/:id/complete", async (req, res) => {

    try {

        const productionId =
            Number(req.params.id);


        if (
            !Number.isInteger(productionId) ||
            productionId <= 0
        ) {

            return res.status(400).json({
                message: "Invalid production ID"
            });

        }


        const userId = 1;


        const result =
            await completeProduction(
                productionId,
                userId
            );


        res.json(result);


    } catch (error) {

        console.error(error);


        if (
            error.message ===
            "Production order not found"
        ) {

            return res.status(404).json({
                message: error.message
            });

        }


        if (
            error.message ===
            "Production is not currently in progress"
        ) {

            return res.status(409).json({
                message: error.message
            });

        }


        res.status(500).json({
            message: "Failed to complete production"
        });

    }

});


module.exports = router;