#!/bin/sh
# Starts as root only long enough to make the (possibly root-owned) bind-mounted
# data volume writable by the unprivileged `node` user, then drops privileges via
# su-exec before exec'ing the server. Works on fresh and pre-existing volumes.
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR" 2>/dev/null || true

exec su-exec node:node node server.js
