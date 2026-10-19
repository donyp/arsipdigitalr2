/**
 * Performance Monitoring
 * Real-time metrics collection for optimization tracking
 * 
 * Monitors:
 * - Response times (p50, p95, p99)
 * - Query counts
 * - Error rates
 * - Cache hit rates
 */

class PerformanceMonitor {
    constructor(options = {}) {
        this.metrics = {
            requests: [],
            queries: [],
            errors: [],
            cacheHits: 0,
            cacheMisses: 0
        };

        this.maxMetrics = options.maxMetrics || 1000;
        this.alerts = [];
        this.thresholds = {
            responseTimeP99: options.responseTimeP99 || 500,  // ms
            errorRate: options.errorRate || 0.01,  // 1%
            cacheHitRate: options.cacheHitRate || 0.80,  // 80%
            queryCount: options.queryCount || 5
        };
    }

    /**
     * Record a request
     */
    recordRequest(endpoint, duration, status, queryCount = 0) {
        this.metrics.requests.push({
            timestamp: Date.now(),
            endpoint,
            duration,
            status,
            queryCount
        });

        // Keep only last N metrics
        if (this.metrics.requests.length > this.maxMetrics) {
            this.metrics.requests = this.metrics.requests.slice(-this.maxMetrics);
        }

        // Check thresholds
        this.checkThresholds();
    }

    /**
     * Record a query
     */
    recordQuery(endpoint, query, duration) {
        this.metrics.queries.push({
            timestamp: Date.now(),
            endpoint,
            query,
            duration
        });

        if (this.metrics.queries.length > this.maxMetrics) {
            this.metrics.queries = this.metrics.queries.slice(-this.maxMetrics);
        }
    }

    /**
     * Record an error
     */
    recordError(endpoint, error, statusCode = 500) {
        this.metrics.errors.push({
            timestamp: Date.now(),
            endpoint,
            error: error.message || String(error),
            statusCode
        });

        if (this.metrics.errors.length > this.maxMetrics) {
            this.metrics.errors = this.metrics.errors.slice(-this.maxMetrics);
        }
    }

    /**
     * Record cache hit/miss
     */
    recordCacheHit() {
        this.metrics.cacheHits++;
    }

    recordCacheMiss() {
        this.metrics.cacheMisses++;
    }

    /**
     * Get percentile value from response times
     */
    getPercentile(percentile = 95) {
        if (this.metrics.requests.length === 0) return 0;

        const sorted = this.metrics.requests
            .map(r => r.duration)
            .sort((a, b) => a - b);

        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Check thresholds and generate alerts
     */
    checkThresholds() {
        const p99 = this.getPercentile(99);
        const errorRate = this.getErrorRate();
        const cacheHitRate = this.getCacheHitRate();
        const avgQueryCount = this.getAverageQueryCount();

        if (p99 > this.thresholds.responseTimeP99) {
            this.addAlert('warning', `P99 response time high: ${p99}ms (threshold: ${this.thresholds.responseTimeP99}ms)`);
        }

        if (errorRate > this.thresholds.errorRate) {
            this.addAlert('warning', `Error rate high: ${(errorRate * 100).toFixed(2)}% (threshold: ${(this.thresholds.errorRate * 100).toFixed(2)}%)`);
        }

        if (cacheHitRate < this.thresholds.cacheHitRate && this.getTotalCacheRequests() > 10) {
            this.addAlert('warning', `Cache hit rate low: ${(cacheHitRate * 100).toFixed(2)}% (threshold: ${(this.thresholds.cacheHitRate * 100).toFixed(2)}%)`);
        }

        if (avgQueryCount > this.thresholds.queryCount) {
            this.addAlert('info', `Average query count: ${avgQueryCount.toFixed(1)} (threshold: ${this.thresholds.queryCount})`);
        }
    }

    /**
     * Add alert
     */
    addAlert(level, message) {
        const alert = {
            timestamp: new Date().toISOString(),
            level,  // 'info', 'warning', 'critical'
            message
        };

        this.alerts.push(alert);

        // Keep only last 100 alerts
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }

        console.log(`[Monitor] ${level.toUpperCase()}: ${message}`);
    }

    /**
     * Get error rate
     */
    getErrorRate() {
        if (this.metrics.requests.length === 0) return 0;

        const errors = this.metrics.requests.filter(r => r.status >= 400).length;
        return errors / this.metrics.requests.length;
    }

    /**
     * Get cache hit rate
     */
    getCacheHitRate() {
        const total = this.getTotalCacheRequests();
        if (total === 0) return 0;
        return this.metrics.cacheHits / total;
    }

