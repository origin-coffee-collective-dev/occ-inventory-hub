import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getPartnerByShop } from "~/lib/supabase.server";
import { PRODUCTS_QUERY, type ProductsQueryResult } from "~/lib/shopify/queries/products";
import type { ShopifyProduct } from "~/types/shopify";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  // Authenticate the requesting admin (the origin store)
  await authenticate.admin(request);

  const { shop } = params;
  if (!shop) {
    return Response.json({ error: "Shop parameter is required" }, { status: 400 });
  }

  // Normalize shop domain
  const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

  // Fetch partner from database
  const { data: partner, error } = await getPartnerByShop(shopDomain);

  if (error) {
    console.error(`Failed to fetch partner ${shopDomain}:`, error);
    return Response.json({ error: "Database error" }, { status: 500 });
  }

  if (!partner) {
    return Response.json({ error: "Partner not found" }, { status: 404 });
  }

  if (!partner.is_active || partner.is_deleted) {
    return Response.json({ error: "Partner is not active" }, { status: 403 });
  }

  if (!partner.access_token) {
    return Response.json({ error: "Partner credentials have been revoked" }, { status: 403 });
  }

  // Fetch products from partner's store using their access token
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '50', 10), 250);
  const query = url.searchParams.get('query') || undefined;

  try {
    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': partner.access_token,
        },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: {
            first: pageSize,
            after: cursor,
            query,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch products from partner ${shopDomain}:`, errorText);
      return Response.json(
        { error: "Failed to fetch products from partner store" },
        { status: response.status }
      );
    }

    const result = await response.json() as { data: ProductsQueryResult; errors?: unknown[] };

    if (result.errors && result.errors.length > 0) {
      console.error(`GraphQL errors fetching products from ${shopDomain}:`, result.errors);
      return Response.json(
        { error: "GraphQL error fetching products", details: result.errors },
        { status: 500 }
      );
    }

    const products: ShopifyProduct[] = result.data.products.edges.map(edge => edge.node);
    const pageInfo = result.data.products.pageInfo;

    return Response.json({
      products,
      pageInfo,
      shop: shopDomain,
    });
  } catch (error) {
    console.error(`Error fetching products from partner ${shopDomain}:`, error);
    return Response.json(
      { error: "Internal error fetching partner products" },
      { status: 500 }
    );
  }
};
