// A minimal in-memory cache with per-entry TTL, for read-through caching.
//
// Deliberately generic — nothing here knows what it is caching. The first caller
// is getActiveEndpoints(), but the API is get/set/del so anything else that hits
// Mongo on a hot path can use it without a rewrite.
//
// ponytail: per-process, so it is per-machine. Running N instances gives each
// its own cache, and a mutation on one instance will not invalidate the others —
// that needs Redis plus a pub/sub invalidation channel. Fine for a single-node
// deployment; revisit when this is scaled out.
const store = new Map();

// Module-level, not per-key: the point is to answer "is caching working at all",
// and counting every lookup in one place keeps that a single source of truth.
const stats = { hits: 0, misses: 0 };

// Returns the value if present and still fresh. An expired entry is a miss and
// is deleted on the way past, so a key that is read but never written again
// doesn't sit in the Map forever.
function get(key) {
  const entry = store.get(key);

  if (entry === undefined) {
    stats.misses++;
    return undefined;
  }

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    stats.misses++;
    return undefined;
  }

  stats.hits++;
  return entry.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function del(key) {
  store.delete(key);
}

function getStats() {
  return { ...stats, size: store.size };
}

module.exports = { get, set, del, getStats };
