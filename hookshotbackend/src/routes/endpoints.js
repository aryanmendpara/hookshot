const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/endpointController");

// Wiring only, like routes/auth.js. Every route is behind `auth`, so the
// controller can rely on req.user.id existing.
const router = express.Router();

router.post("/", auth, controller.create);
router.get("/", auth, controller.list);
router.patch("/:id", auth, controller.update);
router.delete("/:id", auth, controller.destroy);

module.exports = router;