# Hookshot API

Node.js + Express + MongoDB backend for Hookshot, the webhook delivery platform.
Currently implements **auth, endpoint management, event ingestion with idempotency,
fixed-window rate limiting, and a cache-aside layer for active endpoints**. Delivery
comes in a later phase.

## Requirements

- Node.js 18+
- A MongoDB instance — local `mongod`, a Docker container, or MongoDB Atlas

## Setup

```bash
cd hookshotbackend
npm install
cp .env.example .env      # then edit .env
```

Fill in `.env`:

| Key            | Example                                                        |
| -------------- | -------------------------------------------------------------- |
| `MONGO_URI`    | `mongodb://127.0.0.1:27017/hookshot`                            |
| `JWT_SECRET`   | 48+ random bytes — see the command in `.env.example`            |
| `PORT`         | `5001`                                                          |
| `CLIENT_ORIGIN`| `http://localhost:5173` (comma-separate for more than one)      |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Run

```bash
npm run dev     # nodemon, restarts on save
npm start       # plain node
```

On boot it prints the MongoDB host it connected to and the sync'd indexes. If the
database is unreachable it logs `[fatal]` and exits non-zero rather than serving
requests with no data behind them.

> **Port 5001, not 5000.** macOS `ControlCenter` (AirPlay Receiver) already owns
> port 5000 on many machines, so the default is 5001. Change `PORT` in `.env` if
> you want something else, and update the Vite proxy target in
> `hookshotfrontend/vite.config.js` to match.

## Testing with curl

The browser path is a cookie jar, so curl needs one too:

```bash
BASE=http://localhost:5001
JAR=/tmp/hookshot.txt

# Sign up — 201, body is the user, no token. The cookie is the session.
curl -i -c $JAR -X POST $BASE/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"supersecret123"}'

# Log in — 200. -b replays the cookie, -c rewrites the jar.
curl -i -b $JAR -c $JAR -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"supersecret123"}'

# Current user — 200 { email, apiKey, apiKeyCreatedAt }
curl -i -b $JAR $BASE/api/auth/me

# Log out — clears the cookie in the jar
curl -i -b $JAR -c $JAR -X POST $BASE/api/auth/logout
```

`Authorization: Bearer <token>` also works and is easier for one-off probes —
the middleware checks the cookie first, then the header:

```bash
TOKEN=...   # decoded from the cookie's JWT payload
curl -i $BASE/api/auth/me -H "Authorization: Bearer $TOKEN"

# Rejected — 401
curl -i $BASE/api/auth/me
curl -i $BASE/api/auth/me -H "Authorization: Bearer not-a-real-token"
```

## Status codes

| Situation                                | Code |
| ---------------------------------------- | ---- |
| Signup OK                                | 201  |
| Login OK                                 | 200  |
| `GET /me` with a valid token             | 200  |
| Invalid email format or password < 12    | 400  |
| Passwords don't match (when confirmed)  | 400  |
| Login with wrong email *or* password     | 401  |
| Missing / invalid / expired token        | 401  |
| Email already registered                 | 409  |
| `POST /api/events` with a fresh key      | 201  |
| `POST /api/events` repeating a used key  | 200 (the original event) |
| `POST /api/events` with no/unknown API key | 401 |
| `GET /api/events` with an API key (no session) | 401 |
| `Idempotency-Key` missing, or bad `type`/`data` | 400 |
| Rate limit exceeded (`POST /api/auth/login`, `POST /api/events`) | 429 + `Retry-After` |

## Routes

Every route below returns JSON. Auth ✓ means a valid session cookie or
`Authorization: Bearer <token>`; without one the route answers **401**. The one
🔑 route takes `X-Hookshot-Key: hk_live_…` instead — see **Two credentials, two
callers** below.

