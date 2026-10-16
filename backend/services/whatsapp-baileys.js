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
        this.qrHistory = []; // Store QR history
        this.sessionPath = path.join(__dirname, '../../data/wa-auth');
        this.logger = P({ level: 'silent' }); // Silent logger by default
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
                browser: ['Linux', 'Chrome', '121.0.6167.160']
            });

            // Handle connection updates - Generate QR from event
            this.socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.lastQR = qr;
                    this.qrHistory.push({
                        qr: qr,
                        timestamp: new Date(),
                        status: 'pending'
                    });
                    
                    console.log('[WhatsApp] ⏳ QR Code generated - Please scan below:');
                    console.log('');
                    
                    if (qrcode) {
                        // If qrcode-terminal installed, display as ASCII art
                        qrcode.generate(qr, { small: true });
                    } else {
                        // Fallback: show as text
                        console.log('QR String: ' + qr);
                        console.log('');
                        console.log('(Install qrcode-terminal to see ASCII art QR code)');
                        console.log('npm install qrcode-terminal');
                    }
                    
                    console.log('');
                    console.log('[WhatsApp] Scan QR code with WhatsApp on your phone');
                }

                if (connection === 'connecting') {
                    console.log('[WhatsApp] 🔄 Connecting...');
                    this.isConnected = false;
                }

                if (connection === 'open') {
                    console.log('[WhatsApp] ✅ Connected to WhatsApp');
                    this.isConnected = true;
                    
                    // Mark current QR as successful
                    if (this.qrHistory.length > 0) {
                        this.qrHistory[this.qrHistory.length - 1].status = 'success';
                    }
                    
                    // Clear QR after successful connection
                    this.lastQR = null;
                }

                if (connection === 'close') {
                    // Reconnect if not intentional disconnect
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

            console.log('[WhatsApp] ✅ Service initialized');
        } catch (error) {
            console.error('[WhatsApp] Initialization failed:', error.message);
            throw error;
        }
    }

    async sendMessage(to, message, options = {}) {
        if (!this.socket || !this.isConnected) {
            throw new Error('WhatsApp not connected');
        }

        try {
            // Ensure recipient has proper format (628xxxx@s.whatsapp.net for individuals)
            const recipient = to.includes('@') ? to : `${to}@s.whatsapp.net`;

            // Typing simulation
            await this.socket.presenceSubscribe(recipient);
            await this.socket.sendPresenceUpdate('composing', recipient);
            
            // Random typing time (1-3 seconds)
            const typingTime = Math.random() * 2000 + 1000;
            await new Promise(resolve => setTimeout(resolve, typingTime));

            // Send message
            const messageOptions = {
                text: message,
                ...options
            };

            const response = await this.socket.sendMessage(recipient, messageOptions);

            // Stop typing
            await this.socket.sendPresenceUpdate('paused', recipient);

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

            // Typing simulation
            await this.socket.presenceSubscribe(recipient);
            await this.socket.sendPresenceUpdate('composing', recipient);
            
            // Random typing time (1-3 seconds)
            const typingTime = Math.random() * 2000 + 1000;
            await new Promise(resolve => setTimeout(resolve, typingTime));

            // Send message
            const messageOptions = {
                text: message,
                ...options
            };

            const response = await this.socket.sendMessage(recipient, messageOptions);

            // Stop typing
            await this.socket.sendPresenceUpdate('paused', recipient);

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

    async disconnect() {
        if (this.socket) {
            try {
                await this.socket.logout();
                this.isConnected = false;
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
