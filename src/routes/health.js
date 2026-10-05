// GET /health
// No database call — pure Node.js response

export async function healthRoutes(fastify) {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      pid:    process.pid,
    };
  });
}
