import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Partner type matching the database schema (snake_case column names)
export interface PartnerRecord {
  id: string;
  shop: string;
  access_token: string | null;
  scope: string | null;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Server-side Supabase client with service role key
// This has admin privileges - use only on the server
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables");
  }

  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabase;
}

// Session cookie name
export const ADMIN_SESSION_COOKIE = "admin_session";

// Verify admin session from cookie
export async function verifyAdminSession(sessionToken: string | null): Promise<{
  isValid: boolean;
  userId?: string;
  email?: string;
}> {
  if (!sessionToken) {
    return { isValid: false };
  }

  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.getUser(sessionToken);

    if (error || !data.user) {
      return { isValid: false };
    }

    return {
      isValid: true,
      userId: data.user.id,
      email: data.user.email,
    };
  } catch {
    return { isValid: false };
  }
}

// Extract and verify admin session from a request.
// Throws a redirect to /admin/login if the session is invalid.
export async function requireAdminSession(request: Request): Promise<{ userId: string; email: string }> {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, rest.join("=")];
    })
  );
  const sessionToken = cookies[ADMIN_SESSION_COOKIE] || null;
  const session = await verifyAdminSession(sessionToken);

  if (!session.isValid || !session.userId || !session.email) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/admin/login" },
    });
  }

  return { userId: session.userId, email: session.email };
}

// Sign in with email and password
export async function signInAdmin(email: string, password: string): Promise<{
  success: boolean;
  accessToken?: string;
  error?: string;
}> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.session) {
      return { success: false, error: "No session returned" };
    }

    return {
      success: true,
      accessToken: data.session.access_token,
    };
  } catch (err) {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// Sign out admin
export async function signOutAdmin(sessionToken: string): Promise<void> {
  try {
    const client = getSupabaseClient();
    await client.auth.admin.signOut(sessionToken);
  } catch {
    // Ignore errors during sign out
  }
}

// Fetch partner by shop domain
export async function getPartnerByShop(shopDomain: string): Promise<{
  data: PartnerRecord | null;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('partners')
      .select('*')
      .eq('shop', shopDomain)
      .single();

    if (error) {
      // PGRST116 = no rows found, which is not an error for our use case
      if (error.code === 'PGRST116') {
        return { data: null, error: null };
      }
      return { data: null, error: error.message };
    }

    return { data: data as PartnerRecord, error: null };
  } catch (err) {
    return { data: null, error: 'Failed to query partner' };
  }
}

// Upsert partner (create or update)
export async function upsertPartner(
  shop: string,
  accessToken?: string,
  scope?: string
): Promise<{ error: string | null }> {
  try {
    const client = getSupabaseClient();

    // Check if partner exists
    const { data: existing, error: selectError } = await client
      .from('partners')
      .select('id')
      .eq('shop', shop)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      return { error: selectError.message };
    }

    if (existing) {
      // Update existing partner
      const { error } = await client
        .from('partners')
        .update({
          access_token: accessToken,
          scope,
          is_active: true,
          is_deleted: false,
          deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('shop', shop);

      if (error) return { error: error.message };
    } else {
      // Insert new partner
      const { error } = await client
        .from('partners')
        .insert({
          shop,
          access_token: accessToken,
          scope,
          is_active: true,
          is_deleted: false,
        });

      if (error) return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    return { error: 'Failed to upsert partner' };
  }
}

// Get all partners (for admin dashboard)
export async function getAllPartners(): Promise<{
  data: PartnerRecord[];
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('partners')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data as PartnerRecord[], error: null };
  } catch (err) {
    return { data: [], error: 'Failed to fetch partners' };
  }
}

