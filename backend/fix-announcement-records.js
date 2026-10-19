#!/usr/bin/env node

/**
 * Fix missing announcement read records for all users
 * Run: node backend/fix-announcement-records.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function fixAnnouncementRecords() {
    try {
        console.log('🔍 Starting announcement record fix...\n');

        // Get all active announcements
        const { data: announcements, error: annError } = await supabase
            .from('announcements')
            .select('id, recipient_type, title')
            .eq('is_active', true);

        if (annError) throw annError;

        console.log(`✓ Found ${announcements.length} active announcements`);
        console.log('  By type:', {
            all_users: announcements.filter(a => a.recipient_type === 'all_users').length,
            all_zonas: announcements.filter(a => a.recipient_type === 'all_zonas').length,
            specific_zonas: announcements.filter(a => a.recipient_type === 'specific_zonas').length,
            specific_users: announcements.filter(a => a.recipient_type === 'specific_users').length
        });

        // Get all active users
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, username, zona_id');

        if (usersError) throw usersError;

        console.log(`✓ Found ${users.length} active users\n`);

        let totalCreated = 0;

        // For each user
        for (const user of users) {
            const userId = user.id;
            const userZonaId = user.zona_id;

            // Determine eligible announcements
            let eligibleIds = [];

            // Add all_users announcements
            eligibleIds = eligibleIds.concat(
                announcements
                    .filter(a => a.recipient_type === 'all_users')
                    .map(a => a.id)
            );

            // Add all_zonas announcements if user has zona
            if (userZonaId) {
                eligibleIds = eligibleIds.concat(
                    announcements
                        .filter(a => a.recipient_type === 'all_zonas')
                        .map(a => a.id)
                );

                // Add specific_zonas for this user's zona
                const specificZonaAnnouncements = announcements.filter(a => a.recipient_type === 'specific_zonas');
                
                if (specificZonaAnnouncements.length > 0) {
                    const { data: recipients } = await supabase
                        .from('announcement_recipients')
                        .select('announcement_id')
                        .eq('recipient_type', 'zona')
                        .eq('recipient_id', userZonaId)
                        .in('announcement_id', specificZonaAnnouncements.map(a => a.id));

                    if (recipients) {
                        eligibleIds = eligibleIds.concat(recipients.map(r => r.announcement_id));
                    }
                }
            }

            // Get existing read records
            const { data: existingReads } = await supabase
                .from('announcement_reads')
                .select('announcement_id')
                .eq('user_id', userId)
                .in('announcement_id', eligibleIds);

            const existingIds = new Set((existingReads || []).map(r => r.announcement_id));

            // Find missing records
            const missingIds = eligibleIds.filter(id => !existingIds.has(id));

            if (missingIds.length > 0) {
                const readRecords = missingIds.map(id => ({
                    announcement_id: id,
                    user_id: userId,
                    is_read: false,
                    read_at: null
                }));

                const { error: insertError } = await supabase
                    .from('announcement_reads')
                    .insert(readRecords);

                if (insertError) {
                    console.error(`✗ Error creating records for ${user.username}:`, insertError);
                } else {
                    console.log(`✓ ${user.username} (zona ${userZonaId}): created ${missingIds.length} records`);
                    totalCreated += missingIds.length;
                }
            } else {
                console.log(`✓ ${user.username} (zona ${userZonaId}): already has all records`);
            }
        }

        console.log(`\n✅ Fix complete! Created ${totalCreated} missing read records`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

fixAnnouncementRecords();
