const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const content = fs.readFileSync('/home/luiza/Área de Trabalho/Fluxograma/assets/js/login.js', 'utf8');
const urlMatch = content.match(/supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
const keyMatch = content.match(/supabaseKey\s*=\s*['"]([^'"]+)['"]/);

if (urlMatch && keyMatch) {
    const supabaseClient = createClient(urlMatch[1], keyMatch[1]);
    async function test() {
        console.log("Starting query...");
        const start = Date.now();
        const { data, error, count } = await supabaseClient
            .from('processos')
            .select(`
                id
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(0, 19);
        
        console.log("Time taken:", Date.now() - start, "ms");
        if (error) {
            console.log("SUPABASE ERROR:");
            console.log(error);
        } else {
            console.log("SUCCESS! Got rows:", data.length);
            console.log("Total count:", count);
        }
    }
    test();
}
