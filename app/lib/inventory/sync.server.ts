/**
 * Inventory Sync Service
 *
 * Syncs inventory quantities from partner stores to the OCC retail store.
 * Only operates on products that have been imported (active rows in product_mappings).
 *
 * Flow:
 * 1. Get valid owner store token (fail early if not connected or no locationId)
 * 2. Fetch active product mappings from DB
 * 3. Group mappings by partner_shop
 * 4. For each partner:
 *    a. Get partner credentials
 *    b. Batch-fetch partner variant inventory quantities (250 per request)
 *    c. Batch-resolve OCC variant IDs to inventory item IDs (250 per request)
 *    d. Set quantities on OCC store (batches of 10, ignoreCompareQuantity: true)
 *    e. Log results to sync_logs table
 * 5. Return aggregated results
 */

import { getValidOwnerStoreToken } from "~/lib/ownerStore.server";
import {
  getActiveProductMappings,
  getPartnerByShop,
  createSyncLogReturningId,
  updateSyncLogById,
  type ActiveProductMapping,
} from "~/lib/supabase.server";
import {
  VARIANT_INVENTORY_QUERY,
  VARIANT_INVENTORY_ITEMS_QUERY,
  INVENTORY_SET_QUANTITIES_MUTATION,
  type VariantInventoryQueryResult,
  type VariantInventoryItemsQueryResult,
  type InventorySetQuantitiesResult,
} from "~/lib/shopify/queries/inventory";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PartnerSyncResult {
  partnerShop: string;
  success: boolean;
  itemsProcessed: number;
  itemsUpdated: number;
  itemsFailed: number;
  itemsSkipped: number;
  errors: string[];
}

export interface InventorySyncResult {
  success: boolean;
  partnersProcessed: number;
  totalItemsProcessed: number;
  totalItemsUpdated: number;
  totalItemsFailed: number;
  totalItemsSkipped: number;
  errors: string[];
  partnerResults: PartnerSyncResult[];
}

interface InventoryUpdate {
  inventoryItemId: string;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHOPIFY_API_VERSION = "2025-01";
const NODES_BATCH_SIZE = 250; // Shopify nodes() limit
const WRITE_BATCH_SIZE = 10; // Small write batches to reduce blast radius
const API_DELAY_MS = 100; // Rate limiting delay between API calls

// ---------------------------------------------------------------------------
// Generic Shopify GraphQL fetch wrapper
// ---------------------------------------------------------------------------

async function shopifyGraphQL<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
      }
    );

    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const result = (await response.json()) as { data: T; errors?: Array<{ message: string }> };

    if (result.errors?.length) {
      return { data: null, error: result.errors.map((e) => e.message).join("; ") };
    }

    return { data: result.data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown GraphQL error",
    };
  }
}

// ---------------------------------------------------------------------------
// Helper: delay for rate limiting
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Helper: chunk an array into batches
// ---------------------------------------------------------------------------

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Fetch partner variant inventory quantities
// ---------------------------------------------------------------------------

