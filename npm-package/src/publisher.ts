import { EchoBusClient } from "./client";
import { Stream } from "./stream";
import type { EchoBusOptions, PublishOptions } from "./types";

/**
 * EchoBus publisher — publishes messages and creates data streams.
 *
 * ```ts
 * const pub = new Publisher("ws://localhost:9000/ws", { apiKey: "eb_..." });
 * await pub.connect();
 * pub.publish("orders.created", { orderId: "123" });
 * ```
 */
export class Publisher extends EchoBusClient {
  constructor(url: string, options?: EchoBusOptions) {
    super(url, options);
  }

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

  /**
   * Create a new data stream on a topic.
   * The stream is started immediately.
   *
   * ```ts
   * const stream = pub.createStream("data.export", { format: "csv" });
   * stream.write({ row: "alice,30" });
   * stream.write({ row: "bob,25" });
   * stream.end();
   * ```
   */
  createStream(topic: string, metadata?: any): Stream {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Stream(streamId, topic, metadata, this);
  }

  /** @internal — used by Stream class */
  _sendStreamStart(streamId: string, topic: string, metadata?: any): void {
    this.send({
      type: "STREAM_START",
      streamId,
      topic,
      ...(metadata !== undefined && { metadata }),
    });
  }

  /** @internal — used by Stream class */
  _sendStreamData(streamId: string, payload: any, sequence: number): void {
    this.send({ type: "STREAM_DATA", streamId, payload, sequence });
  }

  /** @internal — used by Stream class */
  _sendStreamEnd(streamId: string): void {
    this.send({ type: "STREAM_END", streamId });
  }
}
