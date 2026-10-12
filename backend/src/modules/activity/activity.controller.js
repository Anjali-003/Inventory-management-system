const service = require("./activity.service");

async function list(req, res) {
    try {
        res.json(await service.list({ limit: req.query.limit }));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Could not load activity" });
    }
}

module.exports = { list };
