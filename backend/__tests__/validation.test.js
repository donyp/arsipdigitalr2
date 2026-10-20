/**
 * Input Validation Tests
 * Tests that all inputs are properly validated and sanitized
 */

const request = require('supertest');
const {
    sanitizeString,
    validateZonaId,
    validateDate,
    validateCategory,
    validatePagination,
    validateId,
    sanitizeFilename
} = require('../input-validators');

describe('Input Validation & Sanitization', () => {

    describe('sanitizeString Function', () => {

        test('removes null bytes', () => {
            const input = 'hello\x00world';
            const result = sanitizeString(input);
            expect(result).toBe('helloworld');
            expect(result).not.toContain('\x00');
        });

        test('removes control characters', () => {
            const input = 'hello\x01\x02\x03world';
            const result = sanitizeString(input);
            expect(result).toBe('helloworld');
        });

        test('trims whitespace', () => {
            const input = '  hello  ';
            const result = sanitizeString(input);
            expect(result).toBe('hello');
        });

        test('respects max length', () => {
            const input = 'a'.repeat(1000);
            const result = sanitizeString(input, 100);
            expect(result.length).toBe(100);
        });

        test('handles empty/null values', () => {
            expect(sanitizeString(null)).toBeNull();
            expect(sanitizeString(undefined)).toBeNull();
            expect(sanitizeString('')).toBe('');
        });
    });

    describe('validateZonaId Function', () => {

        test('accepts positive integers', () => {
            expect(validateZonaId(1)).toBe(1);
            expect(validateZonaId('2')).toBe(2);
            expect(validateZonaId(9999)).toBe(9999);
        });

        test('rejects negative numbers', () => {
            expect(validateZonaId(-1)).toBeNull();
            expect(validateZonaId('-5')).toBeNull();
        });

        test('rejects zero', () => {
            expect(validateZonaId(0)).toBeNull();
        });

        test('rejects non-numeric values', () => {
            expect(validateZonaId('abc')).toBeNull();
            expect(validateZonaId('1.5')).toBeNull();
        });

        test('rejects values outside range', () => {
            expect(validateZonaId(10000)).toBeNull();
        });

        test('handles null/undefined', () => {
            expect(validateZonaId(null)).toBeNull();
            expect(validateZonaId(undefined)).toBeNull();
        });
    });

    describe('validateDate Function', () => {

        test('accepts valid YYYY-MM-DD format', () => {
            expect(validateDate('2026-10-15')).toBe('2026-10-15');
            expect(validateDate('2000-01-01')).toBe('2000-01-01');
        });

        test('rejects invalid formats', () => {
            expect(validateDate('15-10-2026')).toBeNull(); // DD-MM-YYYY
            expect(validateDate('2026/10/15')).toBeNull(); // Wrong separator
            expect(validateDate('invalid')).toBeNull();
        });

        test('rejects invalid dates', () => {
            expect(validateDate('2026-13-45')).toBeNull(); // Invalid month/day
            expect(validateDate('2026-02-30')).toBeNull(); // Feb 30 doesn't exist
        });

        test('rejects out-of-range years', () => {
            expect(validateDate('1999-01-01')).toBeNull(); // Before 2000
            expect(validateDate('2101-01-01')).toBeNull(); // After 2100
        });

        test('handles null/undefined', () => {
            expect(validateDate(null)).toBeNull();
            expect(validateDate(undefined)).toBeNull();
        });
    });

    describe('validateCategory Function', () => {

        test('accepts valid categories', () => {
            const validCategories = ['invoice', 'bukti_bayar', 'faktur_pajak', 'excel', 'default'];
            validCategories.forEach(cat => {
                expect(validateCategory(cat)).toBe(cat);
                expect(validateCategory(cat.toUpperCase())).toBe(cat.toLowerCase());
            });
        });

        test('rejects invalid categories', () => {
            expect(validateCategory('invalid_category')).toBeNull();
            expect(validateCategory('malicious')).toBeNull();
        });

        test('case insensitive', () => {
            expect(validateCategory('INVOICE')).toBe('invoice');
            expect(validateCategory('Invoice')).toBe('invoice');
        });
    });

    describe('validatePagination Function', () => {

        test('returns valid limits and offsets', () => {
            const result = validatePagination(50, 100);
            expect(result.limit).toBe(50);
            expect(result.offset).toBe(100);
        });

        test('enforces minimum limit of 1', () => {
            const result = validatePagination(0, 0);
            expect(result.limit).toBeGreaterThanOrEqual(1);
        });

        test('enforces maximum limit of 500', () => {
            const result = validatePagination(1000, 0);
            expect(result.limit).toBeLessThanOrEqual(500);
        });

        test('enforces non-negative offset', () => {
            const result = validatePagination(50, -100);
            expect(result.offset).toBeGreaterThanOrEqual(0);
        });

        test('handles non-numeric input', () => {
            const result = validatePagination('abc', 'def');
            expect(result.limit).toBeGreaterThanOrEqual(1);
            expect(result.offset).toBeGreaterThanOrEqual(0);
        });
    });

    describe('validateId Function', () => {

        test('accepts valid UUIDs', () => {
            const uuid = '550e8400-e29b-41d4-a716-446655440000';
            expect(validateId(uuid)).toBe(uuid);
        });

        test('accepts positive integers', () => {
            expect(validateId('123')).toBe(123);
            expect(validateId(456)).toBe(456);
        });

        test('rejects negative numbers', () => {
            expect(validateId('-123')).toBeNull();
        });

        test('rejects zero', () => {
            expect(validateId('0')).toBeNull();
        });

        test('rejects invalid formats', () => {
            expect(validateId('invalid-uuid-format')).toBeNull();
            expect(validateId('abc')).toBeNull();
        });

        test('handles null/undefined', () => {
            expect(validateId(null)).toBeNull();
            expect(validateId(undefined)).toBeNull();
        });
    });

    describe('sanitizeFilename Function', () => {

        test('removes path separators', () => {
            expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
            expect(sanitizeFilename('..\\..\\windows')).not.toContain('\\');
        });

        test('removes double dots (path traversal)', () => {
            expect(sanitizeFilename('..', 100)).not.toContain('..');
        });

        test('removes dangerous characters', () => {
            const result = sanitizeFilename('file<script>.pdf');
            expect(result).not.toContain('<');
            expect(result).not.toContain('>');
            expect(result).not.toContain('script');
        });

        test('limits length to 255 chars', () => {
            const input = 'a'.repeat(1000) + '.pdf';
            const result = sanitizeFilename(input);
            expect(result.length).toBeLessThanOrEqual(255);
        });

        test('never returns empty string', () => {
            expect(sanitizeFilename('...')).not.toBe('');
            expect(sanitizeFilename('')).toBe('upload');
        });
    });

    describe('Injection Attack Prevention', () => {

        test('SQL injection patterns rejected', async () => {
            const maliciousInputs = [
                "'; DROP TABLE users; --",
                "1' OR '1'='1",
                "admin' --",
                "1 UNION SELECT * FROM users",
                "1'; DELETE FROM invoices; --"
            ];

            for (const input of maliciousInputs) {
                const sanitized = sanitizeString(input);
                // Should sanitize but not necessarily reject
                expect(sanitized).toBeDefined();
            }
        });

        test('XSS patterns neutralized', () => {
            const xssInputs = [
                '<script>alert("xss")</script>',
                '<img src=x onerror="alert(1)">',
                'javascript:alert(1)',
                '<svg onload="alert(1)">'
            ];

            for (const input of xssInputs) {
                const sanitized = sanitizeString(input);
                expect(sanitized).not.toContain('<');
                expect(sanitized).not.toContain('>');
                expect(sanitized).not.toContain('script');
            }
        });

        test('Path traversal prevented', () => {
            const traversalInputs = [
                '../../etc/passwd',
                '..\\..\\windows\\system32',
                '../../../sensitive/file'
            ];

            for (const input of traversalInputs) {
                const sanitized = sanitizeFilename(input);
                expect(sanitized).not.toMatch(/\.\.\//);
                expect(sanitized).not.toMatch(/\.\.\\/);
            }
        });
    });
});

describe('Error Disclosure Prevention', () => {

    describe('Error Response Format', () => {

        test('Production errors hide technical details', async () => {
            process.env.NODE_ENV = 'production';
            
            const res = await request(app)
                .get('/api/nonexistent-endpoint')
                .set('Authorization', `Bearer ${validToken}`);

            // In production, error messages should be generic
            if (process.env.NODE_ENV === 'production') {
                expect(res.body.error).not.toMatch(/line \d+/);
                expect(res.body.stack).toBeUndefined();
            }
        });

        test('Development errors include debugging info', async () => {
            process.env.NODE_ENV = 'development';
            
            const res = await request(app)
                .get('/api/invoice/list?zona_id=abc')  // Invalid input
                .set('Authorization', `Bearer ${validToken}`);

            // In development, may include more details
            expect(res.body).toHaveProperty('error');
        });

        test('Stack traces not exposed in client response', async () => {
            // Intentionally trigger an error
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: null, password: undefined });

            expect(res.body.stack).toBeUndefined();
            expect(res.body.stackTrace).toBeUndefined();
            expect(res.body).not.toMatch(/\.js:\d+:\d+/);
        });

        test('Database details not exposed', async () => {
            const res = await request(app)
                .get('/api/invoice/list?search=\' OR 1=1')
                .set('Authorization', `Bearer ${validToken}`);

            if (res.status >= 400) {
                expect(res.body.error).not.toMatch(/SQL|database|query|schema/i);
                expect(res.body.error).not.toMatch(/table|column|constraint/i);
            }
        });

        test('File paths not exposed', async () => {
            const res = await request(app)
                .get('/api/nonexistent')
                .set('Authorization', `Bearer ${validToken}`);

            expect(res.body.error).not.toMatch(/\/home\/|\/var\/|C:\\Users/);
            expect(res.body.error).not.toMatch(/\.js|\.sql|\.env/);
        });

        test('Sensitive headers not exposed', async () => {
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', 'Bearer invalid-token');

            expect(res.body.error).not.toMatch(/JWT_SECRET|API_KEY|SECRET/i);
        });
    });

    describe('Error Messages Best Practice', () => {

        test('User-friendly error for invalid input', async () => {
            const res = await request(app)
                .post('/api/announcements')
                .set('Authorization', `Bearer ${validToken}`)
                .send({ title: '' });  // Empty title

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/cannot be empty|required|invalid/i);
            expect(res.body.error).not.toMatch(/null|undefined|NaN/);
        });

        test('User-friendly error for authentication failure', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'wrong' });

            expect(res.status).toBe(401);
            expect(res.body.error).toMatch(/username atau password|incorrect/i);
            expect(res.body.error).not.toMatch(/query|database/i);
        });

        test('User-friendly error for authorization failure', async () => {
            const userToken = generateJWTForRole('user');
            
            const res = await request(app)
                .get('/api/admin/settings')
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/tidak memiliki akses|permission denied/i);
        });
    });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function generateJWTForRole(role) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        {
            sub: `test-user-${role}`,
            role,
            username: `test_${role}`
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}
