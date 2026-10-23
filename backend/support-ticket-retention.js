// ============================================
// Retensi tiket support: hapus otomatis tiket yang sudah Closed >= 3 hari.
//
// Yang dihapus:
//   - baris support_attachments, support_messages, support_ticket_activity
//   - baris support_tickets
//   - semua foto di R2 pada folder support-tickets/<ticket_id>/
//
// Job berjalan berkala (default tiap 6 jam) dan sekali setelah server hidup.
// Bisa juga dijalankan manual oleh super_admin:
//   POST /api/support/maintenance/cleanup-closed?dryRun=1
//
// Catatan: audit_logs TIDAK dihapus (jejak audit tetap disimpan).
// ============================================

const defaultStorage = require('./support-storage');

const HARI_MS = 24 * 60 * 60 * 1000;
const MAX_TIKET_PER_SIKLUS = 200;

function bacaAngkaPositif(nilai, fallback) {
    const n = Number(nilai);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function hitungCutoff(now, retentionDays) {
    const basis = now instanceof Date ? now : new Date(now);
    return new Date(basis.getTime() - retentionDays * HARI_MS);
}

function acuanDitutup(tiket) {
    return tiket && (tiket.closed_at || tiket.updated_at) ? (tiket.closed_at || tiket.updated_at) : null;
}

/**
 * Filter tiket yang benar-benar sudah melewati masa retensi.
 * Memakai closed_at; kalau kosong (data lama) pakai updated_at.
 */
function pilihTiketKedaluwarsa(tiketList, cutoff) {
    const batas = cutoff instanceof Date ? cutoff.getTime() : new Date(cutoff).getTime();

    return (tiketList || []).filter((tiket) => {
        const acuan = acuanDitutup(tiket);
        if (!acuan) return false;
        const waktu = new Date(acuan).getTime();
        return Number.isFinite(waktu) && waktu <= batas;
    });
}

function createSupportTicketCleanup({
    supabase,
    auditLogger,
    storage = defaultStorage,
    logger = console,
    retentionDays,
    intervalMs,
    firstRunDelayMs
} = {}) {
    if (!supabase) throw new Error('supabase wajib diisi');

    const hariRetensi = bacaAngkaPositif(
        retentionDays !== undefined ? retentionDays : process.env.SUPPORT_TICKET_RETENTION_DAYS,
        3
    );
    const jedaSiklus = bacaAngkaPositif(
        intervalMs !== undefined ? intervalMs : process.env.SUPPORT_TICKET_CLEANUP_INTERVAL_MS,
        6 * 60 * 60 * 1000
    );
    const jedaPertama = bacaAngkaPositif(
        firstRunDelayMs !== undefined ? firstRunDelayMs : process.env.SUPPORT_TICKET_CLEANUP_FIRST_RUN_MS,
        2 * 60 * 1000
    );

    const PAGE_SIZE = 200;

    async function ambilKandidat(cutoff) {
        const kandidat = [];
        const batas = cutoff.toISOString();
        let from = 0;

        while (from < MAX_TIKET_PER_SIKLUS) {
            const sisa = MAX_TIKET_PER_SIKLUS - from;
            const { data, error } = await supabase
                .from('support_tickets')
                .select('id, ticket_number, status, closed_at, updated_at')
                .eq('status', 'Closed')
                // closed_at = acuan utama; data lama tanpa closed_at pakai updated_at
                .or(`closed_at.lte.${batas},and(closed_at.is.null,updated_at.lte.${batas})`)
                .order('updated_at', { ascending: true })
                .range(from, from + Math.min(PAGE_SIZE, sisa) - 1);

            if (error) throw error;
            if (!data || data.length === 0) break;

            kandidat.push(...data);
            if (data.length < Math.min(PAGE_SIZE, sisa)) break;

            from += data.length;
        }

        return kandidat;
    }

    async function hapusDataTiket(tiketId) {
        const urutan = [
            { tabel: 'support_attachments', kolom: 'ticket_id' },
            { tabel: 'support_messages', kolom: 'ticket_id' },
            { tabel: 'support_ticket_activity', kolom: 'ticket_id' },
            { tabel: 'support_tickets', kolom: 'id' }
        ];

        for (const { tabel, kolom } of urutan) {
            const { error } = await supabase.from(tabel).delete().eq(kolom, tiketId);
            if (error) {
                // Tabel aktivitas opsional: jangan gagalkan seluruh proses.
                if (tabel === 'support_ticket_activity') {
                    logger.warn(`[SupportCleanup] Gagal hapus ${tabel}:`, error.message);
                    continue;
                }
                throw new Error(`Gagal hapus ${tabel}: ${error.message}`);
            }
        }
    }

    async function cleanupClosedTickets({ dryRun = false, now = new Date() } = {}) {
        const cutoff = hitungCutoff(now, hariRetensi);
        const kandidat = await ambilKandidat(cutoff);
        const siap = pilihTiketKedaluwarsa(kandidat, cutoff);

        const laporan = {
            retentionDays: hariRetensi,
            cutoff: cutoff.toISOString(),
            dryRun: Boolean(dryRun),
            kandidat: kandidat.length,
            diproses: siap.length,
            dihapus: [],
            gagal: [],
            peringatan: []
        };

        for (const tiket of siap) {
            const ringkas = {
                id: tiket.id,
                ticketNumber: tiket.ticket_number,
                closedAt: acuanDitutup(tiket)
            };

            const { data: lampiran, error: errorLampiran } = await supabase
                .from('support_attachments')
                .select('id, file_path, file_name')
                .eq('ticket_id', tiket.id);

            if (errorLampiran) {
                laporan.gagal.push({ ...ringkas, alasan: `Gagal ambil lampiran: ${errorLampiran.message}` });
                continue;
            }

            const daftarLampiran = lampiran || [];
            ringkas.lampiran = daftarLampiran.length;

            if (dryRun) {
                laporan.dihapus.push({ ...ringkas, mode: 'dry-run' });
                continue;
            }

            const gagalFile = [];
            for (const att of daftarLampiran) {
                try {
                    await storage.deleteAttachmentFile(att.file_path);
                } catch (err) {
                    gagalFile.push({ id: att.id, file: att.file_name, error: err.message });
                }
            }

            if (gagalFile.length > 0) {
                // Jangan hapus baris DB supaya tidak ada file yatim; coba lagi siklus berikutnya.
                laporan.gagal.push({
                    ...ringkas,
                    alasan: 'Sebagian file gagal dihapus',
                    file: gagalFile
                });
                continue;
            }

            // Bersihkan sisa objek di folder tiket (file yatim / tidak tercatat).
            try {
                const sisa = await storage.deleteTicketFolder(tiket.id);
                if (sisa.gagal.length > 0) {
                    laporan.peringatan.push({
                        ...ringkas,
                        alasan: 'Sebagian file yatim gagal dihapus',
                        file: sisa.gagal
                    });
                }
            } catch (err) {
                laporan.peringatan.push({ ...ringkas, alasan: `Gagal bersihkan folder: ${err.message}` });
            }

            try {
                await hapusDataTiket(tiket.id);
                laporan.dihapus.push(ringkas);
                logger.log(`[SupportCleanup] Tiket ${tiket.ticket_number} (${tiket.id}) dihapus permanen.`);

                if (auditLogger && typeof auditLogger.log === 'function') {
                    await auditLogger.log({
                        userId: null,
                        userEmail: 'system',
                        userRole: 'system',
                        zonaId: null,
                        action: 'Auto Delete Closed Ticket',
                        resourceType: 'ticket',
                        resourceId: tiket.id,
                        resourceName: tiket.ticket_number,
                        operation: 'DELETE',
                        details: {
                            retentionDays: hariRetensi,
                            closedAt: acuanDitutup(tiket),
                            attachmentsDeleted: daftarLampiran.length
                        },
                        ipAddress: 'system',
                        userAgent: 'support-ticket-cleanup',
                        requestPath: 'scheduled:cleanup-closed-tickets',
                        requestMethod: 'JOB',
                        statusCode: 200,
                        responseMessage: 'Ticket and attachments permanently deleted',
                        errorMessage: null,
                        isSuspicious: false,
                        severity: 'info'
                    }).catch(() => {});
                }
            } catch (err) {
                laporan.gagal.push({ ...ringkas, alasan: err.message });
            }
        }

        return laporan;
    }

    async function jalankanAman() {
        try {
            const laporan = await cleanupClosedTickets();
            if (laporan.dihapus.length > 0 || laporan.gagal.length > 0) {
                logger.log(
                    `[SupportCleanup] Selesai: ${laporan.dihapus.length} tiket dihapus, ` +
                    `${laporan.gagal.length} gagal, cutoff ${laporan.cutoff}`
                );
            }
        } catch (err) {
            logger.error('[SupportCleanup] Error:', err.message);
        }
    }

    function start() {
        const timerPertama = setTimeout(jalankanAman, jedaPertama);
        const timerRutin = setInterval(jalankanAman, jedaSiklus);

        if (timerPertama.unref) timerPertama.unref();
        if (timerRutin.unref) timerRutin.unref();

        logger.log(
            `[SupportCleanup] Aktif: tiket Closed > ${hariRetensi} hari dihapus otomatis ` +
            `(cek tiap ${Math.round(jedaSiklus / 60000)} menit).`
        );

        return {
            stop() {
                clearTimeout(timerPertama);
                clearInterval(timerRutin);
            }
        };
    }

    function registerRoutes(app, { authenticateToken, authorizeRole }) {
        app.post(
            '/api/support/maintenance/cleanup-closed',
            authenticateToken,
            authorizeRole('super_admin'),
            async (req, res) => {
                const query = req.query || {};
                const body = req.body || {};
                const dryRun = query.dryRun === '1' || query.dryRun === 'true' || body.dryRun === true;

                try {
                    const laporan = await cleanupClosedTickets({ dryRun });
                    res.json({ success: true, ...laporan });
                } catch (err) {
                    console.error('[SupportCleanup] Manual run gagal:', err);
                    res.status(500).json({ error: err.message });
                }
            }
        );
    }

    return {
        retentionDays: hariRetensi,
        intervalMs: jedaSiklus,
        cleanupClosedTickets,
        start,
        registerRoutes
    };
}

module.exports = createSupportTicketCleanup;
module.exports.createSupportTicketCleanup = createSupportTicketCleanup;
module.exports.hitungCutoff = hitungCutoff;
module.exports.pilihTiketKedaluwarsa = pilihTiketKedaluwarsa;
module.exports.acuanDitutup = acuanDitutup;
module.exports.HARI_MS = HARI_MS;
