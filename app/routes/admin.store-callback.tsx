import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  validateShopDomain,
  validateState,
  validateHmac,
  exchangeCodeForToken,
} from "~/lib/partners/oauth.server";
import { upsertOwnerStore } from "~/lib/supabase.server";

/**
 * Admin Store OAuth Callback Route
 *
 * GET /admin/store-callback?code=xxx&shop=xxx&state=xxx&hmac=xxx
 *
 * Handles the OAuth callback from Shopify after the parent store approves.
 * Exchanges the authorization code for an access token and stores it in owner_store table.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shopParam = url.searchParams.get("shop");
  const state = url.searchParams.get("state");

  // Validate required parameters
  if (!code || !shopParam || !state) {
    console.error("Missing OAuth parameters:", { code: !!code, shop: !!shopParam, state: !!state });
    return redirect("/admin/connect-store?error=missing_params");
  }

  // Validate shop domain
  const shop = validateShopDomain(shopParam);
  if (!shop) {
    console.error("Invalid shop domain:", shopParam);
    return redirect("/admin/connect-store?error=invalid_shop");
  }

  // Validate HMAC signature from Shopify
  if (!validateHmac(url.searchParams)) {
    console.error("Invalid HMAC signature for shop:", shop);
    return redirect("/admin/connect-store?error=invalid_hmac");
  }

  // Validate CSRF state token
  const stateShop = validateState(state);
  if (!stateShop || stateShop !== shop) {
    console.error("Invalid state token for shop:", shop, "expected:", stateShop);
    return redirect("/admin/connect-store?error=invalid_state");
  }

  // Exchange authorization code for access token
  const tokenResult = await exchangeCodeForToken(shop, code);

  if ("error" in tokenResult) {
    console.error("Token exchange failed for shop:", shop, tokenResult.error);
    return redirect(`/admin/connect-store?error=token_exchange&details=${encodeURIComponent(tokenResult.error)}`);
  }

  // Store owner store credentials in database
  const { error: storeError } = await upsertOwnerStore(
    shop,
    tokenResult.accessToken,
    tokenResult.scope
  );

  if (storeError) {
    console.error("Failed to store owner credentials:", storeError);
    return redirect("/admin/connect-store?error=database_error");
  }

  console.log(`Successfully connected owner store: ${shop}`);

  // Redirect to admin dashboard with success message
  return redirect("/admin?store_connected=true");
};

/**
 * This route only handles redirects, no UI needed.
 */
export default function AdminStoreCallback() {
  return null;
}
