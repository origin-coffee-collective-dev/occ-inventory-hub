import type { LoaderFunctionArgs } from "react-router";
import { json } from "react-router";
import { authenticate } from "~/shopify.server";
import { getAllPartners } from "~/lib/supabase.server";

/**
 * TEST ENDPOINT - Remove after verifying partner tokens work
 *
 * Tests that partner access tokens can make API calls to their stores.
 * Visit /app/test/partner-token to run the test.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Ensure user is authenticated
  await authenticate.admin(request);

  const { data: partners, error: partnersError } = await getAllPartners();

  if (partnersError) {
    return json({ error: `Failed to fetch partners: ${partnersError}` }, { status: 500 });
  }

  if (partners.length === 0) {
    return json({ message: "No partners found. Connect a partner first." });
  }

  const results = [];

  for (const partner of partners) {
    if (!partner.access_token) {
      results.push({
        shop: partner.shop,
        status: "no_token",
        message: "Partner has no access token",
      });
      continue;
    }

    // Check token prefix
    const tokenPrefix = partner.access_token.substring(0, 5);
    const tokenType = tokenPrefix === "shpat" ? "offline" : tokenPrefix === "shpua" ? "online" : "unknown";

    // Test API call - fetch shop info
    try {
      const response = await fetch(
        `https://${partner.shop}/admin/api/2025-01/shop.json`,
        {
          headers: {
            "X-Shopify-Access-Token": partner.access_token,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        results.push({
          shop: partner.shop,
          status: "api_error",
          tokenPrefix,
          tokenType,
          httpStatus: response.status,
          error: errorText,
        });
        continue;
      }

      const data = await response.json();
      results.push({
        shop: partner.shop,
        status: "success",
        tokenPrefix,
        tokenType,
        shopName: data.shop?.name,
        shopEmail: data.shop?.email,
      });
    } catch (err) {
      results.push({
        shop: partner.shop,
        status: "network_error",
        tokenPrefix,
        tokenType,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return json({
    message: "Partner token test results",
    results,
    summary: {
      total: partners.length,
      offline: results.filter(r => r.tokenType === "offline").length,
      online: results.filter(r => r.tokenType === "online").length,
      success: results.filter(r => r.status === "success").length,
      failed: results.filter(r => r.status !== "success").length,
    },
  });
};

export default function TestPartnerToken() {
  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1>Partner Token Test</h1>
      <p>This page tests partner access tokens. Check the network response or visit this URL directly to see JSON results.</p>
      <p><strong>Note:</strong> Remove this test endpoint after verification.</p>
    </div>
  );
}
