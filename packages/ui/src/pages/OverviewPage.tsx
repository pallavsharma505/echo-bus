import React, { useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { usePolling } from "../hooks/usePolling";
import { fetchHealth, fetchMetrics } from "../api";

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: "20px 24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        borderTop: `3px solid ${color}`,
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: "#222" }}>{value}</div>
    </div>
  );
}

export function OverviewPage() {
  const healthFetcher = useCallback(() => fetchHealth(), []);
  const metricsFetcher = useCallback(() => fetchMetrics(Date.now() - 300_000), []);

  const { data: health, loading: healthLoading } = usePolling(healthFetcher, 2000);
  const { data: metricsData } = usePolling(metricsFetcher, 5000);

  if (healthLoading || !health) {
    return <p>Loading...</p>;
  }

  const chartData = (metricsData?.metrics ?? [])
    .reverse()
    .map((m: any) => ({
      time: new Date(m.timestamp).toLocaleTimeString(),
      published: m.messagesPublished,
      delivered: m.messagesDelivered,
      connections: m.activeConnections,
    }));

  return (
    <div>
      <h1 style={{ margin: "0 0 24px", fontSize: 24, color: "#222" }}>Overview</h1>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 30 }}>
        <StatCard label="Uptime" value={formatUptime(health.uptime)} color="#2196f3" />
        <StatCard label="Connections" value={health.activeConnections} color="#4caf50" />
        <StatCard label="Topics" value={health.activeTopics} color="#ff9800" />
        <StatCard label="Published" value={health.messagesPublished} color="#9c27b0" />
        <StatCard label="Delivered" value={health.messagesDelivered} color="#00bcd4" />
        <StatCard label="Memory" value={formatBytes(health.memoryUsage)} color="#f44336" />
      </div>

      <div style={{ background: "#fff", borderRadius: 8, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h3 style={{ margin: "0 0 16px" }}>Throughput (last 5 min)</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="published" stroke="#9c27b0" name="Published" strokeWidth={2} />
              <Line type="monotone" dataKey="delivered" stroke="#00bcd4" name="Delivered" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: "#888" }}>No metrics data yet. Metrics are recorded every 5 seconds.</p>
        )}
      </div>
    </div>
  );
}
