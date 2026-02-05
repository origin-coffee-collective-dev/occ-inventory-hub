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
 *    b. Batch-fetch partner variant inventory quantities (250 per request) with retry
 *    c. Batch-resolve OCC variant IDs to inventory item IDs (250 per request) with retry
 *    d. Set quantities on OCC store (batches of 10, ignoreCompareQuantity: true)
 *    e. Classify errors and detect critical failures
 *    f. Update partner sync status in database
 *    g. Send email alert if critical failure detected
 *    h. Log results to sync_logs table
 * 5. Return aggregated results
 */

import { getValidOwnerStoreToken } from "~/lib/ownerStore.server";
import {
  getActiveProductMappings,
  getPartnerByShop,
  createSyncLogReturningId,
  updateSyncLogById,
  updatePartnerSyncStatus,
  getPartnerConsecutiveFailures,
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
import { fetchWithRetry, type RetryResult } from "./retry.server";
import {
  determineSyncStatus,
  detectCriticalFailure,
  createOwnerStoreDisconnectedError,
  calculateConsecutiveFailures,
} from "./errors.server";
import { sendAlertEmail, isEmailConfigured } from "~/lib/email/email.server";
import { buildSyncFailureEmail } from "~/lib/email/templates.server";
import type { SyncErrorType, CriticalSyncError } from "~/types/database";

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
  // Error classification for critical failure detection
  errorType: SyncErrorType | null;
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

interface GraphQLResult<T> {
  data: T | null;
  error: string | null;
  httpStatus: number | null;
}

async function shopifyGraphQL<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLResult<T>> {
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
      return {
        data: null,
        error: `HTTP ${response.status}: ${response.statusText}`,
        httpStatus: response.status,
      };
    }

    const result = (await response.json()) as { data: T; errors?: Array<{ message: string }> };

    if (result.errors?.length) {
      // Check for auth-related errors in GraphQL response
      const errorMessage = result.errors.map((e) => e.message).join("; ");
      return { data: null, error: errorMessage, httpStatus: response.status };
    }

    return { data: result.data, error: null, httpStatus: response.status };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown GraphQL error",
      httpStatus: null,
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
// Fetch partner variant inventory quantities (with retry)
// ---------------------------------------------------------------------------

interface FetchInventoryResult {
  inventory: Map<string, number>;
  errors: string[];
  errorType: SyncErrorType | null;
}

async function fetchPartnerInventory(
  shop: string,
  accessToken: string,
  variantIds: string[]
): Promise<FetchInventoryResult> {
  const inventory = new Map<string, number>();
  const errors: string[] = [];
  let errorType: SyncErrorType | null = null;
  const batches = chunk(variantIds, NODES_BATCH_SIZE);

  for (const batch of batches) {
    // Use retry wrapper for each batch
    const retryResult: RetryResult<VariantInventoryQueryResult> = await fetchWithRetry(
      async () => {
        const result = await shopifyGraphQL<VariantInventoryQueryResult>(
          shop,
          accessToken,
          VARIANT_INVENTORY_QUERY,
          { ids: batch }
        );
        return result;
      }
    );

    if (retryResult.error) {
      console.error(`[inventory-sync] Error fetching partner inventory from ${shop}:`, retryResult.error);
      errors.push(`Partner fetch error: ${retryResult.error}`);
      // Keep track of error type for critical failure detection
      if (retryResult.errorType) {
        errorType = retryResult.errorType;
      }
      continue;
    }

    if (retryResult.data?.nodes) {
      for (const node of retryResult.data.nodes) {
        if (node?.id && node.inventoryQuantity != null) {
          inventory.set(node.id, node.inventoryQuantity);
        }
      }
    }

    if (batches.length > 1) await delay(API_DELAY_MS);
  }

  return { inventory, errors, errorType };
}

// ---------------------------------------------------------------------------
// Resolve OCC variant IDs → inventory item IDs (with retry)
// ---------------------------------------------------------------------------

interface ResolveInventoryItemsResult {
  itemMap: Map<string, string>;
  errors: string[];
}

async function resolveInventoryItemIds(
  shop: string,
  accessToken: string,
  variantIds: string[]
): Promise<ResolveInventoryItemsResult> {
  const itemMap = new Map<string, string>();
  const errors: string[] = [];
  const batches = chunk(variantIds, NODES_BATCH_SIZE);

  for (const batch of batches) {
    // Use retry wrapper for each batch
    const retryResult: RetryResult<VariantInventoryItemsQueryResult> = await fetchWithRetry(
      async () => {
        const result = await shopifyGraphQL<VariantInventoryItemsQueryResult>(
          shop,
          accessToken,
          VARIANT_INVENTORY_ITEMS_QUERY,
          { ids: batch }
        );
        return result;
      }
    );

    if (retryResult.error) {
      console.error(`[inventory-sync] Error resolving inventory item IDs from ${shop}:`, retryResult.error);
      errors.push(`Resolve error: ${retryResult.error}`);
      continue;
    }

    if (retryResult.data?.nodes) {
      for (const node of retryResult.data.nodes) {
        if (node?.id && node.inventoryItem?.id) {
          itemMap.set(node.id, node.inventoryItem.id);
        }
      }
    }

    if (batches.length > 1) await delay(API_DELAY_MS);
  }

  return { itemMap, errors };
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
    errorType: null,
  };

  // Step 1: Fetch partner inventory quantities (with retry)
  const partnerVariantIds = mappings.map((m) => m.partner_variant_id);
  const fetchResult = await fetchPartnerInventory(
    partnerShop,
    partnerAccessToken,
    partnerVariantIds
  );

  result.errors.push(...fetchResult.errors);
  if (fetchResult.errorType) {
    result.errorType = fetchResult.errorType;
  }

  // If we couldn't fetch any inventory data due to auth error, fail fast
  if (fetchResult.errorType === "auth_revoked" && fetchResult.inventory.size === 0) {
    result.success = false;
    return result;
  }

  // Step 2: Resolve OCC variant IDs → inventory item IDs (with retry)
  const occVariantIds = mappings.map((m) => m.my_variant_id);
  const resolveResult = await resolveInventoryItemIds(
    occShop,
    occAccessToken,
    occVariantIds
  );

  result.errors.push(...resolveResult.errors);

  // Step 3: Build update list
  const updates: InventoryUpdate[] = [];

  for (const mapping of mappings) {
    const partnerQty = fetchResult.inventory.get(mapping.partner_variant_id);
    const inventoryItemId = resolveResult.itemMap.get(mapping.my_variant_id);

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
// Helper: Send critical failure email alert
// ---------------------------------------------------------------------------

async function sendCriticalFailureAlert(error: CriticalSyncError): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn("[inventory-sync] Email not configured - skipping critical failure alert");
    return;
  }

  try {
    const { subject, html, text } = buildSyncFailureEmail(error);
    const result = await sendAlertEmail({ subject, html, text });

    if (result.success) {
      console.log(`[inventory-sync] Critical failure alert sent for ${error.partnerShop}`);
    } else {
      console.error(`[inventory-sync] Failed to send critical failure alert: ${result.error}`);
    }
  } catch (err) {
    console.error("[inventory-sync] Exception sending critical failure alert:", err);
  }
}

