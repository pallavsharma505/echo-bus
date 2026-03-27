import React, { useCallback } from "react";
import { usePolling } from "../hooks/usePolling";
import { fetchTopics, purgeTopic } from "../api";

export function TopicsPage() {
  const fetcher = useCallback(() => fetchTopics(), []);
  const { data, loading, refetch } = usePolling(fetcher, 3000);

  const handlePurge = async (topic: string) => {
    if (confirm(`Purge all messages for topic "${topic}"?`)) {
      await purgeTopic(topic);
      refetch();
    }
  };

  if (loading || !data) return <p>Loading...</p>;

  const topics = data.topics ?? [];

  return (
    <div>
      <h1 style={{ margin: "0 0 24px", fontSize: 24, color: "#222" }}>Topics</h1>
      {topics.length === 0 ? (
        <div style={{ background: "#fff", padding: 40, borderRadius: 8, textAlign: "center", color: "#888" }}>
          No active topics. Publish a message or subscribe to create one.
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
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Topic</th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>
                Subscribers
              </th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>
                Pending Messages
              </th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Durable</th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t: any) => (
              <tr key={t.name} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 600 }}>{t.name}</td>
                <td style={{ padding: "10px 16px" }}>{t.subscriberCount}</td>
                <td style={{ padding: "10px 16px" }}>{t.messageCount}</td>
                <td style={{ padding: "10px 16px" }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      background: t.durable ? "#e8f5e9" : "#fafafa",
                      color: t.durable ? "#2e7d32" : "#999",
                    }}
                  >
                    {t.durable ? "Yes" : "No"}
                  </span>
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <button
                    onClick={() => handlePurge(t.name)}
                    style={{
                      padding: "4px 12px",
                      background: "#f44336",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Purge
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
