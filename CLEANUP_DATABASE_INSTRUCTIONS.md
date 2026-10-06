# Session Management System - Database Cleanup Instructions

## Overview
This document provides instructions for manually removing the `user_sessions` table and related functions from your Supabase database.

## ⚠️ WARNING
This is a **destructive operation**. Once executed, all session tracking data will be permanently deleted. Make sure you have a backup if needed.

## Steps to Execute

### Method 1: Using Supabase SQL Editor (Recommended)

1. **Go to Supabase Dashboard**
   - Navigate to your project at https://app.supabase.com
   - Click on "SQL Editor" in the left sidebar

2. **Create a new query** and execute the following SQL:

```sql
-- Drop functions (in order of dependency)
DROP FUNCTION IF EXISTS get_user_active_sessions(UUID) CASCADE;
DROP FUNCTION IF EXISTS count_active_sessions(UUID) CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_sessions() CASCADE;

-- Drop the table
DROP TABLE IF EXISTS user_sessions CASCADE;

-- Verify
SELECT 'user_sessions table and all related functions dropped successfully' AS status;
```

3. **Click "Run"** to execute the query
4. **Verify** that you see the confirmation message

### Method 2: Using psql (if you have direct database access)

```bash
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" -c "
DROP FUNCTION IF EXISTS get_user_active_sessions(UUID) CASCADE;
DROP FUNCTION IF EXISTS count_active_sessions(UUID) CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_sessions() CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
SELECT 'Cleanup complete' AS status;
"
```

### Method 3: Verify Cleanup

After executing the SQL, verify the cleanup was successful:

```sql
-- Check if table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_sessions'
) AS table_exists;

-- Should return: false (table does not exist)
```

## What Gets Deleted

- ✅ **Table**: `user_sessions` - stores session tokens and session metadata
- ✅ **Function**: `cleanup_expired_sessions()` - auto-cleanup of expired sessions
- ✅ **Function**: `count_active_sessions(UUID)` - count active sessions for a user
- ✅ **Function**: `get_user_active_sessions(UUID)` - retrieve user's active sessions
- ✅ **Policies**: Row-level security policies on the table

## Impact Assessment

| Component | Status | Impact |
|-----------|--------|--------|
| Session tracking | ❌ Disabled | Users can login from multiple devices simultaneously |
| Force logout | ❌ Disabled | Cannot remotely terminate user sessions |
| Session limits | ❌ Disabled | No concurrent login limits (1/2 per role) |
| Heartbeat/Activity tracking | ❌ Disabled | Session last_activity not tracked |
| Session validation middleware | ❌ Removed | No validation of active sessions on API calls |

## Backend Changes Already Made

✅ All session-related code removed from `backend/server.js`:
- Session management endpoints removed
- Session validation middleware removed
- Session creation/termination code removed
- SessionManager module deleted

✅ Session management UI removed:
- `session-management.html` deleted
- Menu item removed from sidebar

✅ Related files deleted:
- `backend/session-manager.js`
- `backend/session-endpoints.js`
- `backend/scheduled-auto-logout.js`
- All SQL setup/cleanup scripts

## Rollback Procedure

If you need to restore session management later, you can:

1. Run: `git checkout backend/CREATE_USER_SESSIONS_TABLE.sql`
2. Execute that SQL in Supabase to recreate the table and functions
3. Restore the deleted backend files from git history
4. Re-implement the endpoints if needed

## Verification Checklist

After cleanup, verify everything is working:

- [ ] Database table `user_sessions` does not exist
- [ ] Application starts without errors
- [ ] Users can login successfully
- [ ] Audit logs show login/logout events
- [ ] No session-related errors in server logs
- [ ] Navigation and API endpoints work normally

## Support

If you encounter issues during cleanup:

1. Check Supabase error messages carefully
2. Verify you're using the service role key (with full permissions)
3. Ensure the SQL syntax is correct
4. Check database logs for any constraint violations
5. Contact Supabase support if the table deletion fails

---

**Cleanup Date**: October 6, 2026  
**Reason**: Session management system removal due to reliability issues
