/**
 * ============================================================
 * Invoice Upload Helper (PDF / Bukti Bayar / Faktur Pajak)
 * ============================================================
 * Fungsi ini dipakai bersama oleh 3 route upload invoice supaya:
 *
 *   1. Path penyimpanan dihitung dengan SATU fungsi yang sama dengan yang
 *      dipakai saat menulis ke R2 (sebelumnya: route invoice memakai
 *      "BUKTIBAYAR"/"FAKTURPAJAK" sedangkan R2 memakai "bukti-bayar"/
 *      "Faktur-Pajak" -> cek duplikat selalu salah).
 *
 *   2. Aturan duplikat seragam untuk 3 tipe:
 *      a. Invoice sudah punya pathrecorded DAN file itu masih ada di R2
 *         -> 409 Duplicate (tidak boleh ada 2 file untuk 1 faktur+tipe).
 *      b. Invoice punya path recorded tapi file HILANG dari R2
 *         -> upload diizinkan (menggantikan record basi).
 *      c. Invoice tidak punya path recorded, TAPI file di R2 sudah ada
 *         -> file "orphan" (upload lama gagal update DB) -> DI-ADOPT:
 *            path dicatat ke database tanpa upload ulang (menyembuhkan data).
 *      d. Force/overwrite -> upload dipaksakan (menimpa file).
 *
 *   3. Tidak pernah menulis NULL ke kolom path. Kalau upload gagal, path lama
 *      tetap utuh dan count tidak ikut turun (B2).
 *
 *   4. Count file (files_uploaded_count) disinkronkan dari DATABASE saja
 *      (tidak scan R2) - trigger DB tetap menjadi sumber utama, fungsi ini
 *      hanya jaga-jaga kalau trigger belum terpasang.
 * ============================================================
 */

const { buildInvoicePath, buildDocumentPath } = require('./r2-storage');

const MONTH_NAMES_ID = [
    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
];

const TYPE_CONFIG = {
    invoice: {
        fileType: 'invoice',
        pathColumn: 'invoice_pdf_path',
        folder: null, // PPN / NON ditentukan dari keterangan invoice
        label: 'Invoice PDF'
    },
    bukti_bayar: {
        fileType: 'bukti_bayar',
        pathColumn: 'bukti_bayar_path',
        folder: 'bukti-bayar',
        label: 'Bukti Bayar'
    },
    faktur_pajak: {
        fileType: 'faktur_pajak',
        pathColumn: 'faktur_pajak_path',
        folder: 'Faktur-Pajak',
        label: 'Faktur Pajak'
    }
};

function getTypeConfig(type) {
    const cfg = TYPE_CONFIG[type];
    if (!cfg) {
        const err = new Error(`Tipe file tidak dikenal: ${type}`);
        err.statusCode = 400;
        throw err;
    }
    return cfg;
}

/**
 * Hitung path target di R2 - WAJIB sama dengan path yang dipakai saat upload.
 */
function buildTargetPath(type, { invoice, filename, location }) {
    const cfg = getTypeConfig(type);

    const parts = invoice?.tanggal ? String(invoice.tanggal).split('-') : null;
    const now = new Date();
    const year = parts?.[0] || String(now.getFullYear());
    const monthNum = parts?.[1] ? String(parts[1]).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
    const day = parts?.[2] ? String(parts[2]).padStart(2, '0') : String(now.getDate()).padStart(2, '0');
    const monthName = MONTH_NAMES_ID[parseInt(monthNum, 10) - 1] || monthNum;

    let storagePath;
    let category = null;

    if (type === 'invoice') {
        category = invoice?.keterangan === 'PPN' ? 'PPN' : 'NON';
        storagePath = buildInvoicePath({ location, category, year, month: monthName, day, filename });
    } else {
        storagePath = buildDocumentPath({
            location,
            folderType: cfg.folder,
            year,
            month: monthName,
            day,
            filename
        });
    }

    return { storagePath, year, monthName, day, category, location, folder: cfg.folder };
}

/**
 * Cek duplikat dengan aturan seragam (lihat header file).
 *
 * @returns {Promise<{action: 'reject'|'adopt'|'allow', reason?: string, existingPath?: string}>}
 */
async function checkDuplicateState({ type, invoice, targetPath, overwrite = false, R2Storage }) {
    const cfg = getTypeConfig(type);
    const recordedPath = invoice?.[cfg.pathColumn] || null;

    // Force/overwrite: izinkan (file di R2 akan ditimpa oleh PutObject)
    if (overwrite) {
        return { action: 'allow', reason: 'overwrite', existingPath: recordedPath };
    }

    // Case (a): ada path recorded DAN file masih ada di R2 -> duplikat
    if (recordedPath) {
        let exists = false;
        try {
            exists = await R2Storage.checkFileExistsNoCache(recordedPath);
        } catch (err) {
            // Gagal cek -> jangan tolak, biarkan upload jalan (lenient)
            console.warn(`[UploadHelper] Gagal cek path lama (${recordedPath}): ${err.message}`);
            return { action: 'allow', reason: 'check_failed', existingPath: recordedPath };
        }

        if (exists) {
            // Kalau path lama SAMA dengan path target, file yang sama -> duplikat
            return {
                action: 'reject',
                reason: 'duplicate',
                existingPath: recordedPath
            };
        }

        // Case (b): path recorded tapi file hilang -> boleh upload ulang
        // Kalau path target sama dengan path lama, tidak perlu cek ulang
        if (recordedPath === targetPath) {
            return { action: 'allow', reason: 'stale_record', existingPath: recordedPath };
        }

        return { action: 'allow', reason: 'stale_record', existingPath: recordedPath };
    }

    // Case (c): tidak ada path recorded -> cek apakah file orphan ada di R2
    try {
        const targetExists = await R2Storage.checkFileExistsNoCache(targetPath);
        if (targetExists) {
            return { action: 'adopt', reason: 'orphan_found', existingPath: targetPath };
        }
    } catch (err) {
        console.warn(`[UploadHelper] Gagal cek path target (${targetPath}): ${err.message}`);
    }

    return { action: 'allow', reason: 'new_file', existingPath: null };
}