// Soft delete partner (for GDPR compliance)
export async function softDeletePartner(shop: string): Promise<{
  partnerId: string | null;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();

    // First get the partner ID for logging
    const { data: partner } = await client
      .from('partners')
      .select('id')
      .eq('shop', shop)
      .single();

    if (!partner) {
      return { partnerId: null, error: null };
    }

    // Soft delete - clear credentials but retain record
    const { error } = await client
      .from('partners')
      .update({
        access_token: null,
        is_active: false,
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('shop', shop);

    if (error) {
      return { partnerId: null, error: error.message };
    }

    return { partnerId: partner.id, error: null };
  } catch (err) {
    return { partnerId: null, error: 'Failed to soft delete partner' };
  }
}

// Update product mappings to inactive (for GDPR compliance)
export async function deactivateProductMappings(partnerShop: string): Promise<{
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('product_mappings')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('partner_shop', partnerShop);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: 'Failed to deactivate product mappings' };
  }
}

// Create sync log entry
export async function createSyncLog(data: {
  partnerId?: string;
  syncType: string;
  status: string;
  itemsProcessed?: number;
  itemsCreated?: number;
  itemsUpdated?: number;
  itemsFailed?: number;
  errorMessage?: string;
}): Promise<{ error: string | null }> {
  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('sync_logs')
      .insert({
        partner_id: data.partnerId,
        sync_type: data.syncType,
        status: data.status,
        items_processed: data.itemsProcessed ?? 0,
        items_created: data.itemsCreated ?? 0,
        items_updated: data.itemsUpdated ?? 0,
        items_failed: data.itemsFailed ?? 0,
        error_message: data.errorMessage,
      });

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: 'Failed to create sync log' };
  }
}

// ============================================
// Session Storage Functions (for Shopify auth)
// ============================================

export interface SessionRecord {
  id: string;
  shop: string;
  state: string;
  is_online: boolean;
  scope: string | null;
  expires: string | null;
  access_token: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  account_owner: boolean;
  locale: string | null;
  collaborator: boolean | null;
  email_verified: boolean | null;
  refresh_token: string | null;
  refresh_token_expires: string | null;
}

// Store a Shopify session
export async function storeSession(session: {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  scope?: string;
  expires?: Date;
  accessToken: string;
  userId?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  accountOwner?: boolean;
  locale?: string;
  collaborator?: boolean;
  emailVerified?: boolean;
  onlineAccessInfo?: {
    expires_in: number;
    associated_user_scope: string;
    associated_user: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
      email_verified: boolean;
      account_owner: boolean;
      locale: string;
      collaborator: boolean;
    };
  };
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const client = getSupabaseClient();

    const record = {
      id: session.id,
      shop: session.shop,
      state: session.state,
      is_online: session.isOnline,
      scope: session.scope ?? null,
      expires: session.expires?.toISOString() ?? null,
      access_token: session.accessToken,
      user_id: session.onlineAccessInfo?.associated_user?.id?.toString() ?? session.userId?.toString() ?? null,
      first_name: session.onlineAccessInfo?.associated_user?.first_name ?? session.firstName ?? null,
      last_name: session.onlineAccessInfo?.associated_user?.last_name ?? session.lastName ?? null,
      email: session.onlineAccessInfo?.associated_user?.email ?? session.email ?? null,
      account_owner: session.onlineAccessInfo?.associated_user?.account_owner ?? session.accountOwner ?? false,
      locale: session.onlineAccessInfo?.associated_user?.locale ?? session.locale ?? null,
      collaborator: session.onlineAccessInfo?.associated_user?.collaborator ?? session.collaborator ?? false,
      email_verified: session.onlineAccessInfo?.associated_user?.email_verified ?? session.emailVerified ?? false,
    };

    const { error } = await client
      .from('sessions')
      .upsert(record, { onConflict: 'id' });

    if (error) {
      console.error('Failed to store session:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('Exception storing session:', err);
    return { success: false, error: 'Failed to store session' };
  }
}

// Load a Shopify session by ID
export async function loadSession(id: string): Promise<{
  data: SessionRecord | null;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { data: null, error: null };
      }
      return { data: null, error: error.message };
    }

    return { data: data as SessionRecord, error: null };
  } catch (err) {
    return { data: null, error: 'Failed to load session' };
  }
}

// Delete a session by ID
export async function deleteSession(id: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('sessions')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: 'Failed to delete session' };
  }
}

