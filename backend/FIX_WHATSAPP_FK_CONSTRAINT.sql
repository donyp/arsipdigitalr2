-- Remove foreign key constraint on moderator_id
-- This allows notifications to be saved even if user doesn't exist in users table
-- Reason: User may be deleted but notifications should persist
-- And JWT tokens might have user IDs that don't exist in database yet

ALTER TABLE whatsapp_invoice_notifications 
DROP CONSTRAINT IF EXISTS whatsapp_invoice_notifications_moderator_id_fkey;

-- Verify constraint was removed
SELECT constraint_name 
FROM information_schema.table_constraints 
WHERE table_name = 'whatsapp_invoice_notifications' 
AND constraint_type = 'FOREIGN KEY';
-- Should show only fk_zona, not the moderator_id constraint
