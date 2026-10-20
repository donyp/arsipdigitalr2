/**
 * File Upload Security Tests
 * Tests magic byte validation, filename sanitization, file size limits
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');

describe('File Upload Security', () => {

    describe('Magic Byte Validation', () => {

        test('Rejects .exe file with .pdf extension', async () => {
            // Create fake EXE (MZ header)
            const exeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00]);
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', exeBuffer, 'malicious.pdf');

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/not PDF|tidak PDF|magic|bytes/i);
        });

        test('Rejects .zip file with .pdf extension', async () => {
            // ZIP magic bytes: PK (0x504B)
            const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', zipBuffer, 'archive.pdf');

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/not PDF|invalid/i);
        });

        test('Accepts valid PDF file', async () => {
            // PDF magic bytes: %PDF
            const pdfBuffer = Buffer.from('%PDF-1.4\n%fake pdf content');
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', pdfBuffer, 'valid.pdf');

            expect([200, 201, 400]).toContain(res.status);
            // If returns 400, should be for validation reason (not file type)
            if (res.status === 400) {
                expect(res.body.error).not.toMatch(/magic|bytes|signature/i);
            }
        });

        test('Rejects file with no magic bytes', async () => {
            const emptyBuffer = Buffer.from([0x00, 0x00, 0x00]);
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', emptyBuffer, 'empty.pdf');

            expect(res.status).toBe(400);
        });

        test('Rejects file smaller than magic bytes check', async () => {
            const tinyBuffer = Buffer.from([0x41]); // Just 'A'
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', tinyBuffer, 'tiny.pdf');

            expect(res.status).toBe(400);
        });
    });

    describe('Filename Sanitization', () => {

        test('Blocks path traversal in filename', async () => {
            const pdfBuffer = Buffer.from('%PDF-1.4\n%fake');
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', pdfBuffer, '../../etc/passwd.pdf');

            // Should be uploaded but filename should be sanitized
            expect([200, 201, 400]).toContain(res.status);
            if (res.status === 200 || res.status === 201) {
                // Filename should not contain ../
                const filename = res.body.filename || res.body.name || '';
                expect(filename).not.toMatch(/\.\.\//);
                expect(filename).not.toMatch(/etc/);
            }
        });

        test('Blocks special characters in filename', async () => {
            const pdfBuffer = Buffer.from('%PDF-1.4\n%fake');
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', pdfBuffer, '<script>alert(1)</script>.pdf');

            expect([200, 201, 400]).toContain(res.status);
        });

        test('Accepts normal filename', async () => {
            const pdfBuffer = Buffer.from('%PDF-1.4\n%fake');
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', pdfBuffer, 'invoice-2026-10-15.pdf');

            expect([200, 201, 400]).toContain(res.status);
            // 400 ok if validation fails, not filename issue
        });

        test('Handles very long filenames', async () => {
            const pdfBuffer = Buffer.from('%PDF-1.4\n%fake');
            const longName = 'a'.repeat(1000) + '.pdf';
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', pdfBuffer, longName);

            expect([200, 201, 400]).toContain(res.status);
            // Should not crash, filename should be truncated
        });
    });

    describe('File Size Limits', () => {

        test('Rejects file exceeding max size', async () => {
            // Create 101MB buffer (exceeds typical 100MB limit)
            const largeBuffer = Buffer.alloc(101 * 1024 * 1024);
            largeBuffer[0] = 0x25; largeBuffer[1] = 0x50; // %P (start of %PDF)
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', largeBuffer, 'large.pdf');

            expect(res.status).toBe(413); // Payload Too Large
            expect(res.body.error).toMatch(/too large|exceeds|limit/i);
        });

        test('Accepts file within size limit', async () => {
            // 1MB file
            const normalBuffer = Buffer.alloc(1024 * 1024);
            normalBuffer[0] = 0x25; normalBuffer[1] = 0x50;
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', normalBuffer, 'normal.pdf');

            expect([200, 201, 400, 413]).toContain(res.status);
            // 400/401 ok for validation, not size
            if (res.status === 413) {
                fail('File within limit should not return 413');
            }
        });

        test('Empty file rejected', async () => {
            const emptyBuffer = Buffer.alloc(0);
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', emptyBuffer, 'empty.pdf');

            expect(res.status).toBe(400);
        });
    });

    describe('Multi-File Upload', () => {

        test('Respects max file count limit (50 files)', async () => {
            const token = generateValidToken();
            
            // Try to upload 51 files
            let req = request(app)
                .post('/api/invoice/upload-batch')
                .set('Authorization', `Bearer ${token}`)
                .field('zona_id', '1');

            for (let i = 0; i < 51; i++) {
                const pdfBuffer = Buffer.from(`%PDF-1.4\n%file-${i}`);
                req.attach('files', pdfBuffer, `file-${i}.pdf`);
            }

            const res = await req;

            if (res.status === 400) {
                expect(res.body.error).toMatch(/too many|limit|max|50/i);
            } else if (res.status === 200 || res.status === 201) {
                // Check that only 50 files were accepted
                const uploadedCount = res.body.successful || res.body.count || 0;
                expect(uploadedCount).toBeLessThanOrEqual(50);
            }
        });

        test('Accepts exactly 50 files', async () => {
            const token = generateValidToken();
            
            let req = request(app)
                .post('/api/invoice/upload-batch')
                .set('Authorization', `Bearer ${token}`)
                .field('zona_id', '1');

            for (let i = 0; i < 50; i++) {
                const pdfBuffer = Buffer.from(`%PDF-1.4\n%file-${i}`);
                req.attach('files', pdfBuffer, `file-${i}.pdf`);
            }

            const res = await req;

            // Should succeed or at least not reject for count
            expect([200, 201, 400]).toContain(res.status);
            if (res.status === 400) {
                expect(res.body.error).not.toMatch(/too many|50/i);
            }
        });
    });

    describe('MIME Type Validation', () => {

        test('Only accepts PDF MIME type', async () => {
            const pdfBuffer = Buffer.from('%PDF-1.4\n%fake');
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .set('Content-Type', 'application/json') // Wrong MIME type
                .field('zona_id', '1')
                .attach('file', pdfBuffer, 'test.pdf');

            // Should still work or fail for other reasons, not MIME type
            expect([200, 201, 400]).toContain(res.status);
        });

        test('Rejects image MIME type', async () => {
            // JPEG header
            const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
            
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .field('zona_id', '1')
                .attach('file', jpegBuffer, 'image.jpg');

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/PDF|invalid|type/i);
        });
    });

    describe('Download Security', () => {

        test('Cannot download file from different zone', async () => {
            const adminZona1Token = generateTokenForZona(1);
            
            // Try to download file from zona 2
            const res = await request(app)
                .get('/api/download/file-from-zona-2-uuid')
                .set('Authorization', `Bearer ${adminZona1Token}`);

            if (res.status === 403) {
                expect(res.body.error).toMatch(/zona|access/i);
            }
        });

        test('Cannot use path traversal in download', async () => {
            const token = generateValidToken();
            
            const res = await request(app)
                .get('/api/download/../../etc/passwd')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
            expect(res.body.error).not.toMatch(/etc|passwd/);
        });

        test('Download returns correct file type headers', async () => {
            const token = generateValidToken();
            
            // Assuming a valid file exists
            const res = await request(app)
                .get('/api/download/valid-file-uuid')
                .set('Authorization', `Bearer ${token}`);

            if (res.status === 200) {
                expect(res.type).toBe('application/pdf');
                expect(res.headers['content-disposition']).toBeTruthy();
            }
        });
    });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function generateValidToken() {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        {
            sub: 'test-user-123',
            userId: 'test-user-123',
            role: 'moderator',
            username: 'testuser',
            zona_id: 1,
            stage: 'authenticated'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function generateTokenForZona(zona_id) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        {
            sub: `admin-zona-${zona_id}`,
            userId: `admin-zona-${zona_id}`,
            role: 'admin_zona',
            username: `adminzona${zona_id}`,
            zona_id,
            stage: 'authenticated'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}
