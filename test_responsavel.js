const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const content = fs.readFileSync('/home/luiza/Área de Trabalho/Fluxograma/assets/js/login.js', 'utf8');
const urlMatch = content.match(/supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
const keyMatch = content.match(/supabaseKey\s*=\s*['"]([^'"]+)['"]/);

const ETAPAS_POR_CARGO = {
    'Dev': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
    'Fiscal de Postura': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 18, 19, 20, 21, 27, 28, 29, 31, 32],
    'Administrativo de Posturas': [16, 17],
    'Gerente': [11, 12, 15, 17, 22, 25, 29, 30],
    'Gerente de Interface Jurídica': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
    'Secretário': [24],
    'Jurídico': [23],
    'Fazenda': [26]
};

function normalizarCargo(cargo) {
    if (!cargo) return 'Fiscal de Postura';
    const c = cargo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (c === 'dev' || c.includes('desenvolvedor') || c.includes('developer')) return 'Dev';
    if (c.includes('interface') || (c.includes('gerente') && c.includes('juridic'))) return 'Gerente de Interface Jurídica';
    if (c.includes('gerente')) return 'Gerente';
    if (c.includes('fiscal')) return 'Fiscal de Postura';
    if (c.includes('admin')) return 'Administrativo de Posturas';
    if (c.includes('secretar')) return 'Secretário';
    if (c.includes('jurid')) return 'Jurídico';
    if (c.includes('fazend')) return 'Fazenda';
    return cargo;
}

function obterNotificacoesProcesso(item) {
    if (item?.notificacoes && Array.isArray(item.notificacoes)) return item.notificacoes;
    return item?.dados?.campos?.etapa2?.notificacoes || [];
}

function numeroEtapaNotificacao(n) {
    if (n.etapas?.numero) return parseInt(n.etapas.numero, 10);
    if (n.etapa_atual_id) return parseInt(n.etapa_atual_id, 10);
    return parseInt(n.etapa_atual || 2, 10);
}

function itemPertenceAoCargo(item, cargoAlvo) {
    if (!cargoAlvo) return true;
    const cargoNorm = normalizarCargo(cargoAlvo);
    const etapasPermitidas = ETAPAS_POR_CARGO[cargoNorm] || [];
    if (etapasPermitidas.length === 0) return true;

    const notificacoes = obterNotificacoesProcesso(item);
    if (notificacoes && notificacoes.length > 0) {
        const ativas = notificacoes.filter(n => n.status !== 'atendida');
        const targetNotifs = ativas.length > 0 ? ativas : notificacoes;
        return targetNotifs.some(n => etapasPermitidas.includes(numeroEtapaNotificacao(n)));
    } else {
        const etapaProc = parseInt(item.etapas?.numero || item.etapa_atual_id || 1, 10);
        return etapasPermitidas.includes(etapaProc);
    }
}

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
            .limit(50);
            
        let matches = data.filter(item => itemPertenceAoCargo(item, 'Gerente'));
        console.log(`For 50 latest records, found ${matches.length} matching 'Gerente'`);
    }
    test();
}
