import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSubmit, useActionData, Link } from "react-router";
import { useState, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  getPartnerByShop,
  getPartnerProducts,
  upsertPartnerProducts,
  getProductMappingsByShop,
  createProductMapping,
  markPartnerProductSeen,
  unlinkProductMapping,
  type PartnerProductRecord,
} from "~/lib/supabase.server";
import { ProductDetailModal } from "~/components/ProductDetailModal";
import { getValidOwnerStoreToken } from "~/lib/ownerStore.server";
import { PRODUCTS_QUERY, type ProductsQueryResult } from "~/lib/shopify/queries/products";
import { PRODUCT_SET_MUTATION, buildProductSetInput, type ProductSetResult } from "~/lib/shopify/mutations/products";
import {
  INVENTORY_ITEM_UPDATE,
  INVENTORY_SET_QUANTITIES,
  type InventoryItemUpdateResult,
  type InventorySetQuantitiesResult,
} from "~/lib/shopify/mutations/inventory";
import { calculateMargin, formatPrice } from "~/lib/utils/price";
import { generatePartnerSku } from "~/lib/utils/sku";
import { colors } from "~/lib/tokens";

interface LoaderData {
  partnerShop: string;
  partnerName: string;
  products: Array<PartnerProductRecord & { isImported: boolean; myPrice: number | null }>;
  lastSyncedAt: string | null;
  error?: string;
  hasOccCredentials: boolean;
}

interface ActionData {
  success: boolean;
  intent: string;
  message?: string;
  error?: string;
  newCount?: number;
  updatedCount?: number;
  importedProductId?: string;
  // Bulk import specific fields
  succeeded?: number;
  failed?: Array<{ title: string; variantId: string; error: string }>;
  // Debug info for inventory tracking
  inventoryDebug?: {
    inputs: { inventoryItemId: string | undefined; locationId: string | null | undefined; partnerInventoryQty: number };
    tracking?: { status: number; ok: boolean; body: unknown; inventoryItem: unknown; tracked: boolean | undefined };
    quantity?: { status: number; ok: boolean; body: unknown };
    skipped?: string;
  };
}

interface BulkImportResult {
  succeeded: number;
  failed: Array<{ title: string; variantId: string; error: string }>;
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { shop } = params;

  if (!shop) {
    return Response.json({ error: "Shop parameter is required" }, { status: 400 });
  }

  // Check for owner store connection (auto-refreshes token if needed)
  const tokenResult = await getValidOwnerStoreToken();
  const hasOccCredentials = tokenResult.status === 'connected';

  // Normalize shop domain
  const partnerShop = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  const partnerName = shop.replace('.myshopify.com', '');

  // Fetch partner from database
  const { data: partner, error: partnerError } = await getPartnerByShop(partnerShop);

  if (partnerError) {
    return Response.json({
      partnerShop,
      partnerName,
      products: [],
      lastSyncedAt: null,
      error: "Database error",
      hasOccCredentials,
    } satisfies LoaderData);
  }

  if (!partner || !partner.is_active || partner.is_deleted) {
    return Response.json({
      partnerShop,
      partnerName,
      products: [],
      lastSyncedAt: null,
      error: "Partner not found or inactive",
      hasOccCredentials,
    } satisfies LoaderData);
  }

  // Fetch cached products (including soft-deleted ones for the Unavailable tab)
  const { data: cachedProducts } = await getPartnerProducts(partnerShop, true);

  // Fetch product mappings to determine which are already imported
  const { data: mappings } = await getProductMappingsByShop(partnerShop);
  const importedVariants = new Map(
    mappings.map(m => [m.partner_variant_id, m.my_price])
  );

  // Combine products with import status
  const products = cachedProducts.map(p => ({
    ...p,
    isImported: importedVariants.has(p.partner_variant_id),
    myPrice: importedVariants.get(p.partner_variant_id) ?? null,
  }));

  // Get last synced time
  const lastSyncedAt = products.length > 0
    ? products.reduce((latest, p) =>
        p.last_synced_at > latest ? p.last_synced_at : latest,
        products[0].last_synced_at
      )
    : null;

  return Response.json({
    partnerShop,
    partnerName,
    products,
    lastSyncedAt,
    hasOccCredentials,
  } satisfies LoaderData);
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { shop } = params;

  if (!shop) {
    return Response.json({ success: false, intent: "unknown", error: "Shop parameter is required" });
  }

  const partnerShop = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // Fetch partner
  const { data: partner, error: partnerError } = await getPartnerByShop(partnerShop);
  if (partnerError || !partner || !partner.access_token) {
    return Response.json({
      success: false,
      intent,
      error: "Partner not found or credentials unavailable",
    } satisfies ActionData);
  }