    /**
     * Get total cache requests
     */
    getTotalCacheRequests() {
        return this.metrics.cacheHits + this.metrics.cacheMisses;
    }

    /**
     * Get average query count per request
     */
    getAverageQueryCount() {
        if (this.metrics.requests.length === 0) return 0;

        const total = this.metrics.requests.reduce((sum, r) => sum + r.queryCount, 0);
        return total / this.metrics.requests.length;
    }

    /**
     * Get summary dashboard
     */
    getSummary() {
        const now = Date.now();
        const last5min = now - (5 * 60 * 1000);
        const last1hr = now - (60 * 60 * 1000);

        const requests5min = this.metrics.requests.filter(r => r.timestamp > last5min);
        const requests1hr = this.metrics.requests.filter(r => r.timestamp > last1hr);

        return {
            timestamp: new Date().toISOString(),
            requests: {
                total: this.metrics.requests.length,
                last5min: requests5min.length,
                last1hr: requests1hr.length,
                last5minRPS: requests5min.length / 300  // Requests per second
            },
            performance: {
                p50: this.getPercentile(50),
                p95: this.getPercentile(95),
                p99: this.getPercentile(99),
                avgResponseTime: this.getAverageResponseTime()
            },
            queries: {
                total: this.metrics.queries.length,
                average: this.getAverageQueryCount(),
                avgDuration: this.getAverageQueryDuration()
            },
            cache: {
                hitRate: (this.getCacheHitRate() * 100).toFixed(2) + '%',
                hits: this.metrics.cacheHits,
                misses: this.metrics.cacheMisses
            },
            errors: {
                total: this.metrics.errors.length,
                rate: (this.getErrorRate() * 100).toFixed(2) + '%',
                last: this.metrics.errors.slice(-5)
            },
            alerts: this.alerts.slice(-10),
            health: this.getHealthStatus()
        };
    }

    /**
     * Get average response time
     */
    getAverageResponseTime() {
        if (this.metrics.requests.length === 0) return 0;

        const total = this.metrics.requests.reduce((sum, r) => sum + r.duration, 0);
        return (total / this.metrics.requests.length).toFixed(2);
    }

    /**
     * Get average query duration
     */
    getAverageQueryDuration() {
        if (this.metrics.queries.length === 0) return 0;

        const total = this.metrics.queries.reduce((sum, q) => sum + q.duration, 0);
        return (total / this.metrics.queries.length).toFixed(2);
    }

    /**
     * Get overall health status
     */
    getHealthStatus() {
        const p99 = this.getPercentile(99);
        const errorRate = this.getErrorRate();
        const cacheHitRate = this.getCacheHitRate();

        if (errorRate > 0.05 || p99 > 1000) {
            return 'CRITICAL';
        } else if (errorRate > 0.01 || p99 > 500) {
            return 'WARNING';
        } else {
            return 'HEALTHY';
        }
    }

    /**
     * Get endpoint-specific metrics
     */
    getEndpointMetrics(endpoint) {
        const requests = this.metrics.requests.filter(r => r.endpoint === endpoint);
        const errors = this.metrics.errors.filter(e => e.endpoint === endpoint);
        const queries = this.metrics.queries.filter(q => q.endpoint === endpoint);

        if (requests.length === 0) return null;

        const durations = requests.map(r => r.duration);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        const sortedDurations = durations.sort((a, b) => a - b);
        const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)];

        return {
            endpoint,
            requests: requests.length,
            avgDuration: avgDuration.toFixed(2),
            p95Duration: p95,
            errorCount: errors.length,
            errorRate: (errors.length / requests.length * 100).toFixed(2) + '%',
            averageQueryCount: (queries.length / requests.length).toFixed(1)
        };
    }

    /**
     * Get all endpoint metrics
     */
    getAllEndpointMetrics() {
        const endpoints = new Set(this.metrics.requests.map(r => r.endpoint));
        const metrics = {};

        endpoints.forEach(endpoint => {
            const endpointMetrics = this.getEndpointMetrics(endpoint);
            if (endpointMetrics) {
                metrics[endpoint] = endpointMetrics;
            }
        });

        return metrics;
    }

    /**
     * Reset metrics
     */
    reset() {
        this.metrics = {
            requests: [],
            queries: [],
            errors: [],
            cacheHits: 0,
            cacheMisses: 0
        };
        this.alerts = [];
    }
}

module.exports = PerformanceMonitor;
