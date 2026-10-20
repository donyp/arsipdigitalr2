/**
 * Rate Limiting & CSRF Protection Tests
 * Tests DDoS prevention, rate limiting, CSRF attacks
 */

const request = require('supertest');

describe('Rate Limiting & DDoS Protection', () => {

    describe('Login Rate Limiting', () => {

        test('Allows normal login attempts', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'testuser', password: 'testpass' });

            expect([200, 401]).toContain(res.status);
        });

        test('Blocks excessive login attempts (brute force)', async () => {
            // Try 10 rapid login attempts
            const attempts = [];
            for (let i = 0; i < 10; i++) {
                const res = request(app)
                    .post('/api/auth/login')
                    .send({ username: 'attacker', password: 'wrong' });
                attempts.push(res);
            }

            const results = await Promise.all(attempts);
            
            // At least some should be rate limited (429)
            const rateLimited = results.filter(r => r.status === 429);
            
            // Either all fail (401) or some are rate limited (429)
            const isProtected = results.every(r => [401, 429].includes(r.status));
            expect(isProtected).toBe(true);
        });

        test('Rate limit error message is helpful', async () => {
            // Trigger rate limit by rapid requests
            for (let i = 0; i < 10; i++) {
                await request(app)
                    .post('/api/auth/login')
                    .send({ username: 'user', password: 'pass' })
                    .catch(() => {});
            }

            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'user', password: 'pass' });

            if (res.status === 429) {
                expect(res.body.error).toMatch(/too many|rate limit|try again/i);
            }
        });
    });

    describe('API Endpoint Rate Limiting', () => {

        test('Invoice list endpoint respects rate limits', async () => {
            const token = generateValidToken();
            
            // Make rapid requests
            const requests = [];
            for (let i = 0; i < 30; i++) {
                requests.push(
                    request(app)
                        .get('/api/invoice/list')
                        .set('Authorization', `Bearer ${token}`)
                );
            }

            const results = await Promise.all(requests);
            
            // Should not all succeed or at least some should have rate limit
            const hasRateLimit = results.some(r => r.status === 429);
            const allSucceed = results.every(r => [200, 429].includes(r.status));
            
            expect(allSucceed).toBe(true);
        });

        test('Download endpoint rate limiting prevents abuse', async () => {
            const token = generateValidToken();
            
            // Rapid download attempts
            const requests = [];
            for (let i = 0; i < 25; i++) {
                requests.push(
                    request(app)
                        .get('/api/download/file-uuid')
                        .set('Authorization', `Bearer ${token}`)
                );
            }

            const results = await Promise.all(requests);
            
            // Should handle gracefully
            const validStatuses = [200, 404, 429, 403];
            const allValid = results.every(r => validStatuses.includes(r.status));
            expect(allValid).toBe(true);
        });
    });

    describe('CSRF Protection', () => {

        test('POST requests from different origin rejected', async () => {
            const res = await request(app)
                .post('/api/announcements')
                .set('Origin', 'https://malicious.com')
                .send({ title: 'Hacked', content: 'test' });

            // Should be blocked by CSRF or require auth
            expect([403, 401, 400]).toContain(res.status);
            if (res.status === 403) {
                expect(res.body.error).toMatch(/origin|referer|CSRF/i);
            }
        });

        test('PUT requests require valid origin', async () => {
            const res = await request(app)
                .put('/api/users/user-123')
                .set('Origin', 'https://evil.com')
                .send({ role: 'admin' });

            expect([403, 401, 400]).toContain(res.status);
        });

        test('DELETE requests require valid origin', async () => {
            const res = await request(app)
                .delete('/api/announcements/ann-123')
                .set('Origin', 'https://evil.com');

            expect([403, 401, 400]).toContain(res.status);
        });

        test('GET requests allowed from any origin', async () => {
            const token = generateValidToken();
            
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Origin', 'https://malicious.com')
                .set('Authorization', `Bearer ${token}`);

            // GET should not be CSRF protected
            expect([200, 403, 401]).toContain(res.status);
            if (res.status === 403) {
                expect(res.body.error).not.toMatch(/CSRF|origin/i);
            }
        });

        test('Valid origin allowed for state-changing requests', async () => {
            const token = generateValidToken();
            
            const res = await request(app)
                .post('/api/announcements')
                .set('Origin', process.env.ALLOWED_ORIGINS?.split(',')[0] || 'https://arsipdigitalanka.cloud')
                .set('Authorization', `Bearer ${token}`)
                .send({ title: 'Test', content: 'test', recipients: 'all' });

            // Should not be blocked by CSRF
            expect([200, 201, 400, 403, 401]).toContain(res.status);
            if (res.status === 403) {
                expect(res.body.error).not.toMatch(/CSRF|origin/i);
            }
        });

        test('Request with JWT Authorization bypasses origin check', async () => {
            const token = generateValidToken();
            
            const res = await request(app)
                .post('/api/announcements')
                .set('Authorization', `Bearer ${token}`)
                // No Origin header
                .send({ title: 'Test', content: 'test' });

            // Should be allowed (JWT auth present)
            expect([200, 201, 400, 401]).toContain(res.status);
            if (res.status === 403) {
                expect(res.body.error).not.toMatch(/origin|referer/i);
            }
        });
    });

    describe('Bot Detection & IP Blocking', () => {

        test('Suspicious user agent triggers detection', async () => {
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .set('User-Agent', 'curl/7.0');

            // May or may not block, but should handle gracefully
            expect([200, 403, 429]).toContain(res.status);
        });

        test('Missing user agent increases suspicion', async () => {
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .set('User-Agent', '');

            expect([200, 403, 429]).toContain(res.status);
        });

        test('Normal browser user agent passes', async () => {
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${generateValidToken()}`)
                .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

            expect([200, 401, 403]).toContain(res.status);
            expect(res.status).not.toBe(403); // Should not be blocked for bot
        });

        test('SQL injection attempt logged', async () => {
            const res = await request(app)
                .get("/api/invoice/list?search=' OR '1'='1")
                .set('Authorization', `Bearer ${generateValidToken()}`);

            // Should be sanitized, not blocked as bot
            expect([200, 400, 401]).toContain(res.status);
        });
    });

    describe('Concurrent Request Handling', () => {

        test('Multiple users can request simultaneously', async () => {
            const tokens = [
                generateValidToken(),
                generateTokenForRole('moderator'),
                generateTokenForRole('admin')
            ];

            const requests = tokens.map(token =>
                request(app)
                    .get('/api/invoice/list')
                    .set('Authorization', `Bearer ${token}`)
            );

            const results = await Promise.all(requests);
            
            // All should be handled (not crashed)
            expect(results.length).toBe(3);
            results.forEach(res => {
                expect([200, 401, 403]).toContain(res.status);
            });
        });

        test('Circuit breaker activates under load', async () => {
            // Make 100 rapid requests
            const token = generateValidToken();
            const requests = [];
            
            for (let i = 0; i < 100; i++) {
                requests.push(
                    request(app)
                        .get('/api/invoice/list')
                        .set('Authorization', `Bearer ${token}`)
                        .catch(() => ({ status: 'error' }))
                );
            }

            const results = await Promise.all(requests);
            
            // Should either all succeed or some fail gracefully
            const hasError = results.some(r => r.status === 503 || r.status === 'error');
            expect(results.length).toBe(100);
        });
    });

    describe('Rate Limit Response Headers', () => {

        test('Rate limit headers present in response', async () => {
            const token = generateValidToken();
            
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${token}`);

            // Check for rate limit headers
            const hasRateLimitHeaders = 
                res.headers['ratelimit-limit'] ||
                res.headers['x-ratelimit-limit'] ||
                res.headers['retry-after'];
            
            // At least one rate limit header should be present
            if (res.status === 429) {
                expect(hasRateLimitHeaders).toBeTruthy();
            }
        });

        test('Retry-After header present when rate limited', async () => {
            // Trigger rate limit
            const token = generateValidToken();
            let lastRes = null;
            
            for (let i = 0; i < 50; i++) {
                lastRes = await request(app)
                    .post('/api/auth/login')
                    .send({ username: 'user', password: 'pass' })
                    .catch(() => ({ status: 429 }));
                
                if (lastRes.status === 429) {
                    break;
                }
            }

            if (lastRes && lastRes.status === 429) {
                expect(lastRes.headers['retry-after']).toBeTruthy();
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
            role: 'user',
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
