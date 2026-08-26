# syntax=docker/dockerfile:1.6
#
# Sakina Islamic Knowledge MCP Server (WO#105).
#
# Builds a minimal production image. Two-stage: build runs the
# TypeScript compile + data bundle inside the build stage; runtime
# stage installs only production dependencies and copies the
# compiled `dist/` and bundled `data/`.
#
# Build:    docker build -t sakina-mcp .
# Run:      docker run -p 3030:3030 \
#             -e UPSTASH_REDIS_REST_URL=... \
#             -e UPSTASH_REDIS_REST_TOKEN=... \
#             sakina-mcp
# Health:   curl http://localhost:3030/health
# MCP:      POST http://localhost:3030/mcp

# ── Build stage ────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Dependency layer first so changes to source don't bust the install
# cache.
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Source + build config
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY data/ ./data/
COPY .mcp/ ./.mcp/

# Compile TypeScript -> dist/, run postbuild patching.
# The data bundle is regenerated at npm publish time, not here — the
# Dockerfile assumes `data/` is already present (committed or freshly
# bundled on the host before docker build).
RUN npx tsc -p tsconfig.build.json && node scripts/postbuild.mjs

# ── Runtime stage ──────────────────────────────────────────────────
FROM node:20-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only.
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Compiled server + bundled data + Smithery server card (served at
# /.well-known/mcp/server-card.json).
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/.mcp ./.mcp

EXPOSE 3030
CMD ["node", "dist/server.js"]
