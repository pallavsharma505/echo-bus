# 🐇 EchoBus — Website Reference for Frontend Developers

> Everything you need to build the EchoBus marketing/landing website.

---

## 1. Product Identity

| Field | Value |
|-------|-------|
| **Product Name** | EchoBus |
| **Tagline** | A high-performance, lightweight Pub/Sub message broker built on WebSockets and TypeScript, powered by Bun |
| **Subtitle** | A simpler, embeddable alternative to heavy message brokers like RabbitMQ — tailored for real-time web applications |
| **Logo** | `/Logo.png` (PNG, rabbit-themed) |
| **Emoji/Icon** | 🐇 (used throughout branding) |
| **Category** | Message Broker · Event Streaming · Real-Time Infrastructure |

### Differentiators (Hero Section Copy)

| Bullet | Description |
|--------|-------------|
| ⚡ **Blazing Fast** | Built on Bun with optimized WebSocket handling — 10,000+ msg/s publish, 50,000+ msg/s delivery |
| 📦 **Zero External Deps** | Embedded SQLite, no Redis/Postgres/RabbitMQ to install or manage |
| 🎯 **Simple by Design** | First message in 30 seconds. No XML configs, no Erlang, no Java |
| 🔐 **Secure by Default** | API keys + short-lived single-use tokens keep secrets off the browser |
| 📊 **Built-In Dashboard** | Beautiful React dashboard with real-time metrics, test playground, and docs |
| 🐳 **One-Command Deploy** | `docker-compose up -d` and you're live |

---

## 2. Feature List

### Core Pub/Sub Messaging
- **Topic-Based Pub/Sub** — Clients SUBSCRIBE, UNSUBSCRIBE, and PUBLISH to named topics (e.g. `orders.created`, `logs.error`) using JSON payloads over WebSocket
- **Wildcard Topic Subscriptions** — AMQP-style patterns:
  - `*` matches a single segment (`orders.*` → `orders.created`)
  - `#` matches one or more segments (`logs.#` → `logs.error.critical`)
- **Fan-Out Delivery** — A single PUBLISH fans out to all subscribers on matching topics, including wildcard matches
- **Message Persistence** — Durable topics persist messages to SQLite, ensuring no data loss across broker restarts
- **Delivery Guarantees** — At-most-once (fire-and-forget) or At-least-once (`requireAck`) with explicit ACK/NACK from subscribers
- **Dead Letter Queue (DLQ)** — Failed/undeliverable messages automatically routed to DLQ in SQLite for inspection and replay

### Remote Procedure Calls (RPC)
- **Function Registration** — Executers register callable functions with the broker, including rich metadata (param types, descriptions, return types)
- **Function Discovery** — Producers discover available functions at runtime via `RPC_DISCOVER`
- **Load-Distributed Routing** — Broker routes calls to available executers with random selection for load distribution across multiple executers
- **Timeout Handling** — 30-second RPC timeout with automatic error notification if the executer disconnects mid-call
- **Bi-directional** — Caller sends request → broker routes to executer → executer responds → broker routes result back

### Real-Time Data Streaming
- **Ordered Stream Delivery** — `STREAM_START` → `STREAM_DATA` (with sequence numbers) → `STREAM_END`
- **Sequence Tracking** — Automatic sequence numbering ensures ordered delivery
- **Metadata Support** — Attach format hints (e.g. `format: "csv"`, `totalRows: 10000`)
- **Fan-Out Streams** — Streams delivered to all topic subscribers including wildcard matches
- **Automatic Cleanup** — Streams cleaned up on client disconnect or completion

### Authentication & Security
- **API Key Authentication** — Persistent keys with `eb_` prefix, stored in SQLite with permission-based access (`publish`, `subscribe`, `admin`)
- **Connection Tokens** — Short-lived single-use tokens (`etk_` prefix, max 5-minute TTL) for frontend WebSocket connections. API key never leaves the backend.
- **Dashboard Auth** — Username/password login with session tokens (`ds_` prefix, 24-hour TTL)
- **Configurable** — `REQUIRE_AUTH` env var controls enforcement (default: enabled)

