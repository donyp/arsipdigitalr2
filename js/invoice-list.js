// Invoice Excel Upload Modal
let invoiceCurrentPage = 0;
let allInvoices = [];  // Global array to store all invoices for popup access

window.openUploadExcelModal = function() {
    const modal = document.getElementById('uploadExcelModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeUploadExcelModal = function() {
    const modal = document.getElementById('uploadExcelModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    const input = document.getElementById('excelFileInput');
    if (input) input.value = '';
};

function setupExcelUploadModal() {
    console.log('[Invoice-Setup] setupExcelUploadModal called');
    
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('excelFileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    
    console.log('[Invoice-Setup] Elements found:', {
        dropZone: !!dropZone,
        fileInput: !!fileInput,
        uploadBtn: !!uploadBtn
    });
    
    if (!dropZone || !fileInput || !uploadBtn) {
        console.log('[Invoice-Setup] Elements not ready, retrying in 100ms');
        setTimeout(setupExcelUploadModal, 100);
        return;
    }
    
    console.log('[Invoice-Setup] All elements found, setting up listeners');
    
    // Drag over
    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#3b82f6';
    });

    // Drag leave
    dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#93c5fd';
    });

    // Drop
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Invoice-Setup] File dropped');
        if (e.dataTransfer.files.length > 0) {
            handleExcelFileSelected(e.dataTransfer.files[0]);
        }
    });

    // File input change
    fileInput.addEventListener('change', function(e) {
        console.log('[Invoice-Setup] File selected via input');
        if (e.target.files.length > 0) {
            handleExcelFileSelected(e.target.files[0]);
        }
    });
    
    // Button listeners
    const btnUploadExcel = document.getElementById('btnUploadExcel');
    const btnSelectFile = document.getElementById('btnSelectFile');
    const btnCancel = document.getElementById('btnCancel');
    const btnClose = document.getElementById('modal-close-btn');
    const backdrop = document.getElementById('modal-backdrop');

    console.log('[Invoice-Setup] Button elements:', {
        btnUploadExcel: !!btnUploadExcel,
        btnSelectFile: !!btnSelectFile,
        btnCancel: !!btnCancel,
        btnClose: !!btnClose,
        backdrop: !!backdrop
    });

    // Direct click handler for main upload button
    if (btnUploadExcel) {
        const clickHandler = function(e) {
            console.log('[Invoice-Setup] btnUploadExcel clicked');
            e.preventDefault();
            e.stopPropagation();
            window.openUploadExcelModal();
        };
        btnUploadExcel.onclick = clickHandler;
        btnUploadExcel.addEventListener('click', clickHandler);
        console.log('[Invoice-Setup] Bound: btnUploadExcel');
    }
    
    if (btnSelectFile) {
        btnSelectFile.addEventListener('click', function() {
            console.log('[Invoice-Setup] btnSelectFile clicked');
            fileInput.click();
        });
        console.log('[Invoice-Setup] Bound: btnSelectFile');
    }
    if (btnCancel) {
        btnCancel.addEventListener('click', function() {
            console.log('[Invoice-Setup] btnCancel clicked');
            window.closeUploadExcelModal();
        });
        console.log('[Invoice-Setup] Bound: btnCancel');
    }
    if (btnClose) {
        btnClose.addEventListener('click', function() {
            console.log('[Invoice-Setup] btnClose clicked');
            window.closeUploadExcelModal();
        });
        console.log('[Invoice-Setup] Bound: btnClose');
    }
    if (backdrop) {
        backdrop.addEventListener('click', function() {
            console.log('[Invoice-Setup] backdrop clicked');
            window.closeUploadExcelModal();
        });
        console.log('[Invoice-Setup] Bound: backdrop');
    }
    if (uploadBtn) {
        uploadBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Invoice-Setup] uploadBtn clicked - calling uploadExcelFile');
            window.uploadExcelFile();
        });
        console.log('[Invoice-Setup] Bound: uploadBtn');
    }
    
    console.log('[Invoice-Setup] Setup complete');
}

window.handleExcelFileSelected = function(file) {
    console.log('[File] Selected:', file.name, file.size, 'bytes');
    
    // IMPORTANT: Set file to input element so uploadExcelFile can find it
    const fileInput = document.getElementById('excelFileInput');
    if (fileInput) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        console.log('[File] Set to excelFileInput');
    }
    
    // Show file info
    const fileInfo = document.getElementById('fileInfo');
    if (fileInfo) {
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(2) + ' KB';
        document.getElementById('fileType').textContent = file.type || 'unknown';
        fileInfo.classList.remove('hidden');
        console.log('[File] File info displayed');
    }
};

