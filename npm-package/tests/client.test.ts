import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Broker } from "../../packages/broker/src/Broker";
import { EchoBus, Publisher, Consumer, Executer, RPCClient, topicMatches } from "../src/index";

const PORT = 9878;
const URL = `ws://localhost:${PORT}/ws`;

let broker: Broker;

beforeAll(() => {
  broker = new Broker({ port: PORT, requireAuth: false });
  broker.start();
});

afterAll(() => {
  broker.stop();
});

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Topic Matcher ────────────────────────────────────────────────────

describe("topicMatches", () => {
  test("exact match", () => {
    expect(topicMatches("orders.created", "orders.created")).toBe(true);
    expect(topicMatches("orders.created", "orders.deleted")).toBe(false);
  });

  test("* matches one segment", () => {
    expect(topicMatches("orders.*", "orders.created")).toBe(true);
    expect(topicMatches("orders.*", "orders.us.created")).toBe(false);
  });

  test("# matches one or more segments", () => {
    expect(topicMatches("logs.#", "logs.error")).toBe(true);
    expect(topicMatches("logs.#", "logs.error.critical")).toBe(true);
    expect(topicMatches("#", "anything")).toBe(true);
    expect(topicMatches("#", "a.b.c")).toBe(true);
  });
});

// ── Publisher + Consumer ─────────────────────────────────────────────

describe("Publisher + Consumer", () => {
  test("basic pub/sub", async () => {
    const pub = new Publisher(URL);
    const sub = new Consumer(URL);
    await pub.connect();
    await sub.connect();

    const received: any[] = [];
    await sub.subscribe("test.basic", (msg) => {
      received.push(msg.payload);
    });

    await wait(50);
    pub.publish("test.basic", { hello: "world" });
    await wait(100);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ hello: "world" });

    pub.close();
    sub.close();
  });

  test("wildcard subscription", async () => {
    const pub = new Publisher(URL);
    const sub = new Consumer(URL);
    await pub.connect();
    await sub.connect();

    const received: string[] = [];
    await sub.subscribe("events.*", (msg) => {
      received.push(msg.topic);
    });

    await wait(50);
    pub.publish("events.click", { x: 1 });
    pub.publish("events.scroll", { y: 2 });
    await wait(100);

    expect(received).toContain("events.click");
    expect(received).toContain("events.scroll");
    expect(received).toHaveLength(2);

    pub.close();
    sub.close();
  });

  test("fan-out to multiple consumers", async () => {
    const pub = new Publisher(URL);
    const sub1 = new Consumer(URL);
    const sub2 = new Consumer(URL);
    await pub.connect();
    await sub1.connect();
    await sub2.connect();

    const r1: any[] = [];
    const r2: any[] = [];
    await sub1.subscribe("fanout.test", (msg) => r1.push(msg.payload));
    await sub2.subscribe("fanout.test", (msg) => r2.push(msg.payload));

    await wait(50);
    pub.publish("fanout.test", { data: 42 });
    await wait(100);

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    expect(r1[0]).toEqual({ data: 42 });

    pub.close();
    sub1.close();
    sub2.close();
  });

  test("unsubscribe stops messages", async () => {
    const pub = new Publisher(URL);
    const sub = new Consumer(URL);
    await pub.connect();
    await sub.connect();

    const received: any[] = [];
    const subId = await sub.subscribe("unsub.test", (msg) => received.push(msg.payload));

    await wait(50);
    pub.publish("unsub.test", { n: 1 });
    await wait(100);
    expect(received).toHaveLength(1);

    await sub.unsubscribe(subId);
    await wait(50);
    pub.publish("unsub.test", { n: 2 });
    await wait(100);
    expect(received).toHaveLength(1);

    pub.close();
    sub.close();
  });

  test("event-based message handler", async () => {
    const pub = new Publisher(URL);
    const sub = new Consumer(URL);
    await pub.connect();
    await sub.connect();

    const received: any[] = [];
    sub.on("message", (msg) => received.push(msg.payload));
    await sub.subscribe("event.handler");

    await wait(50);
    pub.publish("event.handler", { via: "event" });
    await wait(100);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ via: "event" });

    pub.close();
    sub.close();
  });
});

// ── Unified EchoBus Client ───────────────────────────────────────────

describe("Unified EchoBus Client", () => {
  test("publish and subscribe on single connection", async () => {
    const client = new EchoBus(URL);
    await client.connect();

    const receiver = new EchoBus(URL);
    await receiver.connect();

    const received: any[] = [];
    await receiver.subscribe("unified.test", (msg) => received.push(msg.payload));

    await wait(50);
    client.publish("unified.test", { unified: true });
    await wait(100);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ unified: true });

    client.close();
    receiver.close();
  });
});

// ── RPC ──────────────────────────────────────────────────────────────

