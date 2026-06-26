# Phase 1 — Masters + GST API Handoff

**Prerequisite:** Phase 0 Auth complete. Obtain `accessToken` from `POST /auth/signin` before calling any endpoint below.

---

## Base URL

| Environment | Value |
|-------------|-------|
| Local dev | `http://localhost:8080/api/v1` |
| Production | `https://<your-domain>/api/v1` |

All paths in this document are **relative to baseUrl**. Example: `GET /gst` → `http://localhost:8080/api/v1/gst`.

### Frontend (.env)

```env
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

```javascript
const API = import.meta.env.VITE_API_BASE_URL;

fetch(`${API}/gst`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

### Postman

Import `postman/Chettinad_Thari_API.postman_collection.json`. Collection variables:

| Variable | Value |
|----------|-------|
| `baseUrl` | `http://localhost:8080/api/v1` |
| `token` | Set from sign-in response `data.accessToken` |

Use folder **Phase 1 — Masters + GST** for all requests in this phase.

---

## Test credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |

Sign in:

```http
POST /auth/signin
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

Use `data.accessToken` as `Authorization: Bearer <token>` on every request below.

---

## Common conventions

### Response envelope

All endpoints return:

```json
{
  "status": true,
  "message": "Human-readable message",
  "data": { }
}
```

Errors set `status: false` and omit `data` (unless noted).

### Auth header

```http
Authorization: Bearer <accessToken>
```

### Master URL naming

Each master uses its **table name** as the URL segment (lowercase, underscore where needed):

| Master | URL segment |
|--------|-------------|
| General master (categories) | `gmaster` |
| Master values (dropdown options) | `gmastervalue` |
| Design | `design_master` |
| GST (dedicated route) | `gst` |

### Standard CRUD pattern

| Action | Method | Path |
|--------|--------|------|
| List | GET | `/{master}` |
| Get by id | GET | `/{master}/:id` |
| Create | POST | `/{master}` |
| Update | PUT | `/{master}/:id` |
| Delete (single, soft) | DELETE | `/{master}/:id` |
| Bulk delete | DELETE | `/{master}/id1,id2,id3` |

### Permissions

| Master | Permission prefix |
|--------|-------------------|
| `gmaster`, `gmastervalue`, `design_master` | `master:create`, `master:read`, `master:update`, `master:delete` |
| `gst` | `gst:create`, `gst:read`, `gst:update`, `gst:delete` |
| `POST /design/check-unique-code` | `master:read` (token only; no separate permission check) |

Admin role includes all permissions above.

---

## Endpoint summary

| # | Method | Path | Permission | Notes |
|---|--------|------|------------|-------|
| 1 | GET | `/gst` | `gst:read` | List all active GST slabs |
| 2 | POST | `/gst` | `gst:create` | Create GST slab |
| 3 | PUT | `/gst/:id` | `gst:update` | Update GST slab |
| 4 | DELETE | `/gst/:id` | `gst:delete` | Soft delete (`status = 0`) |
| 5 | GET | `/gmaster` | `master:read` | List general masters (paginated) |
| 6 | POST | `/gmaster` | `master:create` | Create general master |
| 7 | PUT | `/gmaster/:id` | `master:update` | Update general master |
| 8 | DELETE | `/gmaster/:id` | `master:delete` | Soft delete |
| 9 | GET | `/gmastervalue` | `master:read` | List values; filter with `?gmaster_id=` |
| 10 | POST | `/gmastervalue` | `master:create` | Create master value |
| 11 | PUT | `/gmastervalue/:id` | `master:update` | Update master value |
| 12 | DELETE | `/gmastervalue/:id` | `master:delete` | Soft delete |
| 13 | GET | `/design_master` | `master:read` | List designs (paginated) |
| 14 | POST | `/design_master` | `master:create` | Create design |
| 15 | PUT | `/design_master/:id` | `master:update` | Update design |
| 16 | DELETE | `/design_master/:id` | `master:delete` | Soft delete |
| 17 | POST | `/design/check-unique-code` | Bearer token | Validate design code uniqueness |

**Total: 17 endpoints** (13 CRUD + 1 design helper + GST uses dedicated `/gst` route).

---

## Implementation notes (current backend)

| Feature | Documented pattern | Current status |
|---------|-------------------|----------------|
| List / Create / Update / Delete (single) | Standard CRUD | **Implemented** |
| `GET /:id` (get by id) | Standard CRUD | **Not implemented** — filter from list response |
| `DELETE /:id1,id2,id3` (bulk delete) | Standard CRUD | **Not implemented** — call single delete in a loop |

**Workarounds until backend adds get-by-id and bulk delete:**

- **Get by id:** `GET /gst` or `GET /gmaster` returns all rows; find the row by `id` client-side. Generic masters support `?search=` on list (except `gmastervalue`).
- **Bulk delete:** Loop `DELETE /{master}/:id` for each selected id.

---

## GST (`/gst`)

Dedicated route — not the generic `/:table` handler.

### 1. List GST slabs

```http
GET /gst
Authorization: Bearer <token>
```

**Response 200:**

```json
{
  "status": true,
  "message": "GST list",
  "data": [
    {
      "id": 1,
      "name": "GST 5%",
      "tax": "5.00",
      "type": "inclusive",
      "status": 1
    },
    {
      "id": 2,
      "name": "GST 12%",
      "tax": "12.00",
      "type": "inclusive",
      "status": 1
    }
  ]
}
```

List query params: none. Returns all rows where `status != 0`, ordered by `id`.

---

### 2. Create GST slab

```http
POST /gst
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "GST 5%",
  "tax": 5,
  "type": "inclusive",
  "status": 1
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Unique label (e.g. `"GST 5%"`) |
| `tax` | number | Yes | Tax percentage (e.g. `5`, `12`, `18`) |
| `type` | string | Yes | `"inclusive"` or `"exclusive"` |
| `status` | number | No | Default `1` (active) |

**Response 200:**

```json
{
  "status": true,
  "message": "GST created",
  "data": { "id": 4 }
}
```

---

### 3. Update GST slab

```http
PUT /gst/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "GST 5% (Revised)",
  "tax": 5,
  "type": "exclusive",
  "status": 1
}
```

All body fields are optional; omitted fields keep their current values (`COALESCE` update).

**Response 200:**

```json
{
  "status": true,
  "message": "GST updated"
}
```

---

### 4. Delete GST slab (soft)

```http
DELETE /gst/:id
Authorization: Bearer <token>
```

Sets `status = 0`. Row is excluded from list responses.

**Response 200:**

```json
{
  "status": true,
  "message": "GST deleted"
}
```

---

## General master — `gmaster`

Parent categories (e.g. Product Category, Color Group). Used to group dropdown values in `gmastervalue`.

### 5. List general masters

```http
GET /gmaster
Authorization: Bearer <token>
```

**Query params (optional):**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `50` | Page size |
| `search` | string | — | Partial match on `name` |

**Response 200:**

```json
{
  "status": true,
  "message": "Records fetched",
  "data": {
    "rows": [
      {
        "id": 1,
        "name": "Product Category",
        "status": 1
      }
    ],
    "page": 1,
    "limit": 50
  }
}
```

---

### 6. Create general master

```http
POST /gmaster
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Product Category"
}
```

| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes |

**Response 200:**

```json
{
  "status": true,
  "message": "Record created",
  "data": { "id": 1 }
}
```

---

### 7. Update general master

```http
PUT /gmaster/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Category Name"
}
```

**Response 200:**

```json
{
  "status": true,
  "message": "Record updated"
}
```

---

### 8. Delete general master (soft)

```http
DELETE /gmaster/:id
Authorization: Bearer <token>
```

**Response 200:**

```json
{
  "status": true,
  "message": "Record deleted"
}
```

---

## Master values — `gmastervalue`

Dropdown options linked to a `gmaster` parent (e.g. Silk, Cotton under Product Category).

### 9. List master values

```http
GET /gmastervalue?gmaster_id=1
Authorization: Bearer <token>
```

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `gmaster_id` | number | Recommended | Filter values for one parent master |
| `page` | number | No | Default `1` |
| `limit` | number | No | Default `50` |

Note: `search` is **not** applied to `gmastervalue` lists — use `gmaster_id` filter.

**Response 200:**

```json
{
  "status": true,
  "message": "Records fetched",
  "data": {
    "rows": [
      {
        "id": 1,
        "gmaster_id": 1,
        "name": "Silk",
        "status": 1
      }
    ],
    "page": 1,
    "limit": 50
  }
}
```

---

### 10. Create master value

```http
POST /gmastervalue
Authorization: Bearer <token>
Content-Type: application/json

{
  "gmaster_id": 1,
  "name": "Silk"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `gmaster_id` | number | Yes | Parent `gmaster.id` |
| `name` | string | Yes | Unique per `gmaster_id` |

**Response 200:**

```json
{
  "status": true,
  "message": "Record created",
  "data": { "id": 1 }
}
```

---

### 11. Update master value

```http
PUT /gmastervalue/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "gmaster_id": 1,
  "name": "Pure Silk"
}
```

**Response 200:**

```json
{
  "status": true,
  "message": "Record updated"
}
```

---

### 12. Delete master value (soft)

```http
DELETE /gmastervalue/:id
Authorization: Bearer <token>
```

**Response 200:**

```json
{
  "status": true,
  "message": "Record deleted"
}
```

---

## Design master — `design_master`

Product design codes used when creating inventory (Phase 2).

### 13. List designs

```http
GET /design_master
Authorization: Bearer <token>
```

**Query params (optional):** `page`, `limit`, `search` (matches `design_code`).

**Response 200:**

```json
{
  "status": true,
  "message": "Records fetched",
  "data": {
    "rows": [
      {
        "id": 1,
        "design_code": "DES-001",
        "design_details": "Chettinad pattern",
        "status": 1,
        "createdon": "2026-05-30T10:00:00.000Z",
        "updatedon": "2026-05-30T10:00:00.000Z"
      }
    ],
    "page": 1,
    "limit": 50
  }
}
```

---

### 14. Create design

```http
POST /design_master
Authorization: Bearer <token>
Content-Type: application/json

