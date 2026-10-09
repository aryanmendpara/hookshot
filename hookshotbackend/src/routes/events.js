const express = require("express");
const auth = require("../middleware/auth");
const apiKeyAuth = require("../middleware/apiKeyAuth");
const rateLimit = require("../middleware/rateLimit");
const { createLimiter } = require("../utils/rateLimiter");
const controller = require("../controllers/eventController");

// 20 per minute per user, i.e. one every three seconds. Much looser than login
// because this route is already behind auth — the threat model is a runaway
// client or a retry loop, not credential guessing, so the limiter is there to
// cap the damage rather than to gate access. 20/min still clears a burst of
// webhooks arriving together (a deploy finishing, a backfill running), which a
// limit of 5 would not.
// Read from the environment so the volume suites in this repo can raise it: the
// 50-cap pagination test needs 55 inserts from one user inside a few
// milliseconds, which a real 20/min limit correctly refuses. `EVENT_RATE_LIMIT=1000`
// for the test server; the default below is the shipping value.
const eventLimiter = createLimiter({
  limit: Number(process.env.EVENT_RATE_LIMIT) || 20,
  windowMs: 60_000,
});

// Wiring only, like routes/endpoints.js. Both routes are behind SOME auth
// middleware, so the controller can rely on req.user.id existing either way.
const router = express.Router();

// The limiter sits AFTER auth, deliberately: it keys on req.user.id, which only
// exists once the credential has been verified. Ahead of auth it would see
// req.user === undefined and collapse every caller into one shared bucket.
//
// The limiter is unchanged by the credential swap — it is keyed on req.user.id,
// which apiKeyAuth sets just as auth does, so the per-user bucket is identical
// whether the caller arrived with a session cookie or an API key.
router.post("/", apiKeyAuth, rateLimit(eventLimiter, (req) => req.user.id), controller.create);

// Only POST is limited. Reads are cheap, and throttling them would break the
// dashboard rather than protect anything.
router.get("/", auth, controller.list);

module.exports = router;
