/**
 * ============================================================
 * Invoice File Status - SATU SUMBER KEBENARAN
 * ============================================================
 * Masalah yang diperbaiki:
 *   Dulu hitungan file (files_uploaded_count) ditulis oleh 3 pihak yang
 *   bisa saling menimpa:
 *     1. Trigger DB di invoice_files      -> COUNT(DISTINCT file_type)
 *     2. Trigger DB di invoice_file_list  -> jumlah kolom path terisi
 *     3. Kode aplikasi                    -> kombinasi keduanya
 *   Karena definisinya berbeda, status (0/3, 1/3, ...) sering tidak akurat
 *   dan tombol download di dashboard tidak sinkron dengan statusnya.
 *
 * ATURAN BARU (satu definisi, dipakai semua pihak):
 *   - Untuk tiap tipe file, file dianggap ADA bila:
 *       (a) kolom path di invoice_file_list terisi, ATAU
 *       (b) ada baris di invoice_files dengan file_type tersebut
 *     (menggunakan OR per tipe, bukan penjumlahan -> tidak ada double count)
 *   - count = jumlah tipe yang ADA
 *   - required = 3 bila keterangan PPN (Invoice PDF + Bukti Bayar + Faktur Pajak)
 *                2 bila NON  (Invoice PDF + Bukti Bayar)
 *
 * Tidak ada perubahan skema. Fungsi ini hanya MENGHITUNG, tidak menulis.
 * ============================================================
 */

const FILE_TYPES = ['invoice', 'bukti_bayar', 'faktur_pajak'];

// Mapping kolom path di invoice_file_list per tipe file
const PATH_COLUMN_BY_TYPE = {
    invoice: 'invoice_pdf_path',
    bukti_bayar: 'bukti_bayar_path',
    faktur_pajak: 'faktur_pajak_path'
};

/**
 * Normalisasi keterangan invoice.
 * 'PPN' -> 'PPN', 'ppn ' -> 'PPN', 'NON'/'NON_PPN' -> 'NON'
 * Dipakai agar frontend (toUpperCase) dan database (case-sensitive)
 * selalu punya pendapat yang sama.
 */
function normalizeKeterangan(value) {
    if (value === null || value === undefined) return 'NON';
    const v = String(value).trim().toUpperCase();
    if (v === 'PPN') return 'PPN';
    if (v === 'NON' || v === 'NON_PPN') return 'NON';
    return v || 'NON';
}

/**
 * Jumlah file yang dibutuhkan:
 *   PPN  -> 3 (Invoice PDF + Bukti Bayar + Faktur Pajak)
 *   NON  -> 2 (Invoice PDF + Bukti Bayar)
 */
function requiredFileCount(keterangan) {
    return normalizeKeterangan(keterangan) === 'PPN' ? 3 : 2;
}

/**
 * Hitung status file dari data invoice + daftar tipe di invoice_files.
 *
 * @param {Object}  params
 * @param {Object}  params.invoice - baris invoice_file_list (butuh kolom path + keterangan)
 * @param {Array}   params.invoiceFileTypes - array file_type dari invoice_files untuk faktur ini
 * @returns {{count:number, required:number, perType:Object, isComplete:boolean, types:Array}}
 */
function computeFileStatus({ invoice = {}, invoiceFileTypes = [] } = {}) {
    const typeSet = new Set(
        (invoiceFileTypes || [])
            .filter(Boolean)
            .map(t => String(t).trim().toLowerCase())
    );

    const perType = {};
    for (const type of FILE_TYPES) {
        const column = PATH_COLUMN_BY_TYPE[type];
        const hasPath = !!(invoice[column] && String(invoice[column]).trim() !== '');
        const hasRecord = typeSet.has(type);
        perType[type] = hasPath || hasRecord;
    }

    const required = requiredFileCount(invoice.keterangan);

    // PENTING: yang dihitung HANYA file yang WAJIB untuk tipe invoice ini.
    // PPN  -> invoice + bukti bayar + faktur pajak (3)
    // NON -> invoice + bukti bayar (2)
    // Invoice NON yang punya "faktur pajak sisa" tidak boleh dihitung,
    // kalau tidak invoice tanpa Invoice PDF tetap terlihat "lengkap".
    const requiredTypes = required === 3
        ? ['invoice', 'bukti_bayar', 'faktur_pajak']
        : ['invoice', 'bukti_bayar'];

    const count = requiredTypes.reduce((sum, type) => sum + (perType[type] ? 1 : 0), 0);
    const missing = requiredTypes.filter(type => !perType[type]);

    return {
        count,
        required,
        perType,
        types: FILE_TYPES.filter(t => perType[t]),
        requiredTypes,
        missing,
        isComplete: count >= required
    };
}

