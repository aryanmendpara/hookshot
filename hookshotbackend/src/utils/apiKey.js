const crypto = require("crypto");

// The hk_live_ prefix makes a leaked key recognisable in logs and secret
// scanners, and makes it obvious in a URL which credential it is. 32 hex chars
// = 128 bits, which is far past any brute-force concern.
function generateApiKey() {
  return `hk_live_${crypto.randomBytes(16).toString("hex")}`;
}

module.exports = { generateApiKey };