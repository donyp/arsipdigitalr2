const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMonths() {
    console.log("Checking invoice months in database...\n");
    
    try {
        // Get all invoices with tanggal field
        const { data, error } = await supabase
            .from('invoice_file_list')
            .select('faktur, tanggal, zona_id, toko')
            .order('tanggal', { ascending: true });
        
        if (error) {
            console.error("Error fetching invoices:", error.message);
            process.exit(1);
        }
        
        console.log(`Total invoices found: ${data.length}\n`);
        
        // Extract months and count them
        const monthCount = new Map();
        const monthDetails = {};
        
        data.forEach(inv => {
            if (inv.tanggal) {
                const date = new Date(inv.tanggal);
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const key = `${year}-${String(month).padStart(2, '0')}`;
                
                if (!monthCount.has(key)) {
                    monthCount.set(key, 0);
                    monthDetails[key] = [];
                }
                monthCount.set(key, monthCount.get(key) + 1);
                monthDetails[key].push({
                    faktur: inv.faktur,
                    zona_id: inv.zona_id,
                    toko: inv.toko
                });
            }
        });
        
        // Display results
        console.log("Invoices by Month:");
        console.log("==================");
        
        const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                           'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        
        const sorted = Array.from(monthCount.entries()).sort();
        sorted.forEach(([key, count]) => {
            const [year, month] = key.split('-');
            const monthNum = parseInt(month);
            const monthName = monthNames[monthNum];
            console.log(`${key} (${monthName}): ${count} invoices`);
            
            // Show sample invoices from first zona
            const zonas = {};
            monthDetails[key].forEach(detail => {
                if (!zonas[detail.zona_id]) {
                    zonas[detail.zona_id] = 0;
                }
                zonas[detail.zona_id]++;
            });
            
            console.log(`  Zones: ${JSON.stringify(zonas)}`);
            console.log(`  Sample: ${monthDetails[key][0].faktur} (${monthDetails[key][0].toko})`);
        });
        
        console.log("\n\nSummary:");
        console.log("========");
        console.log(`Total unique months: ${monthCount.size}`);
        console.log(`Month numbers: [${Array.from(monthCount.keys()).map(k => parseInt(k.split('-')[1])).sort((a,b) => a-b).join(', ')}]`);
        
        // Check if all months exist
        const allMonths = Array.from(monthCount.keys()).map(k => parseInt(k.split('-')[1])).sort((a,b) => a-b);
        const missingMonths = [];
        for (let i = 1; i <= 12; i++) {
            if (!allMonths.includes(i)) {
                missingMonths.push(`${i} (${monthNames[i]})`);
            }
        }
        
        if (missingMonths.length > 0) {
            console.log(`\nMissing months: ${missingMonths.join(', ')}`);
        } else {
            console.log("\nAll 12 months have data!");
        }
        
        // Check zona distribution
        console.log("\n\nZona Distribution:");
        console.log("==================");
        const zonaCount = new Map();
        data.forEach(inv => {
            if (!zonaCount.has(inv.zona_id)) {
                zonaCount.set(inv.zona_id, 0);
            }
            zonaCount.set(inv.zona_id, zonaCount.get(inv.zona_id) + 1);
        });
        
        Array.from(zonaCount.entries()).sort().forEach(([zonaId, count]) => {
            console.log(`Zona ${zonaId}: ${count} invoices`);
        });
        
    } catch (err) {
        console.error("Error:", err);
    }
    
    process.exit(0);
}

checkMonths();
