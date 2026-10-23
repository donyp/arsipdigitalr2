/**
 * Tes regresi lampiran tiket support.
 *
 * Fokus:
 *  1. Halaman buat tiket benar-benar MENGUNGGAH foto (bukan hanya menyimpan
 *     daftar file di memori).
 *  2. Lampiran dibatasi HANYA FOTO (JPG/PNG/WEBP), maks 5 file / 5 MB.
 *  3. Detail tiket (user & moderator) menampilkan lampiran tiket, bukan hanya
 *     lampiran per-pesan.
 *  4. Pratinjau foto memakai Authorization header (link biasa tanpa token 401).
 *  5. Backend menyimpan file ke disk & mendukung mode inline untuk thumbnail.
 *
 * Semua tes membaca source (tanpa DB / server).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const baca = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const createPage = baca('support-create-ticket.html');
const detailUser = baca('support-ticket-detail.html');
const detailMod = baca('support-ticket-detail-moderator.html');
const backend = baca('backend/support-endpoints.js');

describe('Halaman buat tiket — desain tanpa glass', () => {
    test('tidak memakai backdrop-filter / efek glass', () => {
        expect(createPage).not.toMatch(/backdrop-filter\s*:/);
        expect(createPage).not.toMatch(/-webkit-backdrop-filter\s*:/);
    });

    test('form memakai struktur section + label yang jelas', () => {
        expect(createPage).toContain('class="section-head"');
        expect(createPage).toContain('Detail Laporan');
        expect(createPage).toContain('Lampiran Foto');
    });

    test('tidak ada emoji rusak (?) pada opsi kategori/prioritas', () => {
        expect(createPage).not.toContain('>?? Data Issue<');
        expect(createPage).not.toContain('>?? Medium<');
    });
});

describe('Halaman buat tiket — upload foto', () => {
    test('input file hanya menerima gambar', () => {
        expect(createPage).toContain('accept="image/jpeg,image/png,image/webp"');
        expect(createPage).not.toContain('accept=".jpg,.jpeg,.png,.pdf"');
    });

    test('batas 5 foto dan 5 MB didefinisikan', () => {
        expect(createPage).toContain('const MAX_FILES = 5;');
        expect(createPage).toContain('const MAX_FILE_SIZE = 5 * 1024 * 1024;');
        expect(createPage).toContain("const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];");
    });

    test('submit mengunggah file ke endpoint ticket upload', () => {
        expect(createPage).toContain('async function uploadAttachments(token, ticketId)');
        expect(createPage).toContain('`/api/support/tickets/${ticketId}/upload`');
        expect(createPage).toContain("formData.append('attachment', file, file.name)");
        expect(createPage).toContain('await uploadAttachments(token, data.ticket.id)');
    });

    test('tidak men-set Content-Type manual pada FormData', () => {
        const blok = createPage.slice(
            createPage.indexOf('async function uploadAttachments'),
            createPage.indexOf('function tampilkanSukses')
        );
        expect(blok).not.toMatch(/['"]Content-Type['"]\s*:/);
    });

    test('file non-gambar ditolak sebelum dikirim', () => {
        expect(createPage).toContain('if (!ALLOWED_IMAGE_TYPES.includes(tipe))');
        expect(createPage).toContain('hanya ${ALLOWED_IMAGE_LABEL}');
    });
});

describe('Detail tiket — lampiran terlihat', () => {
    test('detail user menampilkan lampiran tiket (bukan hanya per pesan)', () => {
        expect(detailUser).toContain('renderAttachmentBlock(ticketData.attachments');
        expect(detailUser).toContain('renderAttachmentBlock(msg.attachments');
    });

    test('detail moderator menampilkan lampiran tiket', () => {
        expect(detailMod).toContain('renderAttachmentBlock(ticketData.attachments');
        expect(detailMod).toContain('renderAttachmentBlock(msg.attachments');
    });

    test('foto dimuat dengan Authorization + mode inline', () => {
        [detailUser, detailMod].forEach((src) => {
            expect(src).toContain("download/${att.id}?inline=1");
            expect(src).toContain("'Authorization': `Bearer ${token}`");
        });
    });

    test('tersedia lightbox pratinjau + unduh', () => {
        [detailUser, detailMod].forEach((src) => {
            expect(src).toContain('id="attachmentLightbox"');
            expect(src).toContain('function openAttachmentLightbox');
            expect(src).toContain('function downloadAttachmentById');
        });
    });

    test('thumbnail memakai <img> dengan blob URL (bukan link tanpa token)', () => {
        [detailUser, detailMod].forEach((src) => {
            expect(src).toContain('attachmentBlobCache');
            expect(src).toContain('URL.createObjectURL(blob)');
        });
    });
});

describe('Backend lampiran support', () => {
    test('hanya menerima JPG/PNG/WEBP', () => {
        expect(backend).toContain("'image/jpeg': '.jpg'");
        expect(backend).toContain("'image/png': '.png'");
        expect(backend).toContain("'image/webp': '.webp'");
        expect(backend).toContain('Hanya foto JPG, PNG, atau WEBP yang diizinkan');
    });

    test('batas ukuran 5 MB dan pesan error yang jelas', () => {
        expect(backend).toContain('const SUPPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;');
        expect(backend).toContain('Ukuran foto maksimal 5 MB');
    });

    test('menyimpan file ke disk lalu mencatat path-nya', () => {
        expect(backend).toContain("path.join(__dirname, '..', 'uploads', 'support')");
        expect(backend).toContain('fs.mkdirSync(folder, { recursive: true })');
        expect(backend).toContain('fs.writeFileSync(fileTersimpan, req.file.buffer)');
        expect(backend).toContain('file_path: fileTersimpan');
    });

    test('cek hak akses sebelum menyimpan lampiran', () => {
        const blok = backend.slice(
            backend.indexOf("app.post('/api/support/tickets/:id/upload'"),
            backend.indexOf("app.get('/api/support/tickets/:id/download/:attachmentId'")
        );
        expect(blok).toContain('const isOwner');
        expect(blok).toContain('const isModerator');
        expect(blok).toContain('const isAdminZona');
        expect(blok).toContain("status(403)");
    });

    test('download mendukung ?inline=1 untuk thumbnail', () => {
        expect(backend).toContain("req.query.inline === '1'");
        expect(backend).toContain('inline; filename=');
    });
});

describe('Gitignore', () => {
    test('folder uploads tidak ikut di-commit', () => {
        const gitignore = baca('.gitignore');
        expect(gitignore).toMatch(/^uploads\/$/m);
    });
});
