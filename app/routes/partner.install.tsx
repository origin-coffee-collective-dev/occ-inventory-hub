import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  validateShopDomain,
  generateInstallUrl,
} from "~/lib/partners/oauth.server";

/**
 * Partner OAuth Install Route
 *
 * GET /partner/install?shop=partner-store.myshopify.com
 *
 * Initiates the OAuth flow for a partner to authorize the app.
 * Redirects to Shopify's OAuth authorization page.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");

  if (!shopParam) {
    return redirect("/partner/error?reason=missing_shop");
  }

  const shop = validateShopDomain(shopParam);
  if (!shop) {
    return redirect("/partner/error?reason=invalid_shop");
  }

  // Build the redirect URI for the callback
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) {
    console.error("SHOPIFY_APP_URL environment variable is not set");
    return redirect("/partner/error?reason=config_error");
  }

  const redirectUri = `${appUrl}/partner/callback`;
  const installUrl = generateInstallUrl(shop, redirectUri);

  console.log("=== INSTALL URL GENERATED ===");
  console.log(installUrl);
  console.log("=============================");

  return redirect(installUrl);
};

/**
 * This route only handles redirects, no UI needed.
 */
export default function PartnerInstall() {
  return null;
}
