import React from "react";

const codeBlockStyle: React.CSSProperties = {
  background: "#1e1e2e",
  color: "#cdd6f4",
  padding: "16px 20px",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "'Fira Code', 'Cascadia Code', monospace",
  overflowX: "auto",
  lineHeight: 1.6,
  whiteSpace: "pre",
  margin: "12px 0 20px",
};

const sectionStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: "24px 28px",
  marginBottom: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};

const h2Style: React.CSSProperties = { margin: "0 0 6px", fontSize: 18, color: "#222" };
const descStyle: React.CSSProperties = { margin: "0 0 14px", fontSize: 14, color: "#666", lineHeight: 1.5 };

function CodeBlock({ children }: { children: string }) {
  return <pre style={codeBlockStyle}>{children.trim()}</pre>;
}

export function DocumentationPage() {
  return (
    <div>
      <h1 style={{ margin: "0 0 8px", fontSize: 24, color: "#222" }}>Documentation</h1>
      <p style={{ margin: "0 0 24px", color: "#666" }}>
        Quick reference for connecting to EchoBus as a publisher, consumer, or executer.
        Use the raw WebSocket API or the official <code>echobus</code> npm client library.
      </p>

      {/* Protocol */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Protocol Overview</h2>
        <p style={descStyle}>
          EchoBus uses a JSON protocol over raw WebSockets. Every message has a <code>type</code> field.
          Connect to <code>ws://host:9000/ws</code> to start publishing or consuming.
        </p>
        <CodeBlock>{`
// Client → Broker
{ "type": "SUBSCRIBE",   "topic": "orders.created", "id": "sub-1" }
{ "type": "UNSUBSCRIBE", "topic": "orders.created", "id": "sub-1" }
{ "type": "PUBLISH",     "topic": "orders.created", "payload": { ... } }
{ "type": "ACK",         "messageId": "msg_abc123" }
{ "type": "NACK",        "messageId": "msg_abc123", "reason": "failed" }

// RPC Messages
{ "type": "RPC_REGISTER", "functions": [ { "name": "add", ... } ] }
{ "type": "RPC_DISCOVER" }
{ "type": "RPC_CALL",     "requestId": "req_001", "function": "add", "args": { ... } }
{ "type": "RPC_RESPONSE", "requestId": "req_001", "result": 8 }

// Streaming Messages
{ "type": "STREAM_START", "streamId": "st_001", "topic": "data.feed", "metadata": { ... } }
{ "type": "STREAM_DATA",  "streamId": "st_001", "payload": "chunk", "sequence": 0 }
{ "type": "STREAM_END",   "streamId": "st_001" }

// Broker → Client
{ "type": "MESSAGE",      "topic": "orders.created", "payload": { ... }, "messageId": "msg_abc123" }
{ "type": "SUBSCRIBED",   "topic": "orders.created", "id": "sub-1" }
{ "type": "UNSUBSCRIBED", "topic": "orders.created", "id": "sub-1" }
{ "type": "ERROR",        "code": "INVALID_MESSAGE", "message": "..." }
{ "type": "RPC_REGISTERED", "count": 1 }
{ "type": "RPC_FUNCTIONS",  "functions": [ ... ] }
{ "type": "RPC_ERROR",      "requestId": "req_001", "error": "..." }
{ "type": "STREAM_START",   "streamId": "st_001", "topic": "data.feed", "metadata": { ... } }
{ "type": "STREAM_DATA",    "streamId": "st_001", "topic": "data.feed", "payload": "chunk", "sequence": 0 }
{ "type": "STREAM_END",     "streamId": "st_001", "topic": "data.feed" }
`}</CodeBlock>
      </div>

      {/* Authentication */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Authentication (API Keys)</h2>
        <p style={descStyle}>
          EchoBus uses API keys to authenticate clients. Generate a key from the{" "}
          <strong>🔑 API Keys</strong> page in the dashboard, then pass it when connecting.
          Keys have configurable permissions: <code>publish</code>, <code>subscribe</code>, and <code>admin</code>.
        </p>
        <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#444" }}>Creating an API Key</h4>
        <CodeBlock>{`
# Via REST API
curl -X POST http://localhost:9001/admin/api-keys \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-service", "permissions": ["publish", "subscribe"]}'

# Response (full key shown ONLY at creation — save it!)
{
  "id": "key_abc123",
  "name": "my-service",
  "key": "eb_8u9z968lliussoarsvmq77dpixa32ny4",
  "permissions": ["publish", "subscribe"]
}
`}</CodeBlock>
        <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#444" }}>Using an API Key (WebSocket)</h4>
        <p style={descStyle}>
          Pass the key as a <code>apiKey</code> query parameter when opening the WebSocket connection.
        </p>
        <CodeBlock>{`
// Bun
const ws = new WebSocket("ws://localhost:9000/ws?apiKey=eb_8u9z968l...");

// Node.js
import WebSocket from "ws";
const ws = new WebSocket("ws://localhost:9000/ws?apiKey=eb_8u9z968l...");
`}</CodeBlock>
        <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#444" }}>Managing API Keys</h4>
        <CodeBlock>{`
# List all keys (shows preview only, never the full key)
curl http://localhost:9001/admin/api-keys

# Revoke a key (soft-disable, can be re-enabled)
curl -X PATCH http://localhost:9001/admin/api-keys/key_abc123/revoke

# Delete a key permanently
curl -X DELETE http://localhost:9001/admin/api-keys/key_abc123
`}</CodeBlock>
      </div>

      {/* Connection Tokens */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Connection Tokens (Frontend Security)</h2>
        <p style={descStyle}>
          API keys should <strong>never</strong> be exposed in browser-side code — anyone who inspects
          your page can steal them. Instead, use <strong>short-lived, single-use connection tokens</strong>.
        </p>
        <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#444" }}>How It Works</h4>
        <p style={descStyle}>
          Your <em>backend</em> holds the API key securely and requests a connection token from EchoBus.
          The token is passed to the browser, which uses it once to connect via WebSocket.
        </p>
        <CodeBlock>{`
┌─────────┐     1. Request token      ┌──────────────┐     2. POST /auth/token     ┌──────────┐
│ Browser  │ ──────────────────────► │ Your Backend │ ─────────────────────────► │ EchoBus  │
│          │ ◄────────────────────── │  (holds key) │ ◄───────────────────────── │  API     │
│          │     3. Return token      │              │     4. { token: "etk_..." } │          │
│          │                          └──────────────┘                            └──────────┘
│          │     5. Connect WebSocket with token                                   │
│          │ ─────────────────────────────────────────────────────────────────────► │
└─────────┘   ws://host:9000/ws?token=etk_...                                     └──────────┘
`}</CodeBlock>
        <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#444" }}>Generating a Token (Server-Side)</h4>
        <CodeBlock>{`
// Your backend server (Node.js / Bun / any language)
const res = await fetch("http://localhost:9001/auth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey: "eb_8u9z968l...",         // your secret API key (never sent to browser)
    options: {
      ttl: 30,                        // token lifetime in seconds (max 300)
      topics: ["chat.*"],             // optional: restrict allowed topics
      permissions: ["publish", "subscribe"]
    }
  })
});

const { token, expiresIn } = await res.json();
// → { token: "etk_a7b2x9...", expiresIn: 30 }
// Send 'token' to your browser client
`}</CodeBlock>
        <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#444" }}>Using a Token (Browser-Side)</h4>
        <CodeBlock>{`
// Browser JavaScript — API key is NEVER exposed here
const token = await fetchTokenFromYourBackend(); // your own endpoint

const ws = new WebSocket(\`ws://localhost:9000/ws?token=\${token}\`);

ws.onopen = () => {
  console.log("Connected securely with token!");
  // Token is now consumed — cannot be reused
};
`}</CodeBlock>
        <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#444" }}>Token Properties</h4>
        <CodeBlock>{`
Property       Description
──────────     ──────────────────────────────────────────
Single-use     Consumed on first WebSocket connection
Short-lived    Default 30s TTL, max 5 minutes
Scoped         Can restrict topics and permissions
Secure         API key never leaves your server
`}</CodeBlock>
        <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#444" }}>cURL Example</h4>
        <CodeBlock>{`
# Generate a token
curl -X POST http://localhost:9001/auth/token \\
  -H "Content-Type: application/json" \\
  -d '{"apiKey": "eb_8u9z968l...", "options": {"ttl": 60}}'

# Response
{
  "token": "etk_a7b2x9k4m1p...",
  "expiresAt": 1711539000000,
  "expiresIn": 60
}

# Connect with token (wscat example)
wscat -c "ws://localhost:9000/ws?token=etk_a7b2x9k4m1p..."
`}</CodeBlock>
      </div>

      {/* Wildcard */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Wildcard Subscriptions</h2>
        <p style={descStyle}>
          <code>*</code> matches exactly <strong>one</strong> topic segment.{" "}
          <code>#</code> matches <strong>one or more</strong> segments.
        </p>
        <CodeBlock>{`
"orders.*"   → matches orders.created, orders.updated
             → does NOT match orders.us.created

"logs.#"     → matches logs.error, logs.error.critical, logs.app.info
`}</CodeBlock>
      </div>

      {/* Bun Publisher */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Bun — Publisher</h2>
        <p style={descStyle}>Bun has native WebSocket support — no packages needed.</p>
        <CodeBlock>{`
const API_KEY = "eb_your_key_here";
const ws = new WebSocket(\`ws://localhost:9000/ws?apiKey=\${API_KEY}\`);

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "PUBLISH",
    topic: "orders.created",
    payload: { orderId: "ord_001", item: "Widget", quantity: 3 },
  }));
};
`}</CodeBlock>
      </div>

      {/* Bun Consumer */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Bun — Consumer</h2>
        <CodeBlock>{`
const API_KEY = "eb_your_key_here";
const ws = new WebSocket(\`ws://localhost:9000/ws?apiKey=\${API_KEY}\`);

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "SUBSCRIBE",
    topic: "orders.created",
    id: "my-sub-1",
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "MESSAGE") {
    console.log("Received:", msg.payload);
  }
};
`}</CodeBlock>
      </div>

      {/* Node.js Publisher */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Node.js — Publisher</h2>
        <p style={descStyle}>
          Install the <code>ws</code> package: <code>npm install ws</code>
        </p>
        <CodeBlock>{`
import WebSocket from "ws";

const API_KEY = "eb_your_key_here";
const ws = new WebSocket(\`ws://localhost:9000/ws?apiKey=\${API_KEY}\`);

ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "PUBLISH",
    topic: "orders.created",
    payload: { orderId: "ord_001", item: "Widget", quantity: 3 },
  }));
});
`}</CodeBlock>
      </div>

      {/* Node.js Consumer */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Node.js — Consumer</h2>
        <CodeBlock>{`
import WebSocket from "ws";

const API_KEY = "eb_your_key_here";
const ws = new WebSocket(\`ws://localhost:9000/ws?apiKey=\${API_KEY}\`);

ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "SUBSCRIBE",
    topic: "orders.created",
    id: "my-sub-1",
  }));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === "MESSAGE") {
    console.log("Received:", msg.payload);
  }
});
`}</CodeBlock>
      </div>

      {/* Fan-Out */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Fan-Out (1 Publisher → N Consumers)</h2>
        <p style={descStyle}>
          Multiple consumers subscribing to the same topic each receive every published message.
          Simply connect N consumers with <code>SUBSCRIBE</code> on the same topic, then publish — all N receive the message.
        </p>
        <CodeBlock>{`
// Consumer 1, 2, 3 all subscribe to "notifications"
ws.send(JSON.stringify({ type: "SUBSCRIBE", topic: "notifications", id: "c1" }));

// Publisher sends one message → all 3 consumers receive it
ws.send(JSON.stringify({
  type: "PUBLISH",
  topic: "notifications",
  payload: { text: "Hello everyone!" },
}));
`}</CodeBlock>
      </div>

      {/* Acknowledged Delivery */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Acknowledged Delivery</h2>
        <p style={descStyle}>
          Set <code>requireAck: true</code> to persist messages in SQLite.
          Consumers send <code>ACK</code> after processing, or <code>NACK</code> to route to the Dead Letter Queue.
        </p>
        <CodeBlock>{`
// Publish with ACK required
ws.send(JSON.stringify({
  type: "PUBLISH",
  topic: "payments.processed",
  requireAck: true,
  messageId: "pay_001",
  payload: { amount: 99.99, currency: "USD" },
}));

// Consumer acknowledges
ws.send(JSON.stringify({ type: "ACK", messageId: "pay_001" }));

// Or reject (goes to Dead Letter Queue)
ws.send(JSON.stringify({ type: "NACK", messageId: "pay_001", reason: "Invalid amount" }));
`}</CodeBlock>
      </div>

      {/* RPC Protocol */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>RPC (Remote Procedure Calls)</h2>
        <p style={descStyle}>
          EchoBus supports RPC — a <strong>producer</strong> can call functions registered by an <strong>executer</strong>.
          The broker routes calls to available executers and returns results to the caller.
          Calls have a configurable timeout (default 30s).
        </p>
        <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#444" }}>RPC Message Types</h4>
        <CodeBlock>{`
// Executer → Broker: Register available functions
{ "type": "RPC_REGISTER", "functions": [
    { "name": "add", "description": "Add two numbers",
      "params": { "a": { "type": "number" }, "b": { "type": "number" } },
      "returns": { "type": "number" } }
  ] }

// Broker → Executer: Confirmation
{ "type": "RPC_REGISTERED", "count": 1 }

// Producer → Broker: Discover available functions
{ "type": "RPC_DISCOVER" }

// Broker → Producer: List of functions
{ "type": "RPC_FUNCTIONS", "functions": [
    { "name": "add", "description": "Add two numbers", "executerId": "client_abc" }
  ] }

// Producer → Broker: Call a function
{ "type": "RPC_CALL", "requestId": "req_001", "function": "add", "args": { "a": 5, "b": 3 } }

// Broker → Executer: Forwarded call
{ "type": "RPC_CALL", "requestId": "req_001", "function": "add",
  "args": { "a": 5, "b": 3 }, "callerId": "client_xyz" }

// Executer → Broker → Producer: Result
{ "type": "RPC_RESPONSE", "requestId": "req_001", "result": 8 }

// Error response (function not found, timeout, or executer error)
{ "type": "RPC_ERROR", "requestId": "req_001", "error": "..." }
`}</CodeBlock>
      </div>

      {/* RPC Bun Executer */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Bun — RPC Executer</h2>
        <p style={descStyle}>
          An executer connects and registers functions. When a producer calls one,
          the broker forwards it and the executer sends back the result.
        </p>
        <CodeBlock>{`
const API_KEY = "eb_your_key_here";
const ws = new WebSocket(\`ws://localhost:9000/ws?apiKey=\${API_KEY}\`);

// Define functions this executer provides
const functions = [
  { name: "add", description: "Add two numbers",
    params: { a: { type: "number" }, b: { type: "number" } },
    returns: { type: "number" } },
  { name: "greet", description: "Returns a greeting",
    params: { name: { type: "string" } },
    returns: { type: "string" } },
];

ws.onopen = () => {
  ws.send(JSON.stringify({ type: "RPC_REGISTER", functions }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "RPC_CALL") {
    let result: unknown;
    let error: string | undefined;

    try {
      switch (msg.function) {
        case "add":
          result = msg.args.a + msg.args.b;
          break;
        case "greet":
          result = \`Hello, \${msg.args.name}!\`;
          break;
        default:
          error = \`Unknown function: \${msg.function}\`;
      }
    } catch (e) {
      error = String(e);
    }

    ws.send(JSON.stringify({
      type: "RPC_RESPONSE",
      requestId: msg.requestId,
      ...(error ? { error } : { result }),
    }));
  }
};
`}</CodeBlock>
      </div>

      {/* RPC Bun Producer */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Bun — RPC Producer (Caller)</h2>
        <p style={descStyle}>
          A producer discovers available functions and calls them. Results are
          matched by <code>requestId</code>.
        </p>
        <CodeBlock>{`
const API_KEY = "eb_your_key_here";
const ws = new WebSocket(\`ws://localhost:9000/ws?apiKey=\${API_KEY}\`);

const pending = new Map<string, (msg: any) => void>();

ws.onopen = () => {
  // Discover available functions
  ws.send(JSON.stringify({ type: "RPC_DISCOVER" }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "RPC_FUNCTIONS") {
    console.log("Available functions:", msg.functions);

    // Call a function
    callRpc("add", { a: 10, b: 20 }).then((res) =>
      console.log("add result:", res)      // → 30
    );
  }

  if (msg.type === "RPC_RESPONSE" || msg.type === "RPC_ERROR") {
    const resolve = pending.get(msg.requestId);
    if (resolve) {
      pending.delete(msg.requestId);
      resolve(msg);
    }
  }
};

function callRpc(fn: string, args: unknown): Promise<any> {
  const requestId = \`req_\${Date.now()}_\${Math.random().toString(36).slice(2, 6)}\`;
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    ws.send(JSON.stringify({
      type: "RPC_CALL", requestId, function: fn, args,
    }));
  });
}
`}</CodeBlock>
      </div>

      {/* RPC Node.js Executer */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Node.js — RPC Executer</h2>
        <p style={descStyle}>
          Install the <code>ws</code> package: <code>npm install ws</code>
        </p>
        <CodeBlock>{`
import WebSocket from "ws";

const API_KEY = "eb_your_key_here";
const ws = new WebSocket(\`ws://localhost:9000/ws?apiKey=\${API_KEY}\`);

ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "RPC_REGISTER",
    functions: [
      { name: "multiply", description: "Multiply two numbers",
        params: { a: { type: "number" }, b: { type: "number" } },
        returns: { type: "number" } },
    ],
  }));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === "RPC_CALL") {
    let result, error;
    try {
      if (msg.function === "multiply") {
        result = msg.args.a * msg.args.b;
      } else {
        error = "Unknown function";
      }
    } catch (e) {
      error = String(e);
    }

    ws.send(JSON.stringify({
      type: "RPC_RESPONSE",
      requestId: msg.requestId,
      ...(error ? { error } : { result }),
    }));
  }
});
`}</CodeBlock>
      </div>

      {/* Streaming */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Streaming</h2>
        <p style={descStyle}>
          EchoBus supports first-class data streaming. A publisher starts a stream on a topic, sends
          sequenced data chunks, and ends the stream. All subscribers on that topic receive every lifecycle event
          (<code>STREAM_START</code>, <code>STREAM_DATA</code>, <code>STREAM_END</code>) in order.
          Wildcard subscriptions work with streams too.
        </p>
        <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#444" }}>Streaming Protocol</h4>
        <CodeBlock>{`
// Publisher starts a stream
{ "type": "STREAM_START", "streamId": "st_001", "topic": "data.sensor",
  "metadata": { "format": "json", "sensorId": "temp-42" } }

// Publisher sends data chunks (sequence must increment)
{ "type": "STREAM_DATA", "streamId": "st_001", "payload": { "temp": 23.5 }, "sequence": 0 }
{ "type": "STREAM_DATA", "streamId": "st_001", "payload": { "temp": 23.7 }, "sequence": 1 }
{ "type": "STREAM_DATA", "streamId": "st_001", "payload": { "temp": 24.1 }, "sequence": 2 }

// Publisher ends the stream
{ "type": "STREAM_END", "streamId": "st_001" }

// Subscribers receive all events with the topic attached:
// STREAM_START → STREAM_DATA (×N) → STREAM_END
`}</CodeBlock>
      </div>

      {/* Bun Streaming Publisher */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Bun — Streaming Publisher</h2>
        <CodeBlock>{`
const API_KEY = "eb_your_key_here";
const ws = new WebSocket(\`ws://localhost:9000/ws?apiKey=\${API_KEY}\`);

ws.onopen = () => {
  const streamId = \`st_\${Date.now()}\`;

  // Start the stream
  ws.send(JSON.stringify({
    type: "STREAM_START",
    streamId,
    topic: "data.sensor.temp",
    metadata: { unit: "celsius" },
  }));

  // Send data chunks
  let seq = 0;
  const interval = setInterval(() => {
    ws.send(JSON.stringify({
      type: "STREAM_DATA",
      streamId,
      payload: { temp: 20 + Math.random() * 10, ts: Date.now() },
      sequence: seq++,
    }));

    // End after 10 chunks
    if (seq >= 10) {
      clearInterval(interval);
      ws.send(JSON.stringify({ type: "STREAM_END", streamId }));
    }
  }, 100);
};
`}</CodeBlock>
      </div>

      {/* Bun Streaming Consumer */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Bun — Streaming Consumer</h2>
        <CodeBlock>{`
const API_KEY = "eb_your_key_here";
const ws = new WebSocket(\`ws://localhost:9000/ws?apiKey=\${API_KEY}\`);

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "SUBSCRIBE",
    topic: "data.sensor.#",   // wildcard to catch all sensors
    id: "stream-consumer-1",
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "STREAM_START":
      console.log(\`Stream started: \${msg.streamId} on \${msg.topic}\`, msg.metadata);
      break;
    case "STREAM_DATA":
      console.log(\`[\${msg.sequence}] \${msg.topic}:\`, msg.payload);
      break;
    case "STREAM_END":
      console.log(\`Stream ended: \${msg.streamId}\`);
      break;
  }
};
`}</CodeBlock>
      </div>

      {/* Node.js Streaming */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Node.js — Streaming Publisher</h2>
        <p style={descStyle}>
          Install the <code>ws</code> package: <code>npm install ws</code>
        </p>
        <CodeBlock>{`
import WebSocket from "ws";

const API_KEY = "eb_your_key_here";
const ws = new WebSocket(\`ws://localhost:9000/ws?apiKey=\${API_KEY}\`);

ws.on("open", () => {
  const streamId = \`st_\${Date.now()}\`;

  ws.send(JSON.stringify({
    type: "STREAM_START", streamId,
    topic: "logs.app", metadata: { service: "api-gateway" },
  }));

  let seq = 0;
  const interval = setInterval(() => {
    ws.send(JSON.stringify({
      type: "STREAM_DATA", streamId,
      payload: { level: "info", message: \`Request #\${seq}\` },
      sequence: seq++,
    }));

    if (seq >= 5) {
      clearInterval(interval);
      ws.send(JSON.stringify({ type: "STREAM_END", streamId }));
    }
  }, 200);
});
`}</CodeBlock>
      </div>

      {/* ── NPM Client Library ─────────────────────────────────── */}

      <div style={sectionStyle}>
        <h2 style={h2Style}>📦 NPM Client Library — Install</h2>
        <p style={descStyle}>
          The <code>echobus</code> npm package provides a typed client for Node.js and the browser.
          Zero dependencies — uses the native <code>WebSocket</code> API.
        </p>
        <CodeBlock>{`
npm install echobus
# or
bun add echobus
`}</CodeBlock>
        <p style={descStyle}>
          Five client classes are available — use the one that matches your role, or <code>EchoBus</code> for everything on a single connection.
        </p>
        <CodeBlock>{`
import { EchoBus }   from "echobus";  // Unified — publish, subscribe, RPC, streaming
import { Publisher }  from "echobus";  // Publish messages + create streams
import { Consumer }   from "echobus";  // Subscribe to topics + receive streams
import { Executer }   from "echobus";  // Register RPC functions
import { RPCClient }  from "echobus";  // Discover + call RPC functions
`}</CodeBlock>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>📦 NPM — Publisher</h2>
        <CodeBlock>{`
import { Publisher } from "echobus";

const pub = new Publisher("ws://localhost:9000/ws", {
  apiKey: "eb_your_api_key",
});
await pub.connect();

// Fire and forget
pub.publish("orders.created", { orderId: "123", total: 99.99 });

// Require subscriber acknowledgment
pub.publish("payments.processed", { txId: "tx_001", amount: 49.99 }, {
  messageId: "pay_001",
  requireAck: true,
});

pub.close();
`}</CodeBlock>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>📦 NPM — Consumer</h2>
        <CodeBlock>{`
import { Consumer } from "echobus";

const sub = new Consumer("ws://localhost:9000/ws", {
  apiKey: "eb_your_api_key",
});
await sub.connect();

// Subscribe with a per-topic handler (supports wildcards)
const subId = await sub.subscribe("orders.*", (msg) => {
  console.log(\`[\${msg.topic}]\`, msg.payload);
  msg.ack();          // Acknowledge delivery
  // msg.nack("reason"); // Reject → sends to Dead Letter Queue
});

// Or listen for all messages via events
sub.on("message", (msg) => {
  console.log("Received:", msg.topic, msg.payload);
});

// Unsubscribe when done
await sub.unsubscribe(subId);

sub.close();
`}</CodeBlock>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>📦 NPM — RPC Executer</h2>
        <p style={descStyle}>
          Register functions that other clients can discover and call remotely.
          Handlers can be synchronous or <code>async</code>.
        </p>
        <CodeBlock>{`
import { Executer } from "echobus";

const exec = new Executer("ws://localhost:9000/ws", {
  apiKey: "eb_your_api_key",
});
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
    handler: (args) => args.a + args.b,
  },
  {
    name: "db.query",
    description: "Run a database query",
    handler: async (args) => {
      const rows = await database.query(args.sql);
      return rows;
    },
  },
]);
// Executer now handles incoming RPC_CALL messages automatically
`}</CodeBlock>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>📦 NPM — RPC Caller</h2>
        <p style={descStyle}>
          Discover available functions and call them with a Promise-based API.
        </p>
        <CodeBlock>{`
import { RPCClient } from "echobus";

const rpc = new RPCClient("ws://localhost:9000/ws", {
  apiKey: "eb_your_api_key",
});
await rpc.connect();

// Discover all registered functions
const functions = await rpc.discover();
console.log(functions);
// [{ name: "math.add", description: "Add two numbers", params: {...}, executerId: "..." }]

// Call a function (returns a Promise)
const sum = await rpc.call("math.add", { a: 10, b: 20 });
console.log(sum); // → 30

// With custom timeout (default: 30s)
const rows = await rpc.call("db.query", { sql: "SELECT 1" }, 60000);

rpc.close();
`}</CodeBlock>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>📦 NPM — Streaming</h2>
        <p style={descStyle}>
          Publishers create ordered data streams. Consumers receive stream events.
        </p>
        <CodeBlock>{`
import { Publisher, Consumer } from "echobus";

// ── Publisher: send a data stream ──
const pub = new Publisher("ws://localhost:9000/ws", { apiKey: "eb_..." });
await pub.connect();

const stream = pub.createStream("data.export", { format: "csv", totalRows: 3 });
stream.write({ row: "alice,30,engineer" });
stream.write({ row: "bob,25,designer" });
stream.write({ row: "charlie,35,manager" });
stream.end();

// ── Consumer: receive stream events ──
const sub = new Consumer("ws://localhost:9000/ws", { apiKey: "eb_..." });
await sub.connect();
await sub.subscribe("data.#");

sub.on("stream:start", ({ streamId, topic, metadata }) => {
  console.log("Stream started:", streamId, metadata);
});
sub.on("stream:data", ({ streamId, payload, sequence }) => {
  console.log(\`Chunk #\${sequence}:\`, payload);
});
sub.on("stream:end", ({ streamId }) => {
  console.log("Stream ended:", streamId);
});
`}</CodeBlock>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>📦 NPM — Unified Client</h2>
        <p style={descStyle}>
          The <code>EchoBus</code> class combines publish, subscribe, RPC, and streaming on a single WebSocket connection.
        </p>
        <CodeBlock>{`
import { EchoBus } from "echobus";

const client = new EchoBus("ws://localhost:9000/ws", { apiKey: "eb_..." });
await client.connect();

// Pub/Sub
await client.subscribe("orders.*", (msg) => console.log(msg.payload));
client.publish("orders.created", { orderId: "123" });

// RPC — register functions
await client.register([{
  name: "utils.echo",
  handler: (args) => args,
}]);

// RPC — call remote functions
const result = await client.call("math.add", { a: 1, b: 2 });

// Streaming
const stream = client.createStream("live.feed");
stream.write({ frame: 1, data: "..." });
stream.end();

client.close();
`}</CodeBlock>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>📦 NPM — Connection Tokens (Frontend)</h2>
        <p style={descStyle}>
          For browser usage, exchange an API key for a short-lived token server-side, then pass it to the client.
        </p>
        <CodeBlock>{`
// ── Server-side (keep your API key secret) ──
const res = await fetch("http://localhost:9001/auth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey: "eb_your_secret_key",
    options: { ttl: 30 },  // expires in 30 seconds, single-use
  }),
});
const { token } = await res.json();
// Send token to the frontend via your API

// ── Browser-side (token only, no API key exposed) ──
import { EchoBus } from "echobus";

const client = new EchoBus("ws://localhost:9000/ws", { token });
await client.connect();
client.publish("user.events", { action: "clicked_button" });
`}</CodeBlock>
      </div>

      <div style={sectionStyle}>
        <h2 style={h2Style}>📦 NPM — Auto-Reconnect</h2>
        <p style={descStyle}>
          Enable automatic reconnection with exponential backoff.
          Subscriptions and RPC registrations are restored on reconnect.
        </p>
        <CodeBlock>{`
import { Consumer } from "echobus";

const sub = new Consumer("ws://localhost:9000/ws", {
  apiKey: "eb_...",
  autoReconnect: true,          // enable auto-reconnect
  reconnectInterval: 1000,      // start at 1s, backs off up to 10×
  maxReconnectAttempts: -1,     // -1 = infinite retries
});

sub.on("disconnected", () => console.log("Lost connection..."));
sub.on("reconnecting", ({ attempt }) => console.log(\`Reconnecting #\${attempt}...\`));
sub.on("connected", () => console.log("Connected!"));

await sub.connect();
await sub.subscribe("events.*", (msg) => console.log(msg.payload));
// Subscription is automatically restored after reconnect
`}</CodeBlock>
      </div>

      {/* REST API */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>REST API</h2>
        <p style={descStyle}>The management API runs on port <code>9001</code> by default.</p>
        <CodeBlock>{`
GET  /health                     → Broker health & stats
GET  /topics                     → Active topics & subscriber counts
GET  /connections                → Connected clients
GET  /metrics?since=<ts>         → Historical metrics
GET  /dlq                        → Dead Letter Queue
POST /admin/purge                → { "topic": "orders.created" }
POST /admin/topics/durable       → { "topic": "payments" }
GET  /admin/api-keys             → List API keys (preview only)
POST /admin/api-keys             → { "name": "my-key", "permissions": ["publish","subscribe"] }
PATCH /admin/api-keys/:id/revoke → Revoke a key
DELETE /admin/api-keys/:id       → Delete a key permanently
`}</CodeBlock>
      </div>
    </div>
  );
}
