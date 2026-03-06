"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateOrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const body = {
      productId: formData.get("productId"),
      quantity: Number(formData.get("quantity")),
      amount: Number(formData.get("amount")),
    };

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setError("Failed to create order");
      setLoading(false);
      return;
    }

    const data = await res.json();
    router.push(`/orders/${data.id}`);
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>Create Order</h1>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label htmlFor="productId" style={styles.label}>
            Product ID
          </label>
          <input
            id="productId"
            name="productId"
            type="text"
            required
            placeholder="e.g. prod-1"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label htmlFor="quantity" style={styles.label}>
            Quantity
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            required
            min={1}
            defaultValue={1}
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label htmlFor="amount" style={styles.label}>
            Amount ($)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            required
            min={0}
            step={0.01}
            placeholder="49.99"
            style={styles.input}
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Creating..." : "Create Order"}
        </button>
      </form>

      <a href="/" style={styles.link}>
        &larr; Back to home
      </a>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 480,
    margin: "0 auto",
    padding: "2rem",
    fontFamily: "system-ui, sans-serif",
  },
  title: {
    fontSize: "1.5rem",
    marginBottom: "1.5rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  label: {
    fontSize: "0.875rem",
    fontWeight: 600,
  },
  input: {
    padding: "0.5rem 0.75rem",
    border: "1px solid #ccc",
    borderRadius: 6,
    fontSize: "1rem",
  },
  button: {
    padding: "0.625rem 1rem",
    background: "#111",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: "1rem",
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  error: {
    color: "#dc2626",
    fontSize: "0.875rem",
    margin: 0,
  },
  link: {
    display: "inline-block",
    marginTop: "1.5rem",
    color: "#666",
    fontSize: "0.875rem",
  },
};
