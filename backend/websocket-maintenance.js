/**
 * WebSocket Server for Maintenance Mode Real-time Notifications
 * Handles maintenance status broadcasts to all connected clients
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

class MaintenanceWebSocketServer {
    constructor(httpServer, jwtSecret) {
        this.wss = new WebSocket.Server({ 
            server: httpServer,
            path: '/ws/maintenance'
        });
        this.jwtSecret = jwtSecret;
        this.connectedClients = new Map(); // Map of clientId -> { ws, email, role, connectedAt }
        this.maintenanceStatusPath = path.join(__dirname, '..', 'data', 'maintenance-status.json');
        this.forcedLogoutsPath = path.join(__dirname, '..', 'data', 'forced-logouts.json');

        this.setupListeners();
        this.startMaintenanceMonitor();
    }

    /**
     * Setup WebSocket connection listeners
     */
    setupListeners() {
        this.wss.on('connection', (ws, req) => {
            console.log('[WebSocket] New connection attempt from:', req.socket.remoteAddress);

            // Authenticate the connection
            if (!this.authenticateConnection(req, ws)) {
                ws.close(1008, 'Unauthorized');
                return;
            }

            const clientId = this.generateClientId();
            const token = this.extractToken(req);
            const decoded = this.decodeToken(token);

            if (!decoded) {
                ws.close(1008, 'Invalid token');
                return;
            }

            // Store client info
            const clientInfo = {
                ws,
                email: decoded.email,
                role: decoded.role,
                connectedAt: new Date(),
                clientId
            };

            this.connectedClients.set(clientId, clientInfo);
            console.log(`[WebSocket] Client ${clientId} connected (${decoded.email}, role: ${decoded.role})`);

            // Send initial maintenance status
            this.sendMaintenanceStatus(ws);

            // Handle incoming messages
            ws.on('message', (data) => {
                this.handleMessage(clientId, data);
            });

            // Handle client disconnect
            ws.on('close', () => {
                this.connectedClients.delete(clientId);
                console.log(`[WebSocket] Client ${clientId} disconnected. Total clients: ${this.connectedClients.size}`);
            });

            // Handle errors
            ws.on('error', (err) => {
                console.error(`[WebSocket] Error on client ${clientId}:`, err.message);
                this.connectedClients.delete(clientId);
            });

            // Send heartbeat every 30 seconds to keep connection alive
            ws.isAlive = true;
            ws.on('pong', () => {
                ws.isAlive = true;
            });
        });

        // Heartbeat interval
        const heartbeatInterval = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);

        this.wss.on('close', () => {
            clearInterval(heartbeatInterval);
        });
    }

    /**
     * Authenticate WebSocket connection
     */
    authenticateConnection(req, ws) {
        try {
            const token = this.extractToken(req);
            if (!token) {
                console.warn('[WebSocket] Connection attempt without token');
                return false;
            }
            return true;
        } catch (err) {
            console.error('[WebSocket] Authentication error:', err.message);
            return false;
        }
    }

    /**
     * Extract token from request
     */
    extractToken(req) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        return url.searchParams.get('token');
    }

    /**
     * Decode JWT token
     */
    decodeToken(token) {
        try {
            return jwt.verify(token, this.jwtSecret);
        } catch (err) {
            console.error('[WebSocket] Token decode error:', err.message);
            return null;
        }
    }

    /**
     * Generate unique client ID
     */
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Handle incoming messages from client
     */
    handleMessage(clientId, data) {
        try {
            const message = JSON.parse(data);
            const clientInfo = this.connectedClients.get(clientId);

            if (!clientInfo) {
                console.warn(`[WebSocket] Message from unknown client: ${clientId}`);
                return;
            }

            console.log(`[WebSocket] Message from ${clientInfo.email}:`, message.type);

            switch (message.type) {
                case 'ping':
                    this.sendMessage(clientInfo.ws, { type: 'pong' });
                    break;

                case 'request_status':
                    this.sendMaintenanceStatus(clientInfo.ws);
                    break;

                case 'subscribe_updates':
                    // Client is requesting all maintenance updates
                    console.log(`[WebSocket] ${clientInfo.email} subscribed to maintenance updates`);
                    break;

                default:
                    console.warn(`[WebSocket] Unknown message type: ${message.type}`);
            }
        } catch (err) {
            console.error('[WebSocket] Error handling message:', err.message);
        }
    }

    /**
     * Send maintenance status to a specific client
     */
    sendMaintenanceStatus(ws) {
        try {
            const status = this.getMaintenanceStatus();
            this.sendMessage(ws, {
                type: 'maintenance_status',
                data: status
            });
        } catch (err) {
            console.error('[WebSocket] Error sending maintenance status:', err.message);
        }
    }

    /**
     * Read maintenance status from file
     */
    getMaintenanceStatus() {
        try {
            if (fs.existsSync(this.maintenanceStatusPath)) {
                const data = fs.readFileSync(this.maintenanceStatusPath, 'utf8');
                return JSON.parse(data);
            }
            return { isActive: false };
        } catch (err) {
            console.error('[WebSocket] Error reading maintenance status:', err.message);
            return { isActive: false };
        }
    }

    /**
     * Broadcast maintenance status change to all connected clients
     */
    broadcastMaintenanceStatus() {
        const status = this.getMaintenanceStatus();
        const message = JSON.stringify({
            type: 'maintenance_status_changed',
            data: status
        });

        let successCount = 0;
        let failCount = 0;

        this.connectedClients.forEach((clientInfo) => {
            if (clientInfo.ws.readyState === WebSocket.OPEN) {
                try {
                    clientInfo.ws.send(message);
                    successCount++;
                } catch (err) {
                    console.error(`[WebSocket] Failed to send to ${clientInfo.email}:`, err.message);
                    failCount++;
                }
            }
        });

        console.log(`[WebSocket] Broadcast maintenance status to ${successCount} clients (${failCount} failed)`);
    }

    /**
     * Broadcast forced logout to non-moderator clients
     */
    broadcastForcedLogout(reason = 'maintenance_mode_check') {
        const message = JSON.stringify({
            type: 'forced_logout',
            reason,
            timestamp: new Date().toISOString()
        });

        let successCount = 0;
        let failCount = 0;

        this.connectedClients.forEach((clientInfo) => {
            // Don't logout moderators
            if (clientInfo.role === 'moderator') {
                return;
            }

            if (clientInfo.ws.readyState === WebSocket.OPEN) {
                try {
                    clientInfo.ws.send(message);
                    successCount++;
                } catch (err) {
                    console.error(`[WebSocket] Failed to send logout to ${clientInfo.email}:`, err.message);
                    failCount++;
                }
            }
        });

        console.log(`[WebSocket] Broadcast forced logout to ${successCount} non-moderator clients (${failCount} failed)`);
    }

    /**
     * Broadcast notification to all clients
     */
    broadcastNotification(title, message, type = 'info') {
        const notificationMessage = JSON.stringify({
            type: 'notification',
            title,
            message,
            notificationType: type,
            timestamp: new Date().toISOString()
        });

        let successCount = 0;
        let failCount = 0;

        this.connectedClients.forEach((clientInfo) => {
            if (clientInfo.ws.readyState === WebSocket.OPEN) {
                try {
                    clientInfo.ws.send(notificationMessage);
                    successCount++;
                } catch (err) {
                    console.error(`[WebSocket] Failed to send notification to ${clientInfo.email}:`, err.message);
                    failCount++;
                }
            }
        });

        console.log(`[WebSocket] Broadcast notification to ${successCount} clients (${failCount} failed)`);
    }

    /**
     * Send message to a specific client
     */
    sendMessage(ws, data) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(data));
            } catch (err) {
                console.error('[WebSocket] Error sending message:', err.message);
            }
        }
    }

    /**
     * Monitor maintenance status file for changes and broadcast updates
     */
    startMaintenanceMonitor() {
        let lastStatus = this.getMaintenanceStatus();
        let lastModified = this.getFileModifyTime(this.maintenanceStatusPath);

        setInterval(() => {
            try {
                const currentModified = this.getFileModifyTime(this.maintenanceStatusPath);
                
                // File was modified
                if (currentModified > lastModified) {
                    const currentStatus = this.getMaintenanceStatus();
                    
                    // Check if actual status changed (not just a rewrite with same content)
                    if (JSON.stringify(lastStatus) !== JSON.stringify(currentStatus)) {
                        console.log('[WebSocket] Maintenance status changed, broadcasting to clients...');
                        this.broadcastMaintenanceStatus();
                        
                        // If maintenance just started, notify clients
                        if (!lastStatus.isActive && currentStatus.isActive) {
                            this.broadcastNotification(
                                'Maintenance Mode Active',
                                currentStatus.reason || 'System is under maintenance. Please try again later.',
                                'warning'
                            );
                        }
                        
                        // If maintenance just ended, notify clients
                        if (lastStatus.isActive && !currentStatus.isActive) {
                            this.broadcastNotification(
                                'Maintenance Complete',
                                'System maintenance has been completed. You can now access the system.',
                                'success'
                            );
                        }
                    }
                    
                    lastStatus = currentStatus;
                    lastModified = currentModified;
                }
            } catch (err) {
                console.error('[WebSocket] Error in maintenance monitor:', err.message);
            }
        }, 2000); // Check every 2 seconds
    }

    /**
     * Get file modification time
     */
    getFileModifyTime(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                return fs.statSync(filePath).mtimeMs;
            }
            return 0;
        } catch (err) {
            return 0;
        }
    }

    /**
     * Get number of connected clients
     */
    getClientCount() {
        return this.connectedClients.size;
    }

    /**
     * Get details of all connected clients
     */
    getConnectedClients() {
        const clients = [];
        this.connectedClients.forEach((clientInfo) => {
            clients.push({
                email: clientInfo.email,
                role: clientInfo.role,
                connectedAt: clientInfo.connectedAt,
                clientId: clientInfo.clientId
            });
        });
        return clients;
    }
}

module.exports = MaintenanceWebSocketServer;
