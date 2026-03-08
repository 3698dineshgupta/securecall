FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --only=production

COPY server.js ./

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001
USER nodeuser

EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

CMD ["node", "server.js"]
