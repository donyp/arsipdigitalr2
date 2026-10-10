# Deployment Guide: Daily Token System Removal

## Overview
This guide covers deploying the cleaned codebase (with Daily Token system completely removed) to the VPS and verifying everything works without bugs.

**VPS Details:**
- IP: 202.10.38.249
- User: root
- Domain: arsipdigitalanka.my.id
- Service Manager: PM2
- Database: Supabase PostgreSQL
- Frontend: https://arsipdigitalanka.my.id

---

## Pre-Deployment Checklist

### Code Changes Summary
- ✅ Backend: Removed 17+ token service files
- ✅ Frontend: Removed token input UI, simplified login to username/password only
- ✅ Database: Created migration to drop daily_login_tokens table
- ✅ Environment: Removed ENABLE_DAILY_TOKEN_AUTH, ADMIN_TOKEN_EMAIL variables
- ✅ API: Simplified /api/auth/login endpoint (direct JWT return)

### Files Modified
```
backend/auth-endpoints.js       - Simplified login endpoint
backend/server.js               - Updated auth registration
backend/.env                    - Removed token auth vars
index.html                      - Removed token input form
js/sidebar.js                   - Removed token management menu
backend/DROP_DAILY_LOGIN_TOKENS_TABLE.sql - Migration file
```

### Verification Completed
- ✅ No remaining references to daily_login_tokens in production code
- ✅ No remaining references to ADMIN_TOKEN_EMAIL
- ✅ No remaining token endpoints or scheduled jobs
- ✅ Login flow simplified to username/password only
- ✅ JWT token generation working
- ✅ Old token endpoints removed (404)

---

## Step 1: Prepare Local Code

### 1.1 Verify all changes are committed
```bash
cd d:\DOWNLOAD\ARSIPHOSTING\arsipcloudflre

# Check git status
git status

# Should show:
# - Modified files listed above
# - No uncommitted changes in other files
```

### 1.2 Create deployment commit
```bash
# Stage all modified files
git add backend/auth-endpoints.js \
        backend/server.js \
        backend/.env \
        backend/DROP_DAILY_LOGIN_TOKENS_TABLE.sql \
        index.html \
        js/sidebar.js

# Create commit
git commit -m "feat: Remove Daily Token (2FA) system

- Simplified login to username/password only
- Removed token verification endpoints
- Removed token email notifications
- Removed token management UI
- Kept JWT token for API authentication
- Database migration to drop daily_login_tokens table

BREAKING CHANGE: Daily Token 2FA system completely removed.
Login now requires only username/password, returns JWT directly.
No more token email verification step."

# View commit
git log -1 --stat
```

### 1.3 Push to repository
```bash
# Push to origin (GitHub/GitLab)
git push origin main
# or
git push -u origin feature/remove-daily-token-system
```

---

## Step 2: Deploy to VPS

### 2.1 SSH to VPS
```bash
ssh root@202.10.38.249

# Navigate to project directory
cd /root/arsipdigitalr2

# Verify we're in the right place
ls -la | head -20
```

### 2.2 Pull latest code
```bash
# Show current commit
git log -1 --oneline

# Pull latest changes
git pull origin main

# Verify changes were pulled
git log -1 --stat

# Check modified files exist
ls -la backend/auth-endpoints.js
ls -la backend/DROP_DAILY_LOGIN_TOKENS_TABLE.sql
```

### 2.3 Update dependencies (if needed)
```bash
# Check for new dependencies
npm install

# Should show minimal output if no new deps
```

### 2.4 Stop running server
```bash
# Check if server is running
pm2 status

# Stop the app
pm2 stop arsipdigital

# Verify it's stopped
pm2 status
```

### 2.5 Execute database migration
```bash
# IMPORTANT: Back up database first!
# Contact your Supabase provider or take manual backup

# Option 1: Execute via Supabase SQL Editor (Recommended)
# 1. Go to https://app.supabase.com
# 2. Select your project
# 3. Go to SQL Editor
# 4. Paste contents of DROP_DAILY_LOGIN_TOKENS_TABLE.sql
# 5. Click "Run"
# 6. Verify success message

# Option 2: Execute via psql (Advanced)
psql -h db.supabase.co \
     -U postgres \
     -d postgres \
     -f /root/arsipdigitalr2/backend/DROP_DAILY_LOGIN_TOKENS_TABLE.sql

# Verify table is dropped
# In Supabase SQL Editor, run:
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'daily_login_tokens'
);
# Should return: false
```

