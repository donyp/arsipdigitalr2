// ============================================
// Upload Excel Flow
// ============================================

let currentFile = null;
let parsedData = null;

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
    console.log('[Upload] File selected:', file.name);
    
    // Strict validation: Extension check
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'xlsx') {
        Toast.error('❌ Format file tidak valid', 'Hanya file Microsoft Excel Worksheet (.xlsx) yang diizinkan.\n\nFile lain seperti .xls, .csv, atau format lain tidak didukung.');
        return;
    }

    // MIME type check
    const validMimeTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (!validMimeTypes.includes(file.type)) {
        Toast.warning('⚠️ MIME type tidak standard', `File type: ${file.type || 'unknown'}\n\nSistem masih akan mencoba memproses file ini.`);
        // Continue anyway - MIME type might not be set correctly on some systems
    }

    // Size check
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        Toast.error('❌ File terlalu besar', `Ukuran file: ${(file.size / 1024 / 1024).toFixed(2)}MB\n\nMaksimal ukuran file: 10MB`);
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

    console.log('[Upload] Checking data...');
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

        // Transform and aggregate
        let invoices = parsed.map(row => {
            // Normalize toko values
            let tokoRaw = (row['TOKO'] || row['toko'] || '').trim();
            let tokoValue = tokoRaw.toUpperCase();
            
            console.log('[Upload] Raw toko:', tokoRaw, '-> Uppercase:', tokoValue);
            
            // Map all toko variations to their normalized names
            if (tokoValue.includes('PEMALANG')) {
                tokoValue = 'ANKA PEMALANG';
            } else if (tokoValue.includes('ANKA')) {
                tokoValue = 'ANKA BEKASI';
            } else if (tokoValue === '' || !tokoValue) {
                // DEFAULT: If empty or invalid, default to ANKA BEKASI
                console.warn('[Upload] Empty toko detected, defaulting to ANKA BEKASI');
                tokoValue = 'ANKA BEKASI';
            } else {
                // Any other value that doesn't contain ANKA/PEMALANG, keep as is
                tokoValue = tokoRaw;
            }
            
            console.log('[Upload] Final toko:', tokoValue);
            
            return {
                tanggal: row['TANGGAL'] || row['tanggal'],
                toko: tokoValue,
                faktur: row['FAKTUR'] || row['faktur'],
                metode_bayar: row['METODE BAYAR'] || row['metode_bayar'],
                jenis_transaksi: row['JENIS TRANSAKSI'] || row['jenis_transaksi'],
                konsumen: row['KONSUMEN'] || row['konsumen'],
                total_jumlah_jual: parseFloat(row['JUMLAH JUAL'] || row['jumlah_jual'] || 0),
                keterangan: row['KET 2'] || row['ket_2'] || 'NON PPN'
            };
        }).filter(inv => inv.faktur);

        // Aggregate by faktur
        const aggregated = {};
        invoices.forEach(inv => {
            if (aggregated[inv.faktur]) {
                aggregated[inv.faktur].total_jumlah_jual += inv.total_jumlah_jual;
                aggregated[inv.faktur].item_count = (aggregated[inv.faktur].item_count || 1) + 1;
            } else {
                aggregated[inv.faktur] = { ...inv, item_count: 1 };
            }
        });

        parsedData = Object.values(aggregated);
        console.log('[Upload] Parsed:', parsedData.length, 'unique fakturs from', parsed.length, 'total rows');

        // ============================================
        // NEW: Check for duplicates BEFORE showing validation
        // ============================================
        console.log('[Upload] Checking for duplicate fakturs...');
        const fakturs = parsedData.map(item => item.faktur).filter(Boolean);
        
        const token = API.getToken() || localStorage.getItem('jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const checkDupResponse = await fetch(`${CONFIG.API_URL}/api/invoice/check-duplicate-fakturs`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ fakturs: fakturs })
        });

        const dupResult = await checkDupResponse.json();
        console.log('[Upload] Duplicate check result:', dupResult);

        if (!checkDupResponse.ok) {
            console.error('[Upload] Duplicate check failed:', dupResult);
            throw new Error(dupResult.details || 'Gagal memeriksa duplikat');
        }

        if (checkDupResponse.ok && dupResult.hasDuplicates) {
            // Found duplicates - show error and reject
            const dupCount = dupResult.duplicateCount;
            const dupList = dupResult.duplicates.slice(0, 10).join(', ');
            const message = dupCount > 10 
                ? `${dupCount} fakturs sudah ada di database:\n${dupList}... dan ${dupCount - 10} lainnya`
                : `${dupCount} fakturs sudah ada di database:\n${dupList}`;
            
            Toast.error(message, `❌ File Excel Sudah Pernah Diupload`);
            console.log('[Upload] ⚠️ Validation rejected due to duplicates');
            
            // Reset to step 1
            resetUpload();
            return;
        }

        console.log('[Upload] ✅ No duplicates found - proceeding with validation');

        // Show validation results
        document.getElementById('totalRows').textContent = parsed.length;
        document.getElementById('uniqueFakturs').textContent = parsedData.length;
        document.getElementById('loadingValidation').style.display = 'none';
        document.getElementById('validationResult').style.display = 'block';

    } catch (error) {
        console.error('[Upload] Error:', error);
        Toast.error(error.message, '❌ Upload Error');
        resetUpload();
    }
}

