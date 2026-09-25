-- ========================================================================
-- Pusat Arsip Anka - Complete Database Schema Initialization
-- ========================================================================
-- This SQL script sets up the entire database schema for Supabase
-- Run this in Supabase SQL Editor or via psql
-- 
-- DO NOT run individual sections - run the entire script at once
-- ========================================================================

-- ========================================================================
-- SECTION 1: ENUM TYPES
-- ========================================================================

CREATE TYPE severity_level AS ENUM ('info', 'warning', 'critical');
CREATE TYPE issue_severity AS ENUM ('info', 'warning', 'error');
CREATE TYPE rule_type AS ENUM ('format', 'range', 'reference', 'pattern');

-- ========================================================================
-- SECTION 2: CORE TABLES
-- ========================================================================

-- ZONAS (17 regions)
CREATE TABLE IF NOT EXISTS zonas (
    id SERIAL PRIMARY KEY,
    nama TEXT NOT NULL,
    kode TEXT UNIQUE NOT NULL,
    deskripsi TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TOKO (sub-categories per zone)
CREATE TABLE IF NOT EXISTS toko (
    id SERIAL PRIMARY KEY,
    nama TEXT NOT NULL,
    zona_id INT NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
    kode TEXT UNIQUE NOT NULL,
    deskripsi TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USERS (JWT-based authentication)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'moderator', 'admin_zona')),
    zona_id INT REFERENCES zonas(id) ON DELETE SET NULL,
    toko_id INT REFERENCES toko(id) ON DELETE SET NULL,
    name TEXT,
    is_active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- FILES (metadata storage for rclone/R2)
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_file TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    zona_id INT NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
    toko_id INT REFERENCES toko(id) ON DELETE SET NULL,
    category TEXT CHECK (category IN ('PPN', 'NON_PPN', 'INVOICE', 'PIUTANG')),
    no_invoice TEXT,
    total_jual NUMERIC(15,2),
    ukuran_bytes BIGINT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'Unread',
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_missing BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMPTZ,
    sync_error TEXT
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    context TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- UPLOAD REQUESTS (ticket system)
CREATE TABLE IF NOT EXISTS upload_requests (
    id SERIAL PRIMARY KEY,
    zona_id INT NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pesan TEXT NOT NULL,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Selesai', 'Ditolak')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- ========================================================================
-- SECTION 3: INVOICE MANAGEMENT TABLES
-- ========================================================================

-- EXCEL UPLOAD BATCHES (Excel tracking)
CREATE TABLE IF NOT EXISTS excel_upload_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    total_rows INT NOT NULL DEFAULT 0,
    processed_rows INT NOT NULL DEFAULT 0,
    failed_rows INT NOT NULL DEFAULT 0,
    duplicate_rows INT NOT NULL DEFAULT 0,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'processing',
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INVOICE FILE LIST (master invoice tracking)
CREATE TABLE IF NOT EXISTS invoice_file_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal DATE NOT NULL,
    toko VARCHAR(255) NOT NULL,
    toko_raw TEXT,
    toko_id INT REFERENCES toko(id) ON DELETE SET NULL,
    faktur VARCHAR(100) NOT NULL UNIQUE,
    metode_bayar VARCHAR(50),
    jenis_transaksi VARCHAR(50),
    konsumen TEXT,
    keterangan VARCHAR(50),
    total_jumlah_jual DECIMAL(15,2) NOT NULL DEFAULT 0,
    item_count INT NOT NULL DEFAULT 0,
    zona_id INT REFERENCES zonas(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    uploaded_file_path TEXT,
    uploaded_at TIMESTAMPTZ,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    excel_batch_id UUID REFERENCES excel_upload_batches(id) ON DELETE SET NULL,
    excel_uploaded_at TIMESTAMPTZ,
    excel_uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- FAKTUR PAJAK RENAME HISTORY
CREATE TABLE IF NOT EXISTS faktur_pajak_rename_history (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    invoice_id UUID REFERENCES invoice_file_list(id) ON DELETE CASCADE,
    faktur VARCHAR(100) NOT NULL,
    zona_id INT,
    old_filename VARCHAR(500) NOT NULL,
    new_filename VARCHAR(500) NOT NULL,
    old_path VARCHAR(1000),
    new_path VARCHAR(1000),
    renamed_by VARCHAR(100) NOT NULL,
    user_email VARCHAR(100),
    renamed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(500),
    status VARCHAR(50) DEFAULT 'completed',
    notes TEXT
);

-- ========================================================================
-- SECTION 4: FILE SHARING SYSTEM
-- ========================================================================

-- FILE SHARES (shareable links with expiry)
CREATE TABLE IF NOT EXISTS file_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    access_count INTEGER DEFAULT 0,
    max_access_count INTEGER,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- FILE SHARE ACCESS LOGS
CREATE TABLE IF NOT EXISTS file_share_access_logs (
    id SERIAL PRIMARY KEY,
    share_id UUID NOT NULL REFERENCES file_shares(id) ON DELETE CASCADE,
    accessed_at TIMESTAMP DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT
);

-- ========================================================================
-- SECTION 5: NOTIFICATION SYSTEM
-- ========================================================================

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('update', 'file_upload', 'comment', 'quota', 'maintenance', 'approval', 'share', 'system')),
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    icon TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

-- NOTIFICATION PREFERENCES
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN DEFAULT false,
    email_frequency TEXT DEFAULT 'instant' CHECK (email_frequency IN ('instant', 'daily', 'weekly', 'never')),
    types_enabled JSONB DEFAULT '{"update":true, "file_upload":true, "comment":true, "quota":true, "maintenance":true, "approval":true, "share":true, "system":true}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WHATSAPP INVOICE NOTIFICATIONS
CREATE TABLE IF NOT EXISTS whatsapp_invoice_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zona_id INTEGER NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
    moderator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_count INTEGER NOT NULL CHECK (invoice_count > 0),
    invoice_details JSONB DEFAULT '[]'::jsonb,
    message TEXT NOT NULL,
    notification_type TEXT DEFAULT 'invoice_upload',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    batch_id TEXT
);

