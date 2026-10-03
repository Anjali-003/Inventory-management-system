const db = require("../config/db");


/*
=========================================================
GET PRODUCTION ORDER
=========================================================
*/
async function getProductionOrder(
    connection,
    productionId
) {

    const [rows] =
        await connection.query(
            `
            SELECT
                po.id,
                po.order_id,
                po.status,
                po.quantity_to_produce,
                po.quantity_completed,

                o.order_number,

                oi.product_id,
                oi.quantity AS ordered_quantity,

                p.sku AS product_sku,
                p.name AS product_name

            FROM production_orders po

            JOIN orders o
                ON po.order_id = o.id

            JOIN order_items oi
                ON o.id = oi.order_id

            JOIN products p
                ON oi.product_id = p.id

            WHERE po.id = ?

            ORDER BY oi.id

            LIMIT 1
            `,
            [productionId]
        );


    if (rows.length === 0) {

        throw new Error(
            "Production order not found"
        );

    }


    return rows[0];
}


/*
=========================================================
GET TESTING SUMMARY
=========================================================
*/
async function getTestingSummary(
    connection,
    productionId
) {

    const production =
        await getProductionOrder(
            connection,
            productionId
        );


    const [rows] =
        await connection.query(
            `
            SELECT

                COALESCE(
                    SUM(quantity_tested),
                    0
                ) AS quantity_tested,

                COALESCE(
                    SUM(quantity_passed),
                    0
                ) AS quantity_passed,

                COALESCE(
                    SUM(quantity_failed),
                    0
                ) AS quantity_failed

            FROM testing_records

            WHERE production_id = ?
            `,
            [productionId]
        );


    const quantityTested =
        Number(
            rows[0].quantity_tested
        );


    const quantityPassed =
        Number(
            rows[0].quantity_passed
        );


    const quantityFailed =
        Number(
            rows[0].quantity_failed
        );


    const produced =
        Number(
            production.quantity_completed
        );


    const remainingToTest =
        Math.max(
            0,
            produced - quantityTested
        );


    return {

        produced,

        quantityTested,

        quantityPassed,

        quantityFailed,

        remainingToTest,

    };
}


/*
=========================================================
GET QUALITY CONTROL SUMMARY
=========================================================
*/
async function getQualityControlSummary(
    connection,
    productionId
) {

    const [rows] =
        await connection.query(
            `
            SELECT

                COALESCE(
                    SUM(quantity_inspected),
                    0
                ) AS quantity_inspected,

                COALESCE(
                    SUM(quantity_approved),
                    0
                ) AS quantity_approved,

                COALESCE(
                    SUM(quantity_rejected),
                    0
                ) AS quantity_rejected

            FROM quality_control_records

            WHERE production_id = ?
            `,
            [productionId]
        );


    const quantityInspected =
        Number(
            rows[0].quantity_inspected
        );


    const quantityApproved =
        Number(
            rows[0].quantity_approved
        );


    const quantityRejected =
        Number(
            rows[0].quantity_rejected
        );


    /*
        Only products that passed testing
        can move to QC.
    */
    const testingSummary =
        await getTestingSummary(
            connection,
            productionId
        );


    const availableForQC =
        Math.max(
            0,
            testingSummary.quantityPassed -
            quantityInspected
        );


    return {

        quantityInspected,

        quantityApproved,

        quantityRejected,

        availableForQC,

    };
}


