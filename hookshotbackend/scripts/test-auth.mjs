// Auth smoke test against a running server + live MongoDB.
// Run: node scripts/test-auth.mjs   (server must already be listening on $BASE)
const BASE = process.env.BASE ?? "http://localhost:5001";
const EMAIL = `test-${Date.now()}@example.com`;
const PW = "supersecret123";
const ORIGIN = "http://localhost:5173";

let pass = 0,
  fail = 0;
const ok = (label, cond, extra = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "PASS  " : "FAIL  "}${label}${extra ? "  → " + extra : ""}`);
};

// `apiKey` and `token` are separate parameters, not one blended credential:
// POST /api/events takes only the API key, everything else takes only the token.
// The revocation sweep needs to send both at once to be meaningful.
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
  return { status: res.status, json, res, setCookie: res.headers.getSetCookie?.() ?? [] };
}

// Auth is cookie-based now, so the JWT arrives in Set-Cookie rather than the
// body. Pulling it out here and replaying it as a Bearer header doubles as the
// test of the header fallback path.
const jwtFrom = (r) => {
  const raw = (r.setCookie ?? []).find((c) => c.startsWith("hookshot_token="));
  return raw ? decodeURIComponent(raw.slice("hookshot_token=".length).split(";")[0]) : undefined;
};
const isJwt = (t) => typeof t === "string" && t.split(".").length === 3;

console.log(`--- signup / register ---`);
const su = await call("POST", "/api/auth/signup", { body: { email: EMAIL, password: PW } });
ok("POST /api/auth/signup → 201", su.status === 201, `got ${su.status}`);
ok("  sets a JWT session cookie", isJwt(jwtFrom(su)));
ok("  returns no token in the body", su.json.token === undefined);
ok("  never echoes the password", !JSON.stringify(su.json).includes(PW));
ok("  never echoes a hash", !JSON.stringify(su.json).includes("$2b$"));

const reg = await call("POST", "/api/auth/register", {
  body: { email: `${EMAIL}-alt`, password: PW, passwordConfirmation: PW },
});
ok("POST /api/auth/register (frontend's path) → 201", reg.status === 201, `got ${reg.status}`);

const dup = await call("POST", "/api/auth/signup", { body: { email: EMAIL, password: PW } });
ok("duplicate email → 409", dup.status === 409, `got ${dup.status}`);

const dupCase = await call("POST", "/api/auth/signup", {
  body: { email: EMAIL.toUpperCase(), password: PW },
});
ok("duplicate email, different case → 409 (lowercased)", dupCase.status === 409, `got ${dupCase.status}`);

console.log(`\n--- signup validation (400s) ---`);
for (const [label, body] of [
  ["malformed email", { email: "not-an-email", password: PW }],
  ["missing @", { email: "nope@", password: PW }],
  ["password too short (11 < 12)", { email: `s-${Date.now()}@x.com`, password: "short" }],
  ["password missing", { email: `m-${Date.now()}@x.com` }],
  ["non-string password", { email: `n-${Date.now()}@x.com`, password: 123456789012 }],
  ["empty body", {}],
  ["confirmation mismatch", { email: `c-${Date.now()}@x.com`, password: PW, passwordConfirmation: "different" }],
]) {
  const r = await call("POST", "/api/auth/signup", { body });
  ok(`${label} → 400`, r.status === 400, `got ${r.status}`);
}

console.log(`\n--- login ---`);
const li = await call("POST", "/api/auth/login", { body: { email: EMAIL, password: PW } });
ok("POST /api/auth/login → 200", li.status === 200, `got ${li.status}`);
ok("  sets a JWT session cookie", isJwt(jwtFrom(li)));
ok("  token matches the signup token's subject", (() => {
  const dec = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
  return dec(jwtFrom(li)).id === dec(jwtFrom(su)).id;
})());

const badPw = await call("POST", "/api/auth/login", { body: { email: EMAIL, password: "wrongpassword" } });
const noUser = await call("POST", "/api/auth/login", {
  body: { email: "ghost@example.com", password: PW },
});
ok("login wrong password → 401", badPw.status === 401, `got ${badPw.status}`);
ok("login unknown email → 401", noUser.status === 401, `got ${noUser.status}`);
ok(
  "both 401s give the identical message (no user enumeration)",
  badPw.json.error === noUser.json.error,
  `${badPw.json.error} / ${noUser.json.error}`,
);
ok("wrong-password 401 does not leak the hash", !JSON.stringify(badPw.json).includes("$2b$"));

const liCase = await call("POST", "/api/auth/login", { body: { email: EMAIL.toUpperCase(), password: PW } });
ok("login is case-insensitive on email → 200", liCase.status === 200, `got ${liCase.status}`);

console.log(`\n--- GET /me (Bearer fallback path) ---`);
const token = jwtFrom(li);
const me = await call("GET", "/api/auth/me", { token });
ok("with valid token → 200", me.status === 200, `got ${me.status}`);
ok("  returns the account email", me.json.email === EMAIL, `${me.json.email}`);
ok("  no password field", !("password" in me.json));

for (const [label, tok] of [
  ["no Authorization header", undefined],
  ["garbage token", "not-a-real-token"],
  ["empty bearer", ""],
]) {
  const r = await call("GET", "/api/auth/me", { token: tok });
  ok(`${label} → 401`, r.status === 401, `got ${r.status}`);
}

// Raw Authorization headers — the helper above auto-prefixes "Bearer ", so it
// cannot express the header-shape cases.
const raw = async (value) => {
  const res = await fetch(BASE + "/api/auth/me", {
    headers: value === null ? {} : { Authorization: value },
  });
  return res.status;
};
ok("token with no 'Bearer ' prefix → 401", (await raw(token)) === 401);
ok("'bearer ' lowercase scheme → 200 (RFC 7235 is case-insensitive)", (await raw(`bearer ${token}`)) === 200);
ok("'BEARER ' uppercase scheme → 200", (await raw(`BEARER ${token}`)) === 200);
ok("token under a 'Basic ' scheme → 401", (await raw(`Basic ${token}`)) === 401);

const tampered = token.slice(0, -4) + "AAAA";
const t = await call("GET", "/api/auth/me", { token: tampered });
ok("tampered signature → 401", t.status === 401, `got ${t.status}`);

console.log(`\n--- infra ---`);
const h = await call("GET", "/api/health");
ok("GET /api/health → 200 { ok:true }", h.status === 200 && h.json.ok === true);

const nf = await call("GET", "/api/does-not-exist");
ok("unknown route → 404 JSON (not an HTML error page)", nf.status === 404 && typeof nf.json.error === "string");

const cors = await call("GET", "/api/health", { headers: { Origin: ORIGIN } });
const allow = cors.res.headers.get("access-control-allow-origin");
ok(`CORS allows the Vite origin`, allow === ORIGIN, `got ${allow}`);

// A real browser preflight names the headers it wants; `cors` reflects them.
// Without Access-Control-Request-Headers there is nothing to reflect, so the
// request below must include it to be a meaningful assertion.
const pre = await fetch(BASE + "/api/auth/login", {
  method: "OPTIONS",
  headers: {
    Origin: ORIGIN,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type",
  },
});
const preHeaders = (pre.headers.get("access-control-allow-headers") ?? "").toLowerCase();
ok("CORS preflight allows the Authorization header", preHeaders.includes("authorization"), `got "${preHeaders}"`);
ok("CORS preflight allows Content-Type", preHeaders.includes("content-type"));
ok("CORS preflight allows the POST method", (pre.headers.get("access-control-allow-methods") ?? "").includes("POST"));

console.log(`\n--- cookie auth (browser path) ---`);

// Browser auth is the cookie the API sets at login. fetch() has no cookie jar,
// so replay it by hand.
const jar = {};
const cookieJar = (headers) => {
  for (const raw of headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
};
const asCookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

const browserCall = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      Origin: ORIGIN,
      ...(asCookie() ? { Cookie: asCookie() } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  cookieJar(res.headers);
  return { status: res.status, json: await res.json().catch(() => ({})), headers: res.headers };
};

// Express's res.clearCookie deletes by re-sending the cookie with an empty value
// and an Expires in the past — not with Max-Age=0. Both forms are legal; this is
// the one it actually emits.
const isCleared = (cookie) =>
  !!cookie && /^hookshot_token=;/.test(cookie) && new Date(cookie.match(/Expires=([^;]+)/)?.[1] ?? 0) < new Date();

const bEmail = `cookie-${Date.now()}@example.com`;
const suB = await browserCall("POST", "/api/auth/signup", { email: bEmail, password: PW });

const setCookies = suB.headers.getSetCookie?.() ?? [];
const session = setCookies.find((c) => c.startsWith("hookshot_token="));
ok("signup sets the session cookie", !!session, session ? "" : "no hookshot_token in Set-Cookie");
ok("  HttpOnly", /HttpOnly/i.test(session ?? ""));
ok("  SameSite=Strict", /SameSite=Strict/i.test(session ?? ""));
ok("  Path=/", /Path=\//i.test(session ?? ""));
ok("  Max-Age set to 7 days", /Max-Age=604800/i.test(session ?? ""));
ok("  Secure is absent in dev (would be dropped over plain http)", !/;\s*Secure/i.test(session ?? ""));

// The token must never reach JS.
const bodyText = JSON.stringify(suB.json);
ok("  no JWT in the signup response body", !/\beyJ[A-Za-z0-9_-]+\./.test(bodyText));
ok("  body carries the user fields instead", suB.json.email === bEmail && !!suB.json.apiKey);
ok("  apiKey is hk_live_ prefixed", /^hk_live_[0-9a-f]{32}$/.test(suB.json.apiKey), suB.json.apiKey);
ok("  apiKeyCreatedAt present", !!suB.json.apiKeyCreatedAt);
ok("  no password field", !("password" in suB.json));

const meB = await browserCall("GET", "/api/auth/me");
ok("cookie authenticates GET /me → 200", meB.status === 200, `got ${meB.status}`);
ok("  returns the same email", meB.json.email === bEmail);
ok("  returns the apiKey", meB.json.apiKey === suB.json.apiKey);

const bearerB = await browserCall("GET", "/api/auth/me");
ok("cookie works with an empty Authorization header", bearerB.status === 200);

// Cross-site request: SameSite=Strict means a real browser would withhold the
// cookie, so the request goes out unauthenticated. Simulate that.
const crossSite = await fetch(BASE + "/api/auth/me", { headers: { Origin: "https://evil.example" } });
ok("no cookie sent cross-site → 401 (CSRF defence)", crossSite.status === 401, `got ${crossSite.status}`);

const evilCors = crossSite.headers.get("access-control-allow-origin");
ok("CORS withholds the origin header from a foreign origin", evilCors === null, `got ${evilCors}`);

console.log(`\n--- account routes (Phase B) ---`);
const reg2 = await browserCall("POST", "/api/auth/regenerate-key");
ok("POST /regenerate-key → 200", reg2.status === 200, `got ${reg2.status}`);
ok("  returns a new key", /^hk_live_[0-9a-f]{32}$/.test(reg2.json.apiKey ?? ""));
ok("  key actually changed", reg2.json.apiKey !== suB.json.apiKey);
ok("  apiKeyCreatedAt refreshed", new Date(reg2.json.apiKeyCreatedAt) > new Date(suB.json.apiKeyCreatedAt));

const afterRegen = await browserCall("GET", "/api/auth/me");
ok("  /me reflects the regenerated key", afterRegen.json.apiKey === reg2.json.apiKey);

const NEW_PW = "evenmoresecret456";
const wrongCurrent = await browserCall("PATCH", "/api/auth/password", {
  currentPassword: "totally-wrong",
  newPassword: NEW_PW,
  passwordConfirmation: NEW_PW,
});
ok("password change with wrong current → 400", wrongCurrent.status === 400, `got ${wrongCurrent.status}`);

const shortNew = await browserCall("PATCH", "/api/auth/password", {
  currentPassword: PW,
  newPassword: "short",
  passwordConfirmation: "short",
});
ok("password change to too-short → 400", shortNew.status === 400, `got ${shortNew.status}`);

const mismatch = await browserCall("PATCH", "/api/auth/password", {
  currentPassword: PW,
  newPassword: NEW_PW,
  passwordConfirmation: "somethingelse",
});
ok("password change confirmation mismatch → 400", mismatch.status === 400, `got ${mismatch.status}`);

const changed = await browserCall("PATCH", "/api/auth/password", {
  currentPassword: PW,
  newPassword: NEW_PW,
  passwordConfirmation: NEW_PW,
});
ok("password change → 200", changed.status === 200, `got ${changed.status}`);

const oldPw = await call("POST", "/api/auth/login", { body: { email: bEmail, password: PW } });
ok("old password no longer logs in → 401", oldPw.status === 401, `got ${oldPw.status}`);
const newPw = await call("POST", "/api/auth/login", { body: { email: bEmail, password: NEW_PW } });
ok("new password logs in → 200", newPw.status === 200, `got ${newPw.status}`);

const delNoAuth = await call("DELETE", "/api/account");
ok("DELETE /api/account without auth → 401", delNoAuth.status === 401, `got ${delNoAuth.status}`);

const del = await browserCall("DELETE", "/api/account");
ok("DELETE /api/account → 200", del.status === 200, `got ${del.status}`);
const delCookie = del.headers.getSetCookie?.().find((c) => c.startsWith("hookshot_token="));
ok("  clears the session cookie", isCleared(delCookie), delCookie ?? "no Set-Cookie");

const gone = await call("POST", "/api/auth/login", { body: { email: bEmail, password: NEW_PW } });
ok("deleted account can no longer log in → 401", gone.status === 401, `got ${gone.status}`);

console.log(`\n--- a deleted account's existing token is revoked ---`);
// The token captured at signup stays a validly-signed, unexpired JWT after the
// account is deleted — nothing about it changes cryptographically. Clearing the
// cookie only closes the browser that asked, so the same token replayed as a
// Bearer header (or from a stale cookie) has to be refused by the auth layer
// itself.
//
// Measured before this existed: GET /api/events answered 200 and POST
// /api/endpoints created rows, for the full seven-day lifetime of the token.
const rvEmail = `revoked-${Date.now()}@example.com`;
const rv = await call("POST", "/api/auth/signup", { body: { email: rvEmail, password: PW } });
const rvToken = jwtFrom(rv);
// POST /api/events authenticates by API key, so this sweep needs BOTH
// credentials. Holding only the token would make that row's 401 vacuous — it
// would pass because the key was never sent, not because the account died.
const rvKey = rv.json.apiKey;
ok("signed up a throwaway account", rv.status === 201 && isJwt(rvToken));
ok(
  "its token works BEFORE deletion",
  (await call("GET", "/api/endpoints", { token: rvToken })).status === 200,
);
ok(
  "  and its api key works BEFORE deletion",
  (await call("POST", "/api/events", { apiKey: rvKey, body: { type: "before" }, headers: { "Idempotency-Key": `rv-${Date.now()}` } })).status === 201,
);
ok(
  "  and can create data",
  (await call("POST", "/api/endpoints", { token: rvToken, body: { url: "https://before.example.com/h" } })).status === 201,
);

