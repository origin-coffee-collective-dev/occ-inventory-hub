# OCC Inventory Hub - Claude Code Context

## IMPORTANT: Development vs Production Apps

This codebase has **two separate Shopify apps**:

| App | Config File | Purpose | Status |
|-----|-------------|---------|--------|
| `occ-inventory-hub` | `shopify.app.toml` | Production app | Under App Store review |
| `occ-inventory-hub-dev` | `shopify.app.dev.toml` | Development app | Active development |

**Always use the dev app for local development:**
```bash
# Correct - uses dev app
npm run dev -- --config shopify.app.dev.toml

# Wrong - uses production app (under review)
npm run dev
```

The production app (`occ-inventory-hub`) is currently under Shopify App Store review. Do not use it for development work.

## Deployment Workflow

| Branch | Vercel Project | Shopify App | Auto-deploy |
|--------|----------------|-------------|-------------|
| `main` | `occ-inventory-hub` | `occ-inventory-hub` (frozen) | Yes, via GitHub CI/CD |
| `dev` | `occ-inventory-hub-dev` | `occ-inventory-hub-dev` | Yes, via GitHub CI/CD |

**Deployment is handled by GitHub CI/CD** - pushing to a branch auto-deploys to the corresponding Vercel project. Do NOT use `vercel --prod` CLI commands for deployment; just `git push`.

## Custom App Install Links

**Dev App (`occ-inventory-hub-dev`) - Custom Distribution:**
```
https://admin.shopify.com/store/rq23p0-vg/oauth/install_custom_app?client_id=19bafcd457f52181a12054b310728aaf&no_redirect=true&signature=eyJleHBpcmVzX2F0IjoxNzcwNzQ5OTQxLCJwZXJtYW5lbnRfZG9tYWluIjoicnEyM3AwLXZnLm15c2hvcGlmeS5jb20iLCJjbGllbnRfaWQiOiIxOWJhZmNkNDU3ZjUyMTgxYTEyMDU0YjMxMDcyOGFhZiIsInB1cnBvc2UiOiJjdXN0b21fYXBwIn0%3D--e91a8698c6567a892a06dd637fd196dd6448fd97
```
Note: This link is for the Plus organization. Expires around the date encoded in the signature.

## Pre-Launch Checklist

Before merging `dev` into `main`, review **`PRELAUNCH-CHECKLIST.md`** for required URL updates, environment variable changes, and cleanup tasks.

---

## Project Overview

This is a **B2B dropshipping/inventory hub** Shopify embedded app that connects a primary retail store with multiple supplier (partner) stores. The app enables automated product imports with margin markup, inventory synchronization, and order routing.

### Business Context: Online Coffee Company

**OCC (Online Coffee Company)** is an online coffee business with the following model:
- You run the customer-facing retail storefront
- Partner wholesalers/coffee roasters have their own Shopify stores with coffee products
- Products are imported to your retail store with configurable margin markup
- Customers purchase from your store
- **Daily order processing**: At end of day (via cron job), orders are batched and sent to partner wholesalers
- **Fulfillment flow**: Partners roast fresh coffee and ship to YOUR fulfillment center (not direct to customer)
- You then ship to customers from your fulfillment center (typically weekly or as scheduled)

### Business Problem Solved

- Retail storefront doesn't hold inventory - partners hold it
- Partner stores (coffee roasters/wholesalers) have their own Shopify stores with products
- Products are imported to the retail store with configurable markup pricing (default 30% margin)
- When customers buy, orders are batched and routed to partners who ship to your fulfillment center
- Fresh roasting happens on-demand based on actual orders

### Core Workflows

1. **Partner Connection** - Partners authorize via OAuth, credentials stored for API access
2. **Product Import** - Pull products from partners, create copies with margin-adjusted pricing
3. **Inventory Mirroring** - Periodic sync of inventory levels from partners (every 15-30 min)
4. **Order Routing** - Detect partner items via SKU prefix, batch orders daily, create orders on partner stores (partners ship to your fulfillment center)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Router 7.12 (not Remix) |
| Frontend | React 18.3, Shopify Polaris web components |
| Backend | Node.js, React Router server |
| Database | PostgreSQL (Supabase) |
| Auth | Shopify App Bridge, OAuth 2.0 |
| API | Shopify GraphQL Admin API (October25 version) |
| Build | Vite 6.3, TypeScript 5.9 |
| Hosting | Vercel (Node.js runtime) |

