# Use Node.js 22 slim as base image (Node 18 deprecated for Supabase WebSocket support)
FROM node:22-slim

# Set working directory early
WORKDIR /app

# Update apt and install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    rclone \
    git \
    tesseract-ocr \
    libtesseract-dev \
    graphicsmagick \
    ghostscript \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Download Indonesian language pack for Tesseract
RUN mkdir -p /usr/share/tesseract-ocr-4.00/tessdata && \
    curl -L -o /usr/share/tesseract-4/tessdata/ind.traineddata https://github.com/UB-Mannheim/tesseract/raw/main/tessdata/ind.traineddata || true

# Copy backend dependencies first (better layer caching)
# Last updated: 2026-09-04 - Added root package.json for pdf-parse
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm install --production && cd backend && npm install --production && npm cache clean --force

# Copy frontend files
COPY css ./css
COPY js ./js
COPY *.html ./
COPY *.md ./

# Copy backend application
COPY backend ./backend
COPY start.sh ./

# Copy rclone.conf if it exists (will be generated at runtime if missing)
COPY rclone.conf* ./

# Ensure start script is executable
RUN chmod +x /app/start.sh

# Create data directories
RUN mkdir -p /app/data/log /app/data/temp /app/backend/data/log /app/backend/data/temp

# Environment variables first (define before use)
# Cloud Run uses PORT environment variable (default 8080)
# Hugging Face Spaces uses 7860
# Local/Replit uses 5000
# This is overridable via runtime PORT env var
ENV PORT=8080
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=512
ENV LOG_LEVEL=warn
ENV RCLONE_CONFIG=/app/rclone.conf

# Expose port
# 8080 for Cloud Run / Node backend
# (Alist disabled in this build - use rclone for storage instead)
EXPOSE 8080

# Add Health Check for Cloud Run / Kubernetes environments
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Note on Different Environments:
# - Cloud Run: Uses PORT env var (8080), Health check enabled
# - Hugging Face Spaces: Uses PORT=7860, relies on port binding
# - Local/K8s: Uses PORT env var, Health check enabled
# - Railway: Uses PORT env var, Alist disabled
# - The app handles all scenarios via PORT environment variable
# 
# Note: Alist service disabled in this build to prevent Railway build failures
# Storage uses rclone (Google Drive) instead

# Start application via start.sh script
CMD ["/app/start.sh"]
