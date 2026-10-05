# Node.js API — Fastify + PostgreSQL

Simple REST API with Fastify and PostgreSQL.

## Project Structure

```
src/
├── server.js          ← entry point
├── db.js              ← pg connection pool
└── routes/
    ├── health.js      ← GET /health
    └── users.js       ← GET /api/users, GET /api/users/:id, POST /api/users
scripts/
└── seed.js            ← create table + seed 1M users
```

## Setup

```bash
# 1. Install
npm install

# 2. Copy env and fill in your PostgreSQL credentials
cp .env.example .env

# 3. Seed the database (creates table + 1M users)
node scripts/seed.js

# 4. Start
npm run dev       # development (auto-reload)
npm start         # production
```

## API

### `GET /health`
No database call.
```json
{ "status": "ok", "uptime": 42.1, "pid": 1234 }
```

### `GET /api/users?limit=100`
Returns N random users. Default = 100, max = 1000.
```bash
GET /api/users
GET /api/users?limit=10
GET /api/users?limit=500
```
```json
{ "count": 100, "users": [{ "id": 7, "name": "User 7", "email": "user7@example.com" }] }
```

### `GET /api/users/:id`
Single user by primary key.
```bash
GET /api/users/1
```
```json
{ "id": 1, "name": "User 1", "email": "user1@example.com" }
```
Returns `404` if user does not exist.

### `POST /api/users`
Create a new user.
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{ "name": "Alice", "email": "alice@example.com" }'
```
```json
{ "id": 1000001, "name": "Alice", "email": "alice@example.com", "created_at": "..." }
```
Returns `400` if `name` or `email` is missing.  
Returns `500` if email is already taken (unique constraint).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `benchmark` | Database name |
| `DB_USER` | `benchmark` | DB user |
| `DB_PASSWORD` | `benchmark_secret` | DB password |
| `DB_POOL_SIZE` | `10` | Max pool connections |
