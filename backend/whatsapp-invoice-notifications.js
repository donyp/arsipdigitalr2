// ============================================================
// WhatsApp Invoice Notifications Handler
// Generates per-invoice WhatsApp messages for zona groups
// Format: [PPN/Pajak] [Konsumen] - Nominal
// ============================================================

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client (lazy, will fail gracefully if credentials missing)
let supabase = null;

function getSupabaseClient() {
    if (supabase) return supabase;
    
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
        throw new Error('Missing Supabase credentials (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
    }
    
    supabase = createClient(url, key);
    return supabase;
}

/**
 * Format currency to Indonesian Rupiah
 * @param {number} nominal - Amount in numbers
 * @returns {string} Formatted string "Rp X.XXX.XXX"
 */
function formatRupiah(nominal) {
    if (!nominal) return 'Rp 0';
    const num = parseInt(nominal) || 0;
    return 'Rp ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Generate WhatsApp message for single invoice
 * @param {object} invoice - Invoice data {tipe, konsumen, nominal}
 * @returns {string} Formatted message
 */
function generateInvoiceMessage(invoice) {
    const tipe = invoice.tipe || 'PPH';
    const konsumen = invoice.konsumen || 'Unknown';
    const nominal = formatRupiah(invoice.nominal);
    
    return `- [${tipe}] ${konsumen} - ${nominal}`;
}

/**
 * Kunci unik satu baris invoice (untuk dedupe).
 * File yang sama / invoice yang sama tidak boleh muncul 2x di satu pesan.
 */
function invoiceDedupeKey(inv) {
    return [
        String(inv.tipe || '').trim().toUpperCase(),
        String(inv.konsumen || '').trim().toUpperCase(),
        String(inv.nominal || 0)
    ].join('|');
}

/**
 * Gabungkan daftar invoice lama + baru tanpa duplikat.
 * @returns {array} Gabungan (urutan lama diikuti yang baru)
 */
function mergeInvoiceDetails(existing, incoming) {
    const merged = [];
    const seen = new Set();
    [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])].forEach(inv => {
        if (!inv) return;
        const key = invoiceDedupeKey(inv);
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(inv);
    });
    return merged;
}

/**
 * Apakah tabel sudah punya kolom kanal (sent_via / announcement_id /
 * bot_message_id / merged_count)? Kolom ini opsional (ditambahkan lewat
 * migrasi SQL) - kalau belum ada, fitur tetap jalan tanpa info kanal.
 * @returns {boolean}
 */
let channelColsAvailable = null;
async function hasChannelColumns(supabase) {
    if (channelColsAvailable !== null) return channelColsAvailable;
    try {
        const { error } = await supabase
            .from('whatsapp_invoice_notifications')
            .select('sent_via')
            .limit(1);
        channelColsAvailable = !error;
    } catch (e) {
        channelColsAvailable = false;
    }
    if (!channelColsAvailable) {
        console.warn('[WA-Invoice] Kolom kanal (sent_via dll) belum ada - jalankan migrasi SQL untuk info kanal. Fitur tetap jalan.');
    }
    return channelColsAvailable;
}

/**
 * Cari pesan PENDING (belum dikirim) milik satu zona, supaya invoice baru
 * untuk zona yang sama DIGABUNG ke pesan tsb dan tidak membuat pesan kedua.
 *
 * Tanpa ini: upload pertama (4 file, 1 zona) + upload ulang (1 file yg
 * gagal sebelumnya) = 2 pesan aktif untuk zona yang sama.
 *
 * @param {number} zonaId
 * @param {number} windowHours - hanya gabung pesan yg dibuat dalam N jam terakhir
 */
async function findPendingMessageForZona(supabase, zonaId, windowHours) {
    const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('whatsapp_invoice_notifications')
        .select('id, zona_id, invoice_count, invoice_details, message, created_at, sent_at, batch_id')
        .eq('zona_id', zonaId)
        .eq('notification_type', 'invoice_upload')
        .is('sent_at', null)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.warn('[WA-Invoice] Gagal mencari pesan pending zona', zonaId, error.message);
        return null;
    }
    return data && data.length ? data[0] : null;
}

