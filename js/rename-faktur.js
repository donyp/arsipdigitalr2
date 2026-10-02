// Rename Faktur Pajak
// Extract nama toko & nominal from PDF, rename as: tax-NAMA_TOKO NOMINAL

// Prevent redeclaration when script reloads via SPA
if (typeof selectedFiles === 'undefined') {
    var selectedFiles = [];
}

// ============================================
// Setup Drag & Drop (wrapped in init function)
// ============================================
function initRenameFakturPage() {
    // Clear selectedFiles setiap kali halaman di-init (prevent stale data from SPA)
    selectedFiles = [];
    
    const dropzone = document.getElementById('dropzone');
    if (!dropzone) {
        setTimeout(initRenameFakturPage, 100);
        return;
    }

    // Remove old event listeners to prevent duplicates
    const newDropzone = dropzone.cloneNode(true);
    dropzone.parentNode.replaceChild(newDropzone, dropzone);
    const fileInput = document.getElementById('fileInput');
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);

    // Get fresh references after cloning
    const freshDropzone = document.getElementById('dropzone');
    const freshFileInput = document.getElementById('fileInput');

    freshDropzone.addEventListener('click', () => {
        freshFileInput.click();
    });

    freshDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        freshDropzone.classList.add('border-blue-500', 'bg-blue-50');
    });

    freshDropzone.addEventListener('dragleave', () => {
        freshDropzone.classList.remove('border-blue-500', 'bg-blue-50');
    });

    freshDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        freshDropzone.classList.remove('border-blue-500', 'bg-blue-50');
        handleFiles(e.dataTransfer.files);
    });

    // File input change event
    freshFileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
}

// Initialize on page load or SPA navigation
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRenameFakturPage);
} else {
    initRenameFakturPage();
}
function handleFiles(files) {
    let fileArray = Array.from(files).filter(f => f.type === 'application/pdf');
    
    if (fileArray.length === 0) {
        Toast.error('Pilih file PDF yang valid');
        return;
    }

    // Get existing file + size to check for duplicates
    const existingKeys = new Set(selectedFiles.map(f => `${f.name}|${f.size}`));
    
    let duplicateCount = 0;
    let newFiles = [];
    
    // Filter out duplicates and add new files
    fileArray.forEach(file => {
        const fileKey = `${file.name}|${file.size}`;
        if (existingKeys.has(fileKey)) {
            duplicateCount++;
        } else {
            newFiles.push(file);
        }
    });
    
    // If all files are duplicates, don't add anything
    if (newFiles.length === 0) {
        Toast.warning(`⚠️ Semua file sudah ada di antrian (diabaikan)`);
        return;
    }
    
    // Notify about duplicates only if there were some
    if (duplicateCount > 0) {
        Toast.warning(`⚠️ ${duplicateCount} file sudah ada di antrian (diabaikan)`);
    }

    // Append new files to existing list
    selectedFiles = selectedFiles.concat(newFiles);

    // Max 25 files limit (safe for 2MB avg file size)
    // Memory: 25 × 2MB = 50MB raw; ~67MB with base64 overhead (very safe)
    // Processing time: ~12-13 seconds (acceptable)
    const MAX_FILES = 25;
    if (selectedFiles.length > MAX_FILES) {
        const deletedCount = selectedFiles.length - MAX_FILES;
        const deletedFiles = selectedFiles.slice(MAX_FILES).map(f => f.name).join(', ');
        Toast.warning(`⚠️ Maksimal ${MAX_FILES} file sekaligus\n\n${deletedCount} file terbaru dihapus dari antrian:\n${deletedFiles}`);
        selectedFiles = selectedFiles.slice(0, MAX_FILES);
    }

    // Show file list
    const fileList = document.getElementById('fileList');
    const filesContainer = document.getElementById('filesContainer');
    const processButtonContainer = document.getElementById('processButtonContainer');
    
    fileList.classList.remove('hidden');
    filesContainer.innerHTML = selectedFiles.map((f, i) => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div class="flex items-center gap-3">
                <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
                </svg>
                <span class="text-sm font-medium text-gray-700">${i + 1}. ${f.name}</span>
                <span class="text-xs text-gray-500">${(f.size / 1024).toFixed(1)} KB</span>
            </div>
            <button onclick="removeFile(${i})" class="p-1 text-red-500 hover:bg-red-50 rounded">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    `).join('');

    // Add max files note
    const maxFilesNote = document.createElement('p');
    maxFilesNote.className = 'text-sm font-semibold text-gray-800 mt-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded';
    maxFilesNote.textContent = `📋 Maksimal ${MAX_FILES} file | ${selectedFiles.length} file dipilih`;
    filesContainer.appendChild(maxFilesNote);
    
    processButtonContainer.classList.remove('hidden');
}

// ============================================
// Remove File
// ============================================
function removeFile(index) {
    selectedFiles.splice(index, 1);
    
    if (selectedFiles.length === 0) {
        document.getElementById('fileList').classList.add('hidden');
        document.getElementById('processButtonContainer').classList.add('hidden');
        // Don't hide results - keep history visible
    } else {
        // Re-render file list with correct numbering
        const filesContainer = document.getElementById('filesContainer');
        filesContainer.innerHTML = selectedFiles.map((f, i) => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center gap-3">
                    <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
                    </svg>
                    <span class="text-sm font-medium text-gray-700">${i + 1}. ${f.name}</span>
                    <span class="text-xs text-gray-500">${(f.size / 1024).toFixed(1)} KB</span>
                </div>
                <button onclick="removeFile(${i})" class="p-1 text-red-500 hover:bg-red-50 rounded">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        `).join('');
        
        // Update max files note
        const maxFilesNote = document.createElement('p');
        maxFilesNote.className = 'text-sm font-semibold text-gray-800 mt-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded';
        maxFilesNote.textContent = `📋 Maksimal 25 file | ${selectedFiles.length} file dipilih`;
        filesContainer.appendChild(maxFilesNote);
    }
}

