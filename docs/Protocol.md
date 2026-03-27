# EchoBus Protocol Specification

## 1. Overview

EchoBus uses **WebSocket** as its transport layer. All messages are **JSON-encoded** UTF-8 strings. Every message — in both directions — contains a `type` field that identifies the message kind.

| Direction | Union Type | Description |
|---|---|---|
| Client → Broker | `BrokerMessage` | Commands sent by clients |
| Broker → Client | `ServerMessage` | Responses and events from the broker |

**Default endpoint:** `ws://<host>:9000/ws`

---

## 2. Authentication

Authentication is passed as a query parameter on the WebSocket URL. Two credential types are supported:

| Type | Prefix | Storage | Lifetime |
|---|---|---|---|
| API Key | `eb_` | Persistent (SQLite) | Unlimited |
| Token | `etk_` | In-memory | Max 300 seconds, single-use |

**Connection examples:**

```
ws://localhost:9000/ws?apiKey=eb_a1b2c3d4e5f6
ws://localhost:9000/ws?token=etk_x9y8z7w6v5u4
```

When the broker is configured with `REQUIRE_AUTH=false`, no query parameters are needed:

```
ws://localhost:9000/ws
```

---

## 3. Pub/Sub Messages

### 3.1 SUBSCRIBE (Client → Broker)

Register interest in a topic. The `id` is a client-chosen identifier for the subscription.

```json
{ "type": "SUBSCRIBE", "topic": "orders.created", "id": "sub_1" }
```

**Response — SUBSCRIBED:**

```json
{ "type": "SUBSCRIBED", "topic": "orders.created", "id": "sub_1" }
```

### 3.2 UNSUBSCRIBE (Client → Broker)

Remove a subscription. The `topic` and `id` must match a previous `SUBSCRIBE`.

```json
{ "type": "UNSUBSCRIBE", "topic": "orders.created", "id": "sub_1" }
```

**Response — UNSUBSCRIBED:**

```json
{ "type": "UNSUBSCRIBED", "topic": "orders.created", "id": "sub_1" }
```

### 3.3 PUBLISH (Client → Broker)

Publish a message to a topic. The `payload` can be any JSON value. If `requireAck` is `true`, the broker will wait for an `ACK` from each subscriber before confirming delivery.

```json
{
  "type": "PUBLISH",
  "topic": "user.signup",
  "payload": { "userId": "987", "email": "test@example.com" },
  "messageId": "msg_abc123",
  "requireAck": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `topic` | `string` | Yes | Target topic |
| `payload` | `unknown` | Yes | Message body (any JSON value) |
| `messageId` | `string` | No | Client-supplied message ID |
| `requireAck` | `boolean` | No | Whether subscribers must acknowledge |

### 3.4 MESSAGE (Broker → Client)

Delivered to subscribers when a message is published to a matching topic.

```json
{
  "type": "MESSAGE",
  "topic": "user.signup",
  "payload": { "userId": "987", "email": "test@example.com" },
  "messageId": "msg_abc123"
}
```

### 3.5 ACK (Client → Broker)

Acknowledge successful processing of a message.

```json
{ "type": "ACK", "messageId": "msg_abc123" }
```

### 3.6 NACK (Client → Broker)

Negatively acknowledge a message, indicating processing failure. An optional `reason` may be provided.

```json
{ "type": "NACK", "messageId": "msg_abc123", "reason": "validation failed" }
```

### 3.7 ACK_CONFIRM (Broker → Client)

Sent to the original publisher once all subscribers have acknowledged the message.

```json
{ "type": "ACK_CONFIRM", "messageId": "msg_abc123" }
```

---

## 4. Wildcard Topics

Topic names are dot-delimited segments. Two wildcard characters are available when subscribing:

| Wildcard | Matches | Example |
|---|---|---|
| `*` | Exactly **one** segment | `orders.*` matches `orders.created` but **not** `orders.us.created` |
| `#` | **One or more** segments | `logs.#` matches `logs.error` and `logs.error.critical` |

**Examples:**

