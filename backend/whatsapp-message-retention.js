// ============================================
// Retensi pesan WhatsApp: hapus otomatis pesan yang sudah terkirim >= 7 hari.
//
// Yang dihapus:
//   - whatsapp_notifications (sent_at tidak null dan >= 7 hari)
//   - whatsapp_invoice_notifications (sent_at tidak null dan >= 7 hari)
//   - whatsapp_zona_messages (queue_status = 'sent' dan sent_at/created_at >= 7 hari)
//
// Job berjalan berkala (default tiap 6 jam) dan sekali setelah server hidup.
// Bisa juga dijalankan manual oleh super_admin/moderator:
//   POST /api/whatsapp/maintenance/cleanup-sent  (opsional dryRun=1)
//
// Catatan: pesan yang masih pending/queued/failed TIDAK dihapus.
// ============================================

const HARI_MS = 24 * 60 * 60 * 1000;

function bacaAngkaPositif(nilai, fallback) {
    const n = Number(nilai);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function hitungCutoff(now, retentionDays) {
    const basis = now instanceof Date ? now : new Date(now);
    return new Date(basis.getTime() - retentionDays * HARI_MS);
}

function createWhatsAppMessageCleanup({
    supabase,
    auditLogger,
    logger = console,
    retentionDays,
    intervalMs,
    firstRunDelayMs
} = {}) {
    if (!supabase) throw new Error('supabase wajib diisi');

    const hariRetensi = bacaAngkaPositif(
        retentionDays !== undefined ? retentionDays : process.env.WA_MESSAGE_RETENTION_DAYS,
        7
    );
    const jedaSiklus = bacaAngkaPositif(
        intervalMs !== undefined ? intervalMs : process.env.WA_MESSAGE_CLEANUP_INTERVAL_MS,
        6 * 60 * 60 * 1000
    );
    const jedaPertama = bacaAngkaPositif(
        firstRunDelayMs !== undefined ? firstRunDelayMs : process.env.WA_MESSAGE_CLEANUP_FIRST_RUN_MS,
        2 * 60 * 1000
    );

    const MAX_PER_SIKLUS = 500;

    function acuanWaktu(row) {
        return row && (row.sent_at || row.created_at) ? (row.sent_at || row.created_at) : null;
    }

    async function ambilKandidat(tabel, filterFn) {
        const { data, error } = await supabase.from(tabel).select('*').limit(MAX_PER_SIKLUS);
        if (error) throw new Error(`Gagal ambil ${tabel}: ${error.message}`);
        const rows = (data || []).filter(filterFn);
        return rows.slice(0, MAX_PER_SIKLUS);
    }

    async function hapusBaris(tabel, id) {
        const { error } = await supabase.from(tabel).delete().eq('id', id);
        if (error) throw new Error(`Gagal hapus ${tabel} ${id}: ${error.message}`);
    }

    async function cleanupSentMessages({ dryRun = false, now = new Date() } = {}) {
        const cutoff = hitungCutoff(now, hariRetensi);
        const batasMs = cutoff.getTime();

        const laporan = {
            retentionDays: hariRetensi,
            cutoff: cutoff.toISOString(),
            dryRun: Boolean(dryRun),
            dihapus: { whatsapp_notifications: 0, whatsapp_invoice_notifications: 0, whatsapp_zona_messages: 0 },
            gagal: [],
            total: 0
        };

        // 1. whatsapp_notifications (sudah terkirim)
        try {
            const kandidat = await ambilKandidat('whatsapp_notifications', (r) => {
                if (!r || !r.sent_at) return false;
                const t = new Date(r.sent_at).getTime();
                return Number.isFinite(t) && t <= batasMs;
            });

            for (const row of kandidat) {
                if (dryRun) {
                    laporan.dihapus.whatsapp_notifications += 1;
                    laporan.total += 1;
                    continue;
                }
                try {
                    await hapusBaris('whatsapp_notifications', row.id);
                    laporan.dihapus.whatsapp_notifications += 1;
                    laporan.total += 1;
                } catch (err) {
                    laporan.gagal.push({ tabel: 'whatsapp_notifications', id: row.id, alasan: err.message });
                }
            }
        } catch (err) {
            laporan.gagal.push({ tabel: 'whatsapp_notifications', id: null, alasan: err.message });
        }

        // 2. whatsapp_invoice_notifications (sudah terkirim)
        try {
            const kandidat = await ambilKandidat('whatsapp_invoice_notifications', (r) => {
                if (!r || !r.sent_at) return false;
                const t = new Date(r.sent_at).getTime();
                return Number.isFinite(t) && t <= batasMs;
            });

            for (const row of kandidat) {
                if (dryRun) {
                    laporan.dihapus.whatsapp_invoice_notifications += 1;
                    laporan.total += 1;
                    continue;
                }
                try {
                    await hapusBaris('whatsapp_invoice_notifications', row.id);
                    laporan.dihapus.whatsapp_invoice_notifications += 1;
                    laporan.total += 1;
                } catch (err) {
                    laporan.gagal.push({ tabel: 'whatsapp_invoice_notifications', id: row.id, alasan: err.message });
                }
            }
        } catch (err) {
            laporan.gagal.push({ tabel: 'whatsapp_invoice_notifications', id: null, alasan: err.message });
        }

        // 3. whatsapp_zona_messages (status sent)
        try {
            const kandidat = await ambilKandidat('whatsapp_zona_messages', (r) => {
                if (!r || r.queue_status !== 'sent') return false;
                const acuan = acuanWaktu(r);
                if (!acuan) return false;
                const t = new Date(acuan).getTime();
                return Number.isFinite(t) && t <= batasMs;
            });

            for (const row of kandidat) {
                if (dryRun) {
                    laporan.dihapus.whatsapp_zona_messages += 1;
                    laporan.total += 1;
                    continue;
                }
                try {
                    await hapusBaris('whatsapp_zona_messages', row.id);
                    laporan.dihapus.whatsapp_zona_messages += 1;
                    laporan.total += 1;
                } catch (err) {
                    laporan.gagal.push({ tabel: 'whatsapp_zona_messages', id: row.id, alasan: err.message });
                }
            }
        } catch (err) {
            laporan.gagal.push({ tabel: 'whatsapp_zona_messages', id: null, alasan: err.message });
        }

        if (auditLogger && typeof auditLogger.log === 'function' && !dryRun && laporan.total > 0) {
            await auditLogger.log({
                userId: null,
                userEmail: 'system',
                userRole: 'system',
                zonaId: null,
                action: 'Auto Delete Sent WhatsApp Messages',
                resourceType: 'whatsapp_message',
                resourceId: null,
                resourceName: 'whatsapp-sent-messages',
                operation: 'DELETE',
                details: { retentionDays: hariRetensi, deleted: laporan.dihapus, total: laporan.total },
                ipAddress: 'system',
                userAgent: 'whatsapp-message-retention',
                requestPath: 'scheduled:cleanup-sent-whatsapp',
                requestMethod: 'JOB',
                statusCode: 200,
                responseMessage: 'Sent WhatsApp messages older than retention deleted',
                errorMessage: null,
                isSuspicious: false,
                severity: 'info'
            }).catch(() => {});
        }

        return laporan;
    }

    // alias
    const cleanup = cleanupSentMessages;

    async function jalankanAman() {
        try {
            const laporan = await cleanupSentMessages();
            if (laporan.total > 0 || laporan.gagal.length > 0) {
                logger.log(
                    `[WAMessageRetention] Selesai: ${laporan.total} pesan terkirim dihapus, ` +
                    `${laporan.gagal.length} gagal, cutoff ${laporan.cutoff}`
                );
            }
        } catch (err) {
            logger.error('[WAMessageRetention] Error:', err.message);
        }
    }

    function start() {
        const timerPertama = setTimeout(jalankanAman, jedaPertama);
        const timerRutin = setInterval(jalankanAman, jedaSiklus);
        if (timerPertama.unref) timerPertama.unref();
        if (timerRutin.unref) timerRutin.unref();
        logger.log(
            `[WAMessageRetention] Aktif: pesan WA terkirim > ${hariRetensi} hari dihapus otomatis ` +
            `(cek tiap ${Math.round(jedaSiklus / 60000)} menit).`
        );
        return { stop() { clearTimeout(timerPertama); clearInterval(timerRutin); } };
    }

    function registerRoutes(app, { authenticateToken, authorizeRole }) {
        const handler = async (req, res) => {
            const query = req.query || {};
            const body = req.body || {};
            const dryRun = query.dryRun === '1' || query.dryRun === 'true' || body.dryRun === true;
            try {
                const laporan = await cleanupSentMessages({ dryRun });
                res.json({ success: true, ...laporan });
            } catch (err) {
                console.error('[WAMessageRetention] Manual run gagal:', err);
                res.status(500).json({ error: err.message });
            }
        };

        app.post('/api/whatsapp/maintenance/cleanup-sent', authenticateToken, authorizeRole('super_admin', 'moderator'), handler);
        app.post('/api/whatsapp/cleanup-sent-messages', authenticateToken, authorizeRole('super_admin', 'moderator'), handler);
        app.post('/api/whatsapp/maintenance/cleanup-sent-messages', authenticateToken, authorizeRole('super_admin', 'moderator'), handler);
    }

    return {
        retentionDays: hariRetensi,
        intervalMs: jedaSiklus,
        cleanupSentMessages,
        cleanup: cleanupSentMessages,
        cleanupSentWhatsAppMessages: cleanupSentMessages,
        run: cleanupSentMessages,
        start,
        registerRoutes
    };
}

module.exports = createWhatsAppMessageCleanup;
module.exports.createWhatsAppMessageCleanup = createWhatsAppMessageCleanup;
module.exports.createWAMessageCleanup = createWhatsAppMessageCleanup;
module.exports.hitungCutoff = hitungCutoff;
module.exports.HARI_MS = HARI_MS;
