import { createApp } from "./app";
import { Broker } from "../../broker/src/Broker";
import { PersistenceLayer } from "../../broker/src/PersistenceLayer";
import { TokenManager } from "../../broker/src/TokenManager";

const BROKER_PORT = parseInt(process.env.BROKER_PORT ?? "9000", 10);
const API_PORT = parseInt(process.env.API_PORT ?? "9001", 10);
const DB_PATH = process.env.DB_PATH ?? "echobus.db";

// Initialize broker + persistence
const persistence = new PersistenceLayer(DB_PATH);
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== "false"; // enabled by default
const broker = new Broker({ port: BROKER_PORT, requireAuth: REQUIRE_AUTH });

// Wire persistence hooks
broker.onPersistMessage = (topic, payload, messageId) => {
  persistence.persistMessage(topic, payload, messageId);
};

broker.onAcknowledge = (messageId) => {
  persistence.acknowledge(messageId);
};

broker.onDeadLetter = (messageId, reason) => {
  persistence.moveToDeadLetter(messageId, reason);
};

// Wire auth hook
broker.onAuthenticateKey = (key: string) => {
  const row = persistence.validateApiKey(key);
  if (!row) return { valid: false };
  return { valid: true, permissions: row.permissions };
};

// Initialize token manager for short-lived frontend tokens
const tokenManager = new TokenManager();

broker.onAuthenticateToken = (tokenStr: string) => {
  const token = tokenManager.consumeToken(tokenStr);
  if (!token) return { valid: false };
  return { valid: true, permissions: token.options.permissions?.join(",") ?? "" };
};

let lastPublished = 0;
let lastDelivered = 0;
broker.onMetricTick = () => {
  const stats = broker.getStats();
  persistence.recordMetrics(
    stats.messagesPublished - lastPublished,
    stats.messagesDelivered - lastDelivered,
    stats.activeConnections,
    stats.activeTopics
  );
  lastPublished = stats.messagesPublished;
  lastDelivered = stats.messagesDelivered;
};

// Restore durable topics
for (const topic of persistence.getDurableTopics()) {
  broker.subscriptions.markDurable(topic);
}

// Start broker
broker.start();

// Start API
const app = createApp(broker, persistence, tokenManager);

const server = Bun.serve({
  port: API_PORT,
  fetch: app.fetch,
});

console.log(`📡 EchoBus API listening on http://localhost:${server.port}`);

export { broker, persistence, app };
