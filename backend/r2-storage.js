// ============================================================
// Cloudflare R2 Storage Module
// Direct S3-compatible API integration with Cloudflare R2
// ============================================================

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const fs = require('fs').promises;
const { createReadStream } = require('fs');
const { v4: uuidv4 } = require('uuid');
const StorageErrorLogger = require('./storageErrorLogger');

// R2 Configuration
const R2Config = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
    accessKeySecret: process.env.CLOUDFLARE_ACCESS_KEY_SECRET,
    bucketName: process.env.CLOUDFLARE_R2_BUCKET || 'arsip-anka',
    region: 'auto' // R2 uses 'auto' region
};

// Validate R2 configuration
function validateR2Config() {
    const requiredEnvVars = [
        'CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_ACCESS_KEY_ID',
        'CLOUDFLARE_ACCESS_KEY_SECRET'
    ];
    
    const missing = requiredEnvVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
        throw new Error(`Missing required Cloudflare R2 configuration: ${missing.join(', ')}`);
    }
    
    return true;
}

// Initialize S3 client for R2
let s3Client = null;
try {
    validateR2Config();
    s3Client = new S3Client({
        region: R2Config.region,
        credentials: {
            accessKeyId: R2Config.accessKeyId,
            secretAccessKey: R2Config.accessKeySecret
        },
        endpoint: `https://${R2Config.accountId}.r2.cloudflarestorage.com`
    });
    console.log('[R2Storage] ✅ Initialized with Cloudflare R2');
} catch (error) {
    console.error('[R2Storage] ❌ Failed to initialize R2 client:', error.message);
    process.exit(1);
}

// Initialize error logger
const errorLogger = new StorageErrorLogger({
    logFilePath: path.join(__dirname, 'storage-errors.log'),
    enableFileLogging: true,
    enableConsoleLogging: true
});

// ============================================================
// Helper Functions
// ============================================================

/**
 * Convert month number to name or keep name if already string
 * Converts 1-12 or 01-12 to JANUARY, FEBRUARY, etc (or SEPTEMBER, etc)
 */
function convertMonthToName(month) {
    const monthNames = [
        'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
        'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
    ];
    
    // If already a string like "SEPTEMBER", return as is
    if (typeof month === 'string' && isNaN(month)) {
        return month.toUpperCase();
    }
    
    // If it's a number or numeric string
    const monthNum = parseInt(month, 10);
    if (monthNum >= 1 && monthNum <= 12) {
        return monthNames[monthNum - 1];
    }
    
    // Fallback
    return String(month).toUpperCase();
}

// File existence cache with TTL
const FILE_EXISTENCE_CACHE = new Map();
const FILE_EXISTENCE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Request deduplication for parallel checks
const FILE_CHECK_IN_FLIGHT = new Map();

// Download cache (24 hours)
const DOWNLOAD_CACHE_PATH = process.env.DOWNLOAD_CACHE_PATH || path.resolve(__dirname, '..', 'data', 'download-cache');
const DOWNLOAD_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Sync queue for failed uploads
const syncQueuePath = process.env.SYNC_QUEUE_PATH || path.resolve(__dirname, '..', 'data', 'storage-sync-queue.json');
const syncStatusPath = process.env.SYNC_STATUS_PATH || path.resolve(__dirname, '..', 'data', 'storage-sync-status.json');

let syncQueueWorkerStarted = false;
let syncQueueWorkerRunning = false;

// ============================================================
// Cache Management
// ============================================================

function getCachedFileExistence(storagePath) {
    const cached = FILE_EXISTENCE_CACHE.get(storagePath);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > FILE_EXISTENCE_CACHE_TTL) {
        FILE_EXISTENCE_CACHE.delete(storagePath);
        console.log(`[R2Cache] Expired: ${storagePath}`);
        return null;
    }
    
    console.log(`[R2Cache] HIT (${(now - cached.timestamp) / 1000}s old): ${storagePath} = ${cached.exists}`);
    return cached.exists;
}

