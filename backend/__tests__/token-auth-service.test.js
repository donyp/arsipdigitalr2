/**
 * Unit tests for token-auth-service pure helpers (no DB / no network).
 */
const service = require('../token-auth-service');

describe('token-auth-service — pure helpers', () => {
    test('generateTokenCode returns numeric string of given length', () => {
        for (let i = 0; i < 50; i++) {
            const c = service.generateTokenCode(6);
            expect(c).toMatch(/^\d{6}$/);
        }
        expect(service.generateTokenCode(4)).toMatch(/^\d{4}$/);
        expect(service.generateTokenCode(8)).toMatch(/^\d{8}$/);
    });

    test('sha256 is deterministic and different for different input', () => {
        const a = service.sha256('123456');
        const b = service.sha256('123456');
        const c = service.sha256('123457');
        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    test('scopeForUser maps roles correctly', () => {
        expect(service.scopeForUser({ id: 'u1', role: 'admin_zona' })).toBe('user:u1');
        expect(service.scopeForUser({ id: 'u2', role: 'moderator' })).toBe('group:moderator_admin');
        expect(service.scopeForUser({ id: 'u3', role: 'super_admin' })).toBe('group:moderator_admin');
        expect(service.scopeForUser({ id: 'u4', role: 'customer' })).toBeNull();
    });

    test('nextAutoLogoutDate returns today/tomorrow at configured time', () => {
        const now = new Date();
        const t = service.nextAutoLogoutDate(now.getHours() + ':00');
        expect(t.getMinutes()).toBe(0);
        expect(t.getSeconds()).toBe(0);
    });

    test('nextAutoLogoutDate rolls to next day when time already passed', () => {
        const now = new Date();
        const target = new Date(now);
        target.setHours(now.getHours(), 0, 0, 0);
        // past time -> should be tomorrow
        const pastHour = (now.getHours() + 23) % 24; // guarantee "in the past"
        const t = service.nextAutoLogoutDate(`${pastHour}:59`);
        expect(t.getTime()).toBeGreaterThan(now.getTime());
    });

    test('DEFAULT_SETTINGS has correct admin group email + enabled default', () => {
        expect(service.DEFAULT_SETTINGS.admin_group_email).toBe('donisugiharto322@gmail.com');
        expect(service.DEFAULT_SETTINGS.enabled).toBe(false);
        expect(service.DEFAULT_SETTINGS.token_length).toBe(6);
    });
});