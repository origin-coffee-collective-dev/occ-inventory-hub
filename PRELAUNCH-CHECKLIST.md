# Pre-Launch Checklist

Tasks to complete before merging `dev` into `main` and going to production.

## URL Updates

- [ ] Update `shopify.app.toml` (production app config):
  - [ ] `application_url` → production URL (not `-dev`)
  - [ ] `redirect_urls` → production URLs
- [ ] Update `shopify.app.dev.toml` if keeping for future dev work
- [ ] Verify `SHOPIFY_APP_URL` env var in Vercel production deployment
- [ ] Update any hardcoded URLs in codebase (search for `occ-inventory-hub-dev`)

## Environment Variables

- [ ] Ensure production Vercel project has all required env vars:
  - [ ] `SHOPIFY_API_KEY` (production app - for partners)
  - [ ] `SHOPIFY_API_SECRET` (production app - for partners)
  - [ ] `SHOPIFY_APP_URL` (production URL)
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_KEY`
  - [ ] `OCC_STORE_DOMAIN` (parent store domain)
  - [ ] `OCC_PARENT_CLIENT_ID` (occ-main-api app client ID)
  - [ ] `OCC_PARENT_CLIENT_SECRET` (occ-main-api app client secret)

## Shopify App Config

- [ ] Deploy production app config: `shopify app deploy --config shopify.app.toml`
- [ ] Verify webhook URLs point to production
- [ ] Verify OAuth redirect URLs include production domain

## Database

- [ ] Run any pending migrations on production Supabase
- [ ] Verify `owner_store` connection works (tokens auto-refresh via client credentials)

## Testing

- [ ] Test OAuth flow on production URL
- [ ] Test partner connection flow
- [ ] Test product import from partner to OCC store
- [ ] Verify webhooks are received (app/uninstalled, compliance)

## Cleanup

- [ ] Remove any debug logging or console.logs
- [ ] Review and remove any TODO comments in code
- [ ] Update `claude.md` if any instructions are dev-specific

---

*This file should be deleted after launch is complete.*
