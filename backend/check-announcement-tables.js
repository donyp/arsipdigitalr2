// Check if announcement tables exist
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTables() {
    console.log('Checking announcement tables...\n');

    try {
        // Check announcements table
        const { data: announcements, error: announcementsError } = await supabase
            .from('announcements')
            .select('*')
            .limit(1);

        console.log('✓ announcements table:', announcementsError ? `❌ ${announcementsError.message}` : '✅ exists');

        // Check announcement_recipients table
        const { data: recipients, error: recipientsError } = await supabase
            .from('announcement_recipients')
            .select('*')
            .limit(1);

        console.log('✓ announcement_recipients table:', recipientsError ? `❌ ${recipientsError.message}` : '✅ exists');

        // Check announcement_reads table
        const { data: reads, error: readsError } = await supabase
            .from('announcement_reads')
            .select('*')
            .limit(1);

        console.log('✓ announcement_reads table:', readsError ? `❌ ${readsError.message}` : '✅ exists');

        console.log('\n--- Summary ---');
        const allExists = !announcementsError && !recipientsError && !readsError;
        if (allExists) {
            console.log('✅ All announcement tables exist!');
        } else {
            console.log('❌ Some tables are missing. You need to run CREATE_ANNOUNCEMENT_SYSTEM.sql');
        }

    } catch (error) {
        console.error('Error checking tables:', error);
    }

    process.exit(0);
}

checkTables();
