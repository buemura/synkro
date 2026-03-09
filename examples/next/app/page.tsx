"use client";

import { useCallback, useState } from "react";

type LogEntry = {
  id: string;
  time: string;
  label: string;
  status: "pending" | "success" | "error";
  duration?: number;
  data?: unknown;
};

function useLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const add = useCallback((label: string): string => {
    const id = crypto.randomUUID();
    setLogs((prev) => [
      {
        id,
        time: new Date().toLocaleTimeString(),
        label,
        status: "pending",
      },
      ...prev,
    ]);
    return id;
  }, []);

  const resolve = useCallback(
    (id: string, data: unknown, duration: number) => {
      setLogs((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, status: "success", data, duration } : l,
        ),
      );
    },
    [],
  );

  const reject = useCallback(
    (id: string, data: unknown, duration: number) => {
      setLogs((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, status: "error", data, duration } : l,
        ),
      );
    },
    [],
  );

  const clear = useCallback(() => setLogs([]), []);

  return { logs, add, resolve, reject, clear };
}

async function send(
  url: string,
  body: unknown,
): Promise<{ data: unknown; duration: number }> {
  const start = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const duration = Math.round(performance.now() - start);
  const data = await res.json();
  if (!res.ok) throw { data, duration };
  return { data, duration };
}

const STATUS_ICON: Record<LogEntry["status"], string> = {
  pending: "\u23F3",
  success: "\u2705",
  error: "\u274C",
};

export default function Home() {
  const { logs, add, resolve, reject, clear } = useLog();
  const [busy, setBusy] = useState<string | null>(null);

  const fire = async (label: string, url: string, body: unknown) => {
    setBusy(label);
    const id = add(label);
    try {
      const { data, duration } = await send(url, body);
      resolve(id, data, duration);
    } catch (err: unknown) {
      const e = err as { data?: unknown; duration?: number };
      reject(id, e.data ?? String(err), e.duration ?? 0);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 860, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: 4 }}>@synkro/next Playground</h1>
      <p style={{ color: "#666", marginTop: 0, marginBottom: "2rem" }}>
        Interactive test console for serverless event &amp; workflow dispatch.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Events */}
        <Section title="Standalone Events">
          <ActionCard
            title="UserSignedUp"
            description="Sends a welcome email (~300 ms)"
            busy={busy === "UserSignedUp"}
            onClick={() =>
              fire("UserSignedUp", "/api/publish/event", {
                type: "UserSignedUp",
                payload: { email: "alice@example.com", name: "Alice" },
              })
            }
          />
          <ActionCard
            title="PaymentReceived"
            description="Issues receipt with retry (~500 ms)"
            busy={busy === "PaymentReceived"}
            onClick={() =>
              fire("PaymentReceived", "/api/publish/event", {
                type: "PaymentReceived",
                payload: { orderId: "ORD-42", amount: 99.99 },
              })
            }
          />
        </Section>

        {/* Workflows */}
        <Section title="Workflows">
          <ActionCard
            title="OrderProcessing"
            description="Validate -> Payment -> Fulfill (~1.4 s)"
            busy={busy === "OrderProcessing"}
            onClick={() =>
              fire("OrderProcessing", "/api/publish/order", {
                orderId: `ORD-${Date.now().toString(36).toUpperCase()}`,
                items: ["Widget A", "Gadget B"],
              })
            }
          />
          <ActionCard
            title="DeployService"
            description="Build -> Tests -> Production (~1.8 s)"
            busy={busy === "DeployService"}
            onClick={() =>
              fire("DeployService", "/api/publish/deploy", {
                service: "api-gateway",
                version: "2.4.0",
              })
            }
          />
          <ActionCard
            title="DeployService (fail)"
            description="Build -> Tests (fail) -> Rollback (~1.7 s)"
            busy={busy === "DeployService (fail)"}
            onClick={() =>
              fire("DeployService (fail)", "/api/publish/deploy", {
                service: "api-gateway",
                version: "2.4.0",
                shouldFail: true,
              })
            }
          />
        </Section>
      </div>

      {/* Dashboard link */}
      <div style={{ marginTop: "1.5rem", padding: "0.75rem 1rem", background: "#f0f4ff", borderRadius: 8 }}>
        <strong>Dashboard:</strong>{" "}
        <a href="/api/dashboard" style={{ color: "#3b5bdb" }}>
          /api/dashboard
        </a>{" "}
        — Synkro introspection UI
      </div>

      {/* Request Log */}
      <div style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Request Log</h2>
          {logs.length > 0 && (
            <button
              onClick={clear}
              style={{
                background: "none",
                border: "1px solid #ccc",
                borderRadius: 4,
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: "0.8rem",
                color: "#666",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <p style={{ color: "#999", fontStyle: "italic" }}>
            Click a button above to fire an event or workflow.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {logs.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 12px",
                  background: entry.status === "error" ? "#fff5f5" : entry.status === "success" ? "#f0fff4" : "#fffbe6",
                  border: `1px solid ${entry.status === "error" ? "#fcc" : entry.status === "success" ? "#b7eb8f" : "#ffe58f"}`,
                  borderRadius: 6,
                  fontSize: "0.85rem",
                  fontFamily: "monospace",
                }}
              >
                <span>{STATUS_ICON[entry.status]}</span>
                <span style={{ color: "#888", minWidth: 72 }}>{entry.time}</span>
                <span style={{ fontWeight: 600, minWidth: 160 }}>{entry.label}</span>
                {entry.duration !== undefined && (
                  <span style={{ color: "#888" }}>{entry.duration} ms</span>
                )}
                {entry.data && (
                  <span style={{ color: "#555", marginLeft: "auto", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {JSON.stringify(entry.data)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "#333" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  busy,
  onClick,
}: {
  title: string;
  description: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "12px 16px",
        background: busy ? "#f5f5f5" : "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        cursor: busy ? "not-allowed" : "pointer",
        transition: "box-shadow 0.15s",
        boxShadow: busy ? "none" : "0 1px 3px rgba(0,0,0,0.06)",
      }}
      onMouseEnter={(e) => {
        if (!busy) (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = busy ? "none" : "0 1px 3px rgba(0,0,0,0.06)";
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: 2 }}>
        {busy ? "\u23F3 " : ""}{title}
      </div>
      <div style={{ color: "#888", fontSize: "0.8rem" }}>{description}</div>
    </button>
  );
}
