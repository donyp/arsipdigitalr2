/**
 * Tes retensi tiket support:
 *  - Lampiran disimpan di R2 folder khusus (support-tickets/<ticketId>/)
 *  - Tiket berstatus Closed >= 3 hari dihapus permanen (data + foto)
 *  - Tiket yang dibuka kembali tidak ikut terhapus (closed_at dikosongkan)
 *
 * Tes fungsional memakai Supabase & storage palsu (tanpa DB / R2 nyata).
 */

const fs = require('fs');
const path = require('path');

// r2-storage membuat S3 client & worker saat di-require; mock agar tes ringan.
jest.mock('../r2-storage', () => ({
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: jest.fn(),
    listFiles: jest.fn()
}));

const ROOT = path.join(__dirname, '..', '..');
const baca = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const createCleanup = require('../support-ticket-retention');
const { hitungCutoff, pilihTiketKedaluwarsa, HARI_MS } = createCleanup;

const cleanupSrc = baca('backend/support-ticket-retention.js');
const storageSrc = baca('backend/support-storage.js');
const backendSrc = baca('backend/support-endpoints.js');
const serverSrc = baca('backend/server.js');

// ============================================================
// Helper palsu
// ============================================================
function buatSupabasePalsu(data) {
    const logHapus = [];

    function from(tabel) {
        const state = { tabel, op: 'select', filters: [], range: null };

        const eksekusi = () => {
            const baris = data[tabel] || [];

            if (state.op === 'select') {
                let hasil = baris.filter((r) => state.filters.every(([k, v]) => r[k] === v));
                if (state.range) hasil = hasil.slice(state.range[0], state.range[1] + 1);
                return { data: JSON.parse(JSON.stringify(hasil)), error: null };
            }

            const sebelum = baris.length;
            data[tabel] = baris.filter((r) => !state.filters.every(([k, v]) => r[k] === v));
            logHapus.push({ tabel, removed: sebelum - data[tabel].length });
            return { data: null, error: null };
        };

        const api = {
            select() { return api; },
            eq(k, v) { state.filters.push([k, v]); return api; },
            or() { return api; },
            lt() { return api; },
            lte() { return api; },
            order() { return api; },
            range(a, b) { state.range = [a, b]; return api; },
            delete() { state.op = 'delete'; return api; },
            then(resolve, reject) {
                try {
                    return Promise.resolve(eksekusi()).then(resolve, reject);
                } catch (err) {
                    return Promise.reject(err);
                }
            }
        };

        return api;
    }

    return { from, logHapus, data };
}

function buatStoragePalsu({ gagal = [] } = {}) {
    const dihapus = [];
    return {
        dihapus,
        async deleteAttachmentFile(filePath) {
            if (gagal.includes(filePath)) throw new Error('R2 sedang error');
            dihapus.push(filePath);
            return { deleted: true };
        },
        async deleteTicketFolder(ticketId) {
            dihapus.push(`FOLDER:${ticketId}`);
            return { keys: [], gagal: [] };
        }
    };
}

const NOW = new Date('2026-10-23T00:00:00.000Z');
const hariLalu = (n) => new Date(NOW.getTime() - n * HARI_MS).toISOString();