### Monitoring Dashboard (React)
- **Overview** — Real-time stat cards (uptime, connections, topics, messages, memory) + time-series throughput graphs
- **Topics** — Active topics with subscriber counts, message backlogs, durability status, purge actions
- **Connections** — Active clients showing IP, duration, subscriptions
- **Dead Letters** — Browse and inspect failed messages with reasons
- **API Keys** — Create, view (preview only), revoke, and delete keys with permission management
- **Documentation** — Interactive protocol reference, auth guides, and copy-able code samples
- **Test Playground** — Live connection testing with publisher, consumer, executer, and streaming modes; token auth toggle; real-time traffic log
- **Settings** — Update admin username and password

### Docker Support
- Multi-stage Dockerfile based on `oven/bun:1.3.10-alpine`
- Docker Compose with persistent volume for SQLite data
- Two ports: `9000` (WebSocket) + `9001` (HTTP API + Dashboard)

---

## 3. Tech Stack

> Use this for a "Built With" section or footer badges.

| Component | Technology | Why |
|-----------|-----------|-----|
| **Runtime** | Bun 1.3.10+ | Native WebSocket (uWebSockets under the hood), `bun:sqlite` for FFI-free DB |
| **Language** | TypeScript 5.9+ | Strict typing for protocol safety and payload validation |
| **API** | HonoJS | Lightweight, edge-optimized REST framework with native Bun bindings |
| **Database** | SQLite (WAL mode) | Embedded, zero-config, high-concurrency writes, single-file backup |
| **Dashboard** | React 19 + Vite 6 | Modern component-based UI with hot module replacement |
| **Charts** | Recharts 2.15 | Composable React charts for metrics visualization |
| **Routing** | React Router DOM 7 | Client-side SPA navigation for dashboard |
| **Container** | Docker + Alpine | Minimal production image, one-command deploy |

---

## 4. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    WebSocket Clients                         │
│     (Publishers, Consumers, Executers, Streaming)            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
        ┌────────────────────────────────┐
        │   WebSocket Broker (Port 9000)  │
        │  • Connection Manager           │
        │  • Subscription Manager         │
        │  • RPC Router                   │
        │  • Stream Manager               │
        │  • Token Manager                │
        └────────────┬───────────────────┘
                     │
        ┌────────────┴──────────────────┐
        ↓                               ↓
   ┌─────────────┐           ┌──────────────────┐
   │   SQLite DB  │           │  REST API        │
   │  Messages    │           │  (Port 9001)     │
   │  DLQ         │           │ • Health/Metrics │
   │  Metrics     │           │ • Admin/Keys     │
   │  API Keys    │           │ • Auth/Tokens    │
   └─────────────┘           └────────┬─────────┘
                                      │
                            ┌─────────┴─────────┐
                            ↓                   ↓
                      ┌────────────┐    ┌─────────────┐
                      │  Dashboard │    │  REST       │
                      │   React UI │    │  Clients    │
                      │ (Port 9001)│    │             │
                      └────────────┘    └─────────────┘
