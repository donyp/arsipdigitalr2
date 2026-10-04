# Masalah 4: Auto-Compression Analysis

## Task #1: File Size Thresholds and Compression Formats

### Current System State

#### Upload Endpoints
1. **POST /api/files/upload** - Generic file upload (100MB limit)
2. **POST /api/files/upload-piutang** - PIUTANG invoice upload
3. **POST /api/files/upload-chunked** - Chunked upload for large files
4. **POST /api/bugs/upload** - Bug screenshot upload

#### File Types Handled
| Type | Extension | Current Use |
|------|-----------|------------|
| PDF | .pdf | Invoices, documents, piutang |
| Image | .jpg, .jpeg, .png, .gif, .webp | Media, screenshots, ads |
| Video | .mp4, .mov, .avi | Media storage |
| Document | Various | General document storage |

#### Current Chunk Configuration
- **Chunk Size:** 10MB
- **Max Concurrent:** 3 parallel chunks
- **Max Retries:** 4 attempts
- **Upload Limits:** 100MB per file

---

## Compression Strategy

### Recommended File Type Compression

#### Priority 1: High Compression Ratio (Compress Always)
| Type | Reason | Est. Ratio | Example |
|------|--------|-----------|---------|
| **PDF** | Text-heavy documents | 20-40% | 5MB invoice → 1.5MB |
| **PNG** | Lossless, highly compressible | 40-60% | 10MB scan → 4MB |
| **TXT, JSON** | Pure text | 10-20% | Config files → 90% savings |

#### Priority 2: Conditional Compression (Size-Dependent)
| Type | Threshold | Reason | Est. Ratio |
|------|-----------|--------|-----------|
| **JPG** | > 5MB | Already compressed, diminishing returns | 85-95% |
| **JPEG** | > 5MB | Already compressed, diminishing returns | 85-95% |
| **GIF** | > 3MB | Can benefit from re-encoding | 60-80% |
| **WEBP** | > 10MB | Modern format, already optimized | 90-98% |

#### Priority 3: Do Not Compress (No Benefit)
| Type | Reason |
|------|--------|
| **MP4, MOV, AVI** | Already compressed video codecs |
| **ZIP, RAR, 7Z** | Already compressed archives |
| **WEBP** | Modern format already optimized |

---

## Size Thresholds

### Recommended Thresholds by Operation

| Operation | File Size | Decision | Benefit |
|-----------|-----------|----------|---------|
| **< 1MB** | < 1MB | No compression | Overhead > benefit |
| **1-5MB** | 1-5MB | Compress PDF/PNG only | High benefit for text |
| **5-20MB** | 5-20MB | **ALWAYS compress** | Significant bandwidth savings |
| **20-100MB** | 20-100MB | **ALWAYS compress** | Critical for large files |
| **> 100MB** | > 100MB | **MANDATORY compress** | Prevents upload timeout |

### Proposed Compression Thresholds

```javascript
// Default: Compress if file > 5MB
const COMPRESSION_THRESHOLD = 5 * 1024 * 1024; // 5MB

// Force compression for large files
const FORCE_COMPRESSION_THRESHOLD = 20 * 1024 * 1024; // 20MB

// File types that always compress well
const ALWAYS_COMPRESS_TYPES = [
    'application/pdf',
    'image/png',
    'text/plain',
    'application/json'
];

// File types that compress poorly (already compressed)
const SKIP_COMPRESSION_TYPES = [
    'video/mp4', 'video/quicktime', 'video/x-msvideo',
    'application/zip', 'application/x-rar-compressed',
    'image/webp'
];

// Conditional compression (only if > threshold)
const CONDITIONAL_COMPRESS_TYPES = [
    'image/jpeg',
    'image/gif'
];
```

---

## Compression Format Selection

### Comparison: gzip vs brotli vs deflate

| Format | Speed | Ratio | Browser Support | Use Case |
|--------|-------|-------|-----------------|----------|
| **gzip** | Fast ⭐⭐ | Good ⭐⭐ | Excellent ⭐⭐⭐ | Default choice |
| **brotli** | Slower ⭐ | Better ⭐⭐⭐ | Good ⭐⭐ | Large files |
| **deflate** | Fast ⭐⭐⭐ | Fair ⭐ | Excellent ⭐⭐⭐ | Fallback |

### Recommendation: **GZIP** as Primary

