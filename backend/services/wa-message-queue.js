/**
 * WhatsApp Message Queue Manager
 * - Queue system for reliable message delivery
 * - Rate limiting (anti-ban): 1-5 second random delays
 * - Exponential backoff retry
 * - Typing simulation
 */

const crypto = require('crypto');

class WAMessageQueue {
    constructor(waService, options = {}) {
        this.waService = waService;
        this.queue = [];
        this.processing = false;
        this.stats = {
            sent: 0,
            failed: 0,
            retried: 0,
            dropped: 0
        };

        // Configuration
        this.config = {
            minDelay: options.minDelay || 1000,           // 1 second min
            maxDelay: options.maxDelay || 5000,           // 5 seconds max
            batchSize: options.batchSize || 10,           // Messages per batch
            batchDelay: options.batchDelay || 10000,      // 10 seconds between batches
            maxRetries: options.maxRetries || 3,
            initialBackoff: options.initialBackoff || 2000, // 2 seconds
            circuitBreakerThreshold: options.circuitBreakerThreshold || 10,
            circuitBreakerWindow: options.circuitBreakerWindow || 300000, // 5 minutes
            messageTimeout: options.messageTimeout || 30000
        };

        this.circuitBreaker = {
            failures: 0,
            lastFailureTime: null,
            isOpen: false
        };

        // ---- Guard anti-ban (diatur dari dashboard pengaturan) ----
        this.antiBan = {
            enabled: true,
            max_per_hour: 20,          // batas pesan per grup per jam
            max_per_day: 60,           // batas pesan per grup per hari
            warmup_ms: 5000,           // jeda "warm-up" kalau bot lama idle
            typing_enabled: true,
            typing_min_ms: 800,
            typing_max_ms: 2500
        };
        // Riwayat pengiriman (untuk menghitung batas jam/hari)
        this.sentLog = [];
        this.lastSentAt = null;
        // Riwayat status pesan (supaya status bisa dicek setelah item
        // keluar dari antrean)
        this.history = new Map();

        // Start processing loop
        this.startProcessor();
    }

    /**
     * Terapkan konfigurasi anti-ban dari dashboard pengaturan.
     * @param {object} cfg - bagian `antiban` dari settings
     */
    setAntiBanConfig(cfg = {}) {
        if (!cfg) return;
        this.antiBan = {
            ...this.antiBan,
            enabled: cfg.enabled !== false,
            max_per_hour: Number(cfg.max_per_hour) || this.antiBan.max_per_hour,
            max_per_day: Number(cfg.max_per_day) || this.antiBan.max_per_day,
            warmup_ms: Number(cfg.warmup_ms) || 0,
            typing_enabled: cfg.typing_simulation !== false,
            typing_min_ms: Number(cfg.typing_min_ms) || 800,
            typing_max_ms: Number(cfg.typing_max_ms) || 2500
        };
        // Interval & batch ikut mengikuti pengaturan
        if (cfg.min_interval_ms) this.config.minDelay = Number(cfg.min_interval_ms);
        if (cfg.max_interval_ms) this.config.maxDelay = Number(cfg.max_interval_ms);
        if (cfg.batch_size) this.config.batchSize = Number(cfg.batch_size);
        if (cfg.batch_pause_ms) this.config.batchDelay = Number(cfg.batch_pause_ms);

        console.log('[WAQueue] Anti-ban config diterapkan:', JSON.stringify(this.antiBan));
    }

    /**
     * Cek batas pengiriman per jam / per hari untuk sebuah target.
     * @returns {{ok: boolean, reason?: string, waitMs?: number}}
     */
    checkRateLimit(target) {
        if (!this.antiBan.enabled) return { ok: true };

        const now = Date.now();
        const hour = 60 * 60 * 1000;
        const day = 24 * 60 * 60 * 1000;

        // bersihkan log lama (> 24 jam)
        if (this.sentLog.length > 500) {
            this.sentLog = this.sentLog.filter(s => now - s.at < day);
        }

        const inHour = this.sentLog.filter(s => s.to === target && now - s.at < hour).length;
        const inDay = this.sentLog.filter(s => s.to === target && now - s.at < day).length;

        if (this.antiBan.max_per_hour && inHour >= this.antiBan.max_per_hour) {
            return { ok: false, reason: `Batas ${this.antiBan.max_per_hour} pesan/jam untuk grup ini tercapai`, waitMs: 10 * 60 * 1000 };
        }
        if (this.antiBan.max_per_day && inDay >= this.antiBan.max_per_day) {
            return { ok: false, reason: `Batas ${this.antiBan.max_per_day} pesan/hari untuk grup ini tercapai`, waitMs: 60 * 60 * 1000 };
        }
        return { ok: true };
    }

