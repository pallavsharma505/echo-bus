// In dev, Vite proxies /api -> localhost:9001 and strips the prefix.
// In production, the UI is served from the same origin as the API.
const API_BASE = import.meta.env.DEV ? "/api" : "";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("echobus_session");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`, { headers: authHeaders() });
  return res.json();
}

export async function fetchTopics() {
  const res = await fetch(`${API_BASE}/topics`, { headers: authHeaders() });
  return res.json();
}

export async function fetchConnections() {
  const res = await fetch(`${API_BASE}/connections`, { headers: authHeaders() });
  return res.json();
}

export async function fetchMetrics(since?: number) {
  const params = new URLSearchParams();
  if (since) params.set("since", since.toString());
  const res = await fetch(`${API_BASE}/metrics?${params}`, { headers: authHeaders() });
  return res.json();
}

export async function fetchDeadLetters(limit = 50) {
  const res = await fetch(`${API_BASE}/dlq?limit=${limit}`, { headers: authHeaders() });
  return res.json();
}

export async function purgeTopic(topic: string) {
  const res = await fetch(`${API_BASE}/admin/purge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ topic }),
  });
  return res.json();
}

export async function fetchApiKeys() {
  const res = await fetch(`${API_BASE}/admin/api-keys`, { headers: authHeaders() });
  return res.json();
}

export async function createApiKey(name: string, permissions: string[]) {
  const res = await fetch(`${API_BASE}/admin/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name, permissions }),
  });
  return res.json();
}

export async function revokeApiKey(id: string) {
  const res = await fetch(`${API_BASE}/admin/api-keys/${id}/revoke`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  return res.json();
}

export async function deleteApiKey(id: string) {
  const res = await fetch(`${API_BASE}/admin/api-keys/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return res.json();
}
