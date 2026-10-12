const service = require("./component.service");

async function list(req, res) {
    try {
        res.json(await service.listComponents());
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch components"
        });
    }
}

module.exports = { list };
