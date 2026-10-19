/**
 * Universal Exponential Backoff Retry Utility
 * With jitter, deadline management, and metrics
 * 
 * Usage:
 *   const result = await retryWithBackoff(operation, RETRY_PRESETS.MEDIUM, 'MyOp');
 */

class RetryConfig {
    constructor(options = {}) {
        // Backoff parameters
        this.baseDelayMs = options.baseDelayMs ?? 100;
        this.maxDelayMs = options.maxDelayMs ?? 10000;
        this.maxRetries = options.maxRetries ?? 3;
        this.jitterMs = options.jitterMs ?? 1000;
        
        // Deadline
        this.maxTotalTimeMs = options.maxTotalTimeMs ?? 60000;
        
        // Jitter type: 'full', 'equal', 'linear'
        this.jitterType = options.jitterType ?? 'equal';
        
        // Error handling
        this.isRetryable = options.isRetryable ?? ((err) => true);
        
        // Callbacks
        this.onRetry = options.onRetry ?? (() => {});
        this.onFailure = options.onFailure ?? (() => {});
        this.onSuccess = options.onSuccess ?? (() => {});
    }
}

class RetryMetrics {
    constructor() {
        this.attempts = 0;
        this.totalDelayMs = 0;
        this.errors = [];
        this.startTime = Date.now();
    }
    
    get duration() {
        return Date.now() - this.startTime;
    }
    
    get averageDelayMs() {
        return this.attempts > 0 ? this.totalDelayMs / this.attempts : 0;
    }
    
    toString() {
        return `${this.attempts} attempts, ${this.duration}ms total, ${this.averageDelayMs.toFixed(0)}ms avg delay`;
    }
}

/**
 * Calculate backoff delay with jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {RetryConfig} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(attempt, config) {
    // Exponential: baseDelay * (2 ** attempt), capped at maxDelay
    const exponentialDelay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt),
        config.maxDelayMs
    );
    
    // Add jitter based on type
    let jitterDelay = 0;
    
    if (config.jitterType === 'full') {
        // Full jitter: 0 to exponentialDelay
        jitterDelay = Math.random() * exponentialDelay;
    } else if (config.jitterType === 'equal') {
        // Equal jitter (AWS recommended): half to full exponentialDelay
        jitterDelay = exponentialDelay / 2 + Math.random() * (exponentialDelay / 2);
    } else if (config.jitterType === 'linear') {
        // Linear jitter: exponentialDelay to exponentialDelay + jitter
        jitterDelay = exponentialDelay + Math.random() * config.jitterMs;
    }
    
    return Math.round(jitterDelay);
}

/**
 * Universal retry with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {RetryConfig|Object} config - Configuration (can pass plain object)
 * @param {string} operationName - Name for logging
 * @returns {Promise<any>} Operation result
 */