{
  "design_code": "DES-001",
  "design_details": "Chettinad pattern",
  "status": 1
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `design_code` | string | Yes | Unique code |
| `design_details` | string | No | Description |
| `status` | number | No | Default `1` |

**Response 200:**

```json
{
  "status": true,
  "message": "Record created",
  "data": { "id": 1 }
}
```

---

### 15. Update design

```http
PUT /design_master/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "design_code": "DES-001-A",
  "design_details": "Updated details"
}
```

**Response 200:**

```json
{
  "status": true,
  "message": "Record updated"
}
```

---

### 16. Delete design (soft)

```http
DELETE /design_master/:id
Authorization: Bearer <token>
```

**Response 200:**

```json
{
  "status": true,
  "message": "Record deleted"
}
```

---

## Design code uniqueness check

Use on design create/edit forms before submit.

### 17. Check unique design code

```http
POST /design/check-unique-code
Authorization: Bearer <token>
Content-Type: application/json

{
  "design_code": "DES-001",
  "exclude_id": 5
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `design_code` | string | Yes | Code to validate |
| `exclude_id` | number | No | Current record id when editing (exclude self) |

**Response 200 (code taken):**

```json
{
  "status": true,
  "message": "Checked",
  "data": { "unique": false }
}
```

**Response 200 (code available):**

```json
{
  "status": true,
  "message": "Checked",
  "data": { "unique": true }
}
```

---

## Error responses

### 401 — Missing or invalid token

No header:

```json
{
  "status": false,
  "message": "Access denied. Token not provided.",
  "code": "AUTH_TOKEN_MISSING"
}
```

Invalid/expired token:

```json
{
  "status": false,
  "message": "Not authorized",
  "code": "AUTH_TOKEN_INVALID"
}
```

Expired session:

```json
{
  "status": false,
  "message": "Session expired. Please sign in again.",
  "code": "AUTH_TOKEN_EXPIRED"
}
```

### 403 — Missing permission

```json
{
  "status": false,
  "message": "Access denied. Missing permission: gst:read",
  "code": "PERMISSION_DENIED"
}
```

### 400 — Validation / bad request

Missing required field:

```json
{
  "status": false,
  "message": "name is required"
}
```

Invalid table (generic master route):

```json
{
  "status": false,
  "message": "Invalid table"
}
```

Duplicate entry (unique constraint):

```json
{
  "status": false,
  "message": "Duplicate entry"
}
```

Invalid GST type (if sent via generic master path):

```json
{
  "status": false,
  "message": "Invalid GST type"
}
```

### 500 — Server error

```json
{
  "status": false,
  "message": "Error description"
}
```

---

## Recommended frontend integration order

1. **GST** — load slabs for product forms (`GET /gst`).
2. **gmaster** — create/list parent categories (`GET /gmaster`, `POST /gmaster`).
3. **gmastervalue** — load dropdowns filtered by parent (`GET /gmastervalue?gmaster_id=`).
4. **design_master** — design CRUD + `POST /design/check-unique-code` on blur/submit.

Phase 2 (Products) depends on GST, design, and master dropdowns being populated first.

---

## Source files (backend reference)

| File | Purpose |
|------|---------|
| `routes/v1/gstRoutes.js` | GST dedicated routes |
| `routes/v1/masterRoutes.js` | Generic master CRUD + design check |
| `controllers/Admin/GST/gstController.js` | GST handlers |
| `controllers/Admin/Masters/mastersController.js` | Generic master handlers |
| `config/master_config.js` | Field definitions per master |
