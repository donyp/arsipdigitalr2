-- ========================================================================
-- STORED PROCEDURE: Update Invoice PDF Path (Bypasses PostgREST Cache)
-- ========================================================================
-- This procedure uses raw SQL instead of PostgREST to bypass schema cache issues
-- 
-- Usage in Node.js:
--   const { data, error } = await supabase.rpc('update_invoice_pdf_path', {
--       p_faktur: '835100311020926004',
--       p_invoice_pdf_path: 'ARSIP/BEKASI/PPN/2026/SEPTEMBER/02/835100311020926004.pdf',
--       p_bukti_bayar_path: null,
--       p_faktur_pajak_path: null,
--       p_uploaded_at: new Date().toISOString(),
--       p_uploaded_by: 'user-uuid'
--   });

CREATE OR REPLACE FUNCTION update_invoice_pdf_path(
    p_faktur VARCHAR,
    p_invoice_pdf_path TEXT,
    p_bukti_bayar_path TEXT DEFAULT NULL,
    p_faktur_pajak_path TEXT DEFAULT NULL,
    p_uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    p_uploaded_by UUID DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    faktur VARCHAR,
    invoice_pdf_path TEXT,
    bukti_bayar_path TEXT,
    faktur_pajak_path TEXT,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Find invoice by faktur
    SELECT id INTO v_id
    FROM invoice_file_list
    WHERE faktur = p_faktur
    LIMIT 1;

    -- If not found, return error via success=false
    IF v_id IS NULL THEN
        RETURN QUERY SELECT
            false::BOOLEAN as success,
            p_faktur::VARCHAR,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    -- Update the invoice with file paths
    UPDATE invoice_file_list
    SET
        invoice_pdf_path = COALESCE(p_invoice_pdf_path, invoice_pdf_path),
        bukti_bayar_path = COALESCE(p_bukti_bayar_path, bukti_bayar_path),
        faktur_pajak_path = COALESCE(p_faktur_pajak_path, faktur_pajak_path),
        uploaded_at = p_uploaded_at,
        uploaded_by = COALESCE(p_uploaded_by, uploaded_by),
        updated_at = NOW()
    WHERE id = v_id;

    -- Return updated data
    RETURN QUERY SELECT
        true::BOOLEAN as success,
        faktur::VARCHAR,
        invoice_pdf_path::TEXT,
        bukti_bayar_path::TEXT,
        faktur_pajak_path::TEXT,
        updated_at::TIMESTAMPTZ
    FROM invoice_file_list
    WHERE id = v_id;

END;
$$ LANGUAGE plpgsql;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION update_invoice_pdf_path TO authenticated;
GRANT EXECUTE ON FUNCTION update_invoice_pdf_path TO service_role;

-- Test query (run in SQL Editor):
-- SELECT * FROM update_invoice_pdf_path(
--     p_faktur := '835100311020926004',
--     p_invoice_pdf_path := 'ARSIP/BEKASI/PPN/2026/SEPTEMBER/02/835100311020926004.pdf',
--     p_uploaded_at := NOW()
-- );