  // SYNC: Fetch products from partner API and update local cache
  if (intent === "sync") {
    try {
      const response = await fetch(
        `https://${partnerShop}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': partner.access_token,
          },
          body: JSON.stringify({
            query: PRODUCTS_QUERY,
            variables: { first: 250 },
          }),
        }
      );

      if (!response.ok) {
        return Response.json({
          success: false,
          intent,
          error: "Failed to fetch products from partner store",
        } satisfies ActionData);
      }

      const result = await response.json() as { data: ProductsQueryResult };

      // Transform products for caching (flatten variants)
      const productsToCache: Array<{
        partner_shop: string;
        partner_product_id: string;
        partner_variant_id: string;
        title: string;
        sku: string | null;
        price: number;
        inventory_quantity: number | null;
        image_url: string | null;
        handle: string | null;
        description: string | null;
        compare_at_price: number | null;
        product_type: string | null;
        vendor: string | null;
        tags: string[] | null;
        barcode: string | null;
      }> = [];

      for (const edge of result.data.products.edges) {
        const product = edge.node;
        // Get the product's featured image URL
        const productImageUrl = product.featuredImage?.url || null;

        for (const variantEdge of product.variants.edges) {
          const variant = variantEdge.node;
          // Use variant-specific image if available, otherwise fall back to product image
          const imageUrl = variant.image?.url || productImageUrl;

          productsToCache.push({
            partner_shop: partnerShop,
            partner_product_id: product.id,
            partner_variant_id: variant.id,
            title: product.variants.edges.length > 1
              ? `${product.title} - ${variant.title}`
              : product.title,
            sku: variant.sku,
            price: parseFloat(variant.price),
            inventory_quantity: variant.inventoryQuantity,
            image_url: imageUrl,
            handle: product.handle,
            description: product.descriptionHtml || null,
            compare_at_price: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
            product_type: product.productType || null,
            vendor: product.vendor || null,
            tags: product.tags && product.tags.length > 0 ? product.tags : null,
            barcode: variant.barcode || null,
          });
        }
      }

      const { newCount, updatedCount, deletedCount, restoredCount, error: upsertError } = await upsertPartnerProducts(productsToCache);

      if (upsertError) {
        return Response.json({
          success: false,
          intent,
          error: upsertError,
        } satisfies ActionData);
      }

      // Build a descriptive message
      const parts = [];
      if (newCount > 0) parts.push(`${newCount} new`);
      if (updatedCount > 0) parts.push(`${updatedCount} updated`);
      if (deletedCount > 0) parts.push(`${deletedCount} removed`);
      if (restoredCount > 0) parts.push(`${restoredCount} restored`);
      const details = parts.length > 0 ? ` (${parts.join(', ')})` : '';

      return Response.json({
        success: true,
        intent,
        message: `Synced ${productsToCache.length} products${details}`,
        newCount,
        updatedCount,
      } satisfies ActionData);
    } catch (error) {
      console.error("Sync error:", error);
      return Response.json({
        success: false,
        intent,
        error: "Failed to sync products",
      } satisfies ActionData);
    }
  }

  // IMPORT: Create product on OCC's store
  if (intent === "import") {
    console.log("🚀🚀🚀 IMPORT ACTION STARTED 🚀🚀🚀");
    const partnerVariantId = formData.get("partnerVariantId") as string;
    const sellingPrice = formData.get("sellingPrice") as string;
    console.log("partnerVariantId:", partnerVariantId, "sellingPrice:", sellingPrice);

    if (!partnerVariantId || !sellingPrice) {
      return Response.json({
        success: false,
        intent,
        error: "Missing required fields",
      } satisfies ActionData);
    }

    // Get owner store credentials (auto-refreshes token if needed)
    const tokenResult = await getValidOwnerStoreToken();

    if (tokenResult.status !== 'connected' || !tokenResult.accessToken) {
      return Response.json({
        success: false,
        intent,
        error: tokenResult.error || "Parent store not connected. Please connect your store from the dashboard.",
      } satisfies ActionData);
    }

    const occStoreDomain = tokenResult.shop!;
    const occStoreToken = tokenResult.accessToken;

    try {
      // Get product data from cache
      const { data: cachedProducts } = await getPartnerProducts(partnerShop);
      const cachedProduct = cachedProducts.find(p => p.partner_variant_id === partnerVariantId);

      if (!cachedProduct) {
        return Response.json({
          success: false,
          intent,
          error: "Product not found in cache",
        } satisfies ActionData);
      }

      const myPrice = parseFloat(sellingPrice);
      const partnerPrice = cachedProduct.price;
      const margin = calculateMargin(partnerPrice, myPrice);

      // Generate SKU for the imported product
      const mySku = generatePartnerSku(partnerShop, cachedProduct.sku || cachedProduct.partner_variant_id);

      // Create product on OCC's store using direct GraphQL call
      const productInput = buildProductSetInput({
        title: cachedProduct.title,
        vendor: partnerShop.replace('.myshopify.com', ''),
        sku: mySku,
        price: formatPrice(myPrice),
        status: 'ACTIVE',
        imageUrl: cachedProduct.image_url || undefined,
      });

      const response = await fetch(
        `https://${occStoreDomain}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': occStoreToken,
          },
          body: JSON.stringify({
            query: PRODUCT_SET_MUTATION,
            variables: {
              input: productInput,
              synchronous: true,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Shopify API error:", errorText);
        return Response.json({
          success: false,
          intent,
          error: "Failed to create product on OCC store",
        } satisfies ActionData);
      }

      const result = await response.json() as {
        data: ProductSetResult | null;
        errors?: Array<{ message: string }>;
      };

      // Check for GraphQL-level errors first
      if (result.errors && result.errors.length > 0) {
        console.error("GraphQL errors:", result.errors);
        return Response.json({
          success: false,
          intent,
          error: result.errors.map(e => e.message).join(", "),
        } satisfies ActionData);
      }

      // Check if data exists
      if (!result.data || !result.data.productSet) {
        return Response.json({
          success: false,
          intent,
          error: "Unexpected response from Shopify API",
        } satisfies ActionData);
      }

      // Now safe to check userErrors
      if (result.data.productSet.userErrors.length > 0) {
        return Response.json({
          success: false,
          intent,
          error: result.data.productSet.userErrors.map(e => e.message).join(", "),
        } satisfies ActionData);
      }

      const createdProduct = result.data.productSet.product;
      if (!createdProduct) {
        return Response.json({
          success: false,
          intent,
          error: "Product creation failed",
        } satisfies ActionData);
      }

      const createdVariant = createdProduct.variants.edges[0]?.node;
      if (!createdVariant) {
        return Response.json({
          success: false,
          intent,
          error: "Variant creation failed",
        } satisfies ActionData);
      }

      // Setup inventory tracking
      const inventoryItemId = createdVariant.inventoryItem?.id;
      const locationId = tokenResult.locationId;
      const partnerInventoryQty = cachedProduct.inventory_quantity ?? 0;

      // DEBUG: Collect debug info to return in response
      const inventoryDebug: {
        inputs: { inventoryItemId: string | undefined; locationId: string | null | undefined; partnerInventoryQty: number };
        tracking?: { status: number; ok: boolean; body: unknown; inventoryItem: unknown; tracked: boolean | undefined };
        quantity?: { status: number; ok: boolean; body: unknown };
        skipped?: string;
      } = {
        inputs: { inventoryItemId, locationId, partnerInventoryQty },
      };

      // DEBUG: Log the values we're working with
      console.log("=== INVENTORY DEBUG ===");
      console.log("inventoryItemId:", inventoryItemId);
      console.log("locationId:", locationId);
      console.log("partnerInventoryQty:", partnerInventoryQty);

      if (inventoryItemId && locationId) {
        // Step 1: Enable inventory tracking
        const trackingResponse = await fetch(
          `https://${occStoreDomain}/admin/api/2025-01/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': occStoreToken,
            },
            body: JSON.stringify({
              query: INVENTORY_ITEM_UPDATE,
              variables: {
                id: inventoryItemId,
                input: { tracked: true },
              },
            }),
          }
        );

        // DEBUG: Log the raw response
        const trackingResponseText = await trackingResponse.text();
        console.log("trackingResponse.ok:", trackingResponse.ok);
        console.log("trackingResponse.status:", trackingResponse.status);
        console.log("trackingResponse body:", trackingResponseText);

        // Parse the response (we already consumed the body, so parse from text)
        const trackingResult = JSON.parse(trackingResponseText) as {
          data: InventoryItemUpdateResult | null;
          errors?: Array<{ message: string }>;
        };

        // DEBUG: Log the parsed result
        console.log("trackingResult.data:", JSON.stringify(trackingResult.data, null, 2));
        console.log("trackingResult.errors:", trackingResult.errors);

        // Check if inventoryItem was actually returned and tracked is true
        const inventoryItem = trackingResult.data?.inventoryItemUpdate?.inventoryItem;
        console.log("inventoryItem returned:", inventoryItem);
        console.log("tracked value:", inventoryItem?.tracked);

        // Store debug info
        inventoryDebug.tracking = {
          status: trackingResponse.status,
          ok: trackingResponse.ok,
          body: trackingResult,
          inventoryItem: inventoryItem,
          tracked: inventoryItem?.tracked,
        };

        if (trackingResponse.ok) {
          // Check for GraphQL-level errors
          if (trackingResult.errors && trackingResult.errors.length > 0) {
            console.error("Inventory tracking GraphQL errors:", trackingResult.errors);
          } else {
            const trackingUserErrors = trackingResult.data?.inventoryItemUpdate?.userErrors;
            if (trackingUserErrors && trackingUserErrors.length > 0) {
              console.error("Inventory tracking error:", trackingUserErrors);
            }
          }

          // Step 2: Set initial inventory quantity
          const quantityResponse = await fetch(
            `https://${occStoreDomain}/admin/api/2025-01/graphql.json`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': occStoreToken,
              },
              body: JSON.stringify({
                query: INVENTORY_SET_QUANTITIES,
                variables: {
                  input: {
                    name: "available",
                    reason: "correction",
                    quantities: [
                      {
                        inventoryItemId,
                        locationId,
                        quantity: partnerInventoryQty,
                      },
                    ],
                  },
                },
              }),
            }
          );

          // DEBUG: Log quantity response
          const quantityResponseText = await quantityResponse.text();
          console.log("quantityResponse.ok:", quantityResponse.ok);
          console.log("quantityResponse.status:", quantityResponse.status);
          console.log("quantityResponse body:", quantityResponseText);

          const quantityResult = JSON.parse(quantityResponseText) as {
            data: InventorySetQuantitiesResult | null;
            errors?: Array<{ message: string }>;
          };

          inventoryDebug.quantity = {
            status: quantityResponse.status,
            ok: quantityResponse.ok,
            body: quantityResult,
          };

          if (quantityResponse.ok) {
            // Check for GraphQL-level errors
            if (quantityResult.errors && quantityResult.errors.length > 0) {
              console.error("Inventory quantity GraphQL errors:", quantityResult.errors);
            } else {
              const quantityUserErrors = quantityResult.data?.inventorySetQuantities?.userErrors;
              if (quantityUserErrors && quantityUserErrors.length > 0) {
                console.error("Inventory quantity error:", quantityUserErrors);
              }
            }
          } else {
            console.error("Failed to set inventory quantity:", quantityResponseText);
          }
        } else {
          console.error("Failed to enable inventory tracking:", trackingResponseText);
        }
      } else {
        console.warn("Skipping inventory setup: missing inventoryItemId or locationId");
        inventoryDebug.skipped = `inventoryItemId=${inventoryItemId}, locationId=${locationId}`;
      }

      // DEBUG: Log final summary
      console.log("=== INVENTORY DEBUG SUMMARY ===");
      console.log(JSON.stringify(inventoryDebug, null, 2));

      // Create product mapping
      const { error: mappingError } = await createProductMapping({
        partnerId: partner.id,
        partnerShop,
        partnerProductId: cachedProduct.partner_product_id,
        partnerVariantId: cachedProduct.partner_variant_id,
        myProductId: createdProduct.id,
        myVariantId: createdVariant.id,
        partnerSku: cachedProduct.sku,
        mySku,
        partnerPrice,
        myPrice,
        margin,
      });

      if (mappingError) {
        console.error("Failed to create product mapping:", mappingError);
      }

      // Mark product as seen (not new)
      await markPartnerProductSeen(partnerShop, partnerVariantId);

      return Response.json({
        success: true,
        intent,
        message: `Imported "${cachedProduct.title}" at $${formatPrice(myPrice)}`,
        importedProductId: createdProduct.id,
        inventoryDebug,
      } satisfies ActionData);
    } catch (error) {
      console.error("Import error:", error);
      return Response.json({
        success: false,
        intent,
        error: "Failed to import product",
      } satisfies ActionData);
    }
  }

  // BULK-IMPORT: Create multiple products on OCC's store sequentially
  if (intent === "bulk-import") {
    const productsJson = formData.get("products") as string;

    if (!productsJson) {
      return Response.json({
        success: false,
        intent,
        error: "Missing products data",
      } satisfies ActionData);
    }

    let productsToImport: Array<{ variantId: string; sellingPrice: string }>;
    try {
      productsToImport = JSON.parse(productsJson);
    } catch {
      return Response.json({
        success: false,
        intent,
        error: "Invalid products data format",
      } satisfies ActionData);
    }

    if (!Array.isArray(productsToImport) || productsToImport.length === 0) {
      return Response.json({
        success: false,
        intent,
        error: "No products to import",
      } satisfies ActionData);
    }

    // Get owner store credentials (auto-refreshes token if needed)
    const tokenResult = await getValidOwnerStoreToken();

    if (tokenResult.status !== 'connected' || !tokenResult.accessToken) {
      return Response.json({
        success: false,
        intent,
        error: tokenResult.error || "Parent store not connected. Please connect your store from the dashboard.",
      } satisfies ActionData);
    }

    const occStoreDomain = tokenResult.shop!;
    const occStoreToken = tokenResult.accessToken;
    const locationId = tokenResult.locationId;

    // Get all cached products for this partner
    const { data: cachedProducts } = await getPartnerProducts(partnerShop);
    const cachedProductMap = new Map(cachedProducts.map(p => [p.partner_variant_id, p]));

    // Pre-validate all products
    const validationErrors: Array<{ title: string; variantId: string; error: string }> = [];
    const validProducts: Array<{
      variantId: string;
      sellingPrice: string;
      cachedProduct: (typeof cachedProducts)[0];
    }> = [];

    for (const item of productsToImport) {
      const cachedProduct = cachedProductMap.get(item.variantId);
      if (!cachedProduct) {
        validationErrors.push({
          title: `Unknown (${item.variantId})`,
          variantId: item.variantId,
          error: "Product not found in cache",
        });
        continue;
      }

      const price = parseFloat(item.sellingPrice);
      if (isNaN(price) || price <= 0) {
        validationErrors.push({
          title: cachedProduct.title,
          variantId: item.variantId,
          error: "Invalid price",
        });
        continue;
      }

      validProducts.push({ variantId: item.variantId, sellingPrice: item.sellingPrice, cachedProduct });
    }

    // Process valid products sequentially
    let succeeded = 0;
    const failed = [...validationErrors];
    const inventoryDebugList: Array<{ title: string; inventoryItemId?: string; locationId?: string | null; trackingStatus?: number; trackingBody?: string; quantityStatus?: number; quantityBody?: string; error?: string }> = [];

    for (const { variantId, sellingPrice, cachedProduct } of validProducts) {
      try {
        const myPrice = parseFloat(sellingPrice);
        const partnerPrice = cachedProduct.price;
        const margin = calculateMargin(partnerPrice, myPrice);
        const mySku = generatePartnerSku(partnerShop, cachedProduct.sku || cachedProduct.partner_variant_id);

        // Create product on OCC's store
        const productInput = buildProductSetInput({
          title: cachedProduct.title,
          vendor: partnerShop.replace('.myshopify.com', ''),
          sku: mySku,
          price: formatPrice(myPrice),
          status: 'ACTIVE',
          imageUrl: cachedProduct.image_url || undefined,
        });

        const response = await fetch(
          `https://${occStoreDomain}/admin/api/2025-01/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': occStoreToken,
            },
            body: JSON.stringify({
              query: PRODUCT_SET_MUTATION,
              variables: {
                input: productInput,
                synchronous: true,
              },
            }),
          }
        );

        if (!response.ok) {
          failed.push({
            title: cachedProduct.title,
            variantId,
            error: "API request failed",
          });
          continue;
        }

        const result = await response.json() as {
          data: ProductSetResult | null;
          errors?: Array<{ message: string }>;
        };

        if (result.errors && result.errors.length > 0) {
          failed.push({
            title: cachedProduct.title,
            variantId,
            error: result.errors.map(e => e.message).join(", "),
          });
          continue;
        }

        if (!result.data?.productSet?.product) {
          failed.push({
            title: cachedProduct.title,
            variantId,
            error: result.data?.productSet?.userErrors?.map(e => e.message).join(", ") || "Unknown error",
          });
          continue;
        }

        const createdProduct = result.data.productSet.product;
        const createdVariant = createdProduct.variants.edges[0]?.node;

        if (!createdVariant) {
          failed.push({
            title: cachedProduct.title,
            variantId,
            error: "Variant creation failed",
          });
          continue;
        }

        // Setup inventory tracking (non-blocking - don't fail the import if this fails)
        const inventoryItemId = createdVariant.inventoryItem?.id;
        const partnerInventoryQty = cachedProduct.inventory_quantity ?? 0;

        // DEBUG: Collect inventory debug info
        const invDebug: typeof inventoryDebugList[0] = {
          title: cachedProduct.title,
          inventoryItemId,
          locationId,
        };

        if (inventoryItemId && locationId) {
          try {
            // Enable tracking
            const trackingResp = await fetch(
              `https://${occStoreDomain}/admin/api/2025-01/graphql.json`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Shopify-Access-Token': occStoreToken,
                },
                body: JSON.stringify({
                  query: INVENTORY_ITEM_UPDATE,
                  variables: {
                    id: inventoryItemId,
                    input: { tracked: true },
                  },
                }),
              }
            );

            const trackingText = await trackingResp.text();
            invDebug.trackingStatus = trackingResp.status;
            invDebug.trackingBody = trackingText;

            // Set quantity
            const quantityResp = await fetch(
              `https://${occStoreDomain}/admin/api/2025-01/graphql.json`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Shopify-Access-Token': occStoreToken,
                },
                body: JSON.stringify({
                  query: INVENTORY_SET_QUANTITIES,
                  variables: {
                    input: {
                      name: "available",
                      reason: "correction",
                      quantities: [
                        {
                          inventoryItemId,
                          locationId,
                          quantity: partnerInventoryQty,
                        },
                      ],
                    },
                  },
                }),
              }
            );

            const quantityText = await quantityResp.text();
            invDebug.quantityStatus = quantityResp.status;
            invDebug.quantityBody = quantityText;
          } catch (invError) {
            invDebug.error = invError instanceof Error ? invError.message : String(invError);
          }
        }

        // Add to debug list
        inventoryDebugList.push(invDebug);

        // Create product mapping
        await createProductMapping({
          partnerId: partner.id,
          partnerShop,
          partnerProductId: cachedProduct.partner_product_id,
          partnerVariantId: cachedProduct.partner_variant_id,
          myProductId: createdProduct.id,
          myVariantId: createdVariant.id,
          partnerSku: cachedProduct.sku,
          mySku,
          partnerPrice,
          myPrice,
          margin,
        });

        // Mark product as seen
        await markPartnerProductSeen(partnerShop, variantId);

        succeeded++;

        // Small delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Bulk import error for ${cachedProduct.title}:`, error);
        failed.push({
          title: cachedProduct.title,
          variantId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const total = productsToImport.length;
    return Response.json({
      success: succeeded > 0,
      intent,
      message: `Imported ${succeeded} of ${total} products`,
      succeeded,
      failed,
      // DEBUG: Include inventory debug info
      bulkInventoryDebug: inventoryDebugList,
    });
  }

  // UNLINK: Remove the product mapping (mark as no longer imported)
  if (intent === "unlink") {
    const partnerVariantId = formData.get("partnerVariantId") as string;

    if (!partnerVariantId) {
      return Response.json({
        success: false,
        intent,
        error: "Missing variant ID",
      } satisfies ActionData);
    }

    const { error: unlinkError } = await unlinkProductMapping(partnerShop, partnerVariantId);

    if (unlinkError) {
      return Response.json({
        success: false,
        intent,
        error: unlinkError,
      } satisfies ActionData);
    }

    return Response.json({
      success: true,
      intent,
      message: "Product unlinked successfully",
    } satisfies ActionData);
  }

  return Response.json({ success: false, intent, error: "Unknown action" } satisfies ActionData);
};