### 2.6 Clean build cache (optional)
```bash
# Remove node_modules cache
rm -rf node_modules/.cache

# Clear PM2 logs
pm2 flush

# (Safe to skip if short on time)
```

### 2.7 Start server with new code
```bash
# Start the app
pm2 start ecosystem.config.js --name arsipdigital

# OR if using npm start
npm start &

# Monitor logs in real-time
pm2 logs arsipdigital --lines 100
```

### 2.8 Wait for server startup
```bash
# Check if server is running
pm2 status

# Should show: online

# Wait 10-15 seconds for full initialization
sleep 15

# Check logs for errors
pm2 logs arsipdigital --lines 50
```

---

## Step 3: Immediate Verification (VPS)

### 3.1 Check server health
```bash
# Local health check
curl http://localhost:5000/api/health

# Expected response:
# {"status":"ok"}
```

### 3.2 Check auth endpoints are registered
```bash
# Watch server logs for initialization
pm2 logs arsipdigital --lines 50 | grep -E "Auth|INIT|register"

# Should see:
# [INIT] ✅ Authentication endpoints registered
```

### 3.3 Check no token-related errors
```bash
# Look for token errors
pm2 logs arsipdigital --lines 100 | grep -E "token|Token|ERROR|error"

# Should NOT see token-related errors
```

### 3.4 Check SSL certificate is still valid
```bash
# Verify HTTPS is working
curl -v https://arsipdigitalanka.my.id/api/health 2>&1 | grep "SSL\|TLS\|subject="

# Should show valid certificate info
```

---

## Step 4: Test Login Flow (VPS)

### 4.1 Test login endpoint directly
```bash
# From VPS terminal
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "doni", "password": "Password123!"}'

# Expected response (success):
# {"success":true,"message":"Login berhasil","token":"eyJ...","user":{...}}

# If error: Check server logs
pm2 logs arsipdigital --lines 50
```

### 4.2 Test with wrong credentials
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "invalid", "password": "wrong"}'

# Expected response (401):
# {"success":false,"error":"Username atau password salah"}
```

### 4.3 Run automated test
```bash
# From project root
node backend/test-login-simplified.js

# Expected output:
# ✅ Passed: 9
# ❌ Failed: 0
# 🎉 All tests passed! Login flow is working correctly.
```

### 4.4 Run JWT access test
```bash
# From project root
node backend/test-jwt-access.js

# Expected output:
# ✅ Passed: 10
# ❌ Failed: 0
# 🎉 All JWT access tests passed!
```

---

## Step 5: Test Frontend (Browser)

### 5.1 Clear browser cache
```bash
# Open browser dev tools (F12)
# Go to Application tab
# Clear localStorage
# Clear cookies
# Close and reopen browser
```

### 5.2 Test login page
```
1. Navigate to https://arsipdigitalanka.my.id
2. Verify login page appears
3. Check that:
   - Username field is present
   - Password field is present
   - NO token input field visible
   - NO "Resend token" button visible
   - Login button says "Masuk"
```

### 5.3 Test successful login
```
1. Enter valid credentials (doni / Password123!)
2. Click "Masuk" button
3. Verify:
   - No token verification form appears
   - Success message shows (optional)
   - Redirected to dashboard
   - Dashboard loads with user data
4. Check localStorage in DevTools:
   - jwt_token should exist
   - user_info should exist
   - No token-related keys
```

### 5.4 Test failed login
```
1. Enter invalid credentials
2. Click "Masuk" button
3. Verify error message appears
4. Check error is: "Username atau password salah"
```

### 5.5 Test API access from dashboard
```
1. Login successfully
2. Navigate to Files/Invoices/etc.
3. Verify data loads
4. Check DevTools Network tab:
   - Authorization header includes Bearer token
   - API requests succeed (200)
   - No 401 errors
```

### 5.6 Test logout
```
1. Click logout/profile menu
2. Click logout option
3. Verify redirected to login page
4. Check localStorage is cleared:
   - jwt_token removed
   - user_info removed
