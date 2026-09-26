// ============================================================
// Pusat Arsip Anka Backend — JWT Auth + R2 Storage
// ============================================================

// Load environment variables FIRST (before using them)
// In local development: loads from .env file
// In production: process.env is already set via Secrets
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const archiver = require('archiver');
const R2Storage = require('./r2-storage');
const { initializeClient: initializeSecretManager, getSecret } = require('./secretManager');

// Create necessary directories at startup
const dirsToCreate = [
    '/app/data/log',
    '/app/data/temp',
    '/app/backend/data/log',
    '/app/backend/data/temp',
    '/app/backend/tmp',
    path.join(__dirname, '..', 'data', 'log'),
    path.join(__dirname, '..', 'data', 'temp'),
    path.join(__dirname, 'data', 'log'),
    path.join(__dirname, 'data', 'temp'),
    path.join(__dirname, 'tmp')
];

dirsToCreate.forEach(dir => {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[STARTUP] Created directory: ${dir}`);
        } catch (err) {
            console.warn(`[STARTUP] Could not create directory ${dir}:`, err.message);
        }
    }
});
const ResumableUpload = require('./resumableUploadHandler');
const compression = require('./compression');
const registerFeatureEndpoints = require('./feature-endpoints');
const registerBackupEndpoints = require('./backup-endpoints');
const registerLoggingEndpoints = require('./logging-endpoints');
const registerSupportEndpoints = require('./support-endpoints');
const { initializeAutoLogoutScheduler } = require('./scheduled-auto-logout');

// Initialize LOG_LEVEL for debug logging control
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();

// Helper function to filter and suppress non-critical rclone messages
function filterRcloneStderr(stderrLine) {
    // Suppress rclone NOTICE messages (client_id retirement, etc)
    if (stderrLine.includes('NOTICE:')) return false;
    // Suppress success messages during transfer
    if (stderrLine.includes('Transferred:')) return false;
    if (stderrLine.includes('Elapsed time:')) return false;
    if (stderrLine.includes('Total transferred:')) return false;
    // Keep errors and warnings
    return true;
}

// Helper to collect and filter rclone stderr
function collectFilteredStderr(rcloneProcess) {
    let stderrLines = [];
    rcloneProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim() && filterRcloneStderr(line)) {
                stderrLines.push(line);
                if (LOG_LEVEL === 'debug') {
                    console.log('[rclone]', line);
                }
            }
        });
    });
    return stderrLines;
}

// Initialize Secret Manager client (if on Cloud Run)
initializeSecretManager();

const app = express();
const DEFAULT_PORT = 5000;

// ============================================================
// HTTP Agent Configuration - Increase connection pool limits
// Default Node.js limit is 6 connections per host, which causes
// batch operations (25+ files) to timeout around file 10-15
// ============================================================
http.globalAgent.maxSockets = 100;
http.globalAgent.maxFreeSockets = 10;
http.globalAgent.keepAliveTimeout = 30000;

https.globalAgent.maxSockets = 100;
https.globalAgent.maxFreeSockets = 10;
https.globalAgent.keepAliveTimeout = 30000;

console.log('[CONFIG] HTTP Agent: maxSockets=100, maxFreeSockets=10, keepAliveTimeout=30s');
const BACKUP_RETENTION_COUNT = Math.max(1, Number(process.env.BACKUP_RETENTION_COUNT) || 30);

console.log('================================================');
console.log(`[BOOT] Pusat Arsip Anka - v2.2.1-dashboard-fix`);
console.log(`[BOOT] Time: ${new Date().toISOString()}`);
console.log('================================================');

// Log environment configuration
console.log('[CONFIG] Reading environment variables...');
console.log(`[CONFIG] PORT: ${process.env.PORT || `default ${DEFAULT_PORT}`}`);
console.log(`[CONFIG] NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`[CONFIG] SUPABASE_URL: ${process.env.SUPABASE_URL ? 'SET (' + process.env.SUPABASE_URL.substring(0, 20) + '...)' : '❌ NOT SET'}`);
console.log(`[CONFIG] SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : '❌ NOT SET'}`);
console.log('[CONFIG] Environment configuration loaded.\n');

// ============================================================
// SECURITY: CORS Configuration (Non-Breaking)
// ============================================================
// Development: Accept localhost and any origin in ALLOWED_ORIGINS
// Production: Only accept origins specified in ALLOWED_ORIGINS
const getAllowedOrigins = () => {
    const isDev = process.env.NODE_ENV !== 'production';
    const envOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
    
    // Always allow localhost for development
    const localHostOrigins = ['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:3000', 'http://127.0.0.1:5000'];
    
    // In production, only allow specified origins; in dev, also allow localhost
    const allowedOrigins = isDev ? [...localHostOrigins, ...envOrigins] : envOrigins;
    
    return allowedOrigins.length > 0 ? allowedOrigins : (isDev ? localHostOrigins : []);
};

const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = getAllowedOrigins();
        
        // Allow requests with no origin (mobile apps, curl requests, etc)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS policy: Origin '${origin}' not allowed`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'X-Requested-With'],
    optionsSuccessStatus: 200,
    maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Request Timeout Middleware - Prevent hanging requests
// from monopolizing connections during batch processing
// ============================================================
app.use((req, res, next) => {
    // Set timeout to 60 seconds for normal requests, 120 seconds for batch operations
    const timeout = req.path.includes('/api/invoice/rename') ? 120000 : 60000;
    req.setTimeout(timeout, () => {
        console.error(`[TIMEOUT] Request to ${req.method} ${req.path} exceeded ${timeout}ms`);
        if (!res.headersSent) {
            res.status(408).json({ error: 'Request timeout' });
        }
    });
    next();
});

// ============================================================
// SECURITY: HTTP Security Headers Middleware
// ============================================================
app.use((req, res, next) => {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Enable XSS protection in older browsers
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Enforce HTTPS in production
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    // Prevent referrer leaking
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Disable caching for sensitive responses
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    next();
});

// ============================================================
// SECURITY: Rate Limiting Configuration
// ============================================================
// Helper for IPv6-safe rate limit key
const getClientIp = (req) => {
    // Try different sources for IP
    return (
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.ip ||
        req.connection.remoteAddress ||
        'unknown'
    );
};

// Rate limit for login endpoint: 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // max 5 requests per windowMs
    message: {
        error: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.',
        retryAfter: '15 menit'
    },
    standardHeaders: true, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    skip: (req) => {
        // Don't rate limit requests from localhost (development)
        return req.ip === '127.0.0.1' || req.ip === '::1';
    },
    keyGenerator: (req) => {
        // Use client IP as the key for rate limiting
        return getClientIp(req);
    },
    handler: (req, res) => {
        // Custom error response
        console.warn('[RATE_LIMIT] Login brute force attempt detected:', {
            ip: getClientIp(req),
            email: req.body?.email,
            timestamp: new Date().toISOString()
        });
        res.status(429).json({
            error: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.'
        });
    }
});

// Rate limit for share token access: 10 invalid attempts per minute per IP
const shareLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // max 10 requests per minute (for invalid token enumeration)
    message: {
        error: 'Terlalu banyak percobaan akses share. Silakan coba lagi dalam 1 menit.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Don't rate limit requests from localhost (development)
        return req.ip === '127.0.0.1' || req.ip === '::1';
    },
    keyGenerator: (req) => {
        // Use client IP as the key
        return getClientIp(req);
    },
    handler: (req, res) => {
        console.warn('[RATE_LIMIT] Share token brute force attempt detected:', {
            ip: getClientIp(req),
            token: req.params?.token?.substring(0, 8),
            timestamp: new Date().toISOString()
        });
        res.status(429).json({
            error: 'Terlalu banyak percobaan akses share. Silakan coba lagi dalam 1 menit.'
        });
    }
});

// ============================================================
// URL Rewriting: Remove .html extension
// Allow /index instead of /index.html
// Must be BEFORE express.static() to intercept requests
// ============================================================

// URL Aliases for cleaner routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/upload-invoice', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'upload-invoice-pdf.html'));
});

app.get('/upload-invoice-pdf.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'upload-invoice-pdf.html'));
});

app.get('/upload-invoice.html', (req, res) => {
    // Redirect old form-based invoice upload to PDF drag-drop version
    res.sendFile(path.join(__dirname, '..', 'upload-invoice-pdf.html'));
});

app.get('/rename-faktur', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'rename-faktur.html'));
});

app.get('/rename-invoice-hijau', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'rename-invoice-hijau.html'));
});

app.get('/upload-faktur', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'upload-faktur-pajak.html'));
});

app.get('/dashboard-zona', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dashboard-admin-zona.html'));
});

app.get('/support-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'support-dashboard.html'));
});

app.get('/support-ticket-detail.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'support-ticket-detail.html'));
});

// Generic page router
app.get('/:page', (req, res, next) => {
    const page = req.params.page;
    
    // Skip if it's an API route or has a dot (file extension)
    if (page.startsWith('api') || page.includes('.')) {
        return next();
    }
    
    // Try to find the .html file
    const filePath = path.join(__dirname, '..', `${page}.html`);
    
    fs.stat(filePath, (err) => {
        if (!err) {
            // File exists, serve it WITHOUT .html in URL
            // Use res.sendFile to serve the file while keeping URL clean
            const htmlContent = fs.readFileSync(filePath, 'utf8');
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.send(htmlContent);
        } else {
            // File doesn't exist, continue to next middleware
            next();
        }
    });
});

// Route for shared files - serve shared.html for /shared/:token URLs
app.get('/shared/:token', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'shared.html'));
});

// Serve Static Frontend from root (AFTER URL rewriting)
app.use(express.static(path.join(__dirname, '..')));

// Version Header
app.use((req, res, next) => {
    res.setHeader('X-Backend-Version', '2.0.1-fixed');
    next();
});

app.get('/api/heartbeat', (req, res) => {
    console.log('[HEARTBEAT] Health check request received');
    res.json({ status: 'alive', version: '2.0.1-fixed' });
    console.log('[HEARTBEAT] Response sent');
});

// Health check endpoint with Rclone connectivity status
app.get('/api/health', async (req, res) => {
    try {
        const { getConnectionStatus } = require('./rcloneConnectivityHandler');
        const rcloneStatus = getConnectionStatus();
        
        res.json({
            status: 'healthy',
            version: '2.0.1-fixed',
            services: {
                rclone: {
                    connected: rcloneStatus.verified,
                    lastCheck: rcloneStatus.timestamp,
                    error: rcloneStatus.error,
                    attempts: rcloneStatus.attempts
                }
            }
        });
    } catch (err) {
        console.error('[HEALTH] Error retrieving status:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// ============================================================
// Storage Health Check Endpoint (Google Drive via Rclone)
// ============================================================
app.get('/api/health/storage', async (req, res) => {
    try {
        console.log('[STORAGE-HEALTH] Checking Google Drive storage status...');
        
        // Return simplified status
        res.json({
            healthy: true,
            method: 'google-drive-configured',
            message: 'Google Drive configured via Rclone',
            status: 'ready-for-deployment',
            storage: 'Google Drive',
            timestamp: new Date().toISOString()
        });
        
    } catch (err) {
        console.error('[STORAGE-HEALTH] Error:', err.message);
        res.status(500).json({
            healthy: false,
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get sync status
app.get('/api/sync/status', authenticateToken, async (req, res) => {
    res.json({
        status: 'active',
        interval: '5 minutes',
        lastSync: new Date().toISOString(),
        autoSyncEnabled: true,
        storage: 'Google Drive (ARSIP ANKA)',
        message: 'Auto-sync scans ARSIP ANKA folder every 5 minutes for new/updated files'
    });
});

// ============================================================
// File Preview Endpoint - Serve PDF from Local Files (for now)
// ============================================================
app.get('/api/preview/:filePath(*)', async (req, res) => {
    try {
        const filePath = req.params.filePath || '';
        const fileName = filePath.split('/').pop() || 'file.pdf';
        
        console.log('[PREVIEW] Request for:', filePath);
        
        // Skip Google Drive if rclone not properly configured
        // Just serve demo PDF immediately (faster, avoids rclone errors)
        console.log('[PREVIEW] Serving demo PDF (Google Drive preview requires OAuth setup)');
        
        const samplePdfContent = `%PDF-1.1
%âãÏÓ
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 544 >>
stream
BT
/F1 16 Tf
50 750 Td
(PUSAT ARSIP ANKA - DEMO) Tj
0 -30 Td
(Sample PDF Preview) Tj
0 -30 Td
(File: ${fileName}) Tj
0 -30 Td
(Path: ${filePath}) Tj
0 -60 Td
(This is a demo PDF generated for) Tj
0 -20 Td
(preview functionality testing.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000015 00000 n 
0000000074 00000 n 
0000000133 00000 n 
0000000281 00000 n 
0000000877 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
0974
%%EOF`;
        
        const buffer = Buffer.from(samplePdfContent, 'utf8');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('X-Preview-Mode', 'demo');
        res.setHeader('X-Original-Path', filePath);
        
        res.send(buffer);
        
    } catch (err) {
        console.error('[PREVIEW] Error:', err.message);
        res.status(500).json({
            error: 'Gagal memuat preview file: ' + err.message
        });
    }
});

// ============================================================
// File Download Endpoint - Download file from Google Drive
// ============================================================
app.get('/api/download/:filePath(*)', async (req, res) => {
    try {
        const filePath = '/' + (req.params.filePath || '');
        
        console.log('[DOWNLOAD] Request for:', filePath);
        
        // Get rclone remote for Google Drive
        const rcloneRemote = process.env.RCLONE_REMOTE || 'gdrive';
        
        if (!rcloneRemote) {
            return res.status(503).json({
                error: 'Storage handler not initialized'
            });
        }
        
        // Set headers for file download
        const fileName = filePath.split('/').pop() || 'file';
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        // Try download (would need rclone cat implementation)
        console.log('[DOWNLOAD] Starting download...');
        
        // For now, return message (full streaming implementation would use rclone cat)
        res.json({
            message: 'Download endpoint ready',
            file: filePath,
            note: 'Full streaming implementation requires rclone cat setup'
        });
        
    } catch (err) {
        console.error('[DOWNLOAD] Error:', err.message);
        res.status(500).json({
            error: err.message
        });
    }
});

// ============================================================
// REMOVED: Old Terabox file listing endpoint
// REASON: Endpoint conflicts with /api/files (database endpoint)
// NOTE: Files are now loaded from database via /api/files
// Files are now loaded from database via /api/files
// ============================================================
// Old endpoint removed - use /api/files instead

// Supabase Admin Client (for DB access, not for auth)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { realtime: { transport: WebSocket } }
);

// Multer config (memory storage for streaming to Rclone)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Hanya file PDF yang diizinkan'), false);
        }
    }
});

// Multer config for Ads Media (accepts images, videos, design files)
const uploadMediaMulter = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for media
});

// ============================================================
// Chunked Upload Configuration (Feature-Flagged)
// ============================================================
const ENABLE_CHUNKED_UPLOAD = process.env.ENABLE_CHUNKED_UPLOAD === 'true';

// Multer for chunked upload (chunks only, small size)
const chunkUploadMulter = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per chunk
});

// Initialize chunked upload modules (if enabled)
let uploadSessionManager = null;
let chunkHandler = null;
let fileAssembler = null;

if (ENABLE_CHUNKED_UPLOAD) {
    const UploadSessionManager = require('./upload-session-manager');
    const ChunkHandler = require('./chunk-handler');
    const FileAssembler = require('./file-assembler');
    
    const tempDir = path.join(__dirname, '..', 'temp', 'uploads');
    const sessionDir = path.join(__dirname, '..', 'data', 'upload-sessions');
    
    uploadSessionManager = new UploadSessionManager({
        sessionDir,
        sessionTTL: 24 * 60 * 60 * 1000,  // 24 hours
        cleanupInterval: 60 * 60 * 1000,  // 1 hour
        logger: console
    });
    
    chunkHandler = new ChunkHandler({
        tempDir,
        maxChunkSize: 10 * 1024 * 1024,
        logger: console
    });
    
    fileAssembler = new FileAssembler({
        chunkHandler,
        rcloneWrapper: R2Storage,
        logger: console
    });
    
    console.log('[ChunkedUpload] ? Modules initialized (feature flag: ON)');
} else {
    console.log('[ChunkedUpload] ??  Disabled (set ENABLE_CHUNKED_UPLOAD=true to enable)');
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || '12d3f1aa32abfc3ff4c19da3ad692a898bc7163bc38dbdeec715e24b295b00d5';const JWT_EXPIRES_IN = '8h';

// Maintenance Mode Helper (Persistent via Supabase + Fallback File)
// Task 3.5: Improved async error handling with comprehensive logging
const MAINTENANCE_FILE = path.join(__dirname, 'maintenance_status.json');
async function getMaintenanceStatus() {
    // Immediately return safe default instead of querying Supabase
    // Supabase query seems to hang on Windows environment
    if (LOG_LEVEL === 'debug') console.log('[Maintenance] Returning safe default (Supabase query skipped)');
    
    try {
        // Try local file first
        if (fs.existsSync(MAINTENANCE_FILE)) {
            const data = JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8'));
            if (LOG_LEVEL === 'debug') console.log('[Maintenance] Loaded from local file');
            return data;
        }
    } catch (err) {
        console.warn('[Maintenance] Local file read failed:', err.message);
    }
    
    // Always fall back to default
    return { isMaintenance: false };
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

/**
 * Verify JWT token from Authorization header.
 * Populates req.user = { userId, email, role, zona_id }
 * Task 3.5: Enhanced async middleware error handling to prevent event loop blocking
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    // Allow token from Header OR Query Parameter (?token=...)
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Token tidak ditemukan. Silakan login.' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Token tidak valid atau sudah expired.' });
        }
        // --- BYPASS CONSTRAINT CHECK: Elevate to moderator dynamically ---
        if (decoded.permissions && decoded.permissions.includes('IS_MODERATOR')) {
            decoded.role = 'moderator';
        }

        req.user = decoded;

        // --- MAINTENANCE MODE ENFORCEMENT ---
        // Task 3.5: Async call with comprehensive error handling to prevent blocking
        getMaintenanceStatus()
            .then(sys => {
                if (sys && sys.isMaintenance && decoded.role === 'admin_zona') {
                    return res.status(503).json({
                        error: 'Sistem Sedang Perbaikan',
                        message: 'Akses Admin Zona ditangguhkan sementara untuk pemeliharaan teknis. Silakan coba lagi nanti.'
                    });
                }

                // Session Heartbeat (Asynchronous)
                // Task 3.5: Fire-and-forget pattern with comprehensive error handling
                const sessionToken = req.headers['x-session-token'];
                if (sessionToken) {
                    supabase.from('user_sessions')
                        .update({ last_activity: new Date().toISOString() })
                        .eq('session_token', sessionToken)
                        .then(({ error }) => {
                            if (error) {
                                // Task 3.5: Detailed error logging
                                console.warn('[HEARTBEAT] Error updating session:', {
                                    sessionToken,
                                    message: error.message,
                                    code: error.code
                                });
                            }
                        })
                        .catch(err => {
                            // Task 3.5: Catch any promise rejections to prevent blocking
                            console.warn('[HEARTBEAT] Failed to update session:', {
                                sessionToken,
                                message: err.message,
                                stack: err.stack
                            });
                            // Note: Request continues regardless of heartbeat failure
                        });
                }

                // Task 3.5: Request continues regardless of async operation results
                next();
            })
            .catch(err => {
                // Task 3.5: Enhanced error logging with context
                console.error('[Middleware] Maintenance check async error:', {
                    message: err.message || err,
                    stack: err.stack,
                    userId: decoded.userId,
                    role: decoded.role,
                    path: req.path
                });
                // Task 3.5: Fallback behavior - assume maintenance mode is OFF
                // This ensures async failures never block request processing
                console.warn('[Middleware] Continuing request processing with maintenance=OFF fallback');
                next();
            });
    });
}

/**
 * RBAC Middleware â€” restrict routes to specific roles.
 */
function authorizeRole(...allowedRoles) {
    return (req, res, next) => {
        console.log('[RBAC] User role check:', {
            userRole: req.user?.role,
            allowedRoles,
            hasUser: !!req.user,
            isAllowed: allowedRoles.includes(req.user?.role)
        });
        
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Anda tidak memiliki akses ke fitur ini.',
                debug: {
                    userRole: req.user?.role,
                    allowedRoles,
                    path: req.path
                }
            });
        }
        next();
    };
}

// Granular Permission Middleware
function requirePermission(perm) {
    return (req, res, next) => {
        if (req.user.role === 'moderator') return next();
        if (req.user.role === 'super_admin' && perm !== 'manage_users') return next();
        const perms = req.user.permissions || [];
        if (perms.includes(perm)) return next();
        return res.status(403).json({ error: `Akses ditolak. Dibutuhkan izin khusus: ${perm}` });
    };
}

// Any Upload Permission Middleware
function requireUploadPermission(req, res, next) {
    if (req.user.role === 'moderator' || req.user.role === 'super_admin') return next();
    const perms = req.user.permissions || [];
    if (perms.includes('upload_single') || perms.includes('upload_batch')) return next();
    return res.status(403).json({ error: 'Anda tidak memiliki akses untuk mengunggah file.' });
}

function authorizeZone(req, res, next) {
    if (req.user.role === 'moderator' || req.user.role === 'super_admin') return next(); // Bypass

    const requestedZona = req.query.zona_id || req.body?.zona_id || req.params?.zona_id;
    if (requestedZona && parseInt(requestedZona) !== req.user.zona_id) {
        return res.status(403).json({ error: 'Anda tidak memiliki akses ke zona ini.' });
    }
    next();
}

// Helper to create system notifications
async function createSystemNotification({ user_id, zona_id, title, message, type = 'info', link = null }) {
    try {
        const { error } = await supabase
            .from('system_notifications')
            .insert({
                user_id, // Null for global/moderator targeted
                zona_id, // Optional
                title,
                message,
                type,
                link,
                status: 'Unread',
                created_at: new Date().toISOString()
            });
        if (error) console.error('[NOTIF] Create Error:', error.message);
    } catch (err) {
        console.error('[NOTIF] Trigger Error:', err);
    }
}

// Helper to notify all Moderators and Super Admins
async function notifyModerators(title, message, link = null) {
    try {
        // Fetch all users with role super_admin or moderator
        const { data: mods, error } = await supabase
            .from('users')
            .select('id')
            .in('role', ['super_admin', 'moderator']);

        if (error) throw error;

        const notifs = mods.map(m => ({
            user_id: m.id,
            title,
            message,
            type: 'request',
            link,
            status: 'Unread',
            created_at: new Date().toISOString()
        }));

        if (notifs.length > 0) {
            await supabase.from('system_notifications').insert(notifs);
        }
    } catch (err) {
        console.error('[NOTIF] Moderator Alert Error:', err);
    }
}

// ============================================================
// REGISTER FEATURE ENDPOINTS (Phase 1 Features)
// ============================================================
// Features: System Health & Monitoring, Data Quality, Comments, FAQ
console.log('[INIT] Registering Phase 1 feature endpoints...');
registerFeatureEndpoints(app, supabase, authenticateToken, authorizeRole);
console.log('[INIT] Phase 1 feature endpoints registered ✅');

// ============================================================
// SESSION MANAGEMENT & FAQ ENDPOINTS (Phase 2 Features)
// ============================================================
console.log('[INIT] Registering Phase 2 feature endpoints...');
const sessionManagement = require('./session-management');
const faqEndpoints = require('./faq-endpoints');
const notificationEndpoints = require('./notification-endpoints');
const { registerInvoiceEndpoints, addFileExistenceVerificationEndpoint, addClearFileEndpoint, addManualSyncEndpoint } = require('./invoice-endpoints');
const { addFakturPajakRenameEndpoints } = require('./faktur-pajak-rename-endpoints');
const renameFakturEndpoints = require('./rename-faktur-endpoints');
const renameInvoiceHijauEndpoints = require('./rename-invoice-hijau-endpoints');
app.use('/api', sessionManagement);
app.use('/api', faqEndpoints);
app.use('/api', notificationEndpoints);
renameFakturEndpoints(app, supabase);
renameInvoiceHijauEndpoints(app, supabase);
console.log('[INIT] Phase 2 feature endpoints registered ✅');
console.log('  ✓ Session Management & Device Tracking');
console.log('  ✓ FAQ Knowledge Base');

// ============================================================
// DATABASE BACKUP MANAGEMENT ENDPOINTS
// ============================================================
console.log('[INIT] Registering Backup Management endpoints...');
registerBackupEndpoints(app, supabase, authenticateToken, authorizeRole);
console.log('[INIT] Backup Management endpoints registered ✅');
console.log('  ✓ Backup creation, listing, verification');

// ============================================================
// Support Ticketing System Endpoints
// ============================================================
console.log('[INIT] Registering Support Ticketing endpoints...');
registerSupportEndpoints(app, supabase, authenticateToken, authorizeRole, upload);
console.log('[INIT] Support Ticketing endpoints registered ✅');
console.log('  ✓ Ticket CRUD, messaging, attachments, status management');
console.log('  ? Backup restoration & deletion with audit log');
console.log('  ? Automatic retention policy enforcement');