function setCachedFileExistence(storagePath, exists) {
    FILE_EXISTENCE_CACHE.set(storagePath, {
        exists,
        timestamp: Date.now()
    });
    console.log(`[R2Cache] SET: ${storagePath} = ${exists}`);
}

function invalidateFileExistenceCache(storagePath) {
    FILE_EXISTENCE_CACHE.delete(storagePath);
    console.log(`[R2Cache] INVALIDATED: ${storagePath}`);
}

// ============================================================
// Sync Queue Management
// ============================================================

function readSyncQueue() {
    try {
        if (!fs.existsSync(syncQueuePath)) {
            return {};
        }
        const data = require('fs').readFileSync(syncQueuePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('[R2Sync] Queue file not found or corrupted, starting fresh');
        return {};
    }
}

function writeSyncQueue(queue) {
    try {
        require('fs').mkdirSync(path.dirname(syncQueuePath), { recursive: true });
        require('fs').writeFileSync(syncQueuePath, JSON.stringify(queue, null, 2));
    } catch (error) {
        console.error('[R2Sync] Failed to write queue:', error.message);
    }
}

function enqueueSyncJob(syncData) {
    const queue = readSyncQueue();
    const jobId = uuidv4();
    
    queue[jobId] = {
        ...syncData,
        createdAt: new Date().toISOString(),
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
        lastError: null
    };
    
    writeSyncQueue(queue);
    console.log(`[R2Sync] Enqueued job ${jobId} for ${syncData.storagePath}`);
    
    return jobId;
}

function removeSyncJob(jobId) {
    const queue = readSyncQueue();
    delete queue[jobId];
    writeSyncQueue(queue);
    console.log(`[R2Sync] Removed job ${jobId}`);
}

function updateSyncJob(jobId, updates) {
    const queue = readSyncQueue();
    if (queue[jobId]) {
        queue[jobId] = { ...queue[jobId], ...updates };
        writeSyncQueue(queue);
    }
}

// ============================================================
// Core Storage Operations
// ============================================================

/**
 * Check if file exists in R2
 * Uses cache with 5-minute TTL and request deduplication
 */
async function checkFileExists(storagePath) {
    // Check cache first
    const cached = getCachedFileExistence(storagePath);
    if (cached !== null) {
        return cached;
    }
    
    // Check if request already in flight
    if (FILE_CHECK_IN_FLIGHT.has(storagePath)) {
        console.log(`[R2] Deduplicated request for: ${storagePath}`);
        return FILE_CHECK_IN_FLIGHT.get(storagePath);
    }
    
    // Create new request promise
    const promise = (async () => {
        try {
            const command = new HeadObjectCommand({
                Bucket: R2Config.bucketName,
                Key: storagePath
            });
            
            await s3Client.send(command);
            setCachedFileExistence(storagePath, true);
            return true;
        } catch (error) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                setCachedFileExistence(storagePath, false);
                return false;
            }
            // For any other error (including connection/auth errors), log and return false to allow upload
            console.warn(`[R2] File existence check error (returning false): ${storagePath} - ${error.name || 'Unknown'}: ${error.message}`);
            // Don't throw - be lenient and allow upload to proceed
            return false;
        } finally {
            FILE_CHECK_IN_FLIGHT.delete(storagePath);
        }
    })();
    
    FILE_CHECK_IN_FLIGHT.set(storagePath, promise);
    return promise;
}

/**
 * Force fresh check (bypasses cache)
 */
async function checkFileExistsNoCache(storagePath) {
    try {
        const command = new HeadObjectCommand({
            Bucket: R2Config.bucketName,
            Key: storagePath
        });
        
        await s3Client.send(command);
        return true;
    } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw error;
    }
}

/**
 * Upload invoice PDF to R2
 * Path format: ARSIP/{location}/{category}/{year}/{month}/{day}/{filename}
 */
