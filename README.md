# 🐇 EchoBus

A high-performance, lightweight Pub/Sub message broker built entirely on WebSockets and TypeScript, powered by Bun.

EchoBus is designed to be a simpler, embeddable alternative to heavy message brokers like RabbitMQ, tailored for real-time web applications. It features a high-throughput WebSocket core, SQLite persistence, a management API, and a beautiful React dashboard for monitoring.

## ✨ Features

- 🔄 **Pub/Sub** with wildcard topic matching (`*` and `#`)
- 🔌 **RPC** (Remote Procedure Calls) with load-distributed routing
- 🌊 **Real-time streaming** with sequence tracking
- 🔐 **Auth** via API keys + short-lived connection tokens
- 💾 **SQLite persistence** with dead letter queue (DLQ)
- 📊 **React monitoring dashboard** with real-time graphs
- 🐳 **Docker ready** — single command deployment

## 📦 Project Structure

```
packages/
  broker/   # Core WebSocket server, message routing, SQLite persistence
  api/      # HonoJS REST API + serves the dashboard in production
  ui/       # Vite + React monitoring dashboard (Recharts)
```

## 🚀 Quick Start

```bash
bun install
bun run dev
```

This starts the Broker, API, and Dashboard concurrently in development mode.

## 🐳 Docker

```bash
docker compose up -d
```

| Port   | Service              |
|--------|----------------------|
| `9000` | WebSocket broker     |
| `9001` | HTTP API + Dashboard |

Data is persisted via a Docker volume.

## 📊 Dashboard

Visit **http://localhost:9001** for the monitoring dashboard.

## 📖 Documentation

- [Architecture](docs/Architecture.md)
- [Features](docs/Features.md)
- [Tech Stack](docs/TechStack.md)
- [Communication Protocol](docs/Protocol.md)
- [Plan of Action](docs/Plan-Of-Action.md)

## 📘 How To Use

See [HowToUse.md](HowToUse.md) for the client integration guide.