/**
 * Generate WhatsApp message batch for multiple invoices
 * Combines individual invoices into zone-grouped message
 * @param {array} invoices - Array of invoice objects
 * @param {string} zonaName - Zona name
 * @param {string} zonaKode - Zona kode (e.g., "01", "02")
 * @returns {string} Complete WhatsApp message
 */
function generateZonaInvoiceMessage(invoices, zonaName, zonaKode) {
    const invoiceLines = invoices.map(inv => generateInvoiceMessage(inv)).join('\n');
    
    // Format: *UPDATE INVOICE ZONA {zonaKode}* (using zona kode like "01", "02", etc.)
    const message = `*UPDATE INVOICE ZONA ${zonaKode}*

${invoiceLines}

_@adminanka_`;

    return message;
}

/**
 * Create WhatsApp notifications for uploaded invoices
 * @param {array} invoices - Array of uploaded invoices {zona_id, tipe, konsumen, nominal}
 * @param {string} moderatorId - UUID of moderator who uploaded
 * @param {string} batchId - Batch ID from upload session
 * @returns {object} Grouped notifications by zona
 */
async function createInvoiceNotifications(invoices, moderatorId, batchId) {
    try {
        console.log('[WA-Invoice] Creating notifications for', invoices.length, 'invoices');

        const supabase = getSupabaseClient();

        // Group invoices by zona
        const invoicesByZona = {};
        invoices.forEach(inv => {
            if (!invoicesByZona[inv.zona_id]) {
                invoicesByZona[inv.zona_id] = [];
            }
            invoicesByZona[inv.zona_id].push(inv);
        });

        console.log('[WA-Invoice] Grouped into', Object.keys(invoicesByZona).length, 'zonas');

        // Get zona names and kodes
        const zonaIds = Object.keys(invoicesByZona).map(Number);
        const { data: zonas, error: zonaError } = await supabase
            .from('zonas')
            .select('id, nama, kode')
            .in('id', zonaIds);

        if (zonaError) {
            throw new Error(`Failed to fetch zonas: ${zonaError.message}`);
        }

        const zonaMap = {};
        const zonaKodeMap = {};
        zonas.forEach(z => {
            zonaMap[z.id] = z.nama;
            // Remove leading zeros but preserve letters (e.g., "01" → "1", "03a" → "3a", "03A" → "3A")
            let kode = z.kode ? z.kode.toString() : `${z.id}`;
            // Remove leading zeros: "01" → "1", "03a" → "3a"
            kode = kode.replace(/^0+(?=\d)/, '');
            zonaKodeMap[z.id] = kode || `${z.id}`;
        });

        // Create notifications per zona
        const notifications = {};
        const notificationsToInsert = [];
        const mergedMessages = [];
        const canUseChannelCols = await hasChannelColumns(supabase);
        const mergeWindowHours = Number(process.env.WA_MERGE_WINDOW_HOURS || 12);

        for (const [zonaId, invoicesForZona] of Object.entries(invoicesByZona)) {
            const zId = Number(zonaId);
            const zonaName = zonaMap[zId] || `Zona ${zId}`;
            const zonaKode = zonaKodeMap[zId] || zId; // Use zona kode (e.g., "01") or ID as fallback

            // ============================================================
            // GABUNG dengan pesan pending zona ini (anti pesan ganda)
            // ============================================================
            // Kalau zona ini masih punya pesan yang BELUM dikirim, invoice
            // baru untuk zona yang sama DIGABUNG ke pesan tsb (pesan di-
            // update), bukan membuat baris baru. Hasinya: selalu 1 pesan
            // aktif per zona, walau upload dipecah jadi beberapa kali.
            const existing = await findPendingMessageForZona(supabase, zId, mergeWindowHours);

            if (existing) {
                const mergedDetails = mergeInvoiceDetails(existing.invoice_details, invoicesForZona);
                const mergedMessage = generateZonaInvoiceMessage(mergedDetails, zonaName, zonaKode);

                const updatePayload = {
                    invoice_count: mergedDetails.length,
                    invoice_details: mergedDetails,
                    message: mergedMessage
                };
                if (canUseChannelCols) {
                    updatePayload.merged_count = (existing.merged_count || 1) + 1;
                }

                const { data: updated, error: updateError } = await supabase
                    .from('whatsapp_invoice_notifications')
                    .update(updatePayload)
                    .eq('id', existing.id)
                    .select();

                if (updateError) {
                    console.error('[WA-Invoice] Gagal merge pesan zona', zonaName, updateError.message);
                } else {
                    console.log(`[WA-Invoice] ✅ Merged ke pesan pending zona ${zonaName} (total ${mergedDetails.length} invoice)`);
                    mergedMessages.push({ zona_id: zId, zona_name: zonaName, notification_id: existing.id, message: mergedMessage, invoice_count: mergedDetails.length });
                    notifications[zonaName] = {
                        zona_id: zId,
                        zona_name: zonaName,
                        message: mergedMessage,
                        invoice_count: mergedDetails.length,
                        invoices: mergedDetails,
                        merged: true,
                        notification_id: existing.id
                    };
                    continue; // lanjut ke zona berikutnya
                }
            }

            // Tidak ada pesan pending -> buat pesan baru
            // Generate message for this zona's invoices - format: *UPDATE INVOICE ZONA {kode}*
            const deduped = mergeInvoiceDetails([], invoicesForZona);
            const message = generateZonaInvoiceMessage(deduped, zonaName, zonaKode);

            const row = {
                zona_id: zId,
                moderator_id: moderatorId,
                invoice_count: deduped.length,
                invoice_details: deduped, // Store details for reference
                message: message,
                batch_id: batchId,
                notification_type: 'invoice_upload', // Distinguish from excel uploads
                created_at: new Date().toISOString()
            };
            if (canUseChannelCols) {
                row.merged_count = 1;
            }
            notificationsToInsert.push(row);

            notifications[zonaName] = {
                zona_id: zId,
                zona_name: zonaName,
                message: message,
                invoice_count: deduped.length,
                invoices: deduped,
                merged: false
            };

            console.log(`[WA-Invoice] Created message for zona ${zonaName}: ${deduped.length} invoices`);
        }

        // Insert into database
        if (notificationsToInsert.length > 0) {
            const { data: inserted, error: insertError } = await supabase
                .from('whatsapp_invoice_notifications')
                .insert(notificationsToInsert)
                .select();

            if (insertError) {
                console.error('[WA-Invoice] Insert error:', insertError);
                throw new Error(`Failed to save notifications: ${insertError.message}`);
            }

            console.log('[WA-Invoice] ✅ Saved', inserted.length, 'notifications to database');

            // Pasangkan id baris baru ke hasil per-zona (dipakai kanal
            // pengumuman / bot agar tahu pesan mana yg harus di-follow up)
            if (inserted && inserted.length) {
                inserted.forEach(row => {
                    const entry = notifications[zonaMap[row.zona_id] || `Zona ${row.zona_id}`];
                    if (entry) entry.notification_id = row.id;
                });
            }
        }

        return { notifications, merged: mergedMessages };
    } catch (error) {
        console.error('[WA-Invoice] Error creating notifications:', error);
        throw error;
    }
}

