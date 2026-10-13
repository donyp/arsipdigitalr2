# Maintenance Mode - Comprehensive Test Suite

## Test Environment Setup

### Prerequisites
- Backend running on http://localhost:3001
- Frontend running on http://localhost:3000
- Supabase database connected
- WebSocket enabled on server

### Test Users
```
Admin User:
  Email: admin@example.com
  Password: admin123
  Role: admin

Admin Zona User:
  Email: admin_zona@example.com
  Password: zona123
  Role: admin_zona

Moderator:
  Email: moderator@example.com
  Password: mod123
  Role: moderator

Customer:
  Email: customer@example.com
  Password: cust123
  Role: customer
```

---

## Test Group 1: Login Page (index.html) - No Maintenance

### Test 1.1: Banner Does Not Show When Maintenance Inactive
**Steps**:
1. Navigate to http://localhost:3000/index.html
2. Open browser console (F12)
3. Check Network tab
4. Wait 2 seconds

**Expected**:
- ✅ No red/orange banner appears
- ✅ Log shows: "[MaintenanceBanner] Polling started"
- ✅ GET /api/maintenance/status returns `{isActive: false}`
- ✅ Login form is fully functional

**Result**: ___________

### Test 1.2: Login Success - Customer Role
**Steps**:
1. On login page, maintenance inactive
2. Enter customer@example.com / cust123
3. Click "Login"

**Expected**:
- ✅ Login succeeds
- ✅ Token saved to localStorage
- ✅ Redirects to dashboard
- ✅ User is logged in

**Result**: ___________

### Test 1.3: Login Success - Moderator Role
**Steps**:
1. On login page, maintenance inactive
2. Enter moderator@example.com / mod123
3. Click "Login"

**Expected**:
- ✅ Login succeeds
- ✅ Token saved to localStorage
- ✅ Redirects to dashboard
- ✅ User is logged in

**Result**: ___________

---

## Test Group 2: Maintenance Mode - Start

### Test 2.1: Admin Can Access Maintenance Dashboard
**Steps**:
1. Login as admin@example.com
2. Navigate to /manage/maintenance.html

**Expected**:
- ✅ Page loads successfully
- ✅ No 403 Forbidden error
- ✅ "Maintenance Control" card visible
- ✅ "Start Maintenance" button visible

**Result**: ___________

### Test 2.2: Non-Admin Cannot Access Maintenance Dashboard
**Steps**:
1. Login as customer@example.com
2. Navigate to /manage/maintenance.html

