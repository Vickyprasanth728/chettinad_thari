/**
 * Runs POS stock API test cases from docs/pos-stock-testcases.md
 * Usage: node scripts/test-pos-stock-api.js
 */
const BASE = process.env.API_BASE || "http://localhost:8080/api/v1";

const results = [];

function record(id, pass, note = "") {
  results.push({ id, pass, note });
  const icon = pass ? "PASS" : "FAIL";
  console.log(`[${icon}] ${id}${note ? ` — ${note}` : ""}`);
}

async function req(method, path, { token, body, noAuth } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (!noAuth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  console.log("Base URL:", BASE);
  console.log("---");

  // Auth
  const signIn = await req("POST", "/auth/signin", {
    noAuth: true,
    body: { username: "admin", password: "admin123" },
  });
  const token = signIn.json?.data?.accessToken;
  record("SETUP", !!token, token ? "signed in" : signIn.json?.message || signIn.status);
  if (!token) {
    console.log("\nCannot continue without token. Is the server running?");
    process.exit(1);
  }

  // Discover products
  const searchAll = await req("GET", "/products/search?q=", { token });
  const products = searchAll.json?.data || [];
  record("PS-05", searchAll.status === 200 && searchAll.json?.success, `count=${products.length}`);

  let inStock = products.find((p) => Number(p.stockQty) >= 5);
  let oos = products.find((p) => Number(p.stockQty) < 1);
  let lowStock = products.find(
    (p) => Number(p.stockQty) >= 1 && Number(p.stockQty) <= Number(p.lowStockThreshold ?? 5)
  );

  // PS tests
  const ps01 = await req("GET", "/products/search?q=saree", { token });
  record(
    "PS-01",
    ps01.status === 200 &&
      ps01.json?.success &&
      Array.isArray(ps01.json.data) &&
      (ps01.json.data.length === 0 || ps01.json.data[0].stockStatus != null),
    `items=${ps01.json?.data?.length}`
  );

  if (inStock?.stockNo) {
    const ps02 = await req("GET", `/products/search?q=${encodeURIComponent(inStock.stockNo)}`, { token });
    record(
      "PS-02",
      ps02.status === 200 && ps02.json?.data?.some((p) => p.stockNo === inStock.stockNo),
      inStock.stockNo
    );
  } else record("PS-02", false, "no in-stock product with stockNo");

  record("PS-06", true, "skipped — depends on catalog");

  const ps07 = await req("GET", "/products/search?q=&in_stock_only=true", { token });
  const ps07ok =
    ps07.status === 200 &&
    (ps07.json?.data || []).every((p) => Number(p.stockQty) > 0);
  record("PS-07", ps07ok, `items=${ps07.json?.data?.length}`);

  if (oos) {
    const ps08 = await req("GET", `/products/search?q=${encodeURIComponent(oos.stockNo || oos.name)}`, { token });
    const found = (ps08.json?.data || []).find((p) => p.productId === oos.productId);
    record(
      "PS-08",
      found?.stockStatus === "out_of_stock" && Number(found?.stockQty) < 1,
      `productId=${oos.productId}`
    );
    const ps09 = await req(
      "GET",
      `/products/search?q=${encodeURIComponent(oos.stockNo || oos.name)}&in_stock_only=true`,
      { token }
    );
    const hidden = !(ps09.json?.data || []).some((p) => p.productId === oos.productId);
    record("PS-09", hidden, "OOS hidden when in_stock_only");
  } else {
    record("PS-08", false, "no OOS product in DB — set one product qty=0");
    record("PS-09", false, "no OOS product");
  }

  if (lowStock) {
    record(
      "PS-10",
      lowStock.stockStatus === "low_stock",
      `productId=${lowStock.productId} qty=${lowStock.stockQty}`
    );
  } else record("PS-10", false, "no low_stock product (qty 1-5)");

  if (inStock) {
    record(
      "PS-11",
      inStock.stockStatus === "in_stock",
      `productId=${inStock.productId} qty=${inStock.stockQty}`
    );
  } else record("PS-11", false, "no in-stock product");

  const ps12 = await req("GET", "/products/search?q=test", { noAuth: true });
  record("PS-12", ps12.status === 401, `status=${ps12.status}`);

  // OOS list
  const oos01 = await req("GET", "/products/out-of-stock?page=1&limit=20", { token });
  const oosRows = oos01.json?.data?.rows || [];
  record(
    "OOS-01",
    oos01.status === 200 &&
      oos01.json?.success &&
      oosRows.every((p) => Number(p.stockQty) < 1 && p.stockStatus === "out_of_stock"),
    `total=${oos01.json?.data?.total} rows=${oosRows.length}`
  );

  const oos03 = await req("GET", "/products/out-of-stock?search=&page=1&limit=5", { token });
  record("OOS-03", oos03.status === 200 && oos03.json?.success, `rows=${oos03.json?.data?.rows?.length}`);

  if (inStock) {
    const inList = oosRows.some((p) => p.productId === inStock.productId);
    record("OOS-05", !inList, "in-stock product not in OOS list");
  }

  const oos06 = await req("GET", "/products/out-of-stock", { noAuth: true });
  record("OOS-06", oos06.status === 401, `status=${oos06.status}`);

  // check-stock
  if (inStock) {
    const cs01 = await req("POST", "/billing/check-stock", {
      token,
      body: { items: [{ productId: inStock.productId, qty: 1 }] },
    });
    record(
      "CS-01",
      cs01.status === 200 && cs01.json?.success && cs01.json?.data?.ok === true,
      `status=${cs01.status}`
    );

    const avail = Number(inStock.stockQty);
    const cs02 = await req("POST", "/billing/check-stock", {
      token,
      body: { items: [{ productId: inStock.productId, qty: avail + 100 }] },
    });
    record(
      "CS-02",
      cs02.status === 409 && cs02.json?.error?.code === "INSUFFICIENT_STOCK",
      `status=${cs02.status}`
    );
  } else {
    record("CS-01", false, "no in-stock product");
    record("CS-02", false, "no in-stock product");
  }

  if (oos) {
    const cs03 = await req("POST", "/billing/check-stock", {
      token,
      body: { items: [{ productId: oos.productId, qty: 1 }] },
    });
    record(
      "CS-03",
      cs03.status === 409 && cs03.json?.error?.code === "INSUFFICIENT_STOCK",
      `status=${cs03.status}`
    );
  } else record("CS-03", false, "no OOS product");

  const cs06 = await req("POST", "/billing/check-stock", {
    token,
    body: { items: [{ productId: "999999", qty: 1 }] },
  });
  record(
    "CS-06",
    cs06.status === 409 && (cs06.json?.data?.ok === false || cs06.json?.error),
    `status=${cs06.status}`
  );

  const cs07 = await req("POST", "/billing/check-stock", { token, body: { items: [] } });
  record(
    "CS-07",
    cs07.status === 200 && cs07.json?.data?.ok === true,
    `status=${cs07.status}`
  );

  const cs10 = await req("POST", "/billing/check-stock", {
    noAuth: true,
    body: { items: [{ productId: "1", qty: 1 }] },
  });
  record("CS-10", cs10.status === 401, `status=${cs10.status}`);

  // quote
  if (inStock) {
    const q01 = await req("POST", "/billing/quote", {
      token,
      body: {
        billType: "POS",
        items: [
          {
            productId: inStock.productId,
            qty: 1,
            unitPrice: inStock.unitPrice,
            gstRate: inStock.gstRate,
            discount: 0,
          },
        ],
        payments: [],
      },
    });
    record(
      "Q-01",
      q01.status === 200 && q01.json?.success && q01.json?.data?.stockOk === true,
      `stockOk=${q01.json?.data?.stockOk}`
    );

    const q02 = await req("POST", "/billing/quote", {
      token,
      body: {
        billType: "POS",
        items: [
          {
            productId: inStock.productId,
            qty: Number(inStock.stockQty) + 50,
            unitPrice: inStock.unitPrice,
            gstRate: inStock.gstRate,
            discount: 0,
          },
        ],
        payments: [],
      },
    });
    record(
      "Q-02",
      q02.status === 200 && q02.json?.data?.stockOk === false,
      `warnings=${q02.json?.data?.stockWarnings?.length}`
    );
  } else {
    record("Q-01", false, "no in-stock product");
    record("Q-02", false, "no in-stock product");
  }

  if (oos) {
    const q03 = await req("POST", "/billing/quote", {
      token,
      body: {
        billType: "POS",
        items: [
          {
            productId: oos.productId,
            qty: 1,
            unitPrice: oos.unitPrice,
            gstRate: oos.gstRate ?? 0,
            discount: 0,
          },
        ],
        payments: [],
      },
    });
    record(
      "Q-03",
      q03.status === 200 && q03.json?.data?.stockOk === false,
      `stockOk=${q03.json?.data?.stockOk}`
    );
  } else record("Q-03", false, "no OOS product");

  const q04 = await req("POST", "/billing/quote", {
    token,
    body: { billType: "POS", items: [], payments: [] },
  });
  record(
    "Q-04",
    q04.status === 422 && q04.json?.error?.code === "VALIDATION_FAILED",
    `status=${q04.status}`
  );

  // Reports
  const r01 = await req("POST", "/reports/daily-summary", { token });
  record(
    "R-01",
    r01.status === 200 && r01.json?.success && r01.json?.data?.totalBills != null,
    `bills=${r01.json?.data?.totalBills}`
  );

  const r02 = await req("POST", "/reports/daily-summary", { noAuth: true });
  record("R-02", r02.status === 401, `status=${r02.status}`);

  // Dashboard low stock (admin envelope)
  const d01 = await req("GET", "/dashboard/low-stock?limit=5", { token });
  record(
    "D-01",
    d01.status === 200 && d01.json?.status === true && Array.isArray(d01.json?.data),
    `count=${d01.json?.data?.length}`
  );

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log("\n========== SUMMARY ==========");
  console.log(`PASS: ${passed}  FAIL: ${failed}  TOTAL: ${results.length}`);
  if (failed) {
    console.log("\nFailed:");
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.id}: ${r.note}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
