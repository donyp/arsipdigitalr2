# Test JWT Token API Access

## Overview
After removing the Daily Token system, JWT tokens are now the primary authentication mechanism for API access. This document provides comprehensive testing guidance for verifying JWT token functionality across all protected endpoints.

## JWT Token Flow

### 1. Obtaining a JWT Token
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "doni", "password": "Password123!"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Login berhasil",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI...",
  "user": {
    "id": "user-uuid",
    "username": "doni",
    "email": "doni@example.com",
    "role": "super_admin"
  }
}
```

### 2. Using JWT Token for API Access
All protected endpoints require the JWT token in the Authorization header:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## Automated Testing

### Run Test Script
```bash
# On local machine
node backend/test-jwt-access.js

# On VPS
ssh root@202.10.38.249
cd /root/arsipdigitalr2
node backend/test-jwt-access.js
```

### Expected Results
```
✅ Passed: 10
❌ Failed: 0
📊 Total: 10

🎉 All JWT access tests passed!
```

---

## Manual Testing - Protected Endpoints

### Test 1: GET /api/auth/me (Get Current User)
```bash
TOKEN="<JWT_TOKEN_FROM_LOGIN>"

curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "username": "doni",
    "email": "doni@example.com",
    "role": "super_admin",
    "zona_id": null
  }
}
```

**Failure Cases:**
- No token: 401 Unauthorized
- Invalid token: 401 Unauthorized
- Expired token: 401 Unauthorized

---

### Test 2: GET /api/files (List Files)
```bash
curl -X GET "http://localhost:5000/api/files?limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200):**
```json
{
  "files": [
    {
      "id": "file-id",
      "nama_file": "document.pdf",
      "owner_id": "user-id",
      "created_at": "2026-10-10T12:00:00Z",
      ...
    }
  ],
  "total": 150,
  "limit": 10,
  "offset": 0
}
```

---

### Test 3: GET /api/invoices (List Invoices)
```bash
curl -X GET "http://localhost:5000/api/invoices?limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200):**
```json
{
  "invoices": [
    {
      "id": "invoice-id",
      "faktur": "INV-001",
      "status": "confirmed",
      ...
    }
  ],
  "total": 50,
  "limit": 10,
  "offset": 0
}
```

---

### Test 4: GET /api/zonas (List Zones)
```bash
curl -X GET "http://localhost:5000/api/zonas" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200):**
```json
{
  "zones": [
    {
      "id": "zone-id",
      "zone_name": "Jakarta",
      "created_at": "2026-01-01T00:00:00Z",
      ...
    }
  ]
}
```

---

### Test 5: POST Endpoint (Create Resource)
```bash
# Example: Create support ticket
curl -X POST http://localhost:5000/api/support/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Test ticket",
    "message": "This is a test",
    "category": "general"
  }'
```

**Expected Response (201/200):**
```json
{
  "success": true,
  "ticket": {
    "id": "ticket-id",
    "subject": "Test ticket",
    ...
  }
}
```

---

### Test 6: PUT Endpoint (Update Resource)
```bash
# Example: Update user profile
curl -X PUT http://localhost:5000/api/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "email": "updated@example.com"
  }'
```

**Expected Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "user-id",
    "name": "Updated Name",
    "email": "updated@example.com",
    ...
  }
}
```

---

### Test 7: DELETE Endpoint (Delete Resource)
```bash
# Example: Delete a file
curl -X DELETE http://localhost:5000/api/files/{file_id} \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

---

## Error Handling Tests

### Test 1: Missing Authorization Header
```bash
curl -X GET http://localhost:5000/api/auth/me
```

**Expected Response (401):**
```json
{
  "error": "Authorization header missing",
  "success": false
}
```

---

### Test 2: Invalid Token Format
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer invalid.token.format"
```

**Expected Response (401):**
```json
{
  "error": "Invalid token",
  "success": false
}
```

---

### Test 3: Malformed Bearer Header
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: InvalidToken xyz123"
```

**Expected Response (401):**
```json
{
  "error": "Invalid authorization header format",
  "success": false
}
```

---

### Test 4: Expired Token
```bash
# Create a token with short expiry, wait for it to expire
# Then try to use it

curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <EXPIRED_TOKEN>"
```

**Expected Response (401):**
```json
{
  "error": "Token expired",
  "success": false
}
```

---

## JWT Token Structure Verification

### Decode JWT Token (without verification)
```bash
TOKEN="<JWT_TOKEN>"

# Extract payload (2nd part after first dot)
PAYLOAD=$(echo $TOKEN | cut -d '.' -f2)

# Decode base64
echo $PAYLOAD | base64 -d | jq .
```

**Expected Payload:**
```json
{
  "userId": "user-uuid",
  "username": "doni",
  "email": "doni@example.com",
  "role": "super_admin",
  "zona_id": null,
  "stage": "authenticated",
  "iat": 1728565200,
  "exp": 1728651600
}
```

### Verify Token Signature
```bash
# Check that token is properly signed
node -e "
const jwt = require('jsonwebtoken');
const token = process.env.JWT_TOKEN;
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log('✅ Token is valid');
  console.log('Expires in:', new Date(decoded.exp * 1000).toISOString());
} catch (err) {
  console.log('❌ Token verification failed:', err.message);
}
"
```

