// Idempotency smoke test against a running server + live MongoDB.
// Run: node scripts/test-idempotency.mjs   (server must already be listening on $BASE)
//
// The point of this file is the concurrent case. Sequential duplicates are easy —
// a "have I seen this key?" lookup handles those. The spec's actual requirement
// is that TEN simultaneous POSTs of one key produce ONE document, which no
// application-level check can deliver. Only the database index can, so these
// tests assert against what the index did, not against a lookup we wrote.
const BASE = process.env.BASE ?? "http://localhost:5001";
const MONGO = process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/hookshot";
const PW = "supersecret123";
const ORIGIN = "http://localhost:5173";
const stamp = Date.now();

let pass = 0,
  fail = 0;
const ok = (label, cond, extra = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "PASS  " : "FAIL  "}${label}${extra ? "  → " + extra : ""}`);
};

// `apiKey` and `token` are deliberately separate parameters: POST /api/events
// accepts only the API key, GET accepts only the token. One blended field would
// let a test hand a route the credential it rejects and still look authenticated.
async function call(method, path, { body, token, apiKey, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { "X-Hookshot-Key": apiKey } : {}),
      Origin: ORIGIN,
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const jwtFrom = (r) => {
  const raw = (r.setCookie ?? []).find((c) => c.startsWith("hookshot_token="));
  return raw ? decodeURIComponent(raw.slice("hookshot_token=".length).split(";")[0]) : undefined;
};

async function makeUser(tag) {
  const email = `idem-${tag}-${stamp}@example.com`;
  const res = await fetch(BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: PW }),
  });
  const json = await res.json().catch(() => ({}));
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const token = jwtFrom({ setCookie });
  if (res.status !== 201 || !token) throw new Error(`setup failed for ${email}: ${res.status}`);
  // Signup returns publicUser(), which carries the generated apiKey.
  return { email, token, apiKey: json.apiKey };
}

// POST /api/events authenticates with the API key, not the session token — this
// suite's `token` argument is the user's identity, `apiKey` is the credential.
const KEY = (v) => ({ "Idempotency-Key": v });
const postEvent = (u, key, body) =>
  call("POST", "/api/events", { apiKey: u.apiKey, body, headers: KEY(key) });

console.log(`--- setup: two users ---`);
const A = await makeUser("a");
const B = await makeUser("b");
ok("User A signed up", !!A.token);
ok("User B signed up", !!B.token);
ok("  A has an apiKey", typeof A.apiKey === "string" && A.apiKey.length > 0);

console.log(`\n--- the unique index exists at the DB level ---`);
// Behavioural assertions below would also pass if someone implemented this with
// an application-level "seen this key?" check. That version is exactly what
// fails under concurrency, so the index itself has to be asserted.
const mongoose = (await import("mongoose")).default;
await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 10000 });
const idx = await mongoose.connection.db.collection("events").indexes();
const uniq = idx.find((i) => i.key?.userId === 1 && i.key?.idempotencyKey === 1);
ok("a compound index on {userId, idempotencyKey} exists", !!uniq, JSON.stringify(uniq?.key));
ok("  and it is UNIQUE", uniq?.unique === true, `unique=${uniq?.unique}`);
const listIdx = idx.find((i) => i.key?.userId === 1 && i.key?.createdAt === -1);
ok("the {userId, createdAt, _id} list index survived", !!listIdx, JSON.stringify(listIdx?.key));

const countBy = (userId, key) =>
  mongoose.connection.db
    .collection("events")
    .countDocuments({ userId: new mongoose.Types.ObjectId(userId), idempotencyKey: key });

const aId = jwtSubject(A.token);
const bId = jwtSubject(B.token);

console.log(`\n--- SEQUENTIAL duplicate ---`);
const seqKey = `seq-${stamp}`;
const payload = { type: "invoice.paid", data: { invoiceId: "inv_9001", amount: 1200 } };
const first = await postEvent(A, seqKey, payload);
ok("first POST → 201", first.status === 201, `got ${first.status}`);
const second = await postEvent(A, seqKey, payload);
ok("second POST, same key → 200 (not 201)", second.status === 200, `got ${second.status}`);
ok("  same _id", second.json._id === first.json._id, `${first.json._id} vs ${second.json._id}`);
ok("  same createdAt", second.json.createdAt === first.json.createdAt, `${first.json.createdAt} vs ${second.json.createdAt}`);
ok("  same idempotencyKey", second.json.idempotencyKey === first.json.idempotencyKey);
ok("  same type", second.json.type === first.json.type, second.json.type);
ok("  same data", JSON.stringify(second.json.data) === JSON.stringify(first.json.data));
ok("  same endpointIds", JSON.stringify(second.json.endpointIds) === JSON.stringify(first.json.endpointIds));
ok("exactly ONE document exists for that key in Mongo", (await countBy(aId, seqKey)) === 1, `got ${await countBy(aId, seqKey)}`);

const listA = await call("GET", "/api/events", { token: A.token });
ok("the list holds one copy", listA.json.filter((e) => e.idempotencyKey === seqKey).length === 1);

console.log(`\n--- CONCURRENT: 10 simultaneous POSTs, one key ---`);
// A fresh user, so the event count is unambiguous (GET caps at 50).
const R = await makeUser("race");
const raceKey = `race-${stamp}`;
const raceBody = { type: "order.shipped", data: { orderId: "o_race_1", courier: "dhl" } };

const responses = await Promise.all(
  Array.from({ length: 10 }, () => postEvent(R, raceKey, raceBody)),
);
const created = responses.filter((r) => r.status === 201);
const replayed = responses.filter((r) => r.status === 200);
const other = responses.filter((r) => r.status !== 201 && r.status !== 200);

ok("all 10 got a 2xx", other.length === 0, other.map((r) => r.status).join(","));
ok("EXACTLY ONE returned 201", created.length === 1, `got ${created.length}`);
ok("the other 9 returned 200", replayed.length === 9, `got ${replayed.length}`);

const ids = new Set(responses.map((r) => r.json._id));
ok("all 10 responses carry the SAME _id", ids.size === 1, `${ids.size} distinct: ${[...ids].join(",")}`);
const stamps = new Set(responses.map((r) => r.json.createdAt));
ok("  all 10 share the same createdAt", stamps.size === 1, `${stamps.size} distinct`);
const winner = created[0].json._id;
ok("  and it is the one the 201 returned", responses.every((r) => r.json._id === winner), winner);
ok("  identical data across all 10", new Set(responses.map((r) => JSON.stringify(r.json.data))).size === 1);
ok("  identical type across all 10", new Set(responses.map((r) => r.json.type)).size === 1);

const rId = jwtSubject(R.token);
ok("exactly ONE document in Mongo for that key", (await countBy(rId, raceKey)) === 1, `got ${await countBy(rId, raceKey)}`);
const listR = await call("GET", "/api/events", { token: R.token });
ok("the list holds one copy", listR.json.length === 1, `got ${listR.json.length}`);

console.log(`\n--- CONCURRENT, repeated (5 more bursts) ---`);
// One green burst can be luck. Repeat with fresh keys so a race that only shows
// up under load has five more chances to break it.
let burstsOk = 0;
let probeRId = null;
const burstDetail = [];
for (let i = 0; i < 5; i++) {
  const k = `burst-${i}-${stamp}`;
  const rs = await Promise.all(Array.from({ length: 10 }, () => postEvent(R, k, raceBody)));
  const c = rs.filter((r) => r.status === 201).length;
  const n = await countBy(rId, k);
  const u = new Set(rs.map((r) => r.json._id)).size;
  if (i === 0) probeRId = rs[0].json._id;
  burstDetail.push(`burst${i}: 201s=${c} docs=${n} ids=${u}`);
  if (c === 1 && n === 1 && u === 1) burstsOk++;
}
ok("all 5 bursts: 1×201, 1 document, 1 distinct _id", burstsOk === 5, burstDetail.join("  "));

console.log(`\n--- DIFFERENT users, SAME idempotency key ---`);
const sharedKey = `shared-${stamp}`;
const [aRes, bRes] = await Promise.all([
  postEvent(A, sharedKey, { type: "user.a.event", data: { who: "a" } }),
  postEvent(B, sharedKey, { type: "user.b.event", data: { who: "b" } }),
]);
ok("A's POST → 201", aRes.status === 201, `got ${aRes.status}`);
ok("B's POST → 201 (no collision across users)", bRes.status === 201, `got ${bRes.status}`);
ok("  they are different documents", aRes.json._id !== bRes.json._id, `${aRes.json._id} vs ${bRes.json._id}`);
ok("  each carries its own userId", aRes.json.userId === aId && bRes.json.userId === bId);
ok("  each kept its own payload", aRes.json.data?.who === "a" && bRes.json.data?.who === "b");
ok("  both rows exist in Mongo", (await countBy(aId, sharedKey)) === 1 && (await countBy(bId, sharedKey)) === 1);

console.log(`\n--- SAME user, DIFFERENT idempotency keys ---`);
const k1 = `multi-1-${stamp}`;
const k2 = `multi-2-${stamp}`;
const [m1, m2] = await Promise.all([
  postEvent(A, k1, { type: "multi.one" }),
  postEvent(A, k2, { type: "multi.two" }),
]);
ok("key 1 → 201", m1.status === 201, `got ${m1.status}`);
ok("key 2 → 201", m2.status === 201, `got ${m2.status}`);
ok("  they are separate documents", m1.json._id !== m2.json._id);
ok("  both persisted", (await countBy(aId, k1)) === 1 && (await countBy(aId, k2)) === 1);
const listA2 = await call("GET", "/api/events", { token: A.token });
ok("  both appear in the list", listA2.json.some((e) => e._id === m1.json._id) && listA2.json.some((e) => e._id === m2.json._id));

console.log(`\n--- a replay never crosses users ---`);
// The key below belongs to R. A posting it must get A's OWN new event (201) —
// uniqueness is scoped per user, so R's key is not A's key — and must never be
// handed R's document. A guessed key must not become a read of someone else's
// event.
const hijack = await postEvent(A, `burst-0-${stamp}`, { type: "probe" });
ok("A posting a key that R used → 201 (scoped to A, not a replay)", hijack.status === 201, `got ${hijack.status}`);
ok("  and it is A's own event, not R's", hijack.json.userId === aId, hijack.json.userId);
ok("  R's document was not returned", hijack.json._id !== probeRId, `${hijack.json._id} vs R's ${probeRId}`);
ok("  both rows now exist, one per user", (await countBy(aId, `burst-0-${stamp}`)) === 1 && (await countBy(jwtSubject(R.token), `burst-0-${stamp}`)) === 1);

