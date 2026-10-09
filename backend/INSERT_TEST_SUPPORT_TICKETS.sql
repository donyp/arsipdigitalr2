-- =====================================================
-- Insert Test Support Tickets
-- =====================================================
-- This script adds test tickets to the support_tickets table
-- so you can see data in the Support page dashboard

-- First, find a valid user_id from the users table
-- SELECT id, email, name FROM users LIMIT 5;

-- Then find a valid zona_id from zonas table
-- SELECT id, nama FROM zonas LIMIT 5;

-- Replace USER_ID and ZONA_ID with actual values from your database

INSERT INTO support_tickets (ticket_number, user_id, zona_id, subject, description, category, priority, status, created_at, updated_at)
VALUES
    ('#ANKA001', (SELECT id FROM users LIMIT 1), (SELECT id FROM zonas LIMIT 1), 'Test Ticket 1', 'Ini adalah ticket test pertama', 'General', 'Medium', 'Open', NOW(), NOW()),
    ('#ANKA002', (SELECT id FROM users LIMIT 1), (SELECT id FROM zonas LIMIT 1), 'Test Ticket 2', 'Ini adalah ticket test kedua', 'General', 'High', 'Open', NOW() - INTERVAL '1 day', NOW()),
    ('#ANKA003', (SELECT id FROM users LIMIT 1), (SELECT id FROM zonas LIMIT 1), 'Test Ticket 3', 'Ini adalah ticket test ketiga', 'General', 'Low', 'Answered', NOW() - INTERVAL '2 days', NOW()),
    ('#ANKA004', (SELECT id FROM users LIMIT 1), (SELECT id FROM zonas LIMIT 1), 'Test Ticket 4', 'Ini adalah ticket test keempat', 'General', 'Medium', 'Resolved', NOW() - INTERVAL '3 days', NOW());

-- Verify the data was inserted
SELECT COUNT(*) as total_tickets FROM support_tickets;
SELECT ticket_number, subject, status, priority, created_at FROM support_tickets ORDER BY created_at DESC LIMIT 10;
