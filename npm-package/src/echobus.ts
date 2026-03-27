import { EchoBusClient } from "./client";
import { Stream } from "./stream";
import { topicMatches } from "./topic-matcher";
import type {
  EchoBusOptions,
  PublishOptions,
  MessageHandler,
  ReceivedMessage,
  StreamStartEvent,
  StreamDataEvent,
  StreamEndEvent,
  RpcFunctionDef,
  RpcFunctionRegistration,
  RpcFunctionInfo,
} from "./types";

interface Subscription {
  topic: string;
  handler?: MessageHandler;
}

/**
 * Unified EchoBus client — supports publishing, subscribing, RPC, and streaming
 * over a single WebSocket connection.
 *
 * ```ts
 * const client = new EchoBus("ws://localhost:9000/ws", { apiKey: "eb_..." });
 * await client.connect();
 *
 * // Pub/Sub
 * await client.subscribe("orders.*", (msg) => console.log(msg.payload));
 * client.publish("orders.created", { orderId: "123" });
 *
 * // RPC
 * const fns = await client.discover();
 * const result = await client.call("math.add", { a: 1, b: 2 });
 *
 * // Streaming
 * const stream = client.createStream("data.export");
 * stream.write({ row: 1 });
 * stream.end();
 * ```
 */
export class EchoBus extends EchoBusClient {
  // ── Subscriptions ──────────────────────────────────────────────
  private _subscriptions = new Map<string, Subscription>();
  private _subCounter = 0;

  // ── RPC Executer ───────────────────────────────────────────────
  private _rpcHandlers = new Map<string, (args: any) => any | Promise<any>>();
  private _functionDefs: RpcFunctionDef[] = [];