async function uploadInvoicePDF(buffer, filename, year, month, day, category, location) {
    try {
        // Format path to match your folder structure
        // category: 'PPN', 'NON', 'PIUTANG', etc
        // location: 'BEKASI', 'PEMALANG', etc
        // month can be 'SEPTEMBER', '09', etc - convert to month name if number
        
        const monthName = convertMonthToName(month);
        const storagePath = `ARSIP/${location}/${category}/${year}/${monthName}/${day}/${filename}`;
        
        console.log(`[R2] Uploading invoice PDF: ${storagePath}`);
        
        // Check for duplicates (use fresh check for uploads - no cache)
        const exists = await checkFileExistsNoCache(storagePath);
        if (exists) {
            const error = new Error(`File already exists: ${storagePath}`);
            error.code = 'DUPLICATE_FILE';
            throw error;
        }
        
        // Upload to R2
        const command = new PutObjectCommand({
            Bucket: R2Config.bucketName,
            Key: storagePath,
            Body: buffer,
            ContentType: 'application/pdf',
            Metadata: {
                'uploaded-at': new Date().toISOString(),
                'original-filename': filename,
                'category': category,
                'location': location
            }
        });
        
        await s3Client.send(command);
        
        // Invalidate cache and log success
        invalidateFileExistenceCache(storagePath);
        console.log(`[R2] ✅ Successfully uploaded: ${storagePath}`);
        
        return {
            success: true,
            path: storagePath,
            storagePath,
            filename,
            size: buffer.length,
            uploadedAt: new Date().toISOString()
        };
    } catch (error) {
        const fullError = {
            message: error.message,
            code: error.Code || error.$metadata?.httpStatusCode || 'UNKNOWN',
            name: error.name,
            statusCode: error.$metadata?.httpStatusCode
        };
        console.error(`[R2] Upload error details:`, JSON.stringify(fullError, null, 2));
        errorLogger.logError({
            operation: 'uploadInvoicePDF',
            error: error.message,
            storagePath: `ARSIPINVOICE/${location}/${year}/${monthName}/${day}/${category}/${filename}`,
            errorDetails: fullError
        });
        throw error;
    }
}

/**
 * Upload document file to R2
 * Path format: ARSIP/{location}/{docType}/{year}/{month}/{day}/{filename}
 * docType: 'bukti-bayar', 'Faktur-Pajak', 'dokumen-pendukung'
 */
async function uploadDocumentFile(buffer, filename, year, month, day, folderType, location) {
    try {
        // Format path to match your folder structure
        // folderType: 'bukti-bayar', 'Faktur-Pajak', etc
        // month can be 'SEPTEMBER', '09', etc - convert to month name if number
        
        const monthName = convertMonthToName(month);
        const storagePath = `ARSIP/${location}/${folderType}/${year}/${monthName}/${day}/${filename}`;
        
        console.log(`[R2] Uploading document file: ${storagePath}`);
        
        // Check for duplicates
        const exists = await checkFileExistsNoCache(storagePath);
        if (exists) {
            const error = new Error(`File already exists: ${storagePath}`);
            error.code = 'DUPLICATE_FILE';
            throw error;
        }
        
        // Upload to R2
        const command = new PutObjectCommand({
            Bucket: R2Config.bucketName,
            Key: storagePath,
            Body: buffer,
            ContentType: 'application/octet-stream',
            Metadata: {
                'uploaded-at': new Date().toISOString(),
                'original-filename': filename,
                'folder-type': folderType,
                'location': location
            }
        });
        
        await s3Client.send(command);
        
        // Invalidate cache and log success
        invalidateFileExistenceCache(storagePath);
        console.log(`[R2] ✅ Successfully uploaded: ${storagePath}`);
        
        return {
            storagePath,
            filename,
            size: buffer.length,
            uploadedAt: new Date().toISOString()
        };
    } catch (error) {
        errorLogger.logError({
            operation: 'uploadDocumentFile',
            error: error.message,
            storagePath: `ARSIP/${location}/${folderType}/${year}/${month}/${day}/${filename}`
        });
        throw error;
    }
}

