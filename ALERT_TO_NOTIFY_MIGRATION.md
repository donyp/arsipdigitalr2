# Alert to Notify Migration Guide

## 🎯 Tujuan

Menggantikan semua `alert()` dan `confirm()` browser default dengan custom notification system yang lebih professional dan konsisten.

---

## 📦 Files Involved

### New Files Created
- ✅ `js/notification-system.js` - Global notification system
- ✅ `BROWSER_ALERTS_REPORT.md` - Report of all alert() instances
- ✅ `ALERT_TO_NOTIFY_MIGRATION.md` - This guide

---

## 🚀 Quick Start

### Step 1: Include Notification System

Add ke `<head>` atau sebelum closing `</body>`:

```html
<script src="js/notification-system.js"></script>
```

### Step 2: Replace alert() with Notify

**Before**:
```javascript
alert('Operation successful!');
```

**After**:
```javascript
Notify.success('Operation successful!');
```

### Step 3: Replace confirm() with Notify.confirm()

**Before**:
```javascript
if (!confirm('Delete this item?')) return;
// ... do something ...
```

**After**:
```javascript
Notify.confirm(
    'Delete Confirmation',
    'Apakah Anda yakin ingin menghapus item ini?',
    () => {
        // onConfirm callback
        console.log('Confirmed');
    },
    () => {
        // onCancel callback
        console.log('Cancelled');
    }
);
```

---

## 📋 API Reference

### Notification Methods

#### `Notify.success(message, duration)`
Show success notification

```javascript
Notify.success('Data berhasil disimpan!');
Notify.success('Upload complete', 3000); // auto-close after 3 seconds
```

#### `Notify.error(message, duration)`
Show error notification

```javascript
Notify.error('Gagal menyimpan data');
Notify.error('Network error: ' + error.message, 5000);
```

#### `Notify.warning(message, duration)`
Show warning notification

```javascript
Notify.warning('Ini adalah peringatan penting');
```

#### `Notify.info(message, duration)`
Show info notification

```javascript
Notify.info('Sistem sedang di-update');
```

#### `Notify.show(message, type, icon, duration)`
Show custom notification

```javascript
Notify.show('Custom message', 'info', '🚀', 4000);
```

### Confirmation Methods

#### `Notify.confirm(title, message, onConfirm, onCancel)`
Show confirmation dialog

```javascript
Notify.confirm(
    'Konfirmasi Tindakan',
    'Apakah Anda yakin?',
    () => {
        console.log('User confirmed');
    },
    () => {
        console.log('User cancelled');
    }
);
```

#### `Notify.confirmDelete(title, message, onConfirm, onCancel)`
Show delete confirmation (red button)

```javascript
Notify.confirmDelete(
    'Hapus Item',
    'Tindakan ini tidak dapat dibatalkan',
    () => {
        // Delete item
    },
    () => {
        // Cancel
    }
);
```

### Utility Methods

#### `Notify.clearAll()`
Clear all notifications

```javascript
Notify.clearAll();
```

---

## 🔄 Migration Examples

### Example 1: Simple Validation

**Before**:
```javascript
if (!email) {
    alert('Email tidak boleh kosong');
    return;
}
```

**After**:
```javascript
if (!email) {
    Notify.error('Email tidak boleh kosong');
    return;
}
```

### Example 2: Success Message

**Before**:
```javascript
alert('User berhasil ditambahkan!');
```

**After**:
```javascript
Notify.success('User berhasil ditambahkan!');
```

### Example 3: Delete Confirmation

**Before**:
```javascript
if (!confirm('Hapus user ini?')) {
    return;
}
// Delete logic
deleteUser(userId);
```

**After**:
```javascript
Notify.confirmDelete(
    'Hapus User',
    'Apakah Anda yakin ingin menghapus user ini? Tindakan ini tidak dapat dibatalkan.',
    () => {
        deleteUser(userId);
    }
);
```

### Example 4: Error with Details

**Before**:
```javascript
try {
    // ... do something ...
} catch (error) {
    alert('Error: ' + error.message);
}
```

