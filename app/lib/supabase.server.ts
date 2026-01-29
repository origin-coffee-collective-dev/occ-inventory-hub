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
