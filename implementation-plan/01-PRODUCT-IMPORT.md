# Phase 1: Admin UI + Product Import

> Detailed implementation plan for building partner management and product import features.

---

## Overview

**Goal**: Build the admin dashboard to browse connected partners, view their products, and import selected products to the owner's store with margin markup.

**Key Insight**: The app has two sets of credentials:
1. **Owner's session** (from app install) → write products to YOUR store
2. **Partner's access token** (from their OAuth) → read products from THEIR store

---

## Prerequisites

### Scope Update
The `shopify.app.toml` needs `write_products` scope to create products on the owner's store.

```toml
# Before
[access_scopes]
scopes = "read_products,read_inventory"

# After
[access_scopes]
scopes = "read_products,read_inventory,write_products"
```

**Note**: `write_orders` will be added in Phase 3 (order routing).

---

## Implementation Tasks

### 1. Database Functions (`app/lib/supabase.server.ts`)

Add functions for:
- `getProductMappings(partnerShop?: string)` - List all mappings, optionally filtered by partner
- `getProductMappingByPartnerVariant(partnerShop, partnerVariantId)` - Check if already imported
- `createProductMapping(data)` - Create new mapping
- `updateProductMapping(id, data)` - Update existing mapping
- `deactivateProductMapping(id)` - Soft-delete a mapping

### 2. GraphQL Operations (`app/lib/shopify/queries/`)

**New file: `products-mutations.ts`**
- `productCreate` mutation - Create product on owner's store
- `productVariantsBulkUpdate` mutation - Update variant prices/SKUs

**Update: `products.ts`**
- Add query to fetch product by SKU (to check if already imported)

### 3. Routes to Build

#### Partners List (`/app/partners`)
**File**: `app/routes/app.partners.tsx`

- Displays all connected partners in a table/list
- Shows: shop domain, connection status, # of imported products, last sync
- Actions: View products, Sync now (future), Disconnect (future)

#### Partner Products (`/app/partners/$shop`)
**File**: `app/routes/app.partners.$shop.tsx`

- Fetch products from partner store using their access token
- Display products with variants, prices, inventory
- Show calculated selling price (with margin)
- Checkbox selection for products to import
- "Import Selected" action button

#### Import Action
**File**: `app/routes/app.partners.$shop.import.tsx` (action-only route)

- Receives selected variant IDs
- For each variant:
  1. Check if already imported (query product_mappings)
  2. Fetch full product data from partner
  3. Calculate selling price with margin
  4. Create product on owner's store via GraphQL
  5. Store mapping in database

#### Product Mappings Dashboard (`/app/products`)
**File**: `app/routes/app.products.tsx`

- List all imported products with their mappings
- Shows: partner source, partner price, your price, margin, inventory status
- Actions: Update margin, Deactivate import

---

## Data Flow

```
Partner Store                    Owner's Store
┌─────────────┐                 ┌─────────────┐
│ Products    │                 │ Products    │
│ - Coffee A  │    IMPORT       │ - Coffee A  │
│   $70       │ ──────────────► │   $100      │
│             │  (30% margin)   │             │
└─────────────┘                 └─────────────┘
       │                               │
       │                               │
       ▼                               ▼
┌─────────────────────────────────────────────┐
│            ProductMapping Table             │
│ partner_variant_id → my_variant_id          │
│ partner_shop, margin, is_active             │
└─────────────────────────────────────────────┘
```

---

## UI Components Needed

Using existing Polaris web components:
- `<s-page>` - Page container
- `<s-table>` / `<s-data-table>` - Product listings
- `<s-card>` - Partner cards
- `<s-checkbox>` - Product selection
- `<s-button>` - Actions
- `<s-badge>` - Status indicators
- `<s-spinner>` - Loading states
- `<s-banner>` - Success/error messages

---

## Success Criteria

1. ✅ Can view list of all connected partners
2. ✅ Can browse products from a specific partner
3. ✅ Can see calculated selling price with margin
4. ✅ Can import selected products to owner's store
5. ✅ Imported products have correct SKU format (`PARTNER-{shop}-{sku}`)
6. ✅ Product mappings stored in database
7. ✅ Can view all imported products in dashboard

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `shopify.app.toml` | Modify | Add `write_products` scope |
| `app/lib/supabase.server.ts` | Modify | Add product mapping functions |
| `app/lib/shopify/queries/products-mutations.ts` | Create | Product creation mutations |
| `app/routes/app.partners.tsx` | Create | Partners list page |
| `app/routes/app.partners.$shop.tsx` | Rename/Modify | Partner products UI page |
| `app/routes/app.partners.$shop.import.tsx` | Create | Import action handler |
| `app/routes/app.products.tsx` | Create | Product mappings dashboard |

---

## Notes

- The existing `app.partners.$shop.products.tsx` is an API-only route. We'll create a new UI route at `app.partners.$shop.tsx` for the admin interface.
- Use `<s-resource-list>` or `<s-data-table>` for product listings (check Polaris docs for availability)
- Price display should show both partner price and calculated selling price
- Consider pagination for stores with many products