// Update session scope
export async function updateSessionScope(id: string, scope: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('sessions')
      .update({ scope })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: 'Failed to update session scope' };
  }
}

// Delete all sessions for a shop
export async function deleteSessionsByShop(shop: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('sessions')
      .delete()
      .eq('shop', shop);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: 'Failed to delete sessions' };
  }
}

// Find sessions by shop
export async function findSessionsByShop(shop: string): Promise<{
  data: SessionRecord[];
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('sessions')
      .select('*')
      .eq('shop', shop);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data as SessionRecord[], error: null };
  } catch (err) {
    return { data: [], error: 'Failed to find sessions' };
  }
}

// Delete multiple sessions by IDs
export async function deleteSessions(ids: string[]): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    if (ids.length === 0) {
      return { success: true, error: null };
    }

    const client = getSupabaseClient();
    const { error } = await client
      .from('sessions')
      .delete()
      .in('id', ids);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: 'Failed to delete sessions' };
  }
}

// ============================================
// Partner Products Functions (product cache)
// ============================================

export interface PartnerProductRecord {
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
  is_deleted: boolean;
  deleted_at: string | null;
  first_seen_at: string;
  last_synced_at: string;
}

// Get all cached partner products for a shop
export async function getPartnerProducts(
  shopDomain: string,
  includeDeleted: boolean = false
): Promise<{
  data: PartnerProductRecord[];
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    let query = client
      .from('partner_products')
      .select('*')
      .eq('partner_shop', shopDomain);

    // Filter out deleted products by default
    if (!includeDeleted) {
      query = query.eq('is_deleted', false);
    }

    const { data, error } = await query.order('title');

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data as PartnerProductRecord[], error: null };
  } catch (err) {
    return { data: [], error: 'Failed to fetch partner products' };
  }
}

// Upsert partner products (sync from partner API)
export async function upsertPartnerProducts(
  products: Array<{
    partner_shop: string;
    partner_product_id: string;
    partner_variant_id: string;
    title: string;
    sku: string | null;
    price: number;
    inventory_quantity: number | null;
    image_url?: string | null;
    handle?: string | null;
    description?: string | null;
    compare_at_price?: number | null;
    product_type?: string | null;
    vendor?: string | null;
    tags?: string[] | null;
    barcode?: string | null;
  }>
): Promise<{
  newCount: number;
  updatedCount: number;
  deletedCount: number;
  restoredCount: number;
  error: string | null;
}> {
  try {
    if (products.length === 0) {
      return { newCount: 0, updatedCount: 0, deletedCount: 0, restoredCount: 0, error: null };
    }

    const client = getSupabaseClient();
    const shopDomain = products[0].partner_shop;

    // Get existing products (including deleted) to determine which are new/updated/restored
    const { data: existing } = await client
      .from('partner_products')
      .select('partner_variant_id, is_deleted')
      .eq('partner_shop', shopDomain);

    const existingVariantIds = new Map(
      (existing || []).map(p => [p.partner_variant_id, p.is_deleted])
    );

    // Track which variant IDs we're syncing (to detect deletions)
    const syncedVariantIds = new Set(products.map(p => p.partner_variant_id));

    let newCount = 0;
    let updatedCount = 0;
    let restoredCount = 0;

    for (const product of products) {
      const existingRecord = existingVariantIds.get(product.partner_variant_id);
      const isExisting = existingRecord !== undefined;
      const wasDeleted = existingRecord === true;

      if (isExisting) {
        // Update existing product (and restore if it was deleted)
        const { error } = await client
          .from('partner_products')
          .update({
            title: product.title,
            sku: product.sku,
            price: product.price,
            inventory_quantity: product.inventory_quantity,
            image_url: product.image_url ?? null,
            handle: product.handle ?? null,
            description: product.description ?? null,
            compare_at_price: product.compare_at_price ?? null,
            product_type: product.product_type ?? null,
            vendor: product.vendor ?? null,
            tags: product.tags ?? null,
            barcode: product.barcode ?? null,
            is_deleted: false,
            deleted_at: null,
            last_synced_at: new Date().toISOString(),
          })
          .eq('partner_shop', product.partner_shop)
          .eq('partner_variant_id', product.partner_variant_id);

        if (!error) {
          if (wasDeleted) {
            restoredCount++;
          } else {
            updatedCount++;
          }
        }
      } else {
        // Insert new product
        const { error } = await client
          .from('partner_products')
          .insert({
            partner_shop: product.partner_shop,
            partner_product_id: product.partner_product_id,
            partner_variant_id: product.partner_variant_id,
            title: product.title,
            sku: product.sku,
            price: product.price,
            inventory_quantity: product.inventory_quantity,
            image_url: product.image_url ?? null,
            handle: product.handle ?? null,
            description: product.description ?? null,
            compare_at_price: product.compare_at_price ?? null,
            product_type: product.product_type ?? null,
            vendor: product.vendor ?? null,
            tags: product.tags ?? null,
            barcode: product.barcode ?? null,
            is_new: true,
            is_deleted: false,
            first_seen_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString(),
          });

        if (!error) newCount++;
      }
    }

    // Soft delete products that exist in DB but weren't in the sync
    let deletedCount = 0;
    for (const [variantId, isDeleted] of existingVariantIds) {
      if (!syncedVariantIds.has(variantId) && !isDeleted) {
        const { error } = await client
          .from('partner_products')
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
          })
          .eq('partner_shop', shopDomain)
          .eq('partner_variant_id', variantId);

        if (!error) deletedCount++;
      }
    }

    return { newCount, updatedCount, deletedCount, restoredCount, error: null };
  } catch (err) {
    return { newCount: 0, updatedCount: 0, deletedCount: 0, restoredCount: 0, error: 'Failed to upsert partner products' };
  }
}