export default function AdminPartnerProducts() {
  const { partnerShop, partnerName, products, lastSyncedAt, error, hasOccCredentials } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();

  // Track active tab
  const [activeTab, setActiveTab] = useState<"imported" | "available" | "unavailable">("imported");

  // Search query state
  const [searchQuery, setSearchQuery] = useState("");

  // Track price inputs for each product
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});

  // Track which product is being removed (for confirmation modal)
  const [removeProduct, setRemoveProduct] = useState<{ variantId: string; title: string } | null>(null);

  // Track which product is selected for the detail modal
  const [selectedProduct, setSelectedProduct] = useState<(PartnerProductRecord & { isImported: boolean; myPrice: number | null }) | null>(null);

  // Bulk import selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkImportResult, setBulkImportResult] = useState<BulkImportResult | null>(null);

  const isLoading = navigation.state === "submitting" || navigation.state === "loading";

  // Filter products by search query (title or SKU)
  const filterBySearch = (productList: typeof products) => {
    if (!searchQuery.trim()) return productList;
    const query = searchQuery.toLowerCase().trim();
    return productList.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        (p.sku && p.sku.toLowerCase().includes(query))
    );
  };

  // Filter products into three groups for tabs (before search)
  const allImportedProducts = products.filter(p => p.isImported && !p.is_deleted);
  const allAvailableProducts = products.filter(p => !p.isImported && !p.is_deleted);
  const allUnavailableProducts = products.filter(p => p.is_deleted);

  // Apply search filter to each group
  const importedProducts = filterBySearch(allImportedProducts);
  const availableProducts = filterBySearch(allAvailableProducts);
  const unavailableProducts = filterBySearch(allUnavailableProducts);

  // Calculate totals for result count display
  const totalFilteredProducts = importedProducts.length + availableProducts.length + unavailableProducts.length;
  const totalAllProducts = allImportedProducts.length + allAvailableProducts.length + allUnavailableProducts.length;
  const isSearchActive = searchQuery.trim().length > 0;

  // Format the last synced time
  const formatLastSynced = (isoString: string | null) => {
    if (!isoString) return "Never synced";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  const handleSync = () => {
    submit({ intent: "sync" }, { method: "post" });
  };

  const handleImport = (variantId: string) => {
    const price = priceInputs[variantId];
    if (!price || parseFloat(price) <= 0) {
      alert("Please enter a valid price");
      return;
    }
    submit(
      { intent: "import", partnerVariantId: variantId, sellingPrice: price },
      { method: "post" }
    );
  };

  const handlePriceChange = (variantId: string, value: string) => {
    setPriceInputs(prev => ({ ...prev, [variantId]: value }));
  };

  const handleRemoveClick = (variantId: string, title: string) => {
    setRemoveProduct({ variantId, title });
  };

  const handleRemoveConfirm = () => {
    if (removeProduct) {
      submit({ intent: "unlink", partnerVariantId: removeProduct.variantId }, { method: "post" });
      setRemoveProduct(null);
    }
  };

  const handleRemoveCancel = () => {
    setRemoveProduct(null);
  };

  const handleProductClick = (product: PartnerProductRecord & { isImported: boolean; myPrice: number | null }) => {
    setSelectedProduct(product);
  };

  const handleModalClose = () => {
    setSelectedProduct(null);
  };

  const handleModalImport = (variantId: string, price: string) => {
    submit(
      { intent: "import", partnerVariantId: variantId, sellingPrice: price },
      { method: "post" }
    );
    setSelectedProduct(null);
  };

  // Bulk import selection handlers
  const handleSelectProduct = (variantId: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(variantId)) {
        next.delete(variantId);
      } else {
        next.add(variantId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    // Get all available product variant IDs (after search filter)
    const availableVariantIds = availableProducts.map(p => p.partner_variant_id);
    const allSelected = availableVariantIds.every(id => selectedProducts.has(id));

    if (allSelected) {
      // Deselect all
      setSelectedProducts(prev => {
        const next = new Set(prev);
        availableVariantIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // Select all
      setSelectedProducts(prev => {
        const next = new Set(prev);
        availableVariantIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleClearSelection = () => {
    setSelectedProducts(new Set());
  };

  // Get count of selected products that have valid prices
  const getImportableCount = () => {
    return Array.from(selectedProducts).filter(variantId => {
      const price = priceInputs[variantId];
      return price && parseFloat(price) > 0;
    }).length;
  };

  const handleBulkImport = () => {
    const productsToImport = Array.from(selectedProducts)
      .filter(variantId => {
        const price = priceInputs[variantId];
        return price && parseFloat(price) > 0;
      })
      .map(variantId => ({
        variantId,
        sellingPrice: priceInputs[variantId],
      }));

    if (productsToImport.length === 0) {
      toast.error("No products with valid prices selected");
      return;
    }

    submit(
      {
        intent: "bulk-import",
        products: JSON.stringify(productsToImport),
      },
      { method: "post" }
    );
  };

  const handleBulkResultClose = () => {
    setBulkImportResult(null);
    // Clear selection for successfully imported products
    if (bulkImportResult) {
      const failedIds = new Set(bulkImportResult.failed.map(f => f.variantId));
      setSelectedProducts(prev => {
        const next = new Set<string>();
        prev.forEach(id => {
          if (failedIds.has(id)) {
            next.add(id);
          }
        });
        return next;
      });
    }
  };

  const handleRetryFailed = () => {
    if (!bulkImportResult || bulkImportResult.failed.length === 0) return;

    const productsToRetry = bulkImportResult.failed
      .filter(({ variantId }) => {
        const price = priceInputs[variantId];
        return price && parseFloat(price) > 0;
      })
      .map(({ variantId }) => ({
        variantId,
        sellingPrice: priceInputs[variantId],
      }));

    if (productsToRetry.length === 0) {
      toast.error("No failed products with valid prices to retry");
      return;
    }

    setBulkImportResult(null);
    submit(
      {
        intent: "bulk-import",
        products: JSON.stringify(productsToRetry),
      },
      { method: "post" }
    );
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  // Show toast when action completes
  useEffect(() => {
    // DEBUG: Log to console (can be copied from browser devtools)
    if (actionData) {
      console.log("=== ACTION DATA (copy from here) ===");
      console.log(JSON.stringify(actionData, null, 2));
      console.log("=== END ACTION DATA ===");

      // Show toast directing user to console
      toast("Debug info logged to browser console (F12)", { icon: "🔍" });
    }

    if (actionData?.intent === "bulk-import") {
      // Handle bulk import results
      if (actionData.succeeded !== undefined && actionData.failed !== undefined) {
        setBulkImportResult({
          succeeded: actionData.succeeded,
          failed: actionData.failed,
        });
      }
    } else if (actionData?.success && actionData?.message) {
      toast.success(actionData.message);
    } else if (!actionData?.success && actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/admin/partners" style={{ color: colors.interactive.link, textDecoration: "none", fontSize: "0.875rem" }}>
          &larr; Back to Partners
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            {partnerName}
          </h1>
          <p style={{ margin: "0.25rem 0 0", color: colors.text.muted, fontSize: "0.875rem" }}>
            {partnerShop}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.875rem", color: colors.text.muted }}>
            Last synced: {formatLastSynced(lastSyncedAt)}
          </span>
          <button
            onClick={handleSync}
            disabled={isLoading}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: isLoading ? colors.interactive.disabled : colors.primary.default,
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
            }}
          >
            {isLoading && navigation.formData?.get("intent") === "sync" ? "Syncing..." : "Refresh Products"}
          </button>
        </div>
      </div>

      {/* Credentials Warning */}
      {!hasOccCredentials && (
        <div style={{
          backgroundColor: colors.warning.light,
          border: "1px solid colors.warning.border",
          color: colors.warning.text,
          padding: "1rem",
          borderRadius: "4px",
          marginBottom: "1rem",
        }}>
          <strong>Store Connection Required:</strong>{" "}
          <a href="/admin/connect-store" style={{ color: colors.warning.text }}>
            Connect your parent store
          </a>{" "}
          to enable product imports.
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{
          backgroundColor: colors.error.light,
          border: "1px solid colors.error.border",
          color: colors.error.text,
          padding: "1rem",
          borderRadius: "4px",
          marginBottom: "1rem",
        }}>
          {error}
        </div>
      )}

      {/* Toast notifications */}
      <Toaster position="top-right" />

      {/* Search Box */}
      {products.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ position: "relative" }}>
            {/* Search Icon */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.icon.muted}
              strokeWidth="2"
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by name or SKU..."
              style={{
                width: "100%",
                padding: "0.75rem 2.5rem 0.75rem 2.5rem",
                border: `1px solid ${colors.border.default}`,
                borderRadius: "4px",
                fontSize: "0.875rem",
                boxSizing: "border-box",
              }}
            />
            {/* Clear Button */}
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: colors.icon.muted,
                }}
                title="Clear search"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          {/* Result Count */}
          {isSearchActive && (
            <p style={{
              margin: "0.5rem 0 0",
              fontSize: "0.875rem",
              color: colors.text.muted,
            }}>
              Showing {totalFilteredProducts} of {totalAllProducts} products
            </p>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      {products.length > 0 && (
        <div style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}>
          <button
            onClick={() => setActiveTab("imported")}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: activeTab === "imported" ? colors.primary.default : colors.background.muted,
              color: activeTab === "imported" ? colors.text.inverse : colors.text.secondary,
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Imported ({importedProducts.length})
          </button>
          <button
            onClick={() => setActiveTab("available")}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: activeTab === "available" ? colors.primary.default : colors.background.muted,
              color: activeTab === "available" ? colors.text.inverse : colors.text.secondary,
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Available ({availableProducts.length})
          </button>
          <button
            onClick={() => setActiveTab("unavailable")}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: activeTab === "unavailable" ? colors.primary.default : colors.background.muted,
              color: activeTab === "unavailable" ? colors.text.inverse : colors.text.secondary,
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Unavailable ({unavailableProducts.length})
          </button>
        </div>
      )}

      {/* Empty State */}
      {!error && products.length === 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "3rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          textAlign: "center",
        }}>
          <p style={{ color: colors.text.muted, marginBottom: "1rem" }}>No products cached yet.</p>
          <button
            onClick={handleSync}
            disabled={isLoading}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: isLoading ? colors.interactive.disabled : colors.primary.default,
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            Sync Products from Partner
          </button>
        </div>
      )}

      {/* Bulk Action Bar - Available tab only */}
      {activeTab === "available" && availableProducts.length > 0 && (
        <div style={{
          backgroundColor: colors.background.subtle,
          padding: "0.75rem 1rem",
          borderRadius: "4px",
          marginBottom: "1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          border: `1px solid ${colors.border.default}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={availableProducts.length > 0 && availableProducts.every(p => selectedProducts.has(p.partner_variant_id))}
                onChange={handleSelectAll}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                Select All ({availableProducts.length})
              </span>
            </label>
            {selectedProducts.size > 0 && (
              <button
                onClick={handleClearSelection}
                style={{
                  padding: "0.25rem 0.5rem",
                  backgroundColor: "transparent",
                  color: colors.text.muted,
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  textDecoration: "underline",
                }}
              >
                Clear selection
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontSize: "0.75rem", color: colors.text.muted }}>
              Enter a price for each product before bulk importing
            </span>
            <button
              onClick={handleBulkImport}
              disabled={isLoading || getImportableCount() === 0 || !hasOccCredentials}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: (isLoading || getImportableCount() === 0 || !hasOccCredentials)
                  ? colors.interactive.disabled
                  : colors.success.default,
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: (isLoading || getImportableCount() === 0 || !hasOccCredentials) ? "not-allowed" : "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              {isLoading && navigation.formData?.get("intent") === "bulk-import"
                ? "Importing..."
                : `Import Selected (${getImportableCount()})`}
            </button>
          </div>
        </div>
      )}

      {/* Available Products Tab */}
      {activeTab === "available" && availableProducts.length > 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {availableProducts.map(product => (
              <div
                key={product.id}
                role="button"
                tabIndex={0}
                onClick={() => handleProductClick(product)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleProductClick(product);
                  }
                }}
                style={{
                  padding: "1rem",
                  border: "1px solid colors.border.default",
                  borderRadius: "4px",
                  cursor: "pointer",
                  transition: "background-color 0.15s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = colors.background.hover;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "";
                }}
                onFocus={(e) => {
                  e.currentTarget.style.backgroundColor = colors.background.hover;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.backgroundColor = "";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                  {/* Selection Checkbox */}
                  <div
                    role="presentation"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      paddingTop: "1.25rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProducts.has(product.partner_variant_id)}
                      onChange={() => handleSelectProduct(product.partner_variant_id)}
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                      title={selectedProducts.has(product.partner_variant_id) ? "Deselect product" : "Select product for bulk import"}
                    />
                  </div>
                  {/* Product Image */}
                  <div style={{
                    width: "64px",
                    height: "64px",
                    flexShrink: 0,
                    backgroundColor: colors.background.muted,
                    borderRadius: "4px",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.interactive.disabled} strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      {product.is_new && (
                        <span style={{
                          backgroundColor: colors.info.light,
                          color: colors.interactive.link,
                          padding: "0.125rem 0.5rem",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}>
                          New
                        </span>
                      )}
                      <span style={{ fontWeight: 500 }}>{product.title}</span>
                      {product.handle && (
                        <a
                          href={`https://${product.partner_shop}/products/${product.handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View on partner store"
                          style={{
                            color: colors.text.light,
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      )}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
                      Partner Price: ${product.price.toFixed(2)}
                      {product.sku && ` | SKU: ${product.sku}`}
                      {product.inventory_quantity !== null && ` | Stock: ${product.inventory_quantity}`}
                    </div>
                  </div>
                  <div role="presentation" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <div>
                      <label htmlFor={`price-${product.partner_variant_id}`} style={{ fontSize: "0.75rem", color: colors.text.muted }}>
                        Your Price
                      </label>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ marginRight: "0.25rem" }}>$</span>
                        <input
                          id={`price-${product.partner_variant_id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={priceInputs[product.partner_variant_id] || ""}
                          onChange={(e) => handlePriceChange(product.partner_variant_id, e.target.value)}
                          placeholder="0.00"
                          style={{
                            width: "80px",
                            padding: "0.5rem",
                            border: "1px solid colors.border.strong",
                            borderRadius: "4px",
                            fontSize: "0.875rem",
                          }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleImport(product.partner_variant_id)}
                      disabled={isLoading || !priceInputs[product.partner_variant_id] || !hasOccCredentials}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: (isLoading || !priceInputs[product.partner_variant_id] || !hasOccCredentials) ? colors.interactive.disabled : colors.success.default,
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: (isLoading || !priceInputs[product.partner_variant_id] || !hasOccCredentials) ? "not-allowed" : "pointer",
                        fontSize: "0.875rem",
                        marginTop: "1.25rem",
                      }}
                    >
                      Import
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Imported Products Tab */}
      {activeTab === "imported" && importedProducts.length > 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {importedProducts.map(product => (
              <div
                key={product.id}
                role="button"
                tabIndex={0}
                onClick={() => handleProductClick(product)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleProductClick(product);
                  }
                }}
                style={{
                  padding: "1rem",
                  border: "1px solid colors.border.default",
                  borderRadius: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  cursor: "pointer",
                  transition: "background-color 0.15s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = colors.background.hover;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "";
                }}
                onFocus={(e) => {
                  e.currentTarget.style.backgroundColor = colors.background.hover;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.backgroundColor = "";
                }}
              >
                {/* Product Image */}
                <div style={{
                  width: "48px",
                  height: "48px",
                  flexShrink: 0,
                  backgroundColor: colors.background.muted,
                  borderRadius: "4px",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.title}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.interactive.disabled} strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                    {product.title}
                    {product.handle && (
                      <a
                        href={`https://${product.partner_shop}/products/${product.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View on partner store"
                        style={{
                          color: colors.text.light,
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
                    Partner: ${product.price.toFixed(2)} &rarr; Your Store: ${product.myPrice?.toFixed(2)}
                  </div>
                </div>
                <div role="presentation" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <span style={{
                    backgroundColor: colors.success.light,
                    color: colors.success.text,
                    padding: "0.25rem 0.75rem",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                  }}>
                    Imported
                  </span>
                  <button
                    onClick={() => handleRemoveClick(product.partner_variant_id, product.title)}
                    disabled={isLoading}
                    style={{
                      padding: "0.25rem 0.5rem",
                      backgroundColor: "transparent",
                      color: colors.error.text,
                      border: "1px solid colors.error.border",
                      borderRadius: "4px",
                      cursor: isLoading ? "not-allowed" : "pointer",
                      fontSize: "0.75rem",
                    }}
                    title="Remove this product from imported list"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unavailable Products Tab (soft-deleted) */}
      {activeTab === "unavailable" && unavailableProducts.length > 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <p style={{ fontSize: "0.875rem", color: colors.text.muted, marginBottom: "1rem" }}>
            These products are no longer available from the partner store. They may have been deleted or unpublished.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {unavailableProducts.map(product => (
              <div
                key={product.id}
                style={{
                  padding: "1rem",
                  border: "1px solid colors.border.default",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  opacity: 0.7,
                }}
              >
                {/* Product Image */}
                <div style={{
                  width: "48px",
                  height: "48px",
                  flexShrink: 0,
                  backgroundColor: colors.background.muted,
                  borderRadius: "4px",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.title}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        filter: "grayscale(50%)",
                      }}
                    />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.interactive.disabled} strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>
                    {product.title}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
                    Last Price: ${product.price.toFixed(2)}
                    {product.sku && ` | SKU: ${product.sku}`}
                  </div>
                </div>
                <span style={{
                  backgroundColor: colors.error.light,
                  color: colors.error.text,
                  padding: "0.25rem 0.75rem",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}>
                  Unavailable
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty States for Each Tab */}
      {activeTab === "imported" && importedProducts.length === 0 && products.length > 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "2rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          textAlign: "center",
        }}>
          <p style={{ color: colors.text.muted, margin: 0 }}>
            {isSearchActive
              ? `No imported products match "${searchQuery}"`
              : "No products imported yet. Check the Available tab to import products."}
          </p>
        </div>
      )}

      {activeTab === "available" && availableProducts.length === 0 && products.length > 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "2rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          textAlign: "center",
        }}>
          <p style={{ color: colors.text.muted, margin: 0 }}>
            {isSearchActive
              ? `No available products match "${searchQuery}"`
              : "All products have been imported or are unavailable."}
          </p>
        </div>
      )}

      {activeTab === "unavailable" && unavailableProducts.length === 0 && products.length > 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "2rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          textAlign: "center",
        }}>
          <p style={{ color: colors.text.muted, margin: 0 }}>
            {isSearchActive
              ? `No unavailable products match "${searchQuery}"`
              : "No unavailable products. All partner products are currently accessible."}
          </p>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {removeProduct && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "1.5rem",
            maxWidth: "400px",
            width: "90%",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.125rem", fontWeight: 600 }}>
              Remove Product
            </h3>
            <p style={{ margin: "0 0 1.5rem", color: colors.text.muted, fontSize: "0.875rem" }}>
              Are you sure you want to remove <strong>{removeProduct.title}</strong> from your imported products?
              It will appear as available for import again.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                onClick={handleRemoveCancel}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "white",
                  color: colors.text.secondary,
                  border: "1px solid colors.border.strong",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveConfirm}
                disabled={isLoading}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: colors.error.default,
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                }}
              >
                {isLoading ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        isOpen={!!selectedProduct}
        product={selectedProduct}
        onClose={handleModalClose}
        onImport={handleModalImport}
        priceValue={selectedProduct ? (priceInputs[selectedProduct.partner_variant_id] || "") : ""}
        onPriceChange={(value) => {
          if (selectedProduct) {
            handlePriceChange(selectedProduct.partner_variant_id, value);
          }
        }}
        isLoading={isLoading}
        hasOccCredentials={hasOccCredentials}
      />

      {/* Bulk Import Results Modal */}
      {bulkImportResult && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "1.5rem",
            maxWidth: "500px",
            width: "90%",
            maxHeight: "80vh",
            overflow: "auto",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.25rem", fontWeight: 600 }}>
              Bulk Import Results
            </h3>

            {/* Success Count */}
            {bulkImportResult.succeeded > 0 && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem",
                backgroundColor: colors.success.light,
                borderRadius: "4px",
                marginBottom: "1rem",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.success.textDark} strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span style={{ color: colors.success.textDark, fontWeight: 500 }}>
                  Successfully imported: {bulkImportResult.succeeded} product{bulkImportResult.succeeded !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Failures */}
            {bulkImportResult.failed.length > 0 && (
              <div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                  color: colors.error.textDark,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <span style={{ fontWeight: 500 }}>
                    Failed to import: {bulkImportResult.failed.length} product{bulkImportResult.failed.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: "4px",
                  overflow: "hidden",
                  marginBottom: "1rem",
                }}>
                  {bulkImportResult.failed.map((item, index) => (
                    <div
                      key={item.variantId}
                      style={{
                        padding: "0.75rem",
                        borderBottom: index < bulkImportResult.failed.length - 1 ? `1px solid ${colors.border.default}` : "none",
                        backgroundColor: colors.error.light,
                      }}
                    >
                      <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: colors.error.textDark }}>
                        Error: {item.error}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              {bulkImportResult.failed.length > 0 && (
                <button
                  onClick={handleRetryFailed}
                  disabled={isLoading}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "white",
                    color: colors.primary.default,
                    border: `1px solid ${colors.primary.default}`,
                    borderRadius: "4px",
                    cursor: isLoading ? "not-allowed" : "pointer",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                  }}
                >
                  Retry Failed ({bulkImportResult.failed.length})
                </button>
              )}
              <button
                onClick={handleBulkResultClose}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: colors.primary.default,
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
