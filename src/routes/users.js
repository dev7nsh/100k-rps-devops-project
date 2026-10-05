import { query } from '../db.js';
import { poolStats } from '../db.js';
import { config } from '../config.js';

// ─────────────────────────────────────────────────────────────
//  GET /api/users?limit=100&offset=0   — paginated user list
//  GET /api/users/:id                  — single user by PK
//
//  Performance notes:
//  • JSON schema lets Fastify use fast-json-stringify (2–3× faster
//    than JSON.stringify for the serialisation step).
//  • Parameterised queries prevent SQL injection and allow the PG
//    server to cache query plans.
//  • LIMIT is hard-capped at config.api.maxLimit (default 1 000).
// ─────────────────────────────────────────────────────────────

// Reusable user object schema
const userSchema = {
  type: 'object',
  properties: {
    id:    { type: 'integer' },
    name:  { type: 'string' },
    email: { type: 'string' },
  },
};

/** @param {import('fastify').FastifyInstance} fastify */
export async function usersRoutes(fastify) {
  // ── GET /api/users?limit=100&offset=0 ──────────────────────
  fastify.get(
    '/api/users',
    {
      schema: {
        description: 'Paginated list of users',
        tags: ['users'],
        querystring: {
          type: 'object',
          properties: {
            limit:  { type: 'integer', minimum: 1, maximum: config.api.maxLimit, default: 100 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              count:  { type: 'integer' },
              limit:  { type: 'integer' },
              offset: { type: 'integer' },
              users:  { type: 'array', items: userSchema },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { limit, offset } = request.query;

      const { rows } = await query(
        `SELECT id, name, email
         FROM   users
         ORDER  BY id
         LIMIT  $1 OFFSET $2`,
        [limit, offset],
      );

      return { count: rows.length, limit, offset, users: rows };
    },
  );

  // ── GET /api/users/:id ─────────────────────────────────────
  fastify.get(
    '/api/users/:id',
    {
      schema: {
        description: 'Single user by primary key',
        tags: ['users'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer', minimum: 1 },
          },
          required: ['id'],
        },
        response: {
          200: userSchema,
          404: {
            type: 'object',
            properties: {
              error:   { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const { rows } = await query(
        `SELECT id, name, email
         FROM   users
         WHERE  id = $1`,
        [id],
      );

      if (rows.length === 0) {
        reply.code(404);
        return { error: 'Not Found', message: `User ${id} does not exist` };
      }

      return rows[0];
    },
  );

  // ─── Error handling for DB failures ───────────────────────
  // Fastify propagates thrown errors to the global error handler
  // defined in server.js, so no try/catch needed here.
}