**Expected**:
- ✅ Page loads (it's a frontend page)
- ✅ Buttons exist but API calls fail
- ✅ Console shows 403 Forbidden on POST /api/maintenance/start

**Result**: ___________

### Test 2.3: Start Maintenance - Valid Input
**Steps**:
1. Login as admin@example.com
2. Go to /manage/maintenance.html
3. Fill:
   - Duration: 30 minutes
   - Reason: "Database migration"
4. Click "Start Maintenance"

**Expected**:
- ✅ Success message appears
- ✅ Button shows spinner during request
- ✅ Status badge changes to "MAINTENANCE ACTIVE"
- ✅ "Start Maintenance" section hides
- ✅ "Stop Maintenance" section shows
- ✅ Countdown timer appears (29:59 → counting down)
- ✅ Server log: "[Maintenance] Mode started by admin@example.com"

**Result**: ___________

### Test 2.4: Verify maintenance-status.json Updated
**Steps**:
1. After starting maintenance
2. Check `/data/maintenance-status.json`

**Expected**:
```json
{
  "isActive": true,
  "allowedRole": "moderator",
  "reason": "Database migration",
  "startedAt": "2024-10-13T10:00:00.000Z",
  "startedBy": "admin@example.com",
  "estimatedDurationMinutes": 30,
  "estimatedEnd": "2024-10-13T10:30:00.000Z"
}
```

**Result**: ___________

---

## Test Group 3: Maintenance Mode - Login Blocked

### Test 3.1: Customer Cannot Login During Maintenance
**Steps**:
1. Maintenance is active (from Test 2.3)
2. Logout from admin account
3. On login page, enter customer@example.com / cust123
4. Click "Login"

**Expected**:
- ✅ Login request returns 503 Status Unavailable
- ✅ Error message shows: "System maintenance in progress"
- ✅ Banner appears on login page (orange/red)
- ✅ Banner shows: "🔧 Sistem dalam Mode Pemeliharaan"
- ✅ Banner shows reason: "Database migration"
- ✅ Banner shows: "Hanya moderator yang dapat mengakses sistem saat ini"
- ✅ Login button disabled or shows error

**Result**: ___________

### Test 3.2: Admin_Zona Cannot Login During Maintenance
**Steps**:
1. Maintenance still active
2. On login page, enter admin_zona@example.com / zona123
3. Click "Login"

**Expected**:
- ✅ Login fails with 503
- ✅ Banner shows same maintenance message
- ✅ No access is granted

**Result**: ___________

### Test 3.3: Moderator CAN Login During Maintenance
**Steps**:
1. Maintenance still active
2. On login page, enter moderator@example.com / mod123
3. Click "Login"

**Expected**:
- ✅ Login succeeds
- ✅ Token saved to localStorage
- ✅ Redirects to dashboard
- ✅ Maintenance banner appears (green checkmark)
- ✅ Banner shows: "✅ Anda memiliki akses sebagai moderator"
- ✅ Countdown timer visible

**Result**: ___________

---

## Test Group 4: WebSocket Real-Time Updates

### Test 4.1: Login Page - WebSocket Banner Update
**Steps**:
1. Maintenance is active
2. Non-moderator logs out (already on login page)
3. Open browser console (F12)
4. Look for WebSocket connection
5. Admin starts maintenance (already started, so):
   - Admin changes reason to "Security patch"
   - Admin extends time to 60 minutes
   - Admin clicks "End Maintenance" and immediately "Start Maintenance" again

**Expected**:
- ✅ Console shows: "[MaintenanceBanner] WebSocket connected"
- ✅ Banner updates in real-time (no refresh needed)
- ✅ Countdown resets to new duration
- ✅ Reason updates on banner

**Result**: ___________

### Test 4.2: Dashboard - WebSocket Forced Logout
**Steps**:
1. Login as customer@example.com (before maintenance)
2. Open dashboard
3. In new tab/window: Admin starts maintenance
4. Watch first tab (customer dashboard)

**Expected**:
- ✅ Maintenance banner appears (orange)
- ✅ Customer is forced logged out (5 seconds)
- ✅ Redirected to login page with message
- ✅ localStorage.token is cleared
- ✅ Server log: "[WebSocket] Broadcast forced logout to X non-moderator clients"

**Result**: ___________

### Test 4.3: Multiple Clients - Sync Updates
**Steps**:
1. Open 3 browser windows/tabs
   - Window A: Customer
   - Window B: Admin_Zona
   - Window C: Admin
2. Login each as their role
3. Windows A & B: See dashboard
4. Window C: Start maintenance

**Expected**:
- ✅ All windows get WebSocket message simultaneously
- ✅ Windows A & B: Forced logout, banner appears
- ✅ Window C: Sees success message, countdown active
- ✅ No more than 1 second delay between updates

**Result**: ___________

---

## Test Group 5: Forced Logout - Connected Users

### Test 5.1: Forced Logout - Dashboard Access
**Steps**:
1. Setup: Customer logged in on dashboard (before maintenance)
2. Admin: Start maintenance via /manage/maintenance.html
3. Watch customer's dashboard

**Expected**:
- ✅ Within 5 seconds: Dashboard becomes unresponsive
- ✅ Banner appears: "Session invalidated"
- ✅ "Back to Login" button shown
- ✅ API calls return 401 Unauthorized
- ✅ localStorage is cleared

**Result**: ___________

### Test 5.2: Forced Logout - API Request Fails
**Steps**:
1. Customer logged in, maintenance started
2. Customer makes API request (e.g., fetch /api/files)
3. Check response

**Expected**:
- ✅ Request blocked by forcedLogoutCheckMiddleware
- ✅ Returns 401 with message: "Session invalidated due to maintenance"
- ✅ Frontend detects 401 and clears token
- ✅ User redirected or sees "please login again"

**Result**: ___________

### Test 5.3: Verify forced-logouts.json Created
**Steps**:
1. Maintenance active with forced logouts done
2. Check `/data/forced-logouts.json`

**Expected**:
```json
{
  "tokenJtis": [
    "a1b2c3d4e5f6...",
    "f6e5d4c3b2a1...",
    "..."
  ]
}
```
- ✅ Contains multiple JTI entries (one per non-moderator session)
- ✅ Each is 32-char hex string (128 bits)

**Result**: ___________

---

## Test Group 6: Forced Logout - Offline Users

### Test 6.1: Offline User Tries to Access API
**Steps**:
1. Customer logged in, maintenance NOT active
2. localStorage has valid token
3. Start maintenance (marks customer's token for logout)
4. Customer tries to fetch API (e.g., /api/files)

**Expected**:
- ✅ Request sent with old token
- ✅ forcedLogoutCheckMiddleware decodes JWT, gets JTI
- ✅ Checks forced-logouts.json
- ✅ JTI found in list
- ✅ Returns 401 "Session invalidated"
- ✅ Frontend clears token and shows error

**Result**: ___________

### Test 6.2: After Maintenance Ends - Can Login Again
**Steps**:
1. Maintenance active (logged-out customers)
2. Admin goes to /manage/maintenance.html
3. Clicks "End Maintenance Now"

**Expected**:
- ✅ Confirmation dialog shown
- ✅ Button shows "Stopping..."
- ✅ Success message: "Maintenance mode ended successfully"
- ✅ maintenance-status.json updated (isActive: false)
- ✅ /data/forced-logouts.json still exists but not checked
- ✅ Customer can now login again
- ✅ WebSocket broadcasts "Maintenance Complete" notification

**Result**: ___________

---

## Test Group 7: Access Logs

### Test 7.1: Access Logs Show Login Attempts
**Steps**:
1. Maintenance active
2. Customer tries to login (fails)
3. Moderator logs in (succeeds)
4. Admin goes to /manage/maintenance.html
5. Scroll to "Access Logs" table

**Expected**:
- ✅ Table shows 2 rows:
  1. Customer attempt - "denied" (orange badge)
  2. Moderator login - "granted" (green badge)
- ✅ Columns visible: Timestamp, User, IP, Action, Role
- ✅ Timestamps are recent
- ✅ IPs match request origins

**Result**: ___________

### Test 7.2: Refresh Logs Button
**Steps**:
1. Access logs showing
2. Click "Refresh Logs" button

**Expected**:
- ✅ Loading spinner appears briefly
- ✅ Table refreshes
- ✅ New attempts appear (if any made)

**Result**: ___________

---

## Test Group 8: Admin Dashboard Functionality

### Test 8.1: Maintenance Duration Countdown
**Steps**:
1. Start maintenance with 2-minute duration
2. Watch countdown timer on /manage/maintenance.html

**Expected**:
- ✅ Timer shows: 01:59, 01:58, 01:57...
- ✅ Updates every second
- ✅ Format: HH:MM:SS
- ✅ When time reaches 00:00:00, continues

**Result**: ___________

### Test 8.2: Stop Maintenance Before Time Expires
**Steps**:
1. Maintenance active with 10+ minutes remaining
2. Admin clicks "End Maintenance Now"
3. Confirms in dialog

**Expected**:
- ✅ Success message appears
- ✅ Status changes to "INACTIVE" (green)
- ✅ maintenance-status.json updated (isActive: false)
- ✅ endedAt and endedBy fields added

**Result**: ___________

### Test 8.3: Force Logout Button
**Steps**:
1. Maintenance active
2. 2+ non-moderator users connected (or with active sessions)
3. Click "Force Logout Non-Moderators" button

**Expected**:
- ✅ Confirmation dialog shown
- ✅ Message: "This will immediately disconnect all non-moderator users"
- ✅ After confirming:
  - ✅ Active Sessions count updates
  - ✅ "Last Forced Logout" shows current time
  - ✅ WebSocket broadcasts forced_logout message
  - ✅ Affected users see forced logout message

**Result**: ___________

---

## Test Group 9: Dark/Light Mode

### Test 9.1: Banner Responsive to Dark Mode
**Steps**:
1. Login page (no maintenance)
2. Toggle dark mode (if implemented)
3. Banner appears (start maintenance if needed)

**Expected**:
- ✅ Colors adjust for dark mode
- ✅ Text readable in both modes
- ✅ No color contrast issues

**Result**: ___________

### Test 9.2: Admin Dashboard Dark Mode
**Steps**:
1. /manage/maintenance.html
2. Toggle dark mode

**Expected**:
- ✅ All elements readable
- ✅ Cards have appropriate background
- ✅ Text colors adjust
- ✅ Buttons visible and clickable

**Result**: ___________

---

## Test Group 10: Error Scenarios

### Test 10.1: Start Maintenance Without Reason
**Steps**:
1. Admin dashboard
2. Leave "Reason" empty
3. Click "Start Maintenance"

**Expected**:
- ✅ Validation error shown: "Please provide a reason"
- ✅ Request not sent to server
- ✅ Maintenance does not start

**Result**: ___________

### Test 10.2: Start Maintenance With Invalid Duration
**Steps**:
1. Admin dashboard
2. Duration: 0 or empty or -5
3. Click "Start Maintenance"

**Expected**:
- ✅ Validation error: "Please enter a valid duration"
- ✅ Request not sent

**Result**: ___________

### Test 10.3: Maintenance Already Active
**Steps**:
1. Maintenance is active
2. Admin tries to start maintenance again

**Expected**:
- ✅ Server returns 409 Conflict
- ✅ Frontend shows error: "Maintenance mode already active"

**Result**: ___________

### Test 10.4: End Maintenance When Not Active
**Steps**:
1. Maintenance is inactive
2. Somehow call POST /api/maintenance/end

**Expected**:
- ✅ Server returns 409 Conflict
- ✅ Error: "Maintenance mode not active"

**Result**: ___________

---

## Test Group 11: Permission Checks

### Test 11.1: Only Admin Can Start Maintenance
**Steps**:
1. Login as moderator
2. Try: POST /api/maintenance/start (via curl or API client)
3. Login as customer
4. Try same

**Expected**:
- ✅ Moderator: 403 Forbidden
- ✅ Customer: 403 Forbidden
- ✅ Both get: "Only admins can start maintenance mode"
- ✅ Access logged as "denied"

**Result**: ___________

### Test 11.2: Only Admin Can End Maintenance
**Steps**:
1. Maintenance active
2. Login as moderator
3. Try: POST /api/maintenance/end

**Expected**:
- ✅ 403 Forbidden
- ✅ Error: "Only admins can end maintenance mode"

**Result**: ___________

### Test 11.3: Admin/Moderator Can View Access Logs
**Steps**:
1. Call GET /api/maintenance/access-logs as:
   - Admin → should work
   - Moderator → should work
   - Customer → should fail (403)

**Expected**:
- ✅ Admin: 200 OK + logs returned
- ✅ Moderator: 200 OK + logs returned
- ✅ Customer: 403 Forbidden

**Result**: ___________

---

## Test Group 12: Browser Compatibility

### Test 12.1: Chrome/Edge (Latest)
**Steps**:
1. All tests on Chrome/Edge
2. Check console for errors

**Expected**:
- ✅ No JavaScript errors
- ✅ Banner renders correctly
- ✅ WebSocket works
- ✅ All buttons functional

**Result**: ___________

### Test 12.2: Firefox (Latest)
**Steps**:
1. All tests on Firefox

**Expected**:
- ✅ No errors
- ✅ Responsive layout works
- ✅ WebSocket functional

**Result**: ___________

### Test 12.3: Safari (Latest)
**Steps**:
1. All tests on Safari

**Expected**:
- ✅ No errors
- ✅ Dark mode works
- ✅ Touch gestures responsive

**Result**: ___________

---

## Test Group 13: Mobile Responsiveness

### Test 13.1: Login Page on Mobile (375px width)
**Steps**:
1. DevTools: Toggle device toolbar
2. iPhone SE (375px)
3. Navigate to login page

**Expected**:
- ✅ Banner fits screen
- ✅ No horizontal scroll
- ✅ Text readable
- ✅ Login form accessible

**Result**: ___________

### Test 13.2: Admin Dashboard on Tablet (768px width)
**Steps**:
1. DevTools: iPad (768px)
2. Navigate to /manage/maintenance.html

**Expected**:
- ✅ Grid adjusts (single column on mobile)
- ✅ All buttons clickable
- ✅ Table scrolls horizontally if needed

**Result**: ___________

---

## Test Group 14: Performance

### Test 14.1: Banner Polling Performance
**Steps**:
1. Open DevTools Performance tab
2. Login page with banner polling
3. Record for 30 seconds

**Expected**:
- ✅ CPU usage < 5%
- ✅ No memory leaks
- ✅ Polling requests every 10 seconds only
- ✅ Banner update < 100ms

**Result**: ___________

### Test 14.2: WebSocket Load Test
**Steps**:
1. 50+ simultaneous WebSocket connections
2. Monitor memory and CPU

**Expected**:
- ✅ All connections established
- ✅ Broadcast messages delivered to all
- ✅ No connection drops
- ✅ Latency < 200ms

**Result**: ___________

---

## Test Group 15: Session Persistence

### Test 15.1: Refresh Page During Maintenance
**Steps**:
1. Customer logged in on dashboard
2. Maintenance starts
3. Customer's browser tab refreshes

**Expected**:
- ✅ Page reloads
- ✅ Banner immediately appears (from polling)
- ✅ User sees forced logout message
- ✅ Token cleared

**Result**: ___________

### Test 15.2: Recovery After Maintenance Ends
**Steps**:
1. Customer forced out during maintenance
2. Maintenance ends
3. Customer refreshes page

**Expected**:
- ✅ Login page loads
- ✅ Banner disappears
- ✅ Can login again successfully
- ✅ Session restored

**Result**: ___________

---

## Test Summary Sheet

Total Tests: 60+

| Group | Tests | Pass | Fail | Notes |
|-------|-------|------|------|-------|
| 1. Login Page (No Maintenance) | 3 | ___ | ___ | |
| 2. Maintenance Start | 4 | ___ | ___ | |
| 3. Login Blocked | 3 | ___ | ___ | |
| 4. WebSocket Real-Time | 3 | ___ | ___ | |
| 5. Forced Logout (Connected) | 3 | ___ | ___ | |
| 6. Forced Logout (Offline) | 2 | ___ | ___ | |
| 7. Access Logs | 2 | ___ | ___ | |
| 8. Admin Dashboard | 3 | ___ | ___ | |
| 9. Dark/Light Mode | 2 | ___ | ___ | |
| 10. Error Scenarios | 4 | ___ | ___ | |
| 11. Permission Checks | 3 | ___ | ___ | |
| 12. Browser Compatibility | 3 | ___ | ___ | |
| 13. Mobile Responsiveness | 2 | ___ | ___ | |
| 14. Performance | 2 | ___ | ___ | |
| 15. Session Persistence | 2 | ___ | ___ | |
| **TOTAL** | **42** | **___** | **___** | |

---

## Regression Testing

Before commit, verify no existing functionality broken:

- [ ] Regular login (no maintenance)
- [ ] Dashboard access
- [ ] File upload/download
- [ ] User profile updates
- [ ] Role-based features
- [ ] Search functionality
- [ ] Pagination
- [ ] Dark/light mode toggle

---

## Sign Off

**Tester**: ___________________
**Date**: ___________________
**Status**: ✅ Ready for Deployment / ⚠️ Issues Found
**Notes**: ___________________
