/**
 * Sidebar Component - Clean Implementation
 * Single source of truth for sidebar styling and structure
 * All menu items render with IDENTICAL height, padding, and font-size
 */

(function() {
    console.log('[SIDEBAR] Initializing clean sidebar...');

    // ============================================================
    // INJECT SIDEBAR CSS IMMEDIATELY (Global - all pages)
    // ============================================================
    (function injectGlobalSidebarCSS() {
        if (document.getElementById('sidebar-css-global')) return;

        // Inject logo-data.css if not already loaded
        if (!document.querySelector('link[href*="logo-data.css"]')) {
            const logoLink = document.createElement('link');
            logoLink.rel = 'stylesheet';
            logoLink.href = '/css/logo-data.css';
            document.head.appendChild(logoLink);
        }

        // Inject Cinzel font for sidebar brand text
        if (!document.querySelector('link[href*="Cinzel"]')) {
            const fontLink = document.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&display=swap';
            document.head.appendChild(fontLink);
        }
        
        const css = `
            /* Pulsing Heartbeat Animation - GLOBAL */
            @keyframes heartbeat-pulse {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
                }
                50% {
                    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
                }
            }

            /* SVG Icon Styling for Sidebar */
            .sidebar-menu-icon {
                width: 1.2rem;
                height: 1.2rem;
                display: inline-block;
                flex-shrink: 0;
            }

            /* Ensure active items have position relative for ::before */
            .sidebar-item.active,
            .sidebar-child-item.active {
                position: relative !important;
            }

            /* Active menu item with pulsing heartbeat - applies to all pages */
            .sidebar-item.active::before,
            .sidebar-child-item.active::before {
                content: '';
                position: absolute !important;
                right: 8px !important;
                top: 50% !important;
                transform: translateY(-50%) !important;
                width: 8px !important;
                height: 8px !important;
                background: #3b82f6 !important;
                border-radius: 50% !important;
                animation: heartbeat-pulse 2s infinite ease-in-out !important;
                z-index: 10 !important;
                display: block !important;
                visibility: visible !important;
            }

            /* ANKA sidebar logo dark mode toggle */
            html[data-dark-mode="true"] .logo-anka-light { display: none !important; }
            html[data-dark-mode="true"] .logo-anka-dark  { display: block !important; }
            html:not([data-dark-mode="true"]) .logo-anka-light { display: block !important; }
            html:not([data-dark-mode="true"]) .logo-anka-dark  { display: none !important; }

            /* ANKA Logo styling for sidebar */
            .logo-anka-sidebar {
                background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%233D3C6B%22/%3E%3Ctext x=%2250%22 y=%2270%22 font-size=%2260%22 font-weight=%22bold%22 fill=%22white%22 text-anchor=%22middle%22 font-family=%22Arial%22%3EA%3C/text%3E%3C/svg%3E') !important;
                background-size: contain !important;
                background-repeat: no-repeat !important;
                background-position: center !important;
            }

            /* Dark mode logo */
            html[data-dark-mode="true"] .logo-anka-sidebar {
                background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%2360a5fa%22/%3E%3Ctext x=%2250%22 y=%2270%22 font-size=%2260%22 font-weight=%22bold%22 fill=%22white%22 text-anchor=%22middle%22 font-family=%22Arial%22%3EA%3C/text%3E%3C/svg%3E') !important;
            }
        `;
        
        const style = document.createElement('style');
        style.id = 'sidebar-css-global';
        style.textContent = css;
        document.head.appendChild(style);
        console.log('[SIDEBAR CSS] Global heartbeat CSS injected');
    })();

    // ============================================================
    // MENU CONFIGURATION
    // ============================================================
    const menuConfig = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            icon: '<svg class="sidebar-menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M4 13h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1zm-1 7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v4zm10 0a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v7zm1-10h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1z"></path></svg>',
            href: '/dashboard',
            children: []
        },
        {
            id: 'whatsapp',
            label: 'WhatsApp Messages',
            icon: '<svg class="sidebar-menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><g><path fill-rule="evenodd" clip-rule="evenodd" d="M14.802 19.8312C15.4184 19.7694 15.8349 20.4237 15.5437 20.9534C15.3385 21.3267 15.0493 21.6524 14.7029 21.9193C14.3496 22.1913 13.9397 22.4001 13.5 22.5403C13.0601 22.6807 12.593 22.7517 12.1242 22.7517C11.6554 22.7517 11.1883 22.6807 10.7484 22.5403C10.3087 22.4001 9.89883 22.1913 9.54556 21.9193C9.1991 21.6524 8.90988 21.3267 8.70472 20.9534C8.41354 20.4237 8.83002 19.7694 9.44644 19.8312C9.63869 19.8505 11.1433 19.9976 12.1242 19.9976C13.1051 19.9976 14.6097 19.8505 14.802 19.8312Z"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M15.7423 1.98737C13.4465 0.967602 10.7932 1.00445 8.52901 2.08755C6.27704 3.16478 4.85335 5.3744 4.85335 7.79233L4.85335 9.06596C4.85335 10.1981 4.55987 11.3124 3.99943 12.3082L3.77239 12.7115C2.37502 15.1943 3.90274 18.2653 6.79044 18.7783C10.3154 19.4046 13.93 19.4046 17.455 18.7783L17.6156 18.7498C20.465 18.2435 22.0525 15.29 20.8335 12.7632L20.5681 12.213C20.1236 11.2918 19.8934 10.2885 19.8934 9.27297V8.9514C19.4108 9.23527 18.8484 9.39807 18.248 9.39807C16.4531 9.39807 14.998 7.943 14.998 6.14807C14.998 4.6268 16.0433 3.34965 17.4547 2.99558C17.003 2.63274 16.4979 2.323 15.9475 2.07851L15.7423 1.98737Z"></path><circle cx="18.248" cy="6.14844" r="2.5"></circle></g></svg>',
            href: '/notifikasi',
            children: []
        },
        {
            id: 'support',
            label: 'Support',
            icon: '<i class="fas fa-headset"></i>',
            href: '/support/admin',
            children: []
        },
        {
            id: 'tickets',
            label: 'Dashboard Tiket',
            icon: '<svg class="sidebar-menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill-rule="evenodd" d="M4 4h12a1 1 0 1 0 2 0h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2a1 1 0 1 0-2 0H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm14 4.001a1 1 0 1 1-2 0V8a1 1 0 1 1 2 0v.001zm-1 5a1 1 0 0 0 1-1V12a1 1 0 1 0-2 0v.001a1 1 0 0 0 1 1zm1 3a1 1 0 1 1-2 0V16a1 1 0 1 1 2 0v.001z" clip-rule="evenodd"></path></svg>',
            href: '/dashboard-moderator',
            children: []
        },
        {
            id: 'upload',
            label: 'Upload File',
            icon: '<i class="fas fa-cloud-upload-alt"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Upload Excel', icon: '<i class="fas fa-file-excel"></i>', href: '/excel' },
                { label: 'Upload Invoice PDF', icon: '<i class="fas fa-file-pdf"></i>', href: '/invoice' },
                { label: 'Upload Bukti Bayar', icon: '<i class="fas fa-receipt"></i>', href: '/buktibayar' },
                { label: 'Upload Faktur Pajak', icon: '<i class="fas fa-file-invoice"></i>', href: '/fakturpajak' }
            ]
        },
        {
            id: 'tools',
            label: 'Tools',
            icon: '<i class="fas fa-wrench"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Rename Faktur', icon: '<svg class="sidebar-menu-icon" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><rect x="0" fill="none" width="20" height="20"></rect><g><path d="M4 5H2v13h10v-2H4V5zm13.9-1.6l-1.3-1.3c-.4-.4-1.1-.5-1.6-.1l-1 1H5v12h9V9l4-4c.4-.5.3-1.2-.1-1.6zm-5.7 6l-2.5.9.9-2.5L15 3.4 16.6 5l-4.4 4.4z"></path></g></svg>', href: '/renamefaktur' }
            ]
        },
        {
            id: 'management',
            label: 'Management',
            icon: '<svg class="sidebar-menu-icon" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="m -899.99998,-310.79461 c -20.43409,0 -40.0078,4.62259 -52.90398,19.2757 -12.89618,14.65312 -13.31011,30.27623 -14.05636,39.78187 -0.74624,9.50565 -1.36732,15.42265 -2.80675,19.0879 -1.43942,3.66526 -2.62672,6.46545 -11.63186,11.66458 -9.00514,5.19911 -12.02109,4.82429 -15.91499,4.23825 -3.89398,-0.58605 -9.32638,-3.00427 -17.93168,-7.11083 -8.6053,-4.10655 -22.3462,-11.56116 -41.4843,-7.71929 -19.138,3.84186 -32.9287,18.48118 -43.1458,36.17762 -10.2171,17.69644 -15.9985,36.95986 -9.7566,55.45483 6.2418,18.49497 19.5659,26.66798 27.4249,32.06708 7.859,5.39908 12.6704,8.893362 15.1249,11.972567 2.4545,3.079205 4.2876,5.506097 4.2876,15.904332 0,10.398237 -1.8331,12.825128 -4.2876,15.904333 -2.4545,3.079204 -7.2659,6.57348 -15.1249,11.972569 -7.859,5.39909 -21.1831,13.572101 -27.4249,32.067077 -6.2419,18.4949758 -0.4605,37.758386 9.7566,55.454828 10.2171,17.696443 24.0078,32.335764 43.1458,36.177623 19.1381,3.84186 32.879,-3.612739 41.4843,-7.719295 8.6053,-4.106556 14.0377,-6.52478 17.93168,-7.110826 3.8939,-0.586047 6.90985,-0.960867 15.91499,4.238251 9.00514,5.199118 10.19243,7.999328 11.63186,11.664579 1.43943,3.665252 2.06051,9.582259 2.80675,19.087903 0.74625,9.505639 1.16018,25.128749 14.05636,39.781869 12.89618,14.65311 32.46989,19.2757 52.90398,19.2757 20.43409,0 40.0078,-4.62259 52.90398,-19.2757 12.89617,-14.65312 13.31011,-30.27623 14.05635,-39.781869 0.74624,-9.505644 1.36733,-15.422651 2.80676,-19.087903 1.43942,-3.665251 2.62672,-6.465461 11.63186,-11.664579 9.00513,-5.199119 12.02108,-4.824297 15.91499,-4.238251 3.89392,0.586046 9.32639,3.004271 17.93164,7.110826 8.60525,4.106555 22.34625,11.561156 41.48432,7.719295 19.13806,-3.84186 32.92874,-18.481179 43.14579,-36.177623 10.21705,-17.696442 15.99856,-36.9598523 9.75668,-55.454828 -6.24189,-18.494976 -19.56594,-26.667988 -27.42495,-32.067077 -7.859,-5.399088 -12.67039,-8.893365 -15.12488,-11.972569 -2.45449,-3.079205 -4.28764,-5.506097 -4.28764,-15.904333 0,-10.398236 1.83315,-12.825127 4.28764,-15.904332 2.45449,-3.079205 7.26588,-6.573487 15.12488,-11.972567 7.85901,-5.3991 21.18307,-13.57211 27.42495,-32.06708 6.24188,-18.49497 0.46037,-37.75839 -9.75668,-55.45483 -10.21705,-17.69644 -24.00773,-32.33576 -43.14579,-36.17762 -19.13807,-3.84186 -32.87907,3.61274 -41.48432,7.71929 -8.60525,4.10656 -14.03772,6.52478 -17.93164,7.11083 -3.89391,0.58604 -6.90986,0.96086 -15.91499,-4.23825 -9.00514,-5.19913 -10.19243,-7.99932 -11.63186,-11.66458 -1.43943,-3.66525 -2.06052,-9.58225 -2.80676,-19.0879 -0.74624,-9.50564 -1.16018,-25.12875 -14.05635,-39.78187 -12.89618,-14.65311 -32.46989,-19.2757 -52.90398,-19.2757 z m 0.0181,130.78031 c 55.63168,0 100.16735,44.4506 100.16735,100.014299 0,55.563699 -44.53567,100.014302 -100.16735,100.014302 -55.63168,0 -100.16738,-44.450603 -100.16738,-100.014302 0,-55.563699 44.5357,-100.014299 100.16738,-100.014299 z" style="color:currentColor;fill:currentColor;stroke-linecap:round;stroke-linejoin:round;-inkscape-stroke:none;paint-order:stroke fill markers" transform="matrix(1.3636076,0,0,1.3667651,1527.8554,411.9526)"></path><path style="color:currentColor;fill:currentColor;stroke-width:1.05103;stroke-linejoin:round;-inkscape-stroke:none;paint-order:stroke fill markers" d="m 300.60937,218.51428 c -46.03938,0 -84.05805,38.06434 -84.05805,84.09712 0,46.03278 38.01867,84.09711 84.05805,84.09711 46.03938,0 84.05649,-38.06433 84.05649,-84.09711 0,-46.03278 -38.01711,-84.09712 -84.05649,-84.09712 z"></path></svg>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Users', icon: '<svg class="sidebar-menu-icon" viewBox="0 0 31.192 31.192" fill="currentColor"><g><path d="M25.876,19.223c-0.645-1.428-4.576-2.667-4.576-2.667c-2.096-0.738-2.11-1.477-2.11-1.477 c-4.122,8.125-7.253,0.022-7.253,0.022c-0.286,1.097-4.528,2.382-4.528,2.382c-1.236,0.477-1.762,1.194-1.762,1.194 c-1.835,2.716-2.05,8.767-2.05,8.767c0.026,1.382,0.622,1.526,0.622,1.526c4.215,1.883,10.829,2.215,10.829,2.215 c6.791,0.144,11.734-1.93,11.734-1.93c0.716-0.451,0.738-0.809,0.738-0.809C28.02,24.109,25.876,19.223,25.876,19.223z M18.589,26.881h-2.013v2.054h-1.749v-2.054h-2.038V25.13h2.039v-1.993h1.749v1.993h2.013L18.589,26.881L18.589,26.881z"></path><path d="M10.898,10.786c0.316,2.613,2.563,5.319,4.604,5.319c2.34,0,4.571-2.844,4.919-5.319c0.13-0.095,0.346-0.322,0.426-0.836 c0,0,0.501-1.792-0.163-1.602c0.231-0.688,0.998-3.379-0.487-5.052c0,0-0.696-0.948-2.386-1.451 c-0.058-0.051-0.119-0.1-0.188-0.147c0,0,0.039,0.043,0.092,0.119c-0.095-0.028-0.196-0.051-0.298-0.076 c-0.092-0.096-0.195-0.194-0.313-0.302c0,0,0.105,0.105,0.226,0.283C17.286,1.71,17.243,1.7,17.197,1.691 c-0.077-0.117-0.17-0.238-0.287-0.359c0,0,0.048,0.092,0.113,0.242c-0.31-0.228-0.935-0.76-0.935-1.35c0,0-0.393,0.184-0.623,0.517 c0.092-0.276,0.242-0.533,0.49-0.741c0,0-0.26,0.132-0.497,0.418c-0.182,0.104-0.606,0.392-0.749,0.903l-0.132-0.067 c0.067-0.147,0.159-0.298,0.284-0.454c0,0-0.183,0.163-0.342,0.425L14.246,1.09c0.081-0.152,0.188-0.307,0.331-0.461 c0,0-0.145,0.113-0.3,0.304c0.046-0.176,0.037-0.378-0.513,0.222c0,0-2.468,1.07-3.18,3.288c0,0-0.421,1,0.136,3.945 c-0.792-0.376-0.251,1.561-0.251,1.561C10.548,10.465,10.765,10.692,10.898,10.786z M10.85,9.736c0,0.003,0,0.003,0,0.003 S10.85,9.739,10.85,9.736z M15.384,0.517c-0.118,0.167-0.225,0.376-0.273,0.628l-0.086-0.034 C15.09,0.897,15.204,0.693,15.384,0.517z"></path></g></svg>', href: '/user' },
                { label: 'Tokos', icon: '<svg class="sidebar-menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path fill="none" d="M0 0h24v24H0z"></path><path d="M21 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7H2v-2l1-5h18l1 5v2h-1zM5 13v6h14v-6H5zm1 1h8v3H6v-3zM3 3h18v2H3V3z"></path></svg>', href: '/toko' },
                { label: 'Zonas', icon: '<i class="fas fa-map-marker-alt"></i>', href: '/zona' },
                { label: 'Kendaraan', icon: '<svg class="sidebar-menu-icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><g><path d="M489.121,100h-248.4c-12.641,0-22.881,10.24-22.881,22.88v246.56h118.468l0.733,0.002v-0.002h0.24 c0-3.84,0.318-7.6,0.959-10.88c5.199-30,31.199-51.84,61.68-51.84c30.48,0,56.48,21.84,61.68,51.6 c0.641,3.52,0.961,7.28,0.961,11.12h30.879c10.24,0,18.56-8.32,18.56-18.64V122.88C512,110.24,501.76,100,489.121,100z M464,160v32 H272v-32H464z M272,224h192v32H272V224z"></path><path d="M39.359,152.56L0,265.44v104h39.992l0.248,0.002v-0.002h0.24c0-3.84,0.32-7.6,0.959-10.88 c5.281-30,31.201-51.84,61.682-51.84c30.478,0,56.478,21.84,61.68,51.6c0.639,3.36,0.959,6.96,0.959,11.12h33.041V138H61.039 C51.52,138,42.961,143.76,39.359,152.56z M169.121,245.2c0,5.6-4.48,10-10.082,10H50.721c-7.121,0-12-7.2-9.281-13.76L62.801,174 c1.52-3.76,5.199-6.24,9.279-6.24h86.959c5.602,0,10.082,4.48,10.082,10V245.2z"></path><path d="M103.121,326.72c-20.961,0-38.48,15.28-41.922,35.28c-0.478,2.32-0.719,4.88-0.719,7.44 c0,23.44,19.119,42.56,42.641,42.56c23.6,0,42.638-19.12,42.638-42.56c0-2.56-0.16-5.12-0.638-7.44 C141.68,342,124.16,326.72,103.121,326.72z"></path><path d="M399.92,326.72c-21.041,0-38.48,15.28-42,35.28c-0.4,2.32-0.639,4.88-0.639,7.44 c0,23.44,19.119,42.56,42.639,42.56c23.6,0,42.64-19.12,42.64-42.56c0-2.56-0.16-5.12-0.64-7.44 C438.4,342,420.961,326.72,399.92,326.72z"></path></g></svg>', href: '/kendaraan' }
            ]
        },
        {
            id: 'system',
            label: 'System',
            icon: '<i class="fas fa-server"></i>',
            href: '#',
            isDropdown: true,
            children: [
                { label: 'Monitoring', icon: '<svg class="sidebar-menu-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M23,28L23,28c-1.1,0-2.1-0.7-2.5-1.8c0-0.1,0-0.2-0.1-0.2h-8.9c0,0.1,0,0.2-0.1,0.2C11.1,27.3,10.1,28,9,28h0 c-0.6,0-1,0.4-1,1s0.4,1,1,1h14c0.6,0,1-0.4,1-1S23.6,28,23,28z"></path><g><path d="M11,13v-2c-1.7,0-3,1.3-3,3s1.3,3,3,3s3-1.3,3-3h-2C11.4,14,11,13.6,11,13z"></path><path d="M27,3H5C3.3,3,2,4.3,2,6v15c0,1.7,1.3,3,3,3h6.9h8.1H27c1.7,0,3-1.3,3-3V6C30,4.3,28.7,3,27,3z M16,14c0,2.8-2.2,5-5,5 s-5-2.2-5-5s2.2-5,5-5c0-0.6,0.4-1,1-1c2.8,0,5,2.2,5,5C17,13.6,16.6,14,16,14z M25,16h-2c-0.6,0-1-0.4-1-1s0.4-1,1-1h2 c0.6,0,1,0.4,1,1S25.6,16,25,16z M25,13h-5c-0.6,0-1-0.4-1-1s0.4-1,1-1h5c0.6,0,1,0.4,1,1S25.6,13,25,13z"></path></g></svg>', href: '/monitoring' },
                { label: 'Audit Logs', icon: '<svg class="sidebar-menu-icon" viewBox="0 0 399.997 399.997" fill="currentColor"><g><g><g><path d="M366.684,24.971H33.316C14.945,24.971,0,39.917,0,58.288V275.56c0,18.371,14.945,33.317,33.316,33.317h107.412 l-20.387,44.955c-2.105,4.643-1.709,10.037,1.053,14.321c2.762,4.285,7.51,6.873,12.607,6.873h131.996c0.006,0,0.014,0,0.02,0 c8.285,0,15-6.715,15-15c0-2.493-0.605-4.848-1.686-6.916l-20.062-44.233h107.412c18.371,0,33.316-14.946,33.316-33.317V58.288 C400,39.917,385.055,24.971,366.684,24.971z M370,275.561c0,1.829-1.488,3.316-3.316,3.316H235.998h-71.996H33.316 c-1.828,0-3.316-1.487-3.316-3.316V58.288c0-1.829,1.488-3.317,3.316-3.317h333.367c1.828,0,3.316,1.488,3.316,3.317L370,275.561 L370,275.561z"></path><path d="M320.624,69.329c-16.198,0-29.374,13.178-29.374,29.376c0,1.495,0.114,2.964,0.33,4.4l-68.61,40.032 c-5.35-5.575-12.864-9.057-21.184-9.057c-10.379,0-19.513,5.416-24.737,13.564l-68.428-26.781 c0.082-0.889,0.129-1.787,0.129-2.696c0-16.198-13.176-29.377-29.374-29.377S50,101.969,50,118.167 c0,16.198,13.178,29.375,29.376,29.375c8.132,0,15.501-3.324,20.827-8.681l72.457,28.359 c1.854,14.425,14.204,25.611,29.126,25.611c16.198,0,29.376-13.178,29.376-29.375c0-0.704-0.037-1.401-0.084-2.092l69.938-40.808 c5.203,4.674,12.076,7.525,19.606,7.525c16.198,0,29.376-13.178,29.376-29.376C349.999,82.507,336.822,69.329,320.624,69.329z M79.376,127.714c-5.265,0-9.547-4.283-9.547-9.547c0-5.265,4.282-9.548,9.547-9.548c5.262,0,9.546,4.283,9.546,9.548 C88.922,123.431,84.638,127.714,79.376,127.714z M201.786,173.002c-5.266,0-9.547-4.282-9.547-9.546 c0-5.265,4.281-9.547,9.547-9.547c5.266,0,9.547,4.283,9.547,9.547C211.333,168.72,207.052,173.002,201.786,173.002z M320.624,108.252c-5.263,0-9.548-4.283-9.548-9.547c0-5.264,4.285-9.548,9.548-9.548c5.264,0,9.547,4.284,9.547,9.548 C330.171,103.969,325.888,108.252,320.624,108.252z"></path><path d="M300.41,139.172l-58.462,34.111c-2.02,18.901-17.13,33.942-36.061,35.861v51.674h134.89V139.195 c-5.938,3.434-12.816,5.41-20.153,5.41C313.469,144.604,306.515,142.708,300.41,139.172z"></path><path d="M163.189,180.851l-60.974-23.864c-6.677,4.603-14.568,7.079-22.84,7.079c-7.338,0-14.217-1.976-20.153-5.408v102.16 h134.889V208.61C179.548,205.781,167.568,195.063,163.189,180.851z"></path></g></g></g></svg>', href: '/logs' },
                { label: 'Storage Handler', icon: '<i class="fas fa-database"></i>', href: '/penyimpanan' },
                { label: 'Backup Manager', icon: '<svg class="sidebar-menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M0 3C0 2.44772 0.447715 2 1 2H23C23.5523 2 24 2.44772 24 3V5C24 5.55228 23.5523 6 23 6H1C0.447715 6 0 5.55228 0 5V3Z"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M2 9C2 8.44772 2.44772 8 3 8H21C21.5523 8 22 8.44772 22 9V19C22 20.6569 20.6569 22 19 22H5C3.34315 22 2 20.6569 2 19V9ZM10 11C9.44771 11 9 11.4477 9 12C9 12.5523 9.44771 13 10 13H14C14.5523 13 15 12.5523 15 12C15 11.4477 14.5523 11 14 11H10Z"></path></svg>', href: '/backup' },
                { label: 'WhatsApp Setup', icon: '<i class="fab fa-whatsapp"></i>', href: '/whatsapp-setup' }
            ]
        }
    ];

    // ============================================================
    // UNIFIED SIZING - ALL ITEMS IDENTICAL
    // ============================================================
    const STYLES = {
        // Menu item sizing
        menuItemHeight: '2.5rem',           // Fixed height for all items
        menuItemPadding: '0.6rem 0.8rem',   // Uniform padding
        menuItemGap: '0.8rem',               // Space between icon and text
        menuItemFontSize: '0.875rem',        // 14px
        menuItemLineHeight: '1',             // No extra spacing
        
        // Icon sizing
        iconSize: '1.2rem',                  // 19.2px
        
        // Colors (light mode default) - Using purple #3d3b6b
        bgColor: '#ffffff',
        textColor: '#3d3b6b',
        textMutedColor: 'rgba(61, 59, 107, 0.7)',
        hoverBg: 'rgba(61, 59, 107, 0.08)',
        borderColor: '#e5e7eb',
        activeTextColor: '#3d3b6b'
    };

    // ============================================================
    // INJECT SIDEBAR INTO DOM
    // ============================================================
    function renderSidebar() {
        console.log('[SIDEBAR] renderSidebar() called');
        
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.error('[SIDEBAR] ERROR: #sidebar element not found');
            return;
        }

        // Get dark mode state
        const isDarkMode = localStorage.getItem('dark_mode_enabled') === 'true';
        
        // Check if sidebar already rendered - if so, check if we need to re-render for dark mode change
        if (sidebar.getAttribute('data-rendered') === 'true') {
            const currentDarkMode = sidebar.getAttribute('data-dark-mode') === 'true';
            if (currentDarkMode === isDarkMode) {
                // Dark mode state hasn't changed, just update active states
                console.log('[SIDEBAR] Sidebar already rendered, updating active states only');
                updateActiveMenuItem();
                return;
            } else {
                // Dark mode state changed, need to re-render with new colors
                console.log('[SIDEBAR] Dark mode changed, re-rendering sidebar');
                sidebar.removeAttribute('data-rendered');
            }
        }

        const colors = isDarkMode ? {
            bgColor: '#0f172a',
            textColor: '#f0f4f8',
            textMutedColor: '#cbd5e1',
            hoverBg: 'rgba(37, 99, 235, 0.15)',
            borderColor: '#1e293b',
            activeTextColor: '#60a5fa'
        } : STYLES;

        // Build menu HTML
        let menuHTML = '';
        for (const item of menuConfig) {
            if (item.isDropdown) {
                menuHTML += renderDropdown(item, colors);
            } else {
                menuHTML += renderMenuItem(item, colors);
            }
        }

        // Inject CSS into head
        injectSidebarCSS(colors);

        // Build complete sidebar HTML
        const sidebarHTML = `
            <div class="sidebar-container" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 16rem;
                height: 100vh;
                background-color: ${colors.bgColor};
                border-right: 1px solid ${colors.borderColor};
                display: flex;
                flex-direction: column;
                z-index: 1000;
                overflow: hidden;
                transition: background-color 0.3s ease, border-color 0.3s ease;
            ">
                <!-- Brand with ANKA Logo -->
                <div style="
                    padding: 1rem 0.8rem;
                    border-bottom: 1px solid ${colors.borderColor};
                    flex-shrink: 0;
                    height: 80px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <div class="logo-anka-light" style="width:140px;height:50px;background-size:contain;background-repeat:no-repeat;background-position:center;display:block;"></div>
                    <div class="logo-anka-dark" style="width:140px;height:50px;background-size:contain;background-repeat:no-repeat;background-position:center;display:none;"></div>
                </div>

                <!-- Navigation Menu -->
                <nav class="sidebar-nav" style="
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding: 0.8rem 0.6rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                ">
                    ${menuHTML}
                </nav>

                <!-- Quick Actions Footer - HIDDEN: Moved to unified header -->
                <div style="
                    padding: 0.8rem 0.6rem;
                    border-top: 1px solid ${colors.borderColor};
                    flex-shrink: 0;
                    display: none;
                    gap: 0.4rem;
                ">
                    <button onclick="logout()" title="Logout" style="
                        flex: 1;
                        padding: 0.5rem;
                        background-color: #fecaca;
                        color: #7f1d1d;
                        border: none;
                        border-radius: 0.4rem;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 0.75rem;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        Logout
                    </button>
                    <button id="dark-mode-btn" onclick="toggleDarkMode()" title="Toggle Dark Mode" style="
                        flex: 1;
                        padding: 0.5rem;
                        background-color: #dbeafe;
                        color: #0c4a6e;
                        border: none;
                        border-radius: 0.4rem;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 0.75rem;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        ${isDarkMode ? '☀️' : '🌙'}
                    </button>
                </div>
            </div>
        `;

        // Fade out, update, fade in for smooth transition
        sidebar.style.opacity = '0.9';
        sidebar.style.transition = 'opacity 0.15s ease';
        
        sidebar.innerHTML = sidebarHTML;
        sidebar.setAttribute('data-rendered', 'true');
        sidebar.setAttribute('data-dark-mode', String(isDarkMode));

        // Log sidebar container width for verification
        const sidebarContainer = sidebar.querySelector('.sidebar-container');
        if (sidebarContainer) {
            console.log('[SIDEBAR] Sidebar container created:', {
                width: sidebarContainer.style.width,
                computedWidth: window.getComputedStyle(sidebarContainer).width
            });
        }

        // Fade back in
        setTimeout(() => {
            sidebar.style.opacity = '1';
        }, 50);

        // Adjust main content margin
        adjustMainContent();
    }

    // Update active menu item without full re-render
    function updateActiveMenuItem() {
        const allItems = document.querySelectorAll('.sidebar-item, .sidebar-child-item');
        const currentPath = window.location.pathname;

        allItems.forEach(item => {
            const href = item.getAttribute('data-href');
            if (href && isMenuItemActive(href)) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // ============================================================
    // RENDER MENU ITEM (regular link)
    // ============================================================
    function renderMenuItem(item, colors) {
        const isActive = isMenuItemActive(item.href);
        
        return `
            <a href="${item.href}" 
                class="sidebar-item ${isActive ? 'active' : ''}"
                data-href="${item.href}"
                style="
                    display: flex;
                    align-items: center;
                    height: ${STYLES.menuItemHeight};
                    padding: ${STYLES.menuItemPadding};
                    gap: ${STYLES.menuItemGap};
                    background-color: ${isActive ? colors.hoverBg : 'transparent'};
                    color: ${isActive ? colors.activeTextColor : colors.textColor};
                    text-decoration: none;
                    font-size: ${STYLES.menuItemFontSize};
                    line-height: ${STYLES.menuItemLineHeight};
                    border-radius: 0.5rem;
                    cursor: pointer;
                    box-sizing: border-box;
                    font-family: inherit;
                    font-weight: ${isActive ? 600 : 500};
                    position: relative;
                    overflow: hidden;
                    border-left: ${isActive ? '3px solid ' + colors.activeTextColor : '3px solid transparent'};
                    padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} - 3px);
                    flex-shrink: 0;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                "
            >
                <span style="
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: ${STYLES.iconSize};
                    height: ${STYLES.iconSize};
                    color: currentColor;
                ">
                    ${item.icon}
                </span>
                <span style="
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                ">
                    ${item.label}
                </span>
            </a>
        `;
    }

    // ============================================================
    // RENDER DROPDOWN (expandable menu)
    // ============================================================
    function renderDropdown(item, colors) {
        const isExpanded = isDropdownExpanded(item.id);
        
        let childrenHTML = '';
        for (const child of item.children) {
            const isActive = isMenuItemActive(child.href);
            childrenHTML += `
                <a href="${child.href}" 
                    class="sidebar-child-item ${isActive ? 'active' : ''}"
                    data-href="${child.href}"
                    style="
                        display: flex;
                        align-items: center;
                        height: ${STYLES.menuItemHeight};
                        padding: ${STYLES.menuItemPadding};
                        padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} + ${STYLES.iconSize} + ${STYLES.menuItemGap});
                        gap: ${STYLES.menuItemGap};
                        background-color: ${isActive ? colors.hoverBg : 'transparent'};
                        color: ${isActive ? colors.activeTextColor : colors.textMutedColor};
                        text-decoration: none;
                        font-size: ${STYLES.menuItemFontSize};
                        line-height: ${STYLES.menuItemLineHeight};
                        border-radius: 0.5rem;
                        cursor: pointer;
                        box-sizing: border-box;
                        font-family: inherit;
                        font-weight: ${isActive ? 600 : 400};
                        position: relative;
                        overflow: hidden;
                        border-left: ${isActive ? '3px solid ' + colors.activeTextColor : '3px solid transparent'};
                        padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} + ${STYLES.iconSize} + ${STYLES.menuItemGap} - 3px);
                    "
                >
                    <span style="
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 1rem;
                        height: 1rem;
                        opacity: 0.6;
                        color: currentColor;
                    ">
                        ${child.icon}
                    </span>
                    <span style="
                        flex: 1;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">
                        ${child.label}
                    </span>
                </a>
            `;
        }

        return `
            <div class="sidebar-dropdown" data-dropdown-id="${item.id}">
                <button 
                    class="sidebar-dropdown-btn ${isExpanded ? 'expanded' : ''}" 
                    onclick="toggleSidebarDropdown('${item.id}')"
                    style="
                        display: flex;
                        align-items: center;
                        height: ${STYLES.menuItemHeight};
                        width: 100%;
                        padding: ${STYLES.menuItemPadding};
                        gap: ${STYLES.menuItemGap};
                        background-color: transparent;
                        color: ${colors.textColor};
                        border: none;
                        text-decoration: none;
                        font-size: ${STYLES.menuItemFontSize};
                        line-height: ${STYLES.menuItemLineHeight};
                        border-radius: 0.5rem;
                        cursor: pointer;
                        box-sizing: border-box;
                        font-family: inherit;
                        font-weight: 500;
                        position: relative;
                        overflow: hidden;
                        border-left: 3px solid transparent;
                        padding-left: calc(${STYLES.menuItemPadding.split(' ')[1]} - 3px);
                        flex-shrink: 0;
                    "
                >
                    <span style="
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: ${STYLES.iconSize};
                        height: ${STYLES.iconSize};
                        color: currentColor;
                    ">
                        ${item.icon}
                    </span>
                    <span style="
                        flex: 1;
                        text-align: left;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">
                        ${item.label}
                    </span>
                    <svg class="dropdown-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" style="
                        flex-shrink: 0;
                        opacity: 0.6;
                        transform: ${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};
                    ">
                        <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>

                <div class="sidebar-dropdown-content ${isExpanded ? 'active' : ''}" 
                    id="dd-${item.id}"
                    style="
                        display: flex;
                        flex-direction: column;
                        gap: 0.2rem;
                        pointer-events: ${isExpanded ? 'auto' : 'none'};
                    ">
                    ${childrenHTML}
                </div>
            </div>
        `;
    }

    // ============================================================
    // INJECT CSS INTO HEAD
    // ============================================================
    function injectSidebarCSS(colors) {
        // Check if already injected
        if (document.getElementById('sidebar-css')) return;

        const css = `
            /* Pulsing Heartbeat Animation */
            @keyframes heartbeat-pulse {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
                }
                50% {
                    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
                }
            }

            /* CSS Variables for colors */
            :root {
                --sidebar-hover-bg: ${colors.hoverBg};
                --sidebar-active-color: ${colors.activeTextColor};
                --sidebar-text-color: ${colors.textColor};
                --sidebar-muted-color: ${colors.textMutedColor};
            }

            /* Sidebar CSS */
            #sidebar {
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                background: transparent !important;
            }

            .sidebar-nav {
                scrollbar-width: thin;
                scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }

            .sidebar-nav::-webkit-scrollbar {
                width: 6px;
            }

            .sidebar-nav::-webkit-scrollbar-thumb {
                background: rgba(100, 100, 100, 0.5);
                border-radius: 3px;
            }

            .sidebar-nav::-webkit-scrollbar-thumb:hover {
                background: rgba(100, 100, 100, 0.8);
            }

            .sidebar-item,
            .sidebar-dropdown-btn,
            .sidebar-child-item {
                box-sizing: border-box;
                flex-shrink: 0;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
                transform: translateX(0);
                will-change: transform;
            }

            /* Active menu item with pulsing heartbeat */
            .sidebar-item.active::before,
            .sidebar-child-item.active::before {
                content: '';
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                width: 8px;
                height: 8px;
                background: #3b82f6;
                border-radius: 50%;
                animation: heartbeat-pulse 2s infinite ease-in-out;
            }

            .sidebar-item.active,
            .sidebar-child-item.active {
                position: relative;
                font-weight: 600;
                background-color: var(--sidebar-hover-bg) !important;
                color: var(--sidebar-active-color) !important;
                border-left-color: var(--sidebar-active-color) !important;
            }

            /* Smooth hover animation - only for non-active items */
            .sidebar-item:hover:not(.active),
            .sidebar-dropdown-btn:hover:not(.expanded),
            .sidebar-child-item:hover:not(.active) {
                transform: translateX(4px);
                background-color: var(--sidebar-hover-bg) !important;
                color: var(--sidebar-active-color) !important;
                border-left-color: var(--sidebar-active-color) !important;
            }

            /* Dropdown button expanded state */
            .sidebar-dropdown-btn.expanded {
                transform: translateX(0);
            }

            .sidebar-dropdown-btn.expanded .dropdown-arrow {
                transform: rotate(180deg);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .sidebar-dropdown-content {
                display: flex;
                flex-direction: column;
                max-height: 0;
                opacity: 0;
                overflow: hidden;
                transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .sidebar-dropdown-content.active {
                max-height: 500px;
                opacity: 1;
            }

            #main-content {
                margin-left: 16rem;
                width: calc(100% - 16rem);
                box-sizing: border-box;
                transition: all 0.3s ease;
            }

            @media (max-width: 768px) {
                .sidebar-container {
                    display: none !important;
                }

                #main-content {
                    margin-left: 0 !important;
                    width: 100% !important;
                }
            }
        `;

        const style = document.createElement('style');
        style.id = 'sidebar-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================
    function isMenuItemActive(href) {
        if (!href || href === '#') return false;
        
        const currentPath = window.location.pathname.toLowerCase();
        const currentFile = currentPath.split('/').pop().replace('.html', '');
        
        // Extract filename/path from href
        const hrefFile = href.toLowerCase().split('/').pop().replace('.html', '');
        
        // Multiple comparison methods
        const isActive = 
            currentPath === href ||  // Exact match
            currentPath === href + '.html' ||  // With .html
            currentPath.includes('/' + hrefFile) ||  // Include as segment
            currentFile === hrefFile ||  // Same filename
            (href.includes('support') && currentFile.includes('support')) ||  // Any support pages
            (href.includes('dashboard') && currentFile.includes('dashboard')) ||  // Any dashboard pages
            (href.includes('whatsapp') && currentFile.includes('whatsapp'));  // Any whatsapp pages
        
        if (isActive) {
            console.log('[SIDEBAR] Active menu:', href, 'Current:', currentPath, 'Match:', isActive);
        }
        
        return isActive;
    }

    function isDropdownExpanded(dropdownId) {
        const expanded = sessionStorage.getItem(`sidebar-dropdown-${dropdownId}`);
        if (expanded === null) {
            // Check if any children are active
            const dropdown = menuConfig.find(m => m.id === dropdownId);
            if (dropdown && dropdown.children) {
                return dropdown.children.some(child => isMenuItemActive(child.href));
            }
            return false;
        }
        return expanded === 'true';
    }

    function adjustMainContent() {
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.marginLeft = '16rem';
            mainContent.style.width = 'calc(100% - 16rem)';
            mainContent.style.boxSizing = 'border-box';
            mainContent.style.transition = 'all 300ms ease';
            
            console.log('[SIDEBAR] adjustMainContent() - Set main-content:', {
                marginLeft: mainContent.style.marginLeft,
                width: mainContent.style.width,
                boxSizing: mainContent.style.boxSizing,
                computedWidth: window.getComputedStyle(mainContent).width,
                computedMarginLeft: window.getComputedStyle(mainContent).marginLeft
            });
        }
    }

    // ============================================================
    // GLOBAL FUNCTIONS (exposed for HTML event handlers)
    // ============================================================
    window.toggleSidebarDropdown = function(dropdownId) {
        const dropdownContent = document.getElementById(`dd-${dropdownId}`);
        if (!dropdownContent) return;

        // Get all dropdown contents
        const allDropdownContents = document.querySelectorAll('.sidebar-dropdown-content');
        
        // Check if this dropdown is currently expanded
        const isCurrentlyExpanded = parseFloat(dropdownContent.style.maxHeight) > 0;

        // Close all dropdowns with smooth animation
        allDropdownContents.forEach(content => {
            if (content.id !== `dd-${dropdownId}`) {
                // Close other dropdowns
                content.style.maxHeight = '0px';
                content.style.opacity = '0';
                content.style.pointerEvents = 'none';
                
                // Extract dropdown ID from content's id (format: dd-{dropdownId})
                const otherDropdownId = content.id.replace('dd-', '');
                
                // Update arrow rotation for button
                const btn = content.previousElementSibling;
                if (btn) {
                    const arrow = btn.querySelector('.dropdown-arrow');
                    if (arrow) {
                        arrow.style.transform = 'rotate(0deg)';
                    }
                }
                
                // Update sessionStorage for closed dropdown
                sessionStorage.removeItem(`sidebar-dropdown-${otherDropdownId}`);
            }
        });

        // Toggle current dropdown
        if (isCurrentlyExpanded) {
            // Close current dropdown
            dropdownContent.style.maxHeight = '0px';
            dropdownContent.style.opacity = '0';
            dropdownContent.style.pointerEvents = 'none';
            
            // Rotate arrow back
            const btn = dropdownContent.previousElementSibling;
            if (btn) {
                const arrow = btn.querySelector('.dropdown-arrow');
                if (arrow) {
                    arrow.style.transform = 'rotate(0deg)';
                }
            }
            
            // Update expanded state in sessionStorage
            sessionStorage.removeItem(`sidebar-dropdown-${dropdownId}`);
        } else {
            // Open current dropdown
            dropdownContent.style.maxHeight = '500px';
            dropdownContent.style.opacity = '1';
            dropdownContent.style.pointerEvents = 'auto';
            
            // Rotate arrow
            const btn = dropdownContent.previousElementSibling;
            if (btn) {
                const arrow = btn.querySelector('.dropdown-arrow');
                if (arrow) {
                    arrow.style.transform = 'rotate(180deg)';
                }
            }
            
            // Update expanded state in sessionStorage
            sessionStorage.setItem(`sidebar-dropdown-${dropdownId}`, 'true');
        }
    };

    window.toggleDarkMode = function() {
        const isDark = localStorage.getItem('dark_mode_enabled') === 'true';
        const newDarkState = !isDark;
        localStorage.setItem('dark_mode_enabled', String(newDarkState));
        document.documentElement.setAttribute('data-dark-mode', String(newDarkState));
        
        // Apply CSS variables immediately
        if (window.applyDarkModeInlineStyles) {
            window.applyDarkModeInlineStyles(newDarkState);
        }
        
        // Add transition class for smooth animation
        document.documentElement.classList.remove('no-transition');
        document.documentElement.classList.add('with-transitions');
        
        renderSidebar();
    };

    window.initSidebar = function() {
        console.log('[SIDEBAR] initSidebar() called');
        renderSidebar();
    };

    window.loadSidebar = function(page) {
        console.log('[SIDEBAR] loadSidebar() called for page:', page);
        renderSidebar();
    };

    // ============================================================
    // INITIALIZE ON DOM READY
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[SIDEBAR] DOM loaded, rendering sidebar');
            renderSidebar();
        });
    } else {
        console.log('[SIDEBAR] DOM already loaded, rendering sidebar immediately');
        renderSidebar();
    }

    // Re-render on dark mode toggle from other sources
    window.addEventListener('storage', (e) => {
        if (e.key === 'dark_mode_enabled') {
            console.log('[SIDEBAR] Dark mode changed, re-rendering');
            renderSidebar();
        }
    });

})();
