// ============================================
// Support Ticketing System - API Endpoints
// ============================================

module.exports = function registerSupportEndpoints(app, supabase, authenticateToken, authorizeRole, upload, auditLogger) {
    const crypto = require('crypto');
    const AuditLogger = require('./audit-logger');

    // Generate ticket number: #ANKA[3 random digits]
    function generateTicketNumber() {
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `#ANKA${random}`;
    }

    // ============================================
    // GET /api/support/tickets - Get all tickets (moderator/super_admin) or user's tickets
    // ============================================
    app.get('/api/support/tickets', authenticateToken, async (req, res) => {
        try {
            const { status, zona_id, page = 1, limit = 20, search } = req.query;
            const offset = (page - 1) * limit;

            console.log('[Support API] Request from user:', req.user.userId, 'role:', req.user.role);

            let query = supabase
                .from('support_tickets')
                .select('id, ticket_number, subject, category, priority, status, assigned_to, user_id, zona_id, created_at, updated_at, resolved_at', { count: 'exact' });

            // Moderator and Super Admin can see all tickets from all zonas
            // Admin Zona can see tickets only from their zona
            // Other users only see their own tickets
            if (req.user.role === 'moderator' || req.user.role === 'super_admin') {
                console.log('[Support API] User is moderator/super_admin - showing all tickets');
                // Moderator/Super Admin can see all
            } else if (req.user.role === 'admin_zona') {
                console.log('[Support API] User is admin_zona, zona_id:', req.user.zona_id);
                // Admin zona sees tickets from their zona
                query = query.eq('zona_id', req.user.zona_id);
            } else {
                console.log('[Support API] User is regular user, showing own tickets only');
                // Regular users see only their own
                query = query.eq('user_id', req.user.userId);
            }

            // Filter by status if provided
            if (status && status !== 'all') {
                query = query.eq('status', status);
            }

            // Filter by zona if provided (admin can filter)
            if (zona_id) {
                query = query.eq('zona_id', parseInt(zona_id));
            }

            // Search by ticket number or subject
            if (search) {
                query = query.or(`ticket_number.ilike.%${search}%,subject.ilike.%${search}%`);
            }

            // Order by created_at descending
            query = query.order('created_at', { ascending: false });

            // Apply pagination
            const { data: tickets, error, count } = await query.range(offset, offset + limit - 1);

            if (error) throw error;

            console.log('[Support API] Found', tickets?.length || 0, 'tickets, total count:', count);

            // Now fetch zona names and usernames for the tickets
            const enrichedTickets = await Promise.all((tickets || []).map(async (ticket) => {
                let zona_name = 'N/A';
                let created_by_username = 'N/A';

                // Get zona name
                try {
                    const { data: zona, error: zonaError } = await supabase
                        .from('zonas')
                        .select('nama')
                        .eq('id', ticket.zona_id)
                        .single();
                    if (zona) zona_name = zona.nama;
                    if (zonaError) console.warn('Zona error:', zonaError);
                } catch (e) {
                    console.warn('Failed to get zona name for zona_id:', ticket.zona_id, e);
                }

                // Get user name (from users.name, not username)
                try {
                    const { data: user, error: userError } = await supabase
                        .from('users')
                        .select('name')
                        .eq('id', ticket.user_id)
                        .single();
                    if (user) created_by_username = user.name || 'N/A';
                    if (userError) console.warn('User error:', userError);
                } catch (e) {
                    console.warn('Failed to get user name for user_id:', ticket.user_id, e);
                }

                return {
                    ...ticket,
                    zona_name,
                    created_by_username
                };
            }));

            res.json({
                success: true,
                tickets: enrichedTickets || [],
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(count / limit)
                }
            });
        } catch (error) {
            console.error('[Support] Error fetching tickets:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================
    // GET /api/support/tickets/stats - Get ticket statistics
    // ============================================
    app.get('/api/support/tickets/stats', authenticateToken, async (req, res) => {
        try {
            const { zona_id } = req.query;

            let baseQuery = supabase.from('support_tickets').select('status', { count: 'exact' });

            // Moderator/Super Admin see all, Admin Zona sees their zona, others see their own
            if (req.user.role === 'moderator' || req.user.role === 'super_admin') {
                // See all
            } else if (req.user.role === 'admin_zona') {
                // See only their zona's tickets
                baseQuery = baseQuery.eq('zona_id', req.user.zona_id);
            } else {
                // Regular users see only their own
                baseQuery = baseQuery.eq('user_id', req.user.userId);
            }

            // Filter by zona if provided
            if (zona_id) {
                baseQuery = baseQuery.eq('zona_id', zona_id);
            }

            // Get counts for each status
            const { data: allTickets, error: allError } = await baseQuery;
            if (allError) throw allError;

            const stats = {
                total: allTickets?.length || 0,
                open: allTickets?.filter(t => t.status === 'Open').length || 0,
                answered: allTickets?.filter(t => t.status === 'Answered').length || 0,
                resolved: allTickets?.filter(t => t.status === 'Resolved').length || 0,
                closed: allTickets?.filter(t => t.status === 'Closed').length || 0
            };

            res.json({ success: true, stats });
        } catch (error) {
            console.error('[Support] Error fetching stats:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================
    // GET /api/support/tickets/:id - Get ticket details with messages
    // ============================================
    app.get('/api/support/tickets/:id', authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;

            // Get ticket
            const { data: ticket, error: ticketError } = await supabase
                .from('support_tickets')
                .select('*')
                .eq('id', id)
                .single();

            if (ticketError || !ticket) {
                return res.status(404).json({ error: 'Ticket not found' });
            }

            // Check authorization (own ticket, moderator/super_admin, or admin_zona for their zona)
            const isOwner = ticket.user_id === req.user.userId;
            const isModerator = req.user.role === 'moderator' || req.user.role === 'super_admin';
            const isAdminZona = req.user.role === 'admin_zona' && ticket.zona_id === req.user.zona_id;
            
            if (!isOwner && !isModerator && !isAdminZona) {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            // Get messages
            const { data: messages, error: messagesError } = await supabase
                .from('support_messages')
                .select('id, user_id, message, is_internal, created_at, updated_at')
                .eq('ticket_id', id)
                .order('created_at', { ascending: true });

            if (messagesError) throw messagesError;

            // Get attachments for ticket and each message
            const { data: attachments, error: attachmentsError } = await supabase
                .from('support_attachments')
                .select('*')
                .eq('ticket_id', id);

            if (attachmentsError) throw attachmentsError;

            // Enrich messages with attachments AND user info
            const enrichedMessages = await Promise.all((messages || []).map(async (msg) => {
                let user_name = 'N/A';
                let user_role = 'N/A';
                
                try {
                    const { data: user, error: userError } = await supabase
                        .from('users')
                        .select('name, role')
                        .eq('id', msg.user_id)
                        .single();
                    
                    if (user) {
                        user_name = user.name || 'N/A';
                        user_role = user.role || 'N/A';
                    }
                } catch (e) {
                    console.warn('[Support] Could not fetch user info for user_id:', msg.user_id);
                }
                
                return {
                    ...msg,
                    user_name,
                    user_role,
                    attachments: attachments?.filter(a => a.message_id === msg.id) || []
                };
            })) || [];

            // Get creator username (from users.name, not username column)
            let created_by_username = 'N/A';
            try {
                console.log('[Support] Fetching user for user_id:', ticket.user_id);
                const { data: user, error: userError } = await supabase
                    .from('users')
                    .select('name')
                    .eq('id', ticket.user_id)
                    .single();
                
                if (userError) {
                    console.warn('[Support] User query error:', userError);
                } else if (user) {
                    created_by_username = user.name || 'N/A';
                    console.log('[Support] Found user name:', created_by_username);
                } else {
                    console.warn('[Support] No user found for user_id:', ticket.user_id);
                }
            } catch (e) {
                console.error('[Support] Exception fetching user:', e);
            }

            res.json({
                success: true,
                ticket: {
                    ...ticket,
                    created_by_username,
                    attachments: attachments?.filter(a => !a.message_id) || [],
                    messages: enrichedMessages
                }
            });
        } catch (error) {
            console.error('[Support] Error fetching ticket:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================
    // POST /api/support/tickets - Create new ticket (only admin_zona and users, NOT moderator/super_admin)
    // ============================================
    app.post('/api/support/tickets', authenticateToken, async (req, res) => {
        try {
            const startTime = Date.now();
            
            // Moderator and Super Admin cannot create tickets
            if (req.user.role === 'moderator' || req.user.role === 'super_admin') {
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: req.user.zona_id || null,
                    action: 'Create Ticket - Permission Denied',
                    resourceType: 'ticket',
                    resourceId: null,
                    resourceName: null,
                    operation: 'CREATE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: '/api/support/tickets',
                    requestMethod: 'POST',
                    statusCode: 403,
                    responseMessage: null,
                    errorMessage: 'Moderators and Super Admins cannot create tickets',
                    isSuspicious: true,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(403).json({ error: 'Moderators and Super Admins cannot create tickets' });
            }

            const { subject, description, category, priority, zona_id } = req.body;

            // Validate required fields
            if (!subject || !description || !zona_id) {
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: req.user.zona_id || null,
                    action: 'Create Ticket - Invalid Parameters',
                    resourceType: 'ticket',
                    resourceId: null,
                    resourceName: null,
                    operation: 'CREATE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: '/api/support/tickets',
                    requestMethod: 'POST',
                    statusCode: 400,
                    responseMessage: null,
                    errorMessage: 'Missing required fields',
                    isSuspicious: false,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const ticketNumber = generateTicketNumber();

            // Insert ticket
            const { data: ticket, error: insertError } = await supabase
                .from('support_tickets')
                .insert({
                    ticket_number: ticketNumber,
                    user_id: req.user.userId,
                    zona_id: zona_id,
                    subject: subject,
                    description: description,
                    category: category || 'General',
                    priority: priority || 'Medium',
                    status: 'Open'
                })
                .select()
                .single();

            if (insertError) throw insertError;

            // Log activity
            await supabase.from('support_ticket_activity').insert({
                ticket_id: ticket.id,
                user_id: req.user.userId,
                action: 'created',
                description: 'Ticket created'
            });

            const totalTime = Date.now() - startTime;
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: req.user.userId,
                userEmail: req.user.email,
                userRole: req.user.role,
                zonaId: zona_id,
                action: 'Create Ticket',
                resourceType: 'ticket',
                resourceId: ticket.id,
                resourceName: ticketNumber,
                operation: 'CREATE',
                details: {
                    ticketNumber: ticketNumber,
                    subject: subject,
                    category: category || 'General',
                    priority: priority || 'Medium',
                    description: description.substring(0, 100),
                    creationTime: totalTime
                },
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: '/api/support/tickets',
                requestMethod: 'POST',
                statusCode: 200,
                responseMessage: `Ticket ${ticketNumber} created successfully`,
                errorMessage: null,
                isSuspicious: false,
                severity: 'info'
            }).catch(() => {});

            res.json({
                success: true,
                ticket: ticket,
                message: `Ticket ${ticketNumber} created successfully`
            });
        } catch (error) {
            console.error('[Support] Error creating ticket:', error);
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: req.user.userId,
                userEmail: req.user.email,
                userRole: req.user.role,
                zonaId: req.user.zona_id || null,
                action: 'Create Ticket - Server Error',
                resourceType: 'ticket',
                resourceId: null,
                resourceName: null,
                operation: 'CREATE',
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: '/api/support/tickets',
                requestMethod: 'POST',
                statusCode: 500,
                responseMessage: null,
                errorMessage: error.message,
                isSuspicious: false,
                severity: 'error'
            }).catch(() => {});
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================
    // PUT /api/support/tickets/:id/status - Update ticket status (moderator/super_admin only)
    // ============================================
    app.put('/api/support/tickets/:id/status', authenticateToken, authorizeRole('moderator', 'super_admin'), async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const startTime = Date.now();

            const validStatuses = ['Open', 'Answered', 'Resolved', 'Closed'];
            if (!validStatuses.includes(status)) {
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: req.user.zona_id || null,
                    action: 'Update Ticket Status - Invalid Status',
                    resourceType: 'ticket',
                    resourceId: id,
                    resourceName: id,
                    operation: 'UPDATE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/support/tickets/${id}/status`,
                    requestMethod: 'PUT',
                    statusCode: 400,
                    responseMessage: null,
                    errorMessage: `Invalid status: ${status}`,
                    isSuspicious: false,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(400).json({ error: 'Invalid status' });
            }

            // Get current ticket to log old status
            const { data: oldTicket, error: fetchError } = await supabase
                .from('support_tickets')
                .select('id, ticket_number, status')
                .eq('id', id)
                .single();
            
            if (fetchError || !oldTicket) {
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: req.user.zona_id || null,
                    action: 'Update Ticket Status - Ticket Not Found',
                    resourceType: 'ticket',
                    resourceId: id,
                    resourceName: id,
                    operation: 'UPDATE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/support/tickets/${id}/status`,
                    requestMethod: 'PUT',
                    statusCode: 404,
                    responseMessage: null,
                    errorMessage: 'Ticket not found',
                    isSuspicious: false,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(404).json({ error: 'Ticket not found' });
            }

            const updateData = {
                status: status,
                updated_at: new Date().toISOString()
            };

            // If status is Resolved or Closed, set the resolved_at or closed_at
            if (status === 'Resolved') {
                updateData.resolved_at = new Date().toISOString();
            } else if (status === 'Closed') {
                updateData.closed_at = new Date().toISOString();
            }

            const { data: ticket, error: updateError } = await supabase
                .from('support_tickets')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (updateError) throw updateError;

            // Log activity
            await supabase.from('support_ticket_activity').insert({
                ticket_id: id,
                user_id: req.user.userId,
                action: 'status_changed',
                old_value: oldTicket.status,
                new_value: status,
                description: `Status changed to ${status}`
            });

            const totalTime = Date.now() - startTime;
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: req.user.userId,
                userEmail: req.user.email,
                userRole: req.user.role,
                zonaId: req.user.zona_id || null,
                action: 'Update Ticket Status',
                resourceType: 'ticket',
                resourceId: id,
                resourceName: oldTicket.ticket_number,
                operation: 'UPDATE',
                details: {
                    ticketNumber: oldTicket.ticket_number,
                    oldStatus: oldTicket.status,
                    newStatus: status,
                    updateTime: totalTime
                },
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: `/api/support/tickets/${id}/status`,
                requestMethod: 'PUT',
                statusCode: 200,
                responseMessage: `Ticket status updated to ${status}`,
                errorMessage: null,
                isSuspicious: false,
                severity: 'info'
            }).catch(() => {});

            res.json({
                success: true,
                ticket: ticket,
                message: `Ticket status updated to ${status}`
            });
        } catch (error) {
            console.error('[Support] Error updating ticket status:', error);
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: req.user.userId,
                userEmail: req.user.email,
                userRole: req.user.role,
                zonaId: req.user.zona_id || null,
                action: 'Update Ticket Status - Server Error',
                resourceType: 'ticket',
                resourceId: req.params.id,
                resourceName: req.params.id,
                operation: 'UPDATE',
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: `/api/support/tickets/${req.params.id}/status`,
                requestMethod: 'PUT',
                statusCode: 500,
                responseMessage: null,
                errorMessage: error.message,
                isSuspicious: false,
                severity: 'error'
            }).catch(() => {});
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================
    // POST /api/support/tickets/:id/messages - Add reply/message to ticket
    // ============================================
    app.post('/api/support/tickets/:id/messages', authenticateToken, async (req, res) => {
        try {
            const { id: ticketId } = req.params;
            const { message, is_internal = false } = req.body;
            const startTime = Date.now();

            if (!message || message.trim().length === 0) {
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: req.user.zona_id || null,
                    action: 'Add Ticket Message - Empty Message',
                    resourceType: 'ticket',
                    resourceId: ticketId,
                    resourceName: ticketId,
                    operation: 'CREATE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/support/tickets/${ticketId}/messages`,
                    requestMethod: 'POST',
                    statusCode: 400,
                    responseMessage: null,
                    errorMessage: 'Message cannot be empty',
                    isSuspicious: false,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(400).json({ error: 'Message cannot be empty' });
            }

            // Check ticket exists and user has access
            const { data: ticket, error: ticketError } = await supabase
                .from('support_tickets')
                .select('id, user_id, status, ticket_number')
                .eq('id', ticketId)
                .single();

            if (ticketError || !ticket) {
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: req.user.zona_id || null,
                    action: 'Add Ticket Message - Ticket Not Found',
                    resourceType: 'ticket',
                    resourceId: ticketId,
                    resourceName: ticketId,
                    operation: 'CREATE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/support/tickets/${ticketId}/messages`,
                    requestMethod: 'POST',
                    statusCode: 404,
                    responseMessage: null,
                    errorMessage: 'Ticket not found',
                    isSuspicious: false,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(404).json({ error: 'Ticket not found' });
            }

            // Internal notes only for moderator/super_admin
            if (is_internal && req.user.role !== 'moderator' && req.user.role !== 'super_admin') {
                const { ipAddress } = AuditLogger.extractClientInfo(req);
                await auditLogger.log({
                    userId: req.user.userId,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    zonaId: req.user.zona_id || null,
                    action: 'Add Ticket Message - Permission Denied',
                    resourceType: 'ticket',
                    resourceId: ticketId,
                    resourceName: ticket.ticket_number,
                    operation: 'CREATE',
                    ipAddress: ipAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    requestPath: `/api/support/tickets/${ticketId}/messages`,
                    requestMethod: 'POST',
                    statusCode: 403,
                    responseMessage: null,
                    errorMessage: 'Only moderators can add internal notes',
                    isSuspicious: true,
                    severity: 'warning'
                }).catch(() => {});
                return res.status(403).json({ error: 'Only moderators can add internal notes' });
            }

            // Insert message
            const { data: newMessage, error: insertError } = await supabase
                .from('support_messages')
                .insert({
                    ticket_id: ticketId,
                    user_id: req.user.userId,
                    message: message,
                    is_internal: is_internal
                })
                .select()
                .single();

            if (insertError) throw insertError;

            // Update ticket status if moderator is responding
            if (!is_internal && (req.user.role === 'moderator' || req.user.role === 'super_admin')) {
                if (ticket.status === 'Open') {
                    await supabase
                        .from('support_tickets')
                        .update({ status: 'Answered', updated_at: new Date().toISOString() })
                        .eq('id', ticketId);
                }
            }

            const totalTime = Date.now() - startTime;
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: req.user.userId,
                userEmail: req.user.email,
                userRole: req.user.role,
                zonaId: req.user.zona_id || null,
                action: 'Add Ticket Message',
                resourceType: 'ticket',
                resourceId: ticketId,
                resourceName: ticket.ticket_number,
                operation: 'CREATE',
                details: {
                    ticketNumber: ticket.ticket_number,
                    messageLength: message.length,
                    isInternal: is_internal,
                    addTime: totalTime
                },
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: `/api/support/tickets/${ticketId}/messages`,
                requestMethod: 'POST',
                statusCode: 200,
                responseMessage: 'Message added successfully',
                errorMessage: null,
                isSuspicious: false,
                severity: 'info'
            }).catch(() => {});

            res.json({
                success: true,
                message: newMessage
            });
        } catch (error) {
            console.error('[Support] Error adding message:', error);
            const { ipAddress } = AuditLogger.extractClientInfo(req);
            await auditLogger.log({
                userId: req.user.userId,
                userEmail: req.user.email,
                userRole: req.user.role,
                zonaId: req.user.zona_id || null,
                action: 'Add Ticket Message - Server Error',
                resourceType: 'ticket',
                resourceId: req.params.id,
                resourceName: req.params.id,
                operation: 'CREATE',
                ipAddress: ipAddress,
                userAgent: req.headers['user-agent'] || 'Unknown',
                requestPath: `/api/support/tickets/${req.params.id}/messages`,
                requestMethod: 'POST',
                statusCode: 500,
                responseMessage: null,
                errorMessage: error.message,
                isSuspicious: false,
                severity: 'error'
            }).catch(() => {});
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================
    // POST /api/support/tickets/:id/upload - Upload attachment
    // ============================================
    app.post('/api/support/tickets/:id/upload', authenticateToken, upload.single('attachment'), async (req, res) => {
        try {
            const { id: ticketId } = req.params;
            const { message_id } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            // Check ticket exists
            const { data: ticket, error: ticketError } = await supabase
                .from('support_tickets')
                .select('id')
                .eq('id', ticketId)
                .single();

            if (ticketError || !ticket) {
                return res.status(404).json({ error: 'Ticket not found' });
            }

            // If message_id provided, verify it belongs to this ticket
            if (message_id) {
                const { data: msg, error: msgError } = await supabase
                    .from('support_messages')
                    .select('id')
                    .eq('id', message_id)
                    .eq('ticket_id', ticketId)
                    .single();

                if (msgError || !msg) {
                    return res.status(404).json({ error: 'Message not found' });
                }
            }

            // Store file info in database
            const { data: attachment, error: insertError } = await supabase
                .from('support_attachments')
                .insert({
                    ticket_id: ticketId,
                    message_id: message_id || null,
                    file_name: req.file.originalname,
                    file_path: req.file.path, // Store local path
                    file_type: req.file.mimetype,
                    file_size: req.file.size,
                    uploaded_by: req.user.userId
                })
                .select()
                .single();

            if (insertError) throw insertError;

            res.json({
                success: true,
                attachment: attachment,
                message: 'File uploaded successfully'
            });
        } catch (error) {
            console.error('[Support] Error uploading attachment:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================
    // GET /api/support/tickets/:id/download/:attachmentId - Download attachment
    // ============================================
    app.get('/api/support/tickets/:id/download/:attachmentId', authenticateToken, async (req, res) => {
        try {
            const { id: ticketId, attachmentId } = req.params;

            // Get attachment
            const { data: attachment, error: attachError } = await supabase
                .from('support_attachments')
                .select('*')
                .eq('id', attachmentId)
                .eq('ticket_id', ticketId)
                .single();

            if (attachError || !attachment) {
                return res.status(404).json({ error: 'Attachment not found' });
            }

            // Check authorization
            const { data: ticket } = await supabase
                .from('support_tickets')
                .select('user_id, zona_id')
                .eq('id', ticketId)
                .single();

            const isOwner = ticket.user_id === req.user.userId;
            const isModerator = req.user.role === 'moderator' || req.user.role === 'super_admin';
            const isAdminZona = req.user.role === 'admin_zona' && ticket.zona_id === req.user.zona_id;
            
            if (!isOwner && !isModerator && !isAdminZona) {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            // Download file
            const fs = require('fs');
            const filePath = attachment.file_path;

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found on server' });
            }

            res.download(filePath, attachment.file_name);
        } catch (error) {
            console.error('[Support] Error downloading attachment:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================
    // PUT /api/support/tickets/:id/assign - Assign ticket to moderator (super_admin only)
    // ============================================
    app.put('/api/support/tickets/:id/assign', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
        try {
            const { id } = req.params;
            const { assigned_to } = req.body;

            if (!assigned_to) {
                return res.status(400).json({ error: 'assigned_to is required' });
            }

            const { data: ticket, error: updateError } = await supabase
                .from('support_tickets')
                .update({ assigned_to: assigned_to, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();

            if (updateError) throw updateError;

            res.json({
                success: true,
                ticket: ticket,
                message: 'Ticket assigned successfully'
            });
        } catch (error) {
            console.error('[Support] Error assigning ticket:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================
    // DELETE /api/support/tickets/:id/messages/:messageId - Delete message (moderator only)
    // ============================================
    app.delete('/api/support/tickets/:id/messages/:messageId', authenticateToken, authorizeRole('moderator', 'super_admin'), async (req, res) => {
        try {
            const { id: ticketId, messageId } = req.params;

            // Get message to verify it exists
            const { data: message, error: msgError } = await supabase
                .from('support_messages')
                .select('id, ticket_id')
                .eq('id', messageId)
                .eq('ticket_id', ticketId)
                .single();

            if (msgError || !message) {
                return res.status(404).json({ error: 'Message not found' });
            }

            // Delete message
            const { error: deleteError } = await supabase
                .from('support_messages')
                .delete()
                .eq('id', messageId);

            if (deleteError) throw deleteError;

            // Log activity
            await supabase.from('support_ticket_activity').insert({
                ticket_id: ticketId,
                user_id: req.user.userId,
                action: 'message_deleted',
                description: `Message deleted by ${req.user.role}`
            });

            res.json({
                success: true,
                message: 'Message deleted successfully'
            });
        } catch (error) {
            console.error('[Support] Error deleting message:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================
    // DELETE /api/support/tickets/cleanup-old-closed - Delete closed tickets older than 7 days (admin only)
    // ============================================
    app.delete('/api/support/tickets/cleanup-old-closed', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
        try {
            console.log('[Support] Running cleanup: deleting closed tickets older than 7 days');
            
            // Calculate date 7 days ago
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            // Delete tickets with status 'Closed' and created_at older than 7 days
            const { data: deletedTickets, error: deleteError } = await supabase
                .from('support_tickets')
                .delete()
                .eq('status', 'Closed')
                .lt('created_at', sevenDaysAgo.toISOString())
                .select();
            
            if (deleteError) throw deleteError;
            
            const count = deletedTickets?.length || 0;
            console.log('[Support] Cleanup completed: deleted', count, 'old closed tickets');
            
            res.json({
                success: true,
                message: `Cleanup completed: deleted ${count} closed tickets older than 7 days`
            });
        } catch (error) {
            console.error('[Support] Error running cleanup:', error);
            res.status(500).json({ error: error.message });
        }
    });
};
