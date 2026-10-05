# Node.js 100K RPS — DevOps Benchmark Learning Lab

> **A complete, production-style Node.js API benchmark project** for learning DevOps, backend performance, and high-throughput system design.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Benchmarking Guide](#benchmarking-guide)
- [PM2 Scaling Experiments](#pm2-scaling-experiments)
- [PostgreSQL Connection Pool Tuning](#postgresql-connection-pool-tuning)
- [Nginx Architecture](#nginx-architecture)
- [Prometheus & Grafana](#prometheus--grafana)
- [Performance Mental Model](#performance-mental-model)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  Load Generator (Autocannon)                              │
│  1K → 100K RPS                                           │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTP
                     ▼
┌──────────────────────────────────────────────────────────┐
│  Nginx (optional reverse proxy)                           │
│  • Keep-alive upstream connections                        │
│  • Gzip compression                                       │
│  • Rate limiting                                          │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTP (keep-alive)
                     ▼
┌──────────────────────────────────────────────────────────┐
│  PM2 Cluster Mode                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │  │ Worker N │ │
│  │ Fastify  │  │ Fastify  │  │ Fastify  │  │ Fastify  │ │
│  │ Port 3000│  │ Port 3000│  │ Port 3000│  │ Port 3000│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │pool=20      │pool=20      │pool=20      │pool=20  │
└───────┼─────────────┼─────────────┼─────────────┼─────────┘
        │             │             │             │
        └─────────────┴──────┬──────┴─────────────┘
                             │ pg.Pool (per worker)
                             ▼
┌──────────────────────────────────────────────────────────┐
│  PostgreSQL 16 (Docker)                                   │
│  • 1,000,000 users                                        │
│  • Tuned: shared_buffers=512MB, max_connections=500       │
│  • Indexes on id (PK), email (UNIQUE), created_at         │
└──────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js 22 | Latest LTS, best performance |
| HTTP Framework | Fastify 5 | 2-3× faster than Express, JSON schema serialisation |
| Database | PostgreSQL 16 | ACID, indexed queries, superb at concurrent reads |
| DB Client | `pg` (node-postgres) | Mature, `pg.Pool` for connection reuse |
| Process Manager | PM2 cluster | One worker per CPU core, graceful restarts |
| Load Testing | Autocannon | Written by the Fastify team, high-precision |
| Proxy | Nginx | Keep-alive upstreams, gzip, rate limiting |
| Observability | Prometheus + Grafana | Time-series metrics, dashboards |
| Containerisation | Docker Compose | Reproducible environment |

---

## Project Structure

```
node-100k-rps/
├── src/
│   ├── server.js          # Fastify bootstrap, plugins, graceful shutdown
│   ├── config.js          # Centralised env-var config with validation
│   ├── db.js              # pg.Pool singleton, query helper, pool stats
│   ├── logger.js          # pino logger (JSON in prod, pretty in dev)
│   └── routes/
│       ├── health.js      # GET /health — no DB, pure framework overhead
│       ├── users.js       # GET /api/users, GET /api/users/:id
│       └── stats.js       # GET /api/stats — DB + process metrics
├── scripts/
│   ├── init.sql           # Schema + 1M seed rows (runs on Docker first start)
│   ├── seed.js            # Node.js seed top-up script (safe to re-run)
│   └── benchmark.js       # Autocannon runner with all scenarios
├── monitoring/
│   ├── prometheus.yml     # Prometheus scrape config
│   └── grafana/provisioning/datasources/prometheus.yml
├── docker-compose.yml     # PostgreSQL + optional pgAdmin/Prometheus/Grafana
├── Dockerfile             # Multi-stage production image
├── ecosystem.config.cjs   # PM2 cluster config
├── nginx.conf             # Production Nginx reverse proxy
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 22
- Docker + Docker Compose

### 1. Clone & install

```bash
git clone <repo>
cd node-100k-rps
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work with docker-compose.yml out of the box)
```

### 3. Start PostgreSQL

```bash
npm run docker:up
# PostgreSQL starts + init.sql seeds 1M users automatically
# Wait for the healthcheck to pass (~30 seconds first run)
docker compose logs -f postgres
```

### 4. Start the API

```bash
# Development (single worker, pretty logs)
npm run dev

# Production (single worker, JSON logs)
npm start

# PM2 cluster (all CPU cores)
npm run pm2:start
pm2 logs
pm2 monit
```

### 5. Verify

```bash
curl http://localhost:3000/health | jq
curl 'http://localhost:3000/api/users?limit=5' | jq
curl http://localhost:3000/api/users/1 | jq
curl http://localhost:3000/api/stats | jq
```

### 6. Run a benchmark

```bash
# Quick 30-second test at ~10K RPS
npm run bench:health

# Full benchmark suite across all scenarios
npm run bench:all

# Target a specific RPS level (see table below)
node scripts/benchmark.js health --connections 1000 --duration 60
```

---

## API Reference

### `GET /health`

**No database call.** Measures pure Node.js/Fastify overhead — your baseline.

```json
{
  "status": "ok",
  "uptime": 42.3,
  "pid": 12345,
  "memory": { "rss": 52428800, "heapUsed": 18874368, "heapTotal": 33554432, "external": 1234 },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

---

### `GET /api/users?limit=100&offset=0`

Paginated user list backed by:

```sql
SELECT id, name, email FROM users ORDER BY id LIMIT $1 OFFSET $2;
```

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `limit`   | int  | 1–1000 | 100 | Rows per page |
| `offset`  | int  | ≥ 0 | 0 | Skip N rows |

```json
{
  "count": 100,
  "limit": 100,
  "offset": 0,
  "users": [
    { "id": 1, "name": "User 1", "email": "user1@example.com" }
  ]
}
```

**Supported combinations:**

```bash
GET /api/users?limit=10
GET /api/users?limit=100
GET /api/users?limit=500
GET /api/users?limit=1000
GET /api/users?limit=100&offset=10000
GET /api/users?limit=100&offset=500000
```

---

### `GET /api/users/:id`

Single indexed lookup:

```sql
SELECT id, name, email FROM users WHERE id = $1;
```

```bash
GET /api/users/1        # → 200 { id: 1, name: "User 1", ... }
GET /api/users/999999   # → 200
GET /api/users/9999999  # → 404 { error: "Not Found", ... }
```

---

### `GET /api/stats`

Returns database pool health + process stats. Runs 4 queries in parallel.

```json
{
  "process": { "pid": 1234, "uptime": 300.5, "nodeVersion": "v22.0.0", "memory": { ... } },
  "pool":    { "total": 5, "idle": 4, "waiting": 0 },
  "database": {
    "userCount": 1000000,
    "pgVersion": "PostgreSQL 16.x",
    "dbSizeBytes": 89128960,
    "dbSizePretty": "85 MB",
    "activeBackends": 6
  },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

---

## Benchmarking Guide

### RPS Target → Connection Count Table

| Target RPS | `--connections` | What to expect |
|------------|-----------------|----------------|
| ~1K RPS | `10` | Single worker, light load |
| ~5K RPS | `50` | Single worker, moderate |
| ~10K RPS | `100` | Single worker pushing |
| ~25K RPS | `250` | Need ≥ 2 workers |
| ~50K RPS | `500` | Need ≥ 4 workers |
| ~75K RPS | `750` | Need all cores + Nginx |
| ~100K RPS | `1000` | All cores + tuned Nginx + DB pool |

> **Rule of thumb:** Actual RPS = connections × (1000 / avg_latency_ms)  
> A 10ms DB query + 100 connections ≈ 10,000 RPS per worker.

### Benchmark Commands

```bash
# ── Single scenario ───────────────────────────────────────
node scripts/benchmark.js health --connections 100 --duration 30
node scripts/benchmark.js users-10 --connections 100 --duration 30
node scripts/benchmark.js users-100 --connections 100 --duration 30
node scripts/benchmark.js users-1000 --connections 100 --duration 30
node scripts/benchmark.js user-single --connections 100 --duration 30

# ── All scenarios at once ─────────────────────────────────
node scripts/benchmark.js all --connections 100 --duration 30

# ── RPS presets ───────────────────────────────────────────
# 1K RPS
node scripts/benchmark.js all --connections 10 --duration 30

# 5K RPS
node scripts/benchmark.js all --connections 50 --duration 30

# 10K RPS
node scripts/benchmark.js all --connections 100 --duration 30

# 25K RPS
node scripts/benchmark.js all --connections 250 --duration 30

# 50K RPS
node scripts/benchmark.js all --connections 500 --duration 30

# 75K RPS
node scripts/benchmark.js all --connections 750 --duration 30

# 100K RPS
node scripts/benchmark.js all --connections 1000 --duration 60
```

### Results

Each run saves a JSON file to `./results/bench_<timestamp>.json` with:
- `rps` — actual requests/sec
- `latency.p50`, `latency.p95`, `latency.p99`, `latency.max`
- `errors`, `timeouts`, `totalRequests`

---

## PM2 Scaling Experiments

### Start with different worker counts

```bash
# Edit instances in ecosystem.config.cjs, then:
pm2 start ecosystem.config.cjs
pm2 list
```

Or override at runtime:

```bash
# 1 worker
pm2 start ecosystem.config.cjs --instances 1

# 2 workers
pm2 start ecosystem.config.cjs --instances 2

# 4 workers
pm2 start ecosystem.config.cjs --instances 4

# All CPU cores
pm2 start ecosystem.config.cjs --instances max
```

### Comparison experiment procedure

```bash
# Step 1: 1 worker
pm2 delete all
pm2 start ecosystem.config.cjs --instances 1
node scripts/benchmark.js health --connections 500 --duration 30
node scripts/benchmark.js users-100 --connections 500 --duration 30

# Step 2: 2 workers
pm2 delete all
pm2 start ecosystem.config.cjs --instances 2
node scripts/benchmark.js health --connections 500 --duration 30
node scripts/benchmark.js users-100 --connections 500 --duration 30

# Step 3: 4 workers
pm2 delete all
pm2 start ecosystem.config.cjs --instances 4
node scripts/benchmark.js health --connections 500 --duration 30
node scripts/benchmark.js users-100 --connections 500 --duration 30

# Step 4: all cores
pm2 delete all
pm2 start ecosystem.config.cjs --instances max
node scripts/benchmark.js health --connections 500 --duration 30
node scripts/benchmark.js users-100 --connections 500 --duration 30
```

### Expected scaling pattern

| Workers | `/health` RPS | `/api/users?limit=100` RPS |
|---------|--------------|---------------------------|
| 1       | ~30K–50K | ~5K–10K |
| 2       | ~60K–90K | ~10K–20K |
| 4       | ~80K–120K | ~20K–40K |
| max (8) | ~100K–150K | ~40K–80K |

> `/health` scales linearly with cores because it's CPU-bound.  
> `/api/users` is DB-bound — adding cores helps until PostgreSQL becomes the bottleneck.

### Key observation

```
X-Worker-PID: 12345
```

Every response includes this header so you can see which PM2 worker handled the request. With connections kept open by Nginx you'll see round-robin distribution.

---

## PostgreSQL Connection Pool Tuning

### Pool size formula

```
pool_size_per_worker = (available_pg_connections / num_workers)
                     = (max_connections - superuser_reserved) / workers

# Example: max_connections=500, 4 workers
pool_size_per_worker = (500 - 10) / 4 = ~122  → set DB_POOL_SIZE=100
```

### Total connections used

```
total_pg_connections = workers × DB_POOL_SIZE
# Example: 4 workers × 20 pool = 80 connections
```

### Tuning levers in `.env`

```bash
DB_POOL_SIZE=20                    # per worker
DB_POOL_IDLE_TIMEOUT=30000         # release idle connections after 30s
DB_POOL_CONNECTION_TIMEOUT=5000    # fail fast (return 503) after 5s
DB_STATEMENT_TIMEOUT=10000         # kill queries running > 10s
```

### Signs of pool exhaustion

```
GET /api/stats → pool.waiting > 0   # requests queuing for a connection
HTTP 503 with "pool exhausted"       # all connections busy
high p99 latency                     # requests waiting in queue
```

**Fix:** Increase `DB_POOL_SIZE`, add more workers, or add a PgBouncer sidecar.

---

## Nginx Architecture

Run Nginx in front of your Node.js server:

```bash
# Install Nginx
sudo apt install nginx

# Copy config
sudo cp nginx.conf /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx

# Or with Docker
docker run --network=host -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro nginx:alpine
```

### Why Nginx improves RPS

| Without Nginx | With Nginx |
|--------------|-----------|
| Client opens TCP per request | Nginx maintains upstream keep-alive pool |
| Node handles TLS termination | Nginx handles TLS (faster OpenSSL) |
| No gzip for large payloads | Gzip at Nginx layer |
| No rate limiting | `limit_req_zone` |

### Critical setting — upstream keep-alive

```nginx
upstream node_backend {
    server 127.0.0.1:3000;
    keepalive 256;   # ← This is the key
}
```

Without `keepalive`, every request creates a new TCP connection to Node.js. With `keepalive 256`, Nginx reuses up to 256 open connections, eliminating TCP handshake latency.

---

## Prometheus & Grafana

### Start the monitoring stack

```bash
docker compose --profile monitoring up -d
```

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin / admin)

### Add app metrics (optional prom-client integration)

```bash
npm install prom-client
```

Add to `src/server.js`:

```js
import client from 'prom-client';

// Collect default Node.js metrics
client.collectDefaultMetrics({ prefix: 'node_' });

// Expose /metrics endpoint
app.get('/metrics', async (request, reply) => {
  reply.header('Content-Type', client.register.contentType);
  return client.register.metrics();
});
```

Prometheus will then scrape:
- `node_eventloop_lag_seconds`
- `node_http_request_duration_seconds` (add yourself per route)
- `node_process_cpu_seconds_total`
- `node_heap_space_size_used_bytes`
- `pg_pool_size`, `pg_pool_idle` (add yourself from `poolStats()`)

---

## Performance Mental Model

```
RPS = workers × (pool_size / avg_query_time_ms × 1000)

Example:
  4 workers × (20 connections / 10ms per query × 1000)
= 4 × 2000
= 8000 RPS theoretical maximum
```

### Bottleneck diagnosis

| Symptom | Bottleneck | Fix |
|---------|-----------|-----|
| `/health` high, `/api/users` low | PostgreSQL | More pool, PgBouncer, read replicas |
| Both routes low, CPU 100% | Node.js | More PM2 workers |
| Both routes low, CPU low | Network / Nginx | Tune `keepalive`, check MTU |
| High latency, `pool.waiting > 0` | Pool exhausted | Increase `DB_POOL_SIZE` |
| High error rate | Server overload | Add rate limiting, backpressure |
| Memory growing | Leak | Profile with `--inspect`, check for unclosed handles |

### Latency targets by route

| Route | p50 | p95 | p99 |
|-------|-----|-----|-----|
| `/health` | < 1ms | < 2ms | < 5ms |
| `/api/users?limit=10` | < 5ms | < 15ms | < 30ms |
| `/api/users?limit=100` | < 10ms | < 25ms | < 50ms |
| `/api/users?limit=1000` | < 30ms | < 80ms | < 150ms |
| `/api/users/1` | < 3ms | < 10ms | < 20ms |

---

## Troubleshooting

### PostgreSQL won't start

```bash
docker compose logs postgres
# Check if port 5432 is already in use
lsof -i :5432
```

### Connection refused errors during benchmark

```bash
# Check the server is running
curl http://localhost:3000/health

# Check pool stats
curl http://localhost:3000/api/stats | jq .pool
```

### High error rate during load test

```bash
# Lower connections (less concurrency)
node scripts/benchmark.js users-100 --connections 50

# Increase pool size in .env and restart
DB_POOL_SIZE=50
npm start
```

### PM2 workers crashing

```bash
pm2 logs --err --lines 50
pm2 describe node-100k-rps
```

### Re-seed the database

```bash
# Option 1: Wipe Docker volume and recreate (clean slate)
docker compose down -v
docker compose up -d

# Option 2: Top-up missing rows without wiping
node scripts/seed.js
```

### Check row count

```bash
docker exec benchmark_postgres psql -U benchmark -d benchmark \
  -c "SELECT COUNT(*) FROM users;"
```

---

## License

MIT — use freely for learning and production.
