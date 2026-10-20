// ============================================
// Upload Excel Flow
// ============================================

let currentFile = null;
let parsedData = null;
// Jumlah transaksi RETUR yang dilewati pada parsing terakhir
let lastSkippedReturs = 0;

// Step 1: File Selection
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const btnCheck = document.getElementById('btnCheck');
    const btnBack1 = document.getElementById('btnBack1');
    const btnPreview = document.getElementById('btnPreview');
    const btnBack2 = document.getElementById('btnBack2');
    const btnUpload = document.getElementById('btnUpload');

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelected(e.dataTransfer.files[0]);
        }
    });

    // Click to select
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelected(e.target.files[0]);
        }
    });

    // Button handlers
    btnCheck.addEventListener('click', () => checkData());
    btnBack1.addEventListener('click', () => resetUpload());
    btnPreview.addEventListener('click', () => showPreview());
    btnBack2.addEventListener('click', () => goToValidation());
    btnUpload.addEventListener('click', () => uploadData());
});

function handleFileSelected(file) {
    // Strict validation: Extension check
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'xlsx') {
        Toast.error('G�� Format file tidak valid', 'Hanya file Microsoft Excel Worksheet (.xlsx) yang diizinkan.\n\nFile lain seperti .xls, .csv, atau format lain tidak didukung.');
        return;
    }

    // MIME type check
    const validMimeTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (!validMimeTypes.includes(file.type)) {
        Toast.warning('G��n+� MIME type tidak standard', `File type: ${file.type || 'unknown'}\n\nSistem masih akan mencoba memproses file ini.`);
        // Continue anyway - MIME type might not be set correctly on some systems
    }

    // Size check
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        Toast.error('G�� File terlalu besar', `Ukuran file: ${(file.size / 1024 / 1024).toFixed(2)}MB\n\nMaksimal ukuran file: 10MB`);
        return;
    }

    currentFile = file;

    // Show file info
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    document.getElementById('fileInfo').style.display = 'block';

    // Enable check button
    document.getElementById('btnCheck').disabled = false;
}

