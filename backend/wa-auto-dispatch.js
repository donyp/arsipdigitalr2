// ============================================================
// Auto Dispatch: kirim pesan notifikasi invoice ke grup WhatsApp zona
// ============================================================
// Dipanggil setelah pesan WA per zona dibuat. Syarat terkirim:
//   1. Auto-send aktif untuk zona tsb (pengaturan dashboard)
//   2. Grup WA zona tsb sudah dipetakan (whatsapp_zona_groups)
//   3. Bot WhatsApp sedang terhubung
//
// Kalau salah satu tidak terpenuhi -> pesan TETAP ada di halaman "WA
// Messages" untuk dikirim manual (copy & paste). Tidak ada data hilang.
//
// PENTING (template & duplikasi):
//   - Pesan yang dikirim ke grup diambil ULANG dari database saat akan
//     dikirim, jadi isinya PERSIS sama dengan yang tampil di halaman
//     "WA Messages" (termasuk kalau pesannya digabung dengan upload lain).
//   - Pengiriman ditunda sebentar (WA_AUTO_SEND_DELAY_MS) supaya upload
//     yang berdekatan digabung jadi 1 pesan (tidak 2 pesan ke grup).
//   - Kalau pesan sudah ditandai terkirim (mis. admin copy manual lebih
//     dulu), pengiriman otomatis DIBATALKAN -> grup tidak dapat 2x.
// ============================================================

const { getWaSettings, isAutoSendEnabledForZone } = require('./wa-notification-settings');

// Jeda sebelum mengirim (ms) - memberi waktu upload berdekatan digabung
const WA_AUTO_SEND_DELAY_MS = Number(process.env.WA_AUTO_SEND_DELAY_MS || 60000);

// ============================================================
// GUARD "HANYA PESAN NOTIFIKASI"
// ============================================================
// Keamanan utama: bot TIDAK BOLEH mengirim apa pun ke grup zona kecuali
// pesan notifikasi upload invoice. Guard ini acts as pengaman terakhir:
// kalau ada bug / data aneh, pesan TIDAK akan keluar ke grup.
// Pola pesan notifikasi: "*UPDATE INVOICE ZONA 7* ..." (dibuat oleh
// generateZonaInvoiceMessage).
const NOTIFICATION_HEADER = /^\s*\*UPDATE INVOICE ZONA\s+[^*]+\*/i;
// Bypass hanya untuk pengembangan (JANGAN diaktifkan di produksi)
const ALLOW_ANY_MESSAGE = process.env.WA_ALLOW_ANY_MESSAGE === 'true';

/**
 * Apakah pesan ini sah sebagai notifikasi upload invoice?
 * @param {string} message
 * @returns {boolean}
 */
function isValidNotificationMessage(message) {
    if (ALLOW_ANY_MESSAGE) return true;
    if (typeof message !== 'string') return false;
    const m = message.trim();
    if (!m) return false;                       // jangan kirim pesan kosong
    if (m.length > 4096) return false;          // batas WhatsApp
    if (!NOTIFICATION_HEADER.test(m)) return false; // harus berformat notifikasi
    return true;
}

let supabaseRef = null;
let reconcileTimer = null;

// notifikasi yang sudah dijadwalkan (hindari double schedule)
const scheduled = new Set();
// peta: id antrean (queue message id) -> id notifikasi
const queueToNotification = new Map();
// daftar pengiriman yang SEDANG dijadwalkan (untuk monitoring di dashboard)
const pendingSends = new Map();
// riwayat 50 kejadian terakhir (untuk monitoring & audit)
const dispatchLog = [];

/**
 * Catat kejadian dispatch (terlihat di dashboard + log server).
 */
function logDispatch(action, zona, extra = {}) {
    const entry = {
        at: new Date().toISOString(),
        action,
        zona_id: zona?.zona_id ?? null,
        zona_name: zona?.zona_name ?? null,
        ...extra
    };
    dispatchLog.unshift(entry);
    if (dispatchLog.length > 50) dispatchLog.pop();
    console.log(`[WA-AutoSend] ${action}${zona?.zona_name ? ' | ' + zona.zona_name : ''}${extra.reason ? ' | ' + extra.reason : ''}`);
    return entry;
}

/**
 * Jeda gabung saat ini (dari setting dashboard, fallback ke env).
 */
let delayOverrideMs = null;
function currentDelayMs() {
    if (delayOverrideMs !== null) return delayOverrideMs;
    return Number(process.env.WA_AUTO_SEND_DELAY_MS || 60000);
}

/**
 * Set jeda gabung (dari dashboard / settings).
 */
