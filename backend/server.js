const express = require('express');
const cors = require('cors');
require('dotenv').config();
const cookieParser = require("cookie-parser");
const db = require("./config/db");
const authMiddleware =
    require("./middleware/authMiddleware");
const productRoutes = require("./routes/productRoutes");
const componentRoutes = require("./routes/componentRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const orderRoutes = require("./routes/orderRoutes");
const productionRoutes =
    require("./routes/productionRoutes");


const app = express();
const authRoutes =
    require("./routes/authRoutes");
app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true
    })
);
app.use(express.json());
app.use(cookieParser());

app.use(
    "/api/auth",
    authRoutes
);



app.get('/', (req, res) => res.send('Server is running'));

const PORT = process.env.PORT || 5000;

app.use(
    "/api/products",
    authMiddleware,
    productRoutes
);
app.use(
    "/api/components",
    authMiddleware,
    componentRoutes
);
app.use(
    "/api/inventory",
    authMiddleware,
    inventoryRoutes
);
app.use(
    "/api/orders",
    authMiddleware,
    orderRoutes
);
app.use(
    "/api/production",
    authMiddleware,
    productionRoutes
);

// app.use(
//     "/api/intelligence",
//     authMiddleware,
//     inventoryIntelligenceRoutes
// );
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