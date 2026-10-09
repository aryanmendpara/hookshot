// Cookie name for the session token, in one place so the middleware that reads
// it and the controllers that write it can't drift apart.
const COOKIE_NAME = "hookshot_token";

// Reading the cookie is the only thing we need here; writing is handled by
// Express's built-in res.cookie / res.clearCookie, so there's no reason to
// hand-roll serialization or pull in cookie-parser.
function parse(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (key) out[key] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

module.exports = { COOKIE_NAME, parse };