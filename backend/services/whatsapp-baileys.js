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

        // Diagnostik koneksi (ditampilkan di dashboard Bot WA)
        this.connectionState = 'idle';   // idle | connecting | open | closed
        this.lastError = null;           // { statusCode, message, at }
        this.lastDisconnectAt = null;
        this.lastQrAt = null;
        this.connectAttempts = 0;
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
                    this.lastQrAt = Date.now();
                    this.lastError = null;
                    this.connectAttempts = 0;
                    console.log('[WhatsApp] ⏳ QR Code generated - Scan with your phone to authenticate');
                }

                if (connection === 'connecting') {
                    console.log('[WhatsApp] 🔄 Connecting...');
                    this.isConnected = false;
                    this.connectionState = 'connecting';
                }

                if (connection === 'open') {
                    console.log('[WhatsApp] ✅ Connected to WhatsApp');
                    this.isConnected = true;
                    this.lastQR = null;
                    this.lastError = null;
                    this.connectionState = 'open';
                    this.connectAttempts = 0;
                    
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
                    // Simpan alasan disconnect supaya bisa ditampilkan di dashboard
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const disconnectError = lastDisconnect?.error;
                    this.lastDisconnectAt = Date.now();
                    this.connectionState = 'closed';
                    this.lastError = {
                        statusCode: statusCode || null,
                        message: disconnectError?.message || 'Koneksi ke WhatsApp terputus',
                        output: disconnectError?.output?.payload || null,
                        at: this.lastDisconnectAt
                    };

                    if (statusCode !== DisconnectReason.loggedOut) {
                        // Backoff progressively: jangan bombardir WhatsApp kalau
                        // IP server diblokir (bisa memperburuk reputasi IP).
                        this.connectAttempts = (this.connectAttempts || 0) + 1;
                        const backoff = Math.min(5000 * Math.pow(2, this.connectAttempts - 1), 300000);
                        console.error(`[WhatsApp] ⚠️ Disconnected (${statusCode || 'no-code'}): ${this.lastError.message} - reconnect in ${Math.round(backoff / 1000)}s`);
                        this.isConnected = false;
                        setTimeout(() => this.initialize(), backoff);
                    } else {
                        console.log('[WhatsApp] 🚪 Logged out (perlu scan QR ulang)');
                        this.isConnected = false;
                        this.lastQR = null;
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
            ready: this.isReady(),
            connectionState: this.connectionState,
            qrAvailable: !!this.lastQR,
            lastError: this.lastError,
            lastDisconnectAt: this.lastDisconnectAt,
            lastQrAt: this.lastQrAt,
            connectAttempts: this.connectAttempts
        };
    }

    /**
     * Diagnostik lengkap (untuk tombol "Diagnosa" di dashboard).
     * Mencheckmark: apakah file sesi ada, apakah QR pernah dibuat, dan
     * alasan disconnect terakhir.
     */
    getDiagnostics() {
        let sessionFiles = [];
        let sessionExists = false;
        try {
            if (fs.existsSync(this.sessionPath)) {
                sessionExists = true;
                sessionFiles = fs.readdirSync(this.sessionPath).filter(f => f.endsWith('.json'));
            }
        } catch (e) { /* abaikan */ }

        const { buildDiagnostics } = require('./wa-diagnostics');

        return buildDiagnostics({
            connected: this.isConnected,
            ready: this.isReady(),
            connectionState: this.connectionState,
            qrAvailable: !!this.lastQR,
            lastError: this.lastError,
            lastDisconnectAt: this.lastDisconnectAt,
            lastQrAt: this.lastQrAt,
            connectAttempts: this.connectAttempts,
            phone: this.connectedPhoneNumber
        }, {
            sessionPath: this.sessionPath,
            sessionExists,
            sessionFileCount: sessionFiles.length
        });
    }

    /**
     * Hapus kredensial sesi (logout total) supaya pairing baru bisa dibuat.
     * Dipakai saat sesi rusak / ingin scan QR baru dari nol.
     */
    async resetSession() {
        const result = { removedFiles: 0, sessionPath: this.sessionPath };
        try {
            if (this.socket) {
                try { await this.socket.logout(); } catch (e) { /* abaikan */ }
                try { this.socket.ev.removeAllListeners?.('connection.update'); } catch (e) { /* abaikan */ }
                this.socket = null;
            }
            this.isConnected = false;
            this.lastQR = null;
            this.connectedPhoneNumber = null;
            this.connectionState = 'idle';
            this.connectAttempts = 0;

            if (fs.existsSync(this.sessionPath)) {
                for (const file of fs.readdirSync(this.sessionPath)) {
                    if (!file.endsWith('.json')) continue;
                    fs.unlinkSync(path.join(this.sessionPath, file));
                    result.removedFiles++;
                }
            }
            console.log(`[WhatsApp] Sesi direset (${result.removedFiles} file kredensial dihapus)`);
        } catch (e) {
            console.error('[WhatsApp] Gagal reset sesi:', e.message);
            throw e;
        }
        return result;
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
