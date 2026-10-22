/**
 * ============================================================
 * Unit Test: Pengaturan & Pengumuman Otomatis Notifikasi WA
 * ============================================================
 * Fokus:
 * - Default pengaturan harus AMAN (tidak mengirim apa pun tanpa sengaja)
 * - Toggle per zona bekerja (override per zona > default global)
 * - Isi pengumuman hanya berisi data zona tsb (anti kebocoran)
 * - Endpoint pengumuman pakai INNER JOIN read-record (scope per user)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const {
    DEFAULT_SETTINGS,
    isAnnounceEnabledForZone,
    isAutoSendEnabledForZone
} = require('../wa-notification-settings');

const { buildAnnouncementContent, ANNOUNCEMENT_TYPE } = require('../invoice-upload-announcement');

describe('WA Notification Settings', () => {

    test('default: pengumuman aktif, kirim otomatis ke grup NONaktif', () => {
        expect(DEFAULT_SETTINGS.announce_enabled).toBe(true);
        expect(DEFAULT_SETTINGS.auto_send_enabled).toBe(false);
    });

    test('default anti-ban punya batas & simulasi typing', () => {
        expect(DEFAULT_SETTINGS.antiban.typing_simulation).toBe(true);
        expect(DEFAULT_SETTINGS.antiban.max_per_hour).toBeGreaterThan(0);
        expect(DEFAULT_SETTINGS.antiban.max_per_day).toBeGreaterThan(0);
        expect(DEFAULT_SETTINGS.antiban.min_interval_ms).toBeLessThan(DEFAULT_SETTINGS.antiban.max_interval_ms);
    });

    test('override per zona mengalahkan default global', () => {
        const settings = { announce_enabled: true, announce_zonas: { '129': false } };
        expect(isAnnounceEnabledForZone(settings, 129)).toBe(false);
        expect(isAnnounceEnabledForZone(settings, 130)).toBe(true);
    });

    test('zona tanpa override ikut default global', () => {
        const settings = { announce_enabled: false, announce_zonas: {} };
        expect(isAnnounceEnabledForZone(settings, 129)).toBe(false);
    });

    test('kirim otomatis per zona juga bisa di-override', () => {
        const settings = { auto_send_enabled: false, auto_send_zonas: { '129': true } };
        expect(isAutoSendEnabledForZone(settings, 129)).toBe(true);
        expect(isAutoSendEnabledForZone(settings, 130)).toBe(false);
    });

    test('setting null tidak menyebabkan error', () => {
        expect(isAnnounceEnabledForZone(null, 129)).toBe(false);
        expect(isAutoSendEnabledForZone(null, 129)).toBe(false);
    });
});

describe('Isi Pengumuman Upload Invoice', () => {

    const zona = {
        zona_id: 129,
        zona_name: 'Zona 07',
        invoice_count: 2,
        total_nominal: 36333424,
        toko_names: ['MEGA BAJA CIREBON']
    };

    test('memuat jumlah file, total nominal, dan nama toko', () => {
        const content = buildAnnouncementContent(zona);
        expect(content).toContain('2 file invoice PDF baru');
        expect(content).toContain('Rp 36.333.424');
        expect(content).toContain('MEGA BAJA CIREBON');
    });

    test('HANYA berisi data zona tsb (tidak ada zona lain)', () => {
        const content = buildAnnouncementContent(zona);
        expect(content).not.toMatch(/Zona 0[1-69]|Zona 1[0-8]/);
    });

    test('nama toko dibatasi 10 + penanda sisanya', () => {
        const banyak = { ...zona, toko_names: Array.from({ length: 15 }, (_, i) => `TOKO ${i + 1}`) };
        const content = buildAnnouncementContent(banyak);
        expect(content).toContain('TOKO 10');
        expect(content).not.toContain('TOKO 11');
        expect(content).toContain('(+5 lainnya)');
    });

    test('tipe pengumuman punya ikon khusus (bertipe Upload Invoice)', () => {
        expect(ANNOUNCEMENT_TYPE).toBe('Upload Invoice');
    });
});

describe('Regresi: scoping pengumuman per user', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'announcement-endpoints.js'), 'utf8');

    test('GET /api/announcements memakai INNER JOIN read-record', () => {
        expect(src).toContain('announcement_reads!inner(is_read)');
        expect(src).not.toContain('announcement_reads!left(is_read)');
    });

    test('unread count juga pakai read-record user', () => {
        expect(src).toMatch(/unread\/count[\s\S]{0,900}announcement_reads!inner\(is_read\)/);
    });

    test('read record hanya dibuat untuk user zona tsb (+ pengupload)', () => {
        const annSrc = fs.readFileSync(path.join(__dirname, '..', 'invoice-upload-announcement.js'), 'utf8');
        expect(annSrc).toContain(".eq('zona_id', zona.zona_id)");
        expect(annSrc).toContain("recipient_type: 'zona'");
    });
});
