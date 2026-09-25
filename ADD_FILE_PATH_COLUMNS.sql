-- Add individual file path columns to track multiple file types per invoice
-- This allows tracking invoice PDF, bukti bayar, and faktur pajak separately
-- Without needing a separate invoice_files table (which has schema cache issues)

ALTER TABLE public.invoice_file_list
ADD COLUMN IF NOT EXISTS invoice_pdf_path TEXT,
ADD COLUMN IF NOT EXISTS bukti_bayar_path TEXT,
ADD COLUMN IF NOT EXISTS faktur_pajak_path TEXT;

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_invoice_pdf_path ON public.invoice_file_list(invoice_pdf_path) WHERE invoice_pdf_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bukti_bayar_path ON public.invoice_file_list(bukti_bayar_path) WHERE bukti_bayar_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_faktur_pajak_path ON public.invoice_file_list(faktur_pajak_path) WHERE faktur_pajak_path IS NOT NULL;