describe("RPC", () => {
  test("register, discover, and call", async () => {
    const exec = new Executer(URL);
    const caller = new RPCClient(URL);
    await exec.connect();
    await caller.connect();

    const count = await exec.register([
      {
        name: "math.add",
        description: "Add two numbers",
        params: {
          a: { type: "number", required: true },
          b: { type: "number", required: true },
        },
        handler: (args) => args.a + args.b,
      },
      {
        name: "string.reverse",
        description: "Reverse a string",
        params: { s: { type: "string", required: true } },
        handler: (args) => args.s.split("").reverse().join(""),
      },
    ]);

    expect(count).toBe(2);

    const functions = await caller.discover();
    expect(functions.length).toBeGreaterThanOrEqual(2);
    expect(functions.map((f) => f.name)).toContain("math.add");

    const sum = await caller.call("math.add", { a: 10, b: 32 });
    expect(sum).toBe(42);

    const reversed = await caller.call("string.reverse", { s: "hello" });
    expect(reversed).toBe("olleh");

    exec.close();
    caller.close();
  });

  test("async handler", async () => {
    const exec = new Executer(URL);
    const caller = new RPCClient(URL);
    await exec.connect();
    await caller.connect();

    await exec.register([
      {
        name: "async.delay",
        handler: async (args) => {
          await new Promise((r) => setTimeout(r, 50));
          return `delayed: ${args.value}`;
        },
      },
    ]);

    const result = await caller.call("async.delay", { value: "test" });
    expect(result).toBe("delayed: test");

    exec.close();
    caller.close();
  });

  test("RPC error propagation", async () => {
    const exec = new Executer(URL);
    const caller = new RPCClient(URL);
    await exec.connect();
    await caller.connect();

    await exec.register([
      {
        name: "math.divide",
        handler: (args) => {
          if (args.b === 0) throw new Error("Division by zero");
          return args.a / args.b;
        },
      },
    ]);

    try {
      await caller.call("math.divide", { a: 10, b: 0 });
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain("Division by zero");
    }

    exec.close();
    caller.close();
  });

  test("unknown function returns error", async () => {
    const caller = new RPCClient(URL);
    await caller.connect();

    try {
      await caller.call("does.not.exist", {}, 3000);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toBeTruthy();
    }

    caller.close();
  });
});

// ── Streaming ────────────────────────────────────────────────────────

describe("Streaming", () => {
  test("stream start, data, end", async () => {
    const pub = new Publisher(URL);
    const sub = new Consumer(URL);
    await pub.connect();
    await sub.connect();

    const starts: any[] = [];
    const chunks: any[] = [];
    const ends: any[] = [];

    sub.on("stream:start", (e) => starts.push(e));
    sub.on("stream:data", (e) => chunks.push(e));
    sub.on("stream:end", (e) => ends.push(e));

    await sub.subscribe("stream.test");
    await wait(50);

    const stream = pub.createStream("stream.test", { format: "json" });
    await wait(50);
    stream.write({ row: 1 });
    stream.write({ row: 2 });
    stream.write({ row: 3 });
    await wait(50);
    stream.end();
    await wait(100);

    expect(starts).toHaveLength(1);
    expect(starts[0].metadata).toEqual({ format: "json" });
    expect(chunks).toHaveLength(3);
    expect(chunks[0].sequence).toBe(0);
    expect(chunks[1].sequence).toBe(1);
    expect(chunks[2].sequence).toBe(2);
    expect(chunks[0].payload).toEqual({ row: 1 });
    expect(ends).toHaveLength(1);

    pub.close();
    sub.close();
  });

  test("stream end prevents further writes", async () => {
    const pub = new Publisher(URL);
    await pub.connect();

    const stream = pub.createStream("stream.ended");
    stream.end();

    expect(() => stream.write({ data: "nope" })).toThrow("Stream has already ended");
    expect(stream.ended).toBe(true);

    pub.close();
  });
});

// ── Connection State ─────────────────────────────────────────────────

describe("Connection", () => {
  test("connected property", async () => {
    const client = new EchoBus(URL);
    expect(client.connected).toBe(false);

    await client.connect();
    expect(client.connected).toBe(true);

    client.close();
    await wait(50);
    expect(client.connected).toBe(false);
  });

  test("events: connected and disconnected", async () => {
    const client = new EchoBus(URL);
    const events: string[] = [];

    client.on("connected", () => events.push("connected"));
    client.on("disconnected", () => events.push("disconnected"));

    await client.connect();
    client.close();
    await wait(50);

    expect(events).toContain("connected");
    expect(events).toContain("disconnected");
  });

  test("send before connect throws", () => {
    const pub = new Publisher(URL);
    expect(() => pub.publish("x", "y")).toThrow("Not connected");
  });
});
