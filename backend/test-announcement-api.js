// Test announcement API
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAPI() {
    console.log('Testing Announcement API...\n');

    try {
        // First get a moderator user for testing
        const { data: moderator, error: modError } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('role', 'moderator')
            .limit(1)
            .maybeSingle();

        if (modError) {
            console.error('Error fetching moderator:', modError);
            return;
        }

        if (!moderator) {
            console.log('❌ No moderator user found in database');
            return;
        }

        console.log('✓ Found moderator:', moderator.email);

        // Test 1: Create an announcement
        console.log('\n--- Test 1: Creating announcement ---');
        const announcementData = {
            title: 'Test Announcement',
            content: '<p>This is a test announcement</p>',
            announcement_type: 'Informasi',
            recipient_type: 'all_users',
            created_by: moderator.id,
            is_active: true
        };

        const { data: newAnnouncement, error: createError } = await supabase
            .from('announcements')
            .insert(announcementData)
            .select('id')
            .maybeSingle();

        if (createError) {
            console.error('❌ Error creating announcement:', createError);
            return;
        }

        console.log('✓ Announcement created:', newAnnouncement.id);
        const announcementId = newAnnouncement.id;

        // Test 2: Create read records
        console.log('\n--- Test 2: Creating read records ---');
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id')
            .eq('is_active', true)
            .limit(5);

        if (usersError) {
            console.error('❌ Error fetching users:', usersError);
            return;
        }

        console.log('✓ Found', users.length, 'users');

        const readRecords = users.map(u => ({
            announcement_id: announcementId,
            user_id: u.id,
            is_read: false,
            read_at: null
        }));

        const { error: readError } = await supabase
            .from('announcement_reads')
            .insert(readRecords);

        if (readError) {
            console.error('❌ Error creating read records:', readError);
            return;
        }

        console.log('✓ Read records created for', readRecords.length, 'users');

        // Test 3: Get unread count
        console.log('\n--- Test 3: Getting unread count ---');
        if (users.length > 0) {
            const { data: unread, error: unreadError } = await supabase
                .from('announcement_reads')
                .select('id')
                .eq('user_id', users[0].id)
                .eq('is_read', false);

            if (unreadError) {
                console.error('❌ Error getting unread count:', unreadError);
                return;
            }

            console.log('✓ Unread count:', unread.length);
        }

        console.log('\n✅ All tests passed!');

    } catch (error) {
        console.error('Error:', error);
    }

    process.exit(0);
}

testAPI();
