import type { BrokerMessage } from "./types";

export function parseMessage(raw: string | Buffer): BrokerMessage | null {
  try {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const msg = JSON.parse(text);

    if (!msg || typeof msg !== "object" || !msg.type) {
      return null;
    }

    switch (msg.type) {
      case "SUBSCRIBE":
        if (typeof msg.topic !== "string" || typeof msg.id !== "string") return null;
        return { type: "SUBSCRIBE", topic: msg.topic, id: msg.id };

      case "UNSUBSCRIBE":
        if (typeof msg.topic !== "string" || typeof msg.id !== "string") return null;
        return { type: "UNSUBSCRIBE", topic: msg.topic, id: msg.id };

      case "PUBLISH":
        if (typeof msg.topic !== "string") return null;
        return {
          type: "PUBLISH",
          topic: msg.topic,
          payload: msg.payload,
          messageId: msg.messageId,
          requireAck: msg.requireAck ?? false,
        };

      case "ACK":
        if (typeof msg.messageId !== "string") return null;
        return { type: "ACK", messageId: msg.messageId };

      case "NACK":
        if (typeof msg.messageId !== "string") return null;
        return { type: "NACK", messageId: msg.messageId, reason: msg.reason };

      // --- RPC Messages ---
      case "RPC_REGISTER":
        if (!Array.isArray(msg.functions) || msg.functions.length === 0) return null;
        for (const fn of msg.functions) {
          if (typeof fn.name !== "string" || fn.name.length === 0) return null;
        }
        return { type: "RPC_REGISTER", functions: msg.functions };

      case "RPC_DISCOVER":
        return { type: "RPC_DISCOVER" };

      case "RPC_CALL":
        if (typeof msg.requestId !== "string" || typeof msg.function !== "string") return null;
        return { type: "RPC_CALL", requestId: msg.requestId, function: msg.function, args: msg.args };

      case "RPC_RESPONSE":
        if (typeof msg.requestId !== "string") return null;
        return { type: "RPC_RESPONSE", requestId: msg.requestId, result: msg.result, error: msg.error };

      // --- Streaming Messages ---
      case "STREAM_START":
        if (typeof msg.streamId !== "string" || typeof msg.topic !== "string") return null;
        return { type: "STREAM_START", streamId: msg.streamId, topic: msg.topic, metadata: msg.metadata };

      case "STREAM_DATA":
        if (typeof msg.streamId !== "string" || typeof msg.sequence !== "number") return null;
        return { type: "STREAM_DATA", streamId: msg.streamId, payload: msg.payload, sequence: msg.sequence };

      case "STREAM_END":
        if (typeof msg.streamId !== "string") return null;
        return { type: "STREAM_END", streamId: msg.streamId };

      default:
        return null;
    }
  } catch {
    return null;
  }
}