window.uploadExcelFile = async function() {
    console.log('[Upload] uploadExcelFile called');
    
    const fileInput = document.getElementById('excelFileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        Toast.error('Pilih file terlebih dahulu', '❌ Error');
        return;
    }

    const file = fileInput.files[0];
    console.log('[Upload] File selected:', file.name, file.size, 'bytes');
    
    const originalText = uploadBtn.textContent;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Parsing...';

    try {
        // Parse Excel in browser first
        console.log('[Upload] Reading file...');
        const arrayBuffer = await file.arrayBuffer();
        
        console.log('[Upload] Parsing Excel with XLSX...');
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        
        console.log('[Upload] Workbook loaded. Sheets:', workbook.SheetNames);
        
        // Try to find "REKAP LABA" sheet, otherwise use first sheet
        let sheetName = workbook.SheetNames.find(name => name.includes('REKAP')) || workbook.SheetNames[0];
        console.log('[Upload] Using sheet:', sheetName);
        
        const worksheet = workbook.Sheets[sheetName];
        
        // Skip title rows - data starts at row 4 (after "REKAP LABA" title)
        // Try without range first to see what we get
        const rawData = XLSX.utils.sheet_to_json(worksheet, { 
            defval: null, 
            blankrows: false,
            header: 1  // Get as array first to debug
        });
        
        console.log('[Upload] Raw data length:', rawData.length);
        console.log('[Upload] First 5 rows:', rawData.slice(0, 5));
        
        // Find header row (contains "TANGGAL")
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(10, rawData.length); i++) {
            const row = rawData[i];
            if (Array.isArray(row) && row.some(cell => cell && cell.toString().includes('TANGGAL'))) {
                headerRowIndex = i;
                console.log('[Upload] Found header at row', i, ':', row);
                break;
            }
        }
        
        if (headerRowIndex === -1) {
            Toast.error('File Excel kosong atau format tidak valid - Tidak dapat menemukan header row dengan kolom TANGGAL', '❌ Validation Error');
            return;
        }
        
        // Now parse with correct header row
        const parsedData = XLSX.utils.sheet_to_json(worksheet, { 
            defval: null, 
            blankrows: false,
            range: headerRowIndex  // Start from header row
        });
        
        console.log('[Upload] Parsed', parsedData.length, 'rows');
        console.log('[Upload] First row sample:', parsedData[0]);
        console.log('[Upload] First row keys:', parsedData[0] ? Object.keys(parsedData[0]) : 'NO DATA');
        
        if (parsedData.length === 0) {
            Toast.error('File Excel kosong atau format tidak valid - Pastikan file memiliki header row dengan kolom: TANGGAL, TOKO, FAKTUR, METODE BAYAR, JENIS TRANSAKSI, KONSUMEN, JUMLAH JUAL, KET 2', '❌ Validation Error');
            return;
        }
        
        // Transform data to match backend expectation
        let invoices = parsedData.map(row => ({
            tanggal: row['TANGGAL'] || row['tanggal'],
            toko: row['TOKO'] || row['toko'],
            faktur: row['FAKTUR'] || row['faktur'],
            metode_bayar: row['METODE BAYAR'] || row['metode_bayar'],
            jenis_transaksi: row['JENIS TRANSAKSI'] || row['jenis_transaksi'],
            konsumen: row['KONSUMEN'] || row['konsumen'],
            total_jumlah_jual: parseFloat(row['JUMLAH JUAL'] || row['jumlah_jual'] || 0),
            keterangan: row['KET 2'] || row['ket_2'] || 'NON PPN'
        })).filter(inv => inv.faktur); // Remove rows without faktur
        
        // AGGREGATION: Group by faktur and sum totals for duplicate fakturs
        console.log('[Upload] Before aggregation:', invoices.length, 'total rows');
        const aggregated = {};
        invoices.forEach(inv => {
            if (aggregated[inv.faktur]) {
                // Faktur already exists - add to total
                aggregated[inv.faktur].total_jumlah_jual += inv.total_jumlah_jual;
                aggregated[inv.faktur].item_count = (aggregated[inv.faktur].item_count || 1) + 1;
            } else {
                // First occurrence of this faktur
                aggregated[inv.faktur] = {
                    ...inv,
                    item_count: 1
                };
            }
        });
        
        invoices = Object.values(aggregated);
        console.log('[Upload] After aggregation:', invoices.length, 'unique fakturs (duplicates summed)');
        
        uploadBtn.textContent = 'Uploading...';
        
        // Get token
        const token = API.getToken() || localStorage.getItem('jwt_token');
        
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        console.log('[Upload] Posting JSON to /api/invoice/upload-excel-data');
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/upload-excel-data`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                filename: file.name,
                data: invoices
            })
        });

        console.log('[Upload] Response:', response.status, response.statusText);
        
        const responseText = await response.text();
        console.log('[Upload] Response text:', responseText);
        
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseErr) {
            console.error('[Upload] JSON parse error:', parseErr.message);
            console.error('[Upload] Raw response was:', responseText.substring(0, 500));
            return Toast.error('Server returned invalid response: ' + responseText.substring(0, 200), '❌ Response Error');
        }

        console.log('[Upload] Parsed result:', result);

        if (response.ok && result.success) {
            const processed = result.summary?.processed || 0;
            const duplicates = result.summary?.duplicates || 0;
            console.log('[Upload] SUCCESS');
            
            // Show success popup
            showSuccessPopup(processed, duplicates);
            
            // Close modal
            window.closeUploadExcelModal();
            
            // Reload invoice table after 1 second
            setTimeout(() => {
                console.log('[Upload] Reloading invoice table...');
                currentPage = 1;
                loadInvoices();
            }, 1000);
        } else {
            const errMsg = result.error || 'Upload failed';
            console.log('[Upload] FAILED:', errMsg);
            Toast.error(errMsg, '❌ Upload Failed');
        }
    } catch (error) {
        console.error('[Upload] Exception:', error);
        Toast.error(error.message, '❌ Upload Exception');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
    }
};

// ============================================
// Load Invoices Function
// ============================================
let currentPage = 1;
const PAGE_SIZE = 20;

async function loadInvoices(page = 1) {
    try {
        console.log('[LoadInvoices] Loading page', page);
        
        const token = API.getToken() || localStorage.getItem('jwt_token');
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const offset = (page - 1) * PAGE_SIZE;
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/list?limit=${PAGE_SIZE}&offset=${offset}`, {
            method: 'GET',
            headers: headers
        });
        
        if (!response.ok) {
            throw new Error('Failed to load invoices: ' + response.statusText);
        }
        
        const result = await response.json();
        console.log('[LoadInvoices] Result:', result);
        
        renderInvoiceTable(result.data || []);
        updateInvoiceStats(result);
        currentPage = page;
        
    } catch (error) {
        console.error('[LoadInvoices] Error:', error);
    }
}

