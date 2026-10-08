# 🔐 Daily Token 2FA Implementation Guide

## Overview
Complete 2-factor authentication system with daily 5-digit tokens sent via email using Resend.io service.

**Features:**
- ✅ Username/password verification (Step 1)
- ✅ 5-digit random token from email (Step 2)
- ✅ 3-attempt limit with 15-minute lock after failures
- ✅ Automatic token generation at 04:00 daily
- ✅ Automatic cleanup & auto-logout at 00:00 daily
- ✅ Admin management dashboard for token control
- ✅ Email delivery tracking and resend functionality
- ✅ Session invalidation system for daily logout

---

## 📋 Pre-Deployment Checklist

### 1. Database Setup
```bash
# Run these SQL migrations in Supabase:
# File: backend/CREATE_DAILY_LOGIN_TOKENS_TABLE.sql
# File: backend/CREATE_SESSION_INVALIDATIONS_TABLE.sql
```

**Tables Created:**
- `daily_login_tokens` - Stores daily tokens, attempts, expiry, email status
- `session_invalidations` - Tracks auto-logout events for session invalidation

### 2. Environment Configuration
Update `.env` file with:

```env
# Email Service Configuration
RESEND_API_KEY=your_resend_api_key_here
RESEND_FROM_EMAIL=noreply@arsipdigitalanka.my.id

# JWT & Auth
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=24h

# Auto-Logout Time
AUTO_LOGOUT_TIME=00:00
```

**Get RESEND_API_KEY:**
1. Visit https://resend.com/api-keys
2. Create new API key
3. Copy and paste into .env
4. Set up sender email (verify domain if using custom domain)

### 3. Package Installation
```bash
cd backend
npm install
```

**New Dependencies Added:**
- `node-cron@^3.0.3` - For scheduled tasks (04:00 & 00:00)
- `resend@^3.0.0` - For email delivery

### 4. Backend Integration
All endpoints are automatically registered in `backend/server.js`:
- DailyTokenService initialized with Resend config
- Daily token endpoints registered
- Admin endpoints registered
- Scheduler started

---

## 🔄 Login Flow (User Perspective)

### Step 1: Login Page
```
User enters: Email + Password
↓
System calls: POST /api/auth/login
↓
Response: If valid → tempToken (valid 5 minutes) + email address
If invalid → Error message (401)
```

### Step 2: Token Verification
```
User checks email for 5-digit code
↓
User enters: 5-digit token
↓
System calls: POST /api/auth/verify-token (with tempToken + token)
↓
Response: If valid → Full JWT token + redirect to dashboard
If invalid → Error + show "Sisa X/3 percobaan"
After 3 failures → Lock 15 minutes
```

---

## 🔌 API Endpoints

### Authentication Endpoints

#### 1. POST `/api/auth/login`
**Purpose:** Verify username and password (Step 1)

**Request:**
```json
{
  "username": "user@example.com",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password benar. Masukkan kode dari email Anda",
  "tempToken": "eyJhbGc...",
  "email": "user@example.com",
  "expiresIn": 300
}
```

**Error Responses:**
- `401` - Username atau password salah
- `403` - Email tidak valid (no valid email set)
- `400` - Missing username or password

---

#### 2. POST `/api/auth/verify-token`
**Purpose:** Verify 5-digit token with attempt tracking

**Request:**
```json
{
  "tempToken": "eyJhbGc...",
  "token": "12345"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login berhasil",
  "token": "eyJhbGc...",
  "user": {
    "id": 1,
    "username": "user@example.com",
    "email": "user@example.com"
  }
}
```

**Failed Token Response (401):**
```json
{
  "success": false,
  "error": "Kode salah",
  "message": "Kode salah. Sisa 2/3 percobaan",
  "attempts": 1,
  "remainingAttempts": 2,
  "isLocked": false
}
```

**Locked Response (401):**
```json
{
  "success": false,
  "error": "Terlalu banyak percobaan",
  "message": "Terlalu banyak percobaan. Coba lagi dalam 15 menit",
  "locked": true,
  "lockedUntil": "2026-10-08T12:45:00Z",
  "attempts": 3
}
```

