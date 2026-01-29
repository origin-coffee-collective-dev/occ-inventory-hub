# OCC Inventory Hub - Claude Code Context

## Project Overview

This is a **B2B dropshipping/inventory hub** Shopify embedded app that connects a primary retail store with multiple supplier (partner) stores. The app enables automated product imports with margin markup, inventory synchronization, and order routing.

### Business Problem Solved

- Retail storefront doesn't hold inventory
- Partner stores (suppliers/wholesalers) have their own Shopify stores with products
- Products are imported to the retail store with configurable markup pricing
- When customers buy, orders are routed to partners who ship to your fulfillment center

### Core Workflows

1. **Partner Connection** - Partners authorize via OAuth, credentials stored for API access
2. **Product Import** - Pull products from partners, create copies with margin-adjusted pricing
3. **Inventory Mirroring** - Periodic sync of inventory levels from partners
4. **Order Routing** - Detect partner items via SKU prefix, create orders on partner stores (partners ship to your fulfillment center, not directly to customers)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Router 7.12 (not Remix) |
| Frontend | React 18.3, Shopify Polaris web components |
| Backend | Node.js, React Router server |
| Database | PostgreSQL (Supabase), Prisma ORM 6.16 |
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
│   ├── db.server.ts              # Prisma client singleton
│   ├── root.tsx                  # Root layout component
│   └── routes.ts                 # React Router configuration
├── prisma/
│   └── schema.prisma             # Database schema
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
| `app/shopify.server.ts` | Shopify auth setup with Prisma session storage |
| `app/db.server.ts` | Singleton Prisma client (prevents dev mode duplicates) |
| `shopify.app.toml` | App scopes, webhooks, API version configuration |
| `prisma/schema.prisma` | Database models and relations |

### Routes

| Route | Purpose |
|-------|---------|
| `/_index/route.tsx` | Public landing page with login |
| `/auth.login/route.tsx` | Login form and OAuth initiation |
| `/app.tsx` | Main authenticated layout with partner sync |
| `/app._index.tsx` | Home page |
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

**Session** - Managed by `@shopify/shopify-app-session-storage-prisma`
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

# Supabase PostgreSQL Connection
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres

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

# Local development with hot reload
npm run dev

# Database migrations
npm run prisma migrate dev    # Create new migration
npm run prisma migrate deploy # Apply migrations
npm run prisma generate       # Regenerate client

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
4. **No user-facing dashboard** - API-only operations
5. **Margin-based pricing** - not fixed markup
6. **Session managed by Prisma** via `@shopify/shopify-app-session-storage-prisma`
7. **React Router 7** (not Remix) - use `react-router` imports
8. **Shopify Polaris** uses web components (`<s-app-nav>`, `<s-link>`)

---

## Future Development Areas

When implementing new features, consider:

1. **Product Sync** - Implement full product import from partner stores
2. **Inventory Sync** - Scheduled jobs to mirror inventory levels
3. **Order Routing** - Parse SKU prefix, create orders on partner stores (ship to fulfillment center)
4. **Dashboard** - Admin UI for managing partners and viewing sync status
5. **Notifications** - Alert on sync failures or inventory issues