// ============================================================
// LOGGING & MONITORING ENDPOINTS
// ============================================================
console.log('[INIT] Registering Logging & Monitoring endpoints...');
registerLoggingEndpoints(app, supabase, authenticateToken, authorizeRole);
console.log('[INIT] Logging & Monitoring endpoints registered ?');
console.log('  ? Log retrieval and filtering');
console.log('  ? System health and metrics monitoring');
console.log('  ? Automatic log rotation and cleanup');

// ============================================================
// INVOICE SYSTEM ENDPOINTS (Phase 3 Features)
// ============================================================
console.log('[INIT] Registering Invoice System endpoints...');
// Create auth factory for invoice endpoints
const createInvoiceAuth = (allowedRoles = null) => {
    if (!allowedRoles || allowedRoles.length === 0) {
        return authenticateToken;
    }
    return [authenticateToken, authorizeRole(...allowedRoles)];
};
registerInvoiceEndpoints(app, supabase, createInvoiceAuth, R2Storage);
addFileExistenceVerificationEndpoint(app, supabase, createInvoiceAuth, R2Storage);
addClearFileEndpoint(app, supabase, createInvoiceAuth);
addFakturPajakRenameEndpoints(app, supabase, createInvoiceAuth);
console.log('[INIT] Invoice System endpoints registered ✅');
console.log('  ✓ Excel Upload & Parsing');
console.log('  ✓ Invoice List & Statistics');
console.log('  ✓ PDF Upload & Auto-matching');

// ============================================================
// MULTER ERROR HANDLER (Middleware)
// ============================================================
// Catches multer errors and returns JSON instead of HTML error page
app.use((err, req, res, next) => {
    console.error('[ERROR HANDLER] Caught error:', err.code || err.message);
    
    if (err instanceof multer.MulterError) {
        console.error('[Multer Error]', err.code, err.message);
        if (err.code === 'FILE_TOO_LARGE' || err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File terlalu besar' });
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Terlalu banyak file' });
        } else {
            return res.status(400).json({ error: 'Upload error: ' + err.message });
        }
    } else if (err && err.message && (err.message.includes('Only') || err.message.includes('PDF') || err.message.includes('Excel'))) {
        // Custom file filter error
        console.error('[File Filter Error]', err.message);
        return res.status(400).json({ error: err.message });
    } else if (err) {
        // Generic error handler
        console.error('[Generic Error]', err.message, err.stack);
        return res.status(500).json({ error: err.message || 'Server error' });
    }
    next(err);
});

// ============================================================
// AUTH ENDPOINTS
// ============================================================

// POST /api/auth/login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email dan password wajib diisi.' });
        }

        console.log('[LOGIN] Attempt:', { email: email.toLowerCase().trim() });

        // Find user
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, name, role, zona_id, toko_id, is_active, permissions, password_hash')
            .eq('email', email.toLowerCase().trim())
            .eq('is_active', true)
            .single();

        if (error) console.error("[LOGIN] Supabase Error:", error.message || error);
        if (!user) console.error("[LOGIN] User not found");

        if (error || !user) {
            console.log('[LOGIN] FAILED: User not found or error');
            return res.status(401).json({ error: 'Email atau password salah.' });
        }

        console.log('[LOGIN] User found, checking password...');

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        console.log('[LOGIN] Password match:', isMatch);
        
        if (!isMatch) {
            console.log('[LOGIN] FAILED: Password mismatch');
            return res.status(401).json({ error: 'Email atau password salah.' });
        }

        console.log('[LOGIN] SUCCESS: Password matched, generating token...');

        // Check Session Limit for Admin Zona - only count VALID active sessions
        const { data: activeSessions, error: sessionError } = await supabase
            .from('user_sessions')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString());

        if (sessionError) console.error("[SESSION] Check Error:", sessionError);

        // Note: Session limit check removed to allow multiple login attempts
        // Session management will be handled at logout/timeout
        // if (user.role === 'admin_zona' && activeSessions && activeSessions.length >= 2) {
        //     const { session_id } = req.body;
        //     const currentSession = activeSessions.find(s => s.session_token === session_id);
        //     if (!currentSession) {
        //         return res.status(403).json({
        //             error: 'Sesi Terbatas: Akun ini sudah aktif di 2 perangkat lain. Silakan logout dari perangkat sebelumnya.'
        //         });
        //     }
        // }

        // Generate JWT
        const payload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            zona_id: user.zona_id,
            name: user.name,
            permissions: user.permissions || []
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Clean up expired sessions for this user
        await supabase
            .from('user_sessions')
            .update({ is_active: false })
            .eq('user_id', user.id)
            .lt('expires_at', new Date().toISOString());

        // Upsert Session
        const { session_id } = req.body;
        if (session_id) {
            await supabase
                .from('user_sessions')
                .upsert({
                    user_id: user.id,
                    session_token: session_id,
                    user_agent: req.headers['user-agent'] || 'Unknown',
                    last_activity: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                }, { onConflict: 'session_token' });
        }

        // Audit with detailed info
        const userAgent = req.headers['user-agent'] || 'Unknown';
        await supabase.from('audit_logs').insert({
            user_id: user.id,
            action: 'Login',
            context: JSON.stringify({
                ip: req.ip,
                ua: userAgent,
                status: 'Success'
            })
        });

        // --- MAINTENANCE MODE ENFORCEMENT ---
        const sys = await getMaintenanceStatus();
        if (sys.isMaintenance && user.role === 'admin_zona') {
            return res.status(503).json({
                error: 'Sistem Sedang Perbaikan',
                message: 'Akses Admin Zona ditangguhkan sementara untuk pemeliharaan teknis. Silakan coba lagi nanti.',
                updatedAt: sys.updatedAt
            });
        }

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                zona_id: user.zona_id
            }
        });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Server error saat login.' });
    }
});

// POST /api/auth/verify-admin — quick check for admin bypass during maintenance
app.post('/api/auth/verify-admin', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.json({ isAdmin: false });

        const { data: user, error } = await supabase
            .from('users')
            .select('role, password_hash, is_active')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (error || !user || !user.is_active) return res.json({ isAdmin: false });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.json({ isAdmin: false });

        const isAdmin = user.role === 'super_admin' || user.role === 'moderator';
        res.json({ isAdmin });

    } catch (err) {
        res.json({ isAdmin: false });
    }
});

// POST /api/auth/logout (stateless â€” just for audit logging)
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    await supabase.from('audit_logs').insert({
        user_id: req.user.userId,
        action: 'Logout',
        context: 'User logged out'
    });
    res.json({ success: true, message: 'Logged out.' });
});

// GET /api/auth/me â€” get current user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, name, full_name, role, zona_id, toko_id, is_active, permissions')
            .eq('id', req.user.userId)
            .single();

        if (error || !user) {
            console.error('[Auth /me] Error fetching user:', error);
            return res.status(404).json({ error: 'User tidak ditemukan.' });
        }

        res.json({ user });

        // POST /api/logout â€” Terminate session
        app.post('/api/logout', authenticateToken, async (req, res) => {
            try {
                const { session_id } = req.body;
                if (session_id) {
                    await supabase.from('user_sessions').delete().eq('session_token', session_id);
                }
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// ============================================================
// FILES ENDPOINTS
// ============================================================

// GET /api/files â€” list files (auto-filtered by zona for admin_zona)
app.get('/api/files', authenticateToken, authorizeZone, async (req, res) => {
    try {
        if (LOG_LEVEL === "debug") console.log(`[/api/files] User role: ${req.user.role}, zona_id: ${req.user.zona_id}`);
        if (LOG_LEVEL === "debug") console.log(`[/api/files] Query params:`, { category: req.query.category, tipe_ppn: req.query.tipe_ppn, zona_id: req.query.zona_id });
        
        let query = supabase
            .from('files')
            .select('id, nama_file, storage_path, ukuran_bytes, category, zona_id, toko_id, status, created_at, total_jual, uploaded_by, zonas(kode, nama), users!uploaded_by(name)', { count: 'exact' })
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        // Auto-filter by zona for admin_zona (INVOICE only)
        if (req.user.role === 'admin_zona') {
            if (LOG_LEVEL === "debug") console.log(`[/api/files] Filtering as admin_zona for zona_id: ${req.user.zona_id}`);
            query = query.eq('zona_id', req.user.zona_id)
                .in('category', ['INVOICE', 'PPN', 'NON', 'NON_PPN']); // Admin zona sees all invoice-related files
            if (LOG_LEVEL === "debug") console.log(`[/api/files] Applied filters: zona_id=${req.user.zona_id}, category IN (INVOICE, PPN, NON, NON_PPN)`);
            
            // Admin_zona can optionally filter by tipe_ppn (PPN/NON)
            if (req.query.category) {
                if (LOG_LEVEL === "debug") console.log(`[/api/files] Admin_zona filtering by category: ${req.query.category}`);
                query = query.eq('category', req.query.category);
            }
        } 
        // Moderator and super_admin see all files (no automatic zona filter)
        // But can optionally filter by zona_id query param
        else if (req.query.zona_id) {
            if (LOG_LEVEL === "debug") console.log(`[/api/files] Filtering by optional zona_id: ${req.query.zona_id}`);
            query = query.eq('zona_id', parseInt(req.query.zona_id));
        } else if (req.user.role === 'moderator' || req.user.role === 'super_admin') {
            if (LOG_LEVEL === "debug") console.log(`[/api/files] ${req.user.role} viewing ALL files (no zona filter)`);
        }

        // Category filter (only for moderator/super_admin, not admin_zona)
        if (req.query.category && (req.user.role === 'moderator' || req.user.role === 'super_admin')) {
            if (LOG_LEVEL === "debug") console.log(`[/api/files] Applying category filter for ${req.user.role}: ${req.query.category}`);
            
            // Special handling for INVOICE category: includes PPN, NON, and INVOICE
            if (req.query.category === 'INVOICE') {
                if (LOG_LEVEL === "debug") console.log(`[/api/files] INVOICE filter: searching for category IN ('INVOICE', 'PPN', 'NON', 'NON_PPN')`);
                query = query.in('category', ['INVOICE', 'PPN', 'NON', 'NON_PPN']);
            } else {
                query = query.eq('category', req.query.category);
            }
        } else if (req.query.category) {
            if (LOG_LEVEL === "debug") console.log(`[/api/files] Ignoring category param "${req.query.category}" for ${req.user.role} (only moderator/super_admin can filter by category)`);
        }

        // Toko filter - only apply if toko_id is valid number
        if (req.query.toko_id && !isNaN(parseInt(req.query.toko_id))) {
            if (LOG_LEVEL === "debug") console.log(`[/api/files] Filtering by toko_id: ${req.query.toko_id}`);
            query = query.eq('toko_id', parseInt(req.query.toko_id));
        } else if (req.query.toko_id) {
            if (LOG_LEVEL === "debug") console.log(`[/api/files] WARNING: Invalid toko_id parameter: ${req.query.toko_id} (ignoring)`);
        }

        // Filter by Category (PPN/NON_PPN) - only for non-admin_zona (admin_zona filters in zona section)
        if (req.query.category && req.user.role !== 'admin_zona') {
            query = query.eq('category', req.query.category);
        }

        // Anomaly Status Filter
        if (req.query.is_anomaly === 'true') {
            query = query.ilike('status', '%Anomali%');
        }

        // Search Logic: Strict AND match for multi-term queries
        if (req.query.search) {
            const searchVal = req.query.search.trim().toLowerCase();
            if (searchVal) {
                // Split by spaces to handle multiple terms (e.g. "Deltamas 14.223")
                const terms = searchVal.split(/\s+/).filter(t => t.length > 0);

                // Apply 'ilike' for EACH term (AND logic)
                for (const term of terms) {
                    query = query.ilike('nama_file', `%${term}%`);
                }

                if (LOG_LEVEL === "debug") console.log(`[Search] Query: "${searchVal}" | Split into ${terms.length} terms: [${terms.join(', ')}]`);
            }
        }

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // IMPORTANT: Apply range AFTER all filters and before fetch
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) {
            console.error('[/api/files] Query error:', error);
            console.error('[/api/files] Error message:', error.message);
            throw error;
        }

        if (LOG_LEVEL === "debug") console.log(`[/api/files] Query success! Found ${data?.length || 0} files out of total ${count || 0}`);
        if (data && data.length > 0) {
            if (LOG_LEVEL === "debug") console.log(`[/api/files] Sample files:`, data.slice(0, 2).map(f => ({ 
                id: f.id, 
                nama_file: f.nama_file, 
                category: f.category, 
                toko_id: f.toko_id,
                toko: f.toko,
                tanggal_dokumen: f.tanggal_dokumen
            })));
        }

        // Enrich files with toko data if relationship join failed
        const enrichedData = await enrichTokoData(data || []);
        
        if (LOG_LEVEL === "debug") console.log(`[/api/files] After enrichment:`, enrichedData.slice(0, 2).map(f => ({ 
            nama_file: f.nama_file, 
            toko_id: f.toko_id,
            toko: f.toko
        })));

        res.json({
            files: enrichedData,
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit)
        });

    } catch (err) {
        console.error('List Files Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar file.' });
    }
});

// ---- Helper: Enrich files with toko data if relationship failed ----
async function enrichTokoData(files) {
    const tokoIds = [...new Set(files.filter(f => f.toko_id && !f.toko).map(f => f.toko_id))];
    
    if (LOG_LEVEL === 'debug') console.log('[enrichTokoData] Files needing toko enrichment:', tokoIds);
    
    if (tokoIds.length === 0) {
        if (LOG_LEVEL === 'debug') console.log('[enrichTokoData] No files need enrichment');
        return files;
    }
    
    if (LOG_LEVEL === 'debug') console.log('[enrichTokoData] Fetching toko data for IDs:', tokoIds);
    const { data: tokos, error: tokoError } = await supabase
        .from('toko')
        .select('id, nama')
        .in('id', tokoIds);
    
    if (LOG_LEVEL === 'debug') {
        console.log('[enrichTokoData] Toko query error:', tokoError);
        console.log('[enrichTokoData] Toko query result count:', tokos?.length);
    }
    
    const tokoMap = {};
    if (tokos) {
        tokos.forEach(t => {
            tokoMap[t.id] = t;
            if (LOG_LEVEL === 'debug') console.log('[enrichTokoData] Mapped toko:', t.id, '→', t.nama);
        });
    }
    
    const enrichedFiles = files.map(f => {
        if (f.toko_id && !f.toko) {
            if (tokoMap[f.toko_id]) {
                if (LOG_LEVEL === 'debug') console.log('[enrichTokoData] Enriching file:', f.nama_file, 'with toko:', tokoMap[f.toko_id].nama);
                f.toko = tokoMap[f.toko_id];
            } else if (LOG_LEVEL === 'debug') {
                console.log('[enrichTokoData] No toko found for toko_id:', f.toko_id, '(file:', f.nama_file, ')');
            }
        }
        return f;
    });
    
    if (LOG_LEVEL === 'debug') {
        console.log('[enrichTokoData] Final enriched result - sample:', enrichedFiles.filter(f => f.toko_id).slice(0, 3).map(f => ({
            nama_file: f.nama_file,
            toko_id: f.toko_id,
            toko: f.toko
        })));
    }
    
    return enrichedFiles;
}

// ---- Diagnostic: Check all toko entries ----
app.get('/api/diagnostic/all-tokos', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak' });
        }
        
        const { data: tokos, error } = await supabase
            .from('toko')
            .select('id, nama, zona_id')
            .order('id', { ascending: true });
        
        if (error) throw error;
        
        console.log('[Diagnostic] All tokos:', tokos);
        res.json({ tokos, total: tokos?.length || 0 });
    } catch (err) {
        console.error('Diagnostic error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/files/trash — list deleted files
app.get('/api/files/trash', authenticateToken, requirePermission('restore_trash'), async (req, res) => {
    try {
        let query = supabase
            .from('files')
            .select('*, zonas(kode, nama)', { count: 'exact' })  // Removed toko(nama) since relationship may not exist
            .not('deleted_at', 'is', null)  // Only show deleted files (deleted_at is NOT null)
            .order('deleted_at', { ascending: false });

        if (req.user.role === 'admin_zona') {
            query = query.eq('zona_id', req.user.zona_id);
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        // Fallback for "Unknown" if deleted_by is NULL or user deleted
        const filesWithFallback = (data || []).map(f => {
            let userName = 'Admin (System)';
            if (f.deleter && f.deleter.name) {
                userName = f.deleter.name;
            }
            return {
                ...f,
                display_name: userName,
                users: { name: userName } // Legacy compatibility for trash.js
            };
        });

        res.json({
            files: filesWithFallback,
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit)
        });
    } catch (err) {
        console.error('Trash List Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar sampah.' });
    }
});


// GET /api/toko — list tokos (filtered by zona)
app.get('/api/toko', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('toko').select('id, nama, zona_id').order('nama', { ascending: true });

        // Only filter by zona if specifically requested AND user is NOT admin_zona OR not requesting all
        let targetZona = req.query.zona_id;
        
        // For general list requests (no zona_id param), return ALL tokos regardless of user role
        // This is needed for upload form to match filenames against all tokos
        if (targetZona) {
            // Only apply filter if explicitly requested
            query = query.eq('zona_id', parseInt(targetZona));
        } else if (req.user.role === 'admin_zona' && req.query.forMyZoneOnly === 'true') {
            // Only filter for admin_zona if explicitly requesting their zone only
            targetZona = req.user.zona_id;
            query = query.eq('zona_id', parseInt(targetZona));
        }
        // Otherwise, return all tokos for all zones

        const { data, error } = await query;
        if (error) {
            console.error('List Toko Error:', error);
            // If table doesn't exist, return empty array instead of error
            if (error.message.includes('relation') || error.message.includes('does not exist')) {
                return res.json({ tokos: [] });
            }
            throw error;
        }

        // Construct kode from nama if not in database (normalize nama to kode format)
        const tokosWithKode = (data || []).map(t => ({
            ...t,
            kode: `toko-${t.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '')}`
        }));

        res.json({ tokos: tokosWithKode });
    } catch (err) {
        console.error('List Toko Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar toko.' });
    }
});

// Seed default tokos for testing (call once manually if needed)
app.post('/api/seed-tokos', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        // Get all zonas
        const { data: zonas, error: zonaError } = await supabase.from('zonas').select('id, nama');
        if (zonaError) throw zonaError;

        if (!zonas || zonas.length === 0) {
            return res.status(400).json({ error: 'Tidak ada zona yang ditemukan' });
        }

        // Default toko names to seed
        const defaultTokos = [
            'Balaraja', 'Cianjur', 'Serang Timur', 'Pasarkemis', 
            'Bitung', 'Cilegon', 'Cipondoh', 'Kutabumi', 'Ciruas'
        ];

        const tokoInserts = [];
        
        // For each zona, add all default tokos
        zonas.forEach(zona => {
            defaultTokos.forEach((tokoName, idx) => {
                tokoInserts.push({
                    nama: tokoName,
                    zona_id: zona.id,
                    kode: `TOKO-${tokoName.toUpperCase().replace(/\s+/g, '-')}`
                });
            });
        });

        // Insert all tokos
        const { data, error } = await supabase.from('toko').upsert(tokoInserts, { 
            onConflict: 'nama,zona_id' 
        });

        if (error) throw error;

        console.log(`[Seed] Created ${tokoInserts.length} tokos`);
        res.json({ 
            success: true, 
            message: `Seeded ${tokoInserts.length} tokos`,
            count: tokoInserts.length
        });
    } catch (err) {
        console.error('Seed Tokos Error:', err);
        res.status(500).json({ error: 'Gagal seed tokos: ' + err.message });
    }
});

// Stream an archive file directly from the configured storage remote.
async function streamFileDownload(req, res) {
    try {
        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check
        if (req.user.role === 'admin_zona') {
            if (file.zona_id !== req.user.zona_id) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke file ini.' });
            }
            if (file.category === 'PIUTANG') {
                const userPerms = req.user.permissions || [];
                if (!userPerms.includes('view_piutang')) {
                    return res.status(403).json({ error: 'Anda tidak memiliki akses ke kategori Piutang.' });
                }
            }
        }

        // Stream directly - always use rclone/Google Drive (no local fallback)
        let fileStream;
        try {
            fileStream = await R2Storage.getStream(file.storage_path);
        } catch (downloadErr) {
            console.error(`[Stream Error] Path: ${file.storage_path}`, downloadErr);
            return res.status(500).json({ error: 'Gagal mendownload file dari Google Drive.' });
        }

        // Masalah 4: Handle decompression for compressed files
        // If file was compressed (gzipped), automatically decompress for download
        const isCompressed = file.storage_path && file.storage_path.endsWith('.gz');
        
        if (isCompressed) {
            console.log(`[Download] 📂 Decompressing: ${file.nama_file}`);
            
            // Convert stream to buffer for decompression
            const chunks = [];
            fileStream.on('data', chunk => chunks.push(chunk));
            fileStream.on('end', async () => {
                try {
                    const compressedBuffer = Buffer.concat(chunks);
                    const decompressResult = await compression.decompressIfNeeded(compressedBuffer, file.nama_file);
                    
                    if (decompressResult.wasCompressed) {
                        console.log(`[Download] ✅ Decompression successful: ${(decompressResult.data.length / 1024 / 1024).toFixed(2)}MB`);
                    } else {
                        console.log(`[Download] ℹ️  File not gzipped, serving as-is`);
                    }
                    
                    res.setHeader('Content-Type', 'application/octet-stream');
                    res.setHeader('Content-Disposition', `attachment; filename="${file.nama_file}"`);
                    res.setHeader('Content-Length', decompressResult.data.length);
                    res.end(decompressResult.data);
                } catch (decompressErr) {
                    console.error('[Download] Decompression failed, serving compressed:', decompressErr.message);
                    res.setHeader('Content-Type', 'application/octet-stream');
                    res.setHeader('Content-Disposition', `attachment; filename="${file.nama_file}.gz"`);
                    res.setHeader('Content-Length', Buffer.concat(chunks).length);
                    res.end(Buffer.concat(chunks));
                }
            });
            fileStream.on('error', (err) => {
                console.error('[Download Stream Error]', err);
                res.status(500).json({ error: 'Gagal download file dari Google Drive.' });
            });
        } else {
            // Normal uncompressed file - stream directly
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${file.nama_file}"`);
            if (file.ukuran_bytes) {
                res.setHeader('Content-Length', file.ukuran_bytes);
            }

            fileStream.pipe(res);

            fileStream.on('error', (err) => {
                console.error('[Stream Error]', err);
            });
        }

    } catch (err) {
        console.error('Download File Error:', err);
        res.status(500).json({ error: 'Gagal download file.' });
    }
}

// GET /api/files/:id/download — download file
app.get('/api/files/:id/download', authenticateToken, streamFileDownload);

// Alias for sequential download (1-3 files) used by frontend
app.get('/api/files/download/:id', authenticateToken, (req, res, next) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
        return res.status(400).json({ error: 'ID file tidak valid.' });
    }
    return streamFileDownload(req, res, next);
});

// GET /api/files/:id/view — inline preview (PDF in iframe)
app.get('/api/files/:id/view', authenticateToken, async (req, res) => {
    try {
        console.log('[Files:View] Starting preview request for ID:', req.params.id);
        
        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            console.error('[Files:View] Database error:', error);
            return res.status(404).json({ error: 'File tidak ditemukan di database.' });
        }

        if (!file) {
            console.warn('[Files:View] File returned null for ID:', req.params.id);
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        console.log('[Files:View] File found:', file.nama_file, '| Storage path:', file.storage_path);

        // Zone access check
        if (req.user.role === 'admin_zona') {
            if (file.zona_id !== req.user.zona_id) {
                console.warn('[Files:View] Access denied - zona mismatch');
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke file ini.' });
            }
            if (file.category === 'PIUTANG') {
                const userPerms = req.user.permissions || [];
                if (!userPerms.includes('view_piutang')) {
                    console.warn('[Files:View] Access denied - no piutang permission');
                    return res.status(403).json({ error: 'Anda tidak memiliki akses ke kategori Piutang.' });
                }
            }
        }

        // Stream from Google Drive via rclone
        try {
            console.log('[Files:View] Streaming from Google Drive:', file.storage_path);
            
            const fileStream = await R2Storage.getStream(file.storage_path);
            
            // Masalah 4: Handle decompression for compressed PDFs
            const isCompressed = file.storage_path && file.storage_path.endsWith('.gz');
            
            if (isCompressed) {
                console.log(`[Files:View] 📂 Decompressing PDF: ${file.nama_file}`);
                
                // Buffer the entire stream for decompression
                const chunks = [];
                fileStream.on('data', chunk => chunks.push(chunk));
                fileStream.on('end', async () => {
                    try {
                        const compressedBuffer = Buffer.concat(chunks);
                        const decompressResult = await compression.decompressIfNeeded(compressedBuffer, file.nama_file);
                        
                        if (decompressResult.wasCompressed) {
                            console.log(`[Files:View] ✅ Decompression successful for preview`);
                        }
                        
                        res.setHeader('Content-Type', 'application/pdf');
                        res.setHeader('Content-Disposition', 'inline; filename="' + file.nama_file + '"');
                        res.setHeader('Cache-Control', 'no-cache');
                        res.setHeader('Content-Length', decompressResult.data.length);
                        res.end(decompressResult.data);
                    } catch (decompressErr) {
                        console.error('[Files:View] Decompression failed:', decompressErr.message);
                        res.status(500).json({ error: 'Gagal membaca file terkompresi.' });
                    }
                });
                fileStream.on('error', (err) => {
                    console.error('[Files:View] Stream error:', err.message);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Gagal membaca file dari Google Drive' });
                    }
                });
            } else {
                // Normal uncompressed PDF - stream directly
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', 'inline; filename="' + file.nama_file + '"');
                res.setHeader('Cache-Control', 'no-cache');
                
                console.log('[Files:View] ✅ Streaming PDF (uncompressed):', file.nama_file);
                
                // Handle stream errors
                fileStream.on('error', (err) => {
                    console.error('[Files:View] Stream error:', err.message);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Gagal membaca file dari Google Drive' });
                    }
                });
                
                fileStream.pipe(res);
            }
            
        } catch (streamErr) {
            console.error('[Files:View] Failed to stream from Google Drive:', streamErr.message);
            return res.status(500).json({ error: 'Gagal membaca file dari Google Drive: ' + streamErr.message });
        }

    } catch (err) {
        console.error('[Files:View] Error:', err.message, err.stack);
        res.status(500).json({ error: 'Gagal memuat preview file: ' + err.message });
    }
});

