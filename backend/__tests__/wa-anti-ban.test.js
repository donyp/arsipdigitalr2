/**
 * ============================================================
 * Unit Test: Guard Anti-ban + Auto Dispatch Notifikasi WhatsApp
 * ============================================================
 * Fokus:
 * - Batas kirim per jam / per hari per grup benar-benar bekerja
 * - Konfigurasi anti-ban dari dashboard diterapkan ke antrean
 * - Auto dispatch hanya jalan kalau semua syarat terpenuhi
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const WAMessageQueue = require('../services/wa-message-queue');
const { dispatchInvoiceToZonaGroups } = require('../wa-auto-dispatch');

function fakeService() {
    return {
        isReady: () => true,
        sendGroupMessage: async () => ({ ok: true }),
        sendMessage: async () => ({ ok: true }),
        setAntiBanConfig: () => {}
    };
}

describe('WA Message Queue - guard anti-ban', () => {
    let queue;

    beforeEach(() => {
        queue = new WAMessageQueue(fakeService());
    });

    afterEach(() => {
        if (queue.processorInterval) clearInterval(queue.processorInterval);
    });

    test('default: batas per jam & per hari aktif', () => {
        expect(queue.antiBan.max_per_hour).toBeGreaterThan(0);
        expect(queue.antiBan.max_per_day).toBeGreaterThan(0);
        expect(queue.antiBan.typing_enabled).toBe(true);
    });

    test('setAntiBanConfig menerapkan nilai dari dashboard', () => {
        queue.setAntiBanConfig({
            enabled: true,
            max_per_hour: 7,
            max_per_day: 30,
            min_interval_ms: 3000,
            max_interval_ms: 9000,
            batch_size: 3,
            batch_pause_ms: 45000,
            typing_simulation: true,
            typing_min_ms: 500,
            typing_max_ms: 1500
        });
        expect(queue.antiBan.max_per_hour).toBe(7);
        expect(queue.antiBan.max_per_day).toBe(30);
        expect(queue.config.minDelay).toBe(3000);
        expect(queue.config.maxDelay).toBe(9000);
        expect(queue.config.batchSize).toBe(3);
        expect(queue.config.batchDelay).toBe(45000);
    });

    test('pesan di bawah batas jam masih boleh dikirim', () => {
        queue.setAntiBanConfig({ max_per_hour: 2, max_per_day: 10 });
        queue.sentLog.push({ to: 'grup-a', at: Date.now() });
        expect(queue.checkRateLimit('grup-a').ok).toBe(true);
    });

    test('batas per jam dihormati (per grup terpisah)', () => {
        queue.setAntiBanConfig({ max_per_hour: 2, max_per_day: 100 });
        queue.sentLog.push({ to: 'grup-a', at: Date.now() });
        queue.sentLog.push({ to: 'grup-a', at: Date.now() });
        const res = queue.checkRateLimit('grup-a');
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/jam/);
        // grup lain tidak terpengaruh
        expect(queue.checkRateLimit('grup-b').ok).toBe(true);
    });

    test('batas per hari dihormati', () => {
        queue.setAntiBanConfig({ max_per_hour: 100, max_per_day: 3 });
        for (let i = 0; i < 3; i++) queue.sentLog.push({ to: 'grup-a', at: Date.now() });
        const res = queue.checkRateLimit('grup-a');
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/hari/);
    });

    test('guard bisa dimatikan', () => {
        queue.setAntiBanConfig({ enabled: false, max_per_hour: 1 });
        queue.sentLog.push({ to: 'grup-a', at: Date.now() });
        queue.sentLog.push({ to: 'grup-a', at: Date.now() });
        expect(queue.checkRateLimit('grup-a').ok).toBe(true);
    });

    test('riwayat pesan dicatat agar status bisa dicek setelah keluar dari antrean', () => {
        queue.recordHistory('msg-1', 'success', 0, null, new Date());
        const status = queue.getMessageStatus('msg-1');
        expect(status).not.toBeNull();
        expect(status.status).toBe('success');
    });
});

describe('GUARD: bot hanya boleh mengirim pesan notifikasi', () => {
    const { isValidNotificationMessage } = require('../wa-auto-dispatch');

    test('pesan notifikasi format UPDATE INVOICE ZONA diterima', () => {
        const msg = '*UPDATE INVOICE ZONA 7*\n\n- [PPN] MEGA BAJA - Rp 1.000.000\n\n_@adminanka_';
        expect(isValidNotificationMessage(msg)).toBe(true);
    });

    test('pesan kosong / bukan string ditolak', () => {
        expect(isValidNotificationMessage('')).toBe(false);
        expect(isValidNotificationMessage('   ')).toBe(false);
        expect(isValidNotificationMessage(null)).toBe(false);
        expect(isValidNotificationMessage(undefined)).toBe(false);
        expect(isValidNotificationMessage(12345)).toBe(false);
    });

    test('pesan log/error TIDAK boleh keluar ke grup', () => {
        const junk = [
            'Error: Cannot read properties of undefined',
            '[WAQueue] Message failed (dropped)',
            'Gagal kirim pesan',
            'stack trace: at Object.<anonymous>',
            'DEBUG: socket closed'
        ];
        junk.forEach(m => expect(isValidNotificationMessage(m)).toBe(false));
    });

    test('pesan terlalu panjang ditolak (batas WhatsApp)', () => {
        const panjang = '*UPDATE INVOICE ZONA 7*\n' + 'x'.repeat(5000);
        expect(isValidNotificationMessage(panjang)).toBe(false);
    });

    test('source: auto dispatch memakai guard sebelum enqueue', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'wa-auto-dispatch.js'), 'utf8');
        expect(src).toContain('isValidNotificationMessage');
        expect(src).toMatch(/if \(!isValidNotificationMessage\(message\)\)/);
    });

    test('source: endpoint lama "trigger-invoice-upload" dimatikan (410)', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'whatsapp-zona-endpoints.js'), 'utf8');
        expect(src).toContain('/api/whatsapp/trigger-invoice-upload');
        expect(src).toMatch(/trigger-invoice-upload[\s\S]{0,400}status\(410\)/);
        // pesan "Invoice Baru" yang dulu dikirim ke grup harus hilang
        expect(src).not.toContain('*Invoice Baru*');
    });

    test('source: broadcast ke grup ditolak', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'whatsapp-endpoints.js'), 'utf8');
        expect(src).toMatch(/broadcast[\s\S]{0,1200}Broadcast ke grup tidak diizinkan/);
    });
});

describe('Ketahanan 24 jam', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'whatsapp-baileys.js'), 'utf8');

    test('ada heartbeat (presence, bukan pesan) + supervisor reconnect', () => {
        expect(src).toContain('startHeartbeat');
        expect(src).toContain("sendPresenceUpdate('available')");
        expect(src).toContain('startSupervisor');
        expect(src).toContain('forceReconnect');
    });

    test('file-lock: hanya 1 proses yang menyambung bot (aman utk mode cluster)', () => {
        expect(src).toContain('acquireBotLock');
        expect(src).toContain('.bot-lock');
        expect(src).toContain('isLockOwner');
    });

    test('source: pm2 punya restart policy untuk 24 jam', () => {
        const pm2 = fs.readFileSync(path.join(__dirname, '..', '..', 'ecosystem.config.js'), 'utf8');
        expect(pm2).toContain('restart_delay');
        expect(pm2).toContain('exp_backoff');
        expect(pm2).toContain('max_restarts: 50');
    });

    test('source: dashboard punya countdown realtime (tick 1 detik)', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', '..', 'whatsapp-bot-dashboard.html'), 'utf8');
        expect(html).toContain('renderPendingCountdown');
        expect(html).toMatch(/setInterval\([\s\S]{0,200}renderPendingCountdown[\s\S]{0,40}, 1000\)/);
    });
});

describe('Diagnostik Koneksi Bot WhatsApp', () => {    const { getDisconnectHint, buildDiagnostics } = require('../services/wa-diagnostics');

    test('diagnostics memuat alasan disconnect + status', () => {
        const d = buildDiagnostics({
            connected: false,
            connectionState: 'closed',
            lastError: { statusCode: 401, message: 'unauthorized' }
        }, { sessionPath: '/tmp/wa-auth', sessionFileCount: 0 });
        expect(d.connectionState).toBe('closed');
        expect(d.lastError.statusCode).toBe(401);
        expect(d.hint).toMatch(/IP server diblokir|ditolak/i);
        expect(d.hasCreds).toBe(false);
    });

    test('401 / 403 / 405 / 428 / 515 punya saran yang berbeda & jelas', () => {
        const hints = [401, 403, 405, 428, 515].map(code => getDisconnectHint(code, 'x'));
        hints.forEach(h => expect(typeof h).toBe('string'));
        expect(new Set(hints).size).toBe(5);
    });

    test('error tanpa kode -> saran jaringan', () => {
        expect(getDisconnectHint(null, 'socket hang up')).toMatch(/jaringan|firewall|DNS/i);
    });

    test('tanpa error & tanpa QR -> saran "belum siap"', () => {
        const d = buildDiagnostics({ connected: false, qrAvailable: false }, { sessionFileCount: 0 });
        expect(d.hint).toMatch(/belum siap/i);
    });

    test('ada kredensial tapi tidak connect -> saran reset sesi', () => {
        const d = buildDiagnostics({ connected: false, qrAvailable: false }, { sessionFileCount: 3 });
        expect(d.hint).toMatch(/Reset Sesi Bot/i);
        expect(d.hasCreds).toBe(true);
    });

    test('terhubung -> tidak ada hint', () => {
        const d = buildDiagnostics({ connected: true, ready: true, qrAvailable: false }, { sessionFileCount: 2 });
        expect(d.hint).toBeNull();
    });

    test('401 + sesi SUDAH di-reset recently -> hint blames IP server', () => {
        const d = buildDiagnostics({
            connected: false,
            lastError: { statusCode: 401, message: 'Connection Failure' },
            sessionResetAt: Date.now() - 5 * 60 * 1000
        }, { sessionFileCount: 0 });
        expect(d.recentlyReset).toBe(true);
        expect(d.hint).toMatch(/IP server diblokir/i);
        expect(d.hint).not.toMatch(/Reset Sesi Bot/);
    });

    test('401 + sesi lama masih ada -> hint menyuruh reset sesi', () => {
        const d = buildDiagnostics({
            connected: false,
            lastError: { statusCode: 401, message: 'Connection Failure' }
        }, { sessionFileCount: 41 });
        expect(d.hint).toMatch(/Reset Sesi Bot/i);
    });

    test('endpoint setup WA boleh dipakai moderator (bukan hanya super_admin)', () => {
        const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const resetBlock = server.match(/app\.post\('\/api\/whatsapp\/reset-session'[\s\S]{0,160}/)[0];
        const testBlock = server.match(/app\.post\('\/api\/whatsapp\/bot-test'[\s\S]{0,160}/)[0];
        expect(resetBlock).toContain("authorizeRole('super_admin', 'moderator')");
        expect(testBlock).toContain("authorizeRole('super_admin', 'moderator')");
    });

    test('diagnose mengecek IPv4 + TCP IPv4 (umumnya lebih stabil di VPS)', () => {
        const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        expect(server).toContain('dns4');
        expect(server).toContain('tcp443v4');
        expect(server).toContain('family: 4');
    });

    test('source: reconnect pakai backoff (tidak bombardir WhatsApp)', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'whatsapp-baileys.js'), 'utf8');
        expect(src).toContain('connectAttempts');
        expect(src).toMatch(/Math\.min\(5000 \* Math\.pow\(2/);
    });

    test('source: endpoint QR pesan error tidak generik & ada reset sesi', () => {
        const ep = fs.readFileSync(path.join(__dirname, '..', 'whatsapp-endpoints.js'), 'utf8');
        expect(ep).toContain('getDiagnostics');
        expect(ep).not.toContain('No QR code available');
        const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        expect(server).toContain("/api/whatsapp/diagnose");
        expect(server).toContain("/api/whatsapp/reset-session");
        // pesan error /api/whatsapp tidak disamarkan di produksi
        expect(server).toContain("isWhatsAppSetup");
    });
});

describe('Auto Dispatch ke Grup WhatsApp', () => {    test('auto-send nonaktif -> dilewati, pesan tetap manual', async () => {
        const supabase = {
            from: () => ({
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
            })
        };
        const res = await dispatchInvoiceToZonaGroups({
            supabase,
            zones: [{ zona_id: 129, zona_name: 'Zona 07', message: 'test' }]
        });
        expect(res.queued.length).toBe(0);
        expect(res.skipped.length).toBe(1);
        expect(res.skipped[0].reason).toMatch(/nonaktif/i);
    });

    test('grup belum dipetakan -> dilewati (tidak error)', async () => {
        const supabase = {
            from: () => ({
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
            })
        };
        const res = await dispatchInvoiceToZonaGroups({
            supabase,
            zones: [{ zona_id: 129, zona_name: 'Zona 07', message: 'test' }]
        });
        expect(res.queued.length).toBe(0);
        expect(res.skipped.length).toBe(1);
    });

    test('source: auto-send bergantung pada pengaturan per zona', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'wa-auto-dispatch.js'), 'utf8');
        expect(src).toContain('isAutoSendEnabledForZone');
        expect(src).toContain("from('whatsapp_zona_groups')");
        expect(src).toContain("from('whatsapp_zona_messages')");
    });

    test('source: service bot punya konfigurasi simulasi typing', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'whatsapp-baileys.js'), 'utf8');
        expect(src).toContain('simulateTyping');
        expect(src).toContain("sendPresenceUpdate('composing'");
    });
});