**Error Responses:**
- `401` - Session expired (5 min timeout on tempToken)
- `400` - Missing tempToken or token

---

#### 3. POST `/api/auth/resend-token`
**Purpose:** Resend token to user's email

**Request:**
```json
{
  "tempToken": "eyJhbGc..."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Kode sudah dikirim ulang ke email Anda"
}
```

---

### Admin Management Endpoints

#### 4. GET `/api/auth/daily-tokens` (Admin Only)
**Purpose:** View all daily tokens and their status

**Query Params:**
- `limit` (default: 100) - Max results
- `offset` (default: 0) - Pagination offset
- `userId` (optional) - Filter by specific user

**Response:**
```json
{
  "success": true,
  "tokens": [
    {
      "id": 1,
      "userId": 5,
      "username": "admin@example.com",
      "email": "admin@example.com",
      "token": "12345",
      "createdAt": "2026-10-08T04:00:00Z",
      "expiresAt": "2026-10-09T04:00:00Z",
      "tokenAttempts": 0,
      "isLocked": false,
      "isUsed": false,
      "emailSent": true
    }
  ],
  "count": 1
}
```

---

#### 5. POST `/api/auth/generate-tokens-now` (Admin Only)
**Purpose:** Manually trigger token generation and sending

**Response:**
```json
{
  "success": true,
  "message": "Token generation completed",
  "generated": 25,
  "sent": 23,
  "total": 25,
  "results": [...]
}
```

---

#### 6. POST `/api/auth/cleanup-expired-now` (Admin Only)
**Purpose:** Manually cleanup expired tokens

**Response:**
```json
{
  "success": true,
  "message": "Expired tokens cleaned up"
}
```

---

#### 7. POST `/api/auth/resend-token-manual` (Admin Only)
**Purpose:** Admin resends token to specific user

**Request:**
```json
{
  "tokenId": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token resent successfully"
}
```

---

#### 8. DELETE `/api/auth/delete-token/:id` (Admin Only)
**Purpose:** Delete a token (forces user to login again)

**Response:**
```json
{
  "success": true,
  "message": "Token deleted successfully"
}
```

---

#### 9. POST `/api/auth/reset-attempts/:userId` (Admin Only)
**Purpose:** Reset failed attempts for a user

**Response:**
```json
{
  "success": true,
  "message": "Attempts reset successfully"
}
```

---

## 📊 Admin Dashboard

### Access
Navigate to: `http://localhost:5000/token-management.html`

### Features

**Statistics Display:**
- Token Hari Ini - Count of tokens generated today
- Token Terkirim - Count of emails sent successfully
- Email Gagal - Count of failed email deliveries
- Terakhir Update - Last stats update timestamp

**Search & Filter:**
- Search by username or email
- Filter by status: Generated, Sent, Used, Failed, Locked

**Actions:**
- 📨 Generate Token Sekarang - Manual immediate token generation
- 🔄 Refresh Stats - Update statistics
- 🗑️ Cleanup Expired - Delete all expired tokens
- Resend - Resend token to specific user
- Delete - Remove token

**System Information:**
- Token generation time: 04:00 daily
- Auto-logout time: 00:00 daily
- Token validity: 24 hours
- Max attempts: 3 with 15-minute lock
- Token format: 5 random digits
- Email service: Resend.io

---

## 🔄 Scheduled Tasks

### 1. Token Generation (04:00 Daily)
```
04:00 every day:
├─ Fetch all users with valid email
├─ Generate unique 5-digit token for each
├─ Send email via Resend
├─ Mark email_sent = true
└─ Log results
```

**Email Template:**
- Header: 🔐 Kode Akses Login Harian
- Content: 5-digit token (large display)
- Warnings: Do not share, 24-hour validity
- Footer: Auto-generated, no reply needed

---

### 2. Cleanup & Auto-Logout (00:00 Daily)
```
00:00 every day:
├─ Delete all expired tokens from DB
├─ Create session_invalidations record
├─ Invalidate all active JWTs issued before this time
└─ Force clients to login again
```

