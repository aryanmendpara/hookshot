const Endpoint = require("../models/Endpoint");
const cache = require("./cache");

// Five minutes. Long enough that a chatty integration sending a burst of events
// pays for one query instead of fifty, short enough that a change made outside
// this API (a Compass edit, a support fix) does not keep serving stale data for
// the rest of the day.
//
// The cache is invalidated explicitly on every endpoint mutation, so this TTL is
// only a backstop for changes this process did not make.
const TTL_MS = Number(process.env.ENDPOINT_CACHE_TTL_MS) || 5 * 60 * 1000;

// Exported so invalidation can never drift from the read path. Four separate
// `endpoints:${userId}` string literals would eventually disagree, and a
// mismatch is silent: reads keep working, writes just quietly stop invalidating.
const keyFor = (userId) => `endpoints:${userId}`;

// Which of this user's endpoints should receive a new event: the active ones.
// Cache-aside — check the cache, and only fall through to Mongo on a miss.
//
// Deliberately NOT used by GET /api/endpoints: that route returns inactive
// endpoints too, so it is a different query and caching it here would mean
// serving a list that quietly omits paused endpoints.
async function getActiveEndpoints(userId) {
  const key = keyFor(userId);
  const cached = cache.get(key);

  // `!== undefined` rather than a truthiness check, so a cached empty array is
  // served as a hit. A user with no active endpoints is the case most worth
  // caching: without this they would query Mongo on every single event.
  if (cached !== undefined) return cached;

  // .lean() returns plain objects instead of hydrated Mongoose documents.
  // Documents carry internal mutable state and are tied to the session that
  // created them, so holding them in a long-lived cache is asking for trouble.
  // The caller only reads `_id`, and lean keeps that an ObjectId.
  const active = await Endpoint.find({ userId, active: true }).lean();

  cache.set(key, active, TTL_MS);
  return active;
}

// Call after any successful endpoint create/update/delete. Without this the next
// event would fan out to the endpoint the user just deactivated.
function invalidateEndpoints(userId) {
  cache.del(keyFor(userId));
}

module.exports = { getActiveEndpoints, invalidateEndpoints, TTL_MS };