```

### Key Architecture Points (Marketing Copy)
- **Centralized Broker Pattern** — All clients connect to a single broker; the broker routes messages with O(1) in-memory lookups
- **Async Persistence** — Database writes never block the event loop
- **Token-Based Frontend Auth** — Secrets never reach the browser; backend exchanges API key for a short-lived single-use token
- **Native Performance** — Bun's uWebSockets-backed server, `bun:sqlite` with no FFI overhead

---

## 5. Performance Numbers

From load testing (`scripts/loadtest.ts` — 1 million messages, 5 publishers, 10 subscribers):

| Metric | Value |
|--------|-------|
| **Publish Rate** | ~10,500 msg/s |
| **Delivery Rate** | ~53,000 msg/s |
| **Protocol** | JSON over WebSocket |
| **Database** | SQLite WAL mode (tens of thousands of concurrent writes) |

---

## 6. Protocol Reference

### Connection

```
WebSocket endpoint: ws://<host>:9000/ws
With API key:       ws://<host>:9000/ws?apiKey=eb_a1b2c3...
With token:         ws://<host>:9000/ws?token=etk_x9y8z7...
```

All messages are **JSON-encoded UTF-8 strings** with a required `type` field.

### Message Types (25 total)

**Pub/Sub (7 types)**

| Direction | Type | Description |
|-----------|------|-------------|
| Client → Broker | `SUBSCRIBE` | Subscribe to a topic (supports wildcards) |
| Broker → Client | `SUBSCRIBED` | Subscription confirmed |
| Client → Broker | `UNSUBSCRIBE` | Unsubscribe from a topic |
| Broker → Client | `UNSUBSCRIBED` | Unsubscription confirmed |
| Client → Broker | `PUBLISH` | Publish a message to a topic |
| Broker → Client | `MESSAGE` | Deliver a message to a subscriber |
| Client → Broker | `ACK` / `NACK` | Acknowledge or reject a message |

**RPC (7 types)**

| Direction | Type | Description |
|-----------|------|-------------|
| Executer → Broker | `RPC_REGISTER` | Register callable functions |
| Broker → Executer | `RPC_REGISTERED` | Registration confirmed |
| Client → Broker | `RPC_DISCOVER` | List available functions |
| Broker → Client | `RPC_FUNCTIONS` | Available function list |
| Client → Broker | `RPC_CALL` | Invoke a remote function |
| Executer → Broker | `RPC_RESPONSE` | Function result |
| Broker → Client | `RPC_ERROR` | Function call error |

**Streaming (3 types)**

| Direction | Type | Description |
|-----------|------|-------------|
| Publisher → Broker → Subscribers | `STREAM_START` | Begin a named stream |
| Publisher → Broker → Subscribers | `STREAM_DATA` | Stream chunk (sequenced) |
| Publisher → Broker → Subscribers | `STREAM_END` | End the stream |

**System (1 type)**

| Direction | Type | Description |
|-----------|------|-------------|
| Broker → Client | `ERROR` | Error response with code and message |

### Wildcard Matching

| Pattern | Matches | Does NOT Match |
|---------|---------|----------------|
| `orders.*` | `orders.created`, `orders.deleted` | `orders.us.created` |
| `logs.#` | `logs.error`, `logs.error.critical` | (matches all under `logs.`) |
| `*` | Any single-segment topic | Multi-segment topics |
| `#` | All topics | — |

---

## 7. Security Model

### Authentication Flow Diagram (for website illustration)

```
┌──────────────┐                    ┌──────────────┐                  ┌──────────┐
│   Frontend   │                    │   Backend    │                  │ EchoBus  │
│   (Browser)  │                    │   (Server)   │                  │  Broker  │
└──────┬───────┘                    └──────┬───────┘                  └────┬─────┘
       │                                   │                               │
       │  1. Request token                 │                               │
       │──────────────────────────────────>│                               │
       │                                   │  2. POST /auth/token          │
       │                                   │   { apiKey: "eb_..." }        │
       │                                   │──────────────────────────────>│
       │                                   │                               │
       │                                   │  3. { token: "etk_..." }      │
       │                                   │<──────────────────────────────│
       │  4. Return token to frontend      │                               │
       │<──────────────────────────────────│                               │
       │                                   │                               │
       │  5. ws://broker/ws?token=etk_...  │                               │
       │───────────────────────────────────────────────────────────────────>│
       │                                   │                               │
       │  6. WebSocket connected ✅         │                               │
       │<──────────────────────────────────────────────────────────────────│
```

### Key Security Points

| Feature | Detail |
|---------|--------|
| **API Keys** | `eb_` prefix, stored in SQLite, permission-scoped (`publish`, `subscribe`, `admin`) |
| **Connection Tokens** | `etk_` prefix, single-use, max 5-minute TTL, in-memory only |
| **Dashboard Sessions** | `ds_` prefix, 24-hour TTL, bcrypt-hashed passwords |
| **Auth Enforcement** | `REQUIRE_AUTH=true` by default; 401 (missing) / 403 (invalid) on failed auth |
| **Key Safety** | Full API key shown only on creation — never re-exposed via the API |

---

## 8. REST API Reference

### Health & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Uptime, memory, connections, topics, message counts |
| `GET` | `/topics` | Active topics with subscriber counts and backlogs |
| `GET` | `/connections` | Active clients with IPs, subscriptions, roles |
| `GET` | `/metrics?since=<ms>&limit=<n>` | Time-series metrics (publish/delivery rates) |
| `GET` | `/dlq?limit=50` | Dead letter queue entries |

