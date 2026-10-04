# Browser Alert/Confirm Replacement Report

## 📊 Summary

Ditemukan **50+ instances** dari `alert()` dan `confirm()` yang masih menggunakan default browser dialog. Ini perlu diganti dengan custom notification untuk UX yang lebih baik.

---

## 🔍 File-by-File Breakdown

### 1. **audit-logs.html** (4 instances)
**Location**: Lines 966, 1040, 1048, 1064, 1068

```javascript
// Line 966
alert('Failed to load detail');

// Line 1040
alert('Failed to export CSV');

// Line 1048
alert('No suspicious logs to mark as reviewed');

// Line 1064
alert('Marked as reviewed');

// Line 1068
alert('Failed to mark as reviewed');
```

**Type**: Error & Success messages
**Priority**: HIGH (new file, should use custom notifications)

---

### 2. **dashboard-admin-zona.html** (1 instance)
**Location**: Line 4350

```javascript
// Line 4350 - Fallback alert (has toastr check)
alert('Session expired. Please login again.');
```

**Type**: Error message
**Priority**: MEDIUM (already has toastr fallback)
**Status**: Partial - sudah ada fallback tapi masih perlu custom notification

---

### 3. **dashboard-admin-zona.backup.html** (3 instances)
**Location**: Lines 1759, 1781, 1785

```javascript
// Line 1759
alert('Teks headline tidak boleh kosong!');

// Line 1781
alert('Headline berhasil diperbarui!');

// Line 1785
alert('Gagal menyimpan headline: ' + err.message);
```

**Type**: Validation, Success, Error
**Priority**: LOW (backup file)

---

### 4. **dashboard.html** (3 instances)
**Location**: Lines 2935, 2961, 2966

```javascript
// Line 2935
alert('Teks headline tidak boleh kosong!');

// Line 2961 - Fallback alert (has Toast check)
alert('Headline berhasil diperbarui!');

// Line 2966
alert('Gagal menyimpan headline: ' + err.message);
```

**Type**: Validation, Success, Error
**Priority**: MEDIUM (has Toast fallback)

---

### 5. **localhost-dashboard.html** (3 instances)
**Location**: Lines 353, 362, 371

```javascript
// Line 353
onclick="alert('Use: /api/files/ or /api/files/folder')"

// Line 362
onclick="alert('File preview endpoint ready')"

// Line 371
onclick="alert('File download endpoint ready')"
```

**Type**: Info messages
**Priority**: LOW (localhost test file only)

---

### 6. **support-create-ticket.html** (3 instances)
**Location**: Lines 1081, 1089, 1131

```javascript
// Line 1081
alert('Silakan isi semua field yang diperlukan');

// Line 1089
alert('Error: Zona tidak ditemukan. Silakan logout dan login kembali.');

// Line 1131
alert(`Error: ${error.message}`);
```

**Type**: Validation, Error
**Priority**: MEDIUM

---

### 7. **support-ticket-detail.html** (1 instance)
**Location**: Line 1140

```javascript
// Line 1140
alert('Pesan tidak boleh kosong');
```

**Type**: Validation
**Priority**: MEDIUM

---

### 8. **support-ticket-detail-moderator.html** (3 instances)
**Location**: Lines 1073, 1082, 1136

```javascript
// Line 1073
alert('Status tiket berhasil diperbarui');

// Line 1082
alert('Error: ' + error.message);

// Line 1136
alert('Pesan tidak boleh kosong');
```

**Type**: Success, Error, Validation
**Priority**: MEDIUM

---

### 9. **tokos.html** (3 instances)
**Location**: Lines 258, 324, 340, 346, 352

```javascript
// Line 258
alert('Gagal memuat data toko: ' + err.message);

// Line 324
alert('Semua field wajib diisi');

// Line 340
alert('Error: ' + err.message);

// Line 346 - CONFIRM DIALOG
if (!confirm('Hapus toko ini?')) return;

// Line 352
alert('Error: ' + err.message);
```

**Type**: Error, Validation, Confirmation
**Priority**: HIGH

---

### 10. **users.html** (8 instances)
**Location**: Lines 356, 447, 454, 462, 469, 484, 492, 495

```javascript
// Line 356
alert('Gagal memuat data user: ' + err.message);

// Line 447
alert('Email dan Nama wajib diisi');

// Line 454
alert('Format email tidak valid. Contoh: user@example.com');

// Line 462
alert('Username harus 3-20 karakter, hanya huruf, angka, underscore, dash.\nContoh: john_doe, user-123');

// Line 469
alert('Role tidak valid');

// Line 484
alert('Password wajib diisi untuk user baru');

// Line 492
alert(id ? 'User berhasil diupdate!' : 'User berhasil ditambahkan!');

// Line 495
alert('Error: ' + err.message);
```