**Implementation:**
- Middleware checks: `token.iat < last_invalidation.invalidated_at`
- If true → Reject with "Session invalidated" error
- User must login again (new 2FA flow)

---

## 🧪 Testing Checklist

### Manual Testing

#### Test 1: Successful Login Flow
- [ ] Navigate to login page
- [ ] Enter valid email and password
- [ ] See success notification "Password benar!"
- [ ] Token verification form appears
- [ ] Email received with 5-digit code
- [ ] Enter code in form
- [ ] Login successful, redirected to dashboard
- [ ] JWT token stored in localStorage

#### Test 2: Wrong Password
- [ ] Enter valid email, wrong password
- [ ] See error: "Email atau password salah"
- [ ] Stay on login form, can retry

#### Test 3: Invalid Email (No Email Set)
- [ ] Enter valid email with no email field
- [ ] See error: "Email tidak valid. Hubungi administrator"

#### Test 4: Wrong Token - Attempt Tracking
- [ ] Pass Step 1 (valid credentials)
- [ ] Enter wrong 5-digit code (e.g., "00000")
- [ ] See error with "Sisa 2/3 percobaan"
- [ ] Enter wrong code again
- [ ] See "Sisa 1/3 percobaan"
- [ ] Enter wrong code third time
- [ ] See lock error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit"
- [ ] Button/form disabled for 15 minutes
- [ ] After 15 minutes, can try again

#### Test 5: Token Resend
- [ ] Pass Step 1
- [ ] Don't have email, click "Kirim Ulang Kode"
- [ ] See success: "Kode sudah dikirim ulang"
- [ ] Check email for new code
- [ ] Verify old code still works (same token until expiry)

#### Test 6: Back Button
- [ ] Pass Step 1, on token form
- [ ] Click "← Kembali" button
- [ ] Return to login form (username/password)
- [ ] Form cleared and ready for new login

#### Test 7: Session Invalidation (00:00)
- [ ] Login successfully before 00:00
- [ ] Wait for scheduler to run at 00:00
- [ ] Make API request after 00:00
- [ ] See error: "Sesi Anda telah berakhir"
- [ ] Redirected to login page

#### Test 8: Token Expiry (24 hours)
- [ ] Generate token at time T
- [ ] At time T+24h, token should be expired
- [ ] Entering expired token should fail
- [ ] Token appears in cleanup at 00:00 (midnight)

---

### Admin Dashboard Testing

#### Test 1: View Tokens
- [ ] Login as super_admin or moderator
- [ ] Navigate to `/token-management.html`
- [ ] See list of tokens with columns:
  - User, Email, Token, Status, Attempts, Generated, Expires
- [ ] Tokens displayed with correct status badges

#### Test 2: Statistics
- [ ] Check stat cards show current counts
- [ ] "Token Hari Ini" matches today's count
- [ ] "Token Terkirim" matches sent count
- [ ] Refresh button updates stats immediately

#### Test 3: Search & Filter
- [ ] Search for user by username or email
- [ ] Results filtered correctly
- [ ] Filter by status, see only matching tokens
- [ ] Combine search + filter works

#### Test 4: Generate Tokens Now
- [ ] Click "📨 Generate Token Sekarang"
- [ ] Confirm dialog appears
- [ ] Click confirm
- [ ] Success message with count
- [ ] New tokens appear in list
- [ ] Emails sent to all users with valid email

#### Test 5: Manual Resend
- [ ] Find a token in list
- [ ] Click "Resend" button
- [ ] Confirm dialog
- [ ] Success notification
- [ ] User receives email with same token

#### Test 6: Delete Token
- [ ] Find a token
- [ ] Click "Delete" button
- [ ] Confirm
- [ ] Token removed from list
- [ ] User can still login if token not yet used
- [ ] Token no longer valid if not used

---

### Database Verification

