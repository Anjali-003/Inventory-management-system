const service = require("./super-admin.service");
const asyncHandler = require("../../middleware/asyncHandler");

const handler = (fn) => asyncHandler(fn, { message: "Something went wrong" });

const list = handler(async (req, res) => res.json(await service.list()));

const create = handler(async (req, res) =>
    res.status(201).json(await service.create(req.body, req.user.userId))
);

const update = handler(async (req, res) => {
    const { name, email, password } = req.body || {};
    res.json(await service.update(Number(req.params.id), { name, email, password }));
});

const setActive = (active) =>
    handler(async (req, res) =>
        res.json(await service.setActive(Number(req.params.id), active, req.user.userId))
    );

module.exports = { list, create, update, activate: setActive(true), deactivate: setActive(false) };
