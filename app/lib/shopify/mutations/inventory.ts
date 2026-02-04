/**
 * GraphQL mutations for inventory management
 */

// Enable inventory tracking on an inventory item
export const INVENTORY_ITEM_UPDATE = `
  mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem {
        id
        tracked
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export interface InventoryItemUpdateResult {
  inventoryItemUpdate: {
    inventoryItem: {
      id: string;
      tracked: boolean;
    } | null;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}

// Set inventory quantities at a location
//
// IMPORTANT: ignoreCompareQuantity explained
// ------------------------------------------
// Shopify's inventorySetQuantities mutation has a race condition protection feature.
// Normally, you must provide a `compareQuantity` for each item - the quantity you
// expect it to have before your update. If the actual quantity doesn't match,
// Shopify rejects the update (prevents two systems overwriting each other).
//
// For INITIAL IMPORT: We use `ignoreCompareQuantity: true` because we don't know
// or care what the current value is - we just want to set it to the partner's value.
//
// For ONGOING SYNC (phase 2): Consider using `compareQuantity` to avoid overwriting
// manual changes made in Shopify admin. This provides optimistic locking.
//
export const INVENTORY_SET_QUANTITIES = `
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

export interface InventorySetQuantitiesInput {
  name: string;
  reason: string;
  ignoreCompareQuantity?: boolean; // Set to true to skip compareQuantity validation
  quantities: Array<{
    inventoryItemId: string;
    locationId: string;
    quantity: number;
  }>;
}

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
