// ============================================
// Bulk Upload Invoice PDF with Validation
// ============================================

let selectedFiles = [];
let validationResults = [];

// Helper function to format currency as Rupiah
function formatRupiah(amount) {
    if (!amount) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Custom notification system (toast)
function showNotification(message, type = 'success', duration = 4000) {
    // Create toast container if not exists
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? '#27ae60' : (type === 'error' ? '#e74c3c' : '#3498db');
    const icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
    
    toast.style.cssText = `
        background: ${bgColor};
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 300px;
        animation: slideInRight 0.3s ease-out;
        font-weight: 500;
        font-size: 14px;
        pointer-events: auto;
    `;
    
    toast.innerHTML = `
        <span style="font-size: 18px; font-weight: bold;">${icon}</span>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);

    // Auto remove after duration
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}

// Add animation keyframes if not exists
if (!document.getElementById('toast-animations')) {
    const style = document.createElement('style');
    style.id = 'toast-animations';
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
        
        @keyframes spin {
            from {
                transform: rotate(0deg);
            }
            to {
                transform: rotate(360deg);
            }
        }
        
        @keyframes pulse {
            0%, 100% {
                opacity: 1;
            }
            50% {
                opacity: 0.5;
            }
        }
        
        @keyframes slideUp {
            from {
                transform: translateY(20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
        
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            backdrop-filter: blur(2px);
        }
        
        .loading-modal {
            background: white;
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            min-width: 350px;
            animation: slideUp 0.3s ease-out;
        }
        
        html[data-dark-mode="true"] .loading-modal {
            background: #1e293b;
            color: #f1f5f9;
        }
        
        html[data-dark-mode="true"] .loading-text {
            color: #f1f5f9 !important;
        }
        
        html[data-dark-mode="true"] .loading-subtext {
            color: #cbd5e1 !important;
        }
        
        html[data-dark-mode="true"] .progress-bar-container {
            background: #334155 !important;
        }
        
        .loading-spinner {
            width: 60px;
            height: 60px;
            margin: 0 auto 20px;
            border: 4px solid #f0f0f0;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        html[data-dark-mode="true"] .loading-spinner {
            border-color: #334155 !important;
            border-top-color: #60a5fa !important;
        }
        
        .loading-text {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
        }
        
        .loading-subtext {
            font-size: 14px;
            color: #666;
            margin-bottom: 20px;
        }
        
        html[data-dark-mode="true"] .loading-subtext {
            color: #cbd5e1 !important;
        }
        
        .progress-bar-container {
            width: 100%;
            height: 6px;
            background: #f0f0f0;
            border-radius: 3px;
            overflow: hidden;
            margin-top: 20px;
        }
        
        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #3498db, #2ecc71);
            border-radius: 3px;
            transition: width 0.3s ease;
            animation: pulse 1.5s ease-in-out infinite;
        }
    `;
    document.head.appendChild(style);
}

// Loading overlay system
let loadingOverlay = null;

window.showLoadingOverlay = function(text = 'Loading...', subtext = '') {
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        document.body.appendChild(loadingOverlay);
    }
    
    loadingOverlay.innerHTML = `
        <div class="loading-modal">
            <div class="loading-spinner"></div>
            <div class="loading-text">${text}</div>
            ${subtext ? `<div class="loading-subtext">${subtext}</div>` : ''}
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: 100%;"></div>
            </div>
        </div>
    `;
    loadingOverlay.style.display = 'flex';
};

window.hideLoadingOverlay = function() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    // Prevent default drag behaviors on document
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Drag and drop on dropZone
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#e74c3c';
        dropZone.style.backgroundColor = '#fde8e8';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#e74c3c';
        dropZone.style.backgroundColor = '#fff5f3';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#e74c3c';
        dropZone.style.backgroundColor = '#fff5f3';
        
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            handleFilesSelected(e.dataTransfer.files);
        }
    });

    // Click to select
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFilesSelected(e.target.files);
        }
    });
});