| Method | Path                       | Auth | What it does                                        | Request body                                              |
| ------ | -------------------------- | ---- | --------------------------------------------------- | --------------------------------------------------------- |
| GET    | `/api/health`              | —    | Liveness check — 200 as soon as the server is up     | —                                                          |
| POST   | `/api/auth/signup`         | —    | Create an account, mint a session cookie             | `{ email, password, passwordConfirmation? }`               |
| POST   | `/api/auth/register`       | —    | Alias of `/signup`, kept for the frontend's path     | same                                                       |
| POST   | `/api/auth/login`          | —    | Exchange credentials for a session cookie            | `{ email, password }`                                      |
| POST   | `/api/auth/logout`         | —    | Clear the session cookie                             | —                                                          |
| GET    | `/api/auth/me`             | ✓    | Current user's email, api key and key creation date  | —                                                          |
| POST   | `/api/auth/regenerate-key` | ✓    | Mint a fresh api key, invalidating the old one       | —                                                          |
| PATCH  | `/api/auth/password`       | ✓    | Change the password, re-issuing the session cookie   | `{ currentPassword, newPassword, passwordConfirmation? }`  |
| DELETE | `/api/account`             | ✓    | Delete the account, cascading to its data            | —                                                          |
| POST   | `/api/endpoints`           | ✓    | Register a webhook target → **201** the new endpoint| `{ url }`                                                  |
| GET    | `/api/endpoints`           | ✓    | Your endpoints, newest first (active *and* inactive) | —                                                          |
| PATCH  | `/api/endpoints/:id`       | ✓    | Update a target's url or active flag → 200 the same  | `{ url?, active? }`                                        |
| DELETE | `/api/endpoints/:id`       | ✓    | Remove a target → 200 `{ ok: true, id }`             | —                                                          |
| POST   | `/api/events`              | 🔑   | Record an incoming webhook → **201**, or **200** on a replayed `Idempotency-Key` | `{ type, data }` + `Idempotency-Key` header |
| GET    | `/api/events`              | ✓    | Your 50 most recent events, newest first             | —                                                          |

`:id` is always scoped to the caller in the query itself, so another user's id
gives the same **404** as one that does not exist. `PATCH`/`DELETE` with a
malformed (non-ObjectId) id is **404** too, never 500.

Tokens live for 7 days and carry `{ id }`. They are handed out as an httpOnly
cookie (`SameSite=Strict`, `Path=/`, `Secure` only when `NODE_ENV=production`) and
never appear in a response body. `Authorization: Bearer <token>` is accepted too,
for curl and the test suite.

`/api/auth/password` re-issues the session cookie so the browser is holding a
token minted after the change.

### Two credentials, two callers

`POST /api/events` authenticates with the **API key**, not the session token
(legend: ✓ session cookie or Bearer, 🔑 `X-Hookshot-Key`):

```bash
curl -X POST $BASE/api/events \
  -H 'Content-Type: application/json' \
  -H "X-Hookshot-Key: $API_KEY" \
  -H 'Idempotency-Key: order-1-invoice-8821' \
  -d '{"type":"invoice.paid","data":{"invoiceId":"inv_8821"}}'
```

The sender is another application's backend. It has no browser and no session, so
requiring a JWT there would force every integrator to authenticate through the
dashboard first. The split is one-directional: a key opens `POST` and nothing
else, so a leaked key cannot read event history. Get the key from
`GET /api/auth/me`, or from the **Settings** page in the frontend.

Both middlewares (`auth.js`, `apiKeyAuth.js`) attach the same thing — `req.user = { id }`
as a string — so no controller knows or cares which credential got a request past it.

CORS needs no special case for the header: `cors()` reflects whatever the browser asks
for when no `allowedHeaders` is configured, so `X-Hookshot-Key` is already accepted
from a browser origin.

## Layout

MVC — routes wire, controllers decide, models persist.

```
src/
  server.js                  app wiring, CORS, 404, central error handler
  routes/
    index.js                 the single /api mount point
    auth.js                  auth paths → authController, login rate limit
    account.js               account paths → accountController
    endpoints.js             endpoint paths → endpointController
    events.js                event paths → eventController, event rate limit
                             (POST uses apiKeyAuth, GET uses auth)
  controllers/
    authController.js        signup, login, logout, me, regenerateKey, changePassword
    accountController.js     delete account
    endpointController.js    endpoint CRUD, ownership-scoped
    eventController.js       create (idempotent), list newest-first
  models/
    User.js                  email, password, apiKey, apiKeyCreatedAt
    Endpoint.js              userId, url, active
    Event.js                 userId, type, data, idempotencyKey, endpointIds
  middleware/
    auth.js                  cookie-or-Bearer → req.user, else 401
    apiKeyAuth.js            X-Hookshot-Key → req.user, else 401 (POST /api/events only)
    rateLimit.js             limiter + keyFn → 429 with Retry-After
  config/db.js               mongoose connect, fatal on failure
  utils/
    jwt.js                   sign + verify (no DB lookup on verify)
    cookies.js               cookie name and parsing
    apiKey.js                key generation
    endpoints.js             getActiveEndpoints (cached) + invalidateEndpoints
    rateLimiter.js           createLimiter — pure logic, no Express
    cache.js                 generic TTL cache: get / set / del / getStats
    revokedUsers.js          deleted user ids → refused by auth, no DB lookup
scripts/
  test-*.mjs                the seven test suites — see Tests
testing-guides/
  01…05.md                  one hand-run guide per build step
```

