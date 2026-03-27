import type { Server, ServerWebSocket } from "bun";
import { ConnectionManager, type ClientData } from "./ConnectionManager";
import { SubscriptionManager } from "./SubscriptionManager";
import { parseMessage } from "./protocol";
import { generateClientId, generateMessageId } from "./utils";
import type { BrokerMessage, ServerMessage, BrokerStats } from "./types";

export interface BrokerOptions {
  port: number;
  maxPayloadSize?: number;
  requireAuth?: boolean;
  rpcTimeout?: number; // ms, default 30000
}

interface PendingRpcCall {
  callerId: string;
  executerId: string;
  timer: ReturnType<typeof setTimeout>;
}

interface ActiveStream {
  topic: string;
  publisherId: string;
  startedAt: number;
}

export class Broker {
  readonly connections: ConnectionManager;
  readonly subscriptions: SubscriptionManager;
  private server: Server | null = null;
  private startTime = Date.now();
  private stats = {
    messagesPublished: 0,
    messagesDelivered: 0,
    rpcCalls: 0,
    streamsStarted: 0,
  };

  // Map of requestId → pending call info (for routing RPC responses)
  private pendingRpcCalls = new Map<string, PendingRpcCall>();
  private rpcTimeout: number;

  // Map of streamId → active stream info
  private activeStreams = new Map<string, ActiveStream>();

  // Persistence hooks — set by the persistence layer
  onPersistMessage?: (topic: string, payload: unknown, messageId: string) => void;
  onAcknowledge?: (messageId: string) => void;
  onDeadLetter?: (messageId: string, reason: string) => void;
  onMetricTick?: () => void;

  // Auth hook — set by the entry point to validate API keys
  onAuthenticateKey?: (key: string) => { valid: boolean; permissions?: string };
  // Token auth hook — set by the entry point to consume a connection token
  onAuthenticateToken?: (token: string) => { valid: boolean; permissions?: string };

  constructor(private options: BrokerOptions) {
    this.connections = new ConnectionManager();
    this.subscriptions = new SubscriptionManager();
    this.rpcTimeout = options.rpcTimeout ?? 30_000;
  }

  start(): Server {
    const broker = this;

    this.server = Bun.serve<ClientData>({
      port: this.options.port,
      fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade
        if (url.pathname === "/ws" || url.pathname === "/") {
          // Authenticate if auth is enabled
          if (broker.options.requireAuth) {
            const apiKey = url.searchParams.get("apiKey");
            const token = url.searchParams.get("token");

            if (!apiKey && !token) {
              return new Response(JSON.stringify({ error: "Missing apiKey or token query parameter" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
              });
            }

            // Try token first (preferred for browser clients), then API key
            let authResult: { valid: boolean; permissions?: string } | undefined;
            if (token) {
              authResult = broker.onAuthenticateToken?.(token);
            } else if (apiKey) {
              authResult = broker.onAuthenticateKey?.(apiKey);
            }

            if (!authResult?.valid) {
              const msg = token
                ? "Invalid, expired, or already-used connection token"
                : "Invalid or revoked API key";
              return new Response(JSON.stringify({ error: msg }), {
                status: 403,
                headers: { "Content-Type": "application/json" },
              });
            }
          }

          const clientId = generateClientId();
          const upgraded = server.upgrade(req, {
            data: {
              id: clientId,
              remoteAddress: server.requestIP(req)?.address ?? "unknown",
              connectedAt: Date.now(),
              subscriptions: new Set<string>(),
              role: "default" as const,
              registeredFunctions: [],
            },
          });
          if (!upgraded) {
            return new Response("WebSocket upgrade failed", { status: 400 });
          }
          return undefined;
        }

        return new Response("EchoBus Broker — connect via WebSocket at /ws", {
          status: 200,
        });
      },

      websocket: {
        maxPayloadLength: broker.options.maxPayloadSize ?? 1024 * 1024, // 1MB
        idleTimeout: 120,

        open(ws) {
          broker.connections.add(ws);
          console.log(`[connect] ${ws.data.id} from ${ws.data.remoteAddress}`);
        },

        message(ws, rawMessage) {
          broker.handleMessage(ws, rawMessage);
        },

        close(ws) {
          console.log(`[disconnect] ${ws.data.id}`);
          // Clean up any pending RPC calls involving this client
          broker.cleanupPendingRpcCalls(ws.data.id);
          // Clean up any active streams owned by this client
          broker.cleanupActiveStreams(ws.data.id);
          broker.subscriptions.removeClient(ws.data.id);
          broker.connections.remove(ws.data.id);
        },
      },
    });

    console.log(`🐇 EchoBus Broker listening on ws://localhost:${this.server.port}/ws`);

    // Start metrics tick (every 5 seconds)
    setInterval(() => {
      this.onMetricTick?.();
    }, 5000);

    return this.server;
  }

