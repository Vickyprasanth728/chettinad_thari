/**
 * Smoke test for Products API (no QR endpoints).
 * Usage: node scripts/test-products-api.js
 * Requires: server running, DB migrated & seeded.
 */
import dotenv from "dotenv";
dotenv.config();

const BASE = `http://localhost:${process.env.PORT || 8080}/api/v1`;

async function request(method, path, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let reqBody;
  if (formData) {
    reqBody = formData;
  } else if (body) {
    headers["Content-Type"] = "application/json";
    reqBody = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: reqBody });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const stamp = Date.now();
  const stockNo = `TST-${stamp}`;

  const login = await request("POST", "/auth/signin", {
    body: { username: "admin", password: "admin123" },
  });
  assert(login.json.status && login.json.data?.accessToken, "Login failed");
  const token = login.json.data.accessToken;

  const create = await request("POST", "/products", {
    token,
    body: {
      stock_no: stockNo,
      product_name: "Test Product",
      quantity: 10,
      retail_price: 100,
      discount: 0,
      published: 1,
    },
  });
  assert(create.json.status, `Create failed: ${create.json.message}`);
  const productId = create.json.data.id;

  const list = await request("GET", `/products?search=${encodeURIComponent(stockNo)}`, { token });
  assert(list.json.status && list.json.data?.rows?.length >= 1, "List missing product");
  assert(typeof list.json.data.total === "number", "List should include total count");

  const adjust = await request("POST", `/products/${productId}/adjust-stock`, {
    token,
    body: { action: "decrease", quantity: 3, reason: "smoke test" },
  });
  assert(adjust.json.status && adjust.json.data.quantity === 7, "Adjust stock failed");

  const logs = await request("GET", `/products/${productId}/inventory-logs`, { token });
  assert(logs.json.status && logs.json.data?.length >= 2, "Expected inventory logs");

  const dup = await request("POST", "/products", {
    token,
    body: {
      stock_no: stockNo,
      product_name: "Duplicate",
      quantity: 1,
      retail_price: 50,
    },
  });
  assert(!dup.json.status, "Duplicate stock_no should fail");

  await request("DELETE", `/products/${productId}`, { token });

  console.log("Products API smoke test passed.");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
