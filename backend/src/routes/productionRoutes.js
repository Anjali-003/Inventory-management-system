const express = require("express");

const {
    getProductionOrders,
    completeProduction,
    updateProductionProgress
} = require("../services/productionService");

const router = express.Router();


/*
=========================================================
GET ALL PRODUCTION ORDERS
=========================================================
*/
router.get("/", async (req, res) => {

    try {

        const productionOrders =
            await getProductionOrders();


        res.json(
            productionOrders
        );

    } catch (error) {

        console.error(error);


        res.status(500).json({

            message:
                "Failed to fetch production orders"

        });

    }

});


/*
=========================================================
UPDATE PRODUCTION PROGRESS
=========================================================

Example request:

POST /api/production/5/update-progress

Body:

{
    "quantity": 10
}

Meaning:

10 newly completed products.
*/
router.post(
    "/:id/update-progress",
    async (req, res) => {

        try {

            const productionId =
                Number(req.params.id);


            if (
                !Number.isInteger(
                    productionId
                ) ||
                productionId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid production ID"

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
                        "Quantity must be a positive integer"

                });

            }


            /*
                Temporary single-admin setup.
            */
            const userId = 1;


            const result =
                await updateProductionProgress(
                    productionId,
                    quantity,
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

                    message:
                        error.message

                });

            }


            if (
                error.message ===
                "Production is not currently in progress"
            ) {

                return res.status(409).json({

                    message:
                        error.message

                });

            }


            if (
                error.message.startsWith(
                    "Cannot complete more than"
                )
            ) {

                return res.status(409).json({

                    message:
                        error.message

                });

            }


            if (
                error.message.includes(
                    "Inventory"
                ) ||
                error.message.includes(
                    "Reserved inventory"
                ) ||
                error.message.includes(
                    "On-hand inventory"
                )
            ) {

                return res.status(409).json({

                    message:
                        error.message

                });

            }


            res.status(500).json({

                message:
                    "Failed to update production"

            });

        }

    }
);


/*
=========================================================
OLD COMPLETE ENDPOINT
=========================================================

This is kept so old frontend/API calls
do not immediately break.
*/
router.post(
    "/:id/complete",
    async (req, res) => {

        try {

            const productionId =
                Number(req.params.id);


            if (
                !Number.isInteger(
                    productionId
                ) ||
                productionId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid production ID"

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

                    message:
                        error.message

                });

            }


            if (
                error.message ===
                    "Production is not currently in progress" ||

                error.message ===
                    "No products are currently waiting to be completed"
            ) {

                return res.status(409).json({

                    message:
                        error.message

                });

            }


            res.status(500).json({

                message:
                    "Failed to complete production"

            });

        }

    }
);


module.exports = router;