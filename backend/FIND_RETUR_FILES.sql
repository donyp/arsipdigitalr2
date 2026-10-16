-- SQL Script to find all invoices with "retur" transaction type
-- Data is stored in invoice_file_list table, "jenis transaksi" column

-- Query 1: Find all invoices with retur transaction type
SELECT 
    faktur,
    jenis_transaksi,
    total_jumlah_jual,
    toko,
    zona_id,
    tanggal,
    keterangan,
    status,
    files_uploaded_count,
    files_required_count
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
ORDER BY tanggal DESC;

-- Query 2: Count retur transactions by toko
SELECT 
    toko,
    COUNT(*) as retur_count,
    SUM(total_jumlah_jual) as total_penjualan,
    AVG(total_jumlah_jual) as avg_penjualan
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
GROUP BY toko
ORDER BY retur_count DESC;

-- Query 3: Count retur transactions by zona
SELECT 
    zona_id,
    COUNT(*) as retur_count,
    SUM(total_jumlah_jual) as total_penjualan
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
GROUP BY zona_id
ORDER BY retur_count DESC;

-- Query 4: Retur transactions from specific month/year
-- Change 2026 and 1 to desired year and month
SELECT 
    faktur,
    jenis_transaksi,
    total_jumlah_jual,
    toko,
    zona_id,
    tanggal,
    item_count,
    status
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
  AND EXTRACT(YEAR FROM tanggal) = 2026
  AND EXTRACT(MONTH FROM tanggal) = 1
ORDER BY tanggal DESC;

-- Query 5: Retur statistics
SELECT 
    COUNT(*) as total_retur,
    SUM(total_jumlah_jual) as total_penjualan,
    AVG(total_jumlah_jual) as avg_penjualan,
    MIN(total_jumlah_jual) as min_penjualan,
    MAX(total_jumlah_jual) as max_penjualan,
    SUM(item_count) as total_items,
    MIN(tanggal) as oldest_retur,
    MAX(tanggal) as newest_retur
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%';

-- Query 6: Retur with file upload status
SELECT 
    faktur,
    jenis_transaksi,
    total_jumlah_jual,
    toko,
    tanggal,
    keterangan,
    files_uploaded_count,
    files_required_count,
    CASE 
        WHEN files_uploaded_count >= files_required_count THEN 'LENGKAP'
        ELSE 'BELUM LENGKAP'
    END as status_file
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
ORDER BY tanggal DESC;

-- Query 7: Just list faktur numbers with retur
SELECT DISTINCT faktur
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
ORDER BY faktur;

-- Query 8: Check what values exist in jenis_transaksi column
SELECT DISTINCT
    jenis_transaksi,
    COUNT(*) as count
FROM invoice_file_list
WHERE jenis_transaksi IS NOT NULL
GROUP BY jenis_transaksi
ORDER BY count DESC;

-- Query 9: Retur dengan path file (untuk download)
SELECT 
    faktur,
    jenis_transaksi,
    tanggal,
    toko,
    invoice_pdf_path,
    bukti_bayar_path,
    faktur_pajak_path,
    invoice_uploaded_at,
    bukti_bayar_uploaded_at,
    faktur_pajak_uploaded_at
FROM invoice_file_list
WHERE LOWER(jenis_transaksi) LIKE '%retur%'
  AND (invoice_pdf_path IS NOT NULL 
       OR bukti_bayar_path IS NOT NULL 
       OR faktur_pajak_path IS NOT NULL)
ORDER BY tanggal DESC;
