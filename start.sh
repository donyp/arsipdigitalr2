#!/bin/bash

# Pusat Arsip Anka - Startup Script (R2 Migration)
# This script starts Node.js backend with Cloudflare R2 storage

echo "=========================================="
echo "Starting Pusat Arsip Anka (Cloudflare R2)"
echo "=========================================="

# Create necessary directories
mkdir -p /app/data
mkdir -p /app/backend/tmp
mkdir -p /app/backend/download-cache
chmod -R 777 /app/data /app/backend/tmp /app/backend/download-cache

# Export PORT for different platforms
# Hugging Face: 7860
# Cloud Run / Railway: 8080  
# Local dev: 5000
export PORT=${PORT:-5000}
export NODE_ENV=production

echo "[INIT] PORT is set to: $PORT"
echo "[INIT] NODE_ENV is set to: $NODE_ENV"
echo "[INIT] Storage Backend: Cloudflare R2"

# Validate R2 credentials
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ] || [ -z "$CLOUDFLARE_ACCESS_KEY_ID" ] || [ -z "$CLOUDFLARE_ACCESS_KEY_SECRET" ]; then
    echo "[ERROR] Missing Cloudflare R2 credentials:"
    echo "  - CLOUDFLARE_ACCOUNT_ID: ${CLOUDFLARE_ACCOUNT_ID:-(not set)}"
    echo "  - CLOUDFLARE_ACCESS_KEY_ID: ${CLOUDFLARE_ACCESS_KEY_ID:-(not set)}"
    echo "  - CLOUDFLARE_ACCESS_KEY_SECRET: ${CLOUDFLARE_ACCESS_KEY_SECRET:-(not set)}"
    echo "[ERROR] Please set all required environment variables"
    exit 1
fi

echo "[INIT] ✅ Cloudflare R2 credentials validated"

# ============================================================
# FUNCTION TO CLEAN UP PROCESSES
# ============================================================

cleanup() {
    echo "[SHUTDOWN] Cleaning up processes..."
    exit 0
}

# ============================================================
# START NODE.JS BACKEND
# ============================================================

echo "[INIT] Starting Node.js backend server..."
cd /app/backend

# Start Node in foreground
echo "[DEBUG] About to start node server.js with PORT=$PORT"
node server.js 2>&1 &
NODE_PID=$!

echo "[DEBUG] Node PID: $NODE_PID"

# Wait for Node to complete
wait $NODE_PID

# Node exited, clean up and exit
echo "[SHUTDOWN] Node.js server exited"
cleanup