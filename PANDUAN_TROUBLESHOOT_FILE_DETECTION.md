# Panduan: Jika Ada File Tidak Terdeteksi

## 🚨 Skenario

Anda upload file (Invoice PDF, Bukti Bayar, atau Faktur Pajak), tapi status tidak update.

**Contoh:** Upload 100 file, hanya 50 yang terdeteksi

---

## 🔍 STEP 1: Cek Berapa Banyak Yang Tidak Terdeteksi

### Query Check:

```sql
-- Run ini di Supabase SQL Editor
SELECT 
    ifl.faktur,
    ifl.files_uploaded_count as status_sekarang,
    COUNT(DISTINCT ifx.file_type) as jumlah_file_asli,
    STRING_AGG(DISTINCT ifx.file_type, ', ') as file_types
FROM invoice_file_list ifl
LEFT JOIN invoice_files ifx ON ifx.faktur = ifl.faktur
GROUP BY ifl.faktur, ifl.files_uploaded_count
HAVING ifl.files_uploaded_count != COALESCE(COUNT(DISTINCT ifx.file_type), 0)
LIMIT 20;
```

### Interpretasi Hasil:

**Jika hasilnya:**
```
faktur     | status_sekarang | jumlah_file_asli | file_types
-----------|-----------------|------------------|-------------------
835100310  | 0               | 1                | invoice
835100311  | 1               | 2                | invoice, bukti_bayar
835100312  | 2               | 3                | invoice, bukti_bayar, faktur_pajak
```

**Artinya:**
- 835100310: File ada (invoice) tapi count = 0 ❌ **TRIGGER MISS**
- 835100311: File ada 2 tapi status hanya 1 ❌ **COUNT SALAH**
- 835100312: File ada 3 tapi status hanya 2 ❌ **COUNT SALAH**

---

## 🔧 STEP 2: Pilih Solusi Berdasarkan Masalahnya

### 🎯 Solusi A: File Ada Tapi Count = 0 (Trigger Tidak Fire)

**Ciri:** `status_sekarang = 0` tapi `jumlah_file_asli > 0`

**Jalankan:**

```sql
-- Force update untuk semua invoices yang bermasalah
UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = (
        SELECT COUNT(DISTINCT file_type)
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur
    ),
    updated_at = NOW()
WHERE files_uploaded_count = 0
  AND EXISTS (
      SELECT 1 FROM invoice_files ifx
      WHERE ifx.faktur = ifl.faktur
  );

-- Check hasil
SELECT COUNT(*) as fixed_invoices FROM invoice_file_list 
WHERE files_uploaded_count > 0;
```

**Expected:** Status berubah dari 0 → 1, 2, atau 3 ✅

---

### 🎯 Solusi B: Fix Satu Invoice Tertentu

**Gunakan jika hanya 1-2 invoices yang bermasalah**

```sql
-- Ubah '835100310' dengan faktur yang bermasalah
UPDATE invoice_file_list
SET 
    files_uploaded_count = (
        SELECT COUNT(DISTINCT file_type)
        FROM invoice_files
        WHERE faktur = '835100310'
    ),
    updated_at = NOW()
WHERE faktur = '835100310';
```

---

### 🎯 Solusi C: Nuclear Reset (Jika Masalah Widespread)

**Gunakan jika banyak invoices bermasalah (>100)**

```sql
-- STEP 1: Reset semua counts ke 0
UPDATE invoice_file_list SET files_uploaded_count = 0;

-- STEP 2: Recalculate dari data sebenarnya
UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = COALESCE((
        SELECT COUNT(DISTINCT file_type)
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur
    ), 0),
    updated_at = NOW()
WHERE EXISTS (
    SELECT 1 FROM invoice_files ifx
    WHERE ifx.faktur = ifl.faktur
);

-- STEP 3: Verify
SELECT 
    'Status Setelah Reset' as check,
    COUNT(*) as total_invoices,
    SUM(files_uploaded_count) as total_files,
    COUNT(CASE WHEN files_uploaded_count > 0 THEN 1 END) as with_files
FROM invoice_file_list;
```

