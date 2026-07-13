# POS stock APIs (out of stock / low stock)

Base: `/api/v1` · Auth: `Bearer` token · Response: `{ success, data, error }`

Permission: `pos:read` (search, out-of-stock list) · `pos:billing` (check-stock, quote)

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/products/search?q=&in_stock_only=true` | Search by `stockNo` only; response includes `count` plus rows with `stockQty`, `stockStatus`, `stockNo`, `lowStockThreshold` |
| GET | `/products/out-of-stock?search=&page=1&limit=20` | Paginated products with `quantity < 1` |
| POST | `/billing/check-stock` | Validate cart qty before checkout |
| POST | `/billing/quote` | GST quote + `stockOk`, `stockLines`, `stockWarnings` |

## stockStatus

- `out_of_stock` — `stockQty < 1`
- `low_stock` — `stockQty <= lowStockThreshold` (from `LOW_STOCK_THRESHOLD` in `.env`, default 5)
- `in_stock` — otherwise

After migration `004_low_stock_threshold.sql`, admin product APIs use per-product thresholds; POS uses env default until SELECT includes that column.

## POST /billing/check-stock

**Request:**
```json
{ "items": [{ "productId": "1", "qty": 2 }] }
```

**Success (200):**
```json
{
  "success": true,
  "data": {
    "ok": true,
    "lines": [
      {
        "productId": "1",
        "productName": "Test Saree",
        "requestedQty": 2,
        "availableQty": 10,
        "lowStockThreshold": 5,
        "status": "in_stock"
      }
    ],
    "details": []
  }
}
```

**Failure (409):** `error.code` = `INSUFFICIENT_STOCK`

## Migration

```bash
# Run on MySQL if 004 not applied yet
mysql -u root chettinad_thari < migrations/004_low_stock_threshold.sql
```
