/**
 * Insert Test Support Tickets
 * Run: node backend/insert-test-tickets.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function insertTestTickets() {
    try {
        console.log('🔧 Inserting test support tickets...\n');

        // Get a valid user_id and zona_id
        console.log('📊 Fetching user and zona data...');
        
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, email, name')
            .limit(1);

        if (usersError || !users || users.length === 0) {
            throw new Error('No users found in database');
        }

        const userId = users[0].id;
        console.log(`✓ Using user: ${users[0].name} (${users[0].email})`);

        const { data: zonas, error: zonasError } = await supabase
            .from('zonas')
            .select('id, nama')
            .limit(1);

        if (zonasError || !zonas || zonas.length === 0) {
            throw new Error('No zonas found in database');
        }

        const zonaId = zonas[0].id;
        console.log(`✓ Using zona: ${zonas[0].nama}\n`);

        // Insert test tickets
        console.log('📝 Creating test tickets...');
        
        const testTickets = [
            {
                ticket_number: '#ANKA001',
                user_id: userId,
                zona_id: zonaId,
                subject: 'Test Ticket 1 - System Check',
                description: 'Ini adalah ticket test pertama untuk verifikasi sistem support',
                category: 'General',
                priority: 'Medium',
                status: 'Open'
            },
            {
                ticket_number: '#ANKA002',
                user_id: userId,
                zona_id: zonaId,
                subject: 'Test Ticket 2 - High Priority',
                description: 'Ini adalah ticket test kedua dengan prioritas tinggi',
                category: 'General',
                priority: 'High',
                status: 'Open'
            },
            {
                ticket_number: '#ANKA003',
                user_id: userId,
                zona_id: zonaId,
                subject: 'Test Ticket 3 - Already Answered',
                description: 'Ini adalah ticket test ketiga yang sudah dijawab',
                category: 'General',
                priority: 'Low',
                status: 'Answered'
            },
            {
                ticket_number: '#ANKA004',
                user_id: userId,
                zona_id: zonaId,
                subject: 'Test Ticket 4 - Resolved',
                description: 'Ini adalah ticket test keempat yang sudah diselesaikan',
                category: 'General',
                priority: 'Medium',
                status: 'Resolved'
            }
        ];

        const { data: insertedTickets, error: insertError } = await supabase
            .from('support_tickets')
            .insert(testTickets)
            .select();

        if (insertError) throw insertError;

        console.log(`✓ Successfully inserted ${insertedTickets.length} test tickets!\n`);

        // Display inserted tickets
        console.log('📋 Inserted Tickets:');
        console.log('─'.repeat(80));
        insertedTickets.forEach(ticket => {
            console.log(`  ${ticket.ticket_number} | ${ticket.subject}`);
            console.log(`    Status: ${ticket.status} | Priority: ${ticket.priority}`);
            console.log('');
        });

        // Verify
        const { data: allTickets, error: countError } = await supabase
            .from('support_tickets')
            .select('*');

        if (!countError) {
            console.log(`✓ Total tickets in database: ${allTickets.length}`);
        }

        console.log('\n✅ Test data inserted successfully!');
        console.log('   Now refresh the Support page to see the tickets.\n');

    } catch (error) {
        console.error('❌ Error inserting test tickets:', error.message);
        process.exit(1);
    }
}

insertTestTickets();
