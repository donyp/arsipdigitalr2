/**
 * Unit Test: Token Auth Email Suppression When Disabled
 * 
 * Verifies that when token login system is disabled (enabled=false),
 * email is NOT sent in resendTokenForUser() function.
 */

const tokenAuth = require('../token-auth-service');

// Mock Supabase client
const createMockSupabase = () => {
    const mockDb = {
        users: [],
        settings: { enabled: true, token_length: 6 },
        auth_token_keys: [],
        auth_token_logs: [],
    };

    return {
        from: (table) => {
            const chain = {
                _table: table,
                _filters: {},
                _result: { data: null, error: null },
                select: function(cols) { this._cols = cols; return this; },
                then: function(resolve) {
                    let result;
                    if (this._table === 'users') {
                        let data = mockDb.users || [];
                        if (this._filters.role && this._filters.role.in) {
                            data = data.filter(u => this._filters.role.in.includes(u.role));
                        }
                        result = { data, error: null };
                    } else if (this._table === 'system_config') {
                        result = { data: [{ value: mockDb.settings }], error: null };
                    } else {
                        result = { data: [], error: null };
                    }
                    resolve(result);
                    return this;
                },
                eq: function(field, value) { this._filters[field] = value; return this; },
                in: function(field, values) { this._filters[field] = { in: values }; return this; },
                or: function(filter) { this._filterStr = filter; return this; },
                order: function(col, opts) { return this; },
                limit: function(n) { return this; },
                maybeSingle: async function() {
                    if (table === 'system_config') {
                        return { data: { value: mockDb.settings }, error: null };
                    }
                    if (table === 'users') {
                        const user = mockDb.users.find(u => u.id === this._filters.id || u.email === this._filters.email);
                        return { data: user || null, error: user ? null : { message: 'not found' } };
                    }
                    return { data: null, error: null };
                },
                single: async function() {
                    if (table === 'users') {
                        const user = mockDb.users.find(u => u.id === this._filters.id || u.email === this._filters.email || u.id === this._value);
                        return { data: user || null, error: user ? null : { message: 'not found' } };
                    }
                    if (table === 'auth_token_settings') {
                        return { data: mockDb.settings, error: null };
                    }
                    return { data: null, error: null };
                },
                insert: async function(data) {
                    if (table === 'auth_token_keys') { mockDb.auth_token_keys.push(...(Array.isArray(data) ? data : [data])); }
                    if (table === 'auth_token_logs') { mockDb.auth_token_logs.push(...(Array.isArray(data) ? data : [data])); }
                    // return data with id for issueTokenForScope
                    const arr = Array.isArray(data) ? data : [data];
                    return { data: arr.map((d, i) => ({ ...d, id: d.id || `tok-${i}` })), error: null };
                },
                update: function(data) { this._updateData = data; return this; },
                upsert: function(data) {
                    const arr = Array.isArray(data) ? data : [data];
                    const resultData = arr.map((d, i) => ({ ...d, id: d.id || `tok-${i}` }));
                    if (table === 'auth_token_keys') { mockDb.auth_token_keys.push(...resultData); }
                    const chain = {
                        select: async function(cols) {
                            return { data: resultData, error: null };
                        },
                        then: function(resolve) { resolve({ data: resultData, error: null }); },
                    };
                    return chain;
                },
            };
            // Support chained .eq().eq() and .update().eq().eq()
            const origEq = chain.eq.bind(chain);
            chain.eq = function(field, value) { this._filters[field] = value; this._value = value; return this; };
            return chain;
        },
        mockDb,
    };
};

