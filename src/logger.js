import pino from 'pino';
import { config } from './config.js';

// ─────────────────────────────────────────────────────────────
//  Shared logger instance.
//  In production: JSON (structured), great for log aggregators.
//  In development: pino-pretty for human-readable output.
// ─────────────────────────────────────────────────────────────

const isDev = config.node.env !== 'production';

export const logger = pino({
  level: config.node.logLevel,
  // pino-pretty adds colour/formatting in dev; strip in prod for perf
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  // Include pid & hostname automatically for multi-worker debugging
  base: { pid: process.pid },
  // ISO timestamp for every log line
  timestamp: pino.stdTimeFunctions.isoTime,
});
