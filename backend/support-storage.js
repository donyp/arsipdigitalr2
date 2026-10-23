// ============================================
// Penyimpanan lampiran tiket support (Cloudflare R2)
//
// Semua foto tiket disimpan di folder khusus:
//     support-tickets/<ticket_id>/<file>
//
// Nilai yang disimpan di kolom support_attachments.file_path adalah KEY R2
// (bukan path lokal). Data lama yang masih berupa path lokal tetap bisa
// dibaca/dihapus agar tidak ada lampiran yang "hilang" setelah migrasi.
// ============================================

const path = require('path');
const fs = require('fs');
const R2Storage = require('./r2-storage');

const LEGACY_LOCAL_ROOT = path.join(__dirname, '..', 'uploads', 'support');

function getPrefix() {
    const prefix = (process.env.SUPPORT_ATTACHMENT_PREFIX || 'support-tickets')
        .replace(/^\/+|\/+$/g, '');
    return prefix || 'support-tickets';
}

const SUPPORT_PREFIX = getPrefix();

function buildFolder(ticketId) {
    return `${SUPPORT_PREFIX}/${ticketId}/`;
}

function buildKey(ticketId, storedFileName) {
    return `${buildFolder(ticketId)}${storedFileName}`;
}

function isR2Key(filePath) {
    return typeof filePath === 'string' && filePath.startsWith(`${SUPPORT_PREFIX}/`);
}

function isLegacyLocalPath(filePath) {
    if (typeof filePath !== 'string' || !filePath) return false;
    if (isR2Key(filePath)) return false;
    return /^[a-zA-Z]:[\\/]/.test(filePath) || path.isAbsolute(filePath);
}

/**
 * Simpan buffer foto ke R2.
 * @returns {Promise<string>} key R2 yang harus disimpan ke DB
 */
async function saveAttachmentFile(buffer, ticketId, storedFileName, contentType) {
    const key = buildKey(ticketId, storedFileName);
    const hasil = await R2Storage.uploadFile(buffer, key, {
        contentType: contentType || 'application/octet-stream',
        ticketId: String(ticketId),
        kind: 'support-attachment'
    });

    return (hasil && hasil.storagePath) || key;
}

/**
 * Baca isi lampiran (R2 atau file lokal lama).
 * @returns {Promise<Buffer>}
 */
async function readAttachmentFile(filePath) {
    if (isLegacyLocalPath(filePath)) {
        return fs.readFileSync(filePath);
    }

    if (!isR2Key(filePath)) {
        throw new Error('Lokasi lampiran tidak dikenali');
    }

    return R2Storage.downloadFile(filePath);
}

/**
 * Hapus satu lampiran. File yang sudah tidak ada dianggap sukses.
 */
async function deleteAttachmentFile(filePath) {
    if (!filePath) return { deleted: false, reason: 'empty-path' };

    if (isLegacyLocalPath(filePath)) {
        try {
            fs.unlinkSync(filePath);
            return { deleted: true };
        } catch (err) {
            if (err.code === 'ENOENT') return { deleted: false, reason: 'not-found' };
            throw err;
        }
    }

    if (!isR2Key(filePath)) {
        // Jangan pernah menghapus key di luar folder lampiran support.
        throw new Error('Menolak menghapus objek di luar folder support-tickets');
    }

    await R2Storage.deleteFile(filePath);
    return { deleted: true };
}

/**
 * Hapus seluruh isi folder tiket (termasuk file yatim yang tidak tercatat di DB).
 * @returns {Promise<{keys: string[], gagal: Array<{key: string, error: string}>}>}
 */
async function deleteTicketFolder(ticketId) {
    const hasil = { keys: [], gagal: [] };

    try {
        const daftar = await R2Storage.listFiles(buildFolder(ticketId));
        for (const obj of daftar || []) {
            if (!obj || !obj.key) continue;
            try {
                await deleteAttachmentFile(obj.key);
                hasil.keys.push(obj.key);
            } catch (err) {
                hasil.gagal.push({ key: obj.key, error: err.message });
            }
        }
    } catch (err) {
        // Folder kosong / R2 tidak aktif: bukan kegagalan fatal.
        console.warn(`[SupportStorage] Gagal list folder ${buildFolder(ticketId)}:`, err.message);
    }

    // Sisa file lokal dari versi lama (sebelum pindah ke R2)
    const legacyFolder = path.join(LEGACY_LOCAL_ROOT, ticketId);
    try {
        if (fs.existsSync(legacyFolder)) {
            fs.rmSync(legacyFolder, { recursive: true, force: true });
        }
    } catch (err) {
        console.warn('[SupportStorage] Gagal hapus folder lokal lama:', err.message);
    }

    return hasil;
}

module.exports = {
    SUPPORT_PREFIX,
    buildFolder,
    buildKey,
    isR2Key,
    isLegacyLocalPath,
    saveAttachmentFile,
    readAttachmentFile,
    deleteAttachmentFile,
    deleteTicketFolder
};
