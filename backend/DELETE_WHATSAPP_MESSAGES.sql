-- ============================================================
-- DELETE WHATSAPP MESSAGES - Multiple Options
-- ============================================================
-- Gunakan salah satu query sesuai kebutuhan Anda

-- ============================================================
-- OPTION 1: DELETE SEMUA WhatsApp Messages
-- ============================================================
DELETE FROM whatsapp_notifications;
DELETE FROM whatsapp_invoice_notifications;


-- ============================================================
-- OPTION 2: DELETE WhatsApp Messages yang Sudah Sent
-- ============================================================
DELETE FROM whatsapp_notifications 
WHERE sent_at IS NOT NULL;

DELETE FROM whatsapp_invoice_notifications 
WHERE sent_at IS NOT NULL;


-- ============================================================
-- OPTION 3: DELETE WhatsApp Messages yang BELUM Sent
-- ============================================================
DELETE FROM whatsapp_notifications 
WHERE sent_at IS NULL;

DELETE FROM whatsapp_invoice_notifications 
WHERE sent_at IS NULL;


-- ============================================================
-- OPTION 4: DELETE WhatsApp Messages Berdasarkan Tanggal
-- Hapus messages yang dibuat SEBELUM tanggal tertentu
-- ============================================================
DELETE FROM whatsapp_notifications 
WHERE created_at < '2026-09-01'::timestamp;

DELETE FROM whatsapp_invoice_notifications 
WHERE created_at < '2026-09-01'::timestamp;


-- ============================================================
-- OPTION 5: DELETE WhatsApp Messages untuk Invoice Tertentu
-- Hapus notifications untuk faktur/invoice spesifik
-- ============================================================
DELETE FROM whatsapp_invoice_notifications 
WHERE faktur = '835100310100126001';  -- Ganti dengan faktur yang ingin dihapus


-- ============================================================
-- OPTION 6: DELETE WhatsApp Messages untuk Zona Tertentu
-- ============================================================
DELETE FROM whatsapp_invoice_notifications 
WHERE zona_id = 121;  -- Ganti dengan zona_id yang ingin dihapus


-- ============================================================
-- OPTION 7: DELETE WhatsApp Messages dengan Status Tertentu
-- ============================================================
DELETE FROM whatsapp_invoice_notifications 
WHERE status = 'FAILED';  -- Ganti dengan status yang ingin dihapus (PENDING, SENT, FAILED, etc)


-- ============================================================
-- OPTION 8: DELETE WhatsApp Messages untuk Moderator/User Tertentu
-- ============================================================
DELETE FROM whatsapp_invoice_notifications 
WHERE moderator_id = 'user-id-here';  -- Ganti dengan moderator_id


-- ============================================================
-- OPTION 9: DELETE WhatsApp Messages dalam Range Tanggal
-- ============================================================
DELETE FROM whatsapp_notifications 
WHERE created_at BETWEEN '2026-08-01'::timestamp AND '2026-08-31'::timestamp;

DELETE FROM whatsapp_invoice_notifications 
WHERE created_at BETWEEN '2026-08-01'::timestamp AND '2026-08-31'::timestamp;


-- ============================================================
-- OPTION 10: DELETE WhatsApp Messages Lama (X hari yang lalu)
-- Hapus messages yang lebih dari 30 hari lalu
-- ============================================================
DELETE FROM whatsapp_notifications 
WHERE created_at < NOW() - INTERVAL '30 days';

DELETE FROM whatsapp_invoice_notifications 
WHERE created_at < NOW() - INTERVAL '30 days';


-- ============================================================
-- VERIFIKASI: Cek Jumlah Pesan Sebelum & Sesudah Delete
-- ============================================================

-- Count sebelum delete:
SELECT 'whatsapp_notifications' as table_name, COUNT(*) as total_messages FROM whatsapp_notifications
UNION ALL
SELECT 'whatsapp_invoice_notifications', COUNT(*) FROM whatsapp_invoice_notifications;

-- Count sesuai status:
SELECT 
    'whatsapp_notifications' as table_name, 
    status, 
    COUNT(*) as count 
FROM whatsapp_notifications
GROUP BY status
UNION ALL
SELECT 
    'whatsapp_invoice_notifications', 
    status, 
    COUNT(*) 
FROM whatsapp_invoice_notifications
GROUP BY status;

-- Count sesuai tanggal:
SELECT 
    DATE(created_at) as date,
    COUNT(*) as message_count
FROM whatsapp_invoice_notifications
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Count unsent messages:
SELECT 
    'whatsapp_notifications' as table_name, 
    COUNT(*) as unsent_count 
FROM whatsapp_notifications 
WHERE sent_at IS NULL
UNION ALL
SELECT 
    'whatsapp_invoice_notifications',
    COUNT(*) 
FROM whatsapp_invoice_notifications 
WHERE sent_at IS NULL;


-- ============================================================
-- CLEANUP: Truncate Tables (HAPUS SEMUA DATA + RESET ID)
-- HATI-HATI! Operasi ini tidak bisa di-undo!
-- ============================================================
-- TRUNCATE TABLE whatsapp_notifications CASCADE;
-- TRUNCATE TABLE whatsapp_invoice_notifications CASCADE;
