import { upsertPartner } from "~/lib/supabase.server";

export async function ensurePartnerExists(shop: string, accessToken?: string, scope?: string) {
  console.log(`[ensurePartnerExists] Called for shop: ${shop}`);
  console.log(`[ensurePartnerExists] SUPABASE_URL set: ${!!process.env.SUPABASE_URL}`);
  console.log(`[ensurePartnerExists] SUPABASE_SERVICE_KEY set: ${!!process.env.SUPABASE_SERVICE_KEY}`);

  try {
    // Upsert partner record using Supabase
    const { error } = await upsertPartner(shop, accessToken, scope);
    if (error) {
      console.error(`[ensurePartnerExists] upsertPartner returned error:`, error);
      throw new Error(`Failed to store partner credentials: ${error}`);
    }
    console.log(`[ensurePartnerExists] Success for shop: ${shop}`);
  } catch (err) {
    console.error(`[ensurePartnerExists] Exception caught:`, err);
    throw err;
  }
}
