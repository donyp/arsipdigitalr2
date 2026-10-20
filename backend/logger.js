/**
 * Centralized Logger with Environment-based Log Levels
 * Reduces log ingestion by filtering unnecessary logs in production
 */

const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase() || 'info'];
const NODE_ENV = process.env.NODE_ENV || 'development';

// Custom logger object
const logger = {
    // ERROR - Always log in all environments (except disabled)
    error: (...args) => {
        if (currentLogLevel >= LOG_LEVELS.error) {
            console.error('[ERROR]', new Date().toISOString(), ...args);
        }
    },

    // WARN - Log in all environments except disabled
    warn: (...args) => {
        if (currentLogLevel >= LOG_LEVELS.warn) {
            console.warn('[WARN]', new Date().toISOString(), ...args);
        }
    },

    // INFO - Only log in development (heavy in production)
    info: (...args) => {
        if (currentLogLevel >= LOG_LEVELS.info) {
            // In production, only log if explicitly requested via LOG_LEVEL=info
            if (NODE_ENV === 'development' || process.env.LOG_LEVEL === 'info') {
                console.log('[INFO]', new Date().toISOString(), ...args);
            }
        }
    },

    // DEBUG - Never log in production
    debug: (...args) => {
        if (currentLogLevel >= LOG_LEVELS.debug) {
            if (NODE_ENV === 'development') {
                console.log('[DEBUG]', new Date().toISOString(), ...args);
            }
        }
    },

    // Log level info
    getLevel: () => {
        for (const [level, value] of Object.entries(LOG_LEVELS)) {
            if (value === currentLogLevel) return level;
        }
        return 'unknown';
    }
};

// Show current log level on startup (always show this once)
if (NODE_ENV === 'production') {
    console.log(`[STARTUP] Log Level: ${logger.getLevel()} (Production Mode)`);
}

module.exports = logger;
