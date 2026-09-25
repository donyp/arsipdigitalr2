// Fix admin user permissions
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPermissions() {
    try {
        console.log('🔧 Fixing admin permissions...\n');

        // Update admin user
        const { error: adminError } = await supabase
            .from('users')
            .update({
                permissions: [
                    'all',
                    'manage_users',
                    'manage_files',
                    'manage_invoices',
                    'soft_delete',
                    'restore_trash',
                    'upload_files'
                ]
            })
            .eq('email', 'admin@arksipainka.com');

        if (adminError) {
            console.error('❌ Error updating admin:', adminError);
        } else {
            console.log('✅ Admin permissions updated');
        }

        // Update moderator user
        const { error: modError } = await supabase
            .from('users')
            .update({
                permissions: [
                    'manage_files',
                    'manage_invoices',
                    'upload_files'
                ]
            })
            .eq('email', 'moderator@arksipainka.com');

        if (modError) {
            console.error('❌ Error updating moderator:', modError);
        } else {
            console.log('✅ Moderator permissions updated');
        }

        console.log('\n✅ All permissions fixed!');
        
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

fixPermissions();
