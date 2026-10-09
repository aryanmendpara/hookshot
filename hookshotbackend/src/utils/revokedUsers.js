const { SESSION_MAX_AGE_MS } = require("./jwt");

// Deletes the data an account owns, but does not invalidate the JWT it was
// holding. `auth` verifies the signature and nothing else, so that token kept
// authenticating until it expired — up to seven days of a deleted user reading
// and creating rows.
//
// The obvious fix is to look the user up on every request. That is the wrong fix
// here: it puts MongoDB back on the hot path of every authenticated call, which is
// exactly what the caching step measures. So instead of asking the database, we
// remember the deletions in memory and ask this.
//
// userId -> the instant its revocation stops mattering.
//
// Storing that expiry rather than a bare Set is what keeps the map self-limiting:
// once the longest token that could reference the id has expired, the entry is
// dead weight and is dropped on the next read. A plain Set would need a trusted
// user to be deleted before a crafted signup/delete loop could grow it, and
// nothing would ever reclaim it.
//
// ponytail: per-process, like the cache. A second instance would not know about
// deletions handled here, and a restart forgets them all — so a deleted user's
// token works again if the process bounces before it expires. Publishing this set
// (Redis) is the fix when there is more than one node. Fine for single-node, which
// is what this runs on.
const revoked = new Map();

// Reuses the session length rather than inventing a second number. A revocation
// that outlives every token it could revoke is meaningless state.
const HORIZON_MS = SESSION_MAX_AGE_MS;

// Called once per account deletion. Not String()-normalised against a user id that
// happens to stringify differently — Mongoose ids and JWT payload ids are both the
// same 24-char hex, so String() here and String() in isRevoked agree.
function revoke(userId) {
  revoked.set(String(userId), Date.now() + HORIZON_MS);
}

// Runs on every authenticated request, so it is one Map.get and one comparison.
// Returning false for an unknown id is the common path and costs one lookup.
function isRevoked(userId) {
  const expires = revoked.get(String(userId));
  if (expires === undefined) return false;

  if (Date.now() >= expires) {
    revoked.delete(String(userId));
    return false;
  }
  return true;
}

module.exports = { revoke, isRevoked };