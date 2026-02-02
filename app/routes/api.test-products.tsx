import type { LoaderFunctionArgs } from "react-router";
import { getAllPartners } from "~/lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { data: partners } = await getAllPartners();

  if (!partners || partners.length === 0) {
    return Response.json({ error: "No partners found" });
  }

  const partner = partners[0];

  if (!partner.access_token) {
    return Response.json({ error: "Partner has no access token" });
  }

  const tokenPrefix = partner.access_token.substring(0, 5);
  const tokenType = tokenPrefix === "shpat" ? "offline" : tokenPrefix === "shpua" ? "online" : "unknown";

  const response = await fetch(
    `https://${partner.shop}/admin/api/2025-01/products.json?limit=10`,
    {
      headers: {
        "X-Shopify-Access-Token": partner.access_token,
      },
    }
  );

  if (!response.ok) {
    return Response.json({
      error: `API error: ${response.status}`,
      tokenPrefix,
      tokenType,
    });
  }

  const data = await response.json();

  return Response.json({
    shop: partner.shop,
    tokenPrefix,
    tokenType,
    products: data.products,
  });
};
