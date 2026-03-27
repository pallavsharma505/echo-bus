import React, { useCallback } from "react";
import { usePolling } from "../hooks/usePolling";
import { fetchConnections } from "../api";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function ConnectionsPage() {
  const fetcher = useCallback(() => fetchConnections(), []);
  const { data, loading } = usePolling(fetcher, 3000);

  if (loading || !data) return <p>Loading...</p>;

  const connections = data.connections ?? [];

  return (
    <div>
      <h1 style={{ margin: "0 0 24px", fontSize: 24, color: "#222" }}>Connections</h1>
      {connections.length === 0 ? (
        <div style={{ background: "#fff", padding: 40, borderRadius: 8, textAlign: "center", color: "#888" }}>
          No active connections.
        </div>
      ) : (
        <table
          style={{
            width: "100%",
            background: "#fff",
            borderRadius: 8,
            borderCollapse: "collapse",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>
                Client ID
              </th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>
                Remote Address
              </th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>
                Connected For
              </th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>
                Subscriptions
              </th>
            </tr>
          </thead>
          <tbody>
            {connections.map((c: any) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 13 }}>{c.id}</td>
                <td style={{ padding: "10px 16px" }}>{c.remoteAddress}</td>
                <td style={{ padding: "10px 16px" }}>{formatDuration(Date.now() - c.connectedAt)}</td>
                <td style={{ padding: "10px 16px" }}>
                  {c.subscriptions.length === 0 ? (
                    <span style={{ color: "#999" }}>None</span>
                  ) : (
                    c.subscriptions.map((s: string) => (
                      <span
                        key={s}
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          background: "#e3f2fd",
                          borderRadius: 4,
                          fontSize: 12,
                          marginRight: 4,
                          fontFamily: "monospace",
                        }}
                      >
                        {s}
                      </span>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
