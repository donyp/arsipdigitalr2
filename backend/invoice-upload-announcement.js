// ============================================================
// Pengumuman otomatis upload invoice PDF (per zona)
// ============================================================
// Setelah file invoice PDF berhasil diupload, sistem membuat SATU
// pengumuman untuk ZONA yang terkait. Pengumuman ini otomatis muncul di
// tombol "Pengumuman" pada dashboard admin zona (sudah ada) - tidak perlu
// UI baru.
//
// KEAMANAN DATA (anti kebocoran):
//   - recipient_type = 'specific_zonas' dengan 1 zona per pengumuman.
//   - Isi pengumuman HANYA berisi data zona tersebut (jumlah file, total
//     nominal, nama toko di zona itu saja).
//   - Endpoint GET /api/announcements sudah memfilter berdasarkan
//     zona_id user -> user zona lain tidak pernah melihat pengumuman ini.
//   - Tidak pernah memakai 'all_users' / 'all_zonas' untuk notifikasi
//     invoice (itu akan membocorkan data antar zona).
// ============================================================

const { getWaSettings, isAnnounceEnabledForZone } = require('./wa-notification-settings');

const ANNOUNCEMENT_TYPE = 'Upload Invoice';
const ANNOUNCEMENT_TYPE_FALLBACK = 'Informasi';

// Kolom announcement_type bertipe ENUM di Postgres. Nilai 'Upload Invoice'
// hanya tersedia SETELAH migrasi SQL dijalankan. Kalau belum, pakai
// 'Informasi' (selalu ada) supaya pengumuman tetap terkirim.
let useCustomType = true;

