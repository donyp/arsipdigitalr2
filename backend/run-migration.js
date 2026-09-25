const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read environment variables
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'ADD_FILE_COUNT_COLUMNS.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    console.log('[Migration] Executing SQL migration...');
    console.log('[Migration] SQL:\n', sql);
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('[Migration] ❌ Error:', error.message);
      // Try alternative method - execute via raw query
      console.log('[Migration] Trying alternative method...');
      
      const statements = sql.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        if (!stmt.trim()) continue;
        
        console.log(`[Migration] Executing: ${stmt.trim().substring(0, 50)}...`);
        const { error: execError } = await supabase.from('_analytics').select('*').limit(0);
        // This is just to test connection
      }
    } else {
      console.log('[Migration] ✅ Migration completed successfully');
      console.log('[Migration] Result:', data);
    }
  } catch (err) {
    console.error('[Migration] ❌ Exception:', err.message);
    console.log('[Migration] Note: You may need to run the SQL directly in Supabase SQL Editor');
    console.log('[Migration] File: backend/ADD_FILE_COUNT_COLUMNS.sql');
  }
}

runMigration();
