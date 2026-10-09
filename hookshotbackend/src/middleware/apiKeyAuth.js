const User = require("../models/User");
const { isRevoked } = require("../utils/revokedUsers");

// Resolves the caller's identity from the X-Hookshot-Key header, which is the
// credential a DEVELOPER'S backend holds — as opposed to the session cookie a
// logged-in human holds. The two are genuinely different callers: a machine
// pushing "invoice.paid" has no browser and no session, so requiring a JWT here
// would mean every integrator had to log in through the dashboard first.
//
// Sets exactly the same req.user shape as auth.js ({ id }), so no controller
// downstream can tell which credential got it here and none of them had to change.
// auth.js remains the only reader of sessions; this is the only reader of the key.

// Resolves the caller's identity from the X-Hookshot-Key header, which is the
// credential a DEVELOPER'S backend holds — as opposed to the session cookie a
// logged-in human holds. The two are genuinely different callers: a machine
// pushing "invoice.paid" has no browser and no session, so requiring a JWT here
// would mean every integrator had to log in through the dashboard first.
//
// Sets exactly the same req.user shape as auth.js ({ id }), so no controller
// downstream can tell which credential got it here and none of them had to change.

async function apiKeyAuth(req, res, next) {
  // Header names are case-insensitive on the wire (RFC 9110 §5.1) and Node
  // lowercases them on arrival, so this accepts x-hookshot-key too.
  const key = (req.get("X-Hookshot-Key") ?? "").trim();

  // Named separately from the "no such key" answer below, and that is the only
  // thing the two cases distinguish. A sender who forgot the header has a
  // misconfiguration worth naming; a key that doesn't match must be
  // indistinguishable from a key of the wrong format, so every no-match reason
  // collapses into one identical response.
  if (!key) return res.status(401).json({ error: "X-Hookshot-Key header is required." });

  let user;
  try {
    // try/catch rather than .catch(() => null) for two reasons. Express 4 does
    // not catch a rejected promise from an async handler, so an unhandled Mongo
    // error here would escape and take the process down. And a failed lookup
    // must surface as a 500, not a 401 — reporting a database outage as "invalid
    // API key" tells the sender its credentials are wrong, which is both false
    // and something it will not retry.
    //
    // apiKey is `select: false` on the schema, which constrains the projection
    // only — the filter is unaffected, and the unique index on apiKey serves it.
    user = await User.findOne({ apiKey: key });
  } catch (err) {
    return next(err);
  }

  // isRevoked is the same in-memory lookup auth.js uses, folded into the same
  // single condition as the "did we find anyone" test rather than given its own
  // branch. A revoked account is therefore refused by exactly the code path an
  // unknown key is refused by: same status, same body, nothing to tell them
  // apart, and no second copy of the revocation rule to drift.
  if (!user || isRevoked(user._id)) {
    return res.status(401).json({ error: "Invalid API key." });
  }

  // Identical to what auth.js attaches — a STRING, not the ObjectId that came out
  // of the query. That is not cosmetic: `user._id` is a fresh ObjectId instance on
  // every request, and the rate limiter keys on req.user.id with a plain Map. Map
  // compares object keys by reference, so every request landed in its own bucket
  // and the events limit silently stopped applying — 23 posts, all 201.
  //
  // String() also makes the two middlewares produce genuinely interchangeable
  // values, which is the property everything downstream (controllers, the limiter,
  // the tests) is entitled to assume. Mongoose casts the string back to an
  // ObjectId for any query that wants one.
  req.user = { id: String(user._id) };
  next();
}

module.exports = apiKeyAuth;