---

## Directory Structure

```
occ-inventory-hub/
├── app/                          # Main application code
│   ├── routes/                   # React Router file-based routes
│   ├── lib/                      # Shared utilities and services
│   │   ├── partners/             # Partner sync logic
│   │   ├── shopify/              # Shopify API utilities
│   │   │   ├── queries/          # GraphQL query definitions
│   │   │   └── utils/            # Pagination helpers
│   │   └── utils/                # Price & SKU utilities
│   ├── types/                    # TypeScript type definitions
│   ├── shopify.server.ts         # Shopify auth configuration
│   ├── supabase.server.ts        # Supabase client singleton
│   ├── root.tsx                  # Root layout component
│   └── routes.ts                 # React Router configuration
├── supabase/
│   └── migrations/               # SQL migration files
├── extensions/                   # Shopify extensions (empty)
├── public/                       # Static assets
├── shopify.app.toml              # Shopify app configuration
├── vite.config.ts                # Vite build configuration
└── package.json                  # Dependencies and scripts
```

---

## Key Files Reference

### Core Configuration

| File | Purpose |
|------|---------|
| `app/shopify.server.ts` | Shopify auth setup with Supabase session storage |
| `app/lib/supabase.server.ts` | Supabase client singleton |
| `shopify.app.toml` | App scopes, webhooks, API version configuration |

### Routes

**Admin Dashboard (Supabase Auth - email/password)**
| Route | Purpose |
|-------|---------|
| `/admin.tsx` | Admin layout with auth check |
| `/admin._index.tsx` | Admin dashboard with partner stats |
| `/admin.login.tsx` | Admin login page |
| `/admin.logout.tsx` | Admin logout action |
| `/admin.partners._index.tsx` | Partners list |
| `/admin.partners.$shop.tsx` | Partner products (sync, price, import) |