ok("DELETE /api/account → 200", (await call("DELETE", "/api/account", { token: rvToken })).status === 200);

// Every route below answered 2xx moments ago. The interesting ones are the two in
// the middle: they only ever touched the deleted user's OWN rows, so cascading
// the delete made them return 200 with an empty list rather than 401 — correct
// data, wrong answer. Those are the cases a data-only fix silently passes.
for (const [label, method, path, opts] of [
  ["GET /api/endpoints", "GET", "/api/endpoints", {}],
  ["POST /api/endpoints", "POST", "/api/endpoints", { body: { url: "https://ghost.example.com/h" } }],
  ["GET /api/events", "GET", "/api/events", {}],
  ["POST /api/events", "POST", "/api/events", { apiKey: rvKey, body: { type: "ghost" }, headers: { "Idempotency-Key": `ghost-${Date.now()}` } }],
  ["PATCH /api/endpoints/000000000000000000000000", "PATCH", "/api/endpoints/000000000000000000000000", { body: { active: false } }],
  ["DELETE /api/account", "DELETE", "/api/account", {}],
  ["POST /api/auth/regenerate-key", "POST", "/api/auth/regenerate-key", {}],
  ["PATCH /api/auth/password", "PATCH", "/api/auth/password", { body: { currentPassword: PW, newPassword: "another-secret789" } }],
  ["GET /api/auth/me", "GET", "/api/auth/me", {}],
]) {
  const r = await call(method, path, { token: rvToken, ...opts });
  const credential = opts.apiKey ? "old api key" : "old token";
  ok(`  ${label} with the ${credential} → 401`, r.status === 401, `got ${r.status}`);
}

