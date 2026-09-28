const bcrypt = require("bcryptjs");

bcrypt.hash("SensationSystems@123", 10)
    .then(hash => console.log(hash));