/**
 * ============================================================
 * Unit Test: Animasi sidebar (hover + dropdown open/close)
 * ============================================================
 * Sidebar dipakai di semua halaman. Hover harus memakai transisi
 * yang halus, dan submenu harus membuka/menutup dengan tinggi asli
 * (bukan lompatan max-height 500px).
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..', '..');
const sidebarSrc = fs.readFileSync(
    path.join(projectRoot, 'js', 'sidebar.js'),
    'utf8'
);

describe('Sidebar - animasi hover dan dropdown', () => {

    test('item menu memakai transisi eksplisit yang halus (bukan transition: all)', () => {
        const itemBlock = sidebarSrc.match(
            /\.sidebar-item,\s*\.sidebar-dropdown-btn,\s*\.sidebar-child-item\s*\{([\s\S]*?)\}/
        );
        expect(itemBlock).toBeTruthy();
        expect(itemBlock[1]).toMatch(/transform\s+240ms/);
        expect(itemBlock[1]).toMatch(/background-color\s+220ms/);
        expect(itemBlock[1]).toMatch(/color\s+220ms/);
        expect(itemBlock[1]).not.toMatch(/transition:\s*all/);
    });

    test('hover tombol dropdown tetap memberi feedback saat expanded', () => {
        expect(sidebarSrc).toMatch(/\.sidebar-dropdown-btn:hover,?/);
        expect(sidebarSrc).toMatch(
            /\.sidebar-dropdown-btn\.expanded\s*\{[^}]*background-color:\s*var\(--sidebar-hover-bg\)\s*!important/
        );
    });

    test('panah dropdown berputar memakai class + transisi transform', () => {
        const arrowBlock = sidebarSrc.match(
            /\.sidebar-dropdown-btn \.dropdown-arrow\s*\{([\s\S]*?)\}/
        );
        expect(arrowBlock).toBeTruthy();
        expect(arrowBlock[1]).toMatch(/transition:\s*transform\s+280ms/);
        expect(sidebarSrc).toMatch(
            /\.sidebar-dropdown-btn\.expanded \.dropdown-arrow\s*\{\s*transform:\s*rotate\(180deg\)/
        );
    });

    test('submenu dianimasikan dengan max-height, opacity, dan transform', () => {
        const closedBlock = sidebarSrc.match(
            /\.sidebar-dropdown-content\s*\{([\s\S]*?)\}/
        );
        expect(closedBlock).toBeTruthy();
        expect(closedBlock[1]).toMatch(/max-height:\s*0/);
        expect(closedBlock[1]).toMatch(/opacity:\s*0/);
        expect(closedBlock[1]).toMatch(/transform:\s*translateY\(-4px\)/);
        expect(closedBlock[1]).toMatch(/transition:/);
        expect(closedBlock[1]).toMatch(/max-height\s+300ms/);
        expect(closedBlock[1]).toMatch(/opacity\s+220ms/);
        expect(closedBlock[1]).toMatch(/transform\s+300ms/);

        const activeBlock = sidebarSrc.match(
            /\.sidebar-dropdown-content\.active\s*\{([\s\S]*?)\}/
        );
        expect(activeBlock).toBeTruthy();
        expect(activeBlock[1]).toMatch(/max-height:\s*500px/);
        expect(activeBlock[1]).toMatch(/opacity:\s*1/);
        expect(activeBlock[1]).toMatch(/transform:\s*translateY\(0\)/);
    });

    test('toggle memakai state class dan tinggi asli submenu', () => {
        expect(sidebarSrc).toContain("dropdownContent.classList.contains('active')");
        expect(sidebarSrc).toContain('dropdownContent.scrollHeight');
        expect(sidebarSrc).toContain('dropdownContent.getBoundingClientRect().height');
        expect(sidebarSrc).not.toContain('parseFloat(dropdownContent.style.maxHeight)');
    });

    test('hover menggeser item, memberi shadow, dan memperbesar ikon', () => {
        expect(sidebarSrc).toMatch(
            /\.sidebar-item:hover:not\(\.active\),\s*\.sidebar-dropdown-btn:hover:not\(\.expanded\)\s*\{[^}]*transform:\s*translateX\(6px\)\s*scale\(1\.01\)/
        );
        expect(sidebarSrc).toMatch(
            /\.sidebar-item:hover:not\(\.active\) > span:first-child,[\s\S]*?transform:\s*scale\(1\.12\)/
        );
    });

    test('item submenu muncul bergantian (stagger) saat dropdown dibuka', () => {
        expect(sidebarSrc).toContain('@keyframes sidebar-child-in');
        expect(sidebarSrc).toMatch(
            /\.sidebar-dropdown-content\.active \.sidebar-child-item\s*\{[^}]*animation:\s*sidebar-child-in\s+280ms/
        );
        expect(sidebarSrc).toMatch(
            /\.sidebar-dropdown-content\.active \.sidebar-child-item:nth-child\(2\)\s*\{[^}]*animation-delay:\s*35ms/
        );
    });

    test('cache PWA lama dibersihkan agar update tidak tertahan cache-first', () => {
        expect(sidebarSrc).toContain("'arsip-anka-static-v1'");
        expect(sidebarSrc).toContain('navigator.serviceWorker.getRegistrations()');
        expect(sidebarSrc).toContain('registration.unregister()');
        expect(sidebarSrc).toContain('window.location.reload()');
    });

    test('state aksesibilitas dropdown ikut disinkronkan', () => {
        expect(sidebarSrc).toContain("btn.setAttribute('aria-expanded', 'true')");
        expect(sidebarSrc).toContain("btn.setAttribute('aria-expanded', 'false')");
        expect(sidebarSrc).toContain("dropdownContent.setAttribute('aria-hidden', 'false')");
        expect(sidebarSrc).toContain("dropdownContent.setAttribute('aria-hidden', 'true')");
    });

    test('menghormati prefers-reduced-motion', () => {
        expect(sidebarSrc).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    });

    test('semua halaman memakai cache-busting sidebar v=10', () => {
        const htmlFiles = fs.readdirSync(projectRoot)
            .filter(file => file.endsWith('.html'));
        const sidebarPages = htmlFiles.filter(file => {
            const html = fs.readFileSync(path.join(projectRoot, file), 'utf8');
            return html.includes('sidebar.js?v=');
        });

        expect(sidebarPages.length).toBeGreaterThan(0);
        for (const file of sidebarPages) {
            const html = fs.readFileSync(path.join(projectRoot, file), 'utf8');
            expect(html).not.toContain('sidebar.js?v=9');
            expect(html).toContain('sidebar.js?v=10');
        }
    });
});
