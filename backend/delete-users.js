// Delete old users (created with wrong hash)
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteUsers() {
    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .in('email', ['admin@arksipainka.com', 'moderator@arksipainka.com']);

        if (error) {
            console.error('❌ Error:', error);
        } else {
            console.log('✅ Old users deleted');
        }
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
    }
}

deleteUsers();
