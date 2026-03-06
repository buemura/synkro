export default function Home() {
  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Synkro + Next.js Example</h1>

      <nav style={{ display: "flex", gap: "1.5rem", margin: "1.5rem 0" }}>
        <a href="/orders">Create Order</a>
        <a href="/synkro">Dashboard</a>
      </nav>

      <h2 style={{ fontSize: "1.1rem" }}>API Routes</h2>
      <ul>
        <li>
          <code>POST /api/orders</code> — Start the ProcessOrder workflow
        </li>
        <li>
          <code>GET /api/orders/:id</code> — Get order details
        </li>
        <li>
          <code>POST /api/publish</code> — Publish any event
        </li>
      </ul>
    </main>
  );
}
