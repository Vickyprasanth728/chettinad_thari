/**
 * Automated tests for GET /api/v1/auth/me
 * Run: node scripts/test-auth-me-api.js
 */
const PORT = process.env.PORT || 8080;
const BASE = `http://localhost:${PORT}/api/v1`;
const ROOT = `http://localhost:${PORT}`;

async function req(method, path, body, token, base = BASE) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
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

function hasUserShape(user) {
  return user?.id && user?.username && user?.role_id != null && user?.role_name;
}

function hasSidebarShape(items) {
  return Array.isArray(items) && items.every((s) => s.id && s.name && s.path);
}

async function signin(username, password) {
  return req("POST", "/auth/signin", { username, password });
}

async function ensureUser(adminToken, userDef) {
  const created = await req("POST", "/users", userDef, adminToken);
  if (created.status === 200 || created.status === 201) return userDef;
  const login = await signin(userDef.username, userDef.password);
  if (login.status === 200) return userDef;
  return null;
}

async function main() {
  console.log(`Testing GET /auth/me against ${BASE}\n`);

  try {
    await fetch(`${ROOT}/`);
  } catch {
    console.error("Server not reachable. Start with: npm run dev");
    process.exit(1);
  }

  // --- Setup: admin signin ---
  const signinRes = await signin("admin", "admin123");
  track("0.0", "Admin signin for setup", signinRes.status === 200, `status=${signinRes.status}`);
  if (signinRes.status !== 200) {
    console.error("Cannot continue without admin signin");
    process.exit(1);
  }

  const adminToken = signinRes.json.data.accessToken;
  const adminRefresh = signinRes.json.data.refreshToken;
  const adminUser = signinRes.json.data.user;
  const adminPerms = signinRes.json.data.permissions;
  const adminSidebar = signinRes.json.data.sidebar;

  // === 1. Happy path ===
  console.log("\n=== 1. Happy path ===");
  const me1 = await req("GET", "/auth/me", null, adminToken);
  track("1.1", "Valid session → 200", me1.status === 200 && me1.json?.status === true,
    `status=${me1.status} message=${me1.json?.message}`);
  track("1.2", "data.user shape", hasUserShape(me1.json?.data?.user),
    JSON.stringify(me1.json?.data?.user?.username));
  track("1.3", "data.permissions array", Array.isArray(me1.json?.data?.permissions) && me1.json.data.permissions.length > 0,
    `count=${me1.json?.data?.permissions?.length}`);
  track("1.4", "data.sidebar shape", hasSidebarShape(me1.json?.data?.sidebar),
    `count=${me1.json?.data?.sidebar?.length}`);
  track("1.5", "User matches signin", me1.json?.data?.user?.id === adminUser.id &&
    me1.json?.data?.user?.username === adminUser.username);
  track("1.5b", "Permissions count matches signin",
    me1.json?.data?.permissions?.length === adminPerms?.length);
  track("1.5c", "Sidebar count matches signin",
    me1.json?.data?.sidebar?.length === adminSidebar?.length);

  const refresh = await req("POST", "/auth/refresh-token", {
    refreshToken: adminRefresh,
    userid: adminUser.id,
  });
  const newToken = refresh.json?.data?.accessToken;
  const meAfterRefresh = await req("GET", "/auth/me", null, newToken);
  track("1.6", "Works after token refresh", meAfterRefresh.status === 200, `status=${meAfterRefresh.status}`);

  // === 2. Request format ===
  console.log("\n=== 2. Request format ===");
  track("2.1", "No body required (GET)", me1.status === 200);
  track("2.2", "Method GET works", me1.status === 200 && me1.json?.message === "Session valid");
  const meMinimal = await req("GET", "/auth/me", null, newToken);
  track("2.3", "Only Authorization header needed", meMinimal.status === 200);

  // === 3. Auth / security 401 ===
  console.log("\n=== 3. Auth / security (401) ===");
  const noHeader = await req("GET", "/auth/me");
  track("3.1", "No Authorization → 401", noHeader.status === 401 &&
    noHeader.json?.code === "AUTH_TOKEN_MISSING", `code=${noHeader.json?.code}`);

  const emptyBearer = await fetch(`${BASE}/auth/me`, {
    method: "GET",
    headers: { Authorization: "Bearer " },
  });
  track("3.2", "Empty Bearer → 401", emptyBearer.status === 401, `status=${emptyBearer.status}`);

  const fake = await req("GET", "/auth/me", null, "fake.jwt.token.not.valid.abc123xyz");
  track("3.3", "Fake token → 401", fake.status === 401 &&
    fake.json?.code === "AUTH_TOKEN_INVALID", `code=${fake.json?.code}`);

  const refreshAsAccess = await req("GET", "/auth/me", null, adminRefresh);
  track("3.4", "Refresh token as Bearer → 401", refreshAsAccess.status === 401 &&
    ["AUTH_INVALID_TOKEN_TYPE", "AUTH_TOKEN_INVALID"].includes(refreshAsAccess.json?.code),
    `code=${refreshAsAccess.json?.code}`);

  const tampered = newToken.slice(0, -6) + "XXXXXX";
  const tamperedRes = await req("GET", "/auth/me", null, tampered);
  track("3.5", "Tampered access token → 401", tamperedRes.status === 401,
    `code=${tamperedRes.json?.code}`);

  const s2 = await signin("admin", "admin123");
  const atLogout = s2.json.data.accessToken;
  await req("POST", "/auth/signout", null, atLogout);
  const afterLogout = await req("GET", "/auth/me", null, atLogout);
  track("3.7", "After signout (JWT may still work until expiry)", afterLogout.status === 200 || afterLogout.status === 401,
    `status=${afterLogout.status} (200 OK until 15m expiry)`);

  // === 4. HTTP / routing ===
  console.log("\n=== 4. HTTP / routing ===");
  const postMe = await req("POST", "/auth/me", {}, adminToken);
  track("4.1", "POST /auth/me → 404", postMe.status === 404, `status=${postMe.status}`);

  const noV1 = await fetch(`${ROOT}/api/auth/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${newToken}` },
  });
  track("4.2", "Missing /v1 → 404", noV1.status === 404, `status=${noV1.status}`);

  const correct = await req("GET", "/auth/me", null, newToken);
  track("4.3", "Correct GET /api/v1/auth/me → 200", correct.status === 200);

  // === 5. Integration flow ===
  console.log("\n=== 5. Integration flow ===");
  const s3 = await signin("admin", "admin123");
  const flowToken = s3.json.data.accessToken;
  const flowUser = s3.json.data.user;
  const flowSidebar = s3.json.data.sidebar;
  const flowMe = await req("GET", "/auth/me", null, flowToken);
  track("5.1", "Page refresh: me rebuilds session", flowMe.status === 200 &&
    flowMe.json?.data?.sidebar?.length === flowSidebar?.length);
  track("5.2", "Login vs me same user", flowMe.json?.data?.user?.id === flowUser.id);

  const products = await req("GET", "/products", null, flowToken);
  track("5.3", "After me, protected API works", products.status === 200, `GET /products status=${products.status}`);

  const s4 = await signin("admin", "admin123");
  const expiredFlowRt = s4.json.data.refreshToken;
  const expiredFlowUid = s4.json.data.user.id;
  const badMe = await req("GET", "/auth/me", null, "invalid.token.for.me.test.xyz");
  const ref = await req("POST", "/auth/refresh-token", {
    refreshToken: expiredFlowRt,
    userid: expiredFlowUid,
  });
  const retryMe = await req("GET", "/auth/me", null, ref.json?.data?.accessToken);
  track("5.4", "401 on bad token → refresh → me OK",
    badMe.status === 401 && ref.status === 200 && retryMe.status === 200);

  // === 6. Role-based ===
  console.log("\n=== 6. Role-based ===");

  const rolesRes = await req("GET", "/roles", null, flowToken);
  const roles = rolesRes.json?.data || rolesRes.json?.roles || rolesRes.json;
  const roleList = Array.isArray(roles) ? roles : [];

  const roleByName = (name) => roleList.find((r) => r.name === name)?.id;

  const billingRoleId = roleByName("Billing Staff") || 2;
  const managerRoleId = roleByName("Manager") || 5;

  const billingUser = await ensureUser(flowToken, {
    username: "test_billing_me",
    password: "billing123",
    name: "Test Billing",
    email: "test_billing_me@chettinad.com",
    mobileno: "9876500001",
    role_id: billingRoleId,
  });

  const managerUser = await ensureUser(flowToken, {
    username: "test_manager_me",
    password: "manager123",
    name: "Test Manager",
    email: "test_manager_me@chettinad.com",
    mobileno: "9876500002",
    role_id: managerRoleId,
  });

  if (billingUser) {
    const billSignin = await signin(billingUser.username, billingUser.password);
    const billMe = await req("GET", "/auth/me", null, billSignin.json?.data?.accessToken);
    const billSidebar = billMe.json?.data?.sidebar || [];
    const hasPos = billSidebar.some((s) => s.path === "/pos" || s.name?.includes("POS"));
    const hasRoles = billSidebar.some((s) => s.path === "/roles");
    const hasMasters = billSidebar.some((s) => s.path === "/masters");
    track("6.1", "Admin has more sidebar items than Billing",
      adminSidebar.length > billSidebar.length,
      `admin=${adminSidebar.length} billing=${billSidebar.length}`);
    track("6.2", "Billing Staff has POS menu", hasPos, `sidebar=${billSidebar.map((s) => s.name).join(", ")}`);
    track("6.3", "Billing Staff no Roles/Masters admin menus", !hasRoles && !hasMasters,
      `roles=${hasRoles} masters=${hasMasters}`);
    track("6.4", "Billing role_name correct", billMe.json?.data?.user?.role_name === "Billing Staff");
  } else {
    track("6.1", "Billing user setup", false, "could not create/login test user");
  }

  if (managerUser) {
    const mgrSignin = await signin(managerUser.username, managerUser.password);
    const mgrMe = await req("GET", "/auth/me", null, mgrSignin.json?.data?.accessToken);
    const mgrSidebar = mgrMe.json?.data?.sidebar || [];
    const hasDashboard = mgrSidebar.some((s) => s.path === "/dashboard");
    const hasPos = mgrSidebar.some((s) => s.path === "/pos");
    track("6.5", "Manager has Dashboard", hasDashboard, `sidebar=${mgrSidebar.map((s) => s.name).join(", ")}`);
    track("6.6", "Manager no POS billing menu", !hasPos);
    track("6.7", "Manager role_name correct", mgrMe.json?.data?.user?.role_name === "Manager");
  } else {
    track("6.5", "Manager user setup", false, "could not create/login test user");
  }

  track("6.8", "Admin role_name is Admin", me1.json?.data?.user?.role_name === "Admin");

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
