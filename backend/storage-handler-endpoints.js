/**
 * Storage Handler Endpoints
 * Full-featured file manager for Cloudflare R2
 * Provides browse, upload, download, delete, rename, and preview functionality
 */

const { 
    S3Client, 
    ListObjectsV2Command, 
    GetObjectCommand, 
    PutObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    CopyObjectCommand,
    HeadObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const path = require('path');
const stream = require('stream');

// Import R2 storage module
const r2Storage = require('./r2-storage');

module.exports = function registerStorageHandlerEndpoints(app, supabase, authenticateToken, authorizeRole) {
    
    // Get S3 client and config from r2-storage module
    const s3Client = r2Storage.getS3Client();
    const config = r2Storage.getConfig();

    // Configure multer for memory storage
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 100 * 1024 * 1024 // 100MB max
        }
    });

    /**
     * GET /api/storage-handler/browse
     * Browse files and folders in R2
     * Query params: prefix (folder path), delimiter (/, default)
     */
    app.get('/api/storage-handler/browse', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { prefix = '', delimiter = '/', maxKeys = 1000 } = req.query;

            console.log(`[StorageHandler] Browse request: prefix="${prefix}", delimiter="${delimiter}"`);

            const command = new ListObjectsV2Command({
                Bucket: config.bucketName,
                Prefix: prefix,
                Delimiter: delimiter,
                MaxKeys: parseInt(maxKeys)
            });

            const response = await s3Client.send(command);

            // Process folders (CommonPrefixes)
            const folders = (response.CommonPrefixes || []).map(item => ({
                type: 'folder',
                name: item.Prefix.replace(prefix, '').replace(/\/$/, ''),
                path: item.Prefix,
                fullPath: item.Prefix
            }));

            // Process files (Contents)
            const files = (response.Contents || [])
                .filter(item => item.Key !== prefix) // Exclude the prefix itself
                .map(item => ({
                    type: 'file',
                    name: path.basename(item.Key),
                    path: item.Key,
                    fullPath: item.Key,
                    size: item.Size,
                    lastModified: item.LastModified,
                    etag: item.ETag?.replace(/"/g, ''),
                    extension: path.extname(item.Key).toLowerCase()
                }));

            // Combine and sort: folders first, then files
            const items = [
                ...folders.sort((a, b) => a.name.localeCompare(b.name)),
                ...files.sort((a, b) => a.name.localeCompare(b.name))
            ];

            res.json({
                success: true,
                prefix: prefix || '/',
                items,
                totalFiles: files.length,
                totalFolders: folders.length,
                isTruncated: response.IsTruncated || false,
                continuationToken: response.NextContinuationToken
            });

        } catch (error) {
            console.error('[StorageHandler] Browse error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to browse storage',
                message: error.message
            });
        }
    });

    /**
     * POST /api/storage-handler/upload
     * Upload files to R2
     * Body: files (multipart), folder (string)
     */
    app.post('/api/storage-handler/upload', authenticateToken, authorizeRole('super_admin', 'moderator'), upload.array('files', 10), async (req, res) => {
        try {
            const { folder = '' } = req.body;
            const files = req.files;

            if (!files || files.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No files provided'
                });
            }

            console.log(`[StorageHandler] Uploading ${files.length} file(s) to folder: ${folder}`);

            const results = [];
            const errors = [];

            for (const file of files) {
                try {
                    const filePath = folder ? `${folder}/${file.originalname}` : file.originalname;

                    const command = new PutObjectCommand({
                        Bucket: config.bucketName,
                        Key: filePath,
                        Body: file.buffer,
                        ContentType: file.mimetype,
                        Metadata: {
                            'uploaded-by': req.user.email,
                            'uploaded-at': new Date().toISOString(),
                            'original-filename': file.originalname
                        }
                    });

                    await s3Client.send(command);

                    results.push({
                        success: true,
                        filename: file.originalname,
                        path: filePath,
                        size: file.size
                    });

                    console.log(`[StorageHandler] ✅ Uploaded: ${filePath}`);

                } catch (error) {
                    console.error(`[StorageHandler] ❌ Upload failed: ${file.originalname}`, error);
                    errors.push({
                        filename: file.originalname,
                        error: error.message
                    });
                }
            }

            res.json({
                success: errors.length === 0,
                uploaded: results.length,
                failed: errors.length,
                results,
                errors
            });

        } catch (error) {
            console.error('[StorageHandler] Upload error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to upload files',
                message: error.message
            });
        }
    });

    /**
     * GET /api/storage-handler/download/:path(*)
     * Download file from R2 with proper streaming
     */
    app.get('/api/storage-handler/download/*', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            let filePath = req.params[0]; // Get everything after /download/

            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: 'File path is required'
                });
            }

            // Decode URI component if needed
            filePath = decodeURIComponent(filePath);

            console.log(`[StorageHandler] Download request for: ${filePath}`);

            const command = new GetObjectCommand({
                Bucket: config.bucketName,
                Key: filePath
            });

            const response = await s3Client.send(command);
            const filename = path.basename(filePath);
            
            // Determine content type based on extension
            const ext = path.extname(filename).toLowerCase();
            const contentTypeMap = {
                '.pdf': 'application/pdf',
                '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                '.xls': 'application/vnd.ms-excel',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.csv': 'text/csv',
                '.txt': 'text/plain',
                '.zip': 'application/zip',
                '.json': 'application/json'
            };
            
            const contentType = contentTypeMap[ext] || response.ContentType || 'application/octet-stream';
            const contentLength = response.ContentLength || 0;

            console.log(`[StorageHandler] Streaming: ${filename} | Type: ${contentType} | Size: ${contentLength} bytes`);

            // Set all required headers BEFORE piping
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', contentLength);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Accept-Ranges', 'bytes');

            // Handle streaming properly
            if (response.Body) {
                // Pipe stream directly to response
                response.Body.pipe(res);

                // Handle stream errors
                response.Body.on('error', (error) => {
                    console.error('[StorageHandler] Stream error:', error);
                    if (!res.headersSent) {
                        res.status(500).json({ success: false, error: 'Stream error' });
                    } else {
                        res.end();
                    }
                });

                res.on('error', (error) => {
                    console.error('[StorageHandler] Response error:', error);
                });

                console.log(`[StorageHandler] ✅ Download started for: ${filename}`);
            } else {
                throw new Error('No file content in response');
            }

        } catch (error) {
            console.error('[StorageHandler] Download error:', error.message);
            
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to download file',
                    message: error.message
                });
            }
        }
    });

    /**
     * POST /api/storage-handler/download-bulk
     * Download multiple files as ZIP if count > 5, otherwise individual downloads
     */
    app.post('/api/storage-handler/download-bulk', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { files = [] } = req.body;

            if (!files || files.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No files specified'
                });
            }

            if (files.length > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum 100 files allowed'
                });
            }

            console.log(`[StorageHandler] Bulk download request: ${files.length} files`);

            // If <= 5 files, return signed URLs for individual downloads
            if (files.length <= 5) {
                console.log('[StorageHandler] <= 5 files, generating individual URLs');
                
                const urls = [];
                for (const filePath of files) {
                    try {
                        const filename = path.basename(filePath);
                        const ext = path.extname(filename).toLowerCase();
                        
                        const contentTypeMap = {
                            '.pdf': 'application/pdf',
                            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            '.xls': 'application/vnd.ms-excel',
                            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            '.png': 'image/png',
                            '.jpg': 'image/jpeg',
                            '.jpeg': 'image/jpeg',
                            '.gif': 'image/gif',
                            '.csv': 'text/csv',
                            '.txt': 'text/plain',
                            '.zip': 'application/zip',
                            '.json': 'application/json'
                        };
                        
                        const contentType = contentTypeMap[ext] || 'application/octet-stream';

                        const command = new GetObjectCommand({
                            Bucket: config.bucketName,
                            Key: filePath,
                            ResponseContentType: contentType,
                            ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`
                        });

                        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
                        urls.push({ path: filePath, url: signedUrl, filename });
                    } catch (error) {
                        console.error(`[StorageHandler] Error generating URL for ${filePath}:`, error);
                    }
                }

                return res.json({
                    success: true,
                    type: 'individual',
                    files: urls
                });
            }

            // If > 5 files, create ZIP
            console.log(`[StorageHandler] > 5 files (${files.length}), creating ZIP...`);

            const JSZip = require('jszip');
            const zip = new JSZip();
            let filesAdded = 0;
            let filesFailed = 0;

            // Add each file to ZIP
            for (const filePath of files) {
                try {
                    const filename = path.basename(filePath);
                    
                    console.log(`[StorageHandler] Adding to ZIP: ${filename}`);

                    const command = new GetObjectCommand({
                        Bucket: config.bucketName,
                        Key: filePath
                    });

                    const response = await s3Client.send(command);
                    
                    // Convert stream to buffer
                    const chunks = [];
                    for await (const chunk of response.Body) {
                        chunks.push(chunk);
                    }
                    const buffer = Buffer.concat(chunks);

                    // Add to ZIP
                    zip.file(filename, buffer);
                    filesAdded++;

                } catch (error) {
                    console.error(`[StorageHandler] Error adding ${filePath} to ZIP:`, error);
                    filesFailed++;
                }
            }

            if (filesAdded === 0) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to add any files to ZIP'
                });
            }

            // Generate ZIP file
            console.log(`[StorageHandler] Generating ZIP (${filesAdded} files added, ${filesFailed} failed)`);

            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

            // Upload ZIP to R2 temporary
            const zipFileName = `batch-download-${Date.now()}.zip`;
            const uploadCommand = new PutObjectCommand({
                Bucket: config.bucketName,
                Key: `temp/${zipFileName}`,
                Body: zipBuffer,
                ContentType: 'application/zip',
                Metadata: {
                    'temp': 'true',
                    'created-by': req.user.email,
                    'created-at': new Date().toISOString()
                }
            });

            await s3Client.send(uploadCommand);
            console.log(`[StorageHandler] ✅ ZIP uploaded to temp: ${zipFileName}`);

            // Generate signed URL for ZIP download
            const downloadCommand = new GetObjectCommand({
                Bucket: config.bucketName,
                Key: `temp/${zipFileName}`,
                ResponseContentType: 'application/zip',
                ResponseContentDisposition: `attachment; filename="${encodeURIComponent(zipFileName)}"`
            });

            const signedZipUrl = await getSignedUrl(s3Client, downloadCommand, { expiresIn: 900 });

            res.json({
                success: true,
                type: 'zip',
                url: signedZipUrl,
                filename: zipFileName,
                filesIncluded: filesAdded,
                filesFailed: filesFailed
            });

        } catch (error) {
            console.error('[StorageHandler] Bulk download error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to process bulk download',
                message: error.message
            });
        }
    });
    app.get('/api/storage-handler/download-signed/*', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            let filePath = req.params[0];

            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: 'File path is required'
                });
            }

            filePath = decodeURIComponent(filePath);
            const filename = path.basename(filePath);

            console.log(`[StorageHandler] Signed download URL requested for: ${filePath}`);

            // Determine content type
            const ext = path.extname(filename).toLowerCase();
            const contentTypeMap = {
                '.pdf': 'application/pdf',
                '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                '.xls': 'application/vnd.ms-excel',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.csv': 'text/csv',
                '.txt': 'text/plain',
                '.zip': 'application/zip',
                '.json': 'application/json'
            };
            
            const contentType = contentTypeMap[ext] || 'application/octet-stream';

            // Force download by setting response-content-disposition
            const command = new GetObjectCommand({
                Bucket: config.bucketName,
                Key: filePath,
                ResponseContentType: contentType,
                ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`
            });

            // Generate signed URL valid for 15 minutes
            // Use S3 presigner which will include the response headers in the URL
            const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

            console.log(`[StorageHandler] ✅ Generated signed URL for: ${filename}`);

            res.json({
                success: true,
                url: signedUrl,
                filename: filename,
                expiresIn: 900
            });

        } catch (error) {
            console.error('[StorageHandler] Signed download error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to generate download URL',
                message: error.message
            });
        }
    });

    /**
     * GET /api/storage-handler/preview/:path(*)
     * Get signed URL for file preview (images, PDFs, etc)
     */
    app.get('/api/storage-handler/preview/*', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const filePath = req.params[0];

            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: 'File path is required'
                });
            }

            console.log(`[StorageHandler] Preview request: ${filePath}`);

            // Generate signed URL valid for 1 hour
            const command = new GetObjectCommand({
                Bucket: config.bucketName,
                Key: filePath
            });

            const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

            res.json({
                success: true,
                url: signedUrl,
                expiresIn: 3600
            });

        } catch (error) {
            console.error('[StorageHandler] Preview error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to generate preview URL',
                message: error.message
            });
        }
    });

    /**
     * DELETE /api/storage-handler/delete
     * Delete file or folder from R2
     * Body: path (string), recursive (boolean, for folders)
     */
    app.delete('/api/storage-handler/delete', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { path: filePath, recursive = false } = req.body;

            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: 'Path is required'
                });
            }

            console.log(`[StorageHandler] Delete request: ${filePath}, recursive: ${recursive}`);

            // Check if it's a folder (ends with /)
            const isFolder = filePath.endsWith('/');

            if (isFolder && recursive) {
                // List all objects in folder
                const listCommand = new ListObjectsV2Command({
                    Bucket: config.bucketName,
                    Prefix: filePath
                });

                const listResponse = await s3Client.send(listCommand);
                const objects = listResponse.Contents || [];

                if (objects.length === 0) {
                    return res.json({
                        success: true,
                        message: 'Folder is already empty or does not exist',
                        deleted: 0
                    });
                }

                // Delete all objects (batch delete)
                const deleteCommand = new DeleteObjectsCommand({
                    Bucket: config.bucketName,
                    Delete: {
                        Objects: objects.map(obj => ({ Key: obj.Key }))
                    }
                });

                const deleteResponse = await s3Client.send(deleteCommand);

                console.log(`[StorageHandler] ✅ Deleted folder: ${filePath} (${objects.length} files)`);

                res.json({
                    success: true,
                    deleted: objects.length,
                    errors: deleteResponse.Errors || []
                });

            } else {
                // Delete single file
                const command = new DeleteObjectCommand({
                    Bucket: config.bucketName,
                    Key: filePath
                });

                await s3Client.send(command);

                console.log(`[StorageHandler] ✅ Deleted file: ${filePath}`);

                res.json({
                    success: true,
                    deleted: 1
                });
            }

        } catch (error) {
            console.error('[StorageHandler] Delete error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete',
                message: error.message
            });
        }
    });

    /**
     * POST /api/storage-handler/rename
     * Rename/move file or folder
     * Body: oldPath (string), newPath (string)
     */
    app.post('/api/storage-handler/rename', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { oldPath, newPath } = req.body;

            if (!oldPath || !newPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Both oldPath and newPath are required'
                });
            }

            console.log(`[StorageHandler] Rename request: ${oldPath} -> ${newPath}`);

            // Check if it's a folder
            const isFolder = oldPath.endsWith('/');

            if (isFolder) {
                // List all objects in old folder
                const listCommand = new ListObjectsV2Command({
                    Bucket: config.bucketName,
                    Prefix: oldPath
                });

                const listResponse = await s3Client.send(listCommand);
                const objects = listResponse.Contents || [];

                if (objects.length === 0) {
                    return res.json({
                        success: true,
                        message: 'No files to move',
                        moved: 0
                    });
                }

                // Copy each file to new location and delete old
                for (const obj of objects) {
                    const relativePath = obj.Key.replace(oldPath, '');
                    const newKey = newPath + relativePath;

                    // Copy
                    const copyCommand = new CopyObjectCommand({
                        Bucket: config.bucketName,
                        CopySource: `${config.bucketName}/${obj.Key}`,
                        Key: newKey
                    });

                    await s3Client.send(copyCommand);

                    // Delete old
                    const deleteCommand = new DeleteObjectCommand({
                        Bucket: config.bucketName,
                        Key: obj.Key
                    });

                    await s3Client.send(deleteCommand);
                }

                console.log(`[StorageHandler] ✅ Renamed folder: ${oldPath} -> ${newPath} (${objects.length} files)`);

                res.json({
                    success: true,
                    moved: objects.length
                });

            } else {
                // Single file rename/move
                // Copy to new location
                const copyCommand = new CopyObjectCommand({
                    Bucket: config.bucketName,
                    CopySource: `${config.bucketName}/${oldPath}`,
                    Key: newPath
                });

                await s3Client.send(copyCommand);

                // Delete old file
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: config.bucketName,
                    Key: oldPath
                });

                await s3Client.send(deleteCommand);

                console.log(`[StorageHandler] ✅ Renamed file: ${oldPath} -> ${newPath}`);

                res.json({
                    success: true,
                    moved: 1
                });
            }

        } catch (error) {
            console.error('[StorageHandler] Rename error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to rename/move',
                message: error.message
            });
        }
    });

    /**
     * POST /api/storage-handler/create-folder
     * Create a folder (empty marker object)
     * Body: path (string)
     */
    app.post('/api/storage-handler/create-folder', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { path: folderPath } = req.body;

            if (!folderPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Folder path is required'
                });
            }

            // Ensure path ends with /
            const normalizedPath = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;

            console.log(`[StorageHandler] Create folder: ${normalizedPath}`);

            // Create empty marker object for folder
            const command = new PutObjectCommand({
                Bucket: config.bucketName,
                Key: normalizedPath,
                Body: '',
                Metadata: {
                    'created-by': req.user.email,
                    'created-at': new Date().toISOString()
                }
            });

            await s3Client.send(command);

            console.log(`[StorageHandler] ✅ Created folder: ${normalizedPath}`);

            res.json({
                success: true,
                path: normalizedPath
            });

        } catch (error) {
            console.error('[StorageHandler] Create folder error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create folder',
                message: error.message
            });
        }
    });

    /**
     * GET /api/storage-handler/stats
     * Get storage statistics with today's tracking
     */
    app.get('/api/storage-handler/stats', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { prefix = '' } = req.query;

            console.log(`[StorageHandler] Stats request for prefix: ${prefix || 'root'}`);

            // Get actual bucket size
            let bucketSizeInfo = { totalBytes: 0, totalGB: 0 };
            try {
                // Only calculate full bucket size if no prefix (root stats)
                // For prefixed stats, we'll calculate just that prefix
                if (!prefix) {
                    bucketSizeInfo = await r2Storage.getBucketSize();
                    console.log(`[StorageHandler] Bucket actual size: ${bucketSizeInfo.totalGB} GB`);
                }
            } catch (err) {
                console.warn('[StorageHandler] Could not get bucket size:', err.message);
                bucketSizeInfo = { totalBytes: 0, totalGB: 0 };
            }

            const command = new ListObjectsV2Command({
                Bucket: config.bucketName,
                Prefix: prefix
            });

            let totalSize = 0;
            let totalFiles = 0;
            let todayUploadSize = 0;
            let todayUploadCount = 0;
            let todayUsedSize = 0;
            let todayChangesCount = 0;
            const fileTypes = {};

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let continuationToken = null;
            let isTruncated = true;

            // Paginate through all results
            while (isTruncated) {
                const listCommand = new ListObjectsV2Command({
                    Bucket: config.bucketName,
                    Prefix: prefix,
                    ContinuationToken: continuationToken
                });

                const response = await s3Client.send(listCommand);
                const objects = response.Contents || [];

                for (const obj of objects) {
                    totalSize += obj.Size;
                    totalFiles++;

                    const ext = path.extname(obj.Key).toLowerCase() || 'no-extension';
                    fileTypes[ext] = (fileTypes[ext] || 0) + 1;

                    // Track today's uploads (files modified today)
                    const lastModified = new Date(obj.LastModified);
                    lastModified.setHours(0, 0, 0, 0);
                    
                    if (lastModified.getTime() === today.getTime()) {
                        todayUploadSize += obj.Size;
                        todayUploadCount++;
                        todayUsedSize += obj.Size;
                        todayChangesCount++;
                    }
                }

                isTruncated = response.IsTruncated;
                continuationToken = response.NextContinuationToken;
            }

            // Use STORAGE_QUOTA_GB from environment (default 10GB)
            const storageQuotaGB = parseFloat(process.env.STORAGE_QUOTA_GB) || 10;
            const capacityBytes = storageQuotaGB * 1024 * 1024 * 1024;
            const capacityGB = storageQuotaGB;

            // Estimate "today used" as recent changes (last 24 hours activity)
            // For now, we'll use upload count as proxy
            const todayUsedGB = Math.max(0, (todayUsedSize / 1024 / 1024 / 1024).toFixed(2));
            const todayUploadGB = Math.max(0, (todayUploadSize / 1024 / 1024 / 1024).toFixed(2));

            res.json({
                success: true,
                prefix: prefix || '/',
                stats: {
                    // Total stats - return raw bytes for flexible formatting
                    totalFiles,
                    totalSize, // bytes
                    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
                    totalSizeGB: (totalSize / 1024 / 1024 / 1024).toFixed(2),
                    
                    // Storage capacity - from actual bucket calculation
                    capacityBytes: Math.floor(capacityBytes),
                    capacityGB: parseInt(capacityGB),
                    
                    // Today's uploads - return raw bytes
                    todayUploadSize, // bytes
                    todayUploadCount,
                    todayUploadMB: (todayUploadSize / 1024 / 1024).toFixed(2),
                    todayUploadGB: (todayUploadSize / 1024 / 1024 / 1024).toFixed(2),
                    
                    // Today's usage - return raw bytes
                    todayUsedSize, // bytes
                    todayUsedGB: (todayUsedSize / 1024 / 1024 / 1024).toFixed(2),
                    todayChangesCount,
                    
                    // File types
                    fileTypes
                }
            });

        } catch (error) {
            console.error('[StorageHandler] Stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get statistics',
                message: error.message
            });
        }
    });

    /**
     * POST /api/storage-handler/search
     * Search files by name or path
     * Body: query (string), prefix (string, optional)
     */
    app.post('/api/storage-handler/search', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
        try {
            const { query, prefix = '', maxResults = 100 } = req.body;

            if (!query || query.length < 2) {
                return res.status(400).json({
                    success: false,
                    error: 'Search query must be at least 2 characters'
                });
            }

            console.log(`[StorageHandler] Search request: "${query}" in prefix: ${prefix || 'root'}`);

            const results = [];
            let continuationToken = null;
            let isTruncated = true;

            const searchLower = query.toLowerCase();

            // Paginate through all results
            while (isTruncated && results.length < maxResults) {
                const command = new ListObjectsV2Command({
                    Bucket: config.bucketName,
                    Prefix: prefix,
                    ContinuationToken: continuationToken
                });

                const response = await s3Client.send(command);
                const objects = response.Contents || [];

                // Filter by search query
                for (const obj of objects) {
                    const filename = path.basename(obj.Key);
                    if (filename.toLowerCase().includes(searchLower)) {
                        results.push({
                            type: 'file',
                            name: filename,
                            path: obj.Key,
                            fullPath: obj.Key,
                            size: obj.Size,
                            lastModified: obj.LastModified,
                            extension: path.extname(obj.Key).toLowerCase()
                        });

                        if (results.length >= maxResults) break;
                    }
                }

                isTruncated = response.IsTruncated;
                continuationToken = response.NextContinuationToken;
            }

            console.log(`[StorageHandler] ✅ Found ${results.length} results`);

            res.json({
                success: true,
                query,
                prefix: prefix || '/',
                results,
                total: results.length,
                truncated: isTruncated
            });

        } catch (error) {
            console.error('[StorageHandler] Search error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to search files',
                message: error.message
            });
        }
    });

    console.log('[INIT] Storage Handler endpoints registered ✅');
    console.log('  ✓ GET  /api/storage-handler/browse - Browse files and folders');
    console.log('  ✓ POST /api/storage-handler/upload - Upload files');
    console.log('  ✓ GET  /api/storage-handler/download/* - Download file');
    console.log('  ✓ GET  /api/storage-handler/preview/* - Preview file');
    console.log('  ✓ DELETE /api/storage-handler/delete - Delete file/folder');
    console.log('  ✓ POST /api/storage-handler/rename - Rename/move file/folder');
    console.log('  ✓ POST /api/storage-handler/create-folder - Create folder');
    console.log('  ✓ GET  /api/storage-handler/stats - Get storage statistics');
    console.log('  ✓ POST /api/storage-handler/search - Search files');
};
