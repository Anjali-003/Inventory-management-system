// This test file



// We are planning an **Electronics Production and Inventory Management System** using
//  **React for the frontend, Node.js with Express for the backend, and MySQL for the database**. 
// The main purpose of the system is to prevent production delays caused by missing electronic components. 
// The system will initially have a **single Admin user** who can manage products, components, inventory,
//  orders, and production. Each manufactured product, such as an **LED Display Module** or 
//  **Control Board**, will have a **Bill of Materials (BOM)** defining all components and 
//  quantities required to manufacture one unit. Components can be shared between different products, 
//  and every product/component will have a unique SKU. When an order is created for one or multiple 
//  products, the system will use their BOMs to calculate the total material requirements, combine 
//  requirements for shared components, and compare them against the available inventory 
//  (`On Hand - Reserved`). If any component is insufficient, the order will be marked as having a 
//  **Material Shortage**, production will be blocked, and the system will show exactly which components 
//  are missing along with the required, available, and shortage quantities. It will also support 
//  aggregated shortage information so the Admin can see what materials need to be purchased across 
//  multiple orders. Once all required components are available, the order becomes **Ready for Production**;
//   starting production will reserve the required inventory using safe MySQL transactions to prevent 
//   double allocation, move the order to **In Production**, and completing production will consume the 
//   reserved materials and mark the order as **Completed**. The system will also maintain an **inventory 
//   transaction history**, support stock receiving and adjustments, prevent negative inventory, provide 
//   minimum-stock/low-stock alerts, and include a dashboard showing pending orders, shortages, ready 
//   orders, active production, and inventory warnings. Future versions can expand this foundation with 
//   multiple users and roles, suppliers, purchase orders, multiple warehouses, BOM versioning, barcode/QR 
//   scanning, serial/batch tracking, production scheduling, forecasting, notifications, and advanced 
//   reports and analytics.
