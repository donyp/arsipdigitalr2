# 🔧 INTEGRATION GUIDE: Add Monitoring to server.js

## STEP 1: Add Imports (setelah line ~135, sebelum `const app = express()`)

Cari bagian ini di server.js:
```javascript
// Initialize Secret Manager client (if on Cloud Run)
initializeSecretManager();

const app = express();
```

Tambahkan code berikut SEBELUM `const app = express();`:

```javascript
// ============================================================
// INFRASTRUCTURE MONITORING & FEATURE FLAGS (NEW)
// ============================================================

const QueryOptimizer = require('./query-optimizer');
const featureFlags = require('./feature-flags');
const PerformanceMonitor = require('./performance-monitor');
const registerMonitoringEndpoints = require('./monitoring-endpoints');

// Initialize performance monitor
const performanceMonitor = new PerformanceMonitor({
    responseTimeP99: 500,  // Alert if P99 > 500ms
    errorRate: 0.01,       // Alert if error rate > 1%
    cacheHitRate: 0.80,    // Alert if cache hit rate < 80%
    queryCount: 5          // Alert if avg queries > 5
});

// Initialize query optimizer
const queryOptimizer = new QueryOptimizer(supabase);

console.log('[BOOT] ✅ Performance monitoring initialized');
console.log('[BOOT] ✅ Feature flags initialized');
console.log('[BOOT] ✅ Query optimizer ready');
```

---

## STEP 2: Add Request Timing Middleware (setelah line ~240, setelah CORS config)

Cari bagian ini di server.js:
```javascript
app.use(cors(corsOptions));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
```

Tambahkan code berikut SETELAH express middleware setup:

```javascript
// ============================================================
// REQUEST TIMING MIDDLEWARE (for performance tracking) (NEW)
// ============================================================

app.use((req, res, next) => {
    const startTime = Date.now();

    // Intercept response
    const originalJson = res.json;
    res.json = function(data) {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        let queryCount = 0;

        // Get query count from request context (if available)
        if (req.queryCount) {
            queryCount = req.queryCount;
        }

        // Record metrics
        performanceMonitor.recordRequest(req.path, duration, statusCode, queryCount);

        // Log slow requests
        if (duration > 500) {
            console.log(`[SLOW] ${req.method} ${req.path} took ${duration}ms`);
        }

        // Call original json
        return originalJson.call(this, data);
    };

    next();
});
```

---

## STEP 3: Register Monitoring Endpoints (setelah Express middleware, sebelum route endpoints)

Cari bagian ini (biasanya di akhir middleware setup):
```javascript
// ============================================================
// Request Timeout Middleware
// ============================================================
app.use((req, res, next) => {
    const timeout = req.path.includes('/api/invoice/rename') ? 120000 : 60000;
    // ...
});
```

Tambahkan code berikut SETELAH timeout middleware:

```javascript
// ============================================================
// REGISTER MONITORING ENDPOINTS (NEW)
// ============================================================

registerMonitoringEndpoints(app, performanceMonitor);

console.log('[BOOT] ✅ Monitoring endpoints registered');
console.log('[BOOT] ✅ Dashboard available at: /monitoring.html');
```

---

## STEP 4: Update Invoice Endpoints (invoice-endpoints.js)

Cari function `batchSyncAllFileCount` di invoice-endpoints.js (line ~74)

Ubah endpoint yang memanggil function ini:

### BEFORE:
```javascript
app.get('/api/invoice/batch-sync', async (req, res) => {
    try {
        const result = await batchSyncAllFileCount(supabase);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

### AFTER:
```javascript
app.get('/api/invoice/batch-sync', async (req, res) => {
    try {
        const useOptimized = featureFlags.isEnabled('USE_OPTIMIZED_QUERIES', req.user?.id);
        
        let result;
        if (useOptimized) {
            console.log('[API] Using optimized batch sync (75x improvement!)');
            result = await queryOptimizer.batchSyncFileCountsOptimized(supabase);
        } else {
            console.log('[API] Using legacy batch sync (fallback)');
            result = await batchSyncAllFileCount(supabase);  // Old function
        }
        
        req.queryCount = result.queriesExecuted || 0;
        res.json(result);
    } catch (error) {
        console.error('[API] Batch sync error:', error.message);
        res.status(500).json({ error: error.message });
    }
});
```

---

## STEP 5: Add .env Variables

Buka `.env` file dan tambahkan:

```bash
# ============================================================
# INFRASTRUCTURE OPTIMIZATION
# ============================================================

