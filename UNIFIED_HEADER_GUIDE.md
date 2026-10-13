# Unified Header Component - Implementation Guide

Panduan lengkap untuk mengimplementasikan header yang konsisten di semua halaman.

## Overview

Sistem header terpadu memberikan:
- ✅ Greeting dengan nama user dan emoji
- ✅ Display date & time real-time
- ✅ Search bar dengan keyboard shortcut (Cmd+K / Ctrl+K)
- ✅ Tombol refresh, dark mode toggle, dan logout
- ✅ Responsive design untuk mobile/tablet/desktop
- ✅ Konsisten di semua halaman

## Files

### 1. `js/unified-header.js` (Main Component)
- `createUnifiedHeader(options)` - Buat header HTML
- `initializeUnifiedHeader(options)` - Inisialisasi dan aktifkan
- `updateDateTime()` - Update tanggal/waktu real-time
- `updateGreeting(hours)` - Update greeting berdasarkan jam
- `loadUserGreeting()` - Load nama user dari localStorage
- `performSearch(query)` - Handle pencarian

### 2. `css/unified-header.css` (Styling)
- Dark mode support
- Responsive breakpoints (768px, 480px)
- Smooth animations dan transitions
- Light mode fallback

## Quick Implementation

### Step 1: Import Files
```html
<head>
    <!-- CSS -->
    <link rel="stylesheet" href="css/unified-header.css">
</head>
<body>
    <!-- Place your main content AFTER body tag -->
    <main id="main-content">
        <!-- Your page content here -->
    </main>
    
    <!-- Script at end of body -->
    <script src="js/unified-header.js"></script>
</body>
```

### Step 2: Auto-Initialize
Header akan auto-initialize ketika DOM siap (tidak perlu setup tambahan).

Atau manual init dengan options:
```html
<script>
document.addEventListener('DOMContentLoaded', () => {
    initializeUnifiedHeader({
        showSearch: true,
        showRefresh: true,
        showDarkMode: true,
        showLogout: true,
        searchPlaceholder: 'Search invoices...',
        customButtons: [
            {
                icon: 'fas fa-bell',
                title: 'Notifications',
                onclick: 'openNotifications()'
            }
        ]
    });
});
</script>
```

### Step 3: Customize Per-Page
```javascript
// Listen untuk search events
window.addEventListener('headerSearch', (e) => {
    const query = e.detail.query;
    // Handle search untuk halaman ini
    searchInvoices(query);
});
```

## Options

```javascript
{
    showSearch: true,              // Tampilkan search bar
    showRefresh: true,             // Tampilkan refresh button
    showDarkMode: true,            // Tampilkan dark mode toggle
    showLogout: true,              // Tampilkan logout button
    searchPlaceholder: 'Search...', // Placeholder search
    customButtons: [               // Custom buttons
        {
            icon: 'fas fa-bell',       // Font Awesome icon
            title: 'Button tooltip',   // Hover text
            onclick: 'functionName()'  // Click handler
        }
    ]
}
```

## Feature Details

### 1. Date & Time
- Update setiap 1 detik
- Format: "Senin, 13 Oktober 2026 • 09:17:34"
- Timezone lokal browser

### 2. Greeting
- Automatic berdasarkan jam:
  - 05:00 - 11:59: "Good Morning"
  - 12:00 - 16:59: "Good Afternoon"
  - 17:00 - 20:59: "Good Evening"
  - 21:00 - 04:59: "Good Night"
- Ambil nama user dari `localStorage.getItem('user_name')`

### 3. Search
- Keyboard shortcut: **Cmd+K** (Mac) atau **Ctrl+K** (Windows/Linux)
- Emit event `headerSearch` dengan `detail.query`
- Per-page handler bisa listen event ini

### 4. Dark Mode Toggle
- Toggle antara dark/light mode
- Save ke localStorage
- Trigger `applyDarkModeInlineStyles()` jika ada
- Icon berubah: moon → sun

### 5. Buttons
- **Refresh**: Reload halaman
- **Dark Mode**: Toggle dark/light
- **Logout**: Call `logout()` function

## Implementation Pages

