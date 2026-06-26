/**
 * Smoke test for POS Sales, Returns & Credit admin APIs.
 * Usage: node scripts/test-pos-sales-api.js
 * Requires: server running, DB migrated, seed + seed:pos (optional sample data).
 */
import dotenv from "dotenv";
dotenv.config();

const BASE = `http://localhost:${process.env.PORT || 8080}/api/v1`;

async function request(method, path, { token, body, blob } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let reqBody;
  if (body) {
    headers["Content-Type"] = "application/json";
    reqBody = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: reqBody });
  if (blob) {
    return { status: res.status, contentType: res.headers.get("content-type"), blob: await res.blob() };
  }
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

  const filters = await request("GET", "/reports/filters/payment-types", { token });
  assert(filters.json.status && Array.isArray(filters.json.data), "Payment types filter failed");
  assert(filters.json.data.includes("Cash"), "Expected display label Cash");

  const staffFilters = await request("GET", "/reports/filters/staff", { token });
  assert(staffFilters.json.status && Array.isArray(staffFilters.json.data), "Staff filter failed");

  const bills = await request("GET", "/pos/bills?page=1&limit=5", { token });
  assert(bills.json.status && bills.json.data?.rows, "List bills failed");
  assert(typeof bills.json.data.total === "number", "Bills list missing total");

  if (bills.json.data.rows.length) {
    const row = bills.json.data.rows[0];
    assert(typeof row.total === "number", "Bill row total should be numeric");
    assert("customer_mobile" in row, "Bill row missing customer_mobile");

    const detail = await request("GET", `/pos/bills/${row.id}`, { token });
    assert(detail.json.status && detail.json.data?.items, "Bill detail failed");
    assert(detail.json.data.customer_mobile !== undefined, "Bill detail missing customer_mobile");
    assert(Array.isArray(detail.json.data.payments), "Bill detail missing payments");

    const pdf = await request("GET", `/pos/bills/${row.id}/invoice-pdf`, { token, blob: true });
    assert(pdf.status === 200, "Invoice PDF failed");
    assert(pdf.contentType?.includes("pdf"), "Invoice should be PDF");

    const linked = await request("GET", `/pos/bills/${row.id}/returns`, { token });
    assert(linked.json.status && Array.isArray(linked.json.data), "Bill returns should be array");
  }

  const returns = await request("GET", "/pos/returns?page=1&limit=5", { token });
  assert(returns.json.status && returns.json.data?.rows, "List returns failed");

  const wallets = await request("GET", "/pos/credit-wallets?page=1&limit=5", { token });
  assert(wallets.json.status && wallets.json.data?.rows, "Credit wallets failed");

  if (wallets.json.data.rows.length) {
    const cid = wallets.json.data.rows[0].customer_id;
    const balance = await request("GET", `/pos/customers/${cid}/credit-balance`, { token });
    assert(balance.json.status && typeof balance.json.data?.balance === "number", "Credit balance failed");

    const history = await request("GET", `/pos/customers/${cid}/credit-history`, { token });
    assert(history.json.status && Array.isArray(history.json.data), "Credit history should be array");
  }

  console.log("POS sales API smoke test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