---

### 🎯 Solusi D: Cek Trigger Status (Jika Trigger Error)

**Gunakan jika files terus tidak terdeteksi**

```sql
-- Check trigger aktif atau tidak
SELECT 
    trigger_name,
    tgenabled as is_active
FROM information_schema.triggers t
JOIN pg_trigger pt ON pt.tgname = t.trigger_name
WHERE trigger_name = 'trigger_update_file_count'
  AND event_object_table = 'invoice_files';
```

**Hasil yang diharapkan:**
```
trigger_name              | is_active
--------------------------|-----------
trigger_update_file_count | O          ← 'O' artinya AKTIF ✅
```

**Jika bukan 'O' (DISABLED):**

```sql
-- Enable trigger
ALTER TABLE invoice_files ENABLE TRIGGER trigger_update_file_count;

-- Verify
SELECT tgenabled FROM information_schema.triggers 
WHERE trigger_name = 'trigger_update_file_count';
```

---

## ✅ STEP 3: Verifikasi Masalah Sudah Fixed

```sql
-- Cek apakah masih ada mismatch
SELECT COUNT(*) as mismatches_remaining
FROM invoice_file_list ifl
LEFT JOIN invoice_files ifx ON ifx.faktur = ifl.faktur
GROUP BY ifl.faktur, ifl.files_uploaded_count
HAVING ifl.files_uploaded_count != COALESCE(COUNT(DISTINCT ifx.file_type), 0)
  AND COUNT(DISTINCT ifx.file_type) > 0;
```

**Expected Result:**
```
mismatches_remaining
0 ← Tidak ada lagi yang tidak terdeteksi ✅
```

---

## 📋 Quick Reference Table

| Masalah | Ciri | Query Solusi |
|---------|------|--------------|
| **File ada, count = 0** | `status_sekarang = 0` tapi ada file | Solusi A |
| **1-2 invoices saja** | Hanya beberapa faktur | Solusi B |
| **Banyak invoices** | >100 invoices bermasalah | Solusi C |
| **Trigger disabled** | Trigger tidak aktif | Solusi D |

---

## 🔄 Monitoring Rutin (RECOMMENDED)

Jalankan query ini **1x per hari** untuk early detection:

```sql
-- Daily check - Copy & Paste
SELECT 
    'Daily Monitor - ' || TO_CHAR(NOW(), 'HH:mm') as waktu,
    COUNT(*) as total_hari_ini,
    COUNT(CASE WHEN files_uploaded_count > 0 THEN 1 END) as with_files,
    COUNT(CASE WHEN files_uploaded_count >= files_required_count THEN 1 END) as complete,
    ROUND(100.0 * COUNT(CASE WHEN files_uploaded_count > 0 THEN 1 END) / COUNT(*), 2) as detection_rate_persen
FROM invoice_file_list
WHERE DATE(updated_at) = CURRENT_DATE;
```

**Hasil yang OK:**
```
detection_rate_persen > 95% ✅
```

**Hasil yang kurang baik:**
```
detection_rate_persen < 90% ⚠️ → Jalankan STEP 1-2
```

---

## 📞 Escalation Checklist

- [ ] **Step 1:** Run query CHECK → Lihat berapa yang tidak terdeteksi
- [ ] **Step 2:** Tentukan penyebab (A, B, C, atau D)
- [ ] **Step 3:** Run query SOLUSI yang sesuai
- [ ] **Step 4:** Jalankan query VERIFY → Confirm fixed
- [ ] **Step 5:** Set monitoring harian (optional)

---

## 💡 Catatan Penting

1. **Jangan khawatir** - Sistem ini sudah robust, jarang error
2. **Jika terjadi** - Ikuti langkah-langkah di atas, fixed dalam 5 menit
3. **Monitoring** - Jalankan daily check untuk early detection
4. **Backup** - Semua SQL scripts sudah di-document

**Pertanyaan? Hubungi Tim Technical!** 🚀

