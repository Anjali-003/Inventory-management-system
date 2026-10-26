-- A component's standard cost per piece (₹), set by the Super Admin (or the seed data). It is only a stand-in:
-- product cost and profit use the latest purchase rate of a component, and this when it was never bought with a rate.
ALTER TABLE components ADD COLUMN standard_cost DECIMAL(12,2) NULL;
