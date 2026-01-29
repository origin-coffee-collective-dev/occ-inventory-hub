import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  createSyncLog,
  softDeletePartner,
  deactivateProductMappings,
} from "~/lib/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received GDPR webhook: ${topic} for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      // Customer has requested their data
      // We don't store customer PII - only business transaction records
      console.log(`Customer data request for shop ${shop}`, payload);

      await createSyncLog({
        syncType: "gdpr_data_request",
        status: "completed",
        itemsProcessed: 1,
      });
      break;
    }

    case "CUSTOMERS_REDACT": {
      // Customer has requested deletion of their data
      // We don't store customer PII - only business transaction records
      console.log(`Customer redact request for shop ${shop}`, payload);

      await createSyncLog({
        syncType: "gdpr_customers_redact",
        status: "completed",
        itemsProcessed: 1,
      });
      break;
    }

    case "SHOP_REDACT": {
      // Shop has been uninstalled for 48 hours
      // Soft delete: remove credentials but retain business records
      console.log(`Shop redact request for shop ${shop}`);

      const { partnerId, error: deleteError } = await softDeletePartner(shop);

      if (partnerId) {
        console.log(`SHOP_REDACT: Soft-deleting partner ${shop}`);

        // Mark product mappings as inactive (but retain for records)
        const { error: mappingError } = await deactivateProductMappings(shop);
        if (mappingError) {
          console.error(`Failed to deactivate product mappings for ${shop}:`, mappingError);
        }

        // Log the soft deletion
        await createSyncLog({
          partnerId,
          syncType: "gdpr_shop_redact",
          status: "completed",
          itemsProcessed: 1,
          itemsUpdated: 1,
        });

        console.log(`Soft-deleted partner ${shop} - credentials removed, business records retained`);
      } else {
        if (deleteError) {
          console.error(`Error during shop redact for ${shop}:`, deleteError);
        }
        console.log(`No partner found for shop ${shop} during shop redact`);

        await createSyncLog({
          syncType: "gdpr_shop_redact",
          status: "completed",
          itemsProcessed: 0,
        });
      }
      break;
    }

    default:
      console.log(`Unhandled GDPR webhook topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
