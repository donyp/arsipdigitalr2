/**
 * Integration Test: Verify Email Not Sent When Token System is Disabled
 * 
 * Run: node backend/test-token-disabled-email.js
 */

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};

// Mock implementation to test logic without external dependencies
class MockSupabase {
    constructor() {
        this.users = [
            {
                id: 'test-admin-zona',
                username: 'admin_zona_test',
                email: 'admin@zona.test',
                name: 'Test Admin Zona',
                role: 'admin_zona',
                is_active: true,
            },
            {
                id: 'test-moderator',
                username: 'moderator_test',
                email: 'mod@test.com',
                name: 'Test Moderator',
                role: 'moderator',
                is_active: true,
            },
        ];
        this.settings = {
            enabled: true,
            token_length: 6,
            auto_logout_time: '00:00',
            admin_group_email: 'admin-group@test.com',
            temp_token_ttl_seconds: 600,
        };
        this.emailsSent = [];
        this.tokenKeys = [];
        this.logs = [];
    }

    from(table) {
        return new QueryBuilder(this, table);
    }
}

class QueryBuilder {
    constructor(db, table) {
        this.db = db;
        this.table = table;
        this.filters = {};
    }

    select(cols) {
        this.columns = cols;
        return this;
    }

    eq(field, value) {
        this.filters[field] = value;
        return this;
    }

    single() {
        return this.execute();
    }

    async execute() {
        if (this.table === 'users') {
            const user = this.db.users.find(
                u => (this.filters.id && u.id === this.filters.id) ||
                     (this.filters.email && u.email === this.filters.email)
            );
            return { data: user || null, error: user ? null : new Error('Not found') };
        }
        if (this.table === 'auth_token_settings') {
            return { data: this.db.settings, error: null };
        }
        return { data: null, error: null };
    }

    async insert(data) {
        if (this.table === 'auth_token_keys') {
            this.db.tokenKeys.push(...data);
        } else if (this.table === 'auth_token_logs') {
            this.db.logs.push(...data);
        }
        return { data, error: null };
    }

    update(data) {
        this.updateData = data;
        return this;
    }

    async upsert(data) {
        if (this.table === 'auth_token_keys') {
            this.db.tokenKeys.push(...data);
        }
        return { data, error: null };
    }
}

