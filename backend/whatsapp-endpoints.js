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
    // Start Pairing: User provides phone number, system generates pairing code (NO AUTH - for setup page)
    app.post('/api/whatsapp/start-pairing', async (req, res) => {
        try {
            if (!waService) {
                return res.status(503).json({
                    error: 'WhatsApp service not initialized',
                    pairingCode: null
                });
            }

            const { phoneNumber } = req.body;

            // Validate phone number input
            if (!phoneNumber) {
                return res.status(400).json({
                    error: 'Phone number is required',
                    hint: 'Enter phone number in format: 628123456789 or 62812345678'
                });
            }

            // Basic phone validation (should be 10-15 digits)
            const phoneDigits = phoneNumber.replace(/\D/g, '');
            if (phoneDigits.length < 10 || phoneDigits.length > 15) {
                return res.status(400).json({
                    error: 'Invalid phone number format',
                    hint: 'Phone should have 10-15 digits (example: 628123456789)'
                });
            }

            // Set expected phone for verification
            waService.setExpectedPhoneNumber(phoneNumber);

            // If already connected, just wait for pairing code
            // If not connected, initialize to trigger pairing code
            if (!waService.isConnected) {
                console.log('[WhatsApp] Not connected - initializing...');
                try {
                    await waService.initialize();
                } catch (err) {
                    console.error('[WhatsApp] Initialize error:', err.message);
                }
            } else {
                console.log('[WhatsApp] Already connected - pairing code will be generated on next attempt');
            }

            res.json({
                success: true,
                message: 'Pairing started - waiting for code',
                expectedPhone: waService.expectedPhoneNumber,
                hint: 'Pairing code should appear in 3-5 seconds'
            });
        } catch (error) {
            console.error('[WhatsApp Start Pairing] Error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // Pairing Code: Get current pairing code (NO AUTH - for setup page)
    app.get('/api/whatsapp/pairing-code', async (req, res) => {
        try {
            if (!waService) {
                return res.status(503).json({
                    error: 'WhatsApp service not initialized',
                    pairingCode: null
                });
            }

            const pairingInfo = waService.getPairingInfo();
            
            if (!pairingInfo.pairingCode) {
                return res.status(404).json({
                    error: 'No pairing code available - try refreshing',
                    pairingCode: null,
                    hint: 'Click Refresh button or enter phone number to trigger pairing code generation'
                });
            }

            res.json({
                success: true,
                pairingCode: pairingInfo.pairingCode,
                expectedPhone: pairingInfo.expectedPhone,
                timestamp: new Date(),
                hint: 'Enter this code in WhatsApp → Settings → Linked Devices → Link a Device'
            });
        } catch (error) {
            console.error('[WhatsApp Pairing] Error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // QR Code: Get current QR as data URL (NO AUTH - for setup page)
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
                return res.status(404).json({
                    error: 'No QR code available - session may already be authenticated',
                    qr: null,
                    hint: 'Try: 1) Refresh page, 2) Delete data/wa-auth folder and restart server, 3) Check "Check Status" button to see connection state'
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
                        message: 'WhatsApp service reconnected - QR should appear shortly'
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
                queue: waQueue ? waQueue.getStats() : null,
                pairing: {
                    expectedPhone: pairingInfo.expectedPhone,
                    connectedPhone: pairingInfo.connectedPhone,
                    verified: pairingInfo.verified,
                    status: pairingInfo.verified === null ? 'pending' : (pairingInfo.verified ? 'verified' : 'mismatch')
                }
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
