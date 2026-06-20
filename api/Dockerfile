FROM node:20-alpine

# ffmpeg powers /api/compress (re-encodes large audio to small mono Opus)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install deps in a separate layer so source-only changes don't bust the cache
COPY package.json ./
RUN npm install --omit=dev --no-package-lock

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

# Runs as root so the bind-mounted /data volume (owned by root by default)
# is writable. The container is on the internal docker network only — Caddy
# fronts the only external entry point.
CMD ["node", "server.js"]