/**
 * Get pending invoice notifications (not sent yet)
 * @param {string} moderatorId - Optional filter by moderator
 * @returns {object} Pending notifications grouped by zona
 */
async function getPendingInvoiceNotifications(moderatorId = null) {
    try {
        const supabase = getSupabaseClient();

        let query = supabase
            .from('whatsapp_invoice_notifications')
            .select(`
                id,
                zona_id,
                zonas(nama),
                invoice_count,
                invoice_details,
                message,
                created_at,
                moderator_id
            `)
            .is('sent_at', null) // Only pending
            .eq('notification_type', 'invoice_upload')
            .order('created_at', { ascending: false });

        if (moderatorId) {
            query = query.eq('moderator_id', moderatorId);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`Failed to fetch pending notifications: ${error.message}`);
        }

        // Transform response
        const grouped = {};
        data.forEach(notif => {
            const zonaName = notif.zonas?.nama || `Zona ${notif.zona_id}`;
            if (!grouped[zonaName]) {
                grouped[zonaName] = [];
            }
            grouped[zonaName].push(notif);
        });

        console.log('[WA-Invoice] Found', data.length, 'pending invoice messages');

        return { count: data.length, notifications: grouped, raw: data };
    } catch (error) {
        console.error('[WA-Invoice] Error fetching pending:', error);
        throw error;
    }
}

