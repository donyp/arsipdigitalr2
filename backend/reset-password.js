// Reset user passwords
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetPasswords() {
    try {
        console.log('🔧 Resetting passwords...\n');

        // Reset admin password
        const adminPassword = 'Admin@123456';
        const adminSalt = await bcrypt.genSalt(12);
        const adminHash = await bcrypt.hash(adminPassword, adminSalt);

        const { error: adminError } = await supabase
            .from('users')
            .update({ password_hash: adminHash })
            .eq('email', 'admin@arksipainka.com');

        if (adminError) {
            console.error('❌ Error updating admin:', adminError);
        } else {
            console.log('✅ Admin password reset');
            console.log('   Email: admin@arksipainka.com');
            console.log('   Password: Admin@123456');
        }

        // Reset moderator password
        const modPassword = 'null123';
        const modSalt = await bcrypt.genSalt(12);
        const modHash = await bcrypt.hash(modPassword, modSalt);

        const { error: modError } = await supabase
            .from('users')
            .update({ password_hash: modHash })
            .eq('email', 'moderator@arksipainka.com');

        if (modError) {
            console.error('❌ Error updating moderator:', modError);
        } else {
            console.log('\n✅ Moderator password reset');
            console.log('   Email: moderator@arksipainka.com');
            console.log('   Password: null123');
        }

        console.log('\n✅ All passwords reset!');
        
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

resetPasswords();
