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

        // Start processing loop
        this.startProcessor();
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
                    // Random delay before sending (1-5 seconds, anti-burst)
                    const delay = Math.random() * (this.config.maxDelay - this.config.minDelay) + this.config.minDelay;
                    await new Promise(resolve => setTimeout(resolve, delay));

                    // Send message
                    if (item.type === 'group') {
                        await this.waService.sendGroupMessage(item.to, item.message);
                    } else {
                        await this.waService.sendMessage(item.to, item.message);
                    }

                    item.status = 'success';
                    this.stats.sent++;
                    this.circuitBreaker.failures = 0; // Reset on success

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

                        console.log(`[WAQueue] ⟳ Retry scheduled for ${item.id} (attempt ${item.retry}/${this.config.maxRetries})`);
                    } else {
                        // Drop message
                        item.status = 'failed';
                        this.stats.failed++;
                        this.stats.dropped++;
                        
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
     * Get message status
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
        return null;
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