function handleFilesSelected(files) {
    console.log('[PDF Bulk] Files selected:', files.length);
    
    // Strict PDF validation
    const pdfFiles = [];
    const rejectedFiles = [];
    
    Array.from(files).forEach(f => {
        const ext = f.name.toLowerCase().split('.').pop();
        const validMimeTypes = ['application/pdf'];
        
        // Extension check
        if (ext !== 'pdf') {
            rejectedFiles.push({
                name: f.name,
                reason: `Format tidak valid: .${ext} (hanya .pdf yang diizinkan)`
            });
            return;
        }
        
        // MIME type check (warning only, not blocking)
        if (!validMimeTypes.includes(f.type) && f.type !== '') {
            console.warn(`[PDF Bulk] File ${f.name} has unexpected MIME type: ${f.type}`);
        }
        
        // Size check
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (f.size > maxSize) {
            rejectedFiles.push({
                name: f.name,
                reason: `File terlalu besar: ${(f.size / 1024 / 1024).toFixed(2)}MB (maks 10MB)`
            });
            return;
        }
        
        pdfFiles.push(f);
    });
    
    // Show rejection summary if any
    if (rejectedFiles.length > 0) {
        const rejectionMsg = rejectedFiles.map(r => `• ${r.name}: ${r.reason}`).join('\n');
        showNotification(
            `❌ ${rejectedFiles.length} file ditolak:\n\n${rejectionMsg}`,
            'error'
        );
    }
    
    if (pdfFiles.length === 0) {
        showNotification('❌ Tidak ada file PDF yang valid', 'error');
        return;
    }
    
    selectedFiles = pdfFiles;
    console.log(`[PDF Bulk] Valid PDF files: ${selectedFiles.length}`);

    // Start validation
    validateAllFiles();
}

