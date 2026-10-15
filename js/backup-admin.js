/**
 * Backup Admin Dashboard JavaScript
 * 
 * Manages:
 * - Backup history view
 * - Manual backup triggers
 * - Backup restoration
 * - Configuration management
 */

const API_BASE = '/api';
let currentBackupData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('[BackupAdmin] Initializing backup dashboard...');
    console.log('[BackupAdmin] Sidebar element exists:', !!document.getElementById('sidebar'));
    console.log('[BackupAdmin] Container exists:', !!document.getElementById('alertContainer'));
    
    // Load initial data
    refreshData();

    // Setup refresh interval (every 5 minutes)
    setInterval(refreshData, 5 * 60 * 1000);
});

// Also check on window load for safety
window.addEventListener('load', () => {
    console.log('[BackupAdmin] Window load event');
    console.log('[BackupAdmin] Sidebar rendered:', !!document.querySelector('.sidebar-container'));
});

/**
 * Refresh all data
 */
async function refreshData() {
    console.log('[BackupAdmin] Refreshing data...');
    
    await Promise.all([
        loadBackupStats(),
        loadBackupHistory(),
        loadBackupConfig()
    ]);
}

/**
 * Load and display backup statistics
 */
async function loadBackupStats() {
    try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`${API_BASE}/backups/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load stats');

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        const { data } = result;

        // Update stat cards
        document.getElementById('totalBackups').textContent = data.total;
        document.getElementById('successCount').textContent = data.byStatus.success || 0;
        document.getElementById('failedCount').textContent = data.byStatus.failed || 0;

        document.getElementById('dbBackupCount').textContent = data.byType.database || 0;
        document.getElementById('fileBackupCount').textContent = data.byType.files || 0;
        document.getElementById('configBackupCount').textContent = data.byType.config || 0;

        // Format and show last backup times
        if (data.lastBackups.database) {
            const date = new Date(data.lastBackups.database.timestamp);
            document.getElementById('lastDbBackup').textContent = formatDate(date);
        }

        if (data.lastBackups.files) {
            const date = new Date(data.lastBackups.files.timestamp);
            document.getElementById('lastFileBackup').textContent = formatDate(date);
        }

        if (data.lastBackups.config) {
            const date = new Date(data.lastBackups.config.timestamp);
            document.getElementById('lastConfigBackup').textContent = formatDate(date);
        }
    } catch (error) {
        console.error('[BackupAdmin] Failed to load stats:', error);
        showAlert('Failed to load backup statistics', 'danger');
    }
}

/**
 * Load and display backup history
 */
async function loadBackupHistory() {
    try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`${API_BASE}/backups/history?limit=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load history');

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        const { data } = result;
        currentBackupData = data;

        // Render table
        renderHistoryTable(data);
    } catch (error) {
        console.error('[BackupAdmin] Failed to load history:', error);
        showAlert('Failed to load backup history', 'danger');
    }
}

/**
 * Render backup history table
 */