# Feature Flags
USE_OPTIMIZED_QUERIES=false           # Start with OFF (safe)
QUERY_OPTIMIZATION_ROLLOUT=0          # Start at 0% (gradual)

USE_REDIS_CACHE=false                 # Enabled in Phase 4
CACHE_ROLLOUT=0

USE_IDEMPOTENCY_KEYS=false            # Enabled in Phase 3
IDEMPOTENCY_ROLLOUT=0

# Monitoring
PERFORMANCE_MONITOR_ENABLED=true
RESPONSE_TIME_P99_THRESHOLD=500       # Alert if P99 > 500ms
ERROR_RATE_THRESHOLD=0.01             # Alert if > 1%
CACHE_HIT_RATE_THRESHOLD=0.80         # Alert if < 80%
QUERY_COUNT_THRESHOLD=5               # Alert if > 5
```

---

## STEP 6: Verify Integration

### Run Tests
```bash
npm test -- backend/query-optimizer.test.js

# Expected: 12/12 tests pass ✅
```

### Check Linting
```bash
npm run lint backend/query-optimizer.js backend/feature-flags.js

# Expected: No errors ✅
```

### Test Locally
```bash
npm start

# Expected: Should see:
# [BOOT] ✅ Performance monitoring initialized
# [BOOT] ✅ Feature flags initialized
# [BOOT] ✅ Query optimizer ready
# [BOOT] ✅ Monitoring endpoints registered
# [BOOT] ✅ Dashboard available at: /monitoring.html
```

### Verify Endpoints
```bash
# Check health
curl http://localhost:5000/health

# Check monitoring dashboard
curl http://localhost:5000/api/monitoring/health | jq .

# Check feature flags
curl http://localhost:5000/api/features | jq .flags
```

### Open Dashboard
```
URL: http://localhost:5000/monitoring.html
Expected: Live metrics displayed
```

---

## FILE CHECKLIST

Sebelum deployment, pastikan files sudah ada:

```
✅ backend/query-optimizer.js
✅ backend/feature-flags.js
✅ backend/performance-monitor.js
✅ backend/monitoring-endpoints.js
✅ backend/query-optimizer.test.js
✅ monitoring.html
```

Dan integrations di:
```
✅ backend/server.js (3 sections added)
✅ backend/.env (variables added)
✅ backend/invoice-endpoints.js (endpoint updated)
```

---

## DEPLOYMENT CHECKLIST

### Pre-Staging
- [ ] All code changes integrated
- [ ] Tests passing (12/12)
- [ ] Linting clean
- [ ] Monitoring endpoints accessible
- [ ] Dashboard loads at http://localhost:5000/monitoring.html

### Staging Deployment
- [ ] Deploy with USE_OPTIMIZED_QUERIES=false
- [ ] Verify health: GET /api/monitoring/health
- [ ] Verify dashboard loads
- [ ] Collect baseline metrics
- [ ] Enable 10% rollout via API
- [ ] Monitor 4 hours
- [ ] Increase to 50%, monitor 4 hours
- [ ] Increase to 100%, monitor 24 hours

### Production Deployment
- [ ] Same as staging
- [ ] Keep on-call engineer watching dashboard
- [ ] Monitor 24 hours

---

## QUICK TROUBLESHOOTING

### Error: Cannot find module 'query-optimizer'
```
Solution: Make sure files copied to backend/ directory
Check: ls -la backend/query-optimizer.js
```

### Error: PerformanceMonitor is not a constructor
```
Solution: Check import path is correct
Fix: const PerformanceMonitor = require('./performance-monitor');
```

### Dashboard won't load
```
Solution: Check monitoring endpoints registered
Run: curl http://localhost:5000/api/monitoring/health
```

### Metrics not updating
```
Solution: Check auto-refresh enabled in dashboard
Or: Press "🔄 Refresh Now" button manually
```

---

## SUCCESS CRITERIA

After integration, you should see:

1. ✅ No new errors on startup
2. ✅ Monitoring endpoints available
3. ✅ Dashboard loads and shows metrics
4. ✅ Feature flags accessible via API
5. ✅ Request timing logged
6. ✅ Tests passing

If all above ✅, ready for Jumat deployment!

---

**Integration complete? Ready for Jumat?** 🚀
