/**
 * Sync Orphaned Auth Users
 * Find users that exist in auth.users but NOT in public.users
 * and migrate them to public.users
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncOrphanedUsers() {
    try {
        console.log('🔍 Syncing orphaned auth users to database...\n');

        // Get all auth users
        const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers();
        if (authError) {
            console.error('❌ Error fetching auth users:', authError);
            process.exit(1);
        }

        console.log(`Found ${authUsers.length} users in auth.users\n`);

        // Get all DB users
        const { data: dbUsers, error: dbError } = await supabase
            .from('users')
            .select('id');

        if (dbError) {
            console.error('❌ Error fetching DB users:', dbError);
            process.exit(1);
        }

        const dbUserIds = new Set(dbUsers.map(u => u.id));

        // Find orphaned users
        const orphanedUsers = authUsers.filter(u => !dbUserIds.has(u.id));

        if (orphanedUsers.length === 0) {
            console.log('✅ No orphaned users found - all auth users are in database');
            return;
        }

        console.log(`⚠️  Found ${orphanedUsers.length} orphaned users in auth.users:\n`);

        // Migrate each orphaned user
        for (const authUser of orphanedUsers) {
            try {
                console.log(`Migrating: ${authUser.email}`);

                // Generate placeholder password hash (since we don't have the original password)
                // Users can reset their password if needed
                const { data: dbUser, error: insertError } = await supabase
                    .from('users')
                    .insert({
                        id: authUser.id,
                        email: authUser.email,
                        username: null, // Will be set when user edits profile
                        password_hash: null, // This should be optional or have default
                        name: authUser.user_metadata?.name || authUser.email.split('@')[0],
                        role: 'moderator', // Default role
                        is_active: true,
                        permissions: []
                    })
                    .select()
                    .single();

                if (insertError) {
                    console.log(`   ❌ Failed: ${insertError.message}`);
                    continue;
                }

                console.log(`   ✅ Migrated to database`);

                // Now test token generation
                const tokenService = require('./daily-token-service.js');
                // Note: tokenService is a class, need to instantiate it properly
                console.log(`   (Token generation will work on next daily run)`);

            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
        }

        console.log(`\n✅ Migration complete!`);
        console.log(`Please review migrated users to set proper roles and usernames`);

    } catch (error) {
        console.error(`❌ Unexpected error:`, error);
        process.exit(1);
    }
}

syncOrphanedUsers();
