#!/bin/bash

##############################################################################
# VPS Pre-Deployment Validation Script
# 
# Purpose: Verify VPS is ready for infrastructure optimization deployment
# Usage: ./validate-vps-ready.sh
# 
# Checks:
# - Required services installed (Node, Redis, PM2, Nginx)
# - Redis is running and responsive
# - Disk space available
# - Ports are available
# - Code repository exists
# - Dependencies installed
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

print_header() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ VPS PRE-DEPLOYMENT VALIDATION${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"
}

check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED++))
}

check_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_header

# ============================================================
# 1. Check Node.js
# ============================================================
echo -e "${YELLOW}[1] Checking Node.js...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    if [[ $NODE_VERSION == v1[8-9].* ]] || [[ $NODE_VERSION == v2[0-9].* ]]; then
        check_pass "Node.js $NODE_VERSION installed"
    else
        check_warning "Node.js $NODE_VERSION (recommended v18+)"
    fi
else
    check_fail "Node.js not installed"
fi

# ============================================================
# 2. Check npm
# ============================================================
echo -e "${YELLOW}[2] Checking npm...${NC}"
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    check_pass "npm $NPM_VERSION installed"
else
    check_fail "npm not installed"
fi

# ============================================================
# 3. Check Redis
# ============================================================
echo -e "${YELLOW}[3] Checking Redis...${NC}"
if command -v redis-cli &> /dev/null; then
    REDIS_VERSION=$(redis-cli --version | grep -oP '\d+\.\d+\.\d+')
    check_pass "Redis CLI installed (v$REDIS_VERSION)"
else
    check_fail "Redis CLI not found"
fi

# Check Redis server running
if redis-cli ping &> /dev/null; then
    check_pass "Redis server is running"
else
    check_fail "Redis server not responding"
fi

# ============================================================
# 4. Check PM2
# ============================================================
echo -e "${YELLOW}[4] Checking PM2...${NC}"
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 -v)
    check_pass "PM2 $PM2_VERSION installed globally"
else
    check_fail "PM2 not installed globally"
fi

# ============================================================
# 5. Check Nginx
# ============================================================
echo -e "${YELLOW}[5] Checking Nginx...${NC}"
if command -v nginx &> /dev/null; then
    NGINX_VERSION=$(nginx -v 2>&1 | grep -oP 'nginx/\K[0-9.]+')
    check_pass "Nginx $NGINX_VERSION installed"
else
    check_warning "Nginx not installed (optional but recommended)"
fi

# ============================================================
# 6. Check Git
# ============================================================
echo -e "${YELLOW}[6] Checking Git...${NC}"
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | grep -oP '\d+\.\d+\.\d+')
    check_pass "Git $GIT_VERSION installed"
else
    check_fail "Git not installed"
fi

# ============================================================
# 7. Check Disk Space
# ============================================================
echo -e "${YELLOW}[7] Checking Disk Space...${NC}"
DISK_AVAILABLE=$(df -h / | awk 'NR==2 {print $4}')
DISK_PERCENT=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_PERCENT" -lt 80 ]; then
    check_pass "Disk space: $DISK_AVAILABLE available ($DISK_PERCENT% used)"
else
    check_warning "Disk space low: only $DISK_AVAILABLE available ($DISK_PERCENT% used)"
fi

# ============================================================
# 8. Check Memory
# ============================================================
echo -e "${YELLOW}[8] Checking Memory...${NC}"
MEMORY_AVAILABLE=$(free -h | awk 'NR==2 {print $7}')
MEMORY_TOTAL=$(free -h | awk 'NR==2 {print $2}')
check_pass "Memory: $MEMORY_AVAILABLE available (Total: $MEMORY_TOTAL)"

# ============================================================
# 9. Check Port Availability
# ============================================================
echo -e "${YELLOW}[9] Checking Port Availability...${NC}"

# Check port 5000 (Node app)
if netstat -tuln 2>/dev/null | grep -q ":5000 "; then
    check_warning "Port 5000 is already in use"
else
    check_pass "Port 5000 is available"
fi

# Check port 6379 (Redis)
if netstat -tuln 2>/dev/null | grep -q ":6379 "; then
    check_pass "Port 6379 (Redis) is in use"
