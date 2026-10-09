# 04 — Caching and Invalidation (Postman)

**What this tests:** the cache in front of `getActiveEndpoints(userId)`, the lookup that decides which endpoints an event is addressed to. It is cache-aside: check the cache, on a miss ask MongoDB, store the answer for 5 minutes.

The behaviour that matters most is freshness: after a user changes an endpoint, the very next event must reflect it. A stale cache would send events to a deactivated or deleted endpoint.

**Collection folder used:** `04 Caching and invalidation`. Run `00 Setup` first (it creates users A and B).

---

## What Postman can and cannot show

| Question | Visible in Postman? |
|---|---|
| Does an event reflect endpoint changes immediately? | **Yes**, through `endpointIds` in each response |
| How many database queries ran, and how many cache hits and misses? | **No**. That is counted inside the server. `node scripts/test-caching.mjs` measures real MongoDB `find` commands |

So this guide proves the cache is **correct** (never stale). The script proves it is **effective** (one query, then none).

---

## Steps

Every event is sent as user A with `X-Hookshot-Key: {{apiKeyA}}` and a fresh `Idempotency-Key`.

| # | Request | Expected | What it proves |
|---|---|---|---|
| — | Log in as A | **200** | Session for the endpoint routes |
| 4.1 | Create endpoint X | **201** | A new active endpoint exists. Creating it invalidates the cache |
| 4.2 | Send event | **201**, `endpointIds` **includes** X | The next event sees the new endpoint |
| 4.3 | `PATCH` X → `active: false` | **200**, `active: false` | Update invalidates the cache |
| 4.4 | Send event | **201**, `endpointIds` **does not include** X | A stale cache would still list X |
| 4.5 | `PATCH` X → `active: true` | **200** | |
| 4.6 | Send event | **201**, `endpointIds` **includes** X again | Reactivation is also picked up |
| 4.7 | `DELETE` X | **200**, `{ ok: true, id }` | Delete invalidates the cache |
| 4.8 | Send event | **201**, `endpointIds` **does not include** X | A deleted endpoint receives nothing |

If the cache were never invalidated, 4.4 and 4.8 would fail, because the 5-minute-old list from 4.2 would still be served.

---

## Why each step is a cache event

| Step | Cache state before | What happens |
|---|---|---|
| 4.1 | maybe warm from earlier events | `cache.del` after the create succeeds |
| 4.2 | empty | **miss** → query MongoDB → store for 5 minutes |
| 4.3 | warm | `cache.del` after the patch succeeds |
| 4.4 | empty | **miss** → fresh query → X is excluded |
| 4.5 to 4.8 | same pattern | each mutation clears the entry, the next event misses and reloads |

---

## Manual checks

**1. The TTL backstop (changes the API cannot see).** Invalidation only fires for changes made *through the API*. A change made directly in the database is invisible to the server until the entry expires (5 minutes).

1. Create an endpoint through the API (4.1), then send an event (it is included and the list is now cached).
2. In `mongosh`, deactivate it behind the server's back:
   ```js
   db.endpoints.updateOne({ _id: ObjectId("<endpointIdX>") }, { $set: { active: false } })
   ```
3. Send another event immediately → `endpointIds` **still includes** it. This is the cache serving the stored list, as designed.
4. Wait 5 minutes (or restart the server, which empties the cache) and send again → it is gone.

**2. A failed update does not flush the cache.** Send `PATCH /api/endpoints/not-an-object-id` (404) between two events. The cache entry survives, because invalidation only happens after a *successful* write.

**3. Users are isolated.** Each user has their own key (`endpoints:<userId>`). Changing user A's endpoints never evicts user B's cached list.

**4. A user with no endpoints is cached too.** User B has none. Their events return `endpointIds: []`, and that empty list is stored as a real cached answer, so B does not query MongoDB on every event.

---

## What is not cached

`GET /api/endpoints` always queries MongoDB. It returns inactive endpoints as well, so it is a different query from "active endpoints only", and a cache built for one would serve the wrong data for the other.

---

## Status codes

| Case | Code |
|---|---|
| Event sent | 201 |
| Endpoint create | 201 |
| Endpoint update / delete (own endpoint) | 200 |
| Malformed or unknown endpoint id | 404 |
