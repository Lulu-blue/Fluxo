// ============================================================
// AR AGUARDANDO NOVA TENTATIVA DE ENTREGA (Etapa 1.2 / 16)
// Usado pela etapa (etapa.js) e pelo painel (solicitacoes.js).
//
// No fluxo da Notificação Preliminar são 2 tentativas de entrega. Depois de um
// retorno sem sucesso o processo fica na Etapa 1.2 esperando a nova tentativa:
//   * o prazo do contribuinte NÃO corre nesse período. Sem o AR recebido, quem
//     inicia o prazo é a data de publicação do Edital, nunca a data da tentativa
//     nem a do cadastro do AR (ver obterInicioPrazoAR em etapa.js);
//   * parado por mais de 30 dias, o processo vai para a Etapa 30 (Gerência
//     localiza o AR) e o Gerente recebe um aviso no sino.
// ============================================================

window.AR_DIAS_ESPERA_NOVA_TENTATIVA = 30;

// Processo que voltou da Etapa 30 para a 16 ganha mais 5 dias (corridos, contados
// da volta) antes de ir de novo para a Etapa 30. A data fica em
// etapa16.prazo_extra_ar_ate e vale tanto para a espera da nova tentativa (30
// dias) quanto para o prazo de 15 dias do cadastro do AR.
window.AR_DIAS_PRAZO_EXTRA_VOLTA_ETAPA30 = 5;

window.prazoExtraARAte = function (e16) {
    const d = new Date(e16?.prazo_extra_ar_ate || '');
    return isNaN(d.getTime()) ? null : d;
};

// Fim de um prazo do AR: o limite normal ou o prazo extra da volta da Etapa 30,
// o que for mais tarde.
window.fimPrazoARComExtra = function (fimNormal, e16) {
    const extra = window.prazoExtraARAte(e16);
    if (!fimNormal) return extra;
    return (extra && extra > fimNormal) ? extra : fimNormal;
};

// Data em que a espera pela nova tentativa estoura (null se não está esperando)
window.fimEsperaNovaTentativaAR = function (e16) {
    if (!window.arAguardandoNovaTentativa(e16)) return null;
    const inicio = window.inicioEsperaNovaTentativaAR(e16);
    if (!inicio) return null;
    const teste = parseInt(new URLSearchParams(window.location.search).get('teste_prazo_ar'), 10);
    const limiteMs = isNaN(teste)
        ? window.AR_DIAS_ESPERA_NOVA_TENTATIVA * 24 * 60 * 60 * 1000
        : teste * 1000;
    return window.fimPrazoARComExtra(new Date(inicio.getTime() + limiteMs), e16);
};

window.tentativasARSemSucesso = function (e16) {
    const lista = e16?.retornos_sem_sucesso;
    return Array.isArray(lista) ? lista : [];
};

// Já houve retorno sem sucesso e o AR ainda não foi recebido
window.arAguardandoNovaTentativa = function (e16) {
    if (!e16) return false;
    if (e16.data_recebimento || e16.data_recebimento_proprietario) return false;
    return window.tentativasARSemSucesso(e16).length > 0;
};

// Desde quando o processo está parado esperando a nova tentativa: o registro do
// último retorno sem sucesso (ou, nos registros antigos, a data da tentativa)
window.inicioEsperaNovaTentativaAR = function (e16) {
    const lista = window.tentativasARSemSucesso(e16);
    const ultimo = lista[lista.length - 1];
    if (!ultimo) return null;
    const d = new Date(ultimo.registrado_em || ultimo.data || '');
    return isNaN(d.getTime()) ? null : d;
};

// true quando passou do limite (ou do prazo extra da volta da Etapa 30).
// ?teste_prazo_ar=N (segundos) encurta o limite normal para testes.
window.esperaNovaTentativaARExpirou = function (e16) {
    const fim = window.fimEsperaNovaTentativaAR(e16);
    return !!fim && Date.now() >= fim.getTime();
};

async function idDaEtapaAR(numero) {
    const { data } = await supabaseClient.from('etapas').select('id').eq('numero', numero).maybeSingle();
    return data ? data.id : numero;
}