function showPreview() {
    if (!parsedData) return;

    console.log('[Upload] Showing preview...');
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
    
    // Show loading spinner with animated text
    btnUpload.innerHTML = '<span class="loading-spinner"></span><span class="loading-text">Uploading...</span>';

    try {
        console.log('[Upload] Uploading', parsedData.length, 'invoices...');

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
        console.log('[Upload] Response:', result);

        if (response.ok && result.success) {
            const processed = result.summary?.processed || 0;
            document.getElementById('uploadedCount').textContent = processed;
            
            document.getElementById('card3').style.display = 'none';
            document.getElementById('card4').style.display = 'block';
            updateStep(4);

            if (typeof Toast !== 'undefined') {
                Toast.success(`✅ ${processed} file Excel berhasil diupload!`);
            }
            console.log('[Upload] ✅ Success!');
        } else {
            Toast.error(result.error || 'Upload failed', '❌ Upload Error');
            btnUpload.disabled = false;
            btnUpload.textContent = originalText;
        }
    } catch (error) {
        console.error('[Upload] Exception:', error);
        Toast.error(error.message, '❌ Upload Error');
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
        console.log('[WhatsApp] Generating messages for', invoices.length, 'invoices, batch:', batchId);

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
        console.log('[WhatsApp] Generate result:', result);

        if (response.ok && result.success) {
            whatsappNotifications = result.notifications;
            displayWhatsappNotifications();
            return true;
        } else {
            console.error('[WhatsApp] Generation failed:', result);
            return false;
        }
    } catch (error) {
        console.error('[WhatsApp] Error generating messages:', error);
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
        console.warn('[WhatsApp] UI elements not found');
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
        zonaLabel.textContent = `📍 ${notif.zona_name} (${notif.invoice_count} invoice)`;

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
        copyButton.textContent = '📋 Salin Pesan';
        copyButton.onmouseover = () => copyButton.style.background = '#1fa857';
        copyButton.onmouseout = () => copyButton.style.background = '#25d366';
        copyButton.onclick = () => copyToClipboard(notif.message, notif.zona_name, copyButton);

        messageCard.appendChild(zonaLabel);
        messageCard.appendChild(messageText);
        messageCard.appendChild(copyButton);
        container.appendChild(messageCard);
    });

    panel.style.display = 'block';
    console.log('[WhatsApp] ✅ Displayed', whatsappNotifications.length, 'messages');
}

/**
 * Copy message to clipboard
 */
async function copyToClipboard(message, zonaName, buttonElement) {
    try {
        await navigator.clipboard.writeText(message);
        
        // Show feedback
        const originalText = buttonElement.textContent;
        buttonElement.textContent = '✅ Sudah Disalin!';
        buttonElement.style.background = '#27ae60';
        
        setTimeout(() => {
            buttonElement.textContent = originalText;
            buttonElement.style.background = '#25d366';
        }, 2000);

        console.log('[WhatsApp] ✅ Copied to clipboard:', zonaName);
        
        // Show toast
        if (typeof Toast !== 'undefined') {
            Toast.success(`Pesan untuk zona ${zonaName} sudah disalin!`);
        }
    } catch (error) {
        console.error('[WhatsApp] Copy failed:', error);
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
        console.log('[WhatsApp] Marking batch', currentBatchId, 'as sent');

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
        console.log('[WhatsApp] Mark-sent result:', result);

        if (response.ok && result.success) {
            // Hide panel
            document.getElementById('whatsappPanel').style.display = 'none';
            
            if (typeof Toast !== 'undefined') {
                Toast.success('Semua pesan sudah ditandai sebagai terkirim!', '✅ Sukses');
            }

            console.log('[WhatsApp] ✅ All messages marked as sent');
        } else {
            if (typeof Toast !== 'undefined') {
                Toast.error(result.error || 'Gagal menandai sebagai terkirim');
            }
        }
    } catch (error) {
        console.error('[WhatsApp] Error marking as sent:', error);
        if (typeof Toast !== 'undefined') {
            Toast.error('Error: ' + error.message);
        }
    }
}
