# Execution Plan

## Phase 1: Foundation & Monorepo Setup
1. Initialize a Git repository.
2. Setup a Bun Workspace with `package.json` defining `broker`, `api`, and `ui` packages.
3. Configure TypeScript (`tsconfig.json`) across the workspace for shared types.
4. Scaffold the Vite/React app and a basic Bun script for the broker.

## Phase 2: Core Broker (In-Memory)
1. Implement `Bun.serve()` with WebSocket upgrade handlers.
2. Create the `ConnectionManager` class to track connected WebSocket clients.
3. Create the `SubscriptionManager` (Map) to link clients to Topics.
4. Implement the `PUBLISH` and `SUBSCRIBE` JSON protocol parser.
5. Write basic integration tests using a standard WS client.

## Phase 3: Persistence (SQLite)
1. Initialize `bun:sqlite` with WAL mode enabled.
2. Create schema: `messages` (id, topic, payload, status) and `metrics` (timestamp, msg_count).
3. Implement the persistence logic for topics marked as "durable".
4. Implement the ACK mechanism to delete/mark messages as processed in SQLite.

## Phase 4: Monitoring API (HonoJS)
1. Initialize Hono app.
2. Inject the `ConnectionManager` and `SubscriptionManager` instances into Hono.
3. Create endpoints to expose in-memory metrics (active WS count, topic map size).
4. Create endpoints to query SQLite for historical data (e.g., messages over the last hour).

## Phase 5: Dashboard Frontend (React)
1. Setup React Router and basic layout (Sidebar, Main Content).
2. Create hooks to poll the Hono API (or connect via WS) for real-time stats.
3. Integrate a charting library (like Recharts or Chart.js) to display throughput.
4. Build the "Topics" and "Connections" data tables.

## Phase 6: Refinement & Load Testing
1. Use an external tool (like Artillery or a custom Bun script) to spam the broker with 10k+ messages/sec.
2. Profile memory usage and optimize JSON parsing/stringifying bottlenecks.
