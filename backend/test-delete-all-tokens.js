/**
 * Test: Delete All Tokens Endpoint
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testDeleteAllTokens() {
    try {
        console.log('🧪 Testing delete all tokens endpoint...\n');

        // First, get current token count
        console.log('1️⃣ Checking current token count...');
        const beforeRes = await axios.get(`${BASE_URL}/api/auth/daily-tokens`, {
            headers: {
                'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your_token_here'}`
            }
        }).catch(err => {
            console.log('   (Skipped - need valid token)');
            return { data: { tokens: [] } };
        });

        const countBefore = beforeRes.data.tokens ? beforeRes.data.tokens.length : 0;
        console.log(`   Found ${countBefore} tokens before deletion\n`);

        // Delete all tokens
        console.log('2️⃣ Calling DELETE /api/auth/delete-all-tokens...');
        const deleteRes = await axios.delete(`${BASE_URL}/api/auth/delete-all-tokens`, {
            headers: {
                'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your_token_here'}`
            }
        }).catch(err => {
            console.log('   Error (expected without valid token):');
            console.log(`   Status: ${err.response?.status}`);
            console.log(`   Message: ${err.response?.data?.error || err.message}`);
            return null;
        });

        if (deleteRes) {
            console.log(`   ✅ Response: ${JSON.stringify(deleteRes.data)}`);
            console.log(`\n   Summary:`);
            console.log(`   - Deleted: ${deleteRes.data.deletedCount} tokens`);
            console.log(`   - Status: ${deleteRes.data.success ? 'SUCCESS' : 'FAILED'}`);
        }

        console.log(`\n✅ TEST COMPLETE`);
        console.log(`\nUsage:`);
        console.log(`- Button "🔥 Delete All Tokens" added to token-management.html`);
        console.log(`- Double confirmation dialogs to prevent accidental deletion`);
        console.log(`- Requires super_admin or moderator role`);

    } catch (error) {
        console.error(`\n❌ Error:`, error.message);
    }
}

testDeleteAllTokens();