function renderInvoiceTable(invoices = null) {
    // Use allInvoices if no parameter provided (for pagination/filter)
    const data = invoices || allInvoices || [];
    
    const tbody = document.getElementById('invoiceTableBody');
    if (!tbody) {
        console.warn('[RenderTable] invoiceTableBody not found');
        return;
    }
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px; color: #6b7280; font-size: 14px;">Belum ada data invoice</td></tr>';
        return;
    }
    
    // Calculate page slice
    const start = invoiceCurrentPage * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageData = data.slice(start, end);
    
    tbody.innerHTML = pageData.map(inv => {
        // New status format: X/Y (e.g., 0/3, 1/3, 2/3, 3/3)
        const filesUploaded = inv.files_uploaded_count || 0;
        // PPN requires 3 files, NON PPN and GUNGGUNG require 2 files
        const isPPN = inv.keterangan && inv.keterangan.toUpperCase() === 'PPN';
        const filesRequired = inv.files_required_count || (isPPN ? 3 : 2);
        const statusDisplay = `${filesUploaded}/${filesRequired}`;
        const isComplete = filesUploaded >= filesRequired;
        
        // Status color and dot based on progress
        let statusDotColor, statusTextColor, statusClass;
        if (isComplete) {
            statusDotColor = '#10b981'; // Green - complete
            statusTextColor = '#059669';
            statusClass = 'uploaded';
        } else if (filesUploaded > 0 && filesUploaded === filesRequired - 1) {
            statusDotColor = '#f59e0b'; // Orange - almost complete (1 file left)
            statusTextColor = '#d97706';
            statusClass = 'almost-complete';
        } else if (filesUploaded > 0) {
            statusDotColor = '#eab308'; // Yellow - partial
            statusTextColor = '#ca8a04';
            statusClass = 'partial';
        } else {
            statusDotColor = '#ef4444'; // Red - no files uploaded
            statusTextColor = '#dc2626';
            statusClass = 'pending';
        }
        
        // Format tanggal: 2026-09-02 -> 02/09/2026
        const formattedDate = formatDate(inv.tanggal);
        
        // Capitalize jenis_transaksi: jual -> Jual
        const capitalizedTipe = inv.jenis_transaksi 
            ? inv.jenis_transaksi.charAt(0).toUpperCase() + inv.jenis_transaksi.slice(1).toLowerCase()
            : '-';
        
        const konsumenText = inv.konsumen || '-';
        const tokoText = inv.toko || '-';
        
        // Build action buttons HTML
        let actionButtons = '';
        
        // Download buttons for uploaded files
        const downloadButtons = [];
        if (inv.invoice_pdf_path) {
            downloadButtons.push(`<button class="btn-download-small" onclick="downloadInvoiceFile('${inv.faktur}', 'invoice')" title="Download Invoice">📄 INV</button>`);
        }
        if (inv.bukti_bayar_path) {
            downloadButtons.push(`<button class="btn-download-small" onclick="downloadInvoiceFile('${inv.faktur}', 'bukti_bayar')" title="Download Bukti Bayar">💰 BB</button>`);
        }
        if (inv.faktur_pajak_path) {
            downloadButtons.push(`<button class="btn-download-small" onclick="downloadInvoiceFile('${inv.faktur}', 'faktur_pajak')" title="Download Faktur Pajak">📋 FP</button>`);
        }
        
        // Combine button if complete
        if (isComplete) {
            actionButtons = `
                <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; align-items: center;">
                    ${downloadButtons.length > 0 ? `<button onclick="showInvoiceDownloadMenu('${inv.faktur}', '${inv.id}')" style="background: none; border: none; cursor: pointer; color: #6b7280; font-size: 18px; padding: 6px 10px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#f3f4f6'; this.style.color='#374151';" onmouseout="this.style.backgroundColor='transparent'; this.style.color='#6b7280';" title="Aksi">⋮</button>` : ''}
                    <button class="btn-combine" onclick="combinePDF('${inv.faktur}')" style="background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#2563eb'" onmouseout="this.style.backgroundColor='#3b82f6'" title="Combine & Download All">📦 Combine</button>
                </div>
            `;
        } else if (downloadButtons.length > 0) {
            // Show three-dots menu for download buttons
            actionButtons = `
                <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;">
                    <button onclick="showInvoiceDownloadMenu('${inv.faktur}', '${inv.id}')" style="background: none; border: none; cursor: pointer; color: #6b7280; font-size: 18px; padding: 6px 10px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#f3f4f6'; this.style.color='#374151';" onmouseout="this.style.backgroundColor='transparent'; this.style.color='#6b7280';" title="Aksi">⋮</button>
                </div>
            `;
        } else {
            // Show upload button
            actionButtons = `<button class="btn-upload-pdf" onclick="openPdfUploadModal('${inv.faktur}')" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#059669'" onmouseout="this.style.backgroundColor='#10b981'">Upload PDF</button>`;
        }
        
        return `
        <tr style="border-bottom: 1px solid #e5e7eb; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9fafb'" onmouseout="this.style.backgroundColor='white'">
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 600;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusDotColor}; display: inline-block;"></span>
                    <span style="color: ${statusTextColor};">${statusDisplay}</span>
                </div>
            </td>
            <td style="padding: 12px 16px; font-size: 13px; color: #374151;">${formattedDate}</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #1f2937; letter-spacing: 0.05em;"><strong>${inv.faktur || '-'}</strong></td>
            <td style="padding: 12px 16px; font-size: 13px; color: #374151;">${inv.metode_bayar || '-'}</td>
            <td style="padding: 12px 16px; font-size: 13px; color: #374151;">${capitalizedTipe}</td>
            <td style="padding: 12px 16px; font-size: 13px; color: #374151;">${konsumenText}</td>
            <td style="padding: 12px 16px; font-size: 13px; color: #374151;">${tokoText}</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #059669;">${formatCurrency(inv.total_jumlah_jual)}</td>
            <td style="padding: 12px 16px; font-size: 13px; color: #6b7280;">${inv.keterangan || '-'}</td>
            <td style="padding: 12px 16px; text-align: center;">
                ${actionButtons}
            </td>
        </tr>
    `}).join('');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    
    // Handle format: 2026-09-02 or 02-09-2026
    let date;
    
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        
        // Check if format is yyyy-mm-dd
        if (parts[0].length === 4) {
            date = new Date(dateStr); // 2026-09-02
        } else {
            // Format is dd-mm-yyyy or mm-dd-yyyy, assume dd-mm-yyyy
            date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
    } else {
        return dateStr;
    }
    
    if (isNaN(date)) return dateStr;
    
    // Format as dd/mm/yyyy
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
}

function formatCurrency(value) {
    if (!value) return 'Rp 0';
    return 'Rp ' + parseInt(value).toLocaleString('id-ID');
}

function updateInvoiceStats(result) {
    // Update stats if data provided
    if (result.count !== undefined) {
        const statTotal = document.getElementById('statTotal');
        if (statTotal) statTotal.textContent = result.count;
    }
}

function viewInvoiceDetail(invoiceId) {
    console.log('[ViewInvoice] ID:', invoiceId);
    alert('Detail invoice akan ditampilkan di modal (soon)');
}

