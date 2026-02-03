# OCC Inventory Hub - Development Roadmap

> High-level overview of what needs to be built and how.
> Detailed implementation plans live in separate phase files.

---

## Business Model Summary

**You**: Run the retail Shopify store (customers buy here)
**Partners**: Coffee roasters/wholesalers with their own Shopify stores
**Flow**: Import partner products → Customers buy → Daily order batch to partners → Partners ship to your fulfillment center → You ship to customers

---

## What's Already Working

| Feature | Status | Notes |
|---------|--------|-------|
| Partner OAuth | Done | Partners can authorize via link, tokens stored |
| Read Partner Products | Done | API endpoint fetches products from partner stores |
| Database Schema | Done | Partners, product mappings, orders, sync logs |
| Price/SKU Utilities | Done | Margin calculation, partner SKU format |
| GDPR Compliance | Done | Webhooks handle data requests/deletion |

---

## Progress Tracker

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Dev Environment Setup | ✅ Complete |
| 1 | Admin UI + Product Import | 🔄 In Progress |
| 2 | Inventory Sync | ⬚ Not Started |
| 3 | Order Capture & Routing | ⬚ Not Started |

---

## What Needs to Be Built

### Phase 0: Dev Environment Setup ✅

**What**: Set up a separate development environment for safe iteration.

**Why first**: Avoid breaking production while developing new features.

**What was done**:
- Created `dev` branch for development work
- Created separate Vercel project for dev deployments
- Created `shopify.app.dev.toml` with dev app config (client_id: `19bafcd457f52181a12054b310728aaf`)
- Deployed config to dev app via `shopify app deploy --config shopify.app.dev.toml`
- Set Vercel env vars (SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, DATABASE_URL)
- Installed dev app on development store
- Verified app loads correctly

**End state**: Safe dev environment for iteration without affecting production.

---

### Phase 1: Admin UI + Product Import

**What**: Build the UI to browse partners/products and import selected products to your store.

**Why first**: You need to see what's in partner stores and get products into your store before anything else can happen.

**High-level how**:
- Build admin dashboard pages using Shopify Polaris components
- Partner list page → shows connected partners
- Partner products page → browse their products, select ones to import
- Import action → reads from partner, creates on your store with markup pricing
- Store mapping in database (links partner variant to your variant)

**The connection**: Your app has two sets of credentials:
1. Your store's session (from app install) → write products to YOUR store
2. Partner's access token (from their OAuth) → read products from THEIR store

**End state**: You can view partners, browse their products, and import selected ones to your store.

---

### Phase 2: Inventory Sync

**What**: Keep your store's inventory levels in sync with partner inventory.

**Why**: When partner's stock changes, your store should reflect that (prevent overselling).

**High-level how**:
- Scheduled cron job runs **hourly**
- For each imported product mapping, fetch current inventory from partner
- Update inventory on your store to match
- Optional: "Sync Now" button in admin UI for manual trigger
- Log sync results

**Scale assumptions**: 7-30 partners, 20-50 products each (~200-900 products total). Well within API rate limits.

**Depends on**: Phase 1 (need imported products with mappings first)

**End state**: Your inventory automatically stays in sync with partner inventory.

---

### Phase 3: Order Capture & Routing

**What**: Capture customer orders, store them, and batch-send to partners daily.

**Why**: Partners need to know what to roast and ship to your fulfillment center.

#### Complete Order Lifecycle

```
┌──────────────┐                      ┌──────────────┐                      ┌──────────────┐
│   Customer   │   orders/create      │   Database   │    Daily Cron        │   Partner    │
│ places order │ ─────────────────►   │ PartnerOrder │ ─────────────────►   │   Store      │
│ on OCC store │      webhook         │  (pending)   │   batch & create     │  (fulfills)  │
└──────────────┘                      └──────────────┘                      └──────────────┘
         │                                   │                                     │
         │                                   │                                     │
         ▼                                   ▼                                     ▼
    Real-time                         Stored until                        Ships to OCC
    capture                           daily cutoff                        fulfillment center
```

#### Phase 3A: Order Capture (Webhook)

**What**: Real-time capture of customer orders as they happen.

**High-level how**:
- Register `orders/create` webhook on OCC store
- When customer places order, webhook fires immediately
- Parse order line items, identify partner products by SKU prefix (`PARTNER-{shop}-*`)
- Store in `PartnerOrder` table with status `pending`
- Group line items by partner shop for later processing

**End state**: Every order with partner products is immediately captured and stored.

#### Phase 3B: Order Processing (Daily Cron)

**What**: Batch-process pending orders and send to partners.

**High-level how**:
- Vercel cron job runs daily (configurable time, e.g., 6pm)
- Query all `pending` order items grouped by partner
- For each partner: create or update order on their store
- Set shipping address to OCC fulfillment center (not direct to customer)
- Update status to `created` on success, `failed` on error
- Log results to `SyncLog`

**Key design decision: Order cadence**

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| Daily orders | Create new order per partner each day | Simpler to implement | Up to 7 orders/week per partner |
| Weekly master order | Append to one pending order until partner's cutoff | 1 order/week, easier for partners | More complex logic |

**Leaning toward: Weekly master order**
- Each partner has a weekly order cutoff date
- Daily cron checks for pending order → if exists, add line items; if not, create new
- Results in ONE order per partner per week
- One tracking number, easier shipping consolidation
- Less friction for partners = healthier business relationships

*Final decision to be made when implementing Phase 3.*

**Depends on**: Phase 1 & 2 (need products imported and inventory synced)

**End state**: Orders automatically flow to partners with minimal friction.

---

## Folder Structure

```
implementation-plan/
├── 00-OVERVIEW.md           ← This file (high-level overview)
├── 01-PRODUCT-IMPORT.md     ← Phase 1 detailed plan (when ready)
├── 02-INVENTORY-SYNC.md     ← Phase 2 detailed plan (when ready)
└── 03-ORDER-ROUTING.md      ← Phase 3 detailed plan (when ready)
```

---

## Starting a New Session

When you open a new Claude terminal to continue work:

1. Tell Claude: "Read implementation-plan/00-OVERVIEW.md"
2. State which phase: "I'm working on Phase 1"
3. Claude will read/create the detailed phase file and continue from there

---

## Current Status

**Currently working on**: Phase 1 - Admin UI + Product Import

See **Progress Tracker** above for overall status.
