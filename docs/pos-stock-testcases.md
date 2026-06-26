# Test cases — POS stock & related APIs

**Collection:** `postman/Chettinad_Thari_API.postman_collection.json`  
**Folder:** `POS App (chettinad_pos)` → `Products & Stock` / `Billing`  
**Base URL:** `http://localhost:8080/api/v1`  
**Auth:** `POST /auth/signin` → use `Bearer {{token}}` on all tests below  

**Prerequisites**

| Item | Value |
|------|--------|
| Admin user | `admin` / `admin123` (after `npm run seed`) |
| Product A | `productId` with `quantity >= 5` (e.g. id `1`) |
| Product B | `productId` with `quantity = 0` (set via admin adjust-stock or DB) |
| Product C | `quantity` between `1` and `LOW_STOCK_THRESHOLD` (default 5) for low_stock |
| `.env` | `LOW_STOCK_THRESHOLD=5` (optional override) |

---

## 1. GET `/products/search`

| ID | Scenario | Request | Expected |
|----|----------|---------|----------|
| PS-01 | Search by name | `GET /products/search?q=saree` | `200`, `success: true`, array with `productId`, `name`, `stockQty`, `stockStatus`, `stockNo`, `lowStockThreshold` |
| PS-02 | Search by stock no | `GET /products/search?q=CT-002` | `200`, at least one match where `stockNo` matches |
| PS-03 | Search by stock no | `GET /products/search?q=CT-001` | `200`, match on `stockNo` if exists |
| PS-04 | QR JSON scan | `GET /products/search?q={"stock_number":"CT-001","id":1}` | `200`, exact product match |
| PS-05 | Empty query | `GET /products/search?q=` | `200`, list up to 20 published products |
| PS-06 | No match | `GET /products/search?q=zzznomatch999` | `200`, `data: []` |
| PS-07 | In stock only filter | `GET /products/search?q=saree&in_stock_only=true` | `200`, every item has `stockQty > 0` |
| PS-08 | Out-of-stock visible without filter | `GET /products/search?q=<product B stock no>` | `200`, item has `stockStatus: "out_of_stock"`, `stockQty: 0` |
| PS-09 | Out-of-stock hidden with filter | `GET /products/search?q=<product B stock no>&in_stock_only=true` | `200`, product B **not** in list |
| PS-10 | Low stock status | Product C qty = 3, threshold 5 | `stockStatus: "low_stock"` |
| PS-11 | In stock status | Product A qty = 10 | `stockStatus: "in_stock"` |
| PS-12 | No token | Same without `Authorization` | `401` |
| PS-13 | No permission | User without `pos:read` | `403` |

---

## 2. GET `/products/out-of-stock`

| ID | Scenario | Request | Expected |
|----|----------|---------|----------|
| OOS-01 | List all OOS | `GET /products/out-of-stock?page=1&limit=20` | `200`, `data.rows[]` only products with `stockQty < 1`, each `stockStatus: "out_of_stock"` |
| OOS-02 | Pagination | Set product B qty=0, ensure 25+ OOS rows | Page 1 `limit=10` → 10 rows; page 2 → next rows; `total` correct |
| OOS-03 | Search filter | `GET /products/out-of-stock?search=saree` | `200`, only OOS products matching name/stock no |
| OOS-04 | Empty when none OOS | All products qty > 0 | `200`, `rows: []`, `total: 0` |
| OOS-05 | In-stock not listed | Product A qty > 0 | Product A **absent** from `rows` |
| OOS-06 | No token | Without auth | `401` |
| OOS-07 | No permission | Without `pos:read` | `403` |

---

## 3. POST `/billing/check-stock`

