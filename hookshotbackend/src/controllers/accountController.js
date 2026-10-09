const User = require("../models/User");
const Endpoint = require("../models/Endpoint");
const Event = require("../models/Event");
const { COOKIE_NAME } = require("../utils/cookies");
const { invalidateEndpoints } = require("../utils/endpoints");
const { revoke } = require("../utils/revokedUsers");

exports.destroy = async (req, res, next) => {
  try {
    // The user's own endpoints and events go with them, and they go FIRST.
    //
    // Leaving them behind is not untidy, it is a data leak. The endpoints and events
    // carry a userId pointing at a document that no longer exists, and nothing in
    // this codebase joins on it to notice — so they sit there indefinitely,
    // reachable by any query that forgets to scope, and counted by nobody.
    //
    // Children first so a failure here leaves a consistent database rather than an
    // account-less user with a pile of orphans. Note this alone is not what stops a
    // deleted account's token working — `revoke` below does that. Cascading is
    // about the data; revoking is about the credential.
    await Promise.all([
      Endpoint.deleteMany({ userId: req.user.id }),
      Event.deleteMany({ userId: req.user.id }),
    ]);

    await User.findByIdAndDelete(req.user.id);

    // Cascade handles the DATA; this handles the CREDENTIAL. Clearing the cookie
    // only closes the browser that asked — the same JWT replayed as a Bearer
    // header, or from a stale cookie, would otherwise keep working until it
    // expired. Checked in memory on every request, so no route needs a database
    // lookup to notice the account is gone.
    revoke(req.user.id);

    // Nothing can read this entry again, but without this it would sit in the
    // cache for the life of the process — a slow leak, one entry per deleted
    // account.
    invalidateEndpoints(req.user.id);

    // Expire the cookie too, otherwise the browser keeps presenting a token for
    // an account that no longer exists.
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};