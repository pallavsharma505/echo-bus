// ── Connection Options ──────────────────────────────────────────────

export interface EchoBusOptions {
  /** API key for authentication (eb_ prefix) */
  apiKey?: string;
  /** Single-use connection token (etk_ prefix) */
  token?: string;
  /** Auto-reconnect on disconnect (default: false) */
  autoReconnect?: boolean;
  /** Reconnect interval in ms (default: 1000) */
  reconnectInterval?: number;
  /** Max reconnect attempts (default: 10, -1 for infinite) */
  maxReconnectAttempts?: number;
}

// ── Publish Options ─────────────────────────────────────────────────

export interface PublishOptions {
  /** Custom message ID (auto-generated if omitted) */
  messageId?: string;
  /** Require subscriber acknowledgment */
  requireAck?: boolean;
}

// ── Received Message ────────────────────────────────────────────────

export interface ReceivedMessage {
  /** The topic the message was published on */
  topic: string;
  /** The message payload */
  payload: any;
  /** Unique message ID */
  messageId: string;
  /** Acknowledge successful processing */
  ack: () => void;
  /** Reject the message (sends to DLQ) */
  nack: (reason?: string) => void;
}

export type MessageHandler = (message: ReceivedMessage) => void;

// ── Stream Events ───────────────────────────────────────────────────

export interface StreamStartEvent {
  streamId: string;
  topic: string;
  metadata?: any;
}

export interface StreamDataEvent {
  streamId: string;
  topic: string;
  payload: any;
  sequence: number;
}

export interface StreamEndEvent {
  streamId: string;
  topic: string;
}

// ── RPC Types ───────────────────────────────────────────────────────

export interface RpcParamDef {
  type: string;
  description?: string;
  required?: boolean;
}

export interface RpcReturnDef {
  type: string;
  description?: string;
}

export interface RpcFunctionDef {
  name: string;
  description?: string;
  params?: Record<string, RpcParamDef>;
  returns?: RpcReturnDef;
}

export interface RpcFunctionRegistration extends RpcFunctionDef {
  /** Handler invoked when this function is called. May be sync or async. */
  handler: (args: any) => any | Promise<any>;
}

export interface RpcFunctionInfo extends RpcFunctionDef {
  executerId: string;
}

// ── Client Events ───────────────────────────────────────────────────

export interface EchoBusEvents {
  connected: () => void;
  disconnected: (info: { code: number; reason: string }) => void;
  reconnecting: (info: { attempt: number }) => void;
  error: (error: Error) => void;
  message: (message: ReceivedMessage) => void;
  "stream:start": (event: StreamStartEvent) => void;
  "stream:data": (event: StreamDataEvent) => void;
  "stream:end": (event: StreamEndEvent) => void;
}
