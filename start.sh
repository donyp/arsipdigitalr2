#!/bin/bash

# Start Arsip Cloud Backend
# This is the entry point for Docker container

# Set default values for environment variables if not already set
: ${PORT:=8080}
: ${NODE_ENV:=production}
: ${LOG_LEVEL:=warn}

# Log startup information
echo "[STARTUP] Starting Arsip Cloud Backend"
echo "[STARTUP] NODE_ENV: $NODE_ENV"
echo "[STARTUP] PORT: $PORT"
echo "[STARTUP] LOG_LEVEL: $LOG_LEVEL"

# Start the Node.js application
exec node /app/backend/server.js
