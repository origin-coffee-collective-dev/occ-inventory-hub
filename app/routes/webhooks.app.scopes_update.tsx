import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { updateSessionScope } from "~/lib/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session, topic, shop } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    const current = payload.current as string[];
    if (session) {
        const { error } = await updateSessionScope(session.id, current.toString());
        if (error) {
            console.error(`Failed to update session scope for ${shop}:`, error);
        }
    }
    return new Response();
};
