// Shared type definitions for EchoBus

// --- RPC Function Definition ---
export interface RpcFunctionDef {
  name: string;
  description?: string;
  params?: Record<string, { type: string; description?: string; required?: boolean }>;
  returns?: { type: string; description?: string };
}

// --- Client → Broker Messages ---
export type BrokerMessage =
  | { type: "SUBSCRIBE"; topic: string; id: string }
  | { type: "UNSUBSCRIBE"; topic: string; id: string }
  | { type: "PUBLISH"; topic: string; payload: unknown; messageId?: string; requireAck?: boolean }
  | { type: "ACK"; messageId: string }
  | { type: "NACK"; messageId: string; reason?: string }
  // RPC messages
  | { type: "RPC_REGISTER"; functions: RpcFunctionDef[] }
  | { type: "RPC_DISCOVER" }
  | { type: "RPC_CALL"; requestId: string; function: string; args?: unknown }
  | { type: "RPC_RESPONSE"; requestId: string; result?: unknown; error?: string }
  // Streaming messages
  | { type: "STREAM_START"; streamId: string; topic: string; metadata?: unknown }
  | { type: "STREAM_DATA"; streamId: string; payload: unknown; sequence: number }
  | { type: "STREAM_END"; streamId: string };

// --- Broker → Client Messages ---
export type ServerMessage =
  | { type: "MESSAGE"; topic: string; payload: unknown; messageId: string }
  | { type: "ACK_CONFIRM"; messageId: string }
  | { type: "ERROR"; code: string; message: string }
  | { type: "SUBSCRIBED"; topic: string; id: string }
  | { type: "UNSUBSCRIBED"; topic: string; id: string }
  // RPC messages
  | { type: "RPC_REGISTERED"; count: number }
  | { type: "RPC_FUNCTIONS"; functions: (RpcFunctionDef & { executerId: string })[] }
  | { type: "RPC_CALL"; requestId: string; function: string; args?: unknown; callerId: string }
  | { type: "RPC_RESPONSE"; requestId: string; result?: unknown; error?: string }
  | { type: "RPC_ERROR"; requestId: string; error: string }
  // Streaming messages
  | { type: "STREAM_START"; streamId: string; topic: string; metadata?: unknown }
  | { type: "STREAM_DATA"; streamId: string; topic: string; payload: unknown; sequence: number }
  | { type: "STREAM_END"; streamId: string; topic: string };

export interface TopicConfig {
  name: string;
  durable: boolean;
  requireAck: boolean;
}

export interface StoredMessage {
  id: string;
  topic: string;
  payload: string;
  status: "pending" | "delivered" | "acknowledged" | "dead";
  createdAt: number;
  deliveredAt: number | null;
  attempts: number;
}

export interface MetricRecord {
  timestamp: number;
  messagesPublished: number;
  messagesDelivered: number;
  activeConnections: number;
  activeTopics: number;
}

export interface BrokerStats {
  uptime: number;
  messagesPublished: number;
  messagesDelivered: number;
  activeConnections: number;
  activeTopics: number;
  memoryUsage: number;
}

export interface TopicInfo {
  name: string;
  subscriberCount: number;
  durable: boolean;
  messageCount: number;
}

export interface ConnectionInfo {
  id: string;
  remoteAddress: string;
  connectedAt: number;
  subscriptions: string[];
  role?: string;
  registeredFunctions?: string[];
}
