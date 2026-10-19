// ============================================================
// Idempotency Middleware - Prevent Duplicate Transactions
// ============================================================

/**
 * Idempotency middleware untuk mencegah duplicate requests
 * Gunakan Idempotency-Key header untuk safe retries
 * 
 * Usage:
 * POST /api/payment with Idempotency-Key: unique-key
 * 
 * Retry dengan key yang sama akan return cached response
 * (tidak akan execute request dua kali)
 */

class IdempotencyMiddleware {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.cache = new Map(); // In-memory cache for recent requests
        this.CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    }

    /**
     * Express middleware untuk idempotency
     * Cek apakah request sudah pernah diprocess
     * Jika ya: return cached response
     * Jika tidak: process dan cache hasilnya
     */
    middleware() {
        return async (req, res, next) => {
            // Skip GET requests (tidak perlu idempotency)
            if (req.method === 'GET' || req.method === 'HEAD') {
                return next();
            }

            // Get idempotency key dari header
            const idempotencyKey = req.headers['idempotency-key'];

            // Jika tidak ada key, lanjutkan tanpa caching
            if (!idempotencyKey) {
                return next();
            }

            // Validasi format key (alphanumeric, uuid-like)
            if (!this.isValidKey(idempotencyKey)) {
                return res.status(400).json({
                    error: 'Invalid idempotency-key format'
                });
            }

            try {
                // Cek apakah sudah ada di database
                const existing = await this.getRequest(idempotencyKey);

                if (existing) {
                    // Request sudah pernah diprocess - return cached response
                    console.log(`[Idempotency] ✅ Returning cached response for key: ${idempotencyKey}`);
                    return res.status(existing.status_code).json(existing.response_body);
                }

                // Request baru - intercept response untuk caching
                const originalJson = res.json.bind(res);
                
                res.json = function(data) {
                    // Simpan response ke database (async, don't wait)
                    this.saveRequest(idempotencyKey, res.statusCode, data).catch(err => {
                        console.error('[Idempotency] Failed to save request:', err.message);
                    });

                    return originalJson(data);
                }.bind(this);

                // Set idempotency key di request untuk tracking
                req.idempotencyKey = idempotencyKey;
                next();

            } catch (error) {
                console.error('[Idempotency] Error processing idempotency:', error.message);
                // Jika ada error, lanjutkan tanpa idempotency protection
                // (lebih baik daripada fail request)
                next();
            }
        };
    }

    /**
     * Ambil request yang sudah diprocess dari database
     */
    async getRequest(key) {
        try {
            // Cek in-memory cache dulu (faster)
            const cached = this.cache.get(key);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                return cached.data;
            }

            // Query database
            const { data, error } = await this.supabase
                .from('idempotent_requests')
                .select('status_code, response_body')
                .eq('idempotency_key', key)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = not found
                throw error;
            }

            if (data) {
                // Cache di memory
                this.cache.set(key, {
                    data,
                    timestamp: Date.now()
                });
                return data;
            }

            return null;

        } catch (error) {
            console.error('[Idempotency] Error getting request:', error.message);
            return null;
        }
    }

    /**
     * Simpan response yang sudah diprocess
     */
    async saveRequest(key, statusCode, responseBody) {
        try {
            // Cek apakah sudah ada (dalam case race condition)
            const existing = await this.getRequest(key);
            if (existing) {
                return; // Sudah ada, skip
            }

            // Simpan ke database
            const { error } = await this.supabase
                .from('idempotent_requests')
                .insert({
                    idempotency_key: key,
                    status_code: statusCode,
                    response_body: responseBody,
                    created_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + this.CACHE_TTL).toISOString()
                });

            if (error) {
                console.error('[Idempotency] Error saving request:', error.message);
                return;
            }

            // Cache di memory
            this.cache.set(key, {
                data: { status_code: statusCode, response_body: responseBody },
                timestamp: Date.now()
            });

            console.log(`[Idempotency] ✅ Saved request with key: ${key}`);

        } catch (error) {
            console.error('[Idempotency] Error saving request:', error.message);
        }
    }

    /**
     * Validasi format idempotency key
     * Harus UUID atau alphanumeric dengan hyphens
     */
    isValidKey(key) {
        // UUID format: 8-4-4-4-12
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        // Atau alphanumeric + hyphens, 20-100 chars
        const alphaRegex = /^[a-zA-Z0-9-_]{20,100}$/;

        return uuidRegex.test(key) || alphaRegex.test(key);
    }

    /**
     * Cleanup expired requests (run daily)
     */
    async cleanupExpired() {
        try {
            const { error } = await this.supabase
                .from('idempotent_requests')
                .delete()
                .lt('expires_at', new Date().toISOString());

            if (error) {
                console.error('[Idempotency] Error cleaning up:', error.message);
                return;
            }

            console.log('[Idempotency] ✅ Cleanup complete');

        } catch (error) {
            console.error('[Idempotency] Error during cleanup:', error.message);
        }
    }

    /**
     * Get statistics about idempotent requests
     */
    async getStats() {
        try {
            const { data, error } = await this.supabase
                .from('idempotent_requests')
                .select('id', { count: 'exact' });

            if (error) throw error;

            return {
                totalRequests: data?.length || 0,
                cacheSize: this.cache.size,
                cacheMemory: `${(this.cache.size * 1024).toLocaleString()} bytes`
            };

        } catch (error) {
            console.error('[Idempotency] Error getting stats:', error.message);
            return null;
        }
    }
}

module.exports = IdempotencyMiddleware;
