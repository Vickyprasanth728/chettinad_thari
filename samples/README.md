# Sample files

## Product bulk upload

**File:** `product_bulk_upload_sample.xlsx`

Use this to test **Products → Bulk Upload** in Postman or the admin panel.

### Required columns

| Column | Required | Notes |
|--------|----------|--------|
| Stock No | Yes | Unique; existing stock no updates that product |
| Item Description | Yes | Product name (must be unique) |
| Retail Price | Yes | Number |
| Quantity | Yes | Integer |
| Discount | No | Default 0 |
| GST % | No | If filled: must match `gst.tax` in DB (e.g. 5, 12). Empty = no GST |
| Low Stock Threshold | No | Default 5 |
| Vendor | No | If filled: must match `vendors.vendor_code` or `vendors.vendor_name` (e.g. `A1`). Empty = no vendor |
| HSN | No | HSN code |
| Design Code | No | If filled: must exist in `design_master.design_code`. Empty = no design |

### Upload via API

1. Sign in and get token.
2. `GET /api/v1/products/bulk-upload/template` — download template from API.
3. `POST /api/v1/products/bulk-upload` — Body → form-data → key `file` → select this `.xlsx`.

### Failed rows

If any row fails, the API responds with an **Excel download** (`bulk_upload_errors_*.xlsx`), not JSON:

- Sheet name: **Failed Records**
- All original columns plus **Error Reason**
- A copy is saved under `uploads/bulk-errors/`
- Response headers: `X-Bulk-Upload-Success`, `X-Bulk-Upload-Failed`

When every row succeeds, the response is JSON: `{ "success": N, "failed": 0 }`.

### Regenerate sample file

```bash
node scripts/generate-bulk-upload-sample.js
```
