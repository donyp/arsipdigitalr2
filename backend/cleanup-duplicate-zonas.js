#!/usr/bin/env node
/**
 * Cleanup Duplicate Zonas
 * Hapus zona 64-82, keep 121-139
 * Migrate semua referensi ke zona baru
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
  try {
    console.log('=== Starting Cleanup of Duplicate Zonas ===\n');
    
    // Step 1: Map old zona IDs (64-82) to new (121-139)
    const zonaMapping = {
      64: 121, // Zona 01
      65: 122, // Zona 02
      66: 123, // Zona 03A
      67: 124, // Zona 03B
      68: 125, // Zona 04
      69: 126, // Zona 05
      70: 127, // Zona 06A
      71: 128, // Zona 06B
      72: 129, // Zona 07
      73: 130, // Zona 08
      74: 131, // Zona 09
      75: 132, // Zona 10
      76: 133, // Zona 11
      77: 134, // Zona 12
      78: 135, // Zona 13
      79: 136, // Zona 14
      80: 137, // Zona 15
      81: 138, // Zona 16
      82: 139  // Zona 17
    };
    
    console.log('Zona Mapping (old → new):');
    Object.entries(zonaMapping).forEach(([old, newId]) => {
      console.log(`  ${old} → ${newId}`);
    });
    
    // Step 2: Migrate users
    console.log('\n[1/4] Migrating users...');
    for (const [oldId, newId] of Object.entries(zonaMapping)) {
      const { data, error } = await supabase
        .from('users')
        .update({ zona_id: parseInt(newId) })
        .eq('zona_id', parseInt(oldId));
      
      if (error && error.code !== 'PGRST116') throw error;
    }
    console.log('✅ Users migrated');
    
    // Step 3: Migrate tokos (handle unique constraint)
    console.log('[2/4] Migrating tokos...');
    // Get all tokos with old zona_ids
    const { data: tokosToMigrate } = await supabase
      .from('toko')
      .select('*')
      .in('zona_id', [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82]);
    
    for (const toko of tokosToMigrate || []) {
      const newZonaId = zonaMapping[toko.zona_id];
      
      // Check if toko with same name exists in new zona
      const { data: existing } = await supabase
        .from('toko')
        .select('id')
        .eq('nama', toko.nama)
        .eq('zona_id', newZonaId);
      
      if (existing && existing.length > 0) {
        console.log(`  ⚠️  Toko "${toko.nama}" already exists in zona ${newZonaId}, skipping...`);
        // Delete the old one instead
        await supabase.from('toko').delete().eq('id', toko.id);
      } else {
        // Safe to migrate
        await supabase
          .from('toko')
          .update({ zona_id: newZonaId })
          .eq('id', toko.id);
      }
    }
    console.log('✅ Tokos migrated');
    
    // Step 4: Migrate whatsapp_invoice_notifications
    console.log('[3/4] Migrating whatsapp notifications...');
    for (const [oldId, newId] of Object.entries(zonaMapping)) {
      const { error } = await supabase
        .from('whatsapp_invoice_notifications')
        .update({ zona_id: parseInt(newId) })
        .eq('zona_id', parseInt(oldId));
      
      if (error && error.code !== 'PGRST116') throw error;
    }
    console.log('✅ WhatsApp notifications migrated');
    
    // Step 5: Migrate invoice_file_list
    console.log('[4/5] Migrating invoice_file_list...');
    for (const [oldId, newId] of Object.entries(zonaMapping)) {
      const { error } = await supabase
        .from('invoice_file_list')
        .update({ zona_id: parseInt(newId) })
        .eq('zona_id', parseInt(oldId));
      
      if (error && error.code !== 'PGRST116') throw error;
    }
    console.log('✅ Invoice files migrated');
    
    // Step 6: Delete old zonas (64-82)
    console.log('[5/5] Deleting old zona records (64-82)...');
    const oldZonaIds = [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82];
    
    for (const zonaId of oldZonaIds) {
      const { error } = await supabase
        .from('zonas')
        .delete()
        .eq('id', zonaId);
      
      if (error) throw error;
    }
    console.log('✅ Old zonas deleted');
    
    console.log('\n=== Cleanup Complete! ===');
    console.log('✅ All duplicate zonas removed');
    console.log('✅ All references migrated to zona 121-139');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
  
  process.exit(0);
}

// Confirm before running
console.log('⚠️  WARNING: This will DELETE zona 64-82 and migrate all data to 121-139');
console.log('Make sure you have a backup!\n');

const args = process.argv.slice(2);
if (args.includes('--confirm')) {
  cleanup();
} else {
  console.log('To proceed, run with: node cleanup-duplicate-zonas.js --confirm');
  process.exit(0);
}
