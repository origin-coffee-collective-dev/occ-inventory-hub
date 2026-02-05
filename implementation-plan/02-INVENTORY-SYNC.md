# Phase 2: Inventory Sync

> Detailed implementation plan for keeping OCC store inventory synchronized with partner stores.

---

## Overview

**Goal:** Keep the OCC retail store's inventory levels synchronized with partner inventory to prevent overselling.

**Why This Matters:**
- When a partner's stock changes, your store needs to reflect that reality
- Otherwise customers might order products that are actually out of stock
- Prevents manual cancellations/refunds and poor customer experience

**Scale Assumptions:**
- 7-30 partners
- 20-50 products per partner
- ~200-900 total imported products
- Well within Shopify API rate limits

**Depends on:** Phase 1 (need imported products with mappings first)

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sync frequency | Every hour | Coffee inventory changes infrequently; hourly is sufficient |
| Conflict handling | Partner always wins | Simple, predictable behavior |
| Sync scope | Inventory only | Price changes require manual review |
| Sync strategy | Full sync every time | Simple and reliable at scale (~900 products) |
| Error handling | Alert in UI + email | Log errors, show in admin UI, email on critical failures |
| Admin UI scope | Moderate | Sync history, failed items, per-partner last sync |

---

## High-Level Approach

### Core Loop
```
Every hour (cron) or on-demand (Sync Now button):
  1. Get all active product mappings grouped by partner
  2. For each partner:
     a. Fetch inventory levels for their products
     b. Update corresponding OCC store inventory
     c. Log success/failure per item
  3. If critical failures, send email notification
  4. Update sync timestamps and status in UI
```

### Triggers
| Trigger | Frequency | Notes |
|---------|-----------|-------|
| Scheduled cron | Every hour | Vercel cron job |
| Manual "Sync Now" | On-demand | Button in admin UI |

### Critical Failure Triggers (send email)
- Partner access token revoked/invalid
- Partner store unreachable (multiple retries failed)
- >50% of items for a partner failing consistently

---

## Existing Infrastructure (Can Reuse)

| Component | Location | Notes |
|-----------|----------|-------|
| Owner store token management | `app/lib/ownerStore.server.ts` | Auto-refresh, location ID cached |
| Products query with inventory | `app/lib/shopify/queries/products.ts` | Has `inventoryQuantity`, `inventoryItem.id` |
| Partner access tokens | `partners` table | Used to query partner stores |
| Product mappings | `product_mappings` table | Links partner variants to OCC variants |
| SyncLog infrastructure | `sync_logs` table + types | Ready for `sync_type: 'inventory'` |

---

## New Components Needed

### 1. Cron Job Configuration
**File:** `vercel.json`
```json
{
  "crons": [{
    "path": "/api/cron/inventory-sync",
    "schedule": "0 * * * *"
  }]
}
```

### 2. Cron API Route
**File:** `app/routes/api.cron.inventory-sync.tsx`
- Verifies cron secret header (prevents unauthorized access)
- Calls inventory sync service
- Returns success/failure status

### 3. Inventory Sync Service
**File:** `app/lib/inventory/sync.server.ts`
- `runInventorySync()` - Main entry point
- Groups product mappings by partner
- For each partner: fetch inventory, update OCC store
- Handles errors gracefully, continues with other partners
- Returns summary for logging

### 4. Inventory GraphQL Queries/Mutations
**File:** `app/lib/shopify/queries/inventory.ts`
- Query to fetch inventory levels from partner (can use existing products query)
- `inventorySetQuantities` mutation for updating OCC store

### 5. Email Notification Service
**File:** `app/lib/notifications/email.server.ts`
- `sendSyncFailureEmail()` - Sends email on critical failures
- Use Resend or similar service
- Template for failure notification

### 6. Admin UI Updates
**Files:**
- `app/routes/admin._index.tsx` - Add sync status card, "Sync Now" button
- `app/routes/admin.sync-history.tsx` - New page for sync logs

---

## Database Changes

**Recommendation: Keep it simple for MVP**
- Use existing `sync_logs` table for history (already has `partner_id`)
- Query last sync per partner from logs as needed
- No new migrations required

*Alternative (if needed later):*
```sql
ALTER TABLE partners ADD COLUMN last_inventory_sync timestamp;
ALTER TABLE partners ADD COLUMN inventory_sync_status text; -- 'healthy', 'warning', 'failed'
```

---

## Implementation Iterations

### Iteration 1: Core Sync Logic (Foundation)
**Goal:** Get the basic sync working end-to-end

