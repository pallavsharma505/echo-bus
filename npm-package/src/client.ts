import { EventEmitter } from "./events";
import type { EchoBusOptions } from "./types";

const DEFAULTS = {
  autoReconnect: false,
  reconnectInterval: 1000,
  maxReconnectAttempts: 10,
};

export class EchoBusClient extends EventEmitter {
  protected ws: WebSocket | null = null;
  protected readonly url: string;
  protected readonly options: Required<
    Pick<EchoBusOptions, "autoReconnect" | "reconnectInterval" | "maxReconnectAttempts">
  > &
    EchoBusOptions;

  private _reconnectCount = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _intentionalClose = false;

  constructor(url: string, options: EchoBusOptions = {}) {
    super();
    this.url = url;
    this.options = { ...DEFAULTS, ...options };
  }

  /** Whether the WebSocket connection is open */
  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** Open a WebSocket connection to the broker */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      const wsUrl = this._buildUrl();
      this.ws = new WebSocket(wsUrl);
      this._intentionalClose = false;

      let settled = false;

      this.ws.onopen = () => {
        settled = true;
        this._reconnectCount = 0;
        this.emit("connected");
        this._onConnected();
        resolve();
      };

      this.ws.onclose = (event) => {
        const info = { code: event.code, reason: event.reason };
        this.emit("disconnected", info);

        if (!settled) {
          settled = true;
          reject(new Error(`Connection closed: ${event.code} ${event.reason}`.trim()));
          return;
        }

        if (!this._intentionalClose && this.options.autoReconnect) {
          this._scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        const err = new Error("WebSocket connection error");
        this.emit("error", err);
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = typeof event.data === "string" ? event.data : String(event.data);
          const msg = JSON.parse(data);
          this._handleMessage(msg);
        } catch (e) {
          this.emit("error", new Error(`Failed to parse message: ${e}`));
        }
      };
    });
  }

  /** Close the connection */
  close(): void {
    this._intentionalClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Send a JSON message over the WebSocket */
  protected send(message: Record<string, any>): void {
    if (!this.connected) {
      throw new Error("Not connected to EchoBus broker");
    }
    this.ws!.send(JSON.stringify(message));
  }

  /**
   * Internal message handler. Subclasses override to add behaviour;
   * always call super._handleMessage(msg).
   */
  protected _handleMessage(msg: any): void {
    this.emit("raw", msg);

    if (msg.type === "ERROR") {
      this.emit("error", new Error(`[${msg.code}] ${msg.message}`));
    }
  }

  /** Hook called after every successful (re)connection. Override in subclasses. */
  protected _onConnected(): void {}

  // ── Private ──────────────────────────────────────────────────────

  private _buildUrl(): string {
    const sep = this.url.includes("?") ? "&" : "?";
    if (this.options.apiKey) {
      return `${this.url}${sep}apiKey=${encodeURIComponent(this.options.apiKey)}`;
    }
    if (this.options.token) {
      return `${this.url}${sep}token=${encodeURIComponent(this.options.token)}`;
    }
    return this.url;
  }

  private _scheduleReconnect(): void {
    const max = this.options.maxReconnectAttempts;
    if (max !== -1 && this._reconnectCount >= max) {
      this.emit("error", new Error(`Max reconnect attempts (${max}) reached`));
      return;
    }

    this._reconnectCount++;
    const backoff = Math.min(this._reconnectCount, 10);
    const delay = this.options.reconnectInterval * backoff;

    this._reconnectTimer = setTimeout(async () => {
      this.emit("reconnecting", { attempt: this._reconnectCount });
      try {
        await this.connect();
      } catch {
        // onclose will trigger the next reconnect attempt
      }
    }, delay);
  }
}
