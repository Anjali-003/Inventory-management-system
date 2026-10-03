const express = require("express");

const {
    getQualityControlOrders,
    getQualityControlInfo,
    saveTestingResult,
    saveQualityControlResult,
} = require("../services/qualityControlService");


const router =
    express.Router();


/*
=========================================================
GET ALL QUALITY CONTROL ORDERS
=========================================================

GET /api/quality-control
=========================================================
*/
router.get(
    "/",
    async (req, res) => {

        try {

            const result =
                await getQualityControlOrders();


            res.json(
                result
            );

        } catch (error) {

            console.error(
                error
            );


            res.status(500).json({

                message:
                    "Failed to fetch quality control orders",

            });

        }

    }
);


/*
=========================================================
GET ONE PRODUCTION ORDER'S TESTING + QC DATA
=========================================================

GET /api/quality-control/:productionId
=========================================================
*/
router.get(
    "/:productionId",
    async (req, res) => {

        try {

            const productionId =
                Number(
                    req.params.productionId
                );


            if (
                !Number.isInteger(
                    productionId
                ) ||
                productionId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid production ID",

                });

            }


            const result =
                await getQualityControlInfo(
                    productionId
                );


            res.json(
                result
            );

        } catch (error) {

            console.error(
                error
            );


            if (
                error.message ===
                "Production order not found"
            ) {

                return res.status(404).json({

                    message:
                        error.message,

                });

            }


            res.status(500).json({

                message:
                    "Failed to fetch quality control information",

            });

        }

    }
);


/*
=========================================================
SAVE TESTING RESULT
=========================================================

POST /api/quality-control/:productionId/testing

Body:

{
    "quantity": 5,
    "overallResult": "PASS",
    "remarks": "All tests passed"
}
=========================================================
*/
router.post(
    "/:productionId/testing",
    async (req, res) => {

        try {

            const productionId =
                Number(
                    req.params.productionId
                );


            if (
                !Number.isInteger(
                    productionId
                ) ||
                productionId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid production ID",

                });

            }


            const quantity =
                Number(
                    req.body?.quantity
                );


            const overallResult =
                req.body?.overallResult;


            const remarks =
                req.body?.remarks;


            /*
                Temporary single Admin.
            */
            const userId =
                1;


            const result =
                await saveTestingResult(

                    productionId,

                    quantity,

                    overallResult,

                    remarks,

                    userId

                );


            res.status(201).json(
                result
            );

        } catch (error) {

            console.error(
                error
            );


            if (
                error.message.includes(
                    "positive integer"
                ) ||

                error.message.includes(
                    "PASS or FAIL"
                )
            ) {

                return res.status(400).json({

                    message:
                        error.message,

                });

            }


            if (
                error.message.includes(
                    "remaining untested quantity"
                )
            ) {

                return res.status(409).json({

                    message:
                        error.message,

                });

            }


            if (
                error.message ===
                "Production order not found"
            ) {

                return res.status(404).json({

                    message:
                        error.message,

                });

            }


            res.status(500).json({

                message:
                    "Failed to save testing result",

            });

        }

    }
);


/*
=========================================================
SAVE QUALITY CONTROL RESULT
=========================================================

POST /api/quality-control/:productionId/qc

Body:

{
    "quantity": 5,
    "overallResult": "PASS",
    "remarks": "Final inspection passed"
}
=========================================================
*/
router.post(
    "/:productionId/qc",
    async (req, res) => {

        try {

            const productionId =
                Number(
                    req.params.productionId
                );


            if (
                !Number.isInteger(
                    productionId
                ) ||
                productionId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid production ID",

                });

            }


            const quantity =
                Number(
                    req.body?.quantity
                );


            const overallResult =
                req.body?.overallResult;


            const remarks =
                req.body?.remarks;


            /*
                Temporary single Admin.
            */
            const userId =
                1;


            const result =
                await saveQualityControlResult(

                    productionId,

                    quantity,

                    overallResult,

                    remarks,

                    userId

                );


            res.status(201).json(
                result
            );

        } catch (error) {

            console.error(
                error
            );


            if (
                error.message.includes(
                    "positive integer"
                ) ||

                error.message.includes(
                    "PASS, FAIL or HOLD"
                )
            ) {

                return res.status(400).json({

                    message:
                        error.message,

                });

            }


            if (
                error.message.includes(
                    "available for QC"
                )
            ) {

                return res.status(409).json({

                    message:
                        error.message,

                });

            }


            if (
                error.message ===
                "Production order not found"
            ) {

                return res.status(404).json({

                    message:
                        error.message,

                });

            }


            res.status(500).json({

                message:
                    "Failed to save quality control result",

            });

        }

    }
);


module.exports =
    router;