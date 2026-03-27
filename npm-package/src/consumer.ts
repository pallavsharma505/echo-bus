import { EchoBusClient } from "./client";
import { topicMatches } from "./topic-matcher";
import type {
  EchoBusOptions,
  MessageHandler,
  ReceivedMessage,
  StreamStartEvent,
  StreamDataEvent,
  StreamEndEvent,
} from "./types";

interface Subscription {
  topic: string;
  handler?: MessageHandler;
}

/**
 * EchoBus consumer — subscribes to topics and receives messages & streams.
 *
 * ```ts
 * const sub = new Consumer("ws://localhost:9000/ws", { apiKey: "eb_..." });
 * await sub.connect();
 * await sub.subscribe("orders.*", (msg) => {
 *   console.log(msg.topic, msg.payload);
 *   msg.ack();
 * });
 * ```
 */
export class Consumer extends EchoBusClient {
  private _subscriptions = new Map<string, Subscription>();
  private _subCounter = 0;

  constructor(url: string, options?: EchoBusOptions) {
    super(url, options);
  }

  /**
   * Subscribe to a topic pattern. Supports wildcards (`*`, `#`).
   * Returns the subscription ID which can be used to unsubscribe.
   *
   * @param topic  - Topic pattern (e.g. `orders.*`, `logs.#`)
   * @param handler - Optional per-subscription message callback
   */
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

  /**
   * Unsubscribe using the subscription ID returned by `subscribe()`.
   */
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

  /** Re-subscribe to all topics after reconnect */
  protected _onConnected(): void {
    for (const [id, sub] of this._subscriptions) {
      this.send({ type: "SUBSCRIBE", topic: sub.topic, id });
    }
  }

  protected _handleMessage(msg: any): void {
    super._handleMessage(msg);

    switch (msg.type) {
      case "MESSAGE": {
        const received: ReceivedMessage = {
          topic: msg.topic,
          payload: msg.payload,
          messageId: msg.messageId,
          ack: () => this.send({ type: "ACK", messageId: msg.messageId }),
          nack: (reason?: string) =>
            this.send({ type: "NACK", messageId: msg.messageId, ...(reason && { reason }) }),
        };

        // Route to per-subscription handlers
        for (const [, sub] of this._subscriptions) {
          if (sub.handler && topicMatches(sub.topic, msg.topic)) {
            sub.handler(received);
          }
        }

        this.emit("message", received);
        break;
      }

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
    }
  }
}
