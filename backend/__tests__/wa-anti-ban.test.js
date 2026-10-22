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

describe('Diagnostik Koneksi Bot WhatsApp', () => {
    const { getDisconnectHint, buildDiagnostics } = require('../services/wa-diagnostics');

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
