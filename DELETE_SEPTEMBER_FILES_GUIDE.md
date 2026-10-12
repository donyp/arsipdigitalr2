# 🗑️ Panduan Hapus File September

## Overview
Script untuk menghapus semua file invoice yang di-upload bulan September dari database.

## File Location
- **SQL Script**: `backend/DELETE_SEPTEMBER_FILES.sql`

## 📋 Apa yang dihapus?
- Semua record di tabel `invoice_files` dengan bulan upload = September
- Default: September 2026 saja
- Bisa diubah untuk semua tahun (lihat opsi di bawah)

## ⚠️ Safety Check

Script include 3 step safety:

### Step 1: Preview (SAFE - hanya SELECT)
Lihat berapa file yang akan dihapus sebelum eksekusi:
```sql
SELECT COUNT(*) as total_files, ...
FROM invoice_files
WHERE EXTRACT(MONTH FROM uploaded_at) = 9
AND EXTRACT(YEAR FROM uploaded_at) = 2026;
```

**Output contoh:**
```
total_files  | total_size_gb | unique_invoices
-------------|---------------|----------------
1,250        | 45.2          | 890
```

### Step 2: Delete (DESTRUCTIVE)
Hapus file database records:
```sql
DELETE FROM invoice_files
WHERE EXTRACT(MONTH FROM uploaded_at) = 9
AND EXTRACT(YEAR FROM uploaded_at) = 2026;
```

### Step 3: Verify (CHECK)
Verifikasi sisa file:
```sql
SELECT COUNT(*) as remaining_files, ...
FROM invoice_files;
```

## 🚀 Cara Menggunakan

### Option 1: Hapus September 2026 Saja (RECOMMENDED)
1. Buka `backend/DELETE_SEPTEMBER_FILES.sql`
2. Copy seluruh script
3. Paste di Supabase SQL Editor
4. **BACA OUTPUT STEP 1** - verifikasi jumlah file
5. Klik RUN
6. BACA OUTPUT STEP 3 - konfirmasi sisa file

### Option 2: Hapus Semua September (Semua Tahun)
1. Di Supabase SQL Editor, uncomment bagian ini:
```sql
DELETE FROM invoice_files
WHERE EXTRACT(MONTH FROM uploaded_at) = 9;
```
2. Comment out yang original dengan `--`
3. Klik RUN

### Option 3: Hapus Bulan Lain
Ganti `9` dengan nomor bulan:
```sql
WHERE EXTRACT(MONTH FROM uploaded_at) = 10  -- October
WHERE EXTRACT(MONTH FROM uploaded_at) = 12  -- December
```

## 📊 Expected Results

**Untuk September 2026:**
- Total files: ~1,200-1,500 (bergantung data)
- Total size: ~30-50 GB
- Invoices affected: ~800-1,000

## ⚠️ PENTING - File R2 Storage

**DATABASE only!** Script hanya hapus record database, tidak hapus file di R2.

Jika mau hapus R2 files juga:

### Menggunakan rclone (Recommended):
```bash
# Lihat file September di R2
rclone ls arsipankacloudflare:/data/files --max-age 2M

# Hapus file September di R2
rclone delete arsipankacloudflare:/data/files \
  --min-age 1M \
  --max-age 2M \
  -i  # interactive mode (confirm sebelum hapus)
```

### Menggunakan AWS CLI:
```bash
aws s3 rm s3://bucket/data/files \
  --recursive \
  --exclude "*" \
  --include "*september*"
```

## 🔍 Verify Sebelum Hapus

### Check Invoice Records September:
```sql
SELECT 
    faktur,
    file_type,
    file_size,
    uploaded_at
FROM invoice_files
WHERE EXTRACT(MONTH FROM uploaded_at) = 9
ORDER BY uploaded_at DESC
LIMIT 10;
```

### Check Total Data Size:
```sql
SELECT 
    EXTRACT(MONTH FROM uploaded_at) as bulan,
    COUNT(*) as file_count,
    ROUND(SUM(file_size)::numeric / 1024 / 1024 / 1024, 2) as size_gb
FROM invoice_files
WHERE EXTRACT(YEAR FROM uploaded_at) = 2026
GROUP BY bulan
ORDER BY bulan;
```

## 🚨 Jika Terjadi Kesalahan

### Undo (Jika ada backup):
```sql
-- Restore dari backup (jika ada transaction log)
-- Hubungi Supabase support jika tidak ada backup
```

### Check deleted records:
```sql
SELECT COUNT(*) FROM invoice_files WHERE EXTRACT(MONTH FROM uploaded_at) = 9;
-- Should return 0
```

## 📝 Checklist Sebelum Eksekusi

- [ ] Backup database (optional - Supabase auto-backup)
- [ ] Jalankan Step 1 (SELECT) - lihat jumlah file
- [ ] Pastikan jumlah file sesuai ekspektasi
- [ ] Backup R2 files (jika perlu) - `rclone sync`
- [ ] Jalankan Step 2 (DELETE)
- [ ] Jalankan Step 3 (VERIFY)
- [ ] Cek di dashboard - pastikan September tidak ada

## 📞 Support

Jika ada pertanyaan:
1. Check Step 3 output - berapa file tersisa?
2. Check R2 files - masih ada?
3. Query individual invoices - ada data yang hilang?

---

**Last Updated**: 2026-10-12  
**Database**: Supabase PostgreSQL  
**Table**: invoice_files  
**Target**: September uploads (configurable)
