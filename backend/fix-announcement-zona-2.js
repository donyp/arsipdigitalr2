/**
 * Fix Script: Backfill announcements for newly created zones
 * 
 * CONTEXT: When a new zona is created, old announcements won't be visible
 * to it because announcement_recipients table doesn't have entries for the new zona.
 * 
 * This script backfills announcements for the new zona from existing announcements.
 * 
 * Run: node backend/fix-announcement-zona-2.js <new-zona-id> [old-zona-id]
 * Example: node backend/fix-announcement-zona-2.js 2 1
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfillAnnouncementsForNewZona(newZonaId, referenceZonaId = 1) {
  console.log(`🔧 Backfilling Announcements for Zona ${newZonaId}...\n`);
  console.log(`📌 Using zona ${referenceZonaId} as reference for announcements\n`);

  try {
    // Step 1: Get all announcements that exist for reference zona
    console.log(`📍 Step 1: Get announcements from zona ${referenceZonaId}...`);
    const { data: referenceAnnouncements, error: err1 } = await supabase
      .from('announcement_recipients')
      .select('announcement_id')
      .eq('recipient_type', 'zona')
      .eq('recipient_id', referenceZonaId);

    if (err1) throw err1;
    console.log(`✓ Found ${referenceAnnouncements.length} announcements in zona ${referenceZonaId}`);

    if (referenceAnnouncements.length === 0) {
      console.log(`ℹ️  No announcements found for zona ${referenceZonaId}, nothing to backfill`);
      process.exit(0);
    }

    // Step 2: Get announcements already assigned to new zona
    console.log(`\n📍 Step 2: Get announcements already in zona ${newZonaId}...`);
    const { data: newZonaAnnouncements } = await supabase
      .from('announcement_recipients')
      .select('announcement_id')
      .eq('recipient_type', 'zona')
      .eq('recipient_id', newZonaId);

    const newZonaSet = new Set((newZonaAnnouncements || []).map(a => a.announcement_id));
    console.log(`✓ Zona ${newZonaId} already has ${newZonaSet.size} announcements`);

    // Step 3: Find missing announcements
    const missingAnnouncements = referenceAnnouncements.filter(
      a => !newZonaSet.has(a.announcement_id)
    );

    console.log(`\n📍 Step 3: Missing announcements for zona ${newZonaId}: ${missingAnnouncements.length}`);

    if (missingAnnouncements.length === 0) {
      console.log(`ℹ️  Zona ${newZonaId} already has all announcements from zona ${referenceZonaId}`);
      process.exit(0);
    }

    // Step 4: Create missing announcement_recipients for new zona
    console.log(`\n📍 Step 4: Creating missing announcement_recipients...`);
    
    const insertData = missingAnnouncements.map(a => ({
      announcement_id: a.announcement_id,
      recipient_type: 'zona',
      recipient_id: newZonaId,
      created_at: new Date().toISOString()
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('announcement_recipients')
      .insert(insertData);

    if (insertError && insertError.code !== '23505') { // 23505 = unique constraint violation
      throw insertError;
    }
    
    if (insertError && insertError.code === '23505') {
      console.log('⚠️  Some duplicates found (already exist), continuing...');
    } else {
      console.log(`✓ Successfully added ${insertData.length} announcements to zona ${newZonaId}`);
    }

    // Step 5: Verify
    console.log(`\n📍 Step 5: Verifying backfill...`);
    const { data: finalNewZona } = await supabase
      .from('announcement_recipients')
      .select('announcement_id')
      .eq('recipient_type', 'zona')
      .eq('recipient_id', newZonaId);

    console.log(`✓ Zona ${newZonaId} now has ${finalNewZona?.length || 0} announcements`);

    // Step 6: Summary
    console.log('\n✅ BACKFILL COMPLETE!');
    console.log('Summary:');
    console.log(`- Reference zona (${referenceZonaId}) announcements: ${referenceAnnouncements.length}`);
    console.log(`- New zona (${newZonaId}) announcements (before): ${newZonaSet.size}`);
    console.log(`- New zona (${newZonaId}) announcements (after): ${finalNewZona?.length || 0}`);
    console.log(`- Announcements synced: ${missingAnnouncements.length}`);
    console.log('\n💡 Note: Users in zona ${newZonaId} might need to refresh browser to see the badge update');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

// Parse command line arguments
const newZonaId = process.argv[2];
const referenceZonaId = process.argv[3] || 1;

if (!newZonaId) {
  console.error('❌ Usage: node backend/fix-announcement-zona-2.js <new-zona-id> [reference-zona-id]');
  console.error('Example: node backend/fix-announcement-zona-2.js 2 1');
  process.exit(1);
}

backfillAnnouncementsForNewZona(parseInt(newZonaId), parseInt(referenceZonaId));

fixAnnouncementZona2();
