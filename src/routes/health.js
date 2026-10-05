// ─────────────────────────────────────────────────────────────
//  GET /health
//
//  Zero-database route — measures pure Node.js / Fastify overhead.
//  Use this as a baseline to understand framework latency vs
//  database latency in your benchmarks.
// ─────────────────────────────────────────────────────────────

/** @param {import('fastify').FastifyInstance} fastify */
export async function healthRoutes(fastify) {
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Liveness / readiness probe — no DB call',
        tags: ['ops'],
        response: {
          200: {
            type: 'object',
            properties: {
              status:   { type: 'string' },
              uptime:   { type: 'number' },
              pid:      { type: 'integer' },
              memory:   {
                type: 'object',
                properties: {
                  rss:       { type: 'integer' },
                  heapUsed:  { type: 'integer' },
                  heapTotal: { type: 'integer' },
                  external:  { type: 'integer' },
                },
              },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const mem = process.memoryUsage();
      return {
        status:    'ok',
        uptime:    process.uptime(),
        pid:       process.pid,
        memory: {
          rss:       mem.rss,
          heapUsed:  mem.heapUsed,
          heapTotal: mem.heapTotal,
          external:  mem.external,
        },
        timestamp: new Date().toISOString(),
      };
    },
  );
}
