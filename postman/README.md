# Postman — Chettinad Thari API

## Import

1. Open Postman → **Import**
2. Select both files:
   - `Chettinad_Thari_API.postman_collection.json`
   - `Chettinad_Thari_Local.postman_environment.json`
3. Choose environment **Chettinad Thari — Local** (top-right dropdown)

## Quick start

1. Start API: `npm run dev` (port **8080**)
2. Run **Auth → Sign In**  
   - Saves `token`, `refreshToken`, and `userId` automatically (Tests tab).
3. Call any other request — they use `Authorization: Bearer {{token}}`.

## Collection folders

| Folder | Description |
|--------|-------------|
| **Auth** | Sign in, refresh token, sign out, current session |
| **Users** | User CRUD, staff list, uniqueness checks |
| **Roles** | Role CRUD with permission assignment |
| **Permissions** | Permission CRUD |
| **Sidebar** | Navigation menu configuration |
| **Dashboard** | Summary, low stock, sales charts |
| **Reports** | Sales, billing, vendor reports + filters |
| **GST Reports** | GST summary, detailed, HSN, reconciliation |
| **Categories** | Product category hierarchy |
| **GST** | GST tax slab master |
| **Masters** | gmaster, gmastervalue, design_master, size, color |
| **Products** | CRUD, inventory, QR, bulk upload, images |
| **Vendors** | Vendor CRUD, orders, payments, balance |
| **POS App** | New POS billing, returns, customers, POS reports |
| **POS Billing (Admin)** | Legacy admin POS panel |
| **Settings** | Receipt HTML templates |

## Variables

| Variable | Set by | Use |
|----------|--------|-----|
| `baseUrl` | Default | `http://localhost:8080/api/v1` |
| `token` | Sign In test script | All protected routes |
| `userId`, `productId`, `vendorId`, `billId`, … | Create requests (or edit manually) | Path/query params |

After **Create** requests, check Tests — IDs are stored in collection variables when the response includes `data.id`.

## Bulk upload

**Products → Bulk Upload → Bulk Upload**: Body → form-data → key `file` → choose `.xlsx` from template download.

## Regenerate collection

```bash
node scripts/generate-postman-collection.js
```

## Default login

- Username: `admin`
- Password: `admin123`
