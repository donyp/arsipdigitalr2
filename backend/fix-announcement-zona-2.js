/**
 * Fix Script: Sync announcements from zona 1 to zona 2
 * Run: node backend/fix-announcement-zona-2.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixAnnouncementZona2() {
  console.log('🔧 Fixing Announcement Zona 2 Distribution...\n');

  try {
    // Step 1: Get all announcements that exist for zona 1
    console.log('📍 Step 1: Get announcements for zona 1...');
    const { data: zona1Announcements, error: err1 } = await supabase
      .from('announcement_recipients')
      .select('announcement_id')
      .eq('recipient_type', 'zona')
      .eq('recipient_id', 1);

    if (err1) throw err1;
    console.log('✓ Found', zona1Announcements.length, 'announcements in zona 1');

    if (zona1Announcements.length === 0) {
      console.log('ℹ️  No announcements found for zona 1, nothing to sync');
      process.exit(0);
    }

    // Step 2: Get announcements already assigned to zona 2
    console.log('\n📍 Step 2: Get announcements already in zona 2...');
    const { data: zona2Announcements } = await supabase
      .from('announcement_recipients')
      .select('announcement_id')
      .eq('recipient_type', 'zona')
      .eq('recipient_id', 2);

    const zona2Set = new Set((zona2Announcements || []).map(a => a.announcement_id));
    console.log('✓ Zona 2 already has', zona2Set.size, 'announcements');

    // Step 3: Find missing announcements
    const missingAnnouncements = zona1Announcements.filter(
      a => !zona2Set.has(a.announcement_id)
    );

    console.log('\n📍 Step 3: Missing announcements for zona 2:', missingAnnouncements.length);

    if (missingAnnouncements.length === 0) {
      console.log('ℹ️  Zona 2 already has all announcements from zona 1');
      process.exit(0);
    }

    // Step 4: Create missing announcement_recipients for zona 2
    console.log('\n📍 Step 4: Creating missing announcement_recipients...');
    
    const insertData = missingAnnouncements.map(a => ({
      announcement_id: a.announcement_id,
      recipient_type: 'zona',
      recipient_id: 2,
      created_at: new Date().toISOString()
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('announcement_recipients')
      .insert(insertData);

    if (insertError) {
      console.log('⚠️  Insert error (might be duplicate):', insertError.message);
    } else {
      console.log('✓ Successfully added', insertData.length, 'announcements to zona 2');
    }

    // Step 5: Verify
    console.log('\n📍 Step 5: Verifying fix...');
    const { data: finalZona2 } = await supabase
      .from('announcement_recipients')
      .select('announcement_id')
      .eq('recipient_type', 'zona')
      .eq('recipient_id', 2);

    console.log('✓ Zona 2 now has', finalZona2?.length || 0, 'announcements');

    // Step 6: Summary
    console.log('\n✅ FIX COMPLETE!');
    console.log('Summary:');
    console.log('- Zona 1 announcements: ' + zona1Announcements.length);
    console.log('- Zona 2 announcements (before): ' + zona2Set.size);
    console.log('- Zona 2 announcements (after): ' + (finalZona2?.length || 0));
    console.log('\nNote: Users might need to refresh browser to see the badge update');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

fixAnnouncementZona2();
