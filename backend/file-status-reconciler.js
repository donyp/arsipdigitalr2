/**
 * ============================================================
 * Reconciler Status File Invoice
 * ============================================================
 * Menyamakan kembali:
 *   - files_uploaded_count / files_required_count  (kolom cache)
 *   - kolom path (invoice_pdf_path, bukti_bayar_path, faktur_pajak_path)
 *   - baris di invoice_files
 *   - keterangan (normalisasi kapitalisasi PPN/NON)
 *
 * Semua perhitungan memakai SATU sumber: invoice-file-status.js
 *
 * MODE 1 (default, aman & cepat - hanya DB):
 *   - hitung status dari kolom path + invoice_files
 *   - backfill kolom path yang kosong dari invoice_files
 *   - tulis count/required yang benar
 *   - normalisasi keterangan (kapitalisasi saja)
 *   - ~8.000 invoice selesai dalam hitungan detik
 *
 * MODE 2 (verify_r2 = true, paling akurat - butuh waktu):
 *   - selain hal di atas, setiap file dicek keberadaannya di R2 (HEAD)
 *   - file yang sudah hilang di storage -> path dikosongkan, record dihapus,
 *     count diperbarui (membuat tombol download hilang dengan benar)
 *   - ~8.000 file bisa memakan 10-30 menit
 * ============================================================
 */

const {
    computeFileStatus,
    normalizeKeterangan,
    PATH_COLUMN_BY_TYPE,
    FILE_TYPES
} = require('./invoice-file-status');

class FileStatusReconciler {
    constructor(supabaseClient, r2Storage = null, options = {}) {
        this.supabase = supabaseClient;
        this.r2Storage = r2Storage;
        // Invoice yang baru saja di-update dilewati (upload mungkin sedang jalan)
        this.skipRecentlyUpdatedMinutes = options.skipRecentlyUpdatedMinutes ?? 10;
        this.isRunning = false;
    }

