# 🔒 SECURITY FIXES IMPLEMENTATION GUIDE
## Arsip Digital ANKA - Critical to Medium Priority Fixes

**Timeline**: Implementation should start TODAY for critical issues

---

## 🔴 CRITICAL FIX #1: Remove Hardcoded Secrets from Git

### Problem
Supabase service role keys exposed in repository files:
- `backend/full-cleanup.js`
- `backend/update_db_role_constraint.js`  
- `backend/clear-invoice-data.js`

### Immediate Action (DO THIS FIRST)

```bash
# 1. Navigate to repository
cd ~/apps/arsipdigitalr2

# 2. Check for exposed keys (scan output carefully)
grep -r "SUPABASE_KEY\|SUPABASE_SERVICE_ROLE_KEY\|SERVICE_ROLE" backend/*.js | grep -v ".env\|node_modules"

# 3. Check git history for these files
git log --oneline backend/full-cleanup.js backend/update_db_role_constraint.js backend/clear-invoice-data.js

# 4. BACKUP current branch (IMPORTANT!)
git branch backup-before-history-rewrite-$(date +%s)

# 5. Remove files from current working directory
rm backend/full-cleanup.js backend/update_db_role_constraint.js backend/clear-invoice-data.js

# 6. Remove from git history using filter-branch
git filter-branch --tree-filter '
    rm -f backend/full-cleanup.js
    rm -f backend/update_db_role_constraint.js
    rm -f backend/clear-invoice-data.js
' -- --all

# 7. Verify files are gone from history
git log --all --full-history -- backend/full-cleanup.js | wc -l  # Should be 0 after rewrite

# 8. Force push (ONLY if confident!)
git push origin master --force-with-lease

# 9. Verify on GitHub
# Go to https://github.com/donyp/arsipdigitalr2 → check files no longer in history
```

### Supabase Key Rotation (CRITICAL)

```bash
# 1. Login to Supabase Console
# Project: https://supabase.com/dashboard/project/ehdqcxzdmmcwbdwkinyr

# 2. Go to Settings → API
# 3. Click "Rotate" next to Service Role Key
# 4. Copy new key

# 5. Update .env on VPS
ssh deploy@your-vps-ip

nano backend/.env
# Update: SUPABASE_SERVICE_ROLE_KEY=<new-key-here>
# Save: Ctrl+X, Y, Enter

# 6. Restart backend
pm2 restart arsip-backend

# 7. Verify new key is active
pm2 logs arsip-backend --lines 20 | grep "Supabase\|Connected"

# 8. Test authentication still works
curl -X POST https://api.arsipdigitalanka.cloud/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass"}'
```

### Update .gitignore (Prevent Future Exposure)

```bash
# 1. Edit .gitignore
echo "
# Secrets & Config
backend/.env
backend/*.env
backend/*.env.*
backend/*-cleanup.js
backend/update_*.js
backend/delete_*.js
backend/clear_*.js
" >> .gitignore

# 2. Commit changes
git add .gitignore
git commit -m "Add secrets exclusion to .gitignore (security)"
git push origin master
```

### Enable GitHub Secret Scanning

1. Go to GitHub → Settings → Security & analysis
2. Enable "Secret scanning" (alerts when secrets detected)
3. Enable "Push protection" (blocks commits with secrets)

**Timeline**: COMPLETE TODAY

---

## 🔴 CRITICAL FIX #2: Zone Traversal Vulnerability

### Problem
Admin_zona users can potentially access other zones by supplying `zona_id` query param.

### Fix: Implement Zone Enforcement Middleware

**File**: `backend/middleware/zone-enforcement.js`

