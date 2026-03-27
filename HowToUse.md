# How To Use EchoBus

This guide shows how to connect to EchoBus as a **publisher** or **consumer** using TypeScript with both **Bun** and **Node.js** runtimes.

> **Default ports:** WebSocket broker on `ws://localhost:9000/ws`, REST API on `http://localhost:9001`

---

## Table of Contents

- [Protocol Overview](#protocol-overview)
- [Bun Examples](#bun-examples)
  - [Basic Publisher](#bun--basic-publisher)
  - [Basic Consumer](#bun--basic-consumer)
  - [One Publisher → Multiple Consumers](#bun--one-publisher--multiple-consumers)
  - [Wildcard Subscriptions](#bun--wildcard-subscriptions)
  - [Acknowledged Delivery](#bun--acknowledged-delivery)
  - [RPC Executer](#bun--rpc-executer)
  - [RPC Producer (Caller)](#bun--rpc-producer-caller)
  - [Streaming Publisher](#bun--streaming-publisher)
  - [Streaming Consumer](#bun--streaming-consumer)
- [Node.js Examples](#nodejs-examples)
  - [Basic Publisher](#nodejs--basic-publisher)
  - [Basic Consumer](#nodejs--basic-consumer)
  - [One Publisher → Multiple Consumers](#nodejs--one-publisher--multiple-consumers)
  - [Wildcard Subscriptions](#nodejs--wildcard-subscriptions)
  - [Acknowledged Delivery](#nodejs--acknowledged-delivery)
  - [RPC Executer](#nodejs--rpc-executer)
  - [RPC Producer (Caller)](#nodejs--rpc-producer-caller)
  - [Streaming Publisher](#nodejs--streaming-publisher)
  - [Streaming Consumer](#nodejs--streaming-consumer)
- [REST API Usage](#rest-api-usage)
- [Connection Tokens (Frontend Security)](#connection-tokens-frontend-security)

---

## Protocol Overview

Every message sent to the broker is a JSON object with a `type` field:

```typescript
// Client → Broker
type BrokerMessage =
  // Pub/Sub
  | { type: "SUBSCRIBE"; topic: string; id: string }
  | { type: "UNSUBSCRIBE"; topic: string; id: string }
  | { type: "PUBLISH"; topic: string; payload: any; messageId?: string; requireAck?: boolean }
  | { type: "ACK"; messageId: string }
  | { type: "NACK"; messageId: string; reason?: string }
  // RPC
  | { type: "RPC_REGISTER"; functions: RpcFunctionDef[] }
  | { type: "RPC_DISCOVER" }
  | { type: "RPC_CALL"; requestId: string; function: string; args?: unknown }
  | { type: "RPC_RESPONSE"; requestId: string; result?: unknown; error?: string }
  // Streaming
  | { type: "STREAM_START"; streamId: string; topic: string; metadata?: unknown }
  | { type: "STREAM_DATA"; streamId: string; payload: unknown; sequence: number }
  | { type: "STREAM_END"; streamId: string }

// Broker → Client
type ServerMessage =
  // Pub/Sub
  | { type: "MESSAGE"; topic: string; payload: any; messageId: string }
  | { type: "SUBSCRIBED"; topic: string; id: string }
  | { type: "UNSUBSCRIBED"; topic: string; id: string }
  | { type: "ACK_CONFIRM"; messageId: string }
  | { type: "ERROR"; code: string; message: string }
  // RPC
  | { type: "RPC_REGISTERED"; count: number }
  | { type: "RPC_FUNCTIONS"; functions: RpcFunctionDef[] }
  | { type: "RPC_CALL"; requestId: string; function: string; args?: unknown; callerId: string }
  | { type: "RPC_RESPONSE"; requestId: string; result?: unknown; error?: string }
  | { type: "RPC_ERROR"; requestId: string; error: string }
  // Streaming
  | { type: "STREAM_START"; streamId: string; topic: string; metadata?: unknown }
  | { type: "STREAM_DATA"; streamId: string; topic: string; payload: unknown; sequence: number }
  | { type: "STREAM_END"; streamId: string; topic: string }
```

**Wildcard patterns:**
- `*` matches exactly one segment — `orders.*` matches `orders.created` but not `orders.us.created`
- `#` matches one or more segments — `logs.#` matches `logs.error`, `logs.error.critical`, etc.

---

## Bun Examples

Bun has a native `WebSocket` global — no extra packages needed.

### Bun — Basic Publisher

```typescript
// publisher.ts — run with: bun run publisher.ts
const BROKER_URL = "ws://localhost:9000/ws";

const ws = new WebSocket(BROKER_URL);

ws.onopen = () => {
  console.log("Connected to EchoBus");

  // Publish a message to the "orders.created" topic
  ws.send(JSON.stringify({
    type: "PUBLISH",
    topic: "orders.created",
    payload: {
      orderId: "ord_001",
      item: "Widget",
      quantity: 3,
    },
  }));

  console.log("Message published!");
  setTimeout(() => ws.close(), 500);
};

ws.onerror = (e) => console.error("Connection error:", e);
```

### Bun — Basic Consumer

```typescript
// consumer.ts — run with: bun run consumer.ts
const BROKER_URL = "ws://localhost:9000/ws";

const ws = new WebSocket(BROKER_URL);

ws.onopen = () => {
  console.log("Connected to EchoBus");

  // Subscribe to the "orders.created" topic
  ws.send(JSON.stringify({
    type: "SUBSCRIBE",
    topic: "orders.created",
    id: "my-subscription-1",
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "SUBSCRIBED":
      console.log(`Subscribed to "${msg.topic}"`);
      break;

    case "MESSAGE":
      console.log(`Received on "${msg.topic}":`, msg.payload);
      // msg.messageId is available if you need to ACK
      break;

    case "ERROR":
      console.error(`Broker error [${msg.code}]: ${msg.message}`);
      break;
  }
};

ws.onerror = (e) => console.error("Connection error:", e);
```

### Bun — One Publisher → Multiple Consumers

This example starts 3 consumers on the same topic, then publishes a single message. All 3 consumers will receive it (fan-out).

```typescript
// fan-out.ts — run with: bun run fan-out.ts
const BROKER_URL = "ws://localhost:9000/ws";

function createConsumer(name: string, topic: string): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(BROKER_URL);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "SUBSCRIBE", topic, id: `${name}-sub` }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "SUBSCRIBED") {
        console.log(`[${name}] Subscribed to "${topic}"`);
        resolve(ws);
      }
      if (msg.type === "MESSAGE") {
        console.log(`[${name}] Received:`, msg.payload);
      }
    };
  });
}

// Start 3 consumers
const consumer1 = await createConsumer("consumer-1", "notifications");
const consumer2 = await createConsumer("consumer-2", "notifications");
const consumer3 = await createConsumer("consumer-3", "notifications");

// Publish one message — all 3 consumers will receive it
const publisher = new WebSocket(BROKER_URL);
publisher.onopen = () => {
  publisher.send(JSON.stringify({
    type: "PUBLISH",
    topic: "notifications",
    payload: { text: "Hello from the publisher!", timestamp: Date.now() },
  }));
  console.log("\n[publisher] Message sent to 'notifications'");

  // Cleanup after a moment
  setTimeout(() => {
    [consumer1, consumer2, consumer3, publisher].forEach((ws) => ws.close());
    console.log("\nAll connections closed.");
  }, 1000);
};
```

**Expected output:**
```
[consumer-1] Subscribed to "notifications"
[consumer-2] Subscribed to "notifications"
[consumer-3] Subscribed to "notifications"

[publisher] Message sent to 'notifications'
[consumer-1] Received: { text: "Hello from the publisher!", timestamp: 1711512345678 }
[consumer-2] Received: { text: "Hello from the publisher!", timestamp: 1711512345678 }
[consumer-3] Received: { text: "Hello from the publisher!", timestamp: 1711512345678 }

All connections closed.
```

### Bun — Wildcard Subscriptions

```typescript
// wildcards.ts — run with: bun run wildcards.ts
const BROKER_URL = "ws://localhost:9000/ws";

// Consumer subscribes to ALL order events using *
const consumer = new WebSocket(BROKER_URL);

consumer.onopen = () => {
  // '*' matches any single segment: orders.created, orders.updated, orders.deleted, etc.
  consumer.send(JSON.stringify({ type: "SUBSCRIBE", topic: "orders.*", id: "wildcard-sub" }));
};

consumer.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "SUBSCRIBED") console.log(`Subscribed to "${msg.topic}"`);
  if (msg.type === "MESSAGE") console.log(`[${msg.topic}]`, msg.payload);
};

// Wait for subscription, then publish to different sub-topics
await new Promise((r) => setTimeout(r, 200));

const pub = new WebSocket(BROKER_URL);
pub.onopen = () => {
  // All of these will be received by the "orders.*" subscriber
  pub.send(JSON.stringify({ type: "PUBLISH", topic: "orders.created",  payload: { action: "created" } }));
  pub.send(JSON.stringify({ type: "PUBLISH", topic: "orders.updated",  payload: { action: "updated" } }));
  pub.send(JSON.stringify({ type: "PUBLISH", topic: "orders.deleted",  payload: { action: "deleted" } }));

  // This will NOT match "orders.*" (two segments after "orders")
  pub.send(JSON.stringify({ type: "PUBLISH", topic: "orders.us.created", payload: { action: "nested" } }));

  // Use '#' for multi-level: subscribe to "logs.#" to match logs.error, logs.error.critical, etc.
  setTimeout(() => { pub.close(); consumer.close(); }, 1000);
};
```

### Bun — Acknowledged Delivery

When `requireAck: true` is set, messages are persisted to SQLite and remain until the consumer explicitly acknowledges them.

```typescript
// ack-example.ts — run with: bun run ack-example.ts
const BROKER_URL = "ws://localhost:9000/ws";

// Consumer that acknowledges messages
const consumer = new WebSocket(BROKER_URL);

consumer.onopen = () => {
  consumer.send(JSON.stringify({ type: "SUBSCRIBE", topic: "payments.processed", id: "ack-sub" }));
};

consumer.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "MESSAGE") {
    console.log("Received payment event:", msg.payload);

    // Process the message...
    const success = true;

    if (success) {
      // ACK — tells the broker the message was successfully processed
      consumer.send(JSON.stringify({ type: "ACK", messageId: msg.messageId }));
      console.log(`ACK sent for ${msg.messageId}`);
    } else {
      // NACK — message goes to the Dead Letter Queue
      consumer.send(JSON.stringify({ type: "NACK", messageId: msg.messageId, reason: "Processing failed" }));
      console.log(`NACK sent for ${msg.messageId}`);
    }
  }
};

// Publisher sends a message that requires acknowledgment
await new Promise((r) => setTimeout(r, 200));

const publisher = new WebSocket(BROKER_URL);
publisher.onopen = () => {
  publisher.send(JSON.stringify({
    type: "PUBLISH",
    topic: "payments.processed",
    requireAck: true,
    messageId: "pay_tx_001",
    payload: { transactionId: "tx_abc123", amount: 99.99, currency: "USD" },
  }));
  console.log("Published payment event (requireAck: true)");

  setTimeout(() => { publisher.close(); consumer.close(); }, 1000);
};
```

### Bun — RPC Executer

An **executer** registers functions that remote clients can call.

```typescript
const ws = new WebSocket("ws://localhost:9000/ws?apiKey=eb_your_key");

ws.onopen = () => {
  // Register callable functions
  ws.send(JSON.stringify({
    type: "RPC_REGISTER",
    functions: [
      { name: "add", description: "Add two numbers", params: { a: { type: "number" }, b: { type: "number" } } },
      { name: "greet", description: "Return a greeting", params: { name: { type: "string" } } },
    ],
  }));
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === "RPC_REGISTERED") {
    console.log(`✅ Registered ${msg.count} function(s)`);
  }

  if (msg.type === "RPC_CALL") {
    console.log(`📞 RPC_CALL: ${msg.function}(${JSON.stringify(msg.args)})`);

    let result: unknown;
    let error: string | undefined;

    try {
      if (msg.function === "add") result = msg.args.a + msg.args.b;
      else if (msg.function === "greet") result = `Hello, ${msg.args.name}!`;
      else error = `Unknown function: ${msg.function}`;
    } catch (e: any) {
      error = e.message;
    }

    ws.send(JSON.stringify({
      type: "RPC_RESPONSE",
      requestId: msg.requestId,
      ...(error ? { error } : { result }),
    }));
  }
};
```

### Bun — RPC Producer (Caller)

A **producer** discovers available functions and calls them remotely.

```typescript
const ws = new WebSocket("ws://localhost:9000/ws?apiKey=eb_your_key");

ws.onopen = () => {
  // First, discover available functions
  ws.send(JSON.stringify({ type: "RPC_DISCOVER" }));
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === "RPC_FUNCTIONS") {
    console.log("Available functions:", msg.functions.map((f: any) => f.name));

    // Call a function
    ws.send(JSON.stringify({
      type: "RPC_CALL",
      requestId: "req_001",
      function: "add",
      args: { a: 10, b: 20 },
    }));
  }

  if (msg.type === "RPC_RESPONSE") {
    console.log(`✅ Result [${msg.requestId}]:`, msg.result); // → 30
  }

  if (msg.type === "RPC_ERROR") {
    console.error(`❌ Error [${msg.requestId}]:`, msg.error);
  }
};
```

### Bun — Streaming Publisher

Start a data stream on a topic with sequenced chunks.

```typescript
const ws = new WebSocket("ws://localhost:9000/ws?apiKey=eb_your_key");

ws.onopen = () => {
  const streamId = "stream_sensor_001";
  const topic = "sensors.temperature";

  // Start the stream
  ws.send(JSON.stringify({
    type: "STREAM_START",
    streamId,
    topic,
    metadata: { unit: "celsius", sensorId: "temp-42" },
  }));

  // Send data chunks every 500ms
  let seq = 0;
  const interval = setInterval(() => {
    ws.send(JSON.stringify({
      type: "STREAM_DATA",
      streamId,
      sequence: seq++,
      payload: { temperature: 20 + Math.random() * 10, timestamp: Date.now() },
    }));

    if (seq >= 20) {
      clearInterval(interval);
      ws.send(JSON.stringify({ type: "STREAM_END", streamId }));
      console.log(`Stream ended after ${seq} chunks`);
    }
  }, 500);
};
```

### Bun — Streaming Consumer

Subscribe to a topic to receive stream events.

```typescript
const ws = new WebSocket("ws://localhost:9000/ws?apiKey=eb_your_key");

ws.onopen = () => {
  ws.send(JSON.stringify({ type: "SUBSCRIBE", topic: "sensors.#", id: "stream-listener" }));
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === "STREAM_START") {
    console.log(`🌊 Stream started: ${msg.streamId} on ${msg.topic}`, msg.metadata);
  } else if (msg.type === "STREAM_DATA") {
    console.log(`📦 [${msg.sequence}] ${msg.topic}:`, msg.payload);
  } else if (msg.type === "STREAM_END") {
    console.log(`🏁 Stream ended: ${msg.streamId}`);
  } else if (msg.type === "MESSAGE") {
    console.log(`📨 Message on ${msg.topic}:`, msg.payload);
  }
};
```

---

## Node.js Examples

Node.js does not have a built-in WebSocket client. Install the `ws` package:

```bash
npm install ws
# TypeScript types (optional)
npm install -D @types/ws
```

### Node.js — Basic Publisher

```typescript
// publisher.ts — run with: npx tsx publisher.ts
import WebSocket from "ws";

const BROKER_URL = "ws://localhost:9000/ws";

const ws = new WebSocket(BROKER_URL);

ws.on("open", () => {
  console.log("Connected to EchoBus");

  ws.send(JSON.stringify({
    type: "PUBLISH",
    topic: "orders.created",
    payload: {
      orderId: "ord_001",
      item: "Widget",
      quantity: 3,
    },
  }));

  console.log("Message published!");
  setTimeout(() => ws.close(), 500);
});

ws.on("error", (err) => console.error("Connection error:", err));
```

### Node.js — Basic Consumer

```typescript
// consumer.ts — run with: npx tsx consumer.ts
import WebSocket from "ws";

const BROKER_URL = "ws://localhost:9000/ws";

const ws = new WebSocket(BROKER_URL);

ws.on("open", () => {
  console.log("Connected to EchoBus");

  ws.send(JSON.stringify({
    type: "SUBSCRIBE",
    topic: "orders.created",
    id: "my-subscription-1",
  }));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  switch (msg.type) {
    case "SUBSCRIBED":
      console.log(`Subscribed to "${msg.topic}"`);
      break;

    case "MESSAGE":
      console.log(`Received on "${msg.topic}":`, msg.payload);
      break;

    case "ERROR":
      console.error(`Broker error [${msg.code}]: ${msg.message}`);
      break;
  }
});

ws.on("error", (err) => console.error("Connection error:", err));
```

### Node.js — One Publisher → Multiple Consumers

```typescript
// fan-out.ts — run with: npx tsx fan-out.ts
import WebSocket from "ws";

const BROKER_URL = "ws://localhost:9000/ws";

function createConsumer(name: string, topic: string): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(BROKER_URL);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "SUBSCRIBE", topic, id: `${name}-sub` }));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "SUBSCRIBED") {
        console.log(`[${name}] Subscribed to "${topic}"`);
        resolve(ws);
      }
      if (msg.type === "MESSAGE") {
        console.log(`[${name}] Received:`, msg.payload);
      }
    });
  });
}

// Start 3 consumers
const consumer1 = await createConsumer("consumer-1", "notifications");
const consumer2 = await createConsumer("consumer-2", "notifications");
const consumer3 = await createConsumer("consumer-3", "notifications");

// Publish one message — all 3 consumers will receive it
const publisher = new WebSocket(BROKER_URL);

publisher.on("open", () => {
  publisher.send(JSON.stringify({
    type: "PUBLISH",
    topic: "notifications",
    payload: { text: "Hello from the publisher!", timestamp: Date.now() },
  }));
  console.log("\n[publisher] Message sent to 'notifications'");

  setTimeout(() => {
    [consumer1, consumer2, consumer3, publisher].forEach((ws) => ws.close());
    console.log("\nAll connections closed.");
  }, 1000);
});
```

### Node.js — Wildcard Subscriptions

```typescript
// wildcards.ts — run with: npx tsx wildcards.ts
import WebSocket from "ws";

const BROKER_URL = "ws://localhost:9000/ws";

const consumer = new WebSocket(BROKER_URL);

consumer.on("open", () => {
  // '*' matches any single segment
  consumer.send(JSON.stringify({ type: "SUBSCRIBE", topic: "orders.*", id: "wildcard-sub" }));
});

consumer.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === "SUBSCRIBED") console.log(`Subscribed to "${msg.topic}"`);
  if (msg.type === "MESSAGE") console.log(`[${msg.topic}]`, msg.payload);
});

setTimeout(() => {
  const pub = new WebSocket(BROKER_URL);

  pub.on("open", () => {
    pub.send(JSON.stringify({ type: "PUBLISH", topic: "orders.created", payload: { action: "created" } }));
    pub.send(JSON.stringify({ type: "PUBLISH", topic: "orders.updated", payload: { action: "updated" } }));
    pub.send(JSON.stringify({ type: "PUBLISH", topic: "orders.deleted", payload: { action: "deleted" } }));

    // Will NOT match "orders.*" — use "orders.#" for multi-level matching
    pub.send(JSON.stringify({ type: "PUBLISH", topic: "orders.us.created", payload: { action: "nested" } }));

    setTimeout(() => { pub.close(); consumer.close(); }, 1000);
  });
}, 200);
```

### Node.js — Acknowledged Delivery

```typescript
// ack-example.ts — run with: npx tsx ack-example.ts
import WebSocket from "ws";

const BROKER_URL = "ws://localhost:9000/ws";

const consumer = new WebSocket(BROKER_URL);

consumer.on("open", () => {
  consumer.send(JSON.stringify({ type: "SUBSCRIBE", topic: "payments.processed", id: "ack-sub" }));
});

consumer.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === "MESSAGE") {
    console.log("Received payment event:", msg.payload);

    const success = true;

    if (success) {
      consumer.send(JSON.stringify({ type: "ACK", messageId: msg.messageId }));
      console.log(`ACK sent for ${msg.messageId}`);
    } else {
      consumer.send(JSON.stringify({ type: "NACK", messageId: msg.messageId, reason: "Processing failed" }));
      console.log(`NACK sent for ${msg.messageId}`);
    }
  }
});

setTimeout(() => {
  const publisher = new WebSocket(BROKER_URL);

  publisher.on("open", () => {
    publisher.send(JSON.stringify({
      type: "PUBLISH",
      topic: "payments.processed",
      requireAck: true,
      messageId: "pay_tx_001",
      payload: { transactionId: "tx_abc123", amount: 99.99, currency: "USD" },
    }));
    console.log("Published payment event (requireAck: true)");

    setTimeout(() => { publisher.close(); consumer.close(); }, 1000);
  });
}, 200);
```

### Node.js — RPC Executer

```typescript
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:9000/ws?apiKey=eb_your_key");

ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "RPC_REGISTER",
    functions: [
      { name: "multiply", description: "Multiply two numbers", params: { a: { type: "number" }, b: { type: "number" } } },
      { name: "uppercase", description: "Convert string to uppercase", params: { text: { type: "string" } } },
    ],
  }));
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.type === "RPC_REGISTERED") {
    console.log(`✅ Registered ${msg.count} function(s)`);
  }

  if (msg.type === "RPC_CALL") {
    console.log(`📞 ${msg.function}(${JSON.stringify(msg.args)})`);

    let result: unknown;
    let error: string | undefined;

    try {
      if (msg.function === "multiply") result = msg.args.a * msg.args.b;
      else if (msg.function === "uppercase") result = msg.args.text.toUpperCase();
      else error = `Unknown function: ${msg.function}`;
    } catch (e: any) {
      error = e.message;
    }

    ws.send(JSON.stringify({
      type: "RPC_RESPONSE",
      requestId: msg.requestId,
      ...(error ? { error } : { result }),
    }));
  }
});
```

### Node.js — RPC Producer (Caller)

```typescript
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:9000/ws?apiKey=eb_your_key");

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "RPC_DISCOVER" }));
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.type === "RPC_FUNCTIONS") {
    console.log("Available:", msg.functions.map((f: any) => f.name));

    ws.send(JSON.stringify({
      type: "RPC_CALL",
      requestId: "req_001",
      function: "multiply",
      args: { a: 7, b: 6 },
    }));
  }

  if (msg.type === "RPC_RESPONSE") {
    console.log(`✅ Result:`, msg.result); // → 42
    ws.close();
  }

  if (msg.type === "RPC_ERROR") {
    console.error(`❌ Error:`, msg.error);
    ws.close();
  }
});
```

### Node.js — Streaming Publisher

```typescript
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:9000/ws?apiKey=eb_your_key");

ws.on("open", () => {
  const streamId = "stream_logs_001";

  ws.send(JSON.stringify({
    type: "STREAM_START",
    streamId,
    topic: "logs.app",
    metadata: { source: "api-server" },
  }));

  let seq = 0;
  const interval = setInterval(() => {
    ws.send(JSON.stringify({
      type: "STREAM_DATA",
      streamId,
      sequence: seq++,
      payload: { level: "info", message: `Request #${seq}`, timestamp: Date.now() },
    }));

    if (seq >= 10) {
      clearInterval(interval);
      ws.send(JSON.stringify({ type: "STREAM_END", streamId }));
      console.log(`Stream complete — ${seq} chunks sent`);
      ws.close();
    }
  }, 200);
});
```

### Node.js — Streaming Consumer

```typescript
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:9000/ws?apiKey=eb_your_key");

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "SUBSCRIBE", topic: "logs.#", id: "log-watcher" }));
  console.log("Subscribed to logs.# — waiting for stream events...");
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());

  switch (msg.type) {
    case "STREAM_START":
      console.log(`🌊 Stream started: ${msg.streamId} on ${msg.topic}`);
      break;
    case "STREAM_DATA":
      console.log(`📦 [${msg.sequence}] ${JSON.stringify(msg.payload)}`);
      break;
    case "STREAM_END":
      console.log(`🏁 Stream ended: ${msg.streamId}`);
      break;
    case "MESSAGE":
      console.log(`📨 ${msg.topic}: ${JSON.stringify(msg.payload)}`);
      break;
  }
});
```

---

## REST API Usage

The management API runs on port `9001` by default.

```bash
# Health check
curl http://localhost:9001/health

# List all active topics
curl http://localhost:9001/topics

# List active connections
curl http://localhost:9001/connections

# Get metrics from the last hour
curl http://localhost:9001/metrics

# View Dead Letter Queue
curl http://localhost:9001/dlq

# Purge a topic's message backlog
curl -X POST http://localhost:9001/admin/purge \
  -H "Content-Type: application/json" \
  -d '{"topic": "orders.created"}'

# Register a durable topic (persists messages to SQLite)
curl -X POST http://localhost:9001/admin/topics/durable \
  -H "Content-Type: application/json" \
  -d '{"topic": "payments.processed"}'
```

---

## Connection Tokens (Frontend Security)

API keys should **never** be exposed in browser-side JavaScript. Use short-lived, single-use connection tokens instead:

### Flow

```
Browser → Your Backend → POST /auth/token (with API key) → EchoBus
Browser ← Your Backend ← { token: "etk_..." }
Browser → WebSocket ws://host:9000/ws?token=etk_...  → EchoBus
```

### Generate a Token (Server-Side)

```typescript
// Your backend (Bun / Node.js / any language)
const res = await fetch("http://localhost:9001/auth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey: "eb_your_secret_key",   // never sent to browser
    options: {
      ttl: 30,                      // seconds (max 300)
      topics: ["chat.*"],           // optional: restrict topics
      permissions: ["publish", "subscribe"],
    },
  }),
});
const { token, expiresIn } = await res.json();
// Send `token` to your frontend
```

### Connect with Token (Browser-Side)

```typescript
// Browser — API key never appears here
const token = await fetch("/api/ws-token").then((r) => r.json()).then((d) => d.token);

const ws = new WebSocket(`ws://localhost:9000/ws?token=${token}`);
ws.onopen = () => console.log("Connected securely!");
```

### Token Properties

| Property | Description |
|----------|-------------|
| Single-use | Consumed on first WebSocket connection |
| Short-lived | Default 30s TTL, max 5 minutes |
| Scoped | Can restrict topics and permissions |
| Secure | API key never leaves your server |
