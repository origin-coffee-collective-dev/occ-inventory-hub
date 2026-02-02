import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "~/shopify.server";
import { getAllPartners } from "~/lib/supabase.server";

/**
 * TEST ENDPOINT - Remove after verifying partner tokens work
 *
 * Fetches products from partner stores to verify tokens work.
 * Visit /app/test/partner-token to see results.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Ensure user is authenticated
  await authenticate.admin(request);

  const { data: partners, error: partnersError } = await getAllPartners();

  if (partnersError) {
    return { error: `Failed to fetch partners: ${partnersError}`, partners: [], results: [] };
  }

  if (partners.length === 0) {
    return { message: "No partners found. Connect a partner first.", partners: [], results: [] };
  }

  const results = [];

  for (const partner of partners) {
    if (!partner.access_token) {
      results.push({
        shop: partner.shop,
        status: "no_token",
        tokenInfo: null,
        products: [],
        error: "Partner has no access token",
      });
      continue;
    }

    // Check token prefix
    const tokenPrefix = partner.access_token.substring(0, 5);
    const tokenType = tokenPrefix === "shpat" ? "offline" : tokenPrefix === "shpua" ? "online" : "unknown";

    // Fetch products from partner store
    try {
      const response = await fetch(
        `https://${partner.shop}/admin/api/2025-01/products.json?limit=10`,
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
          tokenInfo: { prefix: tokenPrefix, type: tokenType },
          products: [],
          error: `HTTP ${response.status}: ${errorText}`,
        });
        continue;
      }

      const data = await response.json();
      const products = data.products?.map((p: { id: number; title: string; variants: { id: number; price: string; sku: string }[] }) => ({
        id: p.id,
        title: p.title,
        variantCount: p.variants?.length || 0,
        firstVariantPrice: p.variants?.[0]?.price,
        firstVariantSku: p.variants?.[0]?.sku,
      })) || [];

      results.push({
        shop: partner.shop,
        status: "success",
        tokenInfo: { prefix: tokenPrefix, type: tokenType },
        products,
        error: null,
      });
    } catch (err) {
      results.push({
        shop: partner.shop,
        status: "network_error",
        tokenInfo: { prefix: tokenPrefix, type: tokenType },
        products: [],
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { partners, results };
};

export default function TestPartnerToken() {
  const data = useLoaderData<typeof loader>();

  if ("error" in data && data.error) {
    return (
      <s-page heading="Partner Token Test">
        <s-section>
          <s-banner tone="critical">{data.error}</s-banner>
        </s-section>
      </s-page>
    );
  }

  if ("message" in data && data.message) {
    return (
      <s-page heading="Partner Token Test">
        <s-section>
          <s-banner tone="warning">{data.message}</s-banner>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Partner Token Test">
      <s-section heading="Connected Partners">
        <s-banner tone="warning">
          This is a test endpoint. Remove after verification.
        </s-banner>
      </s-section>

      {data.results?.map((result) => (
        <s-section key={result.shop} heading={result.shop}>
          <s-stack direction="block" gap="base">
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-text>
                  <strong>Status:</strong> {result.status}
                </s-text>
                {result.tokenInfo && (
                  <>
                    <s-text>
                      <strong>Token Prefix:</strong> {result.tokenInfo.prefix}
                    </s-text>
                    <s-text>
                      <strong>Token Type:</strong>{" "}
                      <span style={{ color: result.tokenInfo.type === "offline" ? "green" : "red" }}>
                        {result.tokenInfo.type}
                      </span>
                    </s-text>
                  </>
                )}
                {result.error && (
                  <s-text>
                    <strong>Error:</strong> {result.error}
                  </s-text>
                )}
              </s-stack>
            </s-box>

            {result.products.length > 0 && (
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-heading>Products ({result.products.length})</s-heading>
                <s-stack direction="block" gap="tight">
                  {result.products.map((product) => (
                    <s-text key={product.id}>
                      • {product.title} - ${product.firstVariantPrice} ({product.variantCount} variants)
                      {product.firstVariantSku && ` [SKU: ${product.firstVariantSku}]`}
                    </s-text>
                  ))}
                </s-stack>
              </s-box>
            )}
          </s-stack>
        </s-section>
      ))}
    </s-page>
  );
}
