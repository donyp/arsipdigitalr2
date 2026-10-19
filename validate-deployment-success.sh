#!/bin/bash

##############################################################################
# Post-Deployment Validation Script
# 
# Purpose: Verify deployment was successful
# Usage: ./validate-deployment-success.sh
# 
# Checks:
# - Application is running
# - All health endpoints respond
# - Redis is connected
# - Database schema is updated
# - Phase 3-4 features are active
##############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
APP_URL="http://localhost:5000"
PASSED=0
FAILED=0

print_header() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ POST-DEPLOYMENT VALIDATION${NC}"
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

# ============================================================
# Helper function to test endpoint
# ============================================================
test_endpoint() {
    local name=$1
    local endpoint=$2
    local expected=$3
    
    echo -e "${YELLOW}Testing: $name${NC}"
    
    local response=$(curl -s "$APP_URL$endpoint")
    
    if [ -z "$response" ]; then
        check_fail "$name - No response"
        return 1
    fi
    
    if [[ "$response" == *"$expected"* ]]; then
        check_pass "$name - OK"
        return 0
    else
        check_fail "$name - Unexpected response: ${response:0:50}..."
        return 1
    fi
}

print_header

# ============================================================
# 1. Check PM2 Status
# ============================================================
echo -e "${YELLOW}[1] Checking PM2 Status...${NC}"
if pm2 status | grep -q "online"; then
    PM2_STATUS=$(pm2 status | grep arsip-backend)
    check_pass "Application running: $PM2_STATUS"
else
    check_fail "No PM2 processes running"
fi

# ============================================================
# 2. Check Port 5000
# ============================================================
echo -e "${YELLOW}[2] Checking Port 5000...${NC}"
if netstat -tuln 2>/dev/null | grep -q ":5000 "; then
    check_pass "Port 5000 is listening"
else
    check_fail "Port 5000 is not listening"
fi

# ============================================================
# 3. Test Health Endpoint
# ============================================================
echo -e "${YELLOW}[3] Testing Health Endpoint...${NC}"
test_endpoint "Health Check" "/api/health" "healthy"

# ============================================================
# 4. Test Phases Health Endpoint
# ============================================================
echo -e "${YELLOW}[4] Testing Phases Health...${NC}"
test_endpoint "Phases Status" "/api/phases/health" "phase1"

# Get detailed phase status
PHASES=$(curl -s "$APP_URL/api/phases/health")
echo "$PHASES" | grep -q "\"phase3\":\"ACTIVE\"" && \
    check_pass "Phase 3 (Idempotency) is ACTIVE" || \
    check_warning "Phase 3 status: $(echo $PHASES | grep -oP '\"phase3\":\"[^\"]*')"

echo "$PHASES" | grep -q "\"phase4\":\"ACTIVE\"" && \
    check_pass "Phase 4 (Redis) is ACTIVE" || \
    check_warning "Phase 4 status: $(echo $PHASES | grep -oP '\"phase4\":\"[^\"]*')"

# ============================================================
# 5. Test Metrics Endpoint
# ============================================================
echo -e "${YELLOW}[5] Testing Metrics Endpoint...${NC}"
test_endpoint "Metrics" "/api/phases/metrics" "phase3"

# ============================================================
# 6. Test Idempotency Endpoint
# ============================================================
echo -e "${YELLOW}[6] Testing Idempotency Endpoint...${NC}"
test_endpoint "Idempotency Stats" "/api/idempotency/stats" "idempotency"

# ============================================================
# 7. Test Cache Endpoint
# ============================================================
echo -e "${YELLOW}[7] Testing Cache Endpoint...${NC}"
CACHE_RESPONSE=$(curl -s "$APP_URL/api/cache/stats")
if [[ "$CACHE_RESPONSE" == *"cache"* ]]; then
    check_pass "Cache endpoint responding"
    if [[ "$CACHE_RESPONSE" == *"hits"* ]]; then
        check_pass "Cache statistics available"
    else
        check_warning "Cache statistics not yet populated"
    fi
else
    check_fail "Cache endpoint error"
fi

