/**
 * ============================================================
 * Upload Queue - Bounded Concurrency
 * ============================================================
 * Masalah yang diselesaikan (B1):
 *   Upload Invoice PDF sebelumnya dijalankan dengan `setImmediate()` sehingga
 *   server membalas "sukses" duluan lalu melanjut upload ke R2 di background.
 *   Untuk bulk 200+ file, buffer (multer memoryStorage) tertahan di RAM
 *   sampai semua upload selesai -> hundreds of MB, PM2 me-restart worker
 *   (max_memory_restart 1G) -> upload hilang tanpa error ke user.
 *
 * Solusi:
 *   - Semua upload lewat queue dengan batas konkurensi (default 4).
 *   - Request MENUNGGU upload selesai -> user tahu file benar-benar masuk.
 *   - Memakai gate in-flight di level route (lihat uploadInFlightGate) supaya
 *     jumlah request upload yang sedang diproses selalu terbatas.
 *
 * Tidak mengubah perilaku bisnis, hanya mengatur tekanan (backpressure).
 * ============================================================
 */

class UploadQueue {
    /**
     * @param {Object} options
     * @param {number} options.maxConcurrent - jumlah upload R2 yang boleh jalan bersamaan
     * @param {number} options.maxQueued - jumlah antrean maksimum sebelum ditolak (429)
     * @param {number} options.maxWaitMs - batas tunggu antrean (ms)
     */
    constructor(options = {}) {
        this.maxConcurrent = options.maxConcurrent ?? 4;
        this.maxQueued = options.maxQueued ?? 500;
        this.maxWaitMs = options.maxWaitMs ?? 120000;
        this.active = 0;
        this.pending = 0;
        this.completed = 0;
        this.failed = 0;
        this._queue = [];
    }

    get stats() {
        return {
            active: this.active,
            pending: this.pending,
            completed: this.completed,
            failed: this.failed,
            maxConcurrent: this.maxConcurrent
        };
    }

    /**
     * Jalankan task di dalam queue.
     * @param {Function} taskFn - async function
     * @returns {Promise<any>} hasil task
     */
    async run(taskFn) {
        if (this.active >= this.maxConcurrent) {
            if (this.pending >= this.maxQueued) {
                const err = new Error('Server sedang meng-upload banyak file, coba lagi beberapa saat lagi.');
                err.code = 'UPLOAD_QUEUE_FULL';
                err.statusCode = 503;
                throw err;
            }

            this.pending++;
            let timer = null;
            try {
                await new Promise((resolve, reject) => {
                    timer = setTimeout(() => {
                        const idx = this._queue.findIndex(q => q.reject === reject);
                        if (idx !== -1) this._queue.splice(idx, 1);
                        const timeoutErr = new Error('Waktu tunggu antrean upload habis, coba lagi.');
                        timeoutErr.code = 'UPLOAD_QUEUE_TIMEOUT';
                        timeoutErr.statusCode = 503;
                        reject(timeoutErr);
                    }, this.maxWaitMs);

                    this._queue.push({
                        resolve: () => { if (timer) clearTimeout(timer); resolve(); },
                        reject: (e) => { if (timer) clearTimeout(timer); reject(e); }
                    });
                });
            } finally {
                this.pending--;
            }
        }

        this.active++;
        try {
            const result = await taskFn();
            this.completed++;
            return result;
        } catch (err) {
            this.failed++;
            throw err;
        } finally {
            this.active--;
            const next = this._queue.shift();
            if (next) next.resolve();
        }
    }
}

module.exports = { UploadQueue };
