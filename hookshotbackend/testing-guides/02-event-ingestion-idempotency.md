# 02 — Event Ingestion and Idempotency (Postman)

**What this tests:** `POST /api/events` (how a sender submits an event) and `GET /api/events`, plus the idempotency guarantee: the same `Idempotency-Key` never creates a second event.

**Collection folder used:** `02 Event ingestion and idempotency`. Run folders `00 Setup` and `01 Endpoints and ownership` first, because this folder uses user A's endpoint and both users' API keys.

---

## Two kinds of authentication

| Route | Authenticated by | Used by |
|---|---|---|
| `POST /api/events` | `X-Hookshot-Key` header (the user's API key) | The sender's backend, with no login |
| `GET /api/events` | The session cookie | The dashboard, a logged-in person |

`POST /api/events` ignores the session cookie entirely. Request 2.9 proves it: the cookie is sent, the API key is not, and the result is 401.

---

## Steps

Every `POST` sends `X-Hookshot-Key: {{apiKeyA}}` (or `B`) and an `Idempotency-Key` header.

| # | Request | Expected | What it proves |
|---|---|---|---|
| 2.1 | New event, fresh key | **201**. `idempotencyKey` equals the header. `endpointIds` contains A's endpoint | Ingestion works and fans out to active endpoints |
| 2.2 | Same key, same body | **200**, same `_id`, same `createdAt` | A replay returns the stored event and writes nothing |
| 2.3 | Same key, **different** body | **200**, `type` is still `invoice.paid` | The key identifies the event. The new payload is ignored |
| 2.4 | New key | **201**, new `_id` | A different key still creates a new event |
| 2.5 | `GET /api/events` as A | **200**. The replayed key appears **once**. Newest event first | No duplicate stored, ordering correct |
| 2.6 | No `Idempotency-Key` | **400**, `Idempotency-Key header is required.` | The header is mandatory |
| 2.7 | No `type` | **400**, `type is required.` | Input validation |
| 2.8 | `"data": [1, 2]` | **400**, `data must be a JSON object.` | `data` must be an object |
| 2.9 | No `X-Hookshot-Key`, cookie still sent | **401**, `X-Hookshot-Key header is required.` | A session does not authorise sending events |
| 2.10 | Wrong API key | **401**, `Invalid API key.` | Unknown keys are rejected |
| 2.11 | **User B** sends A's key value | **201**, B's own event, `endpointIds: []` | Uniqueness is **per user**. Having no endpoints is not an error |
| 2.12 | `GET /api/events` as A | B's event is absent, A's key still appears once | Tenants cannot see each other's events |

**200 vs 201.** 201 means "this request created the event". 200 means "it already existed, here it is". A client that retried can treat both as success.

---

## Edge cases not in the collection

- **Validation order:** a request missing both `type` and the header gets the `type` error first.
- **Whitespace-only `type` or key** (`"   "`) → 400.
- **`data` omitted** → accepted, stored as `{}`.
- **Empty and nested payloads survive:** send `"data": {"user": {}, "tags": []}` and confirm the response and a later `GET` both return exactly that. The stored payload must round-trip unchanged.
- **Sending 10 requests at the same instant:** Postman's Runner is sequential, so it cannot do this. Run `node scripts/test-idempotency.mjs` for it. That script fires 10 identical requests at once, repeats the burst with fresh keys, and expects exactly one `201`, nine `200`s and one stored document.

---

## Database checks (optional, in `mongosh`)

```js
// 1. The uniqueness rule is real. Look for unique: true on this index:
db.events.getIndexes()
// → { key: { userId: 1, idempotencyKey: 1 }, unique: true, ... }

// 2. Use the value of {{idemKey1}} from Postman (Collection → Variables → current value).
//    Both A and B used this key, so it matches two documents, one per user:
db.events.countDocuments({ idempotencyKey: "<paste idemKey1>" })
// → 2
//    Per user it is exactly one. A's replays in 2.2 and 2.3 created nothing:
db.events.countDocuments({ idempotencyKey: "<paste idemKey1>", userId: ObjectId("<A's userId>") })
// → 1   (A's userId is in the response of request 1.1)
```

---

## Status codes

| Case | Code |
|---|---|
| First use of a key | 201 |
| Repeat of a key by the same user | 200 |
| Missing `Idempotency-Key`, missing `type`, `data` not an object | 400 |
| Missing or wrong `X-Hookshot-Key` | 401 |
| Over the rate limit | 429 (see guide 03) |