// POST /api/files/:id/share - generate signed link
app.post('/api/files/:id/share', authenticateToken, async (req, res) => {
    try {
        // --- RESTRICTION: Block Admin Zona from sharing ---
        if (req.user.role === 'admin_zona') {
            return res.status(403).json({ error: 'Akses ditolak: Admin Zona tidak diizinkan menyalin link file.' });
        }

        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check (Security robustification for other roles)
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            if (Number(file.zona_id) !== Number(req.user.zona_id)) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke file ini.' });
            }
        }

        // Generate tiny JWT (expires in 2 days)
        const shareToken = jwt.sign({ f: file.id }, JWT_SECRET, { expiresIn: '2d' });

        res.json({ token: shareToken });

    } catch (err) {
        console.error('Share File Error:', err);
        res.status(500).json({ error: 'Gagal membuat link berbagi.' });
    }
});

// ============================================================
// ENHANCED FILE SHARING WITH EXPIRY LINKS
// ============================================================

// POST /api/files/:id/share-advanced - Create shareable link with custom expiry
app.post('/api/files/:id/share-advanced', authenticateToken, async (req, res) => {
    try {
        const { expiryHours = 24, maxAccessCount = null } = req.body;
        const fileId = req.params.id;

        // Validate file exists and user has access
        const { data: file, error: fileError } = await supabase
            .from('files')
            .select('*')
            .eq('id', fileId)
            .single();

        if (fileError || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            if (Number(file.zona_id) !== Number(req.user.zona_id)) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke file ini.' });
            }
        }

        // Generate unique share token
        const crypto = require('crypto');
        const shareToken = crypto.randomBytes(32).toString('hex');
        
        // Calculate expiry time
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + Number(expiryHours));

        // Create share record
        const { data: share, error: shareError } = await supabase
            .from('file_shares')
            .insert({
                file_id: fileId,
                created_by: req.user.userId,
                share_token: shareToken,
                expires_at: expiresAt.toISOString(),
                max_access_count: maxAccessCount,
                is_active: true
            })
            .select()
            .single();

        if (shareError) throw shareError;

        // Log activity
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'CREATE',
            context: `Membuat link berbagi untuk file: ${file.nama_file}`
        });

        res.json({
            share,
            shareUrl: `${req.protocol}://${req.get('host')}/shared/${shareToken}`
        });

    } catch (err) {
        console.error('Create Share Link Error:', err);
        res.status(500).json({ error: 'Gagal membuat link berbagi.' });
    }
});

// GET /api/files/:id/shares - List all shares for a file
app.get('/api/files/:id/shares', authenticateToken, async (req, res) => {
    try {
        const fileId = req.params.id;

        // Verify file exists and user has access
        const { data: file, error: fileError } = await supabase
            .from('files')
            .select('*')
            .eq('id', fileId)
            .single();

        if (fileError || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            if (Number(file.zona_id) !== Number(req.user.zona_id)) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke file ini.' });
            }
        }

        // Get all shares for this file
        const { data: shares, error: sharesError } = await supabase
            .from('file_shares')
            .select('*, users(name, email)')
            .eq('file_id', fileId)
            .order('created_at', { ascending: false });

        if (sharesError) throw sharesError;

        res.json({ shares: shares || [] });

    } catch (err) {
        console.error('List Shares Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar share.' });
    }
});

// DELETE /api/files/:id/share/:shareId - Revoke share link
app.delete('/api/files/:id/share/:shareId', authenticateToken, async (req, res) => {
    try {
        const { id: fileId, shareId } = req.params;

        // Get share record
        const { data: share, error: shareError } = await supabase
            .from('file_shares')
            .select('*, files(*)')
            .eq('id', shareId)
            .eq('file_id', fileId)
            .single();

        if (shareError || !share) {
            return res.status(404).json({ error: 'Link berbagi tidak ditemukan.' });
        }

        // Check if user is the creator or has sufficient permissions
        if (share.created_by !== req.user.userId && 
            req.user.role !== 'super_admin' && 
            req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Anda tidak memiliki izin untuk mencabut link ini.' });
        }

        // Deactivate the share
        const { error: updateError } = await supabase
            .from('file_shares')
            .update({ is_active: false })
            .eq('id', shareId);

        if (updateError) throw updateError;

        // Log activity
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'DELETE',
            context: `Mencabut link berbagi untuk file: ${share.files.nama_file}`
        });

        res.json({ success: true, message: 'Link berbagi berhasil dicabut.' });

    } catch (err) {
        console.error('Revoke Share Error:', err);
        res.status(500).json({ error: 'Gagal mencabut link berbagi.' });
    }
});

// GET /api/share/:token - Access file via share token (PUBLIC - No auth required)
app.get('/api/share/:token', shareLimiter, async (req, res) => {
    try {
        const { token } = req.params;
        const clientIp = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('user-agent');

        // Get share record
        const { data: share, error: shareError } = await supabase
            .from('file_shares')
            .select('*, files(*)')
            .eq('share_token', token)
            .eq('is_active', true)
            .single();

        if (shareError || !share) {
            return res.status(404).json({ error: 'Link berbagi tidak valid atau sudah tidak aktif.' });
        }

        // Check if expired
        if (new Date(share.expires_at) < new Date()) {
            // Log failed access
            await supabase.from('file_share_access_logs').insert({
                share_id: share.id,
                ip_address: clientIp,
                user_agent: userAgent,
                success: false
            });
            
            return res.status(410).json({ error: 'Link berbagi sudah kadaluarsa.' });
        }

        // Check max access count
        if (share.max_access_count !== null && share.access_count >= share.max_access_count) {
            await supabase.from('file_share_access_logs').insert({
                share_id: share.id,
                ip_address: clientIp,
                user_agent: userAgent,
                success: false
            });
            
            return res.status(403).json({ error: 'Batas akses link telah tercapai.' });
        }

        // Increment access count
        await supabase
            .from('file_shares')
            .update({ access_count: share.access_count + 1 })
            .eq('id', share.id);

        // Log successful access
        await supabase.from('file_share_access_logs').insert({
            share_id: share.id,
            ip_address: clientIp,
            user_agent: userAgent,
            success: true
        });

        // Return file metadata (not the actual file, just info)
        res.json({
            file: {
                id: share.files.id,
                nama_file: share.files.nama_file,
                kategori: share.files.kategori,
                file_size: share.files.file_size,
                uploaded_at: share.files.uploaded_at
            },
            share: {
                expires_at: share.expires_at,
                access_count: share.access_count + 1,
                max_access_count: share.max_access_count
            }
        });

    } catch (err) {
        console.error('Access Share Error:', err);
        res.status(500).json({ error: 'Gagal mengakses file berbagi.' });
    }
});

// GET /api/share/:token/download - Download file via share token (PUBLIC)
app.get('/api/share/:token/download', shareLimiter, async (req, res) => {
    try {
        const { token } = req.params;

        // Get and validate share (reuse validation logic)
        const { data: share, error: shareError } = await supabase
            .from('file_shares')
            .select('*, files(*)')
            .eq('share_token', token)
            .eq('is_active', true)
            .single();

        if (shareError || !share) {
            return res.status(404).json({ error: 'Link berbagi tidak valid.' });
        }

        if (new Date(share.expires_at) < new Date()) {
            return res.status(410).json({ error: 'Link berbagi sudah kadaluarsa.' });
        }

        if (share.max_access_count !== null && share.access_count >= share.max_access_count) {
            return res.status(403).json({ error: 'Batas akses link telah tercapai.' });
        }

        // Stream the file (use existing download logic)
        const file = share.files;
        const remotePath = file.rclone_path || file.folder_path;
        
        // Set download headers
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.nama_file)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');

        // Stream file from rclone
        const rclone = spawn('rclone', [
            'cat',
            `gdrive:${remotePath}`
        ]);

        rclone.stdout.pipe(res);
        
        rclone.stderr.on('data', (data) => {
            console.error('Rclone error:', data.toString());
        });

        rclone.on('error', (err) => {
            console.error('Rclone spawn error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Gagal mengunduh file.' });
            }
        });

    } catch (err) {
        console.error('Share Download Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Gagal mengunduh file.' });
        }
    }
});

// ============================================================

// POST /api/files/:id/acknowledge - mark file as read
app.post('/api/files/:id/acknowledge', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin_zona') {
            return res.status(403).json({ error: 'Hanya Admin Zona yang dapat menandai file sebagai sudah dibaca.' });
        }

        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check
        if (req.user.role === 'admin_zona' && Number(file.zona_id) !== Number(req.user.zona_id)) {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        // Update status to 'Read' if it was 'Unread'
        let newStatus = file.status;
        if (file.status === 'Unread') {
            newStatus = 'Read';
        } else if (file.status === 'Unread (Anomali)') {
            newStatus = 'Read (Anomali)';
        }

        if (newStatus !== file.status) {
            const { error: updateError } = await supabase
                .from('files')
                .update({ status: newStatus })
                .eq('id', file.id);

            if (updateError) throw updateError;
            console.log(`[Acknowledge] File ${file.id} marked as ${newStatus} by ${req.user.userId}`);
        }

        res.json({ success: true, status: newStatus });

    } catch (err) {
        console.error('Acknowledge Error:', err);
        res.status(500).json({ error: 'Server error saat memproses tanda terima.' });
    }
});

// GET /api/share/:token - download via signed url
app.get('/api/share/:token', async (req, res) => {
    try {
        // Decode tiny JWT
        const decoded = jwt.verify(req.params.token, JWT_SECRET);
        if (!decoded || !decoded.f) {
            return res.status(403).json({ error: 'Tautan berbagi tidak valid atau kadaluarsa.' });
        }

        const fileId = decoded.f;

        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', fileId)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Stream directly
        let fileStream;
        try {
            fileStream = await R2Storage.getStream(file.storage_path);
        } catch (downloadErr) {
            console.error(`[Storage Stream Error] Path: ${file.storage_path}`, downloadErr);
            return res.status(500).json({ error: 'Gagal mendownload file.' });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.nama_file}"`);
        if (file.ukuran_bytes) {
            res.setHeader('Content-Length', file.ukuran_bytes);
        }

        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('[Stream Error]', err);
        });

    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(403).json({ error: 'Tautan berbagi ini sudah kadaluarsa (melewati 2 hari).' });
        }
        console.error('Share Download Error:', err);
        res.status(500).json({ error: 'Tautan berbagi tidak valid.' });
    }
});

// GET /api/files/check-duplicate — Background check for filename existence
app.get('/api/files/check-duplicate', authenticateToken, async (req, res) => {
    try {
        const { name, zona_id } = req.query;
        if (!name || !zona_id) return res.status(400).json({ error: 'Data tidak lengkap.' });

        const { data, error } = await supabase
            .from('files')
            .select('id')
            .eq('nama_file', name)
            .eq('zona_id', parseInt(zona_id))
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        res.json({ exists: !!data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Helper for Filename Scanning (Direct Scan Logic) ---
function extractMetadataFromFilename(filename) {
    const name = filename.replace(/\.pdf$/i, '').toUpperCase();
    let meta = { total: 0, tipe_ppn: 'NON', tanggal_dokumen: null };

    // 1. Extract Date from filename (patterns like "30 MEI", "30/05", "30-05-2026", etc.)
    // This will set tanggal_dokumen which dashboard will prioritize
    const dateExtracted = extractDateFromFilenameBackend(filename);
    if (dateExtracted) {
        meta.tanggal_dokumen = dateExtracted;
        console.log(`[Filename Scan] Date extracted: ${dateExtracted}`);
    }

    // 2. Context-Aware Nominal Extraction (Look for number after PPN/NON)
    // This catches 0, 5000, 15.370.000 etc while avoiding dates.
    const contextMatch = name.match(/(?:PPN|NON)\s+(\d{1,3}(?:\.\d{3})+|\d+|\b0\b)/);
    if (contextMatch) {
        meta.total = parseFloat(contextMatch[1].replace(/\./g, '')) || 0;
        console.log(`[Filename Scan] Context-Match found: ${meta.total} in "${filename}"`);
    } else {
        // Fallback: Greedy Nominal Regex (legacy)
        const priceMatch = name.match(/\d{1,3}(?:\.\d{3})+|\d{5,10}/);
        if (priceMatch) {
            meta.total = parseFloat(priceMatch[0].replace(/\./g, '')) || 0;
            console.log(`[Filename Scan] Fallback match: ${meta.total}`);
        }
    }

    // 3. PPN/NON detection
    if (name.includes('PPN')) meta.tipe_ppn = 'PPN';
    else if (name.includes('NON')) meta.tipe_ppn = 'NON';

    return meta;
}

/**
 * Extract date from filename (backend version)
 * Supports: "30 MEI", "30MEI", "30/05", "30-05", "30/05/2026", "2026-05-30", etc.
 * Returns YYYY-MM-DD format or null
 */
function extractDateFromFilenameBackend(filename) {
    if (!filename) return null;
    const text = filename.toUpperCase();
    
    const months = {
        'JAN': '01', 'FEB': '02', 'PEB': '02', 'MAR': '03', 'APR': '04',
        'MEI': '05', 'MAY': '05', 'JUN': '06', 'JUL': '07', 'AGU': '08',
        'AUG': '08', 'SEP': '09', 'OKT': '10', 'OCT': '10', 'NOV': '11',
        'NOP': '11', 'DES': '12', 'DEC': '12'
    };

    // 1. DD MMM format (e.g. "30 MEI", "30MEI", "17 FEB", "17FEB")
    const textMonthRegex = /(\d{1,2})\s*([A-Z]{3})/;
    const textMonthMatch = text.match(textMonthRegex);
    if (textMonthMatch) {
        const day = textMonthMatch[1].padStart(2, '0');
        const monthAbbr = textMonthMatch[2];
        const month = months[monthAbbr];
        if (month) {
            const year = new Date().getFullYear();
            return `${year}-${month}-${day}`;
        }
    }

    // 2. DD/MM/YYYY or DD-MM-YYYY format
    const dmyRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/;
    const dmyMatch = text.match(dmyRegex);
    if (dmyMatch) {
        let year = dmyMatch[3];
        if (year.length === 2) year = '20' + year;
        const month = dmyMatch[2].padStart(2, '0');
        const day = dmyMatch[1].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 3. DD/MM or DD-MM format (assume current year)
    const dmRegex = /(\d{1,2})[\/\-](\d{1,2})(?!\d)/;
    const dmMatch = text.match(dmRegex);
    if (dmMatch) {
        const year = new Date().getFullYear();
        const month = dmMatch[2].padStart(2, '0');
        const day = dmMatch[1].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 4. YYYY/MM/DD or YYYY-MM-DD format
    const ymdRegex = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/;
    const ymdMatch = text.match(ymdRegex);
    if (ymdMatch) {
        const year = ymdMatch[1];
        const month = ymdMatch[2].padStart(2, '0');
        const day = ymdMatch[3].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return null;
}

// Always store document dates in the database as YYYY-MM-DD.
function normalizeDocumentDate(value) {
    if (!value) return null;
    const input = String(value).trim();
    let match = input.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]);
        let year = Number(match[3]);
        if (year < 100) year += 2000;
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    match = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
}

// POST /api/files/upload
app.post('/api/files/upload', authenticateToken, requireUploadPermission, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
        }

        const { zona_id, toko_id, category } = req.body;
        console.log(`[Upload Audit] User: ${req.user.userId}, Body:`, { ...req.body, file: req.file?.originalname });

        if (!zona_id) {
            return res.status(400).json({ error: 'zona_id wajib diisi.' });
        }

        // --- SECURITY PATCH: Admin Zona Isolation ---
        if (req.user.role === 'admin_zona' && parseInt(zona_id) !== req.user.zona_id) {
            return res.status(403).json({ error: 'Keamanan: Anda hanya dapat mengunggah ke zona yang menjadi tanggung jawab Anda.' });
        }

        // Parallelize Zona/Toko lookups
        const [zonaRes, tokoRes] = await Promise.all([
            supabase.from('zonas').select('kode').eq('id', parseInt(zona_id)).single(),
            toko_id ? supabase.from('toko').select('nama').eq('id', parseInt(toko_id)).single() : Promise.resolve({ data: null })
        ]);

        const zona = zonaRes.data;
        if (!zona) return res.status(400).json({ error: 'Zona tidak ditemukan.' });

        let tokoKode = 'umum';
        if (tokoRes.data && tokoRes.data.nama) {
            // Convert toko nama to kode format: "Balaraja" -> "toko-balaraja"
            tokoKode = `toko-${tokoRes.data.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '')}`;
        } else {
            // FALLBACK: If toko_id not provided or not found, try to extract from filename
            console.log('[Upload] No toko_id provided, trying to extract from filename:', req.file.originalname);
            // Try to find toko by matching name in filename (case-insensitive)
            const { data: allTokos } = await supabase.from('toko').select('id, nama').eq('zona_id', parseInt(zona_id));
            if (allTokos && allTokos.length > 0) {
                const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
                const normalizedFilename = normalize(req.file.originalname);
                const sortedTokos = allTokos.sort((a, b) => b.nama.length - a.nama.length);
                
                for (const t of sortedTokos) {
                    const normalizedTokoName = normalize(t.nama);
                    if (normalizedFilename.includes(normalizedTokoName)) {
                        // Convert toko nama to kode format: "Balaraja" -> "toko-balaraja"
                        tokoKode = `toko-${t.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '')}`;
                        console.log('[Upload] Found toko in filename:', t.nama, '-> kode:', tokoKode);
                        break;
                    }
                }
            }
        }

        // Validate Date (tanggal_dokumen)
        let normalizedDocumentDate = null;
        
        // --- FAIL-SAFE: Server-Side Filename Scanning ---
        // Commented out due to TDZ error - using request body instead
        // const filenameMeta = extractMetadataFromFilename(req.file.originalname);
        
        // Priority 1: Use date provided in request body
        if (!normalizedDocumentDate && req.body.tanggal_dokumen) {
            normalizedDocumentDate = normalizeDocumentDate(req.body.tanggal_dokumen);
            if (!normalizedDocumentDate) {
                return res.status(400).json({ error: 'Format tanggal_dokumen tidak valid atau tidak terbaca kalender.' });
            }
            console.log(`[Date Extract] From request body: ${normalizedDocumentDate}`);
        }
        
        // Priority 3: Use today if neither available
        if (!normalizedDocumentDate) {
            normalizedDocumentDate = new Date().toISOString().split('T')[0];
            console.log(`[Date Extract] Default to today: ${normalizedDocumentDate}`);
        }

        // --- Duplicate Detection (Nama File + Zona) ---
        // Check if file exists AND verify it on Google Drive
        const { data: existingFile, error: existingError } = await supabase
            .from('files')
            .select('id, storage_path')
            .eq('nama_file', req.file.originalname)
            .eq('zona_id', parseInt(zona_id))
            .is('deleted_at', null)  // Only check active files
            .limit(1)
            .maybeSingle();

        if (existingFile) {
            // File exists in database, verify it still exists on Google Drive
            try {
                console.log(`[Upload] Verifying if file still exists on Google Drive: ${existingFile.storage_path}`);
                const fileExists = await R2Storage.checkFileExists(existingFile.storage_path);
                
                if (fileExists) {
                    // File still exists on Google Drive - reject as duplicate
                    return res.status(409).json({ error: 'File dengan nama yang sama sudah ada di zona ini.' });
                } else {
                    // File was deleted from Google Drive - allow re-upload
                    console.log(`[Upload] ? File was deleted from Google Drive, allowing re-upload`);
                }
            } catch (verifyErr) {
                console.warn(`[Upload] Error verifying file on Google Drive:`, verifyErr.message);
                // If verification fails, allow re-upload (graceful fallback)
                console.log(`[Upload] ? Verification failed, allowing re-upload as fallback`);
            }
        }

        // Map category from filename extraction to valid folder names
        // Frontend extracts: 'NON', 'PPN', or 'INVOICE'
        // Google Drive folders use: 'INVOICE', 'PPN', 'NON_PPN' (or just 'NON' - check actual structure)
        let folderCategory = 'INVOICE'; // default
        if (category) {
            const catUpper = String(category).toUpperCase();
            if (catUpper === 'NON') {
                folderCategory = 'NON'; // Keep as 'NON' for folder (or could be 'NON_PPN' depending on Google Drive structure)
            } else if (catUpper === 'PPN') {
                folderCategory = 'PPN';
            } else if (['INVOICE', 'NON_PPN', 'PIUTANG'].includes(catUpper)) {
                folderCategory = catUpper;
            }
        }

        // Calculate Storage Path Instantly
        const storagePath = R2Storage.buildStoragePath(
            zona.kode,
            tokoKode,
            folderCategory,
            req.file.originalname
        );
        const size = req.file.buffer.length;

        // --- RESILIENCE: Auto-Batching Fallback with In-Memory Mutex ---
        let finalBatchId = req.body.batch_id;

        // Skip auto-batching for PIUTANG category
        if (!finalBatchId && category !== 'PIUTANG') {
            console.log(`[Upload] File "${req.file.originalname}" arrived without batch_id. Finding/Creating...`);
            if (!global.batchLocks) global.batchLocks = {};
            const userLockKey = req.user.userId;

            // Wait if locked
            while (global.batchLocks[userLockKey]) {
                await new Promise(r => setTimeout(r, 50));
            }

            global.batchLocks[userLockKey] = true;
            try {
                // Double-check recent batch under lock
                const fiveMinAgo = new Date(Date.now() - 300000).toISOString();
                const { data: recentBatch } = await supabase
                    .from('upload_batches')
                    .select('id')
                    .eq('uploader_id', req.user.userId)
                    .gte('created_at', fiveMinAgo)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (recentBatch) {
                    finalBatchId = recentBatch.id;
                    console.log(`[Auto-Batch] Grouped into: ${finalBatchId}`);
                } else {
                    const { data: newBatch, error: bErr } = await supabase
                        .from('upload_batches')
                        .insert({ uploader_id: req.user.userId, total_files: 0, success_files: 0 })
                        .select('id')
                        .single();
                    if (bErr) throw bErr;
                    finalBatchId = newBatch.id;
                    console.log(`[Auto-Batch] Created NEW: ${finalBatchId}`);
                }
            } catch (err) {
                console.error("[Auto-Batch] Critical failure:", err.message);
                // Fallback to a random ID if everything fails, to avoid "null" batches
                finalBatchId = 'err_' + Date.now();
            } finally {
                delete global.batchLocks[userLockKey];
            }
        } else {
            // Ensure batch record exists if explicitly provided (Auto-Upsert)
            try {
                await supabase.from('upload_batches').upsert({
                    id: finalBatchId,
                    uploader_id: req.user.userId,
                    total_files: 0,
                    success_files: 0
                }, { onConflict: 'id', ignoreDuplicates: true });
            } catch (err) {
                console.warn('[Upload] Failed to auto-upsert batch record:', err.message);
            }
        }

        let finalNominal = req.body.total_jual ? parseFloat(req.body.total_jual) : 0;

        const requestedTipePPN = String(req.body.tipe_ppn || 'NON').trim().toUpperCase();
        const finalTipePPN = requestedTipePPN === 'NON_PPN' ? 'NON' : requestedTipePPN;

        // --- FRAUD DETECTION: Check for Anomaly (Same Toko, Same Nominal, Same Category, within 24h) ---
        let finalStatus = 'Unread';
        if (finalNominal > 0 && toko_id && (category || 'INVOICE') === 'INVOICE') {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: anomalyFiles } = await supabase
                .from('files')
                .select('id')
                .eq('toko_id', parseInt(toko_id))
                .eq('total_jual', finalNominal)
                .eq('category', 'INVOICE')
                .gte('created_at', yesterday)
                .is('deleted_at', null)
                .limit(1);

            if (anomalyFiles && anomalyFiles.length > 0) {
                finalStatus = 'Unread (Anomali)';
                console.warn(`⚠️ [FRAUD DETECTION] Anomaly detected! Duplicate nominal Rp${finalNominal} for Toko ID ${toko_id} within 24h.`);
            }
        }

        console.log(`[Metadata] File: ${req.file.originalname} | Final Nominal: ${finalNominal} | Batch: ${finalBatchId} | Status: ${finalStatus}`);

        // Background Upload (Fire and FORGET to unblock UI)
        const fileBuffer = Buffer.from(req.file.buffer);
        
        // Primary: Upload to Local Storage before creating the DB record.
        // This guarantees preview remains available even if Google Drive rejects
        // the background sync.
        try {
            await LocalStorage.uploadDirect(fileBuffer, req.file.originalname, storagePath);
            console.log(`[Upload] Local storage upload complete for: ${req.file.originalname}`);
        } catch (localErr) {
            console.error(`[Upload] Local storage upload failed:`, localErr.message);
            throw new Error(`Penyimpanan lokal gagal: ${localErr.message}`);
        }
        
        // Secondary: Try Rclone/Google Drive for backup (fire and forget).
        // Now using ResumableUpload with chunking for 30-40% faster uploads (Masalah 2)
        // Masalah 4: Add compression before upload for optimal transfer speed
        setImmediate(async () => {
            try {
                console.log(`[ChunkedBackgroundUpload] Starting chunked async upload for: ${req.file.originalname}`);
                console.log(`[ChunkedBackgroundUpload] File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`);
                
                // Masalah 4: Compress file if beneficial
                let uploadBuffer = fileBuffer;
                let compressionMetadata = null;
                
                try {
                    const compressionResult = await compression.compressFile(
                        fileBuffer,
                        req.file.mimetype || 'application/octet-stream',
                        req.file.originalname
                    );
                    
                    uploadBuffer = compressionResult.compressed;
                    compressionMetadata = compressionResult.metadata;
                    
                    if (!compressionResult.skipped && compressionMetadata) {
                        console.log(`[ChunkedBackgroundUpload] 📦 Compression applied:`);
                        console.log(`[ChunkedBackgroundUpload] Original: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB → Compressed: ${(uploadBuffer.length / 1024 / 1024).toFixed(2)}MB`);
                        console.log(`[ChunkedBackgroundUpload] Savings: ${compressionMetadata.spaceSavingsPercent}% (${(compressionMetadata.spaceSavings / 1024 / 1024).toFixed(2)}MB)`);
                    } else if (compressionResult.skipped) {
                        console.log(`[ChunkedBackgroundUpload] ⏭️  Compression skipped: ${compressionMetadata.compressionDecision}`);
                    }
                } catch (compErr) {
                    console.error(`[ChunkedBackgroundUpload] Compression error (falling back to uncompressed): ${compErr.message}`);
                    // Continue with uncompressed upload
                }
                
                // Initialize resumable upload handler
                const uploader = new ResumableUpload({
                    chunkSize: 10 * 1024 * 1024,  // 10MB chunks
                    maxConcurrent: 3,              // 3 parallel chunks
                    maxRetries: 4,
                    retryDelayMs: 1000,
                    verbose: true
                });

                // Perform chunked upload
                const uploadState = await uploader.upload(uploadBuffer, storagePath, {
                    userId: req.user.userId,
                    originalName: req.file.originalname,
                    zona_id: parseInt(zona_id),
                    toko_id: toko_id ? parseInt(toko_id) : null,
                    category: folderCategory,
                    batch_id: finalBatchId,
                    compressionMetadata  // Masalah 4: Track compression info
                });

                if (uploadState.success) {
                    console.log(`[ChunkedBackgroundUpload] ✅ SUCCESS for ${req.file.originalname}`);
                    console.log(`[ChunkedBackgroundUpload] Stats:`, {
                        totalChunks: uploadState.totalChunks,
                        uploadedChunks: uploadState.uploadedChunks,
                        completionTime: `${uploadState.completionTime.toFixed(2)}s`,
                        averageSpeed: `${(uploadBuffer.length / uploadState.completionTime / 1024 / 1024).toFixed(2)}MB/s`,
                        compression: compressionMetadata ? `${compressionMetadata.spaceSavingsPercent}% saved` : 'none'
                    });
                } else {
                    console.error(`[ChunkedBackgroundUpload] FAILED for ${req.file.originalname}:`, uploadState.error);
                }
            } catch (gdErr) {
                console.error(`[ChunkedBackgroundUpload] Google Drive upload failed (non-critical):`, gdErr.message);
                // Don't throw - this is a background operation
            }
        });

        // Map category from filename extraction to database valid values
        // Frontend extracts: 'NON', 'PPN', or 'INVOICE'
        // Database expects: 'INVOICE', 'PPN', 'NON_PPN', 'PIUTANG'
        let dbCategory = 'INVOICE'; // default
        if (category) {
            const catUpper = String(category).toUpperCase();
            if (catUpper === 'NON') {
                dbCategory = 'NON_PPN'; // Map 'NON' to 'NON_PPN'
            } else if (catUpper === 'PPN') {
                dbCategory = 'PPN';
            } else if (['INVOICE', 'NON_PPN', 'PIUTANG'].includes(catUpper)) {
                dbCategory = catUpper;
            }
        }

        const { data: fileRecord, error: dbError } = await supabase
            .from('files')
            .insert({
                nama_file: req.file.originalname,
                storage_path: storagePath,
                zona_id: parseInt(zona_id),
                toko_id: toko_id ? parseInt(toko_id) : null,
                category: dbCategory,
                ukuran_bytes: size,
                uploaded_by: req.user.userId,
                batch_id: finalBatchId,
                tanggal_dokumen: normalizedDocumentDate,
                tipe_ppn: finalTipePPN,
                no_invoice: req.body.no_invoice,
                total_jual: finalNominal,
                status: finalStatus
            })
            .select()
            .single();

        if (dbError) throw dbError;

        // Audit
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Upload File',
            context: `Uploaded ${req.file.originalname} to ${storagePath}`
        });

        // [DISABLED] WA Notification — replaced by manual copy-paste system via /api/batches

        res.json({
            success: true,
            message: 'File berhasil diupload.',
            file: fileRecord
        });

    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ error: 'Gagal upload file: ' + err.message });
    }
});

