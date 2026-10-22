/**
 * WhatsApp Baileys Service
 * Manages connection to WhatsApp Web via Baileys
 * - Connection management
 * - Session persistence
 * - Auto-reconnect
 */

const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const P = require('pino');

// Optional: QR code terminal display
let qrcode = null;
try {
    qrcode = require('qrcode-terminal');
} catch (e) {
    console.warn('[WhatsApp] qrcode-terminal not installed - QR will be logged as text only');
}

class WhatsAppService {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.lastQR = null;
        this.lastPairingCode = null; // Add pairing code
        this.qrHistory = []; // Store QR history
        this.sessionPath = path.join(__dirname, '../../data/wa-auth');
        this.logger = P({ level: 'silent' }); // Silent logger by default
        
        // Phone number validation for pairing
        this.expectedPhoneNumber = null; // Phone user wants to pair
        this.connectedPhoneNumber = null; // Actual connected phone
        this.pairingAttempts = 0;

        // Guard anti-ban (bisa diubah dari dashboard pengaturan)
        this.antiBan = {
            typing_enabled: true,
            typing_min_ms: 800,
            typing_max_ms: 2500
        };
    }

    async initialize() {
        try {
            // Ensure auth directory exists
            if (!fs.existsSync(this.sessionPath)) {
                fs.mkdirSync(this.sessionPath, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

            this.socket = makeWASocket({
                auth: state,
                syncFullHistory: false,
                logger: this.logger,
                defaultQueryTimeoutMs: 30000,
                shouldSyncHistoryMessage: () => false,
                markOnlineOnConnect: true,
                browser: ['Linux', 'Chrome', '121.0.6167.160'],
                generateHighQualityLinkPreview: true
            });

            // Handle connection updates - Generate QR or Pairing Code
            this.socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.lastQR = qr;
                    console.log('[WhatsApp] ⏳ QR Code generated - Scan with your phone to authenticate');
                }

                if (connection === 'connecting') {
                    console.log('[WhatsApp] 🔄 Connecting...');
                    this.isConnected = false;
                }

                if (connection === 'open') {
                    console.log('[WhatsApp] ✅ Connected to WhatsApp');
                    this.isConnected = true;
                    this.lastQR = null;
                    
                    // Get the connected phone number from socket
                    try {
                        const phoneNumber = this.socket.user?.id?.split(':')[0];
                        if (phoneNumber) {
                            this.connectedPhoneNumber = phoneNumber;
                            console.log(`[WhatsApp] ✅ Authenticated with phone: ${phoneNumber}`);
                            console.log(`[WhatsApp] ✅ Session saved to data/wa-auth/`);
                            console.log('[WhatsApp] You can restart the app - session will persist automatically');
                        }
                    } catch (err) {
                        console.warn('[WhatsApp] Could not extract phone number:', err.message);
                    }
                }

                if (connection === 'close') {
                    if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                        console.log('[WhatsApp] ⚠️ Disconnected - reconnecting in 5s...');
                        this.isConnected = false;
                        setTimeout(() => this.initialize(), 5000);
                    } else {
                        console.log('[WhatsApp] 🚪 Logged out');
                        this.isConnected = false;
                    }
                }
            });

            // Save credentials on update
            this.socket.ev.on('creds.update', saveCreds);

            console.log('[WhatsApp] ✅ Service initialized - ready to authenticate');
        } catch (error) {
            console.error('[WhatsApp] Initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Set konfigurasi anti-ban (dipakai dashboard pengaturan).
     * @param {object} cfg - { typing_enabled, typing_min_ms, typing_max_ms }
     */
    setAntiBanConfig(cfg = {}) {
        this.antiBan = {
            typing_enabled: cfg.typing_enabled !== false,
            typing_min_ms: Number(cfg.typing_min_ms) || 800,
            typing_max_ms: Number(cfg.typing_max_ms) || 2500
        };
        console.log('[WhatsApp] Anti-ban config updated:', JSON.stringify(this.antiBan));
    }

    /**
     * Simulasi mengetik (presence 'composing') sebelum pesan dikirim.
     * Durasi dibuat proporsional dengan panjang pesan supaya terlihat natural
     * (pesan panjang = lebih lama "mengetik").
     */
    async simulateTyping(recipient, message, options = {}) {
        const cfg = { ...(this.antiBan || {}), ...(options || {}) };
        if (cfg.typing_enabled === false) return 0;

        const minMs = Number(cfg.typing_min_ms) || 800;
        const maxMs = Number(cfg.typing_max_ms) || 2500;
        // 1 karakter ~ 25ms mengetik, dibatasi min..max
        const byLength = Math.min(maxMs, Math.max(minMs, (message || '').length * 25));
        const typingTime = Math.random() * (byLength - minMs) + minMs;

        try {
            await this.socket.presenceSubscribe(recipient);
            await this.socket.sendPresenceUpdate('composing', recipient);
            await new Promise(resolve => setTimeout(resolve, typingTime));
            await this.socket.sendPresenceUpdate('paused', recipient);
        } catch (e) {
            // Simulasi typing gagal tidak boleh menggagalkan pengiriman
            console.warn('[WhatsApp] Gagal simulasi typing:', e.message);
            return 0;
        }
        return typingTime;
    }

    async sendMessage(to, message, options = {}) {
        if (!this.socket || !this.isConnected) {
            throw new Error('WhatsApp not connected');
        }

        try {
            // Ensure recipient has proper format (628xxxx@s.whatsapp.net for individuals)
            const recipient = to.includes('@') ? to : `${to}@s.whatsapp.net`;

            // Simulasi mengetik (durasi acak + proporsional panjang pesan)
            await this.simulateTyping(recipient, message, options.typing);

            // Send message
            const messageOptions = {
                text: message,
                ...options
            };

            const response = await this.socket.sendMessage(recipient, messageOptions);

            console.log(`[WhatsApp] Message sent to ${to}: ${message.substring(0, 50)}...`);
            return response;
        } catch (error) {
            console.error(`[WhatsApp] Failed to send message to ${to}:`, error.message);
            throw error;
        }
    }

    async sendGroupMessage(groupId, message, options = {}) {
        if (!this.socket || !this.isConnected) {
            throw new Error('WhatsApp not connected');
        }

        try {
            // Ensure group ID has proper format
            const recipient = groupId.includes('@') ? groupId : `${groupId}@g.us`;

            // Simulasi mengetik (durasi acak + proporsional panjang pesan)
            await this.simulateTyping(recipient, message, options.typing);

            // Send message
            const messageOptions = {
                text: message,
                ...options
            };

            const response = await this.socket.sendMessage(recipient, messageOptions);

            console.log(`[WhatsApp] Group message sent to ${groupId}: ${message.substring(0, 50)}...`);
            return response;
        } catch (error) {
            console.error(`[WhatsApp] Failed to send group message to ${groupId}:`, error.message);
            throw error;
        }
    }

    isReady() {
        return this.socket && this.isConnected;
    }

    getStatus() {
        return {
            connected: this.isConnected,
            ready: this.isReady()
        };
    }

    getLastQR() {
        return this.lastQR;
    }

    /**
     * Get pairing info
     */
    getPairingInfo() {
        return {
            connected: this.isConnected,
            connectedPhone: this.connectedPhoneNumber
        };
    }

    async disconnect() {
        if (this.socket) {
            try {
                await this.socket.logout();
                this.isConnected = false;
                this.connectedPhoneNumber = null;
                this.expectedPhoneNumber = null;
                console.log('[WhatsApp] Disconnected');
            } catch (error) {
                console.error('[WhatsApp] Disconnect error:', error.message);
            }
        }
    }
}

// Singleton instance
let waService = null;

async function getWhatsAppService() {
    if (!waService) {
        waService = new WhatsAppService();
        await waService.initialize();
    }
    return waService;
}

module.exports = {
    getWhatsAppService,
    WhatsAppService
};
