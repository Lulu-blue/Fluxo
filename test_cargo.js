const ETAPAS_POR_CARGO = {
    'Gerente': [11, 12, 15, 17, 22, 25, 29, 30]
};
function normalizarCargo(cargo) { return 'Gerente'; }
function numeroEtapaNotificacao(n) { return n.etapas?.numero || n.etapa_atual_id || 2; }
function obterNotificacoesProcesso(item) { return item.notificacoes; }

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

const item = {
    notificacoes: [
        { status: 'pendente', etapa_atual_id: 11, etapas: { numero: 11, nome: 'Gerente antes Infração' } }
    ]
};

console.log(itemPertenceAoCargo(item, 'Gerente'));
