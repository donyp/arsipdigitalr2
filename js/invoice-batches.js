// ============================================================
// Invoice Batches Management
// View and delete Excel upload batches
// ============================================================

const tableBody = document.getElementById('batchesTableBody');
const emptyState = document.getElementById('emptyState');
const loadingOverlay = document.getElementById('loadingOverlay');

// ============================================
// Initialize
// ============================================
async function init() {
    // Check authentication
    if (!isAuthenticated()) {
        window.location.href = '/index';
        return;
    }

    // Check role (super_admin or moderator only)
    const user = getUserData();
    if (!user || (user.role !== 'super_admin' && user.role !== 'moderator')) {
        if (typeof Toast !== 'undefined') {
            Toast.error('Akses ditolak. Hanya Super Admin dan Moderator yang dapat mengelola batch.');
        } else {
            alert('Akses ditolak. Hanya Super Admin dan Moderator yang dapat mengelola batch.');
        }
        window.location.href = '/invoice-list';
        return;
    }

    await loadBatches();
}

// ============================================
// Load Batches
// ============================================
async function loadBatches() {
    showLoading();

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/batches?limit=100&offset=0`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) throw new Error('Failed to load batches');

        const result = await response.json();
        renderTable(result.data || []);

    } catch (error) {
        console.error('Error loading batches:', error);
        if (typeof Toast !== 'undefined') {
            Toast.error('Gagal memuat riwayat upload', '❌ Error');
        } else {
            alert('Gagal memuat riwayat upload');
        }
    } finally {
        hideLoading();
    }
}

// ============================================
// Render Table
// ============================================
function renderTable(batches) {
    if (batches.length === 0) {
        tableBody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    tableBody.innerHTML = batches.map(batch => {
        const statusClass = batch.status.toLowerCase().replace(/_/g, '-');
        const createdAt = formatDateTime(batch.created_at);
        const uploader = batch.uploader ? batch.uploader.name : 'Unknown';

        return `
            <tr>
                <td>${createdAt}</td>
                <td>
                    <strong>${batch.filename}</strong>
                </td>
                <td>
                    <span class="status-badge ${statusClass}">${batch.status}</span>
                </td>
                <td>
                    <div class="batch-stats">
                        <span>Total: <strong>${batch.total_rows || 0}</strong></span>
                        <span class="success">Berhasil: ${batch.processed_rows || 0}</span>
                        ${batch.duplicate_rows > 0 ? `<span class="duplicate">Duplikat: ${batch.duplicate_rows}</span>` : ''}
                        ${batch.failed_rows > 0 ? `<span class="error">Gagal: ${batch.failed_rows}</span>` : ''}
                    </div>
                </td>
                <td>${uploader}</td>
                <td>
                    <button class="btn-view-invoices" onclick="viewBatchInvoices('${batch.id}')">
                        <i class="fas fa-list"></i> Lihat Invoice
                    </button>
                    <button class="btn-delete-batch" onclick="deleteBatch('${batch.id}', '${batch.filename}', ${batch.processed_rows})">
                        <i class="fas fa-trash"></i> Hapus
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// View Batch Invoices
// ============================================
function viewBatchInvoices(batchId) {
    // Redirect to invoice list with batch filter
    window.location.href = `/invoice-list?batch=${batchId}`;
}

// ============================================
// Delete Batch
// ============================================
async function deleteBatch(batchId, filename, invoiceCount) {
    const confirmation = confirm(
        `⚠️ PERINGATAN!\n\n` +
        `Anda akan menghapus batch: "${filename}"\n` +
        `Jumlah invoice yang akan dihapus: ${invoiceCount}\n\n` +
        `Aksi ini TIDAK DAPAT DIBATALKAN!\n\n` +
        `Apakah Anda yakin?`
    );

    if (!confirmation) return;

    // Double confirmation
    const doubleConfirm = confirm(
        `Konfirmasi terakhir!\n\n` +
        `${invoiceCount} invoice akan dihapus permanen.\n\n` +
        `Lanjutkan?`
    );

    if (!doubleConfirm) return;

    showLoading();

    try {
        const response = await fetch(`/api/invoice/batch/${batchId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }

        const result = await response.json();

        alert(
            `✅ Batch berhasil dihapus!\n\n` +
            `File: ${result.batchFilename}\n` +
            `Invoice dihapus: ${result.deletedCount}`
        );

        // Reload batches
        await loadBatches();

    } catch (error) {
        console.error('Delete error:', error);
        alert(`❌ Gagal menghapus batch: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// ============================================
// Utility Functions
// ============================================
function formatDateTime(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function showLoading() {
    loadingOverlay.classList.add('visible');
}

function hideLoading() {
    loadingOverlay.classList.remove('visible');
}

// ============================================
// Initialize on load
// ============================================
document.addEventListener('DOMContentLoaded', init);

// Make functions globally accessible
window.viewBatchInvoices = viewBatchInvoices;
window.deleteBatch = deleteBatch;
