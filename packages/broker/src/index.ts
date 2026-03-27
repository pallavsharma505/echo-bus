import { Broker } from "./Broker";
import { PersistenceLayer } from "./PersistenceLayer";

const BROKER_PORT = parseInt(process.env.BROKER_PORT ?? "9000", 10);
const DB_PATH = process.env.DB_PATH ?? "echobus.db";

const persistence = new PersistenceLayer(DB_PATH);
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== "false";
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

// Restore durable topics from DB
for (const topic of persistence.getDurableTopics()) {
  broker.subscriptions.markDurable(topic);
}

broker.start();

export { broker, persistence };
export { Broker } from "./Broker";
export { PersistenceLayer } from "./PersistenceLayer";
export { ConnectionManager } from "./ConnectionManager";
export { SubscriptionManager } from "./SubscriptionManager";
export type * from "./types";