// Mark partner product as not new (after import or dismiss)
export async function markPartnerProductSeen(
  shopDomain: string,
  partnerVariantId: string
): Promise<{ error: string | null }> {
  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('partner_products')
      .update({ is_new: false })
      .eq('partner_shop', shopDomain)
      .eq('partner_variant_id', partnerVariantId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: 'Failed to mark product as seen' };
  }
}

// Get product mappings for a partner shop
export async function getProductMappingsByShop(shopDomain: string): Promise<{
  data: Array<{
    id: string;
    partner_variant_id: string;
    my_product_id: string;
    my_variant_id: string;
    partner_price: number | null;
    my_price: number | null;
    margin: number;
  }>;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('product_mappings')
      .select('id, partner_variant_id, my_product_id, my_variant_id, partner_price, my_price, margin')
      .eq('partner_shop', shopDomain)
      .eq('is_active', true);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data || [], error: null };
  } catch (err) {
    return { data: [], error: 'Failed to fetch product mappings' };
  }
}

// Unlink (deactivate) a single product mapping
export async function unlinkProductMapping(
  shopDomain: string,
  partnerVariantId: string
): Promise<{ error: string | null }> {
  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('product_mappings')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('partner_shop', shopDomain)
      .eq('partner_variant_id', partnerVariantId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: 'Failed to unlink product mapping' };
  }
}

// ============================================
// Owner Store Functions (for parent OCC store)
// ============================================

export interface OwnerStoreRecord {
  id: string;
  shop: string;
  access_token: string | null;
  scope: string | null;
  is_connected: boolean;
  connected_at: string | null;
  expires_at: string | null;
  location_id: string | null;
  created_at: string;
  updated_at: string;
}

// Get the connected owner store (singleton)
export async function getOwnerStore(): Promise<{
  data: OwnerStoreRecord | null;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('owner_store')
      .select('*')
      .eq('is_connected', true)
      .single();

    if (error) {
      // PGRST116 = no rows found, which is expected if not connected
      if (error.code === 'PGRST116') {
        return { data: null, error: null };
      }
      return { data: null, error: error.message };
    }

    return { data: data as OwnerStoreRecord, error: null };
  } catch (err) {
    return { data: null, error: 'Failed to fetch owner store' };
  }
}

