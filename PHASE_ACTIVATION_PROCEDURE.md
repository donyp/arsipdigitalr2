# Phase Activation Procedure - Infrastructure Optimization

**Document Purpose**: Step-by-step guide to activate Phase 2-4 during week 2 deployment

---

## Overview

Each phase runs with a feature flag that can be toggled independently. This allows:
- Safe activation (start at 0% traffic)
- Gradual rollout (0% → 10% → 50% → 100%)
- Instant rollback if issues arise
- No downtime required

---

## Tuesday (Oct 22) - Phase 2 Activation (Cloudflare Reverse Proxy)

### 10:00 AM - Pre-Activation

```bash
# SSH to VPS
ssh root@your-vps-ip

# Check current status
curl http://localhost:5000/api/phases/health

# Expected output:
# {
#   "phase1": "ACTIVE",
#   "phase2": "PENDING",
#   "phase3": "ACTIVE",
#   "phase4": "INACTIVE"
# }
```

### 10:15 AM - Enable Cloudflare

**In Cloudflare Dashboard**:
1. Go to DNS settings
2. Update CNAME to point to VPS IP
3. Enable caching on static assets
4. Configure cache rules

**In VPS**:
```bash
# Update .env
nano /root/arsipcloudflre/backend/.env

# Change these:
CLOUDFLARE_ENABLED=true
CLOUDFLARE_ZONE_ID=your-zone-id
CLOUDFLARE_API_KEY=your-api-key
```

### 10:30 AM - Start Gradual Rollout

```bash
# Set 1% traffic to Cloudflare
# (This is typically done via Cloudflare dashboard)

# Restart application to pick up new config
pm2 restart arsip-backend

# Wait 2 minutes for health checks
sleep 120

# Verify Phase 2 status
curl http://localhost:5000/api/phases/health | grep phase2

# Expected: "phase2": "ACTIVE"
```

### 10:35 AM - Monitor Metrics

```bash
# Check response time improvement (target: 5x)
curl http://localhost:5000/api/phases/metrics

# Monitor error rate
pm2 logs arsip-backend | grep -i "error"

# Expected: No new errors, response time 5x faster on mobile
```

### 11:00 AM - Increase Traffic

**Gradual Rollout Schedule**:
- 10:30 AM: 1% traffic (test with small sample)
- 10:45 AM: 10% traffic (monitor for 15 minutes)
- 11:00 AM: 50% traffic (continue monitoring)
- 11:30 AM: 100% traffic (full production)

```bash
# At each step, verify no errors:
pm2 logs arsip-backend

# If errors occur, immediately rollback:
# In Cloudflare: Set traffic back to 0%
# Or edit .env: CLOUDFLARE_ENABLED=false
# Then: pm2 restart arsip-backend
```

### 12:00 PM - Phase 2 Complete ✅

```bash
# Final verification
curl http://localhost:5000/api/phases/health
# Expected: "phase2": "ACTIVE"

# Document success
echo "Phase 2 activated: $(date)" >> /root/deployment-log.txt
```

---

## Wednesday (Oct 23) - Phase 3 Activation (Idempotency)

### 09:00 AM - Pre-Activation

```bash
# Verify idempotency table exists
psql -h ehdqcxzdmmcwbdwkinyr.supabase.co -U postgres -d postgres \
  -c "SELECT COUNT(*) FROM idempotency_responses;"

# If table doesn't exist, run migration:
psql -h ehdqcxzdmmcwbdwkinyr.supabase.co -U postgres -d postgres \
  -f /root/arsipcloudflre/backend/CREATE_IDEMPOTENCY_TABLE.sql
```

### 09:15 AM - Enable Idempotency

```bash
# Update .env
nano /root/arsipcloudflre/backend/.env

# Change:
USE_IDEMPOTENCY_KEYS=true
IDEMPOTENCY_ROLLOUT=0    # Start at 0%

# Save and restart
pm2 restart arsip-backend

# Wait for startup
sleep 5

# Verify activation
curl http://localhost:5000/api/phases/health | grep phase3
# Expected: "phase3": "ACTIVE"
```

### 09:30 AM - Start Gradual Rollout

