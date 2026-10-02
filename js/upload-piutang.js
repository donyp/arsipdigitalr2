// ============================================================
// Upload Piutang Logic — Bukti Pembayaran Piutang Upload
// ============================================================

let selectedFiles = [];

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const user = await initAuth();
        
        if (!user) return;
        
        window._currentUser = user;

        // Allow upload for authorized roles
        const allowedRoles = ['super_admin', 'moderator', 'admin_zona'];
        if (!allowedRoles.includes(user.role)) {
            if (window.Toast) {
                Toast.error('Akses ditolak.');
            }
            setTimeout(() => window.location.href = '/dashboard', 1500);
            return;
        }

        // Setup page functionality
        setupDragDrop();
        setupForm();
        
        // Load toko list for autocomplete
        await loadAllTokos();
        
        // Don't load recent uploads on page init to speed up loading
        // loadRecentUploads();
    } catch (error) {
        document.documentElement.style.opacity = '1';
        document.documentElement.classList.remove('auth-loading');
    }
});

// ---- Load Toko List for Autocomplete ----
async function loadAllTokos() {
    try {
        const response = await API.get('/api/toko');
        const tokos = response.tokos || response || [];
        window._allTokos = Array.isArray(tokos) ? tokos : [];
    } catch (error) {
        window._allTokos = [];
    }
}

// ---- Setup Drag & Drop ----
function setupDragDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;

    // Remove click-to-upload from drop-zone
    // Only allow drag & drop, not click
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.classList.add('border-blue-500', 'bg-blue-50');
    }

    function unhighlight(e) {
        dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    }

    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFileSelect(files);
    }
}

// ---- Handle File Selection ----
function handleFileSelect(input) {
    // Handle both input element and FileList
    const files = input.files ? Array.from(input.files) : Array.from(input);
    addFiles(files);
}

// ---- Add Files to Queue ----
function addFiles(files) {
    // Save existing form data before adding new files
    const formData = saveFormData();
    
    files.forEach(file => {
        // Validate file size (max 25MB)
        if (file.size > 25 * 1024 * 1024) {
            if (window.Toast) {
                Toast.error(`File ${file.name} terlalu besar (maks 25MB)`);
            }
            return;
        }

        // Validate file type
        const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (!validTypes.includes(file.type)) {
            if (window.Toast) {
                Toast.error(`File ${file.name} tidak didukung. Gunakan PDF, JPG, atau PNG.`);
            }
            return;
        }

        selectedFiles.push({
            file: file,
            id: Math.random().toString(36).substr(2, 9)
        });
    });

    updateFileUI();
    
    // Restore existing form data after UI update
    setTimeout(() => {
        Object.keys(formData).forEach(index => {
            const tokoInput = document.getElementById(`file-toko-${index}`);
            const dateInput = document.getElementById(`file-date-${index}`);
            if (tokoInput) tokoInput.value = formData[index].toko;
            if (dateInput) dateInput.value = formData[index].tanggal;
        });
    }, 0);
}

// ---- Save Form Data Before Update ----
function saveFormData() {
    const formData = {};
    selectedFiles.forEach((_, index) => {
        const tokoInput = document.getElementById(`file-toko-${index}`);
        const dateInput = document.getElementById(`file-date-${index}`);
        if (tokoInput || dateInput) {
            formData[index] = {
                toko: tokoInput?.value || '',
                tanggal: dateInput?.value || ''
            };
        }
    });
    return formData;
}

// ---- Restore Form Data After Update ----
function restoreFormData(formData) {
    selectedFiles.forEach((_, index) => {
        const tokoInput = document.getElementById(`file-toko-${index}`);
        const dateInput = document.getElementById(`file-date-${index}`);
        if (formData[index]) {
            if (tokoInput) tokoInput.value = formData[index].toko;
            if (dateInput) dateInput.value = formData[index].tanggal;
            // Update both badges when restoring form data
            updateBadges(index);
        }
    });
}

