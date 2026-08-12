# Multi-stage build for Pérola
# Requires: Node.js only — tudo em OpenAI, sem Python/Playwright/voice-id

# ── Stage 1: Dependencies ──
FROM node:22-slim AS deps

WORKDIR /app
COPY package.json package-lock.json* ./

RUN npm ci

# ── Stage 2: Builder ──
FROM node:22-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the Next.js app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: Runner ──
FROM node:22-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r perola && useradd -r -g perola perola

# Memória da Pérola (data/memoria.json) — precisa existir e ser gravável
RUN mkdir -p /app/data && chown -R perola:perola /app/data

# Copy built application
COPY --from=builder --chown=perola:perola /app/.next/standalone ./
COPY --from=builder --chown=perola:perola /app/.next/static ./.next/static
COPY --from=builder --chown=perola:perola /app/public ./public
COPY --from=builder --chown=perola:perola /app/lib ./lib
COPY --from=builder --chown=perola:perola /app/package.json ./

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Expose port
EXPOSE 3000

USER perola

CMD ["node", "server.js"]
