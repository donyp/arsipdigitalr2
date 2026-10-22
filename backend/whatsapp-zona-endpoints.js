/**
 * WhatsApp Zona Integration Endpoints
 * - Get/Set WhatsApp group IDs per zona
 * - Send messages to zona groups
 * - Track sent messages
 */

const { getWhatsAppService } = require('./services/whatsapp-baileys');
const WAMessageQueue = require('./services/wa-message-queue');

let waService = null;
let waQueue = null;
let supabaseRef = null;

async function initializeZonaEndpoints(supabase) {
    try {
        waService = await getWhatsAppService();
        waQueue = new WAMessageQueue(waService);
        supabaseRef = supabase;
        console.log('[WhatsApp Zona] Endpoints initialized');
    } catch (error) {
        console.error('[WhatsApp Zona] Failed to initialize:', error.message);
    }
}

/**
 * Akses instance service & antrean (dipakai modul auto-dispatch dan
 * endpoint dashboard pengaturan).
 */
function getWaService() {
    return waService;
}

function getWaQueue() {
    return waQueue;
}

/**
 * Terapkan konfigurasi anti-ban ke antrean pesan + service bot.
 * @param {object} antibanCfg
 */
function applyAntiBanConfig(antibanCfg) {
    try {
        if (waQueue) waQueue.setAntiBanConfig(antibanCfg || {});
        if (waService && typeof waService.setAntiBanConfig === 'function') {
            waService.setAntiBanConfig(antibanCfg || {});
        }
        return true;
    } catch (e) {
        console.warn('[WhatsApp Zona] Gagal menerapkan konfigurasi anti-ban:', e.message);
        return false;
    }
}