// ---- Remove File from Queue ----
function removeFile(index, e) {
    e.preventDefault();
    
    // Save form data from all files
    const formData = saveFormData();
    
    // Remove the file
    selectedFiles.splice(index, 1);
    
    // Regenerate UI
    updateFileUI();
    
    // Restore form data (but with adjusted indices since we removed a file)
    setTimeout(() => {
        selectedFiles.forEach((_, newIndex) => {
            const oldIndex = newIndex < index ? newIndex : newIndex + 1;
            const tokoInput = document.getElementById(`file-toko-${newIndex}`);
            const dateInput = document.getElementById(`file-date-${newIndex}`);
            if (formData[oldIndex]) {
                if (tokoInput) tokoInput.value = formData[oldIndex].toko;
                if (dateInput) dateInput.value = formData[oldIndex].tanggal;
            }
        });
    }, 0);
}

// ---- Get File Metadata ----
function getFileMetadata(index) {
    return {
        toko: document.getElementById(`file-toko-${index}`)?.value || '',
        tanggal: document.getElementById(`file-date-${index}`)?.value || ''
    };
}

// ---- Filter Tokos for Autocomplete ----
function filterTokos(index) {
    const input = document.getElementById(`file-toko-${index}`);
    const dropdown = document.getElementById(`toko-dropdown-${index}`);
    const query = input.value.toLowerCase().trim();

    if (!query) {
        dropdown.classList.add('hidden');
        return;
    }
    // Filter tokos based on query
    const filtered = window._allTokos.filter(toko => {
        const tokoName = (toko.nama || toko.name || '').toLowerCase();
        const matches = tokoName.includes(query);
        if (matches) {
        }
        return matches;
    });
    if (filtered.length === 0) {
        dropdown.classList.add('hidden');
        return;
    }

    // Show dropdown with filtered options first
    dropdown.innerHTML = filtered.map((toko) => `
        <div class="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-b-0" 
            onclick="event.stopPropagation(); selectToko(${index}, '${(toko.nama || toko.name || '').replace(/'/g, "\\'")}')">
            ${toko.nama || toko.name}
        </div>
    `).join('');

    // Position the dropdown relative to input
    updateDropdownPosition(input, dropdown);

    dropdown.classList.remove('hidden');
}

// ---- Update Dropdown Position ----
function updateDropdownPosition(input, dropdown) {
    const rect = input.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = Math.round(rect.bottom + 4) + 'px';
    dropdown.style.left = Math.round(rect.left) + 'px';
    dropdown.style.width = Math.round(rect.width) + 'px';
    dropdown.style.zIndex = '99999';
}

// ---- Update Both Badges ----
function updateBadges(index) {
    const tokoInput = document.getElementById(`file-toko-${index}`);
    const dateInput = document.getElementById(`file-date-${index}`);
    const tokoBadge = document.getElementById(`toko-badge-${index}`);
    const tanggalBadge = document.getElementById(`tanggal-badge-${index}`);
    
    if (!tokoInput || !dateInput) return;
    
    // Update Toko Badge
    const tokoName = tokoInput.value.trim();
    if (tokoName) {
        tokoBadge.textContent = tokoName;
        tokoBadge.classList.remove('hidden');
    } else {
        tokoBadge.classList.add('hidden');
    }
    
    // Update Tanggal Badge
    const tanggalValue = dateInput.value.trim();
    if (tanggalValue) {
        // Format date using same format as dashboard: "1 Jun 26"
        const dateObj = new Date(tanggalValue + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' });
        tanggalBadge.textContent = formattedDate;
        tanggalBadge.classList.remove('hidden');
    } else {
        tanggalBadge.classList.add('hidden');
    }
}

// ---- Select Toko from Dropdown ----
function selectToko(index, tokoName) {
    const input = document.getElementById(`file-toko-${index}`);
    const dropdown = document.getElementById(`toko-dropdown-${index}`);
    input.value = tokoName;
    dropdown.classList.add('hidden');
    input.focus();
    updateBadges(index);
}

// ---- Handle Keyboard Navigation in Dropdown ----
function handleTokoKeydown(event, index) {
    const dropdown = document.getElementById(`toko-dropdown-${index}`);
    if (event.key === 'Escape') {
        dropdown.classList.add('hidden');
    }
}

// ---- Close All Dropdowns ----
function closeAllDropdowns() {
    document.querySelectorAll('[id^="toko-dropdown-"]').forEach(dropdown => {
        dropdown.classList.add('hidden');
    });
}

// ---- Update All Dropdowns on Scroll/Resize ----
function updateAllDropdownsPosition() {
    document.querySelectorAll('[id^="toko-dropdown-"]:not(.hidden)').forEach(dropdown => {
        const index = dropdown.id.replace('toko-dropdown-', '');
        const input = document.getElementById(`file-toko-${index}`);
        if (input) {
            updateDropdownPosition(input, dropdown);
        }
    });
}

// Attach click listener to close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    // Don't close if clicking inside a dropdown or input
    if (!e.target.closest('[id^="file-toko-"]') && !e.target.closest('[id^="toko-dropdown-"]')) {
        closeAllDropdowns();
    }
});