```bash
# Phase 3 doesn't use traffic %, but process impact %
# Start at 0% of idempotency checks

# Test with sample invoice (duplicate attempt):
curl -X POST http://localhost:5000/api/invoices/upload \
  -H "Idempotency-Key: test-key-1" \
  -F "file=@test-invoice.pdf"

# Send same request again with same key
curl -X POST http://localhost:5000/api/invoices/upload \
  -H "Idempotency-Key: test-key-1" \
  -F "file=@test-invoice.pdf"

# Expected: Second request returns cached response (instant)
```

### 10:00 AM - Monitor Duplicate Prevention

```bash
# Check idempotency stats
curl http://localhost:5000/api/idempotency/stats

# Monitor logs for "Idempotency" messages
pm2 logs arsip-backend | grep -i "idempotency"

# Expected: Duplicate requests show "cached response" messages
```

### 10:30 AM - Increase Rollout

```bash
# Gradually increase idempotency coverage:

# 10:30 AM: 10% of requests
nano /root/arsipcloudflre/backend/.env
# IDEMPOTENCY_ROLLOUT=10
pm2 restart arsip-backend

# 11:00 AM: 50% of requests
# IDEMPOTENCY_ROLLOUT=50
pm2 restart arsip-backend

# 12:00 PM: 100% of requests
# IDEMPOTENCY_ROLLOUT=100
pm2 restart arsip-backend
```

### 12:00 PM - Phase 3 Complete ✅

```bash
# Verify 100% coverage
curl http://localhost:5000/api/phases/metrics

# Expected: Idempotency enabled with high stats

# Document savings
DUPLICATES=$(curl -s http://localhost:5000/api/idempotency/stats | grep -oP '\"duplicates_prevented\":\s*\K[0-9]+')
SAVINGS=$((DUPLICATES * 1000000))  # Rp 1M per duplicate
echo "Phase 3 savings today: Rp $SAVINGS" >> /root/deployment-log.txt
```

---

## Thursday (Oct 24) - Phase 4 Activation (Redis Caching)

### 09:00 AM - Pre-Activation

```bash
# Verify Redis is running
redis-cli ping
# Expected: PONG

# Check Redis memory
redis-cli info memory

# Check connected clients
redis-cli info clients
# Expected: 0-2 clients before app connection
```

### 09:15 AM - Enable Redis Caching

```bash
# Update .env
nano /root/arsipcloudflre/backend/.env

# Change:
USE_REDIS_CACHE=true
CACHE_ROLLOUT=0          # Start at 0%
REDIS_ENABLED=true

# Save and restart
pm2 restart arsip-backend

# Wait for Redis connection
sleep 5

# Verify activation
curl http://localhost:5000/api/phases/health | grep phase4
# Expected: "phase4": "ACTIVE" (or "INACTIVE" if Redis unavailable)
```

### 09:30 AM - Test Caching

```bash
# Make first request (cache miss)
curl http://localhost:5000/api/invoices/list

# Make same request again (cache hit)
curl http://localhost:5000/api/invoices/list

# Check cache stats
curl http://localhost:5000/api/cache/stats

# Expected: Second request much faster
```

### 10:00 AM - Monitor Response Time

```bash
# Measure response time improvement (target: 71x)
# Before Phase 4: ~625ms
# After Phase 4: ~8.75ms

# Run test:
for i in {1..10}; do
  time curl -s http://localhost:5000/api/invoices/list > /dev/null
done

# Expected: Most requests <10ms
```

### 10:30 AM - Increase Rollout

```bash
# Gradually increase cache coverage:

# 10:30 AM: 10% of responses cached
nano /root/arsipcloudflre/backend/.env
# CACHE_ROLLOUT=10
pm2 restart arsip-backend

# 11:00 AM: 50% of responses
# CACHE_ROLLOUT=50
pm2 restart arsip-backend

# 12:00 PM: 100% of responses
# CACHE_ROLLOUT=100
pm2 restart arsip-backend
```

### 12:00 PM - Phase 4 Complete ✅

