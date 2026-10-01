# Setup PDF to CSV Conversion Feature

## Database Setup

Jalankan SQL script berikut di Supabase SQL Editor untuk membuat table dan view yang diperlukan:

```bash
# Di Supabase Dashboard > SQL Editor
# Jalankan file: backend/CREATE_PDF_CONVERSION_TABLE.sql
```

Atau copy-paste query dari file `CREATE_PDF_CONVERSION_TABLE.sql`.

## Table Structure

### `pdf_conversions`
Menyimpan history konversi PDF ke CSV:
- `id` - Primary key
- `user_id` - ID user yang melakukan konversi
- `user_email` - Email user
- `bank` - Bank yang dipilih (bca/bsi/muamalat)
- `original_filename` - Nama file PDF asli
- `file_size` - Ukuran file dalam bytes
- `page_count` - Jumlah halaman PDF
- `transaction_count` - Jumlah transaksi yang ditemukan
- `csv_filename` - Nama file CSV hasil konversi
- `status` - Status konversi (success/failed/processing)
- `error_message` - Pesan error jika gagal
- `processing_time_ms` - Waktu proses dalam milliseconds
- `ip_address` - IP address user
- `user_agent` - Browser user agent
- `created_at` - Timestamp konversi

### `pdf_conversion_stats` (View)
View untuk statistik konversi (untuk admin dashboard):
- Total konversi per bank
- Success/failed rate
- Daily statistics

## API Endpoints

### POST `/api/pdf-to-csv/convert`
Convert PDF to CSV
- **Auth**: Required (JWT token)
- **Body**: FormData with `pdf` file and `bank` parameter
- **Response**: CSV file download

### GET `/api/pdf-to-csv/history`
Get user's conversion history
- **Auth**: Required (JWT token)
- **Response**: JSON array of conversion records

### GET `/api/pdf-to-csv/stats`
Get conversion statistics (Admin only)
- **Auth**: Required (Admin role)
- **Response**: Statistics by bank and date

### GET `/api/pdf-to-csv/health`
Health check endpoint
- **Auth**: Not required
- **Response**: `{ status: 'ok', service: 'pdf-to-csv' }`

## Features

✅ Multi-bank support (BCA, BSI, Muamalat)
✅ Automatic transaction parsing
✅ CSV output with UTF-8 BOM for Excel
✅ Conversion history tracking
✅ Error logging
✅ Performance metrics (processing time)
✅ Admin statistics view

## Testing

1. Login ke aplikasi
2. Buka menu "Rename Tools" > "PDF to CSV"
3. Upload PDF mutasi bank
4. Pilih bank yang sesuai
5. Klik "Konversi ke CSV"
6. File CSV akan otomatis terdownload
7. Cek history di bagian "Riwayat Konversi"

## Admin Dashboard (Future Enhancement)

Stats endpoint sudah tersedia untuk implementasi admin dashboard:
- `/api/pdf-to-csv/stats` - Get conversion statistics
- Shows daily conversion trends
- Bank usage distribution
- Success/failure rates
