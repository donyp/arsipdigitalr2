// Announcement System Endpoints

module.exports = (app, db, verifyToken) => {
    // GET: List announcements for current user
    app.get('/api/announcements', verifyToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const userRole = req.user.role;
            const userZonaId = req.user.zona_id;

            let query = `
                SELECT a.*, 
                       COUNT(CASE WHEN ar.is_read = FALSE THEN 1 END) as unread_count,
                       CASE WHEN ar2.is_read = TRUE THEN 1 ELSE 0 END as current_user_read
                FROM announcements a
                LEFT JOIN announcement_reads ar ON a.id = ar.announcement_id 
                LEFT JOIN announcement_reads ar2 ON a.id = ar2.announcement_id AND ar2.user_id = ?
                WHERE a.is_active = TRUE
                AND (
                    a.recipient_type = 'all_users'
                    OR (a.recipient_type = 'all_zonas' AND ? > 0)
                    OR (a.recipient_type = 'specific_users' AND EXISTS (
                        SELECT 1 FROM announcement_recipients 
                        WHERE announcement_id = a.id 
                        AND recipient_type = 'user' 
                        AND recipient_id = ?
                    ))
                    OR (a.recipient_type = 'specific_zonas' AND EXISTS (
                        SELECT 1 FROM announcement_recipients 
                        WHERE announcement_id = a.id 
                        AND recipient_type = 'zona' 
                        AND recipient_id = ?
                    ))
                )
                GROUP BY a.id
                ORDER BY a.created_at DESC
                LIMIT 50
            `;

            db.query(query, [userId, userZonaId, userId, userZonaId], (err, results) => {
                if (err) {
                    console.error('Error fetching announcements:', err);
                    return res.status(500).json({ error: 'Failed to fetch announcements' });
                }
                res.json({ announcements: results });
            });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET: Detail announcement
    app.get('/api/announcements/:id', verifyToken, async (req, res) => {
        try {
            const announcementId = req.params.id;
            const userId = req.user.id;

            db.query(
                'SELECT * FROM announcements WHERE id = ? AND is_active = TRUE',
                [announcementId],
                (err, results) => {
                    if (err || results.length === 0) {
                        return res.status(404).json({ error: 'Announcement not found' });
                    }

                    // Mark as read
                    db.query(
                        `INSERT INTO announcement_reads (announcement_id, user_id, is_read, read_at)
                         VALUES (?, ?, TRUE, NOW())
                         ON DUPLICATE KEY UPDATE is_read = TRUE, read_at = NOW()`,
                        [announcementId, userId],
                        (err) => {
                            if (err) console.error('Error marking as read:', err);
                        }
                    );

                    res.json({ announcement: results[0] });
                }
            );
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST: Create announcement (MODERATOR only)
    app.post('/api/announcements', verifyToken, async (req, res) => {
        try {
            if (req.user.role !== 'moderator') {
                return res.status(403).json({ error: 'Only moderators can create announcements' });
            }

            const { title, content, announcement_type, recipient_type, recipients } = req.body;

            if (!title || !content || !announcement_type) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Insert announcement
            db.query(
                `INSERT INTO announcements (title, content, announcement_type, recipient_type, created_by)
                 VALUES (?, ?, ?, ?, ?)`,
                [title, content, announcement_type, recipient_type, req.user.id],
                async (err, result) => {
                    if (err) {
                        console.error('Error creating announcement:', err);
                        return res.status(500).json({ error: 'Failed to create announcement' });
                    }

                    const announcementId = result.insertId;

                    // Insert recipients if specific users/zonas
                    if (recipient_type === 'specific_users' || recipient_type === 'specific_zonas') {
                        if (recipients && recipients.length > 0) {
                            const recipientType = recipient_type === 'specific_users' ? 'user' : 'zona';
                            const recipientValues = recipients.map(id => [announcementId, recipientType, id]);

                            db.query(
                                'INSERT INTO announcement_recipients (announcement_id, recipient_type, recipient_id) VALUES ?',
                                [recipientValues],
                                (err) => {
                                    if (err) console.error('Error inserting recipients:', err);
                                }
                            );
                        }
                    }

                    // Create read records for all eligible users
                    createReadRecords(announcementId, recipient_type, recipients);

                    res.json({ id: announcementId, message: 'Announcement created successfully' });
                }
            );
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // PUT: Update announcement (MODERATOR only)
    app.put('/api/announcements/:id', verifyToken, async (req, res) => {
        try {
            if (req.user.role !== 'moderator') {
                return res.status(403).json({ error: 'Only moderators can update announcements' });
            }

            const { title, content, announcement_type, is_active } = req.body;

            db.query(
                `UPDATE announcements SET title = ?, content = ?, announcement_type = ?, is_active = ? WHERE id = ?`,
                [title, content, announcement_type, is_active, req.params.id],
                (err) => {
                    if (err) {
                        console.error('Error updating announcement:', err);
                        return res.status(500).json({ error: 'Failed to update announcement' });
                    }
                    res.json({ message: 'Announcement updated successfully' });
                }
            );
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET: Unread count for current user
    app.get('/api/announcements/unread/count', verifyToken, (req, res) => {
        try {
            const userId = req.user.id;
            const userZonaId = req.user.zona_id;

            const query = `
                SELECT COUNT(DISTINCT a.id) as unread_count
                FROM announcements a
                LEFT JOIN announcement_reads ar ON a.id = ar.announcement_id AND ar.user_id = ?
                WHERE a.is_active = TRUE
                AND (ar.is_read IS NULL OR ar.is_read = FALSE)
                AND (
                    a.recipient_type = 'all_users'
                    OR (a.recipient_type = 'all_zonas' AND ? > 0)
                    OR (a.recipient_type = 'specific_users' AND EXISTS (
                        SELECT 1 FROM announcement_recipients 
                        WHERE announcement_id = a.id 
                        AND recipient_type = 'user' 
                        AND recipient_id = ?
                    ))
                    OR (a.recipient_type = 'specific_zonas' AND EXISTS (
                        SELECT 1 FROM announcement_recipients 
                        WHERE announcement_id = a.id 
                        AND recipient_type = 'zona' 
                        AND recipient_id = ?
                    ))
                )
            `;

            db.query(query, [userId, userZonaId, userId, userZonaId], (err, results) => {
                if (err) {
                    console.error('Error fetching unread count:', err);
                    return res.status(500).json({ error: 'Failed to fetch unread count' });
                }
                res.json({ unread_count: results[0].unread_count });
            });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });
};

// Helper function to create read records
function createReadRecords(announcementId, recipientType, recipients, db) {
    let userIds = [];

    if (recipientType === 'all_users') {
        db.query('SELECT id FROM users WHERE is_active = TRUE', (err, users) => {
            if (!err && users) {
                userIds = users.map(u => [announcementId, u.id, FALSE, null]);
                insertReadRecords(announcementId, userIds, db);
            }
        });
    } else if (recipientType === 'specific_users' && recipients) {
        userIds = recipients.map(id => [announcementId, id, FALSE, null]);
        insertReadRecords(announcementId, userIds, db);
    } else if (recipientType === 'all_zonas') {
        db.query('SELECT id FROM users WHERE zona_id > 0 AND is_active = TRUE', (err, users) => {
            if (!err && users) {
                userIds = users.map(u => [announcementId, u.id, FALSE, null]);
                insertReadRecords(announcementId, userIds, db);
            }
        });
    }
}

function insertReadRecords(announcementId, userIds, db) {
    if (userIds.length > 0) {
        db.query(
            'INSERT IGNORE INTO announcement_reads (announcement_id, user_id, is_read, read_at) VALUES ?',
            [userIds],
            (err) => {
                if (err) console.error('Error creating read records:', err);
            }
        );
    }
}
