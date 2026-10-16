/**
 * ================================================================
 * AUTOMATIC FILE COUNT TRIGGER
 * ================================================================
 * 
 * Database trigger yang OTOMATIS update files_uploaded_count
 * setiap kali ada INSERT/UPDATE/DELETE di tabel invoice_files
 * 
 * Ini akan fix masalah bulk upload dimana background process
 * tidak sempat update count karena race condition
 * 
 * ================================================================
 */

-- ================================================================
-- STEP 1: Create function untuk update count
-- ================================================================

CREATE OR REPLACE FUNCTION update_invoice_file_count()
RETURNS TRIGGER AS $$
DECLARE
    v_count INTEGER;
    v_keterangan TEXT;
    v_required INTEGER;
BEGIN
    -- Get the faktur that was affected (from NEW or OLD record)
    DECLARE
        v_faktur VARCHAR(50);
    BEGIN
        -- Determine which faktur was affected
        IF (TG_OP = 'DELETE') THEN
            v_faktur := OLD.faktur;
        ELSE
            v_faktur := NEW.faktur;
        END IF;
        
        -- Count files for this faktur from invoice_files table
        SELECT COUNT(DISTINCT file_type) INTO v_count
        FROM invoice_files
        WHERE faktur = v_faktur;
        
        -- Get keterangan to determine required count
        SELECT keterangan INTO v_keterangan
        FROM invoice_file_list
        WHERE faktur = v_faktur;
        
        -- Set required count (PPN = 3, NON PPN = 2)
        IF v_keterangan = 'PPN' THEN
            v_required := 3;
        ELSE
            v_required := 2;
        END IF;
        
        -- Update invoice_file_list with new count
        UPDATE invoice_file_list
        SET 
            files_uploaded_count = v_count,
            files_required_count = v_required,
            updated_at = NOW()
        WHERE faktur = v_faktur;
        
        RAISE NOTICE 'Updated files_uploaded_count for faktur % to %', v_faktur, v_count;
    END;
    
    -- Return appropriate value based on operation
    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- STEP 2: Create trigger on invoice_files table
-- ================================================================

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_update_file_count ON invoice_files;

-- Create new trigger
CREATE TRIGGER trigger_update_file_count
    AFTER INSERT OR UPDATE OR DELETE ON invoice_files
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_file_count();

-- ================================================================
-- STEP 3: Test the trigger
-- ================================================================

-- Verify trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_update_file_count';

-- ================================================================
-- STEP 4: Initial sync (run once to fix existing data)
-- ================================================================

-- Update all invoices with correct count from invoice_files
UPDATE invoice_file_list ifl
SET 
    files_uploaded_count = COALESCE((
        SELECT COUNT(DISTINCT file_type)
        FROM invoice_files ifx
        WHERE ifx.faktur = ifl.faktur
    ), 0),
    files_required_count = CASE WHEN ifl.keterangan = 'PPN' THEN 3 ELSE 2 END,
    updated_at = NOW()
WHERE EXISTS (
    SELECT 1 FROM invoice_files ifx WHERE ifx.faktur = ifl.faktur
)
OR files_uploaded_count > 0; -- Also fix any invoices with wrong count

-- Show summary
SELECT 
    'TRIGGER CREATED & INITIAL SYNC COMPLETE' as status,
    COUNT(*) as total_invoices,
    SUM(files_uploaded_count) as total_files,
    COUNT(CASE WHEN files_uploaded_count > 0 THEN 1 END) as invoices_with_files,
    COUNT(CASE WHEN files_uploaded_count >= files_required_count THEN 1 END) as complete_invoices
FROM invoice_file_list;

/**
 * ================================================================
 * HOW IT WORKS:
 * ================================================================
 * 
 * 1. Setiap kali ada INSERT ke invoice_files (file upload)
 *    → Trigger OTOMATIS hitung ulang files_uploaded_count
 *    → Update invoice_file_list
 * 
 * 2. Setiap kali ada DELETE dari invoice_files (file delete)
 *    → Trigger OTOMATIS kurangi count
 *    → Update invoice_file_list
 * 
 * 3. Bulk upload 300+ files?
 *    → Setiap file yang masuk akan trigger update
 *    → Tidak perlu manual sync lagi
 *    → REAL-TIME & AKURAT
 * 
 * ================================================================
 * VERIFICATION QUERIES:
 * ================================================================
 */

-- Check if count matches between invoice_files and invoice_file_list
SELECT 
    ifl.faktur,
    ifl.files_uploaded_count as counted_in_list,
    COUNT(DISTINCT ifx.file_type) as actual_in_files,
    CASE 
        WHEN ifl.files_uploaded_count = COUNT(DISTINCT ifx.file_type) THEN '✅ MATCH'
        ELSE '❌ MISMATCH'
    END as status
FROM invoice_file_list ifl
LEFT JOIN invoice_files ifx ON ifx.faktur = ifl.faktur
GROUP BY ifl.faktur, ifl.files_uploaded_count
HAVING ifl.files_uploaded_count != COUNT(DISTINCT ifx.file_type)
   OR COUNT(DISTINCT ifx.file_type) > 0
ORDER BY status DESC, ifl.faktur
LIMIT 50;

-- Show recent uploads with their counts
SELECT 
    faktur,
    files_uploaded_count,
    files_required_count,
    CASE 
        WHEN files_uploaded_count >= files_required_count THEN '✅ COMPLETE'
        WHEN files_uploaded_count > 0 THEN '⚠️ PARTIAL'
        ELSE '❌ EMPTY'
    END as status,
    updated_at
FROM invoice_file_list
WHERE files_uploaded_count > 0
ORDER BY updated_at DESC
LIMIT 30;