// ============================================
// Process Files
// ============================================
async function processFiles() {
    if (selectedFiles.length === 0) {
        Toast.error('Tidak ada file untuk diproses');
        return;
    }

    const processBtn = event.target.closest('button');
    processBtn.disabled = true;

    // Hide file list and process button, show loading modal
    document.getElementById('fileList').classList.add('hidden');
    document.getElementById('processButtonContainer').classList.add('hidden');
    showLoadingModal(selectedFiles.length);

    const results = [];
    const resultsSection = document.getElementById('resultsSection');
    const resultsList = document.getElementById('resultsList');

    try {
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            // Update loading modal
            updateLoadingModal(i + 1, file.name, selectedFiles.length);
            
            const result = await processFile(file);
            results.push(result);
        }

        // Hide loading modal
        hideLoadingModal();

        // Auto-download successful files - PARALLEL (semua sekaligus)
        const successFiles = results.filter(r => r.success);
        if (successFiles.length > 0) {
            const downloadStart = performance.now();
            
            setTimeout(() => {
                // Download all files in parallel (browser will manage queuing)
                successFiles.forEach(r => {
                    downloadFile(r.newName, r.fileData);
                });
                
            }, 300);
        }

        // Show notification summary only (no history)
        const failedCount = results.filter(r => !r.success).length;
        if (failedCount > 0) {
            Toast.error(`${failedCount} dari ${results.length} file gagal diproses`);
        } else {
            Toast.success(`${successFiles.length} file berhasil diproses!`);
            // Show button to view history after 1 second
            setTimeout(() => {
                showHistoryActionButton(successFiles);
            }, 1000);
        }
    } finally {
        // Always re-enable button at the end (success or error)
        processBtn.disabled = false;
        
        // Clear selected files dan reset UI untuk bisa rename lagi
        selectedFiles = [];
        document.getElementById('fileList').classList.add('hidden');
        document.getElementById('processButtonContainer').classList.add('hidden');
    }
}

