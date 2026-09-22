const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require("./config/db");
const productRoutes = require("./routes/productRoutes");
const componentRoutes = require("./routes/componentRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const orderRoutes = require("./routes/orderRoutes");

const app = express();
app.use(cors());
app.use(express.json());


app.get('/', (req, res) => res.send('Server is running'));

const PORT = process.env.PORT || 5000;

app.use("/api/products", productRoutes);
app.use("/api/components", componentRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/orders", orderRoutes);
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// async function testDatabaseConnection() {
//   try {
//     const connection = await db.getConnection();

//     console.log("MySQL connected successfully");

//     connection.release();
//   } catch (error) {
//     console.error("MySQL connection failed:", error.message);
//   }
// }

// testDatabaseConnection();