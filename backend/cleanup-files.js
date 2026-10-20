const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: require('path').join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanupFiles() {
  try {
    console.log('[Cleanup] Fetching all files from database...');
    
    // Get all files (including soft-deleted)
    const { data: allFiles, error: fetchErr } = await supabase
      .from('files')
      .select('id, nama_file, deleted_at');
    
    if (fetchErr) {
      console.error('❌ Fetch error:', fetchErr.message);
      return false;
    }
    
    console.log(`[Cleanup] Found ${allFiles?.length || 0} files in database`);
    
    if (!allFiles || allFiles.length === 0) {
      console.log('✅ Database is already clean');
      return true;
    }
    
    console.log('\nFiles to delete:');
    allFiles.forEach(f => console.log(`  - ${f.nama_file} (deleted: ${f.deleted_at ? 'yes' : 'no'})`));
    
    // Delete all files permanently
    console.log('\n[Cleanup] Deleting all files...');
    const { error: deleteErr, count } = await supabase
      .from('files')
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000');
    
    if (deleteErr) {
      console.error('❌ Delete error:', deleteErr.message);
      return false;
    }
    
    console.log(`✅ Successfully deleted ${allFiles.length} files from database`);
    return true;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

cleanupFiles().then(success => {
  process.exit(success ? 0 : 1);
});
