// ============================================================
// Diagnostik koneksi bot WhatsApp (helper pure, tanpa dependensi)
// ============================================================
// Dipisah dari services/whatsapp-baileys.js karena library Baileys
// hanya bisa di-import sebagai ESM (tidak bisa di-require di unit test).
// Semua logika "kenapa QR tidak muncul" ada di sini -> bisa diuji.
// ============================================================

/**
 * Saran berdasarkan kode error dari WhatsApp.
 * @param {number|null} statusCode
 * @param {string} message
 * @param {object} opts - { hasCreds, recentlyReset }
 * @returns {string|null}
 */
function getDisconnectHint(statusCode, message, opts = {}) {
    const recentlyReset = !!opts.recentlyReset;

    if (statusCode === 401) {
        if (recentlyReset) {
            return 'Sesi bot sudah dibuat BARU (reset < 20 menit lalu) tapi WhatsApp tetap menolak (401) -> berarti IP server diblokir/blacklist. Solusi: ganti IP (VPS lain) atau pakai IP residential, lalu scan QR ulang.';
        }
        if (opts.hasCreds) {
            return 'WhatsApp menolak koneksi (401). Sesi tersimpan sudah tidak valid -> klik "Reset Sesi Bot" lalu scan QR ulang. Kalau tetap 401 setelah reset, berarti IP server diblokir -> ganti IP.';
        }
        return 'WhatsApp menolak koneksi (401). Umumnya IP server diblokir/blacklist. Solusi: ganti IP (VPS lain) atau jalankan dari jaringan dengan IP residential.';
    }
    if (statusCode === 403) {
        return 'WhatsApp menolak koneksi (403). IP server kemungkinan diblokir untuk akun WhatsApp Web. Coba IP lain atau tunggu 24-48 jam.';
    }
    if (statusCode === 405) {
        return 'WhatsApp menolak metode koneksi (405). Library Baileys perlu diperbarui ke versi terbaru.';
    }
    if (statusCode === 428) {
        return 'WhatsApp meminta versi Web lebih baru (428). Perbarui library Baileys, lalu scan QR ulang.';
    }
    if (statusCode === 515) {
        return 'WhatsApp meminta restart (515). Klik "Putuskan & QR Baru" untuk membuat sesi baru.';
    }
    if (!statusCode && message) {
        return 'Koneksi ke server WhatsApp terputus. Periksa jaringan server (firewall / DNS / outbound WebSocket ke web.whatsapp.com).';
    }
    return null;
}

/**
 * Susun objek diagnostik lengkap.
 * @param {object} state - { connected, ready, connectionState, lastError, lastDisconnectAt, lastQrAt, connectAttempts, phone }
 * @param {object} session - { sessionPath, sessionExists, sessionFileCount }
 * @returns {object}
 */
function buildDiagnostics(state = {}, session = {}) {
    const lastError = state.lastError || null;
    const statusCode = lastError ? lastError.statusCode : null;
    const message = lastError ? lastError.message : null;

    // Sesi baru saja di-reset (< 20 menit lalu)? Kalau tetap 401 -> kemungkinan besar IP diblokir
    const sessionResetAt = state.sessionResetAt || null;
    const recentlyReset = !!sessionResetAt && (Date.now() - sessionResetAt) < 20 * 60 * 1000;

    let hint = getDisconnectHint(statusCode, message, {
        hasCreds: (session.sessionFileCount || 0) > 0,
        recentlyReset
    });

    // Belum ada error tapi tetap tidak ada QR -> jangan diam, beri arah
    if (!hint && !state.connected && !state.qrAvailable) {
        if (session.sessionFileCount > 0) {
            hint = 'Sesi bot sudah ada tapi belum tersambung ke WhatsApp. Klik "Reset Sesi Bot" lalu scan QR ulang, atau cek "Diagnosa Koneksi".';
        } else {
            hint = 'Server WhatsApp belum siap. Tunggu beberapa detik lalu klik "Tampilkan QR" lagi, atau cek "Diagnosa Koneksi".';
        }
    }

    return {
        connected: !!state.connected,
        ready: !!state.ready,
        connectionState: state.connectionState || 'unknown',
        qrAvailable: !!state.qrAvailable,
        lastError,
        lastDisconnectAt: state.lastDisconnectAt || null,
        lastQrAt: state.lastQrAt || null,
        connectAttempts: state.connectAttempts || 0,
        sessionResetAt,
        recentlyReset,
        phone: state.phone || null,
        sessionPath: session.sessionPath || null,
        sessionExists: !!session.sessionExists,
        sessionFileCount: session.sessionFileCount || 0,
        hasCreds: (session.sessionFileCount || 0) > 0,
        hint
    };
}

module.exports = {
    getDisconnectHint,
    buildDiagnostics
};
