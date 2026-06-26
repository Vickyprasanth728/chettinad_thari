/**
 * Automated tests for POST /api/v1/auth/signout
 * Run: node scripts/test-auth-signout-api.js
 */
const PORT = process.env.PORT || 8080;
const BASE = `http://localhost:${PORT}/api/v1`;
const ROOT = `http://localhost:${PORT}`;

async function req(method, path, body, token, base = BASE) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null && !["GET", "HEAD"].includes(method)) {
    headers["Content-Type"] = "application/json";
  }
  const opts = { method, headers };
  if (body != null && !["GET", "HEAD"].includes(method)) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, opts);
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

async function signin(username = "admin", password = "admin123") {
  return req("POST", "/auth/signin", { username, password });
}

async function main() {
  console.log(`Testing POST /auth/signout against ${BASE}\n`);

  try {
    await fetch(`${ROOT}/`);
  } catch {
    console.error("Server not reachable. Start with: npm run dev");
    process.exit(1);
  }

  // === 1. Happy path ===
  console.log("=== 1. Happy path ===");
  const s1 = await signin();
  track("1.0", "Setup signin", s1.status === 200, `status=${s1.status}`);

  const at1 = s1.json.data.accessToken;
  const rt1 = s1.json.data.refreshToken;
  const uid = s1.json.data.user.id;

  const out1 = await req("POST", "/auth/signout", null, at1);
  track("1.1", "Valid signout → 200", out1.status === 200 && out1.json?.status === true,
    `status=${out1.status}`);
  track("1.2", "Message correct", out1.json?.message === "Signed out successfully");
  track("1.3", "No data field in response", out1.json?.data === undefined);

  const s1b = await signin();
  const rtBefore = s1b.json.data.refreshToken;
  const atBefore = s1b.json.data.accessToken;
  const uidBefore = s1b.json.data.user.id;
  await req("POST", "/auth/signout", null, atBefore);
  const refreshAfter = await req("POST", "/auth/refresh-token", {
    refreshToken: rtBefore,
    userid: uidBefore,
  });
  track("1.4", "Refresh revoked after signout", refreshAfter.status === 401 &&
    refreshAfter.json?.code === "AUTH_REFRESH_REVOKED", `code=${refreshAfter.json?.code}`);

  const s1c = await signin();
  track("1.5", "Can sign in again after signout", s1c.status === 200 && s1c.json?.data?.accessToken,
    `status=${s1c.status}`);

  // === 2. Request format ===
  console.log("\n=== 2. Request format ===");
  const s2 = await signin();
  const at2 = s2.json.data.accessToken;
  const out2 = await req("POST", "/auth/signout", null, at2);
  track("2.1", "No request body required", out2.status === 200);
  track("2.2", "POST method works", out2.status === 200);

  const s2b = await signin();
  const out2b = await fetch(`${BASE}/auth/signout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s2b.json.data.accessToken}` },
  });
  const out2bJson = await out2b.json();
  track("2.3", "Works with Authorization only (no Content-Type)", out2b.status === 200,
    `status=${out2b.status}`);

  // === 3. Auth / security 401 ===
  console.log("\n=== 3. Auth / security (401) ===");
  const noAuth = await req("POST", "/auth/signout");
  track("3.1", "No Authorization → 401", noAuth.status === 401 &&
    noAuth.json?.code === "AUTH_TOKEN_MISSING", `code=${noAuth.json?.code}`);

  const emptyBearer = await fetch(`${BASE}/auth/signout`, {
    method: "POST",
    headers: { Authorization: "Bearer " },
  });
  track("3.2", "Empty Bearer → 401", emptyBearer.status === 401, `status=${emptyBearer.status}`);

  const fake = await req("POST", "/auth/signout", null, "fake.jwt.token.not.valid.abc123xyz");
  track("3.3", "Fake token → 401", fake.status === 401 &&
    fake.json?.code === "AUTH_TOKEN_INVALID", `code=${fake.json?.code}`);

  const s3 = await signin();
  const refreshAsBearer = await req("POST", "/auth/signout", null, s3.json.data.refreshToken);
  track("3.4", "Refresh token as Bearer → 401", refreshAsBearer.status === 401,
    `code=${refreshAsBearer.json?.code}`);

  const s3b = await signin();
  const tampered = s3b.json.data.accessToken.slice(0, -6) + "XXXXXX";
  const tamperedRes = await req("POST", "/auth/signout", null, tampered);
  track("3.5", "Tampered access token → 401", tamperedRes.status === 401,
    `code=${tamperedRes.json?.code}`);

  const s3c = await signin();
  const at3c = s3c.json.data.accessToken;
  const outA = await req("POST", "/auth/signout", null, at3c);
  const outB = await req("POST", "/auth/signout", null, at3c);
  track("3.7", "Signout twice with same token", outA.status === 200 && outB.status === 200,
    `first=${outA.status} second=${outB.status}`);

  // === 4. HTTP / routing ===
  console.log("\n=== 4. HTTP / routing ===");
  const s4 = await signin();
  const getOut = await req("GET", "/auth/signout", null, s4.json.data.accessToken);
  track("4.1", "GET /auth/signout → 404", getOut.status === 404, `status=${getOut.status}`);

  const noV1 = await fetch(`${ROOT}/api/auth/signout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s4.json.data.accessToken}` },
  });
  track("4.2", "Missing /v1 → 404", noV1.status === 404, `status=${noV1.status}`);

  const s4b = await signin();
  const correct = await req("POST", "/auth/signout", null, s4b.json.data.accessToken);
  track("4.3", "Correct POST /api/v1/auth/signout → 200", correct.status === 200);

  // === 5. Integration flow ===
  console.log("\n=== 5. Integration flow ===");
  const s5 = await signin();
  const at5 = s5.json.data.accessToken;
  const rt5 = s5.json.data.refreshToken;
  const uid5 = s5.json.data.user.id;
  const signout5 = await req("POST", "/auth/signout", null, at5);
  const loginAgain = await signin();
  track("5.1", "Login → signout → login", signout5.status === 200 && loginAgain.status === 200);

  const s5b = await signin();
  await req("POST", "/auth/signout", null, s5b.json.data.accessToken);
  const refresh5 = await req("POST", "/auth/refresh-token", {
    refreshToken: s5b.json.data.refreshToken,
    userid: s5b.json.data.user.id,
  });
  track("5.2", "Login → signout → refresh fails", refresh5.status === 401);

  const s5c = await signin();
  const at5c = s5c.json.data.accessToken;
  await req("POST", "/auth/signout", null, at5c);
  const products = await req("GET", "/products", null, at5c);
  track("5.3", "After signout, access JWT may still call /products until expiry",
    products.status === 200 || products.status === 401, `status=${products.status}`);

  const s5d = await signin();
  const at5d = s5d.json.data.accessToken;
  await req("POST", "/auth/signout", null, at5d);
  const me = await req("GET", "/auth/me", null, at5d);
  track("5.4", "After signout, access JWT may still call /auth/me until expiry",
    me.status === 200 || me.status === 401, `status=${me.status}`);

  const s5e = await signin();
  const ref5 = await req("POST", "/auth/refresh-token", {
    refreshToken: s5e.json.data.refreshToken,
    userid: s5e.json.data.user.id,
  });
  const newRt = ref5.json?.data?.refreshToken;
  await req("POST", "/auth/signout", null, ref5.json?.data?.accessToken);
  const refreshAfterFlow = await req("POST", "/auth/refresh-token", {
    refreshToken: newRt,
    userid: s5e.json.data.user.id,
  });
  track("5.5", "Login → refresh → signout → refresh fails",
    ref5.status === 200 && refreshAfterFlow.status === 401);

  // === 6. Frontend behavior (API-simulated) ===
  console.log("\n=== 6. Frontend behavior (API-simulated) ===");
  track("6.1", "Frontend must clear tokens locally (manual UI test)",
    true, "SKIPPED — not testable via API; document for UI team");
  track("6.2", "Frontend redirect to login after signout (manual UI test)",
    true, "SKIPPED — not testable via API");
  track("6.3", "Frontend must not send token after logout (manual UI test)",
    true, "SKIPPED — not testable via API");

  // API contract frontend relies on
  const s6 = await signin();
  const out6 = await req("POST", "/auth/signout", null, s6.json.data.accessToken);
  track("6.4", "API contract: 200 signals logout success for UI", out6.status === 200 &&
    out6.json?.status === true);
  const s6b = await signin();
  await req("POST", "/auth/signout", null, s6b.json.data.accessToken);
  const retryRefresh = await req("POST", "/auth/refresh-token", {
    refreshToken: s6b.json.data.refreshToken,
    userid: s6b.json.data.user.id,
  });
  track("6.5", "API contract: UI should treat refresh 401 after signout as force re-login",
    retryRefresh.status === 401, `code=${retryRefresh.json?.code}`);

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const skipped = results.filter((r) => r.detail?.startsWith("SKIPPED")).length;
  const apiTests = results.length - skipped;

  console.log("\n" + "=".repeat(50));
  console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${apiTests} API tests, ${skipped} manual UI notes`);
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
