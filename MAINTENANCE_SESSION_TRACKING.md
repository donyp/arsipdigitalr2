# Maintenance Mode - Session Tracking & Verification System

## Overview
Sistem session tracking yang komprehensif untuk memastikan data active sessions tetap akurat dan konsisten dengan database. Ini penting untuk:
- Forced logout yang akurat saat maintenance mode dimulai
- Mendeteksi session stale/inactive
- Admin dapat melihat siapa yang sedang online
- Automatic session keep-alive dari client

## Database Tables

### `active_sessions` - Main Session Table
```sql
CREATE TABLE active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  user_role TEXT NOT NULL, -- 'admin', 'moderator', 'user', etc
  token_jti TEXT UNIQUE, -- JWT token ID for uniqueness
  ip_address TEXT,
  user_agent TEXT,
  is_valid BOOLEAN DEFAULT true, -- false = session invalidated/logged out
  maintenance_forced_logout BOOLEAN DEFAULT false, -- true = forcibly ended
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_is_valid (is_valid),
  INDEX idx_user_role (user_role),
  INDEX idx_last_activity (last_activity)
);
```

### `maintenance_access_logs` - Audit Log
```sql
CREATE TABLE maintenance_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  username TEXT,
  user_role TEXT,
  action TEXT NOT NULL, -- 'maintenance_started', 'maintenance_ended', etc
  ip_address TEXT,
  user_agent TEXT,
  reason TEXT,
  details JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp)
);
```

### `forced_logout_sessions` - Forced Logout Records
```sql
CREATE TABLE forced_logout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  username TEXT,
  user_role TEXT,
  token_jti TEXT,
  logout_reason TEXT, -- 'maintenance_start', 'manual', 'session_expired', etc
  ip_address TEXT,
  logged_out_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_reason (logout_reason)
);
```

## API Endpoints

### 1. GET `/api/maintenance/status`
**Tujuan:** Check maintenance mode status (PUBLIC - tidak perlu auth)
**Response:**
```json
{
  "isActive": false,
  "allowedRole": null,
  "canAccess": true
}
```

Saat maintenance aktif:
```json
{
  "isActive": true,
  "allowedRole": "moderator",
  "reason": "System maintenance in progress",
  "description": "Database backup and optimization",
  "startedAt": "2024-10-13T10:00:00Z",
  "startedBy": "admin@example.com",
  "estimatedEnd": "2024-10-13T11:00:00Z",
  "estimatedMinutesRemaining": 45,
  "canAccess": true // true if user is moderator
}
```

### 2. POST `/api/maintenance/start` ⚡ ADMIN ONLY
**Tujuan:** Mulai maintenance mode dan force logout semua non-moderators
**Request:**
```json
{
  "reason": "Database backup and optimization",
  "description": "System will be unavailable for 1 hour",
  "estimatedDurationMinutes": 60
}
```
**Response:**
```json
{
  "success": true,
  "message": "Maintenance mode started",
  "maintenance": { /* status object */ }
}
```
**Apa yang terjadi:**
- Set `isActive: true` di maintenance-status.json
- Query semua non-moderator sessions dari `active_sessions`
- Insert forced logout records ke `forced_logout_sessions`
- Update session `is_valid: false` untuk non-moderators
- Broadcast ke semua clients via WebSocket

### 3. POST `/api/maintenance/end` ⚡ ADMIN ONLY
**Tujuan:** Akhiri maintenance mode
**Response:**
```json
{
  "success": true,
  "message": "Maintenance mode ended",
  "maintenance": { /* updated status */ }
}
```

### 4. GET `/api/maintenance/active-sessions` ⚡ ADMIN ONLY
**Tujuan:** View semua active sessions dengan detail real-time
**Query Parameters:**
- `limit`: Jumlah records (max 100)
- `offset`: Pagination offset

**Response:**
```json
{
  "total": 15,
  "sessions": [
    {
      "id": "uuid-123",
      "user_id": "uuid-user",
      "username": "operator@example.com",
      "user_role": "moderator",
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "token_jti": "unique-token-id",
      "is_valid": true,
      "maintenance_forced_logout": false,
      "created_at": "2024-10-13T09:00:00Z",
      "last_activity": "2024-10-13T10:30:00Z",
      "inactiveDurationSeconds": 120
    }
  ],
  "timestamp": "2024-10-13T10:31:00Z",
  "notes": {
    "is_valid": "Whether session token is still active",
    "inactiveDurationSeconds": "WARNING if > 3600 (1 hour)"
  }
}
```

### 5. PUT `/api/maintenance/active-sessions/:sessionId/update-activity`
**Tujuan:** Update last_activity timestamp (client-side keep-alive ping)
**Auth:** Required (user hanya bisa update session mereka sendiri)
**Request:** (no body needed)
**Response:**
```json
{
  "success": true,
  "message": "Session activity updated",
  "last_activity": "2024-10-13T10:32:00Z"
}
```
**Called By:** session-keepalive.js setiap 5 menit

