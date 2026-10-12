const service = require("./super-admin.service");
const AppError = require("../../shared/AppError");

function handle(fn) {
    return async (req, res) => {
        try {
            await fn(req, res);
        } catch (error) {
            if (error instanceof AppError) return res.status(error.status).json({ message: error.message });
            console.error(error);
            res.status(500).json({ message: "Something went wrong" });
        }
    };
}

const list = handle(async (req, res) => res.json(await service.list()));

const create = handle(async (req, res) =>
    res.status(201).json(await service.create(req.body, req.user.userId))
);

const update = handle(async (req, res) => {
    const { name, email, password } = req.body || {};
    res.json(await service.update(Number(req.params.id), { name, email, password }));
});

const setActive = (active) =>
    handle(async (req, res) =>
        res.json(await service.setActive(Number(req.params.id), active, req.user.userId))
    );

module.exports = { list, create, update, activate: setActive(true), deactivate: setActive(false) };