-- ========================================================================
-- SECTION 6: MONITORING & QUALITY TABLES
-- ========================================================================

-- SYSTEM METRICS
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value FLOAT NOT NULL CHECK (metric_value >= 0),
    tags JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SYSTEM ALERTS
CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    severity severity_level DEFAULT 'info',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_notes TEXT
);

-- SYSTEM METRICS DAILY
CREATE TABLE IF NOT EXISTS system_metrics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    min_value FLOAT,
    max_value FLOAT,
    avg_value FLOAT,
    error_count INT DEFAULT 0,
    UNIQUE(date, metric_name)
);

-- DATA QUALITY ISSUES
CREATE TABLE IF NOT EXISTS data_quality_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    issue_type VARCHAR(50) NOT NULL,
    issue_description TEXT NOT NULL,
    severity issue_severity DEFAULT 'warning',
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,
    auto_fixable BOOLEAN DEFAULT FALSE,
    suggested_fix JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VALIDATION RULES
CREATE TABLE IF NOT EXISTS validation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name VARCHAR(100) UNIQUE NOT NULL,
    rule_type rule_type DEFAULT 'pattern',
    rule_config JSONB NOT NULL,
    severity issue_severity DEFAULT 'error',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================================
-- SECTION 7: FILE COLLABORATION
-- ========================================================================

-- FILE COMMENTS
CREATE TABLE IF NOT EXISTS file_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    comment TEXT NOT NULL,
    mentions UUID[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- FILE COMMENT REACTIONS
CREATE TABLE IF NOT EXISTS file_comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES file_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id, reaction)
);

-- ========================================================================
-- SECTION 8: SESSION MANAGEMENT
-- ========================================================================