/*
=========================================================
GET QUALITY CONTROL INFORMATION
=========================================================
*/
async function getQualityControlInfo(
    productionId
) {

    const connection =
        await db.getConnection();


    try {

        const production =
            await getProductionOrder(
                connection,
                productionId
            );


        const testing =
            await getTestingSummary(
                connection,
                productionId
            );


        const qualityControl =
            await getQualityControlSummary(
                connection,
                productionId
            );


        /*
            Get latest testing record.
        */
        const [
            testingRows
        ] =
            await connection.query(
                `
                SELECT
                    id,
                    quantity_tested,
                    quantity_passed,
                    quantity_failed,
                    overall_result,
                    remarks,
                    tested_by,
                    tested_at

                FROM testing_records

                WHERE production_id = ?

                ORDER BY id DESC

                LIMIT 1
                `,
                [productionId]
            );


        /*
            Get latest QC record.
        */
        const [
            qcRows
        ] =
            await connection.query(
                `
                SELECT
                    id,
                    quantity_inspected,
                    quantity_approved,
                    quantity_rejected,
                    overall_result,
                    remarks,
                    checked_by,
                    checked_at

                FROM quality_control_records

                WHERE production_id = ?

                ORDER BY id DESC

                LIMIT 1
                `,
                [productionId]
            );


        return {

            success: true,

            production: {

                id:
                    production.id,

                orderId:
                    production.order_id,

                orderNumber:
                    production.order_number,

                productId:
                    production.product_id,

                productSku:
                    production.product_sku,

                productName:
                    production.product_name,

                orderedQuantity:
                    Number(
                        production.ordered_quantity
                    ),

                quantityCompleted:
                    Number(
                        production.quantity_completed
                    ),

                status:
                    production.status,

            },

            testing,

            qualityControl,

            latestTesting:
                testingRows.length > 0
                    ? testingRows[0]
                    : null,

            latestQualityControl:
                qcRows.length > 0
                    ? qcRows[0]
                    : null,

        };

    } finally {

        connection.release();

    }
}


