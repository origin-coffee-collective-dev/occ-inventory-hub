import { upsertPartner } from "~/lib/supabase.server";

export async function ensurePartnerExists(shop: string, accessToken?: string, scope?: string) {
  const { error } = await upsertPartner(shop, accessToken, scope);
  if (error) {
    throw new Error(`Failed to store partner credentials: ${error}`);
  }
}
