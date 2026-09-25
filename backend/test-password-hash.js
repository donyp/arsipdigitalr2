// Test password hashing
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPasswordHash() {
    try {
        console.log('🔍 Testing Password Hash...\n');

        // Get user from DB
        const { data: user, error } = await supabase
            .from('users')
            .select('email, password_hash')
            .eq('email', 'admin@arksipainka.com')
            .single();

        if (error || !user) {
            console.error('❌ User not found:', error);
            return;
        }

        console.log('User found:', user.email);
        console.log('Stored hash (first 50 chars):', user.password_hash.substring(0, 50) + '...');

        // Test with correct password
        const correctPassword = 'Admin@123456';
        console.log('\n1️⃣  Testing with password:', correctPassword);
        const match1 = await bcrypt.compare(correctPassword, user.password_hash);
        console.log('   Result:', match1 ? '✅ MATCH' : '❌ NO MATCH');

        // Test with wrong password
        const wrongPassword = 'wrong123';
        console.log('\n2️⃣  Testing with password:', wrongPassword);
        const match2 = await bcrypt.compare(wrongPassword, user.password_hash);
        console.log('   Result:', match2 ? '✅ MATCH' : '❌ NO MATCH');

        // Also test bcrypt directly
        console.log('\n3️⃣  Testing bcrypt generation...');
        const testPassword = 'Admin@123456';
        const salt = await bcrypt.genSalt(12);
        const hash = await bcrypt.hash(testPassword, salt);
        console.log('Generated hash:', hash);
        
        const testMatch = await bcrypt.compare(testPassword, hash);
        console.log('Self-test:', testMatch ? '✅ MATCH' : '❌ NO MATCH');

    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

testPasswordHash();