/**
 * Ambil daftar file_type dari invoice_files untuk satu faktur.
 */
async function getInvoiceFileTypes(supabase, faktur) {
    try {
        const { data, error } = await supabase
            .from('invoice_files')
            .select('file_type')
            .eq('faktur', faktur);

        if (error) {
            console.warn(`[FileStatus] Gagal ambil invoice_files untuk ${faktur}: ${error.message}`);
            return [];
        }
        return (data || []).map(r => r.file_type);
    } catch (err) {
        console.warn(`[FileStatus] Error ambil invoice_files untuk ${faktur}: ${err.message}`);
        return [];
    }
}

/**
 * Hitung + tulis status file ke invoice_file_list (hanya kalau berubah).
 *
 * @param {Object} params
 * @param {Object} params.supabase
 * @param {string} params.faktur
 * @param {Object} [params.invoice] - bila tidak diberikan, diambil dari DB
 * @returns {Promise<{count:number, required:number, updated:boolean}|null>}
 */
async function syncInvoiceFileStatus({ supabase, faktur, invoice = null }) {
    try {
        let inv = invoice;

        if (!inv) {
            const { data, error } = await supabase
                .from('invoice_file_list')
                .select('invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, keterangan, files_uploaded_count, files_required_count')
                .eq('faktur', faktur)
                .maybeSingle();

            if (error || !data) return null;
            inv = data;
        }

        const invoiceFileTypes = await getInvoiceFileTypes(supabase, faktur);
        const status = computeFileStatus({ invoice: inv, invoiceFileTypes });

        const currentCount = inv.files_uploaded_count || 0;
        const currentRequired = inv.files_required_count || 0;

        if (currentCount === status.count && currentRequired === status.required) {
            return { count: status.count, required: status.required, updated: false };
        }

        const { error: updErr } = await supabase
            .from('invoice_file_list')
            .update({
                files_uploaded_count: status.count,
                files_required_count: status.required
            })
            .eq('faktur', faktur);

        if (updErr) {
            console.warn(`[FileStatus] Gagal update status ${faktur}: ${updErr.message}`);
            return { count: status.count, required: status.required, updated: false };
        }

        return { count: status.count, required: status.required, updated: true };
    } catch (err) {
        console.warn(`[FileStatus] Error sync status ${faktur}: ${err.message}`);
        return null;
    }
}

/**
 * Bersihkan record file yang sudah dihapus dari storage:
 *   - kosongkan kolom path (bila cocok)
 *   - hapus baris invoice_files
 *   - tulis ulang count & required
 *
 * Dipakai oleh: hapus file dari Storage Handler, clear-file dari dashboard,
 * dan self-healing saat download menemukan file hilang di R2.
 *
 * @param {Object} params
 * @param {Object} params.supabase
 * @param {string} params.faktur
 * @param {string} params.fileType - 'invoice' | 'bukti_bayar' | 'faktur_pajak'
 * @param {string} [params.deletedPath] - path yang dihapus (untuk pengecekan kecocokan)
 * @returns {Promise<{cleared:boolean, count:number, required:number}>}
 */