**Type**: Error, Validation, Success
**Priority**: HIGH

---

### 11. **upload-bukti-bayar.html** (3 instances)
**Location**: Lines 740, 774, 781

```javascript
// Line 740 - Fallback alert (has Toast check)
alert('Pilih file terlebih dahulu');

// Line 774 - Fallback alert (has Toast check)
alert('✅ Bukti Bayar berhasil diupload!');

// Line 781 - Fallback alert (has Toast check)
alert('❌ Upload gagal: ' + error.message);
```

**Type**: Validation, Success, Error
**Priority**: MEDIUM (has Toast fallback)

---

### 12. **js/ads-media.js** (1 instance)
**Location**: Line 703

```javascript
// Line 703
alert('Gagal mengunduh file. Silakan coba lagi.');
```

**Type**: Error
**Priority**: MEDIUM

---

### 13. **js/requests.js** (2 instances)
**Location**: Lines 181, 197

```javascript
// Line 181 - CONFIRM DIALOG
showConfirm(
    'Konfirmasi Selesai',
    'Tandai tiket permintaan ini sebagai Selesai?',
    // ...
);

// Line 197 - CONFIRM DIALOG
showConfirm(
    'Hapus Tiket',
    'Apakah Anda yakin ingin menghapus tiket request ini secara permanen? Data juga akan terhapus dari log Admin Zona.',
    // ...
);
```

**Type**: Confirmation
**Priority**: MEDIUM (already using custom showConfirm)
**Status**: GOOD - sudah menggunakan custom dialog

---

### 14. **js/fleet.js** (1 instance)
**Location**: Line 206

```javascript
// Line 206 - CONFIRM DIALOG
showConfirm(
    'Hapus Kendaraan',
    `Apakah Anda yakin ingin menghapus data kendaraan ${nopol}? Tindakan ini tidak dapat dibatalkan.`,
    // ...
);
```

**Type**: Confirmation
**Priority**: MEDIUM (already using custom showConfirm)
**Status**: GOOD - sudah menggunakan custom dialog

---

### 15. **js/invoice-list.js.bak** (12+ instances)
**Location**: Multiple

```javascript
// Line 208
alert('File harus berformat PDF');

// Line 214
alert('Ukuran file maksimal 10MB');

// Line 219
if (!confirm(`Upload PDF untuk faktur ${faktur}?\n\nFile: ${file.name}\nUkuran: ${formatFileSize(file.size)}`))

// Line 240
alert(`✅ Upload berhasil!\n\nFaktur: ${faktur}\nPath: ${result.storagePath}`);

// ... more instances
```

**Type**: Validation, Confirmation, Success, Error
**Priority**: LOW (backup file - .bak)

---

## 📋 Summary by Type

### Alert Messages
- **Validation Errors**: ~15 instances
- **Success Messages**: ~8 instances
- **Error Messages**: ~12 instances
- **Info Messages**: ~3 instances

### Confirm Dialogs
- **Browser confirm()**: ~6 instances
- **Custom showConfirm()**: Already migrated (requests.js, fleet.js)

### Files Already Using Fallbacks
- dashboard.html (Toast fallback)
- upload-bukti-bayar.html (Toast fallback)
- dashboard-admin-zona.html (toastr fallback)

---

## 🎯 Priority Groups

### 🔴 HIGH PRIORITY (New/Critical Pages)
1. **audit-logs.html** - Baru dibuat, perlu custom notifications (4 instances)
2. **users.html** - Critical user management (8 instances)
3. **tokos.html** - Critical toko management (5 instances)

### 🟡 MEDIUM PRIORITY (Important Pages with Partial Fallback)
4. **dashboard.html** - Has Toast but needs improvement (3 instances)
5. **dashboard-admin-zona.html** - Has toastr but needs improvement (1 instance)
6. **support-create-ticket.html** - Support feature (3 instances)
7. **support-ticket-detail.html** - Support detail (1 instance)
8. **support-ticket-detail-moderator.html** - Support moderator (3 instances)
9. **upload-bukti-bayar.html** - Has Toast but needs improvement (3 instances)
10. **js/ads-media.js** - Media management (1 instance)

### 🟢 LOW PRIORITY (Test/Backup Files)
11. **localhost-dashboard.html** - Test file only (3 instances)
12. **dashboard-admin-zona.backup.html** - Backup file (3 instances)
13. **js/invoice-list.js.bak** - Backup file (12+ instances)

---

## ✅ Already Good (Custom Dialogs)

### Files Already Using Custom Confirmation
- ✅ **js/requests.js** - Using `showConfirm()` custom dialog
- ✅ **js/fleet.js** - Using `showConfirm()` custom dialog
- ✅ **index.html** - Has custom alert system (`showAlert()`, `closeAlert()`)

---

