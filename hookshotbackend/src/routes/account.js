const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/accountController");

const router = express.Router();

router.delete("/", auth, controller.destroy);

module.exports = router;