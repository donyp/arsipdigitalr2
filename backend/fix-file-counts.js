#!/usr/bin/env node
/**
 * Fix File Count Mismatch
 * Syncs all invoices' files_uploaded_count to match actual files in database
 * 
 * Usage: node fix-file-counts.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function batchSyncAllFileCount() {
    try {
        console.log('=== FILE COUNT SYNC JOB ===\n');
        console.log('🔄 Starting batch file count sync for ALL invoices...\n');
        
        // Get all invoices from invoice_file_list
        const { data: allInvoices, error: fetchErr } = await supabase
            .from('invoice_file_list')
            .select('faktur, keterangan');
        
        if (fetchErr) {
            console.error('❌ Error fetching invoices:', fetchErr.message);
            process.exit(1);
        }
        
        console.log(`📊 Found ${allInvoices?.length || 0} invoices to sync...\n`);
        
        let syncedCount = 0;
        let correctedCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        const batchSize = 20;
        const detailedResults = [];
        
        // Process in batches to avoid overwhelming the database
        for (let i = 0; i < (allInvoices?.length || 0); i += batchSize) {
            const batch = allInvoices.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            
            // Process each invoice in parallel within batch
            const promises = batch.map(async (inv) => {
                try {
                    // Get file count from denormalized paths + invoice_files table
                    const { data: invData, error: dataErr } = await supabase
                        .from('invoice_file_list')
                        .select('invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, files_uploaded_count, keterangan')
                        .eq('faktur', inv.faktur)
                        .single();
                    
                    if (dataErr) {
                        return { faktur: inv.faktur, error: true, message: 'Failed to fetch invoice' };
                    }
                    
                    // Count files from denormalized paths
                    let filesUploaded = 0;
                    const filesSources = [];
                    
                    if (invData.invoice_pdf_path) {
                        filesUploaded++;
                        filesSources.push('invoice_pdf');
                    }
                    if (invData.bukti_bayar_path) {
                        filesUploaded++;
                        filesSources.push('bukti_bayar');
                    }
                    if (invData.faktur_pajak_path) {
                        filesUploaded++;
                        filesSources.push('faktur_pajak');
                    }
                    
                    // Also check invoice_files table for actual uploads
                    const { data: invoiceFiles, error: filesErr } = await supabase
                        .from('invoice_files')
                        .select('file_type')
                        .eq('faktur', inv.faktur);
                    
                    const tableCount = invoiceFiles?.length || 0;
                    if (tableCount > filesUploaded) {
                        filesUploaded = tableCount;
                        filesSources.push(`invoice_files_table(${tableCount})`);
                    }
                    
                    const isPPN = invData.keterangan?.toUpperCase() === 'PPN';
                    const requiredCount = isPPN ? 3 : 2;
                    const dbCount = invData.files_uploaded_count || 0;
                    
                    // Check if update is needed
                    if (dbCount !== filesUploaded) {
                        const { error: updateErr } = await supabase
                            .from('invoice_file_list')
                            .update({ 
                                files_uploaded_count: filesUploaded,
                                files_required_count: requiredCount,
                                updated_at: new Date().toISOString()
                            })
                            .eq('faktur', inv.faktur);
                        
                        if (!updateErr) {
                            return { 
                                faktur: inv.faktur, 
                                corrected: true, 
                                old: dbCount, 
                                new: filesUploaded,
                                sources: filesSources.join(', ')
                            };
                        } else {
                            return { 
                                faktur: inv.faktur, 
                                error: true, 
                                message: updateErr.message 
                            };
                        }
                    } else {
                        return { 
                            faktur: inv.faktur, 
                            corrected: false, 
                            count: filesUploaded,
                            skipped: true
                        };
                    }
                } catch (err) {
                    return { faktur: inv.faktur, error: true, message: err.message };
                }
            });
            
            const results = await Promise.all(promises);
            
            // Update counters
            results.forEach(r => {
                if (r.corrected) correctedCount++;
                else if (r.error) errorCount++;
                else if (r.skipped) skippedCount++;
                syncedCount++;
                
                if (r.corrected || r.error) {
                    detailedResults.push(r);
                }
            });
            
            // Log progress
            const correctedInBatch = results.filter(r => r.corrected).length;
            const errorsInBatch = results.filter(r => r.error).length;
            
            if (correctedInBatch > 0 || errorsInBatch > 0) {
                console.log(`📦 Batch ${batchNum}: Processed ${batch.length} invoices`);
                if (correctedInBatch > 0) console.log(`   ✅ Fixed: ${correctedInBatch}`);
                if (errorsInBatch > 0) console.log(`   ❌ Errors: ${errorsInBatch}`);
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ SYNC COMPLETE');
        console.log('='.repeat(60));
        console.log(`📊 Total invoices processed: ${syncedCount}`);
        console.log(`✅ Corrected: ${correctedCount}`);
        console.log(`⏭️  Skipped (already correct): ${skippedCount}`);
        console.log(`❌ Errors: ${errorCount}\n`);
        
        // Show detailed results for corrected invoices
        if (correctedCount > 0 && correctedCount <= 20) {
            console.log('📝 Detailed corrections:');
            detailedResults.filter(r => r.corrected).forEach(r => {
                console.log(`   ${r.faktur}: ${r.old}/${r.old} → ${r.new}/${r.new} [${r.sources}]`);
            });
        } else if (correctedCount > 20) {
            console.log(`📝 Showing first 20 of ${correctedCount} corrections:`);
            detailedResults.filter(r => r.corrected).slice(0, 20).forEach(r => {
                console.log(`   ${r.faktur}: ${r.old}/${r.old} → ${r.new}/${r.new} [${r.sources}]`);
            });
        }
        
        // Show errors if any
        if (errorCount > 0) {
            console.log('\n❌ Errors encountered:');
            detailedResults.filter(r => r.error).slice(0, 10).forEach(r => {
                console.log(`   ${r.faktur}: ${r.message}`);
            });
            if (errorCount > 10) {
                console.log(`   ... and ${errorCount - 10} more errors`);
            }
        }
        
        console.log();
        process.exit(correctedCount > 0 ? 0 : 1);
        
    } catch (err) {
        console.error('❌ Batch sync error:', err.message);
        process.exit(1);
    }
}

// Run the sync
batchSyncAllFileCount();
