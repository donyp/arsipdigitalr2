/**
 * ============================================================
 * Unit Test: Upload Invoice PDF (tombol upload) + Auto Dispatch WA
 * ============================================================
 * 1) Bug: tombol "Upload PDF" meneruskan objek Event ke uploadValidFiles()
 *    -> upload salah masuk mode "hanya file gagal" -> tidak ada upload.
 * 2) Auto dispatch: pesan ke grup WA harus PERSIS sama dengan yang tampil
 *    di halaman "WA Messages" (diambil ulang dari DB saat dikirim) dan
 *    tidak boleh dobel.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// Jeda auto-send diperpendek untuk unit test
process.env.WA_AUTO_SEND_DELAY_MS = '30';

const { dispatchInvoiceToZonaGroups, setBotDeps } = require('../wa-auto-dispatch');

describe('Upload Invoice PDF - tombol upload', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'upload-invoice-pdf.js'), 'utf8');

    test('handler klik TIDAK boleh meneruskan fungsi secara langsung', () => {
        // addEventListener('click', uploadValidFiles) -> Event jadi argumen
        expect(src).not.toMatch(/addEventListener\('click',\s*uploadValidFiles\s*\)/);
        expect(src).toMatch(/addEventListener\('click',\s*\(\)\s*=>\s*uploadValidFiles\(false\)\)/);
    });

    test('mode "hanya file gagal" hanya aktif bila argumen TRUE eksplisit', () => {
        expect(src).toContain('onlyFailed === true');
    });

    test('pesan error mode normal vs mode upload-ulang dibedakan', () => {
        expect(src).toContain("onlyFailedMode ? 'Tidak ada file yang gagal diupload.' : 'Tidak ada file valid untuk diupload'");
    });

    test('tombol upload ulang hanya muncul kalau ada file gagal', () => {
        expect(src).toContain('btnRetryFailed');
        expect(src).toMatch(/failedCount\s*>\s*0\s*\?\s*'inline-flex'\s*:\s*'none'/);
    });
});

describe('Auto Dispatch - template & duplikasi', () => {

    function fakeSupabase(opts = {}) {
        const state = {
            notification: opts.notification || { id: 7, message: 'PESAN AWAL', sent_at: null },
            group: ('group' in opts) ? opts.group : { zona_id: 129, group_id: '120363@g.us', is_active: true },
            settings: opts.settings || {
                system_enabled: true,
                bot_enabled: true,
                announce_enabled: true,
                auto_send_enabled: true,
                announce_zonas: {},
                auto_send_zonas: {}
            },
            enqueued: []
        };
        const supabase = {
            state,
            from(table) {
                if (table === 'system_config') {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: { value: state.settings }, error: null })
                            })
                        })
                    };
                }
                if (table === 'whatsapp_zona_groups') {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: state.group, error: null })
                                })
                            })
                        })
                    };
                }
                if (table === 'whatsapp_invoice_notifications') {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: state.notification, error: null })
                            })
                        }),
                        update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }),
                        insert: () => ({ select: async () => ({ data: [], error: null }) })
                    };
                }
                if (table === 'whatsapp_zona_messages') {
                    return { insert: () => ({ select: async () => ({ data: [], error: null }) }) };
                }
                return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
            }
        };
        return supabase;
    }

    function fakeQueue() {
        const q = {
            sent: [],
            async enqueue(to, message, type) {
                q.sent.push({ to, message, type });
                return { id: 'q-' + q.sent.length, status: 'queued' };
            }
        };
        return q;
    }

    beforeEach(() => {
        setBotDeps({ service: { isReady: () => true }, queue: null });
    });

    afterEach(() => {
        setBotDeps(null);
    });

    test('auto-send nonaktif -> dilewati', async () => {
        const queue = fakeQueue();
        setBotDeps({ service: { isReady: () => true }, queue });
        const supabase = fakeSupabase({
            settings: { system_enabled: true, bot_enabled: true, announce_enabled: true, auto_send_enabled: false, announce_zonas: {}, auto_send_zonas: {} }
        });
        const res = await dispatchInvoiceToZonaGroups({
            supabase,
            zones: [{ zona_id: 129, zona_name: 'Zona 07', message: 'X', notification_id: 7 }]
        });
        expect(res.queued.length).toBe(0);
        expect(res.skipped.length).toBe(1);
    });

    test('master switch sistem OFF -> auto-send dilewati', async () => {
        const queue = fakeQueue();
        setBotDeps({ service: { isReady: () => true }, queue });
        const supabase = fakeSupabase({
            settings: { system_enabled: false, bot_enabled: true, announce_enabled: true, auto_send_enabled: true, announce_zonas: {}, auto_send_zonas: {} }
        });
        const res = await dispatchInvoiceToZonaGroups({
            supabase,
            zones: [{ zona_id: 129, zona_name: 'Zona 07', message: 'X', notification_id: 7 }]
        });
        expect(res.queued.length).toBe(0);
        expect(res.skipped.length).toBe(1);
        await new Promise(r => setTimeout(r, 120));
        expect(queue.sent.length).toBe(0);
    });

    test('pesan yang dikirim diambil dari DB (PERSIS sama dgn halaman WA Messages)', async () => {
        const queue = fakeQueue();
        setBotDeps({ service: { isReady: () => true }, queue });
        // Pesan di DB sudah digabung (berbeda dari pesan saat pemanggilan)
        const supabase = fakeSupabase({
            notification: { id: 7, message: 'PESAN FINAL SETELAH DIGABUNG', sent_at: null }
        });
        await dispatchInvoiceToZonaGroups({
            supabase,
            zones: [{ zona_id: 129, zona_name: 'Zona 07', message: 'PESAN AWAL', notification_id: 7 }]
        });
        await new Promise(r => setTimeout(r, 120));
        expect(queue.sent.length).toBe(1);
        expect(queue.sent[0].message).toBe('PESAN FINAL SETELAH DIGABUNG');
        expect(queue.sent[0].type).toBe('group');
    });

    test('kalau pesan sudah terkirim manual -> auto-send dibatalkan (grup tidak dapat 2x)', async () => {
        const queue = fakeQueue();
        setBotDeps({ service: { isReady: () => true }, queue });
        const supabase = fakeSupabase({
            notification: { id: 7, message: 'SUDAH TERKIRIM', sent_at: new Date().toISOString() }
        });
        await dispatchInvoiceToZonaGroups({
            supabase,
            zones: [{ zona_id: 129, zona_name: 'Zona 07', message: 'SUDAH TERKIRIM', notification_id: 7 }]
        });
        await new Promise(r => setTimeout(r, 120));
        expect(queue.sent.length).toBe(0);
    });

    test('grup belum dipetakan / bot belum connect -> dilewati', async () => {
        const queue = fakeQueue();
        const supabase = fakeSupabase({ group: null });
        setBotDeps({ service: { isReady: () => true }, queue });
        let res = await dispatchInvoiceToZonaGroups({
            supabase, zones: [{ zona_id: 129, zona_name: 'Z', message: 'X', notification_id: 7 }]
        });
        expect(res.skipped[0].reason).toMatch(/grup/i);

        const supabase2 = fakeSupabase();
        setBotDeps({ service: { isReady: () => false }, queue });
        res = await dispatchInvoiceToZonaGroups({
            supabase: supabase2, zones: [{ zona_id: 129, zona_name: 'Z', message: 'X', notification_id: 7 }]
        });
        expect(res.skipped[0].reason).toMatch(/terhubung/i);
        expect(queue.sent.length).toBe(0);
    });

    test('source: ada jeda gabung + ambil pesan dari DB + batalkan bila sudah terkirim', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'wa-auto-dispatch.js'), 'utf8');
        expect(src).toContain('WA_AUTO_SEND_DELAY_MS');
        expect(src).toContain("from('whatsapp_invoice_notifications')");
        expect(src).toContain("logDispatch('dibatalkan'");
    });

    test('riwayat dispatch tercatat + status bisa dipantau', () => {
        const { getDispatchStatus, logDispatch } = require('../wa-auto-dispatch');
        logDispatch('dilewati', { zona_id: 129, zona_name: 'Zona 07' }, { reason: 'bot belum terhubung' });
        const st = getDispatchStatus();
        expect(Array.isArray(st.log)).toBe(true);
        expect(st.log.length).toBeGreaterThan(0);
        expect(st.log[0].action).toBe('dilewati');
        expect(st.log[0].zona_name).toBe('Zona 07');
        expect(st.log[0].reason).toMatch(/terhubung/);
        expect(typeof st.delay_ms).toBe('number');
        expect(Array.isArray(st.pending)).toBe(true);
    });

    test('source: server punya endpoint status & kirim-sekarang', () => {
        const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        expect(server).toContain("/api/whatsapp/auto-send-status");
        expect(server).toContain("/api/whatsapp/auto-send-now");
        expect(server).toContain('auto_send_delay_ms');
    });

    test('default: jeda gabung 60 detik (bisa diubah dari dashboard)', () => {
        const { DEFAULT_SETTINGS } = require('../wa-notification-settings');
        expect(DEFAULT_SETTINGS.auto_send_delay_ms).toBe(60000);
    });
});
