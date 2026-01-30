import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "your store";

  return { shop };
};

export default function PartnerSuccess() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.icon}>&#10003;</div>
        <h1 style={styles.heading}>Connected to Origin Coffee Collective</h1>
        <p style={styles.text}>
          <strong>{shop}</strong> has been successfully connected as a partner store.
        </p>

        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>What is this?</h2>
          <p style={styles.sectionText}>
            The OCC Inventory Hub connects your Shopify store with Origin Coffee Collective's retail storefront.
            This enables us to feature your products on our store while you maintain full control of your inventory.
          </p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>Permissions Granted</h2>
          <ul style={styles.list}>
            <li style={styles.listItem}>
              <strong>Read Products</strong> — We can view your product catalog to import items to our store
            </li>
            <li style={styles.listItem}>
              <strong>Read Inventory</strong> — We sync inventory levels to keep stock accurate across stores
            </li>
            <li style={styles.listItem}>
              <strong>Create Orders</strong> — When customers purchase your products, we create orders on your store for fulfillment
            </li>
          </ul>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>How It Works</h2>
          <ol style={styles.list}>
            <li style={styles.listItem}>We import selected products from your store with adjusted pricing</li>
            <li style={styles.listItem}>Inventory syncs regularly to prevent overselling</li>
            <li style={styles.listItem}>When a customer orders, we create an order on your store</li>
            <li style={styles.listItem}>You ship the order to our fulfillment center</li>
          </ol>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>Questions?</h2>
          <p style={styles.sectionText}>
            If you have any questions about this integration, please contact us at:<br />
            <a href="mailto:partners@origincoffeecollective.com" style={styles.email}>
              partners@origincoffeecollective.com
            </a>
          </p>
        </div>

        <p style={styles.subtext}>
          You can safely close this window.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "1rem",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    backgroundColor: "#f4f6f8",
  },
  content: {
    textAlign: "center",
    maxWidth: "600px",
    padding: "2rem",
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  icon: {
    fontSize: "4rem",
    color: "#008060",
    marginBottom: "1rem",
  },
  heading: {
    margin: "0 0 1rem 0",
    fontSize: "1.5rem",
    color: "#202223",
  },
  text: {
    margin: "0 0 1.5rem 0",
    fontSize: "1rem",
    color: "#6d7175",
  },
  section: {
    textAlign: "left",
    marginBottom: "1.5rem",
    padding: "1rem",
    backgroundColor: "#f9fafb",
    borderRadius: "6px",
  },
  sectionHeading: {
    margin: "0 0 0.5rem 0",
    fontSize: "1rem",
    fontWeight: 600,
    color: "#202223",
  },
  sectionText: {
    margin: 0,
    fontSize: "0.875rem",
    color: "#6d7175",
    lineHeight: 1.5,
  },
  list: {
    margin: 0,
    paddingLeft: "1.25rem",
    fontSize: "0.875rem",
    color: "#6d7175",
    lineHeight: 1.8,
  },
  listItem: {
    marginBottom: "0.25rem",
  },
  email: {
    color: "#008060",
    textDecoration: "none",
    fontWeight: 500,
  },
  subtext: {
    margin: "1.5rem 0 0 0",
    fontSize: "0.875rem",
    color: "#8c9196",
  },
};