function renderHistoryTable(backups) {
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Timestamp</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (backups.length === 0) {
        html += `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px;">
                    <i class="fas fa-inbox" style="font-size: 32px; opacity: 0.3; display: block; margin-bottom: 10px;"></i>
                    No backups found
                </td>
            </tr>
        `;
    } else {
        backups.forEach(backup => {
            const date = new Date(backup.timestamp);
            const statusBadge = `<span class="badge badge-${backup.status === 'success' ? 'success' : backup.status === 'failed' ? 'failed' : 'pending'}">
                ${backup.status.toUpperCase()}
            </span>`;

            html += `
                <tr>
                    <td>
                        <strong>${backup.type.toUpperCase()}</strong>
                    </td>
                    <td>
                        <code style="background: rgba(0,0,0,0.05); padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                            ${backup.name}
                        </code>
                    </td>
                    <td>${formatBytes(backup.size)}</td>
                    <td>${statusBadge}</td>
                    <td>${formatDate(date)}</td>
                    <td>
                        <div class="action-buttons">
            `;

            if (backup.status === 'success') {
                html += `
                    <button class="action-btn" onclick="downloadBackup('${backup.name}', '${backup.type}')" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="action-btn" onclick="restoreBackup('${backup.name}', '${backup.type}')" title="Restore">
                        <i class="fas fa-redo"></i>
                    </button>
                `;
            }

            html += `
                    <button class="action-btn danger" onclick="deleteBackup('${backup.name}', '${backup.type}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    html += `
            </tbody>
        </table>
    `;

    document.getElementById('historyContainer').innerHTML = html;
}

/**
 * Load and display backup configuration
 */
async function loadBackupConfig() {
    try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch(`${API_BASE}/backups/config`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load config');

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        const { data } = result;
        renderConfigTable(data);
    } catch (error) {
        console.error('[BackupAdmin] Failed to load config:', error);
        showAlert('Failed to load backup configuration', 'danger');
    }
}

/**
 * Render backup configuration table
 */
function renderConfigTable(configs) {
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Schedule (Cron)</th>
                    <th>Retention Days</th>
                    <th>Status</th>
                    <th>Last Run</th>
                    <th>Next Run</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (configs.length === 0) {
        html += `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px;">
                    <i class="fas fa-inbox" style="font-size: 32px; opacity: 0.3; display: block; margin-bottom: 10px;"></i>
                    No configurations found
                </td>
            </tr>
        `;
    } else {
        configs.forEach(config => {
            const statusBadge = `<span class="badge badge-${config.is_active ? 'success' : 'failed'}">
                ${config.is_active ? 'ACTIVE' : 'INACTIVE'}
            </span>`;

            html += `
                <tr>
                    <td><strong>${config.backup_type.toUpperCase()}</strong></td>
                    <td><code>${config.schedule_cron}</code></td>
                    <td>${config.retention_days} days</td>
                    <td>${statusBadge}</td>
                    <td>${config.last_run ? formatDate(new Date(config.last_run)) : '-'}</td>
                    <td>${config.next_run ? formatDate(new Date(config.next_run)) : '-'}</td>
                </tr>
            `;
        });
    }

    html += `
            </tbody>
        </table>
    `;

    document.getElementById('configContainer').innerHTML = html;
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));

    // Show selected tab
    document.getElementById(tabName + '-tab').style.display = 'block';
    event.target.classList.add('active');
}

/**
 * Trigger manual backup
 */
function triggerManualBackup() {
    document.getElementById('backupModal').classList.add('show');
}

/**
 * Confirm and start backup
 */
async function confirmBackup() {
    try {
        const backupType = document.getElementById('backupType').value;
        const token = localStorage.getItem('jwt_token');

        closeModal('backupModal');
        showAlert('Starting backup...', 'info');

        const response = await fetch(`${API_BASE}/backups/manual`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: backupType || undefined
            })
        });

        const result = await response.json();
        
        console.log('[BackupAdmin] Backup response:', result);
        
        if (!response.ok || !result.success) {
            // Show detailed error messages
            let errorMsg = result.error || result.message || 'Backup failed';
            if (result.errors && result.errors.length > 0) {
                errorMsg = result.errors.join('\n');
            }
            throw new Error(errorMsg);
        }

        showAlert('✅ ' + result.message, 'success');
        
        // Refresh data after a short delay
        setTimeout(refreshData, 2000);
    } catch (error) {
        console.error('[BackupAdmin] Backup failed:', error);
        console.error('[BackupAdmin] Full error:', error);
        showAlert('❌ ' + error.message, 'danger');
    }
}

/**
 * Download backup file
 */
async function downloadBackup(backupName, type) {
    try {
        const token = localStorage.getItem('jwt_token');
        const url = `${API_BASE}/backups/download/${backupName}?type=${type}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to download backup');

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = backupName;
        link.click();

        showAlert('✅ Backup downloaded successfully', 'success');
    } catch (error) {
        console.error('[BackupAdmin] Download failed:', error);
        showAlert('❌ ' + error.message, 'danger');
    }
}

/**
 * Restore backup
 */
function restoreBackup(backupName, type) {
    Swal.fire({
        title: '⚠️ Restore Backup?',
        html: `
            <p>Restoring this backup will:</p>
            <ul style="text-align: left;">
                <li>Replace current ${type.toUpperCase()} data</li>
                <li>This action <strong>CANNOT</strong> be undone</li>
                <li>Current data will be lost</li>
            </ul>
            <p style="margin-top: 20px; color: #ef4444; font-weight: bold;">
                Are you absolutely sure?
            </p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, restore now',
        cancelButtonText: 'Cancel'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await performRestore(backupName, type);
        }
    });
}

/**
 * Perform restore
 */
async function performRestore(backupName, type) {
    try {
        const token = localStorage.getItem('jwt_token');

        showAlert('Restoring backup...', 'info');

        const response = await fetch(`${API_BASE}/backups/restore`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                backupName,
                type
            })
        });

        if (!response.ok) throw new Error('Failed to restore backup');

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        showAlert('✅ ' + result.message, 'success');
        
        // Refresh after restore
        setTimeout(refreshData, 2000);
    } catch (error) {
        console.error('[BackupAdmin] Restore failed:', error);
        showAlert('❌ ' + error.message, 'danger');
    }
}

/**
 * Delete backup
 */
function deleteBackup(backupName, type) {
    Swal.fire({
        title: '🗑️ Delete Backup?',
        text: `Delete ${backupName}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await performDelete(backupName, type);
        }
    });
}

/**
 * Perform delete
 */
async function performDelete(backupName, type) {
    try {
        const token = localStorage.getItem('jwt_token');

        const response = await fetch(
            `${API_BASE}/backups/${backupName}?type=${type}`,
            {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (!response.ok) throw new Error('Failed to delete backup');

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        showAlert('✅ Backup deleted successfully', 'success');
        
        // Refresh data
        setTimeout(loadBackupHistory, 1000);
    } catch (error) {
        console.error('[BackupAdmin] Delete failed:', error);
        showAlert('❌ ' + error.message, 'danger');
    }
}

/**
 * Show modal
 */
function openModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

/**
 * Close modal
 */
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

/**
 * Show alert message
 */
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alertId = 'alert-' + Date.now();

    const alertHTML = `
        <div id="${alertId}" class="alert alert-${type}">
            <i class="fas ${getAlertIcon(type)}"></i>
            <div>${message}</div>
        </div>
    `;

    alertContainer.insertAdjacentHTML('beforeend', alertHTML);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        const element = document.getElementById(alertId);
        if (element) {
            element.style.opacity = '0';
            element.style.transition = 'opacity 0.3s';
            setTimeout(() => element.remove(), 300);
        }
    }, 5000);
}

/**
 * Get alert icon
 */
function getAlertIcon(type) {
    const icons = {
        success: 'fa-check-circle',
        danger: 'fa-times-circle',
        warning: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    return icons[type] || icons.info;
}

/**
 * Format date
 */
function formatDate(date) {
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(date).toLocaleDateString('id-ID', options);
}

/**
 * Format bytes
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    if (!bytes) return '-';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
