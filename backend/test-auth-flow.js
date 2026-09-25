// Test complete auth flow
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAuthFlow() {
    try {
        console.log('🔍 Testing Auth Flow...\n');

        // Step 1: Get user
        const email = 'admin@arksipainka.com';
        console.log(`1️⃣  Fetching user: ${email}`);
        
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, password_hash, role, zona_id, toko_id, is_active, permissions')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (userError || !user) {
            console.error('❌ User not found:', userError);
            return;
        }

        console.log('✅ User found:', { id: user.id, email: user.email, role: user.role, is_active: user.is_active });

        // Step 2: Test password match
        console.log('\n2️⃣  Testing password match...');
        const password = 'Admin@123456';
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!isMatch) {
            console.error('❌ Password mismatch!');
            return;
        }

        console.log('✅ Password match OK');

        // Step 3: Generate JWT
        console.log('\n3️⃣  Generating JWT...');
        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            jwtSecret,
            { expiresIn: '8h' }
        );

        console.log('✅ JWT generated:', token.substring(0, 50) + '...');

        // Step 4: Verify JWT
        console.log('\n4️⃣  Verifying JWT...');
        const decoded = jwt.verify(token, jwtSecret);
        console.log('✅ JWT verified:', { userId: decoded.userId, role: decoded.role });

        // Step 5: Test /api/auth/me query
        console.log('\n5️⃣  Simulating /api/auth/me query...');
        const { data: authMeUser, error: authMeError } = await supabase
            .from('users')
            .select('id, email, name, role, zona_id, toko_id, is_active, permissions')
            .eq('id', user.id)
            .single();

        if (authMeError) {
            console.error('❌ /api/auth/me query failed:', authMeError);
            return;
        }

        console.log('✅ /api/auth/me response:', {
            id: authMeUser.id,
            email: authMeUser.email,
            role: authMeUser.role,
            is_active: authMeUser.is_active,
            zona_id: authMeUser.zona_id
        });

        console.log('\n✅ All auth flow steps passed!');

    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

testAuthFlow();
