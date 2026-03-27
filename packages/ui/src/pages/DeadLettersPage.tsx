import React, { useCallback } from "react";
import { usePolling } from "../hooks/usePolling";
import { fetchDeadLetters } from "../api";

export function DeadLettersPage() {
  const fetcher = useCallback(() => fetchDeadLetters(), []);
  const { data, loading } = usePolling(fetcher, 5000);

  if (loading || !data) return <p>Loading...</p>;

  const deadLetters = data.deadLetters ?? [];

  return (
    <div>
      <h1 style={{ margin: "0 0 24px", fontSize: 24, color: "#222" }}>Dead Letter Queue</h1>
      {deadLetters.length === 0 ? (
        <div style={{ background: "#fff", padding: 40, borderRadius: 8, textAlign: "center", color: "#888" }}>
          No dead letters. Messages that fail delivery or are NACKed appear here.
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
                Message ID
              </th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Topic</th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Reason</th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>
                Payload
              </th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {deadLetters.map((dl: any) => (
              <tr key={dl.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12 }}>
                  {dl.original_message_id}
                </td>
                <td style={{ padding: "10px 16px", fontFamily: "monospace" }}>{dl.topic}</td>
                <td style={{ padding: "10px 16px", color: "#f44336" }}>{dl.reason}</td>
                <td style={{ padding: "10px 16px" }}>
                  <code style={{ fontSize: 12, background: "#f5f5f5", padding: "2px 6px", borderRadius: 3 }}>
                    {dl.payload?.substring(0, 80)}
                    {dl.payload?.length > 80 ? "…" : ""}
                  </code>
                </td>
                <td style={{ padding: "10px 16px", fontSize: 13, color: "#666" }}>
                  {new Date(dl.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