// ============================================
// Process Single File
// ============================================
async function processFile(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        const uploadStart = performance.now();

        const response = await fetch(`${CONFIG.API_URL}/api/invoice/rename-faktur`, {
            method: 'POST',
            body: formData
            // NO Content-Type header - browser will set it with boundary
        });

        const uploadTime = performance.now() - uploadStart;

        const result = await response.json();
        if (!response.ok) {
            // Check if it's a "not ready yet" error
            if (response.status === 500 && result.error && result.error.includes('not ready')) {
                return {
                    success: false,
                    originalName: file.name,
                    error: 'Sistem masih sedang diinisialisasi... Silakan coba lagi dalam beberapa detik'
                };
            }
            
            return {
                success: false,
                originalName: file.name,
                error: result.error || `HTTP ${response.status}: ${response.statusText}`
            };
        }

        if (result.success) {
            // Log rename to history - FIRE AND FORGET (don't await)
            // This runs in background without blocking the UI or download
            (async () => {
                try {
                    const token = API.getToken();
                    if (token) {
                        await fetch(`${CONFIG.API_URL}/api/faktur-pajak/log-rename`, {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                faktur: result.referensi || result.newName.split('-')[0] || 'unknown',
                                old_filename: file.name,
                                new_filename: result.newName,
                                old_path: '',
                                new_path: '',
                                reason: 'Manual rename via UI',
                                zona_id: null,
                                notes: `Toko: ${result.namaToko}, Harga: ${result.harga}${result.referensi ? ', Referensi: ' + result.referensi : ''}`
                            })
                        });
                    }
                } catch (err) {
                }
            })();
            
            return {
                success: true,
                originalName: file.name,
                newName: result.newName,
                namaToko: result.namaToko,
                harga: result.harga,
                ppn: result.ppn,
                fileData: result.fileData  // Base64 encoded PDF
            };
        } else {
            return {
                success: false,
                originalName: file.name,
                error: result.error || 'Gagal memproses file'
            };
        }
    } catch (err) {
        return {
            success: false,
            originalName: file.name,
            error: err.message || 'Terjadi kesalahan saat memproses'
        };
    }
}

// ============================================
// Download File
// ============================================
function downloadFile(filename, fileData) {
    // Create blob from base64
    const byteCharacters = atob(fileData);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });

    // Create download link
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for auth to initialize
    let retries = 0;
    const maxRetries = 5;
    
    const waitForAuth = setInterval(async () => {
        retries++;
        if (typeof API === 'undefined') {
            if (retries % 5 === 1) {
            }
        } else {
            const token = API.getToken();
            
            if (token) {
                clearInterval(waitForAuth);
                loadLatestHistory();
            } else if (retries >= maxRetries) {
                clearInterval(waitForAuth);
            } else {
            }
        }
    }, 500);
});

async function loadLatestHistory() {
    try {
        const token = API.getToken();
        if (!token) {
            return;
        }
        // Get 10 most recent renames from last 24 hours
        const response = await fetch(`${CONFIG.API_URL}/api/faktur-pajak/rename-history/recent?limit=10&hours=24&auto_cleanup=true`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
            const data = await response.json();
            
            // Handle both formats: data.history and data.data
            const historyData = data.history || data.data || [];
            if (historyData && historyData.length > 0) {
                displayHistorySection(historyData);
            }
        }
    } catch (err) {
    }
}

// ============================================
// History Modal Functions - REMOVED
// Using section instead of modal
// ============================================

// ============================================
// Loading Modal Functions
// ============================================
let loadingStartTime = null;
let fileStartTime = null;

