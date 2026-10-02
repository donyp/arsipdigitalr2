# 📋 Audit Logging System - Complete Setup Guide

## Overview
The audit logging system tracks all critical operations (logins, file downloads, deletions, data changes) for moderator monitoring and compliance.

**Status**: Phase 2 - Moderator Monitoring System
**Components**: Database schema, API endpoints, Frontend dashboard

---

## 1. Database Setup

### Step 1: Create Audit Logs Table
Run in **Supabase SQL Editor**:

```sql
-- File: CREATE_AUDIT_LOGS_TABLE.sql
-- Paste entire content from workspace root into Supabase SQL Editor and run
```

**What it creates:**
- `audit_logs` table with 20+ columns
- Indexes for fast querying
- Row Level Security (RLS) policies for role-based access
- `log_audit_event()` PL/pgSQL function for backend logging

**RLS Policies:**
- `moderators_view_all_logs`: Moderators and super_admins see all logs
- `admin_zona_view_own_zone_logs`: Admin Zona users see only their zone's logs

---

### Step 2: Create Helper Functions
Run in **Supabase SQL Editor**:

```sql
-- File: AUDIT_LOGS_FUNCTIONS.sql
-- Paste entire content and run
```

**What it creates:**
- `get_audit_stats_by_operation()` - Returns log counts by operation type
- `get_audit_stats_by_resource()` - Returns log counts by resource type
- `get_audit_stats_by_severity()` - Returns log counts by severity level

---

## 2. Backend Integration

### Step 1: Copy Files to Backend

Files already created:
- `backend/audit-logger.js` - AuditLogger class for logging
- `backend/audit-endpoints.js` - API endpoints for dashboard

### Step 2: Server Configuration
Already done in `backend/server.js`:

✅ Import audit endpoints:
```javascript
const AuditLogger = require('./audit-logger');
const registerAuditEndpoints = require('./audit-endpoints');
```

✅ Initialize AuditLogger:
```javascript
const auditLogger = new AuditLogger(supabase);
```

✅ Register endpoints:
```javascript
registerAuditEndpoints(app, supabase, authenticateToken, authorizeRole);
```

✅ Add route for dashboard:
```javascript
app.get('/audit-logs', authenticateToken, authorizeRole('moderator', 'super_admin'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'audit-logs.html'));
});
```

---

## 3. API Endpoints

### Available Endpoints

**GET /api/audit-logs**
- List audit logs with filtering and pagination
- Query params: `userId`, `resourceType`, `operation`, `startDate`, `endDate`, `severity`, `isSuspicious`, `limit`, `offset`
- Response: `{ logs: [], pagination: { total, limit, offset, hasMore } }`

**GET /api/audit-logs/suspicious**
- List only suspicious activity logs
- Query params: `limit`, `offset`, `severity`

**GET /api/audit-logs/stats**
- Get summary statistics
- Query params: `startDate`, `endDate`
- Response: `{ operations: [], resources: [], severity: [], suspicious: 0 }`

**GET /api/audit-logs/:id**
- Get detailed log entry

**GET /api/audit-logs/export/csv**
- Export filtered logs as CSV file

**POST /api/audit-logs/mark-reviewed**
- Mark suspicious logs as reviewed (set `is_suspicious = false`)
- Body: `{ logIds: [array of IDs] }`

**GET /api/audit-logs/user/:userId**
- Get all logs for specific user

---

## 4. Frontend Dashboard

**File**: `audit-logs.html` (workspace root)
**Access**: `/audit-logs` (moderators only)

### Features

✅ **Real-time Stats Dashboard**
- Total logs count
- Critical events count
- Suspicious activity alerts
- Last 24h activity

✅ **Advanced Filtering**
- Date range picker (start/end date)
- Resource type filter (invoice, file, user, zona, ticket)
- Operation filter (CREATE, READ, UPDATE, DELETE, DOWNLOAD)
- Severity filter (info, warning, critical)
- User email search
- Suspicious activity toggle

✅ **Data Table**
- Sortable columns
- Color-coded severity badges
- Operation type indicators
- User info with role
- Timestamp with timezone

✅ **Pagination**
- 50 items per page (configurable)
- Previous/Next navigation
- Total count display

✅ **Export**
- CSV export with all filtered data
- Filename includes date

✅ **Auto-refresh**
- Toggle 60-second auto-refresh
- Manual refresh button

✅ **Detail View**
- Modal popup for detailed log inspection
- Shows: ID, timestamp, user, action, resource, status, IP address
- Old/new values for updates
- Error messages if present

---

## 5. Integration with Critical Endpoints

### How to Add Logging to Endpoints

Add to any critical endpoint handler:

```javascript
// After operation completes
await auditLogger.log({
    userId: req.user.userId,
    userEmail: req.user.email,
    userRole: req.user.role,
    zonaId: req.user.zona_id,
    
    action: 'User login successful',
    resourceType: 'user',
    resourceId: req.user.userId,
    resourceName: req.user.email,
    
    operation: 'READ', // CREATE, READ, UPDATE, DELETE, DOWNLOAD
    oldValues: null,
    newValues: { lastLogin: new Date() },
    
    ipAddress: AuditLogger.extractClientInfo(req).ipAddress,
    userAgent: AuditLogger.extractClientInfo(req).userAgent,
    requestPath: req.path,
    requestMethod: req.method,
    
    statusCode: 200,
    responseMessage: 'Login successful',
    errorMessage: null,
    
    isSuspicious: false,
    severity: 'info'
});
```

### Critical Endpoints to Instrument

**Authentication:**
- POST `/api/auth/login` - User login
- POST `/api/auth/logout` - User logout
- POST `/api/auth/verify-admin` - Admin verification