// Move o processo da Etapa 16 para a 30, tira o prazo que estivesse correndo,
// registra no histórico e avisa o Gerente no sino. Só age se o processo ainda
// estiver na Etapa 16: dois navegadores verificando ao mesmo tempo não duplicam
// o histórico nem o aviso. Devolve true quando moveu.
window.encaminharNovaTentativaARParaEtapa30 = async function ({ processoId, numeroProcesso, e16, usuarioId }) {
    if (!processoId) return false;
    const [id16, id30] = await Promise.all([idDaEtapaAR(16), idDaEtapaAR(30)]);

    const { data: movido, error } = await supabaseClient
        .from('processos')
        .update({ etapa_atual_id: id30, status: 'prazo_ar_expirado' })
        .eq('id', processoId)
        .eq('etapa_atual_id', id16)
        .select('id');
    if (error) throw error;
    if (!movido || movido.length === 0) return false;

    const agora = new Date().toISOString();
    const fechadas = '("encerrada","atendida","pagamento")';

    // O prazo não corre enquanto o AR não é entregue (vale o Edital, depois)
    await supabaseClient
        .from('notificacoes')
        .update({ data_vencimento: null, prazo_origem: null })
        .eq('processo_id', processoId)
        .eq('etapa_atual_id', id16)
        .not('status', 'in', fechadas);

    await supabaseClient
        .from('notificacoes')
        .update({ etapa_atual_id: id30, data_movimentacao: agora })
        .eq('processo_id', processoId)
        .eq('etapa_atual_id', id16);

    const inicio = window.inicioEsperaNovaTentativaAR(e16);
    const desde = inicio ? inicio.toLocaleDateString('pt-BR') : '—';
    const dias = window.AR_DIAS_ESPERA_NOVA_TENTATIVA;

    await supabaseClient.from('historico_etapas').insert([{
        processo_id: processoId,
        notificacao_id: null,
        etapa_de_id: id16,
        etapa_para_id: id30,
        usuario_id: usuarioId || null,
        condicao_aplicada: `AR sem retorno da nova tentativa de entrega por mais de ${dias} dias`,
        observacao: `Nº AR: ${e16?.numero_ar || 'N/A'} | Aguardando a nova tentativa desde ${desde}`,
        dados_etapa: { etapa16: e16 || {} }
    }]);

    // Aviso no sino do Gerente
    try {
        const { data: proc } = await supabaseClient
            .from('processos')
            .select('notificacoes_menu:dados->notificacoes_menu')
            .eq('id', processoId)
            .maybeSingle();
        const menu = Array.isArray(proc?.notificacoes_menu) ? proc.notificacoes_menu : [];
        menu.push({
            id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
            tipo: 'ar_nova_tentativa_expirada',
            titulo: 'AR parado: processo na Etapa 30',
            mensagem: `O AR da nova tentativa de entrega está sem retorno há mais de ${dias} dias (desde ${desde}). `
                + 'O processo foi para a Etapa 30 para a Gerência localizar o AR.',
            processo_id: processoId,
            numero_processo: numeroProcesso || '',
            notificacao_id: null,
            destinatario_cargo: 'Gerente',
            destinatario_id: null,
            lida: false,
            created_at: agora
        });
        await supabaseClient.rpc('atualizar_notificacoes_processo', {
            p_processo_id: processoId,
            p_notificacoes: menu
        });
    } catch (e) {
        console.warn('[AR] Processo movido para a Etapa 30, mas o aviso ao Gerente falhou:', e);
    }
    return true;
};

// Painel: verifica os processos parados na Etapa 16 esperando a nova tentativa.
// Lê só o pedaço do AR de quem tem retorno sem sucesso, no máximo a cada 6 horas
// por navegador (a leitura de dados->... custa caro, ver solicitacoes.js).
const CHAVE_VERIFICACAO_NOVA_TENTATIVA_AR = 'semac_verificacao_ar_nova_tentativa';
const INTERVALO_VERIFICACAO_NOVA_TENTATIVA_AR_MS = 6 * 60 * 60 * 1000;

window.verificarARsAguardandoNovaTentativa = async function (usuarioId) {
    try {
        const ultima = Number(localStorage.getItem(CHAVE_VERIFICACAO_NOVA_TENTATIVA_AR) || 0);
        if (Date.now() - ultima < INTERVALO_VERIFICACAO_NOVA_TENTATIVA_AR_MS) return 0;
        localStorage.setItem(CHAVE_VERIFICACAO_NOVA_TENTATIVA_AR, String(Date.now()));
    } catch (e) { /* sem armazenamento: verifica assim mesmo */ }

    let movidos = 0;
    try {
        const id16 = await idDaEtapaAR(16);
        const { data } = await supabaseClient
            .from('processos')
            .select('id, numero_processo, status, e16:dados->campos->etapa16')
            .eq('etapa_atual_id', id16)
            .not('dados->campos->etapa16->retornos_sem_sucesso', 'is', null);

        // O Auto de Infração tem uma tentativa só: a nova tentativa é do fluxo da
        // Notificação Preliminar (ou do Auto de Fiscalização)
        const ignorar = ['cancelado', 'encerrado', 'arquivado', 'auto_infracao'];
        for (const p of (data || [])) {
            if (ignorar.includes(String(p.status || '').toLowerCase())) continue;
            if (!window.arAguardandoNovaTentativa(p.e16)) continue;
            if (!window.esperaNovaTentativaARExpirou(p.e16)) {
                // Ainda no limite: só tira o prazo que corria pela data do cadastro do AR
                await supabaseClient
                    .from('notificacoes')
                    .update({ data_vencimento: null, prazo_origem: null })
                    .eq('processo_id', p.id)
                    .eq('etapa_atual_id', id16)
                    .eq('prazo_origem', 'cadastro_ar');
                continue;
            }
            const ok = await window.encaminharNovaTentativaARParaEtapa30({
                processoId: p.id, numeroProcesso: p.numero_processo, e16: p.e16, usuarioId
            });
            if (ok) movidos++;
        }
    } catch (e) {
        console.warn('[AR] Erro ao verificar os ARs aguardando nova tentativa:', e);
    }
    return movidos;
};
