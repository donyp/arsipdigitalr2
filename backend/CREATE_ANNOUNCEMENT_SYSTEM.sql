-- Announcement System Tables (PostgreSQL)

-- Create ENUM types
CREATE TYPE announcement_type_enum AS ENUM ('Informasi', 'Peringatan', 'Penting', 'Maintenance');
CREATE TYPE recipient_type_enum AS ENUM ('all_users', 'specific_users', 'all_zonas', 'specific_zonas');
CREATE TYPE recipient_category_enum AS ENUM ('user', 'zona');

-- Main announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    announcement_type announcement_type_enum DEFAULT 'Informasi',
    recipient_type recipient_type_enum DEFAULT 'all_users',
    created_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_announcements_created_at ON announcements(created_at);
CREATE INDEX idx_announcements_recipient_type ON announcements(recipient_type);

-- Recipients mapping for specific users/zonas
CREATE TABLE IF NOT EXISTS announcement_recipients (
    id SERIAL PRIMARY KEY,
    announcement_id INT NOT NULL,
    recipient_type recipient_category_enum NOT NULL,
    recipient_id UUID NOT NULL,
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
);

CREATE INDEX idx_announcement_recipients_announcement ON announcement_recipients(announcement_id);
CREATE INDEX idx_announcement_recipients_recipient ON announcement_recipients(recipient_type, recipient_id);

-- Read status tracking for announcements
CREATE TABLE IF NOT EXISTS announcement_reads (
    id SERIAL PRIMARY KEY,
    announcement_id INT NOT NULL,
    user_id UUID NOT NULL,
    read_at TIMESTAMP NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(announcement_id, user_id),
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_announcement_reads_user_status ON announcement_reads(user_id, is_read);
