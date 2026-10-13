/**
 * Debug: Cek kenapa status file tidak menampilkan 655 invoice
 * Database punya 655 PDF tapi dashboard status tidak sesuai
 */

-- 1. Cek total invoice di invoice_file_list (table utama)
SELECT COUNT(*) as total_invoice_file_list
FROM invoice_file_list;

-- 2. Cek invoice yang ada di invoice_file_list tapi TIDAK ada di invoice_files
SELECT COUNT(*) as invoice_tanpa_pdf_di_database
FROM invoice_file_list ifl
WHERE NOT EXISTS (
    SELECT 1 FROM invoice_files inf 
    WHERE inf.faktur = ifl.faktur 
    AND inf.file_type = 'invoice'
);

-- 3. Cek invoice yang ada di invoice_files tapi TIDAK ada di invoice_file_list
SELECT COUNT(*) as invoice_pdf_tidak_di_file_list
FROM invoice_files
WHERE file_type = 'invoice'
AND faktur NOT IN (SELECT faktur FROM invoice_file_list);

-- 4. Lihat daftar invoice dengan PDF tapi tidak di invoice_file_list (bisa ada typo)
SELECT DISTINCT inf.faktur
FROM invoice_files inf
WHERE inf.file_type = 'invoice'
AND inf.faktur NOT IN (SELECT faktur FROM invoice_file_list)
ORDER BY inf.faktur;

-- 5. Cek perbandingan jumlah
SELECT 
    (SELECT COUNT(*) FROM invoice_file_list) as total_di_invoice_file_list,
    (SELECT COUNT(DISTINCT faktur) FROM invoice_files WHERE file_type = 'invoice') as total_pdf_di_invoice_files,
    (SELECT COUNT(*) FROM invoice_file_list) - 
    (SELECT COUNT(DISTINCT faktur) FROM invoice_files WHERE file_type = 'invoice') as selisih;

-- 6. Cek invoice_file_list structure (kolom apa saja)
SELECT * FROM invoice_file_list LIMIT 1;

-- 7. Cek status file di invoice_file_list (ada kolom status atau file_count?)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'invoice_file_list'
ORDER BY ordinal_position;

-- 8. Lihat sample data dari invoice_file_list dengan stat/file info
SELECT * 
FROM invoice_file_list 
LIMIT 10;