### 6. DELETE `/api/maintenance/active-sessions/:sessionId` ⚡ ADMIN ONLY
**Tujuan:** Manually invalidate specific session (force logout user tertentu)
**Response:**
```json
{
  "success": true,
  "message": "Session invalidated",
  "invalidated_session": {
    "id": "uuid-123",
    "username": "user@example.com",
    "user_role": "user",
    "ip_address": "192.168.1.100"
  }
}
```
**Apa yang terjadi:**
- Set `is_valid: false` di database
- Add token_jti ke forced logout list
- Log action ke maintenance_access_logs

### 7. POST `/api/maintenance/verify-sessions` ⚡ ADMIN ONLY
**Tujuan:** Verify semua sessions dan clean up stale/inactive ones
**Request:**
```json
{
  "inactiveThresholdMinutes": 60
}
```
**Response:**
```json
{
  "success": true,
  "message": "Session verification completed",
  "stats": {
    "total_active_sessions": 25,
    "stale_sessions_found": 3,
    "stale_sessions_invalidated": 3,
    "inactiveThresholdMinutes": 60,
    "timestamp": "2024-10-13T10:32:00Z"
  },
  "stale_sessions": [
    {
      "id": "uuid-123",
      "username": "inactive@example.com",
      "user_role": "user",
      "last_activity": "2024-10-13T08:00:00Z",
      "inactiveDurationMinutes": 92
    }
  ]
}
```
**Apa yang terjadi:**
- Identify sessions dengan `last_activity` > threshold
- Set `is_valid: false` untuk stale sessions
- Return detail untuk audit

### 8. GET `/api/maintenance/access-logs` ⚡ ADMIN/MODERATOR ONLY
**Tujuan:** View maintenance access logs
**Query Parameters:**
- `limit`: Max records (default 100)
- `offset`: Pagination

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "username": "admin@example.com",
      "user_role": "admin",
      "action": "maintenance_started",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "reason": "Database backup",
      "details": { /* arbitrary JSON */ },
      "timestamp": "2024-10-13T10:00:00Z"
    }
  ],
  "total": 42,
  "limit": 100,
  "offset": 0
}
```

### 9. GET `/api/maintenance/forced-logouts` ⚡ ADMIN ONLY
**Tujuan:** View forced logout records
**Response:**
```json
{
  "logouts": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "username": "user@example.com",
      "user_role": "user",
      "token_jti": "jti-value",
      "logout_reason": "maintenance_start",
      "ip_address": "192.168.1.100",
      "logged_out_at": "2024-10-13T10:00:00Z"
    }
  ],
  "total": 8,
  "limit": 100,
  "offset": 0
}
```

### 10. POST `/api/maintenance/logout-non-moderators` ⚡ ADMIN ONLY
**Tujuan:** Manually trigger forced logout untuk semua non-moderators
**Response:**
```json
{
  "success": true,
  "logoutCount": 12,
  "message": "Forced logout completed for 12 non-moderators"
}
```

## Client-Side Session Keep-Alive

### File: `js/session-keepalive.js`

Otomatis update session activity setiap 5 menit untuk mencegah session mark as stale.

**Setup (di login endpoint):**
```javascript
// Di auth response handler
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});