// Upsert owner store (connect or update)
export async function upsertOwnerStore(
  shop: string,
  accessToken: string,
  scope: string,
  expiresAt?: Date
): Promise<{ error: string | null }> {
  try {
    const client = getSupabaseClient();

    // First, disconnect any existing owner store
    await client
      .from('owner_store')
      .update({
        is_connected: false,
        updated_at: new Date().toISOString(),
      })
      .eq('is_connected', true);

    // Check if this shop already exists
    const { data: existing } = await client
      .from('owner_store')
      .select('id')
      .eq('shop', shop)
      .single();

    if (existing) {
      // Update existing record
      const { error } = await client
        .from('owner_store')
        .update({
          access_token: accessToken,
          scope,
          is_connected: true,
          connected_at: new Date().toISOString(),
          expires_at: expiresAt?.toISOString() ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('shop', shop);

      if (error) return { error: error.message };
    } else {
      // Insert new record
      const { error } = await client
        .from('owner_store')
        .insert({
          shop,
          access_token: accessToken,
          scope,
          is_connected: true,
          connected_at: new Date().toISOString(),
          expires_at: expiresAt?.toISOString() ?? null,
        });

      if (error) return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    return { error: 'Failed to upsert owner store' };
  }
}

// Update owner store location ID
export async function updateOwnerStoreLocationId(
  shop: string,
  locationId: string
): Promise<{ error: string | null }> {
  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('owner_store')
      .update({
        location_id: locationId,
        updated_at: new Date().toISOString(),
      })
      .eq('shop', shop);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: 'Failed to update owner store location ID' };
  }
}

// Create a product mapping
export async function createProductMapping(data: {
  partnerId: string | null;
  partnerShop: string;
  partnerProductId: string;
  partnerVariantId: string;
  myProductId: string;
  myVariantId: string;
  partnerSku: string | null;
  mySku: string;
  partnerPrice: number;
  myPrice: number;
  margin: number;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const client = getSupabaseClient();
    const { data: result, error } = await client
      .from('product_mappings')
      .insert({
        partner_id: data.partnerId,
        partner_shop: data.partnerShop,
        partner_product_id: data.partnerProductId,
        partner_variant_id: data.partnerVariantId,
        my_product_id: data.myProductId,
        my_variant_id: data.myVariantId,
        partner_sku: data.partnerSku,
        my_sku: data.mySku,
        partner_price: data.partnerPrice,
        my_price: data.myPrice,
        margin: data.margin,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      return { id: null, error: error.message };
    }

    return { id: result.id, error: null };
  } catch (err) {
    return { id: null, error: 'Failed to create product mapping' };
  }
}

// ============================================
// App Settings Functions
// ============================================

export interface AppSettingsRecord {
  id: string;
  inventory_sync_enabled: boolean;
  inventory_sync_interval_minutes: number;
  updated_at: string;
}

// Fetch the singleton app settings row
export async function getAppSettings(): Promise<{
  data: AppSettingsRecord | null;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('app_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { data: null, error: null };
      }
      return { data: null, error: error.message };
    }

    return { data: data as AppSettingsRecord, error: null };
  } catch (err) {
    return { data: null, error: 'Failed to fetch app settings' };
  }
}

// Update app settings
export async function updateAppSettings(updates: {
  inventory_sync_enabled?: boolean;
  inventory_sync_interval_minutes?: number;
}): Promise<{ error: string | null }> {
  try {
    const client = getSupabaseClient();

    // Get the singleton row ID first
    const { data: settings } = await client
      .from('app_settings')
      .select('id')
      .limit(1)
      .single();

    if (!settings) {
      return { error: 'App settings not found' };
    }

    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.inventory_sync_enabled !== undefined) {
      updateFields.inventory_sync_enabled = updates.inventory_sync_enabled;
    }
    if (updates.inventory_sync_interval_minutes !== undefined) {
      updateFields.inventory_sync_interval_minutes = updates.inventory_sync_interval_minutes;
    }

    const { error } = await client
      .from('app_settings')
      .update(updateFields)
      .eq('id', settings.id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: 'Failed to update app settings' };
  }
}

