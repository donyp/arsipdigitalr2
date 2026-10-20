// ============================================================
// SYNC NEW ZONA TO ANNOUNCEMENTS
// ============================================================
// When a new zona is created or a zona needs backfill,
// automatically sync it to all announcements and create
// announcement_reads entries for all zona users
//
// Usage:
//   node backend/sync-zona-to-announcements.js <zona_id>
// ============================================================

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncZonaToAnnouncements(zonaId) {
    try {
        console.log(`\n🔄 Syncing zona ${zonaId} to announcements...`);

        // Step 1: Verify zona exists
        const { data: zonaData, error: zonaError } = await supabase
            .from('zonas')
            .select('id, nama')
            .eq('id', zonaId)
            .maybeSingle();

        if (zonaError || !zonaData) {
            console.error(`❌ Zona ${zonaId} not found:`, zonaError);
            return false;
        }

        console.log(`✅ Found zona: ${zonaData.nama} (ID: ${zonaId})`);

        // Step 2: Get all active users in this zona
        const { data: zonaUsers, error: usersError } = await supabase
            .from('users')
            .select('id, email')
            .eq('zona_id', zonaId)
            .eq('is_active', true);

        if (usersError) {
            console.error('❌ Error fetching zona users:', usersError);
            return false;
        }

        console.log(`ℹ️  Found ${zonaUsers.length} active users in this zona`);

        if (zonaUsers.length === 0) {
            console.warn('⚠️  No active users found in this zona');
            return false;
        }

        // Step 3: Get all announcements for this zona
        // Include: all_users, all_zonas, and specific_zonas targeting this zona
        const { data: allAnnouncements, error: announcementsError } = await supabase
            .from('announcements')
            .select('id, title, recipient_type')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (announcementsError) {
            console.error('❌ Error fetching announcements:', announcementsError);
            return false;
        }

        console.log(`ℹ️  Found ${allAnnouncements.length} total announcements`);

        // Separate announcements by type
        const allUsersAnnouncements = allAnnouncements.filter(a => a.recipient_type === 'all_users');
        const allZonasAnnouncements = allAnnouncements.filter(a => a.recipient_type === 'all_zonas');

        console.log(`   - all_users: ${allUsersAnnouncements.length}`);
        console.log(`   - all_zonas: ${allZonasAnnouncements.length}`);

        // Step 4: Add announcement_recipients entries for all_zonas announcements
        if (allZonasAnnouncements.length > 0) {
            const recipientRecords = allZonasAnnouncements.map(a => ({
                announcement_id: a.id,
                recipient_type: 'zona',
                recipient_id: zonaId
            }));

            const { data: recipientData, error: recipientError } = await supabase
                .from('announcement_recipients')
                .upsert(recipientRecords, { onConflict: 'announcement_id,recipient_type,recipient_id' })
                .select('announcement_id');

            if (recipientError) {
                console.error('❌ Error syncing announcement_recipients:', recipientError);
                return false;
            }

            console.log(`✅ Added ${recipientData.length} announcement_recipients entries`);
        }

        // Step 5: Create announcement_reads entries for all zona users
        // Include all_users + all_zonas announcements
        const announcementsForZona = [
            ...allUsersAnnouncements,
            ...allZonasAnnouncements
        ];

        const readRecords = [];
        for (const announcement of announcementsForZona) {
            for (const user of zonaUsers) {
                readRecords.push({
                    announcement_id: announcement.id,
                    user_id: user.id,
                    is_read: false,
                    read_at: null
                });
            }
        }

        if (readRecords.length > 0) {
            // Insert in batches to avoid payload size limits
            const batchSize = 500;
            for (let i = 0; i < readRecords.length; i += batchSize) {
                const batch = readRecords.slice(i, i + batchSize);
                const { error: readError } = await supabase
                    .from('announcement_reads')
                    .upsert(batch, { onConflict: 'announcement_id,user_id' });

                if (readError) {
                    console.error(`❌ Error creating announcement_reads batch ${i / batchSize + 1}:`, readError);
                    return false;
                }

                console.log(`✅ Synced batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(readRecords.length / batchSize)}`);
            }

            console.log(`✅ Created ${readRecords.length} announcement_reads entries`);
        }

        // Step 6: Summary
        console.log(`\n✅ Sync completed successfully!`);
        console.log(`   - Zona: ${zonaData.nama} (ID: ${zonaId})`);
        console.log(`   - Announcements synced: ${announcementsForZona.length} (${allUsersAnnouncements.length} all_users + ${allZonasAnnouncements.length} all_zonas)`);
        console.log(`   - Users in zona: ${zonaUsers.length}`);
        console.log(`   - Read records created: ${readRecords.length}`);
        console.log(`   - Users will now see unread announcements (🔴 dot)\n`);

        return true;
    } catch (error) {
        console.error('❌ Unexpected error:', error.message);
        return false;
    }
}

// Main
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
Usage: node backend/sync-zona-to-announcements.js <zona_id>

Examples:
  node backend/sync-zona-to-announcements.js 2
  node backend/sync-zona-to-announcements.js 5

This script will:
1. Verify the zona exists
2. Sync all all_zonas announcements to the zona
3. Create announcement_reads entries for all active users in that zona
4. Users will see unread announcements (red dot) after logging in
        `);
        process.exit(0);
    }

    const zonaId = parseInt(args[0]);
    if (isNaN(zonaId)) {
        console.error(`❌ Invalid zona_id: ${args[0]}`);
        process.exit(1);
    }

    const success = await syncZonaToAnnouncements(zonaId);
    process.exit(success ? 0 : 1);
}

main();
