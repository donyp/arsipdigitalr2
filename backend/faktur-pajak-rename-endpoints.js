/**
 * Faktur Pajak Rename History Endpoints
 * 
 * Handles logging and retrieving faktur pajak (tax invoice) rename history
 * - Only stores text/metadata (no file storage)
 * - Auto-deletes records older than 1 day
 * - Provides audit trail for filename changes
 */

function addFakturPajakRenameEndpoints(app, supabase, createAuth) {
    
    // =====================================================================
    // POST /api/faktur-pajak/log-rename
    // Log a faktur pajak rename action
    // =====================================================================
    app.post('/api/faktur-pajak/log-rename', createAuth(['super_admin', 'moderator', 'admin_zona']), async (req, res) => {
        try {
            const {
                invoice_id,  // UUID (optional)
                faktur,
                old_filename,
                new_filename,
                old_path,
                new_path,
                reason,
                zona_id,
                notes
            } = req.body;
            
            // Get user info from token
            const renamed_by = req.user?.email || req.user?.id || 'unknown';
            const user_email = req.user?.email;
            const full_name = req.user?.full_name || req.user?.name || renamed_by;  // Get full name
            
            // Validation - faktur, old_filename, new_filename are required
            if (!faktur || !old_filename || !new_filename) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    required: ['faktur', 'old_filename', 'new_filename']
                });
            }
            
            console.log(`[FakturPajak] Logging rename: ${faktur}`);
            console.log(`  Old: ${old_filename}`);
            console.log(`  New: ${new_filename}`);
            console.log(`  By: ${renamed_by}`);
            
            // Ensure timestamp is in UTC ISO format
            const renamedAt = new Date().toISOString();
            
            // Insert rename history
            const { data, error } = await supabase
                .from('faktur_pajak_rename_history')
                .insert({
                    invoice_id: invoice_id || null,  // Optional UUID
                    faktur,
                    old_filename,
                    new_filename,
                    old_path,
                    new_path,
                    renamed_by,
                    user_email,
                    full_name,  // Store full name
                    reason,
                    zona_id,
                    status: 'completed',
                    notes,
                    renamed_at: renamedAt  // Use ISO string with Z suffix
                })
                .select();
            
            if (error) {
                console.error('[FakturPajak] Error logging rename:', error);
                return res.status(500).json({
                    error: 'Failed to log rename',
                    details: error.message
                });
            }
            
            console.log(`[FakturPajak] ✅ Rename logged successfully - ID: ${data[0]?.id}`);
            
            res.json({
                success: true,
                message: 'Rename logged successfully',
                history_id: data[0]?.id,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('[FakturPajak] Endpoint error:', error);
            res.status(500).json({
                error: 'Server error',
                details: error.message
            });
        }
    });
    
    // =====================================================================
    // GET /api/faktur-pajak/rename-history/recent
    // Get recent renames (last 24 hours)
    // NOTE: Must be BEFORE /:faktur route to match correctly
    // =====================================================================
    app.get('/api/faktur-pajak/rename-history/recent', createAuth(['super_admin', 'moderator', 'admin_zona']), async (req, res) => {
        try {
            const { limit = 100, offset = 0, hours = 24 } = req.query;
            
            console.log(`[FakturPajak] Getting recent renames (last ${hours} hours)`);
            console.log(`[FakturPajak] Cutoff: ${hours} hours, Limit: ${limit}`);
            
            // Calculate cutoff time
            const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
            console.log(`[FakturPajak] Cutoff time: ${cutoffTime}`);
            
            // Get rename history
            const { data, error, count } = await supabase
                .from('faktur_pajak_rename_history')
                .select('*', { count: 'exact' })
                .gte('renamed_at', cutoffTime)
                .order('renamed_at', { ascending: false })
                .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
            
            if (error) {
                console.error('[FakturPajak] Error fetching recent history:', error);
                return res.status(500).json({
                    error: 'Failed to fetch history',
                    details: error.message
                });
            }
            
            console.log(`[FakturPajak] ✅ Found ${data?.length || 0} recent rename records (total: ${count})`);
            console.log(`[FakturPajak] Sample data:`, data && data.length > 0 ? data[0] : 'none');
            
            res.json({
                success: true,
                time_period: `Last ${hours} hours`,
                cutoff_time: cutoffTime,
                history: data || [],
                total_records: count || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
        } catch (error) {
            console.error('[FakturPajak] Endpoint error:', error);
            res.status(500).json({
                error: 'Server error',
                details: error.message
            });
        }
    });
    
    // =====================================================================
    // GET /api/faktur-pajak/rename-history/user/:user_email
    // Get rename history for specific user
    // =====================================================================
    app.get('/api/faktur-pajak/rename-history/user/:user_email', createAuth(['super_admin', 'moderator']), async (req, res) => {
        try {
            const { user_email } = req.params;
            const { limit = 50, offset = 0 } = req.query;
            
            if (!user_email) {
                return res.status(400).json({ error: 'User email required' });
            }
            
            console.log(`[FakturPajak] Getting rename history for user: ${user_email}`);
            
            // Get rename history
            const { data, error, count } = await supabase
                .from('faktur_pajak_rename_history')
                .select('*', { count: 'exact' })
                .eq('renamed_by', user_email)
                .order('renamed_at', { ascending: false })
                .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
            
            if (error) {
                console.error('[FakturPajak] Error fetching history:', error);
                return res.status(500).json({
                    error: 'Failed to fetch history',
                    details: error.message
                });
            }
            
            console.log(`[FakturPajak] ✅ Found ${data?.length || 0} rename records by ${user_email}`);
            
            res.json({
                success: true,
                user_email,
                history: data || [],
                total_records: count || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
        } catch (error) {
            console.error('[FakturPajak] Endpoint error:', error);
            res.status(500).json({
                error: 'Server error',
                details: error.message
            });
        }
    });
    
    // =====================================================================
    // GET /api/faktur-pajak/rename-history/:faktur
    // Get rename history for specific faktur
    // =====================================================================
    app.get('/api/faktur-pajak/rename-history/:faktur', createAuth(['super_admin', 'moderator', 'admin_zona']), async (req, res) => {
        try {
            const { faktur } = req.params;
            const { limit = 10, offset = 0 } = req.query;
            
            if (!faktur) {
                return res.status(400).json({ error: 'Faktur parameter required' });
            }
            
            console.log(`[FakturPajak] Getting rename history for: ${faktur}`);
            
            // Get rename history
            const { data, error, count } = await supabase
                .from('faktur_pajak_rename_history')
                .select('*', { count: 'exact' })
                .eq('faktur', faktur)
                .order('renamed_at', { ascending: false })
                .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
            
            if (error) {
                console.error('[FakturPajak] Error fetching history:', error);
                return res.status(500).json({
                    error: 'Failed to fetch history',
                    details: error.message
                });
            }
            
            console.log(`[FakturPajak] ✅ Found ${data?.length || 0} rename records for ${faktur}`);
            
            // Auto-cleanup: Delete records beyond the top 10 for this faktur
            // This ensures only the 10 most recent records are kept
            if (count > 10) {
                console.log(`[FakturPajak] Auto-cleanup: ${count} total records, deleting older records...`);
                
                // Get all records beyond the top 10
                const { data: oldRecords, error: fetchOldError } = await supabase
                    .from('faktur_pajak_rename_history')
                    .select('id')
                    .eq('faktur', faktur)
                    .order('renamed_at', { ascending: false })
                    .range(10, 9999);  // Skip top 10, get the rest
                
                if (!fetchOldError && oldRecords && oldRecords.length > 0) {
                    const oldIds = oldRecords.map(r => r.id);
                    
                    // Delete old records
                    const { error: deleteError } = await supabase
                        .from('faktur_pajak_rename_history')
                        .delete()
                        .in('id', oldIds);
                    
                    if (deleteError) {
                        console.warn('[FakturPajak] Error during cleanup:', deleteError.message);
                    } else {
                        console.log(`[FakturPajak] ✅ Auto-cleanup deleted ${oldIds.length} old records`);
                    }
                }
            }
            
            res.json({
                success: true,
                faktur,
                history: data || [],
                total_records: count || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
        } catch (error) {
            console.error('[FakturPajak] Endpoint error:', error);
            res.status(500).json({
                error: 'Server error',
                details: error.message
            });
        }
    });
    
    // =====================================================================
    // GET /api/faktur-pajak/rename-stats
    // Get rename statistics
    // =====================================================================
    app.get('/api/faktur-pajak/rename-stats', createAuth(['super_admin', 'moderator']), async (req, res) => {
        try {
            const { hours = 24 } = req.query;
            
            console.log(`[FakturPajak] Getting rename statistics (last ${hours} hours)`);
            
            // Calculate cutoff time
            const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
            
            // Get total count
            const { count: totalCount, error: countError } = await supabase
                .from('faktur_pajak_rename_history')
                .select('*', { count: 'exact', head: true })
                .gte('renamed_at', cutoffTime);
            
            if (countError) {
                console.error('[FakturPajak] Error counting renames:', countError);
                return res.status(500).json({
                    error: 'Failed to fetch statistics',
                    details: countError.message
                });
            }
            
            // Get renames by user
            const { data: renameSbyUser, error: userError } = await supabase
                .from('faktur_pajak_rename_history')
                .select('renamed_by')
                .gte('renamed_at', cutoffTime);
            
            if (userError) {
                console.error('[FakturPajak] Error counting by user:', userError);
                return res.status(500).json({
                    error: 'Failed to fetch user statistics',
                    details: userError.message
                });
            }
            
            // Count by user
            const byUser = {};
            renameSbyUser?.forEach(record => {
                byUser[record.renamed_by] = (byUser[record.renamed_by] || 0) + 1;
            });
            
            console.log(`[FakturPajak] ✅ Statistics retrieved - Total: ${totalCount}`);
            
            res.json({
                success: true,
                time_period: `Last ${hours} hours`,
                cutoff_time: cutoffTime,
                total_renames: totalCount || 0,
                renames_by_user: byUser
            });
            
        } catch (error) {
            console.error('[FakturPajak] Endpoint error:', error);
            res.status(500).json({
                error: 'Server error',
                details: error.message
            });
        }
    });
    
    // =====================================================================
    // POST /api/faktur-pajak/cleanup-old-records
    // Manually trigger cleanup of records older than 1 day (Admin only)
    // In production, call this via cron job or scheduled task
    // =====================================================================
    app.post('/api/faktur-pajak/cleanup-old-records', createAuth(['super_admin']), async (req, res) => {
        try {
            console.log('[FakturPajak] Triggering cleanup of old rename records...');
            
            // Call cleanup function
            const { data, error } = await supabase
                .rpc('cleanup_faktur_pajak_rename_history');
            
            if (error) {
                console.error('[FakturPajak] Error during cleanup:', error);
                return res.status(500).json({
                    error: 'Cleanup failed',
                    details: error.message
                });
            }
            
            console.log('[FakturPajak] ✅ Cleanup completed successfully');
            
            res.json({
                success: true,
                message: 'Cleanup of old records completed',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('[FakturPajak] Endpoint error:', error);
            res.status(500).json({
                error: 'Server error',
                details: error.message
            });
        }
    });
    
    // =====================================================================
    // DELETE /api/faktur-pajak/rename-history/:history_id
    // Manually delete a specific rename history record (Admin and moderators)
    // =====================================================================
    app.delete('/api/faktur-pajak/rename-history/:history_id', createAuth(['super_admin', 'moderator', 'admin_zona']), async (req, res) => {
        try {
            const { history_id } = req.params;
            
            if (!history_id) {
                return res.status(400).json({ error: 'History ID required' });
            }
            
            console.log(`[FakturPajak] Deleting rename history: ${history_id}`);
            
            // Delete record
            const { error } = await supabase
                .from('faktur_pajak_rename_history')
                .delete()
                .eq('id', history_id);
            
            if (error) {
                console.error('[FakturPajak] Error deleting history:', error);
                return res.status(500).json({
                    error: 'Failed to delete history',
                    details: error.message
                });
            }
            
            console.log(`[FakturPajak] ✅ History deleted successfully`);
            
            res.json({
                success: true,
                message: 'Rename history deleted successfully'
            });
            
        } catch (error) {
            console.error('[FakturPajak] Endpoint error:', error);
            res.status(500).json({
                error: 'Server error',
                details: error.message
            });
        }
    });
    
    console.log('[FakturPajak] ✅ All rename history endpoints registered');
}

module.exports = { addFakturPajakRenameEndpoints };
