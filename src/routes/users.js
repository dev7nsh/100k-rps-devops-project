import { query } from '../db.js';

const MAX_LIMIT = 1000;

export async function usersRoutes(fastify) {

  // ── GET /api/users?limit=100 ──────────────────────────────
  // Returns N random users. Default limit = 100, max = 1000.
  fastify.get('/api/users', async (request, reply) => {
    let limit = Number(request.query.limit) || 100;

    if (limit < 1)         limit = 1;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const { rows } = await query(
      `SELECT id, name, email
       FROM   users
       ORDER  BY RANDOM()
       LIMIT  $1`,
      [limit],
    );

    return { count: rows.length, users: rows };
  });

  // ── GET /api/users/:id ────────────────────────────────────
  // Returns a single user by primary key.
  fastify.get('/api/users/:id', async (request, reply) => {
    const id = Number(request.params.id);

    if (!Number.isInteger(id) || id < 1) {
      reply.code(400);
      return { error: 'id must be a positive integer' };
    }

    const { rows } = await query(
      `SELECT id, name, email
       FROM   users
       WHERE  id = $1`,
      [id],
    );

    if (rows.length === 0) {
      reply.code(404);
      return { error: `User ${id} not found` };
    }

    return rows[0];
  });

  // ── POST /api/users ───────────────────────────────────────
  // Creates a new user. Body: { name, email }
  fastify.post('/api/users', async (request, reply) => {
    const { name, email } = request.body || {};

    if (!name || !email) {
      reply.code(400);
      return { error: 'name and email are required' };
    }

    const { rows } = await query(
      `INSERT INTO users (name, email)
       VALUES ($1, $2)
       RETURNING id, name, email, created_at`,
      [name, email],
    );

    reply.code(201);
    return rows[0];
  });
}