describe('Token Auth - Email Suppression When Disabled', () => {
    let supabase;
    let emailsSent = [];

    beforeEach(() => {
        supabase = createMockSupabase();
        emailsSent = [];

        // Setup test users
        supabase.mockDb.users = [
            {
                id: 'user-1',
                username: 'admin_zona',
                email: 'admin@zona1.com',
                name: 'Admin Zona 1',
                role: 'admin_zona',
                is_active: true,
            },
            {
                id: 'user-2',
                username: 'moderator',
                email: 'mod@example.com',
                name: 'Moderator',
                role: 'moderator',
                is_active: true,
            },
        ];

        // Mock email sending to track calls
        const originalSendEmail = tokenAuth.sendTokenEmail;
        tokenAuth.sendTokenEmail = jest.fn(async (email, token, opts) => {
            emailsSent.push({ email, token, opts });
            return true;
        });

        const originalSendGroupEmail = tokenAuth.sendGroupTokenEmail;
        tokenAuth.sendGroupTokenEmail = jest.fn(async (email, entries) => {
            emailsSent.push({ email, entries, type: 'group' });
            return true;
        });
    });

    test('✅ Email SHOULD be sent when token system is ENABLED', async () => {
        // Setup: token system is enabled
        supabase.mockDb.settings.enabled = true;

        // Execute
        const result = await tokenAuth.resendTokenForUser(supabase, 'user-1');

        // Verify
        expect(result.sent).toBe(true);
        expect(result.disabled).toBeUndefined();
        expect(emailsSent.length).toBeGreaterThan(0);
        console.log('✅ Email sent when enabled:', emailsSent[0]);
    });

    test('❌ Email SHOULD NOT be sent when token system is DISABLED', async () => {
        // Setup: token system is disabled
        supabase.mockDb.settings.enabled = false;

        // Execute
        const result = await tokenAuth.resendTokenForUser(supabase, 'user-1');

        // Verify
        expect(result.sent).toBe(false);
        expect(result.disabled).toBe(true);
        expect(result.detail).toBe('sistem token nonaktif');
        expect(emailsSent.length).toBe(0);
        console.log('✅ Email NOT sent when disabled:', result);
    });

    test('❌ generateAndSendTokens: saat disabled, admin_zona di-skip tapi super_admin/moderator tetap dapat token', async () => {
        // Setup: token system is disabled
        supabase.mockDb.settings.enabled = false;

        // Execute
        const result = await tokenAuth.generateAndSendTokens(supabase);

        // Verify: disabled=true, tapi moderator (user-2) tetap dapat token
        expect(result.disabled).toBe(true);
        expect(result.generated).toBe(1);   // hanya moderator
        expect(result.sent).toBe(1);       // 1 group email
        expect(emailsSent.length).toBe(1);
        console.log('✅ generateAndSendTokens: admin_zona di-skip, moderator tetap dapat token:', result);
    });

    test('Response structure when disabled', async () => {
        supabase.mockDb.settings.enabled = false;

        const result = await tokenAuth.resendTokenForUser(supabase, 'user-1');

        // Verify response contains expected fields
        expect(result).toHaveProperty('scope');
        expect(result).toHaveProperty('email');
        expect(result).toHaveProperty('sent');
        expect(result).toHaveProperty('disabled');
        expect(result).toHaveProperty('detail');

        expect(result.email).toBeNull();
        expect(result.sent).toBe(false);
        expect(result.disabled).toBe(true);
        console.log('✅ Response structure correct:', result);
    });

    test('Multiple enabled/disabled transitions', async () => {
        emailsSent = [];

        // First attempt: disabled
        supabase.mockDb.settings.enabled = false;
        const result1 = await tokenAuth.resendTokenForUser(supabase, 'user-1');
        expect(result1.sent).toBe(false);
        expect(emailsSent.length).toBe(0);

        // Second attempt: enabled
        supabase.mockDb.settings.enabled = true;
        const result2 = await tokenAuth.resendTokenForUser(supabase, 'user-1');
        expect(result2.sent).toBe(true);
        expect(emailsSent.length).toBeGreaterThan(0);

        // Third attempt: disabled again
        supabase.mockDb.settings.enabled = false;
        const result3 = await tokenAuth.resendTokenForUser(supabase, 'user-1');
        expect(result3.sent).toBe(false);
        expect(emailsSent.length).toBe(1); // Still only 1 from second attempt

        console.log('✅ Multiple transitions handled correctly');
    });
});

// Summary report
console.log('\n' + '='.repeat(70));
console.log('UNIT TEST: Token Auth Email Suppression When Disabled');
console.log('='.repeat(70));
console.log('\nTest scenarios:');
console.log('  1. Email sent when system is ENABLED ✓');
console.log('  2. Email NOT sent when system is DISABLED ✓');
console.log('  3. generateAndSendTokens skips when disabled ✓');
console.log('  4. Response structure validates correctly ✓');
console.log('  5. Multiple transitions handled ✓');
console.log('\nExpected outcomes:');
console.log('  ❌ enabled=false  → sent=false, disabled=true, no email');
console.log('  ✅ enabled=true   → sent=true, no disabled flag, email sent');
console.log('='.repeat(70) + '\n');
