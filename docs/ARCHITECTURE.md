# OCC Inventory Hub - System Architecture

This document provides a comprehensive overview of the OCC Inventory Hub system architecture for new team members.

---

## Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Database Schema](#database-schema)
4. [Core Workflows](#core-workflows)
5. [Design Patterns](#design-patterns)
6. [API Reference](#api-reference)
7. [Tech Stack](#tech-stack)

---

## Overview

### What is OCC Inventory Hub?

OCC Inventory Hub is a **B2B dropshipping/inventory management application** that connects a primary retail store (OCC - Online Coffee Company) with multiple supplier/partner stores. It's built as a Shopify embedded app.

### Business Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OCC Business Model                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Partner Stores                    OCC Retail Store         Customers      │
│   (Coffee Roasters)                 (Your Store)                            │
│                                                                             │
│   ┌───────────────┐                ┌──────────────┐        ┌──────────┐    │
│   │ Partner A     │  ──import──►   │              │        │          │    │
│   │ (Wholesale)   │                │   Products   │◄─buy── │ Customer │    │
│   └───────────────┘                │   +30% margin│        │          │    │
│                                    │              │        └──────────┘    │
│   ┌───────────────┐                └──────┬───────┘                        │
│   │ Partner B     │  ──import──►         │                                 │
│   │ (Roastery)    │                      │ Daily orders                    │
│   └───────────────┘                      ▼                                 │
│                                    ┌──────────────┐        ┌──────────┐    │
│   ┌───────────────┐                │  Order       │        │   OCC    │    │
│   │ Partner C     │◄──────────────│  Routing     │──────► │Fulfillment│   │
│   │ (Coffee Co)   │   create order │              │  ship  │  Center  │    │
│   └───────────────┘                └──────────────┘        └──────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Term | Description |
|------|-------------|
| **Partner Store** | A coffee roaster/wholesaler with their own Shopify store |
| **OCC Retail Store** | The customer-facing storefront (your store) |
| **Product Import** | Copying products from partner stores with margin markup |
| **Inventory Sync** | Periodic sync of inventory levels from partners |
| **Order Routing** | Sending orders to partners who ship to your fulfillment center |

### Fulfillment Flow

1. Customer purchases from OCC retail store
2. Daily cron job batches orders by partner
3. Orders are created on partner stores
4. Partners roast fresh coffee and ship to **OCC's fulfillment center** (not direct to customer)
5. OCC ships to customers (typically weekly)

---

## High-Level Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         PARTNER STORES (N)                              │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │ │
│  │  │  Partner A  │  │  Partner B  │  │  Partner C  │  ...                │ │
│  │  │  (Shopify)  │  │  (Shopify)  │  │  (Shopify)  │                     │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                     │ │
│  │         │                │                │                             │ │
│  └─────────┼────────────────┼────────────────┼─────────────────────────────┘ │
│            │   OAuth +      │                │                              │
│            │   GraphQL      │                │                              │
│            ▼                ▼                ▼                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      OCC INVENTORY HUB APP                              ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │                      React Router 7 (Vercel)                     │   ││
│  │  │  ┌──────────────────────┐  ┌──────────────────────────────────┐ │   ││
│  │  │  │  Partner-Facing App  │  │      Admin Dashboard             │ │   ││
│  │  │  │  /app/*              │  │      /admin/*                    │ │   ││
│  │  │  │  (Embedded in        │  │      (Standalone web UI)         │ │   ││
│  │  │  │   Partner Admin)     │  │      (Supabase Auth)             │ │   ││
│  │  │  └──────────────────────┘  └──────────────────────────────────┘ │   ││
│  │  │                                                                 │   ││
│  │  │  ┌──────────────────────────────────────────────────────────────┐│   ││
│  │  │  │                     Server Actions                          ││   ││
│  │  │  │  • Partner OAuth     • Product Sync    • Order Routing     ││   ││
│  │  │  │  • Token Management  • Product Import  • GDPR Compliance   ││   ││
│  │  │  └──────────────────────────────────────────────────────────────┘│   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│            │                                                                │
│            ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        SUPABASE (PostgreSQL)                           ││
│  │  ┌─────────┐ ┌────────────────┐ ┌───────────────┐ ┌──────────────┐    ││
│  │  │partners │ │partner_products│ │product_mappings│ │ owner_store  │    ││
│  │  └─────────┘ └────────────────┘ └───────────────┘ └──────────────┘    ││
│  │  ┌─────────┐ ┌────────────────┐ ┌───────────────┐                     ││
│  │  │sessions │ │ partner_orders │ │   sync_logs   │                     ││
│  │  └─────────┘ └────────────────┘ └───────────────┘                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│            │                                                                │
│            ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        OCC RETAIL STORE (Shopify)                       ││
│  │  Products are created here with margin markup                           ││
│  │  Uses separate "occ-main-api" app for client credentials grant          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Two User Interfaces

| Interface | URL Path | Auth Method | Purpose |
|-----------|----------|-------------|---------|
| **Partner-Facing App** | `/app/*` | Shopify OAuth (embedded) | Partners see their connection status |
| **Admin Dashboard** | `/admin/*` | Supabase Auth (email/password) | OCC team manages partners, imports products |

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATABASE RELATIONSHIPS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                              ┌──────────────┐                               │
│                              │   sessions   │                               │
│                              │  (OAuth)     │                               │
│                              └──────────────┘                               │
│                                                                             │
│   ┌──────────────┐          ┌──────────────┐          ┌──────────────┐     │
│   │   partners   │──────────│partner_orders│          │  sync_logs   │     │
│   │              │   1:N    │              │          │  (audit)     │     │
│   │              │          └──────────────┘          └──────────────┘     │
│   │              │                                                          │
│   │              │──────────┌──────────────────┐                           │
│   │              │   1:N    │ product_mappings │                           │
│   │              │          │                  │                           │
│   └──────────────┘          │ Links partner    │                           │
│          │                  │ variants to OCC  │                           │
│          │                  │ products         │                           │
│          │ 1:N              └──────────────────┘                           │
│          ▼                           │                                      │
│   ┌──────────────────┐              │ References                           │
│   │ partner_products │◄─────────────┘ (partner_shop,                       │
│   │ (cached catalog) │                 partner_variant_id)                  │
│   └──────────────────┘                                                      │
│                                                                             │
│                              ┌──────────────┐                               │
│                              │  owner_store │                               │
│                              │ (OCC Store)  │                               │
│                              │  singleton   │                               │
│                              └──────────────┘                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tables Overview

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `sessions` | Shopify OAuth session storage | `shop`, `access_token`, `expires` |
| `partners` | Connected supplier stores | `shop`, `access_token`, `is_deleted` |
| `partner_products` | Cached product catalog from partners | `partner_shop`, `partner_variant_id`, `price` |
| `product_mappings` | Links partner variants → OCC products | `partner_variant_id`, `my_variant_id`, `margin` |
| `partner_orders` | Order routing audit trail | `my_order_id`, `partner_order_id`, `status` |
| `owner_store` | OCC retail store connection (singleton) | `shop`, `access_token`, `location_id` |
| `sync_logs` | Audit trail for all sync operations | `sync_type`, `status`, `items_processed` |

---

### Table Details

#### `sessions`

Stores Shopify OAuth sessions. Managed by custom Supabase session storage adapter.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (session ID) |
| `shop` | TEXT | Store domain (e.g., `partner.myshopify.com`) |
| `state` | TEXT | OAuth state parameter |
| `is_online` | BOOLEAN | Online vs offline token |
| `scope` | TEXT | Granted permission scopes |
| `expires` | TIMESTAMPTZ | Token expiration |
| `access_token` | TEXT | Shopify access token |
| `user_id` | BIGINT | Shopify user ID (online tokens) |
| `first_name`, `last_name`, `email` | TEXT | User details (online tokens) |
| `refresh_token` | TEXT | For token refresh |

---

#### `partners`

Connected supplier/partner stores. Supports soft-delete for GDPR compliance.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `shop` | TEXT | Store domain (unique) |
| `access_token` | TEXT | Nullable (cleared on GDPR redact) |
| `scope` | TEXT | Granted permission scopes |
| `is_active` | BOOLEAN | Active connection status |
| `is_deleted` | BOOLEAN | Soft-delete flag |
| `deleted_at` | TIMESTAMPTZ | When soft-deleted |
| `created_at` | TIMESTAMPTZ | Record creation time |
| `updated_at` | TIMESTAMPTZ | Last update time |

---

#### `partner_products`

Cached product catalog from partner stores. Updated during product sync.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `partner_shop` | TEXT | Partner store domain |
| `partner_product_id` | TEXT | Shopify product GID |
| `partner_variant_id` | TEXT | Shopify variant GID (unique per shop) |
| `title` | TEXT | Product title |
| `sku` | TEXT | Original SKU |
| `price` | NUMERIC(10,2) | Partner's price |
| `inventory_quantity` | INTEGER | Current stock level |
| `image_url` | TEXT | Product image URL |
| `handle` | TEXT | Product handle for URLs |
| `description` | TEXT | Product description HTML |
| `compare_at_price` | NUMERIC | Compare-at/original price |
| `product_type` | TEXT | Product category |
| `vendor` | TEXT | Brand/vendor name |
| `tags` | TEXT[] | Product tags array |
| `barcode` | TEXT | Variant barcode |
| `is_new` | BOOLEAN | New product flag |
| `is_deleted` | BOOLEAN | Soft-delete (no longer in partner store) |
| `deleted_at` | TIMESTAMPTZ | When marked deleted |
| `first_seen_at` | TIMESTAMPTZ | First sync time |
| `last_synced_at` | TIMESTAMPTZ | Last sync time |

**Unique constraint:** `(partner_shop, partner_variant_id)`

---

#### `product_mappings`

Links partner variants to OCC retail store products. Core table for order routing.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `partner_id` | UUID | FK to partners (nullable, SET NULL on delete) |
| `partner_shop` | TEXT | Partner domain (retained after partner deletion) |
| `partner_product_id` | TEXT | Partner's Shopify product GID |
| `partner_variant_id` | TEXT | Partner's Shopify variant GID |
| `my_product_id` | TEXT | OCC's Shopify product GID |
| `my_variant_id` | TEXT | OCC's Shopify variant GID |
| `partner_sku` | TEXT | Original partner SKU |
| `my_sku` | TEXT | Generated SKU (`PARTNER-{shop}-{sku}`) |
| `margin` | NUMERIC | Profit margin (default 0.30) |
| `partner_price` | NUMERIC(10,2) | Price from partner |
| `my_price` | NUMERIC(10,2) | Calculated selling price |
| `is_active` | BOOLEAN | Active mapping status |
| `created_at` | TIMESTAMPTZ | Import time |
| `updated_at` | TIMESTAMPTZ | Last update |

---

#### `partner_orders`

Tracks orders routed to partners. Audit trail for order fulfillment.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `my_order_id` | TEXT | OCC's Shopify order GID |
| `my_order_name` | TEXT | OCC's order number (e.g., `#1001`) |
| `partner_id` | UUID | FK to partners (nullable) |
| `partner_shop` | TEXT | Partner domain (retained) |
| `partner_order_id` | TEXT | Created order GID on partner store |
| `partner_order_name` | TEXT | Partner's order number |
| `status` | ENUM | `pending`, `created`, `failed` |
| `error_message` | TEXT | Failure details |
| `created_at` | TIMESTAMPTZ | When routing was attempted |
| `updated_at` | TIMESTAMPTZ | Last status update |

---

#### `owner_store`

OCC retail store connection. Uses singleton pattern (only one connected at a time).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `shop` | TEXT | Store domain (unique) |
| `access_token` | TEXT | Client credentials grant token |
| `scope` | TEXT | Granted scopes |
| `is_connected` | BOOLEAN | Connection status |
| `connected_at` | TIMESTAMPTZ | When connected |
| `expires_at` | TIMESTAMPTZ | Token expiration (24h) |
| `location_id` | TEXT | Cached Shopify location GID |
| `created_at` | TIMESTAMPTZ | Record creation |
| `updated_at` | TIMESTAMPTZ | Last update |

**Note:** A partial unique index ensures only one store can have `is_connected = true`.

---

#### `sync_logs`

Audit trail for all sync operations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `partner_id` | UUID | FK to partners (nullable) |
| `sync_type` | TEXT | Operation type (see below) |
| `status` | ENUM | `started`, `completed`, `failed` |
| `items_processed` | INTEGER | Total items handled |
| `items_created` | INTEGER | New records created |
| `items_updated` | INTEGER | Existing records updated |
| `items_failed` | INTEGER | Failed operations |
| `error_message` | TEXT | Error details |
| `started_at` | TIMESTAMPTZ | Sync start time |
| `completed_at` | TIMESTAMPTZ | Sync end time |

**Sync Types:**
- `products` - Product catalog sync
- `inventory` - Inventory level sync
- `orders` - Order routing
- `gdpr_data_request` - GDPR data request webhook
- `gdpr_customers_redact` - GDPR customer redact webhook
- `gdpr_shop_redact` - GDPR shop redact webhook
- `app_uninstalled` - App uninstall webhook

---

## Core Workflows

### 1. Partner Connection Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PARTNER CONNECTION FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Partner Store Admin                 OCC Inventory Hub                     │
│   ─────────────────                   ─────────────────                     │
│                                                                             │
│   1. Install App                                                            │
│      ─────────────────────────────►   /partner/install                      │
│                                       Generate OAuth URL                    │
│                                                                             │
│   2. Authorize Scopes                                                       │
│      ◄─────────────────────────────   Redirect to Shopify OAuth             │
│                                                                             │
│   3. Grant Permission                                                       │
│      ─────────────────────────────►   /partner/callback                     │
│                                       │                                     │
│                                       ▼                                     │
│                                       Exchange code for token               │
│                                       │                                     │
│                                       ▼                                     │
│                                       Upsert partner record                 │
│                                       (shop, access_token, scope)           │
│                                       │                                     │
│                                       ▼                                     │
│   4. See Success Page                                                       │
│      ◄─────────────────────────────   /partner/success                      │
│                                                                             │
│   5. Access Embedded App                                                    │
│      ─────────────────────────────►   /app (embedded in admin)              │
│                                       Shows connection status               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key files:**
- `app/routes/partner.install.tsx` - OAuth initiation
- `app/routes/partner.callback.tsx` - Token exchange
- `app/lib/partners/oauth.server.ts` - OAuth utilities
- `app/lib/partners/sync.server.ts` - Partner upsert

---

### 2. Product Sync Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRODUCT SYNC FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Admin Dashboard                     Partner Store                         │
│   ───────────────                     ─────────────                         │
│                                                                             │
│   1. Click "Sync Products"                                                  │
│      │                                                                      │
│      ▼                                                                      │
│   2. Load partner access_token from `partners` table                        │
│      │                                                                      │
│      ▼                                                                      │
│   3. Query Partner Store ──────────► Shopify GraphQL API                    │
│      (products, variants,            products(first: 50) {                  │
│       inventory, images)              variants, inventory }                 │
│      │                                                                      │
│      ▼                                                                      │
│   4. Paginate through all products (cursor-based)                           │
│      │                                                                      │
│      ▼                                                                      │
│   5. For each variant:                                                      │
│      ┌────────────────────────────────────────────────┐                    │
│      │  UPSERT into `partner_products`                │                    │
│      │  • partner_shop                                │                    │
│      │  • partner_variant_id (unique constraint)      │                    │
│      │  • title, sku, price, inventory_quantity       │                    │
│      │  • image_url, handle, description              │                    │
│      │  • Mark is_new = false after first view        │                    │
│      └────────────────────────────────────────────────┘                    │
│      │                                                                      │
│      ▼                                                                      │
│   6. Mark products not in sync as is_deleted = true                         │
│      │                                                                      │
│      ▼                                                                      │
│   7. Log sync to `sync_logs`                                                │
│      │                                                                      │
│      ▼                                                                      │
│   8. Display synced products in Admin UI                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key files:**
- `app/routes/admin.partners.$shop.tsx` - Partner products page
- `app/lib/shopify/queries/products.ts` - GraphQL query
- `app/lib/shopify/utils/pagination.ts` - Pagination helpers

---

### 3. Product Import Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCT IMPORT FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Admin Dashboard                                                           │
│   ───────────────                                                           │
│                                                                             │
│   1. Select products to import (checkbox selection)                         │
│      │                                                                      │
│      ▼                                                                      │
│   2. Set margin per product (default 30%)                                   │
│      │                                                                      │
│      ▼                                                                      │
│   3. Click "Import Selected"                                                │
│      │                                                                      │
│      ▼                                                                      │
│   4. For each selected product:                                             │
│      │                                                                      │
│      ├─── a. Calculate selling price ──────────────────────────────────────│
│      │        my_price = partner_price / (1 - margin)                      │
│      │        e.g., $70 / 0.70 = $100 (30% margin)                         │
│      │                                                                      │
│      ├─── b. Generate partner SKU ─────────────────────────────────────────│
│      │        Format: PARTNER-{shop-prefix}-{original-sku}                 │
│      │        e.g., PARTNER-roastery-BLEND001                              │
│      │                                                                      │
│      ├─── c. Create product on OCC Store ──────────────────────────────────│
│      │        GraphQL: productSet mutation                                 │
│      │        - Title, description, images                                 │
│      │        - Variant with calculated price                              │
│      │        - Generated SKU                                              │
│      │                                                                      │
│      ├─── d. Enable inventory tracking ────────────────────────────────────│
│      │        GraphQL: inventoryItemUpdate mutation                        │
│      │        - tracked: true                                              │
│      │                                                                      │
│      ├─── e. Set initial inventory ────────────────────────────────────────│
│      │        GraphQL: inventorySetQuantities mutation                     │
│      │        - locationId: from owner_store.location_id                   │
│      │        - quantity: partner's current inventory                      │
│      │        - ignoreCompareQuantity: true (initial set)                  │
│      │                                                                      │
│      └─── f. Create product_mapping record ────────────────────────────────│
│               - partner_shop, partner_variant_id                           │
│               - my_product_id, my_variant_id                               │
│               - margin, partner_price, my_price                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Important: Location ID Requirement**

Shopify tracks inventory per location. The `owner_store.location_id` is required for inventory operations:

```graphql
mutation {
  inventorySetQuantities(input: {
    quantities: [{
      inventoryItemId: "gid://shopify/InventoryItem/123",
      locationId: "gid://shopify/Location/456",  # REQUIRED
      quantity: 50
    }]
  }) {
    inventoryAdjustmentGroup { ... }
    userErrors { field, message }
  }
}
```

The location ID is fetched and cached when the owner store token is refreshed.

---

### 4. Inventory Tracking Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       INVENTORY TRACKING FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   At Import Time (Current)                                                  │
│   ────────────────────────                                                  │
│                                                                             │
│   1. Product created on OCC Store                                           │
│      │                                                                      │
│      ▼                                                                      │
│   2. inventoryItemUpdate(tracked: true)                                     │
│      │  Enables tracking for the variant                                    │
│      ▼                                                                      │
│   3. inventorySetQuantities(                                                │
│        inventoryItemId: <from product creation>,                            │
│        locationId: <from owner_store.location_id>,                          │
│        quantity: <partner's inventory>,                                     │
│        ignoreCompareQuantity: true                                          │
│      )                                                                      │
│                                                                             │
│   ─────────────────────────────────────────────────────────────────────────│
│                                                                             │
│   Ongoing Sync (Future - Phase 2)                                           │
│   ───────────────────────────────                                           │
│                                                                             │
│   1. Cron job runs every 15-30 minutes                                      │
│      │                                                                      │
│      ▼                                                                      │
│   2. For each active product_mapping:                                       │
│      │                                                                      │
│      ├─── Query partner store for current inventory                         │
│      │                                                                      │
│      ├─── Compare with stored partner_products.inventory_quantity           │
│      │                                                                      │
│      └─── If changed:                                                       │
│           • Update partner_products cache                                   │
│           • Update OCC Store inventory via inventorySetQuantities           │
│           • Consider using compareQuantity for optimistic locking           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 5. Order Routing Flow (Future)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ORDER ROUTING FLOW (Future)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Daily Cron Job (e.g., 11 PM)                                              │
│   ────────────────────────────                                              │
│                                                                             │
│   1. Query OCC Store for unfulfilled orders                                 │
│      │                                                                      │
│      ▼                                                                      │
│   2. For each order line item:                                              │
│      │                                                                      │
│      ├─── Parse SKU: PARTNER-{shop}-{sku}                                   │
│      │    • If not partner SKU, skip                                        │
│      │    • Extract shop prefix to identify partner                         │
│      │                                                                      │
│      └─── Group items by partner_shop                                       │
│           │                                                                 │
│           ▼                                                                 │
│   3. For each partner:                                                      │
│      │                                                                      │
│      ├─── Look up product_mapping for original variant IDs                  │
│      │                                                                      │
│      ├─── Create partner_orders record (status: pending)                    │
│      │                                                                      │
│      ├─── Create order on partner store via draftOrderCreate                │
│      │    • Use partner's original variant IDs                              │
│      │    • Shipping: OCC Fulfillment Center address                        │
│      │    • Note: "From OCC Order #1001"                                    │
│      │                                                                      │
│      └─── Update partner_orders:                                            │
│           • status: created (success) or failed                             │
│           • partner_order_id, partner_order_name                            │
│           • error_message (if failed)                                       │
│                                                                             │
│   4. Log batch to sync_logs                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Design Patterns

### 1. Margin-Based Pricing

OCC uses **margin-based pricing**, not fixed markup.

**Formula:** `my_price = partner_price / (1 - margin)`

| Partner Price | Margin | My Price | Profit |
|---------------|--------|----------|--------|
| $70 | 30% | $100 | $30 (30% of $100) |
| $50 | 25% | $66.67 | $16.67 (25% of $66.67) |
| $100 | 40% | $166.67 | $66.67 (40% of $166.67) |

**Code:** `app/lib/utils/price.ts`

```typescript
export function calculateSellingPrice(partnerPrice: number, margin: number): number {
  return partnerPrice / (1 - margin);
}
```

**Why margin vs markup?**
- Margin is the profit as a percentage of selling price
- Easier to reason about profitability
- Default 30% margin is configurable per product

---

### 2. SKU Format for Partner Identification

Partner products are identified by a structured SKU format:

**Format:** `PARTNER-{shop-prefix}-{original-sku}`

**Examples:**
- `PARTNER-best-roastery-BLEND001`
- `PARTNER-coffee-co-DARK-ROAST`

**Purpose:**
1. Identify partner items in customer orders
2. Route orders to correct partner
3. Retain partner attribution even after partner deletion

**Code:** `app/lib/utils/sku.ts`

```typescript
// Generate
generatePartnerSku("best-roastery.myshopify.com", "BLEND001")
// → "PARTNER-best-roastery-BLEND001"

// Parse (for order routing)
parsePartnerSku("PARTNER-best-roastery-BLEND001")
// → { shop: "best-roastery.myshopify.com", originalSku: "BLEND001" }
```

---

### 3. GDPR Compliance

The system handles GDPR requirements via webhooks:

| Webhook | Action |
|---------|--------|
| `customers/data_request` | Log request (no customer PII stored) |
| `customers/redact` | Log request (no customer PII stored) |
| `shop/redact` | **Soft-delete partner** - clear credentials, retain business records |

**Soft-Delete Pattern:**
- `partners.is_deleted = true`
- `partners.access_token = NULL` (credentials removed)
- `product_mappings.partner_shop` retained (for historical records)
- `partner_orders.partner_shop` retained (for audit trail)

**Why soft-delete?**
- Maintains referential integrity
- Preserves business records for accounting
- Allows partner to reconnect later

---

### 4. Token Auto-Refresh (Owner Store)

The OCC retail store uses **client credentials grant** for API access:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TOKEN AUTO-REFRESH FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   getValidOwnerStoreToken()                                                 │
│   │                                                                         │
│   ▼                                                                         │
│   Check owner_store.expires_at                                              │
│   │                                                                         │
│   ├─── Token valid (>5 min remaining)  ──► Return cached token              │
│   │                                                                         │
│   └─── Token expired or expiring soon                                       │
│        │                                                                    │
│        ▼                                                                    │
│        POST /admin/oauth/access_token                                       │
│        {                                                                    │
│          grant_type: "client_credentials",                                  │
│          client_id: OCC_PARENT_CLIENT_ID,                                   │
│          client_secret: OCC_PARENT_CLIENT_SECRET                            │
│        }                                                                    │
│        │                                                                    │
│        ▼                                                                    │
│        Update owner_store:                                                  │
│        • access_token = new token                                           │
│        • expires_at = now + 24 hours                                        │
│        • Fetch and cache location_id if missing                             │
│        │                                                                    │
│        ▼                                                                    │
│        Return new token                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Code:** `app/lib/ownerStore.server.ts`

---

## API Reference

### Required Shopify Scopes

**Partner App (occ-inventory-hub):**

| Scope | Purpose |
|-------|---------|
| `read_products` | Read partner product catalog |
| `read_inventory` | Read partner inventory levels |
| `write_orders` | Create orders on partner stores |

**Owner Store App (occ-main-api):**

| Scope | Purpose |
|-------|---------|
| `read_products` | Check for duplicate products |
| `write_products` | Create imported products |
| `read_inventory` | Read current inventory |
| `write_inventory` | Set inventory tracking and quantities |
| `read_locations` | **Fetch location ID** (required for inventory) |

---

### Key GraphQL Operations

**Product Query (Partner Store):**
```graphql
query getProducts($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage, endCursor }
    edges {
      node {
        id
        title
        handle
        description
        productType
        vendor
        tags
        variants(first: 50) {
          edges {
            node {
              id
              title
              sku
              price
              compareAtPrice
              barcode
              inventoryQuantity
              inventoryItem { id }
            }
          }
        }
        images(first: 1) {
          edges { node { url } }
        }
      }
    }
  }
}
```

**Product Creation (OCC Store):**
```graphql
mutation productSet($input: ProductSetInput!) {
  productSet(input: $input) {
    product { id }
    productSetOperation { ... }
    userErrors { field, message }
  }
}
```

**Enable Inventory Tracking:**
```graphql
mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
  inventoryItemUpdate(id: $id, input: { tracked: true }) {
    inventoryItem { id }
    userErrors { field, message }
  }
}
```

**Set Inventory Quantity:**
```graphql
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: {
    name: "available"
    reason: "correction"
    ignoreCompareQuantity: true
    quantities: [{
      inventoryItemId: "gid://shopify/InventoryItem/123"
      locationId: "gid://shopify/Location/456"
      quantity: 50
    }]
  }) {
    inventoryAdjustmentGroup { reason }
    userErrors { field, message }
  }
}
```

---

### Webhook Subscriptions

| Topic | Handler | Purpose |
|-------|---------|---------|
| `app/uninstalled` | `/webhooks/app/uninstalled` | Delete sessions |
| `app/scopes_update` | `/webhooks/app/scopes_update` | Update session scope |
| `customers/data_request` | `/webhooks/compliance` | GDPR data request |
| `customers/redact` | `/webhooks/compliance` | GDPR customer redact |
| `shop/redact` | `/webhooks/compliance` | GDPR shop redact |

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Framework** | React Router 7.12 | File-based routing, server actions |
| **Frontend** | React 18.3 | Polaris web components for embedded app |
| **Backend** | Node.js | React Router server |
| **Database** | PostgreSQL (Supabase) | Row-level security enabled |
| **Auth** | Shopify OAuth + Supabase Auth | Partners vs Admin |
| **API** | Shopify GraphQL Admin API | October 2025 version |
| **Build** | Vite 6.3, TypeScript 5.9 | Fast HMR |
| **Hosting** | Vercel | Auto-deploy from GitHub |

---

## Quick Reference

### File Structure

```
app/
├── routes/                  # File-based routing
│   ├── admin.*             # Admin dashboard (Supabase Auth)
│   ├── app.*               # Partner-facing (Shopify OAuth)
│   ├── partner.*           # Partner OAuth flow
│   └── webhooks.*          # Shopify webhooks
├── lib/
│   ├── partners/           # Partner sync, OAuth
│   ├── shopify/            # GraphQL queries, pagination
│   ├── utils/              # Price, SKU utilities
│   ├── ownerStore.server.ts # Owner store token management
│   ├── supabase.server.ts  # Database client
│   └── tokens.ts           # Design tokens (colors)
└── types/
    ├── database.ts         # TypeScript interfaces
    └── shopify.ts          # GraphQL types
```

### Common Commands

```bash
# Development (always use dev app)
npm run dev -- --config shopify.app.dev.toml

# Type checking (required before commit)
npm run typecheck

# Linting (required before commit)
npm run lint

# Build
npm run build
```

### Environment Variables

```bash
# Shopify App (Partner-facing)
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=

# Owner Store (OCC Retail)
OCC_STORE_DOMAIN=
OCC_PARENT_CLIENT_ID=
OCC_PARENT_CLIENT_SECRET=

# Database
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

---

## Troubleshooting

### Inventory Not Tracked

If imported products show "Inventory not tracked":

1. **Check location_id** - Query `owner_store` table, verify `location_id` is not null
2. **Verify scopes** - Ensure occ-main-api has `read_locations` scope
3. **Force refresh** - Use admin dashboard to refresh store connection
4. **Check logs** - Enable debug logging to see API responses

### Partner Products Not Syncing

1. **Check partner.access_token** - May be cleared after GDPR redact
2. **Check partner.is_deleted** - May be soft-deleted
3. **Check sync_logs** - Look for error messages

### Token Expired

Owner store tokens auto-refresh, but if issues occur:
1. Check `OCC_PARENT_CLIENT_ID` and `OCC_PARENT_CLIENT_SECRET` env vars
2. Use admin dashboard "Refresh Connection" button
3. Check `owner_store.expires_at` in database
