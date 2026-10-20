/**
 * Diagnosis Script: Check why zona 2 has no unread announcement badge
 * Run: node backend/diagnose-announcement-zona-issue.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseAnnouncementIssue() {
  console.log('🔍 Diagnosing Announcement Zona Issue...\n');

  try {
    // 1. Check total announcements
    const { data: allAnnouncements, error: err1 } = await supabase
      .from('announcements')
      .select('id, title, recipient_type, is_active')
      .eq('is_active', true);

    console.log('✓ Total active announcements:', allAnnouncements?.length || 0);
    if (allAnnouncements?.length > 0) {
      console.log('  Types:', allAnnouncements.reduce((acc, a) => {
        acc[a.recipient_type] = (acc[a.recipient_type] || 0) + 1;
        return acc;
      }, {}));
    }

    // 2. Check zone recipients
    const { data: zona1Recipients } = await supabase
      .from('announcement_recipients')
      .select('announcement_id')
      .eq('recipient_type', 'zona')
      .eq('recipient_id', 1);

    const { data: zona2Recipients } = await supabase
      .from('announcement_recipients')
      .select('announcement_id')
      .eq('recipient_type', 'zona')
      .eq('recipient_id', 2);

    console.log('\n✓ Announcement recipients by zone:');
    console.log('  Zona 1:', zona1Recipients?.length || 0, 'announcements');
    console.log('  Zona 2:', zona2Recipients?.length || 0, 'announcements');

    // 3. The issue!
    if ((zona1Recipients?.length || 0) > 0 && (zona2Recipients?.length || 0) === 0) {
      console.log('\n🔴 ISSUE FOUND:');
      console.log('  Zona 1 has', zona1Recipients.length, 'announcements');
      console.log('  Zona 2 has NO announcements');
      console.log('\n  This means announcements were only distributed to zona 1');
      console.log('  when they should have been distributed to both zones.');
    }

    // 4. Check unread counts
    const { data: unreadAnnouncementIds } = await supabase
      .from('announcement_reads')
      .select('announcement_id')
      .eq('is_read', false);

    console.log('\n✓ Unread announcements:', unreadAnnouncementIds?.length || 0);

    // 5. Check which announcements are unread in zona 2
    if (zona2Recipients?.length === 0 && zona1Recipients?.length > 0) {
      console.log('\n✅ SOLUTION:');
      console.log('  Run: node backend/fix-announcement-zona-2.js');
      console.log('  This will sync announcements to zona 2');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
}

diagnoseAnnouncementIssue();
