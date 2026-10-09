// Endpoint ownership smoke test against a running server + live MongoDB.
// Run: node scripts/test-endpoints.mjs   (server must already be listening on $BASE)
//
// The point of this file is the ownership cases: User B must not be able to
// touch User A's endpoints, and must not be able to tell "not yours" from
// "doesn't exist".
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

async function call(method, path, { body, token, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

// Sign up and return a caller object holding its bearer token.
async function makeUser(tag) {
  const email = `ep-${tag}-${stamp}@example.com`;
  const res = await fetch(BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: PW }),
  });
  const json = await res.json().catch(() => ({}));
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const token = jwtFrom({ setCookie });
  if (res.status !== 201 || !token) throw new Error(`setup failed for ${email}: ${res.status}`);
  return { email, token };
}

console.log(`--- setup: two users ---`);
const A = await makeUser("a");
const B = await makeUser("b");
ok("User A signed up", !!A.token);
ok("User B signed up", !!B.token);
ok("the two users are distinct", A.token !== B.token);

console.log(`\n--- 401 without auth ---`);
for (const [label, args] of [
  ["POST /api/endpoints (no token)", ["POST", "/api/endpoints", { body: { url: "https://a.example.com/h" } }]],
  ["GET /api/endpoints (no token)", ["GET", "/api/endpoints"]],
]) {
  const r = await call(...args);
  ok(`${label} → 401`, r.status === 401, `got ${r.status}`);
}
const badTok = await call("GET", "/api/endpoints", { token: "not-a-real-token" });
ok("GET /api/endpoints with a garbage token → 401", badTok.status === 401, `got ${badTok.status}`);
const other = await call("GET", "/api/endpoints", { token: A.token.replace(/.$/, "x") });
ok("GET /api/endpoints with a tampered token → 401", other.status === 401, `got ${other.status}`);

console.log(`\n--- POST /api/endpoints ---`);
const created = await call("POST", "/api/endpoints", {
  token: A.token,
  body: { url: "https://hooks.acme.example/v1/billing" },
});
ok("POST /api/endpoints → 201", created.status === 201, `got ${created.status}`);
const id = created.json._id;
ok("  response carries an _id", isId(id), String(id));
ok("  response carries the url", created.json.url === "https://hooks.acme.example/v1/billing");
ok("  active defaults to true", created.json.active === true, String(created.json.active));
ok("  timestamps present", !!created.json.createdAt && !!created.json.updatedAt);

console.log(`\n--- POST url validation (400) ---`);
for (const [label, url] of [
  ["'notaurl'", "notaurl"],
  ["empty string", ""],
  ["ftp scheme", "ftp://example.com/hook"],
  ["javascript: scheme", "javascript:alert(1)"],
  ["protocol-relative //example.com", "//example.com/hook"],
  ["missing scheme www.example.com", "www.example.com"],
  ["a number", 42],
  ["null", null],
]) {
  const r = await call("POST", "/api/endpoints", { token: A.token, body: { url } });
  ok(`POST url=${label} → 400`, r.status === 400, `got ${r.status}`);
}
const noBody = await call("POST", "/api/endpoints", { token: A.token, body: {} });
ok("POST with no url field → 400", noBody.status === 400, `got ${noBody.status}`);

console.log(`\n--- POST url validation: hosts that are not public FQDNs are ACCEPTED ---`);
// The rejection list above is the half of validation that gets tested. This is the
// half that silently rots: a host with no dot in it looks wrong at a glance, so a
// regex "tightening" pass tends to reject localhost and 127.0.0.1 — which are the
// two hosts a webhook is most likely to be aimed at during development, and the
// two you need to demo with.
//
// The guard in URL_RE rejects a leading "." (so "http://.com" cannot pass); it
// does NOT require a dot anywhere in the host. Pinning these four means a future
// edit cannot quietly narrow the pattern.
for (const [label, url] of [
  ["localhost with a port", "http://localhost:3000/hook"],
  ["loopback IP with a port", "http://127.0.0.1:8080/webhook"],
  ["localhost without a port", "http://localhost/hook"],
  ["loopback IP without a port", "http://127.0.0.1/webhook"],
  ["private LAN address", "http://192.168.1.50:9000/h"],
  ["single-label internal host", "http://hook-relay.internal/h"],
]) {
  const r = await call("POST", "/api/endpoints", { token: A.token, body: { url } });
  ok(`POST url=${label} → 201`, r.status === 201, `got ${r.status}`);
  ok(`  stored verbatim`, r.json.url === url, `${r.json.url}`);

  // And the round trip: a PATCH to the same host must not be rejected either, or
  // an endpoint that could be created could not be edited.
  const p = await call("PATCH", `/api/endpoints/${r.json._id}`, { token: A.token, body: { url } });
  ok(`  PATCH url=${label} → 200`, p.status === 200, `got ${p.status}`);

  // Delete it again. Later assertions in this suite count user A's endpoints, and
  // a validation block that leaves rows behind would silently break them.
  await call("DELETE", `/api/endpoints/${r.json._id}`, { token: A.token });
}

