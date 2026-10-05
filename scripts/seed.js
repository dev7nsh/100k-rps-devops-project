#!/usr/bin/env node
/**
 * scripts/seed.js
 *
 * Run with:   node scripts/seed.js
 *
 * Verifies that the database already has the expected data
 * (seeded by scripts/init.sql at first Docker Compose start)
 * and optionally adds more rows.
 *
 * This script is safe to re-run — it uses ON CONFLICT DO NOTHING.
 */

import 'dotenv/config';
import pg from 'pg';
import { config } from '../src/config.js';

const { Pool } = pg;

const BATCH_SIZE   = 10_000;
const TARGET_ROWS  = 1_000_000;

const pool = new Pool({
  host:     config.db.host,
  port:     config.db.port,
  database: config.db.name,
  user:     config.db.user,
  password: config.db.password,
  max:      5,
  connectionTimeoutMillis: 10_000,
});

async function main() {
  console.log('🔌  Connecting to PostgreSQL…');

  const client = await pool.connect();

  try {
    // ── Check current row count ──────────────────────────────
    const { rows: [{ count }] } = await client.query(
      'SELECT COUNT(*)::int AS count FROM users',
    );

    console.log(`📊  Current row count: ${count.toLocaleString()}`);

    if (count >= TARGET_ROWS) {
      console.log(`✅  Already have ${count.toLocaleString()} rows — nothing to do.`);
      return;
    }

    const needed = TARGET_ROWS - count;
    console.log(`🌱  Need to insert ${needed.toLocaleString()} more rows…`);

    let inserted = 0;
    const startId = count + 1;

    while (inserted < needed) {
      const batchEnd = Math.min(inserted + BATCH_SIZE, needed);
      const from = startId + inserted;
      const to   = startId + batchEnd - 1;

      await client.query(
        `INSERT INTO users (name, email, created_at)
         SELECT 'User ' || i,
                'user'  || i || '@example.com',
                NOW() - (random() * INTERVAL '2 years')
         FROM generate_series($1::int, $2::int) AS s(i)
         ON CONFLICT DO NOTHING`,
        [from, to],
      );

      inserted = batchEnd;
      const pct = ((inserted / needed) * 100).toFixed(1);
      process.stdout.write(`\r   Progress: ${inserted.toLocaleString()} / ${needed.toLocaleString()} (${pct}%)`);
    }

    console.log('\n✅  Seed complete!');

    // ── Refresh planner statistics ────────────────────────────
    console.log('📐  Running ANALYZE…');
    await client.query('ANALYZE users');
    console.log('✅  ANALYZE done');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
