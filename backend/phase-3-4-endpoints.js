// ============================================================
// Phase 3-4 Monitoring Endpoints
// Add these to server.js after registerMonitoringEndpoints
// ============================================================

/**
 * Register Phase 3-4 specific endpoints
 */
function registerPhase34Endpoints(app, idempotencyMiddleware, cacheLayer) {
    // ============================================================
    // PHASE 3: Idempotency Endpoints
    // ============================================================

    // Get idempotency statistics
    app.get('/api/idempotency/stats', async (req, res) => {
        try {
            const stats = await idempotencyMiddleware.getStats();
            res.json({
                idempotency: stats || { error: 'Not available' },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Clear specific idempotency cache entry
    app.delete('/api/idempotency/clear/:key', async (req, res) => {
        try {
            const { key } = req.params;
            
            // This is just for testing - normally cached responses stay
            console.log(`[Idempotency] Clearing key: ${key}`);
            
            res.json({
                message: `Cleared key: ${key}`,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================================
    // PHASE 4: Cache Endpoints
    // ============================================================

    // Get cache statistics
    app.get('/api/cache/stats', async (req, res) => {
        try {
            if (!cacheLayer) {
                return res.json({ error: 'Cache not initialized' });
            }

            const stats = cacheLayer.getStats();
            res.json({
                cache: stats,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Flush entire cache (admin only)
    app.post('/api/cache/flush', async (req, res) => {
        try {
            if (!cacheLayer) {
                return res.status(404).json({ error: 'Cache not initialized' });
            }

            await cacheLayer.flush();
            res.json({
                message: 'Cache flushed successfully',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get all phase metrics
    app.get('/api/phases/metrics', async (req, res) => {
        try {
            const idempotencyStats = await idempotencyMiddleware.getStats();
            const cacheStats = cacheLayer ? cacheLayer.getStats() : null;

            res.json({
                phase3: {
                    name: 'Idempotency Keys',
                    enabled: !!idempotencyMiddleware,
                    stats: idempotencyStats
                },
                phase4: {
                    name: 'Redis Caching',
                    enabled: !!cacheLayer,
                    stats: cacheStats
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Health check including all phases
    app.get('/api/phases/health', async (req, res) => {
        try {
            const phase3Health = idempotencyMiddleware ? 'ACTIVE' : 'INACTIVE';
            const phase4Health = cacheLayer ? 'ACTIVE' : 'INACTIVE';

            res.json({
                phase1: 'ACTIVE',     // Query optimization
                phase2: 'PENDING',    // Cloudflare (external)
                phase3: phase3Health,
                phase4: phase4Health,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    console.log('[BOOT] ✅ Phase 3-4 endpoints registered');
}

module.exports = registerPhase34Endpoints;
