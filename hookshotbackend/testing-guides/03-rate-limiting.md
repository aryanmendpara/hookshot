# 03 — Rate Limiting (Postman)

**What this tests:** the fixed-window limiter on two routes, with different keys and limits:

| Route | Limit | Counted per | Protects against |
|---|---|---|---|
| `POST /api/auth/login` | 5 per minute | IP + email (lower-cased) | password guessing |
| `POST /api/events` | 20 per minute | user (found from the API key) | a runaway client or retry loop |

When a caller goes over, the server answers **429 Too Many Requests** with a **`Retry-After`** header (seconds until the window resets).

**Collection folders used:** `03a` to `03d`.

---

## Before you start

- **The server must use the default limits.** If your `.env` sets `LOGIN_RATE_LIMIT` or `EVENT_RATE_LIMIT` (for example `EVENT_RATE_LIMIT=1000` to make volume tests easier), remove it and restart, or you will never see a 429.
- **Wait 60 seconds between runs.** The window is not a background timer. It is a start time stored per key, and it resets when the first request arrives after 60 seconds have passed.
- These folders need **iterations**. Right-click the folder → **Run folder** and set the iteration count. Do not use the single Send button.

---

## Test 1: event rate limit

1. Send `03a Fresh sender` **once** (normal Send). It signs up a new user C, so the allowance starts at zero.
2. Right-click folder `03b Event flood` → **Run folder** → **Iterations: 25** → Run.

| Iterations | Expected |
|---|---|
| 1 to 20 | **201** |
| 21 to 25 | **429** |

Open one of the 429 responses → **Headers**: `Retry-After` is a whole number between 1 and 60. The body is `{"error":"Too many requests. Try again in Ns."}`. The final test, `exactly 20 allowed, the rest blocked`, passes only if the split is exactly 20 and 5.

**Why a fresh user matters:** every authenticated request counts toward the 20, including ones that end in a 400. Reusing a user who already sent events would shift the split.

## Test 2: login rate limit

Run folder `03c Login flood` with **Iterations: 7**. The request sends a wrong password for a fixed email, so the result is independent of any real account.

| Iteration | Expected |
|---|---|
| 1 to 5 | **401** (wrong password) |
| 6 and 7 | **429** + `Retry-After` |

The tests name each attempt (`attempt 6 is blocked with 429`), so a failure shows exactly where the limit kicked in.

## Test 3: the key includes the email

Right after Test 2, within 60 seconds, send `03d Different email not blocked` once → **401**, not 429. Same IP, different email, so a different key and a fresh allowance. This is why one attacker cannot lock out everyone on the same network.

---

## Manual checks

- **The window resets.** Wait 60 seconds after Test 2, then send the `03c` request once → **401** again.
- **Email case cannot dodge the limit.** Within 60 seconds of Test 2, copy the `03c` request and change the email to `RATELIMIT-TEST@Example.com` → still **429**. The limiter lower-cases and trims the email, the same way login does. Before that fix, changing the case gave an attacker a fresh allowance for every spelling.
- **Order of checks on `POST /api/events`:** the API key is checked first, then the limiter. A request with a wrong API key is 401 and does not use up anyone's allowance.

---

## What Postman cannot show

The limiter's memory is a `Map` inside the server process. Postman cannot read it, and restarting the server clears every counter. `node scripts/test-ratelimit.mjs` starts its own server on a separate port with default limits and also unit-tests the limiter directly (allowed up to the limit, blocked after, reset after the window).

---

## Status codes

| Case | Code |
|---|---|
| Within the limit | normal response (201, or 401 for a wrong password) |
| Over the limit | **429** with a `Retry-After` header and `{"error":"Too many requests. Try again in Ns."}` |
