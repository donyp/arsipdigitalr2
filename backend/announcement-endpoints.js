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

            // Get announcements with read status in ONE query using LEFT JOIN
            const { data, error } = await supabase
                .from('announcements')
                .select(`
                    *,
                    announcement_reads!left(is_read)
                `)
                .eq('is_active', true)
                .eq('announcement_reads.user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            console.log('[Announcements] Total fetched announcements:', data?.length);

            // First pass: Filter basic types and collect specific_zonas
            let announcements = [];
            const specificZonasAnnouncements = [];

            for (const a of data) {
                if (a.recipient_type === 'all_users') {
                    console.log('[Announcements] Including all_users announcement:', a.id);
                    announcements.push(a);
                } else if (a.recipient_type === 'all_zonas' && userZonaId) {
                    console.log('[Announcements] Including all_zonas announcement:', a.id);
                    announcements.push(a);
                } else if (a.recipient_type === 'specific_zonas') {
                    console.log('[Announcements] Checking specific_zonas announcement:', a.id);
                    specificZonasAnnouncements.push(a);
                }
            }

            // Check which specific_zonas announcements are for this user's zona
            if (specificZonasAnnouncements.length > 0 && userZonaId) {
                const { data: recipients, error: recipientError } = await supabase
                    .from('announcement_recipients')
                    .select('announcement_id')
                    .eq('recipient_type', 'zona')
                    .eq('recipient_id', userZonaId)
                    .in('announcement_id', specificZonasAnnouncements.map(a => a.id));

                if (!recipientError && recipients) {
                    const recipientIds = new Set(recipients.map(r => r.announcement_id));
                    announcements = announcements.concat(
                        specificZonasAnnouncements.filter(a => recipientIds.has(a.id))
                    );
                    console.log('[Announcements] Included specific_zonas for user zona:', recipients.length);
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
            const userZonaId = req.user.zona_id;

            console.log('[Announcements] Unread count check - userId:', userId, 'userZonaId:', userZonaId);

            const { data: announcements, error } = await supabase
                .from('announcements')
                .select('id, recipient_type')
                .eq('is_active', true);

            if (error) throw error;

            console.log('[Announcements] Total active announcements:', announcements?.length);

            // Collect all eligible announcement IDs
            let eligibleIds = [];

            // Add all_users announcements
            const allUsersIds = announcements
                .filter(a => a.recipient_type === 'all_users')
                .map(a => a.id);
            eligibleIds = eligibleIds.concat(allUsersIds);
            console.log('[Announcements] All users announcements:', allUsersIds.length);

            // Add all_zonas announcements if user has a zona
            if (userZonaId) {
                const allZonasIds = announcements
                    .filter(a => a.recipient_type === 'all_zonas')
                    .map(a => a.id);
                eligibleIds = eligibleIds.concat(allZonasIds);
                console.log('[Announcements] All zonas announcements:', allZonasIds.length);

                // Add specific_zonas announcements for this user's zona
                const specificZonaAnnouncements = announcements.filter(a => a.recipient_type === 'specific_zonas');
                
                if (specificZonaAnnouncements.length > 0) {
                    console.log('[Announcements] Checking specific_zonas announcements:', specificZonaAnnouncements.length);
                    
                    const { data: zoneRecipients, error: recipientError } = await supabase
                        .from('announcement_recipients')
                        .select('announcement_id')
                        .eq('recipient_type', 'zona')
                        .eq('recipient_id', userZonaId)
                        .in('announcement_id', specificZonaAnnouncements.map(a => a.id));
                    
                    if (recipientError) {
                        console.error('[Announcements] Error checking zone recipients:', recipientError);
                    } else if (zoneRecipients) {
                        const zoneAnnouncementIds = zoneRecipients.map(r => r.announcement_id);
                        eligibleIds = eligibleIds.concat(zoneAnnouncementIds);
                        console.log('[Announcements] Zone-specific announcements for zona', userZonaId, ':', zoneAnnouncementIds.length);
                    }
                }
            }

            console.log('[Announcements] Total eligible announcements:', eligibleIds.length);

            if (eligibleIds.length === 0) {
                console.log('[Announcements] No eligible announcements for user');
                return res.json({ unread_count: 0 });
            }

            // Count unread
            const { data: unread, error: countError } = await supabase
                .from('announcement_reads')
                .select('announcement_id')
                .eq('user_id', userId)
                .eq('is_read', false)
                .in('announcement_id', eligibleIds);

            if (countError) throw countError;

            const unreadCount = unread?.length || 0;
            console.log('[Announcements] Unread count result:', unreadCount);
            res.json({ unread_count: unreadCount });
        } catch (error) {
            console.error('[Announcements] Error checking unread count:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });
};
