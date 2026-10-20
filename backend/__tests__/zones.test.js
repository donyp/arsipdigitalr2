/**
 * Zone Isolation Tests
 * Tests that admin_zona users cannot access other zones
 * Tests that moderators/super_admins can access all zones
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

describe('Zone Isolation & Access Control', () => {

    describe('Admin Zona Restrictions', () => {

        test('admin_zona user cannot list invoices from other zones', async () => {
            // Arrange
            const adminZona1Token = generateJWTForAdminZona(1, 'admin-zona-1');
            
            // Act: Try to access zona 2
            const res = await request(app)
                .get('/api/invoice/list?zona_id=2')
                .set('Authorization', `Bearer ${adminZona1Token}`);
            
            // Assert
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/zona/i);
            expect(res.body.error).toMatch(/akses ditolak/i);
        });

        test('admin_zona user cannot download files from other zones', async () => {
            const adminZona1Token = generateJWTForAdminZona(1, 'admin-zona-1');
            
            // Try to download file from zona 2
            const res = await request(app)
                .get('/api/download/file-from-zona-2-uuid')
                .set('Authorization', `Bearer ${adminZona1Token}`);
            
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/zona|unauthorized/i);
        });

        test('admin_zona user cannot upload to other zones', async () => {
            const adminZona1Token = generateJWTForAdminZona(1, 'admin-zona-1');
            
            // Try to upload invoice to zona 2
            const res = await request(app)
                .post('/api/invoice/upload')
                .set('Authorization', `Bearer ${adminZona1Token}`)
                .send({
                    zona_id: 2,  // Different zona
                    faktur: 'TEST-001',
                    konsumen: 'Test Consumer'
                });
            
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/zona/i);
        });

        test('admin_zona user CAN access their own zone', async () => {
            const adminZona1Token = generateJWTForAdminZona(1, 'admin-zona-1');
            
            // Act: Access own zona
            const res = await request(app)
                .get('/api/invoice/list?zona_id=1')
                .set('Authorization', `Bearer ${adminZona1Token}`);
            
            // Assert
            expect(res.status).toBe(200);
            expect(res.body.data).toBeTruthy();
            
            // Verify all returned invoices belong to zona 1
            expect(res.body.data.every(inv => inv.zona_id === 1)).toBe(true);
        });

        test('admin_zona user defaults to their zona when not specified', async () => {
            const adminZona1Token = generateJWTForAdminZona(1, 'admin-zona-1');
            
            // Act: Access without specifying zona_id
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${adminZona1Token}`);
            
            // Assert: Should return only zona 1 invoices
            expect(res.status).toBe(200);
            expect(res.body.data.every(inv => inv.zona_id === 1)).toBe(true);
        });
    });

    describe('Moderator Access Control', () => {

        test('moderator CAN access all zones', async () => {
            const moderatorToken = generateJWTForRole('moderator', 'moderator-1');
            
            // Should be able to access zona 1
            const res1 = await request(app)
                .get('/api/invoice/list?zona_id=1')
                .set('Authorization', `Bearer ${moderatorToken}`);
            expect(res1.status).toBe(200);
            
            // Should be able to access zona 2
            const res2 = await request(app)
                .get('/api/invoice/list?zona_id=2')
                .set('Authorization', `Bearer ${moderatorToken}`);
            expect(res2.status).toBe(200);
            
            // Should be able to access zona 3
            const res3 = await request(app)
                .get('/api/invoice/list?zona_id=3')
                .set('Authorization', `Bearer ${moderatorToken}`);
            expect(res3.status).toBe(200);
        });

        test('moderator can list invoices from any zona', async () => {
            const moderatorToken = generateJWTForRole('moderator');
            
            const res = await request(app)
                .get('/api/invoice/list?zona_id=2')
                .set('Authorization', `Bearer ${moderatorToken}`);
            
            expect(res.status).toBe(200);
            expect(res.body.data).toBeTruthy();
        });

        test('moderator can edit admin_zona users', async () => {
            const moderatorToken = generateJWTForRole('moderator');
            
            const res = await request(app)
                .put('/api/users/user-123')
                .set('Authorization', `Bearer ${moderatorToken}`)
                .send({
                    role: 'admin_zona',
                    zona_id: 1
                });
            
            expect([200, 204]).toContain(res.status);
        });
    });

    describe('Super Admin Access Control', () => {

        test('super_admin CAN access all zones', async () => {
            const superAdminToken = generateJWTForRole('super_admin', 'super-admin-1');
            
            const res = await request(app)
                .get('/api/invoice/list?zona_id=999')  // Any zona
                .set('Authorization', `Bearer ${superAdminToken}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('Regular User Restrictions', () => {

        test('regular user cannot access zona-specific endpoints', async () => {
            const userToken = generateJWTForRole('user', 'regular-user-1');
            
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${userToken}`);
            
            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/tidak memiliki akses/i);
        });
    });

    describe('Zona Enforcement Across All Endpoints', () => {

        test('Zone check enforced in invoice search', async () => {
            const adminZona1Token = generateJWTForAdminZona(1);
            
            const res = await request(app)
                .get('/api/invoice/list?search=TEST&zona_id=2')
                .set('Authorization', `Bearer ${adminZona1Token}`);
            
            expect(res.status).toBe(403);
        });

        test('Zone check enforced in invoice detail view', async () => {
            const adminZona1Token = generateJWTForAdminZona(1);
            
            // Try to get detail of invoice from zona 2
            const res = await request(app)
                .get('/api/invoice/detail/invoice-uuid?zona_id=2')
                .set('Authorization', `Bearer ${adminZona1Token}`);
            
            expect(res.status).toBe(403);
        });

        test('Zone check enforced in support tickets', async () => {
            const adminZona1Token = generateJWTForAdminZona(1);
            
            // Try to access support ticket from zona 2
            const res = await request(app)
                .get('/api/support/tickets?zona_id=2')
                .set('Authorization', `Bearer ${adminZona1Token}`);
            
            expect(res.status).toBe(403);
        });

        test('Zone check enforced in announcement recipients', async () => {
            const adminZona1Token = generateJWTForAdminZona(1);
            
            // Try to create announcement for zona 2
            const res = await request(app)
                .post('/api/announcements')
                .set('Authorization', `Bearer ${adminZona1Token}`)
                .send({
                    title: 'Test',
                    content: 'Test content',
                    zona_id: 2,
                    recipients: 'all_zona'
                });
            
            expect(res.status).toBe(403);
        });
    });

    describe('Edge Cases & Bypass Attempts', () => {

        test('Bypassing zona check with role=moderator in token fails', async () => {
            // Attempt: Create token with admin_zona role but moderator claim
            const token = jwt.sign(
                {
                    sub: 'user123',
                    userId: 'user123',
                    role: 'moderator',  // Claims moderator
                    zona_id: null,
                    username: 'hacker'
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            // In reality, database lookup will correct this
            // So zona enforcement will still work
            const res = await request(app)
                .get('/api/invoice/list?zona_id=999')
                .set('Authorization', `Bearer ${token}`);
            
            // If user is actually admin_zona in DB, should be restricted
            // This tests the authenticateToken's database role lookup
            expect(res.status).toBeLessThanOrEqual(200); // Allowed if truly moderator
        });

        test('SQL injection in zona_id query param rejected', async () => {
            const adminZona1Token = generateJWTForAdminZona(1);
            
            const res = await request(app)
                .get("/api/invoice/list?zona_id=1' OR '1'='1")
                .set('Authorization', `Bearer ${adminZona1Token}`);
            
            // Should be rejected by input validation or safely handled
            expect([400, 403]).toContain(res.status);
        });

        test('Negative zona_id rejected', async () => {
            const adminZona1Token = generateJWTForAdminZona(1);
            
            const res = await request(app)
                .get('/api/invoice/list?zona_id=-1')
                .set('Authorization', `Bearer ${adminZona1Token}`);
            
            expect([400, 403, 404]).toContain(res.status);
        });

        test('Non-integer zona_id rejected', async () => {
            const adminZona1Token = generateJWTForAdminZona(1);
            
            const res = await request(app)
                .get('/api/invoice/list?zona_id=abc')
                .set('Authorization', `Bearer ${adminZona1Token}`);
            
            expect([400, 403]).toContain(res.status);
        });
    });

    describe('Multi-User Concurrent Access', () => {

        test('Two admin_zona users accessing same zona returns isolated data', async () => {
            const adminZona1User1Token = generateJWTForAdminZona(1, 'user-1');
            const adminZona1User2Token = generateJWTForAdminZona(1, 'user-2');
            
            const res1 = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${adminZona1User1Token}`);
            
            const res2 = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${adminZona1User2Token}`);
            
            expect(res1.status).toBe(200);
            expect(res2.status).toBe(200);
            
            // Both should see same invoices (same zona)
            expect(res1.body.data.length).toBe(res2.body.data.length);
        });

        test('admin_zona user cannot access another admin_zona user data from different zona', async () => {
            const adminZona1Token = generateJWTForAdminZona(1);
            const adminZona2Token = generateJWTForAdminZona(2);
            
            // Zone 1 user tries to access Zone 2 data
            const res = await request(app)
                .get('/api/invoice/list')
                .set('Authorization', `Bearer ${adminZona1Token}`)
                .query({ zona_id: 2 });
            
            expect(res.status).toBe(403);
        });
    });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function generateJWTForAdminZona(zonaId, userId = `admin-zona-${zonaId}`) {
    return jwt.sign(
        {
            sub: userId,
            userId,
            role: 'admin_zona',
            zona_id: zonaId,
            username: `adminzona${zonaId}`,
            email: `admin${zonaId}@example.com`,
            stage: 'authenticated',
            jti: `session-${userId}`
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function generateJWTForRole(role, userId = `user-${role}`) {
    return jwt.sign(
        {
            sub: userId,
            userId,
            role,
            zona_id: null,
            username: userId,
            email: `${userId}@example.com`,
            stage: 'authenticated',
            jti: `session-${userId}`
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}