/**
 * Get all invoice notifications (pending and sent)
 * Can filter by status: 'pending', 'sent', or null for all
 * @param {string} moderatorId - Optional filter by moderator
 * @param {string} status - Optional filter: 'pending' or 'sent'
 * @returns {object} All notifications grouped by zona
 */
async function getAllInvoiceNotifications(moderatorId = null, status = null, viewer = null) {
    try {
        const supabase = getSupabaseClient();
        const canUseChannelCols = await hasChannelColumns(supabase);

        // Kolom kanal hanya ada setelah migrasi SQL -> jangan select kalau belum ada
        const channelCols = canUseChannelCols
            ? `,
                sent_via,
                announcement_id,
                bot_message_id,
                merged_count`
            : '';

        let query = supabase
            .from('whatsapp_invoice_notifications')
            .select(`
                id,
                zona_id,
                zonas(nama),
                invoice_count,
                invoice_details,
                message,
                created_at,
                sent_at,
                moderator_id${channelCols}
            `)
            .eq('notification_type', 'invoice_upload')
            .order('created_at', { ascending: false });

        // Filter by status if specified
        if (status === 'pending') {
            query = query.is('sent_at', null);
        } else if (status === 'sent') {
            query = query.not('sent_at', 'is', null);
        }
        // If status is null, return all records

        // NOTE: Do not filter by moderatorId - show all messages for dashboard view
        // Semua user login bisa melihat pesan, TETAPI untuk role admin_zona
        // dibatasi ke zonanya saja (lihat filter di bawah) supaya tidak ada
        // kebocoran data antar zona.

        // ============================================================
        // ISOLASI ZONA (anti kebocoran data antar zona)
        // ============================================================
        // Admin Zona hanya boleh melihat pesan milik zonanya sendiri.
        // Moderator / Super Admin tetap melihat semua (operasional upload
        // memang lintas zona).
        if (viewer && viewer.role === 'admin_zona') {
            query = query.eq('zona_id', viewer.zona_id ? viewer.zona_id : -1);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`Failed to fetch notifications: ${error.message}`);
        }

        // Transform response
        const grouped = {};
        data.forEach(notif => {
            const zonaName = notif.zonas?.nama || `Zona ${notif.zona_id}`;
            if (!grouped[zonaName]) {
                grouped[zonaName] = [];
            }
            grouped[zonaName].push(notif);
        });

        const pendingCount = data.filter(n => !n.sent_at).length;
        const sentCount = data.filter(n => n.sent_at).length;

        console.log('[WA-Invoice] Found', data.length, 'invoice messages (pending:', pendingCount, ', sent:', sentCount, ')');

        return { count: data.length, pending_count: pendingCount, sent_count: sentCount, notifications: grouped, raw: data };
    } catch (error) {
        console.error('[WA-Invoice] Error fetching all notifications:', error);
        throw error;
    }
}