// ============================================
// Inventory Sync Functions
// ============================================

export interface ActiveProductMapping {
  id: string;
  partner_shop: string;
  partner_variant_id: string;
  my_variant_id: string;
}

// Get active product mappings, optionally filtered by partner shop
export async function getActiveProductMappings(partnerShop?: string): Promise<{
  data: ActiveProductMapping[];
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    let query = client
      .from('product_mappings')
      .select('id, partner_shop, partner_variant_id, my_variant_id')
      .eq('is_active', true);

    if (partnerShop) {
      query = query.eq('partner_shop', partnerShop);
    }

    const { data, error } = await query;

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data || []) as ActiveProductMapping[], error: null };
  } catch (err) {
    return { data: [], error: 'Failed to fetch active product mappings' };
  }
}

// Count of active product mappings (for dashboard display)
export async function getActiveProductMappingsCount(): Promise<{
  count: number;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { count, error } = await client
      .from('product_mappings')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    if (error) {
      return { count: 0, error: error.message };
    }

    return { count: count ?? 0, error: null };
  } catch (err) {
    return { count: 0, error: 'Failed to count active product mappings' };
  }
}

// Get the most recent inventory sync log
export async function getLatestInventorySyncLog(): Promise<{
  data: {
    id: string;
    status: string;
    items_processed: number;
    items_updated: number;
    items_failed: number;
    error_message: string | null;
    started_at: string;
    completed_at: string | null;
  } | null;
  error: string | null;
}> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('sync_logs')
      .select('id, status, items_processed, items_updated, items_failed, error_message, started_at, completed_at')
      .eq('sync_type', 'inventory')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: 'Failed to fetch latest inventory sync log' };
  }
}

// Create a sync log and return its ID (for updating later)
export async function createSyncLogReturningId(data: {
  partnerId?: string;
  syncType: string;
  status: string;
  itemsProcessed?: number;
  itemsCreated?: number;
  itemsUpdated?: number;
  itemsFailed?: number;
  errorMessage?: string;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const client = getSupabaseClient();
    const { data: result, error } = await client
      .from('sync_logs')
      .insert({
        partner_id: data.partnerId,
        sync_type: data.syncType,
        status: data.status,
        items_processed: data.itemsProcessed ?? 0,
        items_created: data.itemsCreated ?? 0,
        items_updated: data.itemsUpdated ?? 0,
        items_failed: data.itemsFailed ?? 0,
        error_message: data.errorMessage,
      })
      .select('id')
      .single();

    if (error) return { id: null, error: error.message };
    return { id: result.id, error: null };
  } catch (err) {
    return { id: null, error: 'Failed to create sync log' };
  }
}

// Update an existing sync log by ID
export async function updateSyncLogById(
  id: string,
  data: {
    status?: string;
    itemsProcessed?: number;
    itemsCreated?: number;
    itemsUpdated?: number;
    itemsFailed?: number;
    errorMessage?: string;
    completedAt?: string;
  }
): Promise<{ error: string | null }> {
  try {
    const client = getSupabaseClient();

    const updateFields: Record<string, unknown> = {};
    if (data.status !== undefined) updateFields.status = data.status;
    if (data.itemsProcessed !== undefined) updateFields.items_processed = data.itemsProcessed;
    if (data.itemsCreated !== undefined) updateFields.items_created = data.itemsCreated;
    if (data.itemsUpdated !== undefined) updateFields.items_updated = data.itemsUpdated;
    if (data.itemsFailed !== undefined) updateFields.items_failed = data.itemsFailed;
    if (data.errorMessage !== undefined) updateFields.error_message = data.errorMessage;
    if (data.completedAt !== undefined) updateFields.completed_at = data.completedAt;

    const { error } = await client
      .from('sync_logs')
      .update(updateFields)
      .eq('id', id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: 'Failed to update sync log' };
  }
}
