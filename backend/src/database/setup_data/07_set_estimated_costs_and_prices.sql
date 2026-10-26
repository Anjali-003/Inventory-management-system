-- =====================================================================
-- 07_set_estimated_costs_and_prices.sql
--
-- ESTIMATED figures so the money screens work from day one (they are NOT real prices):
--   * components.standard_cost : rough per-piece cost in INR, by component type and size
--   * products.selling_price   : the product's BOM cost at these costs x 1.4, rounded to Rs 10; GST 18%
--
-- Replace them with the real figures as soon as they are known: Super Admin sets a product's price on
-- Products & BOM ("Set price") and a component's cost on Component Stock (open the component).
-- Once a component is bought with a rate, that real rate is used instead of its standard cost.
-- Only these two columns change; it is safe to run again.
-- =====================================================================

USE inventory_management;

UPDATE components SET standard_cost = CASE sku
    -- SMD resistors 1206 / 2512, shunts
    WHEN 'CMP-0001' THEN 0.10 WHEN 'CMP-0002' THEN 0.10 WHEN 'CMP-0003' THEN 0.10 WHEN 'CMP-0004' THEN 0.10
    WHEN 'CMP-0005' THEN 0.10 WHEN 'CMP-0006' THEN 0.10 WHEN 'CMP-0007' THEN 0.10 WHEN 'CMP-0008' THEN 0.10
    WHEN 'CMP-0009' THEN 0.10 WHEN 'CMP-0010' THEN 0.10 WHEN 'CMP-0011' THEN 0.50 WHEN 'CMP-0012' THEN 0.50
    WHEN 'CMP-0081' THEN 0.10 WHEN 'CMP-0082' THEN 0.10 WHEN 'CMP-0083' THEN 0.10 WHEN 'CMP-0084' THEN 0.10
    WHEN 'CMP-0085' THEN 0.10 WHEN 'CMP-0086' THEN 0.10 WHEN 'CMP-0087' THEN 0.10 WHEN 'CMP-0088' THEN 0.10
    WHEN 'CMP-0089' THEN 0.10 WHEN 'CMP-0090' THEN 0.08 WHEN 'CMP-0091' THEN 0.08 WHEN 'CMP-0092' THEN 0.08
    WHEN 'CMP-0093' THEN 0.08 WHEN 'CMP-0094' THEN 0.08
    WHEN 'CMP-0017' THEN 3.00 WHEN 'CMP-0095' THEN 4.00
    -- SMD capacitors 1206
    WHEN 'CMP-0013' THEN 0.20 WHEN 'CMP-0014' THEN 0.20 WHEN 'CMP-0015' THEN 0.20 WHEN 'CMP-0016' THEN 0.20
    WHEN 'CMP-0115' THEN 0.50 WHEN 'CMP-0116' THEN 0.20 WHEN 'CMP-0117' THEN 0.20
    -- SMD diodes, zeners, transistors, opto, ICs
    WHEN 'CMP-0018' THEN 0.30 WHEN 'CMP-0019' THEN 1.20 WHEN 'CMP-0020' THEN 0.40 WHEN 'CMP-0021' THEN 0.40
    WHEN 'CMP-0022' THEN 0.40 WHEN 'CMP-0023' THEN 0.40 WHEN 'CMP-0024' THEN 0.50 WHEN 'CMP-0025' THEN 0.50
    WHEN 'CMP-0026' THEN 2.50 WHEN 'CMP-0027' THEN 12.00 WHEN 'CMP-0096' THEN 0.20 WHEN 'CMP-0097' THEN 0.60
    WHEN 'CMP-0102' THEN 0.40 WHEN 'CMP-0104' THEN 0.40 WHEN 'CMP-0105' THEN 0.40 WHEN 'CMP-0106' THEN 0.80
    WHEN 'CMP-0114' THEN 1.50 WHEN 'CMP-0135' THEN 3.00 WHEN 'CMP-0136' THEN 12.00 WHEN 'CMP-0137' THEN 18.00
    -- through-hole diodes, bridges, regulator, TVS
    WHEN 'CMP-0028' THEN 2.50 WHEN 'CMP-0029' THEN 35.00 WHEN 'CMP-0030' THEN 18.00 WHEN 'CMP-0031' THEN 6.00
    WHEN 'CMP-0098' THEN 2.50 WHEN 'CMP-0099' THEN 2.50 WHEN 'CMP-0100' THEN 0.30 WHEN 'CMP-0101' THEN 12.00
    WHEN 'CMP-0103' THEN 1.00
    -- through-hole resistors
    WHEN 'CMP-0032' THEN 0.15 WHEN 'CMP-0033' THEN 1.20 WHEN 'CMP-0034' THEN 1.20 WHEN 'CMP-0035' THEN 2.50
    WHEN 'CMP-0107' THEN 0.15 WHEN 'CMP-0108' THEN 0.15 WHEN 'CMP-0109' THEN 0.15 WHEN 'CMP-0110' THEN 0.20
    WHEN 'CMP-0111' THEN 1.20 WHEN 'CMP-0112' THEN 1.20 WHEN 'CMP-0113' THEN 4.00
    -- ceramic, electrolytic, box / poly capacitors
    WHEN 'CMP-0036' THEN 0.80 WHEN 'CMP-0037' THEN 1.20 WHEN 'CMP-0038' THEN 3.00 WHEN 'CMP-0118' THEN 0.60
    WHEN 'CMP-0119' THEN 1.20 WHEN 'CMP-0120' THEN 3.00
    WHEN 'CMP-0039' THEN 0.80 WHEN 'CMP-0040' THEN 6.00 WHEN 'CMP-0041' THEN 45.00 WHEN 'CMP-0042' THEN 3.00
    WHEN 'CMP-0121' THEN 4.00 WHEN 'CMP-0122' THEN 6.00 WHEN 'CMP-0123' THEN 1.00 WHEN 'CMP-0124' THEN 1.00
    WHEN 'CMP-0125' THEN 28.00 WHEN 'CMP-0126' THEN 2.00 WHEN 'CMP-0127' THEN 2.50 WHEN 'CMP-0128' THEN 6.00
    WHEN 'CMP-0043' THEN 5.00 WHEN 'CMP-0129' THEN 3.00
    -- NTC, MOV, relay, LED
    WHEN 'CMP-0044' THEN 3.00 WHEN 'CMP-0045' THEN 6.00 WHEN 'CMP-0131' THEN 4.00 WHEN 'CMP-0130' THEN 18.00
    WHEN 'CMP-0132' THEN 2.00 WHEN 'CMP-0076' THEN 6.00
    -- magnetics
    WHEN 'CMP-0046' THEN 120.00 WHEN 'CMP-0133' THEN 90.00 WHEN 'CMP-0047' THEN 35.00 WHEN 'CMP-0134' THEN 12.00
    -- MOSFETs
    WHEN 'CMP-0049' THEN 45.00 WHEN 'CMP-0050' THEN 60.00 WHEN 'CMP-0140' THEN 25.00
    -- connectors, leads, fuses
    WHEN 'CMP-0048' THEN 2.00 WHEN 'CMP-0079' THEN 8.00 WHEN 'CMP-0080' THEN 1.00 WHEN 'CMP-0138' THEN 0.80
    WHEN 'CMP-0139' THEN 1.00 WHEN 'CMP-0146' THEN 12.00 WHEN 'CMP-0052' THEN 25.00 WHEN 'CMP-0053' THEN 30.00
    WHEN 'CMP-0143' THEN 35.00 WHEN 'CMP-0055' THEN 3.00 WHEN 'CMP-0145' THEN 2.00 WHEN 'CMP-0144' THEN 4.00
    -- bare PCBs
    WHEN 'CMP-0056' THEN 45.00 WHEN 'CMP-0147' THEN 40.00
    -- mechanical: heatsinks, cabinet, side plates, fan
    WHEN 'CMP-0051' THEN 35.00 WHEN 'CMP-0141' THEN 12.00 WHEN 'CMP-0142' THEN 10.00
    WHEN 'CMP-0059' THEN 120.00 WHEN 'CMP-0149' THEN 120.00 WHEN 'CMP-0060' THEN 8.00 WHEN 'CMP-0150' THEN 8.00
    WHEN 'CMP-0061' THEN 45.00
    -- small parts and consumables
    WHEN 'CMP-0054' THEN 3.00 WHEN 'CMP-0057' THEN 0.50 WHEN 'CMP-0058' THEN 2.00 WHEN 'CMP-0062' THEN 10.00
    WHEN 'CMP-0063' THEN 0.50 WHEN 'CMP-0064' THEN 1.50 WHEN 'CMP-0065' THEN 2.00 WHEN 'CMP-0066' THEN 15.00
    WHEN 'CMP-0069' THEN 0.30 WHEN 'CMP-0070' THEN 8.00 WHEN 'CMP-0071' THEN 3.00 WHEN 'CMP-0072' THEN 2.00
    WHEN 'CMP-0073' THEN 0.50 WHEN 'CMP-0074' THEN 0.40 WHEN 'CMP-0075' THEN 0.30 WHEN 'CMP-0077' THEN 0.20
    WHEN 'CMP-0078' THEN 0.30 WHEN 'CMP-0148' THEN 3.00 WHEN 'CMP-0151' THEN 0.50 WHEN 'CMP-0152' THEN 1.00
    WHEN 'CMP-0153' THEN 2.00 WHEN 'CMP-0154' THEN 0.30
    -- packing
    WHEN 'CMP-0067' THEN 12.00 WHEN 'CMP-0068' THEN 18.00
    ELSE standard_cost
END;

-- selling price = BOM cost x 1.4, rounded to Rs 10 (GST 18%)
UPDATE products p
JOIN (
    SELECT b.product_id, SUM(b.quantity_required * c.standard_cost) AS cost
    FROM product_bom b JOIN components c ON c.id = b.component_id
    GROUP BY b.product_id
) x ON x.product_id = p.id
SET p.selling_price = ROUND(x.cost * 1.4, -1),
    p.gst_percent = 18.00;

-- Check: every component has a cost, and each product's cost and price
SELECT
    (SELECT COUNT(*) FROM components WHERE standard_cost IS NULL) AS components_without_cost,
    (SELECT GROUP_CONCAT(CONCAT(sku, ' = Rs ', selling_price) SEPARATOR ', ') FROM products) AS product_prices;
