import { upsertPartner } from "~/lib/supabase.server";

export async function ensurePartnerExists(shop: string, accessToken?: string, scope?: string) {
  // Upsert partner record using Supabase
  const { error } = await upsertPartner(shop, accessToken, scope);
  if (error) {
    console.error(`Failed to upsert partner ${shop}:`, error);
    throw new Error(`Failed to store partner credentials: ${error}`);
  }
}
