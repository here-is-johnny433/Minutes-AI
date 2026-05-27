#!/bin/bash
# ==========================================================================
# MINUTES.AI - Docker Volume Mount Development Launcher
# ==========================================================================
# This script hooks up your running Docker container to your local code files.
# It uses bind mounts so that any changes you make to index.html, app.js,
# styles.css, or nginx.conf are reflected instantly at http://localhost:${PORT}.
# ==========================================================================

CONTAINER_NAME="minutes-ai-app"
IMAGE_NAME="minutes-ai"
PORT="8081"
# Resolve the project directory from the script's own location so the script
# works for anyone who clones the repo, regardless of where they put it.
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Setting up live development environment for Minutes.AI..."

# Check if docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# 1. Stop and remove existing container if it exists
if [ "$(docker ps -aq -f name=^/${CONTAINER_NAME}$)" ]; then
    echo "🛑 Found existing container '${CONTAINER_NAME}'. Stopping and removing..."
    docker stop ${CONTAINER_NAME} >/dev/null 2>&1
    docker rm ${CONTAINER_NAME} >/dev/null 2>&1
fi

# 2. Check if the Docker image exists, if not, build it first
if [ -z "$(docker images -q ${IMAGE_NAME}:latest)" ]; then
    echo "📦 Docker image '${IMAGE_NAME}' not found. Building it..."
    docker build -t ${IMAGE_NAME} "${WORKSPACE_DIR}"
fi

# 3. Start a new container with volume mounts for live reload
echo "🔄 Starting development container with live-reload volume mounts..."
docker run -d \
  -p ${PORT}:80 \
  --name ${CONTAINER_NAME} \
  -v "${WORKSPACE_DIR}/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "${WORKSPACE_DIR}:/usr/share/nginx/html:ro" \
  --restart unless-stopped \
  ${IMAGE_NAME}

if [ $? -eq 0 ]; then
    echo "✨ Success! Container '${CONTAINER_NAME}' is now hooked up to your local workspace."
    echo "🌐 Open your browser and navigate to: http://localhost:${PORT}"
    echo "💡 Any modifications you make to index.html, app.js, or styles.css will update instantly upon refresh!"
else
    echo "❌ Failed to start the docker container."
    exit 1
fi
