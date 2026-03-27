FROM oven/bun:1.3.10-alpine AS base
WORKDIR /app

# --- Build stage ---
FROM base AS build

COPY package.json bun.lock ./
COPY packages/broker/package.json packages/broker/
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/

RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/broker/ packages/broker/
COPY packages/api/ packages/api/
COPY packages/ui/ packages/ui/

# Build the React dashboard
RUN cd packages/ui && bunx --bun vite build

# --- Production stage ---
FROM base AS production

COPY package.json bun.lock ./
COPY packages/broker/package.json packages/broker/
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/

RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY packages/broker/src/ packages/broker/src/
COPY packages/api/src/ packages/api/src/
COPY --from=build /app/packages/ui/dist/ packages/ui/dist/

# Data directory for SQLite persistence
RUN mkdir -p /data

ENV BROKER_PORT=9000
ENV API_PORT=9001
ENV DB_PATH=/data/echobus.db

EXPOSE 9000 9001

CMD ["bun", "run", "packages/api/src/index.ts"]
