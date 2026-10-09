#!/usr/bin/env node
/**
 * Check zona mapping and find invalid references
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkZonas() {
  try {
    console.log('=== Checking Zona Mapping ===\n');
    
    // Get all zonas
    const { data: zonas, error: zonaError } = await supabase
      .from('zonas')
      .select('id, nama, kode')
      .order('id');
    
    if (zonaError) throw zonaError;
    
    console.log('All Zonas:');
    zonas.forEach(z => {
      console.log(`  ID: ${z.id} | Nama: ${z.nama} | Kode: ${z.kode}`);
    });
    
    // Check for duplicate zonas
    console.log('\n=== Checking for Duplicate Zonas ===');
    const uniqueNames = new Set(zonas.map(z => z.nama));
    if (uniqueNames.size !== zonas.length) {
      console.log('⚠️  Duplicate zona names found!');
      const nameCounts = {};
      zonas.forEach(z => {
        nameCounts[z.nama] = (nameCounts[z.nama] || 0) + 1;
      });
      Object.entries(nameCounts)
        .filter(([_, count]) => count > 1)
        .forEach(([name, count]) => {
          const duplicates = zonas.filter(z => z.nama === name);
          console.log(`  "${name}": ${count} records - IDs: ${duplicates.map(z => z.id).join(', ')}`);
        });
    } else {
      console.log('✅ No duplicate zonas');
    }
    
    // Check for invalid zona_ids in users
    console.log('\n=== Checking Users with Invalid Zona IDs ===');
    const validZonaIds = zonas.map(z => z.id);
    
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, email, username, role, zona_id');
    
    const invalidUsers = allUsers.filter(u => u.zona_id !== null && !validZonaIds.includes(u.zona_id));
    
    if (invalidUsers.length > 0) {
      console.log(`⚠️  Found ${invalidUsers.length} users with invalid zona_id:`);
      invalidUsers.forEach(u => {
        console.log(`  - ${u.email} (${u.role}): zona_id=${u.zona_id}`);
      });
    } else {
      console.log('✅ No users with invalid zona_id');
    }
    
    // Check for invalid zona_ids in invoice_file_list
    console.log('\n=== Checking Invoice Files with Invalid Zona IDs ===');
    const { data: invoices } = await supabase
      .from('invoice_file_list')
      .select('id, zona_id')
      .not('zona_id', 'is', null);
    
    const invalidInvoices = invoices.filter(inv => !validZonaIds.includes(inv.zona_id));
    
    if (invalidInvoices.length > 0) {
      console.log(`⚠️  Found ${invalidInvoices.length} invoices with invalid zona_id`);
      const invalidZonaIds = [...new Set(invalidInvoices.map(inv => inv.zona_id))];
      console.log(`  Invalid zona_ids: ${invalidZonaIds.sort((a, b) => a - b).join(', ')}`);
    } else {
      console.log('✅ No invoices with invalid zona_id');
    }
    
    // Summary
    console.log('\n=== Summary ===');
    console.log(`Total zonas: ${zonas.length}`);
    console.log(`Valid zona_id range: ${Math.min(...validZonaIds)} - ${Math.max(...validZonaIds)}`);
    console.log(`Invalid zona_ids in users: ${invalidUsers.length}`);
    console.log(`Invalid zona_ids in invoices: ${invalidInvoices.length}`);
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  
  process.exit(0);
}

checkZonas();
