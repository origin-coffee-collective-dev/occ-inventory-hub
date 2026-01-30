import type { LoaderFunctionArgs } from "react-router";
import { redirect, Link } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function Index() {

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.header}>
          <img
            src="/app-icon.jpeg"
            alt="Origin Coffee Collective"
            style={styles.logo}
          />
          <h1 style={styles.heading}>Origin Coffee Collective</h1>
          <p style={styles.tagline}>Inventory Hub</p>
        </div>

        <p style={styles.description}>
          A B2B inventory management platform connecting retail storefronts with
          partner roasters and suppliers. Automate product imports, sync
          inventory levels, and streamline order fulfillment.
        </p>

        <p style={styles.note}>
          This is an API-only service with no public interface. For questions or
          support, contact{" "}
          <a href="mailto:support@origincoffeecollective.com" style={styles.emailLink}>
            support@origincoffeecollective.com
          </a>
        </p>

        <div style={styles.footer}>
          <Link to="/privacy" style={styles.link}>
            Privacy Policy
          </Link>
        </div>
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
    padding: "2rem 1rem",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    backgroundColor: "#f4f6f8",
  },
  content: {
    maxWidth: "600px",
    width: "100%",
    padding: "2.5rem",
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    textAlign: "center",
  },
  header: {
    marginBottom: "1.5rem",
  },
  logo: {
    width: "80px",
    height: "80px",
    borderRadius: "12px",
    marginBottom: "1rem",
    display: "block",
    marginLeft: "auto",
    marginRight: "auto",
  },
  heading: {
    margin: "0",
    fontSize: "2rem",
    color: "#202223",
  },
  tagline: {
    margin: "0.5rem 0 0 0",
    fontSize: "1.125rem",
    color: "#008060",
    fontWeight: 500,
  },
  description: {
    margin: "0 0 1.5rem 0",
    fontSize: "1rem",
    color: "#6d7175",
    lineHeight: 1.6,
  },
  note: {
    margin: "0 0 2rem 0",
    fontSize: "0.875rem",
    color: "#8c9196",
    lineHeight: 1.5,
  },
  emailLink: {
    color: "#008060",
    textDecoration: "none",
  },
  footer: {
    paddingTop: "1rem",
    borderTop: "1px solid #e1e3e5",
  },
  link: {
    fontSize: "0.875rem",
    color: "#6d7175",
    textDecoration: "none",
  },
};
