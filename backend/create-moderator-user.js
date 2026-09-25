// Create Moderator User untuk Database Supabase Baru
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createModeratorUser() {
    try {
        console.log('🔐 Creating Moderator User...\n');

        // Hash password with bcrypt
        const password = 'null123';
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(password, salt);

        // Get zona-01 for default zona
        const { data: zonas, error: zonaError } = await supabase
            .from('zonas')
            .select('id')
            .eq('kode', 'zona-01')
            .limit(1);

        if (zonaError) {
            console.error('❌ Error fetching zona:', zonaError);
            process.exit(1);
        }

        const zonaId = zonas && zonas.length > 0 ? zonas[0].id : 1;

        // Create moderator user
        const { data, error } = await supabase
            .from('users')
            .insert([
                {
                    email: 'moderator@arksipainka.com',
                    password_hash: passwordHash,
                    role: 'admin_zona',
                    zona_id: zonaId,
                    name: 'Moderator',
                    is_active: true,
                    permissions: ['manage_files', 'manage_invoices', 'manage_users']
                }
            ])
            .select();

        if (error) {
            if (error.message && error.message.includes('duplicate')) {
                console.warn('⚠️  User sudah ada (duplicate email)');
                console.log('📧 Email: moderator@arksipainka.com');
                console.log('🔑 Password: null123\n');
            } else {
                console.error('❌ Error creating user:', error);
                process.exit(1);
            }
        } else {
            console.log('✅ Moderator User berhasil dibuat!\n');
            console.log('📧 Email: moderator@arksipainka.com');
            console.log('🔑 Password: null123');
            console.log('👤 Role: admin_zona');
            console.log('📍 Zona: zona-01');
        }

        console.log('\n📝 Credentials untuk login:');
        console.log('   Email: moderator@arksipainka.com');
        console.log('   Password: null123');
        console.log('\n🌐 Test login di: http://localhost:3000/dashboard.html');
        
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        process.exit(1);
    }
}

createModeratorUser();
