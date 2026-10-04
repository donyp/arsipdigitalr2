/**
 * PDF Compression Utility
 * Auto-compress PDFs that exceed size limits
 * Uses zlib for compression or pdf-lib for optimization
 */

const zlib = require('zlib');
const { PassThrough } = require('stream');

/**
 * Compression limits for different document types
 */
const COMPRESSION_LIMITS = {
    invoice_pdf: {
        maxSize: 2 * 1024 * 1024, // 2MB
        name: 'Invoice PDF'
    },
    faktur_pajak: {
        maxSize: 1 * 1024 * 1024, // 1MB
        name: 'Faktur Pajak'
    },
    bukti_bayar: {
        maxSize: 1 * 1024 * 1024, // 1MB
        name: 'Bukti Bayar'
    }
};

/**
 * Compress PDF - tries multiple strategies
 * Returns compressed buffer and compression metadata
 */
async function compressPDF(inputBuffer, documentType = 'invoice_pdf') {
    try {
        const limit = COMPRESSION_LIMITS[documentType];
        if (!limit) {
            throw new Error(`Unknown document type: ${documentType}`);
        }

        const originalSize = inputBuffer.length;
        console.log(`[PDFCompress] Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB, Limit: ${(limit.maxSize / 1024 / 1024).toFixed(1)} MB`);

        // If already under limit, return as-is
        if (originalSize <= limit.maxSize) {
            console.log(`[PDFCompress] ✅ File within limit, no compression needed`);
            return {
                success: true,
                buffer: inputBuffer,
                originalSize,
                compressedSize: originalSize,
                ratio: 1.0,
                compressed: false,
                compressionNote: null
            };
        }

        console.log(`[PDFCompress] File exceeds limit by ${((originalSize - limit.maxSize) / 1024 / 1024).toFixed(2)} MB, compressing...`);

        // Try pdf-lib first (if available)
        try {
            const result = await compressWithPdfLib(inputBuffer, limit.maxSize, documentType);
            if (result && result.compressedSize <= limit.maxSize) {
                return result;
            }
        } catch (err) {
            console.log(`[PDFCompress] pdf-lib compression not available or failed`);
        }

        // Try zlib deflate compression
        try {
            const result = await compressWithZlib(inputBuffer, limit.maxSize, documentType);
            if (result && result.compressedSize <= limit.maxSize) {
                return result;
            }
        } catch (err) {
            console.log(`[PDFCompress] Zlib compression failed:`, err.message);
        }

        // If compression failed or file still too large, still return it with warning
        console.warn(`[PDFCompress] ⚠️  Could not compress to target size, returning original`);
        return {
            success: false,
            buffer: inputBuffer,
            originalSize,
            compressedSize: originalSize,
            ratio: 1.0,
            compressed: false,
            compressionNote: `⚠️ File exceeds ${(limit.maxSize / 1024 / 1024).toFixed(1)}MB limit - compression failed`,
            warning: true
        };

    } catch (error) {
        console.error('[PDFCompress] Error:', error);
        return {
            success: false,
            buffer: inputBuffer,
            originalSize: inputBuffer.length,
            compressedSize: inputBuffer.length,
            ratio: 1.0,
            compressed: false,
            compressionNote: `Compression error: ${error.message}`,
            warning: true
        };
    }
}

/**
 * Compress using pdf-lib - removes duplicate objects, optimizes streams
 */
async function compressWithPdfLib(inputBuffer, targetSize, documentType) {
    try {
        const pdfLib = require('pdf-lib');
        const { PDFDocument } = pdfLib;
        
        console.log(`[PDFCompress] Attempting pdf-lib compression...`);
        
        // Load and re-save PDF to optimize
        const pdfDoc = await PDFDocument.load(inputBuffer, { 
            ignoreEncryption: true,
            useLegacyMetadata: true
        });
        
        const compressedPdf = await pdfDoc.save({
            useObjectStreams: false,
            compress: true
        });

        const compressedSize = compressedPdf.length;
        const ratio = compressedSize / inputBuffer.length;

        console.log(`[PDFCompress] pdf-lib: ${(compressedSize / 1024 / 1024).toFixed(2)} MB (ratio: ${ratio.toFixed(2)}x)`);

        return {
            success: true,
            buffer: Buffer.from(compressedPdf),
            originalSize: inputBuffer.length,
            compressedSize,
            ratio,
            compressed: true,
            compressionNote: ratio < 0.9 ? `📦 Optimized to ${(ratio * 100).toFixed(0)}% of original size` : null
        };

    } catch (error) {
        console.log(`[PDFCompress] pdf-lib failed:`, error.message);
        throw error;
    }
}

/**
 * Compress using Node.js zlib deflate
 * PDF is already compressed, but we can try gzip for additional compression
 */
async function compressWithZlib(inputBuffer, targetSize, documentType) {
    return new Promise((resolve, reject) => {
        zlib.deflate(inputBuffer, { level: 9 }, (err, compressed) => {
            if (err) {
                reject(err);
                return;
            }

            const ratio = compressed.length / inputBuffer.length;
            console.log(`[PDFCompress] Zlib: ${(compressed.length / 1024 / 1024).toFixed(2)} MB (ratio: ${ratio.toFixed(2)}x)`);

            // Zlib is useful but we need to be careful with PDFs
            // Only return if significant compression achieved
            if (ratio < 0.95) {
                resolve({
                    success: true,
                    buffer: compressed,
                    originalSize: inputBuffer.length,
                    compressedSize: compressed.length,
                    ratio,
                    compressed: true,
                    compressionNote: `📦 Deflated to ${(ratio * 100).toFixed(0)}% of original size`,
                    isDeflated: true
                });
            } else {
                reject(new Error('Zlib compression not effective enough'));
            }
        });
    });
}

module.exports = {
    compressPDF,
    COMPRESSION_LIMITS
};

