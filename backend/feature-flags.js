/**
 * Feature Flags Configuration
 * Central place to manage all feature rollouts
 * 
 * Can be disabled/enabled via:
 * 1. Environment variables
 * 2. Runtime updates (for gradual rollout)
 * 3. User-based rollout (percentage of users)
 */

class FeatureFlags {
    constructor() {
        // Feature flag state
        this.flags = {
            // N+1 Query Optimization
            USE_OPTIMIZED_QUERIES: {
                enabled: process.env.USE_OPTIMIZED_QUERIES === 'true',
                description: 'Use LEFT JOIN queries instead of N+1 pattern',
                rolloutPercentage: parseInt(process.env.QUERY_OPTIMIZATION_ROLLOUT || '0'),
                defaultValue: false
            },

            // Caching Layer
            USE_REDIS_CACHE: {
                enabled: process.env.USE_REDIS_CACHE === 'true',
                description: 'Use Redis for caching',
                rolloutPercentage: parseInt(process.env.CACHE_ROLLOUT || '0'),
                defaultValue: false
            },

            // Idempotency Keys
            USE_IDEMPOTENCY_KEYS: {
                enabled: process.env.USE_IDEMPOTENCY_KEYS === 'true',
                description: 'Enable idempotency key support',
                rolloutPercentage: parseInt(process.env.IDEMPOTENCY_ROLLOUT || '0'),
                defaultValue: false
            },

            // Load Balancing (informational)
            USE_LOAD_BALANCING: {
                enabled: process.env.USE_LOAD_BALANCING === 'true',
                description: 'Multi-instance load balancing',
                rolloutPercentage: 100,
                defaultValue: process.env.NODE_ENV === 'production'
            },

            // Reverse Proxy (Cloudflare)
            USE_REVERSE_PROXY: {
                enabled: process.env.USE_REVERSE_PROXY === 'true',
                description: 'Use Cloudflare reverse proxy',
                rolloutPercentage: parseInt(process.env.REVERSE_PROXY_ROLLOUT || '0'),
                defaultValue: process.env.NODE_ENV === 'production'
            }
        };

        // Track rollout history
        this.history = [];
    }

    /**
     * Check if feature is enabled for this user
     * Supports percentage-based rollout
     */
    isEnabled(flagName, userId = null) {
        const flag = this.flags[flagName];

        if (!flag) {
            console.warn(`[FeatureFlags] Unknown flag: ${flagName}`);
            return false;
        }

        // If not enabled at all, return false
        if (!flag.enabled) {
            return false;
        }

        // If rollout is 100%, everyone gets it
        if (flag.rolloutPercentage === 100) {
            return true;
        }

        // If rollout is 0%, nobody gets it
        if (flag.rolloutPercentage === 0) {
            return false;
        }

        // Percentage-based rollout using userId hash
        if (userId) {
            const hash = this.hashUserId(userId) % 100;
            return hash < flag.rolloutPercentage;
        }

        // If no userId, use random
        return Math.random() * 100 < flag.rolloutPercentage;
    }

    /**
     * Hash userId for consistent rollout
     * Same user always gets same treatment
     */
    hashUserId(userId) {
        let hash = 0;
        const str = String(userId);
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;  // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Set rollout percentage for a feature
     * Can be called at runtime to gradually roll out
     */
    setRolloutPercentage(flagName, percentage) {
        if (!this.flags[flagName]) {
            console.warn(`[FeatureFlags] Unknown flag: ${flagName}`);
            return false;
        }

        const oldPercentage = this.flags[flagName].rolloutPercentage;
        this.flags[flagName].rolloutPercentage = Math.max(0, Math.min(100, percentage));

        this.history.push({
            timestamp: new Date().toISOString(),
            flag: flagName,
            oldPercentage,
            newPercentage: this.flags[flagName].rolloutPercentage
        });

        console.log(`[FeatureFlags] ${flagName}: ${oldPercentage}% → ${percentage}%`);
        return true;
    }

    /**
     * Enable/disable a feature completely
     */
    setEnabled(flagName, enabled) {
        if (!this.flags[flagName]) {
            console.warn(`[FeatureFlags] Unknown flag: ${flagName}`);
            return false;
        }

        const oldState = this.flags[flagName].enabled;
        this.flags[flagName].enabled = enabled;

        this.history.push({
            timestamp: new Date().toISOString(),
            flag: flagName,
            oldState,
            newState: enabled
        });

        console.log(`[FeatureFlags] ${flagName}: ${oldState ? 'enabled' : 'disabled'} → ${enabled ? 'enabled' : 'disabled'}`);
        return true;
    }

    /**
     * Get all flags status
     */
    getAllFlags() {
        const status = {};
        Object.keys(this.flags).forEach(flagName => {
            const flag = this.flags[flagName];
            status[flagName] = {
                enabled: flag.enabled,
                rolloutPercentage: flag.rolloutPercentage,
                description: flag.description
            };
        });
        return status;
    }

    /**
     * Get rollout history (for debugging)
     */
    getHistory(limit = 50) {
        return this.history.slice(-limit);
    }

    /**
     * Reset to defaults
     */
    reset() {
        Object.keys(this.flags).forEach(flagName => {
            this.flags[flagName].enabled = this.flags[flagName].defaultValue;
            this.flags[flagName].rolloutPercentage = 0;
        });
        this.history = [];
    }
}

// Singleton instance
const featureFlags = new FeatureFlags();

module.exports = featureFlags;
module.exports.FeatureFlags = FeatureFlags;
