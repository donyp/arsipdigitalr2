/**
 * ============================================================
 * Job Sinkronisasi Status File (background)
 * ============================================================
 * Menjalankan rekonsiliasi status file invoice secara berkala
 * supaya kolom files_uploaded_count & kolom path tidak pernah
 * meleset dari data sebenarnya (mis. setelah file dihapus dari
 * Storage Handler).
 *
 * Default: setiap 6 JAM, mode DB-only (cepat, tanpa cek R2).
 * Cek R2 (verify) dijalankan manual lewat endpoint
 * POST /api/invoice/reconcile-file-status dengan { "verify_r2": true }.
 *
 * Nonaktifkan: set AUTO_RECONCILE_FILE_STATUS=false di .env
 * ============================================================
 */

const { FileStatusReconciler } = require('./file-status-reconciler');

let reconciler = null;
let intervalHandle = null;
let lastRun = null;

/**
 * Inisialisasi job sinkronisasi status file.
 */
function initFileStatusSyncJob(supabase, r2Storage, options = {}) {
    const enabled = String(process.env.AUTO_RECONCILE_FILE_STATUS || 'true').toLowerCase() === 'true';
    const intervalMinutes = Number(process.env.FILE_STATUS_SYNC_INTERVAL_MINUTES) || 360; // default 6 jam

    if (!enabled) {
        console.log('[FileStatusSync] ⏭️  Nonaktif (AUTO_RECONCILE_FILE_STATUS=false)');
        return null;
    }

    reconciler = new FileStatusReconciler(supabase, r2Storage, {
        skipRecentlyUpdatedMinutes: 10
    });

    console.log(`[FileStatusSync] ✅ Aktif - jalan tiap ${intervalMinutes} menit (mode DB-only)`);

    // Jalankan sekali setelah server start (tunda 2 menit supaya tidak
    // berebut koneksi dengan proses boot)
    setTimeout(() => {
        runFileStatusSync('startup');
    }, 120000);

    intervalHandle = setInterval(() => {
        runFileStatusSync('interval');
    }, intervalMinutes * 60 * 1000);

    // Jangan tahan proses keluar karena interval ini
    if (intervalHandle.unref) intervalHandle.unref();

    return reconciler;
}

/**
 * Jalankan sinkronisasi (aman dipanggil manual).
 */
async function runFileStatusSync(trigger = 'manual') {
    if (!reconciler) {
        return { success: false, error: 'Job tidak diinisialisasi' };
    }

    if (reconciler.isRunning) {
        console.log('[FileStatusSync] ⏭️  Lewati - rekonsiliasi sebelumnya masih berjalan');
        return { success: false, error: 'Sudah berjalan' };
    }

    try {
        console.log(`[FileStatusSync] ▶️  Mulai sinkronisasi (${trigger})...`);
        const result = await reconciler.run({ verifyR2: false });

        if (result.success) {
            lastRun = { at: new Date().toISOString(), trigger, ...result };
            console.log(`[FileStatusSync] ✅ Selesai: ${result.total} invoice, ${result.countFixed} count diperbaiki, ${result.pathBackfilled} path dilengkapi, ${result.keteranganNormalized} keterangan dinormalisasi, ${result.errors} error (${result.durationSeconds} dtk)`);
        } else {
            console.error(`[FileStatusSync] ❌ Gagal: ${result.error}`);
        }

        return result;
    } catch (err) {
        console.error('[FileStatusSync] Error:', err.message);
        return { success: false, error: err.message };
    }
}

function getFileStatusSyncState() {
    return {
        active: !!reconciler,
        running: reconciler ? reconciler.isRunning : false,
        lastRun
    };
}

function stopFileStatusSyncJob() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}

module.exports = {
    initFileStatusSyncJob,
    runFileStatusSync,
    getFileStatusSyncState,
    stopFileStatusSyncJob
};
