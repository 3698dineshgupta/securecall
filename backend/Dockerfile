FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

# Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# Production image
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001
USER nodeuser

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "src/index.js"]