```javascript
/**
 * Zone Enforcement Middleware
 * Ensures admin_zona users cannot access other zones
 * Forces zona_id to user's zona on all requests
 */

module.exports = function zoneEnforcement(req, res, next) {
    // Bypass for super_admin and moderator
    if (req.user?.role === 'super_admin' || req.user?.role === 'moderator') {
        return next();
    }

    // Enforce zona for admin_zona users
    if (req.user?.role === 'admin_zona' && req.user?.zona_id) {
        const userZonaId = parseInt(req.user.zona_id);
        
        // Check if client supplied different zona_id
        const requestedZona = req.query.zona_id || req.body?.zona_id || req.params?.zona_id;
        if (requestedZona && parseInt(requestedZona) !== userZonaId) {
            console.log(`[Zone Enforcement] BLOCKED: User ${req.user.userId} (zona ${userZonaId}) tried to access zona ${requestedZona}`);
            return res.status(403).json({
                error: 'Akses ditolak: Anda tidak memiliki izin untuk mengakses zona ini.'
            });
        }
        
        // Force zona_id to user's zona on all requests
        req.query.zona_id = userZonaId;
        if (req.body) req.body.zona_id = userZonaId;
        if (req.params) req.params.zona_id = userZonaId;
        
        console.log(`[Zone Enforcement] Enforced zona ${userZonaId} for user ${req.user.userId}`);
    }
    
    next();
};
```

**File**: `backend/server.js` - Add to middleware stack

```javascript
// After authenticateToken middleware (around line 1820)
const zoneEnforcement = require('./middleware/zone-enforcement');

// Apply zone enforcement to ALL invoice and data endpoints
app.use('/api/invoice/', zoneEnforcement);
app.use('/api/support/', zoneEnforcement);
app.use('/api/announcements/', zoneEnforcement);
app.use('/api/download/', zoneEnforcement);

console.log('[Security] Zone enforcement middleware registered');
```

### Test the Fix

```bash
# 1. Add zone enforcement tests (already in __tests__/zones.test.js)

# 2. Run tests
npm test -- zones.test.js

# 3. Manual test:
# Login as admin_zona user (zona_id=1)
curl -X GET "http://localhost:5000/api/invoice/list?zona_id=2" \
  -H "Authorization: Bearer <admin-zona-1-token>"

# Should return 403 Akses ditolak
```

**Timeline**: COMPLETE TODAY (after secret removal)

---

## 🟠 HIGH FIX #1: Universal Input Validation

### Problem
Input validation not applied to all endpoints. Vulnerable to injection attacks.

### Solution: Create Universal Validation Middleware

**File**: `backend/middleware/universal-input-validation.js`

```javascript
/**
 * Universal Input Validation Middleware
 * Sanitizes all user input across all endpoints
 */

const {
    sanitizeString,
    validateZonaId,
    validateDate,
    validatePagination,
    validateCategory,
    sanitizeFilename
} = require('../input-validators');

module.exports = function universalInputValidation(req, res, next) {
    try {
        // Sanitize query parameters
        if (req.query) {
            Object.keys(req.query).forEach(key => {
                if (typeof req.query[key] === 'string') {
                    req.query[key] = sanitizeString(req.query[key], 500);
                }
            });
            
            // Specific validations
            if (req.query.zona_id) req.query.zona_id = validateZonaId(req.query.zona_id);
            if (req.query.date_from) req.query.date_from = validateDate(req.query.date_from);
            if (req.query.date_to) req.query.date_to = validateDate(req.query.date_to);
            if (req.query.category) req.query.category = validateCategory(req.query.category);
            
            // Pagination
            if (req.query.limit || req.query.offset) {
                const { limit, offset } = validatePagination(req.query.limit, req.query.offset);
                req.query.limit = limit;
                req.query.offset = offset;
            }
        }
        
        // Sanitize request body
        if (req.body && typeof req.body === 'object') {
            Object.keys(req.body).forEach(key => {
                if (typeof req.body[key] === 'string') {
                    req.body[key] = sanitizeString(req.body[key], 1000);
                }
            });
        }
        
        // Sanitize path parameters
        if (req.params) {
            Object.keys(req.params).forEach(key => {
                if (typeof req.params[key] === 'string') {
                    req.params[key] = sanitizeString(req.params[key], 500);
                }
            });
        }
        
        next();
    } catch (error) {
        console.error('[Input Validation] Error:', error.message);
        res.status(400).json({ error: 'Invalid input format' });
    }
};
```

**File**: `backend/server.js` - Register middleware

```javascript
// After CORS middleware (around line 1810)
const universalInputValidation = require('./middleware/universal-input-validation');

// Apply to ALL API endpoints
app.use('/api/', universalInputValidation);

console.log('[Security] Universal input validation middleware registered');
```

