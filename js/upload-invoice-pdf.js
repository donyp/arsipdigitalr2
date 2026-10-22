// ============================================
// Bulk Upload Invoice PDF with Validation
// ============================================

// Prevent redeclaration when script reloads via SPA
if (typeof selectedFiles === 'undefined') {
    var selectedFiles = [];
    var validationResults = [];
}

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

        // ============================================================
        // PERF (Fase 2.1): validasi faktur BATCH
        // ============================================================
        // Sebelumnya: 1 request check-faktur per file -> 200 file = 200 request
        // Sekarang: 1 request per 100 faktur -> 200 file = 2 request.
        const fakturMap = new Map();
        selectedFiles.forEach(file => {
            const faktur = file.name.replace(/\.pdf$/i, '').trim();
            fakturMap.set(faktur, file);
        });

        const fakturList = Array.from(fakturMap.keys());
        const VALIDATION_BATCH_SIZE = 100;
        const batchResults = {};

        for (let i = 0; i < fakturList.length; i += VALIDATION_BATCH_SIZE) {
            const batch = fakturList.slice(i, i + VALIDATION_BATCH_SIZE);
            const response = await fetch(`${CONFIG.API_URL}/api/invoice/check-fakturs-batch`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fakturs: batch })
            });

            if (!response.ok) {
                throw new Error(`Validasi gagal (${response.status})`);
            }

            const result = await response.json();
            if (result && result.results) {
                Object.assign(batchResults, result.results);
            }
        }

        // Susun hasil validasi per file
        validationResults = selectedFiles.map((file) => {
            const faktur = file.name.replace(/\.pdf$/i, '').trim();
            const found = batchResults[faktur];
            if (found && found.exists && found.data) {
                return {
                    file: file,
                    faktur: faktur,
                    valid: true,
                    invoice: found.data
                };
            }
            return {
                file: file,
                faktur: faktur,
                valid: false,
                error: 'Faktur tidak ditemukan'
            };
        });

        // Hide validating, show results
        validating.style.display = 'none';

        // Render UI
        renderValidationResults();
        stats.style.display = 'grid';
        filesList.classList.add('show');

    } catch (error) {
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

    // Show/hide copy invalid button
    const btnCopyInvalid = document.getElementById('btnCopyInvalid');
    if (btnCopyInvalid) {
        btnCopyInvalid.style.display = invalidCount > 0 ? 'inline-flex' : 'none';
    }

    // Render file items
    filesContainer.innerHTML = validationResults.map((result, index) => {
        const className = result.valid ? 'valid' : 'invalid';
        const icon = result.valid ? '✓' : '✗';
        const status = result.valid ? 'VALID' : 'INVALID';
        const statusText = result.valid ? 'Faktur ditemukan' : (result.error || 'Faktur tidak ditemukan');
        const fakturText = result.faktur && result.faktur.trim() ? result.faktur : '(tidak terdeteksi)';

        // Badge status upload (setelah percobaan upload)
        let uploadBadge = '';
        if (result.uploadStatus === 'success') {
            uploadBadge = '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;">✓ Terupload</span>';
        } else if (result.uploadStatus === 'duplicate') {
            uploadBadge = '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;">ℹ Sudah ada</span>';
        } else if (result.uploadStatus === 'failed') {
            uploadBadge = '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;background:#fee2e2;color:#991b1b;font-size:11px;font-weight:700;">✗ Gagal</span>';
        }
        
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
                        Faktur: ${fakturText} ${result.valid ? `| ${konsumenText} | ${nominalText} | ${(result.file.size / 1024 / 1024).toFixed(2)} MB ${result.file.size > 2 * 1024 * 1024 ? '| 📦 Will compress' : '| ✓ No compression'}` : `| ${statusText}`}
                    </div>
                </div>
                <div class="file-item-status">${status}${uploadBadge}</div>
                ${deleteBtn}
            </div>
        `;
    }).join('');

    // Show file list
    filesList.style.display = 'block';

    // Enable/disable upload button
    document.getElementById('btnUpload').disabled = validCount === 0;

    // Tombol "upload ulang yang gagal" hanya tampil kalau ada file gagal
    if (typeof updateRetryButton === 'function') updateRetryButton();
}

// ============================================================
// Anti double-submit: kalau upload sedang berjalan, klik lagi diabaikan.
// Tanpa ini, satu proses upload bisa jadi 2 batch (dan 2 pesan WA untuk
// zona yang sama).
// ============================================================
let isUploading = false;

async function uploadValidFiles(onlyFailed = false) {
    if (isUploading) {
        showNotification('Upload sedang berjalan, mohon tunggu selesai.', 'warning');
        return;
    }

    // PENTING: hanya boleh true kalau dipanggil secara EKSPLISIT.
    // Kalau handler klik diserahkan langsung ke fungsi ini, objek Event
    // otomatis jadi argumen pertama -> upload selalu masuk mode "hanya file
    // gagal" dan tidak ada file yang terupload sama sekali.
    const onlyFailedMode = onlyFailed === true;

    // Filter only valid files for upload (invalid files stay in the list but are skipped)
    const allValidFiles = validationResults.filter(r => r.valid);
    // Mode "upload ulang": hanya file yang GAGAL di percobaan sebelumnya.
    // File yang sudah berhasil TIDAK diupload lagi (menghindari batch kedua).
    const validFiles = onlyFailedMode
        ? allValidFiles.filter(r => r.uploadStatus === 'failed')
        : allValidFiles;

    if (validFiles.length === 0) {
        showNotification(
            onlyFailedMode ? 'Tidak ada file yang gagal diupload.' : 'Tidak ada file valid untuk diupload',
            'error'
        );
        return;
    }

    const btnUpload = document.getElementById('btnUpload');
    const originalText = btnUpload.innerHTML;
    const originalDisabled = btnUpload.disabled;
    
    btnUpload.disabled = true;
    btnUpload.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>Processing...';
    btnUpload.style.opacity = '0.8';
    isUploading = true;

    // Initialize fresh batch array for this upload session (thread-safe)
    const uploadBatch = [];

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

        // ============================================================
        // PERF (Fase 0.5): upload dengan batas konkurensi
        // ============================================================
        // Sebelumnya semua file diupload tanpa batas (Promise.all 200+ file).
        // Browser sebenarnya hanya membuka 6 koneksi, tapi karena server
        // membalas "processing" duluan, buffer file menumpuk di RAM server
        // (B1). Dengan batas 6 + server yang MENUNGGU upload selesai,
        // tekanan memory server ikut terkendali.
        const UPLOAD_CONCURRENCY = 6;
        let successCount = 0;
        let failCount = 0;
        let duplicateCount = 0;
        let currentProgress = 0;

        let cursor = 0;

        const uploadOne = async (fileResult, index) => {
            try {
                const formData = new FormData();
                formData.append('pdf', fileResult.file);
                
                
                // Update loading overlay with progress
                currentProgress = Math.round((successCount + failCount) / validFiles.length * 100);
                window.showLoadingOverlay(
                    `📤 Uploading Files`,
                    `${index + 1} of ${validFiles.length} • ${currentProgress}%`
                );

                // Retry untuk 429/503 (antrean upload penuh / server sibuk)
                let response = null;
                let result = {};
                for (let attempt = 0; attempt < 3; attempt++) {
                    response = await fetch(`${CONFIG.API_URL}/api/invoice/upload-pdf`, {
                        method: 'POST',
                        headers: headers,
                        body: formData
                    });

                    if (response.status !== 429 && response.status !== 503) break;

                    // Tunggu lalu coba lagi
                    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
                }

                try {
                    result = await response.json();
                } catch (parseErr) {
                    result = { error: `Respons tidak valid (${response.status})` };
                }

                if (response.ok && result.success) {
                    successCount++;
                    fileResult.uploadStatus = 'success';
                    fileResult.uploadError = null;

                    // Display compression note if available
                    let compressionMsg = '';
                    if (result.compression_note) {
                        compressionMsg = ` | ${result.compression_note}`;
                    }
                    showNotification(`✓ ${fileResult.faktur}${compressionMsg}`, 'success', 2000);
                    
                    // Collect invoice data for batch notification (thread-safe push)
                    if (result.zona_id && result.tipe && result.konsumen && result.nominal) {
                        uploadBatch.push({
                            zona_id: result.zona_id,
                            tipe: result.tipe,
                            konsumen: result.konsumen,
                            nominal: result.nominal
                        });
                    }
                } else if (response.status === 409) {
                    // File sudah ada di storage (upload sebelumnya).
                    // Ini BUKAN kegagalan -> tandai "sudah ada" supaya tidak
                    // ikut diupload ulang dan tidak dihitung sebagai error.
                    duplicateCount++;
                    fileResult.uploadStatus = 'duplicate';
                    fileResult.uploadError = result.message || 'File sudah ada';
                    showNotification(`ℹ ${fileResult.faktur}: file sudah ada (dilewati)`, 'warning', 2500);
                } else {
                    failCount++;
                    fileResult.uploadStatus = 'failed';
                    fileResult.uploadError = result.error || ('HTTP ' + response.status);
                    showNotification(`✗ ${fileResult.faktur}: ${result.error || ('HTTP ' + response.status)}`, 'error', 2000);
                }
            } catch (error) {
                failCount++;
                fileResult.uploadStatus = 'failed';
                fileResult.uploadError = error.message;
                showNotification(`✗ ${fileResult.faktur}: ${error.message}`, 'error', 2000);
            }
        };

        // Worker pool: maksimal UPLOAD_CONCURRENCY upload berjalan bersamaan
        const worker = async () => {
            while (true) {
                const index = cursor++;
                if (index >= validFiles.length) break;
                await uploadOne(validFiles[index], index);
            }
        };

        const workerCount = Math.min(UPLOAD_CONCURRENCY, validFiles.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));

        // Hide loading overlay
        window.hideLoadingOverlay();

        // Generate batch WhatsApp notifications after all uploads complete
        if (uploadBatch && uploadBatch.length > 0) {
            try {
                const batchId = 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                
                const waResponse = await fetch(`${CONFIG.API_URL}/api/whatsapp/generate-invoice-messages`, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        invoices: uploadBatch,
                        batchId: batchId
                    })
                });
                
                const waResult = await waResponse.json();
                if (waResponse.ok && waResult.success) {
                    // Notifications grouped by zona will appear in Notify Zona dashboard
                }
            } catch (waError) {
                console.error('Error generating batch notifications:', waError);
            }
        }

        // Show final result message
        const parts = [`${successCount}/${validFiles.length} file berhasil diupload`];
        if (duplicateCount > 0) parts.push(`${duplicateCount} sudah ada (dilewati)`);
        if (failCount > 0) parts.push(`${failCount} gagal`);
        const message = `✅ ${parts.join(' • ')}`;
        showNotification(message, successCount > 0 ? 'success' : 'error', 5000);
        // Note: WhatsApp notifications are now shown only in Notify Zona dashboard

        // Perbarui tampilan status per file + tombol "upload ulang yang gagal"
        renderValidationResults();
        updateRetryButton();

        // Refresh invoice list to show updated status with file counts
        if (successCount > 0) {
            setTimeout(() => {
                try {
                    if (typeof loadInvoicesInDashboard === 'function') {
                        loadInvoicesInDashboard(1);
                    } else if (typeof loadInvoices === 'function') {
                        loadInvoices();
                    } else {
                    }
                } catch (refreshErr) {
                }
            }, 2000);
        }

        // Reset if all successful (tidak ada file yang gagal)
        if (failCount === 0) {
            setTimeout(() => {
                resetUpload();
            }, 2000);
        }

    } catch (error) {
        showNotification('Error: ' + error.message, 'error', 5000);
        window.hideLoadingOverlay();
    } finally {
        isUploading = false;
        btnUpload.disabled = originalDisabled;
        btnUpload.innerHTML = originalText;
        btnUpload.style.opacity = '1';
    }
}

/**
 * Upload ulang HANYA file yang gagal di percobaan sebelumnya.
 * Ini mencegah bug "1 upload jadi 2 batch" (file yang sudah berhasil tidak
 * diupload lagi -> tidak ada batch kedua -> tidak ada pesan WA ganda).
 */
async function uploadFailedFiles() {
    const failed = validationResults.filter(r => r.valid && r.uploadStatus === 'failed');
    if (failed.length === 0) {
        showNotification('Tidak ada file yang gagal diupload', 'warning');
        return;
    }
    await uploadValidFiles(true);
}

/**
 * Tampilkan tombol "Upload Ulang yang Gagal" hanya jika ada file gagal.
 */
function updateRetryButton() {
    const btn = document.getElementById('btnRetryFailed');
    if (!btn) return;
    const failedCount = validationResults.filter(r => r.valid && r.uploadStatus === 'failed').length;
    btn.style.display = failedCount > 0 ? 'inline-flex' : 'none';
    btn.innerHTML = `<i class="fas fa-rotate-right"></i><span>Upload Ulang Gagal (${failedCount})</span>`;
}

function removeInvalidFile(index) {
    // Remove from validationResults
    validationResults.splice(index, 1);
    
    // Re-render
    renderValidationResults();
}

function copyInvalidFilenames() {
    const invalidFiles = validationResults.filter(r => !r.valid);
    if (invalidFiles.length === 0) {
        showNotification('Tidak ada file invalid', 'error');
        return;
    }

    const filenames = invalidFiles.map(f => f.file.name).join('\n');
    
    navigator.clipboard.writeText(filenames).then(() => {
        showNotification(`✓ ${invalidFiles.length} invalid filename(s) copied to clipboard`, 'success', 2000);
    }).catch(err => {
        showNotification('Error copying to clipboard: ' + err.message, 'error');
    });
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
        // Jangan langsung pakai uploadValidFiles sebagai handler: fungsi
        // menerima argumen, dan Event klik akan otomatis jadi argumen
        // pertama -> upload salah masuk mode "hanya file gagal".
        btnUpload.addEventListener('click', () => uploadValidFiles(false));
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
        } else {
            if (typeof Toast !== 'undefined') {
                Toast.error(result.error || 'Gagal menandai sebagai terkirim');
            }
        }
    } catch (error) {
        if (typeof Toast !== 'undefined') {
            Toast.error('Error: ' + error.message);
        }
    }
}