else
    check_fail "Port 6379 (Redis) not responding"
fi

# Check port 80 (HTTP)
if netstat -tuln 2>/dev/null | grep -q ":80 "; then
    check_warning "Port 80 (HTTP) is in use"
else
    check_pass "Port 80 is available"
fi

# Check port 443 (HTTPS)
if netstat -tuln 2>/dev/null | grep -q ":443 "; then
    check_warning "Port 443 (HTTPS) is in use"
else
    check_pass "Port 443 is available"
fi

# ============================================================
# 10. Check Repository
# ============================================================
echo -e "${YELLOW}[10] Checking Repository...${NC}"
APP_DIR="$HOME/apps/arsipdigitalr2"
if [ -d "$APP_DIR/.git" ]; then
    check_pass "Repository exists at $APP_DIR"
    CURRENT_BRANCH=$(cd "$APP_DIR" && git branch --show-current 2>/dev/null)
    check_pass "Current branch: $CURRENT_BRANCH"
else
    check_warning "Repository not found at $APP_DIR"
fi

# ============================================================
# 11. Check npm dependencies
# ============================================================
echo -e "${YELLOW}[11] Checking npm Dependencies...${NC}"
if [ -d "$APP_DIR/backend/node_modules" ]; then
    check_pass "node_modules directory exists"
    if grep -q "redis" "$APP_DIR/backend/package.json"; then
        check_pass "Redis package in dependencies"
    else
        check_fail "Redis package not in dependencies"
    fi
else
    check_warning "node_modules not installed (will be done during deployment)"
fi

# ============================================================
# 12. Check ecosystem.config.js
# ============================================================
echo -e "${YELLOW}[12] Checking PM2 Configuration...${NC}"
if [ -f "$APP_DIR/ecosystem.config.js" ]; then
    check_pass "ecosystem.config.js found"
else
    check_fail "ecosystem.config.js not found"
fi

# ============================================================
# 13. Check .env file
# ============================================================
echo -e "${YELLOW}[13] Checking Environment Configuration...${NC}"
if [ -f "$APP_DIR/backend/.env" ]; then
    check_pass ".env file exists"
    if grep -q "REDIS_PASSWORD" "$APP_DIR/backend/.env"; then
        check_pass "REDIS_PASSWORD configured"
    else
        check_fail "REDIS_PASSWORD not configured"
    fi
else
    check_warning ".env file not found (will need to create it)"
fi

# ============================================================
# 14. Test Redis Connection
# ============================================================
echo -e "${YELLOW}[14] Testing Redis Connection...${NC}"
if redis-cli ping &> /dev/null; then
    REDIS_INFO=$(redis-cli info server | grep redis_version | cut -d: -f2)
    check_pass "Redis responding: $REDIS_INFO"
else
    if [ -f "$APP_DIR/backend/.env" ]; then
        REDIS_PASSWORD=$(grep "REDIS_PASSWORD" "$APP_DIR/backend/.env" | cut -d= -f2)
        if [ -n "$REDIS_PASSWORD" ]; then
            if redis-cli -a "$REDIS_PASSWORD" ping &> /dev/null; then
                check_pass "Redis responding with password"
            else
                check_fail "Redis not responding (check password)"
            fi
        fi
    fi
fi

# ============================================================
# SUMMARY
# ============================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ VALIDATION SUMMARY${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✅ VPS IS READY FOR DEPLOYMENT!${NC}"
    echo -e "\nYou can now run:"
    echo -e "  ${YELLOW}./deploy-vps.sh${NC}"
    exit 0
else
    echo -e "\n${RED}❌ VPS HAS ISSUES. Please fix the failures above.${NC}"
    echo -e "\nCommon fixes:"
    echo -e "  1. Install Redis: ${YELLOW}sudo apt install -y redis-server${NC}"
    echo -e "  2. Install PM2: ${YELLOW}sudo npm install -g pm2${NC}"
    echo -e "  3. Start Redis: ${YELLOW}sudo systemctl start redis-server${NC}"
    echo -e "  4. Configure .env: ${YELLOW}nano /root/arsipcloudflre/backend/.env${NC}"
    exit 1
fi