const bList = await call("GET", "/api/events", { token: B.token });
ok("B's list never contains A's event", !bList.json.some((e) => e._id === aRes.json._id));
ok("  and every doc is B's", bList.json.every((e) => e.userId === bId));

console.log(`\n--- a duplicate of a DUPLICATE is still a duplicate ---`);
const third = await postEvent(A, seqKey, { type: "totally.different.payload", data: { changed: true } });
ok("third POST with the first key → 200", third.status === 200, `got ${third.status}`);
ok("  returns the ORIGINAL event, not the new payload", third.json._id === first.json._id && third.json.type === "invoice.paid", third.json.type);
ok("  still only one document", (await countBy(aId, seqKey)) === 1);

console.log(`\n--- validation still runs BEFORE any duplicate handling ---`);
// A malformed retry must be a 400, not a 200 replay. The key check and the type
// check both happen before the insert, so a bad body never reaches the index.
const badReplay = await call("POST", "/api/events", { apiKey: A.apiKey, body: { type: "" }, headers: KEY(seqKey) });
ok("malformed retry of an existing key → 400 (not 200)", badReplay.status === 400, `got ${badReplay.status}`);
const noKeyDup = await call("POST", "/api/events", { apiKey: A.apiKey, body: { type: "invoice.paid" } });
ok("no key at all → 400", noKeyDup.status === 400, `got ${noKeyDup.status}`);

await mongoose.disconnect();

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"}: ${pass} passed, ${fail} failed`);
console.log(`test users left behind: ${A.email}  ${B.email}  ${R.email}`);
console.log("clear them with the deleteMany command in README.md");
process.exit(fail === 0 ? 0 : 1);

function jwtSubject(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).id;
}
