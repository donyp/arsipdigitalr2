# Forced Logout Implementation Guide

## Overview
When maintenance mode is activated, all non-moderator users are forcefully logged out through multiple mechanisms to ensure complete session invalidation.

## Forced Logout Mechanisms

### 1. Token Blacklist (JTI-based)
**File**: `forced-logouts.json`
**How it works**:
- When maintenance starts, all active non-moderator sessions are queried
- Their JWT token IDs (JTI claims) are extracted and stored in `forced-logouts.json`
- Any request with a blacklisted JTI is rejected with 401 Unauthorized

**Flow**:
```
Maintenance Starts
  ↓
Query active_sessions table (non-moderators)
  ↓
Extract token_jti for each session
  ↓
Add JTIs to forced-logouts.json
  ↓
Client sends request with blacklisted token
  ↓
forcedLogoutCheckMiddleware blocks request with 401
  ↓
Client receives 401 → clears token → redirects to login
```

### 2. Database Session Invalidation
**Table**: `active_sessions`
**How it works**:
- When maintenance starts, update all non-moderator sessions
- Set `is_valid = false` and `maintenance_forced_logout = true`
- Any request that checks session validity will fail

**Flow**:
```
Maintenance Starts
  ↓
UPDATE active_sessions SET is_valid = false WHERE user_role != 'moderator'
  ↓
Client makes request with valid token
  ↓
Token passes JWT verification
  ↓
Session query returns is_valid = false
  ↓
Request rejected (session invalid)
```

### 3. WebSocket Forced Logout Message
**Handler**: `websocket-maintenance.js`
**How it works**:
- WebSocket server broadcasts forced_logout messages to all non-moderator clients
- Client receives message and immediately:
  - Clears token from localStorage
  - Clears user info from localStorage
  - Redirects to login page

**Flow**:
```
Maintenance Starts
  ↓
global.maintenanceWebSocket.broadcastForcedLogout('maintenance_start')
  ↓
WebSocket sends forced_logout message to each client
  ↓
Client receives message in maintenance-banner.js
  ↓
handleForcedLogout() executes:
  - localStorage.removeItem('token')
  - window.location.href = '/index.html'
```

### 4. Local Banner Notification
**Handler**: `maintenance-banner.js`
**How it works**:
- Frontend banner polling detects maintenance mode is active
- User cannot proceed with any action if not moderator
- Any failed API call due to 503 shows maintenance message
- Failed 401 responses show "Session expired" message

## Implementation Details

### Database Schema
```sql
-- active_sessions table
- id: UUID
- user_id: UUID
- username: TEXT
- user_role: VARCHAR(50) -- 'admin', 'admin_zona', 'customer', 'moderator'
- token_jti: TEXT (JWT ID for blacklisting)
- ip_address: INET
- user_agent: TEXT
- is_valid: BOOLEAN -- Set to FALSE on forced logout
- maintenance_forced_logout: BOOLEAN -- Indicates forced logout reason
- created_at: TIMESTAMP
- last_activity: TIMESTAMP

-- forced_logout_sessions table (audit)
- id: UUID
- user_id: UUID
- username: TEXT
- user_role: VARCHAR(50)
- token_jti: TEXT
- logout_reason: VARCHAR(50) -- 'maintenance_start', 'manual', etc.
- ip_address: INET
- logged_out_at: TIMESTAMP
```

### Middleware Application

The `forcedLogoutCheckMiddleware` should be applied to:
1. All protected API routes (before authentication)
2. File download endpoints
3. Upload endpoints
4. Any route that modifies data

Example in server.js or route files:
```javascript
const { forcedLogoutCheckMiddleware } = require('./maintenance-middleware');

// Apply BEFORE authenticateToken
app.get('/api/protected-route', 
    forcedLogoutCheckMiddleware,  // Check if token is blacklisted
    authenticateToken,             // Verify JWT signature
    async (req, res) => {
        // Route logic
    }
);
```

### Frontend Flow

**On Login Page (index.html)**:
1. maintenance-banner.js loads
2. Connects to WebSocket (/ws/maintenance)
3. Receives initial maintenance status
4. If maintenance active:
   - Shows banner with countdown
   - Disables login form (for non-moderators)
   - Shows "Only moderators can login" message

**On Dashboard Pages**:
1. maintenance-banner.js loads
2. Checks current maintenance status via polling
3. If maintenance just started:
   - WebSocket receives forced_logout message
   - handleForcedLogout() clears token and redirects