```json
{ "type": "SUBSCRIBE", "topic": "orders.*", "id": "sub_wildcard_1" }
{ "type": "SUBSCRIBE", "topic": "logs.#", "id": "sub_wildcard_2" }
```

---

## 5. RPC Messages

EchoBus supports request/response style remote procedure calls routed through the broker.

### Flow

```
Executor                     Broker                      Caller
   │                           │                           │
   │── RPC_REGISTER ──────────►│                           │
   │◄── RPC_REGISTERED ───────│                           │
   │                           │                           │
   │                           │◄── RPC_DISCOVER ─────────│
   │                           │── RPC_FUNCTIONS ─────────►│
   │                           │                           │
   │                           │◄── RPC_CALL ─────────────│
   │◄── RPC_CALL ─────────────│                           │
   │── RPC_RESPONSE ─────────►│                           │
   │                           │── RPC_RESPONSE ──────────►│
```

### 5.1 RPC_REGISTER (Client → Broker)

Register one or more functions that this client can execute.

```json
{
  "type": "RPC_REGISTER",
  "functions": [
    {
      "name": "math.add",
      "description": "Add two numbers",
      "params": {
        "a": { "type": "number", "description": "First operand", "required": true },
        "b": { "type": "number", "description": "Second operand", "required": true }
      },
      "returns": { "type": "number", "description": "Sum of a and b" }
    }
  ]
}
```

**Response — RPC_REGISTERED:**

```json
{ "type": "RPC_REGISTERED", "count": 1 }
```

### 5.2 RPC_DISCOVER (Client → Broker)

Request a list of all registered RPC functions across all connected clients.

```json
{ "type": "RPC_DISCOVER" }
```

**Response — RPC_FUNCTIONS:**

```json
{
  "type": "RPC_FUNCTIONS",
  "functions": [
    {
      "name": "math.add",
      "description": "Add two numbers",
      "params": {
        "a": { "type": "number", "description": "First operand", "required": true },
        "b": { "type": "number", "description": "Second operand", "required": true }
      },
      "returns": { "type": "number", "description": "Sum of a and b" },
      "executerId": "client_42"
    }
  ]
}
```

### 5.3 RPC_CALL (Client → Broker)

Invoke a registered function. The broker forwards the call to the executor that registered it.

```json
{
  "type": "RPC_CALL",
  "requestId": "rpc_001",
  "function": "math.add",
  "args": { "a": 2, "b": 3 }
}
```

**Forwarded to executor (Broker → Client):**

The broker adds `callerId` so the executor knows who initiated the call.

```json
{
  "type": "RPC_CALL",
  "requestId": "rpc_001",
  "function": "math.add",
  "args": { "a": 2, "b": 3 },
  "callerId": "client_17"
}
```

### 5.4 RPC_RESPONSE (Client → Broker / Broker → Client)

Return the result of an RPC call. Sent by the executor, then forwarded by the broker to the caller.

**Success:**

```json
{ "type": "RPC_RESPONSE", "requestId": "rpc_001", "result": 5 }
```

**Error (from executor):**

```json
{ "type": "RPC_RESPONSE", "requestId": "rpc_001", "error": "division by zero" }
```

### 5.5 RPC_ERROR (Broker → Client)

Sent by the broker when an RPC call cannot be routed or processed (e.g., function not found, executor disconnected).

```json
{ "type": "RPC_ERROR", "requestId": "rpc_001", "error": "Function 'math.divide' not found" }
```

---

## 6. Streaming Messages

Streaming enables ordered, multi-part data delivery over a topic.

### Lifecycle

```
Producer                     Broker                     Subscriber
   │                           │                           │
   │── STREAM_START ──────────►│── STREAM_START ──────────►│
   │── STREAM_DATA (seq 0) ──►│── STREAM_DATA (seq 0) ──►│
   │── STREAM_DATA (seq 1) ──►│── STREAM_DATA (seq 1) ──►│
   │── STREAM_END ────────────►│── STREAM_END ────────────►│
```

### 6.1 STREAM_START (Client → Broker / Broker → Client)

Begin a new stream on a topic. An optional `metadata` field can describe the stream contents.

**Client → Broker:**

