import { Database } from "bun:sqlite";
import type { StoredMessage, MetricRecord } from "./types";
import { generateMessageId } from "./utils";

export class PersistenceLayer {
  private db: Database;

  constructor(dbPath = "echobus.db") {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Enable WAL mode for high write concurrency
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");
    this.db.run("PRAGMA cache_size = -64000"); // 64MB cache

    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        delivered_at INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS dead_letters (
        id TEXT PRIMARY KEY,
        original_message_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        payload TEXT NOT NULL,
        reason TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        messages_published INTEGER NOT NULL DEFAULT 0,
        messages_delivered INTEGER NOT NULL DEFAULT 0,
        active_connections INTEGER NOT NULL DEFAULT 0,
        active_topics INTEGER NOT NULL DEFAULT 0
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics(timestamp)
    `);

    // Durable topics config
    this.db.run(`
      CREATE TABLE IF NOT EXISTS durable_topics (
        name TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      )
    `);

    // API keys
    this.db.run(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key TEXT NOT NULL UNIQUE,
        permissions TEXT NOT NULL DEFAULT 'publish,subscribe',
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        active INTEGER NOT NULL DEFAULT 1
      )
    `);

    this.db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key)
    `);

    // Dashboard admin user (single user)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  // --- Message persistence ---

  persistMessage(topic: string, payload: unknown, messageId: string): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO messages (id, topic, payload, status, created_at, attempts)
         VALUES (?, ?, ?, 'pending', ?, 0)`
      )
      .run(messageId, topic, JSON.stringify(payload), Date.now());
  }

  markDelivered(messageId: string): void {
    this.db
      .prepare(`UPDATE messages SET status = 'delivered', delivered_at = ?, attempts = attempts + 1 WHERE id = ?`)
      .run(Date.now(), messageId);
  }

  acknowledge(messageId: string): void {
    this.db.prepare(`UPDATE messages SET status = 'acknowledged' WHERE id = ?`).run(messageId);
  }

  moveToDeadLetter(messageId: string, reason: string): void {
    const msg = this.db.prepare(`SELECT * FROM messages WHERE id = ?`).get(messageId) as any;
    if (msg) {
      this.db
        .prepare(
          `INSERT INTO dead_letters (id, original_message_id, topic, payload, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(generateMessageId(), msg.id, msg.topic, msg.payload, reason, Date.now());

      this.db.prepare(`UPDATE messages SET status = 'dead' WHERE id = ?`).run(messageId);
    }
  }

  getPendingMessages(topic: string): StoredMessage[] {
    return this.db
      .prepare(`SELECT * FROM messages WHERE topic = ? AND status = 'pending' ORDER BY created_at`)
      .all(topic) as any[];
  }

  getMessageCount(topic: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM messages WHERE topic = ? AND status IN ('pending', 'delivered')`)
      .get(topic) as any;
    return row?.count ?? 0;
  }

  purge(topic: string): number {
    const result = this.db.prepare(`DELETE FROM messages WHERE topic = ?`).run(topic);
    return result.changes;
  }

  // --- Metrics ---

  recordMetrics(published: number, delivered: number, connections: number, topics: number): void {
    this.db
      .prepare(
        `INSERT INTO metrics (timestamp, messages_published, messages_delivered, active_connections, active_topics)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(Date.now(), published, delivered, connections, topics);
  }

  getMetrics(since: number, limit = 100): MetricRecord[] {
    return this.db
      .prepare(
        `SELECT timestamp, messages_published as messagesPublished, messages_delivered as messagesDelivered,
                active_connections as activeConnections, active_topics as activeTopics
         FROM metrics WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?`
      )
      .all(since, limit) as any[];
  }

  getDeadLetters(limit = 50): any[] {
    return this.db
      .prepare(`SELECT * FROM dead_letters ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as any[];
  }

  // --- Durable topics ---

  registerDurableTopic(name: string): void {
    this.db.prepare(`INSERT OR IGNORE INTO durable_topics (name, created_at) VALUES (?, ?)`).run(name, Date.now());
  }

  getDurableTopics(): string[] {
    const rows = this.db.prepare(`SELECT name FROM durable_topics`).all() as any[];
    return rows.map((r) => r.name);
  }

  // --- API Keys ---

  createApiKey(name: string, permissions: string[]): { id: string; key: string } {
    const id = generateMessageId().replace("msg_", "key_");
    const key = `eb_${this.generateSecureToken()}`;
    this.db
      .prepare(
        `INSERT INTO api_keys (id, name, key, permissions, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, name, key, permissions.join(","), Date.now());
    return { id, key };
  }

  getApiKeys(): any[] {
    return this.db
      .prepare(`SELECT id, name, substr(key, 1, 8) || '...' as key_preview, permissions, created_at, last_used_at, active FROM api_keys ORDER BY created_at DESC`)
      .all() as any[];
  }

  revokeApiKey(id: string): boolean {
    const result = this.db.prepare(`UPDATE api_keys SET active = 0 WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  deleteApiKey(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM api_keys WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  validateApiKey(key: string): any | null {
    const row = this.db
      .prepare(`SELECT * FROM api_keys WHERE key = ? AND active = 1`)
      .get(key) as any;
    if (row) {
      this.db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).run(Date.now(), row.id);
    }
    return row;
  }

  private generateSecureToken(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      result += chars[b % chars.length];
    }
    return result;
  }

  // --- Cleanup ---

  close(): void {
    this.db.close();
  }

  // --- Dashboard Admin User ---

  isAdminSetup(): boolean {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM admin_users`).get() as any;
    return row.count > 0;
  }

  async createAdminUser(username: string, password: string): Promise<boolean> {
    if (this.isAdminSetup()) return false;
    const hash = await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
    const now = Date.now();
    this.db
      .prepare(`INSERT INTO admin_users (id, username, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?, ?)`)
      .run(username, hash, now, now);
    return true;
  }

  async verifyAdminLogin(username: string, password: string): Promise<boolean> {
    const row = this.db.prepare(`SELECT username, password_hash FROM admin_users WHERE id = 1`).get() as any;
    if (!row || row.username !== username) return false;
    return Bun.password.verify(password, row.password_hash);
  }

  getAdminUsername(): string | null {
    const row = this.db.prepare(`SELECT username FROM admin_users WHERE id = 1`).get() as any;
    return row?.username ?? null;
  }

  async updateAdminUsername(newUsername: string): Promise<boolean> {
    const result = this.db
      .prepare(`UPDATE admin_users SET username = ?, updated_at = ? WHERE id = 1`)
      .run(newUsername, Date.now());
    return result.changes > 0;
  }

  async updateAdminPassword(newPassword: string): Promise<boolean> {
    const hash = await Bun.password.hash(newPassword, { algorithm: "bcrypt", cost: 10 });
    const result = this.db
      .prepare(`UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = 1`)
      .run(hash, Date.now());
    return result.changes > 0;
  }
}
