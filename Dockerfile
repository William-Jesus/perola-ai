# Multi-stage build for Jarvis AI Assistant
# Requires: Node.js + Python + ffmpeg + Playwright

# ── Stage 1: Dependencies ──
FROM node:22-slim AS deps

WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./

# Install deps (supports both npm and pnpm lockfiles)
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && pnpm install --frozen-lockfile; \
    else \
      npm ci; \
    fi

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

# Install system dependencies: Python, ffmpeg, git (for speechbrain model download)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for voice identification
RUN pip3 install --break-system-packages --no-cache-dir \
    speechbrain \
    torch \
    torchaudio \
    numpy

# Install Playwright Chromium for browser automation
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# Create data directory for voice profiles
RUN mkdir -p /app/data

# Create non-root user
RUN groupadd -r jarvis && useradd -r -g jarvis jarvis
RUN chown -R jarvis:jarvis /app/data

# Copy built application
COPY --from=builder --chown=jarvis:jarvis /app/.next/standalone ./
COPY --from=builder --chown=jarvis:jarvis /app/.next/static ./.next/static
COPY --from=builder --chown=jarvis:jarvis /app/public ./public
COPY --from=builder --chown=jarvis:jarvis /app/scripts ./scripts
COPY --from=builder --chown=jarvis:jarvis /app/lib ./lib
COPY --from=builder --chown=jarvis:jarvis /app/package.json ./

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Expose port
EXPOSE 3000

USER jarvis

CMD ["node", "server.js"]