function setDelayMs(ms) {
    const v = Number(ms);
    if (!isNaN(v) && v >= 0) delayOverrideMs = v;
    return currentDelayMs();
}

/**
 * Status dispatch untuk dashboard: apa yang dijadwalkan & riwayatnya.
 */
function getDispatchStatus() {
    const now = Date.now();
    const pending = Array.from(pendingSends.values()).map(p => ({
        notification_id: p.notification_id,
        zona_id: p.zona_id,
        zona_name: p.zona_name,
        group_id: p.group_id,
        scheduled_at: new Date(p.scheduledAt).getTime(),
        send_at: p.sendAt,
        seconds_left: Math.max(0, Math.round((p.sendAt - now) / 1000))
    }));
    return {
        pending,
        log: dispatchLog.slice(0, 20),
        delay_ms: currentDelayMs()
    };
}

/**
 * Simpan reference supabase (dipanggil sekali dari server).
 */
function setSupabase(supabase) {
    supabaseRef = supabase;
}

/**
 * Ambil instance service + antrean dari whatsapp-zona-endpoints (di sana
 * service & queue dibuat saat init).
 */
let injectedDeps = null;

/**
 * Inject dependency (untuk unit test / skenario khusus).
 */
function setBotDeps(deps) {
    injectedDeps = deps;
}

function getBotDeps() {
    if (injectedDeps) return injectedDeps;
    try {
        // Lazy require supaya tidak ada circular dependency
        const zonaEndpoints = require('./whatsapp-zona-endpoints');
        return {
            service: typeof zonaEndpoints.getWaService === 'function' ? zonaEndpoints.getWaService() : null,
            queue: typeof zonaEndpoints.getWaQueue === 'function' ? zonaEndpoints.getWaQueue() : null
        };
    } catch (e) {
        return { service: null, queue: null };
    }
}

/**
 * Kirim pesan notifikasi invoice ke grup WA untuk setiap zona.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {array}  params.zones - [{ zona_id, zona_name, message, notification_id }]
 * @returns {Promise<{queued: array, skipped: array}>}
 */
async function dispatchInvoiceToZonaGroups({ supabase, zones = [] }) {
    const result = { queued: [], skipped: [] };
    if (!zones.length) return result;

    let settings;
    try {
        settings = await getWaSettings(supabase);
    } catch (e) {
        console.warn('[WA-AutoSend] Gagal baca settings:', e.message);
        return result;
    }

    const { service, queue } = getBotDeps();

    for (const zona of zones) {
        try {
            if (!isAutoSendEnabledForZone(settings, zona.zona_id)) {
                const reason = 'kirim otomatis nonaktif untuk zona ini (switch per-zona di dashboard)';
                result.skipped.push({ zona_id: zona.zona_id, reason });
                logDispatch('dilewati', zona, { reason });
                continue;
            }

            const { data: groupRow } = await supabase
                .from('whatsapp_zona_groups')
                .select('*')
                .eq('zona_id', zona.zona_id)
                .eq('is_active', true)
                .maybeSingle();

            if (!groupRow) {
                const reason = 'grup WhatsApp zona ini belum dipetakan (dashboard > Grup WA per Zona)';
                result.skipped.push({ zona_id: zona.zona_id, reason });
                logDispatch('dilewati', zona, { reason });
                continue;
            }

            if (!service || !service.isReady()) {
                const reason = 'bot WhatsApp belum terhubung (cek switch Koneksi Bot)';
                result.skipped.push({ zona_id: zona.zona_id, reason });
                logDispatch('dilewati', zona, { reason });
                continue;
            }

            if (!queue) {
                const reason = 'antrean pesan tidak tersedia';
                result.skipped.push({ zona_id: zona.zona_id, reason });
                logDispatch('dilewati', zona, { reason });
                continue;
            }

            // Jangan jadwalkan 2x untuk notifikasi yang sama
            if (zona.notification_id && scheduled.has(zona.notification_id)) {
                const reason = 'sudah dijadwalkan (menunggu jeda gabung)';
                result.skipped.push({ zona_id: zona.zona_id, reason });
                logDispatch('dilewati', zona, { reason });
                continue;
            }
            if (zona.notification_id) scheduled.add(zona.notification_id);

            const delayMs = currentDelayMs();
            scheduleSend({ supabase, queue, zona, groupRow, delayMs });
            result.queued.push({
                zona_id: zona.zona_id,
                zona_name: zona.zona_name,
                group_id: groupRow.group_id,
                scheduled: true,
                delay_ms: delayMs
            });
            logDispatch('dijadwalkan', zona, { group_id: groupRow.group_id, delay_ms: delayMs });
        } catch (e) {
            console.error('[WA-AutoSend] Error:', e.message);
            result.skipped.push({ zona_id: zona.zona_id, reason: e.message });
            logDispatch('error', zona, { reason: e.message });
        }
    }

    if (result.queued.length) {
        startReconciler();
    }

    return result;
}