// The apiKey path refuses a revoked account for the same reason the JWT path
// does, and through the same shared isRevoked check. Two things are being
// defended here, and only the second is obvious: a deleted user's key must not
// keep working (revocation), and the two failure modes must be indistinguishable
// from an unknown key (no enumeration oracle).
const revokedKey = await call("POST", "/api/events", {
  apiKey: rvKey,
  body: { type: "ghost2" },
  headers: { "Idempotency-Key": `ghost2-${Date.now()}` },
});
const unknownKey = await call("POST", "/api/events", {
  apiKey: "hs_a_key_that_was_never_issued",
  body: { type: "ghost3" },
  headers: { "Idempotency-Key": `ghost3-${Date.now()}` },
});
ok("  a revoked account's api key → 401", revokedKey.status === 401, `got ${revokedKey.status}`);
ok(
  "  and the body is identical to an unknown key's, so neither is distinguishable",
  JSON.stringify(revokedKey.json) === JSON.stringify(unknownKey.json),
  `${JSON.stringify(revokedKey.json)} vs ${JSON.stringify(unknownKey.json)}`,
);

// The response body must be indistinguishable from a forged token's, so a caller
// cannot use the 401 to tell "this account was deleted" from "this token is bad".
const forged = await call("GET", "/api/endpoints", { token: "not.a.jwt" });
const revokedBody = await call("GET", "/api/endpoints", { token: rvToken });
ok(
  "  revoked and forged tokens return an identical 401 body",
  JSON.stringify(forged.json) === JSON.stringify(revokedBody.json),
  `${JSON.stringify(revokedBody.json)} vs ${JSON.stringify(forged.json)}`,
);

