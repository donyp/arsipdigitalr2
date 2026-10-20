const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkZonas() {
    const { data: zonas, error } = await supabase
        .from('zonas')
        .select('*')
        .order('id');

    console.log('Zonas:', zonas);
    console.log('Error:', error);
}

checkZonas();
