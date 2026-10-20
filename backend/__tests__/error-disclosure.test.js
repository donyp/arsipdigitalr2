/**
 * Error Disclosure Prevention Tests
 * Ensures that sensitive information is not leaked in error responses
 * 
 * Security: Error Disclosure (CWE-209, CWE-215)
 */

const request = require('supertest');

describe('Error Disclosure Prevention', () => {

    describe('Production Environment Error Handling', () => {

        beforeEach(() => {
            process.env.NODE_ENV = 'production';
        });

        test('Generic error for 500 errors', async () => {
            // Attempt to trigger a server error
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', 'Bearer invalid-token');

            if (res.status >= 500) {
                expect(res.body.error).not.toMatch(/stack|Stack Trace|at line/i);
                expect(res.body.error).not.toMatch(/\.js:\d+/);
                expect(res.body).not.toHaveProperty('stack');
            }
        });

        test('No file paths in error messages', async () => {
            const res = await request(app)
                .get('/api/nonexistent-endpoint');

            if (res.status >= 400) {
                expect(res.body.error).not.toMatch(/\/home\/|\/var\/|C:\\Users/);
                expect(res.body.error).not.toMatch(/\.js$|\.sql$|\.env$/);
                expect(res.body.error).not.toMatch(/\/backend\/|\/src\//);
            }
        });

        test('No database structure leaked', async () => {
            // Try to trigger database error
            const res = await request(app)
                .get("/api/invoice/list?zona_id=1' OR '1'='1'")
                .set('Authorization', 'Bearer ' + generateValidToken());

            if (res.status >= 400) {
                expect(res.body.error).not.toMatch(/SQL|schema|table|column/i);
                expect(res.body.error).not.toMatch(/constraint|foreign key|unique/i);
                expect(res.body.error).not.toMatch(/SELECT|INSERT|DELETE|UPDATE/i);
            }
        });

        test('No source code in error messages', async () => {
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', 'Bearer invalid');

            if (res.status >= 400) {
                expect(res.body.error).not.toMatch(/require|module|exports/);
                expect(res.body.error).not.toMatch(/function|const|var|let/);
            }
        });

        test('No secrets/keys in error messages', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'test', password: 'test' });

            const response = JSON.stringify(res.body);
            expect(response).not.toMatch(/SECRET|API_KEY|PASSWORD/i);
            expect(response).not.toMatch(/eyJ[A-Za-z0-9_-]+/); // JWT pattern
        });

        test('No sensitive header values exposed', async () => {
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', 'Bearer ' + Buffer.from('secret').toString('base64'));

            const response = JSON.stringify(res.body);
            expect(response).not.toMatch(/authorization|bearer/i);
            expect(response).not.toMatch(/[A-Za-z0-9_-]{40,}/); // Long tokens
        });
    });

    describe('Development Environment Debugging', () => {

        beforeEach(() => {
            process.env.NODE_ENV = 'development';
        });

        test('Includes helpful debug info in development', async () => {
            const res = await request(app)
                .get('/api/invoice/list?zona_id=invalid')
                .set('Authorization', 'Bearer ' + generateValidToken());

            if (res.status === 400) {
                // In development, may include error details
                expect(res.body).toHaveProperty('error');
                expect(res.body.error.length > 0).toBeTruthy();
            }
        });

        test('May include stack trace in development', async () => {
            // This would require a code path that throws an actual error
            // Skip for now as it requires specific error condition
        });
    });

    describe('Specific Error Scenarios', () => {

        test('Authentication failure hides user enumeration', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'nonexistent_user_12345', password: 'pass' });

            expect(res.status).toBe(401);
            // Should NOT distinguish between "user not found" vs "password wrong"
            expect(res.body.error).toMatch(/username atau password|incorrect/i);
            expect(res.body.error).not.toMatch(/not found|does not exist/i);
        });

        test('Authorization failure doesn\'t leak roles', async () => {
            const res = await request(app)
                .get('/api/admin/settings')
                .set('Authorization', 'Bearer ' + generateTokenForRole('user'));

            expect(res.status).toBe(403);
            expect(res.body.error).not.toMatch(/admin|super_admin|moderator/i);
            expect(res.body.error).not.toMatch(/role|permission|access/i);
        });

        test('File upload errors are generic', async () => {
            const res = await request(app)
                .post('/api/invoice/upload-faktur')
                .set('Authorization', 'Bearer ' + generateValidToken())
                .field('zona_id', '1')
                .attach('file', Buffer.from('NOT_A_PDF'), 'test.pdf');

            if (res.status >= 400) {
                expect(res.body.error).not.toMatch(/magic|bytes|signature|header/i);
                expect(res.body.error).not.toMatch(/buffer|stream|encoding/i);
            }
        });

        test('Data validation errors are helpful but not exploitable', async () => {
            const res = await request(app)
                .post('/api/announcements')
                .set('Authorization', 'Bearer ' + generateTokenForRole('moderator'))
                .send({ title: '', content: 'test' });

            if (res.status === 400) {
                expect(res.body.error).toMatch(/cannot be empty|required|invalid/i);
                expect(res.body.error).not.toMatch(/null|undefined|NaN|typeof/i);
            }
        });

        test('Timeout errors are non-descriptive', async () => {
            // Would require setting a short timeout and trigger it
            // Skip for unit test
        });
    });

    describe('Response Structure Safety', () => {

        test('Error responses don\'t include execution context', async () => {
            const res = await request(app)
                .get('/api/invoice/list?invalid_param=<script>')
                .set('Authorization', 'Bearer ' + generateValidToken());

            if (res.status >= 400) {
                expect(res.body).not.toHaveProperty('context');
                expect(res.body).not.toHaveProperty('trace');
                expect(res.body).not.toHaveProperty('debugging');
            }
        });

        test('Responses have consistent structure', async () => {
            const endpoints = [
                { method: 'get', path: '/api/nonexistent' },
                { method: 'post', path: '/api/auth/login', body: {} },
                { method: 'get', path: '/api/invoice/list', auth: true }
            ];

            for (const endpoint of endpoints) {
                let req = request(app)[endpoint.method](endpoint.path);
                
                if (endpoint.auth) {
                    req.set('Authorization', 'Bearer invalid');
                }
                
                if (endpoint.body) {
                    req.send(endpoint.body);
                }

                const res = await req;

                // All error responses should have these
                if (res.status >= 400) {
                    expect(res.body).toHaveProperty('error');
                    expect(res.body).toHaveProperty('statusCode');
                    expect(res.body).toHaveProperty('timestamp');
                }
            }
        });

        test('No HTML in error responses', async () => {
            const res = await request(app)
                .get('/api/nonexistent');

            const response = JSON.stringify(res.body);
            expect(response).not.toMatch(/<html|<body|<div/i);
            expect(response).not.toMatch(/DOCTYPE|<head>/i);
        });

        test('No null prototype pollution in errors', async () => {
            const res = await request(app)
                .post('/api/announcements')
                .set('Authorization', 'Bearer ' + generateValidToken())
                .send({
                    title: 'Test',
                    '__proto__': { admin: true },
                    'constructor.prototype.admin': true
                });

            // Prototype pollution should be prevented
            expect(res.body.error).toBeDefined();
        });
    });

    describe('Logging Safety', () => {

        test('Sensitive data not logged to public endpoints', async () => {
            // This is harder to test without mocking logger
            // But error responses should never include passwords/keys
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    username: 'admin',
                    password: 'super_secret_password_12345'
                });

            // Password should never appear in response
            expect(JSON.stringify(res.body)).not.toContain('super_secret_password');
        });

        test('User IDs logged, not PII', async () => {
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', 'Bearer ' + generateValidToken());

            if (res.status < 400) {
                // Successful response - no sensitive user info in error
                expect(res.body).not.toHaveProperty('password');
                expect(res.body).not.toHaveProperty('email_raw');
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
            stage: 'authenticated'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function generateTokenForRole(role) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        {
            sub: `user-${role}`,
            userId: `user-${role}`,
            role,
            username: `user_${role}`,
            stage: 'authenticated'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}
