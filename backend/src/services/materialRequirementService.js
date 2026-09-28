const db = require("../config/db");

async function checkMaterialAvailability(orderId) {
    // 1. Get the order
    const [orders] = await db.query(
        `
        SELECT
            id,
            order_number,
            status
        FROM orders
        WHERE id = ?
        `,
        [orderId]
    );

    // 2. Make sure the order exists
    if (orders.length === 0) {
        throw new Error("Order not found");
    }

    const order = orders[0];

    // 3. Get all BOM + inventory information
    // for every product inside the order
    const [rows] = await db.query(
        `
        SELECT
            oi.product_id,
            p.name AS product_name,
            oi.quantity AS ordered_quantity,

            pb.component_id,
            c.sku AS component_sku,
            c.name AS component_name,
            c.unit,

            pb.quantity_required AS bom_quantity,

            COALESCE(i.quantity_on_hand, 0) AS quantity_on_hand,
            COALESCE(i.quantity_reserved, 0) AS quantity_reserved

        FROM order_items oi

        JOIN products p
            ON oi.product_id = p.id

        JOIN product_bom pb
            ON oi.product_id = pb.product_id

        JOIN components c
            ON pb.component_id = c.id

        LEFT JOIN inventory i
            ON pb.component_id = i.component_id

        WHERE oi.order_id = ?

        ORDER BY c.id
        `,
        [orderId]
    );

    // 4. Check if the order actually has products/BOM
    if (rows.length === 0) {
        throw new Error("Order has no products or BOM data");
    }

    // 5. Object where we will combine
    // requirements for shared components
    const materialMap = {};

    // 6. Go through every BOM row
    for (const row of rows) {

        // Convert database values into numbers
        const orderedQuantity = Number(row.ordered_quantity);
        const bomQuantity = Number(row.bom_quantity);

        // Required = Order Quantity × BOM Quantity
        const requiredQuantity =
            orderedQuantity * bomQuantity;

        // Available = On Hand - Reserved
        const availableQuantity =
            Number(row.quantity_on_hand) -
            Number(row.quantity_reserved);

        const componentId = row.component_id;

        // 7. If this component hasn't been seen yet,
        // create an entry for it
        if (!materialMap[componentId]) {
            materialMap[componentId] = {
                componentId: componentId,
                sku: row.component_sku,
                name: row.component_name,
                unit: row.unit,
                required: 0,
                available: availableQuantity
            };
        }

        // 8. Add this row's requirement
        // to the component's total requirement
        materialMap[componentId].required += requiredQuantity;
    }

    // 9. Convert our object into an array
    const materials = Object.values(materialMap);

    // 10. Calculate shortage/status for each component
    for (const material of materials) {

        if (material.available < material.required) {

            material.shortage =
                material.required - material.available;

            material.status = "INSUFFICIENT";

        } else {

            material.shortage = 0;

            material.status = "SUFFICIENT";
        }
    }

    // 11. Check whether ANY component is insufficient
    const shortages = materials.filter(
        material => material.status === "INSUFFICIENT"
    );

    const canProduce = shortages.length === 0;

    // 12. Return final result
    return {
        orderId: order.id,
        orderNumber: order.order_number,
        canProduce: canProduce,
        status: canProduce
            ? "READY_FOR_PRODUCTION"
            : "MATERIAL_SHORTAGE",
        materials: materials,
        shortages: shortages
    };
}

module.exports = {
    checkMaterialAvailability
};