#### Check Token Records
```sql
-- View all tokens created today
SELECT * FROM daily_login_tokens 
WHERE DATE(created_at) = CURDATE() 
ORDER BY created_at DESC;

-- Check token status
SELECT id, user_id, token, is_used, email_sent, 
       token_attempts, is_locked, expires_at 
FROM daily_login_tokens 
WHERE user_id = 5;

-- Verify attempts reset after lock expiry
SELECT token_attempts, is_locked, locked_until 
FROM daily_login_tokens 
WHERE is_locked = true;
```

#### Check Session Invalidations
```sql
-- View all invalidation events
SELECT * FROM session_invalidations 
ORDER BY invalidated_at DESC 
LIMIT 10;

-- Latest invalidation (used for JWT validation)
SELECT * FROM session_invalidations 
ORDER BY invalidated_at DESC 
LIMIT 1;
```

---

## 🚀 Deployment Steps

### Step 1: Database Migration
```bash
# Copy SQL migration files to Supabase SQL editor:
1. CREATE_DAILY_LOGIN_TOKENS_TABLE.sql
2. CREATE_SESSION_INVALIDATIONS_TABLE.sql

# Execute both scripts in order
```

### Step 2: Environment Configuration
```bash
# Set in production environment:
RESEND_API_KEY=<from Resend.io>
RESEND_FROM_EMAIL=noreply@yourdomain.com
JWT_SECRET=<generate new>
AUTO_LOGOUT_TIME=00:00
```

### Step 3: Install & Restart
```bash
cd backend
npm install
npm start
```

### Step 4: Verify Services
```
Check server logs for:
✅ Daily Token authentication endpoints registered
✅ Daily Token admin endpoints registered
✅ Daily Token scheduler started

If any fail, check:
- RESEND_API_KEY is valid
- Supabase tables created
- node-cron installed
- resend package installed
```

### Step 5: Manual Test
```bash
# Trigger token generation immediately (don't wait for 04:00)
curl -X POST http://localhost:5000/api/auth/generate-tokens-now \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json"

# Should generate and send tokens to all users with email
```

---

## 🐛 Troubleshooting

### Issue: "Email service not initialized"
**Solution:**
- Verify RESEND_API_KEY in .env
- Check Resend account has valid sender domain
- Test with `node -e "const R = require('resend'); console.log(new R(process.env.RESEND_API_KEY))"`

### Issue: Tokens not sending at 04:00
**Solution:**
- Check server timezone (scheduler uses server time)
- Verify node-cron installed: `npm list node-cron`
- Check server logs for "[Scheduler]" messages
- Try manual trigger: POST /api/auth/generate-tokens-now

### Issue: Users auto-logged out before 00:00
**Solution:**
- Check AUTO_LOGOUT_TIME setting (should be 00:00)
- Verify session_invalidations table has no extra records
- Check authenticateToken middleware includes invalidation check

### Issue: Token attempts not resetting after 15 min
**Solution:**
- Verify locked_until timestamp is set correctly
- Check authenticateToken logic in daily-token-endpoints.js
- Manual reset: POST /api/auth/reset-attempts/:userId

### Issue: Resend emails not received
**Solution:**
- Check Resend dashboard for bounce/reject events
- Verify email addresses in users table are valid
- Test with POST /api/auth/resend-token-manual (admin)
- Check spam folder / email filtering rules
- Verify RESEND_FROM_EMAIL domain is verified in Resend

---

## 📞 Support

For issues, check:
1. Server logs: `[DailyToken]`, `[Auth]`, `[Scheduler]` messages
2. Resend dashboard: Email delivery status
3. Supabase database: Token records and session invalidations
4. Admin dashboard: /token-management.html for stats

---

## 📝 Summary

**Complete 2FA System with:**
- ✅ Daily auto-token generation (04:00)
- ✅ Daily auto-logout (00:00)
- ✅ 3-attempt limit with 15-min lock
- ✅ Email delivery via Resend
- ✅ Admin management dashboard
- ✅ Session invalidation system
- ✅ Scheduled background jobs
- ✅ Attempt tracking & reset
- ✅ Error handling & logging
- ✅ Production-ready implementation

**Implementation Status: ✅ COMPLETE & READY FOR TESTING**
