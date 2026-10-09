// Event ingestion smoke test against a running server + live MongoDB.
// Run: node scripts/test-events.mjs   (server must already be listening on $BASE)
//
// The point of this file is fan-out recording: an event must snapshot exactly
// the ACTIVE endpoints, never an inactive or someone else's, and a user must
// only ever list their own events.
const BASE = process.env.BASE ?? "http://localhost:5001";
const PW = "supersecret123";
const ORIGIN = "http://localhost:5173";
const stamp = Date.now();

let pass = 0,
  fail = 0;
const ok = (label, cond, extra = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "PASS  " : "FAIL  "}${label}${extra ? "  → " + extra : ""}`);
};

// `apiKey` and `token` are deliberately SEPARATE parameters rather than one
// `auth` field. POST /api/events accepts only the API key and GET accepts only
// the token, so a single blended parameter would let a test pass a JWT to the
// route that rejects it and still look authenticated.
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
  const email = `ev-${tag}-${stamp}@example.com`;
  const res = await fetch(BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: PW }),
  });
  const json = await res.json().catch(() => ({}));
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const token = jwtFrom({ setCookie });
  if (res.status !== 201 || !token) throw new Error(`setup failed for ${email}: ${res.status}`);
  // Signup returns publicUser(), which carries the generated apiKey — so the key
  // is picked up here rather than costing a second GET /api/auth/me round-trip.
  return { email, token, apiKey: json.apiKey };
}

// Header name is case-insensitive on the wire; this proves the server reads the
// canonical spelling while still tolerating a lowercase client.
const KEY = (v) => ({ "Idempotency-Key": v });

console.log(`--- setup: two users ---`);
const A = await makeUser("a");
const B = await makeUser("b");
ok("User A signed up", !!A.token);
ok("User B signed up", !!B.token);
ok("  signup returned an apiKey for A", typeof A.apiKey === "string" && A.apiKey.length > 0, A.apiKey);
ok("  and for B", typeof B.apiKey === "string" && B.apiKey.length > 0, B.apiKey);
ok("the two api keys are distinct", A.apiKey !== B.apiKey);
const aId = jwtSubject(A.token);
const bId = jwtSubject(B.token);
ok("the two users are distinct", aId !== bId);

console.log(`\n--- POST /api/events authenticates with the API KEY, not the session ---`);
// This is the whole point of the split: a sender's backend holds an apiKey, not a
// browser session. Every one of these is a credential the route must refuse.
for (const [label, opts] of [
  ["no credential at all", {}],
  ["a JWT but no X-Hookshot-Key", { token: A.token }],
  ["a garbage X-Hookshot-Key", { apiKey: "hs_not_a_real_key_at_all" }],
  ["an empty X-Hookshot-Key", { apiKey: "" }],
  ["whitespace-only X-Hookshot-Key", { apiKey: "   " }],
  ["a JWT paired with an unregistered key", { token: A.token, apiKey: "hs_unregistered_despite_valid_jwt" }],
]) {
  const r = await call("POST", "/api/events", {
    ...opts,
    body: { type: "x.y" },
    headers: KEY(`authcheck-${stamp}-${label}`),
  });
  ok(`POST with ${label} → 401`, r.status === 401, `got ${r.status}`);
}

const noHeader = await call("POST", "/api/events", { body: { type: "x.y" }, headers: KEY("k") });
ok("  the missing-header 401 names the header", /x-hookshot-key/i.test(noHeader.json.error ?? ""), noHeader.json.error);

const badKey = await call("POST", "/api/events", { apiKey: "hs_not_a_real_key_at_all", body: { type: "x.y" }, headers: KEY("k") });
ok("  the bad-key 401 does NOT name the header", !/x-hookshot-key/i.test(badKey.json.error ?? ""), badKey.json.error);
// A rejected key must not be distinguishable from a well-formed one that simply
// isn't on file — otherwise the endpoint can be used to enumerate valid keys.
const wrongish = await call("POST", "/api/events", { apiKey: "hs_wellformed_but_unregistered_0000", body: { type: "x.y" }, headers: KEY("k") });
ok("  malformed and unmatched keys return identical 401 bodies", JSON.stringify(badKey.json) === JSON.stringify(wrongish.json), `${JSON.stringify(badKey.json)} vs ${JSON.stringify(wrongish.json)}`);

console.log(`\n--- GET /api/events still takes the SESSION only (regression guard) ---`);
// The split is one-directional. The dashboard listing is a human reading their
// own history through a browser, so an apiKey must not open it up.
const getWithKey = await call("GET", "/api/events", { apiKey: A.apiKey });
ok("GET /api/events with only an apiKey → 401", getWithKey.status === 401, `got ${getWithKey.status}`);
const getWithBoth = await call("GET", "/api/events", { token: A.token, apiKey: A.apiKey });
ok("GET /api/events with both still works on the token → 200", getWithBoth.status === 200, `got ${getWithBoth.status}`);
const getNoCred = await call("GET", "/api/events");
ok("GET /api/events with no credential → 401", getNoCred.status === 401, `got ${getNoCred.status}`);
const badTok = await call("GET", "/api/events", { token: "not-a-real-token" });
ok("GET /api/events with a garbage token → 401", badTok.status === 401, `got ${badTok.status}`);

console.log(`\n--- a valid apiKey authenticates ---`);
const authOk = await call("POST", "/api/events", {
  apiKey: A.apiKey,
  body: { type: "auth.probe" },
  headers: KEY(`authok-${stamp}`),
});
ok("POST with a valid X-Hookshot-Key → 201", authOk.status === 201, `got ${authOk.status}`);
ok("  and the event is attributed to that key's owner", authOk.json.userId === aId, authOk.json.userId);

console.log(`\n--- setup: A gets 1 active + 1 inactive endpoint ---`);
const onRes = await call("POST", "/api/endpoints", {
  token: A.token,
  body: { url: "https://on.example.com/hook" },
});
ok("POST active endpoint → 201", onRes.status === 201, `got ${onRes.status}`);
const onId = onRes.json._id;
ok("  it defaults to active", onRes.json.active === true, String(onRes.json.active));

const offRes = await call("POST", "/api/endpoints", {
  token: A.token,
  body: { url: "https://off.example.com/hook" },
});
const offId = offRes.json._id;
ok("POST second endpoint → 201", offRes.status === 201, `got ${offRes.status}`);
const offPatch = await call("PATCH", `/api/endpoints/${offId}`, {
  token: A.token,
  body: { active: false },
});
ok("  PATCH it active:false → 200", offPatch.status === 200, `got ${offPatch.status}`);
ok("  it is now inactive", offPatch.json.active === false, String(offPatch.json.active));

console.log(`\n--- POST /api/events with an Idempotency-Key header ---`);
const ev = await call("POST", "/api/events", {
  apiKey: A.apiKey,
  body: { type: "invoice.paid", data: { invoiceId: "inv_8821", amount: 4750, currency: "USD" } },
  headers: KEY("order-1-invoice-8821"),
});
ok("POST /api/events → 201", ev.status === 201, `got ${ev.status}`);
const evId = ev.json._id;
ok("  response carries an _id", isId(evId), String(evId));
ok("  type is stored", ev.json.type === "invoice.paid", ev.json.type);
ok("  idempotencyKey came from the header", ev.json.idempotencyKey === "order-1-invoice-8821", ev.json.idempotencyKey);
ok("  userId is the token's subject", ev.json.userId === aId, ev.json.userId);
ok("  data survived intact", ev.json.data?.amount === 4750 && ev.json.data?.invoiceId === "inv_8821");
ok("  timestamps present", !!ev.json.createdAt && !!ev.json.updatedAt);

console.log(`\n--- FAN-OUT: endpointIds must be the ACTIVE endpoint only ---`);
ok("  endpointIds is an array", Array.isArray(ev.json.endpointIds), typeof ev.json.endpointIds);
ok("  it contains the active endpoint", ev.json.endpointIds.includes(onId), JSON.stringify(ev.json.endpointIds));
ok("  it does NOT contain the inactive one", !ev.json.endpointIds.includes(offId));
ok("  it has exactly 1 entry", ev.json.endpointIds.length === 1, `got ${ev.json.endpointIds.length}`);

console.log(`\n--- lower-case header is accepted ---`);
const lower = await call("POST", "/api/events", {
  apiKey: A.apiKey,
  body: { type: "lower.case" },
  headers: { "idempotency-key": "lower-1" },
});
ok("POST with a lowercase idempotency-key → 201", lower.status === 201, `got ${lower.status}`);
ok("  key stored as sent", lower.json.idempotencyKey === "lower-1", lower.json.idempotencyKey);

console.log(`\n--- POST without an Idempotency-Key header → 400 ---`);
const noKey = await call("POST", "/api/events", { apiKey: A.apiKey, body: { type: "invoice.paid" } });
ok("POST with no Idempotency-Key → 400", noKey.status === 400, `got ${noKey.status}`);
ok("  error names the header", /idempotency-key/i.test(noKey.json.error ?? ""), noKey.json.error);

const blankKey = await call("POST", "/api/events", {
  apiKey: A.apiKey,
  body: { type: "invoice.paid" },
  headers: { "Idempotency-Key": "   " },
});
ok("POST with a whitespace-only key → 400", blankKey.status === 400, `got ${blankKey.status}`);

// A key in the body is not a header. If the server ever starts reading the body,
// this test is what catches it.
const bodyKey = await call("POST", "/api/events", {
  apiKey: A.apiKey,
  body: { type: "invoice.paid", idempotencyKey: "in-the-body" },
});
ok("POST with the key only in the body → 400", bodyKey.status === 400, `got ${bodyKey.status}`);

console.log(`\n--- POST validation (400) ---`);
for (const [label, body] of [
  ["no type", { data: {} }],
  ["empty type", { type: "" }],
  ["whitespace type", { type: "   " }],
  ["numeric type", { type: 42 }],
  ["data is an array", { type: "x.y", data: [1, 2] }],
  ["data is a string", { type: "x.y", data: "hello" }],
  ["data is null", { type: "x.y", data: null }],
]) {
  const r = await call("POST", "/api/events", { apiKey: A.apiKey, body, headers: KEY(`bad-${label}`) });
  ok(`POST ${label} → 400`, r.status === 400, `got ${r.status}`);
}

console.log(`\n--- arbitrary JSON payload ---`);
const nested = await call("POST", "/api/events", {
  apiKey: A.apiKey,
  body: {
    type: "order.shipped",
    data: { order: { id: "o_7", items: [{ sku: "AB-1", qty: 2 }] }, tags: ["fragile", "gift"], note: null },
  },
  headers: KEY("nested-1"),
});
ok("POST deeply nested data → 201", nested.status === 201, `got ${nested.status}`);
ok("  nested object preserved", nested.json.data?.order?.items?.[0]?.sku === "AB-1");
ok("  array preserved", Array.isArray(nested.json.data?.tags) && nested.json.data.tags.length === 2);
ok("  explicit null preserved", "note" in (nested.json.data ?? {}) && nested.json.data.note === null);

const noData = await call("POST", "/api/events", { apiKey: A.apiKey, body: { type: "ping" }, headers: KEY("nodata-1") });
ok("POST with no data → 201", noData.status === 201, `got ${noData.status}`);
ok("  data defaults to {}", JSON.stringify(noData.json.data) === "{}", JSON.stringify(noData.json.data));

// Regression guard for minimize:false. Mongoose's default silently strips empty
// objects and arrays out of a document on save, which would quietly eat parts of
// a real payload — a webhook body has to round-trip exactly as sent.
const empties = await call("POST", "/api/events", {
  apiKey: A.apiKey,
  body: { type: "has.empties", data: { user: {}, tags: [], meta: { notes: {} }, keep: 1 } },
  headers: KEY("empties-1"),
});
ok("POST with empty objects/arrays inside data → 201", empties.status === 201, `got ${empties.status}`);
ok("  nested {} survived", JSON.stringify(empties.json.data?.user) === "{}", JSON.stringify(empties.json.data?.user));
ok("  nested [] survived", Array.isArray(empties.json.data?.tags) && empties.json.data.tags.length === 0, JSON.stringify(empties.json.data?.tags));
ok("  deeply nested {} survived", JSON.stringify(empties.json.data?.meta?.notes) === "{}", JSON.stringify(empties.json.data?.meta?.notes));
ok("  non-empty fields alongside them intact", empties.json.data?.keep === 1);

console.log(`\n--- userId cannot be spoofed from the body ---`);
const spoof = await call("POST", "/api/events", {
  apiKey: A.apiKey,
  body: { type: "spoof.attempt", userId: "000000000000000000000000", endpointIds: [] },
  headers: KEY("spoof-1"),
});
ok("POST ignoring a body userId → 201", spoof.status === 201, `got ${spoof.status}`);
ok("  the body's userId was ignored", spoof.json.userId === aId, spoof.json.userId);
ok("  the body's endpointIds was ignored", spoof.json.endpointIds.includes(onId), JSON.stringify(spoof.json.endpointIds));

console.log(`\n--- GET /api/events ---`);
const listA = await call("GET", "/api/events", { token: A.token });
ok("GET /api/events → 200", listA.status === 200, `got ${listA.status}`);
ok("  returns an array", Array.isArray(listA.json), typeof listA.json);
ok("  it contains the event we posted", listA.json.some((e) => e._id === evId));
ok("  every doc carries A's userId", listA.json.length > 0 && listA.json.every((e) => e.userId === aId));
ok("  none carry B's userId", listA.json.every((e) => e.userId !== bId));

console.log(`\n--- newest first ---`);
const third = await call("POST", "/api/events", { apiKey: A.apiKey, body: { type: "third" }, headers: KEY("order-3") });
const fourth = await call("POST", "/api/events", { apiKey: A.apiKey, body: { type: "fourth" }, headers: KEY("order-4") });
const ordered = (await call("GET", "/api/events", { token: A.token })).json;
const types = ordered.map((e) => e.type);
ok("first item is the most recent", types[0] === "fourth", types.join(" | "));
ok("second item is the one before it", types[1] === "third", types.join(" | "));
// The exact expected sequence, newest first. A hardcoded index would break every
// time a test is inserted above this one; the full sequence can't drift silently.
const expectedOrder = [
  "fourth",
  "third",
  "spoof.attempt",
  "has.empties",
  "ping",
  "order.shipped",
  "lower.case",
  "invoice.paid",
  // The auth probe above posted a real event with A's key, so it is part of the
  // sequence. Hardcoding the whole list is what makes this a real assertion
  // rather than a spot-check of the first two entries.
  "auth.probe",
];
ok("the full sequence is newest-first", types.join("|") === expectedOrder.join("|"), types.join(" | "));
const times = ordered.map((e) => Date.parse(e.createdAt));
ok("createdAt is monotonically decreasing", times.every((t, i) => i === 0 || times[i - 1] >= t), times.join(" "));

console.log(`\n--- LIMIT 50 ---`);
// A third user with no endpoints, so the 55 inserts skip the fan-out query.
//
// Fired CONCURRENTLY on purpose. These have to share a createdAt millisecond for
// the sort assertion below to mean anything: the `_id` tiebreaker exists purely
// to order events that Mongo cannot otherwise distinguish, so the test has to
// actually produce such a pair. Issued one at a time, each POST now costs an
// extra apiKey lookup and the inserts drift a millisecond apart — which is how
// this check came to fail while the ordering it guards was still correct.
// A sequential version of this loop measures the wrong thing.
const C = await makeUser("c");
const bulk = await Promise.all(
  Array.from({ length: 55 }, (_, i) =>
    call("POST", "/api/events", { apiKey: C.apiKey, body: { type: `bulk.${i}` }, headers: KEY(`bulk-${i}`) }),
  ),
);
const notCreated = bulk.filter((r) => r.status !== 201);
ok("all 55 concurrent inserts were accepted", notCreated.length === 0, notCreated.map((r) => r.status).join(","));
const listC = await call("GET", "/api/events", { token: C.token });
ok("GET returns at most 50", listC.json.length === 50, `got ${listC.json.length}`);
// Asserting the WHOLE sequence is the point: it fails if the sort has no
// tiebreaker, because Mongo is then free to return equal-timestamp events in
// any order. Checking only [0] and [49] would miss that.
// What the tiebreaker guarantees is DETERMINISM, not insertion order: within one
// createdAt millisecond Mongo is free to return equal-timestamp documents in any
// order, and _id is what pins it down. Asserting bulk.54 first would be asserting
// something the index never promised — under concurrency the client decides which
// insert reaches Mongo first, so _id order legitimately differs from loop order.
//
// So assert the property that actually holds: non-increasing createdAt, and
// strictly descending _id wherever createdAt ties. Run this section twice and a
// missing tiebreaker gives two different orders; with it, always the same one.
const bulkDocs = listC.json;
const byTime = bulkDocs.every((e, i) => i === 0 || Date.parse(bulkDocs[i - 1].createdAt) >= Date.parse(e.createdAt));
ok("the newest 50 come back in non-increasing createdAt order", byTime, bulkDocs.slice(0, 3).map((e) => e.createdAt).join(" "));

const ties = bulkDocs.filter((e, i) => i > 0 && e.createdAt === bulkDocs[i - 1].createdAt);
const tieOrdered = ties.every((e, i) => e._id < (i === 0 ? bulkDocs[bulkDocs.indexOf(e) - 1] : ties[i - 1])._id);
ok(
  "  and within every createdAt tie, _id is strictly descending",
  tieOrdered && ties.length > 0,
  `${ties.length} tied docs checked`,
);
ok(
  "  the type sequence is a deterministic function of the tiebreaker, not chance",
  (() => {
    // Recompute the expected order from the documents themselves: sort by the
    // index the compound index actually uses, and require the response to match.
    const expected = [...bulkDocs]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a._id < b._id ? 1 : -1))
      .map((e) => e._id);
    return expected.join("|") === bulkDocs.map((e) => e._id).join("|");
  })(),
);
const tiedCount = new Set(listC.json.map((e) => e.createdAt)).size;
ok(
  "  (the run really did produce tied timestamps, so this was a live test)",
  tiedCount < 50,
  `${tiedCount} distinct createdAt across 50 docs`,
);
ok("  a user with no endpoints gets empty endpointIds", listC.json[0].endpointIds.length === 0, JSON.stringify(listC.json[0].endpointIds));

console.log(`\n--- OWNERSHIP: B sees only B's events ---`);
const bBefore = await call("GET", "/api/events", { token: B.token });
ok("B starts with no events", bBefore.json.length === 0, `got ${bBefore.json.length}`);

