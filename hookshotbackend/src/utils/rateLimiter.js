// Fixed-window request limiter. Pure logic — no Express, no database, no clock
// beyond Date.now — so it can be unit tested without starting the server.
//
// Fixed window means each key gets an allowance of `limit` requests that resets
// all at once when the window closes. The alternative (sliding window) is fairer
// at the boundary but costs far more bookkeeping; for a webhook API this is the
// right trade.

function createLimiter({ limit, windowMs }) {
  // key -> { windowStart, count }
  const hits = new Map();

  // Is a plain Map read-then-write safe here?
  //
  // Yes, and specifically because check() is SYNCHRONOUS and contains no await.
  // Node runs one JavaScript task to completion before another begins, so nothing
  // can observe the gap between the hits.get() above and the hits.set() below —
  // there is no interleaving point. Ten requests arriving in the same tick
  // therefore queue and each sees the previous one's increment.
  //
  // The moment this stopped being safe is the moment an `await` was added between
  // the read and the write (e.g. `await db.something()` to fetch a user's plan).
  // At that point every concurrent caller would read the same pre-increment
  // count and all N would be allowed. Keep this function await-free.
  function check(key) {
    const now = Date.now();
    const entry = hits.get(key);

    // No entry yet, or the window this entry belongs to has closed. Either way
    // the caller is the first of a new window.
    //
    // >= rather than >: a window is exactly windowMs long, so at now - start ===
    // windowMs it has fully elapsed and must reset.
    if (entry === undefined || now - entry.windowStart >= windowMs) {
      hits.set(key, { windowStart: now, count: 1 });
      return { allowed: true };
    }

    entry.count += 1;

    if (entry.count > limit) {
      // Seconds left until the window resets, rounded UP. Rounding down would
      // hand a client "retry in 0s" while it is still blocked, which turns one
      // 429 into a tight retry loop.
      const msRemaining = entry.windowStart + windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.ceil(msRemaining / 1000) };
    }

    return { allowed: true };
  }

  // ponytail: the Map is never swept. Every distinct key that is ever seen leaves
  // an entry behind forever, so an attacker rotating fake emails against the
  // login limiter can grow this without bound — that is a memory-exhaustion
  // vector, not just a leak. Two fixes when it matters: delete the entry when a
  // window closes (lazily, inside check(), for the key being checked), or sweep
  // expired entries on an interval. Both are a few lines; neither is worth
  // carrying until the process is actually exposed to untrusted traffic.
  return { check };
}

module.exports = { createLimiter };
