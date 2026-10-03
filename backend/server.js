
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
const qualityControlRoutes =
    require("./src/routes/qualityControlRoutes");


const app = express();

const authRoutes =
    require("./src/routes/authRoutes");


/*
    The React page can be opened as http://localhost:5173 on this PC, or as
    http://<this-PC-LAN-IP>:5173 from a phone / another PC on the same Wi-Fi.
    Cookies need an exact origin (not "*"), so allow localhost and private-network
    addresses on the Vite port. Put CLIENT_ORIGIN in .env to allow one more origin.
*/
const LAN_ORIGIN =
    /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173$/;

app.use(
    cors({
        origin: (origin, callback) => {
            const allowed =
                !origin ||
                LAN_ORIGIN.test(origin) ||
                origin === process.env.CLIENT_ORIGIN;
            callback(null, allowed ? origin : false);
        },
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
    "/api/quality-control",
    qualityControlRoutes
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