**Why gzip?**
- ✅ Widely supported (Node.js native module)
- ✅ Fast compression/decompression
- ✅ Good compression ratio (30-40% typical)
- ✅ Streaming support for large files
- ✅ Zero external dependencies

**Alternative: brotli for optimal compression**
- Use as secondary for files > 20MB
- Better ratio but slower (trade-off: 5-10% better compression vs 2-3s slower)

---

## Implementation Plan

### Compression Configuration

```javascript
// backend/compression.js

const COMPRESSION_CONFIG = {
    // When to compress (size threshold)
    threshold: 5 * 1024 * 1024,              // 5MB
    forceCompressionThreshold: 20 * 1024 * 1024, // 20MB
    
    // Compression level (1-9, default 6)
    compressionLevel: 6,
    
    // File types: always/never/conditional
    alwaysCompress: [
        'application/pdf',
        'image/png',
        'text/plain',
        'application/json'
    ],
    
    neverCompress: [
        'video/mp4', 'video/quicktime', 'video/x-msvideo',
        'application/zip', 'application/x-rar-compressed',
        'image/webp'
    ],
    
    conditionalCompress: [
        'image/jpeg',
        'image/gif'
    ],
    
    // Streaming for large files (chunk by chunk)
    streamThreshold: 10 * 1024 * 1024,       // 10MB - use streaming
    
    // Metadata tracking
    addMetadata: true,                        // Store original size, compression ratio
    metadataPrefix: '.gz'                     // Extension added to compressed files
};
```

### Files to Compress

**Upload flows to modify:**
1. ✅ `/api/files/upload` - Generic file upload
2. ✅ `/api/files/upload-piutang` - Invoice upload
3. ⚠️ `/api/files/upload-chunked` - Already chunked, compression before chunking

**Decompression flows:**
1. Preview endpoint - Decompress on-the-fly
2. Download endpoint - Decompress when retrieving
3. Sync queue - Handle compressed files transparently

---

## Expected Performance Impact

### Before Compression
- Large PDF invoice (10MB) → 10MB transfer
- PNG scan (15MB) → 15MB transfer
- Total: 25MB upload time ~40 seconds @ 600KB/s

### After Compression (gzip)
- 10MB PDF → 2-3MB compressed (~70% reduction)
- 15MB PNG → 6-9MB compressed (~40% reduction)  
- Total: 10MB upload time ~16 seconds @ 600KB/s
- **Improvement: 60% faster** ⚡

### Storage Savings
- Assuming 100 files/day average 5MB each:
  - Before: 500MB/day → 15GB/month
  - After: 150MB/day → 4.5GB/month
  - **Savings: 70% storage** 💾

---

## Technical Considerations

### Memory vs Streaming Trade-off

**Small files (< 10MB): Load in memory**
- Faster compression
- Simpler code path
- Acceptable memory footprint

**Large files (> 10MB): Stream compression**
- Process in chunks
- Lower memory usage
- Better for 20-100MB files

### Metadata Storage

Track compression metadata in file records:
```javascript
{
    originalSize: 10485760,           // 10MB
    compressedSize: 2097152,          // 2MB
    compressionRatio: 0.20,           // 20% of original
    compressionFormat: 'gzip',
    uploadedAt: '2026-09-01T...',
    isCompressed: true
}
```

### Error Handling

- **Compression fails:** Fall back to uncompressed upload
- **Decompression fails:** Log error, serve original file
- **Partial compression:** Retry with increased compression level

---

## Summary: File Compression Strategy for Masalah 4

### ✅ What to Compress
1. **Always:** PDF, PNG, text files
2. **If > 5MB:** All files except videos/archives
3. **If > 20MB:** Force compression regardless of type

### ✅ Compression Format
- **Primary:** gzip (speed + compatibility)
- **Secondary:** brotli for optimal ratio on large files

### ✅ Implementation Approach
1. Create `backend/compression.js` utility
2. Add compression to upload endpoints
3. Add decompression to download/preview
4. Track compression metrics
5. Test with various file types

### ✅ Expected Outcome
- **60% faster uploads** for large files
- **70% storage savings** 
- **Transparent** to end users (automatic compression/decompression)
- **Backward compatible** (handles both compressed and uncompressed)

---

## Next: Task #2 - Create Compression Module
Ready to implement `backend/compression.js` with:
- Compress/decompress functions
- Streaming support
- Metadata tracking
- File type detection
- Error handling

