import 'dotenv/config';
import Fastify from 'fastify';
import { closePool }    from './db.js';
import { healthRoutes } from './routes/health.js';
import { usersRoutes }  from './routes/users.js';

const PORT = Number(process.env.PORT) || 3000;

const app = Fastify({ logger: true });

// ── Routes ─────────────────────────────────────────────────
app.register(healthRoutes);
app.register(usersRoutes);

// ── Global error handler ───────────────────────────────────
app.setErrorHandler((err, request, reply) => {
  request.log.error(err);
  reply.code(err.statusCode || 500).send({
    error: err.message || 'Internal Server Error',
  });
});

// ── Start ──────────────────────────────────────────────────
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  console.error(err);
  process.exit(1);
}

// ── Graceful shutdown ──────────────────────────────────────
async function shutdown() {
  await app.close();
  await closePool();
  process.exit(0);
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
