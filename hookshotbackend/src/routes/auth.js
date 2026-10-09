const express = require("express");
const auth = require("../middleware/auth");
const rateLimit = require("../middleware/rateLimit");
const { createLimiter } = require("../utils/rateLimiter");
const controller = require("../controllers/authController");

// 5 attempts per minute per IP+email. Chosen for brute-force resistance: at 60
// an offline-speed attacker gets 300 guesses an hour against one account, which
// is not enough to matter, while a real person who fat-fingers their password
// two or three times never sees a 429. The IP+email pairing (rather than IP
// alone) is deliberate — keying on IP alone would let one attacker lock out
// every user behind the same NAT, turning a rate limiter into a denial-of-
// service tool. The cost is that rotating the email resets the allowance, which
// is why this is one layer and not the only one.
//
// Its own instance, so login traffic and event traffic cannot consume each
// other's allowance.
const loginLimiter = createLimiter({
  limit: Number(process.env.LOGIN_RATE_LIMIT) || 5,
  windowMs: 60_000,
});

// Wiring only. Any branching, validation or database work belongs in the
// controller — this file should stay readable as a URL table.
const router = express.Router();

// The brief specifies /signup; the React frontend posts to /register. One
// controller, both paths, so neither has to change.
router.post("/signup", controller.signup);
router.post("/register", controller.signup);

// The email in the limiter key must be normalised exactly the way login
// normalises it for the database lookup. They used to disagree — this keyed on
// the raw `req.body.email` while authController did `.trim().toLowerCase()` —
// and that made the limiter trivially bypassable: VICTIM@x.com, Victim@x.com and
// victim@x.com are three buckets for one account, so an attacker cycling the case
// got an unlimited number of guesses against a 5/min limit.
//
// If the two ever drift again, the limiter stops being a limiter. One
// normalisation, matching the lookup, is the whole fix.
router.post(
  "/login",
  rateLimit(loginLimiter, (req) => `${req.ip}:${String(req.body?.email ?? "").trim().toLowerCase()}`),
  controller.login,
);

router.post("/logout", controller.logout);

router.post("/regenerate-key", auth, controller.regenerateKey);
router.patch("/password", auth, controller.changePassword);
router.get("/me", auth, controller.me);

module.exports = router;