async function retryWithBackoff(operation, config, operationName = 'Operation') {
    // Convert plain object to RetryConfig if needed
    if (!(config instanceof RetryConfig)) {
        config = new RetryConfig(config);
    }
    
    const metrics = new RetryMetrics();
    const deadline = Date.now() + config.maxTotalTimeMs;
    
    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
        metrics.attempts++;
        
        try {
            console.log(`[Retry] ${operationName} attempt ${attempt + 1}/${config.maxRetries}`);
            
            const result = await operation();
            
            console.log(
                `[Retry] ✅ ${operationName} succeeded (${metrics.toString()})`
            );
            
            config.onSuccess?.({
                attempt,
                duration: metrics.duration,
                totalAttempts: metrics.attempts
            });
            
            return result;
        } catch (error) {
            metrics.errors.push({
                attempt,
                error: error.message,
                timestamp: Date.now()
            });
            
            // Check if error is retryable
            if (!config.isRetryable(error)) {
                console.error(`[Retry] ❌ Non-retryable error: ${error.message}`);
                config.onFailure?.({ 
                    attempt, 
                    error, 
                    reason: 'non-retryable',
                    metrics 
                });
                throw error;
            }
            
            // Check if last attempt
            if (attempt === config.maxRetries - 1) {
                console.error(
                    `[Retry] ❌ ${operationName} failed after ${config.maxRetries} attempts ` +
                    `(${metrics.toString()})`
                );
                config.onFailure?.({ 
                    attempt, 
                    error, 
                    reason: 'max-attempts',
                    metrics 
                });
                throw error;
            }
            
            // Calculate backoff delay
            const delay = calculateBackoffDelay(attempt, config);
            const timeRemaining = deadline - Date.now();
            
            // Check if we have time for another attempt
            if (delay > timeRemaining) {
                console.error(
                    `[Retry] ⏱️  Deadline exceeded: delay=${delay}ms > remaining=${timeRemaining}ms`
                );
                config.onFailure?.({ 
                    attempt, 
                    error, 
                    reason: 'deadline',
                    metrics 
                });
                throw new Error(`Operation deadline exceeded (${metrics.duration}ms elapsed)`);
            }
            
            metrics.totalDelayMs += delay;
            
            console.warn(
                `[Retry] ⚠️  ${operationName} attempt ${attempt + 1} failed, ` +
                `retrying in ${delay}ms: ${error.message}`
            );
            
            config.onRetry?.({
                attempt,
                delay,
                timeRemaining,
                error: error.message,
                metrics
            });
            
            // Wait with backoff
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Retry configuration presets for common operation types
 */
const RETRY_PRESETS = {
    // Fast operations (login, list queries, metadata fetches)
    FAST: new RetryConfig({
        baseDelayMs: 50,
        maxDelayMs: 2000,
        maxRetries: 3,
        maxTotalTimeMs: 10000,
        jitterType: 'equal'
    }),
    
    // Medium operations (file upload, PDF merge, invoice operations)
    MEDIUM: new RetryConfig({
        baseDelayMs: 100,
        maxDelayMs: 5000,
        maxRetries: 4,
        maxTotalTimeMs: 30000,
        jitterType: 'equal'
    }),
    
    // Slow operations (batch sync, backup, large imports)
    SLOW: new RetryConfig({
        baseDelayMs: 500,
        maxDelayMs: 15000,
        maxRetries: 5,
        maxTotalTimeMs: 120000,
        jitterType: 'equal'
    }),
    
    // External API operations (R2, Supabase, network calls)
    EXTERNAL: new RetryConfig({
        baseDelayMs: 200,
        maxDelayMs: 10000,
        maxRetries: 4,
        maxTotalTimeMs: 60000,
        jitterType: 'equal'
    })
};

/**
 * Determine if error is retryable
 * Returns true for transient errors, false for permanent errors
 */
function isRetryableError(error) {
    if (!error) return false;
    
    const message = (error.message || '').toLowerCase();
    const code = error.code || '';
    const status = error.status || error.statusCode || 0;
    
    // Network errors - retryable
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
        return true;
    }
    
    // Timeout-related - retryable
    if (message.includes('timeout') || message.includes('timed out')) {
        return true;
    }
    
    // HTTP 5xx errors - retryable (server error)
    if (status >= 500 && status < 600) {
        return true;
    }
    
    // HTTP 429 (rate limit) - retryable
    if (status === 429) {
        return true;
    }
    
    // HTTP 408 (request timeout) - retryable
    if (status === 408) {
        return true;
    }
    
    // HTTP 503 (service unavailable) - retryable
    if (status === 503) {
        return true;
    }
    
    // Supabase-specific retryable errors
    if (message.includes('pgerr') || message.includes('database')) {
        // Most DB errors are retryable (deadlock, transaction conflict, etc)
        return true;
    }
    
    if (message.includes('temporarily unavailable')) {
        return true;
    }
    
    // Non-retryable: authentication, authorization, validation
    if (status === 401) {  // Unauthorized
        return false;
    }
    
    if (status === 403) {  // Forbidden
        return false;
    }
    
    if (status === 404) {  // Not found
        return false;
    }
    
    if (status === 400) {  // Bad request
        return false;
    }
    
    if (message.includes('not found')) {
        return false;
    }
    
    if (message.includes('invalid') || message.includes('malformed')) {
        return false;
    }
    
    if (message.includes('permission denied')) {
        return false;
    }
    
    if (message.includes('authentication')) {
        return false;
    }
    
    // Default: don't retry unknown errors (fail fast)
    return false;
}

/**
 * Sleep utility for delays
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    RetryConfig,
    RetryMetrics,
    calculateBackoffDelay,
    retryWithBackoff,
    RETRY_PRESETS,
    isRetryableError,
    sleep
};
