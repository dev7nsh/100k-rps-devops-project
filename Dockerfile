# ─────────────────────────────────────────────────────────────
#  Dockerfile — multi-stage production image
#  Build: docker build -t node-100k-rps .
#  Run:   docker run -p 3000:3000 --env-file .env node-100k-rps
# ─────────────────────────────────────────────────────────────

# ── Stage 1: dependency installation ─────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Only copy manifest files to leverage Docker layer caching
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# ── Stage 2: production image ─────────────────────────────────
FROM node:22-alpine AS runner

# Security: run as non-root user
RUN addgroup --system bench && adduser --system --ingroup bench bench

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps --chown=bench:bench /app/node_modules ./node_modules

# Copy application source
COPY --chown=bench:bench src/       ./src/
COPY --chown=bench:bench package.json ./

# Expose API port
EXPOSE 3000

# Switch to non-root user
USER bench

# Health check — used by Docker / orchestrators
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start the server
CMD ["node", "src/server.js"]
