import Fastify from 'fastify';
import compress from '@fastify/compress';
import { config }       from './config.js';
import { logger }       from './logger.js';
import { createPool, closePool } from './db.js';
import { healthRoutes } from './routes/health.js';
import { usersRoutes }  from './routes/users.js';
import { statsRoutes }  from './routes/stats.js';

// ─────────────────────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────────────────────
async function build() {
  // ── 1. Create Fastify instance ─────────────────────────────
  const app = Fastify({
    // Share the same pino logger — avoids double-allocation
    logger: logger,
    // Disable X-Powered-By header (minor security hardening)
    disableRequestLogging: config.node.env === 'production',
    // Ajv schema compilation: coerce query/param strings to numbers
    ajv: {
      customOptions: {
        coerceTypes:  'array',
        useDefaults:  true,
        removeAdditional: 'all',
      },
    },
    // Trust X-Forwarded-* headers when behind Nginx
    trustProxy: true,
  });

  // ── 2. Plugins ─────────────────────────────────────────────
  // Response compression (gzip/br) — helps throughput on large payloads
  await app.register(compress, {
    global: false,          // opt-in per route via reply.compress()
    threshold: 1024,        // only compress bodies ≥ 1 KB
  });

  // ── 3. Global hooks ────────────────────────────────────────
  // Add CORS headers — handy when hitting the API from a browser/Grafana
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Worker-PID', process.pid); // reveals which PM2 worker handled the request
  });

  // ── 4. Routes ──────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(usersRoutes);
  await app.register(statsRoutes);

  // ── 5. Global error handler ────────────────────────────────
  app.setErrorHandler(async (err, request, reply) => {
    // Pool exhaustion / connection timeout
    if (err.code === 'ECONNREFUSED' || err.message?.includes('pool')) {
      request.log.error({ err }, 'database pool error');
      reply.code(503);
      return { error: 'Service Unavailable', message: 'Database pool exhausted or unreachable' };
    }
    // Validation errors from Ajv (wrong query params, etc.)
    if (err.validation) {
      reply.code(400);
      return { error: 'Bad Request', message: err.message };
    }
    // Generic server error
    request.log.error({ err }, 'unhandled server error');
    reply.code(err.statusCode || 500);
    return { error: 'Internal Server Error', message: err.message };
  });

  // ── 6. 404 handler ─────────────────────────────────────────
  app.setNotFoundHandler(async (request, reply) => {
    reply.code(404);
    return { error: 'Not Found', message: `Route ${request.method} ${request.url} not found` };
  });

  return app;
}

// ─────────────────────────────────────────────────────────────
//  Graceful shutdown
// ─────────────────────────────────────────────────────────────
async function gracefulShutdown(app, signal) {
  logger.info({ signal, pid: process.pid }, 'shutdown signal received');
  try {
    // 1. Stop accepting new connections
    await app.close();
    // 2. Drain the DB pool
    await closePool();
    logger.info({ pid: process.pid }, 'server shut down cleanly');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────────
async function main() {
  // Initialise DB pool before accepting traffic
  createPool();

  const app = await build();

  // Graceful shutdown hooks (PM2 sends SIGINT)
  process.on('SIGINT',  () => gracefulShutdown(app, 'SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown(app, 'SIGTERM'));

  // Crash safety — log unhandled errors; PM2 will restart the worker
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException — process will exit');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'unhandledRejection — process will exit');
    process.exit(1);
  });

  try {
    await app.listen({ port: config.node.port, host: config.node.host });
    logger.info(
      {
        url:  `http://${config.node.host}:${config.node.port}`,
        env:  config.node.env,
        pid:  process.pid,
      },
      '🚀 Server is listening',
    );
  } catch (err) {
    logger.fatal({ err }, 'failed to start server');
    process.exit(1);
  }
}

main();