console.log(`\n--- userId cannot be spoofed from the body ---`);
const spoof = await call("POST", "/api/endpoints", {
  token: A.token,
  body: { url: "https://spoof.example.com/h", userId: "000000000000000000000000" },
});
ok("POST ignoring a body userId → 201", spoof.status === 201, `got ${spoof.status}`);
ok("  the body's userId was ignored", spoof.json.userId !== "000000000000000000000000", spoof.json.userId);

console.log(`\n--- GET /api/endpoints scoping ---`);
const listA = await call("GET", "/api/endpoints", { token: A.token });
ok("GET /api/endpoints → 200", listA.status === 200, `got ${listA.status}`);
ok("  returns an array", Array.isArray(listA.json), typeof listA.json);
ok("  A sees 2 (own two)", listA.json.length === 2, `got ${listA.json.length}`);
// Decode the JWTs rather than trusting the response: every doc A got must carry
// A's subject id, and never B's.
const aId = jwtSubject(A.token);
const bId = jwtSubject(B.token);
ok("  every doc carries A's userId", listA.json.length > 0 && listA.json.every((e) => e.userId === aId));
ok("  none carry B's userId", listA.json.every((e) => e.userId !== bId));
ok("  the spoof POST was scoped to A too", spoof.json.userId === aId, spoof.json.userId);

const listB = await call("GET", "/api/endpoints", { token: B.token });
ok("GET /api/endpoints as B → 200", listB.status === 200, `got ${listB.status}`);
ok("  B sees 0 — no cross-tenant leak", Array.isArray(listB.json) && listB.json.length === 0, `got ${JSON.stringify(listB.json)}`);

console.log(`\n--- newest first ---`);
const second = await call("POST", "/api/endpoints", { token: A.token, body: { url: "https://second.example.com/h" } });
const list3 = await call("GET", "/api/endpoints", { token: A.token });
const urls = list3.json.map((e) => e.url);
ok("newest first", urls[0] === second.json.url, urls.join(" | "));

console.log(`\n--- PATCH /api/endpoints/:id ---`);
const patched = await call("PATCH", `/api/endpoints/${id}`, {
  token: A.token,
  body: { url: "https://hooks.acme.example/v2/billing" },
});
ok("PATCH own endpoint → 200", patched.status === 200, `got ${patched.status}`);
ok("  url updated", patched.json.url === "https://hooks.acme.example/v2/billing", patched.json.url);
ok("  updatedAt moved", !!patched.json.updatedAt);

const toggled = await call("PATCH", `/api/endpoints/${id}`, { token: A.token, body: { active: false } });
ok("PATCH active:false → 200", toggled.status === 200, `got ${toggled.status}`);
ok("  active is now false", toggled.json.active === false, String(toggled.json.active));

const both = await call("PATCH", `/api/endpoints/${id}`, {
  token: A.token,
  body: { url: "https://both.example.com/h", active: true },
});
ok("PATCH url + active together → 200", both.status === 200, `got ${both.status}`);
ok("  both applied", both.json.url === "https://both.example.com/h" && both.json.active === true);

console.log(`\n--- PATCH validation (400) ---`);
const badUrl = await call("PATCH", `/api/endpoints/${id}`, { token: A.token, body: { url: "notaurl" } });
ok("PATCH url='notaurl' → 400", badUrl.status === 400, `got ${badUrl.status}`);
const badActive = await call("PATCH", `/api/endpoints/${id}`, { token: A.token, body: { active: "yes" } });
ok("PATCH active='yes' (not boolean) → 400", badActive.status === 400, `got ${badActive.status}`);
const emptyPatch = await call("PATCH", `/api/endpoints/${id}`, { token: A.token, body: {} });
ok("PATCH with an empty body → 400", emptyPatch.status === 400, `got ${emptyPatch.status}`);