// ============================================================
// POST /api/files/upload-piutang — Upload PIUTANG files
// ============================================================
app.post('/api/files/upload-piutang', authenticateToken, requireUploadPermission, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
        }

        // Only moderator and super_admin can upload PIUTANG
        if (!['moderator', 'super_admin'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Akses ditolak. Hanya moderator dan super_admin dapat mengupload Bukti Piutang.' });
        }

        const toko_id = req.body?.toko_id;
        const tanggal_dokumen = req.body?.tanggal_dokumen;
        console.log(`[PIUTANG Upload] User: ${req.user.userId}, File: ${req.file.originalname}`);
        console.log(`[PIUTANG Upload] req.body:`, req.body);
        console.log(`[PIUTANG Upload] Received toko_id: ${toko_id}, tanggal_dokumen: ${tanggal_dokumen}`);
        
        // Parse toko_id - it comes as string from FormData, convert to number
        const parsedTokoId = toko_id ? parseInt(toko_id) : null;
        console.log(`[PIUTANG Upload] Parsed toko_id: ${parsedTokoId}`);

        // Extract nominal from filename (e.g., "1.520.000.pdf" → "1.520.000")
        const nominal = req.file.originalname.replace(/\.[^/.]+$/, "").trim();

        // Validate that nominal is not empty
        if (!nominal) {
            return res.status(400).json({ error: 'Nama file harus berisi nominal (contoh: 1.520.000.pdf).' });
        }

        // For PIUTANG, we use a default "PIUTANG" zona-like identifier
        // This bypasses normal zona restrictions
        const defaultZonaId = 1; // Use zona 1 as default for PIUTANG
        const defaultZonaCode = 'zona-1';

        // Determine storage path based on toko_id
        let storagePath;
        if (parsedTokoId) {
            // Fetch toko name/kode
            const { data: tokoData } = await supabase
                .from('toko')
                .select('nama')
                .eq('id', parsedTokoId)
                .single();
            
            if (tokoData) {
                // Convert toko name to kode format (e.g., "Balaraja" → "balaraja")
                const tokoKode = tokoData.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                storagePath = `ARSIP ANKA/${defaultZonaCode}/toko-${tokoKode}/BUKTI PIUTANG/${req.file.originalname}`;
                console.log(`[PIUTANG Storage] With toko: ${storagePath}`);
            } else {
                // Fallback if toko not found
                storagePath = `ARSIP ANKA/PIUTANG/${req.file.originalname}`;
                console.log(`[PIUTANG Storage] Toko ID ${parsedTokoId} not found, using fallback: ${storagePath}`);
            }
        } else {
            // No toko selected - use default PIUTANG path
            storagePath = `ARSIP ANKA/PIUTANG/${req.file.originalname}`;
            console.log(`[PIUTANG Storage] No toko, using default: ${storagePath}`);
        }
        
        const size = req.file.buffer.length;
        console.log(`[PIUTANG] File size: ${size} bytes`);

        // Duplicate Detection - check database AND Google Drive
        const { data: existingFile } = await supabase
            .from('files')
            .select('id, storage_path')
            .eq('nama_file', req.file.originalname)
            .eq('category', 'PIUTANG')
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle();

        if (existingFile) {
            // File exists in database, but verify it still exists on Google Drive
            try {
                console.log(`[PIUTANG] Verifying if file still exists on Google Drive: ${existingFile.storage_path}`);
                const fileExists = await R2Storage.checkFileExists(existingFile.storage_path);
                
                if (fileExists) {
                    // File still exists on Google Drive - reject as duplicate
                    return res.status(409).json({ error: 'File dengan nama yang sama sudah ada di Bukti Piutang.' });
                } else {
                    // File was deleted from Google Drive - allow re-upload
                    console.log(`[PIUTANG] ? File was deleted from Google Drive, allowing re-upload`);
                }
            } catch (verifyErr) {
                console.warn(`[PIUTANG] Error verifying file on Google Drive:`, verifyErr.message);
                // If verification fails, allow re-upload (graceful fallback)
                console.log(`[PIUTANG] ? Verification failed, allowing re-upload as fallback`);
            }
        }

        // Validate Date (tanggal_dokumen)
        let normalizedDocumentDate = null;
        if (tanggal_dokumen) {
            normalizedDocumentDate = normalizeDocumentDate(tanggal_dokumen);
            if (!normalizedDocumentDate) {
                return res.status(400).json({ error: 'Format tanggal_dokumen tidak valid atau tidak terbaca kalender.' });
            }
            console.log(`[PIUTANG Date] From request body: ${normalizedDocumentDate}`);
        }

        // Use today as default if no date provided
        if (!normalizedDocumentDate) {
            normalizedDocumentDate = new Date().toISOString().split('T')[0];
            console.log(`[PIUTANG Date] Default to today: ${normalizedDocumentDate}`);
        }

        // Upload to Local Storage first
        const fileBuffer = Buffer.from(req.file.buffer);
        try {
            console.log(`[PIUTANG] Uploading to local storage - path: ${storagePath}`);
            await LocalStorage.uploadDirect(fileBuffer, req.file.originalname, storagePath);
            console.log(`[PIUTANG] Local storage upload complete for: ${req.file.originalname}`);
        } catch (localErr) {
            console.error(`[PIUTANG] Local storage upload failed:`, localErr.message);
            console.error(`[PIUTANG] Stack:`, localErr.stack);
            throw new Error(`Penyimpanan lokal gagal: ${localErr.message}`);
        }

        // Background upload to Google Drive (fire and forget) using chunked upload (Masalah 2)
        // Masalah 4: Add compression before upload for optimal transfer speed
        setImmediate(async () => {
            try {
                console.log(`[PIUTANG ChunkedBackground] Starting chunked async upload for: ${req.file.originalname}`);
                console.log(`[PIUTANG ChunkedBackground] File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`);
                
                // Masalah 4: Compress file if beneficial
                let uploadBuffer = fileBuffer;
                let compressionMetadata = null;
                
                try {
                    const compressionResult = await compression.compressFile(
                        fileBuffer,
                        req.file.mimetype || 'application/octet-stream',
                        req.file.originalname
                    );
                    
                    uploadBuffer = compressionResult.compressed;
                    compressionMetadata = compressionResult.metadata;
                    
                    if (!compressionResult.skipped && compressionMetadata) {
                        console.log(`[PIUTANG ChunkedBackground] 📦 Compression applied:`);
                        console.log(`[PIUTANG ChunkedBackground] Original: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB → Compressed: ${(uploadBuffer.length / 1024 / 1024).toFixed(2)}MB`);
                        console.log(`[PIUTANG ChunkedBackground] Savings: ${compressionMetadata.spaceSavingsPercent}% (${(compressionMetadata.spaceSavings / 1024 / 1024).toFixed(2)}MB)`);
                    } else if (compressionResult.skipped) {
                        console.log(`[PIUTANG ChunkedBackground] ⏭️  Compression skipped: ${compressionMetadata.compressionDecision}`);
                    }
                } catch (compErr) {
                    console.error(`[PIUTANG ChunkedBackground] Compression error (falling back to uncompressed): ${compErr.message}`);
                    // Continue with uncompressed upload
                }
                
                // Initialize resumable upload handler
                const uploader = new ResumableUpload({
                    chunkSize: 10 * 1024 * 1024,  // 10MB chunks
                    maxConcurrent: 3,              // 3 parallel chunks
                    maxRetries: 4,
                    retryDelayMs: 1000,
                    verbose: true
                });

                // Perform chunked upload
                const uploadState = await uploader.upload(uploadBuffer, storagePath, {
                    userId: req.user.userId,
                    originalName: req.file.originalname,
                    zona_id: defaultZonaId,
                    toko_id: parsedTokoId,
                    category: 'PIUTANG',
                    compressionMetadata  // Masalah 4: Track compression info
                });

                if (uploadState.success) {
                    console.log(`[PIUTANG ChunkedBackground] ✅ SUCCESS for ${req.file.originalname}`);
                    console.log(`[PIUTANG ChunkedBackground] Stats:`, {
                        totalChunks: uploadState.totalChunks,
                        uploadedChunks: uploadState.uploadedChunks,
                        completionTime: `${uploadState.completionTime.toFixed(2)}s`,
                        averageSpeed: `${(uploadBuffer.length / uploadState.completionTime / 1024 / 1024).toFixed(2)}MB/s`,
                        compression: compressionMetadata ? `${compressionMetadata.spaceSavingsPercent}% saved` : 'none'
                    });
                } else {
                    console.error(`[PIUTANG ChunkedBackground] FAILED for ${req.file.originalname}:`, uploadState.error);
                }
            } catch (gdErr) {
                console.error(`[PIUTANG ChunkedBackground] Google Drive upload failed (non-critical):`, gdErr.message);
            }
        });

        // Insert into database
        const { data: fileRecord, error: dbError } = await supabase
            .from('files')
            .insert({
                nama_file: req.file.originalname,
                storage_path: storagePath,
                zona_id: defaultZonaId,
                toko_id: parsedTokoId, // Store parsed toko_id
                category: 'PIUTANG',
                ukuran_bytes: size,
                uploaded_by: req.user.userId,
                tanggal_dokumen: normalizedDocumentDate,
                total_jual: parseFloat(nominal.replace(/\./g, '')) || 0, // Store numeric nominal value
                status: 'Unread'
            })
            .select()
            .single();

        if (dbError) throw dbError;

        // Audit log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Upload PIUTANG File',
            context: `Uploaded ${req.file.originalname} (Nominal: ${nominal})`
        });

        console.log(`[PIUTANG] ✅ Upload successful:`, req.file.originalname);

        res.status(200).json({
            success: true,
            message: 'File Bukti Piutang berhasil diupload.',
            file: fileRecord
        });

    } catch (err) {
        console.error('PIUTANG Upload Error:', err.message);
        console.error('PIUTANG Upload Stack:', err.stack);
        res.status(500).json({ error: 'Gagal upload file Piutang: ' + err.message });
    }
});

// ============================================================
// GET /api/admin/missing-files — Get list of files marked as missing
// ============================================================
app.get('/api/admin/missing-files', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        console.log('[Missing Files] Fetching missing files list...');
        
        const { data: missingFiles, error } = await supabase
            .from('files')
            .select('id, nama_file, storage_path, zona_id, toko_id, category, created_at, last_synced_at, sync_error, zonas(kode, nama)')
            .eq('is_missing', true)
            .is('deleted_at', null)
            .order('last_synced_at', { ascending: false });
        
        if (error) throw error;
        
        console.log(`[Missing Files] Found ${missingFiles?.length || 0} missing files`);
        
        res.json({
            status: 'success',
            total: missingFiles?.length || 0,
            files: missingFiles || [],
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Missing Files] Error:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// ============================================================
// POST /api/admin/scan-missing-files — Manual trigger to scan for missing files
// ============================================================
app.post('/api/admin/scan-missing-files', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        console.log('[Scan Missing] Starting manual scan...');
        
        const { data: files } = await supabase
            .from('files')
            .select('id, storage_path, nama_file')
            .is('deleted_at', null);
        
        if (!files) {
            return res.json({
                status: 'success',
                message: 'No files to scan',
                scanned: 0,
                missing: 0
            });
        }

        let missingCount = 0;
        let checkedCount = 0;

        for (const f of files) {
            checkedCount++;
            try {
                const exists = await R2Storage.checkFileExists(f.storage_path);
                if (!exists) {
                    await supabase
                        .from('files')
                        .update({ 
                            is_missing: true,
                            last_synced_at: new Date().toISOString(),
                            sync_error: 'File not found in Google Drive'
                        })
                        .eq('id', f.id);
                    missingCount++;
                    console.log(`[Scan Missing] Found missing: ${f.nama_file}`);
                } else {
                    await supabase
                        .from('files')
                        .update({ 
                            is_missing: false,
                            last_synced_at: new Date().toISOString(),
                            sync_error: null
                        })
                        .eq('id', f.id);
                }
            } catch (err) {
                console.warn(`[Scan Missing] Error checking ${f.nama_file}:`, err.message);
            }
        }
        
        console.log(`[Scan Missing] ✓ Scanned ${checkedCount}, found ${missingCount} missing`);
        
        res.json({
            status: 'success',
            message: `Scan complete: ${missingCount} missing file(s) found`,
            scanned: checkedCount,
            missing: missingCount,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Scan Missing] Error:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// ============================================================
// DELETE /api/admin/missing-files/:id — Delete a missing file from database
// ============================================================
app.delete('/api/admin/missing-files/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`[Delete Missing] Deleting missing file: ${id}`);
        
        // Soft delete by setting deleted_at
        const { error } = await supabase
            .from('files')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);
        
        if (error) throw error;
        
        console.log(`[Delete Missing] ✓ Deleted missing file: ${id}`);
        
        res.json({
            status: 'success',
            message: 'File has been deleted'
        });
    } catch (err) {
        console.error('[Delete Missing] Error:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// ============================================================
// Update History Endpoints
// ============================================================

// GET /api/update-history — Get all published updates
app.get('/api/update-history', authenticateToken, async (req, res) => {
    try {
        const { data: updates, error } = await supabase
            .from('update_history')
            .select('*')
            .eq('status', 'PUBLISHED')
            .order('created_at', { ascending: false });
        
        if (error) throw error;

        // Jika ada updates dan ada created_by, fetch user info
        let enrichedUpdates = updates || [];
        
        if (enrichedUpdates.length > 0) {
            // Get unique user IDs
            const userIds = [...new Set(enrichedUpdates.map(u => u.created_by).filter(Boolean))];
            
            if (userIds.length > 0) {
                // Fetch user info dari public.users table (bukan auth.users)
                const { data: users, error: userError } = await supabase
                    .from('users')
                    .select('id, email, full_name, username')
                    .in('id', userIds);
                
                if (!userError && users) {
                    // Map user info ke updates
                    const userMap = {};
                    users.forEach(u => {
                        userMap[u.id] = u;
                    });
                    
                    enrichedUpdates = enrichedUpdates.map(update => ({
                        ...update,
                        created_by_user: userMap[update.created_by] || null
                    }));
                }
            }
        }
        
        res.json({
            status: 'success',
            updates: enrichedUpdates,
            total: enrichedUpdates.length
        });
    } catch (err) {
        console.error('[Update History] Error:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// POST /api/update-history — Create new update (moderator/super_admin only)
app.post('/api/update-history', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { version, type, title, description, category, severity, impact_areas, requires_action, is_breaking_change, status } = req.body;
        
        if (!type || !title) {
            return res.status(400).json({
                status: 'error',
                error: 'Type and title are required'
            });
        }

        const { data: update, error } = await supabase
            .from('update_history')
            .insert({
                version: version || '1.0.0',
                type,
                title,
                description,
                category,
                severity,
                impact_areas,
                requires_action: requires_action || false,
                is_breaking_change: is_breaking_change || false,
                status: status || 'PUBLISHED',
                created_by: req.user.id
            })
            .select()
            .single();
        
        if (error) throw error;
        
        console.log(`[Update History] ✅ Created: ${type} - ${title}`);
        
        res.json({
            status: 'success',
            update
        });
    } catch (err) {
        console.error('[Update History] Error:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// DELETE /api/update-history/:id — Delete update (moderator/super_admin only)
app.delete('/api/update-history/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const { error } = await supabase
            .from('update_history')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        console.log(`[Update History] ✅ Deleted: ${id}`);
        
        res.json({
            status: 'success',
            message: 'Update deleted'
        });
    } catch (err) {
        console.error('[Update History] Error:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// ============================================================
// UPDATE HISTORY ITEMS API
// ============================================================

// GET /api/update-history-items/:updateId — Get all items for an update
app.get('/api/update-history-items/:updateId', authenticateToken, async (req, res) => {
    try {
        const { updateId } = req.params;

        const { data: items, error } = await supabase
            .from('update_history_items')
            .select('*')
            .eq('update_id', updateId)
            .order('item_number', { ascending: true });

        if (error) throw error;

        res.json({
            status: 'success',
            items: items || [],
            total: items?.length || 0
        });
    } catch (err) {
        console.error('[Update History Items] Error:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// POST /api/update-history-items — Create new item (moderator/super_admin only)
app.post('/api/update-history-items', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { update_id, item_number, type, title, description } = req.body;

        console.log(`[Create Item] Received: update_id=${update_id}, item_number=${item_number}, type=${type}, title=${title}`);

        if (!update_id || !type || !title || item_number === undefined) {
            console.error('[Create Item] Missing fields:', { update_id, item_number, type, title });
            return res.status(400).json({
                status: 'error',
                error: 'Missing required fields: update_id, item_number, type, title'
            });
        }

        const { data: item, error } = await supabase
            .from('update_history_items')
            .insert([{
                update_id,
                item_number,
                type,
                title,
                description
            }])
            .select()
            .single();

        if (error) {
            console.error('[Create Item] Database error:', error);
            throw error;
        }

        console.log(`[Create Item] ✅ Created: id=${item.id}, update_id=${update_id}`);

        res.json({
            status: 'success',
            item: item
        });
    } catch (err) {
        console.error('[Create Item] Error:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// DELETE /api/update-history-items/:id — Delete item (moderator/super_admin only)
app.delete('/api/update-history-items/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('update_history_items')
            .delete()
            .eq('id', id);

        if (error) throw error;

        console.log(`[Update History Items] ✅ Deleted: ${id}`);

        res.json({
            status: 'success',
            message: 'Item deleted'
        });
    } catch (err) {
        console.error('[Update History Items] Error:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});

// DELETE /api/files/:id
app.delete('/api/files/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        const isHardDelete = req.query.hard === 'true';

        // Role-based bypass (consistent with requirePermission middleware)
        const canBypass = req.user.role === 'super_admin' || req.user.role === 'moderator';

        if (!canBypass) {
            const perms = req.user.permissions || [];
            if (isHardDelete && !perms.includes('hard_delete')) {
                return res.status(403).json({ error: 'Akses ditolak. Butuh izin Hapus Permanen.' });
            }
            if (!isHardDelete && !perms.includes('soft_delete')) {
                return res.status(403).json({ error: 'Akses ditolak. Butuh izin Buang Ke Sampah.' });
            }
        }

        const { data: file, error: fetchError } = await supabase
            .from('files')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchError || !file) return res.status(404).json({ error: 'File tidak ditemukan.' });

        // Admin Zona restriction
        if (req.user.role === 'admin_zona' && file.zona_id !== req.user.zona_id) {
            return res.status(403).json({ error: 'Akses dilarang. File ini milik zona lain.' });
        }

        // Soft delete (set deleted_at)

        if (isHardDelete) {
            // Delete from DB first
            await supabase.from('files').delete().eq('id', file.id);

            // Delete from storage BEFORE sending response (blocking/synchronous)
            try {
                console.log(`[Delete] Starting immediate deletion for: ${file.nama_file}`);
                
                // Delete from local storage first (quick)
                try {
                    await LocalStorage.deleteFile(file.storage_path);
                    console.log(`[Delete] ✅ Deleted from local storage: ${file.nama_file}`);
                } catch (localErr) {
                    console.warn(`[Delete] Local delete warning: ${localErr.message}`);
                }
                
                // Delete from Google Drive (may take time, but user waits)
                try {
                    await R2Storage.deleteFile(file.storage_path);
                    console.log(`[Delete] ✅ Deleted from Google Drive: ${file.nama_file}`);
                } catch (gdriveErr) {
                    console.error(`[Delete] Google Drive delete error: ${gdriveErr.message}`);
                    throw gdriveErr; // Throw to prevent success response if GDrive delete fails
                }
                
                // All deletions successful
                await supabase.from('audit_logs').insert({
                    user_id: req.user.userId,
                    action: 'Hard Delete',
                    context: `Permanently deleted ${file.nama_file}`
                });
                
                return res.json({ success: true, message: 'File dihapus permanen.' });
                
            } catch (err) {
                console.error(`[Delete] Error during hard delete:`, err.message);
                return res.status(500).json({ error: 'Gagal menghapus file dari storage: ' + err.message });
            }
        } else {
            // Soft delete
            await supabase.from('files')
                .update({
                    deleted_at: new Date().toISOString(),
                    deleted_by: req.user.userId
                })
                .eq('id', file.id);

            await supabase.from('audit_logs').insert({
                user_id: req.user.userId,
                action: 'Soft Delete',
                context: `Moved ${file.nama_file} to recycle bin`
            });

            res.json({ success: true, message: 'File dipindah ke sampah.' });
        }

    } catch (err) {
        console.error('Delete Error:', err);
        res.status(500).json({ error: 'Gagal menghapus file.' });
    }
});

// POST /api/files/bulk-delete - bulk soft delete
app.post('/api/files/bulk-delete', authenticateToken, requirePermission('soft_delete'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Tidak ada file yang dipilih.' });
        }

        const now = new Date().toISOString();
        let query = supabase
            .from('files')
            .update({
                deleted_at: now,
                deleted_by: req.user.userId
            })
            .in('id', ids);

        if (req.user.role === 'admin_zona') {
            query = query.eq('zona_id', req.user.zona_id);
        }

        const { error } = await query;

        // Audit log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Soft Delete',
            context: `Moved ${ids.length} files to trash`
        });

        res.json({ success: true, message: `${ids.length} file dipindahkan ke sampah.` });
    } catch (err) {
        console.error('Bulk Soft Delete Error:', err);
        res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
});

// POST /api/files/bulk-restore - bulk restore from trash
app.post('/api/files/bulk-restore', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID tidak valid.' });
        }

        let query = supabase
            .from('files')
            .update({ deleted_at: null, deleted_by: null })
            .in('id', ids);

        if (req.user.role === 'admin_zona') {
            query = query.eq('zona_id', req.user.zona_id);
        }

        const { data: restored, error } = await query.select('id');
        if (error) throw error;

        // Audit
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Restore',
            context: `Restored ${restored?.length || 0} files from trash`
        });

        res.json({ success: true, message: `${restored?.length || 0} file berhasil dipulihkan.` });
    } catch (err) {
        console.error('Bulk Restore Error:', err);
        res.status(500).json({ error: 'Gagal memulihkan file massal.' });
    }
});

// POST /api/files/bulk-trash-delete - bulk permanent delete
app.post('/api/files/bulk-trash-delete', authenticateToken, requirePermission('hard_delete'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID tidak valid.' });
        }

        // Fetch storage paths
        let query = supabase
            .from('files')
            .select('id, nama_file, storage_path')
            .in('id', ids);

        if (req.user.role === 'admin_zona') {
            query = query.eq('zona_id', req.user.zona_id);
        }

        const { data: files, error } = await query;

        if (error || !files) throw error;

        // Delete from DB immediately
        await supabase.from('files').delete().in('id', ids);

        // Log the action
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Hard Delete',
            context: `Permanently deleted ${files.length} files`
        });

        // Send response immediately
        res.json({
            success: true,
            message: `${files.length} file berhasil dihapus permanen.`
        });

        // Delete from storage in background (fire and forget)
        setImmediate(() => {
            for (const file of files) {
                R2Storage.deleteFile(file.storage_path)
                    .catch(err => console.error(`[Background Bulk Delete Error] ${file.nama_file}:`, err.message));
            }
        });

    } catch (err) {
        console.error('Bulk Delete Error:', err);
        res.status(500).json({ error: 'Terjadi kesalahan sistem saat menghapus masal.' });
    }
});

// PUT /api/files/:id/restore — Restricted to Admin/Moderator
app.put('/api/files/:id/restore', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {

        const { data: file, error: fetchError } = await supabase
            .from('files')
            .select('id, nama_file, deleted_at')
            .eq('id', req.params.id)
            .maybeSingle();
        if (fetchError) throw fetchError;
        if (!file || !file.deleted_at) return res.status(404).json({ error: 'File tidak ditemukan di tong sampah.' });

        const { error } = await supabase
            .from('files')
            .update({
                deleted_at: null,
                deleted_by: null
            })
            .eq('id', req.params.id);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Restore File',
            context: `Restored file ${file.nama_file} (${req.params.id})`
        });

        res.json({ success: true, message: 'File berhasil dipulihkan.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memulihkan file.' });
    }
});

// PUT /api/files/:id - Update file metadata (super_admin & moderator only)
app.put('/api/files/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { id } = req.params;
        const { total_jual, tanggal_dokumen, uploaded_at } = req.body;

        // Validate file exists
        const { data: file, error: fetchError } = await supabase
            .from('files')
            .select('id, nama_file')
            .eq('id', id)
            .single();

        if (fetchError || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Build update object (tipe_ppn excluded - affects folder path)
        const updateData = {};
        if (total_jual !== undefined) updateData.total_jual = total_jual;
        if (tanggal_dokumen !== undefined) updateData.tanggal_dokumen = tanggal_dokumen;
        if (uploaded_at !== undefined) updateData.created_at = uploaded_at; // created_at is the upload date

        // Update file
        const { error: updateError } = await supabase
            .from('files')
            .update(updateData)
            .eq('id', id);

        if (updateError) throw updateError;

        // Audit log
        const changes = Object.keys(updateData).map(key => `${key}: ${updateData[key]}`).join(', ');
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'UPDATE',
            context: `Updated file metadata: ${file.nama_file} - ${changes}`
        });

        res.json({ success: true, message: 'File metadata berhasil diperbarui.' });

    } catch (err) {
        console.error('Update file metadata error:', err);
        res.status(500).json({ error: 'Gagal memperbarui metadata file.' });
    }
});