**After**:
```javascript
try {
    // ... do something ...
} catch (error) {
    Notify.error('Gagal: ' + error.message);
}
```

### Example 5: Async Confirmation

**Before**:
```javascript
if (!confirm('Process this item?')) return;
await processItem(id);
alert('Item processed!');
```

**After**:
```javascript
Notify.confirm(
    'Process Item',
    'Apakah Anda ingin memproses item ini?',
    async () => {
        await processItem(id);
        Notify.success('Item berhasil diproses!');
    }
);
```

---

## 📊 Migration Checklist

### High Priority Files (2-3 hours)

#### audit-logs.html (5 instances)
- [ ] Line 966: `alert('Failed to load detail')` → `Notify.error('Failed to load detail')`
- [ ] Line 1040: `alert('Failed to export CSV')` → `Notify.error('Failed to export CSV')`
- [ ] Line 1048: `alert('No suspicious logs...')` → `Notify.warning('No suspicious logs...')`
- [ ] Line 1064: `alert('Marked as reviewed')` → `Notify.success('Marked as reviewed')`
- [ ] Line 1068: `alert('Failed to mark...')` → `Notify.error('Failed to mark...')`

#### users.html (8 instances)
- [ ] Line 356: Validation error → `Notify.error(...)`
- [ ] Line 447: Validation error → `Notify.error(...)`
- [ ] Line 454: Validation error → `Notify.error(...)`
- [ ] Line 462: Validation error → `Notify.error(...)`
- [ ] Line 469: Validation error → `Notify.error(...)`
- [ ] Line 484: Validation error → `Notify.error(...)`
- [ ] Line 492: Success message → `Notify.success(...)`
- [ ] Line 495: Error message → `Notify.error(...)`

#### tokos.html (5 instances)
- [ ] Line 258: Error message → `Notify.error(...)`
- [ ] Line 324: Validation error → `Notify.error(...)`
- [ ] Line 340: Error message → `Notify.error(...)`
- [ ] Line 346: `confirm('Hapus toko ini?')` → `Notify.confirmDelete(...)`
- [ ] Line 352: Error message → `Notify.error(...)`

### Medium Priority Files (3-4 hours)

#### dashboard.html (3 instances)
- [ ] Line 2935: Validation → `Notify.error(...)`
- [ ] Line 2961: Success → `Notify.success(...)`
- [ ] Line 2966: Error → `Notify.error(...)`

#### support-create-ticket.html (3 instances)
- [ ] Line 1081: Validation → `Notify.error(...)`
- [ ] Line 1089: Error → `Notify.error(...)`
- [ ] Line 1131: Error → `Notify.error(...)`

#### support-ticket-detail.html (1 instance)
- [ ] Line 1140: Validation → `Notify.error(...)`

#### support-ticket-detail-moderator.html (3 instances)
- [ ] Line 1073: Success → `Notify.success(...)`
- [ ] Line 1082: Error → `Notify.error(...)`
- [ ] Line 1136: Validation → `Notify.error(...)`

#### upload-bukti-bayar.html (3 instances)
- [ ] Line 740: Validation → `Notify.error(...)`
- [ ] Line 774: Success → `Notify.success(...)`
- [ ] Line 781: Error → `Notify.error(...)`

#### js/ads-media.js (1 instance)
- [ ] Line 703: Error → `Notify.error(...)`

### Low Priority Files (Skip)
- localhost-dashboard.html (test file)
- dashboard-admin-zona.backup.html (backup)
- js/invoice-list.js.bak (backup)

---

## 💡 Best Practices

### 1. Use Appropriate Type
```javascript
Notify.success('Action completed');  // Green ✓
Notify.error('Something went wrong');  // Red ✕
Notify.warning('Be careful');  // Yellow ⚠
Notify.info('FYI');  // Blue ℹ
```

### 2. Keep Messages Short
```javascript
// Good
Notify.error('Email tidak valid');

// Bad - too long
Notify.error('Email yang Anda masukkan tidak sesuai dengan format email yang benar, silakan periksa kembali');
```