| ID | Scenario | Body | Expected |
|----|----------|------|----------|
| CS-01 | Sufficient stock | `{ "items": [{ "productId": "1", "qty": 1 }] }` (available ≥ 1) | `200`, `data.ok: true`, `lines[].status: "in_stock"`, `details: []` |
| CS-02 | Qty exceeds available | Product qty = 3, request `qty: 5` | `409`, `error.code: "INSUFFICIENT_STOCK"`, `details[].status: "insufficient_stock"`, `availableQty: 3` |
| CS-03 | Out of stock product | Product B qty = 0, `qty: 1` | `409`, `details[].status: "out_of_stock"`, message mentions out of stock |
| CS-04 | Multiple lines — one bad | Item A ok, Item B OOS | `409`, at least one detail for B |
| CS-05 | Multiple lines — all ok | Two products with enough stock | `200`, `ok: true`, two `lines` |
| CS-06 | Product not found | `{ "items": [{ "productId": "99999", "qty": 1 }] }` | `409`, `lines[].status: "not_found"` |
| CS-07 | Empty items | `{ "items": [] }` | `200`, `ok: true`, empty `lines` |
| CS-08 | Missing items key | `{}` | `200`, `ok: true` (treated as empty cart) |
| CS-09 | Zero qty requested | `{ "items": [{ "productId": "1", "qty": 0 }] }` | `200`, `ok: true` (no stock violation) |
| CS-10 | No token | Without auth | `401` |
| CS-11 | Billing staff | User with `pos:billing` | `200` / `409` per data |

---

## 4. POST `/billing/quote` (stock fields)

| ID | Scenario | Body | Expected |
|----|----------|------|----------|
| Q-01 | Quote with enough stock | Valid `items` + `payments: []` | `200`, `lines`, `summary`, `stockOk: true`, `stockWarnings: []` |
| Q-02 | Quote over qty | `qty` greater than available | `200`, `stockOk: false`, `stockWarnings` non-empty (quote still returns GST) |
| Q-03 | Quote OOS product | Product qty = 0, `qty: 1` | `200`, `stockOk: false`, warning for that `productId` |
| Q-04 | Validation error (no items) | `{ "items": [], "payments": [] }` | `422`, `VALIDATION_FAILED` (no stock fields) |

---

## 5. POST `/billing/checkout` (stock integration)

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| CO-01 | Happy path | `check-stock` ok → checkout with matching payments | `201`, bill created, DB `products.quantity` decreased |
| CO-02 | Skip check-stock | Checkout with `qty` > available | `500` or error message insufficient stock (server-side block) |
| CO-03 | After OOS | Product qty = 0 | Checkout fails — cannot complete sale |

---

## 6. End-to-end POS flow (Postman order)

| ID | Flow | Steps |
|----|------|-------|
| E2E-01 | Sell in-stock | Sign In → Search (`in_stock_only=true`) → Quote → Check Stock → Checkout → Get Bill |
| E2E-02 | Block OOS add | Search OOS product → UI should not add; API: Check Stock returns 409 |
| E2E-03 | Inventory view | Set product qty to 0 → Out of Stock List includes it → Search without filter shows `out_of_stock` |
| E2E-04 | Return restock | Complete sale → return item → `quantity` increases (§4.4 SRD) |

---

## 7. Related APIs (same Postman folder)

### POST `/reports/daily-summary`, `/reports/gst-summary`, `/reports/payment-modes`

| ID | Scenario | Expected |
|----|----------|----------|
| R-01 | After a sale today | Daily summary `totalBills` / `totalSales` reflect new bill |
| R-02 | No auth | `401` |

### Admin — GET `/dashboard/low-stock` (not OOS)

| ID | Scenario | Expected |
|----|----------|----------|
| D-01 | Low stock list | Products with `qty <= threshold`, sorted ascending |
| D-02 | vs OOS list | Product with `qty=0` appears in **out-of-stock** API, may also appear in low-stock dashboard |

---

## 8. Negative / edge cases

| ID | Scenario | Expected |
|----|----------|----------|
| N-01 | Invalid `productId` (string) | `409` not_found or validation |
| N-02 | `in_stock_only` typo | `in_stock_only=false` or absent → OOS products can appear |
| N-03 | Concurrent sale | Two checkouts same product near zero stock — second should fail insufficient stock |
| N-04 | Unpublished product | `status=0` or `published=0` — not in search/OOS lists |

---

## Quick Postman checklist

1. **Auth → Sign In**
2. **POS App → Products & Stock → Search Products**
3. **Search (in stock only)**
4. **Out of Stock List**
5. **Billing → Quote** (check `stockOk`)
6. **Check Stock**
7. **Checkout** (saves `billNo`)

---

## Pass criteria summary

- All stock endpoints return `{ success: true/false }` (not admin `{ status }` envelope).
- `stockStatus` is one of: `in_stock`, `low_stock`, `out_of_stock`.
- `check-stock` returns **409** + `INSUFFICIENT_STOCK` when sale cannot proceed.
- `out-of-stock` list never includes products with `quantity >= 1`.
- `in_stock_only=true` never includes `quantity = 0`.