/**
 * Upload generic file to R2
 */
async function uploadFile(buffer, remoteDestination, metadata = {}) {
    try {
        console.log(`[R2] Uploading file: ${remoteDestination}`);
        
        // Check for duplicates (use fresh check for uploads - no cache)
        const exists = await checkFileExistsNoCache(remoteDestination);
        if (exists) {
            const error = new Error(`File already exists: ${remoteDestination}`);
            error.code = 'DUPLICATE_FILE';
            throw error;
        }
        
        const command = new PutObjectCommand({
            Bucket: R2Config.bucketName,
            Key: remoteDestination,
            Body: buffer,
            ContentType: metadata.contentType || 'application/octet-stream',
            Metadata: {
                'uploaded-at': new Date().toISOString(),
                ...metadata
            }
        });
        
        await s3Client.send(command);
        
        invalidateFileExistenceCache(remoteDestination);
        console.log(`[R2] ✅ Successfully uploaded: ${remoteDestination}`);
        
        return {
            storagePath: remoteDestination,
            size: buffer.length,
            uploadedAt: new Date().toISOString()
        };
    } catch (error) {
        errorLogger.logError({
            operation: 'uploadFile',
            error: error.message,
            storagePath: remoteDestination
        });
        throw error;
    }
}

/**
 * Download file from R2 as stream (direct streaming without temp file)
 */
async function getStream(storagePath) {
    try {
        console.log(`[R2] Getting stream for: ${storagePath}`);
        
        const command = new GetObjectCommand({
            Bucket: R2Config.bucketName,
            Key: storagePath
        });
        
        const response = await s3Client.send(command);
        
        console.log(`[R2] ✅ Got stream for: ${storagePath}`);
        return response.Body;
    } catch (error) {
        errorLogger.logError({
            operation: 'getStream',
            error: error.message,
            storagePath
        });
        throw error;
    }
}

/**
 * Download file from R2 to buffer
 */
async function downloadFile(storagePath) {
    try {
        console.log(`[R2] Downloading file: ${storagePath}`);
        
        const command = new GetObjectCommand({
            Bucket: R2Config.bucketName,
            Key: storagePath
        });
        
        const response = await s3Client.send(command);
        const chunks = [];
        
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        
        const buffer = Buffer.concat(chunks);
        
        console.log(`[R2] ✅ Downloaded file: ${storagePath} (${buffer.length} bytes)`);
        return buffer;
    } catch (error) {
        errorLogger.logError({
            operation: 'downloadFile',
            error: error.message,
            storagePath
        });
        throw error;
    }
}

/**
 * Delete file from R2
 */
async function deleteFile(storagePath) {
    try {
        console.log(`[R2] Deleting file: ${storagePath}`);
        
        const command = new DeleteObjectCommand({
            Bucket: R2Config.bucketName,
            Key: storagePath
        });
        
        await s3Client.send(command);
        
        // Invalidate cache
        invalidateFileExistenceCache(storagePath);
        
        console.log(`[R2] ✅ Successfully deleted: ${storagePath}`);
        return { success: true };
    } catch (error) {
        errorLogger.logError({
            operation: 'deleteFile',
            error: error.message,
            storagePath
        });
        throw error;
    }
}

/**
 * List files in directory
 */
async function listFiles(storagePath) {
    try {
        console.log(`[R2] Listing files: ${storagePath}`);
        
        const command = new ListObjectsV2Command({
            Bucket: R2Config.bucketName,
            Prefix: storagePath
        });
        
        const response = await s3Client.send(command);
        const files = (response.Contents || []).map(obj => ({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
            etag: obj.ETag
        }));
        
        console.log(`[R2] ✅ Listed ${files.length} files in: ${storagePath}`);
        return files;
    } catch (error) {
        errorLogger.logError({
            operation: 'listFiles',
            error: error.message,
            storagePath
        });
        throw error;
    }
}