function showLoadingModal(totalFiles) {
    const modal = document.getElementById('loadingModal');
    document.getElementById('loadingTotalFiles').textContent = totalFiles;
    document.getElementById('loadingProgressText').textContent = '0';
    document.getElementById('loadingProgressBar').style.width = '0%';
    document.getElementById('loadingStatusLabel').textContent = 'Bersiap';
    document.getElementById('loadingSpeed').textContent = '-';
    document.getElementById('loadingElapsedTime').textContent = '0s';
    modal.classList.remove('hidden');
    
    loadingStartTime = Date.now();
    
    // Update elapsed time every second
    window.elapsedTimeInterval = setInterval(() => {
        if (loadingStartTime) {
            const elapsed = Math.floor((Date.now() - loadingStartTime) / 1000);
            document.getElementById('loadingElapsedTime').textContent = elapsed + 's';
        }
    }, 1000);
}

function hideLoadingModal() {
    const modal = document.getElementById('loadingModal');
    modal.classList.add('hidden');
    if (window.elapsedTimeInterval) {
        clearInterval(window.elapsedTimeInterval);
    }
}

function updateLoadingModal(current, fileName, total) {
    // Update progress bar with smooth animation
    const percentage = (current / total) * 100;
    document.getElementById('loadingProgressBar').style.width = percentage + '%';
    
    // Update counters
    document.getElementById('loadingProgressText').textContent = current;
    
    // Update current file being processed
    const displayName = fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;
    document.getElementById('loadingCurrentFile').textContent = displayName;
    
    // Update status message based on progress
    const statusEl = document.getElementById('loadingStatus');
    if (current < total) {
        statusEl.textContent = `Memproses file ${current} dari ${total}...`;
    } else {
        statusEl.textContent = 'Menyelesaikan proses...';
    }
    
    // Update status label
    const statusLabel = document.getElementById('loadingStatusLabel');
    if (current === 0) {
        statusLabel.textContent = 'Bersiap';
        statusLabel.className = 'text-sm font-bold text-blue-900 dark:text-blue-100';
    } else if (current < total) {
        statusLabel.textContent = 'Berjalan';
        statusLabel.className = 'text-sm font-bold text-yellow-900 dark:text-yellow-100';
    } else {
        statusLabel.textContent = 'Selesai';
        statusLabel.className = 'text-sm font-bold text-green-900 dark:text-green-100';
    }
    
    // Calculate and display speed (files per second)
    if (loadingStartTime && current > 0) {
        const elapsedSeconds = (Date.now() - loadingStartTime) / 1000;
        const speedPerSec = (current / elapsedSeconds).toFixed(1);
        const remainingFiles = total - current;
        const estimatedSeconds = remainingFiles > 0 ? Math.ceil(remainingFiles / speedPerSec) : 0;
        
        if (estimatedSeconds > 0) {
            document.getElementById('loadingSpeed').textContent = estimatedSeconds + 's ETA';
        } else {
            document.getElementById('loadingSpeed').textContent = '< 1s';
        }
    }
}

function showHistoryActionButton(successFiles) {
    // Load and display the latest history records
    if (successFiles.length === 0) return;
    // Load latest history (not filtered by specific faktur)
    loadLatestHistory();
}

async function loadAndDisplayHistory(faktur) {
    try {
        const token = API.getToken();
        if (!token) {
            return;
        }
        
        const response = await fetch(`/api/faktur-pajak/rename-history/${encodeURIComponent(faktur)}?limit=10`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            // Clear and display fresh history
            displayHistorySection(data.history || []);
        } else {
        }
    } catch (err) {
    }
}