/**
 * Mark invoice notification as sent
 * @param {string} notificationId - UUID of notification
 * @returns {object} Updated notification
 */
async function markInvoiceAsSent(notificationId, via = 'copy') {
    try {
        const supabase = getSupabaseClient();
        const canUseChannelCols = await hasChannelColumns(supabase);

        const payload = { sent_at: new Date().toISOString() };
        if (canUseChannelCols) {
            payload.sent_via = via; // 'copy' (klik Salin) atau 'manual' (tandai manual)
        }

        const { data, error } = await supabase
            .from('whatsapp_invoice_notifications')
            .update(payload)
            .eq('id', notificationId)
            .select();

        if (error) {
            throw new Error(`Failed to mark as sent: ${error.message}`);
        }

        console.log('[WA-Invoice] ✅ Marked notification', notificationId, 'as sent');

        return data[0];
    } catch (error) {
        console.error('[WA-Invoice] Error marking as sent:', error);
        throw error;
    }
}

/**
 * Mark all invoice notifications from a batch as sent
 * @param {string} batchId - Batch ID
 * @returns {number} Count of updated records
 */
async function markInvoiceBatchAsSent(batchId) {
    try {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('whatsapp_invoice_notifications')
            .update({ sent_at: new Date().toISOString() })
            .eq('batch_id', batchId)
            .eq('notification_type', 'invoice_upload')
            .is('sent_at', null)
            .select();

        if (error) {
            throw new Error(`Failed to mark batch as sent: ${error.message}`);
        }

        console.log('[WA-Invoice] ✅ Marked batch', batchId, 'as sent');

        return data ? data.length : 0;
    } catch (error) {
        console.error('[WA-Invoice] Error marking batch as sent:', error);
        throw error;
    }
}

/**
 * Mark SEMUA pesan pending dalam satu zona sebagai terkirim.
 * Dipakai tombol "Tandai semua terkirim" per zona.
 * @param {number} zonaId
 * @returns {number} Jumlah pesan yang di-update
 */
async function markInvoiceZonaAsSent(zonaId) {
    try {
        const supabase = getSupabaseClient();
        const zId = Number(zonaId);
        if (!zId) {
            throw new Error('zonaId required');
        }

        const { data, error } = await supabase
            .from('whatsapp_invoice_notifications')
            .update({ sent_at: new Date().toISOString() })
            .eq('zona_id', zId)
            .eq('notification_type', 'invoice_upload')
            .is('sent_at', null)
            .select();

        if (error) {
            throw new Error(`Failed to mark zona messages as sent: ${error.message}`);
        }

        console.log('[WA-Invoice] ✅ Marked pending messages of zona', zId, 'as sent:', data ? data.length : 0);

        return data ? data.length : 0;
    } catch (error) {
        console.error('[WA-Invoice] Error marking zona messages as sent:', error);
        throw error;
    }
}

/**
 * Delete invoice notification
 * @param {string} notificationId - UUID of notification
 * @returns {object} Deleted notification count
 */
async function deleteInvoiceNotification(notificationId) {
    try {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('whatsapp_invoice_notifications')
            .delete()
            .eq('id', notificationId)
            .select();

        if (error) {
            throw new Error(`Failed to delete: ${error.message}`);
        }

        console.log('[WA-Invoice] ✅ Deleted notification', notificationId);

        return data ? data.length : 0;
    } catch (error) {
        console.error('[WA-Invoice] Error deleting notification:', error);
        throw error;
    }
}

module.exports = {
    generateInvoiceMessage,
    generateZonaInvoiceMessage,
    createInvoiceNotifications,
    getPendingInvoiceNotifications,
    getAllInvoiceNotifications,
    markInvoiceAsSent,
    markInvoiceBatchAsSent,
    markInvoiceZonaAsSent,
    deleteInvoiceNotification,
    formatRupiah,
    mergeInvoiceDetails,
    invoiceDedupeKey
};
