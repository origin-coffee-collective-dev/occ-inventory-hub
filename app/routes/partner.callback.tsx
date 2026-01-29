import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  validateShopDomain,
  validateState,
  validateHmac,
  exchangeCodeForToken,
} from "~/lib/partners/oauth.server";
import { ensurePartnerExists } from "~/lib/partners/sync.server";

/**
 * Partner OAuth Callback Route
 *
 * GET /partner/callback?code=xxx&shop=xxx&state=xxx&hmac=xxx
 *
 * Handles the OAuth callback from Shopify after partner approves.
 * Exchanges the authorization code for an access token and stores it.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shopParam = url.searchParams.get("shop");
  const state = url.searchParams.get("state");

  // Validate required parameters
  if (!code || !shopParam || !state) {
    console.error("Missing OAuth parameters:", { code: !!code, shop: !!shopParam, state: !!state });
    return redirect("/partner/error?reason=missing_params");
  }

  // Validate shop domain
  const shop = validateShopDomain(shopParam);
  if (!shop) {
    console.error("Invalid shop domain:", shopParam);
    return redirect("/partner/error?reason=invalid_shop");
  }

  // Validate HMAC signature from Shopify
  if (!validateHmac(url.searchParams)) {
    console.error("Invalid HMAC signature for shop:", shop);
    return redirect("/partner/error?reason=invalid_hmac");
  }

  // Validate CSRF state token
  const stateShop = validateState(state);
  if (!stateShop || stateShop !== shop) {
    console.error("Invalid state token for shop:", shop, "expected:", stateShop);
    return redirect("/partner/error?reason=invalid_state");
  }

  // Exchange authorization code for access token
  const tokenResult = await exchangeCodeForToken(shop, code);

  if ("error" in tokenResult) {
    console.error("Token exchange failed for shop:", shop, tokenResult.error);
    return redirect(`/partner/error?reason=token_exchange&details=${encodeURIComponent(tokenResult.error)}`);
  }

  // Store partner credentials in database
  try {
    await ensurePartnerExists(shop, tokenResult.accessToken, tokenResult.scope);
  } catch (error) {
    console.error("Failed to store partner credentials:", error);
    return redirect("/partner/error?reason=database_error");
  }

  // Redirect to success page
  return redirect(`/partner/success?shop=${encodeURIComponent(shop)}`);
};

/**
 * This route only handles redirects, no UI needed.
 */
export default function PartnerCallback() {
  return null;
}