const data = await response.json();
if (data.success) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('current_session_id', data.sessionId); // ⚠️ IMPORTANT
  
  // Start keep-alive
  initializeSessionKeepalive();
}
```

**Stop (di logout):**
```javascript
// Di logout handler
stopSessionKeepalive();
localStorage.removeItem('token');
clearSessionId();
```

**Functions Available:**
```javascript
initializeSessionKeepalive()    // Start pinging server
stopSessionKeepalive()          // Stop pinging
setSessionId(sessionId)         // Store session ID
getSessionId()                  // Get current session ID
clearSessionId()                // Clear session ID
```

## Data Accuracy Guarantees

### 1. Session Creation
✅ Recording saat login
```javascript
// auth-endpoints.js
// Jika user sudah ada session -> UPDATE
// Jika belum -> INSERT new
// Always return sessionId di response
```

### 2. Session Activity Updates
✅ Client-side pinging every 5 minutes
✅ Manual verification endpoint untuk cleanup stale sessions

### 3. Session Invalidation
✅ Automatic saat maintenance starts (non-moderators)
✅ Manual via DELETE endpoint (per-user)
✅ Automatic via verify-sessions (stale/inactive)
✅ On explicit logout

### 4. Audit Trail
✅ Semua actions logged ke `maintenance_access_logs`
✅ Forced logouts recorded di `forced_logout_sessions`
✅ IP address dan user-agent captured

### 5. Data Consistency
- ✅ Database adalah AUTHORITATIVE SOURCE
- ✅ JSON files (maintenance-status.json) adalah cache saja
- ✅ Queries selalu dari active_sessions table
- ✅ No stale data di maintenance dashboard

## Common Issues & Fixes

### Issue: Sessions showing as inactive
**Cause:** Client not calling keep-alive OR session-keepalive.js not loaded
**Fix:**
1. Verify `session-keepalive.js` included in HTML
2. Check browser console for `[SessionKeepalive]` logs
3. Verify `initializeSessionKeepalive()` called after login
4. Check network tab untuk PUT requests to `/api/maintenance/active-sessions/:id/update-activity`

### Issue: Session still valid tapi cannot access after maintenance
**Cause:** Token dalam forced logout list
**Fix:**
1. Check forced logout list
2. User harus login ulang
3. Admin bisa manual invalidate session via DELETE endpoint

### Issue: Stale sessions showing as active
**Cause:** `last_activity` not updated regularly
**Fix:**
1. Run POST `/api/maintenance/verify-sessions` to clean up
2. Set `inactiveThresholdMinutes` ke desired value (default 60)

### Issue: Wrong role showing in sessions
**Cause:** Cached role OR role changed after login
**Fix:**
- Authentication middleware queries `users` table untuk authoritative role
- Sessions automatically reflect latest role saat login ulang
- No automatic role sync untuk existing sessions

## Workflow - Maintenance Mode Start

```
1. Admin clicks "Start Maintenance"
2. POST /api/maintenance/start
   ├─ Verify admin role ✓
   ├─ Query non-moderator sessions ✓
   ├─ Create forced_logout_sessions records ✓
   ├─ Update active_sessions (is_valid=false) ✓
   ├─ Save maintenance-status.json ✓
   └─ Broadcast via WebSocket ✓
3. Clients receive notification
   ├─ Display maintenance banner ✓
   ├─ Disable access untuk non-mods ✓
   └─ Trigger logout untuk non-mods ✓
4. Only moderators dapat akses sistem ✓
5. Admin dapat verify sessions via /active-sessions ✓
```

## Monitoring Checklist

### Daily
- [ ] Check `/api/maintenance/active-sessions` untuk anomali
- [ ] Verify session count reasonable (tidak duplicate)
- [ ] Check IP addresses untuk suspicious activity

### Weekly
- [ ] Run `/api/maintenance/verify-sessions` untuk cleanup
- [ ] Review `/api/maintenance/access-logs` untuk patterns
- [ ] Check `/api/maintenance/forced-logouts` history

### During Maintenance
- [ ] Monitor active sessions real-time
- [ ] Verify forced logouts completed
- [ ] Check access logs untuk unauthorized attempts
- [ ] Ensure only moderators showing dalam sessions

## SQL Queries untuk Manual Inspection

```sql
-- Total active sessions
SELECT COUNT(*) FROM active_sessions WHERE is_valid = true;

-- Sessions per role
SELECT user_role, COUNT(*) FROM active_sessions 
WHERE is_valid = true GROUP BY user_role;

-- Sessions older than 2 hours
SELECT * FROM active_sessions 
WHERE is_valid = true 
AND last_activity < NOW() - INTERVAL '2 hours';

-- Recent forced logouts
SELECT * FROM forced_logout_sessions 
ORDER BY logged_out_at DESC LIMIT 20;

-- Maintenance actions by admin
SELECT * FROM maintenance_access_logs 
WHERE action IN ('maintenance_started', 'maintenance_ended')
ORDER BY timestamp DESC;
```

## Testing

### Test 1: Create Session
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@example.com","password":"password"}'
# Verify response includes sessionId
```

### Test 2: View Sessions
```bash
curl -X GET "http://localhost:5000/api/maintenance/active-sessions" \
  -H "Authorization: Bearer $TOKEN"
# Should show new session with your user info
```

### Test 3: Update Activity
```bash
curl -X PUT "http://localhost:5000/api/maintenance/active-sessions/$SESSION_ID/update-activity" \
  -H "Authorization: Bearer $TOKEN"
# Verify last_activity updated to NOW
```

### Test 4: Verify Sessions
```bash
curl -X POST "http://localhost:5000/api/maintenance/verify-sessions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inactiveThresholdMinutes": 60}'
# Should clean up inactive sessions
```

## Summary

✅ **Akurat**: Data langsung dari database, bukan cache  
✅ **Real-time**: Client pinging setiap 5 menit  
✅ **Auditable**: Semua actions logged dengan detail  
✅ **Verifiable**: Admin bisa inspect/cleanup anytime  
✅ **Reliable**: Guaranteed forced logout saat maintenance  
