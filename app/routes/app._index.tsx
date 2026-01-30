import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <s-page heading="OCC Inventory Hub">
      <s-section heading={`Welcome, ${shop}`}>
        <s-paragraph>
          Your store is connected to Origin Coffee Collective.
        </s-paragraph>
      </s-section>

      <s-section heading="How It Works">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>1. Product Import</s-heading>
            <s-text>
              We import selected products from your catalog with adjusted retail
              pricing.
            </s-text>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>2. Inventory Sync</s-heading>
            <s-text>
              Inventory levels sync regularly between our stores to prevent
              overselling and keep stock accurate.
            </s-text>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>3. Order Creation</s-heading>
            <s-text>
              Wholesale orders are placed at the end of each business day.
            </s-text>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>4. Fulfillment</s-heading>
            <s-text>
              You ship orders to our fulfillment center, and we handle final
              delivery to customers.
            </s-text>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Permissions Granted">
        <s-unordered-list>
          <s-list-item>
            <strong>Read Products</strong> — View your catalog to import items
          </s-list-item>
          <s-list-item>
            <strong>Read Inventory</strong> — Sync inventory levels
          </s-list-item>
          <s-list-item>
            <strong>Create Orders</strong> — Create orders for fulfillment
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Need Help?">
        <s-paragraph>
          Questions about this integration? Contact us at:
        </s-paragraph>
        <s-link href="mailto:partners@origincoffeecollective.com">
          partners@origincoffeecollective.com
        </s-link>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