async function fetchPartnerInventory(
  shop: string,
  accessToken: string,
  variantIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const batches = chunk(variantIds, NODES_BATCH_SIZE);

  for (const batch of batches) {
    const { data, error } = await shopifyGraphQL<VariantInventoryQueryResult>(
      shop,
      accessToken,
      VARIANT_INVENTORY_QUERY,
      { ids: batch }
    );

    if (error) {
      console.error(`[inventory-sync] Error fetching partner inventory from ${shop}:`, error);
      continue;
    }

    if (data?.nodes) {
      for (const node of data.nodes) {
        if (node?.id && node.inventoryQuantity != null) {
          result.set(node.id, node.inventoryQuantity);
        }
      }
    }

    if (batches.length > 1) await delay(API_DELAY_MS);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Resolve OCC variant IDs → inventory item IDs
// ---------------------------------------------------------------------------

async function resolveInventoryItemIds(
  shop: string,
  accessToken: string,
  variantIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const batches = chunk(variantIds, NODES_BATCH_SIZE);

  for (const batch of batches) {
    const { data, error } = await shopifyGraphQL<VariantInventoryItemsQueryResult>(
      shop,
      accessToken,
      VARIANT_INVENTORY_ITEMS_QUERY,
      { ids: batch }
    );

    if (error) {
      console.error(`[inventory-sync] Error resolving inventory item IDs from ${shop}:`, error);
      continue;
    }

    if (data?.nodes) {
      for (const node of data.nodes) {
        if (node?.id && node.inventoryItem?.id) {
          result.set(node.id, node.inventoryItem.id);
        }
      }
    }

    if (batches.length > 1) await delay(API_DELAY_MS);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Set inventory quantities on OCC store
// ---------------------------------------------------------------------------

async function setInventoryQuantities(
  shop: string,
  accessToken: string,
  locationId: string,
  updates: InventoryUpdate[]
): Promise<{ updated: number; failed: number; errors: string[] }> {
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  const batches = chunk(updates, WRITE_BATCH_SIZE);

  for (const batch of batches) {
    const input = {
      // DEPRECATION NOTE: ignoreCompareQuantity is deprecated in Shopify API 2025-01
      // and will be removed in 2026-04. When upgrading the API version, replace with
      // changeFromQuantity: null on each quantity input, and add @idempotent directive.
      ignoreCompareQuantity: true,
      reason: "correction",
      name: "available",
      quantities: batch.map((u) => ({
        inventoryItemId: u.inventoryItemId,
        locationId,
        quantity: u.quantity,
      })),
    };

    const { data, error } = await shopifyGraphQL<InventorySetQuantitiesResult>(
      shop,
      accessToken,
      INVENTORY_SET_QUANTITIES_MUTATION,
      { input }
    );

    if (error) {
      failed += batch.length;
      errors.push(`Batch write error: ${error}`);
      continue;
    }

    const userErrors = data?.inventorySetQuantities?.userErrors ?? [];
    if (userErrors.length > 0) {
      failed += batch.length;
      errors.push(...userErrors.map((e) => `${e.field.join(".")}: ${e.message}`));
    } else {
      updated += batch.length;
    }

    if (batches.length > 1) await delay(API_DELAY_MS);
  }

  return { updated, failed, errors };
}

// ---------------------------------------------------------------------------
// Sync a single partner's inventory
// ---------------------------------------------------------------------------

async function syncPartnerInventory(
  partnerShop: string,
  partnerAccessToken: string,
  occShop: string,
  occAccessToken: string,
  locationId: string,
  mappings: ActiveProductMapping[]
): Promise<PartnerSyncResult> {
  const result: PartnerSyncResult = {
    partnerShop,
    success: true,
    itemsProcessed: mappings.length,
    itemsUpdated: 0,
    itemsFailed: 0,
    itemsSkipped: 0,
    errors: [],
  };

  // Step 1: Fetch partner inventory quantities
  const partnerVariantIds = mappings.map((m) => m.partner_variant_id);
  const partnerInventory = await fetchPartnerInventory(
    partnerShop,
    partnerAccessToken,
    partnerVariantIds
  );

  // Step 2: Resolve OCC variant IDs → inventory item IDs
  const occVariantIds = mappings.map((m) => m.my_variant_id);
  const inventoryItemMap = await resolveInventoryItemIds(
    occShop,
    occAccessToken,
    occVariantIds
  );

  // Step 3: Build update list
  const updates: InventoryUpdate[] = [];

  for (const mapping of mappings) {
    const partnerQty = partnerInventory.get(mapping.partner_variant_id);
    const inventoryItemId = inventoryItemMap.get(mapping.my_variant_id);

    if (partnerQty == null) {
      result.itemsSkipped++;
      continue;
    }

    if (!inventoryItemId) {
      result.itemsSkipped++;
      result.errors.push(
        `Could not resolve inventory item for OCC variant ${mapping.my_variant_id}`
      );
      continue;
    }

    updates.push({ inventoryItemId, quantity: partnerQty });
  }

  if (updates.length === 0) {
    return result;
  }

  // Step 4: Set quantities on OCC store
  const writeResult = await setInventoryQuantities(
    occShop,
    occAccessToken,
    locationId,
    updates
  );

  result.itemsUpdated = writeResult.updated;
  result.itemsFailed = writeResult.failed;
  result.errors.push(...writeResult.errors);

  if (writeResult.failed > 0) {
    result.success = false;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main entry point: run inventory sync
// ---------------------------------------------------------------------------

export async function runInventorySync(
  options?: { partnerShop?: string }
): Promise<InventorySyncResult> {
  const aggregated: InventorySyncResult = {
    success: true,
    partnersProcessed: 0,
    totalItemsProcessed: 0,
    totalItemsUpdated: 0,
    totalItemsFailed: 0,
    totalItemsSkipped: 0,
    errors: [],
    partnerResults: [],
  };

  // 1. Get valid owner store token — fail early
  const tokenResult = await getValidOwnerStoreToken();

  if (tokenResult.status !== "connected" || !tokenResult.accessToken) {
    aggregated.success = false;
    aggregated.errors.push(
      `Owner store not connected: ${tokenResult.error || tokenResult.status}`
    );
    return aggregated;
  }

  if (!tokenResult.locationId) {
    aggregated.success = false;
    aggregated.errors.push(
      "Owner store location ID not available. Refresh the store connection."
    );
    return aggregated;
  }

  const occShop = tokenResult.shop!;
  const occToken = tokenResult.accessToken;
  const locationId = tokenResult.locationId;

  // 2. Fetch active product mappings
  const { data: mappings, error: mappingsError } = await getActiveProductMappings(
    options?.partnerShop
  );

  if (mappingsError) {
    aggregated.success = false;
    aggregated.errors.push(`Failed to fetch product mappings: ${mappingsError}`);
    return aggregated;
  }

  if (mappings.length === 0) {
    return aggregated; // Nothing to sync
  }

  // 3. Group mappings by partner shop
  const byPartner = new Map<string, ActiveProductMapping[]>();
  for (const mapping of mappings) {
    const existing = byPartner.get(mapping.partner_shop) || [];
    existing.push(mapping);
    byPartner.set(mapping.partner_shop, existing);
  }

  // 4. Process each partner
  for (const [partnerShop, partnerMappings] of byPartner) {
    // Get partner credentials
    const { data: partner } = await getPartnerByShop(partnerShop);

    if (!partner || !partner.is_active || partner.is_deleted || !partner.access_token) {
      aggregated.errors.push(`Skipping ${partnerShop}: inactive or missing credentials`);
      continue;
    }

    // Create sync log entry (status: started)
    const { id: syncLogId } = await createSyncLogReturningId({
      partnerId: partner.id,
      syncType: "inventory",
      status: "started",
      itemsProcessed: partnerMappings.length,
    });

    // Run sync for this partner
    const partnerResult = await syncPartnerInventory(
      partnerShop,
      partner.access_token,
      occShop,
      occToken,
      locationId,
      partnerMappings
    );

    // Update sync log with results
    if (syncLogId) {
      await updateSyncLogById(syncLogId, {
        status: partnerResult.success ? "completed" : "failed",
        itemsProcessed: partnerResult.itemsProcessed,
        itemsUpdated: partnerResult.itemsUpdated,
        itemsFailed: partnerResult.itemsFailed,
        errorMessage: partnerResult.errors.length > 0
          ? partnerResult.errors.join("; ")
          : undefined,
        completedAt: new Date().toISOString(),
      });
    }

    // Aggregate results
    aggregated.partnersProcessed++;
    aggregated.totalItemsProcessed += partnerResult.itemsProcessed;
    aggregated.totalItemsUpdated += partnerResult.itemsUpdated;
    aggregated.totalItemsFailed += partnerResult.itemsFailed;
    aggregated.totalItemsSkipped += partnerResult.itemsSkipped;
    aggregated.errors.push(...partnerResult.errors);
    aggregated.partnerResults.push(partnerResult);

    if (!partnerResult.success) {
      aggregated.success = false;
    }
  }

  return aggregated;
}