const unchanged = await call("GET", "/api/endpoints", { token: A.token });
ok(
  "  rejected PATCH left the document untouched",
  unchanged.json.find((e) => e._id === id)?.url === "https://both.example.com/h",
);

console.log(`\n--- OWNERSHIP: B must not touch A's endpoint ---`);
const bPatch = await call("PATCH", `/api/endpoints/${id}`, {
  token: B.token,
  body: { url: "https://evil.example.com/hijack" },
});
ok("B PATCH A's endpoint → 404 (not 403)", bPatch.status === 404, `got ${bPatch.status}`);
const bDelete = await call("DELETE", `/api/endpoints/${id}`, { token: B.token });
ok("B DELETE A's endpoint → 404 (not 403)", bDelete.status === 404, `got ${bDelete.status}`);

// The two must be indistinguishable from a genuinely missing id, or the 404
// itself leaks whether that document exists.
const ghost = await call("PATCH", "/api/endpoints/000000000000000000000000", {
  token: B.token,
  body: { url: "https://x.example.com/h" },
});
ok("PATCH a nonexistent id → 404", ghost.status === 404, `got ${ghost.status}`);
ok("  same error body as the ownership 404", ghost.json.error === bPatch.json.error, `${bPatch.json.error} vs ${ghost.json.error}`);
const ghostDel = await call("DELETE", "/api/endpoints/000000000000000000000000", { token: B.token });
ok("DELETE a nonexistent id → 404", ghostDel.status === 404, `got ${ghostDel.status}`);
const notAnId = await call("DELETE", "/api/endpoints/not-an-object-id", { token: B.token });
ok("DELETE a malformed id → 404 (not 500)", notAnId.status === 404, `got ${notAnId.status}`);

// A malformed id has to be handled on PATCH too, not just DELETE. `not-an-object-id`
// is not 24 hex characters, so a naive `findOneAndUpdate({_id: "not-an-object-id"})`
// throws a BSONError from the driver and the request becomes a 500. Mongoose only
// casts a valid ObjectId-shaped string, so this is the case that actually breaks.
for (const bad of ["not-an-object-id", "123", "", "%20", "../../etc/passwd", "0".repeat(24), "z".repeat(24)]) {
  const p = await call("PATCH", `/api/endpoints/${bad}`, { token: A.token, body: { active: false } });
  ok(`PATCH a malformed id ${JSON.stringify(bad)} → 404 (not 500)`, p.status === 404, `got ${p.status}`);
  const d = await call("DELETE", `/api/endpoints/${bad}`, { token: A.token });
  ok(`DELETE a malformed id ${JSON.stringify(bad)} → 404 (not 500)`, d.status === 404, `got ${d.status}`);
}

const afterAttack = await call("GET", "/api/endpoints", { token: A.token });
const survivor = afterAttack.json.find((e) => e._id === id);
ok("A's endpoint survived B's DELETE", !!survivor);
ok("  and its url was not hijacked", survivor?.url === "https://both.example.com/h", survivor?.url);

console.log(`\n--- DELETE /api/endpoints/:id ---`);
const del = await call("DELETE", `/api/endpoints/${id}`, { token: A.token });
ok("DELETE own endpoint → 200", del.status === 200, `got ${del.status}`);
ok("  body confirms the deletion", del.json?.ok === true && del.json?.id === id);
const delAgain = await call("DELETE", `/api/endpoints/${id}`, { token: A.token });
ok("DELETE the same endpoint twice → 404", delAgain.status === 404, `got ${delAgain.status}`);
const afterDel = await call("GET", "/api/endpoints", { token: A.token });
ok("deleted endpoint is gone from the list", !afterDel.json.some((e) => e._id === id));

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"}: ${pass} passed, ${fail} failed`);
console.log(`test users left behind: ${A.email}  ${B.email}`);
console.log("clear them with the deleteMany command in README.md");
process.exit(fail === 0 ? 0 : 1);

// 24-char hex is what Mongo hands back for a generated _id.
function isId(v) {
  return typeof v === "string" && /^[0-9a-f]{24}$/.test(v);
}

// The token's subject id. Used to assert that stored documents are scoped to the
// caller rather than to whatever userId the request body asked for.
function jwtSubject(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).id;
}