/*
=========================================================
SAVE TESTING RESULT
=========================================================

For V1:

PASS:
    quantity_passed = quantity
    quantity_failed = 0

FAIL:
    quantity_passed = 0
    quantity_failed = quantity
=========================================================
*/
async function saveTestingResult(
    productionId,
    quantity,
    overallResult,
    remarks,
    userId = 1
) {

    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        /*
            Make sure production exists.
        */
        const production =
            await getProductionOrder(
                connection,
                productionId
            );


        /*
            Quantity validation.
        */
        if (
            !Number.isInteger(
                quantity
            ) ||
            quantity <= 0
        ) {

            throw new Error(
                "Testing quantity must be a positive integer"
            );

        }


        /*
            Only PASS or FAIL for Testing.
        */
        if (
            overallResult !== "PASS" &&
            overallResult !== "FAIL"
        ) {

            throw new Error(
                "Overall testing result must be PASS or FAIL"
            );

        }


        /*
            Find previously tested quantity.
        */
        const testingSummary =
            await getTestingSummary(
                connection,
                productionId
            );


        /*
            Cannot test more products than
            have actually been produced.
        */
        if (
            quantity >
            testingSummary.remainingToTest
        ) {

            throw new Error(

                `Cannot test more than the remaining untested quantity. Remaining: ${testingSummary.remainingToTest}`

            );

        }


        let quantityPassed = 0;

        let quantityFailed = 0;


        if (
            overallResult ===
            "PASS"
        ) {

            quantityPassed =
                quantity;

        } else {

            quantityFailed =
                quantity;

        }


        /*
            Save ONLY the final result
            and quantity information.

            Individual test checkboxes
            are NOT saved yet.
        */
        const [result] =
            await connection.query(
                `
                INSERT INTO testing_records
                (
                    production_id,
                    quantity_tested,
                    quantity_passed,
                    quantity_failed,
                    overall_result,
                    remarks,
                    tested_by
                )

                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                )
                `,
                [
                    production.id,

                    quantity,

                    quantityPassed,

                    quantityFailed,

                    overallResult,

                    remarks || null,

                    userId
                ]
            );


        await connection.commit();


        return {

            success: true,

            testingId:
                result.insertId,

            productionId,

            quantityTested:
                quantity,

            quantityPassed,

            quantityFailed,

            overallResult,

            message:
                "Testing result saved successfully"

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
SAVE QUALITY CONTROL RESULT
=========================================================

PASS:
    approved = quantity
    rejected = 0

FAIL:
    approved = 0
    rejected = quantity

HOLD:
    approved = 0
    rejected = 0
=========================================================
*/
async function saveQualityControlResult(
    productionId,
    quantity,
    overallResult,
    remarks,
    userId = 1
) {

    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        /*
            Make sure production exists.
        */
        const production =
            await getProductionOrder(
                connection,
                productionId
            );


        /*
            Quantity validation.
        */
        if (
            !Number.isInteger(
                quantity
            ) ||
            quantity <= 0
        ) {

            throw new Error(
                "QC quantity must be a positive integer"
            );

        }


        /*
            QC allows PASS, FAIL, HOLD.
        */
        if (
            overallResult !== "PASS" &&
            overallResult !== "FAIL" &&
            overallResult !== "HOLD"
        ) {

            throw new Error(
                "Overall QC result must be PASS, FAIL or HOLD"
            );

        }


        /*
            Get testing information.
        */
        const testingSummary =
            await getTestingSummary(
                connection,
                productionId
            );


        /*
            Get QC information.
        */
        const qcSummary =
            await getQualityControlSummary(
                connection,
                productionId
            );


        /*
            Only testing-passed products
            can enter QC.
        */
        if (
            quantity >
            qcSummary.availableForQC
        ) {

            throw new Error(

                `Cannot inspect more than the quantity available for QC. Available: ${qcSummary.availableForQC}`

            );

        }


        let quantityApproved = 0;

        let quantityRejected = 0;


        if (
            overallResult ===
            "PASS"
        ) {

            quantityApproved =
                quantity;

        }


        if (
            overallResult ===
            "FAIL"
        ) {

            quantityRejected =
                quantity;

        }


        /*
            HOLD:
            neither approved nor rejected.
        */
        const [result] =
            await connection.query(
                `
                INSERT INTO quality_control_records
                (
                    production_id,
                    quantity_inspected,
                    quantity_approved,
                    quantity_rejected,
                    overall_result,
                    remarks,
                    checked_by
                )

                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                )
                `,
                [
                    production.id,

                    quantity,

                    quantityApproved,

                    quantityRejected,

                    overallResult,

                    remarks || null,

                    userId
                ]
            );


        await connection.commit();


        return {

            success: true,

            qualityControlId:
                result.insertId,

            productionId,

            quantityInspected:
                quantity,

            quantityApproved,

            quantityRejected,

            overallResult,

            message:
                "Quality control result saved successfully"

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
GET ALL PRODUCTION ORDERS FOR QUALITY CONTROL
=========================================================
*/
async function getQualityControlOrders() {

    const connection =
        await db.getConnection();


    try {

        const [
            productionRows
        ] =
            await connection.query(
                `
                SELECT

                    po.id,

                    po.order_id,

                    po.status,

                    po.quantity_to_produce,
                    po.quantity_completed,

                    po.started_at,
                    po.completed_at,

                    o.order_number,

                    oi.quantity
                        AS ordered_quantity,

                    p.name
                        AS product_name,

                    p.sku
                        AS product_sku

                FROM production_orders po

                JOIN orders o
                    ON po.order_id = o.id

                JOIN order_items oi
                    ON o.id = oi.order_id

                JOIN products p
                    ON oi.product_id = p.id

                WHERE
                    po.quantity_completed > 0

                ORDER BY
                    po.id DESC
                `
            );


        const result = [];


        for (
            const production
            of productionRows
        ) {

            const testing =
                await getTestingSummary(
                    connection,
                    production.id
                );


            const qualityControl =
                await getQualityControlSummary(
                    connection,
                    production.id
                );


            result.push({

                id:
                    production.id,

                orderId:
                    production.order_id,

                orderNumber:
                    production.order_number,

                productName:
                    production.product_name,

                productSku:
                    production.product_sku,

                orderedQuantity:
                    Number(
                        production.ordered_quantity
                    ),

                quantityCompleted:
                    Number(
                        production.quantity_completed
                    ),

                quantityTested:
                    testing.quantityTested,

                quantityPassed:
                    testing.quantityPassed,

                quantityFailed:
                    testing.quantityFailed,

                remainingToTest:
                    testing.remainingToTest,

                quantityInspected:
                    qualityControl.quantityInspected,

                quantityApproved:
                    qualityControl.quantityApproved,

                quantityRejected:
                    qualityControl.quantityRejected,

                availableForQC:
                    qualityControl.availableForQC,

                status:
                    production.status,

                startedAt:
                    production.started_at,

                completedAt:
                    production.completed_at,

            });

        }


        return result;

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

    getQualityControlOrders,

    getQualityControlInfo,

    saveTestingResult,

    saveQualityControlResult,

};