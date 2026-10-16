-- List all fakturs with jenis_transaksi = "retur"

-- Query 1: Simple list - just the fakturs
SELECT DISTINCT faktur
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
ORDER BY faktur;

-- Query 2: Detailed list with file status
SELECT 
    faktur,
    jenis_transaksi,
    toko,
    tanggal,
    total_jumlah_jual,
    files_uploaded_count,
    files_required_count,
    CASE 
        WHEN files_uploaded_count >= files_required_count THEN '✅ LENGKAP'
        ELSE '❌ BELUM LENGKAP'
    END as status_file,
    CASE
        WHEN files_uploaded_count = 0 THEN 'KOSONG'
        WHEN files_uploaded_count < files_required_count THEN 'SEBAGIAN'
        ELSE 'LENGKAP'
    END as file_status_type
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
ORDER BY faktur;

-- Query 3: Count total retur fakturs
SELECT COUNT(DISTINCT faktur) as total_retur_fakturs
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%';

-- Query 4: Retur by toko
SELECT 
    toko,
    COUNT(DISTINCT faktur) as retur_count,
    COUNT(CASE WHEN files_uploaded_count >= files_required_count THEN 1 END) as dengan_file,
    COUNT(CASE WHEN files_uploaded_count = 0 THEN 1 END) as tanpa_file
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
GROUP BY toko
ORDER BY retur_count DESC;

-- Query 5: Retur by zona
SELECT 
    zona_id,
    COUNT(DISTINCT faktur) as retur_count,
    COUNT(CASE WHEN files_uploaded_count >= files_required_count THEN 1 END) as dengan_file,
    COUNT(CASE WHEN files_uploaded_count = 0 THEN 1 END) as tanpa_file
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
GROUP BY zona_id
ORDER BY retur_count DESC;

-- Query 6: Retur without any files (files_uploaded_count = 0)
SELECT 
    faktur,
    jenis_transaksi,
    toko,
    tanggal,
    total_jumlah_jual,
    files_required_count
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
  AND files_uploaded_count = 0
ORDER BY tanggal DESC;

-- Query 7: Export all retur fakturs to CSV format
SELECT 
    faktur,
    jenis_transaksi,
    toko,
    tanggal,
    total_jumlah_jual,
    item_count,
    files_uploaded_count || '/' || files_required_count as status_file,
    status,
    keterangan
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
ORDER BY tanggal DESC;