function displayHistorySection(histories) {
    const section = document.getElementById('historySection');
    const list = document.getElementById('recentHistoryList');
    
    if (!histories || histories.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    // Deduplicate by ID to prevent double entries
    const uniqueHistories = [];
    const seenIds = new Set();
    
    histories.forEach(h => {
        if (!seenIds.has(h.id)) {
            seenIds.add(h.id);
            uniqueHistories.push(h);
        }
    });
    
    section.classList.remove('hidden');
    list.innerHTML = '';
    
    uniqueHistories.forEach(h => {
        // Format date/time properly in Indonesia timezone
        const timestamp = formatIndonesianDateTime(h.renamed_at);
        
        // Use full_name if available, otherwise use renamed_by
        const displayName = h.full_name || h.renamed_by || 'Unknown';
        
        const div = document.createElement('div');
        div.className = 'history-item flex flex-col gap-2 py-3 px-3 rounded-lg border border-transparent hover:border-blue-300 hover:bg-blue-50 transition-all group cursor-pointer';
        div.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <div class="flex-1 min-w-0 flex items-center gap-2">
                    <i class="fas fa-exchange-alt text-blue-500 flex-shrink-0"></i>
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-medium text-gray-600 break-words">
                            <span class="text-gray-500">From:</span> <span class="font-mono text-gray-700">${h.old_filename}</span>
                        </div>
                        <div class="text-xs font-medium text-blue-700 mt-1 break-words">
                            <span class="text-blue-600">To:</span> <span class="font-mono font-semibold text-blue-800">${h.new_filename}</span>
                        </div>
                    </div>
                </div>
                <button class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-all opacity-0 group-hover:opacity-100 flex-shrink-0 delete-history-btn" title="Hapus" data-history-id="${h.id}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="flex items-center gap-3 text-xs text-gray-500 px-1">
                <span class="flex items-center gap-1">
                    <i class="fas fa-user text-gray-400"></i>
                    <span>${displayName}</span>
                </span>
                <span class="text-gray-400">•</span>
                <span class="flex items-center gap-1">
                    <i class="fas fa-clock text-gray-400"></i>
                    <span>${timestamp}</span>
                </span>
            </div>
        `;
        
        // Add event listener to delete button
        const deleteBtn = div.querySelector('.delete-history-btn');
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            deleteHistoryRecord(h.id);
        });
        
        list.appendChild(div);
    });
}

async function deleteHistoryRecord(historyId) {
    try {
        const token = API.getToken();
        if (!token) {
            Toast.error('Tidak dapat menghapus - token tidak valid');
            return;
        }
        const response = await fetch(`/api/faktur-pajak/rename-history/${historyId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            Toast.success('History dihapus');
            
            // Reload history
            loadLatestHistory();
        } else {
            const errData = await response.json().catch(() => ({}));
            Toast.error('Gagal menghapus history: ' + (errData.error || 'Unknown error'));
        }
    } catch (err) {
        Toast.error('Error: ' + err.message);
    }
}

function formatIndonesianDateTime(isoString) {
    if (!isoString) return 'Tidak ada';
    
    try {
        // Ensure ISO string ends with Z to indicate UTC
        let dateStr = isoString;
        if (!dateStr.includes('Z') && !dateStr.includes('+')) {
            // Add Z to indicate this is UTC time
            dateStr = dateStr.replace(/(\.\d{3})?$/, 'Z');
        }
        
        // Parse as UTC
        const date = new Date(dateStr);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return isoString;
        }
        
        
        // Convert to Jakarta time (UTC+7)
        const jakartaDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));
        
        // Get date components
        const day = jakartaDate.getUTCDate().toString().padStart(2, '0');
        const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const month = monthNames[jakartaDate.getUTCMonth()];
        const year = jakartaDate.getUTCFullYear();
        const hour = jakartaDate.getUTCHours().toString().padStart(2, '0');
        const minute = jakartaDate.getUTCMinutes().toString().padStart(2, '0');
        
        const result = `${day} ${month} ${year} ${hour}:${minute} WIB`;
        return result;
    } catch (err) {
        return isoString;
    }
}

function closeHistorySection() {
    const section = document.getElementById('historySection');
    section.classList.add('hidden');
}
