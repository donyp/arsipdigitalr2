#!/usr/bin/env node

/**
 * Execute WhatsApp Invoice Notifications Table Migration
 * 
 * Usage:
 *   node backend/execute-whatsapp-migration.js
 * 
 * This script creates the whatsapp_invoice_notifications table in Supabase
 * Required environment variables:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

console.log('🔄 Initializing Supabase client...');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
    try {
        // Read the SQL migration file
        const migrationPath = path.join(__dirname, 'CREATE_WHATSAPP_INVOICE_NOTIFICATIONS.sql');
        
        if (!fs.existsSync(migrationPath)) {
            throw new Error(`Migration file not found: ${migrationPath}`);
        }

        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log('📋 Running migration SQL...\n');

        // Execute the SQL
        const { data, error } = await supabase.rpc('exec', {
            command: sql
        }).catch(() => {
            // Fallback: Use the admin API to execute raw SQL
            return new Promise((resolve) => {
                // Try using postgres connection directly via supabase-js admin API
                const { error: execError } = supabase.sql`
                    CREATE TABLE IF NOT EXISTS whatsapp_invoice_notifications (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        zona_id BIGINT NOT NULL,
                        moderator_id UUID NOT NULL,
                        invoice_count BIGINT,
                        invoice_details JSONB,
                        message TEXT NOT NULL,
                        batch_id VARCHAR(255),
                        notification_type VARCHAR(50) DEFAULT 'invoice_upload',
                        sent_at TIMESTAMP,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW(),
                        CONSTRAINT fk_zona FOREIGN KEY (zona_id) REFERENCES zonas(id) ON DELETE CASCADE,
                        CONSTRAINT fk_moderator FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL
                    );
                
                    CREATE INDEX IF NOT EXISTS idx_whatsapp_zona_id ON whatsapp_invoice_notifications(zona_id);
                    CREATE INDEX IF NOT EXISTS idx_whatsapp_moderator_id ON whatsapp_invoice_notifications(moderator_id);
                    CREATE INDEX IF NOT EXISTS idx_whatsapp_batch_id ON whatsapp_invoice_notifications(batch_id);
                    CREATE INDEX IF NOT EXISTS idx_whatsapp_notification_type ON whatsapp_invoice_notifications(notification_type);
                    CREATE INDEX IF NOT EXISTS idx_whatsapp_sent_at ON whatsapp_invoice_notifications(sent_at);
                    CREATE INDEX IF NOT EXISTS idx_whatsapp_created_at ON whatsapp_invoice_notifications(created_at DESC);
                    
                    ALTER TABLE whatsapp_invoice_notifications ENABLE ROW LEVEL SECURITY;
                    GRANT ALL ON whatsapp_invoice_notifications TO authenticated;
                    GRANT ALL ON whatsapp_invoice_notifications TO anon;
                `;

                resolve({ error: execError });
            });
        });

        if (error) {
            throw error;
        }

        console.log('✅ Migration completed successfully!\n');
        console.log('📊 Table created: whatsapp_invoice_notifications');
        console.log('📊 Indexes created:');
        console.log('   - idx_whatsapp_zona_id');
        console.log('   - idx_whatsapp_moderator_id');
        console.log('   - idx_whatsapp_batch_id');
        console.log('   - idx_whatsapp_notification_type');
        console.log('   - idx_whatsapp_sent_at');
        console.log('   - idx_whatsapp_created_at\n');
        console.log('✨ WhatsApp notifications are now ready to use!');
        
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:');
        console.error(error.message || error);
        console.error('\n📌 Alternative: Run manually in Supabase SQL Editor');
        console.error('   1. Go to https://app.supabase.com');
        console.error('   2. Select your project');
        console.error('   3. Click SQL Editor → New Query');
        console.error('   4. Copy content from backend/CREATE_WHATSAPP_INVOICE_NOTIFICATIONS.sql');
        console.error('   5. Click Run');
        process.exit(1);
    }
}

// Test connection first
async function testConnection() {
    try {
        const { data, error } = await supabase.from('zonas').select('id').limit(1);
        if (error) throw error;
        console.log('✅ Supabase connection successful\n');
        return true;
    } catch (error) {
        console.error('❌ Cannot connect to Supabase:');
        console.error(error.message);
        console.error('\n📌 Check your .env file:');
        console.error('   - SUPABASE_URL must be set');
        console.error('   - SUPABASE_SERVICE_ROLE_KEY must be set');
        return false;
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║ WhatsApp Invoice Notifications Migration   ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const connected = await testConnection();
    if (!connected) {
        process.exit(1);
    }

    await runMigration();
}

main();