```bash
# Verify 100% caching
curl http://localhost:5000/api/cache/stats

# Expected high hit rate (>70%)
# Expected response time: <8.75ms

# Document improvement
RESPONSE_TIME=$(curl -s http://localhost:5000/api/cache/stats | grep -oP '\"avg_response_time\":\s*\K[0-9.]+')
echo "Phase 4 avg response time: ${RESPONSE_TIME}ms" >> /root/deployment-log.txt
```

---

## Friday (Oct 25) - Final Validation

### 09:00 AM - Verify All Phases

```bash
# Get complete health status
curl http://localhost:5000/api/phases/health

# Expected:
# {
#   "phase1": "ACTIVE",
#   "phase2": "ACTIVE",
#   "phase3": "ACTIVE",
#   "phase4": "ACTIVE"
# }
```

### 10:00 AM - Collect Metrics

```bash
# Get combined metrics
curl http://localhost:5000/api/phases/metrics > /tmp/metrics-final.json

# Extract key numbers
echo "=== FINAL PERFORMANCE METRICS ===" >> /root/deployment-report.txt
cat /tmp/metrics-final.json >> /root/deployment-report.txt

# Calculate total improvement
echo "Expected: 571x improvement (8.75ms response)" >> /root/deployment-report.txt
echo "Expected: 250k concurrent users" >> /root/deployment-report.txt
echo "Expected: Rp 91.25B annual savings" >> /root/deployment-report.txt
```

### 11:00 AM - Finalize

```bash
# Archive deployment logs
tar czf /root/deployment-$(date +%Y%m%d).tar.gz \
  /root/deployment-log.txt \
  /root/deployment-report.txt \
  /var/log/nginx/access.log

# Email report to stakeholders
# (Include: /root/deployment-report.txt)

# Update status page
echo "✅ All 4 phases active" > /var/www/status.txt
echo "Expected response time: 8.75ms" >> /var/www/status.txt
echo "Supported users: 250,000" >> /var/www/status.txt
```

---

## Rollback Procedure (If Issues)

### Quick Rollback (< 5 minutes)

```bash
# Option 1: Disable specific phase in .env
nano /root/arsipcloudflre/backend/.env

# Disable the problematic phase:
USE_IDEMPOTENCY_KEYS=false
# or
USE_REDIS_CACHE=false
# or
CLOUDFLARE_ENABLED=false

# Restart
pm2 restart arsip-backend
```

### Complete Rollback (Back to Phase 1)

```bash
# Revert code to last working commit
cd /root/arsipcloudflre
git reset --hard HEAD~1
cd backend
npm install
pm2 restart arsip-backend

# Verify
curl http://localhost:5000/api/health
```

---

## Monitoring Commands

```bash
# Real-time application logs
pm2 logs arsip-backend

# Monitor resources
pm2 monit

# Redis status
redis-cli info stats

# System resources
htop

# Check error rate
grep "error" /var/log/nginx/access.log | wc -l

# Performance metrics
curl http://localhost:5000/api/phases/metrics | jq '.'
```

---

## Success Indicators

✅ **Phase 2**: 5x mobile response time improvement  
✅ **Phase 3**: 100% duplicate prevention, stats showing in metrics  
✅ **Phase 4**: Response time <8.75ms, cache hit rate >70%  
✅ **All Phases**: 571x total improvement, no errors, stable resource usage  

---

## Contact & Escalation

If issues occur during activation:

1. **Check logs first**: `pm2 logs arsip-backend`
2. **Verify service**: `redis-cli ping`, `pm2 status`
3. **Rollback if needed**: Disable phase in .env and restart
4. **Escalate**: Contact deployment lead

---

## Timeline Summary

```
Tuesday 09:00    → Phase 2 ready for activation
Tuesday 12:00    → Phase 2 at 100% traffic (5x improvement verified)
Wednesday 09:00  → Phase 3 ready for activation
Wednesday 12:00  → Phase 3 at 100% coverage (duplicates prevented)
Thursday 09:00   → Phase 4 ready for activation
Thursday 12:00   → Phase 4 at 100% caching (8.75ms response)
Friday 09:00     → All phases active
Friday 12:00     → Final report generated
Friday 17:00     → Celebrate 571x improvement! 🎉
```

