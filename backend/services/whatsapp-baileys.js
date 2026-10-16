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
                
                console.log('[WhatsApp] connection.update received:', { connection, qr: qr ? 'QR_PRESENT' : 'NO_QR' });

                if (qr) {
                    this.lastQR = qr;
                    console.log('[WhatsApp] ⏳ QR Code generated (stored for API)');
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
                            console.log(`[WhatsApp] Connected phone: ${phoneNumber}`);
                            
                            // Verify if matches expected phone
                            if (this.expectedPhoneNumber) {
                                const matches = this.verifyPhoneMatch(phoneNumber);
                                if (matches) {
                                    console.log(`[WhatsApp] ✅ Phone number verified: ${phoneNumber}`);
                                } else {
                                    console.log(`[WhatsApp] ⚠️ Phone mismatch! Expected: ${this.expectedPhoneNumber}, Got: ${phoneNumber}`);
                                }
                            }
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

            // Handle Pairing Code (alternative to QR)
            this.socket.ev.on('pair-code', async (pairingCode) => {
                console.log('[WhatsApp] 📱 Pairing Code Received: ' + pairingCode);
                this.lastPairingCode = pairingCode;
                console.log('[WhatsApp] ======================================');
                console.log('[WhatsApp] Pairing Code for phone: ' + (this.expectedPhoneNumber || 'N/A'));
                console.log('[WhatsApp] Code: ' + pairingCode);
                console.log('[WhatsApp] Valid for 60 seconds');
                console.log('[WhatsApp] ======================================');
            });

            // Listen to ALL socket events for debugging
            this.socket.ev.on('*', (event, data) => {
                if (event !== 'creds.update' && !event.includes('presence.update') && event !== 'connection.update') {
                    console.log(`[WhatsApp EVENT] ${event}`);
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

    /**
     * Normalize phone number to standard format (no country code prefix)
     */
    normalizePhoneNumber(phone) {
        if (!phone) return null;
        // Remove any non-digits
        let normalized = phone.replace(/\D/g, '');
        // If starts with 62, remove it (Indonesian code)
        if (normalized.startsWith('62')) {
            normalized = normalized.substring(2);
        }
        // If starts with 0, remove it
        if (normalized.startsWith('0')) {
            normalized = normalized.substring(1);
        }
        return normalized;
    }

    /**
     * Set expected phone number for pairing verification
     */
    setExpectedPhoneNumber(phone) {
        this.expectedPhoneNumber = this.normalizePhoneNumber(phone);
        console.log(`[WhatsApp] Expected phone set: ${this.expectedPhoneNumber}`);
    }

    /**
     * Verify if connected phone matches expected phone
     */
    verifyPhoneMatch(connectedPhone) {
        if (!this.expectedPhoneNumber) {
            return true; // No validation if not set
        }
        
        const normalized = this.normalizePhoneNumber(connectedPhone);
        const matches = normalized === this.expectedPhoneNumber;
        
        console.log(`[WhatsApp] Phone verification: expected=${this.expectedPhoneNumber}, got=${normalized}, matches=${matches}`);
        return matches;
    }

    /**
     * Get pairing info
     */
    getPairingInfo() {
        return {
            pairingCode: this.lastPairingCode,
            expectedPhone: this.expectedPhoneNumber,
            connectedPhone: this.connectedPhoneNumber,
            isConnected: this.isConnected,
            verified: this.expectedPhoneNumber ? this.verifyPhoneMatch(this.connectedPhoneNumber) : null
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