function dataContoh() {
    return {
        support_tickets: [
            { id: 't1', ticket_number: '#ANKA001', status: 'Closed', closed_at: hariLalu(4), updated_at: hariLalu(4) },
            { id: 't2', ticket_number: '#ANKA002', status: 'Closed', closed_at: hariLalu(1.5), updated_at: hariLalu(1.5) },
            { id: 't3', ticket_number: '#ANKA003', status: 'Closed', closed_at: hariLalu(3), updated_at: hariLalu(3) },
            { id: 't4', ticket_number: '#ANKA004', status: 'Open', closed_at: null, updated_at: hariLalu(10) },
            { id: 't5', ticket_number: '#ANKA005', status: 'Closed', closed_at: null, updated_at: hariLalu(5) }
        ],
        support_attachments: [
            { id: 'a1', ticket_id: 't1', file_path: 'support-tickets/t1/satu.png', file_name: 'satu.png' },
            { id: 'a2', ticket_id: 't1', file_path: 'support-tickets/t1/dua.png', file_name: 'dua.png' },
            { id: 'a3', ticket_id: 't2', file_path: 'support-tickets/t2/tiga.png', file_name: 'tiga.png' }
        ],
        support_messages: [
            { id: 'm1', ticket_id: 't1' },
            { id: 'm2', ticket_id: 't2' }
        ],
        support_ticket_activity: [
            { id: 'k1', ticket_id: 't1' },
            { id: 'k2', ticket_id: 't2' }
        ]
    };
}

// ============================================================
// Tes fungsi murni
// ============================================================
describe('Perhitungan retensi', () => {
    test('cutoff = sekarang - 3 hari', () => {
        expect(hitungCutoff(NOW, 3).toISOString()).toBe('2026-10-20T00:00:00.000Z');
    });

    test('acuan memakai closed_at, fallback updated_at untuk data lama', () => {
        const cutoff = hitungCutoff(NOW, 3);
        const dipilih = pilihTiketKedaluwarsa([
            { id: 'a', closed_at: hariLalu(4), updated_at: hariLalu(4) },
            { id: 'b', closed_at: hariLalu(1), updated_at: hariLalu(1) },
            { id: 'c', closed_at: null, updated_at: hariLalu(5) },
            { id: 'd', closed_at: null, updated_at: null }
        ], cutoff).map((t) => t.id);

        expect(dipilih).toEqual(['a', 'c']);
    });

    test('tepat 3 hari sudah dianggap kedaluwarsa', () => {
        const cutoff = hitungCutoff(NOW, 3);
        const dipilih = pilihTiketKedaluwarsa([{ id: 'x', closed_at: cutoff.toISOString() }], cutoff);
        expect(dipilih).toHaveLength(1);
    });
});

