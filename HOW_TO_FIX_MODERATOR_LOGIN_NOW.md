# 🔧 Cara Fix Moderator Login Sekarang

## Situasi
Moderator sudah logout semalam, tapi pagi ini tidak bisa login dengan error:
```
Max concurrent sessions limit reached (1/1)
```

Padahal tidak ada yang login saat ini.

---

## ✅ Solusi (3 Langkah Mudah)

### Langkah 1: Login ke Dashboard
1. Buka browser
2. Go to: `https://arsipdigitalanka.my.id` (atau URL lokal)
3. Login dengan akun **super_admin** atau **moderator** (yang tidak stuck)

### Langkah 2: Buka Session Management
1. Di sidebar sebelah kiri, cari menu **"Session Management"** (icon WiFi 📶)
   ```
   Dashboard
   Notify Zona
   Support
   Audit Logs
   ► Session Management  ← KLIK INI
   Storage Handler
   ```
2. Klik untuk membuka Session Management Dashboard

### Langkah 3: Force Logout Moderator yang Stuck
1. Dashboard akan menampilkan semua active sessions dalam tabel
2. Cari moderator yang bermasalah di tabel (lihat kolom **Email** atau **User**)
3. Pada row moderator tersebut, klik tombol **"Force Logout"** (bagian kanan)
4. Sistem akan minta konfirmasi: `"Are you sure you want to force logout?"`
5. Klik **"Yes, Force Logout"**
6. ✅ Muncul notifikasi: `"✅ Force logged out successfully. All their sessions have been terminated."`
7. Dashboard auto-refresh

### Langkah 4: Moderator Bisa Login
- Moderator sekarang bisa login normal dengan credential biasa
- Session fresh akan dibuat
- Tidak ada error "1/1 sessions" lagi

---

## 🎯 Hasil

| Sebelum | Sesudah |
|---------|---------|
| ❌ Login gagal: "1/1 sessions" | ✅ Login berhasil |
| ❌ Session stuck lama | ✅ Fresh session dibuat |
| ❌ Perlu SQL access | ✅ Cukup via dashboard |

---

## 📸 Screenshot Panduan

```
Dashboard
├─ Session Management 
│  └─ Tabel user dengan session count
│     ├─ User: moderator
│     ├─ Email: moderator@example.com
│     ├─ Role: moderator
│     ├─ Active Sessions: 1/1 ← STUCK HERE
│     ├─ Last Activity: 2 hours ago
│     └─ Actions: [View] [Force Logout] ← CLICK THIS
│
└─ Confirm Dialog
   ├─ Title: "Force Logout User?"
   ├─ Message: "Are you sure..."
   └─ Buttons: [Cancel] [Yes, Force Logout] ← CLICK THIS
```

---

## ❓ FAQ

**Q: Apa yang terjadi saat force logout?**
A: Semua active session user akan di-terminate (is_active=FALSE). User harus login lagi.

**Q: Apakah data user akan hilang?**
A: Tidak, hanya session yang dihapus. Semua data user, file, dll tetap aman.

**Q: Apakah bisa undo force logout?**
A: Tidak perlu, user bisa login lagi langsung dengan username/password.

**Q: Siapa saja yang bisa akses Session Management?**
A: User dengan role moderator, admin_zona, atau super_admin yang punya permission `manage_users`.

**Q: Apakah tercatat di audit log?**
A: Ya, setiap force logout tercatat di menu Audit Logs → action `"Admin: Force Logout User"`.

---

## 🆘 Jika Masih Tidak Bisa Login

Jika masih ada masalah setelah force logout:

1. **Refresh browser** (Ctrl+F5)
2. **Clear cache** (Ctrl+Shift+Delete)
3. **Login kembali** dengan fresh session

Jika masih gagal:
- Check **Audit Logs** → cari user yang bermasalah
- Coba **Force Logout lagi**
- Check browser console (F12) untuk error detail

---

## 🔗 Related Documents

- `SESSION_MANAGEMENT_GUIDE.md` - Panduan lengkap Session Management
- `FIX_MODERATOR_LOGIN.md` - Detail teknis & troubleshooting
- `CLEANUP_STALE_SESSIONS.sql` - Manual SQL cleanup (last resort)

---

**Created**: Session Management Feature (92cdf2a)
**Tested**: Force logout functionality working ✅
**Status**: Ready for production ✅