```

---

## Step 6: Production Smoke Tests

### 6.1 File operations
```
1. Upload a test file
2. Verify file appears in file list
3. Download the file
4. Delete the file
5. Verify file is removed from list
```

### 6.2 Invoice operations
```
1. Navigate to invoices
2. Verify invoice list loads
3. Filter/search invoices
4. Open invoice detail
5. Check all data displays correctly
```

### 6.3 Dashboard features
```
1. Check dashboard widgets load
2. Verify statistics display
3. Check recent activity
4. Navigate to different sections
```

### 6.4 API direct testing (from another machine)
```bash
# From local machine, test VPS endpoints
curl -X POST https://arsipdigitalanka.my.id/api/auth/login \
  -H "Content-Type: application/json" \
  -H "User-Agent: TestClient" \
  -d '{"username": "doni", "password": "Password123!"}'

# Should get valid JWT token response
```

---

## Step 7: Monitor for Issues

### 7.1 Watch server logs continuously
```bash
# On VPS, in separate terminal
pm2 logs arsipdigital --lines 200
```

### 7.2 Check for errors in real-time
```bash
# Watch for any errors
pm2 logs arsipdigital --lines 100 | grep -i "error\|fail\|cannot\|undefined"

# Should return minimal output
```

### 7.3 Check system resources
```bash
# Monitor CPU and memory
pm2 monit

# Should show normal resource usage
```

### 7.4 Check Supabase connection
```bash
# In server logs, look for:
# [DB] Connected to Supabase
# [Auth] Database connection active

# Should show database is connected
```

---

## Step 8: Verify Removed Components

### 8.1 Verify old endpoints return 404
```bash
curl -X POST https://arsipdigitalanka.my.id/api/auth/verify-token \
  -H "Content-Type: application/json" \
  -d '{"tempToken": "test", "token": "12345"}'

# Expected: 404 Not Found
```

```bash
curl -X POST https://arsipdigitalanka.my.id/api/auth/resend-token \
  -H "Content-Type: application/json" \
  -d '{"tempToken": "test"}'

# Expected: 404 Not Found
```

### 8.2 Verify token management page is gone
```bash
curl https://arsipdigitalanka.my.id/token-management.html

# Expected: 404 Not Found
```

### 8.3 Verify no token-related data in localStorage
```bash
# Open browser DevTools
# Application → Local Storage → arsipdigitalanka.my.id
# Should NOT contain:
# - tempToken
# - tokenEmail
# - tokenAttempts
# - tokenForm*
# - ENABLE_DAILY_TOKEN_AUTH

# SHOULD contain:
# - jwt_token
# - user_info
```

---

## Step 9: Rollback Plan (If Issues Found)

### 9.1 If critical error during startup
```bash
# Stop server
pm2 stop arsipdigital

# Revert to previous commit
git reset --hard HEAD~1
git pull origin main

# Restart server with old code
pm2 start ecosystem.config.js --name arsipdigital

# Verify old code is running
pm2 logs arsipdigital --lines 50
```

### 9.2 If database migration failed
```bash
# Contact Supabase support or:
# 1. Restore database from backup
# 2. Revert code changes
# 3. Restart server

# Or keep current code but don't drop table:
# Just continue running with daily_login_tokens table unused
```

### 9.3 If login not working
```bash
# Check auth-endpoints.js is properly loaded
pm2 logs arsipdigital --lines 100 | grep -i "auth\|endpoint"

# Check JWT_SECRET is set
echo $JWT_SECRET