**File Operations:**
- POST `/api/files/upload` - File upload
- GET `/api/files/:id/download` - File download
- POST `/api/files/:id/share` - Share file
- DELETE `/api/files/:id` - Delete file

**Invoice Operations:**
- GET `/api/invoice/list` - Invoice listing (zone check)
- POST `/api/invoice/upload` - Invoice upload
- GET `/zona/:zonaId/summary` - Zone summary
- POST `/api/invoice/mark-paid` - Mark as paid

**User/Zone Management:**
- POST `/api/users` - Create user
- PUT `/api/users/:id` - Update user
- DELETE `/api/users/:id` - Delete user
- POST `/api/zonas` - Create zona
- PUT `/api/zonas/:id` - Update zona

---

## 6. Suspicious Activity Detection

The AuditLogger automatically detects suspicious patterns:

✅ **HTTP Error Status Codes**
- Any 4xx or 5xx status → marked suspicious

✅ **Bulk Deletions**
- DELETE operations on files → flagged

✅ **Critical Data Modifications**
- Changes to: `role`, `zona_id`, `permissions`, `status`
- When `oldValues !== newValues`

✅ **Failed Operations**
- Failed auth attempts
- Permission denied errors
- Database failures

### Manual Suspension Override

```javascript
// Force marking as suspicious
isSuspicious: true,
severity: 'critical'
```

---

## 7. Sidebar Integration

✅ Added to `js/sidebar.js`:
- Menu item: "Audit Logs" with shield icon
- Visible to: `moderator` and `super_admin` roles only
- Icon: `<i class="fas fa-shield-alt"></i>`

---

## 8. Deployment Checklist

### Before Going Live

- [ ] Run `CREATE_AUDIT_LOGS_TABLE.sql` in Supabase
- [ ] Run `AUDIT_LOGS_FUNCTIONS.sql` in Supabase
- [ ] Test JWT authentication on `/api/audit-logs`
- [ ] Test authorization (non-mods should get 403)
- [ ] Test CSV export with sample data
- [ ] Test date range filtering
- [ ] Test suspicious flag filtering
- [ ] Verify sidebar link appears for moderators
- [ ] Test auto-refresh functionality
- [ ] Verify modal detail view works
- [ ] Deploy to Railway/Cloud Run

### Environment Variables

No new environment variables required. Uses existing:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET` (for token validation)

---

## 9. Testing the System

### Quick Test: Check Audit Tables

```javascript
// In browser console on /audit-logs
const token = localStorage.getItem('jwt_token');
fetch('/api/audit-logs?limit=5', {
    headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(data => console.log('Audit logs:', data.logs));
```

### Generate Test Data

Login/logout a few times, then check:
- Open `/audit-logs`
- Should see recent login activity
- Timestamps should match your login times

### Verify Role-Based Access

**As Moderator:**
- Should see all logs
- `/api/audit-logs` returns 200
- Export CSV works

**As Admin Zona:**
- Middleware returns 403
- Should not see dashboard

**As Non-Authenticated:**
- Redirected to login
- `/api/audit-logs` returns 401

---

## 10. Next Steps (Future Phases)

**Phase 3: Real-time Alerts**
- WebSocket notifications for critical events
- Slack/Email integration for security alerts

**Phase 4: Advanced Analytics**
- User activity reports
- File access patterns
- Data change timeline

**Phase 5: Audit Compliance**
- GDPR compliance reports
- Data retention policies
- Automated log cleanup after 1 year

---

## Troubleshooting

### Issue: Sidebar link not appearing

**Solution:**
1. Check user role is `moderator` or `super_admin`
2. Clear browser cache (`Ctrl+Shift+Del`)
3. Reload page
4. Check `js/sidebar.js` has the new menu item

### Issue: /api/audit-logs returns 403

**Solution:**
1. Check user role in JWT token
2. Verify `authorizeRole('moderator', 'super_admin')` middleware added
3. Check JWT token is valid and not expired

### Issue: No logs appearing in dashboard

**Solution:**
1. Check `CREATE_AUDIT_LOGS_TABLE.sql` was run
2. Verify RLS policies enabled
3. Check table exists: Go to Supabase → Tables → `audit_logs`
4. Insert test data manually to verify table is writable

### Issue: CSV export returns 500 error

**Solution:**
1. Check `AUDIT_LOGS_FUNCTIONS.sql` was run
2. Verify database functions exist
3. Check logs in server console for SQL errors
4. Test query directly in Supabase SQL Editor

### Issue: Date range filtering not working

**Solution:**
1. Check date format is ISO 8601 (YYYY-MM-DD)
2. Verify `startDate` and `endDate` query params are passed
3. Check Flatpickr date picker initialized correctly
4. Test in browser console: `console.log(state.filters)`

---

## Summary

| Component | Status | Location |
|-----------|--------|----------|
| Database Schema | ✅ Created | `CREATE_AUDIT_LOGS_TABLE.sql` |
| Helper Functions | ✅ Created | `AUDIT_LOGS_FUNCTIONS.sql` |
| Backend Logger | ✅ Ready | `backend/audit-logger.js` |
| API Endpoints | ✅ Ready | `backend/audit-endpoints.js` |
| Frontend Dashboard | ✅ Ready | `audit-logs.html` |
| Sidebar Integration | ✅ Done | `js/sidebar.js` |
| Server Registration | ✅ Done | `backend/server.js` |
| Route Protection | ✅ Done | `/audit-logs` endpoint auth |

---

## Questions?

Refer to:
1. Database docs: `CREATE_AUDIT_LOGS_TABLE.sql` (SQL comments)
2. Backend docs: `backend/audit-logger.js` (JSDoc comments)
3. API docs: `backend/audit-endpoints.js` (endpoint descriptions)
4. Frontend code: `audit-logs.html` (inline JavaScript comments)
