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
    constructor(options = {}) {
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
        this.sessionResetAt = null;    // kapan sesi terakhir di-reset (untuk diagnosa)
        this.enabled = options.enabled !== false; // switch koneksi bot dari dashboard
        this.lastActivityAt = Date.now();
        this.heartbeatTimer = null;
        this.supervisorTimer = null;
        this.ownsLock = false;
        this.lockPath = null;
        this.lockTimer = null;

        // Lepas lock saat proses keluar (agar instance lain bisa mengambil alih)
        process.on('exit', () => this.releaseBotLock());
    }

    /**
     * Heartbeat: kirim presence 'available' secara berkala.
     * Fungsinya:
     *  1. Menjaga koneksi WebSocket tetap hidup (idle bot tetap terkoneksi)
     *  2. Deteksi koneksi yang "membeku" (socket ada tapi tidak respons)
     *     -> memicu reconnect otomatis
     * CATATAN: presence BUKAN pesan -> tidak pernah muncul di grup.
     */
    startHeartbeat(intervalMs = 4 * 60 * 1000) {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(async () => {
            if (this.enabled === false) return;
            try {
                if (!this.socket) throw new Error('socket tidak ada');
                await this.socket.sendPresenceUpdate('available');
                this.lastActivityAt = Date.now();
            } catch (e) {
                console.warn('[WhatsApp] Heartbeat gagal, paksa reconnect:', e.message);
                this.forceReconnect('heartbeat gagal');
            }
        }, intervalMs);
        if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
        console.log(`[WhatsApp] ❤️ Heartbeat aktif (setiap ${Math.round(intervalMs / 60000)} menit)`);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Supervisor: pastikan bot selalu tersambung 24 jam.
     * Kalau service gagal di awal boot (jaringan belum siap) atau socket
     * mati tanpa event 'close', supervisor akan menyambung ulang.
     */
    startSupervisor(intervalMs = 30 * 1000) {
        if (this.supervisorTimer) return;
        this.supervisorTimer = setInterval(() => {
            if (this.enabled === false) return;
            // Instance lain yang memegang koneksi bot -> jangan berebut
            if (this.connectionState === 'standby') return;
            const now = Date.now();
            const silence = now - (this.lastActivityAt || now);
            // Bot tidak pernah "ready" -> coba sambungkan lagi
            if (!this.isConnected && !this.socket && silence > 60000) {
                console.log('[WhatsApp] 🩺 Supervisor: bot belum tersambung, mencoba initialize() ulang');
                this.initialize().catch(e => console.error('[WhatsApp] Supervisor gagal:', e.message));
                return;
            }
            // Socket "membeku" (>10 menit tanpa aktivitas) while connected
            if (this.isConnected && silence > 10 * 60 * 1000) {
                console.warn('[WhatsApp] 🩺 Supervisor: socket tidak ada aktivitas > 10 menit, paksa reconnect');
                this.forceReconnect('socket tidak respons');
            }
        }, intervalMs);
        if (this.supervisorTimer.unref) this.supervisorTimer.unref();
        console.log(`[WhatsApp] 🩺 Supervisor aktif (cek tiap ${Math.round(intervalMs / 1000)} detik)`);
    }

    /**
     * Paksa reconnect (dipakai heartbeat & supervisor).
     */
    forceReconnect(reason = 'manual') {
        console.log(`[WhatsApp] ♻️ Force reconnect: ${reason}`);
        try {
            if (this.socket) {
                this.socket.ev.removeAllListeners?.('connection.update');
                this.socket.end?.(undefined);
            }
        } catch (e) { /* abaikan */ }
        this.socket = null;
        this.isConnected = false;
        this.connectionState = 'connecting';
        this.lastActivityAt = Date.now();
        setTimeout(() => {
            this.initialize().catch(e => console.error('[WhatsApp] Gagal reconnect:', e.message));
        }, 3000);
    }

    async initialize() {
        // Bot dimatikan lewat switch dashboard -> jangan sambungkan.
        if (this.enabled === false) {
            this.connectionState = 'disabled';
            console.log('[WhatsApp] ⏸ Bot dimatikan (switch dashboard) - tidak melakukan koneksi');
            return;
        }
        // Hanya SATU proses yang boleh menyambung bot (aman untuk mode cluster)
        if (!this.acquireBotLock()) {
            this.connectionState = 'standby';
            return;
        }
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
                this.lastActivityAt = Date.now();

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
                        // Bot dimatikan lewat switch -> jangan reconnect
                        if (this.enabled === false) {
                            console.log('[WhatsApp] ⏸ Bot dimatikan - tidak melakukan reconnect');
                            this.isConnected = false;
                            this.connectionState = 'disabled';
                            return;
                        }
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

            // Aktifkan heartbeat & supervisor (agar bot jalan 24 jam)
            this.lastActivityAt = Date.now();
            this.startHeartbeat();
            this.startSupervisor();

            console.log('[WhatsApp] ✅ Service initialized - ready to authenticate');
        } catch (error) {
            console.error('[WhatsApp] Initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Nyalakan / matikan koneksi bot (switch "Koneksi Bot" di dashboard).
     * - OFF: socket diputus (TANPA logout, sesi tetap tersimpan) dan tidak
     *   melakukan reconnect. Bot jadi 100% tidak menyentuh WhatsApp.
     * - ON : sambung lagi (pakai sesi yang sudah ada, atau QR baru kalau
     *   sesi belum pernah dibuat).
     * @param {boolean} enabled
     */
    async setEnabled(enabled) {
        const wantEnabled = !!enabled;
        if (wantEnabled === this.enabled) {
            return { enabled: this.enabled, changed: false };
        }
        this.enabled = wantEnabled;

        if (!wantEnabled) {
            console.log('[WhatsApp] ⏸ Koneksi bot dimatikan (switch dashboard)');
            this.stopHeartbeat();
            try {
                if (this.socket) {
                    this.socket.ev.removeAllListeners?.('connection.update');
                    this.socket.end?.(undefined);
                }
            } catch (e) {
                console.warn('[WhatsApp] Gagal memutus socket:', e.message);
            }
            this.socket = null;
            this.isConnected = false;
            this.connectionState = 'disabled';
            this.lastQR = null;
            return { enabled: false, changed: true };
        }

        console.log('[WhatsApp] ▶️ Koneksi bot dinyalakan (switch dashboard)');
        this.connectionState = 'connecting';
        try {
            await this.initialize();
        } catch (e) {
            console.error('[WhatsApp] Gagal menyambungkan bot:', e.message);
        }
        return { enabled: true, changed: true };
    }

    isEnabled() {
        return this.enabled !== false;
    }

    /**
     * Ambil lock file agar HANYA SATU proses yang menyambung bot.
     * Penting untuk mode cluster (pm2 instances max): kalau semua instance
     * menyambung dengan file sesi yang sama, sesi bisa rusak & WhatsApp
     * melakukan "logout" (401) sehingga bot mati.
     * @returns {boolean} true kalau proses ini pemilik koneksi bot
     */
    acquireBotLock() {
        if (this.ownsLock) return true;
        const lockPath = path.join(this.sessionPath, '.bot-lock');
        const now = Date.now();
        const STALE_MS = 90 * 1000;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const fd = fs.openSync(lockPath, 'wx');
                fs.writeSync(fd, JSON.stringify({ pid: process.pid, ts: now }));
                fs.closeSync(fd);
                this.ownsLock = true;
                this.lockPath = lockPath;
                this.startLockHeartbeat();
                console.log(`[WhatsApp] 🔒 Lock koneksi bot diambil (pid ${process.pid})`);
                return true;
            } catch (e) {
                // Lock sudah ada -> cek apakah basi (pemilik proses mati)
                let stale = true;
                try {
                    const info = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
                    stale = (now - (info.ts || 0)) > STALE_MS;
                    if (!stale) {
                        console.log(`[WhatsApp] ℹ️ Instance lain (pid ${info.pid}) sudah memegang koneksi bot - instance ini tidak menyambung`);
                    }
                } catch (err) { /* lock rusak -> dianggap basi */ }

                if (!stale) return false;
                // Ambil alih lock basi
                try { fs.unlinkSync(lockPath); } catch (err) { /* abaikan */ }
            }
        }
        return false;
    }

    /**
     * Perbarui timestamp lock supaya instance lain tahu ini masih hidup.
     */
    startLockHeartbeat(intervalMs = 30 * 1000) {
        this.stopLockHeartbeat();
        this.lockTimer = setInterval(() => {
            if (!this.ownsLock || !this.lockPath) return;
            try {
                fs.writeFileSync(this.lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }));
            } catch (e) { /* abaikan */ }
        }, intervalMs);
        if (this.lockTimer.unref) this.lockTimer.unref();
    }

    stopLockHeartbeat() {
        if (this.lockTimer) {
            clearInterval(this.lockTimer);
            this.lockTimer = null;
        }
    }

    /**
     * Lepas lock (saat proses keluar).
     */
    releaseBotLock() {
        if (!this.ownsLock || !this.lockPath) return;
        try {
            const info = JSON.parse(fs.readFileSync(this.lockPath, 'utf8'));
            if (info && info.pid === process.pid) fs.unlinkSync(this.lockPath);
        } catch (e) { /* abaikan */ }
        this.ownsLock = false;
    }

    /**
     * Apakah proses ini pemilik koneksi bot?
     */
    isLockOwner() {
        return !!this.ownsLock;
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
            sessionResetAt: this.sessionResetAt,
            phone: this.connectedPhoneNumber,
            lockOwner: this.isLockOwner()
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
            this.sessionResetAt = Date.now();

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

async function getWhatsAppService(options = {}) {
    if (!waService) {
        waService = new WhatsAppService(options);
        await waService.initialize();
    } else if (options.enabled !== undefined && options.enabled !== waService.isEnabled()) {
        // Service sudah ada (mis. saat ini dimatikan) -> terapkan status baru
        await waService.setEnabled(options.enabled);
    }
    return waService;
}

module.exports = {
    getWhatsAppService,
    WhatsAppService
};
