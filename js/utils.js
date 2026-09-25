// ============================================================
// Utility Functions - Toast, Modals, Helpers
// ============================================================

// ---- Toast Notification System ----
const Toast = {
    container: null,

    init() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'fixed top-6 right-6 z-[9999] flex flex-col gap-3';
        document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 3500) {
        this.init();

        const icons = {
            success: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
            error: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
            warning: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>`,
            info: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        };

        const colors = {
            success: 'bg-[#ecfdf5]/95 border-[#10b981]/30 text-[#065f46]',
            error: 'bg-[#fef2f2]/95 border-[#ef4444]/30 text-[#991b1b]',
            warning: 'bg-[#fffbeb]/95 border-[#f59e0b]/30 text-[#92400e]',
            info: 'bg-[#f0f9ff]/95 border-[#0ea5e9]/30 text-[#075985]'
        };

        const toast = document.createElement('div');
        toast.className = `toast-item flex items-center gap-3 px-5 py-3.5 rounded-xl border backdrop-blur-xl bg-gradient-to-r ${colors[type]} to-transparent shadow-2xl min-w-[320px] max-w-[420px] animate-slide-in`;
        toast.innerHTML = `
            <span class="flex-shrink-0">${icons[type]}</span>
            <span class="text-sm font-medium flex-1">${message}</span>
            <button onclick="this.parentElement.remove()" class="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        `;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('animate-slide-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
};

// ---- Standardized Modals (Replacement for alert/confirm) ----
function showAlert(title, message, onOk) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-md animate-fade-in';
    overlay.innerHTML = `
        <div class="relative bg-gray-900/95 border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-scale-in text-center">
            <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h3 class="text-xl font-bold text-white mb-2">${title}</h3>
            <p class="text-gray-400 text-sm mb-8 leading-relaxed">${message}</p>
            <button id="alert-ok" class="w-full py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 shadow-lg shadow-indigo-500/25 transition-all duration-200">
                Lanjutkan
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#alert-ok').addEventListener('click', () => {
        overlay.remove();
        if (onOk) onOk();
    });
}

function showConfirm(title, message, onConfirm, okText = 'Konfirmasi', cancelText = 'Batal', isDark = false) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-md animate-fade-in';

    // Switch to Light Premium theme by default, matching Image 1-3
    const bgColor = isDark ? 'bg-[#1e293b]/95' : 'bg-white/95';
    const textColor = isDark ? 'text-white' : 'text-gray-900';
    const subTextColor = isDark ? 'text-gray-300' : 'text-gray-500';

    overlay.innerHTML = `
        <div class="relative ${bgColor} border ${isDark ? 'border-white/10' : 'border-gray-100'} rounded-3xl p-8 max-w-md w-full shadow-2xl animate-scale-in">
            <div class="flex items-start gap-4 mb-6">
                <div class="flex-shrink-0 w-12 h-12 rounded-xl ${isDark ? 'bg-red-500/20' : 'bg-red-50'} text-red-500 flex items-center justify-center border ${isDark ? 'border-red-500/20' : 'border-red-100'}">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <div>
                    <h3 class="text-xl font-bold ${textColor} mb-1">${title}</h3>
                    <p class="${subTextColor} text-sm leading-relaxed font-medium">${message}</p>
                </div>
            </div>
            <div class="flex gap-3">
                <button id="confirm-cancel" class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all duration-200">${cancelText}</button>
                <button id="confirm-ok" class="flex-1 px-8 py-3.5 rounded-2xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/25 transition-all duration-200">${okText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#confirm-cancel').addEventListener('click', () => overlay.remove());

    const okBtn = overlay.querySelector('#confirm-ok');
    okBtn.addEventListener('click', async () => {
        try {
            // Add loading state
            const originalContent = okBtn.innerHTML;
            okBtn.disabled = true;
            okBtn.innerHTML = `
                <div class="flex items-center justify-center gap-2">
                    <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Memproses...</span>
                </div>
            `;

            const result = await onConfirm();

            // If callback specifically returns false, don't close (useful for validation errors)
            if (result !== false) {
                overlay.remove();
            } else {
                // Restore button if we stay open
                okBtn.disabled = false;
                okBtn.innerHTML = originalContent;
            }
        } catch (err) {
            console.error('[showConfirm] Error in callback:', err);
            // okBtn.disabled = false; // Restore button on error?
            // Actually, stay open but restore button
            okBtn.disabled = false;
            okBtn.innerHTML = originalContent;
        }
    });
}

// ---- Loading Spinner ----
function showLoading(targetId = 'main-content') {
    const target = document.getElementById(targetId);
    if (!target) return;

    const loader = document.createElement('div');
    loader.id = 'loading-overlay';
    loader.className = 'absolute inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm rounded-2xl';
    loader.innerHTML = `
        <div class="premium-loader">
            <div class="loader-rings">
                <div class="loader-ring"></div>
                <div class="loader-ring"></div>
                <div class="loader-ring"></div>
            </div>
            <span class="loader-text">Memuat data...</span>
        </div>
    `;
    target.style.position = 'relative';
    target.appendChild(loader);
}

function hideLoading() {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.remove();
}

// ---- Date Formatting ----
function normalizeTipePPN(value) {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'NON_PPN' ? 'NON' : normalized;
}

function getTipePPNLabel(value) {
    const normalized = normalizeTipePPN(value);
    return normalized === 'NON' ? 'NON' : normalized || '-';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---- Category Label ----
function getCategoryLabel(value) {
    const cat = CONFIG.CATEGORIES.find(c => c.value === value);
    return cat ? cat.label : (value === 'NON_PPN' ? 'NON' : value);
}

function getCategoryColor(value) {
    const colors = {
        'PPN': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        'NON_PPN': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        'INVOICE': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        'PIUTANG': 'bg-purple-500/15 text-purple-400 border-purple-500/30'
    };
    return colors[value] || 'bg-gray-500/15 text-gray-400 border-gray-500/30';
}

// ---- Zone Label ----
function getZoneLabel(value) {
    const zone = CONFIG.ZONES.find(z => z.value === value);
    return zone ? zone.label : value;
}

// ---- Debounce ----
function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ---- Truncate Text ----
function truncate(str, len = 40) {
    if (!str) return '';
    // Strip .pdf extension for display if requested
    const cleanStr = str.replace(/\.pdf$/i, '');
    return cleanStr.length > len ? cleanStr.substring(0, len) + '...' : cleanStr;
}

// ---- Currency Formatting ----
function formatCurrency(val) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(val);
}

// ---- Cross-Page Update History Notification ----
async function initUpdateHistoryNotification() {
    // Only initialize once per page load
    if (window._updateHistoryNotificationInitialized) {
        console.log('[Update Notify] Already initialized, skipping');
        return;
    }
    window._updateHistoryNotificationInitialized = true;

    try {
        console.log('[Update Notify] Starting check...');
        
        // Get latest update - wrapped in try-catch since table may not exist
        let updates = [];
        try {
            const response = await API.get('/api/update-history');
            console.log('[Update Notify] API response:', response);
            
            // Handle different response formats
            if (response && Array.isArray(response)) {
                updates = response;
            } else if (response && response.updates && Array.isArray(response.updates)) {
                updates = response.updates;
            }
        } catch (apiErr) {
            console.log('[Update Notify] Update history endpoint not available (table may not exist):', apiErr.message);
            return;
        }
        
        if (!updates || updates.length === 0) {
            console.log('[Update Notify] No updates found');
            return;
        }
        
        const latestUpdate = updates[0];
        if (!latestUpdate || !latestUpdate.id) {
            console.log('[Update Notify] Latest update invalid:', latestUpdate);
            return;
        }
        
        console.log('[Update Notify] Latest update ID:', latestUpdate.id);
        console.log('[Update Notify] Latest update created_at:', latestUpdate.created_at);
        
        const lastSeenUpdateId = localStorage.getItem('lastSeenUpdateId');
        console.log('[Update Notify] Last seen update ID:', lastSeenUpdateId);
        
        // Check if update was just created (within last 5 minutes)
        // This works even across different user logins since we check the server timestamp
        const updateCreatedTime = new Date(latestUpdate.created_at).getTime();
        const now = Date.now();
        const timeSincePublish = now - updateCreatedTime;
        const isRecentUpdate = timeSincePublish < (5 * 60 * 1000); // 5 minutes
        
        console.log('[Update Notify] Time since publish:', timeSincePublish, 'ms (', (timeSincePublish/1000), 'seconds )');
        console.log('[Update Notify] Is recent update:', isRecentUpdate);
        
        // Show if:
        // 1. User hasn't seen this update yet (lastSeenUpdateId !== latestUpdate.id), OR
        // 2. It's a recent update (published within 5 minutes)
        if (lastSeenUpdateId === String(latestUpdate.id) && !isRecentUpdate) {
            console.log('[Update Notify] User already saw this update and it\'s not recent - skipping');
            return;
        }
        
        console.log('[Update Notify] Should show popup!');
        
        // Mark as seen
        localStorage.setItem('lastSeenUpdateId', String(latestUpdate.id));
        
        // Show notification badge if element exists
        const badge = document.getElementById('update-history-badge');
        if (badge) {
            badge.classList.remove('hidden');
        }
        
        // Load items for this update
        const itemsResp = await fetch(`${CONFIG.API_URL}/api/update-history-items/${latestUpdate.id}`, {
            headers: { 'Authorization': `Bearer ${API.getToken()}` }
        });
        
        if (!itemsResp.ok) {
            console.log('[Update Notify] Failed to load items');
            return;
        }
        const itemsData = await itemsResp.json();
        const items = itemsData.items || [];
        
        // Group by type
        const groupedByType = {};
        items.forEach(item => {
            if (!groupedByType[item.type]) {
                groupedByType[item.type] = [];
            }
            groupedByType[item.type].push(item);
        });
        
        // Build HTML
        let itemsHtml = '';
        const typeOrder = ['UPDATE', 'BUG_FIX', 'FEATURE', 'IMPROVEMENT'];
        let isFirst = true;
        typeOrder.forEach(type => {
            if (groupedByType[type]) {
                const typeIcon = type === 'UPDATE' ? '📦' : type === 'BUG_FIX' ? '🐛' : type === 'FEATURE' ? '✨' : '⚡';
                const typeBadge = {
                    'UPDATE': 'background: #dbeafe; color: #1e40af;',
                    'BUG_FIX': 'background: #fee2e2; color: #991b1b;',
                    'FEATURE': 'background: #dcfce7; color: #166534;',
                    'IMPROVEMENT': 'background: #fef3c7; color: #92400e;'
                }[type] || 'background: #f3f4f6; color: #4b5563;';
                
                const itemsOfType = groupedByType[type];
                const separator = !isFirst ? '<div style="height: 1px; background: linear-gradient(to right, transparent, #e5e7eb, transparent); margin: 12px 0;"></div>' : '';
                isFirst = false;
                
                itemsHtml += `
                    ${separator}
                    <div style="margin-bottom: 12px; margin-top: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 5px 10px; border-radius: 6px; ${typeBadge} box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);">
                                ${typeIcon} ${type.replace('_', ' ')}
                            </span>
                        </div>
                        <div style="margin-left: 0;">
                            ${itemsOfType.map((item, idx) => `
                                <div style="margin-bottom: 10px; padding-left: 0;">
                                    <p style="margin: 0 0 4px 0; font-weight: 700; color: #1e293b; font-size: 14px; line-height: 1.3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;">${idx + 1}. ${item.title}</p>
                                    <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.4; padding-left: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;">• ${item.description || '(Tidak ada deskripsi)'}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        });
        
        const date = new Date(latestUpdate.created_at).toLocaleDateString('id-ID', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric'
        });
        
        const content = `
            <div style="text-align: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0;">
                <div style="font-size: 48px; margin-bottom: 12px; opacity: 0.95; filter: drop-shadow(0 2px 8px rgba(102, 126, 234, 0.12));">📦</div>
                <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;">Update Sistem Anka</h2>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 0;">
                    <span style="font-size: 14px; color: #667eea; font-weight: 700; letter-spacing: 0.3px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;">v${latestUpdate.version}</span>
                    <span style="width: 3px; height: 3px; background: #cbd5e1; border-radius: 50%;"></span>
                    <span style="font-size: 11px; color: #94a3b8; font-weight: 500; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;">${date}</span>
                </div>
            </div>
            <div style="max-height: 380px; overflow-y: auto; margin-bottom: 0; text-align: left; padding-right: 8px;">
                <h3 style="margin: 0 0 10px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.8px; padding-bottom: 0; border-bottom: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;">✨ Daftar Perubahan</h3>
                ${itemsHtml}
            </div>
            <style>
                .swal2-html-container::-webkit-scrollbar {
                    width: 6px;
                }
                .swal2-html-container::-webkit-scrollbar-track {
                    background: #f1f5f9;
                    border-radius: 10px;
                }
                .swal2-html-container::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 10px;
                }
                .swal2-html-container::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
            </style>
            `;
        
        // Check if user has already seen this update
        const seenUpdateKey = `seen_update_${latestUpdate.id}`;
        if (localStorage.getItem(seenUpdateKey)) {
            console.log('[Update Notify] User already seen this update');
            return; // Don't show again
        }
        
        Swal.fire({
            html: content,
            confirmButtonText: 'Lihat Detail',
            cancelButtonText: 'Tutup',
            confirmButtonColor: '#667eea',
            showCancelButton: true,
            width: 440,
            padding: '20px 18px',
            allowOutsideClick: false,
            didOpen: () => {
                const modal = Swal.getHtmlContainer().closest('.swal2-modal');
                if (modal) {
                    modal.style.borderRadius = '16px';
                    modal.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.08)';
                }
                const btn = document.querySelector('.swal2-confirm');
                if (btn) {
                    btn.style.borderRadius = '8px';
                    btn.style.padding = '10px 32px';
                    btn.style.fontWeight = '700';
                    btn.style.fontSize = '13px';
                    btn.style.letterSpacing = '0.2px';
                    btn.style.textTransform = 'uppercase';
                    btn.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif';
                }
            }
        }).then((result) => {
            // Mark as seen when user closes the modal
            localStorage.setItem(seenUpdateKey, 'true');
            
            if (result.isConfirmed) {
                window.location.href = '/update-history';
            }
        });
        
    } catch (err) {
        console.error('[Update Notify] Error:', err);
        console.error('[Update Notify] Error message:', err.message);
        console.error('[Update Notify] Stack:', err.stack);
    }
}
