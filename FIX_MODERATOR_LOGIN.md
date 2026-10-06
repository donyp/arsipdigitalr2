# Fix Moderator Login - Session Cleanup Guide

## Problem
Moderator akun sudah logout tapi masih menunjukkan "1/1 active sessions", sehingga tidak bisa login kembali.

## Root Cause
Session lama masih memiliki `expires_at` di masa depan, jadi `cleanup_expired_sessions()` tidak menandainya sebagai inactive. Hanya menghapus session yang sudah expired (expires_at < NOW()).

## Solusi

Ada 3 cara untuk fix ini (dari paling mudah ke paling kompleks):

### Cara 1: Gunakan Admin Dashboard (Paling Mudah - Recommended) ✅

#### Langkah 1: Login sebagai Admin/Super Admin
1. Buka dashboard
2. Login dengan akun super_admin atau admin yang memiliki permission `manage_users`

#### Langkah 2: Buka Admin Panel
1. Pergi ke menu Admin → User Management atau Sessions
2. Cari akun moderator

#### Langkah 3: Force Logout Moderator
1. Klik tombol "Force Logout" atau "Terminate All Sessions"
2. Sistem akan memanggil endpoint `/api/admin/force-logout-user/:userId`
3. Semua session moderator akan di-terminate (is_active = FALSE)

#### Langkah 4: Moderator bisa login
- Moderator sekarang bisa login dengan credential biasa

---

### Cara 2: Gunakan API Endpoint Langsung

#### Prerequisites:
- Admin/Super Admin JWT token
- `curl` atau tool HTTP client (Postman, etc)

#### Step A: Get Admin JWT Token
```bash
# Login sebagai admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your_admin_password"
  }'

# Response akan berisi JWT token
# Ambil nilai dari "token" field
```

#### Step B: Get Moderator User ID
```bash
# Gunakan token di atas, ganti TOKEN dengan actual token
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer TOKEN"
```

Atau query database langsung untuk cari moderator:
```sql
SELECT id, email FROM users WHERE email = 'moderator' OR role = 'moderator' LIMIT 1;
```

#### Step C: Force Logout Moderator
```bash
# Ganti TOKEN dengan admin JWT token
# Ganti MODERATOR_USER_ID dengan actual ID dari moderator

curl -X POST http://localhost:5000/api/admin/force-logout-user/MODERATOR_USER_ID \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json"
```

#### Step D: Verify
```bash
# Session moderator sudah di-terminate
curl -X POST http://localhost:5000/api/admin/cleanup-stale-sessions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json"

# Response:
# { "success": true, "message": "Stale sessions cleaned up successfully", "activeSessionsRemaining": 0 }
```

---

### Cara 3: Langsung SQL Query ke Database (Paling Direct)

Jika dashboard tidak bisa diakses atau ada issue lain:

#### Step A: Cari Moderator User ID
```sql
SELECT id, email FROM users WHERE email = 'moderator' OR role = 'moderator' LIMIT 1;
```

#### Step B: Lihat Session yang aktif
```sql
SELECT 
    id,
    session_token,
    created_at,
    expires_at,
    is_active,
    (expires_at - NOW()) as time_remaining
FROM user_sessions
WHERE user_id = 'MODERATOR_USER_ID'
ORDER BY created_at DESC;
```

#### Step C: Force Terminate ALL Sessions untuk Moderator
```sql
UPDATE user_sessions
SET is_active = FALSE
WHERE user_id = 'MODERATOR_USER_ID'
AND is_active = TRUE;
```

#### Step D: Verify Cleanup
```sql
SELECT COUNT(*) as active_sessions
FROM user_sessions
WHERE user_id = 'MODERATOR_USER_ID'
AND is_active = TRUE;

-- Should return: 0
```

---

## Setelah Fix

1. ✅ Moderator bisa login lagi
2. ✅ Akan membuat session baru yang fresh
3. ✅ Audit log akan tercatat bahwa admin sudah force-logout

## Monitoring Ke Depan

Untuk mencegah issue ini terjadi lagi:

1. **Auto-cleanup on Login** sudah implemented (line 1533 di server.js)
   - Setiap login attempt, sistem akan cleanup expired sessions dulu
   
2. **Stale Session Detection** bisa ditambahkan
   - Cleanup tidak hanya yang expired, tapi juga yang "stale" (tua tapi belum expired)

3. **Session Monitoring Dashboard**
   - Monitor active sessions per user
   - Set alert jika user punya banyak active sessions

---

## Technical Details

**File yang relevan:**
- `backend/server.js` - Login endpoint (line ~1387), Admin endpoints (line ~7802, ~7864)
- `backend/session-manager.js` - Session management logic
- Database: `user_sessions` table

**Endpoints yang bisa digunakan:**
- `POST /api/admin/cleanup-stale-sessions` - Cleanup semua expired sessions
- `POST /api/admin/force-logout-user/:userId` - Force logout specific user
- `POST /api/auth/login` - Normal login (sudah ada auto-cleanup)

---

## Kontacts untuk Support

Jika masih ada issue:
1. Check server logs: `backend/.env` LOG_LEVEL = debug
2. Check audit logs di database
3. Pastikan admin account punya permission `manage_users`