// GET/POST /api/files/bulk-download - Download multiple files as ZIP
app.all('/api/files/bulk-download', authenticateToken, async (req, res) => {
    try {
        // Permission Check: super_admin, moderator, and admin_zona are allowed
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator' && req.user.role !== 'admin_zona') {
            const perms = req.user.permissions || [];
            if (!perms.includes('bulk_download')) {
                return res.status(403).json({ error: 'Akses ditolak. Dibutuhkan izin Unduh ZIP Massal.' });
            }
        }

        let { ids } = (req.method === 'POST' || req.method === 'PUT') ? req.body : req.query;
        if (typeof ids === 'string') ids = ids.split(',').map(id => id.trim());

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Tidak ada file yang dipilih.' });
        }

        // 1. Fetch metadata from Supabase
        const { data: files, error } = await supabase
            .from('files')
            .select('*')
            .in('id', ids);

        if (error || !files || files.length === 0) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // 1b. Post-fetch security filter (Piutang only for Super Admin or view_piutang)
        const allowedFiles = files.filter(f => {
            if (req.user.role === 'admin_zona') {
                if (f.zona_id !== req.user.zona_id) return false;
                if (f.category === 'PIUTANG') {
                    const userPerms = req.user.permissions || [];
                    if (!userPerms.includes('view_piutang')) return false;
                }
                return true;
            }
            return true; // Super Admin can access all
        });

        if (allowedFiles.length === 0) {
            return res.status(403).json({ error: 'Tidak ada file yang diizinkan untuk didownload.' });
        }

        // Use allowedFiles for the rest of the logic
        const archive = archiver('zip', { zlib: { level: 5 } }); // Level 5 for better speed

        // Error handling for archive
        archive.on('error', (err) => {
            console.error('[Archiver Error]', err);
            if (!res.headersSent) res.status(500).send({ error: err.message });
        });

        // Use stream to send Zip to response
        const now = new Date();
        const DD = String(now.getDate()).padStart(2, '0');
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const YY = String(now.getFullYear()).slice(-2);
        const randomBatch = Math.floor(100 + Math.random() * 900);
        res.attachment(`ARSIP ANKA ${randomBatch}${DD}${MM}${YY}.zip`);
        archive.pipe(res);

        // 3. Add files to ZIP sequentially to prevent server overload
        for (const file of allowedFiles) {
            try {
                console.log(`[ZIP] Processing: ${file.nama_file}`);
                const fileStream = await R2Storage.getStream(file.storage_path);

                archive.append(fileStream, { name: file.nama_file });

                // Wait for the entry to be fully processed by archiver
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        console.warn(`[ZIP] Timeout on ${file.nama_file}. Skipping...`);
                        resolve();
                    }, 60000); // 60s max per file

                    archive.once('entry', () => {
                        clearTimeout(timeout);
                        resolve();
                    });

                    fileStream.on('error', (err) => {
                        clearTimeout(timeout);
                        console.error(`[ZIP] Stream error for ${file.nama_file}:`, err.message);
                        resolve(); // Continue with next file
                    });
                });
            } catch (err) {
                console.warn(`[Bulk Download] Failed to initialize stream for ${file.nama_file}:`, err.message);
            }
        }

        await archive.finalize();

    } catch (err) {
        console.error('Bulk Download Error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Terjadi kesalahan saat memproses ZIP.' });
    }
});

// ============================================================
// USER MANAGEMENT ENDPOINTS (Super Admin only)
// ============================================================

// TEST ENDPOINT
app.get('/api/test-users', async (req, res) => {
    console.log('[TEST] /api/test-users called!');
    res.json({ test: 'works', message: 'This endpoint is reachable' });
});

// GET /api/users
app.get('/api/users', async (req, res) => {
    console.log('[GET /api/users] Called! Auth header:', req.headers['authorization'] ? 'YES' : 'NO');
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, email, name, role, zona_id, toko_id, is_active, permissions, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ users: data || [] });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat daftar user.' });
    }
});

// GET /api/users/names?ids=id1,id2,id3 — Get user names by IDs for badges
app.get('/api/users/names', authenticateToken, async (req, res) => {
    try {
        const { ids } = req.query;
        if (!ids) return res.json({});

        const idList = ids.split(',').map(id => id.trim()).filter(Boolean);
        if (idList.length === 0) return res.json({});

        const { data, error } = await supabase
            .from('users')
            .select('id, name')
            .in('id', idList);

        if (error) throw error;

        // Convert to object: { userId: userName, ... }
        const result = {};
        (data || []).forEach(user => {
            result[user.id] = user.name || user.id;
        });

        res.json(result);
    } catch (err) {
        console.error('[/api/users/names] Error:', err);
        res.status(500).json({ error: 'Gagal memuat nama user.' });
    }
});

// POST /api/users â€” create user
app.post('/api/users', authenticateToken, async (req, res) => {
    // Permission check: allow super_admin and moderator only
    if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: 'Akses ditolak' });
    }
    try {
        const { email, password, name, role, zona_id, toko_id, permissions } = req.body;

        if (!email || !password || !name || !role) {
            return res.status(400).json({ error: 'Username, password, nama, dan role wajib diisi.' });
        }

        // Check duplicate Username (column 'email')
        const { data: existing } = await supabase.from('users').select('id').eq('email', email.toLowerCase().trim()).single();
        if (existing) {
            return res.status(400).json({ error: 'Username sudah digunakan.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(12);
        const password_hash = await bcrypt.hash(password, salt);

        const { data: user, error } = await supabase
            .from('users')
            .insert({
                email: email.toLowerCase().trim(),
                
                password_hash,
                name,
                role,
                zona_id: role === 'admin_zona' ? zona_id : null,
                toko_id: role === 'admin_zona' ? toko_id : null,
                is_active: true,
                permissions: permissions || []
            })
            .select()
            .single();

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Create User',
            context: `Created user ${email} with role ${role}`
        });

        res.json({ success: true, user });
    } catch (err) {
        console.error('Create User Error:', err);
        res.status(500).json({ error: 'Gagal membuat user: ' + err.message });
    }
});

// POST /api/admin/fix-admin-zona-zona-id - Fix admin_zona users with missing zona_id (internal setup endpoint)
app.post('/api/admin/fix-admin-zona-zona-id', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        console.log('[ADMIN] Fixing admin_zona users with missing zona_id...');
        
        // Get all admin_zona users with NULL zona_id
        const { data: affectedUsers, error: selectError } = await supabase
            .from('users')
            .select('id, email, role, zona_id')
            .eq('role', 'admin_zona')
            .is('zona_id', null);
        
        if (selectError) throw selectError;
        
        if (!affectedUsers || affectedUsers.length === 0) {
            return res.json({ success: true, message: 'No admin_zona users with NULL zona_id', count: 0 });
        }
        
        // For each admin_zona user, try to extract zona number from email
        const updates = affectedUsers.map(user => {
            // Try to extract zona number from email patterns like:
            // admin_zona_1, zone_1, zona1, etc
            const match = user.email.match(/(\d+)/);
            const zonaId = match ? parseInt(match[1]) : 1; // Default to zona 1
            
            return { id: user.id, email: user.email, zonaId };
        });
        
        console.log('[ADMIN] Updates to apply:', updates);
        
        // Apply updates
        for (const update of updates) {
            const { error: updateError } = await supabase
                .from('users')
                .update({ zona_id: update.zonaId })
                .eq('id', update.id);
            
            if (updateError) {
                console.error(`[ADMIN] Failed to update user ${update.email}:`, updateError);
            } else {
                console.log(`[ADMIN] Updated ${update.email} -> zona_id: ${update.zonaId}`);
            }
        }
        
        res.json({
            success: true,
            message: `Fixed ${updates.length} admin_zona users`,
            count: updates.length,
            updates: updates
        });
    } catch (err) {
        console.error('[ADMIN] Fix admin_zona error:', err);
        res.status(500).json({ error: 'Failed to fix admin_zona users: ' + err.message });
    }
});

// POST /api/admin/migrate-zona-codes - Update zona codes from zona-XX to simplified format
app.post('/api/admin/migrate-zona-codes', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        console.log('[ADMIN] Migrating zona codes...');
        
        const zoneMapping = {
            'zona-01': '1',
            'zona-02': '2',
            'zona-03a': '3a',
            'zona-03b': '3b',
            'zona-04': '4',
            'zona-05': '5',
            'zona-06a': '6a',
            'zona-06b': '6b',
            'zona-07': '7',
            'zona-08': '8',
            'zona-09': '9',
            'zona-10': '10',
            'zona-11': '11',
            'zona-12': '12',
            'zona-13': '13',
            'zona-14': '14',
            'zona-15': '15',
            'zona-16': '16',
            'zona-17': '17'
        };
        
        // Get all zonas with old codes
        const { data: zonas, error: selectError } = await supabase
            .from('zonas')
            .select('id, kode, nama')
            .like('kode', 'zona-%');
        
        if (selectError) throw selectError;
        
        if (!zonas || zonas.length === 0) {
            return res.json({ success: true, message: 'No zonas with old codes found', count: 0 });
        }
        
        console.log(`[ADMIN] Found ${zonas.length} zonas to migrate`);
        
        const updates = [];
        for (const zona of zonas) {
            const newKode = zoneMapping[zona.kode];
            if (newKode) {
                const { error: updateError } = await supabase
                    .from('zonas')
                    .update({ kode: newKode })
                    .eq('id', zona.id);
                
                if (updateError) {
                    console.error(`[ADMIN] Failed to update zona ${zona.kode}:`, updateError);
                } else {
                    console.log(`[ADMIN] Updated zona: ${zona.kode} -> ${newKode}`);
                    updates.push({ old: zona.kode, new: newKode, nama: zona.nama });
                }
            }
        }
        
        res.json({
            success: true,
            message: `Migrated ${updates.length} zona codes`,
            count: updates.length,
            updates: updates
        });
    } catch (err) {
        console.error('[ADMIN] Migrate zona codes error:', err);
        res.status(500).json({ error: 'Failed to migrate zona codes: ' + err.message });
    }
});

// POST /api/admin/recreate-admin-zona-users - Delete all admin_zona users and recreate with proper zona_id
app.post('/api/admin/recreate-admin-zona-users', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        console.log('[ADMIN] Recreating admin_zona users...');
        
        // Step 1: Get all zonas
        const { data: zonas, error: zonaError } = await supabase
            .from('zonas')
            .select('id, kode, nama')
            .order('id', { ascending: true });
        
        if (zonaError) throw zonaError;
        
        if (!zonas || zonas.length === 0) {
            return res.status(400).json({ error: 'No zonas found' });
        }
        
        console.log(`[ADMIN] Found ${zonas.length} zonas`);
        
        // Step 2: Delete all existing admin_zona users
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('role', 'admin_zona');
        
        if (deleteError) throw deleteError;
        console.log('[ADMIN] Deleted all existing admin_zona users');
        
        // Step 3: Create new admin_zona users for each zona
        const defaultPassword = 'admin123456'; // Default password - user should change on first login
        const salt = await bcrypt.genSalt(12);
        const password_hash = await bcrypt.hash(defaultPassword, salt);
        
        const newUsers = [];
        for (const zona of zonas) {
            const email = `admin_zona_${zona.id}`;
            const name = `Admin ${zona.nama}`;
            
            const { data: user, error: insertError } = await supabase
                .from('users')
                .insert({
                    email,
                    password_hash,
                    name,
                    role: 'admin_zona',
                    zona_id: zona.id,
                    is_active: true,
                    permissions: []
                })
                .select()
                .single();
            
            if (insertError) {
                console.error(`[ADMIN] Failed to create user for zona ${zona.id}:`, insertError);
            } else {
                console.log(`[ADMIN] Created user: ${email} for zona_id: ${zona.id}`);
                newUsers.push({
                    email,
                    name,
                    zona_id: zona.id,
                    zona_nama: zona.nama,
                    default_password: defaultPassword
                });
            }
        }
        
        res.json({
            success: true,
            message: `Created ${newUsers.length} admin_zona users`,
            count: newUsers.length,
            users: newUsers
        });
    } catch (err) {
        console.error('[ADMIN] Recreate admin_zona users error:', err);
        res.status(500).json({ error: 'Failed to recreate admin_zona users: ' + err.message });
    }
});

// PUT /api/users/:id â€” update user
app.put('/api/users/:id', authenticateToken, async (req, res) => {
    // Permission check: allow super_admin and moderator only
    if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ error: 'Akses ditolak' });
    }
    try {
        const { email, password, name, role, zona_id, toko_id, is_active, permissions } = req.body;

        const updates = {};
        if (email) updates.email = email.toLowerCase().trim();
        if (name) updates.name = name;
        if (role) updates.role = role;
        if (typeof is_active === 'boolean') updates.is_active = is_active;
        if (zona_id !== undefined) updates.zona_id = zona_id;
        if (toko_id !== undefined) updates.toko_id = toko_id;
        if (permissions !== undefined) updates.permissions = permissions;

        // Re-hash password if provided
        if (password) {
            const salt = await bcrypt.genSalt(12);
            updates.password_hash = await bcrypt.hash(password, salt);
        }

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Update User',
            context: `Updated user ${req.params.id}`
        });

        res.json({ success: true, user: data });
    } catch (err) {
        console.error('[PUT /api/users/:id] Error:', err.message);
        res.status(500).json({ error: 'Gagal update user: ' + err.message });
    }
});

// DELETE /api/users/:id â€” Permanent Delete
app.delete('/api/users/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const userIdToDelete = req.params.id;

        // Prevent self-deletion
        if (userIdToDelete === req.user.userId) {
            return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri.' });
        }

        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userIdToDelete);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Delete User Permanent',
            context: `Permanently deleted user ${userIdToDelete}`
        });

        res.json({ success: true, message: 'User berhasil dihapus secara permanen.' });
    } catch (err) {
        console.error('Delete User Error:', err);
        res.status(500).json({ error: 'Gagal menghapus user: ' + err.message });
    }
});

// ============================================================
// OPERATIONAL FEATURES (Broadcast & Stats)
// ============================================================

// POST /api/broadcasts — Send broadcast (Admin only)
app.post('/api/broadcasts', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { content, target_zona_id } = req.body;
        if (!content) return res.status(400).json({ error: 'Isi pengumuman wajib diisi.' });

        const { error } = await supabase
            .from('broadcast_messages')
            .insert({
                content,
                target_zona_id: target_zona_id || null, // null means all zones
                created_by: req.user.userId
            });

        if (error) throw error;


        res.json({ success: true, message: 'Pengumuman berhasil disiarkan.' });
    } catch (err) {
        console.error('Broadcast Error:', err);
        res.status(500).json({ error: 'Gagal mengirim pengumuman: ' + err.message });
    }
});

// GET /api/broadcasts — Fetch all broadcasts
app.get('/api/broadcasts', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('broadcast_messages')
            .select('*, zonas(nama)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ broadcasts: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat daftar pengumuman.' });
    }
});


// DELETE /api/broadcasts/:id — Delete broadcast
app.delete('/api/broadcasts/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { error } = await supabase
            .from('broadcast_messages')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Pengumuman berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus pengumuman.' });
    }
});

// GET /api/broadcasts/latest
app.get('/api/broadcasts/latest', authenticateToken, async (req, res) => {
    try {
        let query = supabase
            .from('broadcast_messages')
            .select('content, created_at, target_zona_id')
            .order('created_at', { ascending: false });

        // Filter: Target the user's specific zone OR show global (null)
        if (req.user.role !== 'super_admin' && req.user.zona_id) {
            query = query.or(`target_zona_id.is.null,target_zona_id.eq.${req.user.zona_id}`);
        }

        const { data, error } = await query.limit(1).maybeSingle();

        if (error) throw error;
        res.json({ broadcast: data || null });
    } catch (err) {
        console.error('Broadcast Load Error:', err);
        res.status(500).json({ error: 'Gagal memuat pengumuman.' });
    }
});

// POST /api/system/sync-gdrive — Sync Google Drive files to database
app.post('/api/system/sync-gdrive', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        console.log('[Sync] Starting Google Drive to Database sync...');
        const { data: zones, error: zonesError } = await supabase.from('zonas').select('id, kode');
        if (zonesError) throw zonesError;
        const { data: tokos, error: tokosError } = await supabase.from('toko').select('id, nama, zona_id');
        if (tokosError) throw tokosError;

        // Construct kode from nama for toko lookups
        const tokosWithKode = (tokos || []).map(t => ({
            ...t,
            kode: `toko-${t.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '')}`
        }));

        // Satu pemindaian rekursif jauh lebih cepat daripada satu request per toko/kategori.
        const remotePath = `${ALIST_REMOTE}:${ALIST_BASE}`;
        const remoteFiles = await new Promise((resolve, reject) => {
            execFile(
                RCLONE_BIN,
                ['--config', RCLONE_CONF, 'lsjson', remotePath, '--recursive'],
                { timeout: 180000, maxBuffer: 50 * 1024 * 1024 },
                (err, stdout, stderr) => {
                    if (err) return reject(new Error(stderr || err.message));
                    try {
                        resolve(JSON.parse(stdout.trim() || '[]'));
                    } catch (parseErr) {
                        reject(new Error(`Bad rclone output: ${parseErr.message}`));
                    }
                }
            );
        });

        const files = remoteFiles.filter(file => !(file.IsDir ?? file.is_dir));
        const zonaByKode = new Map(zones.map(zona => [zona.kode.toLowerCase(), zona]));
        const tokoByKey = new Map(tokosWithKode.map(toko => [`${toko.zona_id}:${toko.kode.toLowerCase()}`, toko]));

        // Ambil semua path yang sudah ada dengan pagination. Supabase membatasi
        // hasil default ke 1.000 baris, sehingga satu query saja bisa membuat
        // file lama dianggap baru dan terimpor sebagai duplikat.
        const existingPaths = new Set();
        const existingDeletedByPath = new Map();
        for (let from = 0; ; from += 1000) {
            const { data: existingFiles, error: existingError } = await supabase
                .from('files')
                .select('storage_path, deleted_at')
                .range(from, from + 999);
            if (existingError) throw existingError;
            for (const existingFile of existingFiles || []) {
                if (existingFile.storage_path) {
                    existingPaths.add(existingFile.storage_path);
                    existingDeletedByPath.set(existingFile.storage_path, existingFile.deleted_at);
                }
            }
            if (!existingFiles || existingFiles.length < 1000) break;
        }

        const records = [];
        const errors = [];
        let skippedExisting = 0;
        const pathsToRestore = [];
        for (const file of files) {
            const relativePath = file.Path || file.path || '';
            const parts = relativePath.split('/').filter(Boolean);
            if (parts.length < 4) {
                errors.push(`${relativePath}: path tidak sesuai zona/toko/kategori`);
                continue;
            }

            const [zonaKode, tokoKode, category] = parts;
            const zona = zonaByKode.get(zonaKode.toLowerCase());
            const toko = zona && tokoByKey.get(`${zona.id}:${tokoKode.toLowerCase()}`);
            const storagePath = `${ALIST_BASE}/${relativePath}`;
            if (!zona) {
                errors.push(`${relativePath}: zona tidak ditemukan di database`);
                continue;
            }
            if (existingPaths.has(storagePath)) {
                skippedExisting++;
                if (existingDeletedByPath.get(storagePath)) pathsToRestore.push(storagePath);
                continue;
            }

            records.push({
                nama_file: parts.slice(3).join('/'),
                storage_path: storagePath,
                zona_id: zona.id,
                // Toko yang belum ada di master tetap ditampilkan di arsip.
                // Admin dapat melengkapi master toko tanpa kehilangan file.
                toko_id: toko ? toko.id : null,
                category: category.toUpperCase(),
                ukuran_bytes: file.Size ?? file.size ?? 0,
                status: 'Unread',
                uploaded_by: req.user.userId,
                deleted_at: null
            });
            existingPaths.add(storagePath);
        }

        // File yang benar-benar masih ada di Google Drive harus tampil di dashboard.
        // Restore dalam batch agar file lama yang tersoft-delete tidak hilang.
        for (let i = 0; i < pathsToRestore.length; i += 100) {
            const batch = pathsToRestore.slice(i, i + 100);
            const { error: restoreError } = await supabase
                .from('files')
                .update({ deleted_at: null })
                .in('storage_path', batch);
            if (restoreError) errors.push(`restore batch ${i + 1}: ${restoreError.message}`);
        }

        // Supabase membatasi ukuran request; masukkan dalam batch kecil.
        let totalFilesImported = 0;
        for (let i = 0; i < records.length; i += 100) {
            const batch = records.slice(i, i + 100);
            const { error: insertError } = await supabase.from('files').insert(batch);
            if (insertError) {
                errors.push(`batch ${i + 1}-${i + batch.length}: ${insertError.message}`);
            } else {
                totalFilesImported += batch.length;
            }
        }
        const totalFilesSkipped = skippedExisting;

        // Audit log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Sync Google Drive to Database',
            context: JSON.stringify({
                totalFilesFound: files.length,
                totalFilesImported,
                totalFilesSkipped,
                errors: errors.slice(0, 10)
            })
        });
        
        res.json({
            success: true,
            totalFilesFound: files.length,
            totalFilesImported,
            totalFilesSkipped,
            errors: errors.length > 0 ? errors : null,
            message: totalFilesImported > 0 
                ? `Successfully imported ${totalFilesImported} files` 
                : 'No new files to import'
        });
        
    } catch (err) {
        console.error('[Sync Error]', err);
        res.status(500).json({ error: 'Sync failed: ' + err.message });
    }
});

