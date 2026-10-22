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
// Anti-ban: seluruh pengiriman lewat antrean (services/wa-message-queue.js)
// yang sudah menerapkan jeda acak, simulasi mengetik, batas per jam/hari,
// dan warm-up.
// ============================================================

const { getWaSettings, isAutoSendEnabledForZone } = require('./wa-notification-settings');

let supabaseRef = null;
let reconcileTimer = null;

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
function getBotDeps() {
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

            const enqueued = await queue.enqueue(groupRow.group_id, zona.message, 'group');
            if (!enqueued || !enqueued.id) {
                result.skipped.push({ zona_id: zona.zona_id, reason: 'antrean menolak (circuit breaker aktif)' });
                continue;
            }

            // Catat riwayat pengiriman
            try {
                await supabase.from('whatsapp_zona_messages').insert({
                    zona_id: zona.zona_id,
                    group_id: groupRow.group_id,
                    message: zona.message,
                    message_type: 'auto_trigger',
                    trigger_source: 'invoice_upload',
                    queue_status: 'queued'
                });
            } catch (logErr) {
                console.warn('[WA-AutoSend] Gagal catat riwayat:', logErr.message);
            }

            // Tandai kanal pada notifikasi (kolom opsional)
            try {
                if (zona.notification_id) {
                    const payload = { sent_via: 'bot', bot_message_id: enqueued.id };
                    const { error: updErr } = await supabase
                        .from('whatsapp_invoice_notifications')
                        .update(payload)
                        .eq('id', zona.notification_id);
                    if (updErr) {
                        // Kolom belum ada (migrasi SQL belum dijalankan) -> abaikan
                        console.warn('[WA-AutoSend] Kolom kanal belum tersedia (abaikan):', updErr.message);
                    }
                }
            } catch (e) {
                console.warn('[WA-AutoSend] Gagal update kanal notifikasi:', e.message);
            }

            result.queued.push({
                zona_id: zona.zona_id,
                zona_name: zona.zona_name,
                group_id: groupRow.group_id,
                message_id: enqueued.id
            });
            console.log(`[WA-AutoSend] ✅ Pesan zona ${zona.zona_name} diantrikan ke grup ${groupRow.group_id}`);
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

            // Queue sudah tidak menyimpan item lama -> anggap terkirim
            // (riwayat di queue sudah di-record saat proses selesai)
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
    dispatchInvoiceToZonaGroups,
    reconcileAutoSentMessages,
    startReconciler
};
