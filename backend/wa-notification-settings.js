// ============================================================
// Pengaturan Notifikasi WhatsApp (WA Notification Settings)
// ============================================================
// Disimpan di tabel `system_config` (key = 'wa_notification_settings')
// sebagai JSON -> tidak perlu menambah kolom/tabel baru.
//
// Dipakai untuk:
//   - toggle pengumuman otomatis per zona (Fase 2)
//   - toggle kirim otomatis ke grup WA per zona (Fase 3)
//   - pengaturan anti-ban nomor bot (Fase 3)
// ============================================================

const SETTINGS_KEY = 'wa_notification_settings';

/**
 * Nilai default. HATI-HATI: nilai default dipakai kalau setting belum
 * pernah disimpan, jadi harus aman (tidak mengirim apa pun tanpa sengaja).
 */
const DEFAULT_SETTINGS = {
    // --- Pengumuman otomatis ke user zona (Fase 2) ---
    // true  -> setiap upload invoice PDF membuat pengumuman untuk zonanya
    // false -> tidak ada pengumuman otomatis (hanya pesan WA manual)
    announce_enabled: true,
    // Override per zona. Contoh: { "129": false } -> zona 129 tidak dikirimi
    // pengumuman otomatis. Key = zona_id (string).
    announce_zonas: {},

    // --- Kirim otomatis ke grup WhatsApp (Fase 3) ---
    // default false: harus dinyalakan manual per zona lewat dashboard
    auto_send_enabled: false,
    auto_send_zonas: {},

    // --- Guard anti-ban nomor bot ---
    antiban: {
        enabled: true,
        // Jeda acak antar pesan (ms)
        min_interval_ms: 1500,
        max_interval_ms: 6000,
        // Simulasi mengetik (typing presence) sebelum kirim
        typing_simulation: true,
        typing_min_ms: 800,
        typing_max_ms: 2500,
        // Batas pengiriman per grup
        max_per_hour: 20,
        max_per_day: 60,
        // Ukuran batch + jeda antar batch
        batch_size: 5,
        batch_pause_ms: 30000,
        // Jeda "warm-up" saat bot baru connect / setelah lama idle
        warmup_ms: 5000
    }
};

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function mergeDeep(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    const out = clone(base);
    Object.keys(patch).forEach(k => {
        if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && out[k] && typeof out[k] === 'object') {
            out[k] = mergeDeep(out[k], patch[k]);
        } else if (patch[k] !== undefined) {
            out[k] = patch[k];
        }
    });
    return out;
}

/**
 * Baca setting (merged dengan default).
 * @param {object} supabase
 * @returns {Promise<object>}
 */
async function getWaSettings(supabase) {
    try {
        const { data, error } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', SETTINGS_KEY)
            .maybeSingle();

        if (error) {
            console.warn('[WA-Settings] Gagal baca setting:', error.message);
            return clone(DEFAULT_SETTINGS);
        }
        if (!data || !data.value) return clone(DEFAULT_SETTINGS);

        const stored = typeof data.value === 'string' ? safeParse(data.value) : data.value;
        return mergeDeep(DEFAULT_SETTINGS, stored || {});
    } catch (e) {
        console.warn('[WA-Settings] Error:', e.message);
        return clone(DEFAULT_SETTINGS);
    }
}

function safeParse(str) {
    try { return JSON.parse(str); } catch (e) { return {}; }
}

/**
 * Simpan setting (merge dengan setting yang ada).
 * @param {object} supabase
 * @param {object} patch - bagian yang mau diubah
 * @returns {Promise<object>} setting final
 */
async function saveWaSettings(supabase, patch) {
    const current = await getWaSettings(supabase);
    const next = mergeDeep(current, patch || {});

    const { error } = await supabase
        .from('system_config')
        .upsert({
            key: SETTINGS_KEY,
            value: next,
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

    if (error) {
        throw new Error(`Gagal menyimpan pengaturan: ${error.message}`);
    }
    return next;
}

/**
 * Apakah sebuah zona ikut fitur pengumuman otomatis?
 * @param {object} settings
 * @param {number} zonaId
 */
function isAnnounceEnabledForZone(settings, zonaId) {
    if (!settings) return false;
    const perZone = settings.announce_zonas || {};
    const key = String(zonaId);
    if (Object.prototype.hasOwnProperty.call(perZone, key)) {
        return !!perZone[key];
    }
    return !!settings.announce_enabled;
}

/**
 * Apakah sebuah zona ikut fitur kirim otomatis ke grup WA?
 * @param {object} settings
 * @param {number} zonaId
 */
function isAutoSendEnabledForZone(settings, zonaId) {
    if (!settings) return false;
    const perZone = settings.auto_send_zonas || {};
    const key = String(zonaId);
    if (Object.prototype.hasOwnProperty.call(perZone, key)) {
        return !!perZone[key];
    }
    return !!settings.auto_send_enabled;
}

module.exports = {
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    getWaSettings,
    saveWaSettings,
    isAnnounceEnabledForZone,
    isAutoSendEnabledForZone
};