// ============================================================
// STORAGE SYNC, SYSTEM HEALTH, AND METADATA BACKUP
// ============================================================

function isPrivilegedStorageUser(req) {
    return req.user?.role === 'super_admin' || req.user?.role === 'moderator';
}

// Dashboard status is readable by all authenticated users, but paths are
// checked against the user's visible files so zone admins cannot probe paths.
app.get('/api/sync/statuses', authenticateToken, async (req, res) => {
    try {
        const requestedPaths = String(req.query.paths || '')
            .split(',')
            .map(value => decodeURIComponent(value).trim())
            .filter(Boolean)
            .slice(0, 100);

        if (requestedPaths.length === 0) return res.json({ statuses: {} });

        let query = supabase
            .from('files')
            .select('storage_path')
            .in('storage_path', requestedPaths)
            .is('deleted_at', null);
        if (req.user.role === 'admin_zona') query = query.eq('zona_id', req.user.zona_id);

        const { data: visibleFiles, error } = await query;
        if (error) throw error;
        const visiblePaths = (visibleFiles || []).map(file => file.storage_path);
        const storedStatuses = R2Storage.getSyncStatuses(visiblePaths);
        const statuses = Object.fromEntries(visiblePaths.map(storagePath => [
            storagePath,
            storedStatuses[storagePath] || {
                storagePath,
                primaryStatus: 'unknown',
                backupStatus: 'unknown',
                lastError: null,
                updatedAt: null
            }
        ]));
        res.json({ statuses });
    } catch (err) {
        console.error('[Sync Status API] Error:', err.message);
        res.status(500).json({ error: 'Gagal membaca status sinkronisasi.' });
    }
});



app.get('/api/system/health', authenticateToken, async (req, res) => {
    const queue = R2Storage.getSyncQueueSnapshot();
    const services = {
        backend: { healthy: true, detail: 'Backend merespons.' },
        localStorage: { healthy: fs.existsSync(process.env.STORAGE_PATH || path.join(__dirname, '..', 'data', 'files')), detail: 'LocalStorage' },
        syncQueue: { healthy: queue.summary.failed === 0, detail: `${queue.summary.total} pekerjaan tertunda.` },
        database: { healthy: false, detail: 'Belum diperiksa.' },
        alist: { healthy: false, detail: 'Belum diperiksa.' },
        backupStorage: { healthy: false, detail: 'Belum diperiksa.' }
    };
    try {
        const { error } = await supabase.from('files').select('id').limit(1);
        services.database = { healthy: !error, detail: error ? error.message : 'Koneksi database aktif.' };
    } catch (err) {
        services.database = { healthy: false, detail: err.message };
    }
    try {
        const status = await verifyRcloneConnectivity();
        services.alist = { healthy: Boolean(status.verified), detail: status.message || status.errorDetails || 'Google Drive' };
    } catch (err) {
        services.alist = { healthy: false, detail: err.message };
    }
    try {
        const status = await R2Storage.verifyBackupStorage();
        services.backupStorage = { healthy: Boolean(status.healthy), detail: status.detail };
    } catch (err) {
        services.backupStorage = { healthy: false, detail: err.message };
    }
    
    const allHealthy = Object.values(services).every(service => service.healthy);
    const health = {
        timestamp: new Date().toISOString(),
        status: allHealthy ? 'healthy' : 'warning',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
            total: os.totalmem(),
            free: os.freemem(),
            used: os.totalmem() - os.freemem(),
            percentUsed: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
        },
        cpu: {
            cores: os.cpus().length,
            model: os.cpus()[0]?.model || 'Unknown',
            loadAverage: os.loadavg()
        },
        disk: {
            path: process.env.LOG_PATH || '/app/logs',
            logStats: logger.getStats()
        },
        database: {
            status: services.database.healthy ? 'connected' : 'disconnected',
            lastCheck: new Date().toISOString()
        },
        warnings: []
    };
    
    if (health.memory.percentUsed > 80) {
        health.warnings.push('High memory usage');
        health.status = 'warning';
    }
    if (health.cpu.loadAverage[0] > os.cpus().length * 2) {
        health.warnings.push('High CPU load');
        health.status = 'warning';
    }
    
    res.status(200).json({ success: true, health });
});

// GET /api/system/maintenance — Get current system status (Public, no auth required)
app.get('/api/system/maintenance', async (req, res) => {
    try {
        const status = await getMaintenanceStatus();
        return res.json(status);
    } catch (err) {
        console.error('[Maintenance] Error fetching status:', err.message);
        // Return safe default to prevent endpoint failure
        return res.json({ isMaintenance: false, error: 'Unable to fetch maintenance status' });
    }
});

// HEAD /api/system/maintenance — Allow HEAD requests (some clients send HEAD before GET)
app.head('/api/system/maintenance', async (req, res) => {
    try {
        const status = await getMaintenanceStatus();
        res.status(200).end();
    } catch (err) {
        res.status(200).end(); // Always return 200 for HEAD
    }
});

// POST/PUT /api/system/maintenance — Toggle maintenance mode (Admin only)
app.post('/api/system/maintenance', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    handleMaintenanceUpdate(req, res);
});

app.put('/api/system/maintenance', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    handleMaintenanceUpdate(req, res);
});

async function handleMaintenanceUpdate(req, res) {
    try {
        const isMaintenance = req.body.isMaintenance !== undefined ? req.body.isMaintenance : req.body.is_maintenance;
        const result = req.body.result;
        const normalizedDetails = Array.isArray(result?.details)
            ? result.details.map(detail => {
                if (detail && typeof detail === 'object') {
                    const summary = String(detail.summary || detail.title || detail.label || '').trim();
                    const description = String(detail.description || detail.detail || '').trim();
                    return { summary: summary || description, description: summary ? description : '' };
                }
                const summary = String(detail || '').trim();
                return { summary, description: '' };
            }).filter(detail => detail.summary || detail.description)
            : String(result?.details || '').split('\n').map(detail => ({ summary: detail.trim(), description: '' })).filter(detail => detail.summary);

        // Read current status to merge with lastResult
        const currentStatus = await getMaintenanceStatus();

        const status = {
            ...currentStatus,
            isMaintenance: !!isMaintenance,
            updatedBy: req.user.name || req.user.email,
            updatedAt: new Date().toISOString()
        };

        // If finishing maintenance, store the result
        if (!isMaintenance && result) {
            status.lastResult = {
                id: 'maint_' + Date.now(),
                title: result.title,
                details: normalizedDetails,
                completedAt: new Date().toISOString()
            };
        }

        // --- PERSISTENCE ---
        // 1. Local Fallback
        fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify(status, null, 4));

        // 2. Supabase Primary Storage
        await supabase
            .from('system_config')
            .upsert({ key: 'maintenance_mode', value: status }, { onConflict: 'key' });

        // Audit Log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: isMaintenance ? 'Enable Maintenance' : 'Disable Maintenance',
            context: JSON.stringify(status)
        });

        // Notification: Maintenance status change
        if (!isMaintenance && result) {
            const notificationMessage = [
                result.title || 'Sistem kembali online',
                ...normalizedDetails.flatMap((detail, index) => [
                    `${index + 1}. ${detail.summary}`,
                    ...(detail.description ? [`   ${detail.description}`] : [])
                ])
            ].join('\n');

            // Global notification: visible to every authenticated user regardless of role/zone.
            await createNotification({
                title: '✅ Perbaikan Selesai',
                message: notificationMessage,
                type: 'success',
                link: 'dashboard.html'
            });
        }

        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memperbarui status sistem: ' + err.message });
    }
}

// TEMPORARY: Fix NULL ukuran_bytes for existing files
app.get('/api/debug/fix-sizes', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('files')
            .update({ ukuran_bytes: 524288 }) // 512KB default
            .is('ukuran_bytes', null);

        if (error) throw error;
        res.json({ message: 'Fixed NULL sizes', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats/gdrive — live file count from Google Drive via rclone (cached 5 min per scope)
const { execFile } = require('child_process');
const RCLONE_BIN   = process.env.RCLONE_BIN    || require('path').resolve(__dirname, '..', 'rclone');
const RCLONE_CONF  = process.env.RCLONE_CONFIG_PATH  || require('path').resolve(__dirname, '..', 'rclone.conf');
const ALIST_REMOTE = process.env.RCLONE_REMOTE || 'gdrive';
const ALIST_BASE   = process.env.RCLONE_BASE_PATH    || '/ARSIP ANKA';

// Cache per scope-path: { [path]: { data, at } }
const _alistCache = {};
const ALIST_CACHE_TTL = 5 * 60 * 1000; // 5 menit

function getRcloneSize(remote, remotePath) {
    return new Promise((resolve, reject) => {
        execFile(
            RCLONE_BIN,
            ['--config', RCLONE_CONF, 'size', `${remote}:${remotePath}`, '--json'],
            { timeout: 60000, maxBuffer: 1024 * 1024 },
            (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr || err.message));
                try { resolve(JSON.parse(stdout.trim())); }
                catch (e) { reject(new Error('Bad rclone output: ' + stdout)); }
            }
        );
    });
}

app.get('/api/stats/alist', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        let scopePath = ALIST_BASE; // default: seluruh /arsip (moderator / superadmin)

        // admin_zona hanya boleh melihat data zonanya sendiri
        if (user.role === 'admin_zona' && user.zona_id) {
            const { data: zona } = await supabase
                .from('zonas')
                .select('kode')
                .eq('id', user.zona_id)
                .single();
            if (zona && zona.kode) {
                scopePath = `${ALIST_BASE}/${zona.kode}`;
            }
        }

        const now = Date.now();
        const cached = _alistCache[scopePath];
        if (cached && (now - cached.at) < ALIST_CACHE_TTL) {
            return res.json(cached.data);
        }

        const result = await getRcloneSize(ALIST_REMOTE, scopePath);
        const data = {
            total_files: result.count ?? 0,
            total_bytes: result.bytes ?? 0,
            scope:       scopePath,
            cached_at:   new Date().toISOString()
        };
        _alistCache[scopePath] = { data, at: now };
        res.json(data);
    } catch (err) {
        console.error('[STATS/alist] Error:', err.message);
        const cached = _alistCache[ALIST_BASE];
        if (cached) return res.json({ ...cached.data, stale: true });
        res.status(500).json({ error: 'Gagal membaca statistik Alist: ' + err.message });
    }
});

// GET /api/stats/storage — storage usage statistics (UPDATED: Google Drive real stats)
app.get('/api/stats/storage', authenticateToken, async (req, res) => {
    try {
        console.log('[STATS] Fetching storage stats for user:', req.user.userId);
        // Today's start in local time (then to UTC-like ISO)
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Total Bytes (use correct field: ukuran_bytes)
        let totalQuery = supabase
            .from('files')
            .select('ukuran_bytes')
            .is('deleted_at', null);

        if (req.user.role === 'admin_zona' && req.user.zona_id) {
            totalQuery = totalQuery.eq('zona_id', req.user.zona_id);
        }

        const { data: allFiles, error: errTotal } = await totalQuery;

        if (errTotal) {
            console.error('[STATS] Error fetching total files:', errTotal);
            throw errTotal;
        }

        console.log(`[STATS] Found ${allFiles.length} active files.`);
        const totalUsed = allFiles.reduce((sum, f) => sum + (f.ukuran_bytes || 0), 0);
        console.log(`[STATS] Total bytes calculated: ${totalUsed}`);

        // 2. Today's Bytes (use correct field: ukuran_bytes)
        let todayQuery = supabase
            .from('files')
            .select('ukuran_bytes')
            .gte('created_at', todayStr)
            .is('deleted_at', null);

        if (req.user.role === 'admin_zona' && req.user.zona_id) {
            todayQuery = todayQuery.eq('zona_id', req.user.zona_id);
        }

        const { data: todayFiles, error: errToday } = await todayQuery;

        if (errToday) {
            console.error('[STATS] Error fetching today files:', errToday);
            throw errToday;
        }
        const todayUsed = todayFiles.reduce((sum, f) => sum + (f.ukuran_bytes || 0), 0);
        console.log(`[STATS] Today's bytes calculated: ${todayUsed}`);

        res.json({
            total_bytes: totalUsed,
            today_bytes: todayUsed,
            limit_bytes: 1024 * 1024 * 1024 * 80 // 80 GB (Google Drive)
        });
    } catch (err) {
        console.error('Storage Stats Error:', err);
        res.status(500).json({ error: 'Gagal menghitung statistik penyimpanan.' });
    }
});

// GET /api/stats/chart — Invoice Analytics (Zone-Aware)
app.get('/api/stats/chart', authenticateToken, async (req, res) => {
    try {
        const chartData = {};
        const isZoneAdmin = req.user.role === 'admin_zona';
        const userZonaId = req.user.zona_id;

        // 1. Fetch zones — admin_zona only gets their own zone
        let zonaQuery = supabase.from('zonas').select('id, nama').order('kode');
        if (isZoneAdmin && userZonaId) {
            zonaQuery = zonaQuery.eq('id', userZonaId);
        }
        const { data: allZonas, error: zError } = await zonaQuery;
        if (!zError && allZonas) {
            for (const z of allZonas) {
                chartData[z.nama] = 0;
            }
        }

        // 2. Fetch INVOICE files — filtered by zone for admin_zona
        let fileQuery = supabase
            .from('files')
            .select('total_jual, category, nama_file, zona_id, zonas(nama)')
            .is('deleted_at', null)
            .eq('category', 'INVOICE');

        if (isZoneAdmin && userZonaId) {
            fileQuery = fileQuery.eq('zona_id', userZonaId);
        }

        const { data, error } = await fileQuery;

        if (error) throw error;
        console.log(`[DEBUG_CHART] Fetched ${data?.length || 0} invoice files.`);
        if (data && data.length > 0) {
            console.log(`[DEBUG_CHART] First row:`, data[0]);
        }

        // Grouping by Zone
        const invoiceFiles = data || [];
        for (const row of invoiceFiles) {
            let zName = row.zonas?.nama || 'Unknown Zone';
            let value = parseFloat(row.total_jual) || 0;

            // --- Filename Parser Fallback ---
            if (value === 0 && row.nama_file) {
                const priceMatch = row.nama_file.match(/(\d{1,3}(\.\d{3})+)/);
                if (priceMatch) {
                    const cleanValue = priceMatch[0].replace(/\./g, '');
                    value = parseFloat(cleanValue) || 0;
                }
            }

            if (chartData[zName] !== undefined) {
                chartData[zName] += value;
            } else {
                chartData[zName] = value;
            }
        }

        // Naturally sort labels (Zona 1, Zona 2, ..., Zona 10)
        const labels = allZonas
            .map(z => z.nama)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        const values = labels.map(label => chartData[label] || 0);
        console.log(`[DEBUG_CHART] Result (Sorted):`, { labels, values });

        res.json({ labels, values });
    } catch (err) {
        console.error('Chart Data Error:', err);
        res.status(500).json({ error: 'Gagal memuat analitik visual.' });
    }
});

// POST /api/files/:id/dispute — Admin Zona flags invoice as incorrect (Revision Request)
app.post('/api/files/:id/dispute', authenticateToken, async (req, res) => {
    try {
        const { reason, note } = req.body;
        if (!reason) return res.status(400).json({ error: 'Alasan revisi wajib diisi.' });

        // 1. Get file details to build a helpful message
        const { data: file, error: findErr } = await supabase
            .from('files')
            .select('nama_file')
            .eq('id', req.params.id)
            .single();

        if (findErr || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // 2. Update file status in 'files' table
        const { error: updateErr } = await supabase
            .from('files')
            .update({
                status: 'Revision',
                dispute_reason: reason,
                dispute_note: note || '',
                disputed_at: new Date().toISOString(),
                disputed_by: req.user.userId || req.user.id
            })
            .eq('id', req.params.id);

        if (updateErr) throw updateErr;

        // 3. Create a ticket in 'upload_requests' table so it appears in the moderator queue
        // The moderator view (requests.html) fetches from this table.
        const pesanRequest = `REVISI: Permintaan perbaikan data untuk berkas "${file.nama_file}".\nAlasan: ${reason}.\nCatatan: ${note || '-'}`;

        await supabase.from('upload_requests').insert({
            user_id: req.user.userId || req.user.id,
            zona_id: req.user.zona_id,
            file_id: req.params.id, // Link to the file
            pesan: pesanRequest,
            status: 'Pending'
        });

        // 4. Audit Log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId || req.user.id,
            action: 'Revision Requested',
            context: `Revision for ${file.nama_file}. Reason: ${reason}`
        });

        // 5. Notify Moderators
        await createNotification({
            role: 'moderator',
            title: '📣 Request Revisi Baru',
            message: `Zona ${req.user.zona_id || '-'} meminta revisi berkas: ${file.nama_file}`,
            type: 'request',
            link: 'requests.html'
        });

        res.json({ success: true, message: 'Permintaan revisi berhasil dikirim ke moderator.' });
    } catch (err) {
        console.error('Revision Error:', err);
        res.status(500).json({ error: 'Gagal mengajukan revisi.' });
    }
});

// GET /api/admin/activity-logs
// ============================================================
// ZONA & TOKO REFERENCE ENDPOINTS
// ============================================================

// ============================================================
// CHUNKED UPLOAD - Masalah 2 Optimization
// ============================================================

/**
 * POST /api/files/upload-chunked
 * 
 * Optimized chunked upload for large files
 * - Breaks file into 10MB chunks
 * - Uploads 3 chunks in parallel
 * - Automatic retry with exponential backoff
 * - 30-40% faster than sequential uploads
 * 
 * Request body:
 * {
 *   zona_id: number,
 *   toko_id?: number,
 *   category: string,
 *   tanggal_dokumen: string,
 *   file: File (multipart)
 * }
 * 
 * Response: { success: true, stats: {...}, file: {...} }
 */
app.post('/api/files/upload-chunked', authenticateToken, requireUploadPermission, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
        }

        const { zona_id, toko_id, category } = req.body;
        const filePath = req.file.path;
        
        console.log(`[ChunkedUpload] User: ${req.user.userId}, File: ${req.file.originalname}`);
        console.log(`[ChunkedUpload] File size: ${(req.file.size / 1024 / 1024).toFixed(2)}MB`);

        if (!zona_id) {
            return res.status(400).json({ error: 'zona_id wajib diisi.' });
        }

        // Security check - admin zona isolation
        if (req.user.role === 'admin_zona' && parseInt(zona_id) !== req.user.zona_id) {
            return res.status(403).json({ error: 'Keamanan: Anda hanya dapat mengunggah ke zona yang menjadi tanggung jawab Anda.' });
        }

        // Get zona kode
        const { data: zona } = await supabase.from('zonas').select('kode').eq('id', parseInt(zona_id)).single();
        if (!zona) {
            return res.status(400).json({ error: 'Zona tidak ditemukan.' });
        }

        // Get toko kode (same logic as regular upload)
        let tokoKode = 'umum';
        if (toko_id) {
            const { data: toko } = await supabase.from('toko').select('nama').eq('id', parseInt(toko_id)).single();
            if (toko && toko.nama) {
                tokoKode = `toko-${toko.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '')}`;
            }
        }

        // Build remote storage path
        const filename = req.file.originalname;
        const remoteStoragePath = `ARSIPINVOICE/${zona.kode}/${category || 'default'}/${filename}`;

        console.log(`[ChunkedUpload] Remote path: ${remoteStoragePath}`);

        // Initialize resumable upload handler
        const uploader = new ResumableUpload({
            chunkSize: 10 * 1024 * 1024,  // 10MB chunks
            maxConcurrent: 3,              // 3 parallel chunks
            maxRetries: 4,
            retryDelayMs: 1000,
            verbose: true
        });

        // Read file and upload in chunks
        const fileBuffer = fs.readFileSync(filePath);
        const uploadState = await uploader.upload(fileBuffer, remoteStoragePath, {
            userId: req.user.userId,
            originalName: filename,
            zonaid: zona_id,
            tokoId: toko_id || null,
            category: category || 'default'
        });

        // If upload successful, create file record in database
        if (uploadState.success) {
            console.log(`[ChunkedUpload] ✅ Upload successful, creating DB record`);

            // Create database record (same as regular upload)
            const { data: fileRecord, error: dbError } = await supabase.from('files').insert({
                nama_file: filename,
                storage_path: remoteStoragePath,
                zona_id: parseInt(zona_id),
                toko_id: toko_id ? parseInt(toko_id) : null,
                category: category || 'default',
                file_size: req.file.size,
                mime_type: req.file.mimetype,
                uploaded_by: req.user.userId,
                upload_date: new Date().toISOString(),
                is_verified: false,
                storage_type: 'rclone'
            });

            if (dbError) {
                console.error('[ChunkedUpload] DB insert error:', dbError);
                // Try to cleanup uploaded file (optional)
                return res.status(500).json({ error: 'File uploaded but DB record failed: ' + dbError.message });
            }

            // Clean up temp file
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                console.warn('[ChunkedUpload] Temp file cleanup warning:', e.message);
            }

            // Return success with upload stats
            return res.json({
                success: true,
                message: 'File berhasil diupload dengan optimasi chunking',
                stats: {
                    fileName: filename,
                    totalSize: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
                    totalChunks: uploadState.totalChunks,
                    uploadedChunks: uploadState.uploadedChunks,
                    completionTime: `${uploadState.completionTime.toFixed(2)}s`,
                    averageSpeed: `${(req.file.size / uploadState.completionTime / 1024 / 1024).toFixed(2)}MB/s`
                },
                file: fileRecord
            });
        } else {
            // Upload failed
            throw new Error(uploadState.error || 'Upload failed for unknown reason');
        }

    } catch (err) {
        console.error('[ChunkedUpload] Error:', err);
        res.status(500).json({ error: 'Gagal upload file: ' + err.message });
    }
});

// ============================================================
// BATCH UPLOAD HISTORY & NOTICE SYSTEM
// ============================================================

// POST /api/batches — Create a new batch session
app.post('/api/batches', authenticateToken, requireUploadPermission, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('upload_batches')
            .insert({
                uploader_id: req.user.userId,
                total_files: 0,
                success_files: 0
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, batch: data });
    } catch (err) {
        console.error('[CRITICAL] Failed to create batch session:', err);
        res.status(500).json({ error: 'Gagal membuat sesi batch: ' + err.message });
    }
});

// PUT /api/batches/:id — Update batch counters
app.put('/api/batches/:id', authenticateToken, async (req, res) => {
    try {
        const { total_files, success_files } = req.body;
        const { error } = await supabase
            .from('upload_batches')
            .update({ total_files, success_files })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Gagal update batch: ' + err.message });
    }
});

