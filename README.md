# Hookshot

A webhook platform. One side registers the URLs it wants notified; the other
side POSTs events to Hookshot's ingest endpoint. Hookshot authenticates the
sender with an API key, records the event exactly once, and keeps it against the
receiving account.

This repo holds two apps:

| Path                 | Stack                                | What it is                          |
| -------------------- | ------------------------------------ | ----------------------------------- |
| `hookshotbackend/`   | Node.js + Express + MongoDB (Mongoose) | The API and event store           |
| `hookshotfrontend/`  | React 18 + Vite + Tailwind           | The dashboard for managing it       |

## How it works

1. A developer signs up and gets an **API key** (`hk_live_…`), shown in Settings.
2. They register **endpoints** — the URLs they own that should receive events.
3. Their other services POST events to `/api/events`, authenticating with the API
   key and an `Idempotency-Key` header:

   ```bash
   curl -X POST http://localhost:5001/api/events \
     -H 'Content-Type: application/json' \
     -H "X-Hookshot-Key: $API_KEY" \
     -H 'Idempotency-Key: order-1-invoice-8821' \
     -d '{"type":"invoice.paid","data":{"invoiceId":"inv_8821"}}'
   ```

   A fresh key returns **201** and a new event. Replaying the same key returns
   **200** with the original event instead of creating a duplicate.
4. The dashboard lists endpoints and the 50 most recent events.

> **Delivery is not built yet.** Events are recorded and their target endpoints
> are snapshotted onto the event; nothing is actually POSTed outbound. That is
> the next phase — see `hookshotbackend/README.md` → *Known limitations*.

## Two credentials

- **Session cookie** (httpOnly JWT, 7 days) — the dashboard. Manages endpoints,
  events, account, and settings.
- **API key** (`X-Hookshot-Key`) — server-to-server callers. Opens `POST
  /api/events` and nothing else, so a leaked key can't read event history.

## What the backend covers

Auth (signup / login / logout / password change / account deletion), endpoint
CRUD scoped to the owner, idempotent event ingestion, fixed-window rate limiting
(login and event ingest), and an in-memory cache-aside layer for a user's active
endpoints. Deleted accounts are revoked immediately, for both the session token
and the API key.

The full route table, status codes, design notes, and the accepted limitations
live in [`hookshotbackend/README.md`](hookshotbackend/README.md).

## Running it

**Requirements:** Node.js 18+ and a MongoDB instance (local `mongod`, Docker, or
Atlas).

Backend:

```bash
cd hookshotbackend
npm install
cp .env.example .env     # then edit — MONGO_URI, JWT_SECRET, PORT, CLIENT_ORIGIN
npm run dev              # http://localhost:5001
```

Frontend (separate terminal):

```bash
cd hookshotfrontend
npm install
npm run dev              # http://localhost:5173, proxies /api → localhost:5001
```

The Vite dev server proxies `/api` to the backend so both run same-origin, which
is what lets the httpOnly session cookie work in development.

## Tests

The backend ships seven suites (~530 assertions) that run against a live server
and a real MongoDB:

```bash
cd hookshotbackend
npm run dev:test    # terminal 1 — relaxed rate limits
npm test            # terminal 2 — runs all seven
```

## Notes

- Assignment: *FS Node Task 3 — Make Your API Safe (Hookshot)*.
- The backend dependency set is intentionally small: express, mongoose, bcryptjs,
  jsonwebtoken, dotenv, cors.
