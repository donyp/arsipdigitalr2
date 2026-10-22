// Announcement System Endpoints

module.exports = (app, supabase, verifyToken, authorizeRole) => {
    // Helper function to create read records
    async function createReadRecords(announcementId, recipientType, recipients) {
        try {
            if (recipientType === 'all_users') {
                const { data: users, error: usersError } = await supabase
                    .from('users')
                    .select('id')
                    .eq('is_active', true);

                if (usersError) {
                    console.error('Error fetching users for read records:', usersError);
                    return;
                }

                if (users && users.length > 0) {
                    const readRecords = users.map(u => ({
                        announcement_id: announcementId,
                        user_id: u.id,
                        is_read: false,
                        read_at: null
                    }));

                    const { error: insertError } = await supabase
                        .from('announcement_reads')
                        .insert(readRecords);
                    
                    if (insertError) {
                        console.error('Error inserting read records for all_users:', insertError);
                    }
                }
            } else if (recipientType === 'specific_users' && recipients && recipients.length > 0) {
                const readRecords = recipients.map(id => ({
                    announcement_id: announcementId,
                    user_id: id,
                    is_read: false,
                    read_at: null
                }));

                const { error: insertError } = await supabase
                    .from('announcement_reads')
                    .insert(readRecords);
                
                if (insertError) {
                    console.error('Error inserting read records for specific_users:', insertError);
                }
            } else if (recipientType === 'all_zonas') {
                const { data: zonaUsers, error: zonaError } = await supabase
                    .from('users')
                    .select('id')
                    .not('zona_id', 'is', null)
                    .eq('is_active', true);

                if (zonaError) {
                    console.error('Error fetching zona users for read records:', zonaError);
                    return;
                }

                if (zonaUsers && zonaUsers.length > 0) {
                    const readRecords = zonaUsers.map(u => ({
                        announcement_id: announcementId,
                        user_id: u.id,
                        is_read: false,
                        read_at: null
                    }));

                    const { error: insertError } = await supabase
                        .from('announcement_reads')
                        .insert(readRecords);
                    
                    if (insertError) {
                        console.error('Error inserting read records for all_zonas:', insertError);
                    }
                }
            } else if (recipientType === 'specific_zonas' && recipients && recipients.length > 0) {
                const { data: zonaUsers, error: zonaError } = await supabase
                    .from('users')
                    .select('id')
                    .in('zona_id', recipients)
                    .eq('is_active', true);

                if (zonaError) {
                    console.error('Error fetching specific zona users:', zonaError);
                    return;
                }

                if (zonaUsers && zonaUsers.length > 0) {
                    const readRecords = zonaUsers.map(u => ({
                        announcement_id: announcementId,
                        user_id: u.id,
                        is_read: false,
                        read_at: null
                    }));

                    const { error: insertError } = await supabase
                        .from('announcement_reads')
                        .insert(readRecords);
                    
                    if (insertError) {
                        console.error('Error inserting read records for specific_zonas:', insertError);
                    }
                }
            }
        } catch (error) {
            console.error('Error in createReadRecords:', error);
        }
    }

    // GET: List announcements for current user
    app.get('/api/announcements', verifyToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const userZonaId = req.user.zona_id;

            console.log('[Announcements] Fetching announcements - userId:', userId, 'userZonaId:', userZonaId);

            // Get announcements with read status in ONE query.
            // PAKAI INNER JOIN ke announcement_reads: pengumuman HANYA muncul
            // untuk user yang punya read record -> ini yang membatasi
            // visibility per zona / per user (announcement_reads dibuat hanya
            // untuk penerima yang dituju).
            // Catatan: dengan LEFT JOIN, pengumuman milik zona lain ikut
            // terlihat karena tidak ada record read untuk user tersebut.
            const { data, error } = await supabase
                .from('announcements')
                .select(`
                    *,
                    announcement_reads!inner(is_read)
                `)
                .eq('is_active', true)
                .eq('announcement_reads.user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            console.log('[Announcements] Total fetched announcements:', data?.length);

            // Filter basic types. Scope per user/per zona sudah dijamin oleh
            // INNER JOIN announcement_reads (hanya user penerima yg punya read
            // record), jadi pengumuman 'specific_zonas' / 'specific_users'
            // pun otomatis benar.
            let announcements = [];
            for (const a of data) {
                if (a.recipient_type === 'all_users') {
                    announcements.push(a);
                } else if (a.recipient_type === 'all_zonas' && userZonaId) {
                    announcements.push(a);
                } else if (a.recipient_type === 'specific_zonas' || a.recipient_type === 'specific_users') {
                    //-user ini punya read record (INNER JOIN) -> dia adalah
                    // penerima yang dituju
                    announcements.push(a);
                }
            }

            // Flatten read status
            announcements = announcements.map(a => ({
                ...a,
                current_user_read: a.announcement_reads && a.announcement_reads.length > 0 
                    ? a.announcement_reads[0].is_read 
                    : false,
                announcement_reads: undefined
            }));

            console.log('[Announcements] Final announcements count:', announcements.length);
            res.json({ announcements });
        } catch (error) {
            console.error('[Announcements] Error fetching announcements:', error);
            res.status(500).json({ error: 'Failed to fetch announcements' });
        }
    });

    // GET: Detail announcement
    app.get('/api/announcements/:id', verifyToken, async (req, res) => {
        try {
            const announcementId = req.params.id;
            const userId = req.user.id;

            const { data, error } = await supabase
                .from('announcements')
                .select('*')
                .eq('id', announcementId)
                .eq('is_active', true)
                .maybeSingle();

            if (error || !data) {
                return res.status(404).json({ error: 'Announcement not found' });
            }

            // Mark as read
            await supabase
                .from('announcement_reads')
                .upsert({
                    announcement_id: announcementId,
                    user_id: userId,
                    is_read: true,
                    read_at: new Date().toISOString()
                }, {
                    onConflict: 'announcement_id,user_id'
                });

            res.json({ announcement: data });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST: Create announcement (MODERATOR only)
    app.post('/api/announcements', verifyToken, async (req, res) => {
        try {
            // Check authorization
            if (req.user.role !== 'moderator' && req.user.role !== 'super_admin') {
                return res.status(403).json({ error: 'Only moderators can create announcements' });
            }

            const { title, content, announcement_type, recipient_type, recipients } = req.body;

            console.log('[Announcements] Creating announcement:', { title, announcement_type, recipient_type, recipientCount: recipients?.length });

            if (!title || !content || !announcement_type) {
                return res.status(400).json({ error: 'Missing required fields: title, content, announcement_type' });
            }

            const { data, error } = await supabase
                .from('announcements')
                .insert({
                    title,
                    content,
                    announcement_type,
                    recipient_type,
                    created_by: req.user.id,
                    is_active: true
                })
                .select('id')
                .maybeSingle();

            if (error) {
                console.error('[Announcements] Error creating announcement:', error);
                return res.status(500).json({ error: 'Failed to create announcement: ' + error.message });
            }

            if (!data) {
                console.error('[Announcements] No data returned from insert');
                return res.status(500).json({ error: 'Failed to create announcement: no data returned' });
            }

            const announcementId = data.id;
            console.log('[Announcements] Announcement created with ID:', announcementId);

            // Insert recipients if specific
            if ((recipient_type === 'specific_users' || recipient_type === 'specific_zonas') && recipients && recipients.length > 0) {
                const recipientType = recipient_type === 'specific_users' ? 'user' : 'zona';
                const recipientRecords = recipients.map(id => ({
                    announcement_id: announcementId,
                    recipient_type: recipientType,
                    recipient_id: id
                }));

                console.log('[Announcements] Inserting recipients:', recipientRecords.length);
                const { error: recipientError } = await supabase
                    .from('announcement_recipients')
                    .insert(recipientRecords);

                if (recipientError) {
                    console.error('[Announcements] Error inserting recipients:', recipientError);
                }
            }

            // Create read records (don't await, let it happen in background)
            createReadRecords(announcementId, recipient_type, recipients).catch(err => 
                console.error('[Announcements] Error creating read records:', err)
            );

            console.log('[Announcements] Announcement sent successfully');
            res.json({ id: announcementId, message: 'Announcement created successfully' });
        } catch (error) {
            console.error('[Announcements] Unexpected error:', error);
            res.status(500).json({ error: error.message || 'Server error' });
        }
    });

    // PUT: Update announcement (MODERATOR only)
    app.put('/api/announcements/:id', verifyToken, async (req, res) => {
        try {
            if (req.user.role !== 'moderator' && req.user.role !== 'super_admin') {
                return res.status(403).json({ error: 'Only moderators can update announcements' });
            }

            const { title, content, announcement_type, is_active } = req.body;

            const { error } = await supabase
                .from('announcements')
                .update({
                    title,
                    content,
                    announcement_type,
                    is_active: is_active !== undefined ? is_active : true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', req.params.id);

            if (error) {
                console.error('[Announcements] Error updating announcement:', error);
                return res.status(500).json({ error: 'Failed to update announcement' });
            }

            res.json({ message: 'Announcement updated successfully' });
        } catch (error) {
            console.error('[Announcements] Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // DELETE: Delete announcement (MODERATOR only)
    app.delete('/api/announcements/:id', verifyToken, async (req, res) => {
        try {
            if (req.user.role !== 'moderator' && req.user.role !== 'super_admin') {
                return res.status(403).json({ error: 'Only moderators can delete announcements' });
            }

            const { error } = await supabase
                .from('announcements')
                .update({ is_active: false })
                .eq('id', req.params.id);

            if (error) {
                console.error('[Announcements] Error deleting announcement:', error);
                return res.status(500).json({ error: 'Failed to delete announcement' });
            }

            res.json({ message: 'Announcement deleted successfully' });
        } catch (error) {
            console.error('[Announcements] Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET: Unread count for current user
    app.get('/api/announcements/unread/count', verifyToken, async (req, res) => {
        try {
            const userId = req.user.id;

            // Pengumuman "belum dibaca" = pengumuman aktif yang punya read
            // record untuk user ini dengan is_read = false.
            // Read record hanya dibuat untuk PENERIMA yang dituju (mis. hanya
            // user zona tsb) -> hitungannya otomatis tidak bocor ke zona lain.
            const { data: unread, error: countError } = await supabase
                .from('announcements')
                .select('id, announcement_reads!inner(is_read)')
                .eq('is_active', true)
                .eq('announcement_reads.user_id', userId)
                .eq('announcement_reads.is_read', false);

            if (countError) throw countError;

            const unreadCount = unread?.length || 0;
            res.json({ unread_count: unreadCount });
        } catch (error) {
            console.error('[Announcements] Error checking unread count:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST: Reset all announcements to unread for current user (ADMIN only)
    app.post('/api/announcements/reset-unread', verifyToken, async (req, res) => {
        try {
            // Check authorization - admin/moderator only
            if (req.user.role !== 'moderator' && req.user.role !== 'super_admin') {
                return res.status(403).json({ error: 'Only moderators can reset announcements' });
            }

            const userId = req.user.id;
            const userZonaId = req.user.zona_id;

            // Get active announcements
            const { data: announcements, error } = await supabase
                .from('announcements')
                .select('id, recipient_type')
                .eq('is_active', true);

            if (error) throw error;

            // Collect all eligible announcement IDs
            let eligibleIds = [];

            const allUsersIds = announcements
                .filter(a => a.recipient_type === 'all_users')
                .map(a => a.id);
            eligibleIds = eligibleIds.concat(allUsersIds);

            if (userZonaId) {
                const allZonasIds = announcements
                    .filter(a => a.recipient_type === 'all_zonas')
                    .map(a => a.id);
                eligibleIds = eligibleIds.concat(allZonasIds);

                const specificZonaAnnouncements = announcements.filter(a => a.recipient_type === 'specific_zonas');
                
                if (specificZonaAnnouncements.length > 0) {
                    const { data: zoneRecipients, error: recipientError } = await supabase
                        .from('announcement_recipients')
                        .select('announcement_id')
                        .eq('recipient_type', 'zona')
                        .eq('recipient_id', userZonaId)
                        .in('announcement_id', specificZonaAnnouncements.map(a => a.id));
                    
                    if (!recipientError && zoneRecipients) {
                        const zoneAnnouncementIds = zoneRecipients.map(r => r.announcement_id);
                        eligibleIds = eligibleIds.concat(zoneAnnouncementIds);
                    }
                }
            }

            if (eligibleIds.length === 0) {
                return res.json({ message: 'No announcements to reset', reset_count: 0 });
            }

            // For each announcement, create missing read records
            for (const annId of eligibleIds) {
                const { data: existingRead } = await supabase
                    .from('announcement_reads')
                    .select('id')
                    .eq('announcement_id', annId)
                    .eq('user_id', userId)
                    .maybeSingle();

                if (!existingRead) {
                    // Create the record if it doesn't exist
                    await supabase
                        .from('announcement_reads')
                        .insert({
                            announcement_id: annId,
                            user_id: userId,
                            is_read: false,
                            read_at: null
                        });
                }
            }

            console.log('[Announcements] Ensured read records exist for', eligibleIds.length, 'announcements for user:', userId);
            res.json({ message: 'Announcement records ensured', ensured_count: eligibleIds.length });
        } catch (error) {
            console.error('[Announcements] Error resetting announcements:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST: Admin endpoint to fix all users' announcement read records
    app.post('/api/announcements/fix-all-users', verifyToken, async (req, res) => {
        try {
            // Check authorization - super_admin only
            if (req.user.role !== 'super_admin') {
                return res.status(403).json({ error: 'Only super admins can fix announcement records' });
            }

            const { data: announcements, error: annError } = await supabase
                .from('announcements')
                .select('id, recipient_type')
                .eq('is_active', true);

            if (annError) throw annError;

            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('id, zona_id')
                .eq('is_active', true);

            if (usersError) throw usersError;

            let createdCount = 0;

            // For each user
            for (const user of users) {
                const userId = user.id;
                const userZonaId = user.zona_id;

                // Get eligible announcements for this user
                let eligibleIds = [];

                const allUsersIds = announcements
                    .filter(a => a.recipient_type === 'all_users')
                    .map(a => a.id);
                eligibleIds = eligibleIds.concat(allUsersIds);

                if (userZonaId) {
                    const allZonasIds = announcements
                        .filter(a => a.recipient_type === 'all_zonas')
                        .map(a => a.id);
                    eligibleIds = eligibleIds.concat(allZonasIds);

                    const specificZonaAnnouncements = announcements.filter(a => a.recipient_type === 'specific_zonas');
                    
                    if (specificZonaAnnouncements.length > 0) {
                        const { data: zoneRecipients } = await supabase
                            .from('announcement_recipients')
                            .select('announcement_id')
                            .eq('recipient_type', 'zona')
                            .eq('recipient_id', userZonaId)
                            .in('announcement_id', specificZonaAnnouncements.map(a => a.id));
                        
                        if (zoneRecipients) {
                            const zoneAnnouncementIds = zoneRecipients.map(r => r.announcement_id);
                            eligibleIds = eligibleIds.concat(zoneAnnouncementIds);
                        }
                    }
                }

                // Get existing read records for this user
                const { data: existingReads } = await supabase
                    .from('announcement_reads')
                    .select('announcement_id')
                    .eq('user_id', userId)
                    .in('announcement_id', eligibleIds);

                const existingIds = new Set((existingReads || []).map(r => r.announcement_id));

                // Create missing records
                const missingIds = eligibleIds.filter(id => !existingIds.has(id));
                if (missingIds.length > 0) {
                    const readRecords = missingIds.map(id => ({
                        announcement_id: id,
                        user_id: userId,
                        is_read: false,
                        read_at: null
                    }));

                    const { error: insertError } = await supabase
                        .from('announcement_reads')
                        .insert(readRecords);

                    if (!insertError) {
                        createdCount += missingIds.length;
                    }
                }
            }

            console.log('[Announcements] Fixed announcement records - created', createdCount, 'missing read records');
            res.json({ message: 'Fixed all announcement records', created_count: createdCount });
        } catch (error) {
            console.error('[Announcements] Error fixing announcement records:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });
};