// A revoked id must not leak into the next account that registers the same email:
// Mongo mints a new _id, so the new owner must not inherit the revocation.
const rvAgain = await call("POST", "/api/auth/signup", { body: { email: rvEmail, password: PW } });
const rvNewToken = jwtFrom(rvAgain);
ok("re-registering the same email works (new _id, not revoked)", rvAgain.status === 201);
ok("  and the new account is not locked out", (await call("GET", "/api/endpoints", { token: rvNewToken })).status === 200);
ok("  and inherits none of the deleted account's endpoints", (await call("GET", "/api/endpoints", { token: rvNewToken })).json.length === 0);

console.log(`\n--- logout ---`);
const lEmail = `logout-${Date.now()}@example.com`;
await browserCall("POST", "/api/auth/signup", { email: lEmail, password: PW });
ok("authenticated before logout", (await browserCall("GET", "/api/auth/me")).status === 200);
const out = await browserCall("POST", "/api/auth/logout");
ok("POST /logout → 200", out.status === 200, `got ${out.status}`);
const outCookie = out.headers.getSetCookie?.().find((c) => c.startsWith("hookshot_token="));
ok("  expires the cookie", isCleared(outCookie), outCookie ?? "no Set-Cookie");
delete jar.hookshot_token;
ok("  session no longer authenticates", (await browserCall("GET", "/api/auth/me")).status === 401);

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);