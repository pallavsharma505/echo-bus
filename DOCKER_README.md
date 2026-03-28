# 🐇 EchoBus

A high-performance, lightweight **Pub/Sub message broker** built on WebSockets and TypeScript, powered by [Bun](https://bun.sh).

EchoBus is a simpler, embeddable alternative to heavy message brokers like RabbitMQ — designed for real-time web applications. It bundles a WebSocket core, SQLite persistence, a REST management API, and a React monitoring dashboard in a single container.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔄 **Pub/Sub** | Publish/subscribe with AMQP-style wildcard topics (`*` and `#`) |
| 🔌 **RPC** | Remote Procedure Calls with automatic load-distributed routing |
| 🌊 **Streaming** | Real-time data streaming with sequence tracking |
| 🔐 **Auth** | API key authentication + short-lived connection tokens for browsers |
| 💾 **Persistence** | SQLite (WAL mode) with dead letter queue (DLQ) |
| 📊 **Dashboard** | React monitoring dashboard with real-time charts |
| ✅ **ACK/NACK** | At-least-once delivery with configurable acknowledgements |
| 📦 **Durable Topics** | Messages queued for offline subscribers |

---

## 🚀 Quick Start

```bash
docker run -d \
  --name echobus \
  -p 9000:9000 \
  -p 9001:9001 \
  -v echobus_data:/data \
  pallavsharma505/warehouse-of-logs
```

That's it! EchoBus is now running:

| Port | Service |
|------|---------|
| **9000** | WebSocket broker (`ws://localhost:9000/ws`) |
| **9001** | HTTP API + Dashboard (`http://localhost:9001`) |

### First-Time Setup

1. Open **http://localhost:9001** in your browser
2. Create your admin account (username + password)
3. Navigate to **API Keys** to generate your first API key
4. Start publishing/subscribing!

---

## 🐳 Docker Compose

```yaml
version: "3.8"

services:
  echobus:
    image: pallavsharma505/warehouse-of-logs
    ports:
      - "9000:9000"   # WebSocket broker
      - "9001:9001"   # HTTP API + Dashboard
    volumes:
      - echobus_data:/data
    environment:
      - REQUIRE_AUTH=true
    restart: unless-stopped

volumes:
  echobus_data:
```

```bash
docker compose up -d
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROKER_PORT` | `9000` | WebSocket broker port |
| `API_PORT` | `9001` | HTTP API + dashboard port |
| `DB_PATH` | `/data/echobus.db` | SQLite database file path |
| `REQUIRE_AUTH` | `true` | Require API key for WebSocket connections |

---

## 📡 Connecting Clients

### Using the npm client library

Install the official client library:

```bash
npm install echobus
```

**Publisher:**

```javascript
import { Publisher } from 'echobus';

const pub = new Publisher('ws://localhost:9000/ws', { apiKey: 'your-api-key' });
await pub.connect();

await pub.publish('events.user.signup', {
  userId: '123',
  email: 'user@example.com'
});
```

**Consumer:**

```javascript
import { Consumer } from 'echobus';

const sub = new Consumer('ws://localhost:9000/ws', { apiKey: 'your-api-key' });
await sub.connect();

sub.subscribe('events.user.*', (message) => {
  console.log(`[${message.topic}]`, message.data);
});
```

**RPC (Remote Procedure Calls):**

```javascript
import { Executer, RPCClient } from 'echobus';

// Executer — registers callable functions
const exec = new Executer('ws://localhost:9000/ws', { apiKey: 'your-api-key' });
await exec.connect();

exec.register('math.add', async ({ a, b }) => ({ result: a + b }));

// Caller — discovers and calls functions
const rpc = new RPCClient('ws://localhost:9000/ws', { apiKey: 'your-api-key' });
await rpc.connect();

const fns = await rpc.discover();
const result = await rpc.call('math.add', { a: 5, b: 3 });
console.log(result); // { result: 8 }
```

**Streaming:**

```javascript
import { Publisher, Consumer } from 'echobus';

// Publisher creates a stream
const pub = new Publisher('ws://localhost:9000/ws', { apiKey: 'your-api-key' });
await pub.connect();

const stream = pub.createStream('sensors.temperature');
stream.write({ temp: 22.5, unit: 'C' });
stream.write({ temp: 23.1, unit: 'C' });
stream.end();

// Consumer receives stream events
const sub = new Consumer('ws://localhost:9000/ws', { apiKey: 'your-api-key' });
await sub.connect();
sub.subscribe('sensors.temperature');

sub.on('stream:start', ({ streamId, topic }) => console.log('Stream started'));
sub.on('stream:data',  ({ data, seq }) => console.log('Chunk:', data));
sub.on('stream:end',   ({ streamId }) => console.log('Stream ended'));
```

### Using raw WebSockets

```javascript
const ws = new WebSocket('ws://localhost:9000/ws?apiKey=your-api-key');

// Publish
ws.send(JSON.stringify({
  type: 'PUBLISH',
  topic: 'orders.new',
  data: { orderId: 'abc' }
}));

// Subscribe
ws.send(JSON.stringify({
  type: 'SUBSCRIBE',
  topic: 'orders.*'
}));
```

---

## 🔐 Security

### API Keys

Generate API keys from the dashboard (**API Keys** page) or via REST:

```bash
curl -X POST http://localhost:9001/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-service"}'
```

### Connection Tokens (for browsers)

API keys should never be exposed in frontend code. Use short-lived connection tokens instead:

```bash
# Server-side: exchange API key for a short-lived token
curl -X POST http://localhost:9001/auth/token \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "eb_...", "ttl": 30}'
```

```javascript
// Client-side: connect with the token
const ws = new WebSocket(`ws://localhost:9000/ws?token=${token}`);
```

Tokens are single-use and expire after the specified TTL (max 300 seconds).

---

## 📊 REST API

All API endpoints (except `/auth/*` and `/health`) require a dashboard session token.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/topics` | List active topics |
| GET | `/connections` | List active connections |
| GET | `/metrics` | Broker metrics |
| GET | `/dlq` | Dead letter queue |
| POST | `/admin/purge` | Purge DLQ messages |
| POST | `/admin/topics/durable` | Create durable topic |
| GET | `/api-keys` | List API keys |
| POST | `/api-keys` | Create API key |
| DELETE | `/api-keys/:id` | Revoke API key |
| POST | `/auth/token` | Create connection token |

---

## 🌐 Wildcard Topics

EchoBus supports AMQP-style topic wildcards:

| Pattern | Matches | Example |
|---------|---------|---------|
| `*` | Exactly one segment | `events.*` matches `events.click` but not `events.click.button` |
| `#` | One or more segments | `events.#` matches `events.click` and `events.click.button` |

---

## 💾 Data Persistence

SQLite data is stored at `/data/echobus.db` inside the container. Mount a volume to persist data across restarts:

```bash
-v echobus_data:/data
```

The database uses WAL mode for high concurrent read/write performance.

---

## 📖 More Information

- **GitHub**: [github.com/pallavsharma505/warehouse-of-logs](https://github.com/pallavsharma505/warehouse-of-logs)
- **Docker**: [hub.docker.com/r/pallavsharma505/warehouse-of-logs](https://hub.docker.com/r/pallavsharma505/warehouse-of-logs)
- **npm client**: [npmjs.com/package/echobus](https://www.npmjs.com/package/echobus)
- **Usage Guide**: [HowToUse.md](https://github.com/pallavsharma505/warehouse-of-logs/blob/main/HowToUse.md)

---

## 📄 License

MIT License with Attribution — free to use, attribution required for derived works and products. See [LICENSE](https://github.com/pallavsharma505/warehouse-of-logs/blob/main/LICENSE).

Copyright © 2026 Pallav Sharma
