# 🐇 echobus

Official client library for [EchoBus](https://github.com/pallavsharma505/warehouse-of-logs) — a high-performance Pub/Sub message broker with RPC and streaming, built on WebSockets.

Works in **Node.js** (v21+), **Bun**, and the **browser** — zero dependencies.

## Install

```bash
npm install echobus
# or
bun add echobus
# or
yarn add echobus
```

> **Node.js < 21:** Requires a WebSocket polyfill like [`ws`](https://www.npmjs.com/package/ws).
> Add `globalThis.WebSocket = require("ws");` before importing echobus.

## Quick Start

```typescript
import { Publisher, Consumer } from "echobus";

// Publish
const pub = new Publisher("ws://localhost:9000/ws", { apiKey: "eb_..." });
await pub.connect();
pub.publish("orders.created", { orderId: "123", total: 99.99 });

// Subscribe
const sub = new Consumer("ws://localhost:9000/ws", { apiKey: "eb_..." });
await sub.connect();
await sub.subscribe("orders.*", (msg) => {
  console.log(`[${msg.topic}]`, msg.payload);
  msg.ack();
});
```

## API

### Clients

| Class | Purpose |
|-------|---------|
| **`EchoBus`** | Unified client — publish, subscribe, RPC, and streaming on one connection |
| **`Publisher`** | Publish messages and create data streams |
| **`Consumer`** | Subscribe to topics, receive messages and streams |
| **`Executer`** | Register and handle RPC functions |
| **`RPCClient`** | Discover and call remote functions |

All clients share the same constructor signature:

```typescript
new Client(url: string, options?: EchoBusOptions)
```

### Connection Options

```typescript
interface EchoBusOptions {
  apiKey?: string;              // API key (eb_ prefix)
  token?: string;               // Single-use connection token (etk_ prefix)
  autoReconnect?: boolean;      // Auto-reconnect on disconnect (default: false)
  reconnectInterval?: number;   // Base reconnect interval in ms (default: 1000)
  maxReconnectAttempts?: number; // Max attempts, -1 for infinite (default: 10)
}
```

### Connection Events

```typescript
client.on("connected", () => { ... });
client.on("disconnected", ({ code, reason }) => { ... });
client.on("reconnecting", ({ attempt }) => { ... });
client.on("error", (error: Error) => { ... });
```

---

## Publishing Messages

```typescript
import { Publisher } from "echobus";

const pub = new Publisher("ws://localhost:9000/ws", { apiKey: "eb_..." });
await pub.connect();

// Fire and forget
pub.publish("events.click", { x: 100, y: 200 });

// With acknowledgment
pub.publish("payments.processed", { amount: 49.99 }, {
  messageId: "pay_001",
  requireAck: true,
});

pub.close();
```

---

## Subscribing to Messages

```typescript
import { Consumer } from "echobus";

const sub = new Consumer("ws://localhost:9000/ws", { apiKey: "eb_..." });
await sub.connect();

// Per-subscription handler (supports wildcards)
const subId = await sub.subscribe("orders.*", (msg) => {
  console.log(msg.topic, msg.payload);
  msg.ack();        // Acknowledge
  // msg.nack("reason"); // Reject → Dead Letter Queue
});

// Or use event-based handler for all messages
sub.on("message", (msg) => {
  console.log("Received:", msg.topic, msg.payload);
});

// Unsubscribe
await sub.unsubscribe(subId);

sub.close();
```

### Wildcard Topics

| Pattern | Matches | Does NOT Match |
|---------|---------|----------------|
| `orders.*` | `orders.created`, `orders.deleted` | `orders.us.created` |
| `logs.#` | `logs.error`, `logs.error.critical` | — |
| `#` | Everything | — |

---

## RPC (Remote Procedure Calls)

### Executer — Register Functions

```typescript
import { Executer } from "echobus";

const exec = new Executer("ws://localhost:9000/ws", { apiKey: "eb_..." });
await exec.connect();

await exec.register([
  {
    name: "math.add",
    description: "Add two numbers",
    params: {
      a: { type: "number", required: true },
      b: { type: "number", required: true },
    },
    returns: { type: "number" },
    handler: (args) => args.a + args.b, // sync or async
  },
  {
    name: "db.query",
    handler: async (args) => {
      const rows = await database.query(args.sql);
      return rows;
    },
  },
]);
```

### RPCClient — Discover & Call

```typescript
import { RPCClient } from "echobus";

const rpc = new RPCClient("ws://localhost:9000/ws", { apiKey: "eb_..." });
await rpc.connect();

// Discover available functions
const functions = await rpc.discover();
console.log(functions);
// [{ name: "math.add", description: "...", params: {...}, executerId: "..." }]

// Call a function (returns a Promise)
const sum = await rpc.call("math.add", { a: 10, b: 20 });
console.log(sum); // 30

// With custom timeout (default: 30s)
const result = await rpc.call("db.query", { sql: "SELECT 1" }, 60000);

rpc.close();
```

---

## Streaming Data

### Publisher — Send Streams

```typescript
import { Publisher } from "echobus";

const pub = new Publisher("ws://localhost:9000/ws", { apiKey: "eb_..." });
await pub.connect();

const stream = pub.createStream("data.export", { format: "csv", totalRows: 1000 });

stream.write({ row: "alice,30,engineer" });
stream.write({ row: "bob,25,designer" });
stream.write({ row: "charlie,35,manager" });

stream.end(); // Close the stream
```

### Consumer — Receive Streams

```typescript
import { Consumer } from "echobus";

const sub = new Consumer("ws://localhost:9000/ws", { apiKey: "eb_..." });
await sub.connect();

await sub.subscribe("data.#");

sub.on("stream:start", ({ streamId, topic, metadata }) => {
  console.log(`Stream started: ${streamId}`, metadata);
});

sub.on("stream:data", ({ streamId, payload, sequence }) => {
  console.log(`Chunk #${sequence}:`, payload);
});