**Timeline**: COMPLETE THIS WEEK (2-3 hours)

---

## 🟠 HIGH FIX #2: Create Test Suite

### Setup Jest Testing Framework

```bash
# 1. Install dependencies
npm install --save-dev jest supertest dotenv

# 2. Create jest.config.js
cat > jest.config.js << 'EOF'
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    testTimeout: 10000,
    collectCoverageFrom: [
        'backend/**/*.js',
        '!backend/node_modules/**',
        '!**/__tests__/**'
    ],
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50
        }
    }
};
EOF

# 3. Update package.json scripts
cat >> package.json << 'EOF'
{
  "scripts": {
    "test": "jest --testTimeout=10000",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:auth": "jest __tests__/auth.test.js",
    "test:zones": "jest __tests__/zones.test.js",
    "test:files": "jest __tests__/files.test.js"
  }
}
EOF

# 4. Setup test environment
cp backend/.env.example backend/.env.test
# Edit backend/.env.test with test-specific values

# 5. Run tests
npm test

# 6. Check coverage
npm run test:coverage
```

### Test Files Already Created
- `backend/__tests__/auth.test.js` — Authentication tests
- `backend/__tests__/zones.test.js` — Zone isolation tests
- TODO: `backend/__tests__/files.test.js` — File upload security tests
- TODO: `backend/__tests__/validation.test.js` — Input validation tests

**Timeline**: COMPLETE THIS WEEK (3-4 hours)

---

## 🟡 MEDIUM FIX #1: Comprehensive Error Handling

### Problem
Stack traces and error details leaked to clients.

**File**: `backend/middleware/error-handler.js`

```javascript
/**
 * Comprehensive Error Handler Middleware
 * Sanitizes errors before sending to client
 */

module.exports = function errorHandler(err, req, res, next) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const statusCode = err.statusCode || err.status || 500;

    // Log full error on server (for debugging)
    console.error('[ERROR]', {
        timestamp: new Date().toISOString(),
        statusCode,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        error: {
            message: err.message,
            stack: err.stack,
            code: err.code
        }
    });

    // Sanitized response to client
    const clientResponse = {
        error: isDevelopment ? err.message : 'An error occurred',
        statusCode,
        timestamp: new Date().toISOString()
    };

    // Include stack trace only in development
    if (isDevelopment && err.stack) {
        clientResponse.stack = err.stack.split('\n');
    }

    // Include specific error code for debugging (safe)
    if (err.code && isDevelopment) {
        clientResponse.code = err.code;
    }

    res.status(statusCode).json(clientResponse);
};
```

**Register in server.js**:

```javascript
// At very end of middleware stack (after all routes)
const errorHandler = require('./middleware/error-handler');
app.use(errorHandler);
```

**Timeline**: COMPLETE THIS WEEK (1-2 hours)

---

## 🟡 MEDIUM FIX #2: Integrate DDoS Protection

### Problem
DDoS protection classes defined but not activated.

**File**: `backend/middleware/ddos-middleware.js`