4. If already disconnected (404/401 on API):
   - API error handler detects maintenance mode
   - Shows maintenance message
   - Redirects to login

**On Logout**:
- User clicks logout
- Token removed from localStorage
- Redirected to login page
- If forced logout already happened, user sees "please login again"

## Testing Checklist

### Scenario 1: Non-Moderator During Maintenance Start
- [ ] User logged in as customer
- [ ] Admin starts maintenance mode
- [ ] Customer should:
  - [ ] See forced logout WebSocket message
  - [ ] Token cleared from localStorage
  - [ ] Redirected to login page
  - [ ] Login form shows maintenance message

### Scenario 2: Non-Moderator Tries to Access with Cached Token
- [ ] Non-moderator has old token in localStorage
- [ ] Maintenance mode active
- [ ] Non-moderator tries to access API
- [ ] Request should:
  - [ ] Blocked by forcedLogoutCheckMiddleware
  - [ ] Returns 401 with "Session invalidated" message
  - [ ] Token cleared by error handler

### Scenario 3: Moderator Access During Maintenance
- [ ] User logged in as moderator
- [ ] Maintenance mode active
- [ ] Moderator should:
  - [ ] See maintenance banner with countdown
  - [ ] Still access all features
  - [ ] API requests succeed

### Scenario 4: Maintenance Ends
- [ ] Maintenance active with customers logged out
- [ ] Admin ends maintenance mode
- [ ] Customers should:
  - [ ] See "Maintenance complete" notification
  - [ ] Banner hides after success message
  - [ ] Can now login again

## Error Handling

### API Error Responses

**503 Service Unavailable** (Maintenance Active):
```json
{
  "error": "System maintenance in progress",
  "message": "Only moderators can access during maintenance mode",
  "maintenance": {
    "isActive": true,
    "allowedRole": "moderator",
    "reason": "Database migration",
    "startedAt": "2024-10-13T10:00:00Z",
    "estimatedEnd": "2024-10-13T10:30:00Z"
  },
  "statusCode": 503
}
```

**401 Unauthorized** (Token Blacklisted):
```json
{
  "error": "Session invalidated due to maintenance",
  "message": "Your session has been terminated due to system maintenance. Please login again when maintenance is complete.",
  "maintenanceMode": true,
  "forceLogout": true
}
```

### Client Error Handling

In maintenance-banner.js:
```javascript
// API request fails with 401
fetch(url)
  .then(res => {
    if (res.status === 401 && res.data.forceLogout) {
      maintenanceBanner.handleForcedLogout(res.data.message);
    }
  })
  .catch(err => {
    // Handle network errors
  });
```

## Security Considerations

1. **Token Blacklist Performance**: Use in-memory cache for JTI lookup (checked before DB query)
2. **JTI Uniqueness**: Each token has unique 128-bit JTI (random hex)
3. **Token Expiry**: JTI cache can be cleared after JWT expiration
4. **Moderator Protection**: Ensure 'moderator' role cannot be changed mid-maintenance
5. **Audit Trail**: Log all forced logouts with user, timestamp, IP, reason

## Recovery Procedures

### If Forced Logout Fails
1. Check `/data/forced-logouts.json` exists and is not corrupted
2. Check `active_sessions` table for non-moderator records with `is_valid = false`
3. Manually clear forced logouts:
   ```bash
   echo '{"tokenJtis": []}' > /data/forced-logouts.json
   ```
4. Update sessions in database:
   ```sql
   UPDATE active_sessions SET is_valid = true WHERE maintenance_forced_logout = true;
   ```

### If WebSocket Broadcast Fails
1. Affected users won't see forced logout message
2. They'll still see 401 when making API requests
3. They'll need to manually refresh/retry login

### If User Stays Logged In After Maintenance Starts
1. Token is blacklisted in forced-logouts.json
2. Any API request will return 401
3. User should see maintenance banner and be redirected
4. If not, clear browser cache/localStorage

## Configuration

In `maintenance-endpoints.js`, when calling forced logout:
```javascript
const logoutCount = await forcedLogoutNonModerators(
    supabase, 
    'maintenance_start'  // Reason - also sent in WebSocket
);
```

## Monitoring

Check active forced logouts:
```bash
cat /data/forced-logouts.json
```

Check audit logs:
```sql
SELECT * FROM forced_logout_sessions 
WHERE logout_reason = 'maintenance_start' 
ORDER BY logged_out_at DESC;
```

Monitor WebSocket broadcasts:
```bash
# Check server logs for:
# [WebSocket] Broadcast forced logout to X non-moderator clients
```
