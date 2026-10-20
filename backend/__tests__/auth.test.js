/**
 * Authentication Tests
 * Tests login flow, JWT verification, role validation, session management
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Mock app and dependencies
// In production, use actual app instance from server.js
describe('Authentication', () => {
    
    describe('Login Endpoint', () => {
        
        test('Valid credentials return JWT token', async () => {
            // Arrange: Create test user
            const username = 'testuser';
            const password = 'testpass123';
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Act: Attempt login
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username, password });
            
            // Assert
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBeTruthy();
            expect(res.body.user.role).toBeDefined();
            expect(res.body.user.username).toBe(username);
            expect(res.body.sessionId).toBeTruthy();
        });

        test('Invalid password returns 401', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'testuser', password: 'wrongpassword' });
            
            expect(res.status).toBe(401);
            expect(res.body.error).toMatch(/username atau password/i);
        });

        test('Missing credentials returns 400', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({});
            
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/username dan password/i);
        });

        test('Nonexistent user returns 401', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'nonexistent', password: 'pass' });
            
            expect(res.status).toBe(401);
            expect(res.body.error).toMatch(/username atau password/i);
        });

        test('Inactive user cannot login', async () => {
            // Set user.is_active = false in test database
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'inactive_user', password: 'pass' });
            
            expect(res.status).toBe(401);
            expect(res.body.error).toMatch(/username atau password/i);
        });
    });

    describe('JWT Token Verification', () => {
        
        test('Valid JWT token grants access', async () => {
            const token = generateValidJWT();
            
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        test('Tampered JWT token rejected', async () => {
            const token = generateValidJWT();
            const tamperedToken = token.slice(0, -10) + 'hacked!!!!';
            
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${tamperedToken}`);
            
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/token tidak valid/i);
        });

        test('Expired JWT token rejected', async () => {
            const expiredToken = jwt.sign(
                { sub: 'user123', role: 'user' },
                process.env.JWT_SECRET,
                { expiresIn: '-1h' } // Already expired
            );
            
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${expiredToken}`);
            
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/expired/i);
        });

        test('Missing Authorization header returns 401', async () => {
            const res = await request(app)
                .get('/api/invoice/list');
            
            expect(res.status).toBe(401);
            expect(res.body.error).toMatch(/token tidak ditemukan/i);
        });

        test('JWT from query parameter not used (security fix)', async () => {
            const token = generateValidJWT();
            
            const res = await request(app)
                .get(`/api/invoice/list?token=${token}`);
            
            // Should not be authenticated via query param
            expect(res.status).toBe(401);
        });
    });

    describe('Role Verification', () => {
        
        test('Token role is verified against database', async () => {
            // Scenario: Token claims role=admin but database says role=user
            const token = jwt.sign(
                { 
                    sub: 'user123', 
                    role: 'admin',  // Claim in token
                    username: 'test'
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            // But actual user in DB has role='user'
            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${token}`);
            
            // Should be rejected because database role is authoritative
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/tidak memiliki akses/i);
        });

        test('Super admin can access all endpoints', async () => {
            const token = generateJWTForRole('super_admin');
            
            const endpoints = [
                '/api/invoice/list',
                '/api/users/all',
                '/api/admin/settings',
                '/api/announcements'
            ];
            
            for (const endpoint of endpoints) {
                const res = await request(app)
                    .get(endpoint)
                    .set('Authorization', `Bearer ${token}`);
                
                expect([200, 400, 500]).toContain(res.status);
                expect(res.status).not.toBe(403);
            }
        });

        test('Regular user cannot access admin endpoints', async () => {
            const token = generateJWTForRole('user');
            
            const res = await request(app)
                .get('/api/admin/settings')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/tidak memiliki akses/i);
        });
    });

    describe('Session Management', () => {
        
        test('Session created on login', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'testuser', password: 'testpass' });
            
            const sessionId = res.body.sessionId;
            expect(sessionId).toBeTruthy();
            
            // Verify session in database
            const session = await supabase
                .from('active_sessions')
                .select('*')
                .eq('session_id', sessionId)
                .single();
            
            expect(session.data).toBeTruthy();
            expect(session.data.is_valid).toBe(true);
        });

        test('Logout invalidates session', async () => {
            // 1. Login
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ username: 'testuser', password: 'testpass' });
            
            const sessionId = loginRes.body.sessionId;
            const token = loginRes.body.token;
            
            // 2. Logout
            const logoutRes = await request(app)
                .post('/api/logout')
                .set('Authorization', `Bearer ${token}`)
                .send({ session_id: sessionId });
            
            expect(logoutRes.status).toBe(200);
            
            // 3. Verify session invalidated in database
            const session = await supabase
                .from('active_sessions')
                .select('is_valid')
                .eq('session_id', sessionId)
                .single();
            
            expect(session.data.is_valid).toBe(false);
        });

        test('Token from invalidated session rejected', async () => {
            // 1. Login
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ username: 'testuser', password: 'testpass' });
            
            const sessionId = loginRes.body.sessionId;
            const token = loginRes.body.token;
            
            // 2. Logout
            await request(app)
                .post('/api/logout')
                .set('Authorization', `Bearer ${token}`)
                .send({ session_id: sessionId });
            
            // 3. Try to use token after logout
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(401);
            expect(res.body.error).toMatch(/session\s+|ended|invalid/i);
        });

        test('Auto-logout enforced at configured time', async () => {
            // Setup: Set AUTO_LOGOUT_TIME to past time
            const autoLogoutTime = '15:00'; // 3 PM
            const currentTime = new Date();
            currentTime.setHours(16, 0, 0); // 4 PM (after logout time)
            
            // Create token issued before logout time
            const tokenIssuedTime = new Date();
            tokenIssuedTime.setHours(10, 0, 0); // 10 AM
            
            const token = jwt.sign(
                { sub: 'user123', role: 'user', iat: Math.floor(tokenIssuedTime.getTime() / 1000) },
                process.env.JWT_SECRET
            );
            
            // Try to use token after logout time
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${token}`)
                .set('x-current-time', currentTime.toISOString());
            
            // Should be rejected if session invalidation enforced
            expect([401, 403]).toContain(res.status);
        });
    });

    describe('Security Best Practices', () => {
        
        test('Password not returned in login response', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'testuser', password: 'testpass' });
            
            expect(res.body.password).toBeUndefined();
            expect(res.body.password_hash).toBeUndefined();
            expect(res.body.user.password).toBeUndefined();
        });

        test('Login attempts logged for audit', async () => {
            const username = 'testuser';
            
            await request(app)
                .post('/api/auth/login')
                .send({ username, password: 'correct' });
            
            // Check maintenance_access_logs
            const logs = await supabase
                .from('maintenance_access_logs')
                .select('*')
                .eq('username', username)
                .order('created_at', { ascending: false })
                .limit(1);
            
            expect(logs.data.length).toBeGreaterThan(0);
            expect([logs.data[0].action]).toContain(['granted', 'denied']);
        });

        test('Maintenance mode blocks non-moderators', async () => {
            // Enable maintenance mode
            await enableMaintenanceMode();
            
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'regular_user', password: 'pass' });
            
            expect(res.status).toBe(503);
            expect(res.body.maintenance?.isActive).toBe(true);
        });
    });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function generateValidJWT(role = 'user', userId = 'user123') {
    return jwt.sign(
        {
            sub: userId,
            userId,
            role,
            username: 'testuser',
            email: 'test@example.com',
            stage: 'authenticated',
            jti: 'test-session-id'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function generateJWTForRole(role) {
    return generateValidJWT(role);
}

async function enableMaintenanceMode() {
    const status = {
        isActive: true,
        allowedRole: 'moderator',
        reason: 'Testing',
        description: 'Maintenance mode enabled for testing'
    };
    // Write to maintenance-status.json or database
}