// ============================================
// PDF Upload Modal Functions
// ============================================
function openPdfUploadModal(faktur) {
    console.log('[PDF Upload] Opening modal for faktur:', faktur);
    
    const modal = document.getElementById('pdfUploadModal');
    if (!modal) {
        console.error('[PDF Upload] Modal not found!');
        return;
    }
    
    // Store faktur for upload
    document.getElementById('pdfFaktur').value = faktur;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closePdfUploadModal() {
    const modal = document.getElementById('pdfUploadModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    const input = document.getElementById('pdfFileInput');
    if (input) input.value = '';
}

function openBuktiBayarUploadModal(faktur) {
    console.log('[Bukti Bayar Upload] Opening modal for faktur:', faktur);
    
    const modal = document.getElementById('buktiBayarUploadModal');
    if (!modal) {
        console.error('[Bukti Bayar Upload] Modal not found!');
        return;
    }
    
    // Store faktur for upload
    document.getElementById('buktiBayarFaktur').value = faktur;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeBuktiBayarUploadModal() {
    const modal = document.getElementById('buktiBayarUploadModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    const input = document.getElementById('buktiBayarFileInput');
    if (input) input.value = '';
}

async function uploadBuktiBayarFile() {
    const faktur = document.getElementById('buktiBayarFaktur').value;
    const fileInput = document.getElementById('buktiBayarFileInput');
    const uploadBtn = document.getElementById('buktiBayarUploadBtn');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Pilih file PDF terlebih dahulu');
        return;
    }
    
    const file = fileInput.files[0];
    console.log('[Bukti Bayar] Uploading:', file.name, 'for faktur:', faktur);
    
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Hanya file PDF yang diizinkan');
        return;
    }
    
    const originalText = uploadBtn.textContent;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    
    try {
        const formData = new FormData();
        formData.append('pdf', file);
        formData.append('faktur', faktur);
        formData.append('type', 'bukti_bayar');
        
        const token = API.getToken() || localStorage.getItem('jwt_token');
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        console.log('[Bukti Bayar] Posting to /api/invoice/upload-pdf');
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/upload-pdf`, {
            method: 'POST',
            headers: headers,
            body: formData
        });
        
        const result = await response.json();
        console.log('[Bukti Bayar] Response:', result);
        
        if (response.ok && result.success) {
            console.log('[Bukti Bayar] SUCCESS');
            alert('✅ Bukti Bayar Uploaded!\n\nFaktur: ' + faktur + '\nKonsumen: ' + result.konsumen);
            closeBuktiBayarUploadModal();
            
            // Reload table
            setTimeout(() => {
                console.log('[Bukti Bayar] Reloading invoice table...');
                currentPage = 1;
                loadInvoices();
            }, 1000);
        } else {
            const errMsg = result.error || 'Upload failed';
            console.log('[Bukti Bayar] FAILED:', errMsg);
            alert('❌ Error: ' + errMsg);
        }
    } catch (error) {
        console.error('[Bukti Bayar] Exception:', error);
        alert('❌ Error: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
    }
}

async function uploadPdfFile() {
    const faktur = document.getElementById('pdfFaktur').value;
    const fileInput = document.getElementById('pdfFileInput');
    const uploadBtn = document.getElementById('pdfUploadBtn');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Pilih file PDF terlebih dahulu');
        return;
    }
    
    const file = fileInput.files[0];
    console.log('[PDF] Uploading:', file.name, 'for faktur:', faktur);
    
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Hanya file PDF yang diizinkan');
        return;
    }
    
    const originalText = uploadBtn.textContent;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    
    try {
        const formData = new FormData();
        formData.append('pdf', file);
        
        const token = API.getToken() || localStorage.getItem('jwt_token');
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        console.log('[PDF] Posting to /api/invoice/upload-pdf');
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/upload-pdf`, {
            method: 'POST',
            headers: headers,
            body: formData
        });
        
        const result = await response.json();
        console.log('[PDF] Response:', result);
        
        if (response.ok && result.success) {
            console.log('[PDF] SUCCESS');
            alert('✅ PDF Uploaded!\n\nFaktur: ' + faktur + '\nKonsumen: ' + result.konsumen);
            closePdfUploadModal();
            
            // Reload table
            setTimeout(() => {
                console.log('[PDF] Reloading invoice table...');
                currentPage = 1;
                loadInvoices();
            }, 1000);
        } else {
            const errMsg = result.error || 'Upload failed';
            console.log('[PDF] FAILED:', errMsg);
            alert('❌ Error: ' + errMsg);
        }
    } catch (error) {
        console.error('[PDF] Exception:', error);
        alert('❌ Error: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
    }
}

// Load invoices on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('[Invoice-Init] Loading initial invoice list');
        await initAuth();
        loadInvoices(1);
    });
} else {
    console.log('[Invoice-Init] Document ready, loading invoices now');
    (async () => {
        await initAuth();
        loadInvoices(1);
    })();
}