### 3. Provide Context
```javascript
// Good - specific error with context
Notify.error(`Gagal upload file: ${error.message}`);

// Bad - generic
Notify.error('Error!');
```

### 4. Auto-dismiss Times
```javascript
Notify.success('Saved!', 3000);     // 3 seconds for success
Notify.error('Failed!', 5000);      // 5 seconds for error
Notify.info('Loading...', 0);       // 0 = no auto-dismiss (for background tasks)
```

### 5. Use Confirmation for Destructive Actions
```javascript
// Good - confirm before delete
Notify.confirmDelete('Hapus Item', 'Yakin ingin menghapus?', () => {
    deleteItem(id);
});

// Bad - just delete without confirmation
deleteItem(id);
```

---

## 🔧 Troubleshooting

### Issue: Script not found
**Solution**: Ensure `js/notification-system.js` is in correct path and linked in HTML

### Issue: Notify is not defined
**Solution**: Make sure script is loaded before using:
```html
<script src="js/notification-system.js"></script>
<script>
    Notify.success('Test');
</script>
```

### Issue: Styling looks wrong
**Solution**: Check browser DevTools for CSS conflicts. The notification system has high z-index (9999) to appear on top.

### Issue: Too many notifications
**Solution**: System automatically limits to 5 notifications max. Older ones are removed.

---

## 📝 Implementation Order

### Week 1: Setup & High Priority
- [ ] Monday: Setup notification system, document all alerts
- [ ] Tuesday-Wednesday: Migrate high priority files (audit-logs, users, tokos)
- [ ] Thursday: Test all high priority migrations
- [ ] Friday: Code review & commit

### Week 2: Medium Priority
- [ ] Monday-Tuesday: Migrate medium priority files
- [ ] Wednesday: Testing & QA
- [ ] Thursday-Friday: Fix issues & deploy

### Week 3: Polish & Documentation
- [ ] Update documentation
- [ ] Train team on new system
- [ ] Monitor for any issues

---

## ✅ Verification Checklist

After migration:

- [ ] No `alert()` calls in production files
- [ ] No `confirm()` calls in production files
- [ ] All notifications styled consistently
- [ ] Confirmation dialogs work correctly
- [ ] Auto-dismiss timing appropriate
- [ ] Mobile responsive
- [ ] Dark mode compatible (if applicable)
- [ ] Keyboard navigation works (Escape to close)
- [ ] Performance not impacted

---

## 🎨 Styling Reference

### Colors by Type
- **Success**: Green background (#d4edda)
- **Error**: Red background (#f8d7da)
- **Warning**: Yellow background (#fff3cd)
- **Info**: Blue background (#d1ecf1)

### Icons
- Success: ✓
- Error: ✕
- Warning: ⚠
- Info: ℹ

### Custom Icons
Use any emoji or Unicode character:
```javascript
Notify.show('Processing...', 'info', '⏳', 0);
Notify.show('Done!', 'success', '🎉', 3000);
```

---

## 📚 Additional Resources

- `BROWSER_ALERTS_REPORT.md` - Complete list of all alert() instances
- `js/notification-system.js` - Full implementation
- Examples in this file

---

## 🚀 Next Steps

1. ✅ Review `BROWSER_ALERTS_REPORT.md` for all instances
2. ✅ Include `js/notification-system.js` in files
3. ✅ Migrate high priority files first
4. ✅ Test thoroughly
5. ✅ Migrate medium priority files
6. ✅ Deploy and monitor

---

## 💬 Questions?

**Q: Should I migrate all files?**
A: High and medium priority yes. Skip low priority (test/backup files).

**Q: Can I keep some alert() calls?**
A: Preference is to migrate all for consistency, but high priority is mandatory.

**Q: How long does migration take?**
A: High: 2-3 hours, Medium: 3-4 hours total for all files.

**Q: Will this break anything?**
A: No, notification system is standalone and doesn't affect existing functionality.

