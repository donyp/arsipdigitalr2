# Test Login Flow - Simplified Authentication

## Overview
After removing the Daily Token (2FA) system, the login flow is now simplified to:
1. User enters username and password
2. Backend validates credentials
3. Backend returns JWT token directly (no token verification step)
4. User is logged in and can access the application

## Manual Test Steps

### Test 1: Test Invalid Credentials
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "nonexistent", "password": "wrongpass"}'
```

**Expected Response:**
- Status: 401 Unauthorized
- Body: `{"success": false, "error": "Username atau password salah"}`

---

### Test 2: Test Missing Password
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "doni"}'
```

**Expected Response:**
- Status: 400 Bad Request
- Body: `{"success": false, "error": "Username dan password harus diisi"}`

---

### Test 3: Test Missing Username
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "Password123!"}'
```

**Expected Response:**
- Status: 400 Bad Request
- Body: `{"success": false, "error": "Username dan password harus diisi"}`

---

### Test 4: Test Successful Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "doni", "password": "Password123!"}'
```

**Expected Response:**
- Status: 200 OK
- Body:
```json
{
  "success": true,
  "message": "Login berhasil",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "username": "doni",
    "email": "user@example.com",
    "role": "super_admin"
  }
}
```

---

### Test 5: Test JWT Token Usage
```bash
# Replace TOKEN with the token from Test 4
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer TOKEN"
```

**Expected Response:**
- Status: 200 OK
- Body: User profile information

---

### Test 6: Verify Old Token Endpoints Removed
```bash
# This should return 404 Not Found
curl -X POST http://localhost:5000/api/auth/verify-token \
  -H "Content-Type: application/json" \
  -d '{"tempToken": "dummy", "token": "12345"}'
```

**Expected Response:**
- Status: 404 Not Found

---

```bash
# This should also return 404 Not Found
curl -X POST http://localhost:5000/api/auth/resend-token \
  -H "Content-Type: application/json" \
  -d '{"tempToken": "dummy"}'
```

**Expected Response:**
- Status: 404 Not Found

---

## Automated Testing

### Run Test Script on VPS
```bash
# SSH to VPS
ssh root@202.10.38.249

# Navigate to project
cd /root/arsipdigitalr2

# Run test script
node backend/test-login-simplified.js
```

### Expected Test Results
If all tests pass, you should see:
```
✅ Passed: 9
❌ Failed: 0
📊 Total: 9

🎉 All tests passed! Login flow is working correctly.
```

---

## Checklist for Manual Testing

### Frontend (Browser)
- [ ] Navigate to https://arsipdigitalanka.my.id
- [ ] See login page with only username and password fields
- [ ] NO token input field visible
- [ ] Enter valid credentials
- [ ] Click "Masuk" button
- [ ] See success message (no token verification step)
- [ ] Redirected to dashboard
- [ ] Dashboard loads correctly with user data

### Console Verification
- [ ] Check browser DevTools → Network tab
  - [ ] POST to /api/auth/login successful (200)
  - [ ] Response includes `token` and `user` object
- [ ] Check browser DevTools → Application tab
  - [ ] `jwt_token` stored in localStorage
  - [ ] `user_info` stored in localStorage

### API Verification
- [ ] API endpoints work with JWT token
- [ ] /api/auth/me returns current user info
- [ ] /api/files, /api/invoices etc. work with JWT auth
- [ ] Old token endpoints (/api/auth/verify-token, /api/auth/resend-token) return 404

---

## Troubleshooting

### Issue: Login returns 404
**Solution:**
- Check that `/api/auth/login` endpoint is registered in server.js
- Verify auth-endpoints.js is imported in server.js
- Check server logs for endpoint registration

### Issue: Login returns "Username atau password salah" for valid user
**Solution:**
- Verify password is hashed correctly in database
- Check bcrypt version compatibility
- Manually verify password hash with: `node -e "const bcrypt = require('bcrypt'); console.log(bcrypt.compareSync('PASSWORD', 'HASH'))"`

### Issue: JWT token is invalid
**Solution:**
- Check JWT_SECRET environment variable is set
- Verify JWT_EXPIRES_IN is a valid duration (e.g., "24h")
- Test JWT verification locally: `node -e "const jwt = require('jsonwebtoken'); console.log(jwt.verify('TOKEN', process.env.JWT_SECRET))"`

### Issue: Protected endpoints return 401 even with valid JWT
**Solution:**
- Verify Authorization header format is correct: `Authorization: Bearer TOKEN`
- Check authenticateToken middleware is properly checking JWT
- Verify JWT_SECRET matches between login and protected endpoints

---

## Summary of Changes

### Removed Components
- ❌ Token verification form (STEP 2) from login page
- ❌ /api/auth/verify-token endpoint
- ❌ /api/auth/resend-token endpoint
- ❌ Daily token database table operations
- ❌ Token email sending functionality
- ❌ Token management UI in dashboard

### Kept Components
- ✅ /api/auth/login endpoint (simplified)
- ✅ JWT token generation
- ✅ JWT token verification middleware
- ✅ Protected API endpoints
- ✅ User authentication database
- ✅ Dashboard and application features

### Login Flow Before (with Daily Token)
```
User enters username/password
            ↓
Validates credentials
            ↓
Issues temporary token (tempToken)
            ↓
Sends 5-digit code via email
            ↓
User enters 5-digit code
            ↓
Validates code
            ↓
Issues JWT token
            ↓
Logged in
```

### Login Flow After (Simplified)
```
User enters username/password
            ↓
Validates credentials
            ↓
Issues JWT token directly
            ↓
Logged in
```

---

## Verification Status

| Component | Status | Notes |
|-----------|--------|-------|
| Login endpoint | ✅ Working | Accepts username/password, returns JWT |
| Token form removal | ✅ Complete | No token input field in UI |
| Backend endpoints | ✅ Removed | /verify-token and /resend-token gone |
| Database migration | ⏳ Pending | Run DROP_DAILY_LOGIN_TOKENS_TABLE.sql on Supabase |
| Frontend cleanup | ✅ Complete | No token-related UI elements |
| API access with JWT | ✅ Working | Protected endpoints accessible with JWT token |

---

## Next Steps

1. ✅ Test all endpoints from this guide
2. ⏳ Execute database migration (DROP daily_login_tokens table)
3. ⏳ Deploy to production VPS
4. ⏳ Run full smoke tests on production
5. ⏳ Document any issues found and resolve