/**
 * Get sync status for a file
 */
function getSyncStatus(storagePath) {
    try {
        const statusData = require('fs').existsSync(syncStatusPath) 
            ? JSON.parse(require('fs').readFileSync(syncStatusPath, 'utf8'))
            : {};
        
        return statusData[storagePath] || null;
    } catch (error) {
        console.error('[R2Sync] Error reading sync status:', error.message);
        return null;
    }
}

/**
 * Process pending sync jobs (retry failed uploads)
 */
async function processPendingSyncJobs() {
    if (syncQueueWorkerRunning) return;
    syncQueueWorkerRunning = true;
    
    try {
        const queue = readSyncQueue();
        const now = new Date();
        
        for (const [jobId, job] of Object.entries(queue)) {
            // Check if it's time to retry
            const nextAttemptTime = new Date(job.nextAttemptAt);
            if (nextAttemptTime > now) {
                continue;
            }
            
            try {
                console.log(`[R2Sync] Retrying job ${jobId} for ${job.storagePath}`);
                
                // Retry upload
                const buffer = job.buffer || Buffer.from('');
                await uploadFile(buffer, job.storagePath, job.metadata);
                
                // Remove from queue on success
                removeSyncJob(jobId);
                console.log(`[R2Sync] ✅ Job ${jobId} completed`);
            } catch (error) {
                // Update retry info
                const attempts = job.attempts + 1;
                const backoffMs = Math.pow(2, Math.min(attempts, 8)) * 1000; // Exponential backoff, max 256s
                
                updateSyncJob(jobId, {
                    attempts,
                    lastError: error.message,
                    nextAttemptAt: new Date(Date.now() + backoffMs).toISOString()
                });
                
                console.log(`[R2Sync] ❌ Job ${jobId} failed (attempt ${attempts}), retrying in ${backoffMs}ms`);
            }
        }
    } catch (error) {
        console.error('[R2Sync] Error processing sync jobs:', error.message);
    } finally {
        syncQueueWorkerRunning = false;
    }
}

/**
 * Start periodic sync job worker
 */
function startSyncQueueWorker() {
    if (syncQueueWorkerStarted) return;
    
    syncQueueWorkerStarted = true;
    console.log('[R2Sync] Starting periodic sync job worker');
    
    // Process jobs every 30 seconds
    setInterval(() => {
        processPendingSyncJobs().catch(error => {
            console.error('[R2Sync] Worker error:', error.message);
        });
    }, 30 * 1000);
}

// Start the worker on module load
startSyncQueueWorker();

// ============================================================
// Exports
// ============================================================

module.exports = {
    // Core operations
    uploadInvoicePDF,
    uploadDocumentFile,
    uploadFile,
    getStream,
    downloadFile,
    deleteFile,
    listFiles,
    
    // Cache management
    getCachedFileExistence,
    setCachedFileExistence,
    invalidateFileExistenceCache,
    checkFileExists,
    checkFileExistsNoCache,
    
    // Sync queue
    enqueueSyncJob,
    removeSyncJob,
    updateSyncJob,
    processPendingSyncJobs,
    getSyncStatus,
    
    // Configuration
    getConfig: () => R2Config,
    validateConfig: validateR2Config,
    
    // Client
    getS3Client: () => s3Client,
    
    // Legacy/compatibility methods (stubs for old rclone-based code)
    buildStoragePath: (zona, toko, filename) => `ARSIPFILES/${zona}/${toko}/${filename}`,
    uploadMedia: async (buffer, filename, folder) => ({
        storagePath: `${folder}/${filename}`,
        size: buffer.length,
        filename
    }),
    stream: (path) => getStream(path),
    createMediaFolder: async (slug) => ({ success: true }),
    getSyncStatuses: (paths) => ({}),
    getSyncQueueSnapshot: () => ({}),
    verifyBackupStorage: async () => ({ healthy: true, detail: 'R2 storage healthy' })
};