async function validateAllFiles() {
    const dropZone = document.getElementById('dropZone');
    const filesList = document.getElementById('filesList');
    const stats = document.getElementById('stats');
    const validating = document.getElementById('validating');

    // Show validating spinner
    dropZone.style.display = 'none';
    validating.style.display = 'block';

    validationResults = [];

    try {
        // Get token from API object if available, otherwise from localStorage
        let token;
        if (typeof API !== 'undefined' && API.getToken) {
            token = API.getToken();
        } else {
            token = localStorage.getItem('jwt_token');
        }
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        // Validate each file with small delay to show progress
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const faktur = file.name.replace(/\.pdf$/i, '').trim();
            
            console.log(`[PDF Bulk] Validating ${i+1}/${selectedFiles.length}: ${faktur}`);
            
            try {
                const response = await fetch(`${CONFIG.API_URL}/api/invoice/check-faktur/${faktur}`, {
                    method: 'GET',
                    headers: headers
                });

                const result = await response.json();
                
                if (response.ok && result.data) {
                    // Check if PDF has already been uploaded
                    if (result.data.invoice_pdf_path) {
                        // File path exists in database, but verify it still exists on Google Drive
                        try {
                            console.log('[PDF Bulk Debug] Verifying file exists on Google Drive:', result.data.invoice_pdf_path);
                            const checkRes = await fetch(`${CONFIG.API_URL}/api/invoice/check-file/${faktur}/invoice`, {
                                method: 'GET',
                                headers: headers
                            });
                            const checkData = await checkRes.json();
                            console.log('[PDF Bulk Debug] File check result:', checkData);
                            
                            if (checkData.exists) {
                                // File still exists on Google Drive - mark as duplicate
                                validationResults.push({
                                    file: file,
                                    faktur: faktur,
                                    valid: false,
                                    error: 'PDF sudah diupload sebelumnya (Duplicate)',
                                    invoice: result.data
                                });
                                console.log('[PDF Bulk] ✗ Invalid (Duplicate):', faktur, '- Already uploaded at:', result.data.invoice_pdf_path);
                            } else {
                                // File was deleted from Google Drive - allow re-upload
                                validationResults.push({
                                    file: file,
                                    faktur: faktur,
                                    valid: true,
                                    invoice: result.data
                                });
                                console.log('[PDF Bulk] ✅ File was deleted from Google Drive, allowing re-upload:', faktur);
                            }
                        } catch (verifyErr) {
                            console.warn('[PDF Bulk] Error verifying file on Google Drive:', verifyErr);
                            // If verification fails, assume file is gone and allow re-upload
                            validationResults.push({
                                file: file,
                                faktur: faktur,
                                valid: true,
                                invoice: result.data
                            });
                            console.log('[PDF Bulk] ✅ File verification failed, allowing re-upload:', faktur);
                        }
                    } else {
                        validationResults.push({
                            file: file,
                            faktur: faktur,
                            valid: true,
                            invoice: result.data
                        });
                        console.log('[PDF Bulk] ✓ Valid:', faktur);
                    }
                } else {
                    validationResults.push({
                        file: file,
                        faktur: faktur,
                        valid: false,
                        error: 'Faktur tidak ditemukan'
                    });
                    console.log('[PDF Bulk] ✗ Invalid:', faktur);
                }
            } catch (error) {
                validationResults.push({
                    file: file,
                    faktur: faktur,
                    valid: false,
                    error: error.message
                });
                console.error('[PDF Bulk] Error validating:', faktur, error);
            }

            // Small delay to avoid overwhelming server
            if (i < selectedFiles.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Hide validating, show results
        validating.style.display = 'none';

        // Render UI
        renderValidationResults();
        stats.style.display = 'grid';
        filesList.classList.add('show');

    } catch (error) {
        console.error('[PDF Bulk] Validation error:', error);
        showNotification(error.message, 'error');
        validating.style.display = 'none';
        dropZone.style.display = 'block';
    }
}

function renderValidationResults() {
    const stats = document.getElementById('stats');
    const filesList = document.getElementById('filesList');
    const filesContainer = document.getElementById('filesContainer');
    
    const validCount = validationResults.filter(r => r.valid).length;
    const invalidCount = validationResults.filter(r => !r.valid).length;
    const totalCount = validationResults.length;

    // Update stats
    document.getElementById('totalFiles').textContent = totalCount;
    document.getElementById('validFiles').textContent = validCount;
    document.getElementById('invalidFiles').textContent = invalidCount;

    // Render file items
    filesContainer.innerHTML = validationResults.map((result, index) => {
        const className = result.valid ? 'valid' : 'invalid';
        const icon = result.valid ? '✓' : '✗';
        const status = result.valid ? 'VALID' : 'INVALID';
        const statusText = result.valid ? 'Faktur ditemukan' : (result.error || 'Faktur tidak ditemukan');
        const fakturText = result.faktur && result.faktur.trim() ? result.faktur : '(tidak terdeteksi)';
        
        let konsumenText = '';
        let nominalText = '';
        if (result.valid && result.invoice) {
            konsumenText = result.invoice.konsumen || '-';
            nominalText = formatRupiah(result.invoice.total_jumlah_jual);
        }
        
        let deleteBtn = '';
        if (!result.valid) {
            deleteBtn = `<button onclick="removeInvalidFile(${index})" class="delete-btn" title="Hapus file">
                <i class="fas fa-times"></i>
            </button>`;
        }

        return `
            <div class="file-item ${className}" id="file-item-${index}">
                <div class="file-item-icon">${icon}</div>
                <div style="flex: 1;">
                    <div class="file-item-name">${result.file.name}</div>
                    <div class="file-item-faktur">
                        Faktur: ${fakturText} ${result.valid ? `| ${konsumenText} | ${nominalText}` : `| ${statusText}`}
                    </div>
                </div>
                <div class="file-item-status">${status}</div>
                ${deleteBtn}
            </div>
        `;
    }).join('');

    // Show file list
    filesList.style.display = 'block';

    // Enable/disable upload button
    document.getElementById('btnUpload').disabled = validCount === 0;
}

async function uploadValidFiles() {
    const validFiles = validationResults.filter(r => r.valid);
    
    if (validFiles.length === 0) {
        showNotification('Tidak ada file valid untuk diupload', 'error');
        return;
    }

    const btnUpload = document.getElementById('btnUpload');
    const originalText = btnUpload.innerHTML;
    const originalDisabled = btnUpload.disabled;
    
    btnUpload.disabled = true;
    btnUpload.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>Processing...';
    btnUpload.style.opacity = '0.8';

    // Show loading overlay with progress
    window.showLoadingOverlay(
        `📤 Uploading Files`,
        `${validFiles.length} file${validFiles.length > 1 ? 's' : ''} akan diupload ke Google Drive`
    );

    try {
        // Get token from API object if available, otherwise from localStorage
        let token;
        if (typeof API !== 'undefined' && API.getToken) {
            token = API.getToken();
        } else {
            token = localStorage.getItem('jwt_token');
        }
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        // OPTIMIZATION: Upload files in parallel (up to 3 concurrent uploads)
        const CONCURRENT_LIMIT = 3;
        let successCount = 0;
        let failCount = 0;
        let currentProgress = 0;

        // Create upload tasks
        const uploadTasks = validFiles.map((fileResult, index) => async () => {
            try {
                const formData = new FormData();
                formData.append('pdf', fileResult.file);
                
                console.log(`[PDF Bulk] Uploading (${index + 1}/${validFiles.length}): ${fileResult.file.name}`);
                
                // Update loading overlay with progress
                currentProgress = Math.round((successCount + failCount) / validFiles.length * 100);
                window.showLoadingOverlay(
                    `📤 Uploading Files`,
                    `${index + 1} of ${validFiles.length} • ${currentProgress}%`
                );

                const response = await fetch(`${CONFIG.API_URL}/api/invoice/upload-pdf`, {
                    method: 'POST',
                    headers: headers,
                    body: formData
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    successCount++;
                    console.log('[PDF Bulk] ✓ Uploaded:', fileResult.faktur);
                    console.log('[PDF Bulk] Upload result:', result);
                    showNotification(`✓ ${fileResult.faktur}`, 'success', 2000);
                    
                    // Generate WhatsApp message if we have zone data
                    console.log('[PDF Bulk] Checking for WhatsApp data - zona_id:', result.zona_id, 'tipe:', result.tipe, 'konsumen:', result.konsumen, 'nominal:', result.nominal);
                    if (result.zona_id && result.tipe && result.konsumen && result.nominal) {
                        try {
                            console.log('[PDF Bulk] Generating WhatsApp message for:', {
                                zona_id: result.zona_id,
                                tipe: result.tipe,
                                konsumen: result.konsumen,
                                nominal: result.nominal
                            });
                            
                            const waResponse = await fetch(`${CONFIG.API_URL}/api/whatsapp/generate-invoice-messages`, {
                                method: 'POST',
                                headers: {
                                    ...headers,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    invoices: [{
                                        zona_id: result.zona_id,
                                        tipe: result.tipe,
                                        konsumen: result.konsumen,
                                        nominal: result.nominal
                                    }],
                                    batchId: 'batch_' + Date.now() + '_' + fileResult.faktur
                                })
                            });
                            
                            const waResult = await waResponse.json();
                            if (waResponse.ok && waResult.success) {
                                console.log('[PDF Bulk] ✓ WhatsApp message generated');
                                // Messages will appear in Notify Zona dashboard, not on upload page
                                console.log('[PDF Bulk] Messages saved - view in Notify Zona menu');
                            } else {
                                console.warn('[PDF Bulk] WhatsApp generation failed:', waResult.error);
                            }
                        } catch (waError) {
                            console.warn('[PDF Bulk] WhatsApp generation error:', waError);
                        }
                    }
                } else {
                    failCount++;
                    console.error('[PDF Bulk] ✗ Upload failed:', fileResult.faktur, result.error);
                    showNotification(`✗ ${fileResult.faktur}: ${result.error}`, 'error', 2000);
                }
            } catch (error) {
                failCount++;
                console.error('[PDF Bulk] Upload error:', fileResult.faktur, error);
                showNotification(`✗ ${fileResult.faktur}: ${error.message}`, 'error', 2000);
            }
        });

        // Execute with concurrency limit
        for (let i = 0; i < uploadTasks.length; i += CONCURRENT_LIMIT) {
            const batch = uploadTasks.slice(i, i + CONCURRENT_LIMIT);
            await Promise.all(batch.map(task => task()));
        }

        // Hide loading overlay
        window.hideLoadingOverlay();

        // Show final result message
        const message = `✅ ${successCount}/${validFiles.length} file berhasil diupload${failCount > 0 ? ` (${failCount} gagal)` : ''}`;
        showNotification(message, successCount > 0 ? 'success' : 'error', 5000);
        
        console.log('[PDF Bulk] Upload complete - all files processed');
        
        // Note: WhatsApp notifications are now shown only in Notify Zona dashboard

        // Refresh invoice list to show updated status with file counts
        if (successCount > 0) {
            console.log('[PDF Bulk] Refreshing invoice list after successful upload...');
            setTimeout(() => {
                try {
                    if (typeof loadInvoicesInDashboard === 'function') {
                        console.log('[PDF Bulk] Calling loadInvoicesInDashboard(1)');
                        loadInvoicesInDashboard(1);
                    } else if (typeof loadInvoices === 'function') {
                        console.log('[PDF Bulk] Calling loadInvoices()');
                        loadInvoices();
                    } else {
                        console.warn('[PDF Bulk] No refresh function found');
                    }
                } catch (refreshErr) {
                    console.error('[PDF Bulk] Error refreshing list:', refreshErr);
                }
            }, 2000);
        }

        // Reset if all successful
        if (failCount === 0) {
            setTimeout(() => {
                resetUpload();
            }, 2000);
        }

    } catch (error) {
        console.error('[PDF Bulk] Exception:', error);
        showNotification('Error: ' + error.message, 'error', 5000);
        window.hideLoadingOverlay();
    } finally {
        btnUpload.disabled = originalDisabled;
        btnUpload.innerHTML = originalText;
        btnUpload.style.opacity = '1';
    }
}

function removeInvalidFile(index) {
    console.log('[PDF Bulk] Removing invalid file at index:', index);
    
    // Remove from validationResults
    validationResults.splice(index, 1);
    
    // Re-render
    renderValidationResults();
}

function resetUpload() {
    selectedFiles = [];
    validationResults = [];

    document.getElementById('fileInput').value = '';
    document.getElementById('filesContainer').innerHTML = '';
    document.getElementById('filesList').classList.remove('show');
    document.getElementById('stats').style.display = 'none';
    document.getElementById('dropZone').style.display = 'block';
    document.getElementById('validating').style.display = 'none';
    document.getElementById('btnUpload').disabled = true;
}

// Attach upload button handler
document.addEventListener('DOMContentLoaded', () => {
    const btnUpload = document.getElementById('btnUpload');
    if (btnUpload) {
        btnUpload.addEventListener('click', uploadValidFiles);
    }
});


// ============================================================
// WhatsApp Invoice Notification Display Functions
// ============================================================

/**
 * Display generated WhatsApp notifications in the upload panel
 */
function displayInvoiceWhatsappNotifications() {
    const panel = document.getElementById('whatsappPanel');
    const container = document.getElementById('whatsappMessagesContainer');

    if (!panel || !container) {
        console.warn('[PDF] WhatsApp UI elements not found');
        return;
    }

    // Clear container
    container.innerHTML = '';

    if (!window.whatsappInvoiceNotifications || Object.keys(window.whatsappInvoiceNotifications).length === 0) {
        panel.style.display = 'none';
        return;
    }

    // Create message card for each zona
    Object.entries(window.whatsappInvoiceNotifications).forEach(([zonaName, notif]) => {
        const messageCard = document.createElement('div');
        messageCard.style.cssText = `
            background: white;
            border: 1px solid #10b981;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 12px;
            position: relative;
        `;

        const zonaLabel = document.createElement('div');
        zonaLabel.style.cssText = `
            font-weight: 600;
            color: #27ae60;
            margin-bottom: 8px;
            font-size: 13px;
        `;
        zonaLabel.textContent = `📍 ${zonaName} (${notif.invoice_count} invoice)`;

        const messageText = document.createElement('div');
        messageText.style.cssText = `
            background: #f0f8f4;
            padding: 10px;
            border-radius: 4px;
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 120px;
            overflow-y: auto;
            border-left: 3px solid #10b981;
            font-family: 'Courier New', monospace;
            color: #2c3e50;
        `;
        messageText.textContent = notif.message;

        const copyButton = document.createElement('button');
        copyButton.style.cssText = `
            width: 100%;
            margin-top: 8px;
            padding: 8px;
            background: #25d366;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            font-size: 12px;
            transition: background 0.2s;
        `;
        copyButton.textContent = '📋 Salin Pesan';
        copyButton.addEventListener('mouseover', () => copyButton.style.background = '#20ba58');
        copyButton.addEventListener('mouseout', () => copyButton.style.background = '#25d366');
        copyButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(notif.message);
                if (typeof Toast !== 'undefined') {
                    Toast.success(`Pesan zona ${zonaName} sudah disalin!`);
                }
            } catch (error) {
                console.error('[PDF] Copy error:', error);
            }
        });

        messageCard.appendChild(zonaLabel);
        messageCard.appendChild(messageText);
        messageCard.appendChild(copyButton);
        container.appendChild(messageCard);
    });

    panel.style.display = 'block';
}