    /**
     * Jeda warm-up kalau bot lama tidak mengirim pesan (terlihat seperti
     * activity manusia, bukan bot yang aktif 24 jam).
     */
    async applyWarmup() {
        const warmup = Number(this.antiBan.warmup_ms) || 0;
        if (!warmup || !this.lastSentAt) return 0;
        const idle = Date.now() - this.lastSentAt;
        if (idle < warmup) return 0;
        const wait = Math.min(warmup, idle);
        console.log(`[WAQueue] Warm-up ${Math.round(wait / 1000)}s (bot lama idle)`);
        await new Promise(resolve => setTimeout(resolve, wait));
        return wait;
    }

    /**
     * Add message to queue
     */
    async enqueue(to, message, type = 'individual') {
        if (this.circuitBreaker.isOpen) {
            console.warn('[WAQueue] Circuit breaker OPEN - rejecting new messages');
            return {
                id: null,
                status: 'rejected',
                reason: 'Circuit breaker open - service paused'
            };
        }

        const messageId = crypto.randomUUID();
        const queueItem = {
            id: messageId,
            to,
            message,
            type, // 'individual' or 'group'
            status: 'pending',
            retry: 0,
            createdAt: new Date(),
            nextRetry: new Date(),
            error: null
        };

        this.queue.push(queueItem);
        console.log(`[WAQueue] Message enqueued: ${messageId} to ${to} (queue size: ${this.queue.length})`);

        return {
            id: messageId,
            status: 'queued',
            position: this.queue.length
        };
    }

    /**
     * Start message processing loop
     */
    startProcessor() {
        this.processorInterval = setInterval(() => {
            if (!this.processing && this.queue.length > 0) {
                this.processQueue().catch(err => {
                    console.error('[WAQueue] Processor error:', err.message);
                });
            }
        }, 100); // Check every 100ms
    }