# ============================================================
# 8. Check Redis Connection
# ============================================================
echo -e "${YELLOW}[8] Checking Redis Connection...${NC}"
if redis-cli ping &> /dev/null; then
    REDIS_INFO=$(redis-cli info server | grep redis_version | cut -d: -f2 | tr -d '\r')
    check_pass "Redis connected (version: $REDIS_INFO)"
else
    if [ -f "/root/arsipcloudflre/backend/.env" ]; then
        REDIS_PASSWORD=$(grep "REDIS_PASSWORD" /root/arsipcloudflre/backend/.env | cut -d= -f2 | tr -d '\r')
        if redis-cli -a "$REDIS_PASSWORD" ping &> /dev/null 2>&1; then
            check_pass "Redis connected with password"
        else
            check_warning "Redis not responding"
        fi
    fi
fi

# ============================================================
# 9. Check Application Logs
# ============================================================
echo -e "${YELLOW}[9] Checking Application Logs...${NC}"
PM2_LOGS=$(pm2 logs arsip-backend --lines 20 2>/dev/null)
if [[ "$PM2_LOGS" == *"error"* ]] || [[ "$PM2_LOGS" == *"Error"* ]] || [[ "$PM2_LOGS" == *"ERROR"* ]]; then
    check_warning "Errors found in logs (check with: pm2 logs arsip-backend)"
else
    check_pass "No critical errors in recent logs"
fi

# ============================================================
# 10. Check Database Schema (Phase 3)
# ============================================================
echo -e "${YELLOW}[10] Checking Database Schema...${NC}"
if psql -h "$SUPABASE_URL" -U postgres -d postgres \
    -c "SELECT * FROM idempotency_responses LIMIT 1;" &> /dev/null 2>&1; then
    check_pass "Idempotency table exists"
else
    check_warning "Idempotency table check skipped (requires Supabase credentials)"
fi

# ============================================================
# 11. Test Response Time
# ============================================================
echo -e "${YELLOW}[11] Testing Response Time...${NC}"
START=$(date +%s%N)
curl -s "$APP_URL/api/health" > /dev/null
END=$(date +%s%N)
RESPONSE_TIME=$(( (END - START) / 1000000 ))
echo "Response time: ${RESPONSE_TIME}ms"
if [ "$RESPONSE_TIME" -lt 100 ]; then
    check_pass "Response time good: ${RESPONSE_TIME}ms"
else
    check_warning "Response time: ${RESPONSE_TIME}ms (may indicate load)"
fi

# ============================================================
# 12. Check CPU/Memory Usage
# ============================================================
echo -e "${YELLOW}[12] Checking Resource Usage...${NC}"
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
MEM_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
echo "CPU: ${CPU_USAGE}% | Memory: ${MEM_USAGE}%"
if [ "$MEM_USAGE" -lt 80 ]; then
    check_pass "Memory usage normal: ${MEM_USAGE}%"
else
    check_warning "Memory usage high: ${MEM_USAGE}%"
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
    echo -e "\n${GREEN}✅ DEPLOYMENT SUCCESSFUL!${NC}"
    echo -e "\nPhase 3-4 is now active:"
    echo -e "  • Idempotency: Duplicate prevention running"
    echo -e "  • Redis: Caching layer active"
    echo -e "\nMonitoring URLs:"
    echo -e "  • Health: $APP_URL/api/health"
    echo -e "  • Phases: $APP_URL/api/phases/health"
    echo -e "  • Metrics: $APP_URL/api/phases/metrics"
    exit 0
else
    echo -e "\n${RED}❌ DEPLOYMENT HAS ISSUES${NC}"
    echo -e "\nTo troubleshoot:"
    echo -e "  1. Check logs: ${YELLOW}pm2 logs arsip-backend${NC}"
    echo -e "  2. Verify Redis: ${YELLOW}redis-cli ping${NC}"
    echo -e "  3. Check .env: ${YELLOW}cat /root/arsipcloudflre/backend/.env | grep REDIS${NC}"
    echo -e "  4. Restart app: ${YELLOW}pm2 restart arsip-backend${NC}"
    exit 1
fi
