/**
 * ================================================================
 * HIGH-PERFORMANCE SYNC FUNCTION
 * ================================================================
 * 
 * Stored procedure untuk sync files_uploaded_count dengan cepat
 * Bisa dipanggil dari API atau manual
 * 
 * Performance: ~1000 invoices dalam <2 detik
 * 
 * ================================================================
 */

-- ================================================================
-- Create function untuk batch sync
-- ================================================================

CREATE OR REPLACE FUNCTION sync_all_file_counts_v2()
RETURNS INTEGER AS $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    -- Update semua invoice_file_list dengan count dari invoice_files
    -- Menggunakan CTE untuk performa optimal
    WITH file_counts AS (
        SELECT 
            faktur,
            COUNT(DISTINCT file_type) as file_count
        FROM invoice_files
        GROUP BY faktur
    ),
    updates AS (
        UPDATE invoice_file_list ifl
        SET 
            files_uploaded_count = COALESCE(fc.file_count, 0),
            files_required_count = CASE WHEN ifl.keterangan = 'PPN' THEN 3 ELSE 2 END,
            updated_at = NOW()
        FROM file_counts fc
        WHERE ifl.faktur = fc.faktur
          AND (
              ifl.files_uploaded_count != fc.file_count 
              OR ifl.files_uploaded_count IS NULL
          )
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_updated FROM updates;
    
    -- Also reset invoices with no files but count > 0
    WITH resets AS (
        UPDATE invoice_file_list ifl
        SET 
            files_uploaded_count = 0,
            updated_at = NOW()
        WHERE files_uploaded_count > 0
          AND NOT EXISTS (
              SELECT 1 FROM invoice_files ifx 
              WHERE ifx.faktur = ifl.faktur
          )
        RETURNING 1
    )
    SELECT v_updated + COUNT(*) INTO v_updated FROM resets;
    
    RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- Test the function
-- ================================================================

-- Run sync and see how many updated
SELECT sync_all_file_counts_v2() as invoices_updated;

-- Verify results
SELECT 
    'SYNC COMPLETE' as status,
    COUNT(*) as total_invoices,
    SUM(files_uploaded_count) as total_files,
    COUNT(CASE WHEN files_uploaded_count > 0 THEN 1 END) as with_files,
    COUNT(CASE WHEN files_uploaded_count >= files_required_count THEN 1 END) as complete
FROM invoice_file_list;

/**
 * ================================================================
 * HOW TO USE FROM API:
 * ================================================================
 * 
 * POST /api/invoice/batch-sync
 * Headers: Authorization: Bearer <token>
 * Body: {}
 * 
 * Response:
 * {
 *   "success": true,
 *   "updated": 234,
 *   "message": "Batch sync complete: 234 invoices updated",
 *   "duration_ms": 1543
 * }
 * 
 * ================================================================
 * HOW TO USE FROM SQL:
 * ================================================================
 * 
 * -- Manual sync semua invoices
 * SELECT sync_all_file_counts_v2();
 * 
 * -- Sync dalam transaction (rollback jika ada error)
 * BEGIN;
 *   SELECT sync_all_file_counts_v2();
 * COMMIT;
 * 
 * ================================================================
 */

-- ================================================================
-- Create function untuk sync specific fakturs (untuk quick-sync)
-- ================================================================

CREATE OR REPLACE FUNCTION sync_file_counts_by_fakturs(faktur_list TEXT[])
RETURNS TABLE(faktur VARCHAR(50), old_count INTEGER, new_count INTEGER, updated BOOLEAN) AS $$
BEGIN
    RETURN QUERY
    WITH file_counts AS (
        SELECT 
            ifx.faktur,
            COUNT(DISTINCT ifx.file_type) as file_count
        FROM invoice_files ifx
        WHERE ifx.faktur = ANY(faktur_list)
        GROUP BY ifx.faktur
    ),
    updates AS (
        UPDATE invoice_file_list ifl
        SET 
            files_uploaded_count = COALESCE(fc.file_count, 0),
            files_required_count = CASE WHEN ifl.keterangan = 'PPN' THEN 3 ELSE 2 END,
            updated_at = NOW()
        FROM file_counts fc
        WHERE ifl.faktur = fc.faktur
          AND ifl.faktur = ANY(faktur_list)
          AND ifl.files_uploaded_count != fc.file_count
        RETURNING 
            ifl.faktur,
            ifl.files_uploaded_count as old_count,
            fc.file_count as new_count,
            TRUE as updated
    )
    SELECT * FROM updates;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- Test sync by fakturs
-- ================================================================

-- Example: Sync specific invoices
SELECT * FROM sync_file_counts_by_fakturs(ARRAY['835100310', '835100311', '835100312']);

/**
 * ================================================================
 * USAGE SUMMARY:
 * ================================================================
 * 
 * 1. TRIGGER (AUTOMATIC) - Best for production
 *    → Jalankan CREATE_FILE_COUNT_TRIGGER.sql
 *    → Every INSERT/DELETE otomatis update count
 *    → Real-time, no manual intervention needed
 * 
 * 2. BATCH SYNC (MANUAL) - For bulk fixes
 *    → Call: SELECT sync_all_file_counts_v2();
 *    → Or: POST /api/invoice/batch-sync
 *    → Good after bulk upload selesai
 * 
 * 3. QUICK SYNC (SELECTIVE) - For specific invoices
 *    → Call: SELECT * FROM sync_file_counts_by_fakturs(ARRAY[...]);
 *    → Or: POST /api/invoice/quick-sync
 *    → Good for fixing individual invoices
 * 
 * ================================================================
 * RECOMMENDATION:
 * ================================================================
 * 
 * Install TRIGGER untuk prevent masalah di masa depan
 * Jalankan BATCH SYNC sekali untuk fix data yang ada sekarang
 * 
 * ================================================================
 */