## 🔄 Replacement Strategy

### For High Priority Files
1. Create utility function `showNotification()` / `showAlert()` yang konsisten
2. Create utility function `showConfirmDialog()` untuk replace `confirm()`
3. Replace semua instances
4. Test UX

### For Medium Priority Files
1. Use existing Toast/toastr systems
2. Or replace dengan custom notification
3. Gradual migration

### For Low Priority Files
1. Skip (test/backup files)

---

## 💻 Recommended Implementation

### Option 1: Create Global Notification Utility

```javascript
// utils/notifications.js
class NotificationManager {
    static success(message) {
        // Use Toast if available, fallback to custom modal
    }
    
    static error(message) {
        // Show error notification
    }
    
    static info(message) {
        // Show info notification
    }
    
    static warning(message) {
        // Show warning notification
    }
    
    static confirm(title, message, onConfirm, onCancel) {
        // Show custom confirm dialog
    }
}

// Usage
NotificationManager.success('Berhasil!');
NotificationManager.error('Gagal: ' + error.message);
NotificationManager.confirm('Hapus?', 'Yakin ingin hapus?', () => {
    // on confirm
}, () => {
    // on cancel
});
```

### Option 2: Use Existing Toast/Toastr

Jika Toast/Toastr sudah tersedia di file, gunakan itu:

```javascript
// Current
alert('Success message');

// Should be
Toast.success('Success message');
// or
toastr.success('Success message');
```

### Option 3: Create Custom Modal

Gunakan modal yang sudah ada di beberapa file:

```javascript
// index.html pattern
showAlert('Message');
closeAlert();

// Extend ini ke file lain
```

---

## 📈 Impact

### User Experience
- ✅ Better visual consistency
- ✅ More professional appearance
- ✅ Matches application design
- ✅ Better accessibility

### Technical
- ✅ Easier to test (automation)
- ✅ Easier to customize
- ✅ Better error handling
- ✅ Logging capability

---

## 🚀 Next Steps

### Phase 1: High Priority (2-3 hours)
- [ ] Create global notification utility
- [ ] Replace audit-logs.html (4 instances)
- [ ] Replace users.html (8 instances)
- [ ] Replace tokos.html (5 instances)
- [ ] Test all replacements

### Phase 2: Medium Priority (3-4 hours)
- [ ] Consolidate Toast/toastr usage
- [ ] Replace remaining alert() in support pages
- [ ] Replace confirm() in remaining pages
- [ ] Test all replacements

### Phase 3: Low Priority (Optional)
- [ ] Update backup files (optional)
- [ ] Update test files (optional)
- [ ] Document notification system

---

## 📝 Tracking Sheet

| File | Instance Count | Priority | Status | Type |
|------|-----------------|----------|--------|------|
| audit-logs.html | 5 | HIGH | TODO | Notifications |
| users.html | 8 | HIGH | TODO | Notifications |
| tokos.html | 5 | HIGH | TODO | Confirmations & Notifications |
| dashboard.html | 3 | MEDIUM | PARTIAL | Fallback |
| dashboard-admin-zona.html | 1 | MEDIUM | PARTIAL | Fallback |
| support-create-ticket.html | 3 | MEDIUM | TODO | Notifications |
| support-ticket-detail.html | 1 | MEDIUM | TODO | Validation |
| support-ticket-detail-moderator.html | 3 | MEDIUM | TODO | Notifications |
| upload-bukti-bayar.html | 3 | MEDIUM | PARTIAL | Fallback |
| js/ads-media.js | 1 | MEDIUM | TODO | Error |
| localhost-dashboard.html | 3 | LOW | SKIP | Test file |
| dashboard-admin-zona.backup.html | 3 | LOW | SKIP | Backup |
| js/invoice-list.js.bak | 12+ | LOW | SKIP | Backup |
| **js/requests.js** | - | - | ✅ GOOD | Custom |
| **js/fleet.js** | - | - | ✅ GOOD | Custom |
| **index.html** | - | - | ✅ GOOD | Custom |
| **TOTAL** | **50+** | - | - | - |

---

## 🎯 Success Criteria

- [ ] 0 instances of browser `alert()` in production files
- [ ] 0 instances of browser `confirm()` in production files
- [ ] All notifications use custom/styled dialogs
- [ ] Consistent notification appearance across app
- [ ] All confirmations use custom dialog
- [ ] Better UX & professional appearance

---

## 📞 Questions?

**Q: Mana yang paling penting?**
A: audit-logs.html, users.html, tokos.html (HIGH priority)

**Q: Berapa lama waktu yang dibutuhkan?**
A: Phase 1 (high): 2-3 hours, Phase 2 (medium): 3-4 hours

**Q: Apa yang harus dimulai dulu?**
A: Buat global notification utility, lalu replace high priority files