async function clearInvoiceFileRecord({ supabase, faktur, fileType, deletedPath = null }) {
    const column = PATH_COLUMN_BY_TYPE[fileType];
    if (!column) {
        return { cleared: false, count: 0, required: 0 };
    }

    const { data: invoice, error } = await supabase
        .from('invoice_file_list')
        .select(`id, ${column}, invoice_pdf_path, bukti_bayar_path, faktur_pajak_path, keterangan, files_uploaded_count, files_required_count`)
        .eq('faktur', faktur)
        .maybeSingle();

    if (error || !invoice) {
        return { cleared: false, count: 0, required: 0 };
    }

    // Kalau path yang dihapus tidak sama dengan path yang tercatat,
    // jangan sentuh kolom path (mungkin file sudah diganti yang baru).
    const recordedPath = invoice[column];
    if (deletedPath && recordedPath && recordedPath !== deletedPath) {
        // tetap hapus record invoice_files (file lama sudah tidak ada)
        await deleteInvoiceFileRow({ supabase, faktur, fileType });
        const status = await syncInvoiceFileStatus({ supabase, faktur, invoice });
        return { cleared: false, count: status?.count ?? 0, required: status?.required ?? 0 };
    }

    // 1. Kosongkan kolom path (+ timestamp bila ada)
    const updateData = { [column]: null, updated_at: new Date().toISOString() };

    const { error: updErr } = await supabase
        .from('invoice_file_list')
        .update(updateData)
        .eq('faktur', faktur);

    if (updErr) {
        console.warn(`[FileStatus] Gagal kosongkan ${column} untuk ${faktur}: ${updErr.message}`);
    }

    // 2. Hapus baris invoice_files (supaya trigger tidak menghitungnya lagi)
    await deleteInvoiceFileRow({ supabase, faktur, fileType });

    // 3. Tulis ulang count & required
    const status = await syncInvoiceFileStatus({ supabase, faktur, invoice });

    return {
        cleared: !updErr,
        count: status?.count ?? 0,
        required: status?.required ?? 0
    };
}

/**
 * Hapus baris invoice_files untuk (faktur, file_type).
 */
async function deleteInvoiceFileRow({ supabase, faktur, fileType }) {
    try {
        const { error } = await supabase
            .from('invoice_files')
            .delete()
            .eq('faktur', faktur)
            .eq('file_type', fileType);

        if (error) {
            console.warn(`[FileStatus] Gagal hapus invoice_files ${faktur}/${fileType}: ${error.message}`);
            return false;
        }
        return true;
    } catch (err) {
        console.warn(`[FileStatus] Error hapus invoice_files ${faktur}/${fileType}: ${err.message}`);
        return false;
    }
}

/**
 * Cari faktur yang memiliki path tertentu (dipakai saat file dihapus
 * dari Storage Handler, supaya tidak perlu menebak format path).
 *
 * @returns {Promise<Array<{faktur:string, fileType:string, column:string}>>}
 */
async function findInvoicesByPath({ supabase, filePath }) {
    const results = [];
    if (!filePath) return results;

    for (const [fileType, column] of Object.entries(PATH_COLUMN_BY_TYPE)) {
        try {
            const { data, error } = await supabase
                .from('invoice_file_list')
                .select('faktur')
                .eq(column, filePath);

            if (!error && data && data.length > 0) {
                data.forEach(row => {
                    results.push({ faktur: row.faktur, fileType, column });
                });
            }
        } catch (err) {
            console.warn(`[FileStatus] Error cari invoice by path (${column}): ${err.message}`);
        }
    }

    return results;
}

/**
 * Cari SEMUA invoice yang punya path di dalam sebuah folder (prefix).
 * Dipakai saat hapus folder di Storage Handler: cukup 1 query per kolom
 * (3 query total), bukan 3 query per file.
 *
 * @returns {Promise<Array<{faktur:string, fileType:string, column:string, path:string}>>}
 */
async function findInvoicesByPrefix({ supabase, prefix }) {
    const results = [];
    if (!prefix) return results;

    for (const [fileType, column] of Object.entries(PATH_COLUMN_BY_TYPE)) {
        try {
            const { data, error } = await supabase
                .from('invoice_file_list')
                .select(`faktur, ${column}`)
                .like(column, `${prefix}%`);

            if (!error && data && data.length > 0) {
                data.forEach(row => {
                    if (row[column]) {
                        results.push({
                            faktur: row.faktur,
                            fileType,
                            column,
                            path: row[column]
                        });
                    }
                });
            }
        } catch (err) {
            console.warn(`[FileStatus] Error cari invoice by prefix (${column}): ${err.message}`);
        }
    }

    return results;
}

module.exports = {
    FILE_TYPES,
    PATH_COLUMN_BY_TYPE,
    normalizeKeterangan,
    requiredFileCount,
    computeFileStatus,
    getInvoiceFileTypes,
    syncInvoiceFileStatus,
    clearInvoiceFileRecord,
    deleteInvoiceFileRow,
    findInvoicesByPath,
    findInvoicesByPrefix
};
