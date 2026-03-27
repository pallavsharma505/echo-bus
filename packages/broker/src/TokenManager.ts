import { generateMessageId } from "./utils";

export interface TokenOptions {
  /** Allowed topics (empty = all topics) */
  topics?: string[];
  /** Allowed roles: publish, subscribe, rpc_producer, rpc_executer */
  permissions?: string[];
  /** Time-to-live in seconds (default: 30) */
  ttl?: number;
}

export interface ConnectionToken {
  token: string;
  apiKeyId: string;
  options: TokenOptions;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export class TokenManager {
  private tokens = new Map<string, ConnectionToken>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(private cleanupIntervalMs = 10_000) {
    // Periodically purge expired tokens
    this.cleanupInterval = setInterval(() => this.purgeExpired(), cleanupIntervalMs);
  }

  /** Create a short-lived, single-use connection token */
  createToken(apiKeyId: string, options: TokenOptions = {}): ConnectionToken {
    const ttl = options.ttl ?? 30;
    const now = Date.now();
    const token: ConnectionToken = {
      token: `etk_${this.generateSecureToken(32)}`,
      apiKeyId,
      options: {
        topics: options.topics ?? [],
        permissions: options.permissions ?? [],
        ttl,
      },
      createdAt: now,
      expiresAt: now + ttl * 1000,
      used: false,
    };
    this.tokens.set(token.token, token);
    return token;
  }

  /**
   * Consume a token. Returns the token data if valid, null otherwise.
   * Marks as used on first call — subsequent calls return null (single-use).
   */
  consumeToken(tokenStr: string): ConnectionToken | null {
    const token = this.tokens.get(tokenStr);
    if (!token) return null;
    if (token.used) return null;
    if (Date.now() > token.expiresAt) {
      this.tokens.delete(tokenStr);
      return null;
    }
    // Mark used and delete from store
    token.used = true;
    this.tokens.delete(tokenStr);
    return token;
  }

  /** Get count of active (unexpired, unused) tokens */
  get activeCount(): number {
    const now = Date.now();
    let count = 0;
    for (const t of this.tokens.values()) {
      if (!t.used && now <= t.expiresAt) count++;
    }
    return count;
  }

  /** Purge all expired tokens */
  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, token] of this.tokens) {
      if (now > token.expiresAt) {
        this.tokens.delete(key);
      }
    }
  }

  /** Stop the cleanup interval (for graceful shutdown / tests) */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.tokens.clear();
  }

  private generateSecureToken(length: number): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      result += chars[b % chars.length];
    }
    return result;
  }
}
