/**
 * ============================================================
 * Unit Test: Notifikasi WhatsApp Invoice - merge per zona
 * ============================================================
 * Fokus: hanya boleh ada 1 pesan AKTIF per zona.
 *
 * Insiden: 1 proses upload dipecah jadi 2 batch (4 file sukses + 1 file
 * gagal lalu diupload ulang) -> backend membuat 2 baris pesan untuk zona
 * yang sama -> 2 kartu "Zona 07" di tab "Pesan Aktif".
 *
 * Fix: invoice baru untuk zona yang masih punya pesan pending DIGABUNG ke
 * pesan itu (UPDATE), bukan INSERT baris baru.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const {
    mergeInvoiceDetails,
    invoiceDedupeKey,
    generateZonaInvoiceMessage,
    generateInvoiceMessage
} = require('../whatsapp-invoice-notifications');

describe('WA Invoice Notification - merge per zona', () => {

    describe('invoiceDedupeKey', () => {
        test('baris identik menghasilkan key yang sama', () => {
            const a = invoiceDedupeKey({ tipe: 'PPN', konsumen: 'MEGA BAJA', nominal: 1000 });
            const b = invoiceDedupeKey({ tipe: 'PPN', konsumen: 'MEGA BAJA', nominal: 1000 });
            expect(a).toBe(b);
        });

        test('perbedaan spasi/case tidak membuat baris dobel', () => {
            const a = invoiceDedupeKey({ tipe: 'ppn', konsumen: 'mega baja ', nominal: '1000' });
            const b = invoiceDedupeKey({ tipe: 'PPN', konsumen: 'MEGA BAJA', nominal: 1000 });
            expect(a).toBe(b);
        });

        test('nominal berbeda = key berbeda', () => {
            const a = invoiceDedupeKey({ tipe: 'PPN', konsumen: 'MEGA BAJA', nominal: 1000 });
            const b = invoiceDedupeKey({ tipe: 'PPN', konsumen: 'MEGA BAJA', nominal: 2000 });
            expect(a).not.toBe(b);
        });
    });

    describe('mergeInvoiceDetails', () => {
        test('baris yang sama tidak digandakan', () => {
            const lama = [{ tipe: 'PPN', konsumen: 'MEGA BAJA', nominal: 1000 }];
            const baru = [{ tipe: 'PPN', konsumen: 'MEGA BAJA', nominal: 1000 }];
            const merged = mergeInvoiceDetails(lama, baru);
            expect(merged).toHaveLength(1);
        });

        test('invoice baru ditambahkan ke pesan lama', () => {
            const lama = [{ tipe: 'NON PPN', konsumen: 'MEGA BAJA CIREBON', nominal: 1280000 }];
            const baru = [{ tipe: 'PPN', konsumen: 'MEGA BAJA CIREBON', nominal: 36253424 }];
            const merged = mergeInvoiceDetails(lama, baru);
            expect(merged).toHaveLength(2);
            expect(merged[0].nominal).toBe(1280000);
            expect(merged[1].nominal).toBe(36253424);
        });

        test('menangani input null / bukan array', () => {
            expect(mergeInvoiceDetails(null, null)).toEqual([]);
            expect(mergeInvoiceDetails(undefined, [{ tipe: 'PPN', konsumen: 'A', nominal: 1 }])).toHaveLength(1);
        });
    });

    describe('generateZonaInvoiceMessage', () => {
        test('1 pesan per zona berisi semua baris invoice', () => {
            const msg = generateZonaInvoiceMessage([
                { tipe: 'PPN', konsumen: 'MEGA BAJA CIREBON', nominal: 36253424 },
                { tipe: 'NON PPN', konsumen: 'MEGA BAJA CIREBON', nominal: 1280000 }
            ], 'Zona 07', '7');

            // hanya 1 header zona
            expect((msg.match(/\*UPDATE INVOICE ZONA 7\*/g) || []).length).toBe(1);
            // kedua baris invoice ada di pesan yang sama
            expect(msg).toContain('- [PPN] MEGA BAJA CIREBON - Rp 36.253.424');
            expect(msg).toContain('- [NON PPN] MEGA BAJA CIREBON - Rp 1.280.000');
            expect(msg).toContain('_@adminanka_');
        });

        test('format rupiah Indonesia', () => {
            expect(generateInvoiceMessage({ tipe: 'PPN', konsumen: 'A', nominal: 1000000 }))
                .toBe('- [PPN] A - Rp 1.000.000');
        });
    });

    describe('regresi: createInvoiceNotifications memakai merge', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'whatsapp-invoice-notifications.js'),
            'utf8'
        );

        test('sebelum insert, dicek dulu pesan pending zona tsb', () => {
            expect(src).toContain('findPendingMessageForZona');
            expect(src).toContain('.is(\'sent_at\', null)');
        });

        test('pesan pending diperbarui (merge), bukan insert baru', () => {
            expect(src).toMatch(/\.update\(updatePayload\)[\s\S]*\.eq\('id', existing\.id\)/);
        });

        test('endpoint notifikasi upload Excel dinonaktifkan', () => {
            const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
            expect(serverSrc).toContain("'/api/whatsapp/generate-messages'");
            expect(serverSrc).toMatch(/generate-messages[\s\S]{0,900}status\(410\)/);
        });
    });
});
