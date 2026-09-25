-- Function untuk automatically update files_uploaded_count dan files_required_count
-- Dipanggil otomatis ketika ada perubahan di invoice_pdf_path, bukti_bayar_path, atau faktur_pajak_path

CREATE OR REPLACE FUNCTION update_invoice_files_count()
RETURNS TRIGGER AS $$
DECLARE
  v_uploaded_count INTEGER := 0;
  v_required_count INTEGER := 2;  -- Default untuk NON-PPN
BEGIN
  -- Hitung file yang sudah upload
  IF NEW.invoice_pdf_path IS NOT NULL THEN
    v_uploaded_count := v_uploaded_count + 1;
  END IF;
  
  IF NEW.bukti_bayar_path IS NOT NULL THEN
    v_uploaded_count := v_uploaded_count + 1;
  END IF;
  
  IF NEW.faktur_pajak_path IS NOT NULL THEN
    v_uploaded_count := v_uploaded_count + 1;
  END IF;
  
  -- Tentukan jumlah file yang diperlukan
  IF NEW.keterangan = 'PPN' THEN
    v_required_count := 3;  -- Invoice + Bukti Bayar + Faktur Pajak
  ELSE
    v_required_count := 2;  -- Invoice + Bukti Bayar
  END IF;
  
  -- Update kolom
  NEW.files_uploaded_count := v_uploaded_count;
  NEW.files_required_count := v_required_count;
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Jika function sudah ada, ganti (replace) dengan versi baru di atas
-- Function ini akan dipanggil SEBELUM ada INSERT atau UPDATE

-- Pastikan trigger sudah ada
CREATE TRIGGER IF NOT EXISTS trigger_update_invoice_files_count
BEFORE INSERT OR UPDATE OF invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, keterangan
ON invoice_file_list
FOR EACH ROW
EXECUTE FUNCTION update_invoice_files_count();
