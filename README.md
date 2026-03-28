# 🐇 EchoBus

[![Docker](https://img.shields.io/docker/v/pallavsharma505/warehouse-of-logs?label=Docker%20Hub&logo=docker)](https://hub.docker.com/r/pallavsharma505/warehouse-of-logs)
[![npm](https://img.shields.io/npm/v/echobus?logo=npm)](https://www.npmjs.com/package/echobus)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?logo=github)](https://github.com/pallavsharma505/warehouse-of-logs)

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
npm-package/  # Official client library (npm: echobus)
```

## 🚀 Quick Start

### Docker (recommended)

```bash
docker run -d --name echobus -p 9000:9000 -p 9001:9001 -v echobus_data:/data pallavsharma505/echobus
```

Or with Docker Compose:

```bash
docker compose up -d
```

### From Source

```bash
bun install
bun run dev
```

| Port   | Service              |
|--------|----------------------|
| `9000` | WebSocket broker     |
| `9001` | HTTP API + Dashboard |

## 📡 Client Library

```bash
npm install echobus
```

```javascript
import { Publisher, Consumer } from 'echobus';

const pub = new Publisher('ws://localhost:9000/ws', { apiKey: 'your-key' });
await pub.connect();
await pub.publish('events.hello', { message: 'world' });

const sub = new Consumer('ws://localhost:9000/ws', { apiKey: 'your-key' });
await sub.connect();
sub.subscribe('events.*', (msg) => console.log(msg.data));
```

See the full [client library docs](https://www.npmjs.com/package/echobus) for RPC, streaming, and more.

## 📊 Dashboard

Visit **http://localhost:9001** for the monitoring dashboard.

## 📖 Documentation

- [Architecture](docs/Architecture.md)
- [Features](docs/Features.md)
- [Tech Stack](docs/TechStack.md)
- [Communication Protocol](docs/Protocol.md)
- [Plan of Action](docs/Plan-Of-Action.md)

## 📘 How To Use

See [HowToUse.md](HowToUse.md) for the complete client integration guide (raw WebSocket + npm library examples).

## 📄 License

MIT License with Attribution — free to use, attribution required for derived works and products. See [LICENSE](LICENSE).
