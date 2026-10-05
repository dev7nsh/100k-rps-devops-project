import { query, poolStats } from '../db.js';

// ─────────────────────────────────────────────────────────────
//  GET /api/stats
//
//  Returns database and process statistics.
//  Useful to verify pool health during a benchmark run.
// ─────────────────────────────────────────────────────────────

/** @param {import('fastify').FastifyInstance} fastify */
export async function statsRoutes(fastify) {
  fastify.get(
    '/api/stats',
    {
      schema: {
        description: 'Database and process statistics',
        tags: ['ops'],
        response: {
          200: {
            type: 'object',
            properties: {
              process: {
                type: 'object',
                properties: {
                  pid:       { type: 'integer' },
                  uptime:    { type: 'number' },
                  nodeVersion: { type: 'string' },
                  memory: {
                    type: 'object',
                    properties: {
                      rss:       { type: 'integer' },
                      heapUsed:  { type: 'integer' },
                      heapTotal: { type: 'integer' },
                    },
                  },
                },
              },
              pool: {
                type: 'object',
                properties: {
                  total:   { type: 'integer' },
                  idle:    { type: 'integer' },
                  waiting: { type: 'integer' },
                },
              },
              database: {
                type: 'object',
                properties: {
                  userCount:      { type: 'integer' },
                  pgVersion:      { type: 'string' },
                  dbSizeBytes:    { type: 'integer' },
                  dbSizePretty:   { type: 'string' },
                  activeBackends: { type: 'integer' },
                },
              },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      // Run all DB queries in parallel to minimise latency
      const [countResult, versionResult, sizeResult, backendsResult] = await Promise.all([
        query('SELECT COUNT(*)::int AS count FROM users'),
        query('SELECT version() AS version'),
        query(`SELECT pg_database_size(current_database())::int AS bytes,
                      pg_size_pretty(pg_database_size(current_database())) AS pretty`),
        query(`SELECT COUNT(*)::int AS count
               FROM   pg_stat_activity
               WHERE  datname = current_database()`),
      ]);

      const mem = process.memoryUsage();

      return {
        process: {
          pid:         process.pid,
          uptime:      process.uptime(),
          nodeVersion: process.version,
          memory: {
            rss:       mem.rss,
            heapUsed:  mem.heapUsed,
            heapTotal: mem.heapTotal,
          },
        },
        pool: poolStats(),
        database: {
          userCount:      countResult.rows[0].count,
          pgVersion:      versionResult.rows[0].version,
          dbSizeBytes:    sizeResult.rows[0].bytes,
          dbSizePretty:   sizeResult.rows[0].pretty,
          activeBackends: backendsResult.rows[0].count,
        },
        timestamp: new Date().toISOString(),
      };
    },
  );
}