sub.on("stream:end", ({ streamId }) => {
  console.log(`Stream ended: ${streamId}`);
});
```

---

## Unified Client

The `EchoBus` class combines all capabilities into a single connection:

```typescript
import { EchoBus } from "echobus";

const client = new EchoBus("ws://localhost:9000/ws", { apiKey: "eb_..." });
await client.connect();

// Publish
client.publish("orders.created", { orderId: "123" });

// Subscribe
await client.subscribe("notifications.*", (msg) => {
  console.log(msg.payload);
});

// RPC (as executer)
await client.register([{
  name: "utils.echo",
  handler: (args) => args,
}]);

// RPC (as caller)
const result = await client.call("math.add", { a: 1, b: 2 });

// Streaming
const stream = client.createStream("live.feed");
stream.write({ frame: 1 });
stream.end();

// Stream events
client.on("stream:start", (e) => console.log("Stream started:", e.streamId));
client.on("stream:data", (e) => console.log("Chunk:", e.payload));
client.on("stream:end", (e) => console.log("Stream ended:", e.streamId));

client.close();
```

---

## Authentication

### API Key (Backend / Server)

```typescript
const client = new EchoBus("ws://localhost:9000/ws", {
  apiKey: "eb_your_api_key_here",
});
```

### Connection Token (Frontend / Browser)

For browser clients, use short-lived single-use tokens so the API key is never exposed:

```typescript
// Server-side: exchange API key for a token
const res = await fetch("http://localhost:9001/auth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey: "eb_your_secret_key",
    options: { ttl: 30 }, // expires in 30 seconds
  }),
});
const { token } = await res.json();

// Client-side: connect with token
const client = new EchoBus("ws://localhost:9000/ws", { token });
await client.connect();
```

---

## Auto-Reconnect

```typescript
const client = new EchoBus("ws://localhost:9000/ws", {
  apiKey: "eb_...",
  autoReconnect: true,
  reconnectInterval: 1000,     // start at 1s, backs off up to 10x
  maxReconnectAttempts: -1,    // infinite retries
});

client.on("disconnected", () => console.log("Lost connection..."));
client.on("reconnecting", ({ attempt }) => console.log(`Reconnecting #${attempt}...`));
client.on("connected", () => console.log("Reconnected!"));

await client.connect();

// Subscriptions and RPC registrations are automatically restored on reconnect
```

---

## Browser Usage

```html
<script type="module">
  import { EchoBus } from "https://unpkg.com/echobus/dist/index.mjs";

  const client = new EchoBus("ws://localhost:9000/ws", { token: "etk_..." });
  await client.connect();

  await client.subscribe("chat.messages", (msg) => {
    document.getElementById("log").textContent += msg.payload.text + "\n";
  });

  document.getElementById("send").onclick = () => {
    client.publish("chat.messages", {
      user: "Alice",
      text: document.getElementById("input").value,
    });
  };
</script>
```

---

## Utilities

### `topicMatches(pattern, topic)`

Client-side wildcard topic matching (same algorithm as the broker):

```typescript
import { topicMatches } from "echobus";

topicMatches("orders.*", "orders.created");       // true
topicMatches("orders.*", "orders.us.created");    // false
topicMatches("logs.#", "logs.error.critical");    // true
```

---

## TypeScript

All types are exported:

```typescript
import type {
  EchoBusOptions,
  PublishOptions,
  ReceivedMessage,
  MessageHandler,
  StreamStartEvent,
  StreamDataEvent,
  StreamEndEvent,
  RpcFunctionDef,
  RpcFunctionRegistration,
  RpcFunctionInfo,
  RpcParamDef,
  RpcReturnDef,
} from "echobus";
```

---

## License

MIT
