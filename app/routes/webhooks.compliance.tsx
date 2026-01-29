import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received GDPR webhook: ${topic} for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      // Customer has requested their data
      // We don't store customer PII - only business transaction records
      console.log(`Customer data request for shop ${shop}`, payload);

      await db.syncLog.create({
        data: {
          syncType: "gdpr_data_request",
          status: "completed",
          itemsProcessed: 1,
        },
      });
      break;
    }

    case "CUSTOMERS_REDACT": {
      // Customer has requested deletion of their data
      // We don't store customer PII - only business transaction records
      console.log(`Customer redact request for shop ${shop}`, payload);

      await db.syncLog.create({
        data: {
          syncType: "gdpr_customers_redact",
          status: "completed",
          itemsProcessed: 1,
        },
      });
      break;
    }

    case "SHOP_REDACT": {
      // Shop has been uninstalled for 48 hours
      // Soft delete: remove credentials but retain business records
      console.log(`Shop redact request for shop ${shop}`);

      const partner = await db.partner.findUnique({
        where: { shop },
        include: {
          _count: {
            select: {
              productMappings: true,
              partnerOrders: true,
            },
          },
        },
      });

      if (partner) {
        // Log what we're about to do
        console.log(
          `SHOP_REDACT: Soft-deleting partner ${shop}. ` +
          `Retaining ${partner._count.productMappings} product mappings and ` +
          `${partner._count.partnerOrders} orders for business records.`
        );

        // Soft delete the partner - clear credentials but keep record
        await db.partner.update({
          where: { shop },
          data: {
            accessToken: null,  // Remove credential (GDPR requirement)
            isActive: false,
            isDeleted: true,
            deletedAt: new Date(),
          },
        });

        // Mark product mappings as inactive (but retain for records)
        await db.productMapping.updateMany({
          where: { partnerShop: shop },
          data: { isActive: false },
        });

        // Log the soft deletion
        await db.syncLog.create({
          data: {
            partnerId: partner.id,
            syncType: "gdpr_shop_redact",
            status: "completed",
            itemsProcessed: 1,
            itemsUpdated: 1,
          },
        });

        console.log(`Soft-deleted partner ${shop} - credentials removed, business records retained`);
      } else {
        console.log(`No partner found for shop ${shop} during shop redact`);

        await db.syncLog.create({
          data: {
            syncType: "gdpr_shop_redact",
            status: "completed",
            itemsProcessed: 0,
          },
        });
      }
      break;
    }

    default:
      console.log(`Unhandled GDPR webhook topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