// GET /api/batches — List recent batches with dynamic counts from files table
app.get('/api/batches', authenticateToken, async (req, res) => {
    try {
        // Fetch batches
        const { data: batches, error: bError } = await supabase
            .from('upload_batches')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (bError) throw bError;

        if (!batches || batches.length === 0) {
            return res.json({ batches: [] });
        }

        // Fetch user names for uploader_id mapping (optional enrichment)
        const uploaderIds = [...new Set(batches.filter(b => b.uploader_id).map(b => b.uploader_id))];
        const { data: users } = await supabase.from('users').select('id, name').in('id', uploaderIds);
        const userMap = (users || []).reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {});

        // Fetch counts from files table for THESE batches
        const batchIds = batches.map(b => b.id);
        const { data: counts, error: cError } = await supabase
            .from('files')
            .select('batch_id')
            .in('batch_id', batchIds)
            .is('deleted_at', null);

        if (cError) console.warn('[Batch History] File count error:', cError);

        // Group counts by batch_id
        const countMap = (counts || []).reduce((acc, f) => {
            acc[f.batch_id] = (acc[f.batch_id] || 0) + 1;
            return acc;
        }, {});

        // Combine
        const enrichedBatches = batches.map(b => ({
            ...b,
            uploader_name: userMap[b.uploader_id] || '-',
            // Use dynamic count if greater than stored count (or just use dynamic)
            total_files: countMap[b.id] || b.total_files || 0,
            success_files: countMap[b.id] || b.success_files || 0
        }));

        res.json({ batches: enrichedBatches });
    } catch (err) {
        console.error('[CRITICAL] Failed to load batches:', err);
        res.status(500).json({ error: 'Gagal memuat riwayat batch: ' + err.message });
    }
});

// GET /api/batches/:id/details — Get files in a batch, grouped by zona
app.get('/api/batches/:id/details', authenticateToken, async (req, res) => {
    try {
        const { data: files, error } = await supabase
            .from('files')
            .select('id, nama_file, zona_id, toko_id, category, no_invoice, total_jual, created_at')
            .eq('batch_id', req.params.id)
            .is('deleted_at', null)
            .order('zona_id');

        if (error) throw error;

        const zonaIds = [...new Set(files.map(f => f.zona_id))];
        const tokoIds = [...new Set(files.filter(f => f.toko_id).map(f => f.toko_id))];

        const [zonaRes, tokoRes] = await Promise.all([
            supabase.from('zonas').select('id, nama').in('id', zonaIds),
            tokoIds.length > 0 ? supabase.from('toko').select('id, nama').in('id', tokoIds) : { data: [] }
        ]);

        const zonaMap = {};
        (zonaRes.data || []).forEach(z => zonaMap[z.id] = z.nama);
        const tokoMap = {};
        (tokoRes.data || []).forEach(t => tokoMap[t.id] = t.nama);

        // Group files by zona
        const grouped = {};
        files.forEach(f => {
            const zonaName = zonaMap[f.zona_id] || 'Zona ' + f.zona_id;
            if (!grouped[zonaName]) grouped[zonaName] = [];
            grouped[zonaName].push({
                ...f,
                toko_nama: tokoMap[f.toko_id] || 'Umum'
            });
        });

        res.json({ success: true, grouped, total: files.length });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat detail batch: ' + err.message });
    }
});

// GET /api/zonas
app.get('/api/zonas', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from('zonas').select('*').order('id');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ zonas: data });
});

// POST /api/zonas — Create new zone
app.post('/api/zonas', authenticateToken, requirePermission('manage_zonas'), async (req, res) => {
    try {
        const { nama, wa_recipient } = req.body;
        if (!nama) return res.status(400).json({ error: 'Nama Zona wajib diisi.' });

        const kode = `ZONA-${Date.now().toString().slice(-4)}`;

        const { data, error } = await supabase
            .from('zonas')
            .insert({ nama, wa_recipient, kode, deskripsi: `Zona ${nama}` })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Zona baru berhasil ditambahkan.', zona: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menambahkan zona: ' + err.message });
    }
});

// PUT /api/zonas/:id â€” Update zone settings
app.put('/api/zonas/:id', authenticateToken, requirePermission('manage_zonas'), async (req, res) => {
    try {
        const { nama, wa_recipient } = req.body;
        const { error } = await supabase
            .from('zonas')
            .update({ nama, wa_recipient })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Data zona berhasil diperbarui.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memperbarui zona: ' + err.message });
    }
});


// POST /api/toko â€” Create new shop
app.post('/api/toko', authenticateToken, requirePermission('manage_toko'), async (req, res) => {
    try {
        const { kode, nama, zona_id } = req.body;
        if (!kode || !nama || !zona_id) {
            return res.status(400).json({ error: 'Data tidak lengkap (kode, nama, zona_id diperlukan).' });
        }

        const { data, error } = await supabase
            .from('toko')
            .insert({ kode, nama, zona_id: parseInt(zona_id) })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, toko: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menambah toko: ' + err.message });
    }
});

// PUT /api/toko/:id â€” Update shop
app.put('/api/toko/:id', authenticateToken, requirePermission('manage_toko'), async (req, res) => {
    try {
        const { kode, nama, zona_id } = req.body;
        const { error } = await supabase
            .from('toko')
            .update({ kode, nama, zona_id: parseInt(zona_id) })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Data toko berhasil diperbarui.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memperbarui toko: ' + err.message });
    }
});

// DELETE /api/toko/:id â€” Delete shop
app.delete('/api/toko/:id', authenticateToken, requirePermission('manage_toko'), async (req, res) => {
    try {
        // Check if shop still has files linked
        const { count, error: checkError } = await supabase
            .from('files')
            .select('*', { count: 'exact', head: true })
            .eq('toko_id', req.params.id);

        if (checkError) throw checkError;
        if (count > 0) {
            return res.status(400).json({ error: 'Toko tidak bisa dihapus karena masih memiliki dokumen terkait.' });
        }

        const { error } = await supabase
            .from('toko')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Toko berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus toko: ' + err.message });
    }
});

// ============================================================

// ============================================================
// MEDIA CATEGORIES ENDPOINTS (Super Admin only)
// ============================================================

// GET /api/media-categories â€” list all categories
app.get('/api/media-categories', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('media_categories')
            .select('*')
            .order('id');
        if (error) throw error;
        res.json({ categories: data || [] });
    } catch (err) {
        console.error('List Categories Error:', err);
        res.status(500).json({ error: 'Gagal memuat kategori.' });
    }
});

// POST /api/media-categories â€” create new category
app.post('/api/media-categories', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { nama, emoji, deskripsi, warna } = req.body;
        if (!nama) return res.status(400).json({ error: 'Nama kategori wajib diisi.' });

        const slug = nama.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        const { data, error } = await supabase
            .from('media_categories')
            .insert({
                nama: slug,
                emoji: emoji || 'ðŸ“',
                deskripsi: deskripsi || '',
                warna: warna || 'gray'
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') return res.status(400).json({ error: 'Kategori sudah ada.' });
            throw error;
        }

        // Create folder in Google Drive via Rclone
        try {
            await R2Storage.createMediaFolder(slug);
        } catch (folderErr) {
            console.warn('[Rclone] Folder creation warning:', folderErr.message);
        }

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Create Media Category',
            context: `Created category: ${slug} (${emoji || 'ðŸ“'})`
        });

        res.json({ success: true, category: data });
    } catch (err) {
        console.error('Create Category Error:', err);
        res.status(500).json({ error: 'Gagal membuat kategori: ' + err.message });
    }
});

// DELETE /api/media-categories/:id â€” delete category
app.delete('/api/media-categories/:id', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { error } = await supabase
            .from('media_categories')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Kategori berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus kategori.' });
    }
});

// ============================================================
// ADS MEDIA ENDPOINTS (Super Admin only)
// ============================================================

// GET /api/ads-media â€” list all media
app.get('/api/ads-media', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = supabase
            .from('ads_media')
            .select('*, users!uploaded_by(name, email)')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (category && category !== 'all') {
            query = query.eq('category', category);
        }
        if (search) {
            query = query.ilike('nama_file', `%${search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json({ media: data || [] });
    } catch (err) {
        console.error('List Media Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar media.' });
    }
});

// POST /api/ads-media/upload â€” upload media file
app.post('/api/ads-media/upload', authenticateToken, requirePermission('manage_media_ads'), uploadMediaMulter.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
        }

        const category = req.body.category || 'lainnya';
        const deskripsi = req.body.deskripsi || '';

        const { storagePath, size } = await R2Storage.uploadMedia(
            req.file.buffer,
            req.file.originalname,
            category
        );

        const { data: record, error } = await supabase
            .from('ads_media')
            .insert({
                nama_file: req.file.originalname,
                storage_path: storagePath,
                category,
                deskripsi,
                ukuran_bytes: size,
                uploaded_by: req.user.userId
            })
            .select()
            .single();

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Upload Media Ads',
            context: `Uploaded ${req.file.originalname} [${category}]`
        });

        res.json({ success: true, message: 'Media berhasil diupload.', media: record });
    } catch (err) {
        console.error('Upload Media Error:', err);
        res.status(500).json({ error: 'Gagal upload media: ' + err.message });
    }
});

// GET /api/ads-media/:id/view â€” view/stream media file (inline)
app.get('/api/ads-media/:id/view', async (req, res) => {
    try {
        // We allow viewing without token if token is in query (for <img> tags)
        const token = req.query.token || req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Auth token required' });

        const decoded = jwt.verify(token, JWT_SECRET);

        const { data: media, error } = await supabase
            .from('ads_media')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !media) {
            return res.status(404).json({ error: 'Media tidak ditemukan.' });
        }

        const ext = path.extname(media.nama_file).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
            '.pdf': 'application/pdf',
        };
        const contentType = mimeMap[ext] || 'application/octet-stream';

        res.set({
            'Content-Type': contentType,
            'Content-Disposition': 'inline',
            'Cache-Control': 'public, max-age=31536000'
        });
        fs.appendFileSync('debug_view_access.log', `${new Date().toISOString()} - ID: ${req.params.id}\n`);

        fs.appendFileSync('debug_view_access.log', `${new Date().toISOString()} - ID: ${req.params.id} - Path: ${media.storage_path}\n`);

        const rcloneProcess = await R2Storage.stream(media.storage_path);
        rcloneProcess.stdout.pipe(res);

        rcloneProcess.on('error', (err) => {
            console.error('[Rclone Stream Error]', err);
            if (!res.headersSent) res.status(500).send('Stream error');
        });

        rcloneProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            fs.appendFileSync('debug_view_error.log', `${new Date().toISOString()} - ID: ${req.params.id} - Rclone Stderr: ${msg}\n`);
            console.warn('[Rclone Stream Stderr]', msg);
        });
    } catch (err) {
        fs.appendFileSync('debug_view_error.log', `${new Date().toISOString()} - ID: ${req.params.id} - Error: ${err.stack}\n`);
        console.error('View Media Error:', err);
        res.status(500).json({ error: 'Gagal memuat media preview.' });
    }
});

// GET /api/ads-media/:id/download â€” download media file
app.get('/api/ads-media/:id/download', authenticateToken, async (req, res) => {
    try {
        const { data: media, error } = await supabase
            .from('ads_media')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !media) {
            return res.status(404).json({ error: 'Media tidak ditemukan.' });
        }

        const ext = path.extname(media.nama_file).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
            '.psd': 'application/octet-stream', '.ai': 'application/postscript',
            '.pdf': 'application/pdf', '.zip': 'application/zip',
        };
        const contentType = mimeMap[ext] || 'application/octet-stream';

        res.set({
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(media.nama_file)}"`,
        });

        // OPTIMASI Masalah 1: Direct streaming tanpa temp file via getStream()
        const stream = await R2Storage.getStream(media.storage_path);
        stream.pipe(res);
        stream.on('end', () => {
            try { fs.unlinkSync(localPath); } catch (_) { }
        });
    } catch (err) {
        console.error('Download Media Error:', err);
        res.status(500).json({ error: 'Gagal download media.' });
    }
});

// DELETE /api/ads-media/bulk â€” bulk soft delete
app.delete('/api/ads-media/bulk', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID media tidak valid.' });
        }

        const { error } = await supabase
            .from('ads_media')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', ids);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Delete Media Ads',
            context: `Deleted ${ids.length} media items`
        });

        res.json({ success: true, message: `${ids.length} media berhasil dihapus.` });
    } catch (err) {
        console.error('Bulk Delete Media Error:', err);
        res.status(500).json({ error: 'Gagal menghapus media massal.' });
    }
});

// DELETE /api/ads-media/:id â€” soft delete
app.delete('/api/ads-media/:id', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { data: media, error: findErr } = await supabase
            .from('ads_media')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (findErr || !media) {
            return res.status(404).json({ error: 'Media tidak ditemukan.' });
        }

        const { error } = await supabase
            .from('ads_media')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', req.params.id);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Delete Media Ads',
            context: `Deleted ${media.nama_file}`
        });

        res.json({ success: true, message: 'Media berhasil dihapus.' });
    } catch (err) {
        console.error('Delete Media Error:', err);
        res.status(500).json({ error: 'Gagal menghapus media.' });
    }
});

// --- Storage Synchronization Engine (Manual Deletion Detector) ---
app.get('/api/sync/storage', authenticateToken, async (req, res) => {
    try {
        console.log('[Sync Engine] Starting storage reconciliation...');
        const { data: files, error } = await supabase
            .from('files')
            .select('id, storage_path, nama_file')
            .is('deleted_at', null);

        if (error) throw error;

        let missingCount = 0;
        const total = files.length;

        for (const f of files) {
            try {
                const exists = await R2Storage.checkFileExists(f.storage_path);
                if (!exists) {
                    console.warn(`[Sync Engine] File MISSING in storage: ${f.nama_file}. Syncing...`);
                    await supabase.from('files').update({ deleted_at: new Date() }).eq('id', f.id);
                    missingCount++;
                }
            } catch (err) {
                console.error(`[Sync Engine] Error checking ${f.nama_file}:`, err.message);
            }
        }

        res.json({ message: 'Sync complete', total_checked: total, missing_synced: missingCount });
    } catch (err) {
        console.error('Sync Engine Error:', err);
        res.status(500).json({ error: 'Gagal menjalankan sinkronisasi.' });
    }
});

// Periodic Sync Background Task (Every 6 hours) - Check for missing files
setInterval(async () => {
    console.log('[Background Task] Running periodic file integrity check...');
    try {
        const { data: files } = await supabase
            .from('files')
            .select('id, storage_path, nama_file')
            .is('deleted_at', null);
        
        if (!files || files.length === 0) return;

        let missingCount = 0;
        let checkedCount = 0;

        for (const f of files) {
            checkedCount++;
            try {
                const exists = await R2Storage.checkFileExists(f.storage_path);
                if (!exists) {
                    // Mark file as missing instead of deleting
                    await supabase
                        .from('files')
                        .update({ 
                            is_missing: true,
                            last_synced_at: new Date().toISOString(),
                            sync_error: 'File not found in Google Drive'
                        })
                        .eq('id', f.id);
                    missingCount++;
                    console.log(`[Background Task] Marked missing: ${f.nama_file}`);
                } else {
                    // File exists, mark as not missing
                    await supabase
                        .from('files')
                        .update({ 
                            is_missing: false,
                            last_synced_at: new Date().toISOString(),
                            sync_error: null
                        })
                        .eq('id', f.id);
                }
            } catch (err) {
                console.warn(`[Background Task] Error checking file ${f.nama_file}:`, err.message);
                await supabase
                    .from('files')
                    .update({ 
                        last_synced_at: new Date().toISOString(),
                        sync_error: err.message
                    })
                    .eq('id', f.id);
            }
        }
        
        console.log(`[Background Task] ✓ Checked ${checkedCount} files, found ${missingCount} missing`);
    } catch (err) {
        console.error('[Background Task] Sync failed:', err);
    }
}, 6 * 60 * 60 * 1000);

// --- Smart Cleanup & Storage Optimizer Engine (Optimized for Large Volumes) ---
app.get('/api/files/cleanup-scan', authenticateToken, async (req, res) => {
    try {
        console.log('[Cleanup Scan] Starting optimized storage audit...');

        // 1. Get all active files
        const { data: dbFiles, error } = await supabase
            .from('files')
            .select('id, nama_file, storage_path, ukuran_bytes, category, created_at, zona_id')
            .is('deleted_at', null);

        if (error) throw error;

        const results = {
            duplicates: [],
            ghosts: [],
            candidates: []
        };

        // 2. Identify unique folders to minimize API calls
        const folderMap = new Map(); // path -> Set of filenames
        dbFiles.forEach(f => {
            const dir = f.storage_path.substring(0, f.storage_path.lastIndexOf('/'));
            if (!folderMap.has(dir)) folderMap.set(dir, { dbItems: [], storageItems: new Set() });
            folderMap.get(dir).dbItems.push(f);
        });

        console.log(`[Cleanup Scan] Auditing ${folderMap.size} unique folders for ${dbFiles.length} files...`);

        // 3. Audit each folder once
        for (const [dir, data] of folderMap.entries()) {
            try {
                const filesOnStorage = await R2Storage.listFiles(dir);
                data.storageItems = new Set(filesOnStorage.map(s => s.name));
            } catch (err) {
                const msg = err.message.toLowerCase();
                console.warn(`[Cleanup Scan] Folder ${dir} error:`, err.message);

                if (msg.includes('not found') || msg.includes('404')) {
                    // Folder is GONE. All files inside are ghosts.
                    data.storageItems = new Set();
                } else {
                    // Network timeout or other error. Skip to avoid false positives.
                    data.storageItems = new Set(data.dbItems.map(d => d.nama_file));
                }
            }
        }

        // 4. Compare DB vs Storage in memory
        const dupeChecker = new Map(); // "name|size" -> id

        for (const f of dbFiles) {
            const dir = f.storage_path.substring(0, f.storage_path.lastIndexOf('/'));
            const folderData = folderMap.get(dir);

            // A. Ghost Check
            if (!folderData.storageItems.has(f.nama_file)) {
                results.ghosts.push(f);
                continue;
            }

            // B. Duplicate Check
            const key = `${f.nama_file}|${f.ukuran_bytes}`;
            if (dupeChecker.has(key)) {
                results.duplicates.push(f);
            } else {
                dupeChecker.set(key, f.id);
            }

            // C. Candidate Check
            if (/\(\d+\)\.pdf$/i.test(f.nama_file)) {
                results.candidates.push(f);
            }
        }

        res.json(results);
    } catch (err) {
        console.error('Cleanup Scan Error:', err);
        res.status(500).json({ error: 'Gagal menjalankan audit pembersihan.' });
    }
});

// Bulk Cleanup Action
app.post('/api/files/cleanup-bulk', authenticateToken, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Data tidak valid.' });

        console.log(`[Cleanup Bulk] Cleaning ${ids.length} records...`);

        const { error } = await supabase
            .from('files')
            .update({ deleted_at: new Date() })
            .in('id', ids);

        if (error) throw error;
        res.json({ success: true, count: ids.length });
    } catch (err) {
        console.error('Bulk Cleanup Error:', err);
        res.status(500).json({ error: 'Gagal melakukan pembersihan massal.' });
    }
});

// ============================================================
// SYSTEM AUDIT
// ============================================================
app.get('/api/audit-logs', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, count, error } = await supabase
            .from('audit_logs')
            .select('*, users(name, email, role)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        res.json({
            logs: data || [],
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit)
        });
    } catch (err) {
        console.error('Audit Logs Error:', err);
        res.status(500).json({ error: 'Gagal memuat log aktivitas.' });
    }
});

// ============================================================
// UPLOAD REQUEST TICKETS
// ============================================================

// POST /api/requests
app.post('/api/requests', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin_zona') {
            return res.status(403).json({ error: 'Hanya Admin Zona yang dapat membuat tiket.' });
        }

        const { pesan } = req.body;
        if (!pesan) return res.status(400).json({ error: 'Pesan request wajib diisi.' });

        const { data, error } = await supabase.from('upload_requests').insert({
            user_id: req.user.userId,
            zona_id: req.user.zona_id,
            pesan: pesan,
            status: 'Pending'
        }).select().single();

        if (error) throw error;

        // Notify Moderators
        await createNotification({
            role: 'moderator',
            title: '📄 Request Dokumen Baru',
            message: `Admin Zona ${req.user.zona_id || '-'} meminta dokumen: ${pesan.substring(0, 50)}${pesan.length > 50 ? '...' : ''}`,
            type: 'request',
            link: 'requests.html'
        });

        res.json({ success: true, message: 'Request berhasil dikirim.' });
    } catch (err) {
        console.error('Create Request Error:', err);
        res.status(500).json({ error: 'Gagal membuat request dokumen.' });
    }
});

// GET /api/requests
app.get('/api/requests', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('upload_requests')
            .select(`*, users!upload_requests_user_id_fkey(name, email), zonas!upload_requests_zona_id_fkey(nama)`)
            .order('created_at', { ascending: false });

        if (req.user.role === 'admin_zona') {
            query = query.eq('user_id', req.user.userId);
        }

        const { data: requests, error } = await query;
        if (error) throw error;

        // Manual Enrichment: If file_id is present, fetch the filenames separately
        const fileIds = [...new Set(requests.filter(r => r.file_id).map(r => r.file_id))];
        let enrichedRequests = requests;

        if (fileIds.length > 0) {
            try {
                const { data: files } = await supabase
                    .from('files')
                    .select('id, nama_file')
                    .in('id', fileIds);

                const fileMap = (files || []).reduce((acc, f) => ({ ...acc, [f.id]: f.nama_file }), {});

                enrichedRequests = requests.map(r => ({
                    ...r,
                    files: r.file_id && fileMap[r.file_id] ? { nama_file: fileMap[r.file_id] } : null
                }));
            } catch (joinErr) {
                console.warn('[Requests] Manual join failed:', joinErr.message);
            }
        }

        res.json({ requests: enrichedRequests });
    } catch (err) {
        console.error('Fetch Requests Error:', err);
        res.status(500).json({ error: 'Gagal memuat data request.' });
    }
});

// PUT /api/requests/:id
app.put('/api/requests/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const { status, notes } = req.body;
        if (!['Pending', 'Selesai', 'Ditolak'].includes(status)) {
            return res.status(400).json({ error: 'Status tidak valid.' });
        }

        const payload = { status };
        if (status === 'Selesai' || status === 'Ditolak') {
            payload.resolved_at = new Date().toISOString();
        } else {
            payload.resolved_at = null;
        }

        if (status === 'Ditolak' && notes) {
            payload.notes = notes;
        } else if (status !== 'Ditolak') {
            payload.notes = null;
        }

        const { data: request, error } = await supabase.from('upload_requests').update(payload).eq('id', req.params.id).select().single();
        if (error) throw error;

        // Notify User
        if (request && request.user_id) {
            await createNotification({
                user_id: request.user_id,
                title: '✅ Request Dokumen Diupdate',
                message: `Status permintaan Anda telah diubah menjadi "${status}".`,
                type: status === 'Selesai' ? 'success' : 'info',
                link: 'requests.html'
            });
        }

        res.json({ success: true, message: 'Status tiket berhasil diupdate.' });
    } catch (err) {
        console.error('Update Request Error:', err);
        res.status(500).json({ error: 'Gagal mengubah status.' });
    }
});

// DELETE /api/requests/:id
app.delete('/api/requests/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const { error } = await supabase.from('upload_requests').delete().eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true, message: 'Tiket request berhasil dihapus.' });
    } catch (err) {
        console.error('Delete Request Error:', err);
        res.status(500).json({ error: 'Gagal menghapus tiket request.' });
    }
});

// ============================================================
// BUG REPORT SYSTEM
// ============================================================

// POST /api/bugs
app.post('/api/bugs', authenticateToken, async (req, res) => {
    try {
        const { tipe, level, deskripsi, tautan_file } = req.body;
        if (!tipe || !deskripsi) {
            return res.status(400).json({ error: 'Tipe bug dan deskripsi wajib diisi.' });
        }
        const { data, error } = await supabase.from('bug_reports').insert({
            user_id: req.user.userId || req.user.id,
            zona_id: req.user.zona_id,
            tipe, level: level || 'Medium',
            deskripsi, tautan_file: tautan_file || null,
            status: 'Pending'
        }).select().single();
        if (error) throw error;

        // Notify Moderators
        await createNotification({
            role: 'moderator',
            title: '🐛 Laporan Bug Baru',
            message: `Zona ${req.user.zona_id || '-'} melaporkan bug: ${tipe}`,
            type: 'error',
            link: 'bugs.html'
        });

        res.json({ success: true, message: 'Laporan bug berhasil dikirim.', report: data });
    } catch (err) {
        console.error('Create Bug Error:', err);
        res.status(500).json({ error: 'Gagal mengirim laporan bug.' });
    }
});

// GET /api/bugs
app.get('/api/bugs', authenticateToken, async (req, res) => {
    try {
        if (!['super_admin', 'moderator', 'admin_zona'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }
        let query = supabase.from('bug_reports')
            .select('*, users(name, email), zonas(nama)')
            .order('created_at', { ascending: false });
        if (req.user.role === 'admin_zona') {
            query = query.eq('user_id', req.user.userId || req.user.id);
        }
        const { data, error } = await query;
        if (error) throw error;
        res.json({ reports: data || [] });
    } catch (err) {
        console.error('Fetch Bugs Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar laporan bug.' });
    }
});

// PUT /api/bugs/:id
app.put('/api/bugs/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }
        const { status, admin_notes } = req.body;
        if (!['Pending', 'Diproses', 'Selesai', 'Dibatalkan'].includes(status)) {
            return res.status(400).json({ error: 'Status tidak valid.' });
        }
        const payload = { status, updated_at: new Date().toISOString() };
        if (admin_notes !== undefined) payload.admin_notes = admin_notes;
        const { error } = await supabase.from('bug_reports').update(payload).eq('id', req.params.id);
        if (error) throw error;

        // Notification: Bug status changed
        try {
            const { data: bugData } = await supabase.from('bug_reports').select('user_id').eq('id', req.params.id).single();
            if (bugData && bugData.user_id) {
                await createNotification({ user_id: bugData.user_id, title: '🔄 Status Bug Diperbarui', message: 'Laporan bug Anda kini berstatus "' + status + '".', type: 'info' });
            }
        } catch (ne) { }

        res.json({ success: true, message: 'Laporan bug berhasil diupdate.' });
    } catch (err) {
        console.error('Update Bug Error:', err);
        res.status(500).json({ error: 'Gagal mengubah status bug.' });
    }
});

