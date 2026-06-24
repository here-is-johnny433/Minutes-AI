FROM node:20-alpine

# ffmpeg powers /api/compress (re-encodes large audio to small mono Opus).
# su-exec lets the entrypoint drop from root to the `node` user after fixing
# data-volume ownership.
RUN apk add --no-cache ffmpeg su-exec

WORKDIR /app

# Install deps in a separate layer so source-only changes don't bust the cache
COPY package.json ./
RUN npm install --omit=dev --no-package-lock

COPY server.js entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

# The entrypoint starts as root, chowns the bind-mounted /data volume, then
# drops to the unprivileged `node` user (via su-exec) before running the
# server — so the Node process itself never runs as root. The container is on
# the internal docker network only; Caddy fronts the only external entry point.
ENTRYPOINT ["./entrypoint.sh"]