// ---------------------------------------------------------------------------
// Main entry point: run inventory sync
// ---------------------------------------------------------------------------

/**
 * Sync a single partner's inventory.
 * This is a convenience wrapper around runInventorySync for UI-triggered per-partner sync.
 */
export async function syncSinglePartner(
  partnerShop: string
): Promise<PartnerSyncResult | null> {
  const result = await runInventorySync({ partnerShop });

  // Return the first partner result (should only be one when filtering by partnerShop)
  return result.partnerResults[0] || null;
}

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
    const errorMsg = `Owner store not connected: ${tokenResult.error || tokenResult.status}`;
    aggregated.errors.push(errorMsg);

    // Send critical failure alert for owner store disconnection
    const criticalError = createOwnerStoreDisconnectedError(errorMsg);
    await sendCriticalFailureAlert(criticalError);

    return aggregated;
  }

  if (!tokenResult.locationId) {
    aggregated.success = false;
    const errorMsg = "Owner store location ID not available. Refresh the store connection.";
    aggregated.errors.push(errorMsg);

    // Send critical failure alert for owner store configuration issue
    const criticalError = createOwnerStoreDisconnectedError(errorMsg);
    await sendCriticalFailureAlert(criticalError);

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

    // Get previous consecutive failures for this partner
    const { count: previousConsecutiveFailures } = await getPartnerConsecutiveFailures(partnerShop);

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

    // Determine sync status and calculate new consecutive failures
    const syncStatus = determineSyncStatus(partnerResult);
    const newConsecutiveFailures = calculateConsecutiveFailures(
      previousConsecutiveFailures,
      partnerResult.success
    );

    // Update partner sync status in database
    await updatePartnerSyncStatus(partnerShop, syncStatus, newConsecutiveFailures);

    // Check for critical failure and send email alert
    const criticalError = detectCriticalFailure(
      partnerShop,
      partnerResult,
      previousConsecutiveFailures,
      partnerResult.errorType
    );

    if (criticalError) {
      console.warn(`[inventory-sync] Critical failure detected for ${partnerShop}:`, criticalError.type);
      await sendCriticalFailureAlert(criticalError);
    }

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
