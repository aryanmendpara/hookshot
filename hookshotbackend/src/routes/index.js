const express = require("express");

// Single mount point. server.js stays free of path knowledge, so adding a
// resource is one line here plus a routes/<name>.js file.
const router = express.Router();

router.use("/auth", require("./auth"));
router.use("/account", require("./account"));
router.use("/endpoints", require("./endpoints"));
router.use("/events", require("./events"));

module.exports = router;