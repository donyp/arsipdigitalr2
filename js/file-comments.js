/**
 * File Comments Module
 * Handles displaying and managing file comments in file detail views
 */

class FileComments {
    constructor(fileId, containerId) {
        this.fileId = fileId;
        this.container = document.getElementById(containerId);
        this.comments = [];
        this.isExpanded = false;
    }

    async loadComments() {
        try {
            const response = await API.get(`/api/files/${this.fileId}/comments`);
            this.comments = response.comments || [];
            this.render();
        } catch (err) {
            Toast.error('Gagal memuat komentar');
        }
    }

    render() {
        const html = `
            <div class="comments-panel">
                <div class="comments-header">
                    <span class="font-semibold">💬 Komentar (${this.comments.length})</span>
                    <button onclick="window.fileComments.togglePanel()" class="text-gray-500">
                        ${this.isExpanded ? '▼' : '▶'}
                    </button>
                </div>

                <div class="comments-content ${this.isExpanded ? 'expanded' : 'collapsed'}">
                    <!-- New Comment Form -->
                    <div class="new-comment-form">
                        <textarea 
                            id="comment-input" 
                            placeholder="Tambahkan komentar..." 
                            rows="3"
                            class="w-full p-2 border rounded-lg text-sm"
                        ></textarea>
                        <div style="margin-top: 8px; display: flex; gap: 8px;">
                            <button onclick="window.fileComments.submitComment()" class="bg-blue-500 text-white px-4 py-2 rounded text-sm">
                                💬 Kirim
                            </button>
                            <button onclick="window.fileComments.resetForm()" class="bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm">
                                Batal
                            </button>
                        </div>
                        <div style="margin-top: 6px; font-size: 11px; color: #6b7280;">
                            💡 Tip: Gunakan @username untuk mention pengguna lain
                        </div>
                    </div>

                    <!-- Comments List -->
                    <div class="comments-list" id="comments-list">
                        ${this.comments.length === 0 ? 
                            '<p style="text-center; color: #9ca3af; padding: 16px;">Belum ada komentar</p>' :
                            this.comments.map(c => this.renderComment(c)).join('')
                        }
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    }

    renderComment(comment) {
        const isOwner = window.currentUser && window.currentUser.id === comment.user_id;
        const user = comment.users || {};

        return `
            <div class="comment-item" id="comment-${comment.id}">
                <div style="display: flex; gap: 8px;">
                    <div style="flex-shrink: 0;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center;">
                            👤
                        </div>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 500; font-size: 14px;">${user.name || 'Anonymous'}</div>
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 6px;">
                            ${new Date(comment.created_at).toLocaleString('id-ID')}
                        </div>
                        <div style="color: #374151; font-size: 14px; padding: 8px; background: #f9fafb; border-radius: 4px; margin-bottom: 8px;">
                            ${this.parseCommentText(comment.comment)}
                        </div>
                        ${comment.resolved_at ? `
                            <div style="padding: 6px; background: #d1fae5; color: #065f46; border-radius: 4px; font-size: 12px;">
                                ✓ Ditandai selesai oleh ${comment.resolved_by || 'Admin'}
                            </div>
                        ` : ''}
                        <div style="margin-top: 8px; display: flex; gap: 12px; font-size: 12px;">
                            ${isOwner ? `
                                <button onclick="window.fileComments.deleteComment('${comment.id}')" style="color: #ef4444; cursor: pointer;">
                                    🗑 Hapus
                                </button>
                            ` : ''}
                            <button onclick="window.fileComments.resolveComment('${comment.id}')" style="color: #10b981; cursor: pointer;">
                                ✓ Tandai Selesai
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    parseCommentText(text) {
        // Convert @username to highlighted mentions
        return text
            .replace(/@(\w+)/g, '<strong style="color: #3b82f6;">@$1</strong>')
            .replace(/\n/g, '<br>');
    }

    togglePanel() {
        this.isExpanded = !this.isExpanded;
        this.render();
    }

    async submitComment() {
        const input = document.getElementById('comment-input');
        const comment = input.value.trim();

        if (!comment) {
            Toast.warning('Komentar tidak boleh kosong');
            return;
        }

        try {
            await API.post(`/api/files/${this.fileId}/comments`, { comment });
            input.value = '';
            Toast.success('Komentar ditambahkan');
            this.loadComments();
        } catch (err) {
            Toast.error('Gagal menambahkan komentar: ' + err.message);
        }
    }

    async deleteComment(commentId) {
        // Use custom confirm instead of browser confirm
        if (!confirm('Hapus komentar ini?')) {
            // Replace with toast if Toast available
            if (typeof Toast !== 'undefined') {
                Toast.info('Penghapusan dibatalkan');
            }
            return;
        }

        try {
            await API.delete(`/api/files/${this.fileId}/comments/${commentId}`);
            Toast.success('Komentar dihapus');
            this.loadComments();
        } catch (err) {
            Toast.error('Gagal menghapus komentar');
        }
    }

    async resolveComment(commentId) {
        try {
            await API.post(`/api/files/${this.fileId}/comments/${commentId}/resolve`);
            Toast.success('Komentar ditandai selesai');
            this.loadComments();
        } catch (err) {
            Toast.error('Gagal menandai selesai');
        }
    }

    resetForm() {
        document.getElementById('comment-input').value = '';
    }
}

// CSS for comments panel
const commentsCSS = `
    <style>
        .comments-panel {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: white;
            margin: 16px 0;
        }

        .comments-header {
            padding: 12px 16px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
        }

        .comments-content {
            padding: 16px;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s;
        }

        .comments-content.expanded {
            max-height: 2000px;
        }

        .new-comment-form {
            margin-bottom: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e5e7eb;
        }

        .comments-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .comment-item {
            padding: 12px;
            background: #f9fafb;
            border-radius: 6px;
        }
    </style>
`;
