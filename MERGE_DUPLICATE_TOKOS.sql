-- ============================================================
-- SAFE DUPLICATE TOKO MERGER - Step by Step
-- ============================================================
-- This script helps merge duplicate tokos safely
-- Do NOT run all at once - follow steps carefully!

-- STEP 1: IDENTIFY DUPLICATES
-- Run this first to see which tokos are duplicated
SELECT 
    nama,
    zona_id,
    COUNT(*) as count,
    STRING_AGG(CAST(id as text), ', ') as toko_ids
FROM toko
GROUP BY nama, zona_id
HAVING COUNT(*) > 1
ORDER BY nama, zona_id;


-- STEP 2: AUDIT - See what data is attached to each duplicate
-- For each duplicate pair, check which one has more data
-- Replace 'Dunia Baja Cibitung' with your toko name
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


-- STEP 3: MERGE DATA - Update all references from old toko to new toko
-- IMPORTANT: Replace:
--   - OLD_TOKO_ID with the duplicate you want to DELETE (fewer files)
--   - NEW_TOKO_ID with the one you want to KEEP (more files)

BEGIN TRANSACTION;

-- Move files from old toko to new toko
UPDATE files 
SET toko_id = NEW_TOKO_ID 
WHERE toko_id = OLD_TOKO_ID;

COMMIT;


-- STEP 4: VERIFY MERGE - Check if all data moved correctly
SELECT 
    toko_id,
    COUNT(*) as file_count
FROM files
WHERE toko_id IN (OLD_TOKO_ID, NEW_TOKO_ID)
GROUP BY toko_id;


-- STEP 5: DELETE DUPLICATE - Only after verifying STEP 4
-- Make sure all data has been moved (file_count should be 0 for OLD_TOKO_ID)
DELETE FROM toko 
WHERE id = OLD_TOKO_ID;


-- VERIFY DELETE
SELECT COUNT(*) as remaining_tokos FROM toko WHERE id = OLD_TOKO_ID;


