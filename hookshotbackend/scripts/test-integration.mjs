// END-TO-END integration sweep.
//
// The other suites each prove one step in isolation. This one walks the whole
// lifecycle as a single continuous story with one user and one server, in the
// order a real client would:
//
//   signup → login → create endpoint → send event → replay the same event →
//   hit the rate limit → wait for the window → update endpoint → delete endpoint →
//   delete account → old token refused, nothing orphaned
//
// It then sweeps the edge cases and re-confirms every status code the assignment
// asks about against a live request.
//
// WHY IT STARTS ITS OWN SERVER
// The chain has to hit a REAL rate limit, and the shared dev server runs with
// EVENT_RATE_LIMIT raised to 1000 so the volume suites can insert 55 events from
// one user. Testing a 429 against a server with the limit lifted proves nothing, so
// this spawns its own on port 5097 with the shipped defaults.
//
// Run: node scripts/test-integration.mjs   (needs MongoDB up; no server needed)
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PORT = 5097;
const BASE = `http://localhost:${PORT}`;
const MONGO = process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/hookshot";
const PW = "supersecret123";
const stamp = Date.now();

// The shipped defaults. Hardcoded here on purpose: this suite is the one place
// that asserts the real numbers, so it must not inherit them from the environment.
const EVENT_LIMIT = 20;
const LOGIN_LIMIT = 5;

let pass = 0,
  fail = 0;
const ok = (label, cond, extra = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "PASS  " : "FAIL  "}${label}${extra ? "  → " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { body, token, apiKey, headers = {} } = {}) {
  // fetch() throws on a GET/HEAD with a body, and this sweep deliberately reuses
  // one catch-all body across a table of routes — so drop it where it is illegal
  // rather than having every call site remember to.
  const sendsBody = body !== undefined && method !== "GET" && method !== "HEAD";
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(sendsBody ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { "X-Hookshot-Key": apiKey } : {}),
      ...headers,
    },
    ...(sendsBody ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => ({})), headers: res.headers };
}

const jwtFrom = (res) => {
  const raw = res.headers.getSetCookie?.().find((c) => c.startsWith("hookshot_token="));
  return raw ? decodeURIComponent(raw.slice("hookshot_token=".length).split(";")[0]) : undefined;
};
const userIdOf = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).id;

const signup = (email) => call("POST", "/api/auth/signup", { body: { email, password: PW } });
const login = (email, password = PW) => call("POST", "/api/auth/login", { body: { email, password } });
// POST /api/events is authenticated by the API KEY, not the session token: the
// caller is a developer's backend pushing a webhook, and it has no browser
// session. Takes the raw key so a caller can also deliberately send a bad one.
const postEvent = (apiKey, key, body = { type: "order.created" }) =>
  call("POST", "/api/events", { apiKey, body, headers: { "Idempotency-Key": key } });
const mkEndpoint = (token, url) => call("POST", "/api/endpoints", { token, body: { url } });
const patchEndpoint = (token, id, body) => call("PATCH", `/api/endpoints/${id}`, { token, body });
const delEndpoint = (token, id) => call("DELETE", `/api/endpoints/${id}`, { token });

// ---------------------------------------------------------- own server
console.log(`--- starting a server on :${PORT} with SHIPPED limits (events ${EVENT_LIMIT}/min, login ${LOGIN_LIMIT}/min) ---`);
const child = spawn(process.execPath, [path.join(ROOT, "src/server.js")], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), LOGIN_RATE_LIMIT: "", EVENT_RATE_LIMIT: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

let up = false;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) { up = true; break; }
  } catch {}
  await sleep(250);
}
if (!up) {
  console.error("FAIL  server never came up — is MongoDB running?");
  child.kill();
  process.exit(1);
}
ok("server is up on :5097 with the shipped rate limits", true);

// Direct Mongo access, for the orphan check at the end.
const mongoose = (await import("mongoose")).default;
await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 10_000 });
const ObjectId = mongoose.Types.ObjectId;
const col = mongoose.connection.db.collection.bind(mongoose.connection.db);

