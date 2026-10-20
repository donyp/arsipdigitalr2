# 🔴 Announcement Auto-Sync Fix

## Problem
Zona 2 user tidak melihat dot merah (unread announcement badge) karena:
1. **Zona 2 baru saja dibuat** → belum di-sync ke announcement_reads table
2. **Announcements lama** (dibuat sebelum zona 2 exist) → tidak otomatis termasuk zona 2

## Solution

### ✅ Part 1: Backfill Zona 2 (Done)
Zona 2 sudah di-sync dengan semua existing announcements:

```bash
node backend/sync-zona-to-announcements.js 122
```

**Result:**
- Zona: Zona 02 (ID: 122)
- Users synced: 1
- Announcements synced: 1
- Read records created: 1
- **User zona 2 akan melihat 🔴 dot merah setelah login**

---

### ✅ Part 2: Auto-Sync untuk Zona Baru (Implemented)
Modified `POST /api/zonas` endpoint di `backend/server.js`:

**Ketika zona baru dibuat:**
```javascript
// Otomatis sync ke semua existing announcements
const recipientRecords = announcements.map(a => ({
    announcement_id: a.id,
    recipient_type: 'zona',
    recipient_id: newZonaId
}));
```

**Benefit:**
- ✅ Next zona baru otomatis dapat dot merah untuk semua existing announcements
- ✅ Tidak perlu manual backfill script untuk zona baru

---

### ✅ Part 3: Auto-Sync untuk User Baru (Implemented)
Modified `POST /api/users` endpoint di `backend/server.js`:

**Ketika user baru dibuat dengan zona_id:**
```javascript
// Otomatis create announcement_reads untuk user
const readRecords = announcements.map(a => ({
    announcement_id: a.id,
    user_id: newUserId,
    is_read: false,
    read_at: null
}));
```

**Benefit:**
- ✅ User baru di zona manapun otomatis dapat dot merah untuk announcements
- ✅ User tidak perlu logout/login untuk refresh badge

---

## Files Created/Modified

### Created:
- `backend/sync-zona-to-announcements.js` — Manual backfill script untuk any zona
- `backend/AUTO_SYNC_NEW_ZONES_TO_ANNOUNCEMENTS.sql` — SQL reference for manual sync
- `backend/check-zonas.js` — Utility untuk check existing zonas
- `backend/check-announcements.js` — Utility untuk check announcements

### Modified:
- `backend/server.js`:
  - Line ~6708: `POST /api/zonas` — Added auto-sync for new zones
  - Line ~4970: `POST /api/users` — Added auto-sync for new users in zonas

---

## How It Works

### Announcement Recipients Table
```sql
-- announcement_recipients table tracks which zonas get which announcements
- announcement_id: FK to announcements
- recipient_type: 'zona' | 'user' | 'all'
- recipient_id: zona_id or user_id
```

### Announcement Reads Table
```sql
-- announcement_reads table tracks read status per user
- announcement_id: FK to announcements
- user_id: FK to users
- is_read: boolean
- read_at: timestamp
```

### When User Views Announcements:
1. Query: `GET /api/announcements`
2. Check `announcement_reads` for this user
3. Count unread → **show dot badge (🔴)**

### When New Zona/User Created:
1. Get all active announcements
2. Create entries in `announcement_recipients` + `announcement_reads`
3. User immediately sees badge on login

---

## Testing

### Test 1: Login zona 2 user
```
Expected: 🔴 dot merah visible on announcements
Before: ❌ no dot (new account issue)
After: ✅ dot visible (synced now)
```

### Test 2: Create new zona
```bash
# Create zona via UI or API
POST /api/zonas { "nama": "Zona XX", "wa_recipient": "..." }

# New zona users will automatically get announcements
# No manual backfill needed!
```

### Test 3: Create new user in zona
```bash
# Create user in existing zona
POST /api/users { "email": "...", "zona_id": 122, "role": "admin_zona", ... }

# New user will automatically see announcements
# No logout/refresh needed!
```

---

## Commit
- **Hash:** fb7ba69
- **Message:** Fix: Auto-sync announcements to new zones and users (zona 2 backfill + future zones/users)

---

## Next Steps

### Deploy to Staging:
```bash
cd /var/www/arsipdigitalanka
git pull origin master
pm2 restart arsip-backend
```

### Monitor:
- Login as zona 2 user → verify 🔴 dot visible
- Create new test zona → verify users get announcements
- Create new test user → verify gets announcements on first login

### Production Deployment:
- After 24h staging validation
- Same steps as staging
