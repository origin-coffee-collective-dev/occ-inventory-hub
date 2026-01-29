import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { PRODUCTS_QUERY, type ProductsQueryResult } from "~/lib/shopify/queries/products";
import type { ShopifyProduct } from "~/types/shopify";

/**
 * Test endpoint to fetch products from a connected partner store.
 * Uses API key authentication instead of Shopify OAuth.
 *
 * GET /api/test/partners/{shop}/products?key=YOUR_ADMIN_API_KEY
 *
 * Query parameters:
 * - key (required): ADMIN_API_KEY from environment
 * - cursor: Pagination cursor for next page
 * - pageSize: Number of products per page (default: 50, max: 250)
 * - query: Shopify search query to filter products
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const apiKey = url.searchParams.get('key');

  // Validate API key
  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey) {
    return Response.json(
      { error: "ADMIN_API_KEY environment variable not configured" },
      { status: 500 }
    );
  }

  if (!apiKey || apiKey !== expectedKey) {
    return Response.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  const { shop } = params;
  if (!shop) {
    return Response.json({ error: "Shop parameter is required" }, { status: 400 });
  }

  // Normalize shop domain
  const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

  // Fetch partner from database
  const partner = await db.partner.findUnique({
    where: { shop: shopDomain },
  });

  if (!partner) {
    return Response.json({ error: "Partner not found" }, { status: 404 });
  }

  if (!partner.isActive || partner.isDeleted) {
    return Response.json({ error: "Partner is not active" }, { status: 403 });
  }

  if (!partner.accessToken) {
    return Response.json({ error: "Partner credentials have been revoked" }, { status: 403 });
  }

  // Parse query parameters
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
          'X-Shopify-Access-Token': partner.accessToken,
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
        { error: "Failed to fetch products from partner store", details: errorText },
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
      success: true,
      shop: shopDomain,
      productCount: products.length,
      pageInfo,
      products,
    });
  } catch (error) {
    console.error(`Error fetching products from partner ${shopDomain}:`, error);
    return Response.json(
      { error: "Internal error fetching partner products" },
      { status: 500 }
    );
  }
};
