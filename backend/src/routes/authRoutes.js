const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");

const router = express.Router();


/*
    ADMIN LOGIN
*/
router.post("/login", async (req, res) => {

    try {

        const { email, password } = req.body;


        /*
            Basic validation
        */
        if (!email || !password) {

            return res.status(400).json({
                message: "Email and password are required"
            });

        }


        /*
            Find the user in MySQL
        */
        const [users] = await db.query(
            `
            SELECT
                id,
                name,
                email,
                password_hash,
                role

            FROM users

            WHERE email = ?
            LIMIT 1
            `,
            [email]
        );


        /*
            Don't reveal whether the
            email exists or not.
        */
        if (users.length === 0) {

            return res.status(401).json({
                message: "Invalid email or password"
            });

        }


        const user = users[0];


        /*
            Make sure this is an Admin
        */
        if (user.role !== "ADMIN") {

            return res.status(403).json({
                message: "Access denied"
            });

        }


        /*
            Compare the password entered by
            the user with the bcrypt hash
            stored in MySQL.
        */
        console.log("EMAIL:", user.email);
        console.log("PASSWORD ENTERED:", password);
        console.log("HASH FROM DB:", user.password_hash);
        const passwordMatches =
            await bcrypt.compare(
                password,
                user.password_hash
            );


        if (!passwordMatches) {

            return res.status(401).json({
                message: "Invalid email or password"
            });

        }


        /*
            Create JWT
        */
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role
            },

            process.env.JWT_SECRET,

            {
                expiresIn:
                    process.env.JWT_EXPIRES_IN || "1d"
            }
        );


        /*
            Store JWT in HttpOnly cookie.

            React cannot directly access this cookie.
            The browser sends it automatically
            with API requests.
        */
        res.cookie(
            "access_token",
            token,
            {
                httpOnly: true,
                secure: false,
                sameSite: "lax",
                maxAge: 24 * 60 * 60 * 1000
            }
        );


        /*
            Send user information back.
            Never send password_hash.
        */
        res.json({

            message: "Login successful",

            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }

        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Login failed"
        });

    }

});


/*
    CHECK CURRENT LOGIN
*/
router.get("/me", async (req, res) => {

    try {

        const token =
            req.cookies.access_token;


        if (!token) {

            return res.status(401).json({
                message: "Not authenticated"
            });

        }


        const decoded =
            jwt.verify(
                token,
                process.env.JWT_SECRET
            );


        const [users] = await db.query(
            `
            SELECT
                id,
                name,
                email,
                role

            FROM users

            WHERE id = ?

            LIMIT 1
            `,
            [decoded.userId]
        );


        if (users.length === 0) {

            return res.status(401).json({
                message: "User not found"
            });

        }


        res.json({
            user: users[0]
        });


    } catch (error) {

        console.error(error);

        return res.status(401).json({
            message: "Not authenticated"
        });

    }

});


/*
    LOGOUT
*/
router.post("/logout", (req, res) => {

    res.clearCookie(
        "access_token",
        {
            httpOnly: true,
            secure: false,
            sameSite: "lax"
        }
    );


    res.json({
        message: "Logout successful"
    });

});


module.exports = router;