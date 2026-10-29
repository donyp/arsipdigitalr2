/**
 * Chunked Upload Endpoints
 * 
 * REST API endpoints for resumable chunk-based uploads:
 * - POST /api/files/init - Initialize upload session
 * - POST /api/files/chunk - Upload chunk
 * - GET /api/files/status - Check upload status
 * - POST /api/files/complete - Finalize upload
 * - POST /api/files/abort - Cancel upload
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

function createChunkedUploadEndpoints(options = {}) {
  const router = express.Router();
  const sessionManager = options.sessionManager;
  const chunkHandler = options.chunkHandler;
  const fileAssembler = options.fileAssembler;
  const rcloneWrapper = options.rcloneWrapper;
  const logger = options.logger || console;
  const tempDir = options.tempDir || path.join(__dirname, '../temp');

  /**
   * POST /api/files/init
   * Initialize upload session
   */
  router.post('/init', async (req, res) => {
    try {
      const { fileName, fileSize, fileType, chunkSize, metadata } = req.body;
      
      // Validation
      if (!fileName || !fileSize) {
        return res.status(400).json({
          error: 'Missing required fields: fileName, fileSize'
        });
      }

      // Validate file extension against allowlist (defense in depth)
      const allowedExt = ['pdf', 'xlsx', 'xls', 'jpg', 'jpeg', 'png', 'csv'];
      const ext = String(fileName).toLowerCase().split('.').pop();
      if (!allowedExt.includes(ext)) {
        return res.status(400).json({
          error: `Ekstensi file .${ext} tidak diizinkan. Format yang diizinkan: ${allowedExt.join(', ')}`
        });
      }
      // Reject path traversal / suspicious filename
      if (/[\\/]/.test(fileName) || fileName.includes('..')) {
        return res.status(400).json({ error: 'Nama file tidak valid' });
      }
      
      if (fileSize > 500 * 1024 * 1024) { // 500MB limit
        return res.status(413).json({
          error: 'File too large. Maximum size: 500MB'
        });
      }
      
      if (fileSize < 1024) { // Minimum 1KB
        return res.status(400).json({
          error: 'File too small. Minimum size: 1KB'
        });
      }
      
      const session = sessionManager.createSession({
        fileName,
        fileSize,
        fileType,
        chunkSize: chunkSize || 5 * 1024 * 1024,
        metadata: metadata || {}
      });
      
      logger.info(`[UploadEndpoint] Initialized upload: ${session.uploadId}`);
      
      return res.status(200).json(session);
    } catch (error) {
      logger.error('[UploadEndpoint] Init error:', error.message);
      return res.status(500).json({
        error: 'Failed to initialize upload',
        message: error.message
      });
    }
  });

  /**
   * POST /api/files/chunk
   * Upload chunk
   */
  router.post('/chunk', async (req, res) => {
    try {
      const { uploadId, chunkNumber, totalChunks } = req.body;
      
      // Validation
      if (!uploadId || chunkNumber === undefined || !totalChunks) {
        return res.status(400).json({
          error: 'Missing required fields: uploadId, chunkNumber, totalChunks'
        });
      }
      
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          error: 'No chunk data provided'
        });
      }
      
      // Get session
      const session = sessionManager.getSession(uploadId);
      if (!session) {
        return res.status(404).json({
          error: 'Upload session not found or expired'
        });
      }
      
      // Validate chunk number
      if (chunkNumber < 1 || chunkNumber > totalChunks) {
        return res.status(400).json({
          error: `Invalid chunk number ${chunkNumber}. Must be between 1 and ${totalChunks}`
        });
      }
      
      // Check if chunk already uploaded
      if (session.uploadedChunks.has(chunkNumber)) {
        return res.status(409).json({
          error: `Chunk ${chunkNumber} already uploaded`,
          uploadedChunks: Array.from(session.uploadedChunks).sort((a, b) => a - b)
        });
      }
      
      // Save chunk
      const chunkResult = await chunkHandler.saveChunk(
        uploadId,
        chunkNumber,
        req.file.buffer,
        req.body.checksum || null
      );
      
      // Update session
      const updateResult = sessionManager.updateSessionChunk(
        uploadId,
        chunkNumber,
        chunkResult.size,
        chunkResult.checksum
      );
      
      logger.info(
        `[UploadEndpoint] Chunk ${chunkNumber}/${totalChunks} uploaded (${chunkResult.size} bytes)`
      );
      
      return res.status(200).json({
        uploadId,
        chunkNumber,
        status: 'received',
        ...updateResult,
        nextChunk: chunkNumber < totalChunks ? chunkNumber + 1 : null
      });
    } catch (error) {
      logger.error('[UploadEndpoint] Chunk upload error:', error.message);
      return res.status(500).json({
        error: 'Failed to upload chunk',
        message: error.message
      });
    }
  });

  /**
   * GET /api/files/status
   * Check upload status
   */
  router.get('/status', async (req, res) => {
    try {
      const { uploadId } = req.query;
      
      if (!uploadId) {
        return res.status(400).json({
          error: 'Missing required query parameter: uploadId'
        });
      }
      
      const session = sessionManager.getSession(uploadId);
      if (!session) {
        return res.status(404).json({
          error: 'Upload session not found or expired'
        });
      }
      
      const status = sessionManager.getStatus(uploadId);
      
      return res.status(200).json(status);
    } catch (error) {
      logger.error('[UploadEndpoint] Status error:', error.message);
      return res.status(500).json({
        error: 'Failed to get upload status',
        message: error.message
      });
    }
  });

  /**
   * POST /api/files/complete
   * Finalize upload - assemble chunks and upload to Google Drive
   */
  router.post('/complete', async (req, res) => {
    try {
      const { uploadId, checksum, remoteDestination, metadata } = req.body;
      
      if (!uploadId) {
        return res.status(400).json({
          error: 'Missing required field: uploadId'
        });
      }
      
      if (!remoteDestination) {
        return res.status(400).json({
          error: 'Missing required field: remoteDestination'
        });
      }
      
      // Get session
      const session = sessionManager.getSession(uploadId);
      if (!session) {
        return res.status(404).json({
          error: 'Upload session not found or expired'
        });
      }
      
      // Validate session state
      const validation = fileAssembler.validateForAssembly(session);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Cannot complete upload',
          errors: validation.errors,
          warnings: validation.warnings
        });
      }
      
      // Verify all chunks uploaded
      const verification = sessionManager.verifyAllChunksUploaded(uploadId);
      if (!verification.allUploaded) {
        return res.status(400).json({
          error: 'Not all chunks uploaded',
          uploadedCount: verification.uploadedCount,
          totalCount: verification.totalCount,
          missingChunks: verification.missingChunks
        });
      }
      
      // Create temporary file path
      const tempFile = path.join(tempDir, `${uploadId}-final.tmp`);
      
      try {
        // Complete the upload - assemble and upload to Google Drive
        const result = await fileAssembler.completeUpload(
          uploadId,
          session,
          tempFile,
          remoteDestination
        );
        
        // Mark session as completed
        sessionManager.completeSession(uploadId, result.checksum);
        
        logger.info(`[UploadEndpoint] Upload completed: ${uploadId}`);
        
        return res.status(200).json({
          success: true,
          uploadId,
          fileName: result.fileName,
          fileSize: result.fileSize,
          checksum: result.checksum,
          remoteDestination: result.remoteDestination,
          status: 'completed',
          completedAt: result.timestamp
        });
      } finally {
        // Cleanup temp file
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch (error) {
            logger.warn(`[UploadEndpoint] Failed to cleanup temp file: ${tempFile}`);
          }
        }
      }
    } catch (error) {
      logger.error('[UploadEndpoint] Complete error:', error.message);
      
      // Mark session as failed
      try {
        sessionManager.abortSession(uploadId, `completion_error: ${error.message}`);
      } catch (e) {
        logger.warn('[UploadEndpoint] Failed to mark session as aborted');
      }
      
      return res.status(500).json({
        error: 'Failed to complete upload',
        message: error.message
      });
    }
  });

  /**
   * POST /api/files/abort
   * Cancel upload and cleanup
   */
  router.post('/abort', async (req, res) => {
    try {
      const { uploadId, reason } = req.body;
      
      if (!uploadId) {
        return res.status(400).json({
          error: 'Missing required field: uploadId'
        });
      }
      
      const session = sessionManager.getSession(uploadId);
      if (!session) {
        return res.status(404).json({
          error: 'Upload session not found'
        });
      }
      
      // Abort session
      sessionManager.abortSession(uploadId, reason || 'user_cancelled');
      
      // Cleanup chunks
      try {
        await chunkHandler.deleteUploadDirectory(uploadId);
      } catch (error) {
        logger.warn(`[UploadEndpoint] Failed to cleanup chunks: ${error.message}`);
      }
      
      logger.info(`[UploadEndpoint] Aborted upload: ${uploadId}`);
      
      return res.status(200).json({
        success: true,
        uploadId,
        status: 'aborted',
        message: 'Upload cancelled and temporary files cleaned up'
      });
    } catch (error) {
      logger.error('[UploadEndpoint] Abort error:', error.message);
      return res.status(500).json({
        error: 'Failed to abort upload',
        message: error.message
      });
    }
  });

  /**
   * GET /api/files/metrics
   * Get session manager metrics
   */
  router.get('/metrics', (req, res) => {
    try {
      const metrics = sessionManager.getMetrics();
      return res.status(200).json(metrics);
    } catch (error) {
      logger.error('[UploadEndpoint] Metrics error:', error.message);
      return res.status(500).json({
        error: 'Failed to get metrics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/files/active-sessions
   * List active upload sessions (admin only)
   */
  router.get('/active-sessions', (req, res) => {
    try {
      const sessions = sessionManager.listActiveSessions();
      return res.status(200).json({
        count: sessions.length,
        sessions
      });
    } catch (error) {
      logger.error('[UploadEndpoint] Active sessions error:', error.message);
      return res.status(500).json({
        error: 'Failed to list active sessions',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = {
  createChunkedUploadEndpoints
};
