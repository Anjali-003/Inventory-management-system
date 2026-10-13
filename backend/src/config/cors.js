const cors = require("cors");
const env = require("./env");

/*
    The React app can be opened as http://localhost:5173 or, from another device on the same
    Wi-Fi, as http://<this-PC-LAN-IP>:5173. Cookies need an exact origin (not "*"), so we allow
    localhost and private-network addresses on the Vite port, plus one extra origin from
    CLIENT_ORIGIN (a dev tunnel or the production site).
*/
const LAN_ORIGIN = new RegExp(
    "^https?://(localhost|127\\.0\\.0\\.1|10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}):" +
        env.clientDevPort +
        "$"
);

function isAllowedOrigin(origin) {
    return !origin || LAN_ORIGIN.test(origin) || (env.clientOrigin !== "" && origin === env.clientOrigin);
}

module.exports = cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin) ? origin : false),
    credentials: true,
});
