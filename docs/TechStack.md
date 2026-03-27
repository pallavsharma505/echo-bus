# Technology Stack

## Core Runtime: Bun v1.3.10
* **Why:** Bun provides an incredibly fast JavaScript runtime. More importantly, `Bun.serve()` has native, highly optimized WebSocket handling built on uWebSockets, making it the perfect foundation for a custom message broker. It also includes `bun:sqlite`, which is significantly faster than Node.js SQLite drivers because it avoids FFI (Foreign Function Interface) overhead.

## Language: TypeScript
* **Why:** Message brokers require strict data contracts. TypeScript ensures that internal message routing, payload structures, and API responses are heavily typed, preventing runtime crashes.

## API: HonoJS
* **Why:** Hono is a lightning-fast, edge-optimized web framework. It has native bindings for Bun, making it practically zero-overhead. It serves the management REST API and the built React dashboard as static files in production.

## Database: SQLite (Embedded)
* **Why:** RabbitMQ uses Mnesia; we are using SQLite. For a single-node broker, SQLite is perfectly capable of handling tens of thousands of writes per second when configured correctly (WAL mode, synchronous=NORMAL). It keeps the architecture simple — no external database dependencies. Stores messages, dead letters, metrics, durable topics, and API keys.

## Frontend: ReactJS + ViteJS
* **Why:** Vite provides instantaneous HMR (Hot Module Replacement) for rapid UI development. React is ideal for building the dynamic, component-based charts and tables needed for a monitoring dashboard.

## Charting: Recharts
* **Why:** Lightweight, composable React chart library used for the Overview dashboard — throughput graphs, connection counts, and topic activity over time.

## Key Architectural Components

| Component | Purpose |
|-----------|---------|
| **Broker** | Bun.serve() WebSocket server — pub/sub routing, RPC dispatch, streaming fan-out |
| **ConnectionManager** | Tracks clients, subscriptions, roles, registered RPC functions |
| **SubscriptionManager** | Topic → subscriber routing with `*` and `#` wildcard matching |
| **PersistenceLayer** | SQLite in WAL mode — messages, DLQ, metrics, durable topics, API keys |
| **TokenManager** | In-memory store for short-lived, single-use connection tokens (`etk_` prefix) |
