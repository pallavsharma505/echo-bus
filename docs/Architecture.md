# System Architecture

EchoBus follows a centralized broker pattern using WebSockets for bi-directional, low-latency communication. Beyond basic pub/sub, it supports RPC routing, real-time streaming, and token-based authentication.

## Core Components

### 1. WebSocket Server (Broker)

The heart of EchoBus. Uses `Bun.serve()` with WebSocket upgrade handling. In-memory `Map`/`Set` structures provide O(1) routing lookups. Responsible for pub/sub fan-out, RPC call routing, and stream management.

### 2. Connection Manager

Tracks every connected client with metadata:
- `id` — unique connection identifier
- `remoteAddress` — client IP
- `connectedAt` — connection timestamp
- `subscriptions` — set of subscribed topics
- `role` — client role
- `registeredFunctions` — RPC functions this client can execute

### 3. Subscription Manager

Routes messages from topics to subscribers. Supports wildcard matching:
- `*` — matches a single segment (e.g. `orders.*` matches `orders.created`)
- `#` — matches zero or more segments (e.g. `orders.#` matches `orders.eu.created`)

### 4. Persistence Layer (SQLite)

Uses `bun:sqlite` in WAL (Write-Ahead Logging) mode for high write concurrency without blocking the event loop. All writes are asynchronous.

| Table           | Purpose                              |
|-----------------|--------------------------------------|
| `messages`      | Persisted messages for durable topics |
| `dead_letters`  | Failed/undeliverable messages (DLQ)  |
| `metrics`       | Time-series data for the dashboard   |
| `durable_topics`| Topic durability configuration       |
| `api_keys`      | Authentication credentials           |

### 5. Token Manager

In-memory store for short-lived, single-use connection tokens. Tokens are generated via the Management API and automatically cleaned up on expiration.

### 6. Management API (HonoJS)

REST API running on port **9001**. Provides endpoints for broker management, metrics, and authentication. In production, also serves the built React dashboard as static files.

### 7. Dashboard (React + Vite)

Monitoring UI with 7 pages and Recharts-powered graphs. In development, Vite runs on port 5173 with a dev proxy to the API. In production, the built assets are served directly by HonoJS.

---

## Entry Points

| Entry Point                        | Description                                  |
|------------------------------------|----------------------------------------------|
| `packages/broker/src/index.ts`     | Standalone broker (WebSocket server only)     |
| `packages/api/src/index.ts`        | Combined broker + API (main production entry) |

## Ports

| Port   | Service                |
|--------|------------------------|
| `9000` | WebSocket broker       |
| `9001` | HTTP API + Dashboard   |
| `5173` | Vite dev server (dev)  |

---

## Subsystems

### Pub/Sub Flow

```
  Publisher                 Broker                  Subscribers
     │                       │                       │
     │  PUBLISH(topic, msg)  │                       │
     │──────────────────────>│                       │
     │                       │  lookup topic in Map  │
     │                       │──────┐                │
     │                       │<─────┘                │
     │                       │                       │
     │                       │  fan-out to all subs  │
     │                       │──────────────────────>│ Sub A
     │                       │──────────────────────>│ Sub B
     │                       │──────────────────────>│ Sub C
```

1. **Publisher** connects via WS and sends a `PUBLISH` payload to a topic.
2. **Broker** receives the message. If the topic is durable, it asynchronously writes to SQLite.
3. **Broker** looks up the topic in its in-memory Map and fans out to all matching subscribers (including wildcard matches).
4. **Subscribers** receive the message and optionally send an `ACK`.

### RPC Routing

```
  Producer              Broker                    Executer
     │                    │                          │
     │                    │  RPC_REGISTER(functions)  │
     │                    │<─────────────────────────│
     │                    │  (stored per-connection)  │
     │                    │                          │
     │  RPC_CALL(fn, args)│                          │
     │───────────────────>│                          │
     │                    │  find executer (random)  │
     │                    │──────┐                   │
     │                    │<─────┘                   │
     │                    │  forward call            │
     │                    │─────────────────────────>│
     │                    │                          │
     │                    │       RPC_RESPONSE       │
     │                    │<─────────────────────────│
     │   RPC_RESPONSE     │                          │
     │<───────────────────│                          │
```

1. **Executer** connects and registers functions — stored in `ConnectionManager` per-connection.
2. **Producer** sends an `RPC_CALL` — broker finds an available executer at random (for load distribution).
3. Broker forwards the call and tracks it in a `pendingRpcCalls` map.
4. **Executer** processes and returns an `RPC_RESPONSE` — broker routes it back to the original caller.
5. **Timeout:** 30 seconds. If the executer disconnects, the broker sends `RPC_ERROR` to all pending callers.

### Streaming

```
  Publisher              Broker                   Subscribers
     │                     │                          │
     │  STREAM_START       │                          │
     │────────────────────>│  store in activeStreams   │
     │                     │─────────────────────────>│  STREAM_START
     │                     │                          │
     │  STREAM_DATA(seq=1) │                          │
     │────────────────────>│─────────────────────────>│  STREAM_DATA(seq=1)
     │  STREAM_DATA(seq=2) │                          │
     │────────────────────>│─────────────────────────>│  STREAM_DATA(seq=2)
     │                     │                          │
     │  STREAM_END         │                          │
     │────────────────────>│  cleanup activeStreams    │
     │                     │─────────────────────────>│  STREAM_END
```

1. **Publisher** sends `STREAM_START` — broker stores it in the `activeStreams` map and fans out to subscribers.
2. **Publisher** sends `STREAM_DATA` frames with sequence numbers — broker relays each to subscribers.
3. **Publisher** sends `STREAM_END` — broker cleans up the stream from `activeStreams` and notifies subscribers.
4. **Disconnect:** If the publisher disconnects mid-stream, the broker automatically cleans up.

### Auth Flow

```
  Backend               API (9001)            Browser              Broker (9000)
     │                     │                     │                      │
     │  POST /auth/token   │                     │                      │
     │  (with API key)     │                     │                      │
     │────────────────────>│                     │                      │
     │   { token: "abc" }  │                     │                      │
     │<────────────────────│                     │                      │
     │                     │                     │                      │
     │   pass token to UI  │                     │                      │
     │─────────────────────────────────────────>│                      │
     │                     │                     │  ws://..:9000?token= │
     │                     │                     │─────────────────────>│
     │                     │                     │     upgrade / 401    │
     │                     │                     │<─────────────────────│
```

Two authentication methods, both checked in the `fetch()` handler before WebSocket upgrade:

- **API Key** — Client passes `?apiKey=` on the WebSocket URL. Validated against the `api_keys` table.
- **Connection Token** — For browser clients. Backend calls `POST /auth/token` with an API key to get a short-lived, single-use token. Frontend connects with `?token=`.

**Rejection codes:** `401` (missing credentials), `403` (invalid credentials).
