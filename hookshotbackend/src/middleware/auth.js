const { verifyToken } = require("../utils/jwt");
const { COOKIE_NAME, parse } = require("../utils/cookies");
const { isRevoked } = require("../utils/revokedUsers");

// Resolves the caller's identity from the session cookie set at login, falling
// back to an Authorization header so curl, Postman and scripts still work.
//
// Missing, malformed, invalid and expired tokens all produce the same 401, so
// the endpoint can't be used to probe which tokens are "real".
//
// Deliberately does NOT hit the database: this runs on every request, and the
// assignment's caching step measures query counts. Account deletion is the one
// case a signature check cannot cover, so it is handled by an in-memory revoked-id
// lookup instead — see utils/revokedUsers.js. The cost that remains is that a
// stolen token for a LIVE account stays valid until it expires, since nothing here
// can tell a theft from the legitimate owner.
function auth(req, res, next) {
  const cookieToken = parse(req.headers.cookie)[COOKIE_NAME];

  // RFC 7235: the auth-scheme token is case-insensitive, so "bearer" counts.
  const [scheme, ...rest] = (req.headers.authorization || "").split(" ");
  const headerToken = scheme?.toLowerCase() === "bearer" ? rest.join(" ").trim() : "";

  const payload = (cookieToken || headerToken) ? verifyToken(cookieToken || headerToken) : null;

  // isRevoked is an in-memory map lookup, not a database call — that is the whole
  // point of utils/revokedUsers.js. It is folded into the same condition as the
  // signature check rather than given its own branch, so a revoked account is
  // refused by exactly the same code path as a forged token: same status, same
  // body, nothing observable to tell the two apart.
  if (!payload?.id || isRevoked(payload.id)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Controllers read req.user.id and nothing else — never an id from the body.
  req.user = { id: payload.id };
  next();
}

module.exports = auth;