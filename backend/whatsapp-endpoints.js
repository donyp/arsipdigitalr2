/**
 * WhatsApp API Endpoints
 * - Send notifications to groups/individuals
 * - Check queue status
 * - Manage WhatsApp connection
 */

const WAMessageQueue = require('./services/wa-message-queue');
const { getWhatsAppService } = require('./services/whatsapp-baileys');

let waService = null;
let waQueue = null;

/**
 * Initialize WhatsApp service (call once on app start)
 */
async function initializeWhatsApp() {
    try {
        waService = await getWhatsAppService();
        waQueue = new WAMessageQueue(waService);
        console.log('[WhatsApp] Endpoints initialized');
    } catch (error) {
        console.error('[WhatsApp] Failed to initialize:', error.message);
    }
}

/**
 * Register endpoints
 */
function registerWhatsAppEndpoints(app, createAuth) {
    // QR Code: Get current QR for scanning (NO AUTH - for setup page)
    app.get('/api/whatsapp/qr', async (req, res) => {
        try {
            if (!waService) {
                return res.status(503).json({
                    error: 'WhatsApp service not initialized',
                    qr: null
                });
            }

            const qr = waService.lastQR;
            if (!qr) {
                // Beri alasan yang JELAS supaya admin tahu harus apa.
                const diag = typeof waService.getDiagnostics === 'function' ? waService.getDiagnostics() : {};
                return res.status(404).json({
                    error: 'QR belum tersedia',
                    qr: null,
                    state: diag.connectionState || 'unknown',
                    reason: diag.lastError ? diag.lastError.message : null,
                    statusCode: diag.lastError ? diag.lastError.statusCode : null,
                    hint: diag.hint || (diag.hasCreds
                        ? 'Sesi bot sudah ada tapi belum tersambung ke WhatsApp. Coba "Reset Sesi Bot" lalu scan QR ulang, atau cek Diagnosa Koneksi.'
                        : 'Server WhatsApp belum siap. Tunggu beberapa detik lalu klik "Tampilkan QR" lagi, atau cek "Diagnosa Koneksi".')
                });
            }

            // Convert QR string to data URL using qrcode library on SERVER
            try {
                const QRCode = require('qrcode');
                const dataUrl = await QRCode.toDataURL(qr, {
                    width: 300,
                    margin: 2,
                    errorCorrectionLevel: 'H'
                });
                
                res.json({
                    success: true,
                    qr: dataUrl,
                    format: 'data-url',
                    timestamp: new Date()
                });
            } catch (err) {
                console.error('[WhatsApp QR] Conversion error:', err.message);
                // Fallback: return raw QR string for client-side conversion
                res.json({
                    success: true,
                    qr: qr,
                    format: 'text',
                    timestamp: new Date()
                });
            }
        } catch (error) {
            console.error('[WhatsApp QR] Error:', error.message);
            res.status(500).json({ error: error.message, qr: null });
        }
    });

    // Refresh QR: Force reconnect to generate new QR
    app.post('/api/whatsapp/refresh-qr', async (req, res) => {
        try {
            if (!waService) {
                return res.status(503).json({
                    error: 'WhatsApp service not initialized'
                });
            }

            // Disconnect current session
            await waService.disconnect();
            
            // Re-initialize to generate new QR
            setTimeout(async () => {
                try {
                    await waService.initialize();
                    res.json({
                        success: true,
                        message: 'WhatsApp service reconnected - new QR should appear'
                    });
                } catch (err) {
                    res.status(500).json({
                        error: 'Failed to reconnect',
                        details: err.message
                    });
                }
            }, 500);
        } catch (error) {
            console.error('[WhatsApp Refresh] Error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // Status: Check WhatsApp connection & queue
    app.get('/api/whatsapp/status', createAuth(), async (req, res) => {
        try {
            if (!waService) {
                return res.status(503).json({
                    error: 'WhatsApp service not initialized',
                    connected: false,
                    ready: false
                });
            }

            const pairingInfo = waService.getPairingInfo();

            res.json({
                connected: waService.isConnected,
                ready: waService.isReady(),
                connectedPhone: pairingInfo.connectedPhone,
                queue: waQueue ? waQueue.getStats() : null
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Send: Queue message to individual
    app.post('/api/whatsapp/send', createAuth(), async (req, res) => {
        try {
            if (!waService || !waService.isReady()) {
                return res.status(503).json({ error: 'WhatsApp not connected' });
            }

            const { to, message } = req.body;

            // Validate
            if (!to || !message) {
                return res.status(400).json({ error: 'Missing to or message' });
            }

            if (typeof message !== 'string' || message.length > 4096) {
                return res.status(400).json({ error: 'Message too long (max 4096 chars)' });
            }

            // Validate phone format
            const phoneRegex = /^\+?62\d{9,12}$|^\d{10,15}$/;
            if (!phoneRegex.test(to.toString())) {
                return res.status(400).json({ error: 'Invalid phone format' });
            }

            // Enqueue message
            const result = await waQueue.enqueue(to, message, 'individual');

            res.json({
                success: true,
                messageId: result.id,
                status: result.status,
                position: result.position
            });
        } catch (error) {
            console.error('[WhatsApp] Send error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // Send Group: Queue message to group
    app.post('/api/whatsapp/send-group', createAuth(), async (req, res) => {
        try {
            if (!waService || !waService.isReady()) {
                return res.status(503).json({ error: 'WhatsApp not connected' });
            }

            const { groupId, message } = req.body;

            // Validate
            if (!groupId || !message) {
                return res.status(400).json({ error: 'Missing groupId or message' });
            }

            if (typeof message !== 'string' || message.length > 4096) {
                return res.status(400).json({ error: 'Message too long (max 4096 chars)' });
            }

            // Enqueue message
            const result = await waQueue.enqueue(groupId, message, 'group');

            res.json({
                success: true,
                messageId: result.id,
                status: result.status,
                position: result.position
            });
        } catch (error) {
            console.error('[WhatsApp] Send group error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // Queue Status: Get queue stats
    app.get('/api/whatsapp/queue', createAuth(), async (req, res) => {
        try {
            if (!waQueue) {
                return res.status(503).json({ error: 'Queue not initialized' });
            }

            const stats = waQueue.getStats();
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Message Status: Get individual message status
    app.get('/api/whatsapp/message/:messageId', createAuth(), async (req, res) => {
        try {
            if (!waQueue) {
                return res.status(503).json({ error: 'Queue not initialized' });
            }

            const { messageId } = req.params;
            const status = waQueue.getMessageStatus(messageId);

            if (!status) {
                return res.status(404).json({ error: 'Message not found' });
            }

            res.json(status);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Test: Send test message
    app.post('/api/whatsapp/test', createAuth(), async (req, res) => {
        try {
            if (!waService || !waService.isReady()) {
                return res.status(503).json({ error: 'WhatsApp not connected' });
            }

            // Admin only
            if (req.user?.role !== 'super_admin') {
                return res.status(403).json({ error: 'Admin only' });
            }

            const { to } = req.body;
            if (!to) {
                return res.status(400).json({ error: 'Missing to' });
            }

            const testMessage = `🧪 Test message from Arsip Digital\nTime: ${new Date().toISOString()}`;
            const result = await waQueue.enqueue(to, testMessage, 'individual');

            res.json({
                success: true,
                messageId: result.id,
                message: 'Test message queued'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Broadcast: Send to multiple numbers (with zone isolation)
    app.post('/api/whatsapp/broadcast', createAuth(), async (req, res) => {
        try {
            if (!waService || !waService.isReady()) {
                return res.status(503).json({ error: 'WhatsApp not connected' });
            }

            const { recipients, message, type = 'individual' } = req.body;

            if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
                return res.status(400).json({ error: 'Invalid recipients array' });
            }

            if (!message) {
                return res.status(400).json({ error: 'Missing message' });
            }

            // For zone isolation, ensure user can only broadcast to their zone
            if (req.user?.role === 'admin_zona') {
                // TODO: Validate recipients belong to user's zone
                // This prevents data leak between zones
            }

            // Enqueue all messages
            const messageIds = [];
            for (const recipient of recipients) {
                try {
                    const result = await waQueue.enqueue(recipient, message, type);
                    messageIds.push(result.id);
                } catch (err) {
                    console.error(`Failed to enqueue for ${recipient}:`, err.message);
                }
            }

            res.json({
                success: true,
                queued: messageIds.length,
                total: recipients.length,
                messageIds
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Clear failed: Admin only
    app.post('/api/whatsapp/clear-failed', createAuth(), async (req, res) => {
        try {
            if (req.user?.role !== 'super_admin') {
                return res.status(403).json({ error: 'Admin only' });
            }

            if (!waQueue) {
                return res.status(503).json({ error: 'Queue not initialized' });
            }

            const removed = waQueue.clearFailed();
            res.json({
                success: true,
                cleared: removed
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = {
    initializeWhatsApp,
    registerWhatsAppEndpoints
};
