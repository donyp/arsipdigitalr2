-- Update toko names to match Excel format (standardize names)
-- This ensures konsumen lookup matches between Excel and web database

-- 1. Dunia Baja Cibitung → MEGA BAJA CIBITUNG
UPDATE toko 
SET nama = 'MEGA BAJA CIBITUNG'
WHERE LOWER(TRIM(nama)) = LOWER(TRIM('Dunia Baja Cibitung'));

-- 2. Mega Baja Sukadami (formerly Cikarang Dua) → Mega Baja Sukadami (no change, but keep for reference)
-- Old data: MEGA BAJA CIKARANG DUA → map to Mega Baja Sukadami
UPDATE toko 
SET nama = 'Mega Baja Sukadami'
WHERE LOWER(TRIM(nama)) LIKE '%sukadami%';

-- 3. Mega Baja Rangkas Bitung → MEGA BAJA RANGKASBITUNG
UPDATE toko 
SET nama = 'MEGA BAJA RANGKASBITUNG'
WHERE LOWER(TRIM(nama)) LIKE '%rangkas%bitung%' OR LOWER(TRIM(nama)) LIKE '%rangkasbitung%';

-- 4. Mega Baja Bantar Gebang → MEGA BAJA BANTARGEBANG
UPDATE toko 
SET nama = 'MEGA BAJA BANTARGEBANG'
WHERE LOWER(TRIM(nama)) LIKE '%bantar%gebang%' OR LOWER(TRIM(nama)) LIKE '%bantargebang%';

-- 5. Mega Baja Kuta Bali → MEGA BAJA KUTA - BALI
UPDATE toko 
SET nama = 'MEGA BAJA KUTA - BALI'
WHERE LOWER(TRIM(nama)) LIKE '%kuta%bali%';

-- 6. Mega Baja Garut (CV Bainit Unggul) → MEGA BAJA GARUT
UPDATE toko 
SET nama = 'MEGA BAJA GARUT'
WHERE LOWER(TRIM(nama)) LIKE '%garut%' AND LOWER(TRIM(nama)) LIKE '%bainit%';

-- 7. Mega Baja Pemalang → MEGA BAJA INDONESIA PEMALANG
UPDATE toko 
SET nama = 'MEGA BAJA INDONESIA PEMALANG'
WHERE LOWER(TRIM(nama)) LIKE '%pemalang%' AND LOWER(TRIM(nama)) NOT LIKE '%indonesia%';

-- 8. Mega Baja Cibarusah → MEGA BAJA CIBARUSAH
UPDATE toko 
SET nama = 'MEGA BAJA CIBARUSAH'
WHERE LOWER(TRIM(nama)) LIKE '%cibarusah%';

-- For old MEGA BAJA CIKARANG DUA invoices, map them to Sukadami zona
-- This requires a mapping table. For now, just standardize the name if it exists
UPDATE toko 
SET nama = 'Mega Baja Sukadami'
WHERE LOWER(TRIM(nama)) = LOWER(TRIM('MEGA BAJA CIKARANG DUA'));

-- Verify changes
SELECT nama, zona_id FROM toko ORDER BY zona_id, nama;
