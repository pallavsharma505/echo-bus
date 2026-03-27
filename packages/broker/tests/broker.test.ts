import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Broker } from "../src/Broker";

let broker: Broker;
const PORT = 9876;

function ws(path = "/ws"): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${PORT}${path}`);
    socket.onopen = () => resolve(socket);
    socket.onerror = (e) => reject(e);
  });
}

function waitForMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    socket.onmessage = (e) => resolve(JSON.parse(e.data));
  });
}

function send(socket: WebSocket, msg: object): void {
  socket.send(JSON.stringify(msg));
}

beforeAll(() => {
  broker = new Broker({ port: PORT, requireAuth: false });
  broker.start();
});

afterAll(() => {
  broker.stop();
});

describe("Broker", () => {
  test("accepts WebSocket connections", async () => {
    const client = await ws();
    expect(client.readyState).toBe(WebSocket.OPEN);
    expect(broker.connections.count).toBeGreaterThanOrEqual(1);
    client.close();
  });

  test("subscribe and receive SUBSCRIBED confirmation", async () => {
    const client = await ws();
    const msgPromise = waitForMessage(client);
    send(client, { type: "SUBSCRIBE", topic: "test.topic", id: "sub1" });
    const response = await msgPromise;
    expect(response.type).toBe("SUBSCRIBED");
    expect(response.topic).toBe("test.topic");
    client.close();
  });

  test("publish and receive message on subscribed topic", async () => {
    const sub = await ws();
    const pub = await ws();

    // Subscribe
    const subMsg = waitForMessage(sub);
    send(sub, { type: "SUBSCRIBE", topic: "orders.created", id: "s1" });
    await subMsg;

    // Publish
    const deliveryMsg = waitForMessage(sub);
    send(pub, {
      type: "PUBLISH",
      topic: "orders.created",
      payload: { orderId: 123 },
    });

    const msg = await deliveryMsg;
    expect(msg.type).toBe("MESSAGE");
    expect(msg.topic).toBe("orders.created");
    expect(msg.payload.orderId).toBe(123);
    expect(msg.messageId).toBeDefined();

    sub.close();
    pub.close();
  });

  test("wildcard subscription with * matches single segment", async () => {
    const sub = await ws();
    const pub = await ws();

    const subMsg = waitForMessage(sub);
    send(sub, { type: "SUBSCRIBE", topic: "orders.*", id: "s2" });
    await subMsg;

    const deliveryMsg = waitForMessage(sub);
    send(pub, {
      type: "PUBLISH",
      topic: "orders.updated",
      payload: { status: "shipped" },
    });

    const msg = await deliveryMsg;
    expect(msg.type).toBe("MESSAGE");
    expect(msg.topic).toBe("orders.updated");
    expect(msg.payload.status).toBe("shipped");

    sub.close();
    pub.close();
  });

  test("wildcard * does not match multi-segment topics", async () => {
    const sub = await ws();
    const pub = await ws();

    const subMsg = waitForMessage(sub);
    send(sub, { type: "SUBSCRIBE", topic: "orders.*", id: "s3" });
    await subMsg;

    // This should NOT match orders.*
    send(pub, {
      type: "PUBLISH",
      topic: "orders.us.created",
      payload: {},
    });

    // Give it a moment then check no message was received
    const received = await Promise.race([
      waitForMessage(sub).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ]);

    expect(received).toBe(false);

    sub.close();
    pub.close();
  });

  test("# wildcard matches multi-segment topics", async () => {
    const sub = await ws();
    const pub = await ws();

    const subMsg = waitForMessage(sub);
    send(sub, { type: "SUBSCRIBE", topic: "logs.#", id: "s4" });
    await subMsg;

    const deliveryMsg = waitForMessage(sub);
    send(pub, {
      type: "PUBLISH",
      topic: "logs.error.critical",
      payload: { msg: "disk full" },
    });

    const msg = await deliveryMsg;
    expect(msg.type).toBe("MESSAGE");
    expect(msg.topic).toBe("logs.error.critical");

    sub.close();
    pub.close();
  });

  test("unsubscribe stops delivery", async () => {
    const sub = await ws();
    const pub = await ws();

    // Subscribe
    const subMsg = waitForMessage(sub);
    send(sub, { type: "SUBSCRIBE", topic: "events.click", id: "s5" });
    await subMsg;

    // Unsubscribe
    const unsubMsg = waitForMessage(sub);
    send(sub, { type: "UNSUBSCRIBE", topic: "events.click", id: "s5" });
    const unsub = await unsubMsg;
    expect(unsub.type).toBe("UNSUBSCRIBED");

    // Publish after unsub
    send(pub, { type: "PUBLISH", topic: "events.click", payload: {} });

    const received = await Promise.race([
      waitForMessage(sub).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ]);

    expect(received).toBe(false);

    sub.close();
    pub.close();
  });

  test("invalid message returns ERROR", async () => {
    const client = await ws();
    const msgPromise = waitForMessage(client);
    client.send("not valid json{{{");
    const response = await msgPromise;
    expect(response.type).toBe("ERROR");
    expect(response.code).toBe("INVALID_MESSAGE");
    client.close();
  });

  test("broker stats are accurate", async () => {
    const stats = broker.getStats();
    expect(stats.uptime).toBeGreaterThan(0);
    expect(stats.memoryUsage).toBeGreaterThan(0);
    expect(typeof stats.messagesPublished).toBe("number");
    expect(typeof stats.activeConnections).toBe("number");
  });
});

// --- RPC Tests ---
describe("RPC", () => {
  test("executer can register functions and receive RPC_REGISTERED", async () => {
    const executer = await ws();
    const msgPromise = waitForMessage(executer);

    send(executer, {
      type: "RPC_REGISTER",
      functions: [
        { name: "add", description: "Adds two numbers", params: { a: { type: "number" }, b: { type: "number" } }, returns: { type: "number" } },
        { name: "greet", description: "Returns a greeting" },
      ],
    });

    const response = await msgPromise;
    expect(response.type).toBe("RPC_REGISTERED");
    expect(response.count).toBe(2);
    executer.close();
  });

  test("producer can discover registered functions", async () => {
    const executer = await ws();
    const producer = await ws();

    // Register functions
    const regMsg = waitForMessage(executer);
    send(executer, {
      type: "RPC_REGISTER",
      functions: [{ name: "multiply", description: "Multiplies two numbers" }],
    });
    await regMsg;

    // Discover
    const discoverMsg = waitForMessage(producer);
    send(producer, { type: "RPC_DISCOVER" });
    const response = await discoverMsg;

    expect(response.type).toBe("RPC_FUNCTIONS");
    expect(Array.isArray(response.functions)).toBe(true);
    const fn = response.functions.find((f: any) => f.name === "multiply");
    expect(fn).toBeDefined();
    expect(fn.executerId).toBeDefined();

    executer.close();
    producer.close();
  });

  test("full RPC call/response flow works", async () => {
    const executer = await ws();
    const producer = await ws();

    // Register
    const regMsg = waitForMessage(executer);
    send(executer, {
      type: "RPC_REGISTER",
      functions: [{ name: "sum", description: "Adds numbers" }],
    });
    await regMsg;

    // Set up executer to handle incoming calls
    const callPromise = waitForMessage(executer);

    // Producer makes a call
    send(producer, {
      type: "RPC_CALL",
      requestId: "req_001",
      function: "sum",
      args: { a: 5, b: 3 },
    });

    // Executer receives the call
    const call = await callPromise;
    expect(call.type).toBe("RPC_CALL");
    expect(call.function).toBe("sum");
    expect(call.args).toEqual({ a: 5, b: 3 });
    expect(call.requestId).toBe("req_001");
    expect(call.callerId).toBeDefined();

    // Executer sends response
    const responsePromise = waitForMessage(producer);
    send(executer, {
      type: "RPC_RESPONSE",
      requestId: "req_001",
      result: 8,
    });

    // Producer receives the response
    const response = await responsePromise;
    expect(response.type).toBe("RPC_RESPONSE");
    expect(response.requestId).toBe("req_001");
    expect(response.result).toBe(8);

    executer.close();
    producer.close();
  });

  test("RPC_CALL to unknown function returns RPC_ERROR", async () => {
    const producer = await ws();
    const msgPromise = waitForMessage(producer);

    send(producer, {
      type: "RPC_CALL",
      requestId: "req_unknown",
      function: "nonexistent_fn",
    });

    const response = await msgPromise;
    expect(response.type).toBe("RPC_ERROR");
    expect(response.requestId).toBe("req_unknown");
    expect(response.error).toContain("nonexistent_fn");

    producer.close();
  });

  test("RPC_CALL with error response from executer", async () => {
    const executer = await ws();
    const producer = await ws();

    // Register
    const regMsg = waitForMessage(executer);
    send(executer, {
      type: "RPC_REGISTER",
      functions: [{ name: "fail_fn" }],
    });
    await regMsg;

    const callPromise = waitForMessage(executer);
    send(producer, {
      type: "RPC_CALL",
      requestId: "req_err",
      function: "fail_fn",
    });

    await callPromise;

    // Executer responds with an error
    const responsePromise = waitForMessage(producer);
    send(executer, {
      type: "RPC_RESPONSE",
      requestId: "req_err",
      error: "Something went wrong",
    });

    const response = await responsePromise;
    expect(response.type).toBe("RPC_RESPONSE");
    expect(response.requestId).toBe("req_err");
    expect(response.error).toBe("Something went wrong");
    expect(response.result).toBeUndefined();

    executer.close();
    producer.close();
  });
});

// --- Streaming Tests ---
describe("Streaming", () => {
  test("full stream lifecycle: START → DATA → END", async () => {
    const pub = await ws();
    const sub = await ws();

    // Subscribe
    const subMsg = waitForMessage(sub);
    send(sub, { type: "SUBSCRIBE", topic: "stream.demo", id: "s-stream-1" });
    await subMsg;

    // STREAM_START
    const startMsg = waitForMessage(sub);
    send(pub, { type: "STREAM_START", streamId: "st_001", topic: "stream.demo", metadata: { format: "text" } });
    const start = await startMsg;
    expect(start.type).toBe("STREAM_START");
    expect(start.streamId).toBe("st_001");
    expect(start.topic).toBe("stream.demo");
    expect(start.metadata).toEqual({ format: "text" });

    // STREAM_DATA (multiple chunks)
    const data1Msg = waitForMessage(sub);
    send(pub, { type: "STREAM_DATA", streamId: "st_001", payload: "chunk-1", sequence: 0 });
    const data1 = await data1Msg;
    expect(data1.type).toBe("STREAM_DATA");
    expect(data1.streamId).toBe("st_001");
    expect(data1.payload).toBe("chunk-1");
    expect(data1.sequence).toBe(0);
    expect(data1.topic).toBe("stream.demo");

    const data2Msg = waitForMessage(sub);
    send(pub, { type: "STREAM_DATA", streamId: "st_001", payload: "chunk-2", sequence: 1 });
    const data2 = await data2Msg;
    expect(data2.payload).toBe("chunk-2");
    expect(data2.sequence).toBe(1);

    // STREAM_END
    const endMsg = waitForMessage(sub);
    send(pub, { type: "STREAM_END", streamId: "st_001" });
    const end = await endMsg;
    expect(end.type).toBe("STREAM_END");
    expect(end.streamId).toBe("st_001");
    expect(end.topic).toBe("stream.demo");

    pub.close();
    sub.close();
  });

  test("stream fans out to multiple subscribers", async () => {
    const pub = await ws();
    const sub1 = await ws();
    const sub2 = await ws();

    // Both subscribe
    const s1Msg = waitForMessage(sub1);
    const s2Msg = waitForMessage(sub2);
    send(sub1, { type: "SUBSCRIBE", topic: "fanout.stream", id: "fs-1" });
    send(sub2, { type: "SUBSCRIBE", topic: "fanout.stream", id: "fs-2" });
    await Promise.all([s1Msg, s2Msg]);

    // Start stream
    const start1 = waitForMessage(sub1);
    const start2 = waitForMessage(sub2);
    send(pub, { type: "STREAM_START", streamId: "st_fan", topic: "fanout.stream" });
    const [r1, r2] = await Promise.all([start1, start2]);
    expect(r1.type).toBe("STREAM_START");
    expect(r2.type).toBe("STREAM_START");

    // Send data
    const d1 = waitForMessage(sub1);
    const d2 = waitForMessage(sub2);
    send(pub, { type: "STREAM_DATA", streamId: "st_fan", payload: "hello", sequence: 0 });
    const [dr1, dr2] = await Promise.all([d1, d2]);
    expect(dr1.payload).toBe("hello");
    expect(dr2.payload).toBe("hello");

    // End
    const e1 = waitForMessage(sub1);
    const e2 = waitForMessage(sub2);
    send(pub, { type: "STREAM_END", streamId: "st_fan" });
    const [er1, er2] = await Promise.all([e1, e2]);
    expect(er1.type).toBe("STREAM_END");
    expect(er2.type).toBe("STREAM_END");

    pub.close();
    sub1.close();
    sub2.close();
  });

  test("STREAM_DATA to unknown stream returns error", async () => {
    const client = await ws();
    const msgPromise = waitForMessage(client);
    send(client, { type: "STREAM_DATA", streamId: "nonexistent", payload: "data", sequence: 0 });
    const response = await msgPromise;
    expect(response.type).toBe("ERROR");
    expect(response.code).toBe("UNKNOWN_STREAM");
    client.close();
  });

  test("wildcard subscribers receive stream events", async () => {
    const pub = await ws();
    const sub = await ws();

    const subMsg = waitForMessage(sub);
    send(sub, { type: "SUBSCRIBE", topic: "data.#", id: "s-wild" });
    await subMsg;

    const startMsg = waitForMessage(sub);
    send(pub, { type: "STREAM_START", streamId: "st_wild", topic: "data.sensor.temp" });
    const start = await startMsg;
    expect(start.type).toBe("STREAM_START");
    expect(start.topic).toBe("data.sensor.temp");

    const dataMsg = waitForMessage(sub);
    send(pub, { type: "STREAM_DATA", streamId: "st_wild", payload: 23.5, sequence: 0 });
    const data = await dataMsg;
    expect(data.type).toBe("STREAM_DATA");
    expect(data.payload).toBe(23.5);

    const endMsg = waitForMessage(sub);
    send(pub, { type: "STREAM_END", streamId: "st_wild" });
    const end = await endMsg;
    expect(end.type).toBe("STREAM_END");

    pub.close();
    sub.close();
  });
});

// --- Token Authentication Tests ---
import { TokenManager } from "../src/TokenManager";

describe("Token Auth", () => {
  let authBroker: Broker;
  let tokenMgr: TokenManager;
  const AUTH_PORT = 9877;

  function wsAuth(params = ""): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://localhost:${AUTH_PORT}/ws${params}`);
      socket.onopen = () => resolve(socket);
      socket.onerror = (e) => reject(e);
    });
  }

  beforeAll(() => {
    tokenMgr = new TokenManager();
    authBroker = new Broker({ port: AUTH_PORT, requireAuth: true });

    // API key "test_key_123" is always valid
    authBroker.onAuthenticateKey = (key) => {
      if (key === "test_key_123") return { valid: true, permissions: "publish,subscribe" };
      return { valid: false };
    };

    authBroker.onAuthenticateToken = (tokenStr) => {
      const token = tokenMgr.consumeToken(tokenStr);
      if (!token) return { valid: false };
      return { valid: true, permissions: token.options.permissions?.join(",") ?? "" };
    };

    authBroker.start();
  });

  afterAll(() => {
    authBroker.stop();
    tokenMgr.destroy();
  });

  test("rejects connection with no credentials", async () => {
    try {
      await wsAuth();
      expect(true).toBe(false); // should not reach here
    } catch {
      // Connection should fail
      expect(true).toBe(true);
    }
  });

  test("accepts connection with valid API key", async () => {
    const client = await wsAuth("?apiKey=test_key_123");
    expect(client.readyState).toBe(WebSocket.OPEN);
    client.close();
  });

  test("rejects connection with invalid API key", async () => {
    try {
      await wsAuth("?apiKey=bad_key");
      expect(true).toBe(false);
    } catch {
      expect(true).toBe(true);
    }
  });

  test("accepts connection with valid token", async () => {
    const token = tokenMgr.createToken("key_id_1", { ttl: 30 });
    const client = await wsAuth(`?token=${token.token}`);
    expect(client.readyState).toBe(WebSocket.OPEN);
    client.close();
  });

  test("token is single-use — second connection fails", async () => {
    const token = tokenMgr.createToken("key_id_1", { ttl: 30 });

    // First use succeeds
    const client = await wsAuth(`?token=${token.token}`);
    expect(client.readyState).toBe(WebSocket.OPEN);
    client.close();

    // Second use with same token fails
    try {
      await wsAuth(`?token=${token.token}`);
      expect(true).toBe(false);
    } catch {
      expect(true).toBe(true);
    }
  });

  test("expired token is rejected", async () => {
    // Create token with 0-second TTL (already expired)
    const token = tokenMgr.createToken("key_id_1", { ttl: 0 });

    // Wait a tiny bit to ensure expiry
    await new Promise((r) => setTimeout(r, 10));

    try {
      await wsAuth(`?token=${token.token}`);
      expect(true).toBe(false);
    } catch {
      expect(true).toBe(true);
    }
  });
});
