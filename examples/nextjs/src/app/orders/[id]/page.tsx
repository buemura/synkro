"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Order = {
  id: string;
  productId: string;
  quantity: number;
  amount: number;
  status: string;
  createdAt: string;
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Order not found");
        return res.json();
      })
      .then(setOrder)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <main style={styles.main}>
        <p>Loading...</p>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main style={styles.main}>
        <h1 style={styles.title}>Order not found</h1>
        <p style={styles.muted}>No order with ID: {id}</p>
        <a href="/orders" style={styles.link}>
          &larr; Create a new order
        </a>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>Order Details</h1>

      <div style={styles.card}>
        <div style={styles.row}>
          <span style={styles.label}>Order ID</span>
          <code style={styles.code}>{order.id}</code>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Product</span>
          <span>{order.productId}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Quantity</span>
          <span>{order.quantity}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Amount</span>
          <span>${order.amount.toFixed(2)}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Status</span>
          <span style={styles.badge}>{order.status}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Created</span>
          <span>{new Date(order.createdAt).toLocaleString()}</span>
        </div>
      </div>

      <div style={styles.actions}>
        <a href="/orders" style={styles.link}>
          &larr; Create another order
        </a>
        <a href="/orko" style={styles.link}>
          View Dashboard
        </a>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 520,
    margin: "0 auto",
    padding: "2rem",
    fontFamily: "system-ui, sans-serif",
  },
  title: {
    fontSize: "1.5rem",
    marginBottom: "1.5rem",
  },
  card: {
    border: "1px solid #e5e5e5",
    borderRadius: 8,
    overflow: "hidden",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem 1rem",
    borderBottom: "1px solid #f0f0f0",
  },
  label: {
    fontWeight: 600,
    fontSize: "0.875rem",
    color: "#666",
  },
  code: {
    fontSize: "0.8rem",
    background: "#f5f5f5",
    padding: "0.2rem 0.5rem",
    borderRadius: 4,
  },
  badge: {
    fontSize: "0.8rem",
    fontWeight: 600,
    padding: "0.2rem 0.6rem",
    borderRadius: 12,
    background: "#dbeafe",
    color: "#1d4ed8",
  },
  muted: {
    color: "#888",
  },
  actions: {
    display: "flex",
    gap: "1.5rem",
    marginTop: "1.5rem",
  },
  link: {
    color: "#666",
    fontSize: "0.875rem",
  },
};
