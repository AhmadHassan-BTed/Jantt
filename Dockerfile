# syntax=docker/dockerfile:1
# ==============================================================================
# Jantt Multi-Stage Production Dockerfile (playground as a static site)
# ==============================================================================

# Stage 1: Build & Verification
FROM node:22-alpine AS builder

WORKDIR /app

# Every workspace manifest, so `npm ci` sees the exact tree recorded in package-lock.json.
# This layer is reused until a manifest or the lockfile changes.
COPY package.json package-lock.json .npmrc ./
COPY --parents packages/*/package.json cli/package.json apps/*/package.json ./

# Install dependencies cleanly
RUN npm ci

# Copy source trees. Host installs and build outputs (wrong-platform native bindings),
# VCS metadata and local env files never enter the image.
COPY --exclude=.git --exclude=**/node_modules --exclude=**/dist --exclude=**/.env* . .

# Compile production bundles, then verify: the interop, mcp, render-canvas and cli
# suites import the built @jantt/core.
RUN npm run build
RUN npm test

# Stage 2: Production Static Web Server (non-root nginx listening on 8080)
FROM nginxinc/nginx-unprivileged:stable-alpine AS runner

COPY <<"EOF" /etc/nginx/conf.d/default.conf
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    server_tokens off;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # Same policy as apps/playground/public/_headers. The CSP itself is installed by the app
    # (src/main.tsx), and no frame restriction is sent because iframe embeds are supported.
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;

    # Content-hashed build output: safe to cache for a year.
    location /assets/ {
        expires 1y;
    }

    # The entry document must be revalidated so a deploy is picked up immediately.
    location = /index.html {
        expires -1;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Copy compiled playground static assets to nginx web root
COPY --from=builder /app/apps/playground/dist /usr/share/nginx/html

EXPOSE 8080

# Healthcheck (IPv4 loopback: nginx listens on 0.0.0.0:8080)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