// ============================================
// Success Popup Function
// ============================================
function showSuccessPopup(processed, duplicates) {
    // Create popup overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease-out;
    `;
    
    // Create popup box
    const popup = document.createElement('div');
    popup.style.cssText = `
        background: white;
        padding: 40px;
        border-radius: 16px;
        text-align: center;
        max-width: 500px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: slideUp 0.3s ease-out;
    `;
    
    // Add success icon
    const icon = document.createElement('div');
    icon.innerHTML = '✅';
    icon.style.cssText = `
        font-size: 64px;
        margin-bottom: 20px;
        animation: bounce 0.6s ease-out;
    `;
    
    // Add title
    const title = document.createElement('h2');
    title.textContent = 'Upload Berhasil!';
    title.style.cssText = `
        font-size: 28px;
        font-weight: 700;
        color: #27ae60;
        margin-bottom: 15px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // Add stats
    const stats = document.createElement('div');
    stats.style.cssText = `
        background: #f0f8f4;
        padding: 20px;
        border-radius: 12px;
        margin-bottom: 20px;
        border-left: 4px solid #27ae60;
    `;
    
    stats.innerHTML = `
        <div style="margin-bottom: 10px; font-size: 16px; color: #2c3e50;">
            <strong>Processed:</strong> <span style="color: #27ae60; font-size: 20px; font-weight: 700;">${processed}</span> invoices
        </div>
        <div style="font-size: 16px; color: #2c3e50;">
            <strong>Duplicates:</strong> <span style="color: #f39c12; font-size: 20px; font-weight: 700;">${duplicates}</span>
        </div>
    `;
    
    // Add message
    const message = document.createElement('p');
    message.textContent = 'Data sedang dimuat ke tabel...';
    message.style.cssText = `
        font-size: 14px;
        color: #7f8c8d;
        margin-bottom: 25px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // Add button
    const button = document.createElement('button');
    button.textContent = 'Tutup';
    button.style.cssText = `
        background: #27ae60;
        color: white;
        border: none;
        padding: 12px 32px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    button.addEventListener('mouseover', () => {
        button.style.background = '#229954';
        button.style.transform = 'translateY(-2px)';
    });
    
    button.addEventListener('mouseout', () => {
        button.style.background = '#27ae60';
        button.style.transform = 'translateY(0)';
    });
    
    button.addEventListener('click', () => {
        overlay.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => overlay.remove(), 300);
    });
    
    // Assemble popup
    popup.appendChild(icon);
    popup.appendChild(title);
    popup.appendChild(stats);
    popup.appendChild(message);
    popup.appendChild(button);
    
    // Assemble overlay
    overlay.appendChild(popup);
    
    // Add animations to document if not already there
    if (!document.getElementById('popup-animations')) {
        const style = document.createElement('style');
        style.id = 'popup-animations';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            @keyframes slideUp {
                from {
                    transform: translateY(30px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            @keyframes bounce {
                0%, 100% { transform: scale(0.8); opacity: 0; }
                50% { transform: scale(1); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add to page
    document.body.appendChild(overlay);
    
    // Auto-close after 5 seconds
    setTimeout(() => {
        if (overlay.parentElement) {
            overlay.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => overlay.remove(), 300);
        }
    }, 5000);
}

// ============================================
// Clear Test Data Function
// ============================================
window.clearTestData = async function() {
    if (!confirm('⚠️ PERINGATAN!\n\nIni akan menghapus SEMUA data test invoice.\nAksi tidak bisa diundo!\n\nLanjutkan?')) {
        return;
    }
    
    try {
        const token = API.getToken() || localStorage.getItem('jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        console.log('[ClearTest] Sending DELETE request to /api/invoice/clear-test-data');
        
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/clear-test-data`, {
            method: 'DELETE',
            headers: headers
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('✅ Success!\n\n' + result.message + '\n\nHalaman akan di-reload...');
            setTimeout(() => location.reload(), 1000);
        } else {
            alert('❌ Error: ' + (result.error || 'Failed to clear data'));
        }
    } catch (error) {
        console.error('[ClearTest] Error:', error);
        alert('❌ Error: ' + error.message);
    }
};

// Setup event listener for clear button
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Invoice-Init] DOMContentLoaded - setting up handlers');
    setupExcelUploadModal();
    
    const clearBtn = document.getElementById('btnClearTestData');
    if (clearBtn) {
        clearBtn.addEventListener('click', window.clearTestData);
        clearBtn.onclick = window.clearTestData;
        console.log('[Invoice-Init] Clear test data button handler attached');
    }
});

// Also setup after short delay to be safe
setTimeout(() => {
    console.log('[Invoice-Init] Setting up handlers (delayed 200ms)');
    setupExcelUploadModal();
    
    const clearBtn = document.getElementById('btnClearTestData');
    if (clearBtn && !clearBtn._setupDone) {
        clearBtn.addEventListener('click', window.clearTestData);
        clearBtn.onclick = window.clearTestData;
        clearBtn._setupDone = true;
        console.log('[Invoice-Init] Clear test data button handler attached (delayed)');
    }
}, 200);


// ============================================
// Loading Overlay Functions
// ============================================
window.showLoadingOverlay = function(message = 'Sedang Upload PDF') {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.querySelector('p').textContent = message;
        overlay.classList.add('visible');
    }
};

window.hideLoadingOverlay = function() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('visible');
    }
};

// ============================================
// Format Rupiah Currency
// ============================================
function formatRupiah(amount) {
    if (!amount || isNaN(amount)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// ============================================
// Populate Toko Dropdown from Zone or Database
// ============================================
async function populateTokoDropdown() {
    const tokoSelect = document.getElementById('filterToko');
    if (!tokoSelect) {
        console.warn('[Invoice-Filter] filterToko not found');
        return;
    }
    
    try {
        // Get current user from auth module
        const user = getCurrentUser ? getCurrentUser() : null;
        const isAdminZona = user && user.role === 'admin_zona';
        
        console.log('[Invoice-Filter] Current user:', {
            name: user?.name,
            role: user?.role,
            zona_id: user?.zona_id,
            isAdminZona
        });
        
        if (isAdminZona && user.zona_id) {
            // For admin_zona: Show KONSUMEN (actual toko names from their zona)
            console.log('[Invoice-Filter] Admin zona detected - fetching konsumen from their zona');
            
            // Get distinct konsumen for their zona
            let { data, error } = await supabase
                .from('invoice_file_list')
                .select('konsumen')
                .eq('zona_id', user.zona_id)
                .order('konsumen', { ascending: true });
            
            if (error) {
                console.error('[Invoice-Filter] Error fetching zona konsumen:', error);
                return;
            }
            
            if (data && data.length > 0) {
                // Extract unique konsumen values
                // Filter OUT supplier names (ANKA BEKASI, ANKA PEMALANG, etc)
                const supplierNames = ['ANKA BEKASI', 'ANKA PEMALANG'];
                
                const uniqueKonsumen = [...new Set(
                    data
                        .map(row => row.konsumen)
                        .filter(k => k && k.trim().length > 0 && !supplierNames.includes(k.trim().toUpperCase()))
                )].sort();
                
                uniqueKonsumen.forEach(konsumen => {
                    const option = document.createElement('option');
                    option.value = konsumen;
                    option.textContent = konsumen;
                    tokoSelect.appendChild(option);
                });
                console.log('[Invoice-Filter] ✅ Konsumen dropdown populated with', uniqueKonsumen.length, 'stores from zone:', uniqueKonsumen);
                
                // Log any supplier names that slipped through (for debugging)
                const invalidKonsumen = data
                    .map(row => row.konsumen)
                    .filter(k => k && supplierNames.includes(k.trim().toUpperCase()));
                if (invalidKonsumen.length > 0) {
                    console.warn('[Invoice-Filter] ⚠️ Found supplier names in konsumen column:', invalidKonsumen);
                }
            } else {
                console.warn('[Invoice-Filter] ⚠️ No invoices found for zona_id:', user.zona_id);
            }
        } else {
            // For super_admin/moderator: Show TOKO (supplier names)
            console.log('[Invoice-Filter] Super admin/moderator - fetching suppliers (toko column)');
            
            let { data, error } = await supabase
                .from('invoice_file_list')
                .select('toko')
                .order('toko', { ascending: true });
            
            if (error) {
                console.error('[Invoice-Filter] Error fetching toko:', error);
                return;
            }
            
            // Extract unique toko values
            if (data && data.length > 0) {
                const uniqueToko = [...new Set(
                    data
                        .map(row => row.toko)
                        .filter(t => t && t.trim().length > 0)
                )].sort();
                
                uniqueToko.forEach(toko => {
                    const option = document.createElement('option');
                    option.value = toko;
                    option.textContent = toko;
                    tokoSelect.appendChild(option);
                });
                console.log('[Invoice-Filter] ✅ Toko (supplier) dropdown populated with', uniqueToko.length, 'suppliers:', uniqueToko);
            }
        }
    } catch (err) {
        console.error('[Invoice-Filter] Error in populateTokoDropdown:', err);
    }
}

// ============================================
// Populate Year and Month Dropdowns from Database
// ============================================
async function populateYearDropdown() {
    const yearSelect = document.getElementById('filterYear');
    if (!yearSelect) {
        console.warn('[Invoice-Filter] filterYear not found');
        return;
    }
    
    try {
        // Get distinct years from database
        let { data, error } = await supabase
            .from('invoice_file_list')
            .select('tanggal');
        
        if (error) {
            console.error('[Invoice-Filter] Error fetching years:', error);
            // Fallback to static years
            const currentYear = new Date().getFullYear();
            const startYear = 2020;
            for (let year = currentYear; year >= startYear; year--) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearSelect.appendChild(option);
            }
            return;
        }
        
        // Extract unique years from dates
        const years = new Set();
        if (data) {
            data.forEach(row => {
                if (row.tanggal) {
                    const year = new Date(row.tanggal).getFullYear();
                    years.add(year);
                }
            });
        }
        
        // Sort years descending
        const sortedYears = Array.from(years).sort((a, b) => b - a);
        
        // Add to dropdown
        sortedYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });
        
        console.log('[Invoice-Filter] ✅ Year dropdown populated with years:', sortedYears);
    } catch (err) {
        console.error('[Invoice-Filter] Error in populateYearDropdown:', err);
    }
}

async function populateMonthDropdown() {
    const monthSelect = document.getElementById('filterMonth');
    if (!monthSelect) {
        console.warn('[Invoice-Filter] filterMonth not found');
        return;
    }
    
    try {
        // Get distinct months from database
        let { data, error } = await supabase
            .from('invoice_file_list')
            .select('tanggal');
        
        if (error) {
            console.error('[Invoice-Filter] Error fetching months:', error);
            // Fallback to all 12 months
            const monthNames = [
                'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
            ];
            for (let i = 1; i <= 12; i++) {
                const option = document.createElement('option');
                option.value = String(i).padStart(2, '0');
                option.textContent = monthNames[i - 1];
                monthSelect.appendChild(option);
            }
            return;
        }
        
        // Extract unique months from dates
        const months = new Set();
        if (data) {
            data.forEach(row => {
                if (row.tanggal) {
                    const month = String(new Date(row.tanggal).getMonth() + 1).padStart(2, '0');
                    months.add(month);
                }
            });
        }
        
        // Sort months numerically
        const sortedMonths = Array.from(months).sort();
        
        const monthNames = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
        ];
        
        // Add to dropdown
        sortedMonths.forEach(monthNum => {
            const option = document.createElement('option');
            option.value = monthNum;
            option.textContent = monthNames[parseInt(monthNum) - 1];
            monthSelect.appendChild(option);
        });
        
        console.log('[Invoice-Filter] ✅ Month dropdown populated with months:', sortedMonths);
    } catch (err) {
        console.error('[Invoice-Filter] Error in populateMonthDropdown:', err);
    }
}

// ============================================
// Update Filter Total
// ============================================
async function updateFilterTotal() {
    try {
        // Get all visible rows
        const rows = document.querySelectorAll('#invoiceTableBody tr');
        let total = 0;
        
        rows.forEach(row => {
            const totalCell = row.querySelector('td:nth-child(8)'); // Total column
            if (totalCell) {
                const text = totalCell.textContent.trim();
                // Extract numbers from "Rp 21,658.2" format
                const numStr = text.replace(/[^\d]/g, '');
                const num = parseInt(numStr) || 0;
                total += num;
            }
        });
        
        const totalElement = document.getElementById('filterTotal');
        if (totalElement) {
            totalElement.textContent = formatRupiah(total);
        }
    } catch (error) {
        console.error('[FilterTotal] Error:', error);
    }
}

// ============================================
// Setup Filter Event Listeners
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Invoice-Filter] Setting up filter handlers');
    console.log('[Invoice-Filter] currentUser at DOMContentLoaded:', window.currentUser);
    
    // Wait a bit for currentUser to be available
    let retries = 0;
    while (!window.currentUser && retries < 10) {
        console.log('[Invoice-Filter] Waiting for currentUser... retry', retries);
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    console.log('[Invoice-Filter] currentUser after wait:', window.currentUser);
    
    // Populate all dropdowns
    await populateTokoDropdown();
    await populateYearDropdown();
    await populateMonthDropdown();
    
    const btnApplyFilter = document.getElementById('btnApplyFilter');
    const btnResetFilter = document.getElementById('btnResetFilter');
    
    if (btnApplyFilter) {
        btnApplyFilter.addEventListener('click', async () => {
            console.log('[Invoice-Filter] Apply filter clicked');
            
            // Get filter values
            const status = document.getElementById('filterStatus')?.value || '';
            const supplier = document.getElementById('filterSupplier')?.value || '';
            const tokoFilter = document.getElementById('filterToko')?.value || '';
            const keterangan = document.getElementById('filterKeterangan')?.value || '';
            const dateFrom = document.getElementById('filterDateFrom')?.value || '';
            const dateTo = document.getElementById('filterDateTo')?.value || '';
            const search = document.getElementById('filterSearch')?.value || '';
            const year = document.getElementById('filterYear')?.value || '';
            const month = document.getElementById('filterMonth')?.value || '';
            
            // Get current user to determine filter type
            const user = getCurrentUser ? getCurrentUser() : null;
            const isAdminZona = user && user.role === 'admin_zona';
            
            // Build query
            let query = supabase.from('invoice_file_list').select('*');
            
            // Filter by zona if admin_zona
            if (isAdminZona && user.zona_id) {
                query = query.eq('zona_id', user.zona_id);
                console.log('[Invoice-Filter] Admin zona detected - filtering by zona_id:', user.zona_id);
            }
            
            if (status) query = query.eq('status', status);
            if (supplier) query = query.eq('supplier', supplier);
            
            // Handle toko filter based on role
            if (tokoFilter) {
                if (isAdminZona) {
                    // For admin_zona: filter by konsumen (actual toko name)
                    query = query.eq('konsumen', tokoFilter);
                    console.log('[Invoice-Filter] Admin zona - filtering by konsumen:', tokoFilter);
                } else {
                    // For super_admin/moderator: filter by toko (supplier name)
                    query = query.eq('toko', tokoFilter);
                    console.log('[Invoice-Filter] Super admin - filtering by toko (supplier):', tokoFilter);
                }
            }
            
            if (keterangan) query = query.eq('keterangan', keterangan);
            if (search) {
                query = query.or(`faktur.ilike.%${search}%,konsumen.ilike.%${search}%`);
            }
            if (dateFrom) {
                query = query.gte('tanggal', dateFrom);
            }
            if (dateTo) {
                query = query.lte('tanggal', dateTo);
            }
            
            // Filter by year and month if provided
            if (year || month) {
                let { data: dateData, error: dateError } = await supabase
                    .from('invoice_file_list')
                    .select('id, tanggal');
                
                if (!dateError && dateData) {
                    const filteredIds = dateData
                        .filter(row => {
                            if (!row.tanggal) return false;
                            const rowYear = new Date(row.tanggal).getFullYear().toString();
                            const rowMonth = String(new Date(row.tanggal).getMonth() + 1).padStart(2, '0');
                            
                            if (year && rowYear !== year) return false;
                            if (month && rowMonth !== month) return false;
                            
                            return true;
                        })
                        .map(row => row.id);
                    
                    if (filteredIds.length > 0) {
                        query = query.in('id', filteredIds);
                    } else {
                        query = query.eq('id', null); // Return empty result
                    }
                }
            }
            
            query = query.order('tanggal', { ascending: false }).limit(500);
            
            const { data, error } = await query;
            
            if (error) {
                console.error('[Invoice-Filter] Error:', error);
                alert('Error applying filter');
                return;
            }
            
            // Check if toko was selected but no data found
            if (tokoFilter && (!data || data.length === 0)) {
                console.warn('[Invoice-Filter] ⚠️ Toko selected but no data found:', tokoFilter);
                Swal.fire({
                    icon: 'info',
                    title: 'Tidak Ada Data',
                    text: `Tidak ada faktur untuk toko "${tokoFilter}". Silakan pilih toko lain atau upload data terlebih dahulu.`,
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#3498db'
                });
            }
            
            // Fade out animation
            const table = document.querySelector('.invoice-table');
            if (table) {
                table.style.animation = 'fadeOut 0.2s ease-out';
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            // Update data
            invoiceCurrentPage = 0;
            window.allInvoices = data || [];
            allInvoices = window.allInvoices;
            
            // Render with fade in
            if (table) {
                table.style.animation = 'fadeIn 0.3s ease-in';
            }
            renderInvoiceTable();
            updateFilterTotal();
        });
    }
    
    if (btnResetFilter) {
        btnResetFilter.addEventListener('click', async () => {
            console.log('[Invoice-Filter] Reset filter clicked');
            
            // Clear all filters
            const filterStatus = document.getElementById('filterStatus');
            const filterSupplier = document.getElementById('filterSupplier');
            const filterToko = document.getElementById('filterToko');
            const filterKeterangan = document.getElementById('filterKeterangan');
            const filterDateFrom = document.getElementById('filterDateFrom');
            const filterDateTo = document.getElementById('filterDateTo');
            const filterSearch = document.getElementById('filterSearch');
            const filterYear = document.getElementById('filterYear');
            const filterMonth = document.getElementById('filterMonth');
            
            if (filterStatus) filterStatus.value = '';
            if (filterSupplier) filterSupplier.value = '';
            if (filterToko) filterToko.value = '';
            if (filterKeterangan) filterKeterangan.value = '';
            if (filterDateFrom) filterDateFrom.value = '';
            if (filterDateTo) filterDateTo.value = '';
            if (filterSearch) filterSearch.value = '';
            if (filterYear) filterYear.value = '';
            if (filterMonth) filterMonth.value = '';
            
            // Fade out animation
            const table = document.querySelector('.invoice-table');
            if (table) {
                table.style.animation = 'fadeOut 0.2s ease-out';
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            // Reload all data
            invoiceCurrentPage = 0;
            
            // Render with fade in
            if (table) {
                table.style.animation = 'fadeIn 0.3s ease-in';
            }
            renderInvoiceTable();
            updateFilterTotal();
        });
    }
});

// ============================================
// Pagination with Fade Animation
// ============================================
window.goToNextPage = async function() {
    console.log('[Invoice-Pagination] Next page clicked');
    
    const maxPage = Math.ceil(allInvoices.length / ITEMS_PER_PAGE) - 1;
    if (invoiceCurrentPage < maxPage) {
        // Fade out
        const table = document.querySelector('.invoice-table');
        if (table) {
            table.style.animation = 'fadeOut 0.2s ease-out';
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        invoiceCurrentPage++;
        
        // Fade in
        if (table) {
            table.style.animation = 'fadeIn 0.3s ease-in';
        }
        renderInvoiceTable();
        updateFilterTotal();
        
        // Scroll to top of table
        document.querySelector('.table-container')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};

window.goToPrevPage = async function() {
    console.log('[Invoice-Pagination] Previous page clicked');
    
    if (invoiceCurrentPage > 0) {
        // Fade out
        const table = document.querySelector('.invoice-table');
        if (table) {
            table.style.animation = 'fadeOut 0.2s ease-out';
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        invoiceCurrentPage--;
        
        // Fade in
        if (table) {
            table.style.animation = 'fadeIn 0.3s ease-in';
        }
        renderInvoiceTable();
        updateFilterTotal();
        
        // Scroll to top of table
        document.querySelector('.table-container')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};

// Update total on table render
setTimeout(() => {
    updateFilterTotal();
}, 500);


// ============================================
// Auto-scroll table to show full text on truncation
// ============================================
window.autoScrollTableForTruncation = function() {
    const tableContainer = document.querySelector('.table-container');
    const rows = document.querySelectorAll('#invoiceTableBody tr');
    
    if (!tableContainer || rows.length === 0) return;
    
    // Find cells with truncated text
    let needsScroll = false;
    let scrollPosition = 0;
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
            // Check if text is truncated (offsetWidth < scrollWidth)
            if (cell.offsetWidth < cell.scrollWidth) {
                needsScroll = true;
                // Calculate scroll position to show this cell
                const cellLeft = cell.offsetLeft;
                const cellWidth = cell.offsetWidth;
                const containerWidth = tableContainer.offsetWidth;
                
                // Position cell in middle of visible area
                scrollPosition = Math.max(scrollPosition, cellLeft - containerWidth / 3);
            }
        });
    });
    
    // Auto-scroll if truncation detected
    if (needsScroll && scrollPosition > 0) {
        setTimeout(() => {
            tableContainer.scrollLeft = scrollPosition;
        }, 100);
    }
};

// Call on table render
document.addEventListener('DOMContentLoaded', () => {
    // Observe table changes and auto-scroll
    const observer = new MutationObserver(() => {
        setTimeout(autoScrollTableForTruncation, 200);
    });
    
    const tableBody = document.getElementById('invoiceTableBody');
    if (tableBody) {
        observer.observe(tableBody, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }
});

// Also call after render functions
const originalRenderInvoiceTable = window.renderInvoiceTable;
window.renderInvoiceTable = function(...args) {
    originalRenderInvoiceTable.apply(this, args);
    setTimeout(autoScrollTableForTruncation, 300);
};


// ============================================
// NEW: Download and Combine Functions
// ============================================

/**
 * Download individual file (invoice, bukti_bayar, or faktur_pajak)
 */
window.downloadInvoiceFile = async function(faktur, fileType) {
    try {
        console.log(`[Download] Downloading ${fileType} for faktur: ${faktur}`);
        
        const response = await fetch(`/api/invoice/download-file/${faktur}/${fileType}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API.getToken()}`
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Download failed');
        }
        
        // Get filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `${faktur}_${fileType}.pdf`;
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        
        // Download file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        if (window.Toast) {
            Toast.success(`File ${filename} berhasil didownload`);
        }
        
        console.log(`[Download] ✅ Downloaded: ${filename}`);
        
    } catch (error) {
        console.error('[Download] Error:', error);
        if (window.Toast) {
            Toast.error(`Download failed: ${error.message}`);
        } else {
            alert(`Download failed: ${error.message}`);
        }
    }
};

/**
 * Combine all uploaded PDFs into one and download
 */
window.combinePDF = async function(faktur) {
    try {
        console.log(`[Combine] Combining PDFs for faktur: ${faktur}`);
        
        if (window.Toast) {
            Toast.info('Combining PDFs... Please wait...');
        }
        
        const response = await fetch(`/api/invoice/combine-pdf/${faktur}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API.getToken()}`
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Combine failed');
        }
        
        // Get filename from response (should be {faktur}.pdf)
        const filename = `${faktur}.pdf`;
        
        // Download combined file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        if (window.Toast) {
            Toast.success(`Combined PDF ${filename} berhasil didownload`);
        }
        
        console.log(`[Combine] ✅ Combined and downloaded: ${filename}`);
        
    } catch (error) {
        console.error('[Combine] Error:', error);
        if (window.Toast) {
            Toast.error(`Combine failed: ${error.message}`);
        } else {
            alert(`Combine failed: ${error.message}`);
        }
    }
};

/**
 * Show download menu popup for invoice
 * Displays SweetAlert2 modal with download options
 * Includes delete button for moderators only
 */
window.showInvoiceDownloadMenu = function(faktur, invoiceId) {
    try {
        // Find invoice in global allInvoices array
        const invoice = allInvoices?.find(inv => inv.faktur === faktur);
        
        if (!invoice) {
            if (window.Swal) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Data invoice tidak ditemukan',
                    confirmButtonColor: '#e74c3c'
                });
            } else {
                alert('Invoice data not found');
            }
            return;
        }
        
        // Get current user role to check if moderator
        const currentUser = typeof window.currentUser !== 'undefined' ? window.currentUser : null;
        const isModerator = currentUser && (currentUser.role === 'moderator' || currentUser.role === 'super_admin');
        
        // Build popup menu HTML
        let menuHTML = `<div style="display: flex; flex-direction: column; gap: 10px; text-align: left;">`;
        
        // Show invoice download button if file exists
        if (invoice.invoice_pdf_path) {
            menuHTML += `<button onclick="downloadInvoiceFile('${faktur}', 'invoice'); if(window.Swal) Swal.close();" style="width: 100%; padding: 12px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s;" onmouseover="this.style.background='#2980b9'" onmouseout="this.style.background='#3498db'">
                📄 Download Invoice
            </button>`;
        }
        
        // Show bukti bayar download button if file exists
        if (invoice.bukti_bayar_path) {
            menuHTML += `<button onclick="downloadInvoiceFile('${faktur}', 'bukti_bayar'); if(window.Swal) Swal.close();" style="width: 100%; padding: 12px; background: #27ae60; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s;" onmouseover="this.style.background='#229954'" onmouseout="this.style.background='#27ae60'">
                💰 Download Bukti Bayar
            </button>`;
        }
        
        // Show faktur pajak download button if file exists
        if (invoice.faktur_pajak_path) {
            menuHTML += `<button onclick="downloadInvoiceFile('${faktur}', 'faktur_pajak'); if(window.Swal) Swal.close();" style="width: 100%; padding: 12px; background: #9b59b6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s;" onmouseover="this.style.background='#8e44ad'" onmouseout="this.style.background='#9b59b6'">
                📋 Download Faktur Pajak
            </button>`;
        }
        
        // Show combine button if all files are uploaded
        const isPPN = invoice.keterangan && invoice.keterangan.toUpperCase() === 'PPN';
        const filesRequired = isPPN ? 3 : 2;
        const filesUploaded = (invoice.invoice_pdf_path ? 1 : 0) + (invoice.bukti_bayar_path ? 1 : 0) + (invoice.faktur_pajak_path ? 1 : 0);
        
        if (filesUploaded >= filesRequired) {
            menuHTML += `<button onclick="combinePDF('${faktur}'); if(window.Swal) Swal.close();" style="width: 100%; padding: 12px; background: #e67e22; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s;" onmouseover="this.style.background='#d35400'" onmouseout="this.style.background='#e67e22'">
                📦 Combine PDF (${filesUploaded}/${filesRequired})
            </button>`;
        }
        
        // Show delete button only for moderators
        if (isModerator) {
            menuHTML += `<div style="border-top: 1px solid #ddd; margin-top: 10px; padding-top: 10px;"></div>`;
            menuHTML += `<button onclick="deleteInvoice('${faktur}', '${invoiceId}'); if(window.Swal) Swal.close();" style="width: 100%; padding: 12px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s;" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='#e74c3c'">
                🗑️ Hapus Invoice
            </button>`;
        }
        
        menuHTML += `</div>`;
        
        // Show SweetAlert2 popup if available
        if (window.Swal) {
            Swal.fire({
                title: '📥 Download Files',
                html: menuHTML,
                icon: 'info',
                showConfirmButton: false,
                background: '#f8f9fa',
                customClass: {
                    popup: 'download-menu-popup'
                },
                allowOutsideClick: true,
                allowEscapeKey: true
            });
        } else {
            alert('SweetAlert2 not available');
        }
        
    } catch (error) {
        console.error('[Menu] Error:', error);
        if (window.Swal) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Gagal memuat menu download',
                confirmButtonColor: '#e74c3c'
            });
        } else {
            alert(`Error: ${error.message}`);
        }
    }
};
