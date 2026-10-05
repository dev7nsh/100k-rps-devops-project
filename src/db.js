import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// Single pool shared across the whole app
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'benchmark',
  user:     process.env.DB_USER     || 'benchmark',
  password: process.env.DB_PASSWORD || 'benchmark_secret',
  max:      Number(process.env.DB_POOL_SIZE) || 10,
});

pool.on('error', (err) => {
  console.error('Unexpected DB error:', err.message);
});

// Simple query helper
export async function query(sql, params = []) {
  return pool.query(sql, params);
}

// Drain pool on shutdown
export async function closePool() {
  await pool.end();
}