async function checkData() {
    if (!currentFile) return;
    document.getElementById('card1').style.display = 'none';
    document.getElementById('card2').style.display = 'block';
    document.getElementById('loadingValidation').style.display = 'block';
    updateStep(2);

    try {
        const arrayBuffer = await currentFile.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        
        // Find REKAP LABA sheet
        let sheetName = workbook.SheetNames.find(name => name.includes('REKAP')) || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Get raw data to find header
        const rawData = XLSX.utils.sheet_to_json(worksheet, { 
            defval: null, 
            blankrows: false,
            header: 1
        });

        // Find header row
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(10, rawData.length); i++) {
            const row = rawData[i];
            if (Array.isArray(row) && row.some(cell => cell && cell.toString().includes('TANGGAL'))) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            throw new Error('Header row tidak ditemukan');
        }

        // Parse with correct header
        const parsed = XLSX.utils.sheet_to_json(worksheet, { 
            defval: null, 
            blankrows: false,
            range: headerRowIndex
        });

        if (parsed.length === 0) {
            throw new Error('File Excel kosong atau tidak memiliki data');
        }

        // ============================================================
        // Transform + agregasi (utilitas BERSAMA dengan server)
        // ============================================================
        // Memakai ExcelUtils supaya tanggal/nominal/toko/retur TIDAK lagi
        // berbeda antara browser & server (penyebab utama data rusak).
        const mapped = parsed.map(row => ({
            tanggal: ExcelUtils.normalizeExcelDate(row['TANGGAL'] || row['tanggal']),
            toko: ExcelUtils.normalizeTokoValue(row['TOKO'] || row['toko']),
            faktur: row['FAKTUR'] || row['faktur'],
            metode_bayar: row['METODE BAYAR'] || row['metode_bayar'],
            jenis_transaksi: row['JENIS TRANSAKSI'] || row['jenis_transaksi'],
            konsumen: row['KONSUMEN'] || row['konsumen'],
            total_jumlah_jual: row['JUMLAH JUAL'] || row['jumlah_jual'] || 0,
            keterangan: row['KET 2'] || row['ket_2'] || 'NON PPN'
        }));
        
        // Aggregate by faktur + filter retur (1 implementasi, dipakai server juga)
        const aggregation = ExcelUtils.aggregateByFaktur(mapped);
        const skippedReturs = aggregation.skippedReturs;
        lastSkippedReturs = skippedReturs;
        parsedData = aggregation.data;
        
        // ============================================================
        // Cek duplikat ke database SEBELUM upload (C3)
        // ============================================================
        let duplicateFakturs = [];
        try {
            const token = (typeof API !== 'undefined' && API.getToken)
                ? API.getToken()
                : (localStorage.getItem('jwt_token') || localStorage.getItem('access_token'));
            
            const fakturs = parsedData.map(inv => inv.faktur).filter(Boolean);
            const CHECK_CHUNK = 500;
            
            for (let i = 0; i < fakturs.length; i += CHECK_CHUNK) {
                const chunk = fakturs.slice(i, i + CHECK_CHUNK);
                const dupRes = await fetch(`${CONFIG.API_URL}/api/invoice/check-duplicate-fakturs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ fakturs: chunk })
                });
                
                if (dupRes.ok) {
                    const dupJson = await dupRes.json();
                    if (dupJson && Array.isArray(dupJson.duplicates)) {
                        duplicateFakturs = duplicateFakturs.concat(dupJson.duplicates);
                    }
                }
            }
        } catch (dupErr) {
            console.warn('[UploadExcel] Cek duplikat gagal (lanjut):', dupErr.message);
        }
        
        // Tampilkan jumlah faktur yang sudah ada
        const duplicateInfo = document.getElementById('duplicateInfo');
        const duplicateCountBadge = document.getElementById('duplicateCountBadge');
        if (duplicateFakturs.length > 0) {
            if (duplicateInfo) duplicateInfo.style.display = 'block';
            if (duplicateCountBadge) duplicateCountBadge.textContent = duplicateFakturs.length;
        } else if (duplicateInfo) {
            duplicateInfo.style.display = 'none';
        }
        
        // Show validation results - display skipped returs
        document.getElementById('totalRows').textContent = parsed.length;
        document.getElementById('uniqueFakturs').textContent = parsedData.length;
        
        // Show skipped returs in validation if any
        const skippedReturValidation = document.getElementById('skippedReturValidation');
        const skippedReturBadge = document.getElementById('skippedReturCountBadge');
        if (skippedReturs > 0) {
            if (skippedReturValidation) {
                if (skippedReturBadge) {
                    skippedReturBadge.textContent = skippedReturs;
                }
                skippedReturValidation.style.display = 'block';
            }
        } else {
            if (skippedReturValidation) {
                skippedReturValidation.style.display = 'none';
            }
        }
        
        document.getElementById('loadingValidation').style.display = 'none';
        document.getElementById('validationResult').style.display = 'block';

    } catch (error) {
        Toast.error(error.message, 'G�� Upload Error');
        resetUpload();
    }
}

function showPreview() {
    if (!parsedData) return;
    document.getElementById('card2').style.display = 'none';
    document.getElementById('card3').style.display = 'block';
    updateStep(3);

    // Show first 5 items
    const preview = parsedData.slice(0, 5);
    const tbody = document.getElementById('previewTable');
    if (!tbody) return;
    
    // Render preview immediately
    tbody.innerHTML = preview.map(inv => `
        <tr>
            <td>${inv.tanggal || '-'}</td>
            <td><strong>${inv.faktur || '-'}</strong></td>
            <td>${inv.konsumen || '-'}</td>
            <td>${inv.toko || '-'}</td>
            <td>Rp ${parseInt(inv.total_jumlah_jual).toLocaleString('id-ID')}</td>
            <td>${inv.keterangan || '-'}</td>
        </tr>
    `).join('');
}

function goToValidation() {
    document.getElementById('card3').style.display = 'none';
    document.getElementById('card2').style.display = 'block';
    updateStep(2);
}

async function uploadData() {
    if (!parsedData || parsedData.length === 0) return;

    const btnUpload = document.getElementById('btnUpload');
    const originalText = btnUpload.textContent;
    btnUpload.disabled = true;
    
    // Show loading spinner with animated text (using inline styles)
    btnUpload.innerHTML = '<span style="display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 6px;"></span>Mengupload...';

    try {
        const token = API.getToken() || localStorage.getItem('jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // ============================================
        // Upload data (duplicate check already done in checkData)
        // ============================================
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/upload-excel-data`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                filename: currentFile.name,
                data: parsedData
            })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            const summary = result.summary || {};
            const processed = summary.processed || 0;
            const duplicates = summary.duplicates || 0;
            const failed = summary.failed || 0;
            const rejected = summary.rejected || 0;
            
            document.getElementById('uploadedCount').textContent = processed;
            
            if (lastSkippedReturs > 0) {
                document.getElementById('skippedReturCount').textContent = lastSkippedReturs + ' transaksi diabaikan';
                document.getElementById('skippedReturInfo').style.display = 'block';
            }
            
            // Laporan rinci: duplikat, baris ditolak, dan error
            const parts = [];
            if (processed > 0) parts.push(processed + ' invoice baru');
            if (duplicates > 0) parts.push(duplicates + ' sudah ada (tidak diupload ulang)');
            if (rejected > 0) parts.push(rejected + ' baris ditolak (tidak valid)');
            if (failed > 0) parts.push(failed + ' baris gagal disimpan');
            
            const rejectedRows = summary.rejectedRows || [];
            if (rejectedRows.length > 0) {
                const sample = rejectedRows.slice(0, 5)
                    .map(r => `${r.faktur || '-'} (${r.reason || 'tidak valid'})`)
                    .join('\n');
                console.warn('[UploadExcel] Baris ditolak:\n' + sample);
            }
            
            document.getElementById('card3').style.display = 'none';
            document.getElementById('card4').style.display = 'block';
            updateStep(4);

            if (typeof Toast !== 'undefined') {
                const msg = parts.length > 0 ? parts.join(', ') + '!' : 'Tidak ada data baru yang diupload';
                if (rejected > 0 || failed > 0) {
                    Toast.warning(msg, rejected > 0 || failed > 0 ? '⚠️ Sebagian Data' : 'Info');
                } else {
                    Toast.success(msg);
                }
            }
        } else {
            Toast.error(result.error || 'Upload failed', 'Upload Error');
            btnUpload.disabled = false;
            btnUpload.textContent = originalText;
        }
    } catch (error) {
        Toast.error(error.message, 'G�� Upload Error');
        btnUpload.disabled = false;
        btnUpload.textContent = originalText;
    }
}