# Restart server
pm2 restart arsipdigital
```

---

## Step 10: Final Verification Checklist

### Functionality
- [ ] Login page loads without token field
- [ ] Login with valid credentials succeeds
- [ ] Login with invalid credentials fails
- [ ] Dashboard loads after successful login
- [ ] All features work (files, invoices, etc.)
- [ ] Logout clears authentication
- [ ] Protected endpoints require JWT token

### API
- [ ] /api/auth/login works (username/password → JWT)
- [ ] /api/auth/me works (requires JWT token)
- [ ] /api/auth/verify-token returns 404
- [ ] /api/auth/resend-token returns 404
- [ ] All protected endpoints require Authorization header

### Security
- [ ] HTTPS is active and valid
- [ ] JWT token is properly signed
- [ ] Token includes all required claims
- [ ] Unauthorized requests return 401
- [ ] Invalid tokens are rejected
- [ ] Role-based permissions work

### Performance
- [ ] Server responds quickly to requests
- [ ] No memory leaks (PM2 monit stable)
- [ ] No CPU spikes
- [ ] Database queries complete quickly

### Logging
- [ ] Server logs show successful startup
- [ ] No token-related error messages
- [ ] No undefined variable errors
- [ ] No "Cannot read property of undefined" errors
- [ ] Database queries log successfully

---

## Success Criteria

✅ **Deployment Successful if:**
1. Server starts without errors
2. Login works with username/password only
3. JWT tokens are issued and validated
4. All protected endpoints accessible with JWT
5. Old token endpoints return 404
6. Token management page is gone
7. Frontend shows no token input field
8. Dashboard and all features work
9. No errors in logs
10. Performance is stable

---

## Troubleshooting

### Issue: Login returns 404
**Check:**
- Auth endpoint is registered: `pm2 logs | grep -i "auth"`
- auth-endpoints.js exists: `ls -la backend/auth-endpoints.js`
- server.js imports it: `grep -n "auth-endpoints" backend/server.js`

**Fix:**
- Restart server: `pm2 restart arsipdigital`
- Check logs: `pm2 logs arsipdigital -200`

### Issue: Login returns "Username atau password salah"
**Check:**
- User exists in database
- Password is correct
- Password hash is valid (bcrypt format)

**Fix:**
- Verify user: `SELECT * FROM users WHERE username='doni';`
- Reset password if needed

### Issue: JWT token not working for protected endpoints
**Check:**
- JWT_SECRET environment variable is set
- Token is being passed in Authorization header
- Bearer prefix is correct

**Fix:**
- Verify JWT_SECRET: `echo $JWT_SECRET`
- Check header format: `curl -H "Authorization: Bearer TOKEN" ...`

### Issue: 503 Service Unavailable
**Check:**
- Server is running: `pm2 status`
- Check logs for startup errors: `pm2 logs -n 200`
- Database connection: `pm2 logs | grep -i "database\|supabase"`

**Fix:**
- Restart server: `pm2 restart arsipdigital`
- Check environment variables: `env | grep -E "JWT|SUPABASE"`

---

## Post-Deployment

### 1. Update documentation
- [ ] Update README.md (remove Daily Token references)
- [ ] Update API documentation (new login flow)
- [ ] Update deployment guides

### 2. Monitor for 24 hours
- [ ] Watch server logs for errors
- [ ] Monitor resource usage
- [ ] Track user login success/failures
- [ ] Note any issues in #general channel

### 3. Announce changes to users (if applicable)
- [ ] Notify that login flow changed (simpler now)
- [ ] Mention no more token email step
- [ ] Provide new login instructions if needed

### 4. Schedule cleanup tasks
- [ ] Archive old token system documentation
- [ ] Delete deprecated test scripts from VPS
- [ ] Clean up old database backups (with token table)

---

## Success Report Template

```
✅ DEPLOYMENT COMPLETE: Daily Token System Removal

Date: [YYYY-MM-DD]
Time: [HH:MM UTC]
Deployed by: [Name]

Changes:
- Removed 17 token-related files ✅
- Simplified login to username/password ✅
- Removed token endpoints (/verify-token, /resend-token) ✅
- Removed token management UI ✅
- Dropped daily_login_tokens table ✅

Tests Passed:
- Login flow test: ✅
- JWT access test: ✅
- Frontend smoke test: ✅
- API health check: ✅

Status: PRODUCTION READY ✅

Notes:
[Any issues encountered and how they were resolved]
[Performance observations]
[Anything requiring follow-up]
```

---

## Additional Resources

- Test Login Flow: `TEST_LOGIN_FLOW.md`
- Test JWT Access: `TEST_JWT_ACCESS.md`
- Test Script (Automated): `backend/test-login-simplified.js`
- JWT Test Script: `backend/test-jwt-access.js`
- Database Migration: `backend/DROP_DAILY_LOGIN_TOKENS_TABLE.sql`

---

**Deployment Guide Complete!** 🚀

Once all steps are verified, the Daily Token system removal is complete and the application is ready for production use with the simplified username/password authentication.
