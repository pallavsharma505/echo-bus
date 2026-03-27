import React, { useCallback, useState } from "react";
import { usePolling } from "../hooks/usePolling";
import { fetchApiKeys, createApiKey, revokeApiKey, deleteApiKey } from "../api";

const PERMISSION_OPTIONS = ["publish", "subscribe", "admin"];

export function ApiKeysPage() {
  const fetcher = useCallback(() => fetchApiKeys(), []);
  const { data, loading, refetch } = usePolling(fetcher, 5000);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[]>(["publish", "subscribe"]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const result = await createApiKey(name.trim(), permissions);
    setCreatedKey(result.key);
    setName("");
    setPermissions(["publish", "subscribe"]);
    setCreating(false);
    refetch();
  };

  const handleRevoke = async (id: string) => {
    if (confirm("Revoke this API key? It will no longer authenticate requests.")) {
      await revokeApiKey(id);
      refetch();
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Permanently delete this API key? This cannot be undone.")) {
      await deleteApiKey(id);
      refetch();
    }
  };

  const togglePermission = (perm: string) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  if (loading || !data) return <p>Loading...</p>;

  const apiKeys = data.apiKeys ?? [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: "#222" }}>API Keys</h1>
        <button
          onClick={() => { setShowCreate(!showCreate); setCreatedKey(null); }}
          style={{
            padding: "8px 20px",
            background: "#2196f3",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {showCreate ? "Cancel" : "+ Create API Key"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ background: "#fff", borderRadius: 8, padding: 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 16px" }}>Create New API Key</h3>

          {createdKey ? (
            <div>
              <div
                style={{
                  background: "#e8f5e9",
                  border: "1px solid #a5d6a7",
                  borderRadius: 6,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 13, color: "#2e7d32", fontWeight: 600, marginBottom: 8 }}>
                  ✅ API Key Created — copy it now, it won't be shown again!
                </div>
                <code
                  style={{
                    display: "block",
                    padding: "10px 14px",
                    background: "#fff",
                    borderRadius: 4,
                    fontSize: 14,
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                    userSelect: "all",
                  }}
                >
                  {createdKey}
                </code>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(createdKey); }}
                style={{ padding: "6px 16px", background: "#4caf50", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", marginRight: 8 }}
              >
                📋 Copy to Clipboard
              </button>
              <button
                onClick={() => { setShowCreate(false); setCreatedKey(null); }}
                style={{ padding: "6px 16px", background: "#eee", color: "#333", border: "none", borderRadius: 4, cursor: "pointer" }}
              >
                Done
              </button>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, color: "#666", marginBottom: 4 }}>Key Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. production-publisher, worker-service"
                  style={{
                    width: "100%",
                    maxWidth: 400,
                    padding: "8px 12px",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, color: "#666", marginBottom: 6 }}>Permissions</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {PERMISSION_OPTIONS.map((perm) => (
                    <label
                      key={perm}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 4,
                        border: `1px solid ${permissions.includes(perm) ? "#2196f3" : "#ddd"}`,
                        background: permissions.includes(perm) ? "#e3f2fd" : "#fafafa",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={permissions.includes(perm)}
                        onChange={() => togglePermission(perm)}
                      />
                      {perm}
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={!name.trim() || permissions.length === 0 || creating}
                style={{
                  padding: "8px 24px",
                  background: !name.trim() || permissions.length === 0 ? "#ccc" : "#4caf50",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: !name.trim() ? "default" : "pointer",
                  fontSize: 14,
                }}
              >
                {creating ? "Creating..." : "Generate Key"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Keys table */}
      {apiKeys.length === 0 ? (
        <div style={{ background: "#fff", padding: 40, borderRadius: 8, textAlign: "center", color: "#888" }}>
          No API keys yet. Create one to authenticate publishers and consumers.
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
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Name</th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Key</th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Permissions</th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Status</th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Created</th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Last Used</th>
              <th style={{ padding: "12px 16px", fontSize: 12, color: "#888", textTransform: "uppercase" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((k: any) => (
              <tr key={k.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "10px 16px", fontWeight: 600 }}>{k.name}</td>
                <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 13, color: "#666" }}>
                  {k.key_preview}
                </td>
                <td style={{ padding: "10px 16px" }}>
                  {k.permissions.split(",").map((p: string) => (
                    <span
                      key={p}
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        background: p === "admin" ? "#fff3e0" : "#e3f2fd",
                        borderRadius: 4,
                        fontSize: 12,
                        marginRight: 4,
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      background: k.active ? "#e8f5e9" : "#ffebee",
                      color: k.active ? "#2e7d32" : "#c62828",
                    }}
                  >
                    {k.active ? "Active" : "Revoked"}
                  </span>
                </td>
                <td style={{ padding: "10px 16px", fontSize: 13, color: "#666" }}>
                  {new Date(k.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: "10px 16px", fontSize: 13, color: "#666" }}>
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {k.active ? (
                      <button
                        onClick={() => handleRevoke(k.id)}
                        style={{ padding: "4px 10px", background: "#ff9800", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
                      >
                        Revoke
                      </button>
                    ) : null}
                    <button
                      onClick={() => handleDelete(k.id)}
                      style={{ padding: "4px 10px", background: "#f44336", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
