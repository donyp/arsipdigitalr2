/**
 * Test script: Generate and send tokens with role-based routing
 * - super_admin & moderator → send to ADMIN_TOKEN_EMAIL
 * - admin_zona & others → send to their individual email
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const DailyTokenService = require('./daily-token-service');

async function testTokenGeneration() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST: Daily Token Generation with Role-Based Routing');
    console.log('='.repeat(60) + '\n');

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const dailyTokenService = new DailyTokenService(
        supabase,
        process.env.RESEND_API_KEY,
        process.env.RESEND_FROM_EMAIL,
        process.env.ADMIN_TOKEN_EMAIL
    );

    console.log(`📧 Admin Token Email: ${process.env.ADMIN_TOKEN_EMAIL}`);
    console.log(`📨 From Email: ${process.env.RESEND_FROM_EMAIL}`);
    console.log(`🔑 Resend API Key: ${process.env.RESEND_API_KEY ? '✓ Configured' : '✗ Missing'}\n`);

    try {
        // Step 1: Get all users
        console.log('[Step 1] Fetching all users from Supabase auth...');
        const { data: authUsers, error: fetchError } = await supabase.auth.admin.listUsers();
        
        if (fetchError) {
            console.error('❌ Error fetching users:', fetchError);
            return;
        }

        const users = (authUsers?.users || []).filter(u => u.email && u.email.includes('@'));
        console.log(`✅ Found ${users.length} users with valid emails\n`);

        if (users.length === 0) {
            console.log('⚠️  No users found to generate tokens');
            return;
        }

        // Step 2: Get user roles
        console.log('[Step 2] Fetching user roles from database...');
        const { data: userRoles, error: roleError } = await supabase
            .from('users')
            .select('id, role');

        if (roleError) {
            console.warn('⚠️  Could not fetch user roles:', roleError.message);
        }

        const roleMap = {};
        if (userRoles) {
            userRoles.forEach(u => {
                roleMap[u.id] = u.role;
            });
        }
        console.log(`✅ Fetched roles for ${Object.keys(roleMap).length} users\n`);

        // Step 3: Display user breakdown
        console.log('[Step 3] User breakdown by role:');
        console.log('─'.repeat(60));
        
        const roleBreakdown = {};
        users.forEach(user => {
            const role = roleMap[user.id] || 'unknown';
            if (!roleBreakdown[role]) roleBreakdown[role] = [];
            roleBreakdown[role].push({
                id: user.id,
                email: user.email,
                name: user.user_metadata?.full_name || user.email.split('@')[0]
            });
        });

        for (const [role, userList] of Object.entries(roleBreakdown)) {
            console.log(`\n${role.toUpperCase()} (${userList.length} user${userList.length !== 1 ? 's' : ''})`);
            userList.forEach(u => {
                const isAdmin = ['super_admin', 'moderator'].includes(role);
                const targetEmail = isAdmin ? process.env.ADMIN_TOKEN_EMAIL : u.email;
                const icon = isAdmin ? '📮' : '📧';
                console.log(`  ${icon} ${u.name} (${u.email}) → ${targetEmail}`);
            });
        }

        console.log('\n' + '─'.repeat(60));
        console.log('\n[Step 4] Running full token generation...\n');

        const result = await dailyTokenService.generateAndSendDailyTokens();

        if (result.success) {
            console.log('\n' + '='.repeat(60));
            console.log('✅ Token Generation Complete');
            console.log('='.repeat(60));
            console.log(`Generated: ${result.generated} tokens`);
            console.log(`Sent: ${result.sent} emails`);
            console.log(`Total Users: ${result.total}`);
            
            console.log('\n📊 Detailed Results:');
            console.log('─'.repeat(60));
            
            const statusGroups = {};
            result.results.forEach(r => {
                if (!statusGroups[r.status]) statusGroups[r.status] = [];
                statusGroups[r.status].push(r);
            });

            for (const [status, items] of Object.entries(statusGroups)) {
                console.log(`\n${status.toUpperCase()}: ${items.length} item${items.length !== 1 ? 's' : ''}`);
                items.forEach(item => {
                    if (status === 'sent' || status === 'queued_for_admin_email') {
                        console.log(`  ✓ ${item.email} (${item.role || 'unknown'})`);
                    } else if (status === 'error' || status === 'failed' || status === 'email_failed') {
                        console.log(`  ✗ ${item.email}: ${item.error}`);
                    }
                });
            }

        } else {
            console.error('❌ Token generation failed:', result.error);
        }

        console.log('\n' + '='.repeat(60) + '\n');

    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
        console.error(error);
    } finally {
        process.exit(0);
    }
}

testTokenGeneration();
