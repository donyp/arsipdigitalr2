// Announcement System Endpoints

module.exports = (app, supabase, verifyToken, authorizeRole) => {
    // GET: List announcements for current user
    app.get('/api/announcements', verifyToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const userZonaId = req.user.zona_id;

            const { data, error } = await supabase
                .from('announcements')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            // Filter based on recipient type
            const filtered = data.filter(a => {
                if (a.recipient_type === 'all_users') return true;
                if (a.recipient_type === 'all_zonas' && userZonaId) return true;
                return false;
            });

            // Get read status
            const announcements = await Promise.all(filtered.map(async (a) => {
                const { data: reads } = await supabase
                    .from('announcement_reads')
                    .select('is_read')
                    .eq('announcement_id', a.id)
                    .eq('user_id', userId)
                    .maybeSingle();
                
                return {
                    ...a,
                    current_user_read: reads?.is_read || false
                };
            }));

            res.json({ announcements });
        } catch (error) {
            console.error('Error fetching announcements:', error);
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
    app.post('/api/announcements', [verifyToken, authorizeRole('moderator', 'super_admin')], async (req, res) => {
        try {
            const { title, content, announcement_type, recipient_type, recipients } = req.body;

            if (!title || !content || !announcement_type) {
                return res.status(400).json({ error: 'Missing required fields' });
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
                console.error('Error creating announcement:', error);
                return res.status(500).json({ error: 'Failed to create announcement' });
            }

            const announcementId = data.id;

            // Insert recipients if specific
            if ((recipient_type === 'specific_users' || recipient_type === 'specific_zonas') && recipients && recipients.length > 0) {
                const recipientType = recipient_type === 'specific_users' ? 'user' : 'zona';
                const recipientRecords = recipients.map(id => ({
                    announcement_id: announcementId,
                    recipient_type: recipientType,
                    recipient_id: id
                }));

                await supabase.from('announcement_recipients').insert(recipientRecords);
            }

            // Create read records
            await createReadRecords(announcementId, recipient_type, recipients, supabase);

            res.json({ id: announcementId, message: 'Announcement created successfully' });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // PUT: Update announcement (MODERATOR only)
    app.put('/api/announcements/:id', [verifyToken, authorizeRole('moderator', 'super_admin')], async (req, res) => {
        try {
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
                console.error('Error updating announcement:', error);
                return res.status(500).json({ error: 'Failed to update announcement' });
            }

            res.json({ message: 'Announcement updated successfully' });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // DELETE: Delete announcement (MODERATOR only)
    app.delete('/api/announcements/:id', [verifyToken, authorizeRole('moderator', 'super_admin')], async (req, res) => {
        try {
            const { error } = await supabase
                .from('announcements')
                .update({ is_active: false })
                .eq('id', req.params.id);

            if (error) {
                console.error('Error deleting announcement:', error);
                return res.status(500).json({ error: 'Failed to delete announcement' });
            }

            res.json({ message: 'Announcement deleted successfully' });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET: Unread count for current user
    app.get('/api/announcements/unread/count', verifyToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const userZonaId = req.user.zona_id;

            const { data: announcements, error } = await supabase
                .from('announcements')
                .select('id, recipient_type')
                .eq('is_active', true);

            if (error) throw error;

            // Filter eligible announcements
            const eligible = announcements.filter(a => 
                a.recipient_type === 'all_users' || (a.recipient_type === 'all_zonas' && userZonaId)
            );

            if (eligible.length === 0) {
                return res.json({ unread_count: 0 });
            }

            // Count unread
            const { data: unread, error: countError } = await supabase
                .from('announcement_reads')
                .select('announcement_id')
                .eq('user_id', userId)
                .eq('is_read', false)
                .in('announcement_id', eligible.map(a => a.id));

            if (countError) throw countError;

            res.json({ unread_count: unread?.length || 0 });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });
};

// Helper function to create read records
async function createReadRecords(announcementId, recipientType, recipients, supabase) {
    try {
        if (recipientType === 'all_users') {
            const { data: users } = await supabase
                .from('users')
                .select('id')
                .eq('is_active', true);

            if (users && users.length > 0) {
                const readRecords = users.map(u => ({
                    announcement_id: announcementId,
                    user_id: u.id,
                    is_read: false,
                    read_at: null
                }));
                await supabase.from('announcement_reads').insert(readRecords);
            }
        } else if (recipientType === 'specific_users' && recipients) {
            const readRecords = recipients.map(id => ({
                announcement_id: announcementId,
                user_id: id,
                is_read: false,
                read_at: null
            }));
            await supabase.from('announcement_reads').insert(readRecords);
        } else if (recipientType === 'all_zonas') {
            const { data: zonaUsers } = await supabase
                .from('users')
                .select('id')
                .not('zona_id', 'is', null)
                .eq('is_active', true);

            if (zonaUsers && zonaUsers.length > 0) {
                const readRecords = zonaUsers.map(u => ({
                    announcement_id: announcementId,
                    user_id: u.id,
                    is_read: false,
                    read_at: null
                }));
                await supabase.from('announcement_reads').insert(readRecords);
            }
        }
    } catch (error) {
        console.error('Error creating read records:', error);
    }
}
