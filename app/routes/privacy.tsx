export default function Privacy() {
  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.heading}>Privacy Policy</h1>
        <p style={styles.lastUpdated}>Last updated: January 2026</p>

        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>1. Information We Collect</h2>
          <p style={styles.text}>
            When you connect your Shopify store to Origin Coffee Collective
            Inventory Hub, we collect and store the following information:
          </p>
          <ul style={styles.list}>
            <li>
              <strong>Store Information:</strong> Your Shopify store domain and
              associated email address
            </li>
            <li>
              <strong>Product Data:</strong> Product and variant information
              from connected partner stores, including titles, descriptions,
              prices, SKUs, and images
            </li>
            <li>
              <strong>Inventory Data:</strong> Current inventory levels from
              partner stores
            </li>
            <li>
              <strong>Order Records:</strong> Transaction records for orders
              associated with Origin Coffee Collective
            </li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>2. How We Use Your Information</h2>
          <p style={styles.text}>We use the collected information to:</p>
          <ul style={styles.list}>
            <li>
              Facilitate sale of products from partner coffee roasters and
              suppliers.
            </li>
            <li>
              Synchronize inventory levels between partner roasters and Origin
              Coffee Collective&apos;s retail store
            </li>
            <li>Place orders to partner roasters and suppliers</li>
            <li>Maintain and improve service functionality</li>
            <li>Provide customer support when requested</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>3. Data Sharing</h2>
          <p style={styles.text}>
            <strong>Between Connected Partners:</strong> Product, inventory, and
            order data is shared between stores that have mutually connected
            through OCC Inventory Hub. This sharing is essential to the
            service&apos;s core functionality.
          </p>
          <p style={styles.text}>
            <strong>Third Parties:</strong> We do not sell, rent, or trade your
            information to third parties.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>4. Data Retention</h2>
          <p style={styles.text}>
            We retain your data for as long as your store remains connected to
            OCC Inventory Hub. When you uninstall the app:
          </p>
          <ul style={styles.list}>
            <li>Authentication credentials are immediately deleted</li>
            <li>
              Business records (product mappings, order history) are retained
              for accounting and legal compliance purposes
            </li>
            <li>
              Upon GDPR deletion request, all PII data associated with your
              store will be permanently removed
            </li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>5. Your Rights</h2>
          <p style={styles.text}>You have the right to:</p>
          <ul style={styles.list}>
            <li>
              <strong>Access:</strong> Request a copy of the data we hold about
              your store
            </li>
            <li>
              <strong>Correction:</strong> Request correction of inaccurate data
            </li>
            <li>
              <strong>Deletion:</strong> Request deletion of your data (subject
              to legal retention requirements)
            </li>
            <li>
              <strong>Portability:</strong> Request your data in a
              machine-readable format
            </li>
          </ul>
          <p style={styles.text}>
            To exercise these rights, please contact us using the information
            below.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>6. Security</h2>
          <p style={styles.text}>
            We implement industry-standard security measures to protect your
            data, including encrypted connections (HTTPS), secure token storage,
            and regular security reviews. However, no method of transmission
            over the Internet is 100% secure.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>7. Changes to This Policy</h2>
          <p style={styles.text}>
            We may update this privacy policy from time to time. We will notify
            connected stores of any material changes via email or through the
            app interface.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionHeading}>8. Contact Us</h2>
          <p style={styles.text}>
            If you have questions about this privacy policy or wish to exercise
            your data rights, please contact:
          </p>
          <p style={styles.contact}>
            <strong>Origin Coffee Collective</strong>
            <br />
            Email: privacy@origincoffeecollective.com
          </p>
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "2rem 1rem",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    backgroundColor: "#f4f6f8",
  },
  content: {
    maxWidth: "700px",
    width: "100%",
    padding: "2.5rem",
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  heading: {
    margin: "0 0 0.5rem 0",
    fontSize: "2rem",
    color: "#202223",
  },
  lastUpdated: {
    margin: "0 0 2rem 0",
    fontSize: "0.875rem",
    color: "#8c9196",
  },
  section: {
    marginBottom: "2rem",
  },
  sectionHeading: {
    margin: "0 0 1rem 0",
    fontSize: "1.25rem",
    color: "#202223",
  },
  text: {
    margin: "0 0 1rem 0",
    fontSize: "1rem",
    color: "#6d7175",
    lineHeight: 1.6,
  },
  list: {
    margin: "0 0 1rem 0",
    paddingLeft: "1.5rem",
    color: "#6d7175",
    lineHeight: 1.8,
  },
  contact: {
    margin: 0,
    fontSize: "1rem",
    color: "#6d7175",
    lineHeight: 1.6,
  },
};
