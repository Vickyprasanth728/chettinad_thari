# Chettinad Thari Backend API

Node.js (ES modules) REST API for **Chettinad Thari POS & Inventory Management** — Admin panel + POS billing.

## Stack

- Express 4, Sequelize 6, MySQL
- JWT auth + role-based permissions
- Excel bulk upload, QR codes, Puppeteer PDF invoices

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment file and configure MySQL:
   ```bash
   copy .env.example .env
   ```

3. Create database schema:
   ```bash
   npm run migrate
   ```

4. Seed roles, permissions, admin user:
   ```bash
   npm run seed
   ```

5. Start server:
   ```bash
   npm run dev
   ```

Default admin: **username** `admin` / **password** `admin123`

API base: `http://localhost:8080/api/v1`

## Module map

| Module | Base path |
|--------|-----------|
| Auth | `/auth` |
| Users & Staff | `/users` |
| Roles / Permissions / Sidebar | `/roles`, `/permissions`, `/sidebar` |
| Masters (gmaster, design_master, etc.) | `/:table` |
| GST | `/gst` |
| Vendors, Orders, Payments | `/vendors` |
| Products & Inventory | `/products` |
| POS Billing & Returns | `/pos` |
| Dashboard | `/dashboard` |
| Reports | `/reports` |
| GST Reports | `/gst-reports` |

## Integration test checklist

- [ ] Login as admin → receive token, permissions, sidebar
- [ ] Create vendor → vendor order → vendor payment → pending balance decreases
- [ ] Bulk upload products → QR tag generated → POS catalog lists product
- [ ] POS billing → stock decreases → bill PDF downloads
- [ ] Partial return → stock increases → credit wallet credited
- [ ] New bill with credit applied → wallet debited
- [ ] Cancel bill → stock restored → appears in cancelled bills report
- [ ] Dashboard widgets return sales and low stock
- [ ] GST summary (B2B/B2C) and detailed invoice reports export to Excel/CSV/PDF
- [ ] GST summary and detailed totals reconcile for the same date range

## Postman

Import `postman/Chettinad_Thari_API.postman_collection.json` and set `baseUrl` + `token` variables after login.

## Notes

- Set `CLIENT=CHETTINAD` in `.env`
- Bill numbers: `BILL-YYYYMMDD-####`, returns: `RET-YYYYMMDD-####`
- No school/ecommerce/Delhivery modules (Tiara-only features excluded)
