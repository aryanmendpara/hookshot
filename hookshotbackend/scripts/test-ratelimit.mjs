// Rate limit tests. Two halves:
//
//   1. UNIT — createLimiter() on its own, no server. This is where the window
//      arithmetic is actually verified, because an integration test can only see
//      "was it 429 or not", never why.
//   2. INTEGRATION — the real routes, against a server this file starts itself
//      on port 5099 with DEFAULT limits. It spawns its own because the shared
//      dev server runs with EVENT_RATE_LIMIT raised for the volume suites
//      (test-events.mjs needs 55 inserts from one user), and a 20/min limit has
//      to be the one under test here.
//
// Run: node scripts/test-ratelimit.mjs
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Package root, derived from this file's own location, so the suite keeps working
// no matter which directory it is invoked from.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const require = createRequire(import.meta.url);
const { createLimiter } = require(path.join(ROOT, "src/utils/rateLimiter.js"));

const PORT = 5099;
const BASE = `http://localhost:${PORT}`;
const PW = "supersecret123";
const stamp = Date.now();

let pass = 0,
  fail = 0;
const ok = (label, cond, extra = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "PASS  " : "FAIL  "}${label}${extra ? "  → " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- unit tests
console.log(`--- UNIT: createLimiter({ limit: 3, windowMs: 120 }) ---`);
{
  const lim = createLimiter({ limit: 3, windowMs: 120 });

  ok("1st request allowed", lim.check("k").allowed === true);
  ok("2nd request allowed", lim.check("k").allowed === true);
  ok("3rd request allowed", lim.check("k").allowed === true);

  const fourth = lim.check("k");
  ok("4th request blocked", fourth.allowed === false);
  ok("  retryAfterSeconds is a number", typeof fourth.retryAfterSeconds === "number", `${fourth.retryAfterSeconds}`);
  ok("  and is >= 1", fourth.retryAfterSeconds >= 1, `${fourth.retryAfterSeconds}s`);
  ok("  and does not exceed the window", fourth.retryAfterSeconds <= 1, `${fourth.retryAfterSeconds}s`);

  ok("stays blocked while the window is open", lim.check("k").allowed === false);

  // A different key must have its own allowance.
  const other = lim.check("a-completely-different-key");
  ok("a different key is unaffected", other.allowed === true);
}

console.log(`\n--- UNIT: the window resets after it expires ---`);
{
  const lim = createLimiter({ limit: 1, windowMs: 120 });

  ok("first allowed", lim.check("k").allowed === true);
  ok("second blocked", lim.check("k").allowed === false);

  await sleep(160);

  const after = lim.check("k");
  ok("allowed again once the window closed", after.allowed === true, JSON.stringify(after));
  ok("  and the count really reset, not just extended", lim.check("k").allowed === false);
}

console.log(`\n--- UNIT: retryAfterSeconds counts down and rounds up ---`);
{
  // A 1s window is useless here: the value is always ceil(<=1000/1000) = 1, so
  // it can never be seen to decrease. 5s gives the countdown room to show.
  const lim = createLimiter({ limit: 1, windowMs: 5000 });
  lim.check("k");
  const a = lim.check("k").retryAfterSeconds;
  await sleep(1200);
  const b = lim.check("k").retryAfterSeconds;

  ok("first block reports the full window", a === 5, `${a}s`);
  ok("later in the window it reports less", b < a, `${a}s then ${b}s`);
  ok("  and tracks the real time remaining", b === 4, `${b}s (expect 4)`);
  ok("never reports 0 while still blocked", b >= 1, `${b}s`);
}

console.log(`\n--- UNIT: concurrent calls in one tick cannot over-allow ---`);
// The Map read-then-write is safe because check() is synchronous. If someone
// later adds an await inside it, every one of these would read the same
// pre-increment count and pass. This test is the canary for that regression.
{
  const lim = createLimiter({ limit: 5, windowMs: 60_000 });
  const results = Array.from({ length: 50 }, () => lim.check("hot-key"));

  const allowed = results.filter((r) => r.allowed).length;
  ok("exactly 5 of 50 same-tick calls are allowed", allowed === 5, `got ${allowed}`);
  ok("the other 45 are blocked", results.filter((r) => !r.allowed).length === 45);
}

console.log(`\n--- UNIT: separate instances share no state ---`);
{
  const a = createLimiter({ limit: 2, windowMs: 60_000 });
  const b = createLimiter({ limit: 2, windowMs: 60_000 });

  a.check("same-key");
  a.check("same-key");
  ok("instance a is now blocking", a.check("same-key").allowed === false);
  ok("instance b is unaffected by a", b.check("same-key").allowed === true);
  ok("  b has its own full allowance", b.check("same-key").allowed === true);
  ok("  and then blocks on its own third", b.check("same-key").allowed === false);
}

// --------------------------------------------------------- integration tests
console.log(`\n--- starting a server on :${PORT} with DEFAULT limits ---`);
const child = spawn(process.execPath, [path.join(ROOT, "src/server.js")], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), LOGIN_RATE_LIMIT: "", EVENT_RATE_LIMIT: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

if (!(await waitForServer())) {
  console.error("FAIL  server never came up on :5099");
  child.kill();
  process.exit(1);
}
console.log(`PASS  server is up on ${BASE}`);

// `apiKey` and `token` stay separate: POST /api/events takes only the API key,
// GET takes only the token, and the two 401 tests below depend on being able to
// send the wrong one deliberately.
async function call(method, path, { body, token, apiKey, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { "X-Hookshot-Key": apiKey } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

async function makeUser(tag) {
  const email = `rl-${tag}-${stamp}@example.com`;
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  if (res.status !== 201) throw new Error(`signup failed for ${email}: ${res.status}`);
  const raw = res.headers.getSetCookie().find((c) => c.startsWith("hookshot_token="));
  const { apiKey } = await res.json();
  return {
    email,
    token: decodeURIComponent(raw.slice("hookshot_token=".length).split(";")[0]),
    // POST /api/events authenticates with this, not the token above.
    apiKey,
  };
}

try {
  console.log(`\n--- INTEGRATION: login limiter (5/min per IP+email) ---`);
  // Signup is not rate limited, so create the account up front and then hammer
  // the login route itself. Every attempt below uses a deliberately wrong
  // password: the limiter is in front of the controller, so a 429 must arrive
  // regardless of whether the credentials would have succeeded.
  const victim = `rl-victim-${stamp}@example.com`;
  await call("POST", "/api/auth/signup", { body: { email: victim, password: PW } });

  const attempts = [];
  for (let i = 1; i <= 7; i++) {
    const r = await call("POST", "/api/auth/login", { body: { email: victim, password: "wrongpassword" } });
    attempts.push(r);
  }

  ok("attempts 1-5 return 401 (allowed through, wrong password)", attempts.slice(0, 5).every((r) => r.status === 401), attempts.slice(0, 5).map((r) => r.status).join(","));
  ok("attempt 6 returns 429", attempts[5].status === 429, `got ${attempts[5].status}`);
  ok("attempt 7 returns 429", attempts[6].status === 429, `got ${attempts[6].status}`);

  const blocked = attempts[5];
  const retryAfter = blocked.headers.get("Retry-After");
  ok("429 carries a Retry-After header", retryAfter !== null, `${retryAfter}`);
  ok("  Retry-After is a positive integer", /^[1-9][0-9]*$/.test(retryAfter ?? ""), `${retryAfter}`);
  ok("  and is <= 60 (the window)", Number(retryAfter) <= 60, `${retryAfter}s`);
  ok("429 body has an error message", typeof blocked.json.error === "string" && blocked.json.error.length > 0, blocked.json.error);

  console.log(`\n--- INTEGRATION: the login key is IP+email, not IP alone ---`);
  // Same IP (localhost), completely different email. If the limiter keyed on IP
  // alone this would be a 429, proving the email is genuinely part of the key.
  const other = await call("POST", "/api/auth/login", { body: { email: `rl-other-${stamp}@example.com`, password: "wrongpassword" } });
  ok("a different email from the same IP is NOT blocked", other.status === 401, `got ${other.status}`);

  const realLogin = await call("POST", "/api/auth/login", { body: { email: victim, password: PW } });
  ok("the victim's real password is 429 too (limiter is pre-auth)", realLogin.status === 429, `got ${realLogin.status}`);

  console.log(`\n--- INTEGRATION: the login key is normalised the same way the lookup is ---`);
  // Regression guard. The limiter key used to be the raw req.body.email while the
  // controller looked the user up by email.trim().toLowerCase(), so case and
  // whitespace variants were SEPARATE buckets for one account. Measured: 12 guesses
  // against a single account with a 5/min limit and not one 429 — the limiter the
  // step was built to provide was bypassable with a Shift key.
  //
  // login lowercases + trims, so every spelling below is the same user.
  const cased = await makeUser("casing");
  // login lowercases + trims before the lookup, so all four of these are the same
  // account and must share one allowance.
  const spellings = [
    cased.email,
    cased.email.toUpperCase(),
    ` ${cased.email} `,
    cased.email.replace("@example", "@EXAMPLE"),
  ];
  // 12 attempts, cycling the four spellings — comfortably past a limit of 5, so a
  // limiter that splits them by spelling shows up as more than 5 successes.
  const spellingsX12 = [...spellings, ...spellings, ...spellings];

  let letThrough = 0;
  let throttled = 0;
  for (const email of spellingsX12) {
    const r = await call("POST", "/api/auth/login", { body: { email, password: "wrongpassword" } });
    if (r.status === 429) throttled++;
    else letThrough++;
  }

  ok("12 attempts at one account yields exactly 5 guesses, not 12", letThrough === 5, `got ${letThrough}`);
  ok("  and the other 7 are 429", throttled === 7, `got ${throttled}`);

  console.log(`\n--- INTEGRATION: event limiter (20/min per user) ---`);
  const A = await makeUser("events-a");
  const B = await makeUser("events-b");

  const posts = [];
  for (let i = 1; i <= 23; i++) {
    posts.push(await call("POST", "/api/events", { apiKey: A.apiKey, body: { type: `t.${i}` }, headers: { "Idempotency-Key": `rl-${stamp}-${i}` } }));
  }

  ok("posts 1-20 return 201 (allowed through)", posts.slice(0, 20).every((r) => r.status === 201), posts.slice(0, 20).map((r) => r.status).join(","));
  ok("post 21 returns 429", posts[20].status === 429, `got ${posts[20].status}`);
  ok("post 22 returns 429", posts[21].status === 429, `got ${posts[21].status}`);
  ok("post 23 returns 429", posts[22].status === 429, `got ${posts[22].status}`);

  const evRetry = posts[20].headers.get("Retry-After");
  ok("event 429 carries Retry-After", /^[1-9][0-9]*$/.test(evRetry ?? ""), `${evRetry}`);
  ok("  and is <= 60", Number(evRetry) <= 60, `${evRetry}s`);

  console.log(`\n--- INTEGRATION: the event key is per user, not global ---`);
  // B has spent nothing. A has spent 23. If the limiter were global, B would be
  // blocked here too.
  const bPost = await call("POST", "/api/events", { apiKey: B.apiKey, body: { type: "b.first" }, headers: { "Idempotency-Key": `rl-b-${stamp}` } });
  ok("a different user is NOT blocked by A's limit", bPost.status === 201, `got ${bPost.status}`);

  console.log(`\n--- INTEGRATION: the limiters do not interfere ---`);
  // A is fully blocked on events. Login must still work for the same identity.
  const login = await call("POST", "/api/auth/login", { body: { email: A.email, password: PW } });
  ok("login still works while that user's events are throttled", login.status === 200, `got ${login.status}`);

  console.log(`\n--- INTEGRATION: the limiter sits AFTER auth ---`);
  // If it ran before auth, req.user.id would be undefined and every unauthed
  // caller would share one bucket. These must be plain 401s, and must not
  // consume anyone's allowance.
  const noCred = await call("POST", "/api/events", { body: { type: "x" }, headers: { "Idempotency-Key": "nope" } });
  ok("unauthenticated event POST → 401, not 429", noCred.status === 401, `got ${noCred.status}`);
  const badKey = await call("POST", "/api/events", { apiKey: "hs_not_a_real_key", body: { type: "x" }, headers: { "Idempotency-Key": "nope" } });
  ok("garbage api key → 401, not 429", badKey.status === 401, `got ${badKey.status}`);
  // A JWT is not an accepted credential on this route at all, so it must 401 at
  // the key check rather than reaching the limiter and consuming A's allowance.
  const jwtOnly = await call("POST", "/api/events", { token: A.token, body: { type: "x" }, headers: { "Idempotency-Key": "nope" } });
  ok("a JWT with no api key → 401, not 429", jwtOnly.status === 401, `got ${jwtOnly.status}`);
  ok("  and A's allowance is untouched by those three attempts", (await call("GET", "/api/events", { token: A.token })).json.length === 20);

  const listAfter = await call("GET", "/api/events", { token: A.token });
  ok("GET /api/events is not rate limited", listAfter.status === 200, `got ${listAfter.status}`);
  ok("  and returns A's 20 accepted events", listAfter.json.length === 20, `got ${listAfter.json.length}`);

  console.log(`\n--- INTEGRATION: the rate-limited POSTs stored nothing ---`);
  const { default: mongoose } = await import("mongoose");
  await mongoose.connect("mongodb://127.0.0.1:27017/hookshot", { serverSelectionTimeoutMS: 10000 });
  const subject = JSON.parse(Buffer.from(A.token.split(".")[1], "base64url").toString()).id;
  const stored = await mongoose.connection.db.collection("events").countDocuments({
    userId: new mongoose.Types.ObjectId(subject),
  });
  ok("exactly 20 events persisted, the 3 rejected by the limiter were not", stored === 20, `got ${stored}`);
  await mongoose.disconnect();
} finally {
  child.kill();
}

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"}: ${pass} passed, ${fail} failed`);
console.log("clear test accounts with the deleteMany command in README.md");
process.exit(fail === 0 ? 0 : 1);