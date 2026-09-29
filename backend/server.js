
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const cookieParser = require("cookie-parser");

const db = require("./src/config/db");

const authMiddleware =
    require("./middleware/authMiddleware");

const productRoutes =
    require("./src/routes/productRoutes");

const componentRoutes =
    require("./src/routes/componentRoutes");

const inventoryRoutes =
    require("./src/routes/inventoryRoutes");

const orderRoutes =
    require("./src/routes/orderRoutes");

const productionRoutes =
    require("./src/routes/productionRoutes");

const employeeRoutes =
    require("./src/routes/employeeRoutes");

const attendanceRoutes =
    require("./src/routes/attendanceRoutes");


const app = express();

const authRoutes =
    require("./src/routes/authRoutes");


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


app.get(
    "/",
    (req, res) => res.send("Server is running")
);


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

app.use(
    "/api/employees",
    authMiddleware,
    employeeRoutes
);

app.use(
    "/api/attendance",
    authMiddleware,
    attendanceRoutes
);


// app.use(
//     "/api/intelligence",
//     authMiddleware,
//     inventoryIntelligenceRoutes
// );


app.listen(
    PORT,
    () => console.log(`Server running on port ${PORT}`)
);


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

