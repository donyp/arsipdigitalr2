-- Delete Excel upload data from October 21 (all years)
-- This script removes invoice file records uploaded on October 21
-- PostgreSQL compatible syntax

BEGIN TRANSACTION;

-- First, identify files uploaded on October 21
SELECT 
    faktur,
    tanggal,
    COUNT(*) as file_count
FROM invoice_file_list
WHERE EXTRACT(DAY FROM tanggal) = 21 
    AND EXTRACT(MONTH FROM tanggal) = 10
GROUP BY faktur, tanggal
ORDER BY tanggal DESC;

-- Delete associated invoice_files records first (related records)
DELETE FROM invoice_files
WHERE faktur IN (
    SELECT faktur FROM invoice_file_list
    WHERE EXTRACT(DAY FROM tanggal) = 21 
        AND EXTRACT(MONTH FROM tanggal) = 10
);

-- Delete invoice_file_list records uploaded on October 21
DELETE FROM invoice_file_list
WHERE EXTRACT(DAY FROM tanggal) = 21 
    AND EXTRACT(MONTH FROM tanggal) = 10;

-- Verify deletion
SELECT 
    COUNT(*) as remaining_files
FROM invoice_file_list
WHERE EXTRACT(DAY FROM tanggal) = 21 
    AND EXTRACT(MONTH FROM tanggal) = 10;

COMMIT;

-- Summary message via query result
SELECT 'October 21 data deletion complete. Check verification query above - should return 0 remaining files.' as status;