### Administration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/purge` | Clear a topic's message backlog |
| `POST` | `/admin/topics/durable` | Register a topic for persistence |

### API Key Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/api-keys` | List all keys (preview only) |
| `POST` | `/admin/api-keys` | Create new key with permissions |
| `PATCH` | `/admin/api-keys/:id/revoke` | Soft-revoke a key |
| `DELETE` | `/admin/api-keys/:id` | Permanently delete a key |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/auth/status` | Check if admin account exists |
| `POST` | `/auth/setup` | First-time admin account creation |
| `POST` | `/auth/login` | Dashboard login → returns session token |
| `GET` | `/auth/verify` | Verify a session token |
| `POST` | `/auth/logout` | Invalidate session |
| `POST` | `/auth/token` | Exchange API key for a connection token |
| `PATCH` | `/auth/credentials/username` | Update admin username |
| `PATCH` | `/auth/credentials/password` | Update admin password |

---

## 9. Code Examples (for Website Snippets)

### Quick Start (30 Seconds)

```bash
git clone <repo-url>
cd echobus
docker-compose up -d

# Dashboard: http://localhost:9001
# WebSocket: ws://localhost:9000/ws
```

### Hello World — Publish & Subscribe

```typescript
// Subscriber
const sub = new WebSocket("ws://localhost:9000/ws");
sub.onopen = () => {
  sub.send(JSON.stringify({
    type: "SUBSCRIBE", topic: "hello", id: "sub-1"
  }));
};
sub.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "MESSAGE") {
    console.log("Received:", msg.payload);
  }
};

// Publisher
const pub = new WebSocket("ws://localhost:9000/ws");
pub.onopen = () => {
  pub.send(JSON.stringify({
    type: "PUBLISH",
    topic: "hello",
    payload: { message: "Hello, EchoBus! 🐇" }
  }));
};
```

### Wildcard Subscriptions

```typescript
const ws = new WebSocket("ws://localhost:9000/ws");
ws.onopen = () => {
  // Receive ALL order events
  ws.send(JSON.stringify({
    type: "SUBSCRIBE", topic: "orders.*", id: "wildcard-sub"
  }));
};
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "MESSAGE") {
    console.log(`[${msg.topic}]`, msg.payload);
    // [orders.created] { orderId: "1" }
    // [orders.shipped] { orderId: "1", tracking: "..." }
  }
};
```

### RPC — Remote Function Calls

```typescript
// Executer: Register a function
const executer = new WebSocket("ws://localhost:9000/ws?apiKey=eb_...");
executer.onopen = () => {
  executer.send(JSON.stringify({
    type: "RPC_REGISTER",
    functions: [{
      name: "math.add",
      description: "Add two numbers",
      params: {
        a: { type: "number", required: true },
        b: { type: "number", required: true }
      }
    }]
  }));
};
executer.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "RPC_CALL") {
    executer.send(JSON.stringify({
      type: "RPC_RESPONSE",
      requestId: msg.requestId,
      result: msg.args.a + msg.args.b
    }));
  }
};

// Caller: Discover and invoke
const caller = new WebSocket("ws://localhost:9000/ws?apiKey=eb_...");
caller.onopen = () => caller.send(JSON.stringify({ type: "RPC_DISCOVER" }));
caller.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "RPC_FUNCTIONS") {
    caller.send(JSON.stringify({
      type: "RPC_CALL",
      requestId: "req_001",
      function: "math.add",
      args: { a: 10, b: 20 }
    }));
  }
  if (msg.type === "RPC_RESPONSE") {
    console.log("Result:", msg.result); // → 30
  }
};
```

### Streaming Data

```typescript
// Publisher: Send a data stream
const pub = new WebSocket("ws://localhost:9000/ws?apiKey=eb_...");
pub.onopen = () => {
  const streamId = "stream_sensor_001";

  pub.send(JSON.stringify({
    type: "STREAM_START", streamId,
    topic: "sensors.temperature",
    metadata: { unit: "celsius", sensorId: "temp-42" }
  }));

  let seq = 0;
  const interval = setInterval(() => {
    pub.send(JSON.stringify({
      type: "STREAM_DATA", streamId,
      sequence: seq++,
      payload: { temperature: 20 + Math.random() * 10 }
    }));
    if (seq >= 20) {
      clearInterval(interval);
      pub.send(JSON.stringify({ type: "STREAM_END", streamId }));
    }
  }, 500);
};