    /**
     * Process queue with rate limiting & typing
     */
    async processQueue() {
        if (this.processing || !this.waService.isReady()) {
            return;
        }

        this.processing = true;

        try {
            const batch = this.queue.splice(0, this.config.batchSize);

            for (const item of batch) {
                // Check if ready to send (respects retry delays)
                if (new Date() < item.nextRetry) {
                    this.queue.unshift(item); // Put back in queue
                    continue;
                }

                try {
                    // ---- Guard anti-ban: batas per jam / per hari ----
                    const limit = this.checkRateLimit(item.to);
                    if (!limit.ok) {
                        console.warn(`[WAQueue] ⏸ Ditunda (${limit.reason}): ${item.id}`);
                        item.status = 'deferred';
                        item.nextRetry = new Date(Date.now() + (limit.waitMs || 60000));
                        this.queue.push(item);
                        continue;
                    }

                    // ---- Warm-up kalau bot lama idle ----
                    await this.applyWarmup();

                    // Random delay before sending (anti-burst)
                    const delay = Math.random() * (this.config.maxDelay - this.config.minDelay) + this.config.minDelay;
                    await new Promise(resolve => setTimeout(resolve, delay));

                    // Send message (dengan konfigurasi simulasi typing)
                    const typingCfg = {
                        typing_enabled: this.antiBan.typing_enabled,
                        typing_min_ms: this.antiBan.typing_min_ms,
                        typing_max_ms: this.antiBan.typing_max_ms
                    };
                    if (item.type === 'group') {
                        await this.waService.sendGroupMessage(item.to, item.message, { typing: typingCfg });
                    } else {
                        await this.waService.sendMessage(item.to, item.message, { typing: typingCfg });
                    }

                    item.status = 'success';
                    this.stats.sent++;
                    this.circuitBreaker.failures = 0; // Reset on success
                    this.lastSentAt = Date.now();
                    this.sentLog.push({ to: item.to, at: this.lastSentAt });
                    this.recordHistory(item.id, 'success', item.retry, null, item.createdAt);

                    console.log(`[WAQueue] ✓ Message sent: ${item.id}`);
                } catch (error) {
                    item.error = error.message;

                    // Decide if retry-able
                    const isRetryable = !error.message.includes('invalid');

                    if (isRetryable && item.retry < this.config.maxRetries) {
                        // Schedule retry with exponential backoff
                        item.retry++;
                        const backoffDelay = this.config.initialBackoff * Math.pow(2, item.retry - 1);
                        item.nextRetry = new Date(Date.now() + backoffDelay);
                        item.status = 'retry_pending';
                        this.queue.push(item); // Put back in queue
                        this.stats.retried++;
                        this.recordHistory(item.id, 'retry_pending', item.retry, error.message, item.createdAt);

                        console.log(`[WAQueue] ⟳ Retry scheduled for ${item.id} (attempt ${item.retry}/${this.config.maxRetries})`);
                    } else {
                        // Drop message
                        item.status = 'failed';
                        this.stats.failed++;
                        this.stats.dropped++;
                        this.recordHistory(item.id, 'failed', item.retry, error.message, item.createdAt);
                        
                        // Update circuit breaker
                        this.circuitBreaker.failures++;
                        this.circuitBreaker.lastFailureTime = new Date();

                        if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
                            this.circuitBreaker.isOpen = true;
                            console.error(`[WAQueue] ⚠️  Circuit breaker OPENED (${this.circuitBreaker.failures} failures in ${this.config.circuitBreakerWindow/1000}s)`);
                            
                            // Auto-reset after window
                            setTimeout(() => {
                                this.circuitBreaker.isOpen = false;
                                this.circuitBreaker.failures = 0;
                                console.log('[WAQueue] Circuit breaker CLOSED - resuming');
                            }, this.config.circuitBreakerWindow);
                        }

                        console.error(`[WAQueue] ✗ Message failed (dropped): ${item.id} - ${error.message}`);
                    }
                }
            }

            // Delay between batches
            if (batch.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.config.batchDelay));
            }
        } finally {
            this.processing = false;
        }
    }

    /**
     * Get queue statistics
     */
    getStats() {
        return {
            ...this.stats,
            queueSize: this.queue.length,
            circuitBreaker: {
                isOpen: this.circuitBreaker.isOpen,
                failures: this.circuitBreaker.failures
            },
            queueItems: this.queue.map(item => ({
                id: item.id,
                to: item.to,
                status: item.status,
                retry: item.retry,
                createdAt: item.createdAt
            }))
        };
    }

    /**
     * Get message status (dari antrean atau dari riwayat)
     */
    getMessageStatus(messageId) {
        const item = this.queue.find(q => q.id === messageId);
        if (item) {
            return {
                id: item.id,
                status: item.status,
                retry: item.retry,
                error: item.error,
                createdAt: item.createdAt
            };
        }
        const hist = this.history.get(messageId);
        if (hist) {
            return { id: messageId, status: hist.status, retry: hist.retry, error: hist.error, createdAt: hist.createdAt };
        }
        return null;
    }

    /**
     * Simpan status pesan ke riwayat (dibatasi 500 entri terakhir) supaya
     * status masih bisa dicek setelah item keluar dari antrean.
     */
    recordHistory(id, status, retry, error, createdAt) {
        this.history.set(id, { status, retry, error, createdAt, at: Date.now() });
        if (this.history.size > 500) {
            const oldest = this.history.keys().next().value;
            this.history.delete(oldest);
        }
    }

    /**
     * Clear failed messages
     */
    clearFailed() {
        const before = this.queue.length;
        this.queue = this.queue.filter(item => item.status !== 'failed');
        const removed = before - this.queue.length;
        console.log(`[WAQueue] Cleared ${removed} failed messages`);
        return removed;
    }

    /**
     * Stop processor
     */
    stop() {
        if (this.processorInterval) {
            clearInterval(this.processorInterval);
        }
    }
}

module.exports = WAMessageQueue;