// ============================================================
// Tes fungsional job cleanup
// ============================================================
describe('Job hapus tiket Closed', () => {
    const envAsli = process.env.SUPPORT_TICKET_RETENTION_DAYS;

    afterEach(() => {
        if (envAsli === undefined) delete process.env.SUPPORT_TICKET_RETENTION_DAYS;
        else process.env.SUPPORT_TICKET_RETENTION_DAYS = envAsli;
    });

    test('default retensi 3 hari', () => {
        delete process.env.SUPPORT_TICKET_RETENTION_DAYS;
        const job = createCleanup({ supabase: buatSupabasePalsu(dataContoh()), storage: buatStoragePalsu() });
        expect(job.retentionDays).toBe(3);
    });

    test('menghapus tiket kedaluwarsa beserta semua data & foto', async () => {
        const data = dataContoh();
        const supabase = buatSupabasePalsu(data);
        const storage = buatStoragePalsu();
        const job = createCleanup({ supabase, storage, retentionDays: 3, logger: { log() {}, warn() {}, error() {} } });

        const laporan = await job.cleanupClosedTickets({ now: NOW });

        // t1 (4 hari), t3 (tepat 3 hari), t5 (data lama, updated_at 5 hari)
        expect(laporan.dihapus.map((t) => t.id).sort()).toEqual(['t1', 't3', 't5']);
        expect(laporan.gagal).toHaveLength(0);

        expect(data.support_tickets.map((t) => t.id).sort()).toEqual(['t2', 't4']);
        expect(data.support_attachments.map((a) => a.id)).toEqual(['a3']);
        expect(data.support_messages.map((m) => m.id)).toEqual(['m2']);
        expect(data.support_ticket_activity.map((k) => k.id)).toEqual(['k2']);

        // File R2 t1 dihapus + folder tiap tiket terhapus
        expect(storage.dihapus).toContain('support-tickets/t1/satu.png');
        expect(storage.dihapus).toContain('support-tickets/t1/dua.png');
        expect(storage.dihapus).toContain('FOLDER:t1');
        expect(storage.dihapus).toContain('FOLDER:t3');
        expect(storage.dihapus).toContain('FOLDER:t5');
        expect(storage.dihapus).not.toContain('support-tickets/t2/tiga.png');
    });

    test('dry-run tidak menghapus apa pun', async () => {
        const data = dataContoh();
        const supabase = buatSupabasePalsu(data);
        const storage = buatStoragePalsu();
        const job = createCleanup({ supabase, storage, retentionDays: 3, logger: { log() {}, warn() {}, error() {} } });

        const laporan = await job.cleanupClosedTickets({ now: NOW, dryRun: true });

        expect(laporan.dryRun).toBe(true);
        expect(laporan.dihapus).toHaveLength(3);
        expect(laporan.dihapus.every((t) => t.mode === 'dry-run')).toBe(true);
        expect(storage.dihapus).toHaveLength(0);
        expect(data.support_tickets).toHaveLength(5);
        expect(data.support_attachments).toHaveLength(3);
    });

    test('kalau hapus file gagal, data tiket TIDAK dihapus (biar retry)', async () => {
        const data = dataContoh();
        const supabase = buatSupabasePalsu(data);
        const storage = buatStoragePalsu({ gagal: ['support-tickets/t1/satu.png'] });
        const job = createCleanup({ supabase, storage, retentionDays: 3, logger: { log() {}, warn() {}, error() {} } });

        const laporan = await job.cleanupClosedTickets({ now: NOW });

        expect(laporan.gagal).toHaveLength(1);
        expect(laporan.gagal[0].id).toBe('t1');
        expect(data.support_tickets.some((t) => t.id === 't1')).toBe(true);
        expect(data.support_attachments.some((a) => a.id === 'a1')).toBe(true);
        // tiket lain tetap terhapus
        expect(data.support_tickets.some((t) => t.id === 't3')).toBe(false);
    });
});

// ============================================================
// Tes support-storage (R2)
// ============================================================
describe('Penyimpanan lampiran di R2', () => {
    const R2Storage = require('../r2-storage');
    const storage = require('../support-storage');

    beforeEach(() => {
        jest.clearAllMocks();
        R2Storage.uploadFile.mockResolvedValue({ storagePath: 'support-tickets/t9/file.png' });
        R2Storage.downloadFile.mockResolvedValue(Buffer.from('isi'));
        R2Storage.deleteFile.mockResolvedValue({ success: true });
        R2Storage.listFiles.mockResolvedValue([
            { key: 'support-tickets/t9/file.png' },
            { key: 'support-tickets/t9/yatim.png' }
        ]);
    });

    test('upload memakai key folder khusus tiket', async () => {
        const key = await storage.saveAttachmentFile(Buffer.from('foto'), 't9', 'file.png', 'image/png');

        expect(R2Storage.uploadFile).toHaveBeenCalledWith(
            Buffer.from('foto'),
            'support-tickets/t9/file.png',
            expect.objectContaining({ contentType: 'image/png' })
        );
        expect(key).toBe('support-tickets/t9/file.png');
    });

    test('baca lampiran mengambil dari R2', async () => {
        const isi = await storage.readAttachmentFile('support-tickets/t9/file.png');
        expect(isi.toString()).toBe('isi');
        expect(R2Storage.downloadFile).toHaveBeenCalledWith('support-tickets/t9/file.png');
    });

    test('hapus folder tiket membersihkan semua objek di prefix-nya', async () => {
        const hasil = await storage.deleteTicketFolder('t9');

        expect(R2Storage.listFiles).toHaveBeenCalledWith('support-tickets/t9/');
        expect(hasil.keys).toEqual([
            'support-tickets/t9/file.png',
            'support-tickets/t9/yatim.png'
        ]);
        expect(R2Storage.deleteFile).toHaveBeenCalledTimes(2);
    });

    test('menolak menghapus objek di luar folder support-tickets', async () => {
        await expect(storage.deleteAttachmentFile('Faktur Pajak/2026/invoice.pdf')).rejects.toThrow();
        expect(R2Storage.deleteFile).not.toHaveBeenCalled();
    });
});

