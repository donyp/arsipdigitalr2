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

let supabaseRef = null;
let reconcileTimer = null;

// notifikasi yang sudah dijadwalkan (hindari double schedule)
const scheduled = new Set();
// peta: id antrean (queue message id) -> id notifikasi
const queueToNotification = new Map();

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
                result.skipped.push({ zona_id: zona.zona_id, reason: 'kirim otomatis nonaktif untuk zona ini' });
                continue;
            }

            const { data: groupRow } = await supabase
                .from('whatsapp_zona_groups')
                .select('*')
                .eq('zona_id', zona.zona_id)
                .eq('is_active', true)
                .maybeSingle();

            if (!groupRow) {
                result.skipped.push({ zona_id: zona.zona_id, reason: 'grup WhatsApp zona ini belum dipetakan' });
                continue;
            }

            if (!service || !service.isReady()) {
                result.skipped.push({ zona_id: zona.zona_id, reason: 'bot WhatsApp belum terhubung' });
                continue;
            }

            if (!queue) {
                result.skipped.push({ zona_id: zona.zona_id, reason: 'antrean pesan tidak tersedia' });
                continue;
            }

            // Jangan jadwalkan 2x untuk notifikasi yang sama
            if (zona.notification_id && scheduled.has(zona.notification_id)) {
                result.skipped.push({ zona_id: zona.zona_id, reason: 'sudah dijadwalkan (menunggu jeda gabung)' });
                continue;
            }
            if (zona.notification_id) scheduled.add(zona.notification_id);

            scheduleSend({ supabase, queue, zona, groupRow });
            result.queued.push({
                zona_id: zona.zona_id,
                zona_name: zona.zona_name,
                group_id: groupRow.group_id,
                scheduled: true,
                delay_ms: WA_AUTO_SEND_DELAY_MS
            });
            console.log(`[WA-AutoSend] ⏱ Pesan zona ${zona.zona_name} dijadwalkan kirim ke ${groupRow.group_id} (dalam ${Math.round(WA_AUTO_SEND_DELAY_MS / 1000)} detik)`);
        } catch (e) {
            console.error('[WA-AutoSend] Error:', e.message);
            result.skipped.push({ zona_id: zona.zona_id, reason: e.message });
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
function scheduleSend({ supabase, queue, zona, groupRow }) {
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
                    console.log(`[WA-AutoSend] Notifikasi ${notificationId} tidak ada -> dibatalkan`);
                    return;
                }
                if (row.sent_at) {
                    console.log(`[WA-AutoSend] Pesan zona ${zona.zona_id} sudah terkirim (manual) -> auto-send dibatalkan agar grup tidak dapat 2x`);
                    return;
                }
                message = row.message;
                notificationId = row.id;
            }

            const enqueued = await queue.enqueue(groupRow.group_id, message, 'group');
            if (!enqueued || !enqueued.id) {
                console.warn(`[WA-AutoSend] Antrean menolak (circuit breaker) - zona ${zona.zona_id}`);
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

            console.log(`[WA-AutoSend] ✅ Pesan zona ${zona.zona_name} diantrikan ke grup ${groupRow.group_id}`);
        } catch (e) {
            console.error('[WA-AutoSend] Error saat kirim:', e.message);
        } finally {
            if (zona.notification_id) scheduled.delete(zona.notification_id);
        }
    }, WA_AUTO_SEND_DELAY_MS);

    if (timer.unref) timer.unref();
    return timer;
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
    WA_AUTO_SEND_DELAY_MS
};