try {
  // =====================================================================
  console.log(`\n=== THE CHAIN: one user, one server, start to finish ===`);
  // =====================================================================
  const EMAIL = `int-chain-${stamp}@example.com`;

  console.log(`\n--- 1. signup, then log in ---`);
  const su = await signup(EMAIL);
  ok("POST /api/auth/signup → 201", su.status === 201, `got ${su.status}`);
  const chainToken = jwtFrom(su);
  ok("  signup returns no token in the body", su.json.token === undefined);
  // The API key is the credential POST /api/events actually checks. Signup
  // returns it, because the Settings page has to show it.
  const chainKey = su.json.apiKey;
  ok("  signup returns an apiKey", typeof chainKey === "string" && chainKey.length > 0, chainKey);

  const li = await login(EMAIL);
  ok("POST /api/auth/login → 200", li.status === 200, `got ${li.status}`);
  const loginToken = jwtFrom(li);
  ok("  login sets a session cookie", !!loginToken);
  ok("  login and signup share one subject", userIdOf(loginToken) === userIdOf(chainToken));
  const uid = new ObjectId(userIdOf(chainToken));

  console.log(`\n--- 2. create an endpoint ---`);
  const ep = await mkEndpoint(chainToken, "http://localhost:3000/hook");
  ok("POST /api/endpoints → 201", ep.status === 201, `got ${ep.status}`);
  const EP = ep.json._id;
  ok("  it comes back active", ep.json.active === true);
  ok("  the url is stored verbatim", ep.json.url === "http://localhost:3000/hook", ep.json.url);

  console.log(`\n--- 3. send an event: it is recorded against that endpoint ---`);
  const KEY = `int-chain-${stamp}-order-1`;
  const ev1 = await postEvent(chainKey, KEY, { type: "order.created", data: { id: 7 } });
  ok("POST /api/events → 201", ev1.status === 201, `got ${ev1.status}`);
  ok("  the event carries an idempotencyKey", ev1.json.idempotencyKey === KEY, ev1.json.idempotencyKey);
  ok("  endpointIds includes the new endpoint", (ev1.json.endpointIds ?? []).includes(EP), JSON.stringify(ev1.json.endpointIds));
  ok("  the payload survives intact", ev1.json.data?.id === 7, JSON.stringify(ev1.json.data));
  const EV1 = ev1.json._id;

  console.log(`\n--- 4. replay the SAME event (same Idempotency-Key) ---`);
  const ev2 = await postEvent(chainKey, KEY, { type: "order.created", data: { id: 7 } });
  ok("the replay returns 200, not 201", ev2.status === 200, `got ${ev2.status}`);
  ok("  and the SAME event id — no duplicate", ev2.json._id === EV1, `${ev2.json._id} vs ${EV1}`);
  const listed = await call("GET", "/api/events", { token: chainToken });
  ok("  exactly one event is stored for that key", listed.json.filter((e) => e.idempotencyKey === KEY).length === 1, `got ${listed.json.filter((e) => e.idempotencyKey === KEY).length}`);

  console.log(`\n--- 5. exhaust the event rate limit ---`);
  const spentBefore = 2; // steps 3 and 4 above
  const statuses = [];
  let blocked = null;
  for (let i = 0; i < 40 && !blocked; i++) {
    const r = await postEvent(chainKey, `int-exhaust-${stamp}-${i}`);
    statuses.push(r.status);
    if (r.status === 429) blocked = r;
  }
  const allowed = statuses.filter((s) => s === 201).length;
  ok(`events 1-${EVENT_LIMIT} are accepted`, allowed === EVENT_LIMIT - spentBefore, `${allowed} accepted, ${spentBefore} already spent`);
  ok("the next one is 429", statuses[allowed] === 429, `got ${statuses[allowed]}`);
  const retryAfter = blocked.headers.get("Retry-After");
  ok("the 429 carries a Retry-After header", retryAfter !== null, `${retryAfter}`);
  ok("  Retry-After is a positive integer", /^[1-9][0-9]*$/.test(retryAfter ?? ""), `${retryAfter}`);
  ok("  and is at most the 60s window", Number(retryAfter) <= 60, `${retryAfter}s`);
  ok("  with an error message in the body", typeof blocked.json.error === "string" && blocked.json.error.length > 0, blocked.json.error);

  const throttledStored = await call("GET", "/api/events", { token: chainToken });
  ok("the throttled request stored nothing", throttledStored.json.filter((e) => String(e.idempotencyKey).startsWith("int-exhaust")).length === allowed, `stored=${throttledStored.json.filter((e) => String(e.idempotencyKey).startsWith("int-exhaust")).length}`);

  console.log(`\n--- 6. wait for the window to reset, then resume ---`);
  const waitS = Number(retryAfter) + 1;
  console.log(`    (sleeping ${waitS}s — the limiter's window is hardcoded to 60s in routes/events.js, so this wait is real)`);
  await sleep(waitS * 1000);
  const resumed = await postEvent(chainKey, `int-resumed-${stamp}`);
  ok("normal requests resume after the window → 201", resumed.status === 201, `got ${resumed.status}`);

  console.log(`\n--- 7. update the endpoint; the cached fan-out must follow ---`);
  const renamed = await patchEndpoint(chainToken, EP, { url: "http://localhost:4000/hook-v2" });
  ok("PATCH /api/endpoints/:id → 200", renamed.status === 200, `got ${renamed.status}`);
  ok("  the new url is returned", renamed.json.url === "http://localhost:4000/hook-v2", renamed.json.url);
  const afterRename = await postEvent(chainKey, `int-after-rename-${stamp}`);
  ok("  the next event still fans out to it (invalidation, not a stale miss)", (afterRename.json.endpointIds ?? []).includes(EP), JSON.stringify(afterRename.json.endpointIds));

  const paused = await patchEndpoint(chainToken, EP, { active: false });
  ok("PATCH active:false → 200", paused.status === 200 && paused.json.active === false, `got ${paused.status}`);
  const afterPause = await postEvent(chainKey, `int-after-pause-${stamp}`);
  ok("  a paused endpoint drops out of the fan-out", !(afterPause.json.endpointIds ?? []).includes(EP), JSON.stringify(afterPause.json.endpointIds));
  await patchEndpoint(chainToken, EP, { active: true });
  const afterResume = await postEvent(chainKey, `int-after-resume-${stamp}`);
  ok("  and comes back when re-activated", (afterResume.json.endpointIds ?? []).includes(EP), JSON.stringify(afterResume.json.endpointIds));

  console.log(`\n--- 8. delete the endpoint; it receives nothing further ---`);
  const del = await delEndpoint(chainToken, EP);
  ok("DELETE /api/endpoints/:id → 200", del.status === 200, `got ${del.status}`);
  const afterDelete = await postEvent(chainKey, `int-after-delete-${stamp}`);
  ok("  the next event does NOT include it", !(afterDelete.json.endpointIds ?? []).includes(EP), JSON.stringify(afterDelete.json.endpointIds));
  const stillThere = await call("GET", "/api/endpoints", { token: chainToken });
  ok("  and it is gone from the endpoint list", !stillThere.json.some((e) => e._id === EP));
  ok("  deleting twice → 404", (await delEndpoint(chainToken, EP)).status === 404);
  ok("  older events still list it (that is a snapshot, not a live lookup)", (await call("GET", "/api/events", { token: chainToken })).json.some((e) => e._id === EV1 && (e.endpointIds ?? []).includes(EP)));

  // =====================================================================
  console.log(`\n=== EDGE CASES ===`);
  // =====================================================================

  console.log(`\n--- (a) invalid URL on create and update → 400 ---`);
  for (const [label, url] of [["'notaurl'", "notaurl"], ["empty string", ""], ["no scheme", "www.example.com"], ["ftp scheme", "ftp://example.com/h"], ["javascript: scheme", "javascript:alert(1)"], ["a number", 42], ["null", null]]) {
    const r = await mkEndpoint(chainToken, url);
    ok(`POST url=${label} → 400`, r.status === 400, `got ${r.status}`);
  }
  ok("POST with no url field at all → 400", (await call("POST", "/api/endpoints", { token: chainToken, body: {} })).status === 400);
  const victim = await mkEndpoint(chainToken, "https://edge.example.com/hook");
  for (const [label, url] of [["'notaurl'", "notaurl"], ["ftp scheme", "ftp://example.com/h"]]) {
    const r = await patchEndpoint(chainToken, victim.json._id, { url });
    ok(`PATCH url=${label} → 400`, r.status === 400, `got ${r.status}`);
  }
  ok("PATCH active='yes' (not boolean) → 400", (await patchEndpoint(chainToken, victim.json._id, { active: "yes" })).status === 400);
  ok("PATCH with an empty body → 400", (await patchEndpoint(chainToken, victim.json._id, {})).status === 400);
  ok("a rejected PATCH did not change the endpoint", (await call("GET", "/api/endpoints", { token: chainToken })).json.find((e) => e._id === victim.json._id).url === "https://edge.example.com/hook");

  console.log(`\n--- (b) missing Idempotency-Key on event creation → 400 ---`);
  const noKey = await call("POST", "/api/events", { apiKey: chainKey, body: { type: "no.key" } });
  ok("POST /api/events with no Idempotency-Key → 400", noKey.status === 400, `got ${noKey.status}`);
  ok("  and it stored nothing", !(await call("GET", "/api/events", { token: chainToken })).json.some((e) => e.type === "no.key"));
  const emptyKey = await call("POST", "/api/events", { apiKey: chainKey, body: { type: "empty.key" }, headers: { "Idempotency-Key": "" } });
  ok("an empty Idempotency-Key → 400", emptyKey.status === 400, `got ${emptyKey.status}`);

  console.log(`\n--- (c) malformed endpoint id on PATCH/DELETE → 404, never 500 ---`);
  for (const bad of ["not-an-object-id", "123", "%20", "../../etc/passwd", "z".repeat(24)]) {
    const p = await patchEndpoint(chainToken, bad, { active: false });
    ok(`PATCH malformed id ${JSON.stringify(bad)} → 404`, p.status === 404, `got ${p.status}`);
    ok(`  and not a 500`, p.status !== 500);
    const d = await delEndpoint(chainToken, bad);
    ok(`DELETE malformed id ${JSON.stringify(bad)} → 404`, d.status === 404, `got ${d.status}`);
  }

  console.log(`\n--- (d) every protected route, unauthenticated → 401 ---`);
  // The complete inventory. A route added later without auth shows up here as
  // a non-401, which is the whole reason this list is spelled out rather than
  // left to whatever the other suites happened to touch.
  //
  // `cred` names the credential each route actually checks, so the assertion
  // below states what was withheld rather than always saying "no token" — which
  // would be a lie for the two event routes.
  const PROTECTED = [
    ["GET", "/api/auth/me", "token"],
    ["POST", "/api/auth/regenerate-key", "token"],
    ["PATCH", "/api/auth/password", "token"],
    ["DELETE", "/api/account", "token"],
    ["GET", "/api/endpoints", "token"],
    ["POST", "/api/endpoints", "token"],
    ["PATCH", `/api/endpoints/${victim.json._id}`, "token"],
    ["DELETE", `/api/endpoints/${victim.json._id}`, "token"],
    ["GET", "/api/events", "token"],
    ["POST", "/api/events", "apiKey"],
  ];
  for (const [method, p, cred] of PROTECTED) {
    const r = await call(method, p, {
      body: { url: "https://x.example.com/h", type: "t", currentPassword: PW, newPassword: PW },
      headers: { "Idempotency-Key": "unauth" },
    });
    ok(`${method} ${p} with no ${cred === "apiKey" ? "X-Hookshot-Key" : "token"} → 401`, r.status === 401, `got ${r.status}`);
  }
  for (const [label, tok] of [["a garbage token", "not.a.jwt"], ["an empty bearer", ""], ["a token signed with the wrong secret", "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMzQ1Njc4OTAxMjM0NTY3ODkwIn0.wrongsignature"]]) {
    const r = await call("GET", "/api/endpoints", { token: tok || undefined, headers: tok === "" ? { Authorization: "Bearer " } : {} });
    ok(`${label} → 401`, r.status === 401, `got ${r.status}`);
  }
  // The split is one-directional. An API key opens POST and nothing else: the
  // dashboard listing stays session-only, so a leaked key can't read history.
  ok("GET /api/events with only an apiKey → 401", (await call("GET", "/api/events", { apiKey: chainKey })).status === 401);
  ok("POST /api/events with only a JWT → 401", (await call("POST", "/api/events", { token: chainToken, body: { type: "t" }, headers: { "Idempotency-Key": "jwt-only" } })).status === 401);

  console.log(`\n--- (e) concurrent duplicates: 10 simultaneous posts, one key ---`);
  // Sequential duplicates are easy. This is the case the unique compound index
  // exists for, and it is the one that cannot be reasoned about — only measured.
  const RACE_KEY = `int-race-${stamp}`;
  const racers = await Promise.all(Array.from({ length: 10 }, () => postEvent(chainKey, RACE_KEY, { type: "raced" })));
  const created = racers.filter((r) => r.status === 201);
  const deduped = racers.filter((r) => r.status === 200);
  const other = racers.filter((r) => r.status !== 201 && r.status !== 200);
  ok("exactly one of the 10 is a 201", created.length === 1, `${created.length} × 201`);
  ok("the other 9 are 200 (deduplicated)", deduped.length === 9, `${deduped.length} × 200`);
  ok("  none errored", other.length === 0, other.map((r) => r.status).join(","));
  const raceIds = new Set(racers.map((r) => r.json._id));
  ok("  all 10 responses carry the SAME event id", raceIds.size === 1, `${raceIds.size} distinct ids`);
  const raceStored = (await call("GET", "/api/events", { token: chainToken })).json.filter((e) => e.idempotencyKey === RACE_KEY);
  ok("  exactly one row is stored", raceStored.length === 1, `got ${raceStored.length}`);
  const raceDb = await col("events").countDocuments({ idempotencyKey: RACE_KEY });
  ok("  and the database agrees", raceDb === 1, `got ${raceDb}`);

  console.log(`\n--- (f) login rate limit → 429 + Retry-After ---`);
  // A throwaway account, so exhausting its login bucket cannot lock the chain's own
  // user out mid-sweep.
  const victimEmail = `int-rl-victim-${stamp}@example.com`;
  await signup(victimEmail);
  const attempts = [];
  for (let i = 0; i < LOGIN_LIMIT + 2; i++) attempts.push(await login(victimEmail, "wrongpassword"));
  ok(`logins 1-${LOGIN_LIMIT} pass through the limiter (401, wrong password)`, attempts.slice(0, LOGIN_LIMIT).every((r) => r.status === 401), attempts.map((r) => r.status).join(","));
  ok(`login ${LOGIN_LIMIT + 1} → 429`, attempts[LOGIN_LIMIT].status === 429, `got ${attempts[LOGIN_LIMIT].status}`);
  const rlRetry = attempts[LOGIN_LIMIT].headers.get("Retry-After");
  ok("  the login 429 carries Retry-After", /^[1-9][0-9]*$/.test(rlRetry ?? ""), `${rlRetry}`);
  ok("  even the CORRECT password is now 429 (limiter is pre-auth)", (await login(victimEmail)).status === 429);
  const otherEmail = await login(`int-rl-other-${stamp}@example.com`, "wrongpassword");
  ok("  a different email from the same IP is not blocked", otherEmail.status === 401, `got ${otherEmail.status}`);

  console.log(`\n--- (g) cross-user access → 404, never 403 ---`);
  const OTHER = `int-other-${stamp}@example.com`;
  const otherSu = await signup(OTHER);
  const otherToken = jwtFrom(otherSu);
  const mine = await mkEndpoint(chainToken, "https://mine.example.com/hook");
  ok("the chain user owns an endpoint", mine.status === 201);
  const xPatch = await patchEndpoint(otherToken, mine.json._id, { active: false, url: "https://hijacked.example.com/h" });
  ok("B PATCH A's endpoint → 404 (not 403)", xPatch.status === 404, `got ${xPatch.status}`);
  ok("B DELETE A's endpoint → 404 (not 403)", (await delEndpoint(otherToken, mine.json._id)).status === 404);
  const xList = await call("GET", "/api/endpoints", { token: otherToken });
  ok("B's list does not contain A's endpoint", !xList.json.some((e) => e._id === mine.json._id));
  ok("A's endpoint survived B's attempt, un-hijacked", (await call("GET", "/api/endpoints", { token: chainToken })).json.find((e) => e._id === mine.json._id)?.url === "https://mine.example.com/hook");
  const missing = await patchEndpoint(otherToken, "000000000000000000000000", { active: false });
  ok("a nonexistent id gives the SAME 404 body (indistinguishable)", missing.json.error === xPatch.json.error, `${xPatch.json.error} vs ${missing.json.error}`);

  // =====================================================================
  console.log(`\n=== STATUS CODES, each confirmed against a live request ===`);
  // =====================================================================
  const codes = {};
  codes["201 new event"] = (await postEvent(chainKey, `int-code-201-${stamp}`)).status;
  codes["200 duplicate event"] = (await postEvent(chainKey, `int-code-201-${stamp}`)).status;
  const z = await mkEndpoint(otherToken, "https://zebra.example.com/h");
  codes["404 another user's endpoint"] = (await patchEndpoint(chainToken, z.json._id, { active: false })).status;
  codes["400 invalid input"] = (await mkEndpoint(chainToken, "notaurl")).status;
  codes["400 missing Idempotency-Key"] = (await call("POST", "/api/events", { apiKey: chainKey, body: { type: "t" } })).status;
  codes["409 duplicate signup"] = (await signup(EMAIL)).status;
  codes["401 unauthenticated"] = (await call("GET", "/api/endpoints")).status;
  codes["429 rate limited"] = blocked.status;

  console.log(`\n    code   live request`);
  for (const [label, status] of Object.entries(codes)) console.log(`    ${status}   ${label}`);

  ok("201 for a newly created event", codes["201 new event"] === 201, `got ${codes["201 new event"]}`);
  ok("200 for a duplicate event", codes["200 duplicate event"] === 200, `got ${codes["200 duplicate event"]}`);
  ok("404 for another user's endpoint", codes["404 another user's endpoint"] === 404, `got ${codes["404 another user's endpoint"]}`);
  ok("400 for invalid input", codes["400 invalid input"] === 400, `got ${codes["400 invalid input"]}`);
  ok("400 for a missing Idempotency-Key", codes["400 missing Idempotency-Key"] === 400, `got ${codes["400 missing Idempotency-Key"]}`);
  ok("409 for a duplicate signup", codes["409 duplicate signup"] === 409, `got ${codes["409 duplicate signup"]}`);
  ok("401 for an unauthenticated request", codes["401 unauthenticated"] === 401, `got ${codes["401 unauthenticated"]}`);
  ok("429 when the rate limit is exceeded", codes["429 rate limited"] === 429, `got ${codes["429 rate limited"]}`);
  ok("Retry-After present on every 429 seen in this sweep", [retryAfter, rlRetry].every((v) => /^[1-9][0-9]*$/.test(v ?? "")), `${retryAfter}, ${rlRetry}`);

  // =====================================================================
  console.log(`\n--- 9. delete the account: token refused, nothing orphaned ---`);
  // =====================================================================
  const ownedEndpoints = (await call("GET", "/api/endpoints", { token: chainToken })).json.length;
  const ownedEvents = (await call("GET", "/api/events", { token: chainToken })).json.length;
  ok("the account owns data worth cascading", ownedEndpoints > 0 && ownedEvents > 0, `${ownedEndpoints} endpoints, ${ownedEvents} events`);

  const delAcct = await call("DELETE", "/api/account", { token: chainToken });
  ok("DELETE /api/account → 200", delAcct.status === 200, `got ${delAcct.status}`);
  ok("  it clears the session cookie", (delAcct.headers.getSetCookie?.() ?? []).some((c) => /hookshot_token=;/.test(c)));

  for (const [method, p] of [["GET", "/api/endpoints"], ["GET", "/api/events"], ["GET", "/api/auth/me"], ["POST", "/api/endpoints"], ["POST", "/api/events"], ["DELETE", "/api/account"], ["POST", "/api/auth/regenerate-key"], ["PATCH", "/api/auth/password"]]) {
    const r = await call(method, p, { token: chainToken, body: { url: "https://ghost.example.com/h", type: "ghost", currentPassword: PW, newPassword: PW }, headers: { "Idempotency-Key": "ghost" } });
    ok(`  ${method} ${p} with the old token → 401`, r.status === 401, `got ${r.status}`);
  }
  const forged = await call("GET", "/api/endpoints", { token: "not.a.jwt" });
  ok("  the 401 body is indistinguishable from a forged token's", JSON.stringify(forged.json) === JSON.stringify((await call("GET", "/api/endpoints", { token: chainToken })).json));
  ok("the deleted account can no longer log in → 401", (await login(EMAIL)).status === 401);

  ok("no orphaned endpoints remain", (await col("endpoints").countDocuments({ userId: uid })) === 0, `got ${await col("endpoints").countDocuments({ userId: uid })}`);
  ok("no orphaned events remain", (await col("events").countDocuments({ userId: uid })) === 0, `got ${await col("events").countDocuments({ userId: uid })}`);
  ok("the user document itself is gone", (await col("users").countDocuments({ _id: uid })) === 0);
  const globalOrphans = await col("endpoints").countDocuments({ userId: { $nin: (await col("users").find({}, { projection: { _id: 1 } }).toArray()).map((u) => u._id) } });
  ok("and no endpoint anywhere points at a missing user", globalOrphans === 0, `got ${globalOrphans}`);

  // The other account must be entirely unaffected by the first one's deletion.
  ok("the other account still works", (await call("GET", "/api/endpoints", { token: otherToken })).status === 200);
  ok("  and its own endpoint is untouched", (await call("GET", "/api/endpoints", { token: otherToken })).json.some((e) => e._id === z.json._id));
} finally {
  await mongoose.disconnect();
  child.kill();
}

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"}: ${pass} passed, ${fail} failed`);
console.log(`test users left behind: int-*@example.com — clear them with the deleteMany command in README.md`);
process.exit(fail === 0 ? 0 : 1);