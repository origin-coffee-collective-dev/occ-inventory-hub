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
