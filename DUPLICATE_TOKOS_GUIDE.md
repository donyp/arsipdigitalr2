# Guide: Safe Deletion of Duplicate Tokos

## ⚠️ PENTING: Lakukan Langkah Demi Langkah!

Ada banyak toko duplicate dengan nama dan zona sama. Untuk aman, ikuti langkah ini:

---

## LANGKAH 1: Identifikasi Duplicate Tokos
Buka Supabase SQL Editor dan jalankan:

```sql
SELECT 
    nama,
    zona_id,
    COUNT(*) as count,
    STRING_AGG(CAST(id as text), ', ') as toko_ids
FROM toko
GROUP BY nama, zona_id
HAVING COUNT(*) > 1
ORDER BY nama, zona_id;
```

**Hasilnya:** Lihat toko mana saja yang duplicate dan catat ID-nya

Contoh hasil:
- Dunia Baja Cibitung | Zona 16 | count: 2 | toko_ids: 123, 456
- Dunia Baja Jangga | Zona 15 | count: 2 | toko_ids: 234, 567

---

## LANGKAH 2: Audit Data - Mana yang Perlu Dihapus?
Untuk setiap duplicate, jalankan:

```sql
SELECT 
    t.id,
    t.nama,
    t.zona_id,
    COUNT(DISTINCT f.id) as file_count
FROM toko t
LEFT JOIN files f ON f.toko_id = t.id
WHERE t.nama = 'Dunia Baja Cibitung'
GROUP BY t.id, t.nama, t.zona_id
ORDER BY t.id;
```

**PENTING:** 
- Lihat mana yang punya MORE file
- **KEEP** = yang punya lebih banyak file
- **DELETE** = yang punya file lebih sedikit (idealnya 0)

Contoh:
| id  | nama | zona_id | file_count |
|-----|------|---------|-----------|
| 123 | Dunia Baja Cibitung | 16 | 5 |  ← KEEP (5 files)
| 456 | Dunia Baja Cibitung | 16 | 0 |  ← DELETE (0 files)

---

## LANGKAH 3: Merge Data (Pindahkan File)
Sebelum delete, pindahkan semua file dari duplikat ke yang asli:

```sql
BEGIN TRANSACTION;

-- Pindahkan files dari toko yang akan dihapus ke toko yang dipertahankan
UPDATE files 
SET toko_id = 123   -- NEW_TOKO_ID (yang banyak file)
WHERE toko_id = 456; -- OLD_TOKO_ID (yang akan dihapus)

COMMIT;
```

---

## LANGKAH 4: Verifikasi Merge
Pastikan semua data sudah pindah:

```sql
SELECT 
    toko_id,
    COUNT(*) as file_count
FROM files
WHERE toko_id IN (123, 456)  -- OLD dan NEW toko_id
GROUP BY toko_id;
```

**Hasil yang benar:**
- toko_id 123: file_count = 5 (data sudah terakumulasi)
- toko_id 456: file_count = 0 (kosong, siap delete)

Jika toko_id 456 masih ada data (file_count > 0), jangan lanjut ke LANGKAH 5!

---

## LANGKAH 5: Delete Duplicate
Hanya setelah STEP 4 menunjukkan OLD_TOKO kosong:

```sql
DELETE FROM toko 
WHERE id = 456;  -- OLD_TOKO_ID saja

-- Verifikasi
SELECT COUNT(*) as remaining FROM toko WHERE id = 456;
-- Harus return: 0 (toko sudah dihapus)
```

---

## ✅ Setelah Semua Selesai

1. Refresh halaman Manajemen > Toko
2. Duplikat sudah hilang
3. File tetap tersimpan di toko yang dikebolekan

---

## ⚠️ JANGAN LUPA!

- ❌ Jangan langsung DELETE tanpa merge
- ❌ Jangan hapus yang punya file
- ✅ Selalu verify setiap step sebelum lanjut
- ✅ Buat backup database jika kuatir

---

## Contoh Lengkap Duplikat yang Perlu Dihapus

Dari screenshot, tokos yang duplicate:
1. **Dunia Baja Cibitung** - Zona 16 (2x) → Cek mana yang kosong → DELETE yang kosong
2. **Dunia Baja Jangga** - Zona 15 (2x) → Cek mana yang kosong → DELETE yang kosong
3. **Dunia Baja Kalibabang** - Zona 15 (2x) → Cek mana yang kosong → DELETE yang kosong
4. **Dunia Baja Karyusutin** - Zona 15 (2x) → Cek mana yang kosong → DELETE yang kosong
5. **Dunia Baja Komren** - Zona 04 (2x) → Cek mana yang kosong → DELETE yang kosong

**Ulangi langkah 1-5 untuk setiap duplicate!**

---

## Quick Reference

| Langkah | Action | Query |
|---------|--------|-------|
| 1 | Identifikasi | `GROUP BY nama, zona_id HAVING COUNT(*) > 1` |
| 2 | Audit | `LEFT JOIN files` - hitung yang banyak vs sedikit |
| 3 | Merge | `UPDATE files SET toko_id = NEW WHERE toko_id = OLD` |
| 4 | Verifikasi | Cek NEW punya semua file, OLD kosong |
| 5 | Delete | `DELETE FROM toko WHERE id = OLD` |


