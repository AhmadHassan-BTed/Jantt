# ==============================================================================
# Jantt Multi-Stage Production Dockerfile
# ==============================================================================

# Stage 1: Build & Verification
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root manifest & workspace configuration
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/react/package*.json ./packages/react/
COPY packages/standalone/package*.json ./packages/standalone/
COPY cli/package*.json ./cli/
COPY apps/playground/package*.json ./apps/playground/

# Install dependencies cleanly
RUN npm ci

# Copy source trees
COPY . .

# Run test verification
RUN npm test

# Compile production bundles across monorepo
RUN npm run build

# Stage 2: Production Static Web Server
FROM nginx:alpine AS runner

# Copy compiled playground static assets to nginx web root
COPY --from=builder /app/apps/playground/dist /usr/share/nginx/html

# Expose standard HTTP port
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
