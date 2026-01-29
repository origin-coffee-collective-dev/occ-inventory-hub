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
