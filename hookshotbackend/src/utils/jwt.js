const jwt = require("jsonwebtoken");

const SESSION_SECONDS = 7 * 24 * 60 * 60;

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: SESSION_SECONDS,
  });
}

// jsonwebtoken's expiresIn is SECONDS but Express's res.cookie maxAge is
// MILLISECONDS. Passing seconds straight through emits "Max-Age=604" and
// silently shortens a 7-day session to 10 minutes, so the conversion lives here
// and nowhere else.
const SESSION_MAX_AGE_MS = SESSION_SECONDS * 1000;

// Returns the decoded payload, or null for anything invalid or expired. Callers
// turn null into a 401; the reason is deliberately not distinguished.
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken, SESSION_MAX_AGE_MS };