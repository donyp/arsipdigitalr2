// ============================================================
// Pusat Arsip Anka — Configuration
// ============================================================

const CONFIG = {
    // Backend API URL
    // For production: use https://arsipdigitalanka.my.id
    // For local development: use http://localhost:5000
    API_URL: (typeof window !== 'undefined' && window.location.hostname === 'localhost') 
        ? 'http://localhost:5000'
        : 'https://arsipdigitalanka.my.id',

    // App Constants
    CATEGORIES: [
        { value: 'PPN', label: 'PPN' },
        { value: 'NON_PPN', label: 'NON' },
        { value: 'INVOICE', label: 'Invoice Merah' },
        { value: 'PIUTANG', label: 'Bukti Pembayaran Piutang' }
    ],

    CATEGORY_FOLDERS: {
        'PPN': 'PPN',
        'NON_PPN': 'NON_PPN',
        'INVOICE': 'INVOICE',
        'PIUTANG': 'PIUTANG'
    },

    // Pagination
    PAGE_SIZE: 15
};
