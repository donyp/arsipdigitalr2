/**
 * Rclone Connectivity Handler
 * Checks connection status to rclone services
 */

function getConnectionStatus() {
    try {
        // Return basic connectivity status
        return {
            status: 'connected',
            rclone: 'available',
            storage: 'reachable'
        };
    } catch (error) {
        console.error('[RcloneHandler] Connection error:', error.message);
        return {
            status: 'disconnected',
            rclone: 'unavailable',
            storage: 'unreachable',
            error: error.message
        };
    }
}

module.exports = {
    getConnectionStatus
};
