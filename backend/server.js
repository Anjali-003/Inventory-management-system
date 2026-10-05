const express = require("express");

const cors = require("cors");

require("dotenv").config();

const cookieParser = require("cookie-parser");

const db = require("./src/config/db");

const authMiddleware =
    require("./middleware/authMiddleware");


/*
=========================================================
ROUTES
=========================================================
*/

const authRoutes =
    require("./src/routes/authRoutes");

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

const finishedGoodsRoutes =
    require("./src/routes/finishedGoodsRoutes");


/*
=========================================================
CREATE EXPRESS APP
=========================================================
*/

const app = express();


/*
=========================================================
CORS
=========================================================

The React page can be opened as:

http://localhost:5173

or:

http://<this-PC-LAN-IP>:5173

from another device on the same Wi-Fi.

Cookies need an exact origin, so allow localhost
and private-network addresses on the Vite port.

CLIENT_ORIGIN can be used to allow one additional origin.
=========================================================
*/

const LAN_ORIGIN =
    /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173$/;


app.use(
    cors({

        origin: (origin, callback) => {

            const allowed =
                !origin ||
                LAN_ORIGIN.test(origin) ||
                origin === process.env.CLIENT_ORIGIN;


            callback(
                null,
                allowed
                    ? origin
                    : false
            );

        },

        credentials: true

    })
);


/*
=========================================================
MIDDLEWARE
=========================================================
*/

app.use(
    express.json()
);

app.use(
    cookieParser()
);


/*
=========================================================
AUTH ROUTES
=========================================================

These routes are public because the user needs
to be able to log in before authentication exists.
=========================================================
*/

app.use(
    "/api/auth",
    authRoutes
);


/*
=========================================================
ROOT TEST ROUTE
=========================================================
*/

app.get(
    "/",
    (req, res) =>
        res.send(
            "Server is running"
        )
);


/*
=========================================================
PORT
=========================================================
*/

const PORT =
    process.env.PORT || 5000;


/*
=========================================================
PRODUCT ROUTES
=========================================================
*/

app.use(
    "/api/products",
    authMiddleware,
    productRoutes
);


/*
=========================================================
COMPONENT ROUTES
=========================================================
*/

app.use(
    "/api/components",
    authMiddleware,
    componentRoutes
);


/*
=========================================================
INVENTORY ROUTES
=========================================================
*/

app.use(
    "/api/inventory",
    authMiddleware,
    inventoryRoutes
);


/*
=========================================================
ORDER ROUTES
=========================================================
*/

app.use(
    "/api/orders",
    authMiddleware,
    orderRoutes
);


/*
=========================================================
PRODUCTION ROUTES
=========================================================
*/

app.use(
    "/api/production",
    authMiddleware,
    productionRoutes
);


/*
=========================================================
QUALITY CONTROL ROUTES
=========================================================
*/

app.use(
    "/api/quality-control",
    authMiddleware,
    qualityControlRoutes
);


/*
=========================================================
FINISHED GOODS ROUTES
=========================================================

Workflow:

QC PASS
   ↓
Finished Goods
   ↓
PACKAGING
   ↓
DISPATCHED
   ↓
COMPLETED
=========================================================
*/

app.use(
    "/api/finished-goods",
    authMiddleware,
    finishedGoodsRoutes
);


/*
=========================================================
EMPLOYEE ROUTES
=========================================================
*/

app.use(
    "/api/employees",
    authMiddleware,
    employeeRoutes
);


/*
=========================================================
ATTENDANCE ROUTES
=========================================================
*/

app.use(
    "/api/attendance",
    authMiddleware,
    attendanceRoutes
);


/*
=========================================================
FUTURE INVENTORY INTELLIGENCE ROUTES
=========================================================
*/

// app.use(
//     "/api/intelligence",
//     authMiddleware,
//     inventoryIntelligenceRoutes
// );


/*
=========================================================
START SERVER
=========================================================
*/

app.listen(
    PORT,
    () =>
        console.log(
            `Server running on port ${PORT}`
        )
);


/*
=========================================================
OPTIONAL DATABASE CONNECTION TEST
=========================================================
*/

// async function testDatabaseConnection() {

//     try {

//         const connection =
//             await db.getConnection();

//         console.log(
//             "MySQL connected successfully"
//         );

//         connection.release();

//     } catch (error) {

//         console.error(
//             "MySQL connection failed:",
//             error.message
//         );

//     }

// }

// testDatabaseConnection();