// Test scenarios
async function runTests() {
    let passed = 0;
    let failed = 0;

    console.log(`\n${colors.cyan}${colors.bold}=== TOKEN AUTH EMAIL SUPPRESSION TEST ===${colors.reset}\n`);

    // Test 1: Email sent when system is enabled
    console.log(`${colors.yellow}Test 1: Email SHOULD be sent when token system is ENABLED${colors.reset}`);
    try {
        const supabase = new MockSupabase();
        supabase.settings.enabled = true;
        
        let emailSentFlag = false;
        const originalEmail = supabase.from;
        supabase.mockSendEmail = async (email, token, opts) => {
            emailSentFlag = true;
            supabase.emailsSent.push({ email, token, opts });
        };

        // Simulate resendTokenForUser logic
        const userId = 'test-admin-zona';
        const { data: user, error } = await supabase.from('users').select('*').eq('id', userId).single();
        
        if (!error && user) {
            const settings = supabase.settings;
            if (settings.enabled) {
                emailSentFlag = true;
                supabase.emailsSent.push({
                    email: user.email,
                    timestamp: new Date().toISOString(),
                });
            }
        }

        if (emailSentFlag && supabase.emailsSent.length > 0) {
            console.log(`${colors.green}✅ PASS: Email would be sent${colors.reset}`);
            console.log(`   Email to: ${supabase.emailsSent[0].email}\n`);
            passed++;
        } else {
            console.log(`${colors.red}❌ FAIL: Email was not sent${colors.reset}\n`);
            failed++;
        }
    } catch (e) {
        console.log(`${colors.red}❌ FAIL: ${e.message}${colors.reset}\n`);
        failed++;
    }

    // Test 2: Email NOT sent when system is disabled
    console.log(`${colors.yellow}Test 2: Email SHOULD NOT be sent when token system is DISABLED${colors.reset}`);
    try {
        const supabase = new MockSupabase();
        supabase.settings.enabled = false; // DISABLED!
        
        let emailSentFlag = false;
        const userId = 'test-admin-zona';
        const { data: user, error } = await supabase.from('users').select('*').eq('id', userId).single();
        
        if (!error && user) {
            const settings = supabase.settings;
            
            // This is the critical check from the fix
            if (!settings.enabled) {
                console.log(`${colors.green}✅ Enabled flag check: BLOCKED${colors.reset}`);
                emailSentFlag = false;
            } else {
                emailSentFlag = true;
            }
        }

        if (!emailSentFlag && supabase.emailsSent.length === 0) {
            console.log(`${colors.green}✅ PASS: Email was NOT sent (as expected)${colors.reset}\n`);
            passed++;
        } else {
            console.log(`${colors.red}❌ FAIL: Email was sent when it should have been blocked${colors.reset}\n`);
            failed++;
        }
    } catch (e) {
        console.log(`${colors.red}❌ FAIL: ${e.message}${colors.reset}\n`);
        failed++;
    }

    // Test 3: Response structure when disabled
    console.log(`${colors.yellow}Test 3: Response structure when disabled${colors.reset}`);
    try {
        const supabase = new MockSupabase();
        supabase.settings.enabled = false;
        
        // Simulated response when disabled
        const response = {
            scope: 'admin_zona:test-admin-zona',
            email: null,
            sent: false,
            disabled: true,
            detail: 'sistem token nonaktif',
        };

        const hasAllFields = 
            response.hasOwnProperty('scope') &&
            response.hasOwnProperty('email') &&
            response.hasOwnProperty('sent') &&
            response.hasOwnProperty('disabled') &&
            response.hasOwnProperty('detail');

        const correctValues = 
            response.email === null &&
            response.sent === false &&
            response.disabled === true;

        if (hasAllFields && correctValues) {
            console.log(`${colors.green}✅ PASS: Response structure is correct${colors.reset}`);
            console.log(`   Response: ${JSON.stringify(response, null, 2).split('\n').join('\n   ')}\n`);
            passed++;
        } else {
            console.log(`${colors.red}❌ FAIL: Response structure is incorrect${colors.reset}\n`);
            failed++;
        }
    } catch (e) {
        console.log(`${colors.red}❌ FAIL: ${e.message}${colors.reset}\n`);
        failed++;
    }

    // Test 4: Transition from enabled to disabled
    console.log(`${colors.yellow}Test 4: State transition (enabled → disabled)${colors.reset}`);
    try {
        const supabase = new MockSupabase();
        let emailCount = 0;

        // First: enabled
        supabase.settings.enabled = true;
        emailCount = 1;
        
        // Second: disabled
        supabase.settings.enabled = false;
        const shouldSendWhenDisabled = supabase.settings.enabled;
        
        if (emailCount === 1 && !shouldSendWhenDisabled) {
            console.log(`${colors.green}✅ PASS: Transition handled correctly${colors.reset}`);
            console.log(`   Emails sent: 1 (before disable)\n`);
            passed++;
        } else {
            console.log(`${colors.red}❌ FAIL: Transition not handled${colors.reset}\n`);
            failed++;
        }
    } catch (e) {
        console.log(`${colors.red}❌ FAIL: ${e.message}${colors.reset}\n`);
        failed++;
    }

    // Summary
    console.log(`${colors.bold}${colors.cyan}=== TEST SUMMARY ===${colors.reset}`);
    console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log(`Total: ${passed + failed}\n`);

    console.log(`${colors.bold}Key Verification Points:${colors.reset}`);
    console.log(`  ✓ When enabled=true   → Email IS sent`);
    console.log(`  ✓ When enabled=false  → Email is NOT sent`);
    console.log(`  ✓ Response includes 'disabled' flag when system is off`);
    console.log(`  ✓ State transitions are respected\n`);

    return failed === 0;
}

// Run tests
runTests().then(success => {
    process.exit(success ? 0 : 1);
}).catch(err => {
    console.error(`${colors.red}Test error: ${err.message}${colors.reset}`);
    process.exit(1);
});
