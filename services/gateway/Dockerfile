# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install all workspace dependencies
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/redis/package.json ./packages/redis/
COPY packages/kafka/package.json ./packages/kafka/
COPY services/gateway/package.json ./services/gateway/

RUN npm ci --workspace=services/gateway --include-workspace-root

# Copy source
COPY packages/ ./packages/
COPY services/gateway/ ./services/gateway/

# Build packages in dependency order
RUN npm run build -w packages/shared
RUN npm run build -w packages/database
RUN npm run build -w packages/redis
RUN npm run build -w packages/kafka
RUN npm run build -w services/gateway

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S flowdesk -u 1001

# Copy built artifacts and production deps
COPY --from=builder --chown=flowdesk:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=flowdesk:nodejs /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=flowdesk:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=flowdesk:nodejs /app/packages/database/package.json ./packages/database/
COPY --from=builder --chown=flowdesk:nodejs /app/packages/redis/dist ./packages/redis/dist
COPY --from=builder --chown=flowdesk:nodejs /app/packages/redis/package.json ./packages/redis/
COPY --from=builder --chown=flowdesk:nodejs /app/packages/kafka/dist ./packages/kafka/dist
COPY --from=builder --chown=flowdesk:nodejs /app/packages/kafka/package.json ./packages/kafka/
COPY --from=builder --chown=flowdesk:nodejs /app/services/gateway/dist ./services/gateway/dist
COPY --from=builder --chown=flowdesk:nodejs /app/services/gateway/package.json ./services/gateway/
COPY --from=builder --chown=flowdesk:nodejs /app/package.json ./
COPY --from=builder --chown=flowdesk:nodejs /app/package-lock.json ./

RUN npm ci --workspace=services/gateway --include-workspace-root --omit=dev

USER flowdesk
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "services/gateway/dist/index.js"]