Adding a resource is one `router.use` line plus a `routes/<name>.js` — no logic
goes in the route files.

## Notes

- Passwords are bcrypt-hashed at cost 12 and marked `select: false`, so the hash
  is only ever loaded by the login query. Responses are stripped of `password`
  and `__v`.
- Emails are lowercased and trimmed, so `You@Example.com` and `you@example.com`
  are the same account.
- Login returns one generic 401 for both unknown email and wrong password, so it
  can't be used to enumerate which addresses have accounts.
- `POST /api/auth/signup` enforces a 12-character minimum to match the copy in
  the Settings page, which is stricter than the 8 in the brief.
- CSRF is defended by `SameSite=Strict` plus a single allowed CORS origin, not by a
  token. A cross-site form POST can't send the cookie, and a cross-site `fetch`
  can't read the response.
- Every account has an API key (`hk_live_` + 32 hex) generated on creation. It's
  `select: false`, so it only loads on the routes that need it.
- `apiKeyAuth` and `auth` attach the identical thing — `req.user = { id }`, as a
  **string**. The `String(...)` is load-bearing: `user._id` is a fresh `ObjectId`
  instance on every request and the rate limiter's `Map` compares object keys by
  reference, so an unstringified id gave each request its own bucket and the events
  limit silently stopped applying (23 posts, all 201).
- Every endpoint read and write is scoped by `userId` **inside the query**. A
  non-owner gets 404 rather than 403, so an id-probe can't tell "not yours" from
  "doesn't exist". See `testing-guides/01-endpoints-ownership.md`.
- The auth middleware verifies the JWT signature and **does not** look the user up.
  A per-request lookup would put MongoDB back on the hot path of every
  authenticated call and defeat the query-count measurement the caching step is
  about, so deletion is handled a cheaper way instead — see the next bullet.
- **Deleting an account revokes its token.** The user id goes into an in-memory
  map that `auth` consults on every request, so a deleted account's JWT is refused
  immediately instead of surviving until its 7-day expiry. `apiKeyAuth` consults the
  same map, so a deleted account's API key stops working too. That check is one
  `Map.get` and no database call, which is the entire reason it exists rather than
  a lookup. Deleting also cascades to that user's endpoints and events and drops
  their cache entry. See `Known limitations` for what it still does not cover.
- Rate limits are fixed-window and in-memory: `POST /api/auth/login` allows 5/min
  keyed on IP+email, `POST /api/events` allows 20/min keyed on user id. The two keep
  separate counters, so exhausting one never affects the other. The event limiter
  runs **after** the credential check — it keys on `req.user.id`, which only exists
  once the key is verified, and running it earlier would also let a caller with a
  bad key spend another user's allowance. See `testing-guides/04-rate-limiting.md`.
- The login limiter key is normalised with `.trim().toLowerCase()`, exactly the way
  the login query normalises the email before its lookup. The two must agree: when
  they disagreed, `VICTIM@x.com` and `victim@x.com` were separate buckets for one
  account, and an attacker cycling the case got 12 guesses against a 5/min limit
  with no 429 at all. `test-ratelimit.mjs` pins this.
- `req.ip` ignores `X-Forwarded-For` until `app.set("trust proxy", ...)` is set, so
  behind a reverse proxy every request looks like it comes from the proxy. Add that
  before deploying behind nginx or a load balancer.
- **Active endpoints are cached per user** for 5 minutes, so a burst of events costs
  one MongoDB query instead of one per event. Every successful endpoint
  create/update/delete invalidates immediately, so the TTL is only a backstop for
  changes made outside this API. `GET /api/endpoints` is *not* cached — it returns
  inactive endpoints too, so it is a different query. See
  `testing-guides/05-caching.md`.
- `ponytail:` the cache is per-process. Running N instances gives each its own copy,
  and a mutation on one will not invalidate the others — that needs Redis plus a
  pub/sub invalidation channel. Fine for a single node; revisit when scaled out.

## Tests

Seven suites, **533 assertions**, all against a live server and a real MongoDB.
They live in `scripts/` — kept in the repo because they are the evidence for
everything claimed above, and worth re-running when anything is touched.

```bash
cd hookshotbackend
npm run dev:test    # terminal 1 — rate limits raised so the volume suites can run
npm test            # terminal 2 — runs all seven in sequence
```

