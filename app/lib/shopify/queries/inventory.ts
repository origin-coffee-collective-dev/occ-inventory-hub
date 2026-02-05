/**
 * GraphQL queries and mutation for inventory sync.
 *
 * Uses Shopify's `nodes(ids: [ID!]!)` endpoint for efficient batch lookups
 * (up to 250 IDs per request).
 */

// ---------------------------------------------------------------------------
// Query 1: Fetch inventory quantities from a partner store
// Sent to the PARTNER store. Given variant GIDs, returns inventoryQuantity.
// ---------------------------------------------------------------------------

export const VARIANT_INVENTORY_QUERY = `
  query getVariantInventory($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryQuantity
      }
    }
  }
`;

export interface VariantInventoryNode {
  id: string;
  inventoryQuantity: number | null;
}

export interface VariantInventoryQueryResult {
  nodes: Array<VariantInventoryNode | null>;
}

// ---------------------------------------------------------------------------
// Query 2: Resolve OCC variant IDs → inventory item IDs
// Sent to the OCC store. Given variant GIDs, returns inventoryItem.id.
// ---------------------------------------------------------------------------

export const VARIANT_INVENTORY_ITEMS_QUERY = `
  query getVariantInventoryItems($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryItem {
          id
        }
      }
    }
  }
`;

export interface VariantInventoryItemNode {
  id: string;
  inventoryItem: {
    id: string;
  };
}

export interface VariantInventoryItemsQueryResult {
  nodes: Array<VariantInventoryItemNode | null>;
}

// ---------------------------------------------------------------------------
// Mutation: Set inventory quantities on the OCC store
// Uses ignoreCompareQuantity: true (partner always wins).
//
// DEPRECATION NOTE (Shopify API 2025-01):
// `ignoreCompareQuantity` is deprecated and will be removed in 2026-04.
// When upgrading the API version, replace with `changeFromQuantity: null`
// on each InventoryQuantityInput, and add an `@idempotent` directive.
// ---------------------------------------------------------------------------

export const INVENTORY_SET_QUANTITIES_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup {
        createdAt
        reason
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export interface InventorySetQuantitiesResult {
  inventorySetQuantities: {
    inventoryAdjustmentGroup: {
      createdAt: string;
      reason: string;
    } | null;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}
