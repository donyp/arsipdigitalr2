# Quick Deployment Checklist - Daily Token Removal

## Pre-Deployment (30 mins)
- [ ] All code changes committed locally
- [ ] Git logs show correct commit message
- [ ] Code pushed to remote repository
- [ ] Database backup taken (Supabase)
- [ ] PM2 configs reviewed
- [ ] Environment variables verified

## Deployment (15 mins)
- [ ] SSH to VPS: `ssh root@202.10.38.249`
- [ ] Navigate to project: `cd /root/arsipdigitalr2`
- [ ] Pull latest code: `git pull origin main`
- [ ] Install dependencies: `npm install`
- [ ] Stop server: `pm2 stop arsipdigital`
- [ ] Execute database migration (DROP daily_login_tokens table)
- [ ] Start server: `pm2 start ecosystem.config.js`
- [ ] Wait for initialization (15 seconds)

## Verification (30 mins)

### Server Health
- [ ] `curl http://localhost:5000/api/health` returns 200
- [ ] `pm2 status` shows arsipdigital online
- [ ] `pm2 logs arsipdigital | head -50` shows no errors
- [ ] Auth endpoints registered in logs

### API Testing
- [ ] Login endpoint works: `curl -X POST /api/auth/login`
- [ ] Invalid credentials rejected (401)
- [ ] Valid login returns JWT token
- [ ] `/api/auth/me` works with JWT token
- [ ] `/api/auth/verify-token` returns 404
- [ ] `/api/auth/resend-token` returns 404

### Frontend Testing
- [ ] Login page loads at https://arsipdigitalanka.my.id
- [ ] No token input field visible
- [ ] Login with valid credentials succeeds
- [ ] Dashboard loads correctly
- [ ] All features work (files, invoices, etc.)
- [ ] Logout works

### Security
- [ ] HTTPS certificate is valid
- [ ] JWT token is properly signed
- [ ] Protected endpoints require token
- [ ] Unauthorized requests return 401

### Logs
- [ ] No "undefined" errors
- [ ] No token-related error messages
- [ ] No database connection errors
- [ ] Performance is normal

## Rollback Plan (If Needed)
- [ ] Stop server: `pm2 stop arsipdigital`
- [ ] Revert code: `git reset --hard HEAD~1`
- [ ] Start server: `pm2 start ecosystem.config.js`
- [ ] Restore database backup if needed

## Post-Deployment (5 mins)
- [ ] Monitor logs for 5 minutes: `pm2 logs arsipdigital`
- [ ] Test key features one more time
- [ ] Document any issues
- [ ] Announce deployment completion

## Emergency Contacts
- Supabase Support: https://supabase.com/support
- VPS Provider: Rumahweb (if issues with server)
- Git Repository: [GitHub/GitLab link]

---

## Expected Results

✅ **Green Lights:**
- Server starts without errors
- Login works with username/password only
- JWT tokens are valid and authenticated
- All endpoints respond correctly
- Frontend loads and functions normally

❌ **Red Flags (Stop and Investigate):**
- Server fails to start
- Database connection errors
- Login endpoint returns error
- Old token endpoints still exist
- Unauthorized errors on protected endpoints
- Any "Cannot read property" errors

---

## Test Commands (Quick Reference)

```bash
# Server health
curl http://localhost:5000/api/health

# Test login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "doni", "password": "Password123!"}'

# Run automated tests
node backend/test-login-simplified.js
node backend/test-jwt-access.js

# Watch logs
pm2 logs arsipdigital --lines 100

# Check server status
pm2 status
pm2 monit
```

---

## Timeline Estimate
- Pre-Deployment: 30 minutes
- Deployment: 15 minutes
- Verification: 30 minutes
- **Total: ~75 minutes (1.25 hours)**

---

## Success Criteria
- ✅ Server online and responding
- ✅ Login flow working
- ✅ JWT authentication working
- ✅ No token-related endpoints accessible
- ✅ All frontend features working
- ✅ No errors in logs
- ✅ Performance stable

**Status: READY FOR DEPLOYMENT** ✅
