const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAnnouncements() {
    const { data: announcements, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    console.log('\n=== ANNOUNCEMENTS ===');
    announcements?.forEach(a => {
        console.log(`ID: ${a.id}, Type: ${a.recipient_type}, Title: ${a.title}`);
    });
    
    if (error) console.log('Error:', error);

    // Check announcement_recipients
    const { data: recipients, error: recipientError } = await supabase
        .from('announcement_recipients')
        .select('*');

    console.log('\n=== ANNOUNCEMENT_RECIPIENTS ===');
    recipients?.forEach(r => {
        console.log(`Announcement ${r.announcement_id}, Type: ${r.recipient_type}, Recipient ID: ${r.recipient_id}`);
    });

    if (recipientError) console.log('Error:', recipientError);
}

checkAnnouncements();
