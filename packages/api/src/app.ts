import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { Broker } from "../../broker/src/Broker";
import { PersistenceLayer } from "../../broker/src/PersistenceLayer";
import { TokenManager, type TokenOptions } from "../../broker/src/TokenManager";

export function createApp(broker: Broker, persistence: PersistenceLayer, tokenManager?: TokenManager) {
  const app = new Hono();

  app.use("*", cors());

  // --- Dashboard Session Management ---
  const dashboardSessions = new Map<string, { username: string; createdAt: number; expiresAt: number }>();
  const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

  function generateSessionToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return "ds_" + Array.from(bytes).map(b => b.toString(36)).join("").slice(0, 40);
  }

  function validateSession(token: string | undefined): boolean {
    if (!token) return false;
    const session = dashboardSessions.get(token);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      dashboardSessions.delete(token);
      return false;
    }
    return true;
  }

  // Cleanup expired sessions periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, session] of dashboardSessions) {
      if (now > session.expiresAt) dashboardSessions.delete(key);
    }
  }, 60_000);

  // --- Dashboard Auth Endpoints (unprotected) ---

  // Check if admin account is set up
  app.get("/auth/status", (c) => {
    return c.json({ setup: persistence.isAdminSetup() });
  });

  // First-time setup: create admin account
  app.post("/auth/setup", async (c) => {
    if (persistence.isAdminSetup()) {
      return c.json({ error: "Admin account already exists" }, 409);
    }
    const body = await c.req.json<{ username: string; password: string }>();
    if (!body.username || !body.password) {
      return c.json({ error: "Username and password are required" }, 400);
    }
    if (body.username.length < 3) {
      return c.json({ error: "Username must be at least 3 characters" }, 400);
    }
    if (body.password.length < 6) {
      return c.json({ error: "Password must be at least 6 characters" }, 400);
    }
    await persistence.createAdminUser(body.username, body.password);

    // Auto-login after setup
    const token = generateSessionToken();
    dashboardSessions.set(token, {
      username: body.username,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL,
    });
    return c.json({ token, username: body.username }, 201);
  });

  // Login
  app.post("/auth/login", async (c) => {
    const body = await c.req.json<{ username: string; password: string }>();
    if (!body.username || !body.password) {
      return c.json({ error: "Username and password are required" }, 400);
    }
    const valid = await persistence.verifyAdminLogin(body.username, body.password);
    if (!valid) {
      return c.json({ error: "Invalid username or password" }, 401);
    }
    const token = generateSessionToken();
    dashboardSessions.set(token, {
      username: body.username,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL,
    });
    return c.json({ token, username: body.username });
  });

  // Verify session (used by frontend to check if still logged in)
  app.get("/auth/verify", (c) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (!validateSession(token)) {
      return c.json({ valid: false }, 401);
    }
    const session = dashboardSessions.get(token!);
    return c.json({ valid: true, username: session!.username });
  });

  // Logout
  app.post("/auth/logout", (c) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (token) dashboardSessions.delete(token);
    return c.json({ ok: true });
  });

  // --- Dashboard Auth Helper ---
  // Returns a 401 Response if the request is not authenticated, or null if OK.
  function requireDashboardAuth(c: any): Response | null {
    if (!persistence.isAdminSetup()) return null;
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (!validateSession(token)) {
      return c.json({ error: "Unauthorized — please log in to the dashboard" }, 401);
    }
    return null;
  }

  // Health check
  app.get("/health", (c) => {
    const stats = broker.getStats();
    return c.json({
      status: "ok",
      uptime: stats.uptime,
      memoryUsage: stats.memoryUsage,
      activeConnections: stats.activeConnections,
      activeTopics: stats.activeTopics,
      messagesPublished: stats.messagesPublished,
      messagesDelivered: stats.messagesDelivered,
    });
  });

  // List all active topics with subscriber counts
  app.get("/topics", (c) => {
    const authErr = requireDashboardAuth(c);
    if (authErr) return authErr;
    const topics = broker.subscriptions.getTopics().map((t) => ({
      ...t,
      messageCount: persistence.getMessageCount(t.name),
    }));
    return c.json({ topics });
  });

  // List all active connections
  app.get("/connections", (c) => {
    const authErr = requireDashboardAuth(c);
    if (authErr) return authErr;
    const connections = broker.connections.getInfo();
    return c.json({ connections });
  });

  // Get metrics history
  app.get("/metrics", (c) => {
    const authErr = requireDashboardAuth(c);
    if (authErr) return authErr;
    const since = parseInt(c.req.query("since") ?? "0", 10);
    const limit = parseInt(c.req.query("limit") ?? "100", 10);
    const metrics = persistence.getMetrics(since || Date.now() - 3600_000, limit);
    return c.json({ metrics });
  });

  // Get dead letter queue
  app.get("/dlq", (c) => {
    const authErr = requireDashboardAuth(c);
    if (authErr) return authErr;
    const limit = parseInt(c.req.query("limit") ?? "50", 10);
    const deadLetters = persistence.getDeadLetters(limit);
    return c.json({ deadLetters });
  });

  // Purge a topic's message backlog
  app.post("/admin/purge", async (c) => {
    const authErr = requireDashboardAuth(c);
    if (authErr) return authErr;
    const body = await c.req.json<{ topic: string }>();
    if (!body.topic) {
      return c.json({ error: "Missing 'topic' field" }, 400);
    }
    const deleted = persistence.purge(body.topic);
    return c.json({ purged: deleted, topic: body.topic });
  });

  // Register a durable topic
  app.post("/admin/topics/durable", async (c) => {
    const authErr = requireDashboardAuth(c);
    if (authErr) return authErr;
    const body = await c.req.json<{ topic: string }>();
    if (!body.topic) {
      return c.json({ error: "Missing 'topic' field" }, 400);
    }
    persistence.registerDurableTopic(body.topic);
    broker.subscriptions.markDurable(body.topic);
    return c.json({ status: "ok", topic: body.topic, durable: true });
  });

  // --- API Key Management ---

  // List all API keys (previews only, never exposes full key)
  app.get("/admin/api-keys", (c) => {
    const authErr = requireDashboardAuth(c);
    if (authErr) return authErr;
    const keys = persistence.getApiKeys();
    return c.json({ apiKeys: keys });
  });

  // Create a new API key
  app.post("/admin/api-keys", async (c) => {
    const authErr = requireDashboardAuth(c);
    if (authErr) return authErr;
    const body = await c.req.json<{ name: string; permissions?: string[] }>();
    if (!body.name) {
      return c.json({ error: "Missing 'name' field" }, 400);
    }
    const permissions = body.permissions ?? ["publish", "subscribe"];
    const { id, key } = persistence.createApiKey(body.name, permissions);
    // Full key is only returned on creation — store it safely
    return c.json({ id, name: body.name, key, permissions }, 201);
  });

  // Revoke an API key (soft-disable)
  app.patch("/admin/api-keys/:id/revoke", (c) => {
    const authErr = requireDashboardAuth(c);
    if (authErr) return authErr;
    const id = c.req.param("id");
    const revoked = persistence.revokeApiKey(id);
    if (!revoked) return c.json({ error: "API key not found" }, 404);
    return c.json({ status: "revoked", id });
  });

  // Delete an API key permanently
  app.delete("/admin/api-keys/:id", (c) => {
    const authErr = requireDashboardAuth(c);
    if (authErr) return authErr;
    const id = c.req.param("id");
    const deleted = persistence.deleteApiKey(id);
    if (!deleted) return c.json({ error: "API key not found" }, 404);
    return c.json({ status: "deleted", id });
  });

  // --- Connection Tokens ---

  // Generate a short-lived, single-use connection token
  app.post("/auth/token", async (c) => {
    if (!tokenManager) {
      return c.json({ error: "Token auth not enabled" }, 501);
    }

    const body = await c.req.json<{ apiKey: string; options?: TokenOptions }>();
    if (!body.apiKey) {
      return c.json({ error: "Missing 'apiKey' field" }, 400);
    }

    // Validate the API key first
    const keyRow = persistence.validateApiKey(body.apiKey);
    if (!keyRow) {
      return c.json({ error: "Invalid or revoked API key" }, 403);
    }

    // Merge API key permissions into token options
    const keyPermissions = (keyRow.permissions as string)?.split(",") ?? [];
    const opts: TokenOptions = {
      topics: body.options?.topics ?? [],
      permissions: body.options?.permissions ?? keyPermissions,
      ttl: body.options?.ttl ?? 30,
    };

    // Cap TTL to 5 minutes max
    if (opts.ttl! > 300) opts.ttl = 300;

    const token = tokenManager.createToken(keyRow.id as string, opts);

    return c.json({
      token: token.token,
      expiresAt: token.expiresAt,
      expiresIn: opts.ttl,
    }, 201);
  });

  // --- Dashboard Credentials Management ---

  // Update username
  app.patch("/auth/credentials/username", async (c) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (!validateSession(token)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const body = await c.req.json<{ newUsername: string }>();
    if (!body.newUsername || body.newUsername.length < 3) {
      return c.json({ error: "Username must be at least 3 characters" }, 400);
    }
    await persistence.updateAdminUsername(body.newUsername);
    // Update all active sessions with new username
    for (const session of dashboardSessions.values()) {
      session.username = body.newUsername;
    }
    return c.json({ ok: true, username: body.newUsername });
  });

  // Update password (requires current password)
  app.patch("/auth/credentials/password", async (c) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (!validateSession(token)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const body = await c.req.json<{ currentPassword: string; newPassword: string }>();
    if (!body.currentPassword || !body.newPassword) {
      return c.json({ error: "Current and new passwords are required" }, 400);
    }
    if (body.newPassword.length < 6) {
      return c.json({ error: "New password must be at least 6 characters" }, 400);
    }
    // Verify current password
    const session = dashboardSessions.get(token!);
    const valid = await persistence.verifyAdminLogin(session!.username, body.currentPassword);
    if (!valid) {
      return c.json({ error: "Current password is incorrect" }, 403);
    }
    await persistence.updateAdminPassword(body.newPassword);
    return c.json({ ok: true });
  });

  // Serve the built React dashboard as static files
  const uiDist = process.env.UI_DIST_PATH ?? new URL("../../ui/dist", import.meta.url).pathname;
  app.use("/*", serveStatic({ root: uiDist }));
  app.use("/*", serveStatic({ root: uiDist, path: "index.html" }));

  return app;
}