function resetUpload() {
    currentFile = null;
    parsedData = null;

    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').style.display = 'none';  // Changed from .classList.remove to .style.display
    document.getElementById('fileInfo').classList.remove('show');
    document.getElementById('btnCheck').disabled = true;

    // Clear file info content
    document.getElementById('fileName').textContent = '';
    document.getElementById('fileSize').textContent = '';

    document.getElementById('card1').style.display = 'block';
    document.getElementById('card2').style.display = 'none';
    document.getElementById('card3').style.display = 'none';
    document.getElementById('card4').style.display = 'none';

    updateStep(1);
}

function goToDashboard() {
    // Redirect to main dashboard
    window.location.href = '/dashboard';
}

function updateStep(activeStep) {
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`step${i}`);
        if (i < activeStep) {
            step.classList.add('completed');
            step.classList.remove('active');
        } else if (i === activeStep) {
            step.classList.add('active');
            step.classList.remove('completed');
        } else {
            step.classList.remove('active', 'completed');
        }
    }
}

// ============================================================
// WhatsApp Notification Functions
// ============================================================

let currentBatchId = null;
let whatsappNotifications = [];

/**
 * Generate WhatsApp messages after successful upload
 * Called automatically after upload success
 */
async function generateWhatsappMessages(invoices, batchId) {
    try {
        currentBatchId = batchId;

        const token = API.getToken() || localStorage.getItem('jwt_token');
        const headers = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        // Call backend to generate messages
        const response = await fetch(`${CONFIG.API_URL}/api/whatsapp/generate-messages`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                invoices: invoices,
                batchId: batchId
            })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            whatsappNotifications = result.notifications;
            displayWhatsappNotifications();
            return true;
        } else {
            return false;
        }
    } catch (error) {
        return false;
    }
}

