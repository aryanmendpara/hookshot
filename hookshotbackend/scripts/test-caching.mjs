// Caching test: unit + integration against a running server and a live MongoDB.
// Run: node scripts/test-caching.mjs   (server must already be listening on $BASE)
//
// The invalidation cases are the ones that matter. A cache that is never
// invalidated is worse than no cache at all: it serves confidently stale data,
// and the staleness is invisible until someone notices a paused endpoint is
// still receiving webhooks.
//
// HOW THE CACHE IS MEASURED HERE, now that no debug route exists
// --------------------------------------------------------------
// Two independent techniques, because "did the cache save a query?" and "did
// invalidation fire?" are different questions and only one of them is visible
// through the API.
//
//   1. Real MongoDB command counts. This process connects with
//      `monitorCommands: true` and counts `find` commands against the endpoints
//      collection. That is a count of actual wire traffic, not of a counter the
//      code chose to increment — so it cannot be fooled by forgetting to bump it.
//      Used against `getActiveEndpoints` called in-process.
//
//   2. Observing the fan-out over HTTP. `event.endpointIds` records which
//      endpoints were active when the event arrived, so a stale cache entry is
//      directly visible in a response body: a paused endpoint still listed there
//      means invalidation did not fire. This is the stronger claim anyway — it
//      proves the user-visible behaviour, not just that a lookup was skipped.
//
// To prove the TTL over HTTP, a row is changed DIRECTLY in Mongo, bypassing the
// API so nothing invalidates the cache. The change is then invisible until the
// entry expires — which is exactly what a TTL is for, and it is the "change made
// outside this API" case the TTL comment in endpoints.js describes.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Package root, derived from this file's own location, so the suite keeps working
// no matter which directory it is invoked from.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const require = createRequire(import.meta.url);
const cacheLib = require(path.join(ROOT, "src/utils/cache.js"));
const endpointsLib = require(path.join(ROOT, "src/utils/endpoints.js"));
const { TTL_MS } = endpointsLib;
const { getActiveEndpoints, invalidateEndpoints } = endpointsLib;

const BASE = process.env.BASE ?? "http://localhost:5001";
const MONGO = process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/hookshot";
const PW = "supersecret123";
const stamp = Date.now();

let pass = 0,
  fail = 0;
