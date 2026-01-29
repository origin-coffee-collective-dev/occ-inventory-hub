import db from "~/db.server";

export async function ensurePartnerExists(shop: string, accessToken?: string, scope?: string) {
  // Upsert partner record
  await db.partner.upsert({
    where: { shop },
    create: {
      shop,
      accessToken,
      scope,
      isActive: true,
      isDeleted: false,
    },
    update: {
      accessToken,  // Update token in case it changed
      scope,
      isActive: true,
      isDeleted: false,
      deletedAt: null,  // Clear if previously deleted (reinstall)
    },
  });
}
