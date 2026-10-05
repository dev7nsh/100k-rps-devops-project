import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

const { Pool } = pg;

// ─────────────────────────────────────────────────────────────
//  Singleton pool — shared across all routes in this process.
//  In PM2 cluster mode each worker has its own pool instance,
//  so total DB connections = workers × DB_POOL_SIZE.
// ─────────────────────────────────────────────────────────────
let pool = null;

/** Create (and return) the singleton pool. */
export function createPool() {
  if (pool) return pool;

  pool = new Pool({
    host:               config.db.host,
    port:               config.db.port,
    database:           config.db.name,
    user:               config.db.user,
    password:           config.db.password,
    max:                config.db.poolSize,
    idleTimeoutMillis:  config.db.idleTimeout,
    connectionTimeoutMillis: config.db.connectionTimeout,
    // Keep-alive prevents stale connections from being silently dropped
    keepAlive:          true,
    keepAliveInitialDelayMillis: 10_000,
  });

  // ── Event hooks ────────────────────────────────────────────
  pool.on('connect', (client) => {
    logger.debug({ pid: process.pid }, 'pg: new client connected');
    // Enforce statement timeout per connection so runaway queries
    // cannot block the pool indefinitely.
    client.query(`SET statement_timeout = '${config.db.statementTimeout}ms'`);
  });

  pool.on('acquire', () => {
    logger.trace({ pid: process.pid, total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }, 'pg: client acquired');
  });

  pool.on('remove', () => {
    logger.debug({ pid: process.pid }, 'pg: client removed from pool');
  });

  pool.on('error', (err) => {
    logger.error({ err, pid: process.pid }, 'pg: unexpected client error');
  });

  logger.info(
    {
      host:     config.db.host,
      port:     config.db.port,
      database: config.db.name,
      poolSize: config.db.poolSize,
      pid:      process.pid,
    },
    'pg: connection pool initialised',
  );

  return pool;
}

/** Return the existing pool (throws if not yet initialised). */
export function getPool() {
  if (!pool) throw new Error('DB pool has not been initialised. Call createPool() first.');
  return pool;
}

/**
 * Run a parameterised query and return the result.
 * Automatically acquires and releases a client from the pool.
 *
 * @param {string} text   - SQL statement
 * @param {Array}  params - Positional parameters ($1, $2, …)
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params = []) {
  const start = process.hrtime.bigint();
  try {
    const result = await getPool().query(text, params);
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    logger.trace({ query: text, rows: result.rowCount, durationMs }, 'pg: query executed');
    return result;
  } catch (err) {
    logger.error({ err, query: text }, 'pg: query failed');
    throw err;
  }
}

/**
 * Gracefully drain and end the pool.
 * Called during SIGINT / SIGTERM to avoid hanging the process.
 */
export async function closePool() {
  if (!pool) return;
  logger.info({ pid: process.pid }, 'pg: draining connection pool…');
  await pool.end();
  pool = null;
  logger.info({ pid: process.pid }, 'pg: pool closed');
}

/**
 * Return live pool statistics — exposed by GET /api/stats.
 * @returns {{ total: number, idle: number, waiting: number }}
 */
export function poolStats() {
  if (!pool) return { total: 0, idle: 0, waiting: 0 };
  return {
    total:   pool.totalCount,
    idle:    pool.idleCount,
    waiting: pool.waitingCount,
  };
}