  // ── RPC Caller ─────────────────────────────────────────────────
  private _pendingCalls = new Map<
    string,
    { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private _callCounter = 0;

  constructor(url: string, options?: EchoBusOptions) {
    super(url, options);
  }

  // ── Publisher ──────────────────────────────────────────────────

  /** Publish a message to a topic */
  publish(topic: string, payload: any, options: PublishOptions = {}): void {
    this.send({
      type: "PUBLISH",
      topic,
      payload,
      ...(options.messageId && { messageId: options.messageId }),
      ...(options.requireAck && { requireAck: true }),
    });
  }

  /** Create a new data stream on a topic */
  createStream(topic: string, metadata?: any): Stream {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Stream(streamId, topic, metadata, this as any);
  }

  /** @internal */
  _sendStreamStart(streamId: string, topic: string, metadata?: any): void {
    this.send({
      type: "STREAM_START",
      streamId,
      topic,
      ...(metadata !== undefined && { metadata }),
    });
  }

  /** @internal */
  _sendStreamData(streamId: string, payload: any, sequence: number): void {
    this.send({ type: "STREAM_DATA", streamId, payload, sequence });
  }

  /** @internal */
  _sendStreamEnd(streamId: string): void {
    this.send({ type: "STREAM_END", streamId });
  }

  // ── Consumer ───────────────────────────────────────────────────

  /** Subscribe to a topic pattern. Returns the subscription ID. */
  subscribe(topic: string, handler?: MessageHandler): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = `sub_${++this._subCounter}_${Date.now()}`;

      const onRaw = (msg: any) => {
        if (msg.type === "SUBSCRIBED" && msg.id === id) {
          this.off("raw", onRaw);
          clearTimeout(timer);
          this._subscriptions.set(id, { topic, handler });
          resolve(id);
        }
      };

      this.on("raw", onRaw);
      this.send({ type: "SUBSCRIBE", topic, id });

      const timer = setTimeout(() => {
        this.off("raw", onRaw);
        reject(new Error("Subscribe timed out"));
      }, 5000);
    });
  }

  /** Unsubscribe using the subscription ID */
  unsubscribe(subscriptionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sub = this._subscriptions.get(subscriptionId);
      if (!sub) {
        reject(new Error(`Unknown subscription: ${subscriptionId}`));
        return;
      }

      const onRaw = (msg: any) => {
        if (msg.type === "UNSUBSCRIBED" && msg.id === subscriptionId) {
          this.off("raw", onRaw);
          clearTimeout(timer);
          this._subscriptions.delete(subscriptionId);
          resolve();
        }
      };

      this.on("raw", onRaw);
      this.send({ type: "UNSUBSCRIBE", topic: sub.topic, id: subscriptionId });

      const timer = setTimeout(() => {
        this.off("raw", onRaw);
        reject(new Error("Unsubscribe timed out"));
      }, 5000);
    });
  }

  // ── RPC Executer ───────────────────────────────────────────────

  /** Register RPC functions that can be called by other clients */
  register(functions: RpcFunctionRegistration[]): Promise<number> {
    return new Promise((resolve, reject) => {
      const defs: RpcFunctionDef[] = [];
      for (const fn of functions) {
        const { handler, ...def } = fn;
        this._rpcHandlers.set(fn.name, handler);
        defs.push(def);
      }
      this._functionDefs = defs;

      const onRaw = (msg: any) => {
        if (msg.type === "RPC_REGISTERED") {
          this.off("raw", onRaw);
          clearTimeout(timer);
          resolve(msg.count);
        } else if (msg.type === "ERROR") {
          this.off("raw", onRaw);
          clearTimeout(timer);
          reject(new Error(msg.message));
        }
      };

      this.on("raw", onRaw);
      this.send({ type: "RPC_REGISTER", functions: defs });

      const timer = setTimeout(() => {
        this.off("raw", onRaw);
        reject(new Error("Register timed out"));
      }, 5000);
    });
  }

  // ── RPC Caller ─────────────────────────────────────────────────

  /** Discover all available RPC functions */
  discover(): Promise<RpcFunctionInfo[]> {
    return new Promise((resolve, reject) => {
      const onRaw = (msg: any) => {
        if (msg.type === "RPC_FUNCTIONS") {
          this.off("raw", onRaw);
          clearTimeout(timer);
          resolve(msg.functions || []);
        }
      };

      this.on("raw", onRaw);
      this.send({ type: "RPC_DISCOVER" });

      const timer = setTimeout(() => {
        this.off("raw", onRaw);
        reject(new Error("Discover timed out"));
      }, 10000);
    });
  }

  /** Call a remote function and await the result */
  call(functionName: string, args?: any, timeout = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = `rpc_${++this._callCounter}_${Date.now()}`;

      const timer = setTimeout(() => {
        this._pendingCalls.delete(requestId);
        reject(new Error(`RPC call '${functionName}' timed out after ${timeout}ms`));
      }, timeout);

      this._pendingCalls.set(requestId, { resolve, reject, timer });

      this.send({
        type: "RPC_CALL",
        requestId,
        function: functionName,
        args,
      });
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  protected _onConnected(): void {
    // Re-subscribe
    for (const [id, sub] of this._subscriptions) {
      this.send({ type: "SUBSCRIBE", topic: sub.topic, id });
    }
    // Re-register RPC functions
    if (this._functionDefs.length > 0) {
      this.send({ type: "RPC_REGISTER", functions: this._functionDefs });
    }
  }

  protected _handleMessage(msg: any): void {
    super._handleMessage(msg);

    switch (msg.type) {
      // ── Pub/Sub ────────────────────────────────────────────────
      case "MESSAGE": {
        const received: ReceivedMessage = {
          topic: msg.topic,
          payload: msg.payload,
          messageId: msg.messageId,
          ack: () => this.send({ type: "ACK", messageId: msg.messageId }),
          nack: (reason?: string) =>
            this.send({ type: "NACK", messageId: msg.messageId, ...(reason && { reason }) }),
        };
        for (const [, sub] of this._subscriptions) {
          if (sub.handler && topicMatches(sub.topic, msg.topic)) {
            sub.handler(received);
          }
        }
        this.emit("message", received);
        break;
      }

      // ── Streaming ──────────────────────────────────────────────
      case "STREAM_START":
        this.emit("stream:start", {
          streamId: msg.streamId,
          topic: msg.topic,
          metadata: msg.metadata,
        } satisfies StreamStartEvent);
        break;

      case "STREAM_DATA":
        this.emit("stream:data", {
          streamId: msg.streamId,
          topic: msg.topic,
          payload: msg.payload,
          sequence: msg.sequence,
        } satisfies StreamDataEvent);
        break;

      case "STREAM_END":
        this.emit("stream:end", {
          streamId: msg.streamId,
          topic: msg.topic,
        } satisfies StreamEndEvent);
        break;

      // ── RPC (Executer) ─────────────────────────────────────────
      case "RPC_CALL":
        this._handleRpcCall(msg);
        break;

      // ── RPC (Caller) ──────────────────────────────────────────
      case "RPC_RESPONSE":
      case "RPC_ERROR": {
        const pending = this._pendingCalls.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this._pendingCalls.delete(msg.requestId);
          if (msg.type === "RPC_ERROR" || msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
        break;
      }
    }
  }

  close(): void {
    for (const [, pending] of this._pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Client disconnected"));
    }
    this._pendingCalls.clear();
    super.close();
  }

  // ── Private ────────────────────────────────────────────────────

  private async _handleRpcCall(msg: any): Promise<void> {
    const handler = this._rpcHandlers.get(msg.function);
    if (!handler) {
      this.send({
        type: "RPC_RESPONSE",
        requestId: msg.requestId,
        callerId: msg.callerId,
        error: `Function '${msg.function}' not registered locally`,
      });
      return;
    }

    try {
      const result = await handler(msg.args);
      this.send({
        type: "RPC_RESPONSE",
        requestId: msg.requestId,
        callerId: msg.callerId,
        result,
      });
    } catch (e: any) {
      this.send({
        type: "RPC_RESPONSE",
        requestId: msg.requestId,
        callerId: msg.callerId,
        error: e.message || String(e),
      });
    }
  }
}