  private handleMessage(ws: ServerWebSocket<ClientData>, rawMessage: string | Buffer): void {
    const msg = parseMessage(rawMessage);

    if (!msg) {
      this.send(ws, {
        type: "ERROR",
        code: "INVALID_MESSAGE",
        message: "Could not parse message. Expected valid JSON with a 'type' field.",
      });
      return;
    }

    switch (msg.type) {
      case "SUBSCRIBE":
        this.handleSubscribe(ws, msg);
        break;
      case "UNSUBSCRIBE":
        this.handleUnsubscribe(ws, msg);
        break;
      case "PUBLISH":
        this.handlePublish(ws, msg);
        break;
      case "ACK":
        this.handleAck(msg);
        break;
      case "NACK":
        this.handleNack(msg);
        break;
      case "RPC_REGISTER":
        this.handleRpcRegister(ws, msg);
        break;
      case "RPC_DISCOVER":
        this.handleRpcDiscover(ws);
        break;
      case "RPC_CALL":
        this.handleRpcCall(ws, msg);
        break;
      case "RPC_RESPONSE":
        this.handleRpcResponse(ws, msg);
        break;
      case "STREAM_START":
        this.handleStreamStart(ws, msg);
        break;
      case "STREAM_DATA":
        this.handleStreamData(ws, msg);
        break;
      case "STREAM_END":
        this.handleStreamEnd(ws, msg);
        break;
    }
  }

  private handleSubscribe(
    ws: ServerWebSocket<ClientData>,
    msg: Extract<BrokerMessage, { type: "SUBSCRIBE" }>
  ): void {
    this.subscriptions.subscribe(msg.topic, ws.data.id);
    ws.data.subscriptions.add(msg.topic);
    console.log(`[subscribe] ${ws.data.id} -> ${msg.topic}`);
    this.send(ws, { type: "SUBSCRIBED", topic: msg.topic, id: msg.id });
  }

  private handleUnsubscribe(
    ws: ServerWebSocket<ClientData>,
    msg: Extract<BrokerMessage, { type: "UNSUBSCRIBE" }>
  ): void {
    this.subscriptions.unsubscribe(msg.topic, ws.data.id);
    ws.data.subscriptions.delete(msg.topic);
    console.log(`[unsubscribe] ${ws.data.id} -> ${msg.topic}`);
    this.send(ws, { type: "UNSUBSCRIBED", topic: msg.topic, id: msg.id });
  }

  private handlePublish(
    ws: ServerWebSocket<ClientData>,
    msg: Extract<BrokerMessage, { type: "PUBLISH" }>
  ): void {
    const messageId = msg.messageId ?? generateMessageId();
    this.stats.messagesPublished++;

    // Persist if the topic is durable or ack is required
    if (msg.requireAck || this.subscriptions.isDurable(msg.topic)) {
      this.onPersistMessage?.(msg.topic, msg.payload, messageId);
    }

    // Fan out to all matching subscribers
    const subscriberIds = this.subscriptions.getSubscribers(msg.topic);

    for (const subId of subscriberIds) {
      const subWs = this.connections.get(subId);
      if (subWs) {
        const outgoing: ServerMessage = {
          type: "MESSAGE",
          topic: msg.topic,
          payload: msg.payload,
          messageId,
        };
        this.send(subWs, outgoing);
        this.stats.messagesDelivered++;
      }
    }

    console.log(
      `[publish] ${msg.topic} -> ${subscriberIds.length} subscriber(s), msgId=${messageId}`
    );
  }

  private handleAck(msg: Extract<BrokerMessage, { type: "ACK" }>): void {
    this.onAcknowledge?.(msg.messageId);
  }

  private handleNack(msg: Extract<BrokerMessage, { type: "NACK" }>): void {
    this.onDeadLetter?.(msg.messageId, msg.reason ?? "Client NACK");
  }

  // --- RPC Handlers ---

  private handleRpcRegister(
    ws: ServerWebSocket<ClientData>,
    msg: Extract<BrokerMessage, { type: "RPC_REGISTER" }>
  ): void {
    ws.data.role = "executer";
    ws.data.registeredFunctions = msg.functions;
    console.log(`[rpc:register] ${ws.data.id} registered ${msg.functions.length} function(s): ${msg.functions.map((f) => f.name).join(", ")}`);
    this.send(ws, { type: "RPC_REGISTERED", count: msg.functions.length });
  }

