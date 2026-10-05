/**
 * Fix Invoice Status - Clear stale file paths
 * Faktur: 835100311010926025 (PPN)
 * 
 * Problem: Status shows 2/3 but hanya 1 file di R2
 * Solution: Clear database paths, let user re-upload properly
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tjmicgvpcxojuwxvnfst.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FAKTUR = '835100311010926025';

async function fixInvoiceStatus() {
    try {
        console.log(`\n📋 Fetching invoice: ${FAKTUR}...\n`);
        
        // Get current state
        const { data: invoice, error: fetchError } = await supabase
            .from('invoice_file_list')
            .select('*')
            .eq('faktur', FAKTUR)
            .single();
        
        if (fetchError) {
            console.error('❌ Error fetching invoice:', fetchError.message);
            return;
        }
        
        console.log('Current State:');
        console.log(`  Faktur: ${invoice.faktur}`);
        console.log(`  Keterangan: ${invoice.keterangan}`);
        console.log(`  Files Uploaded: ${invoice.files_uploaded_count}/${invoice.files_required_count}`);
        console.log(`  Invoice PDF Path: ${invoice.invoice_pdf_path ? '✓' : '✗'}`);
        console.log(`  Bukti Bayar Path: ${invoice.bukti_bayar_path ? '✓' : '✗'}`);
        console.log(`  Faktur Pajak Path: ${invoice.faktur_pajak_path ? '✓' : '✗'}`);
        
        // Clear all paths
        console.log(`\n🔄 Clearing stale paths...\n`);
        
        const { data: updated, error: updateError } = await supabase
            .from('invoice_file_list')
            .update({
                invoice_pdf_path: null,
                bukti_bayar_path: null,
                faktur_pajak_path: null,
                files_uploaded_count: 1,  // Only 1 file exists in R2 (PPN)
                files_required_count: 3   // PPN requires 3 files
            })
            .eq('faktur', FAKTUR)
            .select();
        
        if (updateError) {
            console.error('❌ Error updating invoice:', updateError.message);
            return;
        }
        
        console.log('Updated State:');
        const updatedInvoice = updated[0];
        console.log(`  Files Uploaded: ${updatedInvoice.files_uploaded_count}/${updatedInvoice.files_required_count}`);
        console.log(`  Invoice PDF Path: ${updatedInvoice.invoice_pdf_path ? '✓' : '✗'} (cleared)`);
        console.log(`  Bukti Bayar Path: ${updatedInvoice.bukti_bayar_path ? '✓' : '✗'} (cleared)`);
        console.log(`  Faktur Pajak Path: ${updatedInvoice.faktur_pajak_path ? '✓' : '✗'} (cleared)`);
        
        console.log(`\n✅ Invoice Status: 1/3 (Belum Lunas)`);
        console.log(`\n📝 Next Steps:`);
        console.log(`  1. User uploads Invoice PDF → status becomes 2/3`);
        console.log(`  2. User uploads Bukti Bayar → status becomes 3/3 (Lunas) ✓`);
        console.log(`  3. PPN file (1.53 MB) already exists in R2\n`);
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
    }
}

fixInvoiceStatus();