// Subscriber: Receive the stream
const sub = new WebSocket("ws://localhost:9000/ws?apiKey=eb_...");
sub.onopen = () => {
  sub.send(JSON.stringify({
    type: "SUBSCRIBE", topic: "sensors.#", id: "stream-listener"
  }));
};
sub.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "STREAM_START") console.log("🌊 Stream started");
  if (msg.type === "STREAM_DATA")  console.log(`📦 [${msg.sequence}]:`, msg.payload);
  if (msg.type === "STREAM_END")   console.log("🏁 Stream ended");
};
```

### Secure Frontend Connections (Token Flow)

```typescript
// Backend (server-side — API key stays secret)
const res = await fetch("http://localhost:9001/auth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey: "eb_your_secret_key",
    options: { ttl: 30, permissions: ["publish", "subscribe"] }
  })
});
const { token } = await res.json();
// → Send token to the frontend

// Frontend (browser — only receives short-lived token)
const ws = new WebSocket(`ws://localhost:9000/ws?token=${token}`);
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "PUBLISH",
    topic: "user.events",
    payload: { userId: "user_123", action: "clicked_button" }
  }));
};
```

### Acknowledged Delivery

```typescript
// Publisher: Require acknowledgment
pub.send(JSON.stringify({
  type: "PUBLISH",
  topic: "payments.processed",
  payload: { transactionId: "tx_abc", amount: 99.99 },
  messageId: "pay_001",
  requireAck: true
}));

// Consumer: ACK or NACK
sub.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "MESSAGE") {
    const ok = processPayment(msg.payload);
    sub.send(JSON.stringify(
      ok ? { type: "ACK", messageId: msg.messageId }
         : { type: "NACK", messageId: msg.messageId, reason: "Processing failed" }
    ));
  }
};
```

---

## 10. Dashboard Pages (Screenshots / Wireframe Reference)

| Page | Route | Key Elements |
|------|-------|-------------|
| **Login** | `/` (unauthenticated) | Username + password form; first-visit shows "Create Admin" setup |
| **Overview** | `/` | 6 stat cards (uptime, connections, topics, published, delivered, memory) + throughput line chart |
| **Topics** | `/topics` | Table: topic name, subscriber count, pending messages, durable badge, purge button |
| **Connections** | `/connections` | Table: client ID, remote IP, connection duration, subscription badges |
| **Dead Letters** | `/dlq` | Table: message ID, topic, payload preview, rejection reason, timestamp |
| **API Keys** | `/api-keys` | Create form (name + permissions), keys table with preview, revoke/delete actions |
| **Test Playground** | `/test` | Publisher form, consumer panel (multiple), executer panel, streaming controls, traffic log |
| **Documentation** | `/docs` | Interactive code examples, protocol reference, auth guides |
| **Settings** | `/settings` | Username change, password change (with current password verification), logout |

### Sidebar Navigation
- 📊 Overview
- 📋 Topics
- 🔌 Connections
- 💀 Dead Letters
- 🔑 API Keys
- 🧪 Test
- 📖 Documentation
- ⚙️ Settings
- User indicator + 🚪 Log Out button at bottom

---

## 11. Deployment & Configuration

### Docker Compose (Recommended)

```yaml
services:
  echobus:
    build: .
    container_name: echobus
    ports:
      - "9000:9000"  # WebSocket broker
      - "9001:9001"  # HTTP API + Dashboard
    volumes:
      - ./echobus_data:/data
    environment:
      - BROKER_PORT=9000
      - API_PORT=9001
      - DB_PATH=/data/echobus.db
    restart: unless-stopped
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROKER_PORT` | `9000` | WebSocket broker port |
| `API_PORT` | `9001` | REST API + Dashboard port |
| `DB_PATH` | `echobus.db` | SQLite database file path |
| `REQUIRE_AUTH` | `true` | Enforce API key/token authentication |
| `UI_DIST_PATH` | `packages/ui/dist` | Path to built React dashboard |

### Manual Install

```bash
# Requires Bun 1.3.10+
bun install
bun run build:ui
bun run packages/api/src/index.ts
```

---

## 12. Package Structure (Monorepo)

```
echobus/
├── packages/
│   ├── broker/          # Core WebSocket broker (zero external deps)
│   │   ├── src/
│   │   │   ├── Broker.ts              # Main broker with WS handling
│   │   │   ├── ConnectionManager.ts   # Client tracking + RPC registry
│   │   │   ├── SubscriptionManager.ts # Topic routing + wildcards
│   │   │   ├── PersistenceLayer.ts    # SQLite storage
│   │   │   ├── TokenManager.ts        # Short-lived connection tokens
│   │   │   ├── protocol.ts            # JSON message parser/validator
│   │   │   ├── types.ts               # All TypeScript types (25 msg types)
│   │   │   └── utils.ts               # ID generation
│   │   └── tests/
│   │       └── broker.test.ts         # 24 integration tests
│   │
│   ├── api/             # REST API (HonoJS)
│   │   └── src/
│   │       ├── app.ts                 # All routes, middleware, auth
│   │       └── index.ts               # Production entry point
│   │
│   └── ui/              # React Dashboard (Vite)
│       └── src/
│           ├── components/
│           │   ├── Layout.tsx         # Sidebar + nav
│           │   └── AuthContext.tsx     # Auth state management
│           └── pages/
│               ├── OverviewPage.tsx    # Stats + charts
│               ├── TopicsPage.tsx      # Topic management
│               ├── ConnectionsPage.tsx # Connection monitoring
│               ├── DeadLettersPage.tsx # DLQ viewer
│               ├── ApiKeysPage.tsx     # Key management
│               ├── TestPage.tsx        # Live test playground
│               ├── DocumentationPage.tsx  # Interactive docs
│               ├── LoginPage.tsx       # Login / setup
│               └── SettingsPage.tsx    # Credentials management
│
├── Dockerfile
├── docker-compose.yml
├── HowToUse.md          # Comprehensive usage guide (Bun + Node.js)
└── scripts/
    └── loadtest.ts      # Performance benchmarking tool