  private handleRpcDiscover(ws: ServerWebSocket<ClientData>): void {
    const functions = this.connections.getAllRegisteredFunctions();
    console.log(`[rpc:discover] ${ws.data.id} → ${functions.length} function(s) available`);
    this.send(ws, { type: "RPC_FUNCTIONS", functions });
  }

  private handleRpcCall(
    ws: ServerWebSocket<ClientData>,
    msg: Extract<BrokerMessage, { type: "RPC_CALL" }>
  ): void {
    const executers = this.connections.getExecutersForFunction(msg.function);

    if (executers.length === 0) {
      this.send(ws, {
        type: "RPC_ERROR",
        requestId: msg.requestId,
        error: `No executer available for function "${msg.function}"`,
      });
      return;
    }

    // Round-robin: pick a random executer for load distribution
    const executer = executers[Math.floor(Math.random() * executers.length)];

    // Set up timeout
    const timer = setTimeout(() => {
      this.pendingRpcCalls.delete(msg.requestId);
      const callerWs = this.connections.get(ws.data.id);
      if (callerWs) {
        this.send(callerWs, {
          type: "RPC_ERROR",
          requestId: msg.requestId,
          error: `RPC call to "${msg.function}" timed out after ${this.rpcTimeout}ms`,
        });
      }
    }, this.rpcTimeout);

    // Track pending call
    this.pendingRpcCalls.set(msg.requestId, {
      callerId: ws.data.id,
      executerId: executer.data.id,
      timer,
    });

    this.stats.rpcCalls++;

    // Forward call to executer
    this.send(executer, {
      type: "RPC_CALL",
      requestId: msg.requestId,
      function: msg.function,
      args: msg.args,
      callerId: ws.data.id,
    });

    console.log(`[rpc:call] ${ws.data.id} → ${executer.data.id}.${msg.function}() reqId=${msg.requestId}`);
  }

  private handleRpcResponse(
    ws: ServerWebSocket<ClientData>,
    msg: Extract<BrokerMessage, { type: "RPC_RESPONSE" }>
  ): void {
    const pending = this.pendingRpcCalls.get(msg.requestId);
    if (!pending) {
      // Already timed out or unknown request
      this.send(ws, {
        type: "ERROR",
        code: "UNKNOWN_REQUEST",
        message: `No pending RPC call for requestId "${msg.requestId}"`,
      });
      return;
    }

    // Clear timeout
    clearTimeout(pending.timer);
    this.pendingRpcCalls.delete(msg.requestId);

    // Forward response to the original caller
    const callerWs = this.connections.get(pending.callerId);
    if (callerWs) {
      this.send(callerWs, {
        type: "RPC_RESPONSE",
        requestId: msg.requestId,
        result: msg.result,
        error: msg.error,
      });
      console.log(`[rpc:response] ${ws.data.id} → ${pending.callerId} reqId=${msg.requestId}`);
    }
  }

  private cleanupPendingRpcCalls(clientId: string): void {
    for (const [requestId, pending] of this.pendingRpcCalls) {
      if (pending.executerId === clientId) {
        // Executer disconnected — notify the caller
        clearTimeout(pending.timer);
        this.pendingRpcCalls.delete(requestId);
        const callerWs = this.connections.get(pending.callerId);
        if (callerWs) {
          this.send(callerWs, {
            type: "RPC_ERROR",
            requestId,
            error: "Executer disconnected before responding",
          });
        }
      } else if (pending.callerId === clientId) {
        // Caller disconnected — clean up the pending entry
        clearTimeout(pending.timer);
        this.pendingRpcCalls.delete(requestId);
      }
    }
  }

  // --- Stream Handlers ---

  private handleStreamStart(
    ws: ServerWebSocket<ClientData>,
    msg: Extract<BrokerMessage, { type: "STREAM_START" }>
  ): void {
    if (this.activeStreams.has(msg.streamId)) {
      this.send(ws, {
        type: "ERROR",
        code: "STREAM_EXISTS",
        message: `Stream "${msg.streamId}" is already active`,
      });
      return;
    }

    this.activeStreams.set(msg.streamId, {
      topic: msg.topic,
      publisherId: ws.data.id,
      startedAt: Date.now(),
    });

    this.stats.streamsStarted++;

    // Fan out STREAM_START to all topic subscribers
    const subscriberIds = this.subscriptions.getSubscribers(msg.topic);
    for (const subId of subscriberIds) {
      const subWs = this.connections.get(subId);
      if (subWs) {
        this.send(subWs, {
          type: "STREAM_START",
          streamId: msg.streamId,
          topic: msg.topic,
          metadata: msg.metadata,
        });
      }
    }

    console.log(`[stream:start] ${ws.data.id} stream=${msg.streamId} topic=${msg.topic} → ${subscriberIds.length} subscriber(s)`);
  }

