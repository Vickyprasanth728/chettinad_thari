/**
 * Automated tests for POST /api/v1/auth/refresh-token
 * Run: node scripts/test-refresh-api.js
 * Requires: server on PORT (default 8080)
 */
const BASE = `http://localhost:${process.env.PORT || 8080}/api/v1`;

async function req(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = { method, headers };
  if (body != null && !["GET", "HEAD"].includes(method)) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

const results = [];

function track(id, name, cond, detail = "") {
  const pass = !!cond;
  results.push({ id, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${id} | ${name}${detail ? ` | ${detail}` : ""}`);
  return pass;
}

async function main() {
  console.log(`Testing against ${BASE}\n`);

  // Health check
  try {
    await fetch(`http://localhost:${process.env.PORT || 8080}/`);
  } catch (e) {
    console.error("Server not reachable. Start with: npm run dev");
    process.exit(1);
  }

  // --- 1. Happy path ---
  console.log("=== 1. Happy path ===");
  const signin = await req("POST", "/auth/signin", {
    username: "admin",
    password: "admin123",
  });
  track("1.1", "Signin returns refreshToken", signin.status === 200 && signin.json?.data?.refreshToken,
    `status=${signin.status}`);

  const rt1 = signin.json?.data?.refreshToken;
  const at1 = signin.json?.data?.accessToken;
  const uid = signin.json?.data?.user?.id ?? 1;

  const r1 = await req("POST", "/auth/refresh-token", { refreshToken: rt1, userid: uid });
  track("1.2", "Valid refresh returns 200", r1.status === 200 && r1.json?.data?.accessToken,
    `status=${r1.status} expiresIn=${r1.json?.data?.expiresIn}`);
  track("1.2b", "Response has tokenType Bearer", r1.json?.data?.tokenType === "Bearer");

  const rt2 = r1.json?.data?.refreshToken;
  const at2 = r1.json?.data?.accessToken;

  const products = await req("GET", "/products", null, at2);
  track("1.3", "New accessToken works on GET /products", products.status === 200, `status=${products.status}`);

  const r1b = await req("POST", "/auth/refresh-token", { refreshToken: rt2, userid: uid });
  track("1.4", "Second refresh with new token OK", r1b.status === 200, `status=${r1b.status}`);

  const oldRt = await req("POST", "/auth/refresh-token", { refreshToken: rt1, userid: uid });
  track("1.5", "Old refresh token revoked", oldRt.status === 401 && oldRt.json?.code === "AUTH_REFRESH_REVOKED",
    `code=${oldRt.json?.code}`);

  // --- 2. Validation 400 ---
  console.log("\n=== 2. Request / validation (400) ===");
  const rtFresh = r1b.json?.data?.refreshToken;

  const v1 = await req("POST", "/auth/refresh-token", { userid: uid });
  track("2.1", "Missing refreshToken → 400", v1.status === 400, `status=${v1.status}`);

  const v2 = await req("POST", "/auth/refresh-token", { refreshToken: rtFresh });
  track("2.2", "Missing userid → 400", v2.status === 400, `status=${v2.status}`);

  const v3 = await req("POST", "/auth/refresh-token", {});
  track("2.3", "Empty body → 400", v3.status === 400, `status=${v3.status}`);

  const v4 = await req("POST", "/auth/refresh-token", { refreshToken: rtFresh, userid: "abc" });
  track("2.4", "userid not a number → 400", v4.status === 400, `status=${v4.status}`);

  const v5 = await req("POST", "/auth/refresh-token", { refreshToken: rtFresh, userid: 0 });
  track("2.5", "userid zero → 400", v5.status === 400, `status=${v5.status}`);

  const v6 = await req("POST", "/auth/refresh-token", { refreshToken: "short", userid: uid });
  track("2.6", "refreshToken too short → 400", v6.status === 400, `status=${v6.status}`);

  // --- 3. Auth / security 401 ---
  console.log("\n=== 3. Auth / security (401) ===");
  const s2 = await req("POST", "/auth/signin", { username: "admin", password: "admin123" });
  const freshRt = s2.json?.data?.refreshToken;
  const freshAt = s2.json?.data?.accessToken;

  const m1 = await req("POST", "/auth/refresh-token", { refreshToken: freshRt, userid: 2 });
  track("3.1", "Wrong userid → AUTH_REFRESH_MISMATCH", m1.status === 401 && m1.json?.code === "AUTH_REFRESH_MISMATCH",
    `code=${m1.json?.code}`);

  const m2 = await req("POST", "/auth/refresh-token", {
    refreshToken: "this-is-not-a-real-jwt-token-abc123xyz",
    userid: uid,
  });
  track("3.2", "Fake JWT → AUTH_REFRESH_INVALID", m2.status === 401 && m2.json?.code === "AUTH_REFRESH_INVALID",
    `code=${m2.json?.code}`);

  const m3 = await req("POST", "/auth/refresh-token", { refreshToken: freshAt, userid: uid });
  track("3.3", "Access token as refresh → 401", m3.status === 401, `code=${m3.json?.code}`);

  const tampered = freshRt.slice(0, -5) + "XXXXX";
  const m4 = await req("POST", "/auth/refresh-token", { refreshToken: tampered, userid: uid });
  track("3.5", "Tampered JWT → 401", m4.status === 401, `code=${m4.json?.code}`);

  const s3 = await req("POST", "/auth/signin", { username: "admin", password: "admin123" });
  const rtLogout = s3.json?.data?.refreshToken;
  const atLogout = s3.json?.data?.accessToken;
  await req("POST", "/auth/signout", null, atLogout);
  const m5 = await req("POST", "/auth/refresh-token", { refreshToken: rtLogout, userid: uid });
  track("3.6", "After signout → 401", m5.status === 401, `code=${m5.json?.code}`);

  // --- 4. HTTP / routing ---
  console.log("\n=== 4. HTTP / routing ===");
  const getRes = await fetch(`${BASE}/auth/refresh-token`, { method: "GET" });
  track("4.2", "GET → 404", getRes.status === 404, `status=${getRes.status}`);

  const noV1 = await fetch(`http://localhost:${process.env.PORT || 8080}/api/auth/refresh-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: freshRt, userid: uid }),
  });
  track("4.3", "Missing /v1 → 404", noV1.status === 404, `status=${noV1.status}`);

  const s4 = await req("POST", "/auth/signin", { username: "admin", password: "admin123" });
  const noAuth = await req("POST", "/auth/refresh-token", {
    refreshToken: s4.json?.data?.refreshToken,
    userid: uid,
  });
  track("4.5", "Works without Authorization header", noAuth.status === 200, `status=${noAuth.status}`);

  // --- 5. Integration flow ---
  console.log("\n=== 5. Integration flow ===");
  const s5 = await req("POST", "/auth/signin", { username: "admin", password: "admin123" });
  const chainRt = s5.json?.data?.refreshToken;
  const chainAt = s5.json?.data?.accessToken;
  const ref = await req("POST", "/auth/refresh-token", { refreshToken: chainRt, userid: uid });
  const newAt = ref.json?.data?.accessToken;
  const prod2 = await req("GET", "/products", null, newAt);
  track("5.1", "Login → refresh → products", ref.status === 200 && prod2.status === 200);

  const ref2 = await req("POST", "/auth/refresh-token", {
    refreshToken: ref.json?.data?.refreshToken,
    userid: uid,
  });
  const oldAgain = await req("POST", "/auth/refresh-token", { refreshToken: chainRt, userid: uid });
  track("5.2", "Double refresh: 2nd OK, 1st token dead",
    ref2.status === 200 && oldAgain.status === 401 && oldAgain.json?.code === "AUTH_REFRESH_REVOKED");

  const me = await req("GET", "/auth/me", null, newAt);
  track("5.4", "GET /auth/me with new access token", me.status === 200, `status=${me.status}`);

  const meOld = await req("GET", "/auth/me", null, chainAt);
  track("5.5", "Old access token may still work until expiry", meOld.status === 200 || meOld.status === 401,
    `status=${meOld.status} (either OK for JWT expiry window)`);

  // --- 6. Rate limiting ---
  console.log("\n=== 6. Rate limiting (65 requests) ===");
  const s6 = await req("POST", "/auth/signin", { username: "admin", password: "admin123" });
  let currentRt = s6.json?.data?.refreshToken;
  let got429 = false;
  let count429 = 0;
  for (let i = 0; i < 65; i++) {
    const r = await req("POST", "/auth/refresh-token", { refreshToken: currentRt, userid: uid });
    if (r.status === 429) {
      got429 = true;
      count429++;
      track("6.1", "Rate limit 429 after many requests", true, `hit at request #${i + 1}`);
      break;
    }
    if (r.json?.data?.refreshToken) currentRt = r.json.data.refreshToken;
  }
  if (!got429) {
    track("6.1", "Rate limit 429 after 65 requests", false, "no 429 received (limit may be higher or window reset)");
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log("\n" + "=".repeat(50));
  console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) {
    console.log("\nFailed tests:");
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.id} ${r.name} ${r.detail}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
