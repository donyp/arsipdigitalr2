-- ============================================================
-- Clear WhatsApp Invoice Notifications
-- ============================================================
-- This script clears all WhatsApp invoice notifications from the database
-- Use this when you want to reset and start fresh

-- Option 1: Delete all notifications (DESTRUCTIVE)
DELETE FROM whatsapp_invoice_notifications;

-- Reset auto-increment if needed (PostgreSQL)
-- ALTER SEQUENCE whatsapp_invoice_notifications_id_seq RESTART WITH 1;

-- Verify deletion
SELECT COUNT(*) as remaining_notifications FROM whatsapp_invoice_notifications;
-- Should show: 0

-- ============================================================
-- Alternative: Delete only specific notifications
-- ============================================================

-- Delete only pending (not sent) notifications
-- DELETE FROM whatsapp_invoice_notifications WHERE sent_at IS NULL;

-- Delete only sent notifications
-- DELETE FROM whatsapp_invoice_notifications WHERE sent_at IS NOT NULL;

-- Delete notifications from specific zona (e.g., zona_id = 5)
-- DELETE FROM whatsapp_invoice_notifications WHERE zona_id = 5;

-- Delete notifications from specific date range
-- DELETE FROM whatsapp_invoice_notifications 
-- WHERE created_at >= '2026-04-01' AND created_at < '2026-05-01';

-- Delete notifications from specific batch
-- DELETE FROM whatsapp_invoice_notifications WHERE batch_id = 'batch_1234567890_bulk_upload';

-- ============================================================
-- View notifications before deleting
-- ============================================================

-- Count by status
-- SELECT 
--   SUM(CASE WHEN sent_at IS NULL THEN 1 ELSE 0 END) as pending,
--   SUM(CASE WHEN sent_at IS NOT NULL THEN 1 ELSE 0 END) as sent,
--   COUNT(*) as total
-- FROM whatsapp_invoice_notifications;

-- Count by zona
-- SELECT zona_id, COUNT(*) as count FROM whatsapp_invoice_notifications 
-- GROUP BY zona_id ORDER BY zona_id;

-- View recent notifications
-- SELECT id, zona_id, invoice_count, created_at, sent_at 
-- FROM whatsapp_invoice_notifications 
-- ORDER BY created_at DESC LIMIT 20;