/**
 * Display WhatsApp notifications in UI
 */
function displayWhatsappNotifications() {
    const panel = document.getElementById('whatsappPanel');
    const container = document.getElementById('whatsappMessagesContainer');

    if (!panel || !container) {
        return;
    }

    // Clear container
    container.innerHTML = '';

    if (whatsappNotifications.length === 0) {
        panel.style.display = 'none';
        return;
    }

    // Create message card for each zona
    whatsappNotifications.forEach((notif, index) => {
        const messageCard = document.createElement('div');
        messageCard.style.cssText = `
            background: white;
            border: 1px solid #bdc3c7;
            border-radius: 6px;
            padding: 12px;
            position: relative;
        `;

        const zonaLabel = document.createElement('div');
        zonaLabel.style.cssText = `
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 8px;
            font-size: 13px;
        `;
        zonaLabel.textContent = `=��� ${notif.zona_name} (${notif.invoice_count} invoice)`;

        const messageText = document.createElement('div');
        messageText.style.cssText = `
            background: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 150px;
            overflow-y: auto;
            border-left: 3px solid #25d366;
            font-family: 'Courier New', monospace;
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
            transition: all 0.2s;
        `;
        copyButton.textContent = '=��� Salin Pesan';
        copyButton.onmouseover = () => copyButton.style.background = '#1fa857';
        copyButton.onmouseout = () => copyButton.style.background = '#25d366';
        copyButton.onclick = () => copyToClipboard(notif.message, notif.zona_name, copyButton);

        messageCard.appendChild(zonaLabel);
        messageCard.appendChild(messageText);
        messageCard.appendChild(copyButton);
        container.appendChild(messageCard);
    });

    panel.style.display = 'block';
}

/**
 * Copy message to clipboard
 */
async function copyToClipboard(message, zonaName, buttonElement) {
    try {
        await navigator.clipboard.writeText(message);
        
        // Show feedback
        const originalText = buttonElement.textContent;
        buttonElement.textContent = 'G�� Sudah Disalin!';
        buttonElement.style.background = '#27ae60';
        
        setTimeout(() => {
            buttonElement.textContent = originalText;
            buttonElement.style.background = '#25d366';
        }, 2000);
        // Show toast
        if (typeof Toast !== 'undefined') {
            Toast.success(`Pesan untuk zona ${zonaName} sudah disalin!`);
        }
    } catch (error) {
        if (typeof Toast !== 'undefined') {
            Toast.error('Gagal menyalin pesan');
        }
    }
}

/**
 * Mark all WhatsApp messages as sent
 */
async function markAllWhatsappAsSent() {
    try {
        const token = API.getToken() || localStorage.getItem('jwt_token');
        const headers = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch(`${CONFIG.API_URL}/api/whatsapp/mark-batch-sent`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                batchId: currentBatchId
            })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            // Hide panel
            document.getElementById('whatsappPanel').style.display = 'none';
            
            if (typeof Toast !== 'undefined') {
                Toast.success('Semua pesan sudah ditandai sebagai terkirim!', 'G�� Sukses');
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
