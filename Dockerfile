# Use Node.js 22 LTS as base image
FROM node:22-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files first for better cache
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL deps (dev + prod) for TypeScript build
# Add retry mechanism and network timeout for better reliability
RUN npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set registry https://registry.npmjs.org/ && \
    npm install --no-audit --no-fund --prefer-offline || \
    (echo "First attempt failed, retrying..." && sleep 10 && npm install --no-audit --no-fund)

# Copy sources
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/

# Build TypeScript
RUN npm run build

# Drop devDependencies to slim runtime
RUN npm prune --production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]