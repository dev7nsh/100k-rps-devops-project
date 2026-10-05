-- ─────────────────────────────────────────────────────────────
--  Benchmark database schema + 1 000 000 seed rows
--  Runs automatically on first `docker compose up`
-- ─────────────────────────────────────────────────────────────

-- Create the users table
CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    name       TEXT        NOT NULL,
    email      TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ───────────────────────────────────────────────
-- Primary key on id already creates a btree index.
-- Email unique constraint creates another.
-- Add a created_at index for time-range queries.
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

-- ─── Seed 1 000 000 rows ───────────────────────────────────
-- generate_series() is the fastest way to bulk-insert without
-- leaving the database engine.
INSERT INTO users (name, email, created_at)
SELECT
    'User ' || i,
    'user' || i || '@example.com',
    NOW() - (random() * INTERVAL '2 years')
FROM generate_series(1, 1000000) AS s(i)
ON CONFLICT DO NOTHING;

-- ─── Statistics refresh ────────────────────────────────────
ANALYZE users;