**Partner-Facing App (Shopify OAuth - embedded in partner's admin)**
| Route | Purpose |
|-------|---------|
| `/app.tsx` | Partner-facing layout with Shopify auth |
| `/app._index.tsx` | Partner connection status page |

**Public & Auth Routes**
| Route | Purpose |
|-------|---------|
| `/_index/route.tsx` | Public landing page with login |
| `/auth.login/route.tsx` | Login form and OAuth initiation |
| `/webhooks.compliance.tsx` | GDPR webhook handlers |
| `/webhooks.app.uninstalled.tsx` | App uninstall cleanup |
| `/webhooks.app.scopes_update.tsx` | Permission change handler |
| `/partner.install.tsx` | Partner OAuth initiation |
| `/partner.callback.tsx` | Partner OAuth callback |
| `/partner.success.tsx` | Authorization success page |
| `/partner.error.tsx` | Authorization error page |

### Utilities

| File | Purpose |
|------|---------|
| `app/lib/utils/price.ts` | Margin markup calculations (default 30%) |
| `app/lib/utils/sku.ts` | Partner SKU generation/parsing (`PARTNER-{shop}-{sku}`) |
| `app/lib/partners/sync.server.ts` | Partner record upsert on app load |
| `app/lib/partners/oauth.server.ts` | Partner OAuth utilities (URL generation, token exchange) |
| `app/lib/ownerStore.server.ts` | Parent store token management (client credentials grant, auto-refresh) |
| `app/lib/shopify/utils/pagination.ts` | Generic GraphQL pagination helpers |
| `app/lib/shopify/queries/products.ts` | Products GraphQL query |

### Types

| File | Purpose |
|------|---------|
| `app/types/database.ts` | Database model interfaces and insert types |
| `app/types/shopify.ts` | Shopify GraphQL response types |

---

## Database Schema

### Models

**Session** - Managed by custom Supabase session storage
- Stores OAuth sessions with tokens, user info, expiration

**Partner** - Connected supplier stores
- `shop` (unique) - Partner store domain
- `accessToken` - Nullable (cleared on GDPR redact)
- `scope` - Granted permissions
- `isActive`, `isDeleted`, `deletedAt` - Soft-delete support

**ProductMapping** - Links partner variants to owner's variants
- Unique on `(partnerShop, partnerVariantId)`
- `margin` - Profit margin (default 0.30)
- `partnerShop` stored separately for retention after partner deletion

**PartnerOrder** - Tracks orders created on partner stores
- `status` - pending | created | failed
- `errorMessage` - Failure details

**SyncLog** - Audit trail for all sync operations
- `syncType` - products | inventory | orders | gdpr_* | app_uninstalled
- Tracks items processed/created/updated/failed

---

## Environment Variables

```bash
# Shopify App Credentials (from Partners Dashboard)
SHOPIFY_API_KEY=your_app_client_id
SHOPIFY_API_SECRET=your_app_client_secret

# App URL (auto-set by Shopify CLI in dev)
SHOPIFY_APP_URL=https://your-app.example.com

# Scopes (should match shopify.app.toml)
SCOPES=read_products,read_inventory,write_orders

# Supabase Connection
SUPABASE_URL=https://[PROJECT].supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key

# Parent Store API (for admin dashboard product imports)
# Uses a separate app "occ-main-api" with client credentials grant
# Create app in Partner Dashboard, install on your parent store
OCC_STORE_DOMAIN=your-store.myshopify.com
OCC_PARENT_CLIENT_ID=your_parent_app_client_id
OCC_PARENT_CLIENT_SECRET=your_parent_app_client_secret

# Optional
DEFAULT_MARGIN=0.30  # Override default markup margin
SHOP_CUSTOM_DOMAIN=  # Custom shop domain if needed
```

---

## Deployment (Vercel)

```bash
# Deploy to Vercel
npm run deploy:vercel

# Or use Vercel CLI directly
vercel --prod
```

### Vercel Configuration
- `vercel.json` - Node.js 20 runtime, build commands
- Environment variables must be set in Vercel dashboard:
  - `SHOPIFY_API_KEY`
  - `SHOPIFY_API_SECRET`
  - `SHOPIFY_APP_URL` (your Vercel deployment URL)
  - `SCOPES`
  - `DATABASE_URL`

---

## Common Development Tasks

```bash
# Install dependencies
npm install

# Local development with hot reload (ALWAYS use dev app config)
npm run dev -- --config shopify.app.dev.toml

# Build for production
npm run build

# Run production build locally
npm run start

# Type checking
npm run typecheck

# Linting
npm run lint

# Full setup (generate + migrate)
npm run setup
```

---

## Code Patterns & Conventions

### File Naming
- `.server.ts` suffix for server-only code
- File-based routing with `.` for nesting (e.g., `app.partners.$shop.tsx`)
- Path alias `~/` maps to `./app/`

### Route Pattern
```typescript
// Loader for data fetching
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  // ... return data
};

// Action for mutations
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  // ... handle action
};
```

### GraphQL Queries
- Stored in `app/lib/shopify/queries/`
- Use pagination helpers from `app/lib/shopify/utils/pagination.ts`

### Price Calculations
```typescript
// Formula: my_price = partner_price / (1 - margin)
// With 30% margin: $70 partner → $100 selling ($30 profit)
import { calculateSellingPrice } from '~/lib/utils/price';
const myPrice = calculateSellingPrice(partnerPrice, 0.30);
```

### SKU Format
```typescript
// Format: PARTNER-{shopPrefix}-{originalSku}
// Example: PARTNER-best-roastery-BLEND001
import { generatePartnerSku, parsePartnerSku } from '~/lib/utils/sku';
```

### Partner Sync
- `ensurePartnerExists()` called on every authenticated request
- Upserts partner record, handles reinstalls (clears soft-delete flags)

### GDPR Compliance
- Soft-delete on `SHOP_REDACT` - credentials removed, business records retained
- No customer PII stored - only transaction records
- Webhooks log all operations to `SyncLog`

### UI Patterns - Confirmation Modals

**Always use confirmation modals for destructive or state-changing operations:**
- Delete operations (unlinking products, removing partners, etc.)
- Token refreshes
- Data updates that can't be easily undone
- Any action that modifies external state (Shopify API calls)

**Usage:**
```typescript
import { ConfirmModal } from "~/components/ConfirmModal";

<ConfirmModal
  isOpen={showConfirm}
  title="Delete Product?"
  message="This will unlink the product from your store. You can re-import it later."
  confirmLabel="Delete"
  cancelLabel="Cancel"
  confirmStyle="danger"  // "danger" for destructive, "primary" for normal
  onConfirm={() => handleDelete()}
  onCancel={() => setShowConfirm(false)}
  isLoading={isDeleting}
/>
```

**Guidelines:**
- For initial "Connect" or "Create" actions, no confirmation is needed
- For "Refresh", "Update", "Delete", "Unlink" actions, always confirm
- Use `confirmStyle="danger"` for irreversible/destructive actions
- Use clear, specific language in the title and message

### UI Patterns - Toast Notifications

**This app uses `react-hot-toast` for notifications.** The `<Toaster>` is configured in the admin layout (`admin.tsx`), so toasts can be called from any admin page.

**Always show toast notifications for action feedback:**
- Success: When an action completes successfully
- Error: When an action fails
- This applies to all state-changing operations (API calls, form submissions, etc.)

**Usage:**
```typescript
import toast from "react-hot-toast";

// Success
toast.success("Token refreshed successfully");

// Error
toast.error("Failed to refresh token: " + errorMessage);

// Custom
toast("Processing...", { icon: "⏳" });
```

**Guidelines:**
- Every action that modifies state should show a toast on completion
- Use `toast.success()` for successful operations
- Use `toast.error()` for failed operations
- Keep messages concise but informative
- Don't show toasts for read-only operations (loading data, navigation)

### UI Patterns Summary

For any action that modifies state:
1. **Before**: Show confirmation modal (for destructive/important actions)
2. **After**: Show toast notification (success or error)

---

## API Scopes

```
read_products   - Read partner product catalog
read_inventory  - Read partner inventory levels
write_orders    - Create orders on partner stores
```

---

## Webhook Subscriptions

| Topic | Handler | Purpose |
|-------|---------|---------|
| `app/uninstalled` | `/webhooks/app/uninstalled` | Delete user sessions |
| `app/scopes_update` | `/webhooks/app/scopes_update` | Update session scope |
| `customers/data_request` | `/webhooks/compliance` | GDPR data request (no PII stored) |
| `customers/redact` | `/webhooks/compliance` | GDPR customer redact (no PII stored) |
| `shop/redact` | `/webhooks/compliance` | GDPR shop redact (soft-delete partner) |

---

## Key Implementation Notes

1. **Fulfillment model** - Partners ship to your fulfillment center (not direct to customer)
2. **Single inventory location** per store assumed
3. **Custom/private app** - not public App Store listing
4. **Two separate experiences**:
   - **Partner-facing** (`/app/*`) - Shopify embedded app, partners see connection status
   - **Admin dashboard** (`/admin/*`) - Standalone, email/password login via Supabase Auth
5. **Margin-based pricing** - not fixed markup
6. **Session managed by Supabase** via custom session storage adapter
7. **React Router 7** (not Remix) - use `react-router` imports
8. **Shopify Polaris** uses web components (`<s-app-nav>`, `<s-link>`) for partner-facing app
9. **Admin dashboard** uses plain HTML/CSS (no Polaris) - accessible directly via Vercel URL

---

## Current Implementation Status

**Completed:**
- Admin dashboard with Supabase Auth (`/admin/*`)
- Partner products browsing and sync
- Product import with flexible pricing
- Partner-facing connection status page

**Future Development Areas:**

1. **Inventory Sync** - Scheduled jobs to mirror inventory levels
2. **Order Routing** - Parse SKU prefix, create orders on partner stores (ship to fulfillment center)
3. **Notifications** - Alert on sync failures or inventory issues
4. **Price change detection** - Alert when partner prices change