```json
{
  "type": "STREAM_START",
  "streamId": "stream_42",
  "topic": "data.export",
  "metadata": { "format": "csv", "totalRows": 10000 }
}
```

**Broker → Client** (forwarded to subscribers):

```json
{
  "type": "STREAM_START",
  "streamId": "stream_42",
  "topic": "data.export",
  "metadata": { "format": "csv", "totalRows": 10000 }
}
```

### 6.2 STREAM_DATA (Client → Broker / Broker → Client)

Send an ordered chunk of data. The `sequence` number starts at `0` and increments by `1`.

**Client → Broker:**

```json
{
  "type": "STREAM_DATA",
  "streamId": "stream_42",
  "payload": { "rows": ["alice,30", "bob,25"] },
  "sequence": 0
}
```

**Broker → Client** (forwarded to subscribers with `topic` attached):

```json
{
  "type": "STREAM_DATA",
  "streamId": "stream_42",
  "topic": "data.export",
  "payload": { "rows": ["alice,30", "bob,25"] },
  "sequence": 0
}
```

### 6.3 STREAM_END (Client → Broker / Broker → Client)

Signal the end of a stream.

**Client → Broker:**

```json
{ "type": "STREAM_END", "streamId": "stream_42" }
```

**Broker → Client** (forwarded to subscribers with `topic` attached):

```json
{ "type": "STREAM_END", "streamId": "stream_42", "topic": "data.export" }
```

---

## 7. Error Handling

The broker sends an `ERROR` message when a client sends an invalid or unprocessable message.

```json
{ "type": "ERROR", "code": "INVALID_TOPIC", "message": "Topic must not be empty" }
```

| Field | Type | Description |
|---|---|---|
| `code` | `string` | Machine-readable error code |
| `message` | `string` | Human-readable description |

---

## 8. TypeScript Type Definitions

### RpcFunctionDef

```typescript
interface RpcFunctionDef {
  name: string;
  description?: string;
  params?: Record<string, { type: string; description?: string; required?: boolean }>;
  returns?: { type: string; description?: string };
}
```

### BrokerMessage (Client → Broker)

```typescript
type BrokerMessage =
  | { type: "SUBSCRIBE"; topic: string; id: string }
  | { type: "UNSUBSCRIBE"; topic: string; id: string }
  | { type: "PUBLISH"; topic: string; payload: unknown; messageId?: string; requireAck?: boolean }
  | { type: "ACK"; messageId: string }
  | { type: "NACK"; messageId: string; reason?: string }
  | { type: "RPC_REGISTER"; functions: RpcFunctionDef[] }
  | { type: "RPC_DISCOVER" }
  | { type: "RPC_CALL"; requestId: string; function: string; args?: unknown }
  | { type: "RPC_RESPONSE"; requestId: string; result?: unknown; error?: string }
  | { type: "STREAM_START"; streamId: string; topic: string; metadata?: unknown }
  | { type: "STREAM_DATA"; streamId: string; payload: unknown; sequence: number }
  | { type: "STREAM_END"; streamId: string };
```

### ServerMessage (Broker → Client)

```typescript
type ServerMessage =
  | { type: "MESSAGE"; topic: string; payload: unknown; messageId: string }
  | { type: "ACK_CONFIRM"; messageId: string }
  | { type: "ERROR"; code: string; message: string }
  | { type: "SUBSCRIBED"; topic: string; id: string }
  | { type: "UNSUBSCRIBED"; topic: string; id: string }
  | { type: "RPC_REGISTERED"; count: number }
  | { type: "RPC_FUNCTIONS"; functions: (RpcFunctionDef & { executerId: string })[] }
  | { type: "RPC_CALL"; requestId: string; function: string; args?: unknown; callerId: string }
  | { type: "RPC_RESPONSE"; requestId: string; result?: unknown; error?: string }
  | { type: "RPC_ERROR"; requestId: string; error: string }
  | { type: "STREAM_START"; streamId: string; topic: string; metadata?: unknown }
  | { type: "STREAM_DATA"; streamId: string; topic: string; payload: unknown; sequence: number }
  | { type: "STREAM_END"; streamId: string; topic: string };
```
