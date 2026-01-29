import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteSessionsByShop } from "~/lib/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    const { error } = await deleteSessionsByShop(shop);
    if (error) {
      console.error(`Failed to delete sessions for ${shop}:`, error);
    }
  }

  return new Response();
};
