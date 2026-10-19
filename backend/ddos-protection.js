/**
 * DDoS Attack Mitigation Utilities
 * 
 * Provides:
 * - Bot detection with fingerprinting
 * - IP blacklist/whitelist management
 * - Circuit breaker for server overload
 * - DDoS detection with alerts
 * - Request deduplication
 */

const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// ============================================================
// BOT DETECTION
// ============================================================

class BotDetector {
    constructor() {
        this.botScores = {};  // { fingerprint: score }
        this.requestHistory = {};  // { fingerprint: [timestamp, ...] }
    }
    
    /**
     * Generate request fingerprint (unique identifier for client)
     */
    generateFingerprint(req) {
        const components = [
            req.headers['user-agent'] || 'unknown',
            req.headers['accept'] || 'unknown',
            req.headers['accept-language'] || 'unknown',
            req.headers['accept-encoding'] || 'unknown',
            req.ip
        ];
        
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(components.join('|'));
        return hash.digest('hex').substring(0, 16);
    }
    
    /**
     * Calculate bot score (0-100, 100 = definitely bot)
     */
    calculateBotScore(req) {
        let score = 0;
        
        // Check 1: Suspicious User-Agent
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        if (!ua) {
            score += 40;  // Missing UA
        } else if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
            score += 50;
        } else if (ua.includes('curl') || ua.includes('wget') || ua.includes('python')) {
            score += 30;
        }
        
        // Check 2: Missing/suspicious Accept headers
        if (!req.headers['accept']) {
            score += 20;
        } else if (req.headers['accept'] === '*/*') {
            score += 15;
        }
        
        // Check 3: No referer (except for API/direct access)
        if (!req.headers['referer'] && !req.path.startsWith('/api/')) {
            score += 10;
        }
        
        // Check 4: Superhuman request speed
        const fingerprint = this.generateFingerprint(req);
        const history = this.requestHistory[fingerprint] || [];
        
        if (history.length > 0) {
            const lastRequest = history[history.length - 1];
            const timeSinceLastRequest = Date.now() - lastRequest;
            
            if (timeSinceLastRequest < 50) {  // <50ms = superhuman
                score += 35;
            } else if (timeSinceLastRequest < 200) {  // <200ms = very fast
                score += 15;
            }
        }
        
        // Check 5: Targeting suspicious endpoints
        const suspiciousPatterns = [
            '/admin', '/.env', '/config', '/backup', '/.git',
            'shell.php', 'webshell', 'cmd.asp', 'upload.php'
        ];
        
        if (suspiciousPatterns.some(pattern => req.path.includes(pattern))) {
            score += 60;
        }
        
        // Check 6: SQL injection attempt
        const queryString = JSON.stringify(req.query) + JSON.stringify(req.body);
        if (queryString.includes("'") && queryString.includes('--') ||
            queryString.includes('OR 1=1')) {
            score += 70;
        }
        
        // Record request for history
        if (!this.requestHistory[fingerprint]) {
            this.requestHistory[fingerprint] = [];
        }
        this.requestHistory[fingerprint].push(Date.now());
        
        // Keep only last 100 requests
        if (this.requestHistory[fingerprint].length > 100) {
            this.requestHistory[fingerprint].shift();
        }
        
        return Math.min(score, 100);
    }
    
    /**
     * Get risk level based on score
     */
    getRiskLevel(score) {
        if (score >= 80) return 'CRITICAL';  // Definitely bot
        if (score >= 60) return 'HIGH';      // Probably bot
        if (score >= 40) return 'MEDIUM';    // Suspicious
        if (score >= 20) return 'LOW';       // Mildly suspicious
        return 'NONE';                       // Likely human
    }
}

// ============================================================
// IP BLACKLIST/WHITELIST MANAGER
// ============================================================

class IPBlocker {
    constructor() {
        this.blacklistPrefix = 'ddos:blacklist:';
        this.whitelistPrefix = 'ddos:whitelist:';
        this.suspicionPrefix = 'ddos:suspicion:';
    }
    
    /**
     * Add IP to blacklist
     */
    async addToBlacklist(ip, reason = 'abuse', duration = 3600) {
        const key = `${this.blacklistPrefix}${ip}`;
        await redis.setex(key, duration, reason);
        console.log(`[IPBlocker] Blacklisted ${ip}: ${reason} (${duration}s)`);
        return true;
    }
    
    /**
     * Remove IP from blacklist
     */
    async removeFromBlacklist(ip) {
        const key = `${this.blacklistPrefix}${ip}`;
        await redis.del(key);
        console.log(`[IPBlocker] Whitelisted ${ip}`);
        return true;
    }
    
    /**
     * Check if IP is blacklisted
     */
    async isBlacklisted(ip) {
        const key = `${this.blacklistPrefix}${ip}`;
        const reason = await redis.get(key);
        return reason ? { blocked: true, reason } : { blocked: false };
    }
    
    /**
     * Add IP to whitelist (never block)
     */
    async addToWhitelist(ip) {
        const key = `${this.whitelistPrefix}${ip}`;
        await redis.set(key, '1');
        console.log(`[IPBlocker] Whitelisted ${ip}`);
        return true;
    }
    
