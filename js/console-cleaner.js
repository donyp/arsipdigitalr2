/**
 * Console Cleaner - Filter console logs untuk production
 * Hanya tampilkan: ERROR, WARN, custom messages dengan prefix
 * Hide: console.log() biasa, debug messages
 */

(function() {
    const CUSTOM_PREFIX = '[APP]';
    const IMPORTANT_PREFIXES = ['[ERROR]', '[WARN]', '[INFO]', '[APP]', '🔴', '🟡', '🟢', '⚠️', '❌', '✅', '[INIT]'];
    
    // Store original console methods
    const original = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug
    };

    // Override console.log - hanya tampilkan yang penting
    console.log = function(...args) {
        const message = args[0]?.toString() || '';
        
        // Check jika ada custom prefix atau emoji penting
        const hasImportantPrefix = IMPORTANT_PREFIXES.some(prefix => 
            message.includes(prefix)
        );
        
        // Jika ada important prefix, tampilkan
        if (hasImportantPrefix) {
            original.log.apply(console, args);
        }
        // Jika ini response data yang penting, tampilkan
        else if (message.includes('response') || message.includes('data') || message.includes('result')) {
            original.log.apply(console, args);
        }
        // Selain itu: jangan tampilkan biasa log
    };

    // Override console.error - SELALU tampilkan error
    console.error = function(...args) {
        original.error.apply(console, ['🔴 ERROR', ...args]);
    };

    // Override console.warn - SELALU tampilkan warning
    console.warn = function(...args) {
        original.warn.apply(console, ['🟡 WARN', ...args]);
    };

    // Override console.info - hanya jika ada prefix penting
    console.info = function(...args) {
        const message = args[0]?.toString() || '';
        const hasPrefix = IMPORTANT_PREFIXES.some(prefix => message.includes(prefix));
        
        if (hasPrefix) {
            original.info.apply(console, args);
        }
    };

    // Override console.debug - JANGAN tampilkan
    console.debug = function() {
        // Silent - tidak tampilkan debug messages
    };

    // Tambah method custom untuk important messages
    console.important = function(...args) {
        original.log.apply(console, ['[APP]', ...args]);
    };

    console.success = function(...args) {
        original.log.apply(console, ['✅', ...args]);
    };

    console.fail = function(...args) {
        original.error.apply(console, ['❌', ...args]);
    };

})();
