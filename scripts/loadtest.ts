/**
 * EchoBus Load Test Script
 * 
 * Usage: bun run scripts/loadtest.ts [--messages 10000] [--publishers 5] [--subscribers 10] [--topic test.load]
 */

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const BROKER_URL = getArg("url", "ws://localhost:9000/ws?apiKey=eb_lc1tm5zhsmp2o4aduq08r17tf9zb6t9y");
const TOTAL_MESSAGES = parseInt(getArg("messages", "1000000"), 10);
const NUM_PUBLISHERS = parseInt(getArg("publishers", "5"), 10);
const NUM_SUBSCRIBERS = parseInt(getArg("subscribers", "10"), 10);
const TOPIC = getArg("topic", "loadtest.messages");

let received = 0;
let sent = 0;
const startTime = Date.now();

function send(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg));
}

function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BROKER_URL);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}

async function startSubscriber(id: number): Promise<WebSocket> {
  const ws = await connectWs();
  send(ws, { type: "SUBSCRIBE", topic: TOPIC, id: `sub-${id}` });
  ws.onmessage = () => {
    received++;
  };
  return ws;
}

async function startPublisher(id: number, count: number): Promise<WebSocket> {
  const ws = await connectWs();
  for (let i = 0; i < count; i++) {
    send(ws, {
      type: "PUBLISH",
      topic: TOPIC,
      payload: { publisher: id, sequence: i, timestamp: Date.now() },
    });
    sent++;
  }
  return ws;
}

console.log("🐇 EchoBus Load Test");
console.log(`   Broker:       ${BROKER_URL}`);
console.log(`   Topic:        ${TOPIC}`);
console.log(`   Messages:     ${TOTAL_MESSAGES}`);
console.log(`   Publishers:   ${NUM_PUBLISHERS}`);
console.log(`   Subscribers:  ${NUM_SUBSCRIBERS}`);
console.log("");

// Connect subscribers first
const subscribers: WebSocket[] = [];
for (let i = 0; i < NUM_SUBSCRIBERS; i++) {
  subscribers.push(await startSubscriber(i));
}

// Small delay for subscriptions to register
await new Promise((r) => setTimeout(r, 100));

console.log(`✅ ${NUM_SUBSCRIBERS} subscribers connected`);

// Start publishers
const messagesPerPublisher = Math.ceil(TOTAL_MESSAGES / NUM_PUBLISHERS);
const publishers: WebSocket[] = [];
for (let i = 0; i < NUM_PUBLISHERS; i++) {
  publishers.push(await startPublisher(i, messagesPerPublisher));
}

console.log(`✅ ${NUM_PUBLISHERS} publishers sent ${sent} messages`);

// Wait for delivery
const expectedTotal = sent * NUM_SUBSCRIBERS;
const maxWait = 30_000;
const pollInterval = 100;
let waited = 0;

while (received < expectedTotal && waited < maxWait) {
  await new Promise((r) => setTimeout(r, pollInterval));
  waited += pollInterval;
}

const elapsed = Date.now() - startTime;
const throughput = Math.round(sent / (elapsed / 1000));
const deliveryRate = Math.round(received / (elapsed / 1000));

console.log("");
console.log("📊 Results:");
console.log(`   Elapsed:          ${elapsed}ms`);
console.log(`   Messages sent:    ${sent}`);
console.log(`   Messages recv:    ${received} / ${expectedTotal} expected`);
console.log(`   Publish rate:     ${throughput} msg/s`);
console.log(`   Delivery rate:    ${deliveryRate} msg/s`);
console.log(`   Delivery ratio:   ${((received / expectedTotal) * 100).toFixed(1)}%`);

// Cleanup
for (const ws of [...subscribers, ...publishers]) {
  ws.close();
}

process.exit(0);
