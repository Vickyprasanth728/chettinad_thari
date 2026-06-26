/**
 * Smoke test: vendor report + filter vendors.
 * Usage: node scripts/test-vendor-report-api.js
 */
import dotenv from "dotenv";

dotenv.config();

const BASE = `http://localhost:${process.env.PORT || 8080}/api/v1`;

async function request(method, path, { token, query, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let reqBody;
  if (body) {
    headers["Content-Type"] = "application/json";
    reqBody = JSON.stringify(body);
  }
  const qs = query ? `?${new URLSearchParams(query)}` : "";
  const res = await fetch(`${BASE}${path}${qs}`, { method, headers, body: reqBody });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const login = await request("POST", "/auth/signin", {
    body: { username: "admin", password: "admin123" },
  });
  assert(login.json.status && login.json.data?.accessToken, "Login failed");
  const token = login.json.data.accessToken;

  const vendors = await request("GET", "/reports/filters/vendors", { token });
  assert(vendors.status === 200 && vendors.json.status, "Filter vendors failed");
  assert(Array.isArray(vendors.json.data), "Filter vendors should return array");

  const from = new Date();
  from.setDate(from.getDate() - 30);
  const to = new Date();
  const report = await request("GET", "/reports/vendor", {
    token,
    query: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      format: "json",
    },
  });
  assert(report.status === 200 && report.json.status, "Vendor report failed");
  assert(Array.isArray(report.json.data), "Vendor report data should be array");

  const pending = await request("GET", "/reports/vendor", {
    token,
    query: { pending_only: "1", format: "json" },
  });
  assert(pending.status === 200 && pending.json.status, "Pending-only vendor report failed");

  console.log("Vendor report API smoke test passed.");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