```javascript
/**
 * DDoS Protection Middleware
 * Integrates BotDetector, IPBlocker, CircuitBreaker, DDoSDetector
 */

const { BotDetector, IPBlocker, CircuitBreaker, DDoSDetector } = require('../ddos-protection');

// Initialize protections
const botDetector = new BotDetector();
const ipBlocker = new IPBlocker();
const circuitBreaker = new CircuitBreaker({ cpuThreshold: 80, memoryThreshold: 85 });
const ddosDetector = new DDoSDetector({ volumetricThreshold: 100 });

module.exports = async (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    try {
        // 1. Check circuit breaker (server overload protection)
        if (!circuitBreaker.check()) {
            console.warn(`[CircuitBreaker] Server overloaded, rejecting request from ${clientIp}`);
            return res.status(503).json({ error: 'Server overloaded, please try again later' });
        }

        // 2. Check IP whitelist/blacklist
        const isWhitelisted = await ipBlocker.isWhitelisted(clientIp);
        if (isWhitelisted) {
            return next(); // Bypass all checks for whitelisted IPs
        }

        const blacklistStatus = await ipBlocker.isBlacklisted(clientIp);
        if (blacklistStatus.blocked) {
            console.warn(`[IPBlocker] Blocked IP ${clientIp}: ${blacklistStatus.reason}`);
            return res.status(429).json({ error: 'Too many requests, please try again later' });
        }

        // 3. Calculate bot score
        const botScore = botDetector.calculateBotScore(req);
        const riskLevel = botDetector.getRiskLevel(botScore);
        
        if (botScore > 80) {
            console.error(`[BotDetector] CRITICAL: Possible bot detected from ${clientIp} (score: ${botScore})`);
            await ipBlocker.addToBlacklist(clientIp, `bot_detected_score_${botScore}`, 3600);
            return res.status(403).json({ error: 'Suspicious activity detected' });
        }

        if (botScore > 60) {
            console.warn(`[BotDetector] HIGH: Suspicious activity from ${clientIp} (score: ${botScore})`);
            await ipBlocker.incrementSuspicion(clientIp, botScore);
        }

        // 4. Record request for DDoS detection
        ddosDetector.recordRequest(clientIp, req.path);

        // 5. Attach security info to request for logging
        req.security = {
            clientIp,
            botScore,
            riskLevel
        };

        next();
    } catch (error) {
        console.error('[DDoS Middleware] Error:', error.message);
        next(error); // Pass to error handler
    }
};
```

**Register in server.js**:

```javascript
// After CORS, before other middleware
const ddosMiddleware = require('./middleware/ddos-middleware');
app.use('/api/', ddosMiddleware);

console.log('[Security] DDoS protection middleware integrated');
```

**Provide Admin Dashboard to Monitor**:

```javascript
// Add this endpoint for moderators to view DDoS status
app.get('/api/admin/ddos-status', authenticateToken, authorizeRole('moderator', 'super_admin'), async (req, res) => {
    const blacklist = await ipBlocker.getBlacklist();
    const cbStatus = circuitBreaker.getStatus();
    
    res.json({
        circuitBreaker: cbStatus,
        blacklistedIps: blacklist,
        timestamp: new Date().toISOString()
    });
});
```

**Timeline**: COMPLETE NEXT WEEK (2-3 hours)

---

## DEPLOYMENT CHECKLIST

Before deploying to production:

```bash
[ ] Secret removal from Git completed
[ ] Supabase keys rotated
[ ] Zone enforcement middleware added and tested
[ ] Universal input validation middleware added
[ ] Error handler middleware added
[ ] DDoS protection integrated
[ ] Unit tests passing (npm test)
[ ] Zone isolation tests passing (npm test:zones)
[ ] No hardcoded secrets remaining (grep scan)
[ ] .gitignore updated with secret patterns
[ ] GitHub secret scanning enabled
[ ] Rate limiting configured per-endpoint
[ ] HTTPS enforcement verified
[ ] CORS whitelist verified for production
[ ] LOG_LEVEL set to 'error' for production
```

### Deploy to VPS

```bash
# 1. Pull changes
cd ~/apps/arsipdigitalr2
git pull origin master

# 2. Install new dependencies
npm install

# 3. Run tests
npm test

# 4. Backup current deployment
pm2 backup

# 5. Restart backend
pm2 restart arsip-backend

# 6. Verify startup
pm2 logs arsip-backend --lines 50

# 7. Run smoke tests
curl https://api.arsipdigitalanka.cloud/api/invoice/health
curl -X POST https://api.arsipdigitalanka.cloud/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"test"}'
```

---

## TIMELINE SUMMARY

| Priority | Task | Days | Start | Complete |
|----------|------|------|-------|----------|
| 🔴 CRITICAL | Remove secrets + rotate keys | 0.5 | TODAY | TODAY |
| 🔴 CRITICAL | Zone enforcement middleware | 0.5 | TODAY | TODAY |
| 🟠 HIGH | Universal input validation | 1 | TODAY | TOMORROW |
| 🟠 HIGH | Setup test suite + tests | 2 | TOMORROW | WED |
| 🟡 MEDIUM | Error handler middleware | 0.5 | WED | WED |
| 🟡 MEDIUM | DDoS protection integration | 1 | THU | FRI |
| - | **TOTAL** | **5.5 days** | **TODAY** | **NEXT FRI** |

---

**Questions?** Review the Security Audit Report for full details.