const bEv = await call("POST", "/api/events", { apiKey: B.apiKey, body: { type: "b.only" }, headers: KEY("b-1") });
ok("B POST an event → 201", bEv.status === 201, `got ${bEv.status}`);
ok("  B has no endpoints, so endpointIds is empty", bEv.json.endpointIds.length === 0, JSON.stringify(bEv.json.endpointIds));

const listB = await call("GET", "/api/events", { token: B.token });
ok("B's list has only B's own event", listB.json.length === 1 && listB.json[0]._id === bEv.json._id, `got ${listB.json.length}`);
ok("  it carries B's userId", listB.json[0].userId === bId, listB.json[0].userId);

const listA2 = await call("GET", "/api/events", { token: A.token });
ok("B's event never appears in A's list", !listA2.json.some((e) => e._id === bEv.json._id));
ok("A's own events are unaffected", listA2.json.some((e) => e._id === evId));
ok("  no doc in A's list carries B's userId", listA2.json.every((e) => e.userId !== bId));
ok("  no doc in A's list references B's userId in endpointIds", listA2.json.every((e) => !e.endpointIds.includes(bId)));

console.log(`\n--- snapshot semantics: later endpoint changes don't rewrite history ---`);
const late = await call("POST", "/api/endpoints", { token: A.token, body: { url: "https://late.example.com/hook" } });
ok("A adds a second active endpoint", late.status === 201, `got ${late.status}`);
const oldEvent = (await call("GET", "/api/events", { token: A.token })).json.find((e) => e._id === evId);
ok("  the OLD event still lists only the one active endpoint at the time", oldEvent.endpointIds.length === 1 && oldEvent.endpointIds[0] === onId, JSON.stringify(oldEvent.endpointIds));
ok("  it does NOT retroactively include the new endpoint", !oldEvent.endpointIds.includes(late.json._id));