```

---

## 13. Comparison Points (vs. Competitors)

Use these for a comparison table on the website:

| Feature | EchoBus | RabbitMQ | Redis Pub/Sub | Kafka |
|---------|---------|----------|---------------|-------|
| **Setup Time** | 30 seconds | 10+ minutes | 5 minutes | 30+ minutes |
| **External Deps** | None | Erlang runtime | Redis server | JVM + Zookeeper |
| **Protocol** | WebSocket (native browser) | AMQP (needs client lib) | TCP (needs client lib) | TCP (needs client lib) |
| **Built-in Dashboard** | ✅ | ✅ (separate plugin) | ❌ | ❌ (needs Confluent) |
| **Built-in RPC** | ✅ | ✅ | ❌ | ❌ |
| **Streaming** | ✅ | ❌ | ❌ | ✅ |
| **Frontend-safe Auth** | ✅ (connection tokens) | ❌ | ❌ | ❌ |
| **Wildcard Topics** | ✅ (`*` and `#`) | ✅ | ✅ (pattern) | ❌ |
| **Dead Letter Queue** | ✅ | ✅ | ❌ | ✅ |
| **Docker Image Size** | ~50 MB | ~150 MB | ~40 MB | ~500 MB |
| **Language** | TypeScript/Bun | Erlang | C | Java/Scala |

---

## 14. Suggested Website Sections

1. **Hero** — Tagline, "Get Started" CTA, animated WebSocket message flow
2. **Features Grid** — 6 cards: Pub/Sub, RPC, Streaming, Security, Dashboard, Docker
3. **Code Examples** — Tabbed snippets (Pub/Sub, RPC, Streaming, Tokens)
4. **Architecture Diagram** — Interactive or animated version of the ASCII diagram above
5. **Dashboard Preview** — Screenshots or embedded demo of the 9 dashboard pages
6. **Performance** — Benchmark numbers with visual bars/graphs
7. **Comparison Table** — EchoBus vs RabbitMQ vs Redis vs Kafka
8. **Quick Start** — 3-step: Clone → Docker Compose → Open Dashboard
9. **Security** — Token flow diagram, API key lifecycle
10. **API Reference** — Collapsible endpoint documentation
11. **Footer** — Built with Bun · TypeScript · SQLite · React · HonoJS
