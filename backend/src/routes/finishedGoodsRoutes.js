const express = require("express");

const {
    getFinishedGoods,
    getFinishedGood,
    markDispatched,
    markCompleted,
} = require("../services/finishedGoodsService");


const router = express.Router();


/*
=========================================================
GET ALL FINISHED GOODS
=========================================================

GET /api/finished-goods

Returns:

PACKAGING
DISPATCHED
COMPLETED
=========================================================
*/

router.get(
    "/",
    async (req, res) => {

        try {

            const result =
                await getFinishedGoods();


            res.status(200).json(
                result
            );

        } catch (error) {

            console.error(
                "Failed to get finished goods:",
                error
            );


            res.status(500).json({

                message:
                    "Failed to fetch finished goods"

            });

        }

    }
);


/*
=========================================================
GET SINGLE FINISHED GOODS RECORD
=========================================================

GET /api/finished-goods/:id
=========================================================
*/

router.get(
    "/:id",
    async (req, res) => {

        try {

            const finishedGoodsId =
                Number(
                    req.params.id
                );


            /*
            -------------------------------------------------
            VALIDATE ID
            -------------------------------------------------
            */

            if (
                !Number.isInteger(
                    finishedGoodsId
                ) ||
                finishedGoodsId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid finished goods ID"

                });

            }


            /*
            -------------------------------------------------
            GET RECORD
            -------------------------------------------------
            */

            const result =
                await getFinishedGood(
                    finishedGoodsId
                );


            res.status(200).json(
                result
            );

        } catch (error) {

            console.error(
                "Failed to get finished goods record:",
                error
            );


            /*
            -------------------------------------------------
            NOT FOUND
            -------------------------------------------------
            */

            if (
                error.message ===
                "Finished goods record not found"
            ) {

                return res.status(404).json({

                    message:
                        error.message

                });

            }


            /*
            -------------------------------------------------
            GENERIC ERROR
            -------------------------------------------------
            */

            res.status(500).json({

                message:
                    "Failed to fetch finished goods record"

            });

        }

    }
);


/*
=========================================================
MARK FINISHED GOODS AS DISPATCHED
=========================================================

POST /api/finished-goods/:id/dispatch

Workflow:

PACKAGING
    ↓
DISPATCHED
=========================================================
*/

router.post(
    "/:id/dispatch",
    async (req, res) => {

        try {

            const finishedGoodsId =
                Number(
                    req.params.id
                );


            /*
            -------------------------------------------------
            VALIDATE ID
            -------------------------------------------------
            */

            if (
                !Number.isInteger(
                    finishedGoodsId
                ) ||
                finishedGoodsId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid finished goods ID"

                });

            }


            /*
            -------------------------------------------------
            MARK DISPATCHED
            -------------------------------------------------
            */

            const result =
                await markDispatched(
                    finishedGoodsId
                );


            res.status(200).json(
                result
            );

        } catch (error) {

            console.error(
                "Failed to mark finished goods as dispatched:",
                error
            );


            /*
            -------------------------------------------------
            RECORD NOT FOUND
            -------------------------------------------------
            */

            if (
                error.message ===
                "Finished goods record not found"
            ) {

                return res.status(404).json({

                    message:
                        error.message

                });

            }


            /*
            -------------------------------------------------
            INVALID STATUS TRANSITION
            -------------------------------------------------

            Example:

            COMPLETED → DISPATCHED

            DISPATCHED → DISPATCHED

            PACKAGING → DISPATCHED is the only valid
            transition here.
            -------------------------------------------------
            */

            if (
                error.message.startsWith(
                    "Cannot dispatch finished goods with status"
                )
            ) {

                return res.status(409).json({

                    message:
                        error.message

                });

            }


            /*
            -------------------------------------------------
            GENERIC ERROR
            -------------------------------------------------
            */

            res.status(500).json({

                message:
                    "Failed to mark finished goods as dispatched"

            });

        }

    }
);


/*
=========================================================
MARK FINISHED GOODS AS COMPLETED
=========================================================

POST /api/finished-goods/:id/complete

Workflow:

DISPATCHED
    ↓
COMPLETED
=========================================================
*/

router.post(
    "/:id/complete",
    async (req, res) => {

        try {

            const finishedGoodsId =
                Number(
                    req.params.id
                );


            /*
            -------------------------------------------------
            VALIDATE ID
            -------------------------------------------------
            */

            if (
                !Number.isInteger(
                    finishedGoodsId
                ) ||
                finishedGoodsId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid finished goods ID"

                });

            }


            /*
            -------------------------------------------------
            MARK COMPLETED
            -------------------------------------------------
            */

            const result =
                await markCompleted(
                    finishedGoodsId
                );


            res.status(200).json(
                result
            );

        } catch (error) {

            console.error(
                "Failed to mark finished goods as completed:",
                error
            );


            /*
            -------------------------------------------------
            RECORD NOT FOUND
            -------------------------------------------------
            */

            if (
                error.message ===
                "Finished goods record not found"
            ) {

                return res.status(404).json({

                    message:
                        error.message

                });

            }


            /*
            -------------------------------------------------
            INVALID STATUS TRANSITION
            -------------------------------------------------

            Only:

            DISPATCHED → COMPLETED

            is allowed.
            -------------------------------------------------
            */

            if (
                error.message.startsWith(
                    "Cannot complete finished goods with status"
                )
            ) {

                return res.status(409).json({

                    message:
                        error.message

                });

            }


            /*
            -------------------------------------------------
            GENERIC ERROR
            -------------------------------------------------
            */

            res.status(500).json({

                message:
                    "Failed to mark finished goods as completed"

            });

        }

    }
);


/*
=========================================================
EXPORT ROUTER
=========================================================
*/

module.exports = router;