---

## Role-Based Access Control (RBAC) Testing

### Test 1: Admin-Only Endpoint
```bash
# This endpoint should only work for super_admin role
curl -X POST http://localhost:5000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "newuser@example.com", "role": "user"}'
```

**If user is super_admin:**
- Expected: 201/200 Created
- Response: New user created

**If user is not super_admin:**
- Expected: 403 Forbidden
- Response: `{"error": "Insufficient permissions"}`

---

### Test 2: Moderator-Only Endpoint
```bash
# Example: Access support ticket management (moderator+)
curl -X GET http://localhost:5000/api/support/tickets/all \
  -H "Authorization: Bearer $TOKEN"
```

**If user is moderator or super_admin:**
- Expected: 200 OK
- Response: All support tickets

**If user is regular user:**
- Expected: 403 Forbidden
- Response: `{"error": "Only moderators can view all tickets"}`

---

## Token Refresh/Extension Testing

### Check if Token Refresh Endpoint Exists
```bash
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Authorization: Bearer $TOKEN"
```

**If endpoint exists:**
- Expected: 200 OK
- Response: New JWT token

**If endpoint doesn't exist:**
- Expected: 404 Not Found (this is acceptable)

---

## Security Tests

### Test 1: Verify JWT Secret is Strong
```bash
# Check JWT_SECRET env var length (should be 32+ characters for HS256)
echo "Length: ${#JWT_SECRET}"
```

**Expected:** ✅ Length ≥ 32 characters

---

### Test 2: Verify Token Expiration is Set
```bash
# Check JWT_EXPIRES_IN env var
echo $JWT_EXPIRES_IN
```

**Expected:** ✅ Valid duration like "24h", "7d", etc.

---

### Test 3: Verify HTTPS in Production
```bash
# On production VPS, verify all API calls use HTTPS
curl -v https://arsipdigitalanka.my.id/api/auth/me \
  -H "Authorization: Bearer $TOKEN" 2>&1 | grep -E "SSL|TLS|HTTP"
```

**Expected:** ✅ TLS/SSL connection established

---

## Troubleshooting

### Issue: 401 Unauthorized on Valid Token
**Possible Causes:**
1. JWT_SECRET doesn't match between login and protected endpoints
2. Token is malformed or truncated
3. Authorization header format is incorrect

**Solution:**
```bash
# Verify JWT_SECRET is the same
echo "JWT_SECRET: $JWT_SECRET"

# Verify token is complete (should have 3 parts separated by dots)
echo $TOKEN | tr '.' '\n' | wc -l  # Should output 3

# Verify Authorization header format
curl -v -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/auth/me 2>&1 | grep Authorization
```

---

### Issue: Token Expires Too Quickly
**Possible Causes:**
1. JWT_EXPIRES_IN is set to very short duration
2. Token was generated before code change

**Solution:**
```bash
# Check JWT_EXPIRES_IN setting
echo $JWT_EXPIRES_IN

# Update in .env file if needed (recommended: "24h")
# Then restart server
```

---

### Issue: CORS Error When Using JWT Token
**Possible Causes:**
1. ALLOWED_ORIGINS env var doesn't include frontend origin
2. CORS middleware not configured for Authorization header

**Solution:**
```bash
# Check ALLOWED_ORIGINS
echo $ALLOWED_ORIGINS

# Should include your frontend URL:
# http://localhost:3000,https://arsipdigitalanka.my.id

# Verify server logs for CORS errors
# Look for: "CORS", "cross-origin", "origin"
```

---

## Complete Test Checklist

### Authentication
- [ ] Login with valid credentials returns JWT token
- [ ] Login with invalid credentials returns 401
- [ ] Token includes all required claims (userId, username, email, role, stage)
- [ ] Token is properly signed with JWT_SECRET
- [ ] Token expires after JWT_EXPIRES_IN duration

### API Access
- [ ] GET endpoints accessible with valid JWT
- [ ] POST endpoints accessible with valid JWT
- [ ] PUT endpoints accessible with valid JWT
- [ ] DELETE endpoints accessible with valid JWT
- [ ] Requests without token return 401
- [ ] Requests with invalid token return 401

### Authorization
- [ ] Admin endpoints reject non-admin users (403)
- [ ] Moderator endpoints accept moderators and admins
- [ ] User endpoints only access own data (where applicable)
- [ ] Role-based permissions are enforced

### Security
- [ ] HTTPS used in production
- [ ] JWT_SECRET is strong (32+ characters)
- [ ] JWT_EXPIRES_IN is reasonable (24h or less)
- [ ] Token not exposed in logs or responses
- [ ] CORS properly configured for token requests

### Backwards Compatibility
- [ ] Old token endpoints return 404 (/api/auth/verify-token)
- [ ] Old token endpoints return 404 (/api/auth/resend-token)
- [ ] Existing features work with JWT tokens
- [ ] No breaking changes to API

---

## Summary

JWT tokens are now the primary authentication mechanism. All tests should verify:
1. ✅ Tokens are issued correctly on login
2. ✅ Tokens authenticate API requests
3. ✅ Tokens expire as configured
4. ✅ Invalid/missing tokens are rejected
5. ✅ Role-based access control works
6. ✅ Old token system endpoints are removed