const afterNew = await call("POST", "/api/events", { apiKey: A.apiKey, body: { type: "after.new" }, headers: KEY("after-new-1") });
ok("a NEW event fans out to both active endpoints", afterNew.json.endpointIds.length === 2, JSON.stringify(afterNew.json.endpointIds));
ok("  it includes the original active endpoint", afterNew.json.endpointIds.includes(onId));
ok("  and the newly added one", afterNew.json.endpointIds.includes(late.json._id));
ok("  still not the inactive one", !afterNew.json.endpointIds.includes(offId));

const reactivate = await call("PATCH", `/api/endpoints/${offId}`, { token: A.token, body: { active: true } });
ok("A reactivates the paused endpoint → 200", reactivate.status === 200, `got ${reactivate.status}`);
const afterReactivated = await call("POST", "/api/events", { apiKey: A.apiKey, body: { type: "after.reactivate" }, headers: KEY("after-react-1") });
ok("  the next event now fans out to all 3 active endpoints", afterReactivated.json.endpointIds.length === 3, JSON.stringify(afterReactivated.json.endpointIds));

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"}: ${pass} passed, ${fail} failed`);
console.log(`test users left behind: ${A.email}  ${B.email}  ${C.email}`);
console.log("clear them with the deleteMany command in README.md");
process.exit(fail === 0 ? 0 : 1);

// 24-char hex is what Mongo hands back for a generated _id.
function isId(v) {
  return typeof v === "string" && /^[0-9a-f]{24}$/.test(v);
}

// The token's subject id. Used to assert that stored documents are scoped to the
// caller rather than to whatever the request body asked for.
function jwtSubject(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).id;
}
