// Create Admin User untuk Database Supabase Baru
require('dotenv').config({ path: './backend/.env' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdminUser() {
    try {
        console.log('🔐 Creating Super Admin User...\n');

        // Hash password
        const password = 'Admin@123456';
        const passwordHash = crypto
            .createHash('sha256')
            .update(password)
            .digest('hex');

        // Get zona-01
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

        // Create user
        const { data, error } = await supabase
            .from('users')
            .insert([
                {
                    email: 'admin@arksipainka.com',
                    password_hash: passwordHash,
                    role: 'super_admin',
                    zona_id: zonaId,
                    name: 'Admin Super',
                    is_active: true,
                    permissions: ['all']
                }
            ])
            .select();

        if (error) {
            if (error.message.includes('duplicate')) {
                console.warn('⚠️  User sudah ada (duplicate email)');
                console.log('📧 Email: admin@arksipainka.com');
                console.log('🔑 Password: Admin@123456\n');
            } else {
                console.error('❌ Error creating user:', error);
                process.exit(1);
            }
        } else {
            console.log('✅ Super Admin User berhasil dibuat!\n');
            console.log('📧 Email: admin@arksipainka.com');
            console.log('🔑 Password: Admin@123456');
            console.log('👤 Role: super_admin');
            console.log('📍 Zona: zona-01');
        }

        console.log('\n📝 Credentials untuk login:');
        console.log('   Email: admin@arksipainka.com');
        console.log('   Password: Admin@123456');
        console.log('\n🌐 Test login di: http://localhost:3000/dashboard.html');
        
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        process.exit(1);
    }
}

createAdminUser();