function formatRupiah(nominal) {
    const num = parseInt(nominal) || 0;
    return 'Rp ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Maksimal baris invoice yang ditampilkan di badan pengumuman.
// Sisanya diringkas "+N invoice lainnya" supaya pengumuman tidak kepanjangan.
const MAX_INVOICE_LINES = 30;

// Urutan tampil: PPN dulu, lalu NON PPN, lalu tipe lain (mis. PPH).
const TIPE_ORDER = { 'PPN': 0, 'NON PPN': 1 };

/**
 * Normalisasi tipe invoice: "ppn" -> "PPN", "non ppn"/"nonppn" -> "NON PPN".
 * @param {string} tipe
 * @returns {string}
 */
function normalizeTipe(tipe) {
    const t = String(tipe || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!t) return 'PPN';
    if (t === 'NONPPN' || t.startsWith('NON')) return 'NON PPN';
    return t;
}

/**
 * Susun isi pengumuman untuk 1 zona (format profesional):
 *
 *   3 File Invoice Sudah Di Upload
 *
 *   • [PPN] - SERANG TIMUR Rp 23.023.223
 *   • [NON PPN] - MEGA BAJA CIRUAS Rp 5.072.977
 *
 * @param {object} zonaInfo { zona_id, zona_name, zona_kode, invoice_count,
 *                            total_nominal, toko_names, invoices:[{tipe,konsumen,nominal}] }
 */
function buildAnnouncementContent(zonaInfo) {
    const invoices = Array.isArray(zonaInfo.invoices)
        ? zonaInfo.invoices.filter(inv => inv && (inv.konsumen || inv.nominal || inv.tipe))
        : [];
    const count = Number(zonaInfo.invoice_count) || invoices.length || 0;
    const lines = [`${count} File Invoice Sudah Di Upload`];

    // ---------- Format baru: rincian per invoice ----------
    if (invoices.length) {
        // PPN dulu, lalu NON PPN (urutan asli dipertahankan dalam grup yg sama)
        const ordered = invoices
            .map((inv, index) => ({ inv, index }))
            .sort((a, b) => {
                const oa = TIPE_ORDER[normalizeTipe(a.inv.tipe)];
                const ob = TIPE_ORDER[normalizeTipe(b.inv.tipe)];
                const va = oa === undefined ? 2 : oa;
                const vb = ob === undefined ? 2 : ob;
                return va === vb ? a.index - b.index : va - vb;
            })
            .map(item => item.inv);

        const shown = ordered.slice(0, MAX_INVOICE_LINES);
        lines.push('');
        shown.forEach(inv => {
            const tipe = normalizeTipe(inv.tipe);
            const konsumen = String(inv.konsumen || '-').trim();
            const nominal = parseInt(inv.nominal) || 0;
            lines.push(`• [${tipe}] - ${konsumen}${nominal > 0 ? ' ' + formatRupiah(nominal) : ''}`);
        });
        if (ordered.length > shown.length) {
            lines.push(`• +${ordered.length - shown.length} invoice lainnya`);
        }

        // Total hanya ditampilkan kalau lebih dari 1 invoice (biar tidak mubazir)
        if (invoices.length > 1) {
            const total = invoices.reduce((sum, inv) => sum + (parseInt(inv.nominal) || 0), 0);
            if (total > 0) {
                lines.push('');
                lines.push(`Total: ${formatRupiah(total)}`);
            }
        }
        return lines.join('\n');
    }

    // ---------- Fallback: data lama tanpa rincian invoice ----------
    if (Number(zonaInfo.total_nominal) > 0) {
        lines.push('');
        lines.push(`Total nilai: ${formatRupiah(zonaInfo.total_nominal)}`);
    }
    const toko = (zonaInfo.toko_names || []).filter(Boolean);
    if (toko.length) {
        const shown = toko.slice(0, 10);
        lines.push(`Toko: ${shown.join(', ')}${toko.length > shown.length ? ` (+${toko.length - shown.length} lainnya)` : ''}`);
    }
    return lines.join('\n');
}

/**
 * Buat pengumuman upload invoice untuk beberapa zona sekaligus.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {array}  params.zones - [{ zona_id, zona_name, zona_kode, invoice_count, total_nominal, toko_names }]
 * @param {string} params.uploadedBy - userId pengupload
 * @param {string} params.batchId
 * @returns {Promise<{created: number, skipped: number, announcements: object}>}
 */
async function announceInvoiceUploads({ supabase, zones = [], uploadedBy = null, batchId = null }) {
    const result = { created: 0, skipped: 0, announcements: {} };

    if (!zones.length) return result;

    let settings;
    try {
        settings = await getWaSettings(supabase);
    } catch (e) {
        console.warn('[WA-Announce] Gagal baca settings:', e.message);
        return result;
    }

    for (const zona of zones) {
        try {
            if (!isAnnounceEnabledForZone(settings, zona.zona_id)) {
                console.log(`[WA-Announce] Pengumuman otomatis nonaktif untuk zona ${zona.zona_name} - dilewati`);
                result.skipped++;
                continue;
            }

            const title = `File invoice baru diunggah - ${zona.zona_name}`;
            const content = buildAnnouncementContent(zona);

            // 1) Buat pengumuman
            const insertAnnouncement = async (typeValue) => {
                return await supabase
                    .from('announcements')
                    .insert({
                        title,
                        content,
                        announcement_type: typeValue,
                        recipient_type: 'specific_zonas',
                        created_by: uploadedBy,
                        is_active: true
                    })
                    .select('id')
                    .maybeSingle();
            };

            let { data: announcement, error: annError } = await insertAnnouncement(
                useCustomType ? ANNOUNCEMENT_TYPE : ANNOUNCEMENT_TYPE_FALLBACK
            );

            // Enum 'Upload Invoice' belum ada -> fallback ke 'Informasi'
            if (annError && /announcement_type_enum|invalid input value for enum/i.test(annError.message)) {
                if (useCustomType) {
                    console.warn('[WA-Announce] Enum announcement_type belum punya "Upload Invoice" -> pakai "Informasi". Jalankan migrasi SQL untuk ikon khusus.');
                    useCustomType = false;
                }
                ({ data: announcement, error: annError } = await insertAnnouncement(ANNOUNCEMENT_TYPE_FALLBACK));
            }

            if (annError || !announcement) {
                console.error('[WA-Announce] Gagal membuat pengumuman:', annError?.message);
                result.skipped++;
                continue;
            }

            // 2) Kaitkan ke zona (HANYA zona ini)
            //    CATATAN SCHEMA: announcement_recipients.recipient_id bertipe
            //    UUID, sedangkan zonas.id bertipe INTEGER -> INSERT zona id
            //    selalu GAGAL. Ini bukan penentu visibility:
            //    visibility ditentukan oleh announcement_reads (hanya dibuat
            //    untuk user zona tsb) + INNER JOIN di endpoint GET.
            //    Kalau migrasi SQL someday mengubah recipient_id jadi text,
            //    baris recipients tersimpan dan scoping jadi 2 lapis.
            let scopedCorrectly = false;
            const { error: recError } = await supabase
                .from('announcement_recipients')
                .insert({
                    announcement_id: announcement.id,
                    recipient_type: 'zona',
                    recipient_id: zona.zona_id
                });
            if (!recError) {
                scopedCorrectly = true;
            } else {
                console.warn('[WA-Announce] Tidak bisa simpan recipient zona (schema recipient_id bertipe UUID):', recError.message);
            }

            // 3) Buat read record untuk user aktif di zona tsb (agar badge
            //    "belum dibaca" muncul di tombol pengumuman).
            //    Pengumuman ini HANYA boleh terlihat oleh user zona tsb ->
            //    read record adalah PENENTU visibility (INNER JOIN).
            try {
                const zonaUserIds = [];
                const { data: zonaUsers } = await supabase
                    .from('users')
                    .select('id')
                    .eq('zona_id', zona.zona_id)
                    .eq('is_active', true);

                if (zonaUsers && zonaUsers.length) {
                    zonaUserIds.push(...zonaUsers.map(u => u.id));
                }
                // Pengupload (moderator/super_admin) juga boleh melihat
                // pengumuman yang dia buat.
                if (uploadedBy && !zonaUserIds.includes(uploadedBy)) {
                    zonaUserIds.push(uploadedBy);
                }

                if (zonaUserIds.length) {
                    const reads = zonaUserIds.map(uid => ({
                        announcement_id: announcement.id,
                        user_id: uid,
                        is_read: false,
                        read_at: null
                    }));
                    const { error: readError } = await supabase
                        .from('announcement_reads')
                        .insert(reads);
                    if (readError) {
                        console.warn('[WA-Announce] Gagal membuat read record:', readError.message);
                    }
                }
            } catch (readErr) {
                console.warn('[WA-Announce] Error read record:', readErr.message);
            }

            result.created++;
            result.announcements[zona.zona_id] = announcement.id;
            console.log(`[WA-Announce] ✅ Pengumuman dibuat untuk zona ${zona.zona_name} (${zona.invoice_count} file, batch ${batchId || '-'})`);
        } catch (e) {
            console.error('[WA-Announce] Error per zona:', e.message);
            result.skipped++;
        }
    }

    return result;
}

module.exports = {
    ANNOUNCEMENT_TYPE,
    announceInvoiceUploads,
    buildAnnouncementContent,
    normalizeTipe
};