    /**
     * Check if IP is whitelisted
     */
    async isWhitelisted(ip) {
        const key = `${this.whitelistPrefix}${ip}`;
        return await redis.exists(key) > 0;
    }
    
    /**
     * Increment suspicion score for IP
     */
    async incrementSuspicion(ip, amount = 10) {
        const key = `${this.suspicionPrefix}${ip}`;
        const current = parseInt(await redis.get(key) || '0');
        const newValue = current + amount;
        
        await redis.setex(key, 3600, newValue);
        
        // Auto-blacklist if suspicion too high
        if (newValue > 100) {
            await this.addToBlacklist(ip, 'high_suspicion', 7200);
        }
        
        return newValue;
    }
    
    /**
     * Get all blacklisted IPs
     */
    async getBlacklist() {
        const pattern = `${this.blacklistPrefix}*`;
        const keys = await redis.keys(pattern);
        const result = {};
        
        for (const key of keys) {
            const ip = key.replace(this.blacklistPrefix, '');
            const reason = await redis.get(key);
            result[ip] = reason;
        }
        
        return result;
    }
}

// ============================================================
// CIRCUIT BREAKER (Stop on server overload)
// ============================================================

class CircuitBreaker {
    constructor(options = {}) {
        this.cpuThreshold = options.cpuThreshold || 80;
        this.memoryThreshold = options.memoryThreshold || 85;
        this.isOpen = false;
        this.openTime = null;
        this.resetTimeout = options.resetTimeout || 30000;  // 30 seconds
    }
    
    /**
     * Check if server is overloaded
     */
    check() {
        const usage = process.memoryUsage();
        const cpuPercent = process.cpuUsage().user / 1000000;
        const memPercent = (usage.heapUsed / usage.heapTotal) * 100;
        
        const isCPUHigh = cpuPercent > this.cpuThreshold;
        const isMemHigh = memPercent > this.memoryThreshold;
        
        if (isCPUHigh || isMemHigh) {
            if (!this.isOpen) {
                this.isOpen = true;
                this.openTime = Date.now();
                console.error(`[CircuitBreaker] OPENED - CPU: ${cpuPercent.toFixed(1)}%, Mem: ${memPercent.toFixed(1)}%`);
            }
            
            return false;  // REJECT requests
        }
        
        // Try to recover after timeout
        if (this.isOpen && Date.now() - this.openTime > this.resetTimeout) {
            this.isOpen = false;
            console.log('[CircuitBreaker] CLOSED - Server recovered');
        }
        
        return !this.isOpen;  // ACCEPT requests
    }
    
    /**
     * Get circuit breaker status
     */
    getStatus() {
        const usage = process.memoryUsage();
        const cpuPercent = process.cpuUsage().user / 1000000;
        const memPercent = (usage.heapUsed / usage.heapTotal) * 100;
        
        return {
            state: this.isOpen ? 'OPEN' : 'CLOSED',
            cpu: cpuPercent.toFixed(1) + '%',
            memory: memPercent.toFixed(1) + '%',
            uptime: process.uptime(),
            heap: {
                used: (usage.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
                total: (usage.heapTotal / 1024 / 1024).toFixed(2) + 'MB'
            }
        };
    }
}

// ============================================================
// DDOS DETECTOR (Real-time attack detection)
// ============================================================

class DDoSDetector {
    constructor(options = {}) {
        this.requestsPerIP = {};
        this.requestsPerEndpoint = {};
        this.alerts = [];
        
        this.volumetricThreshold = options.volumetricThreshold || 100;  // 100 req/min
        this.spikeThreshold = options.spikeThreshold || 50;  // 50 req/min
        this.window = options.window || 60000;  // 1 minute window
    }
    
    /**
     * Record request and check for attacks
     */
    recordRequest(ip, endpoint) {
        if (!this.requestsPerIP[ip]) {
            this.requestsPerIP[ip] = [];
        }
        this.requestsPerIP[ip].push(Date.now());
        
        if (!this.requestsPerEndpoint[endpoint]) {
            this.requestsPerEndpoint[endpoint] = [];
        }
        this.requestsPerEndpoint[endpoint].push(Date.now());
        
        // Clean old requests
        this.requestsPerIP[ip] = this.requestsPerIP[ip].filter(
            t => Date.now() - t < this.window
        );
        this.requestsPerEndpoint[endpoint] = this.requestsPerEndpoint[endpoint].filter(
            t => Date.now() - t < this.window
        );
        
        // Check for attacks
        this.detectAttack(ip, endpoint);
    }
    