Berikut halaman yang perlu diupdate dengan header ini:

### Dashboard Pages (Priority 1)
- [ ] `dashboard.html` (Moderator) - Already has custom greeting
- [ ] `dashboard-admin-zona.html` (Admin Zona)
- [ ] `dashboard-moderator.html` (Legacy)
- [ ] `monitoring.html` (VPS Monitoring)

### Management Pages (Priority 2)
- [ ] `users.html` - User management
- [ ] `tokos.html` - Toko management
- [ ] `zonas.html` - Zona management
- [ ] `kendaraan-dashboard.html` - Vehicle tracking

### Upload Pages (Priority 3)
- [ ] `upload-excel.html`
- [ ] `upload-invoice-pdf.html`
- [ ] `upload-bukti-bayar.html`
- [ ] `upload-faktur-pajak.html`

### Support Pages (Priority 4)
- [ ] `support-dashboard.html`
- [ ] `support-dashboard-customer.html`
- [ ] `support-create-ticket.html`

### Other Pages (Priority 5)
- [ ] `audit-logs.html`
- [ ] `rename-faktur.html`
- [ ] `storage-handler.html`
- [ ] `whatsapp-messages.html`

## Example Implementation for upload-invoice-pdf.html

```html
<!-- Before </head> -->
<link rel="stylesheet" href="css/unified-header.css">

<!-- After <body> -->
<body>
    <main id="main-content">
        <!-- Your existing content here -->
    </main>

    <!-- Existing scripts -->
    <script src="js/your-existing-script.js"></script>
    
    <!-- Add unified header -->
    <script src="js/unified-header.js"></script>
    
    <!-- Custom search handler -->
    <script>
        window.addEventListener('headerSearch', (e) => {
            const query = e.detail.query;
            document.getElementById('search-input').value = query;
            performSearch();
        });
    </script>
</body>
```

## Styling Classes

Gunakan classes ini jika perlu customize:
- `.unified-header` - Main container
- `.header-left` - Greeting section
- `.header-center` - Search section
- `.header-right` - Buttons section
- `.header-btn` - Button styling
- `.greeting-text` - Greeting text
- `.datetime-display` - Date & time display
- `.search-box` - Search bar container

## Dark Mode Integration

Header otomatis adapt dengan dark mode system yang sudah ada:
- Check `localStorage.getItem('dark_mode_enabled')`
- CSS variables: `--header-bg`, `--header-text`, dll
- Support light mode dengan `@media (prefers-color-scheme: light)`

## Responsive Breakpoints

- **Desktop (1200px+)**: Full layout dengan search di center
- **Tablet (768px-1199px)**: Compact layout
- **Mobile (480px-767px)**: Stacked layout
- **Small Mobile (<480px)**: Minimal buttons

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers
- ✅ Dark mode (CSS variables + media query)

## Performance

- Zero external dependencies (FontAwesome already in project)
- Lightweight: ~8KB minified
- CSS Grid/Flexbox untuk layout
- No jQuery atau framework dependencies
- CSS animations dengan GPU acceleration

## Troubleshooting

### Header tidak muncul
1. Pastikan `<main id="main-content">` ada di HTML
2. Check browser console untuk errors
3. Pastikan `css/unified-header.css` ter-load

### DateTime tidak update
- Check `updateDateTime()` function
- Verify `localStorage` accessible
- Check timezone browser

### Dark mode toggle tidak work
- Verify `dark-mode-init.js` loaded
- Check `applyDarkModeInlineStyles()` function exists
- Review localStorage `dark_mode_enabled` key

### Search tidak work
- Listen ke `headerSearch` event
- Implement `performSearch()` handler per-page
- Check keyboard shortcut: Cmd+K / Ctrl+K

## Migration from Old Header

Jika halaman sudah punya header lama:
1. Remove old header HTML
2. Remove old header CSS
3. Add `<main id="main-content">` wrapper
4. Add `unified-header.js` script
5. Test dan pastikan sama

## Notes

- Header sticky di top (z-index: 100)
- Backdrop blur untuk effect modern
- Automatically hide greeting subtitle on mobile
- Responsive button sizing
- Smooth transitions semua interaction
