-- ============================================================
-- Retensi otomatis tiket support
-- Tiket berstatus 'Closed' selama >= 3 hari dihapus permanen oleh
-- job backend (support-ticket-retention.js), termasuk foto di R2
-- pada folder support-tickets/<ticket_id>/.
--
-- Jalankan sekali di Supabase SQL Editor.
-- ============================================================

-- Kolom acuan waktu tiket ditutup (idempoten)
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Backfill tiket Closed lama yang belum punya closed_at
UPDATE support_tickets
SET closed_at = COALESCE(updated_at, created_at)
WHERE status = 'Closed' AND closed_at IS NULL;

-- Index untuk pencarian kandidat retensi
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_closed_at
    ON support_tickets (status, closed_at);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_updated_at
    ON support_tickets (status, updated_at);

-- Index untuk penghapusan data anak per tiket
CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket_id
    ON support_attachments (ticket_id);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id
    ON support_messages (ticket_id);

CREATE INDEX IF NOT EXISTS idx_support_ticket_activity_ticket_id
    ON support_ticket_activity (ticket_id);