/**
 * Close WhatsApp panel
 */
function closeWhatsappPanel() {
    const panel = document.getElementById('whatsappPanel');
    if (panel) {
        panel.style.display = 'none';
    }
}

/**
 * Mark all invoice WhatsApp notifications as sent
 */
async function markAllInvoiceWhatsappAsSent() {
    if (!window.currentInvoiceBatchId) {
        if (typeof Toast !== 'undefined') {
            Toast.warning('Batch ID tidak ditemukan');
        }
        return;
    }

    try {
        const token = API.getToken() || localStorage.getItem('jwt_token');
        const headers = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        console.log('[PDF] Marking invoice batch', window.currentInvoiceBatchId, 'as sent');

        const response = await fetch(`${CONFIG.API_URL}/api/whatsapp/mark-invoice-batch-sent`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                batchId: window.currentInvoiceBatchId
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            closeWhatsappPanel();
            if (typeof Toast !== 'undefined') {
                Toast.success('✅ Semua pesan sudah ditandai terkirim!');
            }
            console.log('[PDF] ✅ Invoice batch marked as sent');
        } else {
            if (typeof Toast !== 'undefined') {
                Toast.error(result.error || 'Gagal menandai sebagai terkirim');
            }
        }
    } catch (error) {
        console.error('[PDF] Error marking as sent:', error);
        if (typeof Toast !== 'undefined') {
            Toast.error('Error: ' + error.message);
        }
    }
}
