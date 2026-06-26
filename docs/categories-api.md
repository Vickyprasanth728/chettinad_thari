# Product Categories API

Base: `http://localhost:8080/api/v1/categories`

**Auth:** `Authorization: Bearer <accessToken>`

## Model

| Field | Description |
|-------|-------------|
| `parent_id` | `null` = **parent category**; set to parent row `id` = **subcategory** |
| Only **one level** of subcategories (sub cannot have children) |

## Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/categories` | `category:read` | List (paginated) |
| GET | `/categories?tree=true` | `category:read` | Parents with nested `subcategories[]` |
| GET | `/categories?level=parent` | `category:read` | Parent categories only |
| GET | `/categories?level=sub` | `category:read` | Subcategories only |
| GET | `/categories?parent_id=1` | `category:read` | Subcategories under parent `1` |
| GET | `/categories?parent_id=null` | `category:read` | Same as parents |
| GET | `/categories/:id` | `category:read` | Get by id |
| POST | `/categories` | `category:create` | Create |
| PUT | `/categories/:id` | `category:update` | Update |
| DELETE | `/categories/:id` | `category:delete` | Soft delete |
| GET | `/categories/dropdown` | `category:read` | Dropdown list |
| POST | `/categories/check-unique-name` | `category:read` | Name uniqueness check |

## Request examples

### Create parent category

```http
POST /api/v1/categories
Content-Type: application/json

{
  "name": "Saree"
}
```

### Create subcategory

```http
POST /api/v1/categories
Content-Type: application/json

{
  "name": "Silk Saree",
  "parent_id": 1
}
```

### List subcategories for parent

```http
GET /api/v1/categories?parent_id=1&page=1&limit=50
```

### Tree (admin UI)

```http
GET /api/v1/categories?tree=true
```

Response `data`:

```json
[
  {
    "id": 1,
    "name": "Saree",
    "parent_id": null,
    "subcategories": [
      { "id": 2, "name": "Silk Saree", "parent_id": 1 }
    ]
  }
]
```

### Dropdown — parents for product form step 1

```http
GET /api/v1/categories/dropdown?level=parent
```

### Dropdown — subcategories after parent selected

```http
GET /api/v1/categories/dropdown?parent_id=1
```

## Products linkage

`POST/PUT /api/v1/products` accept optional `category_id` (usually the **subcategory** id).

`GET /products` supports `?category_id=` and returns `category_name`, `parent_category_name`.

## Setup (existing database)

```bash
npm run migrate:categories
npm run seed
```

Re-login so JWT permissions include `category:*`.
