# 01 — Endpoints and Ownership (Postman)

**What this tests:** the four endpoint routes (`POST`, `GET`, `PATCH`, `DELETE /api/endpoints`) and the ownership rule: user B must never be able to see, change or delete user A's endpoints.

**Collection folders used:** `00 Setup`, `01 Endpoints and ownership`.

---

## Setup (once)

1. Start the backend (`npm run dev` in `hookshotbackend`). It should log `DATABASE CONNECTED` and listen on port 5001.
2. In Postman: **Import** → `hookshot.postman_collection.json`.
3. Open the collection's **Variables** tab. `baseUrl` is `http://localhost:5001` and `password` is `supersecret123` (12+ characters is required). Change `baseUrl` if your port differs.
4. Run the requests top to bottom. Each one saves what the next one needs (user emails, API keys, the endpoint id) into collection variables, so they cannot be run out of order.

**Running everything at once:** right-click the collection → **Run collection** (1 iteration). Or from a terminal: `npx newman run hookshot.postman_collection.json`.

### Two users, one cookie jar

Postman keeps **one cookie jar per domain**. The session cookie belongs to whoever logged in or signed up last. The collection handles this with explicit `Log in as user B` / `Log in as user A` requests. If you test by hand, never send a "user B" request while the cookie is still A's: it would pass for the wrong reason.

---

## Steps

| # | Request | Expected | What it proves |
|---|---|---|---|
| 0.1 | Sign up user A | **201**, body has `apiKey` starting `hk_live_`, no password or hash. `Set-Cookie` contains `hookshot_token` and `HttpOnly` | Account creation, session cookie is httpOnly |
| 0.2 | Sign up user B | **201**, own `apiKey` | A second tenant exists |
| 0.3 | Log in as A | **200**, cookie now A's | Login works, session switches |
| 1.1 | Create endpoint as A. Body includes a spoofed `"userId": "000000000000000000000000"` | **201**, `active: true`, `userId` is A's real id, not the spoofed one | Ownership comes from the session, never from the body |
| 1.2 | Create with `"url": "notaurl"` | **400**, `url must be a valid http:// or https:// URL.` | URL validation |
| 1.3 | List endpoints as A | **200**, array contains endpoint 1.1 | Owner can read their data |
| — | Log in as B | **200** | Switch user |
| 1.5 | List endpoints as B | **200** (not 403/404), A's endpoint is absent | Lists are scoped to the owner |
| 1.6 | B sends `PATCH /api/endpoints/{{endpointIdA}}` | **404**, `Endpoint not found.` | **The ownership test**: a stranger cannot modify it |
| 1.7 | B sends `DELETE /api/endpoints/{{endpointIdA}}` | **404**, same body | A stranger cannot delete it |
| 1.8 | `PATCH /api/endpoints/not-an-object-id` | **404**, same body, never 500 | A malformed id looks the same as a missing one |
| — | Log in as A | **200** | Switch back |
| 1.10 | List endpoints as A | endpoint still present, same `url`, still `active: true` | B's attempts changed nothing |

**Why 404 and not 403.** A 403 admits the record exists, which would let someone find real endpoint ids by guessing. Returning the identical 404 for "not yours" and "does not exist" makes the two indistinguishable.

---

## Edge cases not in the collection (do these by hand)

- **No session → 401.** In Postman click **Cookies** (below the Send button) → `localhost` → delete `hookshot_token`. Send `GET {{baseUrl}}/api/endpoints`. Expect **401** `{"error":"Not authenticated"}`. Log in again afterwards.
- **Local URLs are accepted.** `POST /api/endpoints` with `{"url":"http://localhost:3000/hook"}` and with `{"url":"http://127.0.0.1:8080/webhook"}` → both **201**. These are the targets you would use in development.
- **More invalid URLs → 400:** `""`, `www.example.com` (no scheme), `ftp://example.com/x`, `javascript:alert(1)`, a number, a body with no `url`.
- **Bad `PATCH` bodies → 400:** `{"active": "yes"}` (not a boolean) and `{}` (nothing to update).
- **Delete twice:** the second `DELETE` of the same id returns **404**.

---

## Database check (optional)

In `mongosh` (use your `MONGO_URI`):

```js
db.endpoints.getIndexes()
```

Expect an index on `{ userId: 1, createdAt: -1 }`. It lets the list query filter by owner and sort newest-first from the index.

---

## Status codes

| Case | Code |
|---|---|
| Create with a valid http(s) URL | 201 |
| List / update / delete your own endpoint | 200 |
| Invalid URL, non-boolean `active`, empty update | 400 |
| No or invalid session | 401 |
| Someone else's endpoint, a missing id, or a malformed id | 404 |