function registerZonaEndpoints(app, supabase, createAuth) {
    initializeZonaEndpoints(supabase);

    // ====================================================================
    // GET: Zona WhatsApp Group - Get all zona groups or specific zona
    // ====================================================================
    app.get('/api/whatsapp/zona-groups', createAuth(), async (req, res) => {
        try {
            // Admin only
            if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin_zona') {
                return res.status(403).json({ error: 'Admin access required' });
            }

            let query = supabase.from('whatsapp_zona_groups').select('*');

            // If admin_zona, only show their zona
            if (req.user?.role === 'admin_zona') {
                query = query.eq('zona_id', req.user.zona_id);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;

            res.json({
                success: true,
                count: data?.length || 0,
                groups: data || []
            });
        } catch (error) {
            console.error('[Zona Groups] Get error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ====================================================================
    // POST: Set Zona WhatsApp Group - Configure group for zona
    // ====================================================================
    app.post('/api/whatsapp/zona-groups', createAuth(), async (req, res) => {
        try {
            // Admin only
            if (req.user?.role !== 'super_admin' && req.user?.role !== 'moderator') {
                return res.status(403).json({ error: 'Super admin only' });
            }

            const { zona_id, group_id, group_name, is_active } = req.body;

            if (!zona_id || !group_id) {
                return res.status(400).json({ error: 'zona_id and group_id required' });
            }

            // Validate group_id format
            if (!group_id.includes('@g.us') && !group_id.match(/^\d+@g\.us$/)) {
                return res.status(400).json({ 
                    error: 'Invalid group_id format. Expected: 120xxxxx@g.us or just 120xxxxx' 
                });
            }

            const formattedGroupId = group_id.includes('@g.us') ? group_id : `${group_id}@g.us`;

            // Upsert (update if exists, insert if not)
            const { data, error } = await supabase
                .from('whatsapp_zona_groups')
                .upsert({
                    zona_id,
                    group_id: formattedGroupId,
                    group_name: group_name || `Zona-${String(zona_id).substring(0, 8)}`,
                    is_active: is_active === false ? false : true,
                    updated_at: new Date().toISOString()
                }, { 
                    onConflict: 'zona_id' 
                })
                .select();

            if (error) throw error;

            console.log(`[Zona Groups] Set group for zona ${zona_id}: ${formattedGroupId}`);

            res.json({
                success: true,
                message: 'WhatsApp group configured for zona',
                group: data?.[0]
            });
        } catch (error) {
            console.error('[Zona Groups] Set error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ====================================================================
    // DELETE: Remove Zona WhatsApp Group
    // ====================================================================
    app.delete('/api/whatsapp/zona-groups/:zona_id', createAuth(), async (req, res) => {
        try {
            if (req.user?.role !== 'super_admin') {
                return res.status(403).json({ error: 'Super admin only' });
            }

            const { zona_id } = req.params;

            const { error } = await supabase
                .from('whatsapp_zona_groups')
                .delete()
                .eq('zona_id', zona_id);

            if (error) throw error;

            res.json({
                success: true,
                message: 'WhatsApp group removed for zona'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ====================================================================
    // POST: Send Message to Zona Group - Manual send with optional zona selection
    // ====================================================================
    app.post('/api/whatsapp/send-to-zona', createAuth(), async (req, res) => {
        try {
            if (!waService?.isReady()) {
                return res.status(503).json({ error: 'WhatsApp not connected' });
            }

            const { zona_id, message, send_now = false } = req.body;

            if (!zona_id || !message) {
                return res.status(400).json({ error: 'zona_id and message required' });
            }

            // Get zona group config
            const { data: groupData, error: groupError } = await supabase
                .from('whatsapp_zona_groups')
                .select('*')
                .eq('zona_id', zona_id)
                .eq('is_active', true)
                .single();

            if (groupError || !groupData) {
                return res.status(404).json({ 
                    error: 'WhatsApp group not configured for this zona' 
                });
            }

            // Enqueue message
            const result = await waQueue.enqueue(groupData.group_id, message, 'group');

            // Track in database
            await supabase
                .from('whatsapp_zona_messages')
                .insert({
                    zona_id,
                    group_id: groupData.group_id,
                    message,
                    message_type: 'manual_send',
                    sent_by_user_id: req.user.id,
                    queue_status: send_now ? 'queued' : 'pending'
                });

            console.log(`[Zona Send] Message queued for zona ${zona_id}`);

            res.json({
                success: true,
                messageId: result.id,
                status: result.status,
                zonaName: req.body.zonaName || zona_id
            });
        } catch (error) {
            console.error('[Zona Send] Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ====================================================================
    // POST: Auto-Send on Invoice Upload
    // ====================================================================
    // DINONAKTIFKAN: endpoint lama ini mengirim pesan "Invoice Baru" (bukan
    // format notifikasi upload) ke grup zona. sekarang alurnya:
    //   upload -> createInvoiceNotifications() -> wa-auto-dispatch (pesan
    //   notifikasi yang sama persis dengan di halaman "WA Messages").
    // Supaya tidak ada pesan liar yang masuk ke grup zona, endpoint ini
    // dimatikan.
    app.post('/api/whatsapp/trigger-invoice-upload', createAuth(), async (req, res) => {
        return res.status(410).json({
            success: false,
            queued: false,
            error: 'Endpoint ini dinonaktifkan. Notifikasi upload invoice dikirim otomatis oleh sistem notifikasi (format UPDATE INVOICE ZONA).'
        });
    });

    // ====================================================================
    // GET: Zona Message History - Get sent messages for zona
    // ====================================================================
    app.get('/api/whatsapp/zona-messages/:zona_id', createAuth(), async (req, res) => {
        try {
            const { zona_id } = req.params;
            const limit = Math.min(parseInt(req.query.limit) || 50, 200);
            const offset = parseInt(req.query.offset) || 0;

            // Admin access control
            if (req.user?.role === 'admin_zona' && req.user.zona_id !== zona_id) {
                return res.status(403).json({ error: 'Cannot access other zones' });
            }

            const { data, error, count } = await supabase
                .from('whatsapp_zona_messages')
                .select('*', { count: 'exact' })
                .eq('zona_id', zona_id)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) throw error;

            res.json({
                success: true,
                messages: data || [],
                total: count || 0,
                limit,
                offset
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ====================================================================
    // POST: Get Pending Notifications (for whatsapp-messages.html)
    // ====================================================================
    app.get('/api/whatsapp/pending-zona-messages', createAuth(), async (req, res) => {
        try {
            let query = supabase
                .from('whatsapp_zona_messages')
                .select('*, zonas(id, nama)')
                .eq('queue_status', 'pending')
                .order('created_at', { ascending: false });

            // If admin_zona, only their zona
            if (req.user?.role === 'admin_zona') {
                query = query.eq('zona_id', req.user.zona_id);
            }

            const { data, error } = await query;

            if (error) throw error;

            // Group by zona
            const grouped = {};
            data?.forEach(msg => {
                const zonaName = msg.zonas?.nama || `Zona ${msg.zona_id.substring(0, 8)}`;
                if (!grouped[zonaName]) grouped[zonaName] = [];
                grouped[zonaName].push(msg);
            });

            res.json({
                success: true,
                notifications: grouped,
                count: data?.length || 0
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ====================================================================
    // POST: Mark Message as Sent
    // ====================================================================
    app.post('/api/whatsapp/mark-sent', createAuth(), async (req, res) => {
        try {
            const { message_id } = req.body;

            if (!message_id) {
                return res.status(400).json({ error: 'message_id required' });
            }

            const { error } = await supabase
                .from('whatsapp_zona_messages')
                .update({
                    queue_status: 'sent',
                    sent_at: new Date().toISOString()
                })
                .eq('id', message_id);

            if (error) throw error;

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ====================================================================
    // DELETE: Delete Pending Message
    // ====================================================================
    app.delete('/api/whatsapp/zona-message/:message_id', createAuth(), async (req, res) => {
        try {
            const { message_id } = req.params;

            const { error } = await supabase
                .from('whatsapp_zona_messages')
                .delete()
                .eq('id', message_id);

            if (error) throw error;

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = {
    initializeZonaEndpoints,
    registerZonaEndpoints,
    getWaService,
    getWaQueue,
    applyAntiBanConfig
};