// Update dropdown positions when scrolling or resizing
document.addEventListener('scroll', updateAllDropdownsPosition, true);
window.addEventListener('resize', updateAllDropdownsPosition);

// ---- Clear All Files ----
function clearFile(e) {
    e.preventDefault();
    selectedFiles = [];
    document.getElementById('file-input').value = '';
    
    // Clear all form fields
    const fileListDisplay = document.getElementById('file-list-display');
    const inputs = fileListDisplay.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        input.value = '';
    });
    
    updateFileUI();
}

// ---- Format File Size ----
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ---- Update File UI ----
function updateFileUI() {
    const dropZoneIntro = document.getElementById('drop-zone-intro');
    const fileInfo = document.getElementById('file-info');
    const fileListDisplay = document.getElementById('file-list-display');
    const uploadBtnContainer = document.getElementById('upload-btn-container');
    if (selectedFiles.length === 0) {
        // No files - show intro text only
        dropZoneIntro.style.display = '';
        fileInfo.classList.add('hidden');
        uploadBtnContainer.classList.add('hidden');
        return;
    }

    // Files are selected - hide intro text, show file list
    dropZoneIntro.style.display = 'none';
    fileInfo.classList.remove('hidden');
    uploadBtnContainer.classList.remove('hidden');

    fileListDisplay.innerHTML = selectedFiles.map((item, index) => `
        <li class="bg-gray-50/50 border border-gray-200 rounded-xl overflow-visible">
            <div class="p-4 flex items-center justify-between">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <div class="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                        <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <p class="text-sm font-semibold text-gray-900 truncate">${item.file.name}</p>
                            <span id="toko-badge-${index}" class="hidden text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                                <!-- Toko badge -->
                            </span>
                            <span id="tanggal-badge-${index}" class="hidden text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                                <!-- Tanggal badge -->
                            </span>
                        </div>
                        <p class="text-[11px] text-gray-500">${formatFileSize(item.file.size)}</p>
                    </div>
                </div>
                <button type="button" onclick="removeFile(${index}, event)" 
                    class="ml-2 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="bg-white border-t border-gray-200 p-4 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="relative">
                        <label class="block text-xs font-bold text-gray-600 mb-2 uppercase">Toko</label>
                        <input type="text" placeholder="Nama Toko" id="file-toko-${index}"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            autocomplete="off"
                            oninput="filterTokos(${index}); updateBadges(${index})"
                            onkeydown="handleTokoKeydown(event, ${index})" />
                        <div id="toko-dropdown-${index}" class="hidden bg-white border border-gray-300 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                            <!-- Dropdown options injected by filterTokos -->
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-600 mb-2 uppercase">Tanggal Dokumen</label>
                        <input type="date" id="file-date-${index}"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            oninput="updateBadges(${index})" />
                    </div>
                </div>
            </div>
        </li>
    `).join('');
}

// ---- Setup Form ----
function setupForm() {
    const uploadBtn = document.getElementById('upload-btn');
    if (!uploadBtn) return;

    uploadBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await uploadAllFiles();
    });
}

