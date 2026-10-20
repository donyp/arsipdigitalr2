#!/usr/bin/env node

/**
 * Delete old logs from Supabase Storage via Storage API
 * This script respects Supabase's storage protection policies
 * 
 * Usage: node delete-logs-supabase.js
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function deleteLogsFromStorage() {
  try {
    console.log('🔍 Searching for all files in Supabase Storage...\n');

    // First, list root to see what folders exist
    const { data: rootFiles, error: rootError } = await supabase
      .storage
      .from('arsip-anka')
      .list('', {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (rootError) {
      throw new Error(`Failed to list root: ${rootError.message}`);
    }

    console.log('📁 Folders/Files in storage:');
    if (rootFiles && rootFiles.length > 0) {
      rootFiles.forEach(item => {
        console.log(`   ${item.id ? '[FOLDER]' : '[FILE]'} ${item.name}`);
      });
    }
    console.log('');

    // Try to list logs folder
    console.log('🔍 Searching for log files in logs/ folder...\n');
    const { data: files, error: listError } = await supabase
      .storage
      .from('arsip-anka')
      .list('logs', {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (listError) {
      console.warn(`⚠️  Cannot access logs folder: ${listError.message}`);
    }

    if (!files || files.length === 0) {
      console.log('✅ No files found in logs/ folder.');
      console.log('\n💡 Logs might be stored in a different location.');
      console.log('   Check Supabase dashboard → Storage → arsip-anka bucket');
      return;
    }

    console.log(`📊 Found ${files.length} log files. Starting deletion...\n`);

    let deleted = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const { error: deleteError } = await supabase
          .storage
          .from('arsip-anka')
          .remove([`logs/${file.name}`]);

        if (deleteError) {
          console.error(`❌ Failed to delete ${file.name}: ${deleteError.message}`);
          failed++;
        } else {
          console.log(`✅ Deleted: ${file.name}`);
          deleted++;
        }

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error deleting ${file.name}: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Deleted: ${deleted} files`);
    console.log(`   ❌ Failed: ${failed} files`);
    console.log(`   📊 Total: ${files.length} files`);

    if (deleted > 0) {
      console.log(`\n🎉 Successfully deleted ${deleted} log files!`);
      console.log(`⏳ Monitor Supabase dashboard in 5-10 minutes to see storage reduction.`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the deletion
console.log('🗑️  Supabase Log Deletion Tool');
console.log('==============================\n');
deleteLogsFromStorage();
