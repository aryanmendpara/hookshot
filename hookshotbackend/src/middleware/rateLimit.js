// Turns a limiter instance into Express middleware. Kept separate from
// rateLimiter.js so that file stays free of any HTTP concern and can be unit
// tested on its own.
//
// The caller supplies keyFn because the right key differs per route: login is
// throttled by IP + email, events by user id. Hard-coding either here would tie
// this to one route.

module.exports = function rateLimit(limiter, keyFn) {
  return function rateLimitMiddleware(req, res, next) {
    const result = limiter.check(keyFn(req));

    if (!result.allowed) {
      // Retry-After is seconds, per RFC 9110. Clients and proxies are allowed to
      // read it and back off on their own, which is the difference between a
      // well-behaved client and a retry storm.
      res.set("Retry-After", String(result.retryAfterSeconds));
      return res.status(429).json({
        error: `Too many requests. Try again in ${result.retryAfterSeconds}s.`,
      });
    }

    next();
  };
};