/**
 * Jadwalkan pengiriman (setelah jeda gabung).
 * Saat dikirim, pesan diambil ulang dari DB -> PERSIS sama dengan yang
 * tampil di halaman "WA Messages".
 */
function scheduleSend({ supabase, queue, zona, groupRow, delayMs }) {
    const sendAt = Date.now() + (delayMs || currentDelayMs());
    if (zona.notification_id) {
        pendingSends.set(zona.notification_id, {
            notification_id: zona.notification_id,
            zona_id: zona.zona_id,
            zona_name: zona.zona_name,
            group_id: groupRow.group_id,
            scheduledAt: new Date().toISOString(),
            sendAt
        });
    }

    const timer = setTimeout(async () => {
        try {
            let message = zona.message;
            let notificationId = zona.notification_id;

            // Ambil pesan TERAKHIR (bisa saja sudah digabung dengan upload lain)
            if (notificationId) {
                const { data: row } = await supabase
                    .from('whatsapp_invoice_notifications')
                    .select('id, message, sent_at')
                    .eq('id', notificationId)
                    .maybeSingle();

                if (!row) {
                    logDispatch('dibatalkan', zona, { reason: 'notifikasi tidak ada' });
                    return;
                }
                if (row.sent_at) {
                    logDispatch('dibatalkan', zona, { reason: 'pesan sudah terkirim manual (dilewati agar grup tidak dapat 2x)' });
                    return;
                }
                message = row.message;
                notificationId = row.id;
            }

            // GUARD: hanya pesan notifikasi yang boleh masuk grup
            if (!isValidNotificationMessage(message)) {
                logDispatch('dibatalkan', zona, { reason: 'pesan tidak valid sebagai notifikasi (tidak dikirim ke grup)' });
                return;
            }

            const enqueued = await queue.enqueue(groupRow.group_id, message, 'group');
            if (!enqueued || !enqueued.id) {
                logDispatch('gagal', zona, { reason: 'antrean menolak (circuit breaker)' });
                return;
            }
            if (notificationId) queueToNotification.set(enqueued.id, notificationId);

            // Catat riwayat pengiriman
            try {
                await supabase.from('whatsapp_zona_messages').insert({
                    zona_id: zona.zona_id,
                    group_id: groupRow.group_id,
                    message: message,
                    message_type: 'auto_trigger',
                    trigger_source: 'invoice_upload',
                    queue_status: 'queued'
                });
            } catch (logErr) {
                console.warn('[WA-AutoSend] Gagal catat riwayat:', logErr.message);
            }

            // Tandai kanal pada notifikasi (kolom opsional)
            try {
                if (notificationId) {
                    const { error: updErr } = await supabase
                        .from('whatsapp_invoice_notifications')
                        .update({ sent_via: 'bot', bot_message_id: enqueued.id })
                        .eq('id', notificationId);
                    if (updErr) {
                        console.warn('[WA-AutoSend] Kolom kanal belum tersedia (abaikan):', updErr.message);
                    }
                }
            } catch (e) {
                console.warn('[WA-AutoSend] Gagal update kanal notifikasi:', e.message);
            }

            logDispatch('diantrikan', zona, { group_id: groupRow.group_id, message_id: enqueued.id });
        } catch (e) {
            console.error('[WA-AutoSend] Error saat kirim:', e.message);
            logDispatch('error', zona, { reason: e.message });
        } finally {
            if (zona.notification_id) {
                scheduled.delete(zona.notification_id);
                pendingSends.delete(zona.notification_id);
            }
        }
    }, delayMs || currentDelayMs());

    if (timer.unref) timer.unref();
    return timer;
}

/**
 * Kirim SEKARANG (lewati jeda gabung) untuk satu pesan yang terjadwal.
 * Dipakai dari dashboard saat admin mau pesan langsung masuk grup.
 * @param {number} notificationId
 */
