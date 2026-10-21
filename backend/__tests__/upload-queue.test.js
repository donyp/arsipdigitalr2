/**
 * ============================================================
 * Unit Test: Upload Queue (backpressure B1)
 * ============================================================
 * Upload queue membatasi jumlah upload R2 yang berjalan bersamaan supaya
 * buffer file tidak menumpuk di RAM saat bulk 200+ file.
 * ============================================================
 */

const { UploadQueue } = require('../upload-queue.js');

describe('Upload Queue', () => {

    test('semua task selesai dan hasilnya benar', async () => {
        const q = new UploadQueue({ maxConcurrent: 3 });
        const results = await Promise.all(
            Array.from({ length: 20 }, (_, i) => q.run(async () => i))
        );
        expect(results.length).toBe(20);
        expect(results[0]).toBe(0);
        expect(results[19]).toBe(19);
    });

    test('konkurensi tidak melebihi maxConcurrent', async () => {
        const q = new UploadQueue({ maxConcurrent: 3 });
        let active = 0;
        let maxActive = 0;

        const tasks = [];
        for (let i = 0; i < 30; i++) {
            tasks.push(q.run(async () => {
                active++;
                maxActive = Math.max(maxActive, active);
                await new Promise(r => setTimeout(r, 10));
                active--;
            }));
        }
        await Promise.all(tasks);

        expect(maxActive).toBeLessThanOrEqual(3);
        expect(maxActive).toBeGreaterThan(1); // benar-benar paralel
    });

    test('antrean penuh -> error dengan status 503', async () => {
        const q = new UploadQueue({ maxConcurrent: 1, maxQueued: 1 });
        const slow = q.run(() => new Promise(r => setTimeout(r, 100)));
        await new Promise(r => setTimeout(r, 10));

        const pending = q.run(() => Promise.resolve());
        let err = null;
        try {
            await q.run(() => Promise.resolve());
        } catch (e) {
            err = e;
        }

        expect(err).not.toBeNull();
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('UPLOAD_QUEUE_FULL');

        await slow;
        await pending;
    });

    test('error di dalam task diteruskan ke pemanggil', async () => {
        const q = new UploadQueue({ maxConcurrent: 2 });
        await expect(q.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        // queue tetap bisa dipakai setelah error
        await expect(q.run(async () => 'ok')).resolves.toBe('ok');
    });

    test('statistik queue akurat', async () => {
        const q = new UploadQueue({ maxConcurrent: 2 });
        await q.run(async () => 1);
        await q.run(async () => 2);
        const s = q.stats;
        expect(s.completed).toBe(2);
        expect(s.failed).toBe(0);
        expect(s.active).toBe(0);
    });

    test('waktu tunggu di antrean dibatasi (timeout)', async () => {
        const q = new UploadQueue({ maxConcurrent: 1, maxWaitMs: 50 });
        const slow = q.run(() => new Promise(r => setTimeout(r, 200)));
        await new Promise(r => setTimeout(r, 10));

        let err = null;
        try {
            await q.run(() => Promise.resolve());
        } catch (e) {
            err = e;
        }
        expect(err).not.toBeNull();
        expect(err.code).toBe('UPLOAD_QUEUE_TIMEOUT');
        await slow;
    });
});