// ============================================================
// Tes konfigurasi / integrasi source
// ============================================================
describe('Integrasi retensi ke server', () => {
    test('job didaftarkan & dijalankan saat boot', () => {
        expect(serverSrc).toContain("require('./support-ticket-retention')");
        expect(serverSrc).toContain('supportTicketCleanup.registerRoutes(app');
        expect(serverSrc).toContain('supportTicketCleanup.start()');
    });

    test('endpoint manual hanya untuk super_admin', () => {
        expect(cleanupSrc).toContain("'/api/support/maintenance/cleanup-closed'");
        expect(cleanupSrc).toContain("authorizeRole('super_admin')");
        expect(cleanupSrc).toContain('dryRun');
    });

    test('retensi bisa dikonfigurasi via env', () => {
        expect(cleanupSrc).toContain('SUPPORT_TICKET_RETENTION_DAYS');
        expect(cleanupSrc).toContain('SUPPORT_TICKET_CLEANUP_INTERVAL_MS');
    });

    test('menghapus 4 tabel terkait tiket', () => {
        ['support_attachments', 'support_messages', 'support_ticket_activity', 'support_tickets']
            .forEach((tabel) => expect(cleanupSrc).toContain(`'${tabel}'`));
    });

    test('foto dihapus lewat storage R2, bukan sekadar baris DB', () => {
        expect(cleanupSrc).toContain('storage.deleteAttachmentFile(');
        expect(cleanupSrc).toContain('storage.deleteTicketFolder(');
        expect(storageSrc).toContain('R2Storage.deleteFile(');
        expect(storageSrc).toContain('R2Storage.listFiles(');
    });

    test('folder R2 khusus: support-tickets/<ticketId>/', () => {
        expect(storageSrc).toContain("|| 'support-tickets'");
        expect(storageSrc).toContain('return `${SUPPORT_PREFIX}/${ticketId}/`;');
    });

    test('membuka kembali tiket mengosongkan closed_at', () => {
        expect(backendSrc).toContain('updateData.closed_at = null;');
        expect(backendSrc).toContain("if (status === 'Closed') {");
    });

    test('migration SQL menyediakan index retensi', () => {
        const migrasi = baca('backend/migrations/2026_10_23_support_ticket_retention.sql');
        expect(migrasi).toContain('ADD COLUMN IF NOT EXISTS closed_at');
        expect(migrasi).toContain('idx_support_tickets_status_closed_at');
        expect(migrasi).toContain("WHERE status = 'Closed' AND closed_at IS NULL");
    });

    // Regresi: nama modul pernah terkena pola .gitignore (backend/*-cleanup.js)
    // sehingga file tidak ikut ter-commit dan server gagal boot (MODULE_NOT_FOUND).
    test('modul retensi ada di disk dan tidak terkena pola .gitignore', () => {
        const namaModul = 'support-ticket-retention.js';
        expect(fs.existsSync(path.join(ROOT, 'backend', namaModul))).toBe(true);

        const polaIgnore = baca('.gitignore')
            .split(/\r?\n/)
            .map((baris) => baris.trim())
            .filter((baris) => baris && !baris.startsWith('#'));

        const kenaIgnore = polaIgnore.some((pola) => {
            if (!pola.startsWith('backend/')) return false;
            const nama = pola.slice('backend/'.length);
            if (nama.startsWith('*')) return namaModul.endsWith(nama.slice(1));
            return namaModul === nama;
        });

        expect(kenaIgnore).toBe(false);
    });
});
