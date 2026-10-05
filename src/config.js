import 'dotenv/config';

// ─────────────────────────────────────────────────────────────
//  Centralised, validated configuration
//  All env-var reads happen here so the rest of the app is clean.
// ─────────────────────────────────────────────────────────────

function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toInt(value, fallback) {
  const n = parseInt(value ?? fallback, 10);
  if (isNaN(n)) throw new Error(`Expected integer, got: ${value}`);
  return n;
}

export const config = {
  node: {
    env:      requireEnv('NODE_ENV', 'development'),
    port:     toInt(process.env.PORT,     3000),
    host:     requireEnv('HOST',          '0.0.0.0'),
    logLevel: requireEnv('LOG_LEVEL',     'info'),
  },

  db: {
    host:              requireEnv('DB_HOST',     'localhost'),
    port:              toInt(process.env.DB_PORT, 5432),
    name:              requireEnv('DB_NAME',     'benchmark'),
    user:              requireEnv('DB_USER',     'benchmark'),
    password:          requireEnv('DB_PASSWORD', 'benchmark_secret'),
    poolSize:          toInt(process.env.DB_POOL_SIZE,              20),
    idleTimeout:       toInt(process.env.DB_POOL_IDLE_TIMEOUT,      30_000),
    connectionTimeout: toInt(process.env.DB_POOL_CONNECTION_TIMEOUT, 5_000),
    statementTimeout:  toInt(process.env.DB_STATEMENT_TIMEOUT,       10_000),
  },

  api: {
    /** Hard cap on ?limit= to prevent runaway queries */
    maxLimit: toInt(process.env.API_MAX_LIMIT, 1_000),
  },
};
