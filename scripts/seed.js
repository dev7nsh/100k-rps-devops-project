/**
 * scripts/seed.js
 * Creates the users table and inserts 1 000 000 rows.
 *
 * Run once before starting the server:
 *   node scripts/seed.js
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING.
 */

import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'benchmark',
  user:     process.env.DB_USER     || 'benchmark',
  password: process.env.DB_PASSWORD || 'benchmark_secret',
});

const client = await pool.connect();

try {
  // 1. Create table
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT        NOT NULL,
      email      TEXT        NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✅  Table ready');

  // 2. Check how many rows already exist
  const { rows: [{ count }] } = await client.query(
    'SELECT COUNT(*)::int AS count FROM users'
  );
  console.log(`📊  Existing rows: ${count.toLocaleString()}`);

  if (count >= 1_000_000) {
    console.log('✅  Already has 1 000 000 rows — nothing to do.');
    process.exit(0);
  }

  // 3. Seed remaining rows using generate_series (fast, all inside PG)
  const needed = 1_000_000 - count;
  const start  = count + 1;
  console.log(`🌱  Inserting ${needed.toLocaleString()} rows…`);

  await client.query(`
    INSERT INTO users (name, email)
    SELECT 'User ' || i, 'user' || i || '@example.com'
    FROM   generate_series($1::int, $2::int) AS s(i)
    ON CONFLICT DO NOTHING
  `, [start, start + needed - 1]);

  console.log('✅  Seed done — 1 000 000 users ready.');
} finally {
  client.release();
  await pool.end();
}