| Script                       | Assertions | Covers                                                                    |
| ---------------------------- | ---------- | ------------------------------------------------------------------------- |
| `scripts/test-auth.mjs`      | 96         | signup/login/logout, every 400 branch, cookie attributes, the revocation sweep (session **and** API key) |
| `scripts/test-endpoints.mjs` | 87         | CRUD, ownership 404-not-403, URL validation, malformed ids                  |
| `scripts/test-events.mjs`    | 98         | API-key vs session auth in both directions, ingestion, the `Idempotency-Key` requirement, the 50-event cap and its `_id` tiebreaker |
| `scripts/test-idempotency.mjs` | 49       | the unique index, a 10-way concurrent burst repeated 6×, cross-user keys     |
| `scripts/test-ratelimit.mjs` | 49         | `createLimiter` unit arithmetic, then both limits live                       |
| `scripts/test-caching.mjs`   | 54         | the cache module, real Mongo query counts, every invalidation path, the TTL |
| `scripts/test-integration.mjs` | 127      | the whole lifecycle end to end, edge cases, live status-code table          |

Any one can be run alone with `node scripts/<name>.mjs` while the server is up.

Three of them start their own server on a spare port, because they have to test
behaviour the shared dev server deliberately changes:

- `test-ratelimit.mjs` — port 5099, **default** limits. The shared server runs with
  `EVENT_RATE_LIMIT=1000`; testing a 429 against it would prove nothing.
- `test-caching.mjs` — port 5098, `ENDPOINT_CACHE_TTL_MS=800`, so TTL expiry is
  observable in a second instead of five minutes.
- `test-integration.mjs` — port 5097, **default** limits, and it really waits out the
  60-second window to confirm requests resume. That is the slowest suite by design.

`npm run dev` rather than `dev:test` leaves the limits at their real values, which is
what you want for manual poking at the API.

The suites create throwaway accounts under `@example.com`. Clear them with:

```bash
node -e "require('mongoose').connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/hookshot').then(async(m)=>{const db=m.connection.db;const r=await db.collection('users').deleteMany({email:/@example\.com/});await db.collection('endpoints').deleteMany({});await db.collection('events').deleteMany({});console.log('removed',r.deletedCount,'test accounts; users left:',await db.collection('users').countDocuments({}));process.exit(0)})"
```

It matches on `@example.com` rather than a list of prefixes. Every account a suite
creates uses that domain (some with a `-alt` suffix for uniqueness), and your real
account does not — so the pattern survives a new suite inventing a new prefix. An
earlier version listed prefixes explicitly and quietly stopped matching when later
suites introduced new names.

`fetch` has no cookie jar, so each suite hand-rolls one from `getSetCookie()` and
replays a `Cookie` header, which is the closest it gets to a browser.

---

## Known limitations

Accepted deliberately for this assignment's scope. Collected here so they read as
decisions on the record rather than oversights.

- **`apiKey` is stored in PLAINTEXT.** A read of the `users` collection discloses
  every webhook key. The password beside it is bcrypt-hashed; this one is not,
  because the Settings page has a Reveal control that shows the key back to its
  owner. Fixing it means showing the key once at generation time and storing only
  a hash — which removes the ability to reveal it afterwards.
- **A stolen token for a live account stays valid until it expires** (7 days).
  Deletion *is* handled (next bullet), but nothing here can tell a theft from the
  legitimate owner, and the per-request lookup that might help would put MongoDB
  back on the hot path the caching step measures.
- **Deleted-account revocation is per-process and not durable.** `auth` refuses a
  deleted user's id from an in-memory map rather than from the database, so the
  decision is lost on restart and absent on any second instance. With one node and
  no restart mid-session that is invisible.
- **In-memory caches are not shared across instances.** Both the endpoint cache
  and the revocation map assume a single process. Scaling out needs Redis plus a
  pub/sub channel so a mutation on one instance invalidates the others.
- **Rate limiting is fixed-window, so the limit is soft at the boundary.** A window
  resets all at once, which means a client can fire 5 attempts at 59.9s and another
  5 at 60.1s — twice the allowance across two adjacent windows. A sliding window is
  fairer here and costs more bookkeeping; the trade was judged acceptable for this
  scope.
- **The rate limiter's key map is never swept.** Every distinct key ever seen
  leaves an entry behind. Deleting on window close is a few lines, and worth doing
  before facing untrusted traffic.
- **`req.ip` ignores `X-Forwarded-For`** unless `app.set("trust proxy", ...)` is
  set, so behind a proxy every login attempt shares one bucket.
- **No webhook delivery yet.** Events are recorded and their recipients snapshotted
  into `endpointIds`; nothing is actually POSTed anywhere.