-- USER SESSIONS
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_name VARCHAR(255),
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    ip_address VARCHAR(45),
    location VARCHAR(255),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id)
);

-- SUSPICIOUS ACTIVITIES
CREATE TABLE IF NOT EXISTS suspicious_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    activity_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT,
    ip_address VARCHAR(45),
    location VARCHAR(255),
    metadata JSONB,
    is_resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================================================
-- SECTION 9: SUPPORT & FAQ SYSTEM
-- ========================================================================

-- SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(20) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    zona_id INTEGER NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'General',
    priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
    status VARCHAR(20) NOT NULL DEFAULT 'Open',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP
);

-- SUPPORT MESSAGES
CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SUPPORT ATTACHMENTS
CREATE TABLE IF NOT EXISTS support_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    message_id UUID REFERENCES support_messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SUPPORT TICKET ACTIVITY
CREATE TABLE IF NOT EXISTS support_ticket_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    old_value VARCHAR(255),
    new_value VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FAQ CATEGORIES
CREATE TABLE IF NOT EXISTS faq_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    order_number INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FAQ ARTICLES
CREATE TABLE IF NOT EXISTS faq_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES faq_categories(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    order_number INT DEFAULT 0,
    views INT DEFAULT 0,
    helpful_count INT DEFAULT 0,
    not_helpful_count INT DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FAQ ARTICLE VERSIONS
CREATE TABLE IF NOT EXISTS faq_article_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES faq_articles(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================================
-- SECTION 10: INDEXES
-- ========================================================================

-- File Indexes
CREATE INDEX idx_files_zona_id ON files(zona_id);
CREATE INDEX idx_files_category ON files(category);
CREATE INDEX idx_files_toko_id ON files(toko_id);
CREATE INDEX idx_files_created_at ON files(created_at DESC);
CREATE INDEX idx_files_zona_category ON files(zona_id, category) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_deleted ON files(deleted_at);
CREATE INDEX idx_files_is_missing ON files(is_missing) WHERE is_missing = TRUE;
CREATE INDEX idx_files_last_synced ON files(last_synced_at);

-- User Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_zona_id ON users(zona_id);

-- Toko Indexes
CREATE INDEX idx_toko_zona ON toko(zona_id);

-- Upload Request Indexes
CREATE INDEX idx_requests_zona ON upload_requests(zona_id);
CREATE INDEX idx_requests_status ON upload_requests(status);

-- Invoice Indexes
CREATE INDEX idx_invoice_faktur ON invoice_file_list(faktur);
CREATE INDEX idx_invoice_status ON invoice_file_list(status);
CREATE INDEX idx_invoice_tanggal ON invoice_file_list(tanggal DESC);
CREATE INDEX idx_invoice_toko ON invoice_file_list(toko);
CREATE INDEX idx_invoice_keterangan ON invoice_file_list(keterangan);
CREATE INDEX idx_invoice_batch ON invoice_file_list(excel_batch_id);
CREATE INDEX idx_invoice_date_status ON invoice_file_list(tanggal, status);
CREATE INDEX idx_invoice_jenis ON invoice_file_list(jenis_transaksi);
CREATE INDEX idx_invoice_zona ON invoice_file_list(zona_id);
CREATE INDEX idx_invoice_toko_id ON invoice_file_list(toko_id);

-- File Sharing Indexes
CREATE INDEX idx_file_shares_token ON file_shares(share_token);
CREATE INDEX idx_file_shares_file_id ON file_shares(file_id);
CREATE INDEX idx_file_shares_expires_at ON file_shares(expires_at);
CREATE INDEX idx_share_access_share_id ON file_share_access_logs(share_id);
CREATE INDEX idx_share_access_accessed_at ON file_share_access_logs(accessed_at);

-- System Health Indexes
CREATE INDEX idx_system_metrics_recorded_at ON system_metrics(recorded_at DESC);
CREATE INDEX idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX idx_system_alerts_created_at ON system_alerts(created_at DESC);
CREATE INDEX idx_system_alerts_severity ON system_alerts(severity);
CREATE INDEX idx_system_metrics_daily_date ON system_metrics_daily(date DESC);

-- Data Quality Indexes
CREATE INDEX idx_data_quality_file_id ON data_quality_issues(file_id);
CREATE INDEX idx_data_quality_issue_type ON data_quality_issues(issue_type);
CREATE INDEX idx_data_quality_resolved ON data_quality_issues(resolved);
CREATE INDEX idx_validation_rules_enabled ON validation_rules(enabled);

-- Comment Indexes
CREATE INDEX idx_file_comments_file_id ON file_comments(file_id);
CREATE INDEX idx_file_comments_user_id ON file_comments(user_id);
CREATE INDEX idx_file_comments_created_at ON file_comments(created_at DESC);
CREATE INDEX idx_file_comments_resolved ON file_comments(resolved_at);
CREATE INDEX idx_comment_reactions_comment_id ON file_comment_reactions(comment_id);

-- Session & Security Indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active) WHERE is_active = true;
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_suspicious_activities_user_id ON suspicious_activities(user_id);
CREATE INDEX idx_suspicious_activities_severity ON suspicious_activities(severity);
CREATE INDEX idx_suspicious_activities_resolved ON suspicious_activities(is_resolved) WHERE is_resolved = false;

-- Support Indexes
CREATE INDEX idx_ticket_number ON support_tickets(ticket_number);
CREATE INDEX idx_ticket_user_id ON support_tickets(user_id);
CREATE INDEX idx_ticket_zona_id ON support_tickets(zona_id);
CREATE INDEX idx_ticket_status ON support_tickets(status);
CREATE INDEX idx_ticket_assigned_to ON support_tickets(assigned_to);
CREATE INDEX idx_ticket_created_at ON support_tickets(created_at);
CREATE INDEX idx_ticket_user_zona ON support_tickets(user_id, zona_id);
CREATE INDEX idx_ticket_status_zona ON support_tickets(status, zona_id);
CREATE INDEX idx_ticket_assigned_status ON support_tickets(assigned_to, status);

CREATE INDEX idx_msg_ticket_id ON support_messages(ticket_id);
CREATE INDEX idx_msg_user_id ON support_messages(user_id);
CREATE INDEX idx_msg_created_at ON support_messages(created_at);
CREATE INDEX idx_msg_ticket_created ON support_messages(ticket_id, created_at);

CREATE INDEX idx_att_ticket_id ON support_attachments(ticket_id);
CREATE INDEX idx_att_message_id ON support_attachments(message_id);
CREATE INDEX idx_att_uploaded_by ON support_attachments(uploaded_by);

CREATE INDEX idx_activity_ticket_id ON support_ticket_activity(ticket_id);
CREATE INDEX idx_activity_user_id ON support_ticket_activity(user_id);
CREATE INDEX idx_activity_action ON support_ticket_activity(action);

-- FAQ Indexes
CREATE INDEX idx_faq_categories_order ON faq_categories(order_number);
CREATE INDEX idx_faq_articles_category_id ON faq_articles(category_id);
CREATE INDEX idx_faq_articles_featured ON faq_articles(featured);
CREATE INDEX idx_faq_articles_views ON faq_articles(views DESC);
CREATE INDEX idx_faq_articles_tags ON faq_articles USING GIN(tags);
CREATE INDEX idx_faq_articles_created_at ON faq_articles(created_at DESC);

-- ========================================================================
-- SECTION 11: FUNCTIONS
-- ========================================================================

-- Update invoice updated_at timestamp
CREATE OR REPLACE FUNCTION update_invoice_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update excel batch updated_at timestamp
CREATE OR REPLACE FUNCTION update_excel_batch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update notification preferences updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update support tickets timestamp
CREATE OR REPLACE FUNCTION update_support_tickets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update support messages timestamp
CREATE OR REPLACE FUNCTION update_support_messages_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(24), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Deactivate expired shares
CREATE OR REPLACE FUNCTION deactivate_expired_shares()
RETURNS INTEGER AS $$
DECLARE
    affected_count INT;
BEGIN
    UPDATE file_shares
    SET is_active = FALSE
    WHERE is_active = TRUE AND expires_at < NOW();
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- Get invoice statistics
CREATE OR REPLACE FUNCTION get_invoice_statistics()
RETURNS TABLE (
    total_count BIGINT,
    uploaded_count BIGINT,
    pending_count BIGINT,
    missing_count BIGINT,
    uploaded_percentage NUMERIC,
    pending_percentage NUMERIC,
    missing_percentage NUMERIC,
    total_modal_sum NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_count,
        COUNT(*) FILTER (WHERE status = 'UPLOADED')::BIGINT as uploaded_count,
        COUNT(*) FILTER (WHERE status = 'PENDING')::BIGINT as pending_count,
        COUNT(*) FILTER (WHERE status = 'MISSING')::BIGINT as missing_count,
        ROUND((COUNT(*) FILTER (WHERE status = 'UPLOADED')::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2) as uploaded_percentage,
        ROUND((COUNT(*) FILTER (WHERE status = 'PENDING')::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2) as pending_percentage,
        ROUND((COUNT(*) FILTER (WHERE status = 'MISSING')::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2) as missing_percentage,
        COALESCE(SUM(total_jumlah_jual), 0)::NUMERIC as total_modal_sum
    FROM invoice_file_list;
END;
$$ LANGUAGE plpgsql;

-- Mark old pending invoices as missing
CREATE OR REPLACE FUNCTION mark_old_pending_as_missing(days_threshold INT DEFAULT 3)
RETURNS TABLE (
    updated_count INT,
    faktur_list TEXT[]
) AS $$
DECLARE
    affected_count INT;
    faktur_array TEXT[];
BEGIN
    -- Get list of affected fakturs
    SELECT ARRAY_AGG(faktur)
    INTO faktur_array
    FROM invoice_file_list
    WHERE status = 'PENDING'
    AND created_at < NOW() - (days_threshold || ' days')::INTERVAL;

    -- Update status
    UPDATE invoice_file_list
    SET status = 'MISSING'
    WHERE status = 'PENDING'
    AND created_at < NOW() - (days_threshold || ' days')::INTERVAL;

    GET DIAGNOSTICS affected_count = ROW_COUNT;

    RETURN QUERY SELECT affected_count::INT, COALESCE(faktur_array, '{}'::TEXT[]);
END;
$$ LANGUAGE plpgsql;

-- Log Faktur Pajak Rename
CREATE OR REPLACE FUNCTION log_faktur_pajak_rename(
    p_invoice_id UUID,
    p_faktur VARCHAR,
    p_old_filename VARCHAR,
    p_new_filename VARCHAR,
    p_old_path VARCHAR,
    p_new_path VARCHAR,
    p_renamed_by VARCHAR,
    p_user_email VARCHAR,
    p_reason VARCHAR,
    p_zona_id INT
)
RETURNS BIGINT AS $$
DECLARE
    new_id BIGINT;
BEGIN
    INSERT INTO faktur_pajak_rename_history (
        invoice_id, faktur, zona_id, old_filename, new_filename,
        old_path, new_path, renamed_by, user_email, reason
    )
    VALUES (
        p_invoice_id, p_faktur, p_zona_id, p_old_filename, p_new_filename,
        p_old_path, p_new_path, p_renamed_by, p_user_email, p_reason
    )
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old rename history
CREATE OR REPLACE FUNCTION cleanup_faktur_pajak_rename_history()
RETURNS void AS $$
BEGIN
    DELETE FROM faktur_pajak_rename_history
    WHERE created_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- ========================================================================
-- SECTION 12: TRIGGERS
-- ========================================================================

CREATE TRIGGER trigger_invoice_updated_at
BEFORE UPDATE ON invoice_file_list
FOR EACH ROW
EXECUTE FUNCTION update_invoice_updated_at();

CREATE TRIGGER trigger_batch_updated_at
BEFORE UPDATE ON excel_upload_batches
FOR EACH ROW
EXECUTE FUNCTION update_excel_batch_updated_at();

CREATE TRIGGER trigger_notification_preferences_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_notification_preferences_updated_at();

CREATE TRIGGER trg_update_support_tickets_timestamp
BEFORE UPDATE ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION update_support_tickets_timestamp();

CREATE TRIGGER trg_update_support_messages_timestamp
BEFORE UPDATE ON support_messages
FOR EACH ROW
EXECUTE FUNCTION update_support_messages_timestamp();

-- ========================================================================
-- SECTION 13: SEED DATA
-- ========================================================================

-- Insert 17 Zonas
INSERT INTO zonas (nama, kode, deskripsi) VALUES
('Zona 1', 'zona-01', 'Zona Balaraja dan sekitarnya'),
('Zona 2', 'zona-02', 'Zona Bintaro dan sekitarnya'),
('Zona 3', 'zona-03', 'Zona Ciledug dan sekitarnya'),
('Zona 4', 'zona-04', 'Zona Gading Serpong dan sekitarnya'),
('Zona 5', 'zona-05', 'Zona Joglo dan sekitarnya'),
('Zona 6', 'zona-06', 'Zona Karang Tengah dan sekitarnya'),
('Zona 7', 'zona-07', 'Zona Pinang dan sekitarnya'),
('Zona 8', 'zona-08', 'Zona Sawangan dan sekitarnya'),
('Zona 9', 'zona-09', 'Zona Tangerang Timur'),
('Zona 10', 'zona-10', 'Zona Tangerang Selatan'),
('Zona 11', 'zona-11', 'Zona Tangerang Barat'),
('Zona 12', 'zona-12', 'Zona Bogor'),
('Zona 13', 'zona-13', 'Zona Depok'),
('Zona 14', 'zona-14', 'Zona Bekasi'),
('Zona 15', 'zona-15', 'Zona Pemalang'),
('Zona 16', 'zona-16', 'Zona Jakarta'),
('Zona 17', 'zona-17', 'Zona Regional')
ON CONFLICT (kode) DO NOTHING;

-- Insert sample Toko (stores) for Zona 1
INSERT INTO toko (nama, zona_id, kode, deskripsi) VALUES
('Balaraja', 1, 'toko-balaraja', 'Toko Balaraja'),
('Bitung', 1, 'toko-bitung', 'Toko Bitung'),
('Cilegon', 1, 'toko-cilegon', 'Toko Cilegon'),
('Cipondoh', 1, 'toko-cipondoh', 'Toko Cipondoh'),
('Ciruas', 1, 'toko-ciruas', 'Toko Ciruas'),
('Kutabumi', 1, 'toko-kutabumi', 'Toko Kutabumi'),
('Serang Timur', 1, 'toko-serang-timur', 'Toko Serang Timur'),
('Pasar Kemis', 1, 'toko-pasar-kemis', 'Toko Pasar Kemis')
ON CONFLICT (kode) DO NOTHING;

-- Insert sample Toko for Zona 14 (Bekasi)
INSERT INTO toko (nama, zona_id, kode, deskripsi) VALUES
('Bekasi Pusat', 14, 'toko-bekasi-pusat', 'Toko Bekasi Pusat'),
('Bekasi Utara', 14, 'toko-bekasi-utara', 'Toko Bekasi Utara'),
('Bekasi Selatan', 14, 'toko-bekasi-selatan', 'Toko Bekasi Selatan')
ON CONFLICT (kode) DO NOTHING;

-- Insert sample Toko for Zona 15 (Pemalang)
INSERT INTO toko (nama, zona_id, kode, deskripsi) VALUES
('Pemalang Pusat', 15, 'toko-pemalang-pusat', 'Toko Pemalang Pusat'),
('Pemalang Timur', 15, 'toko-pemalang-timur', 'Toko Pemalang Timur'),
('Pemalang Barat', 15, 'toko-pemalang-barat', 'Toko Pemalang Barat')
ON CONFLICT (kode) DO NOTHING;

-- Insert FAQ Categories
INSERT INTO faq_categories (name, description, icon, order_number) VALUES
('Uploading Files', 'How to upload files to the system', '📤', 1),
('File Management', 'Managing and organizing files', '📁', 2),
('Searching & Filtering', 'How to find files and apply filters', '🔍', 3),
('Reports & Analytics', 'Understanding reports and metrics', '📊', 4),
('Troubleshooting', 'Common issues and solutions', '🔧', 5),
('Account & Security', 'Account management and security', '🔐', 6)
ON CONFLICT (name) DO NOTHING;

-- Insert Validation Rules
INSERT INTO validation_rules (rule_name, rule_type, rule_config, severity, enabled) VALUES
('filename_format', 'pattern', '{"pattern": "^[a-zA-Z0-9_-]{3,}\\.[a-zA-Z0-9]{2,}$"}', 'warning', TRUE),
('nominal_positive', 'range', '{"min": 0, "max": 999999999}', 'error', TRUE),
('tanggal_not_future', 'format', '{"type": "date", "not_future": true}', 'warning', TRUE),
('file_size_limit', 'range', '{"max_bytes": 104857600}', 'error', TRUE),
('file_type_valid', 'pattern', '{"allowed_types": ["pdf", "xlsx", "xls", "csv", "doc", "docx"]}', 'error', TRUE),
('zona_matches_toko', 'reference', '{"check": "zona_id_matches_toko_zona_id"}', 'warning', TRUE),
('toko_exists', 'reference', '{"check": "toko_id_in_toko_table"}', 'error', TRUE),
('nominal_reasonable', 'range', '{"min": 1000, "max": 500000000}', 'warning', TRUE)
ON CONFLICT (rule_name) DO NOTHING;

-- ========================================================================
-- SECTION 14: VIEWS
-- ========================================================================

-- Invoice Dashboard Summary View
DROP VIEW IF EXISTS invoice_dashboard_summary CASCADE;
CREATE VIEW invoice_dashboard_summary AS
SELECT 
    DATE(tanggal) as tanggal,
    toko,
    keterangan,
    COUNT(*) as total_files,
    COUNT(*) FILTER (WHERE status = 'UPLOADED') as uploaded_files,
    COUNT(*) FILTER (WHERE status = 'PENDING') as pending_files,
    COUNT(*) FILTER (WHERE status = 'MISSING') as missing_files,
    SUM(total_jumlah_jual) as total_jumlah_jual,
    ROUND((COUNT(*) FILTER (WHERE status = 'UPLOADED')::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2) as upload_percentage
FROM invoice_file_list
GROUP BY DATE(tanggal), toko, keterangan
ORDER BY tanggal DESC, toko, keterangan;

-- ========================================================================
-- FINAL VERIFICATION
-- ========================================================================

-- Count all tables
SELECT 
    'Total Tables' as metric,
    COUNT(*)::TEXT as value
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
UNION ALL
SELECT 'Total Indexes', COUNT(*)::TEXT
FROM pg_indexes WHERE schemaname = 'public'
UNION ALL
SELECT 'Total Functions', COUNT(*)::TEXT
FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ========================================================================
-- SCHEMA INITIALIZATION COMPLETE
-- ========================================================================
-- 
-- Summary:
-- - 25 main tables created
-- - 50+ indexes for performance
-- - 8 database functions for automation
-- - 5 triggers for timestamp updates
-- - Initial seed data (17 zonas, FAQ categories, validation rules)
-- - 1 dashboard view for invoices
-- - ENUM types for data integrity
--
-- Ready for application use!
-- ========================================================================