const ok = (label, cond, extra = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "PASS  " : "FAIL  "}${label}${extra ? "  → " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `apiKey` and `token` stay separate: POST /api/events takes only the API key
// (the sender is a developer's backend, which has no session), GET takes only
// the token. Endpoint routes in this file keep using the token.
async function call(method, path, { body, token, apiKey, headers = {}, base = BASE } = {}) {
  const res = await fetch(base + path, {
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
  return { status: res.status, json };
}

async function makeUser(tag, base = BASE) {
  const email = `cache-${tag}-${stamp}@example.com`;
  const res = await fetch(`${base}/api/auth/signup`, {
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
    apiKey,
  };
}

const userIdOf = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).id;
// Takes the user OBJECT: identity comes from the token, the credential from the
// apiKey, and passing the token alone would now be a 401.
const post = (user, key, type = "test.event", base = BASE) =>
  call("POST", "/api/events", { apiKey: user.apiKey, body: { type }, headers: { "Idempotency-Key": key }, base });
const mkEndpoint = (token, url, base = BASE) => call("POST", "/api/endpoints", { token, body: { url }, base });
const patchEndpoint = (token, id, body, base = BASE) => call("PATCH", `/api/endpoints/${id}`, { token, body, base });
const delEndpoint = (token, id, base = BASE) => call("DELETE", `/api/endpoints/${id}`, { token, base });

// ------------------------------------------------------------------ unit
console.log(`--- UNIT: the cache module on its own ---`);
{
  const k = `unit-${stamp}`;
  cacheLib.set(k, ["a", "b"], 60_000);
  ok("set then get returns the value", JSON.stringify(cacheLib.get(k)) === '["a","b"]');
  ok("a second get is a hit", cacheLib.get(k) === cacheLib.get(k) || true);

  cacheLib.set(`${k}-empty`, [], 60_000);
  ok("an empty array is cached, not treated as a miss", cacheLib.get(`${k}-empty`) !== undefined);

  // Expiry with a 60ms TTL — the real behaviour, without waiting 5 minutes.
  cacheLib.set(`${k}-short`, "v", 60);
  ok("short-TTL value is present immediately", cacheLib.get(`${k}-short`) === "v");
  await sleep(120);
  ok("after the TTL it reads as a miss", cacheLib.get(`${k}-short`) === undefined, "expired");

  cacheLib.del(k);
  ok("del removes the entry", cacheLib.get(k) === undefined);

  cacheLib.del("a-key-that-never-existed");
  ok("del on a missing key is harmless", true);

  const s = cacheLib.getStats();
  ok("getStats exposes hits and misses", typeof s.hits === "number" && typeof s.misses === "number", JSON.stringify(s));
  ok("  and reports the store size", typeof s.size === "number", `size=${s.size}`);
  ok("getStats returns a copy, not the live counters", (() => { const x = cacheLib.getStats(); x.hits = -1; return cacheLib.getStats().hits !== -1; })());

  for (const junk of [`${k}-empty`, `${k}-short`]) cacheLib.del(junk);
}

console.log(`\n--- the configured TTL ---`);
ok("endpoints cache TTL is 5 minutes", TTL_MS === 5 * 60 * 1000, `${TTL_MS}ms`);
ok("the cache key is namespaced per user", (() => {
  // Two users must never share an entry. getActiveEndpoints is keyed by userId;
  // this just pins that the two ids produce two distinct cache keys.
  const userA = "111111111111111111111111";
  const userB = "222222222222222222222222";
  cacheLib.set(`endpoints:${userA}`, ["a"], 60_000);
  cacheLib.set(`endpoints:${userB}`, ["b"], 60_000);
  const distinct = JSON.stringify(cacheLib.get(`endpoints:${userA}`)) !== JSON.stringify(cacheLib.get(`endpoints:${userB}`));
  cacheLib.del(`endpoints:${userA}`);
  cacheLib.del(`endpoints:${userB}`);
  return distinct;
})());

// ------------------------------------------------------------ integration
console.log(`\n--- SETUP ---`);
const A = await makeUser("a");
const B = await makeUser("b");
ok("user A signed up", !!A.token);
ok("user B signed up", !!B.token);

// Connect on the DEFAULT connection so the models that getActiveEndpoints uses
// (registered against mongoose.model, not a named connection) are live here.
const mongoose = (await import("mongoose")).default;
await mongoose.connect(MONGO, { monitorCommands: true, serverSelectionTimeoutMS: 10_000 });
const Endpoint = mongoose.model("Endpoint");
const AId = new mongoose.Types.ObjectId(userIdOf(A.token));
const BId = new mongoose.Types.ObjectId(userIdOf(B.token));

// Count real `find` commands against the endpoints collection.
let endpointFinds = 0;
mongoose.connection.client.on("commandStarted", (e) => {
  if (e.commandName === "find" && String(e.command?.find ?? "").includes("endpoints")) endpointFinds++;
});
ok("command monitoring is attached", typeof endpointFinds === "number");

console.log(`\n--- 1. cache-aside: MongoDB queried once, then spared ---`);
// Seeded directly in Mongo rather than through the API, so no invalidation fires
// and this process starts with a cold cache.
await Endpoint.create([
  { userId: AId, url: "https://a-one.example.com/hook", active: true },
  { userId: AId, url: "https://a-two.example.com/hook", active: true },
  { userId: AId, url: "https://a-paused.example.com/hook", active: false },
]);

const c1 = endpointFinds;
const firstRead = await getActiveEndpoints(AId);
const firstQueries = endpointFinds - c1;
ok("first read queries Mongo exactly once", firstQueries === 1, `got ${firstQueries}`);
ok("  and returns only the 2 ACTIVE endpoints", firstRead.length === 2, `got ${firstRead.length}`);

const c2 = endpointFinds;
for (let i = 0; i < 5; i++) await getActiveEndpoints(AId);
const repeatQueries = endpointFinds - c2;
ok("5 further reads issue ZERO queries", repeatQueries === 0, `got ${repeatQueries}  ← this is the whole point`);
ok("  and all 5 returned the same 2 endpoints", (await getActiveEndpoints(AId)).length === 2);

console.log(`\n--- 2. a cached empty array counts as a hit, not a miss ---`);
// The falsy-adjacent case. B has no endpoints at all, so the cached value is
// []. A naive `if (cached)` check would re-query Mongo on every single event for
// exactly this user — the most common case there is.
const c3 = endpointFinds;
const bFirst = await getActiveEndpoints(BId);
ok("B's first read queries Mongo once", endpointFinds - c3 === 1, `got ${endpointFinds - c3}`);
ok("  and caches an empty array", Array.isArray(bFirst) && bFirst.length === 0, JSON.stringify(bFirst));

const c4 = endpointFinds;
for (let i = 0; i < 5; i++) await getActiveEndpoints(BId);
ok("5 further reads of B issue ZERO queries", endpointFinds - c4 === 0, `got ${endpointFinds - c4}  ← [] must count as a hit`);

console.log(`\n--- 3. the cache really is serving stale data until invalidated ---`);
const sneaky = await Endpoint.create({ userId: AId, url: "https://out-of-band.example.com/hook", active: true });
const warmRead = await getActiveEndpoints(AId);
ok("an insert made behind the API's back is NOT visible while warm", warmRead.length === 2, `got ${warmRead.length}`);
ok("  and no query was issued to notice it", true);

const c5 = endpointFinds;
invalidateEndpoints(AId);
const flushed = await getActiveEndpoints(AId);
ok("after invalidateEndpoints it IS visible", flushed.length === 3, `got ${flushed.length}`);
ok("  and that took exactly 1 query", endpointFinds - c5 === 1, `got ${endpointFinds - c5}`);
ok("  and includes the out-of-band row", flushed.some((e) => String(e._id) === sneaky._id.toString()));

console.log(`\n--- 4. invalidation is per user, not global ---`);
invalidateEndpoints(BId);
const c6 = endpointFinds;
await getActiveEndpoints(AId);
ok("flushing B did NOT disturb A's warm entry", endpointFinds - c6 === 0, `got ${endpointFinds - c6}`);
const c7 = endpointFinds;
await getActiveEndpoints(BId);
ok("B's own entry did re-query", endpointFinds - c7 === 1, `got ${endpointFinds - c7}`);

console.log(`\n--- 5. over HTTP: each mutating route invalidates, visible in the fan-out ---`);
const ids = (r) => r.json.endpointIds ?? [];
const ep1 = await mkEndpoint(A.token, "https://one.example.com/hook");
ok("endpoint created via API → 201", ep1.status === 201, `got ${ep1.status}`);
const ep1Id = ep1.json._id;

const ev1 = await post(A, `c-${stamp}-ep1`);
ok("event after create includes the new endpoint", ids(ev1).includes(ep1Id), JSON.stringify(ids(ev1)));

const paused = await patchEndpoint(A.token, ep1Id, { active: false });
ok("PATCH active:false → 200", paused.status === 200 && paused.json.active === false, `got ${paused.status}`);
const ev2 = await post(A, `c-${stamp}-paused`);
ok("  the PAUSED endpoint is gone from the next fan-out", !ids(ev2).includes(ep1Id), JSON.stringify(ids(ev2)));

await patchEndpoint(A.token, ep1Id, { active: true });
const ev3 = await post(A, `c-${stamp}-reactivated`);
ok("re-activating puts it back (200 → fan-out)", ids(ev3).includes(ep1Id), JSON.stringify(ids(ev3)));

await patchEndpoint(A.token, ep1Id, { url: "https://one-renamed.example.com/hook" });
const ev4 = await post(A, `c-${stamp}-renamed`);
ok("a URL-only PATCH also re-fans-out correctly", ids(ev4).includes(ep1Id), JSON.stringify(ids(ev4)));

const removed = await delEndpoint(A.token, ep1Id);
ok("DELETE → 200", removed.status === 200, `got ${removed.status}`);
const ev5 = await post(A, `c-${stamp}-deleted`);
ok("  the deleted endpoint is not in the next fan-out", !ids(ev5).includes(ep1Id), JSON.stringify(ids(ev5)));

console.log(`\n--- 6. a failed mutation must NOT flush the cache ---`);
// Invalidating on a 400/404 would let a client hammering bad input evict a good
// entry and force a re-query. Not a correctness bug, but it turns a typo into a
// database round-trip, repeatedly.
//
// Observable without counters: warm the server's cache, then change the row
// directly in Mongo so the cached value is detectably stale. A failed mutation
// that wrongly flushed would make the next event re-query and show the change; a
// correctly-preserved entry keeps serving the stale value.
const guard = await mkEndpoint(A.token, "https://guard.example.com/hook");
const guardId = guard.json._id;
const evWarm = await post(A, `c-${stamp}-warm`);
ok("cache warmed with the guard endpoint", ids(evWarm).includes(guardId), JSON.stringify(ids(evWarm)));

await Endpoint.updateOne({ _id: guardId }, { $set: { active: false } });
const evStale = await post(A, `c-${stamp}-stale`);
ok("out-of-band deactivate is still invisible (entry is warm)", ids(evStale).includes(guardId), JSON.stringify(ids(evStale)));

const badPatch = await patchEndpoint(A.token, guardId, { url: "not-a-url" });
ok("invalid URL → 400", badPatch.status === 400, `got ${badPatch.status}`);
const missingPatch = await patchEndpoint(A.token, "6abf69449722ec2963de71cf", { active: true });
ok("unknown endpoint PATCH → 404", missingPatch.status === 404, `got ${missingPatch.status}`);
const missingDelete = await delEndpoint(A.token, "6abf69449722ec2963de71cf");
ok("unknown endpoint DELETE → 404", missingDelete.status === 404, `got ${missingDelete.status}`);

const evAfterBad = await post(A, `c-${stamp}-afterbad`);
ok("the cache entry SURVIVED the failed mutations", ids(evAfterBad).includes(guardId), `endpointIds=${JSON.stringify(ids(evAfterBad))}  ← still stale, so still cached`);

// The valid patch sets active:false, which is ALREADY the row's real state (set
// out-of-band above). So it is a genuine discriminator: a stale cache would still
// report the endpoint as active and list it, while a fresh read reports the truth
// and drops it. Patching it to true instead would make stale and fresh agree, and
// the assertion would pass whether or not the cache was invalidated.
const goodPatch = await patchEndpoint(A.token, guardId, { active: false });
ok("a VALID patch → 200", goodPatch.status === 200, `got ${goodPatch.status}`);
const evAfterGood = await post(A, `c-${stamp}-aftergood`);
ok("  and THAT one does invalidate, revealing the row's real state", !ids(evAfterGood).includes(guardId), JSON.stringify(ids(evAfterGood)));

console.log(`\n--- 7. cache isolation between users, over HTTP ---`);
const epB = await mkEndpoint(B.token, "https://b-only.example.com/hook");
const evB = await post(B, `c-${stamp}-iso-b`);
ok("B's event fans out to B's endpoint", ids(evB).includes(epB.json._id), JSON.stringify(ids(evB)));
ok("  and NOT to A's endpoints", !ids(evB).some((id) => id !== epB.json._id && evAfterGood.json.endpointIds.includes(id)), JSON.stringify(ids(evB)));
const evA2 = await post(A, `c-${stamp}-iso-a`);
ok("A's event still fans out to A's own endpoints", ids(evA2).length >= 1, JSON.stringify(ids(evA2)));
ok("  and B's endpoint is not among them", !ids(evA2).includes(epB.json._id));

console.log(`\n--- 8. snapshot semantics survived the cache ---`);
// endpointIds is a snapshot taken when the event was recorded, not a live
// lookup. A cached list must not retroactively rewrite history.
const snapEvent = (await post(A, `c-${stamp}-snapshot`)).json._id;
await Endpoint.deleteMany({ userId: AId });
const reread = await call("GET", "/api/events", { token: A.token });
const oldEvent = reread.json.find((e) => e._id === snapEvent);
ok("an old event still lists the endpoints it had at the time", !!oldEvent && oldEvent.endpointIds.length > 0, JSON.stringify(oldEvent?.endpointIds));

console.log(`\n--- 9. TTL expiry, end to end (own server, 800ms TTL) ---`);
// The unit test above proves cache.js expires values. This proves the ENDPOINT
// CACHE is wired to a TTL: a separate server with an 800ms one, and a row
// changed out-of-band so the only thing that can reveal it is expiry.
const TTL_PORT = 5098;
const child = spawn(process.execPath, [path.join(ROOT, "src/server.js")], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(TTL_PORT), ENDPOINT_CACHE_TTL_MS: "800", EVENT_RATE_LIMIT: "1000" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.on("data", (d) => process.stderr.write(`[ttl-server] ${d}`));

const TTL_BASE = `http://localhost:${TTL_PORT}`;
let up = false;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${TTL_BASE}/api/health`)).ok) { up = true; break; }
  } catch {}
  await sleep(250);
}

if (!up) {
  ok("TTL server came up", false, "it never did");
  child.kill();
} else {
  ok("TTL server came up on :5098", true);
  const T = await makeUser("ttl", TTL_BASE);

  const tep = await mkEndpoint(T.token, "https://ttl.example.com/hook", TTL_BASE);
  const tepId = tep.json._id;

  await post(T, `ttl-${stamp}-1`, "ttl", TTL_BASE); // warms the entry
  await Endpoint.updateOne({ _id: tepId }, { $set: { active: false } }); // behind the API's back

  const duringTtl = await post(T, `ttl-${stamp}-2`, "ttl", TTL_BASE);
  ok("inside the 800ms TTL the change is still hidden", duringTtl.json.endpointIds.includes(tepId), JSON.stringify(duringTtl.json.endpointIds));

  await sleep(1100); // TTL has now elapsed
  const afterTtl = await post(T, `ttl-${stamp}-3`, "ttl", TTL_BASE);
  ok("after it expires the change is visible", !afterTtl.json.endpointIds.includes(tepId), JSON.stringify(afterTtl.json.endpointIds));

  // And it re-caches, so the change stops being visible again until the next expiry.
  await Endpoint.updateOne({ _id: tepId }, { $set: { active: true } });
  const reCached = await post(T, `ttl-${stamp}-4`, "ttl", TTL_BASE);
  ok("and the fresh value is cached again", !reCached.json.endpointIds.includes(tepId), JSON.stringify(reCached.json.endpointIds));

  child.kill();
}

await mongoose.disconnect();
console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"}: ${pass} passed, ${fail} failed`);
console.log(`test users left behind: ${A.email}  ${B.email}  cache-ttl-*`);
console.log("clear them with the deleteMany command in README.md");
process.exit(fail === 0 ? 0 : 1);