  private handleStreamData(
    ws: ServerWebSocket<ClientData>,
    msg: Extract<BrokerMessage, { type: "STREAM_DATA" }>
  ): void {
    const stream = this.activeStreams.get(msg.streamId);
    if (!stream) {
      this.send(ws, {
        type: "ERROR",
        code: "UNKNOWN_STREAM",
        message: `No active stream with id "${msg.streamId}"`,
      });
      return;
    }

    if (stream.publisherId !== ws.data.id) {
      this.send(ws, {
        type: "ERROR",
        code: "NOT_STREAM_OWNER",
        message: `You are not the owner of stream "${msg.streamId}"`,
      });
      return;
    }

    // Fan out STREAM_DATA to all topic subscribers
    const subscriberIds = this.subscriptions.getSubscribers(stream.topic);
    for (const subId of subscriberIds) {
      const subWs = this.connections.get(subId);
      if (subWs) {
        this.send(subWs, {
          type: "STREAM_DATA",
          streamId: msg.streamId,
          topic: stream.topic,
          payload: msg.payload,
          sequence: msg.sequence,
        });
        this.stats.messagesDelivered++;
      }
    }
  }

  private handleStreamEnd(
    ws: ServerWebSocket<ClientData>,
    msg: Extract<BrokerMessage, { type: "STREAM_END" }>
  ): void {
    const stream = this.activeStreams.get(msg.streamId);
    if (!stream) {
      this.send(ws, {
        type: "ERROR",
        code: "UNKNOWN_STREAM",
        message: `No active stream with id "${msg.streamId}"`,
      });
      return;
    }

    if (stream.publisherId !== ws.data.id) {
      this.send(ws, {
        type: "ERROR",
        code: "NOT_STREAM_OWNER",
        message: `You are not the owner of stream "${msg.streamId}"`,
      });
      return;
    }

    this.activeStreams.delete(msg.streamId);

    // Fan out STREAM_END to all topic subscribers
    const subscriberIds = this.subscriptions.getSubscribers(stream.topic);
    for (const subId of subscriberIds) {
      const subWs = this.connections.get(subId);
      if (subWs) {
        this.send(subWs, {
          type: "STREAM_END",
          streamId: msg.streamId,
          topic: stream.topic,
        });
      }
    }

    console.log(`[stream:end] ${ws.data.id} stream=${msg.streamId} topic=${stream.topic}`);
  }

  private cleanupActiveStreams(clientId: string): void {
    for (const [streamId, stream] of this.activeStreams) {
      if (stream.publisherId === clientId) {
        this.activeStreams.delete(streamId);
        // Notify subscribers that the stream was aborted
        const subscriberIds = this.subscriptions.getSubscribers(stream.topic);
        for (const subId of subscriberIds) {
          const subWs = this.connections.get(subId);
          if (subWs) {
            this.send(subWs, {
              type: "STREAM_END",
              streamId,
              topic: stream.topic,
            });
          }
        }
        console.log(`[stream:abort] stream=${streamId} topic=${stream.topic} (publisher disconnected)`);
      }
    }
  }

  private send(ws: ServerWebSocket<ClientData>, msg: ServerMessage): void {
    ws.send(JSON.stringify(msg));
  }

  getStats(): BrokerStats & { rpcCalls: number; streamsStarted: number; activeStreams: number } {
    return {
      uptime: Date.now() - this.startTime,
      messagesPublished: this.stats.messagesPublished,
      messagesDelivered: this.stats.messagesDelivered,
      activeConnections: this.connections.count,
      activeTopics: this.subscriptions.topicCount,
      memoryUsage: process.memoryUsage().heapUsed,
      rpcCalls: this.stats.rpcCalls,
      streamsStarted: this.stats.streamsStarted,
      activeStreams: this.activeStreams.size,
    };
  }

  stop(): void {
    // Clean up all pending RPC timeouts
    for (const [, pending] of this.pendingRpcCalls) {
      clearTimeout(pending.timer);
    }
    this.pendingRpcCalls.clear();
    this.activeStreams.clear();
    this.server?.stop();
    this.server = null;
  }
}