// ---- Upload All Files ----
async function uploadAllFiles() {
    if (selectedFiles.length === 0) {
        if (window.Toast) {
            Toast.error('Pilih file terlebih dahulu');
        }
        return;
    }

    const uploadBtn = document.getElementById('upload-btn');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressPct = document.getElementById('upload-progress-pct');

    uploadBtn.disabled = true;
    progressContainer.classList.remove('hidden');

    try {
        // IMPORTANT: Collect all metadata BEFORE starting uploads
        // This prevents issues if form is cleared during upload
        const allMetadata = [];
        for (let i = 0; i < selectedFiles.length; i++) {
            allMetadata.push(getFileMetadata(i));
        }
        let completed = 0;
        for (let i = 0; i < selectedFiles.length; i++) {
            const item = selectedFiles[i];
            const metadata = allMetadata[i]; // Use pre-collected metadata
            
            const formData = new FormData();
            formData.append('file', item.file);
            // Convert toko name to toko_id
            if (metadata.toko) {
                const selectedToko = window._allTokos.find(t => 
                    (t.nama || t.name || '').toLowerCase() === metadata.toko.toLowerCase()
                );
                if (selectedToko) {
                    formData.append('toko_id', String(selectedToko.id));
                }
            }

            if (metadata.tanggal) {
                formData.append('tanggal_dokumen', metadata.tanggal);
            }

            try {
                // Add timeout to prevent hanging
                const uploadPromise = API.upload('/api/files/upload-piutang', formData);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Upload timeout - no response from server')), 30000)
                );
                
                await Promise.race([uploadPromise, timeoutPromise]);
                completed++;
                const progress = Math.round((completed / selectedFiles.length) * 100);
                progressBar.style.width = progress + '%';
                progressPct.textContent = progress + '%';
            } catch (error) {
                if (window.Toast) {
                    Toast.error(`Gagal upload ${item.file.name}: ${error.message}`);
                }
            }
        }

        if (completed === selectedFiles.length) {
            if (window.Toast) {
                Toast.success(`${completed} file bukti piutang berhasil diunggah`);
            }
            clearFile({ preventDefault: () => {} });
            progressContainer.classList.add('hidden');
            progressBar.style.width = '0%';
            progressPct.textContent = '0%';
            await loadRecentUploads();
        }
    } catch (error) {
        if (window.Toast) {
            Toast.error('Terjadi kesalahan saat upload');
        }
    } finally {
        uploadBtn.disabled = false;
    }
}

// ---- Load Recent Uploads ----
async function loadRecentUploads() {
    const recentContainer = document.getElementById('recent-uploads');
    if (!recentContainer) return;

    try {
        // Fetch recent PIUTANG files from the files endpoint
        // Filter by category PIUTANG
        const response = await API.get('/api/files?category=PIUTANG&limit=10&sort=created_at&order=desc');
        const uploads = response.files || response || [];

        if (uploads.length === 0) {
            recentContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 opacity-30">
                    <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" 
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p class="text-sm font-medium">Belum ada unggahan</p>
                </div>
            `;
            return;
        }

        recentContainer.innerHTML = uploads.map(upload => `
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <svg class="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M4.293 5.293a1 1 0 011.414 0L10 9.586l4.293-4.293a1 1 0 111.414 1.414L11.414 11l4.293 4.293a1 1 0 01-1.414 1.414L10 12.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 11 4.293 6.707a1 1 0 010-1.414z" />
                        </svg>
                    </div>
                    <div>
                        <p class="text-sm font-semibold text-gray-900">${upload.nama_file || 'File'}</p>
                        <p class="text-[11px] text-gray-500">${new Date(upload.created_at).toLocaleString('id-ID')}</p>
                    </div>
                </div>
                <span class="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600">Diunggah</span>
            </div>
        `).join('');
    } catch (error) {
        recentContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-30">
                <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" 
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p class="text-sm font-medium">Error memuat unggahan</p>
            </div>
        `;
    }
}