1. Create inventory sync service (`app/lib/inventory/sync.server.ts`)
2. Add inventory GraphQL queries/mutations
3. Create cron API route (without cron config yet, for manual testing)
4. Add "Sync Now" button to admin dashboard
5. Test manually: click button → see inventory update on OCC store

**Success criteria:** Manual sync button works, inventory updates visible in Shopify admin

### Iteration 2: Scheduled Cron Job
**Goal:** Automate the sync

1. Add cron configuration to `vercel.json`
2. Add cron authentication (secret header verification)
3. Deploy and verify cron triggers every hour
4. Add sync logging to `sync_logs` table

**Success criteria:** Cron runs automatically, logs visible in database

### Iteration 3: Error Handling & Notifications
**Goal:** Handle failures gracefully and alert

1. Improve error handling in sync service
2. Set up email service (Resend)
3. Add email notification on critical failures
4. Mark partners with failed syncs for visibility

**Success criteria:** Receive email when partner sync fails

### Iteration 4: Admin UI Improvements
**Goal:** Visibility into sync health

1. Add sync history page (`/admin/sync-history`)
2. Show per-partner last sync time and status
3. Show recent failures prominently on dashboard
4. Add ability to manually re-sync individual partners

**Success criteria:** Full visibility into sync health from admin UI

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `vercel.json` | Modify | Add cron configuration |
| `app/lib/inventory/sync.server.ts` | Create | Core sync logic |
| `app/lib/shopify/queries/inventory.ts` | Create | Inventory GraphQL operations |
| `app/lib/notifications/email.server.ts` | Create | Email notification service |
| `app/routes/api.cron.inventory-sync.tsx` | Create | Cron endpoint |
| `app/routes/admin._index.tsx` | Modify | Add sync status, "Sync Now" button |
| `app/routes/admin.sync-history.tsx` | Create | Sync history page |

---

## Environment Variables Needed

```bash
# Cron authentication
CRON_SECRET=your_random_secret_here

# Email notifications (Resend)
RESEND_API_KEY=your_resend_api_key
ALERT_EMAIL_TO=your-email@example.com
```

---

## Verification Plan

After implementation, verify:

1. **Manual sync works:** Click "Sync Now" → inventory updates on Shopify
2. **Cron runs:** Check Vercel logs for cron execution every hour
3. **Logging works:** See entries in `sync_logs` table after each run
4. **Error handling:** Disconnect a partner, verify email notification sent
5. **Admin UI:** Sync history shows accurate data, failures are visible

---

## Technical Notes

### Inventory Mutation (for reference)
```graphql
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup {
      createdAt
      reason
    }
    userErrors {
      field
      message
    }
  }
}
```

Input format:
```json
{
  "input": {
    "ignoreCompareQuantity": true,
    "reason": "correction",
    "name": "available",
    "quantities": [
      {
        "inventoryItemId": "gid://shopify/InventoryItem/123",
        "locationId": "gid://shopify/Location/456",
        "quantity": 50
      }
    ]
  }
}
```

### Partner Store Inventory Fetch
Use existing `PRODUCTS_QUERY` which already includes:
- `inventoryQuantity` on variants
- `inventoryItem { id }` for the inventory item ID

---

## Status

**Phase Status:** Iteration 2 Complete + Cron Controls & Sync Dashboard

| Iteration | Status | Notes |
|-----------|--------|-------|
| 1. Core Sync Logic | **Complete** | Manual "Sync Now" button works, tested end-to-end |
| 2. Scheduled Cron Job | **Complete** | Vercel Cron fires every 1 min, gated by `app_settings` table (runtime enable/disable + configurable interval). Dedicated `/admin/inventory-sync` page with toggle, interval selector, Sync Now button, and last sync status. Dashboard shows compact sync summary with link to manage page. |
| 3. Error Handling & Notifications | Not Started | Needs Resend setup |
| 4. Admin UI Improvements | Partially Started | Sync management page created (`/admin/inventory-sync`). Still needed: sync history table, per-partner sync controls |

**Prerequisites:**
- [x] Phase 1 complete (product import working)
- [ ] Resend account set up (needed for Iteration 3)
- [x] CRON_SECRET environment variable configured (set in Vercel dashboard)

**Security hardening (completed alongside Iteration 2):**
- [x] Removed unused `/app/partners/$shop/products` endpoint (partner cross-access vulnerability)
- [x] Added `requireAdminSession()` to all admin action handlers (defense-in-depth)
