/**
 * Test New User Creation with Auth Sync
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:5000';
const MODERATOR_EMAIL = 'donisugiharto322@gmail.com';
const MODERATOR_PASSWORD = 'Arsip@2024'; // Use actual password

async function testNewUserCreation() {
    try {
        console.log('🧪 Testing new user creation with auth sync...\n');

        // First, let's diagnose: check if Doni has username
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        const { data: doniUser } = await supabase
            .from('users')
            .select('id, email, username, name, role')
            .eq('email', 'donisugiharto322@gmail.com')
            .single();
        
        if (!doniUser) {
            console.log('❌ Doni user not found in database');
            process.exit(1);
        }
        
        console.log('📝 Doni user info:');
        console.log(`   - Email: ${doniUser.email}`);
        console.log(`   - Username: ${doniUser.username || '(NONE)'}`);
        console.log(`   - Name: ${doniUser.name}`);
        console.log(`   - Role: ${doniUser.role}\n`);

        if (!doniUser.username) {
            console.log('❌ PROBLEM: Doni has no username! Cannot login.');
            console.log('   Fix: Set username for Doni or update endpoint to accept email\n');
            process.exit(1);
        }

        // Step 1: Login as moderator
        console.log('1️⃣ Logging in as moderator...');
        const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
            username: doniUser.username,
            password: MODERATOR_PASSWORD
        });

        const token = loginRes.data.token || loginRes.data.tempToken;
        console.log(`   ✅ Logged in, token: ${token.substring(0, 20)}...`);

        // Step 2: Create test users
        const testUsers = [
            {
                email: `testuser${Date.now()}@test.com`,
                name: 'Test User ' + Date.now(),
                password: 'TestPass@2024',
                role: 'super_admin'
            },
            {
                email: `admin_zona${Date.now()}@test.com`,
                name: 'Admin Zona Test',
                password: 'TestPass@2024',
                role: 'admin_zona',
                zona_id: 1
            }
        ];

        console.log(`\n2️⃣ Creating ${testUsers.length} test users...`);
        
        const createdUsers = [];
        for (const userData of testUsers) {
            console.log(`\n   Creating: ${userData.email} (${userData.role})`);
            
            const createRes = await axios.post(`${BASE_URL}/api/users`, userData, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const newUser = createRes.data.user;
            createdUsers.push(newUser);
            console.log(`   ✅ Created: ${newUser.id}`);
        }

        // Step 3: Wait a moment and then check database
        console.log(`\n3️⃣ Waiting 2 seconds before verification...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 4: Fetch all users
        console.log(`\n4️⃣ Fetching all users...`);
        const usersRes = await axios.get(`${BASE_URL}/api/users`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const allUsers = usersRes.data.users;
        console.log(`   ✅ Total users in database: ${allUsers.length}`);

        // Step 5: Check if newly created users are in the list
        console.log(`\n5️⃣ Verifying newly created users...`);
        for (const newUser of createdUsers) {
            const found = allUsers.find(u => u.id === newUser.id);
            if (found) {
                console.log(`   ✅ ${newUser.email} found in users list`);
                console.log(`      - Name: ${found.name}`);
                console.log(`      - Role: ${found.role}`);
                console.log(`      - Active: ${found.is_active}`);
            } else {
                console.log(`   ❌ ${newUser.email} NOT found in users list`);
            }
        }

        // Step 6: Manual token generation
        console.log(`\n6️⃣ Triggering manual token generation...`);
        const tokenRes = await axios.post(`${BASE_URL}/api/auth/generate-tokens-now`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log(`   ✅ Token generation result:`);
        console.log(`      - Generated: ${tokenRes.data.generated}`);
        console.log(`      - Sent: ${tokenRes.data.sent}`);
        console.log(`      - Total users processed: ${tokenRes.data.total}`);

        if (tokenRes.data.results) {
            console.log(`\n   Detailed results:`);
            tokenRes.data.results.forEach(r => {
                console.log(`      - ${r.email} (${r.role}): ${r.status}`);
            });
        }

        console.log(`\n✅ TEST COMPLETE!`);

    } catch (error) {
        console.error(`\n❌ Error:`, error.response?.data || error.message);
        process.exit(1);
    }
}

testNewUserCreation();
