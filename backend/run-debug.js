const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug() {
  try {
    console.log('=== DEBUG: FILE STATUS MISMATCH ===\n');

    // 1. Total invoice_file_list
    const result1 = await supabase
      .from('invoice_file_list')
      .select('*', { count: 'exact', head: true });
    console.log('1. Total invoices in invoice_file_list:', result1.count);

    // 2. Invoice_file_list pero walang PDF sa invoice_files
    const result2 = await supabase.rpc('count_file_list_without_pdf');
    console.log('2. Invoices in file_list but NO PDF in invoice_files:', result2.data || 'N/A');

    // 3. PDF sa invoice_files pero WALANG sa invoice_file_list
    const { data: pdfs, error: pdfErr } = await supabase
      .from('invoice_files')
      .select('faktur', { count: 'exact' })
      .eq('file_type', 'invoice');
    console.log('3. Total PDFs in invoice_files with type=invoice:', pdfs?.length || 0);

    // 4. Total comparison
    console.log('\n4. Comparison:');
    console.log('   - Total in invoice_file_list:', result1.count);
    console.log('   - Total PDFs in invoice_files:', pdfs?.length || 0);
    console.log('   - Difference:', (result1.count || 0) - (pdfs?.length || 0));

    // 5. Column structure of invoice_file_list
    const { data: sample, error: sampleErr } = await supabase
      .from('invoice_file_list')
      .select('*')
      .limit(1);
    
    if (sample && sample.length > 0) {
      console.log('\n5. invoice_file_list columns:');
      Object.keys(sample[0]).forEach(col => {
        console.log('   -', col);
      });
    }

    // 6. Sample data
    const { data: sampleData, error: dataErr } = await supabase
      .from('invoice_file_list')
      .select('*')
      .limit(3);
    console.log('\n6. Sample data from invoice_file_list:');
    console.log(JSON.stringify(sampleData, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

debug();
