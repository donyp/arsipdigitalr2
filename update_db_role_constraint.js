const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ccfwwsmpjhxqeyxgapeb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZnd3c21wamh4cWV5eGdhcGViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDI0NzMwNiwiZXhwIjoyMTA1ODIzMzA2fQ.-3b6HhBKcYMkwjrTO2dKwhkc4GXb7An7flasq2d0--s';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function updateRoleConstraint() {
    try {
        console.log('[SQL] Updating role constraint to include moderator role...');
        
        // Drop existing constraint
        let { error: dropError } = await supabase.rpc('exec_sql', {
            sql: "ALTER TABLE users DROP CONSTRAINT users_role_check;"
        }).catch(() => ({ error: { message: 'RPC not available' } }));
        
        // Try direct SQL execution via Supabase
        const sql = `
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
            ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'moderator', 'admin_zona'));
        `;
        
        console.log('[SQL] Executing constraint update...');
        console.log(sql);
        
        // Since Supabase doesn't expose direct SQL execution via client,
        // we'll just verify the current state
        const { data: users, error: checkError } = await supabase
            .from('users')
            .select('id, role')
            .limit(1);
        
        if (checkError) {
            console.error('[Error] Could not check users table:', checkError);
            return;
        }
        
        console.log('[Success] Users table is accessible');
        console.log('[Note] To update the constraint, use Supabase SQL Editor directly with:');
        console.log(sql);
        
    } catch (err) {
        console.error('[Error]', err.message);
    }
}

updateRoleConstraint();
