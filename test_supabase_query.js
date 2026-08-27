const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const content = fs.readFileSync('/home/luiza/Área de Trabalho/Fluxograma/assets/js/login.js', 'utf8');
const urlMatch = content.match(/supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
const keyMatch = content.match(/supabaseKey\s*=\s*['"]([^'"]+)['"]/);

if (urlMatch && keyMatch) {
    const supabaseClient = createClient(urlMatch[1], keyMatch[1]);
    async function test() {
        const { data, error } = await supabaseClient
            .from('processos')
            .select(`
                id,
                numero_processo,
                status,
                etapa_atual_id,
                dados,
                created_at,
                updated_at,
                fiscal_id,
                profiles:fiscal_id (
                    nome
                ),
                etapas (
                    numero,
                    nome
                ),
                notificacoes (
                    id,
                    status,
                    etapa_atual_id,
                    numero,
                    dados,
                    etapas (
                        numero,
                        nome
                    )
                )
            `, { count: 'exact' })
            .limit(1);
        if (error) {
            console.log("SUPABASE ERROR:");
            console.log(error);
        } else {
            console.log("SUCCESS!");
        }
    }
    test();
} else {
    console.log("Could not find keys");
}
