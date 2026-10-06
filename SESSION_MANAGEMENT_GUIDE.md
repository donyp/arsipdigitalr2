# 🎯 Session Management Dashboard - Quick Start Guide

## 📋 Overview

Anda sekarang punya **Session Management Dashboard** yang bisa diakses dari menu sidebar. Dashboard ini memungkinkan Anda untuk:

- ✅ Lihat semua active sessions dari semua users
- ✅ Monitor user yang online
- ✅ Deteksi user yang sudah mencapai session limit
- ✅ Force logout users yang stuck dengan session lama
- ✅ View detail setiap session (token, created time, expires time, last activity)

---

## 🚀 Cara Menggunakan

### Step 1: Login ke Dashboard
1. Login dengan akun moderator/admin ke dashboard
2. Lihat menu sidebar di sebelah kiri

### Step 2: Buka Session Management
1. Di sidebar, cari menu **"Session Management"** (icon WiFi)
2. Klik untuk membuka dashboard

### Step 3: Lihat Sessions yang Active
- Dashboard akan menampilkan semua active sessions dalam bentuk tabel
- Setiap row menampilkan:
  - **User**: Nama pengguna
  - **Email**: Email user
  - **Role**: Posisi user (super_admin, admin_zona, moderator, user)
  - **Active Sessions**: Berapa banyak session yang active (contoh: 1/1, 2/2)
  - **Last Activity**: Kapan terakhir user aktif
  - **Actions**: Tombol untuk view details atau force logout

### Step 4: Lakukan Force Logout (jika diperlukan)

**Kasus:** Moderator stuck dengan "1/1 active sessions" meskipun sudah logout.

**Solusi:**
1. Cari user yang bermasalah di tabel
2. Klik tombol **"Force Logout"** pada row user tersebut
3. Sistem akan meminta konfirmasi
4. Klik **"Yes, Force Logout"**
5. ✅ Semua session user akan di-terminate
6. User bisa login kembali dengan fresh session

---

## 📊 Monitoring Features

### Stats Cards (atas dashboard)
- **Total Active Sessions**: Jumlah semua session yang aktif
- **Online Users**: Berapa user yang currently online
- **At Limit**: Berapa user yang sudah mencapai session limit (⚠️ Yellow indicator)

### Real-time Updates
- Dashboard auto-refresh setiap 30 detik
- Atau klik tombol **"Refresh"** di kanan atas untuk update manual

### Session Details Modal
1. Klik tombol **"View"** pada setiap user
2. Modal akan menampilkan:
   - Semua session detail untuk user tersebut
   - Token (truncated for security)
   - Created time
   - Expires time
   - Last activity
   - Status (Active/Inactive)

---

## ⚙️ Backend Endpoints (untuk developers)

```bash
# List semua active sessions
GET /api/admin/list-user-sessions
Authorization: Bearer {token}

# Get sessions untuk specific user
GET /api/admin/user-sessions/{userId}
Authorization: Bearer {token}

# Force logout user (terminate all sessions)
POST /api/admin/force-logout-user/{userId}
Authorization: Bearer {token}
```

Semua endpoint require permission `manage_users`.

---

## 🔧 Session Limit Rules

- **Super Admin & Moderator**: Max 1 active session
- **Admin Zona**: Max 2 active sessions
- **Regular User**: Max 2 active sessions (configurable)

Ketika user mencapai limit, mereka tidak bisa login dengan device/browser baru kecuali:
1. Logout dari session yang sudah ada, ATAU
2. Admin force logout menggunakan dashboard ini

---

## 🐛 Troubleshooting

### Problema: "User tidak bisa logout dari session"

**Solusi:**
1. Buka Session Management
2. Cari user yang bermasalah
3. Klik "Force Logout"
4. User bisa login kembali

### Problema: Dashboard tidak menampilkan sessions

**Kemungkinan penyebab:**
- Tidak ada user yang active
- Koneksi internet terputus
- Coba refresh dengan tombol "Refresh"

### Problema: Permission Denied

**Kemungkinan penyebab:**
- Account Anda tidak punya permission `manage_users`
- Hubungi admin untuk grant permission
- Atau login dengan account yang lebih tinggi (super_admin)

---

## 📝 Audit & Security

✅ Setiap force logout tercatat di **Audit Logs**:
- Siapa yang melakukan force logout
- User mana yang di-logout
- Kapan waktu force logout
- IP address & user agent

Anda bisa lihat di menu **Audit Logs** → cari action `"Admin: Force Logout User"`.

---

## 🎯 Common Use Cases

### Case 1: Fix stuck moderator login
1. Moderator dapat error "1/1 active sessions" saat login
2. Buka Session Management
3. Cari moderator di tabel
4. Klik Force Logout
5. ✅ Moderator bisa login normal

### Case 2: Monitor session quota
1. Lihat stats "At Limit" di atas
2. User yang at-limit akan highlighted dengan yellow background
3. Proactive force logout jika terlalu banyak stuck sessions

### Case 3: Debug session issues
1. Klik "View" pada user yang bermasalah
2. Lihat detail setiap session (created time, expires time, last activity)
3. Tentukan session mana yang stale/stuck
4. Force logout user jika diperlukan

---

## 🔐 Security Notes

✅ **Secure by design:**
- Requires authentication (JWT token)
- Requires permission (`manage_users`)
- Session tokens di-truncate di UI (hanya tampil 16 chars pertama)
- Semua action tercatat di audit log
- Tidak ada hardcoded credentials diperlukan

---

## 📞 Support

Jika ada masalah:
1. Check file `FIX_MODERATOR_LOGIN.md` untuk detailed troubleshooting
2. Check `CLEANUP_STALE_SESSIONS.sql` untuk manual SQL cleanup (last resort)
3. Check **Audit Logs** untuk trace activity
4. Hubungi admin untuk technical support

---

**Version**: 1.0
**Added**: Session Management Dashboard (Commit: 92cdf2a)
**Features**: Real-time monitoring, Force logout, Session details, Auto-refresh
