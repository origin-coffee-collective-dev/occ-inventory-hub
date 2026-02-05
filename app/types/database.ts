// Partner sync status values
export type PartnerSyncStatus = 'success' | 'warning' | 'failed';

export interface Partner {
  id: string;
  shop: string;
  access_token: string | null; // Nullable - cleared on GDPR redact
  scope: string | null;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Sync status tracking (Iteration 3)
  last_sync_status: PartnerSyncStatus | null;
  last_sync_at: string | null;
  consecutive_sync_failures: number;
}

export interface ProductMapping {
  id: string;
  partner_id: string | null;
  partner_shop: string; // Stored separately so we retain this after partner deletion
  partner_product_id: string;
  partner_variant_id: string;
  my_product_id: string;
  my_variant_id: string;
  partner_sku: string | null;
  my_sku: string;
  margin: number;
  partner_price: number | null;
  my_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerProduct {
  id: string;
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
  is_new: boolean;
  first_seen_at: string;
  last_synced_at: string;
}

export interface PartnerOrder {
  id: string;
  my_order_id: string;
  my_order_name: string;
  partner_id: string | null;
  partner_shop: string; // Retained even after partner deletion
  partner_order_id: string | null;
  partner_order_name: string | null;
  status: 'pending' | 'created' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface OwnerStore {
  id: string;
  shop: string;
  access_token: string | null;
  scope: string | null;
  is_connected: boolean;
  connected_at: string | null;
  expires_at: string | null; // Token expiration for client credentials grant
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  id: string;
  inventory_sync_enabled: boolean;
  inventory_sync_interval_minutes: number;
  updated_at: string;
}

export type AppSettingsUpdate = {
  inventory_sync_enabled?: boolean;
  inventory_sync_interval_minutes?: number;
};

// Sync types for logging operations
export type SyncType =
  | 'products'
  | 'inventory'
  | 'orders'
  | 'gdpr_data_request'
  | 'gdpr_customers_redact'
  | 'gdpr_shop_redact'
  | 'app_uninstalled';

export interface SyncLog {
  id: string;
  partner_id: string | null;
  sync_type: SyncType;
  status: 'started' | 'completed' | 'failed';
  items_processed: number;
  items_created: number;
  items_updated: number;
  items_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

// Insert types with optional fields that have database defaults
export type PartnerInsert = {
  shop: string;
  access_token: string;
  scope?: string | null;
  is_active?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  // Sync status fields (optional - have defaults)
  last_sync_status?: PartnerSyncStatus | null;
  last_sync_at?: string | null;
  consecutive_sync_failures?: number;
};

export type ProductMappingInsert = {
  partner_id?: string | null;
  partner_shop: string;
  partner_product_id: string;
  partner_variant_id: string;
  my_product_id: string;
  my_variant_id: string;
  partner_sku?: string | null;
  my_sku: string;
  margin?: number;
  partner_price?: number | null;
  my_price?: number | null;
  is_active?: boolean;
};

export type PartnerProductInsert = {
  partner_shop: string;
  partner_product_id: string;
  partner_variant_id: string;
  title: string;
  sku?: string | null;
  price: number;
  inventory_quantity?: number | null;
  image_url?: string | null;
  handle?: string | null;
  description?: string | null;
  compare_at_price?: number | null;
  product_type?: string | null;
  vendor?: string | null;
  tags?: string[] | null;
  barcode?: string | null;
  is_new?: boolean;
  first_seen_at?: string;
  last_synced_at?: string;
};

export type PartnerOrderInsert = {
  my_order_id: string;
  my_order_name: string;
  partner_id?: string | null;
  partner_shop: string;
  partner_order_id?: string | null;
  partner_order_name?: string | null;
  status?: 'pending' | 'created' | 'failed';
  error_message?: string | null;
};

export type SyncLogInsert = {
  partner_id?: string | null;
  sync_type: SyncType;
  status: 'started' | 'completed' | 'failed';
  items_processed?: number;
  items_created?: number;
  items_updated?: number;
  items_failed?: number;
  error_message?: string | null;
  started_at?: string;
  completed_at?: string | null;
};

export type OwnerStoreInsert = {
  shop: string;
  access_token?: string | null;
  scope?: string | null;
  is_connected?: boolean;
  connected_at?: string | null;
  expires_at?: string | null;
};

export interface Database {
  public: {
    Tables: {
      partners: {
        Row: Partner;
        Insert: PartnerInsert;
        Update: Partial<PartnerInsert>;
      };
      product_mappings: {
        Row: ProductMapping;
        Insert: ProductMappingInsert;
        Update: Partial<ProductMappingInsert>;
      };
      partner_products: {
        Row: PartnerProduct;
        Insert: PartnerProductInsert;
        Update: Partial<PartnerProductInsert>;
      };
      partner_orders: {
        Row: PartnerOrder;
        Insert: PartnerOrderInsert;
        Update: Partial<PartnerOrderInsert>;
      };
      sync_logs: {
        Row: SyncLog;
        Insert: SyncLogInsert;
        Update: Partial<SyncLogInsert>;
      };
      owner_store: {
        Row: OwnerStore;
        Insert: OwnerStoreInsert;
        Update: Partial<OwnerStoreInsert>;
      };
      app_settings: {
        Row: AppSettings;
        Update: AppSettingsUpdate;
      };
    };
  };
}

// ============================================
// Inventory Sync Error Types (Iteration 3)
// ============================================

// Classification of sync errors for determining severity and response
export type SyncErrorType =
  | 'auth_revoked'        // HTTP 401 or "Access denied" - token invalid/revoked
  | 'store_unreachable'   // HTTP 5xx, timeout, or network error
  | 'rate_limited'        // HTTP 429 - too many requests
  | 'partial_failure'     // Some items failed within a batch
  | 'transient'           // Temporary error that may resolve on retry
  | 'unknown';            // Unclassified error

// Represents a critical sync failure that requires notification
export interface CriticalSyncError {
  type: 'token_revoked' | 'store_unreachable' | 'high_failure_rate' | 'consecutive_failures' | 'owner_store_disconnected';
  partnerShop: string;
  message: string;
  details?: string;
  httpStatus?: number;
  consecutiveFailures?: number;
  failureRate?: number;
}