async function sendScheduledNow(notificationId) {
    const supabase = supabaseRef;
    const { service, queue } = getBotDeps();
    if (!supabase || !queue || !service || !service.isReady()) {
        return { success: false, error: 'Bot belum terhubung / antrean tidak tersedia' };
    }

    const { data: row } = await supabase
        .from('whatsapp_invoice_notifications')
        .select('id, zona_id, message, sent_at')
        .eq('id', notificationId)
        .maybeSingle();

    if (!row) return { success: false, error: 'Pesan tidak ditemukan' };
    if (row.sent_at) return { success: false, error: 'Pesan sudah ditandai terkirim' };

    const { data: groupRow } = await supabase
        .from('whatsapp_zona_groups')
        .select('*')
        .eq('zona_id', row.zona_id)
        .eq('is_active', true)
        .maybeSingle();

    if (!groupRow) return { success: false, error: 'Grup WhatsApp zona ini belum dipetakan' };

    // GUARD: hanya pesan notifikasi yang boleh masuk grup
    if (!isValidNotificationMessage(row.message)) {
        logDispatch('dibatalkan', { zona_id: row.zona_id }, { reason: 'pesan tidak valid sebagai notifikasi (tidak dikirim ke grup)' });
        return { success: false, error: 'Pesan bukan format notifikasi upload - tidak dikirim ke grup' };
    }

    const enqueued = await queue.enqueue(groupRow.group_id, row.message, 'group');
    if (!enqueued || !enqueued.id) {
        return { success: false, error: 'Antrean menolak (circuit breaker)' };
    }
    queueToNotification.set(enqueued.id, row.id);

    try {
        await supabase.from('whatsapp_zona_messages').insert({
            zona_id: row.zona_id,
            group_id: groupRow.group_id,
            message: row.message,
            message_type: 'auto_trigger',
            trigger_source: 'manual_send_now',
            queue_status: 'queued'
        });
    } catch (e) { /* abaikan */ }

    logDispatch('diantrikan (kirim sekarang)', { zona_id: row.zona_id }, { group_id: groupRow.group_id });
    return { success: true, message_id: enqueued.id };
}

/**
 * Cocokkan status antrean -> tandai pesan notifikasi sebagai terkirim.
 * Dipanggil berkala (hanya jalan kalau ada pesan otomatis yang diantrikan).
 */
async function reconcileAutoSentMessages() {
    const supabase = supabaseRef;
    if (!supabase) return;

    const { queue } = getBotDeps();
    if (!queue) return;

    try {
        const { data: pending } = await supabase
            .from('whatsapp_zona_messages')
            .select('id, zona_id, message, queue_status, sent_at')
            .eq('message_type', 'auto_trigger')
            .eq('queue_status', 'queued')
            .order('created_at', { ascending: true })
            .limit(20);

        if (!pending || !pending.length) return;

        for (const row of pending) {
            // Cari pesan notifikasi yang cocok (zona + isi pesan sama)
            const { data: notifications } = await supabase
                .from('whatsapp_invoice_notifications')
                .select('id, message, sent_at')
                .eq('zona_id', row.zona_id)
                .eq('message', row.message)
                .is('sent_at', null)
                .limit(1);

            if (!notifications || !notifications.length) continue;

            const notifId = notifications[0].id;
            const sentAt = new Date().toISOString();
            const { error: updErr } = await supabase
                .from('whatsapp_invoice_notifications')
                .update({ sent_at: sentAt, sent_via: 'bot' })
                .eq('id', notifId);
            if (updErr) {
                // Kolom sent_via belum ada -> update tanpa kanal
                await supabase
                    .from('whatsapp_invoice_notifications')
                    .update({ sent_at: sentAt })
                    .eq('id', notifId);
            }
            await supabase
                .from('whatsapp_zona_messages')
                .update({ queue_status: 'sent', sent_at: sentAt })
                .eq('id', row.id);
            console.log(`[WA-AutoSend] Pesan zona ${row.zona_id} ditandai terkirim (otomatis)`);
        }
    } catch (e) {
        console.warn('[WA-AutoSend] Reconcile error:', e.message);
    }
}

/**
 * Jalankan reconciler (interval 15 detik, hanya 1 instance).
 */
function startReconciler() {
    if (reconcileTimer) return;
    reconcileTimer = setInterval(() => {
        reconcileAutoSentMessages().catch(() => {});
    }, 15000);
    if (reconcileTimer.unref) reconcileTimer.unref();
    console.log('[WA-AutoSend] Reconciler aktif (cek status pengiriman tiap 15 detik)');
}

module.exports = {
    setSupabase,
    setBotDeps,
    dispatchInvoiceToZonaGroups,
    reconcileAutoSentMessages,
    startReconciler,
    getDispatchStatus,
    logDispatch,
    sendScheduledNow,
    setDelayMs,
    currentDelayMs,
    isValidNotificationMessage,
    WA_AUTO_SEND_DELAY_MS
};