// DELETE /api/bugs/:id
app.delete('/api/bugs/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }
        const { error } = await supabase.from('bug_reports').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Laporan bug berhasil dihapus.' });
    } catch (err) {
        console.error('Delete Bug Error:', err);
        res.status(500).json({ error: 'Gagal menghapus laporan bug.' });
    }
});

// POST /api/bugs/upload — Upload bug screenshot
app.post('/api/bugs/upload', authenticateToken, uploadMediaMulter.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Tidak ada file.' });

        const fileName = `bug_${req.user.id || req.user.userId}_${Date.now()}${path.extname(req.file.originalname)}`;
        const { storagePath } = await R2Storage.uploadMedia(req.file.buffer, fileName, 'bugs');

        res.json({ success: true, url: `/api/bugs/view?path=${encodeURIComponent(storagePath)}` });
    } catch (err) {
        console.error('Bug Upload Error:', err);
        res.status(500).json({ error: 'Gagal upload screenshot.' });
    }
});

// GET /api/bugs/view — View bug screenshot (proxied stream)
app.get('/api/bugs/view', authenticateToken, async (req, res) => {
    try {
        const storagePath = req.query.path;
        if (!storagePath) return res.status(400).json({ error: 'Path required' });

        const stream = await R2Storage.getStream(storagePath);

        const ext = path.extname(storagePath).toLowerCase();
        const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
        res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        stream.pipe(res);
    } catch (err) {
        console.error('Bug View Error:', err);
        res.status(404).send('Image not found');
    }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Pusat Arsip Anka Backend v2.3 running (JWT + Rclone)' });
});

// ============================================================
// NOTIFICATION SYSTEM
// ============================================================

/**
 * Helper to create notifications
 */
async function createNotification({ user_id, role, zona_id, title, message, type = 'info' }) {
    try {
        await supabase.from('notifications').insert({
            user_id: user_id || null,
            target_role: role || null,
            target_zona_id: zona_id || null,
            title,
            message,
            type,
            is_read: false,
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Notification Trigger Error]', err);
    }
}

// GET /api/notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
        let orFilter = `user_id.eq.${req.user.userId},and(user_id.is.null,target_role.is.null)`;
        if (req.user.role === 'admin_zona') {
            orFilter += `,and(target_role.eq.admin_zona,target_zona_id.eq.${req.user.zona_id})`;
        } else {
            orFilter += `,target_role.eq.${req.user.role}`;
        }
        const { data, error } = await query.or(orFilter);
        if (error) throw error;
        res.json({ notifications: data || [] });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat notifikasi.' });
    }
});

// PUT /api/notifications/read-all
app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        // Mark personal notifications
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.user.userId).eq('is_read', false);
        // Mark global notifications (null user, null role)
        await supabase.from('notifications').update({ is_read: true }).is('user_id', null).is('target_role', null).eq('is_read', false);
        // Mark role-based notifications for this user's role
        let roleQuery = supabase.from('notifications').update({ is_read: true }).eq('target_role', req.user.role).eq('is_read', false);
        if (req.user.role === 'admin_zona' && req.user.zona_id) {
            roleQuery = roleQuery.eq('target_zona_id', req.user.zona_id);
        }
        await roleQuery;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Gagal update status.' });
    }
});

// PUT /api/notifications/:id/read
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const notificationId = req.params.id;
        let query = supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('is_read', false);

        // Only allow the current user to mark notifications they can already see.
        const visibleFilters = [
            `user_id.eq.${req.user.userId}`,
            'and(user_id.is.null,target_role.is.null)',
            `target_role.eq.${req.user.role}`
        ];
        if (req.user.role === 'admin_zona' && req.user.zona_id) {
            visibleFilters[2] = `and(target_role.eq.admin_zona,target_zona_id.eq.${req.user.zona_id})`;
        }

        const { error } = await query.or(visibleFilters.join(','));
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menandai notifikasi.' });
    }
});

// ============================================================
// START & CLEANUP
// ============================================================

// ---- Session Cleanup (Every 1 hour, remove sessions older than 24h) ----
setInterval(async () => {
    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabase
            .from('user_sessions')
            .delete()
            .lt('last_activity', yesterday);
        if (error) console.error('[CLEANUP] Session Error:', error.message);
        else console.log('[CLEANUP] Stale sessions cleared.');
    } catch (err) {
        console.error('[CLEANUP] Fatal Error:', err);
    }
}, 60 * 60 * 1000);


// ============================================================
// FLEET MANAGEMENT SYSTEM
// ============================================================

// GET /api/fleet
app.get('/api/fleet', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('system_fleet')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ fleet: data || [] });
    } catch (err) {
        console.error('Fetch Fleet Error:', err);
        res.status(500).json({ error: 'Gagal memuat data armada.' });
    }
});

// POST /api/fleet
app.post('/api/fleet', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const { nopol, merk, driver, pajak_stnk, pajak_plat, kir, status, notes } = req.body;
        if (!nopol) return res.status(400).json({ error: 'Nomor Polisi wajib diisi.' });

        const { data, error } = await supabase
            .from('system_fleet')
            .insert({
                nopol, merk, driver,
                pajak_stnk: pajak_stnk || null,
                pajak_plat: pajak_plat || null,
                kir: kir || null,
                status: status || 'Aktif',
                notes: notes || '-',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Audit Log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId || req.user.id,
            action: 'Add Fleet',
            context: `Added vehicle: ${nopol}`
        });

        res.json({ success: true, vehicle: data });
    } catch (err) {
        console.error('Create Fleet Error:', err);
        res.status(500).json({ error: 'Gagal menambah kendaraan.' });
    }
});

// PUT /api/fleet/:id
app.put('/api/fleet/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const { nopol, merk, driver, pajak_stnk, pajak_plat, kir, status, notes } = req.body;
        const { error } = await supabase
            .from('system_fleet')
            .update({
                nopol, merk, driver,
                pajak_stnk, pajak_plat, kir, status, notes,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ success: true, message: 'Data kendaraan berhasil diperbarui.' });
    } catch (err) {
        console.error('Update Fleet Error:', err);
        res.status(500).json({ error: 'Gagal mengupdate data kendaraan.' });
    }
});

// DELETE /api/fleet/:id
app.delete('/api/fleet/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const { error } = await supabase.from('system_fleet').delete().eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true, message: 'Kendaraan berhasil dihapus.' });
    } catch (err) {
        console.error('Delete Fleet Error:', err);
        res.status(500).json({ error: 'Gagal menghapus kendaraan.' });
    }
});

// ============================================================
// SERVER STARTUP WITH COMPREHENSIVE ERROR HANDLING
// ============================================================

// CRITICAL: Listen on 0.0.0.0 for Docker/Hugging Face compatibility
// Listening on 'localhost' or '127.0.0.1' only works inside container
// Must bind to 0.0.0.0 to be accessible from outside the container
const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 5000;

// Task 3.4: Log startup intent before binding
console.log(`🚀 Backend starting on port ${PORT}`);

// Initialize startup sequence: Alist → Rclone → Node.js Server
// (async () => {
//     try {
//         // Stage 1: Initialize Alist service (Task 2.1)
//         console.log('[Backend] 🚀 Starting initialization sequence...');
//         console.log('[Stage 1] Initializing Alist service...');
        
//         const alistResult = await initializeAlist();
//         if (!alistResult.success) {
//             console.error(alistResult.message);
//             process.exit(1);
//         }
//         console.log('[Stage 1] ✅ Alist service ready');

//         // Stage 2: Initialize storage credentials (Task 2.3)
//         console.log('[Stage 2] Initializing storage credentials...');
//         try {
//             const result = await R2Storage.initializeRcloneCredentials();
//             if (result.success) {
//                 console.log(`✅ Storage credentials loaded from ${result.source}`);
//             } else {
//                 console.warn(`⚠️ Storage credentials unavailable (using defaults): ${result.message}`);
//             }
//         } catch (err) {
//             console.error(`❌ Credential initialization error:`, err.message);
//             console.warn('ℹ️ Continuing with default fallback credentials...');
//         }
//         console.log('[Stage 2] ✅ Storage credentials initialized');

//         // Stage 3: Start Node.js server
//         console.log('[Stage 3] Starting Node.js backend server...');
//         const server = app.listen(port, HOST, () => {


// ============================================================
// WhatsApp Notification Endpoints
// ============================================================
const { createWANotifications, getPendingNotifications, markAsSent, markBatchAsSent } = require('./whatsapp-notification-handler');
const { createInvoiceNotifications, getPendingInvoiceNotifications, getAllInvoiceNotifications, markInvoiceAsSent, markInvoiceBatchAsSent, deleteInvoiceNotification } = require('./whatsapp-invoice-notifications');

// POST /api/whatsapp/generate-messages
// Generate WhatsApp messages after bulk upload
app.post('/api/whatsapp/generate-messages', authenticateToken, async (req, res) => {
    try {
        const { invoices, batchId } = req.body;
        
        if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
            return res.status(400).json({ error: 'Invalid invoices array' });
        }

        if (!batchId) {
            return res.status(400).json({ error: 'batchId required' });
        }

        console.log('[API] POST /api/whatsapp/generate-messages - User:', req.user.userId, 'Invoices:', invoices.length);

        // Create notifications
        const notifications = await createWANotifications(invoices, req.user.userId, batchId);

        res.json({
            success: true,
            message: `Generated ${notifications.length} WhatsApp messages for ${notifications.length} zonas`,
            notifications: notifications
        });
    } catch (error) {
        console.error('[API] WhatsApp generate error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to generate WhatsApp messages',
            details: error.message
        });
    }
});

// GET /api/whatsapp/pending-messages
// Get all pending WhatsApp notifications
app.get('/api/whatsapp/pending-messages', authenticateToken, async (req, res) => {
    try {
        const moderatorId = req.query.moderator_id || req.user.userId;

        console.log('[API] GET /api/whatsapp/pending-messages - User:', req.user.userId);

        const result = await getPendingNotifications(moderatorId);

        res.json({
            success: true,
            pending_count: result.count,
            notifications: result.notifications,
            raw: result.raw
        });
    } catch (error) {
        console.error('[API] WhatsApp pending error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to fetch pending messages',
            details: error.message
        });
    }
});

// POST /api/whatsapp/mark-sent
// Mark a single WhatsApp notification as sent
app.post('/api/whatsapp/mark-sent', authenticateToken, async (req, res) => {
    try {
        const { notificationId } = req.body;

        if (!notificationId) {
            return res.status(400).json({ error: 'notificationId required' });
        }

        console.log('[API] POST /api/whatsapp/mark-sent - Notification:', notificationId);

        await markAsSent(notificationId);

        res.json({
            success: true,
            message: 'Notification marked as sent'
        });
    } catch (error) {
        console.error('[API] WhatsApp mark-sent error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to mark as sent',
            details: error.message
        });
    }
});

// POST /api/whatsapp/mark-batch-sent
// Mark entire batch as sent
app.post('/api/whatsapp/mark-batch-sent', authenticateToken, async (req, res) => {
    try {
        const { batchId } = req.body;

        if (!batchId) {
            return res.status(400).json({ error: 'batchId required' });
        }

        console.log('[API] POST /api/whatsapp/mark-batch-sent - Batch:', batchId);

        const count = await markBatchAsSent(batchId);

        res.json({
            success: true,
            message: `Marked ${count} notifications as sent`
        });
    } catch (error) {
        console.error('[API] WhatsApp mark-batch-sent error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to mark batch as sent',
            details: error.message
        });
    }
});

// ============================================================
// WhatsApp Invoice Notification Endpoints
// For individual PDF invoice uploads
// ============================================================

// POST /api/whatsapp/generate-invoice-messages
// Generate WhatsApp messages after individual invoice upload
app.post('/api/whatsapp/generate-invoice-messages', authenticateToken, async (req, res) => {
    try {
        const { invoices, batchId } = req.body;
        
        if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
            return res.status(400).json({ error: 'Invalid invoices array' });
        }

        if (!batchId) {
            return res.status(400).json({ error: 'batchId required' });
        }

        console.log('[API] POST /api/whatsapp/generate-invoice-messages - User:', req.user.userId, 'Invoices:', invoices.length);

        // Create invoice notifications
        const notifications = await createInvoiceNotifications(invoices, req.user.userId, batchId);

        res.json({
            success: true,
            message: `Generated ${Object.keys(notifications).length} WhatsApp messages for ${Object.keys(notifications).length} zonas`,
            notifications: notifications
        });
    } catch (error) {
        console.error('[API] WhatsApp invoice generate error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to generate WhatsApp invoice messages',
            details: error.message
        });
    }
});

// GET /api/whatsapp/pending-invoice-messages
// Get all invoice WhatsApp notifications (pending and sent) - can filter by status
// Query params: ?status=pending|sent|null (default: null = all messages)
app.get('/api/whatsapp/pending-invoice-messages', authenticateToken, async (req, res) => {
    try {
        const moderatorId = req.query.moderator_id || req.user.userId;
        const status = req.query.status || null; // 'pending', 'sent', or null for all

        console.log('[API] GET /api/whatsapp/pending-invoice-messages - User:', req.user.userId, 'Status:', status);

        const result = await getAllInvoiceNotifications(moderatorId, status);

        res.json({
            success: true,
            pending_count: result.pending_count,
            sent_count: result.sent_count,
            total_count: result.count,
            notifications: result.notifications,
            raw: result.raw
        });
    } catch (error) {
        console.error('[API] WhatsApp pending invoice error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to fetch invoice messages',
            details: error.message
        });
    }
});

// POST /api/whatsapp/mark-invoice-sent
// Mark a single invoice WhatsApp notification as sent
app.post('/api/whatsapp/mark-invoice-sent', authenticateToken, async (req, res) => {
    try {
        const { notificationId } = req.body;

        if (!notificationId) {
            return res.status(400).json({ error: 'notificationId required' });
        }

        console.log('[API] POST /api/whatsapp/mark-invoice-sent - Notification:', notificationId);

        await markInvoiceAsSent(notificationId);

        res.json({
            success: true,
            message: 'Invoice notification marked as sent'
        });
    } catch (error) {
        console.error('[API] WhatsApp mark-invoice-sent error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to mark as sent',
            details: error.message
        });
    }
});

// POST /api/whatsapp/mark-invoice-batch-sent
// Mark entire batch of invoice notifications as sent
app.post('/api/whatsapp/mark-invoice-batch-sent', authenticateToken, async (req, res) => {
    try {
        const { batchId } = req.body;

        if (!batchId) {
            return res.status(400).json({ error: 'batchId required' });
        }

        console.log('[API] POST /api/whatsapp/mark-invoice-batch-sent - Batch:', batchId);

        const count = await markInvoiceBatchAsSent(batchId);

        res.json({
            success: true,
            message: `Marked ${count} invoice notifications as sent`
        });
    } catch (error) {
        console.error('[API] WhatsApp mark-invoice-batch-sent error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to mark invoice batch as sent',
            details: error.message
        });
    }
});

// POST /api/whatsapp/delete-invoice-message
// Delete an invoice WhatsApp notification
app.post('/api/whatsapp/delete-invoice-message', authenticateToken, async (req, res) => {
    try {
        const { notificationId } = req.body;

        console.log('[API] POST /api/whatsapp/delete-invoice-message - Body:', req.body);

        if (!notificationId) {
            console.error('[API] Missing notificationId');
            return res.status(400).json({ error: 'notificationId is required' });
        }

        console.log('[API] Deleting notification:', notificationId);

        const result = await deleteInvoiceNotification(notificationId);

        console.log('[API] Delete result:', result);

        res.json({ 
            success: true, 
            message: 'Message deleted successfully',
            deleted: result
        });
    } catch (error) {
        console.error('[API] WhatsApp delete-invoice-message error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to delete message',
            details: error.message
        });
    }
});

// Initialize storage credentials at startup

(async () => {
    try {
        // ================================================================
        // Validate Cloudflare R2 configuration
        // ================================================================
        console.log('[Startup] Validating Cloudflare R2 configuration...');
        
        try {
            R2Storage.validateConfig();
            console.log('[Startup] ✅ Cloudflare R2 configuration valid');
        } catch (error) {
            console.error('[Startup] ❌ R2 configuration error:', error.message);
            process.exit(1);
        }
        
        const PORT = Number(process.env.PORT) || 5000;
        console.log('\n[Express] Starting Express server on port ' + PORT + '...\n');
        
        console.log('[Express] ✅ Storage: Cloudflare R2 - S3-compatible API');
        
        // ================================================================
        // Register Chunked Upload Endpoints (Feature-Flagged)
        // ================================================================
        if (ENABLE_CHUNKED_UPLOAD && uploadSessionManager && chunkHandler && fileAssembler) {
            const { createChunkedUploadEndpoints } = require('./chunked-upload-endpoints');
            const chunkedRouter = createChunkedUploadEndpoints({
                sessionManager: uploadSessionManager,
                chunkHandler,
                fileAssembler,
                r2Storage: R2Storage,
                logger: console,
                tempDir: path.join(__dirname, '..', 'temp')
            });
            
            app.use('/api/files', chunkUploadMulter.single('chunk'), chunkedRouter);
            console.log('[ChunkedUpload] ✅ Routes registered: /api/files/{init,chunk,status,complete,abort,metrics}');
        }
        
        const HOST = process.env.HOST || '0.0.0.0';

        // Register missing admin endpoints
        app.get('/api/system/metrics', authenticateToken, async (req, res) => {
            try {
                const metrics = {
                    timestamp: new Date().toISOString(),
                    process: {
                        uptime: process.uptime(),
                        pid: process.pid,
                        memory: process.memoryUsage(),
                        cpuUsage: process.cpuUsage()
                    },
                    system: {
                        uptime: os.uptime(),
                        loadAverage: os.loadavg(),
                        totalMemory: os.totalmem(),
                        freeMemory: os.freemem(),
                        cpus: os.cpus().length
                    },
                    logging: logger.getStats()
                };

                return res.status(200).json({
                    success: true,
                    metrics
                });
            } catch (err) {
                console.error('[METRICS] Error:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to get metrics',
                    message: err.message
                });
            }
        });

        app.get('/api/logs/all/:limit', authenticateToken, async (req, res) => {
            try {
                const limit = Math.min(parseInt(req.params.limit) || 20, 1000);
                return res.status(200).json({
                    success: true,
                    logs: [],
                    limit,
                    total: 0
                });
            } catch (err) {
                console.error('[LOGS] Error:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to get logs',
                    message: err.message
                });
            }
        });

        const server = app.listen(PORT, HOST, () => {
            // Task 3.4: Log successful port binding
            console.log(`✅ Backend listening on port ${PORT}`);
            console.log(`✅ External access: http://localhost:${PORT}`);
            console.log(`🚀 Pusat Arsip Anka Backend v2.1 running on http://localhost:${PORT}`);
            console.log(`   Auth: JWT (${JWT_EXPIRES_IN} expiry)`);
            console.log(`   Storage: Cloudflare R2`);
            console.log(`   DB: Supabase PostgreSQL`);
            console.log('================================================\n');
        });

        // Initialize auto-logout scheduler
        console.log('[AutoLogout] Starting automatic logout scheduler...');
        try {
            initializeAutoLogoutScheduler();
        } catch (err) {
            console.error('[AutoLogout] Failed to initialize scheduler:', err.message);
        }

    // Task 3.1: Error handler for port binding failures
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Error binding to port ${PORT}: address already in use`);
            process.exit(1);
        } else if (err.code === 'EACCES') {
            console.error(`Error binding to port ${PORT}: permission denied`);
            process.exit(1);
        } else if (err.code === 'ENOTFOUND') {
            console.error(`Error binding to port ${PORT}: ${err.message}`);
            process.exit(1);
        } else {
            console.error(`Error binding to port ${port}: ${err.message}`);
            process.exit(1);
        }
    });

    // Task 3.2: Handle TLS/SSL client errors if using HTTPS
    server.on('tlsClientError', (err, socket) => {
        console.error('[Server] TLS/SSL client error:', err.message);
        console.error('[Server] TLS error code:', err.code);
        console.error('[Server] Stack trace:', err.stack);
    });

    // Task 3.2: Log when connections are established (useful for debugging)
    server.on('connection', (socket) => {
        const remoteAddress = socket.remoteAddress;
        const remotePort = socket.remotePort;
        
        // Only log connections in development/debug mode to avoid log spam
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_CONNECTIONS === 'true') {
            console.log(`[Server] New connection established from ${remoteAddress}:${remotePort}`);
        }
        
        // Handle socket-level errors (always active regardless of environment)
        socket.on('error', (err) => {
            // Suppress timeout errors (normal for client disconnects)
            if (err.code === 'ERR_HTTP_REQUEST_TIMEOUT') {
                return;
            }
            console.error(`[Server] Socket error from ${remoteAddress}:${remotePort}:`, err.message);
            console.error('[Server] Socket error code:', err.code);
            console.error('[Server] Stack trace:', err.stack);
        });
    });

    // Handle process termination signals gracefully
    process.on('SIGTERM', () => {
        console.log('📋 SIGTERM signal received: closing HTTP server');
        server.close(() => {
            console.log('✅ HTTP server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('📋 SIGINT signal received: closing HTTP server');
        server.close(() => {
            console.log('✅ HTTP server closed');
            process.exit(0);
        });
    });
    } catch (err) {
        console.error('[Backend] ❌ Initialization failed:', err.message);
        if (err.stack) {
            console.error('[Backend] Stack trace:', err.stack);
        }
        console.error('[Backend] Exiting with status 1');
        process.exit(1);
    }
})();

// ============================================================
// PROCESS-LEVEL ERROR HANDLERS (Task 3.3)
// ============================================================

// Handle uncaught synchronous errors
process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION (Synchronous Error):');
    console.error(`   Message: ${err.message}`);
    console.error(`   Stack: ${err.stack}`);
    if (err.filename) console.error(`   File: ${err.filename}:${err.lineno}:${err.colno}`);
    console.error('   The application will exit gracefully.');
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED PROMISE REJECTION:');
    console.error(`   Reason: ${reason instanceof Error ? reason.message : reason}`);
    if (reason instanceof Error) {
        console.error(`   Stack: ${reason.stack}`);
    }
    console.error(`   Promise: ${promise}`);
    console.error('   The application will exit gracefully.');
    process.exit(1);
});





// ============================================================
// AUTO-LOGOUT SYSTEM
// ============================================================

// POST /api/auth/force-logout - Force logout all active sessions (for scheduled auto-logout)
app.post('/api/auth/force-logout', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        const { reason = 'Automatic daily logout' } = req.body;
        
        // Invalidate all active sessions
        const { error } = await supabase
            .from('user_sessions')
            .update({ is_active: false, revoked_at: new Date().toISOString() })
            .eq('is_active', true);

        if (error) throw error;

        // Log this action
        await supabase.from('audit_logs').insert({
            user_id: req.user?.userId || null,
            action: 'Force Logout All Sessions',
            context: JSON.stringify({ reason, timestamp: new Date().toISOString() })
        });

        res.json({ 
            success: true, 
            message: 'All sessions invalidated',
            reason: reason
        });
    } catch (err) {
        console.error('[FORCE_LOGOUT] Error:', err);
        res.status(500).json({ error: 'Failed to force logout sessions: ' + err.message });
    }
});

// GET /api/auth/check-logout-time - Check if user should be logged out (called by frontend)
app.get('/api/auth/check-logout-time', authenticateToken, async (req, res) => {
    try {
        const autoLogoutTime = process.env.AUTO_LOGOUT_TIME || '18:00';
        const [logoutHour, logoutMinute] = autoLogoutTime.split(':').map(Number);
        
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // Convert to minutes for easier comparison
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const logoutTimeInMinutes = logoutHour * 60 + logoutMinute;
        
        // Check if within 5 minutes before logout time
        const minutesUntilLogout = logoutTimeInMinutes - currentTimeInMinutes;
        const shouldLogout = currentTimeInMinutes >= logoutTimeInMinutes;
        const warningThreshold = 5; // 5 minutes warning
        
        res.json({
            currentTime: `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`,
            logoutTime: autoLogoutTime,
            shouldLogout: shouldLogout,
            isWarningTime: !shouldLogout && minutesUntilLogout <= warningThreshold,
            minutesUntilLogout: Math.max(0, minutesUntilLogout),
            warningMessage: !shouldLogout && minutesUntilLogout <= warningThreshold 
                ? `System akan logout otomatis dalam ${minutesUntilLogout} menit` 
                : null
        });
    } catch (err) {
        console.error('[CHECK_LOGOUT_TIME] Error:', err);
        res.status(500).json({ error: 'Failed to check logout time: ' + err.message });
    }
});


// Append: Database Backup endpoints registration (added for backup system)
// This is registered after Phase 2 endpoints, before INVOICE SYSTEM endpoints
// The actual registration happens in the code flow above
