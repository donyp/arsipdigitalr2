/**
 * ============================================================
 * Unit Test: Gaya garis submenu dropdown sidebar (rail + elbow)
 * ============================================================
 * Referensi: submenu dropdown punya garis vertikal (rail) di posisi
 * tengah ikon induk, lalu tiap item non-aktif bercabang melengkung
 * (elbow) ke kanan. Item aktif memakai highlight EXISTING (tint bg +
 * border kiri + titik heartbeat) tanpa kurva.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const sidebarSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'sidebar.js'),
    'utf8'
);

describe('Sidebar - gaya garis submenu (rail + elbow)', () => {

    test('STYLES light punya railColor (turunan #3d3b6b)', () => {
        expect(sidebarSrc).toMatch(/railColor:\s*'rgba\(61,\s*59,\s*107,\s*0\.18\)'/);
    });

    test('warna dark mode punya railColor (abu netral, kontras di #0f172a)', () => {
        expect(sidebarSrc).toMatch(/railColor:\s*'rgba\(148,\s*163,\s*184,\s*0\.3\)'/);
    });

    test('dropdown content mengekspos var --sidebar-rail-color (ikut mode warna)', () => {
        expect(sidebarSrc).toMatch(/--sidebar-rail-color:\s*\$\{colors\.railColor\}/);
    });

    test('ada rail vertikal di .sidebar-dropdown-content::before (left 1.4rem)', () => {
        const railRule = sidebarSrc.match(/\.sidebar-dropdown-content::before\s*\{[^}]+\}/);
        expect(railRule).toBeTruthy();
        expect(railRule[0]).toMatch(/left:\s*1\.4rem/);
        expect(railRule[0]).toMatch(/width:\s*1px/);
        expect(railRule[0]).toMatch(/top:\s*0/);
        expect(railRule[0]).toMatch(/bottom:\s*0/);
        expect(railRule[0]).toMatch(/var\(--sidebar-rail-color/);
    });

    test('ada elbow (kurva penghubung) di item non-aktif', () => {
        const elbowRule = sidebarSrc.match(/\.sidebar-child-item:not\(\.active\)::after\s*\{[^}]+\}/);
        expect(elbowRule).toBeTruthy();
        expect(elbowRule[0]).toMatch(/border-left:\s*1px solid var\(--sidebar-rail-color/);
        expect(elbowRule[0]).toMatch(/border-bottom:\s*1px solid var\(--sidebar-rail-color/);
        expect(elbowRule[0]).toMatch(/border-bottom-left-radius:\s*8px/);
    });

    test('item aktif TIDAK punya elbow (highlight existing dipertahankan)', () => {
        expect(sidebarSrc).toMatch(/\.sidebar-child-item\.active::after\s*\{\s*display:\s*none;\s*\}/);
    });

    test('highlight menu aktif existing tidak berubah (tint bg + border kiri + titik)', () => {
        // CSS block aktif masih memakai variabel hover bg & active color
        const activeBlock = sidebarSrc.match(/\.sidebar-item\.active,\s*\.sidebar-child-item\.active\s*\{[^}]+\}/g) || [];
        const joined = activeBlock.join('\n');
        expect(joined).toMatch(/background-color:\s*var\(--sidebar-hover-bg\)\s*!important/);
        expect(joined).toMatch(/border-left-color:\s*var\(--sidebar-active-color\)\s*!important/);
        // Titik heartbeat (global CSS) tetap ada
        expect(sidebarSrc).toMatch(/\.sidebar-child-item\.active::before/);
    });

    test('hover child tidak menggeser horizontal (supaya elbow tetap presisi)', () => {
        // Ada 2 rule: gabungan hover lama (translateX 4px) lalu override khusus
        // child -> pastikan override TERAKHIR mematikan geseran horizontal.
        const hoverRules = sidebarSrc.match(/\.sidebar-child-item:hover:not\(\.active\)\s*\{[^}]+\}/g) || [];
        expect(hoverRules.length).toBeGreaterThanOrEqual(2);
        expect(hoverRules[hoverRules.length - 1]).toMatch(/transform:\s*translateX\(0\)/);
    });
});
