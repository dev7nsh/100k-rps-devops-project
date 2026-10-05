/**
 * ecosystem.config.cjs
 *
 * PM2 cluster mode configuration.
 *
 * Start:   pm2 start ecosystem.config.cjs
 * Stop:    pm2 stop node-100k-rps
 * Delete:  pm2 delete node-100k-rps
 * Logs:    pm2 logs
 * Monitor: pm2 monit
 *
 * ─── Worker scaling experiments ───────────────────────────────
 *
 * 1 worker:       instances: 1
 * 2 workers:      instances: 2
 * 4 workers:      instances: 4
 * All CPU cores:  instances: 'max'   ← default below
 *
 * Change `instances` and restart PM2 to compare throughput.
 *
 * ─── Connection pool maths ────────────────────────────────────
 *
 * Total PG connections = instances × DB_POOL_SIZE
 *
 * Example — 4 workers × 20 pool = 80 DB connections.
 * Make sure postgres max_connections (500 in docker-compose.yml)
 * is greater than this number.
 */

module.exports = {
  apps: [
    {
      name:        'node-100k-rps',
      script:      'src/server.js',
      instances:   'max',           // ← change to 1 / 2 / 4 for experiments
      exec_mode:   'cluster',
      interpreter: 'node',
      interpreter_args: '--experimental-vm-modules',

      // ── Environment ─────────────────────────────────────────
      env: {
        NODE_ENV:     'production',
        PORT:         3000,
        HOST:         '0.0.0.0',
        LOG_LEVEL:    'warn',       // lower log level in prod = higher RPS
        DB_HOST:      'localhost',
        DB_PORT:      5432,
        DB_NAME:      'benchmark',
        DB_USER:      'benchmark',
        DB_PASSWORD:  'benchmark_secret',
        DB_POOL_SIZE: 20,           // per worker
        DB_POOL_IDLE_TIMEOUT:       30000,
        DB_POOL_CONNECTION_TIMEOUT: 5000,
      },

      // ── Restart policy ──────────────────────────────────────
      // Restart if worker crashes; backoff up to 10 s
      restart_delay:      1000,
      max_restarts:       10,
      min_uptime:         5000,

      // ── Memory guard ────────────────────────────────────────
      // Restart worker if it leaks beyond 512 MB RSS
      max_memory_restart: '512M',

      // ── Logging ─────────────────────────────────────────────
      combine_logs:   true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file:       './logs/app-out.log',
      error_file:     './logs/app-err.log',

      // ── Graceful shutdown ───────────────────────────────────
      // PM2 sends SIGINT; our server calls pool.end() and app.close()
      kill_timeout:   5000,          // ms to wait before SIGKILL
      listen_timeout: 8000,          // ms to wait for cluster worker to become ready
      wait_ready:     false,

      // ── Node.js flags ───────────────────────────────────────
      node_args: [
        '--max-old-space-size=512',  // limit V8 heap per worker
      ],
    },
  ],
};