    /**
     * Detect volumetric or spike attacks
     */
    detectAttack(ip, endpoint) {
        const ipCount = this.requestsPerIP[ip].length;
        const endpointCount = this.requestsPerEndpoint[endpoint].length;
        
        // Volumetric attack: One IP making 100+ requests/min
        if (ipCount > this.volumetricThreshold) {
            this.createAlert({
                type: 'VOLUMETRIC_ATTACK',
                severity: 'CRITICAL',
                ip: ip,
                requestsPerMinute: ipCount,
                threshold: this.volumetricThreshold
            });
        }
        // Spike attack: Single endpoint getting 50+ requests/min
        else if (endpointCount > this.spikeThreshold) {
            this.createAlert({
                type: 'SPIKE_ATTACK',
                severity: 'HIGH',
                endpoint: endpoint,
                requestsPerMinute: endpointCount,
                threshold: this.spikeThreshold
            });
        }
    }
    
    /**
     * Create and log alert
     */
    createAlert(event) {
        event.timestamp = new Date().toISOString();
        this.alerts.push(event);
        
        // Keep only last 1000 alerts
        if (this.alerts.length > 1000) {
            this.alerts.shift();
        }
        
        console.error(`[DDoS ALERT] ${event.type} - ${event.severity}`, event);
        return event;
    }
    
    /**
     * Get statistics
     */
    getStats() {
        const totalIPs = Object.keys(this.requestsPerIP).length;
        const totalRequests = Object.values(this.requestsPerIP)
            .reduce((sum, reqs) => sum + reqs.length, 0);
        
        const topIPs = Object.entries(this.requestsPerIP)
            .map(([ip, reqs]) => ({ ip, count: reqs.length }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        
        const recentAlerts = this.alerts.slice(-10);
        
        return {
            uniqueIPs: totalIPs,
            totalRequests: totalRequests,
            avgPerIP: Math.round(totalRequests / (totalIPs || 1)),
            topIPs: topIPs,
            recentAlerts: recentAlerts
        };
    }
}

// ============================================================
// REQUEST DEDUPLICATION
// ============================================================

class RequestDeduplicator {
    constructor(options = {}) {
        this.windowMs = options.windowMs || 5000;  // 5 second window
        this.requestHashes = {};
    }
    
    /**
     * Generate request hash (unique identifier)
     */
    generateHash(req) {
        const crypto = require('crypto');
        const components = [
            req.method,
            req.path,
            JSON.stringify(req.query),
            JSON.stringify(req.body),
            req.ip
        ];
        
        return crypto.createHash('md5').update(components.join('|')).digest('hex');
    }
    
    /**
     * Check if request is duplicate
     */
    isDuplicate(req) {
        const hash = this.generateHash(req);
        const isDup = this.requestHashes[hash] && 
                      Date.now() - this.requestHashes[hash] < this.windowMs;
        
        if (isDup) {
            return true;
        }
        
        // Record request
        this.requestHashes[hash] = Date.now();
        
        // Clean old entries
        const cutoff = Date.now() - this.windowMs;
        for (const [h, timestamp] of Object.entries(this.requestHashes)) {
            if (timestamp < cutoff) {
                delete this.requestHashes[h];
            }
        }
        
        return false;
    }
}

// ============================================================
// MIDDLEWARE FACTORY
// ============================================================

const botDetector = new BotDetector();
const ipBlocker = new IPBlocker();
const circuitBreaker = new CircuitBreaker();
const ddosDetector = new DDoSDetector();
const deduplicator = new RequestDeduplicator();

/**
 * Express middleware for DDoS protection
 */
function createDDoSProtectionMiddleware() {
    return async (req, res, next) => {
        const ip = req.ip;
        
        // Check 1: Is IP blacklisted?
        const { blocked } = await ipBlocker.isBlacklisted(ip);
        if (blocked) {
            return res.status(403).json({ 
                error: 'Your IP has been blocked',
                contactSupport: true 
            });
        }
        
        // Check 2: Is IP whitelisted? (skip remaining checks)
        const whitelisted = await ipBlocker.isWhitelisted(ip);
        if (whitelisted) {
            return next();
        }
        
        // Check 3: Circuit breaker (server overloaded?)
        if (!circuitBreaker.check()) {
            return res.status(503).json({ 
                error: 'Server overloaded, please try again later' 
            });
        }
        
        // Check 4: Duplicate request?
        if (deduplicator.isDuplicate(req)) {
            return res.status(429).json({ 
                error: 'Duplicate request detected' 
            });
        }
        
        // Check 5: Bot detection
        const botScore = botDetector.calculateBotScore(req);
        const riskLevel = botDetector.getRiskLevel(botScore);
        
        if (riskLevel === 'CRITICAL') {
            await ipBlocker.incrementSuspicion(ip, 50);
            return res.status(403).json({ 
                error: 'Suspicious activity detected' 
            });
        } else if (riskLevel === 'HIGH') {
            await ipBlocker.incrementSuspicion(ip, 20);
            // Continue but log
            req.suspiciousActivity = true;
        }
        
        // Check 6: Record for DDoS detection
        ddosDetector.recordRequest(ip, req.path);
        
        // Continue to next middleware
        next();
    };
}

module.exports = {
    BotDetector,
    IPBlocker,
    CircuitBreaker,
    DDoSDetector,
    RequestDeduplicator,
    botDetector,
    ipBlocker,
    circuitBreaker,
    ddosDetector,
    deduplicator,
    createDDoSProtectionMiddleware
};
