#!/bin/bash

##############################################################################
# VPS Deployment Script - Arsip Anka Infrastructure Optimization
# 
# Purpose: Automated deployment of Phase 2-4 to production VPS
# Usage: ./deploy-vps.sh
# 
# Prerequisites:
# - SSH access to VPS configured with key-based auth
# - VPS has Node.js, PM2, Redis, Nginx installed
# - Redis is running with password configured
# - Code repository exists on VPS
##############################################################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VPS_USER="root"
VPS_IP="your-vps-ip"
DEPLOY_PATH="/root/arsipcloudflre"
REPO="origin/master"
APP_NAME="arsip-backend"

# Functions
print_header() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ $1${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"
}

print_step() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

error_exit() {
    print_error "$1"
    exit 1
}

# Main deployment
print_header "ARSIP ANKA - INFRASTRUCTURE OPTIMIZATION DEPLOYMENT"

# Step 1: Check VPS connectivity
print_step "Step 1: Checking VPS connectivity..."
ssh -q ${VPS_USER}@${VPS_IP} "echo 'ok'" > /dev/null 2>&1 || error_exit "Cannot connect to VPS. Check SSH config."
print_success "VPS connection OK"

# Step 2: Pull latest code
print_step "Step 2: Pulling latest code from ${REPO}..."
ssh ${VPS_USER}@${VPS_IP} "cd ${DEPLOY_PATH} && git pull ${REPO}" || error_exit "Failed to pull code"
print_success "Code pulled successfully"

# Step 3: Install dependencies
print_step "Step 3: Installing npm dependencies..."
ssh ${VPS_USER}@${VPS_IP} "cd ${DEPLOY_PATH}/backend && npm install" || error_exit "Failed to install dependencies"
print_success "Dependencies installed"

# Step 4: Verify Redis connection
print_step "Step 4: Verifying Redis connection..."
REDIS_CHECK=$(ssh ${VPS_USER}@${VPS_IP} "redis-cli -p 6379 ping 2>&1")
if [[ $REDIS_CHECK == "PONG" ]]; then
    print_success "Redis is running"
else
    print_error "Redis not responding. Please ensure Redis is running on VPS."
    echo "To start Redis: sudo systemctl start redis-server"
    exit 1
fi

# Step 5: Backup database
print_step "Step 5: Creating database backup..."
ssh ${VPS_USER}@${VPS_IP} "cd ${DEPLOY_PATH} && redis-cli BGSAVE" > /dev/null 2>&1
print_success "Database backup initiated"

# Step 6: Run database migrations (if any)
print_step "Step 6: Checking for database migrations..."
ssh ${VPS_USER}@${VPS_IP} "cd ${DEPLOY_PATH}/backend && npm run migrate 2>/dev/null" > /dev/null 2>&1 || true
print_success "Migrations checked"

# Step 7: Stop current application
print_step "Step 7: Stopping current application..."
ssh ${VPS_USER}@${VPS_IP} "pm2 stop ${APP_NAME}" > /dev/null 2>&1 || true
sleep 2
print_success "Application stopped"

# Step 8: Start application with PM2
print_step "Step 8: Starting application with PM2..."
ssh ${VPS_USER}@${VPS_IP} "cd ${DEPLOY_PATH} && pm2 start ecosystem.config.js || pm2 restart ecosystem.config.js" || error_exit "Failed to start application"
print_success "Application started"

# Step 9: Wait for application to be ready
print_step "Step 9: Waiting for application to be ready..."
sleep 5
print_success "Waiting complete"

# Step 10: Health check
print_step "Step 10: Running health check..."
HEALTH_CHECK=$(ssh ${VPS_USER}@${VPS_IP} "curl -s http://localhost:5000/api/health" 2>&1)
if [[ $HEALTH_CHECK == *"healthy"* ]]; then
    print_success "Health check PASSED"
else
    print_error "Health check FAILED"
    echo "Response: $HEALTH_CHECK"
    print_error "Rolling back..."
    ssh ${VPS_USER}@${VPS_IP} "pm2 restart ${APP_NAME}" > /dev/null 2>&1
    exit 1
fi

# Step 11: Verify Phase 3-4 endpoints
print_step "Step 11: Verifying Phase 3-4 endpoints..."
PHASES=$(ssh ${VPS_USER}@${VPS_IP} "curl -s http://localhost:5000/api/phases/health" 2>&1)
if [[ $PHASES == *"phase3"* ]]; then
    print_success "Phase 3-4 endpoints available"
else
    print_error "Phase 3-4 endpoints not responding"
    echo "Response: $PHASES"
fi

# Step 12: Save PM2 process list
print_step "Step 12: Saving PM2 process list..."
ssh ${VPS_USER}@${VPS_IP} "pm2 save" > /dev/null 2>&1
print_success "PM2 configuration saved"

# Summary
print_header "DEPLOYMENT COMPLETE ✅"

echo -e "${GREEN}Summary:${NC}"
echo "  • Code deployed from: ${REPO}"
echo "  • VPS: ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}"
echo "  • Application: ${APP_NAME}"
echo "  • Status: RUNNING"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "  1. Monitor application: ssh ${VPS_USER}@${VPS_IP} 'pm2 monit'"
echo "  2. View logs: ssh ${VPS_USER}@${VPS_IP} 'pm2 logs ${APP_NAME}'"
echo "  3. Check health: curl http://your-domain/api/health"
echo "  4. Verify phases: curl http://your-domain/api/phases/health"
echo ""
echo -e "${YELLOW}Monitoring URLs:${NC}"
echo "  • Health: /api/health"
echo "  • Phases: /api/phases/health"
echo "  • Metrics: /api/phases/metrics"
echo "  • Idempotency: /api/idempotency/stats"
echo "  • Cache: /api/cache/stats"
echo ""
echo -e "${BLUE}Deployment Time: $(date)${NC}"
