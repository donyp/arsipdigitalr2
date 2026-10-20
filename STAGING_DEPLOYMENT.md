# Staging Deployment - Phase 1 Fixes

**Commit**: `9ab6160`  
**Date**: October 15, 2026  
**Status**: Ready to deploy

---

## 1. Pull Latest Code

```bash
cd /var/www/arsip-digital
git pull origin master
```

---

## 2. Verify Fixes Applied

```bash
cd backend
git log --oneline -5
# Should show: 9ab6160 Fix critical database and invoice test errors
```

---

## 3. Set Supabase Credentials

Edit `.env`:
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## 4. Run Tests (Optional - verify fixes work)

```bash
npm test
# Tests will pass if Supabase credentials valid
```

---

## 5. Start/Restart Application

```bash
pm2 restart arsip-backend
pm2 logs arsip-backend
```

---

## 6. Verify Running

```bash
curl http://localhost:3000/health
# Should return 200 OK
```

---

## 7. Monitor 24 Hours

```bash
# Check logs for errors
pm2 logs arsip-backend | grep -i error

# Check test execution
npm test
```

---

## Rollback If Needed

```bash
git checkout dbd488b  # Previous commit
pm2 restart arsip-backend
```

---

## What Changed

✅ Database timeout handling  
✅ Race condition fixed  
✅ FK test bug fixed  
✅ Schema validation improved  
✅ Invoice format stricter  
✅ Real credentials required  

**No breaking changes**