    /**
     * Jalankan rekonsiliasi.
     *
     * @param {Object} opts
     * @param {boolean} opts.verifyR2 - cek keberadaan file di R2 (lebih akurat, lambat)
     * @param {boolean} opts.backfillPaths - isi kolom path yang kosong dari invoice_files
     * @param {boolean} opts.normalizeKeterangan - kapitalisasi PPN/NON
     * @param {Function} opts.onProgress - callback(info) untuk progres
     */
    async run(opts = {}) {
        if (this.isRunning) {
            return { success: false, error: 'Rekonsiliasi sedang berjalan' };
        }

        const {
            verifyR2 = false,
            backfillPaths = true,
            normalizeKeterangan: doNormalize = true,
            onProgress = null
        } = opts;

        this.isRunning = true;
        const startedAt = Date.now();

        const stats = {
            total: 0,
            checked: 0,
            skipped: 0,
            countFixed: 0,
            pathBackfilled: 0,
            pathCleared: 0,
            keteranganNormalized: 0,
            r2Checked: 0,
            r2Missing: 0,
            errors: 0
        };

        try {
            // ---- 1. Ambil semua invoice ----
            const { data: invoices, error: invErr } = await this.supabase
                .from('invoice_file_list')
                .select('faktur, keterangan, invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, files_uploaded_count, files_required_count, updated_at');

            if (invErr) {
                return { success: false, error: invErr.message };
            }

            stats.total = (invoices || []).length;

            // ---- 2. Ambil semua record invoice_files (1 query) ----
            const { data: allFiles } = await this.supabase
                .from('invoice_files')
                .select('faktur, file_type, file_path');

            const filesByFaktur = {};
            (allFiles || []).forEach(f => {
                if (!f.faktur) return;
                if (!filesByFaktur[f.faktur]) filesByFaktur[f.faktur] = [];
                filesByFaktur[f.faktur].push(f);
            });

            if (onProgress) onProgress({ phase: 'scan', total: stats.total });

            // ---- 3. Proses per invoice ----
            for (const inv of invoices || []) {
                stats.checked++;

                // Lewati invoice yang baru saja berubah (upload mungkin sedang jalan)
                if (inv.updated_at) {
                    const ageMs = Date.now() - new Date(inv.updated_at).getTime();
                    if (ageMs < this.skipRecentlyUpdatedMinutes * 60 * 1000) {
                        stats.skipped++;
                        continue;
                    }
                }

                try {
                    const files = filesByFaktur[inv.faktur] || [];
                    const types = files.map(f => f.file_type);

                    // --- Backfill kolom path yang kosong dari invoice_files ---
                    const pathPatch = {};
                    if (backfillPaths) {
                        for (const [type, column] of Object.entries(PATH_COLUMN_BY_TYPE)) {
                            if (!inv[column] && types.includes(type)) {
                                const rec = files.find(f => f.file_type === type);
                                if (rec && rec.file_path) {
                                    pathPatch[column] = rec.file_path;
                                    stats.pathBackfilled++;
                                }
                            }
                        }
                    }

                    // --- Verifikasi keberadaan di R2 (opsional) ---
                    let r2MissingTypes = [];
                    if (verifyR2 && this.r2Storage) {
                        const merged = { ...inv, ...pathPatch };

                        for (const [type, column] of Object.entries(PATH_COLUMN_BY_TYPE)) {
                            const filePath = merged[column];
                            if (!filePath) continue;
                            stats.r2Checked++;
                            try {
                                const exists = await this.r2Storage.checkFileExistsNoCache(filePath);
                                if (!exists) {
                                    r2MissingTypes.push({ type, column, filePath });
                                    stats.r2Missing++;
                                }
                            } catch (err) {
                                // Gagal cek (network) -> jangan dianggap hilang
                                stats.errors++;
                            }
                        }
                    }

                    // --- Terapkan perubahan ---
                    const updateData = {};

                    // Path yang kosong di R2 -> kosongkan juga di DB
                    for (const missing of r2MissingTypes) {
                        updateData[missing.column] = null;
                        stats.pathCleared++;

                        // hapus record invoice_files-nya
                        try {
                            await this.supabase
                                .from('invoice_files')
                                .delete()
                                .eq('faktur', inv.faktur)
                                .eq('file_type', missing.type);
                        } catch (delErr) {
                            stats.errors++;
                        }
                    }

                    // Terapkan backfill path (hanya kalau tidak ada yang dikosongkan)
                    for (const [column, value] of Object.entries(pathPatch)) {
                        if (!(column in updateData)) {
                            updateData[column] = value;
                        }
                    }

                    // Hitung status final (dengan path yang sudah diperbaiki)
                    const effectiveInvoice = { ...inv, ...updateData };
                    const effectiveTypes = r2MissingTypes.length
                        ? types.filter(t => !r2MissingTypes.some(m => m.type === t))
                        : types;

                    const status = computeFileStatus({
                        invoice: effectiveInvoice,
                        invoiceFileTypes: effectiveTypes
                    });

                    if ((inv.files_uploaded_count || 0) !== status.count ||
                        (inv.files_required_count || 0) !== status.required) {
                        updateData.files_uploaded_count = status.count;
                        updateData.files_required_count = status.required;
                        stats.countFixed++;
                    }

                    // --- Normalisasi keterangan (kapitalisasi saja) ---
                    if (doNormalize && inv.keterangan) {
                        const raw = String(inv.keterangan).trim();
                        const upper = raw.toUpperCase();
                        if ((upper === 'PPN' || upper === 'NON') && raw !== upper) {
                            updateData.keterangan = upper;
                            stats.keteranganNormalized++;
                        }
                    }

                    if (Object.keys(updateData).length > 0) {
                        updateData.updated_at = new Date().toISOString();
                        const { error: updErr } = await this.supabase
                            .from('invoice_file_list')
                            .update(updateData)
                            .eq('faktur', inv.faktur);

                        if (updErr) {
                            stats.errors++;
                            console.error(`[Reconciler] Gagal update ${inv.faktur}: ${updErr.message}`);
                        }
                    }
                } catch (itemErr) {
                    stats.errors++;
                    console.error(`[Reconciler] Error proses ${inv.faktur}: ${itemErr.message}`);
                }

                if (onProgress && stats.checked % 500 === 0) {
                    onProgress({ phase: 'process', checked: stats.checked, total: stats.total, fixed: stats.countFixed });
                }
            }

            const duration = Date.now() - startedAt;

            return {
                success: true,
                verifyR2,
                duration,
                durationSeconds: Math.round(duration / 1000),
                ...stats
            };

        } catch (error) {
            console.error('[Reconciler] Error:', error);
            return { success: false, error: error.message };
        } finally {
            this.isRunning = false;
        }
    }
}

module.exports = { FileStatusReconciler };