/**
 * Tulis hasil upload ke database.
 * - invoice_files (sumber trigger count) -> upsert pada (faktur, file_type)
 * - invoice_file_list kolom path -> PATCH (HANYA kalau ada path, tidak pernah NULL)
 *
 * @returns {Promise<{ok: boolean, invoiceFilesOk: boolean, pathOk: boolean, error: string|null}>}
 */
async function persistInvoiceFile({ supabase, faktur, type, filePath, userId }) {
    const cfg = getTypeConfig(type);
    const result = { ok: false, invoiceFilesOk: false, pathOk: false, error: null };

    // --- 1. Upsert invoice_files (REST API: bypass schema cache + merge-duplicates) ---
    try {
        const url = `${process.env.SUPABASE_URL}/rest/v1/invoice_files`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
                faktur: faktur,
                file_type: cfg.fileType,
                file_path: filePath,
                uploaded_at: new Date().toISOString(),
                uploaded_by: userId
            })
        });

        if (res.ok) {
            result.invoiceFilesOk = true;
        } else {
            const errText = await res.text();
            console.error(`[UploadHelper] invoice_files upsert gagal (${res.status}): ${errText.substring(0, 150)}`);
            result.error = `invoice_files upsert gagal (${res.status})`;
        }
    } catch (err) {
        console.error('[UploadHelper] invoice_files upsert error:', err.message);
        result.error = err.message;
    }

    // --- 2. Update kolom path di invoice_file_list (tidak pernah NULL) ---
    if (filePath) {
        try {
            const patchUrl = `${process.env.SUPABASE_URL}/rest/v1/invoice_file_list?faktur=eq.${encodeURIComponent(faktur)}`;
            const res = await fetch(patchUrl, {
                method: 'PATCH',
                headers: {
                    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    [cfg.pathColumn]: filePath,
                    uploaded_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
            });

            if (res.ok) {
                result.pathOk = true;
            } else {
                const errText = await res.text();
                console.error(`[UploadHelper] update ${cfg.pathColumn} gagal (${res.status}): ${errText.substring(0, 150)}`);
                result.error = result.error || `update path gagal (${res.status})`;
            }
        } catch (err) {
            console.error(`[UploadHelper] update ${cfg.pathColumn} error:`, err.message);
            result.error = result.error || err.message;
        }
    }

    result.ok = result.invoiceFilesOk && result.pathOk;
    return result;
}

/**
 * Sinkronkan files_uploaded_count / files_required_count dari kolom path.
 * Murah (1 SELECT + mungkin 1 UPDATE), TIDAK scan R2.
 * Dipakai sebagai pengaman bila trigger DB belum terpasang.
 */
async function syncInvoiceFileCount({ supabase, faktur, type }) {
    const cfg = getTypeConfig(type);
    try {
        const { data, error } = await supabase
            .from('invoice_file_list')
            .select('invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, keterangan, files_uploaded_count, files_required_count')
            .eq('faktur', faktur)
            .maybeSingle();

        if (error || !data) return null;

        const paths = [data.invoice_pdf_path, data.bukti_bayar_path, data.faktur_pajak_path].filter(Boolean);
        const expectedCount = paths.length;
        const expectedRequired = (data.keterangan || '').toUpperCase() === 'PPN' ? 3 : 2;

        if ((data.files_uploaded_count || 0) === expectedCount && (data.files_required_count || 0) === expectedRequired) {
            return { count: expectedCount, required: expectedRequired, updated: false };
        }

        const { error: updErr } = await supabase
            .from('invoice_file_list')
            .update({ files_uploaded_count: expectedCount, files_required_count: expectedRequired })
            .eq('faktur', faktur);

        if (updErr) {
            console.warn(`[UploadHelper] sync count gagal untuk ${faktur}: ${updErr.message}`);
            return { count: expectedCount, required: expectedRequired, updated: false };
        }

        return { count: expectedCount, required: expectedRequired, updated: true };
    } catch (err) {
        console.warn(`[UploadHelper] sync count error untuk ${faktur}: ${err.message}`);
        return null;
    }
}

/**
 * Validasi magic bytes PDF (%PDF-). Menolak file non-PDF yang hanya
 *diremux/rename jadi .pdf.
 */
function isPdfBuffer(buffer) {
    if (!buffer || buffer.length < 5) return false;
    return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

module.exports = {
    TYPE_CONFIG,
    MONTH_NAMES_ID,
    getTypeConfig,
    buildTargetPath,
    checkDuplicateState,
    persistInvoiceFile,
    syncInvoiceFileCount,
    isPdfBuffer
};
