# EchoBus Features

## 1. Broker Features (Core)

- **Topic-Based Pub/Sub** — Clients SUBSCRIBE, UNSUBSCRIBE, and PUBLISH to named topics (e.g., `orders.created`, `logs.error`) using JSON payloads over WebSocket.
- **Wildcard Subscriptions** — AMQP-style patterns: `*` matches a single segment (`orders.*` → `orders.created`) and `#` matches multiple segments (`logs.#` → `logs.error.critical`).
- **Fan-Out Delivery** — A single PUBLISH fans out to all subscribers on the matching topic, including wildcard matches.
- **Message Persistence** — Durable topics persist messages to SQLite, ensuring no data loss across broker restarts.
- **Delivery Guarantees** — *At-most-once* (fire & forget) for low-latency scenarios, and *At-least-once* (`requireAck`) where the broker waits for an explicit ACK or NACK from each subscriber.
- **Dead Letter Queue** — Messages that fail delivery or are NACKed are routed to a DLQ stored in SQLite for later inspection.
- **RPC (Remote Procedure Calls)** — Executers register callable functions with the broker. Producers discover available functions and invoke them; the broker routes the call to an executer and returns the response. Includes a 30-second timeout and load distribution across multiple executers.
- **Streaming** — STREAM_START, DATA, and END commands deliver sequenced chunks to topic subscribers (including wildcard matches). Fan-out is supported, and streams are automatically cleaned up on client disconnect.

## 2. Authentication & Security

- **API Keys** — `eb_`-prefixed tokens stored in SQLite. Full CRUD management via the REST API.
- **Connection Tokens** — `etk_`-prefixed, short-lived (max 5 minutes), single-use tokens held in memory. Generated via `POST /auth/token` using a valid API key. Designed so the API key never leaves the server — ideal for frontend clients.
- **Configurable Auth** — The `REQUIRE_AUTH` environment variable controls whether authentication is enforced (default: `true`).

## 3. REST API (HonoJS)

### Monitoring

| Endpoint | Description |
| --- | --- |
| `GET /health` | Uptime, memory usage, active connection and topic counts |
| `GET /topics` | Active topics with subscriber counts |
| `GET /connections` | Active clients with IPs, subscriptions, roles |
| `GET /metrics` | Time-series metrics — publish/delivery rates, connection counts |
| `GET /dlq` | Browse dead letter queue contents |

### Administration

| Endpoint | Description |
| --- | --- |
| `POST /admin/purge` | Clear a topic's message backlog |
| `POST /admin/topics/durable` | Register a durable (persistent) topic |

### API Key Management

| Endpoint | Description |
| --- | --- |
| `GET /admin/api-keys` | List API keys (preview only — full keys are never exposed) |
| `POST /admin/api-keys` | Create a new API key |
| `PATCH /admin/api-keys/:id/revoke` | Soft-revoke an API key |
| `DELETE /admin/api-keys/:id` | Permanently delete an API key |

### Authentication

| Endpoint | Description |
| --- | --- |
| `POST /auth/token` | Exchange an API key for a short-lived connection token |

## 4. Dashboard (React)

- **Overview** — Live time-series graphs (Recharts) for throughput, active connections, and topic count over time.
- **Topics** — Lists all active topics with subscriber counts and durable status.
- **Connections** — Active clients showing IP address, current subscriptions, role, and registered RPC functions.
- **Dead Letters** — Browse and inspect DLQ entries.
- **API Keys** — Create, view, revoke, and delete API keys from the UI.
- **Documentation** — Interactive docs with code samples covering all EchoBus features.
- **Test Playground** — Connect as a publisher, consumer, executer, or streaming publisher. Includes a live traffic log and a token-auth toggle for testing authenticated flows.

## 5. Docker

- **Multi-stage Dockerfile** — Optimized production image with minimal footprint.
- **docker-compose.yml** — Ready-to-run setup with a persistent volume (`echobus_data`) for SQLite data.
- **Ports** — `9000` (WebSocket) and `9001` (HTTP / Dashboard).
