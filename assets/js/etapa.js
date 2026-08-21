// ============================================================================
// etapa.js — Página Completa de Visualização / Edição e Documento Oficial
// ============================================================================

let processoAtual = null;
let perfilAtual = null;
let notificacaoAtual = null; // Guarda a notificação em foco se a URL contiver ?notificacao=
let valorUpfmdAtual = 103.00;

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
}

window.formatarDataVistoriaRobusta = function (val) {
    if (!val) return null;
    if (typeof val === 'string') {
        val = val.trim();
        if (/^\d{2}\/\d{2}\/\d{4}/.test(val)) return val.substring(0, 10);
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
            const parts = val.split('T')[0].split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
    const d = new Date(val);
    return (!isNaN(d.getTime())) ? d.toLocaleDateString('pt-BR') : null;
};

// ── Helper para verificar se Notificação possui status de Auto de Infração ──
window.ehStatusAutoInfracao = function (notif) {
    if (!notif) return false;
    const st = (notif.status || '').toLowerCase();
    const etapa = parseInt(notif.etapas?.numero || notif.etapa_atual || notif.etapa_atual_id || 0, 10);
    return st === 'auto_infracao' || st === 'auto de infração' || st === 'auto de infracao' || (notif.dados && notif.dados.status_fluxo === 'auto_infracao') || etapa >= 14;
};

// ── Overlay de Carregamento Global ────────────────────────────────────────
function mostrarCarregamento(mensagem) {
    const overlay = document.getElementById('overlayCarregamento');
    const texto = document.getElementById('textoOverlayCarregamento');
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.transition = 'opacity 0.2s ease'; overlay.style.opacity = '1'; }, 10);
    }
    if (texto && mensagem) texto.textContent = mensagem;
}

function ocultarCarregamento() {
    const overlay = document.getElementById('overlayCarregamento');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 200);
    }
}

// ── Helpers para processos com notificações independentes ─────────────────
// Retorna as notificações do processo. Prioriza a tabela 'notificacoes'.
function obterNotificacoesProcesso(proc) {
    if (!proc) return [];
    if (proc.notificacoes && Array.isArray(proc.notificacoes)) return proc.notificacoes;
    // Fallback para dados antigos em JSONB
    return proc.campos?.etapa2?.notificacoes || proc.dados?.campos?.etapa2?.notificacoes || [];
}

// Calcula a etapa a ser exibida no painel: maior etapa_atual entre as notificações
// não concluídas. Se todas concluídas, retorna null (processo concluído).
function calcularEtapaProcesso(proc) {
    const notificacoes = obterNotificacoesProcesso(proc);
    if (!notificacoes || notificacoes.length === 0) {
        return parseInt(proc?.etapa_atual || proc?.etapa_atual_id || 1, 10);
    }

    const ativas = notificacoes.filter(n => n.status !== 'finalizada' && n.status !== 'concluida');
    if (ativas.length === 0) return null;

    // O processo principal deve permanecer na Etapa 2 enquanto houver notificações ativas,
    // pois a Etapa 2 é o painel (dashboard) central que exibe todas elas.
    return 2;
}

// Verifica se o processo tem notificações em etapas diferentes.
function processoTemNotificacoesDivergentes(proc) {
    const notificacoes = obterNotificacoesProcesso(proc);
    if (!notificacoes || notificacoes.length <= 1) return false;

    const etapasAtivas = new Set(
        notificacoes
            .filter(n => n.status !== 'finalizada' && n.status !== 'concluida')
            .map(n => parseInt(n.etapa_atual || 2, 10))
    );
    return etapasAtivas.size > 1;
}

// Lê o parâmetro ?notificacao= da URL.
function obterIndiceNotificacaoDaURL() {
    const params = new URLSearchParams(window.location.search);
    const idx = parseInt(params.get('notificacao'), 10);
    return isNaN(idx) ? null : idx;
}

// ── Gerenciamento de notificações via tabela 'notificacoes' ───────────────
async function carregarNotificacoesDoBanco(processoId) {
    try {
        const { data, error } = await supabaseClient
            .from('notificacoes')
            .select('*, etapas(numero)')
            .eq('processo_id', processoId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('Erro ao carregar notificações do banco:', err);
        return null;
    }
}

// Migra notificações legadas do JSONB para a tabela, quando necessário.
async function migrarNotificacoesLegadas(proc, notificacoesBanco) {
    if (notificacoesBanco && notificacoesBanco.length > 0) return notificacoesBanco;

    const legadas = proc.campos?.etapa2?.notificacoes || proc.dados?.campos?.etapa2?.notificacoes;
    if (!legadas || !Array.isArray(legadas) || legadas.length === 0) return [];

    const migradas = [];
    for (let i = 0; i < legadas.length; i++) {
        const n = legadas[i];
        const etapaNum = parseInt(n.etapa_atual || 2, 10);
        const { data: etapaDb } = await supabaseClient
            .from('etapas')
            .select('id')
            .eq('numero', etapaNum)
            .maybeSingle();

        const { data: criada, error } = await supabaseClient
            .from('notificacoes')
            .insert([{
                processo_id: proc.id,
                numero: n.numero || `${proc.numero_processo}/${String(i + 1).padStart(2, '0')}`,
                descricao: n.descricao || null,
                prazo_dias: n.prazo_dias || 15,
                data_inicio: n.data_inicio || proc.created_at,
                data_vencimento: n.data_vencimento || null,
                status: n.status || 'pendente',
                etapa_atual_id: etapaDb ? etapaDb.id : null,
                data_movimentacao: n.data_movimentacao || null,
                dados: { migrado_de_jsonb: true, indice_original: i }
            }])
            .select()
            .single();

        if (!error && criada) migradas.push(criada);
    }
    return migradas;
}

async function atualizarNotificacaoNoBanco(notifId, dados) {
    try {
        const { error } = await supabaseClient
            .from('notificacoes')
            .update(dados)
            .eq('id', notifId);
        if (error) throw error;
    } catch (err) {
        console.error('Erro ao atualizar notificação no banco:', err);
        throw err;
    }
}

async function adicionarHistoricoNotificacao(notif, etapaDe, etapaPara, condicao) {
    if (!notif) return;
    try {
        const notifDados = { ...(notif.dados || {}) };
        notifDados.historico = notifDados.historico || [];
        notifDados.historico.push({
            etapa_de: etapaDe,
            etapa_para: etapaPara,
            status: notif.status,
            condicao: condicao || 'Movimentação de etapa',
            data: new Date().toISOString(),
            usuario: window.perfilAtual?.nome || 'Sistema'
        });

        await supabaseClient
            .from('notificacoes')
            .update({ dados: notifDados })
            .eq('id', notif.id);

        notif.dados = notifDados;
    } catch (err) {
        console.error('Erro ao adicionar histórico JSON na notificação:', err);
    }
}

// Cria as notificações de um processo a partir das infrações selecionadas.
// Retorna o array de notificações criadas. Não duplica se já existirem.
async function criarNotificacoesDoProcesso(proc) {
    const existentes = await carregarNotificacoesDoBanco(proc.id);
    if (existentes && existentes.length > 0) return existentes;

    const dispositivos = obterDispositivosDoProcesso(proc);
    const passouEtapa17 = await processoPassouPelaEtapa17(proc);

    const etapaNumero = proc.etapa_atual || 2;
    const { data: etapaDb } = await supabaseClient
        .from('etapas')
        .select('id')
        .eq('numero', etapaNumero)
        .maybeSingle();
    const etapaAtualId = etapaDb ? etapaDb.id : null;

    const dataInicio = proc.created_at || new Date().toISOString();
    const notificacoesCriadas = [];

    for (let i = 0; i < dispositivos.length; i++) {
        const disp = dispositivos[i];
        let prazoDias = obterPrazoNotificacao(disp);
        if (passouEtapa17) {
            prazoDias = 20;
        }
        const numero = `${proc.numero_processo || 'S/N'}/${String(i + 1).padStart(2, '0')}`;

        const { data: notif, error } = await supabaseClient
            .from('notificacoes')
            .insert([{
                processo_id: proc.id,
                numero,
                descricao: disp,
                prazo_dias: prazoDias,
                data_inicio: dataInicio,
                data_vencimento: calcularDataVencimento(dataInicio, prazoDias),
                status: 'pendente',
                etapa_atual_id: etapaAtualId
            }])
            .select()
            .single();

        if (error) {
            console.warn('Erro ao criar notificação:', error);
            continue;
        }

        // Vincula a primeira infração compatível do processo
        const { data: infracoes } = await supabaseClient
            .from('processo_infracoes')
            .select('id, infracoes_catalogo(codigo, descricao)')
            .eq('processo_id', proc.id)
            .is('notificacao_id', null);

        if (infracoes && infracoes.length > 0) {
            const compativel = infracoes.find(inf => {
                const descCat = inf.infracoes_catalogo?.descricao || '';
                const descNotif = notif.descricao || '';
                return descCat.toLowerCase().includes(descNotif.toLowerCase()) ||
                    descNotif.toLowerCase().includes(descCat.toLowerCase());
            }) || infracoes[0];

            await supabaseClient
                .from('processo_infracoes')
                .update({ notificacao_id: compativel.id })
                .eq('id', compativel.id);
        }

        notificacoesCriadas.push(notif);
    }

    return notificacoesCriadas;
}

// ── Aplica a data de recebimento da Etapa 16 como data inicial do prazo de vencimento ──
async function aplicarDataRecebimentoComoInicioPrazo(proc, dataRecebimento) {
    if (!proc || !dataRecebimento) return;
    const dataInicioISO = dataRecebimento.includes('T') ? dataRecebimento : new Date(dataRecebimento + 'T12:00:00').toISOString();

    proc.campos = proc.campos || {};
    proc.campos.etapa16 = proc.campos.etapa16 || {};
    proc.campos.etapa16.data_recebimento = dataRecebimento;
    proc.campos.etapa16.data_recebimento_proprietario = dataRecebimento;
    if (proc.dados) {
        proc.dados.campos = proc.campos;
        if (!proc.dados.etapa16) proc.dados.etapa16 = {};
        proc.dados.etapa16.data_recebimento = dataRecebimento;
        proc.dados.etapa16.data_recebimento_proprietario = dataRecebimento;
    }

    const passouEtapa17 = await processoPassouPelaEtapa17(proc);

    try {
        const notificacoes = await carregarNotificacoesDoBanco(proc.id);
        const dataMov = new Date().toISOString();
        for (const n of notificacoes || []) {
            const prazoDias = passouEtapa17 ? 20 : (n.prazo_dias || obterPrazoNotificacao(n.descricao));
            const dataVenc = calcularDataVencimento(dataInicioISO, prazoDias);
            await atualizarNotificacaoNoBanco(n.id, {
                data_inicio: dataInicioISO,
                data_vencimento: dataVenc,
                prazo_dias: prazoDias,
                data_movimentacao: dataMov
            });
            n.data_inicio = dataInicioISO;
            n.data_vencimento = dataVenc;
            n.prazo_dias = prazoDias;
        }
    } catch (err) {
        console.warn('Erro ao atualizar datas das notificações no banco:', err);
    }

    if (proc.notificacoes && Array.isArray(proc.notificacoes)) {
        proc.notificacoes.forEach(n => {
            const prazoDias = passouEtapa17 ? 20 : (n.prazo_dias || obterPrazoNotificacao(n.descricao));
            n.data_inicio = dataInicioISO;
            n.data_vencimento = calcularDataVencimento(dataInicioISO, prazoDias);
            n.prazo_dias = prazoDias;
        });
    }
    if (proc.campos?.etapa2?.notificacoes && Array.isArray(proc.campos.etapa2.notificacoes)) {
        proc.campos.etapa2.notificacoes.forEach(salva => {
            const prazoDias = passouEtapa17 ? 20 : (salva.prazo_dias || obterPrazoNotificacao(salva.descricao));
            salva.data_inicio = dataInicioISO;
            salva.data_vencimento = calcularDataVencimento(dataInicioISO, prazoDias);
            salva.prazo_dias = prazoDias;
        });
    }
}

// ── Atualiza as notificações do processo ao retornar para a Etapa 2 ────────
// Se o processo já passou pela Etapa 17, o prazo de vencimento passa a ser 20 dias.
// Se há data de recebimento na Etapa 16, ela passa a ser a data inicial (data_inicio).
async function atualizarNotificacoesParaEtapa2(proc, etapa2Id) {
    const passouEtapa17 = await processoPassouPelaEtapa17(proc);
    const notificacoes = await carregarNotificacoesDoBanco(proc.id);
    const dataMov = new Date().toISOString();

    const dataRec = proc?.campos?.etapa16?.data_recebimento || proc?.campos?.etapa16?.data_recebimento_proprietario || proc?.dados?.etapa16?.data_recebimento || proc?.dados?.etapa16?.data_recebimento_proprietario;
    const dataInicioAR = dataRec ? (dataRec.includes('T') ? dataRec : new Date(dataRec + 'T12:00:00').toISOString()) : null;

    for (const n of notificacoes || []) {
        const prazoDias = passouEtapa17 ? 20 : (n.prazo_dias || obterPrazoNotificacao(n.descricao));
        const dataInicio = dataInicioAR || n.data_inicio || proc.created_at || new Date().toISOString();
        const dataVencimento = calcularDataVencimento(dataInicio, prazoDias);

        await atualizarNotificacaoNoBanco(n.id, {
            etapa_atual_id: etapa2Id,
            prazo_dias: prazoDias,
            data_inicio: dataInicio,
            data_vencimento: dataVencimento,
            data_movimentacao: dataMov
        });
    }
}

const MODO_ACESSO = {
    NORMAL: 'normal',
    LEITURA_NOTIFICACAO: 'leitura_notificacao',
    VISUALIZACAO_COMPLETA: 'visualizacao_completa'
};

const ETAPAS_MAP = {
    1: 'Possui Decreto/Notificação',
    2: 'Defesa ou Dilação de Prazo',
    3: 'Envio da 1ª Defesa',
    4: 'Comprovante Propriedade',
    5: 'Análise Dilação de Prazo',
    6: 'Defesa Com Dilação',
    7: 'Análise da Defesa Sem Dilação',
    8: 'Fiscal Analisa Defesa (Pós Dilação)',
    9: 'Envio Defesa Sem Dilação',
    10: 'Certidão Sem Defesa',
    11: 'Gerente antes Infração',
    12: 'Gerente antes Auto Infração',
    13: 'Fiscal Analisa Defesa (1ª)',
    14: 'Auto de Infração',
    15: 'Gerente Gera a Multa',
    16: 'Retorno do AR',
    17: 'Gerência Gera o Edital',
    18: 'Solicitar Defesa ou Recurso',
    19: 'Envio de Defesa ou Pagamento',
    20: 'Realizar Pagamento',
    21: 'Fiscal Convocado Jurídico',
    22: 'Gerente Convocado Jurídico',
    23: 'Parecer Jurídico',
    24: 'Secretário Despacha',
    25: 'Gerente Cumpre Decreto',
    26: 'Fazenda Gera a Multa',
    27: 'Devolvimento para o Setor',
    28: 'Certificação do Vencimento',
    29: 'Fiscal Emite Certidão',
    30: 'Gerente Localiza o AR',
    31: 'Comprovante Pagamento',
    32: 'Consulta no Jurídico'
};

// Mapa de etapas que cada cargo pode editar.
const ETAPAS_POR_CARGO = {
    'Fiscal de Postura': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 18, 19, 20, 21, 27, 28, 29, 31, 32],
    'Administrativo de Posturas': [16],
    'Gerente': [11, 12, 15, 17, 22, 25, 29, 30],
    'Secretário': [24],
    'Jurídico': [23],
    'Fazenda': [26]
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Obter ID do processo pela URL
    const params = new URLSearchParams(window.location.search);
    const processoId = params.get('processo');

    if (!processoId) {
        alert('Processo não especificado na URL.');
        window.location.href = 'painel.html';
        return;
    }

    // 2. Carregar perfil do usuário logado
    await carregarPerfilUsuario();

    // 3. Carregar dados do processo
    await carregarProcessoCompleto(processoId);

    if (!processoAtual) return;

    // 4. Se o processo tem notificações independentes, selecionar a notificação vinda da URL ou ativa
    const notificacoes = obterNotificacoesProcesso(processoAtual);
    const paramNotif = (new URLSearchParams(window.location.search)).get('notificacao');

    if (notificacoes.length > 0) {
        let indiceFinal = null;
        if (paramNotif !== null) {
            const parsed = parseInt(paramNotif, 10);
            if (!isNaN(parsed) && notificacoes[parsed]) {
                indiceFinal = parsed;
            } else {
                const idxPorId = notificacoes.findIndex(n =>
                    String(n.id) === String(paramNotif) ||
                    String(n.notificacao_id) === String(paramNotif) ||
                    String(n.numero) === String(paramNotif) ||
                    String(n.numero_notificacao) === String(paramNotif)
                );
                if (idxPorId !== -1) indiceFinal = idxPorId;
            }
        }

        if (indiceFinal !== null && notificacoes[indiceFinal]) {
            aplicarNotificacaoSelecionada(processoAtual, indiceFinal);
        } else {
            // Se nenhuma notificação específica foi passada na URL, mantém o processo na etapa principal (ex: Etapa 2 - Painel)
            notificacaoAtual = null;
            const procEtapa = parseInt(processoAtual.etapas?.numero || processoAtual.etapa_atual_id || 2, 10);
            processoAtual.etapa_atual = procEtapa;
        }
        await inicializarPaginaEtapa();
    } else {
        await inicializarPaginaEtapa();
    }
});

// Aplica a notificação selecionada como "etapa atual" do processo para renderização
function aplicarNotificacaoSelecionada(proc, indice) {
    const notificacoes = obterNotificacoesProcesso(proc);
    const notif = notificacoes[indice];
    if (!notif) return;

    proc.notificacaoSelecionada = indice;
    notificacaoAtual = notif;

    const etapaRel = Array.isArray(notif.etapas) ? notif.etapas[0] : notif.etapas;
    const etapaNotif = parseInt(etapaRel?.numero || notif.etapa_atual || notif.etapa_atual_id || 2, 10);
    proc.etapa_atual = etapaNotif;
    if (notif.etapa_atual_id) proc.etapa_atual_id = notif.etapa_atual_id;
}

async function inicializarPaginaEtapa() {
    console.log('[DEBUG] inicializarPaginaEtapa — etapa:', processoAtual?.etapa_atual, '| cargo:', perfilAtual?.cargo);
    const modo = determinarModoAcesso(processoAtual, perfilAtual);
    console.log('[DEBUG] inicializarPaginaEtapa — modo:', modo);
    aplicarModoAcesso(modo);

    // Processos cancelados: visualização somente leitura do documento oficial
    if (processoAtual?.status?.toLowerCase() === 'cancelado') {
        await renderizarProcessoCancelado(processoAtual);
        return;
    }

    let etapaAtual = parseInt(processoAtual?.etapa_atual || processoAtual?.etapa_atual_id || 1, 10);

    // Virtualiza a etapa 33 para notificações encerradas
    if (notificacaoAtual && notificacaoAtual.status === 'encerrada') {
        etapaAtual = 33;
    }

    // Esconde as ações do stepper (avançar, voltar, cancelar) se for etapa 33
    if (etapaAtual === 33) {
        setTimeout(() => {
            const stepperActions = document.querySelector('.stepper-actions');
            if (stepperActions) stepperActions.style.display = 'none';
        }, 100);
    }

    // Self-healing: Se o processo foi incorretamente movido para uma etapa de notificação
    if (!notificacaoAtual && [3, 4, 5, 6, 7].includes(etapaAtual)) {
        console.log('[DEBUG] Processo em etapa de notificação. Restaurando para Etapa 2...');
        const { data: etapaDb } = await supabaseClient.from('etapas').select('id').eq('numero', 2).maybeSingle();
        if (etapaDb) {
            await supabaseClient.from('processos').update({ etapa_atual_id: etapaDb.id }).eq('id', processoAtual.id);
            window.location.href = `etapa.html?processo=${processoAtual.id}`;
            return;
        }
    }

    if (etapaAtual === 2 && !notificacaoAtual) {
        await renderizarEtapa2(processoAtual);
        configurarEventosEtapa2();
    } else if (etapaAtual === 16) {
        await renderizarEtapa16(processoAtual);
        configurarEventosEtapa16();
    } else if (etapaAtual === 17) {
        renderizarEtapa17(processoAtual);
        configurarEventosEtapa17();
    } else if (etapaAtual === 30) {
        renderizarEtapa30(processoAtual);
        configurarEventosEtapa30();
    } else {
        configurarAbasPagina();

        if (notificacaoAtual || [1, 3, 4, 5, 7, 10, 11, 13, 14, 15, 18, 19, 29, 33].includes(etapaAtual)) {
            renderizarFormularioDinamico(etapaAtual);
            if (etapaAtual === 1 && !notificacaoAtual) {
                configurarEventosPainelEtapa1();
                renderizarPainelEtapa1(processoAtual);
                const tabForm = document.getElementById('tabFormulario');
                if (tabForm) setTimeout(() => tabForm.click(), 50);
            }
        }

        const btnSalvar = document.getElementById('btnSalvarEdicaoProcesso');
        if (btnSalvar) btnSalvar.addEventListener('click', salvarEdicoesProcesso);
    }

    renderizarStepperPadrao(processoAtual);
    configurarBotoesNavegacaoPadrao();

    const btnImprimir = document.getElementById('btnImprimirEtapa');
    if (btnImprimir) btnImprimir.addEventListener('click', imprimirDocumentoOficial);

    const btnBaixarRelatorioPdfEtapa = document.getElementById('btnBaixarRelatorioPdfEtapa');
    if (btnBaixarRelatorioPdfEtapa) btnBaixarRelatorioPdfEtapa.addEventListener('click', baixarRelatorioFiscalPdfEtapa);

    restaurarEstadoSidebarEtapa();
    carregarUsuarioSidebarEtapa();
}

function renderizarFormularioDinamico(etapaNum) {
    const areaForm = document.getElementById('areaFormularioDinamico');
    if (!areaForm) return;

    let formDiv = document.getElementById('formDinamicoContainer');
    if (!formDiv) {
        formDiv = document.createElement('div');
        formDiv.id = 'formDinamicoContainer';
        areaForm.appendChild(formDiv);
    }

    // Configurações de abas para Notificações vs Processo Padrão
    const btnTabDoc = document.querySelector('.tab-button[data-tab="tabDocumentoOficial"]');
    const btnTabEdit = document.querySelector('.tab-button[data-tab="tabEditarProcesso"]');

    if (notificacaoAtual && etapaNum !== 1) {
        if (btnTabDoc) btnTabDoc.textContent = `Ações da Notificação`;
        if (btnTabEdit) btnTabEdit.style.display = 'none';
    } else {
        if (btnTabDoc) btnTabDoc.textContent = `Notificação Preliminar (Modelo Oficial)`;
        if (btnTabEdit) btnTabEdit.style.display = 'inline-block';
    }

    const btnBaixar = document.getElementById('btnBaixarRelatorioPdfEtapa');
    if (btnBaixar) {
        if (etapaNum === 10) {
            btnBaixar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Baixar Certidão (.pdf)`;
        } else if ([5, 13].includes(etapaNum)) {
            btnBaixar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Baixar Réplica (.pdf)`;
        } else {
            btnBaixar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Baixar Relatório (.pdf)`;
        }
    }

    const uploadHtml = (textoUpload) => `
        <div class="anexo-upload-wrapper" style="margin-top:15px; margin-bottom:15px;">
            <div id="areaDropGenerico" class="drop-area-clean" style="border: 2px dashed #8b5cf6; border-radius: 10px; padding: 30px; text-align: center; background: #f5f3ff; cursor: pointer; transition: all 0.2s ease;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" style="margin-bottom:12px;">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p style="margin:0; font-weight:600; color:#5b21b6; font-size:0.95rem;">${textoUpload}</p>
                <p style="margin:4px 0 15px 0; color:#7c3aed; font-size:0.82rem;">Formatos aceitos: PDF, JPG, PNG (Máx. 10MB)</p>
                <input type="file" id="inputAnexoGenerico" accept=".pdf,.jpg,.jpeg,.png" multiple style="display:none;" />
                <button type="button" class="btn-selecionar-arquivo" onclick="document.getElementById('inputAnexoGenerico').click()" style="padding:8px 16px; border-radius:6px; border:none; background:#7c3aed; cursor:pointer; font-weight:600; color:#ffffff; margin-bottom: 10px; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.2);">Escolher Arquivos</button>
                <br/>
            </div>
            <div id="listaAnexosGenericos" style="margin-top: 15px; display:flex; flex-direction:column; gap:8px;"></div>
        </div>
    `;

    let conteudo = '';

    if (etapaNum === 1) {
        conteudo = `
            <!-- Painel da Etapa 1: Controle de Multas & Anexo da Notificação Assinada -->
            <div id="painelAcoesEtapa1" class="etapa1-control-panel">
                <!-- Bloco 1: Valores das Multas -->
                <div class="etapa1-card" id="cardValoresMultas">
                    <div class="etapa1-card-header">
                        <div class="header-icon">💰</div>
                        <div>
                            <h3 class="etapa1-card-title">1º Passo: Conferir ou Atualizar Valores das Multas</h3>
                            <p class="etapa1-card-subtitle">Confirme ou edite os valores das multas para atualizar
                                em tempo real o documento PDF abaixo.</p>
                        </div>
                    </div>

                    <!-- Bloco UPFMD e Parâmetros de Cálculo -->
                    <div class="upfmd-header-box"
                        style="margin: 16px 0 20px 0; padding: 18px 22px; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
                        <div>
                            <label
                                style="font-weight: 700; color: #5b21b6; font-size: 0.96rem; display: block; margin-bottom: 4px;">Parâmetros
                                de Cálculo (UPFMD & Imóvel de Esquina)</label>
                            <span style="font-size: 0.84rem; color: #6d28d9;">Regra oficial: Imóveis de esquina
                                somam Testada + Profundidade no cálculo das infrações por metro linear.</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                            <div
                                style="display: flex; align-items: center; gap: 8px; background: white; padding: 8px 14px; border-radius: 10px; border: 1px solid #c4b5fd;">
                                <span style="font-weight: 600; font-size: 0.88rem; color: #5b21b6;">Esquina?</span>
                                <select id="selectEsquinaCalc"
                                    style="font-weight: 700; color: #5b21b6; border: none; outline: none; background: transparent; cursor: pointer;">
                                    <option value="nao">Não</option>
                                    <option value="sim">Sim</option>
                                </select>
                            </div>
                            <div
                                style="display: flex; align-items: center; gap: 8px; background: white; padding: 8px 14px; border-radius: 10px; border: 1px solid #c4b5fd;">
                                <span style="font-weight: 700; color: #5b21b6;">UPFMD: R$</span>
                                <input type="number" step="0.01" id="inputValUpfmd"
                                    style="width: 100px; font-weight: 700; font-size: 1.05rem; color: #5b21b6; border: none; outline: none; background: transparent;"
                                    value="${(window.valorUpfmdAtual || 103.00).toFixed(2)}" title="Valor da UPFMD">
                            </div>
                        </div>
                    </div>

                    <!-- Bloco Reincidência -->
                    <div id="blocoReincidenciaAnterior"
                        style="margin: 0 0 20px 0; padding: 18px 22px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 14px; display: none;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                            <span style="font-size: 1.3rem;">⚠️</span>
                            <div>
                                <h4 style="font-size: 0.98rem; font-weight: 700; color: #9f1239; margin: 0;">Dados
                                    da Reincidência (Auto de Infração Anterior)</h4>
                                <p style="font-size: 0.84rem; color: #be123c; margin: 2px 0 0 0;">Preencha o número
                                    e a data do Auto de Infração anterior para constar na Observação do Fiscal do
                                    documento.</p>
                            </div>
                        </div>
                        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 220px;">
                                <label style="display: block; font-size: 0.85rem; font-weight: 700; color: #881337; margin-bottom: 4px;">N° Auto de Infração expedido anteriormente</label>
                                <input type="text" id="inputAutoInfracaoAntNum" placeholder="Ex: 1234/2025" style="width: 100%; padding: 10px 14px; border: 1px solid #fda4af; border-radius: 8px; font-weight: 600; color: #881337; background: white;">
                            </div>
                            <div style="flex: 1; min-width: 220px;">
                                <label style="display: block; font-size: 0.85rem; font-weight: 700; color: #881337; margin-bottom: 4px;">Data do Auto de Infração expedido anteriormente</label>
                                <input type="text" id="inputAutoInfracaoAntData" placeholder="Ex: 10/05/2025" style="width: 100%; padding: 10px 14px; border: 1px solid #fda4af; border-radius: 8px; font-weight: 600; color: #881337; background: white;">
                            </div>
                        </div>
                    </div>

                    <div id="listaInputsMultas" class="multas-inputs-grid"></div>

                    <div class="etapa1-card-footer">
                        <button id="btnAtualizarMultasDoc" class="btn-primary" style="padding: 10px 20px; font-weight:600;">
                            Salvar Valores e Atualizar Documento PDF
                        </button>
                        <span id="multasSalvasFeedback" style="color:#16a34a; font-weight:600; font-size:0.9rem; display:none;">
                            ✓ Documento atualizado com sucesso!
                        </span>
                    </div>
                </div>

                <!-- Bloco 2: Anexo da Notificação e Relatório Fiscal Assinados -->
                <div class="etapa1-card" id="cardAnexoNP" style="margin-top: 18px;">
                    <div class="etapa1-card-header">
                        <div class="header-icon">📄</div>
                        <div style="flex:1;">
                            <h3 class="etapa1-card-title">2º Passo: Anexar Notificação Preliminar e Relatório Fiscal Assinados</h3>
                            <p class="etapa1-card-subtitle">Após gerar ou imprimir os documentos, anexe a Notificação Preliminar e o Relatório Fiscal assinados para habilitar o avanço do processo.</p>
                        </div>
                        <span id="badgeAnexoNPStatus" class="badge-status-anexo">Pendente</span>
                    </div>

                    <div class="anexo-upload-wrapper" style="display:flex; flex-direction:column; gap:20px;">
                        <!-- Anexo 1: Notificação Preliminar Assinada -->
                        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px;">
                            <label style="font-weight:700; color:#1e293b; font-size:0.92rem; display:block; margin-bottom:8px;">1. Notificação Preliminar Assinada <span style="color:#ef4444;">*</span></label>
                            <div id="areaDropNP" class="drop-area-clean">
                                <p style="margin:0; font-weight:600; color:#1e293b; font-size:0.95rem;">Clique para selecionar ou arraste a Notificação Assinada aqui</p>
                                <input type="file" id="inputArquivoNP" accept=".pdf,.jpg,.jpeg,.png" style="display:none;">
                            </div>

                            <div id="anexoNPAtual" class="arquivo-anexado-box" style="display:none;">
                                <div style="display:flex; align-items:center; gap:12px;">
                                    <div class="file-icon-badge" style="font-size:1.4rem;">📎</div>
                                    <div>
                                        <div id="nomeArquivoNP" style="font-weight:600; color:#0f172a; font-size:0.95rem;">notificacao_assinada.pdf</div>
                                        <div id="dataArquivoNP" style="color:#16a34a; font-weight:600; font-size:0.8rem;">Anexado com sucesso</div>
                                    </div>
                                </div>
                                <div style="display:flex; gap:8px;">
                                    <a id="btnVerAnexoNP" href="#" target="_blank" class="btn-sm btn-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #cbd5e1; color:#334155; text-decoration:none; font-size:0.82rem; font-weight:600;">Visualizar</a>
                                    <button id="btnRemoverAnexoNP" class="btn-sm btn-danger-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #fecaca; background:#fef2f2; color:#dc2626; font-size:0.82rem; font-weight:600; cursor:pointer;">Substituir / Remover</button>
                                </div>
                            </div>
                        </div>

                        <!-- Anexo 2: Relatório Fiscal Assinado -->
                        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px;">
                            <label style="font-weight:700; color:#1e293b; font-size:0.92rem; display:block; margin-bottom:8px;">2. Relatório Fiscal Assinado <span style="color:#ef4444;">*</span></label>
                            <div id="areaDropRF" class="drop-area-clean">
                                <p style="margin:0; font-weight:600; color:#1e293b; font-size:0.95rem;">Clique para selecionar ou arraste o Relatório Fiscal Assinado aqui</p>
                                <input type="file" id="inputArquivoRF" accept=".pdf,.jpg,.jpeg,.png" style="display:none;">
                            </div>

                            <div id="anexoRFAtual" class="arquivo-anexado-box" style="display:none;">
                                <div style="display:flex; align-items:center; gap:12px;">
                                    <div class="file-icon-badge" style="font-size:1.4rem;">📋</div>
                                    <div>
                                        <div id="nomeArquivoRF" style="font-weight:600; color:#0f172a; font-size:0.95rem;">relatorio_fiscal_assinado.pdf</div>
                                        <div id="dataArquivoRF" style="color:#16a34a; font-weight:600; font-size:0.8rem;">Anexado com sucesso</div>
                                    </div>
                                </div>
                                <div style="display:flex; gap:8px;">
                                    <a id="btnVerAnexoRF" href="#" target="_blank" class="btn-sm btn-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #cbd5e1; color:#334155; text-decoration:none; font-size:0.82rem; font-weight:600;">Visualizar</a>
                                    <button id="btnRemoverAnexoRF" class="btn-sm btn-danger-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #fecaca; background:#fef2f2; color:#dc2626; font-size:0.82rem; font-weight:600; cursor:pointer;">Substituir / Remover</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else if (etapaNum === 3) {
        let prazoHtml = '';
        if (notificacaoAtual && notificacaoAtual.data_vencimento) {
            const infoPrazo = formatarDiasRestantes(notificacaoAtual.data_vencimento);
            prazoHtml = `
                <div style="background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.2rem;">⏳</span>
                    <div>
                        <div style="font-weight:600; color:#334155; font-size:0.9rem;">Prazo de Vencimento da Notificação</div>
                        <div style="font-size:0.85rem; color:#475569;">${new Date(notificacaoAtual.data_vencimento).toLocaleDateString('pt-BR')} <span style="${infoPrazo.vencido ? 'color:#991b1b; font-weight:600;' : 'color:#166534; font-weight:600;'}">(${infoPrazo.texto})</span></div>
                    </div>
                </div>
            `;
        }

        const hist = notificacaoAtual?.dados?.historico || [];
        const veioDoGerente = hist.length > 0 && hist[hist.length - 1].etapa_de === 11;
        let alertaGerenteHtml = '';
        if (veioDoGerente && notificacaoAtual?.dados?.etapa11?.justificativa) {
            alertaGerenteHtml = `
                <div style="background:#fef2f2; border:1px solid #fca5a5; border-radius:8px; padding:12px; margin-bottom:15px; display:flex; gap:12px;">
                    <span style="font-size:1.5rem;">⚠️</span>
                    <div>
                        <div style="font-weight:800; color:#991b1b; font-size:1rem; margin-bottom:4px;">Atenção: O Gerente retornou esta defesa para reanálise do Fiscal</div>
                        <div style="font-size:0.95rem; color:#7f1d1d; font-weight:500;"><strong>Motivo do Gerente:</strong> ${notificacaoAtual.dados.etapa11.justificativa}</div>
                    </div>
                </div>
            `;
        }

        conteudo = `
            <h3 style="margin-top:0; color:#0f172a; font-size:1.1rem; margin-bottom:12px;">Defesa Apresentada</h3>
            ${alertaGerenteHtml}
            ${prazoHtml}
            <p style="font-size:0.95rem; color:#475569;">Por favor, anexe o documento de defesa abaixo. Você pode anexar mais de um arquivo.</p>
            ${uploadHtml('Clique para selecionar ou arraste os documentos de defesa aqui')}
        `;
    } else if (etapaNum === 4) {
        const veioDeDilacao = notificacaoAtual?.status === 'dilacao';
        const docText = veioDeDilacao ? 'Comprovante de Propriedade e Comprovante de Renda' : 'Comprovante de Propriedade';
        const pText = veioDeDilacao ? 'Anexe os comprovantes de propriedade e de renda abaixo. É necessário no mínimo 2 documentos.' : 'Anexe o comprovante de propriedade abaixo.';

        conteudo = `
            <h3 style="margin-top:0; color:#0f172a; font-size:1.1rem; margin-bottom:12px;">${docText}</h3>
            <p style="font-size:0.95rem; color:#475569;">${pText}</p>
            ${uploadHtml('Clique para selecionar ou arraste os documentos aqui')}
        `;
    } else if (etapaNum === 5) {
        const decisaoAnterior = notificacaoAtual?.dados?.etapa5?.decisao || '';
        const justificativaAnterior = notificacaoAtual?.dados?.etapa5?.justificativa || '';

        const btnBaixar = document.getElementById('btnBaixarRelatorioPdfEtapa');
        if (btnBaixar) btnBaixar.innerHTML = btnBaixar.innerHTML.replace('Relatório', 'Réplica');

        setTimeout(() => { if (window.gerarReplica) window.gerarReplica(); }, 300);

        conteudo = `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                    <div style="background:#f3e8ff; padding:10px; border-radius:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700;">Análise de Dilação de Prazo</h3>
                        <p style="margin:2px 0 0 0; color:#64748b; font-size:0.85rem;">Avalie a solicitação de dilação e informe a decisão do fiscal.</p>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr; gap:20px;">
                    <div style="background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Decisão da Dilação <span style="color:#ef4444;">*</span></label>
                        <select id="selectDecisaoDilacao" onchange="window.toggleOpcoesDilacao()" class="form-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b; transition:all 0.2s; outline:none; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                            <option value="">Selecione uma opção...</option>
                            <option value="defere" ${decisaoAnterior === 'defere' ? 'selected' : ''}>Defere</option>
                            <option value="indefere" ${decisaoAnterior === 'indefere' ? 'selected' : ''}>Indeferimento</option>
                            <option value="gerente" ${decisaoAnterior === 'gerente' ? 'selected' : ''}>Manda para o gerente</option>
                        </select>
                    </div>

                    <div id="blocoDiasDilacao" style="display: ${decisaoAnterior === 'defere' ? 'block' : 'none'}; background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Quantos dias será a dilação?</label>
                        <input type="number" id="inputDiasDilacao" class="form-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white;" value="${notificacaoAtual?.dados?.etapa5?.dias || 0}">
                    </div>

                    <div id="blocoJustificativaDilacao" style="display: ${(decisaoAnterior === 'indefere' || decisaoAnterior === 'gerente') ? 'block' : 'none'}; background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Motivo (pois):</label>
                        <textarea id="txtJustificativaDilacao" class="form-input" placeholder="Descreva o motivo..." rows="4" style="width:100%; padding:12px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b; resize:vertical;">${justificativaAnterior}</textarea>
                    </div>
                </div>

                <div style="margin-top:20px;">
                    <div id="containerImagensForm" style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;"></div>
                    <div style="display:flex; gap:16px;">
                        <button type="button" onclick="window.gerarReplica()" class="btn-primary" style="padding:12px 20px;">Gerar/Atualizar Réplica</button>
                        <button type="button" onclick="window.adicionarCampoImagemReplica()" class="btn-primary" style="background:#10b981; border-color:#10b981; padding:12px 20px;">Adicionar Imagem</button>
                    </div>
                </div>
                ${gerarHtmlBlocoAnexoReplica()}
            </div>
        `;
    } else if (etapaNum === 11) {
        const decisaoAnterior = notificacaoAtual?.dados?.etapa11?.decisao || '';
        const justificativaAnterior = notificacaoAtual?.dados?.etapa11?.justificativa || '';
        const dataVencimentoAnterior = notificacaoAtual?.dados?.etapa11?.dataVencimento || '';

        let anexosHtml = '';

        // 1) Replica (Etapa 13)
        anexosHtml += `
            <div style="background:white; border:1px solid #cbd5e1; padding:16px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                <div><h4 style="margin:0; font-size:0.95rem; color:#1e293b;">Réplica (PDF)</h4><p style="margin:0; font-size:0.8rem; color:#64748b;">Parecer do Fiscal (Etapa 13)</p></div>
                <button type="button" onclick="baixarDocUnico('replica')" style="padding:6px 12px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; font-weight:600; cursor:pointer;">Visualizar / Baixar</button>
            </div>
        `;

        // 2) Defesa (Etapa 3)
        const anexosDefesa = notificacaoAtual?.dados?.etapa3?.anexos || [];
        anexosDefesa.forEach((anexo, idx) => {
            anexosHtml += `
            <div style="background:white; border:1px solid #cbd5e1; padding:16px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                <div><h4 style="margin:0; font-size:0.95rem; color:#1e293b;">${anexo.nome}</h4><p style="margin:0; font-size:0.8rem; color:#64748b;">Defesa (Etapa 3)</p></div>
                <button type="button" onclick="window.abrirAnexoNotificacao('etapa3', ${idx})" style="padding:6px 12px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; font-weight:600; cursor:pointer;">Visualizar / Baixar</button>
            </div>
            `;
        });

        // 3) Comprovante de Renda/Propriedade (Etapa 4)
        const anexosRenda = notificacaoAtual?.dados?.etapa4?.anexos || [];
        anexosRenda.forEach((anexo, idx) => {
            anexosHtml += `
            <div style="background:white; border:1px solid #cbd5e1; padding:16px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                <div><h4 style="margin:0; font-size:0.95rem; color:#1e293b;">${anexo.nome}</h4><p style="margin:0; font-size:0.8rem; color:#64748b;">Comprovante Renda/Prop. (Etapa 4)</p></div>
                <button type="button" onclick="window.abrirAnexoNotificacao('etapa4', ${idx})" style="padding:6px 12px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; font-weight:600; cursor:pointer;">Visualizar / Baixar</button>
            </div>
            `;
        });

        conteudo = `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                    <div style="background:#fef3c7; padding:10px; border-radius:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700;">Gerente Analisa Defesa (2ª)</h3>
                        <p style="margin:2px 0 0 0; color:#64748b; font-size:0.85rem;">Analise os documentos e dê o veredito final.</p>
                    </div>
                </div>

                <div style="margin-bottom:24px; padding:16px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;">
                    <h4 style="margin:0 0 12px 0; color:#334155;">Documentos Principais e Auxiliares</h4>
                    <div style="display:grid; grid-template-columns:1fr; gap:12px;">
                        ${anexosHtml}
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr; gap:20px;">
                    <div style="background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Decisão do Gerente <span style="color:#ef4444;">*</span></label>
                        <select id="selectDecisaoGerente" onchange="window.toggleOpcoesGerente()" class="form-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b; outline:none; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                            <option value="">Selecione uma opção...</option>
                            <option value="defere" ${decisaoAnterior === 'defere' ? 'selected' : ''}>Deferido</option>
                            <option value="indefere" ${decisaoAnterior === 'indefere' ? 'selected' : ''}>Indeferido</option>
                            <option value="dilatar" ${decisaoAnterior === 'dilatar' ? 'selected' : ''}>Dilatar Prazo</option>
                            <option value="retorna_fiscal" ${decisaoAnterior === 'retorna_fiscal' ? 'selected' : ''}>Mandar de volta para o fiscal analisar novamente a defesa</option>
                        </select>
                    </div>

                    <div id="blocoDataDilacaoGerente" style="display: ${decisaoAnterior === 'dilatar' ? 'block' : 'none'}; background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Nova data de vencimento <span style="color:#ef4444;">*</span></label>
                        <input type="date" id="inputDataDilacaoGerente" class="form-input" value="${dataVencimentoAnterior}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b;" />
                    </div>

                    <div id="blocoCertidaoGerente" style="display: ${decisaoAnterior === 'defere' ? 'block' : 'none'}; background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Gerar Certidão de Encerramento (Etapa 10) antes de encerrar o processo? <span style="color:#ef4444;">*</span></label>
                        <select id="selectGerarCertidaoGerente" class="form-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b;">
                            <option value="sim" ${notificacaoAtual?.dados?.etapa11?.passar_certidao !== false ? 'selected' : ''}>Sim, passar pela Etapa 10 para gerar a Certidão</option>
                            <option value="nao" ${notificacaoAtual?.dados?.etapa11?.passar_certidao === false ? 'selected' : ''}>Não, encerrar diretamente o processo</option>
                        </select>
                    </div>

                    <div id="blocoJustificativaGerente" style="display: ${decisaoAnterior ? 'block' : 'none'}; background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Motivo da Decisão <span style="color:#ef4444;">*</span></label>
                        <textarea id="txtJustificativaGerente" class="form-input" placeholder="Escreva o motivo..." rows="4" style="width:100%; padding:12px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b; resize:vertical;">${justificativaAnterior}</textarea>
                    </div>
                </div>
            </div>
        `;
    } else if (etapaNum === 13) {
        const decisaoAnterior = notificacaoAtual?.dados?.etapa13?.decisao || '';
        const justificativaAnterior = notificacaoAtual?.dados?.etapa13?.justificativa || '';

        const btnBaixar = document.getElementById('btnBaixarRelatorioPdfEtapa');
        if (btnBaixar) btnBaixar.innerHTML = btnBaixar.innerHTML.replace('Relatório', 'Réplica');

        setTimeout(() => { if (window.gerarReplica) window.gerarReplica(); }, 300);

        let anexosEtapa13Html = '';
        const anexosDefesa13 = notificacaoAtual?.dados?.etapa3?.anexos || [];
        anexosDefesa13.forEach((anexo, idx) => {
            anexosEtapa13Html += `
            <div style="background:white; border:1px solid #cbd5e1; padding:12px 16px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div><h4 style="margin:0; font-size:0.95rem; color:#1e293b;">${anexo.nome}</h4><p style="margin:0; font-size:0.8rem; color:#64748b;">Defesa (Etapa 3)</p></div>
                <button type="button" onclick="window.abrirAnexoNotificacao('etapa3', ${idx})" style="padding:6px 12px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; font-weight:600; cursor:pointer;">Visualizar / Baixar</button>
            </div>
            `;
        });
        const anexosRenda13 = notificacaoAtual?.dados?.etapa4?.anexos || [];
        anexosRenda13.forEach((anexo, idx) => {
            anexosEtapa13Html += `
            <div style="background:white; border:1px solid #cbd5e1; padding:12px 16px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div><h4 style="margin:0; font-size:0.95rem; color:#1e293b;">${anexo.nome}</h4><p style="margin:0; font-size:0.8rem; color:#64748b;">Comprovante Renda/Prop. (Etapa 4)</p></div>
                <button type="button" onclick="window.abrirAnexoNotificacao('etapa4', ${idx})" style="padding:6px 12px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; font-weight:600; cursor:pointer;">Visualizar / Baixar</button>
            </div>
            `;
        });

        conteudo = `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                    <div style="background:#f3e8ff; padding:10px; border-radius:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700;">Fiscal Analisa a Defesa (1ª)</h3>
                        <p style="margin:2px 0 0 0; color:#64748b; font-size:0.85rem;">Avalie a defesa e informe a decisão do fiscal.</p>
                    </div>
                </div>

                ${anexosEtapa13Html ? `
                <div style="background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:20px;">
                    <h4 style="margin:0 0 12px 0; color:#334155; font-size:0.95rem; font-weight:700;">Documentos Apresentados na Defesa:</h4>
                    ${anexosEtapa13Html}
                </div>
                ` : ''}

                <div style="display:grid; grid-template-columns:1fr; gap:20px;">
                    <div style="background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Decisão da Defesa <span style="color:#ef4444;">*</span></label>
                        <select id="selectDecisaoDilacao" onchange="window.toggleOpcoesDilacao()" class="form-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b; transition:all 0.2s; outline:none; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                            <option value="">Selecione uma opção...</option>
                            <option value="defere" ${decisaoAnterior === 'defere' ? 'selected' : ''}>Defere</option>
                            <option value="indefere" ${decisaoAnterior === 'indefere' ? 'selected' : ''}>Indeferimento</option>
                            <option value="gerente" ${decisaoAnterior === 'gerente' ? 'selected' : ''}>Manda para o gerente</option>
                        </select>
                    </div>

                    <div id="blocoParecerGerente" style="display: ${decisaoAnterior === 'gerente' ? 'block' : 'none'}; background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Parecer do Fiscal <span style="color:#ef4444;">*</span></label>
                        <select id="selectParecerGerente" onchange="window.gerarReplica()" class="form-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b; outline:none; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                            <option value="nao_favoravel" ${notificacaoAtual?.dados?.etapa13?.parecer !== 'favoravel' ? 'selected' : ''}>Não Favorável</option>
                            <option value="favoravel" ${notificacaoAtual?.dados?.etapa13?.parecer === 'favoravel' ? 'selected' : ''}>Favorável</option>
                        </select>
                    </div>

                    <div id="blocoJustificativaDilacao" style="display: ${(decisaoAnterior === 'indefere' || decisaoAnterior === 'gerente') ? 'block' : 'none'}; background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Motivo (pois):</label>
                        <textarea id="txtJustificativaDilacao" class="form-input" placeholder="Descreva o motivo..." rows="4" style="width:100%; padding:12px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b; resize:vertical;">${justificativaAnterior}</textarea>
                    </div>
                </div>

                <div style="margin-top:20px;">
                    <div id="containerImagensForm" style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;"></div>
                    <div style="display:flex; gap:16px;">
                        <button type="button" onclick="window.gerarReplica()" class="btn-primary" style="padding:12px 20px;">Gerar/Atualizar Réplica</button>
                        <button type="button" onclick="window.adicionarCampoImagemReplica()" class="btn-primary" style="background:#10b981; border-color:#10b981; padding:12px 20px;">Adicionar Imagem</button>
                    </div>
                </div>
                ${gerarHtmlBlocoAnexoReplica()}
            </div>
        `;
    } else if (etapaNum === 7) {
        let defaultCumprimento = '';
        if (notificacaoAtual) {
            if (notificacaoAtual.status === 'atendida') {
                defaultCumprimento = 'atendida';
            } else if (notificacaoAtual.status === 'vencida' || notificacaoAtual.status === 'pendente_vencida') {
                defaultCumprimento = 'vencida';
            } else if (notificacaoAtual.status === 'pendente' && notificacaoAtual.data_vencimento) {
                const infoPrazo = formatarDiasRestantes(notificacaoAtual.data_vencimento);
                if (infoPrazo.vencido) {
                    defaultCumprimento = 'vencida';
                }
            }
        }

        const decisaoSalva = notificacaoAtual?.dados?.etapa7?.cumprimento;
        if (decisaoSalva) {
            defaultCumprimento = decisaoSalva;
        }

        const juridicoSalvo = notificacaoAtual?.dados?.etapa7?.juridico || 'nao';

        conteudo = `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                    <div style="background:#f3e8ff; padding:10px; border-radius:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 11l3 3L22 4"></path>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700;">Análise da Defesa / Cumprimento</h3>
                        <p style="margin:2px 0 0 0; color:#64748b; font-size:0.85rem;">Avalie se as exigências da notificação foram atendidas pelo munícipe.</p>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr; gap:20px;">
                    <div style="background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Houve Cumprimento? <span style="color:#ef4444;">*</span></label>
                        <select id="selectCumprimento" class="form-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b; transition:all 0.2s; outline:none; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                            <option value="">Selecione uma opção...</option>
                            <option value="atendida" ${defaultCumprimento === 'atendida' ? 'selected="selected"' : ''}>Sim (Atendida)</option>
                            <option value="vencida" ${defaultCumprimento === 'vencida' ? 'selected="selected"' : ''}>Não Houve Cumprimento (Vencida)</option>
                        </select>
                    </div>

                    <div style="background:#fef2f2; padding:16px; border-radius:10px; border:1px solid #fca5a5;">
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#991b1b; margin-bottom:8px;">Enviar notificação para o Jurídico?</label>
                        <select id="selectJuridico" class="form-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid #fca5a5; background:white; font-size:0.95rem; color:#7f1d1d; transition:all 0.2s; outline:none; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                            <option value="nao" ${juridicoSalvo === 'nao' ? 'selected' : ''}>Não</option>
                            <option value="sim" ${juridicoSalvo === 'sim' ? 'selected' : ''}>Sim, enviar para análise jurídica</option>
                        </select>
                        <p style="margin:6px 0 0 0; font-size:0.8rem; color:#b91c1c;">Se 'Sim' for selecionado, a notificação irá para o Jurídico independentemente do cumprimento.</p>
                    </div>
                </div>
            </div>
        `;
    } else if (etapaNum === 10) {
        const numNotificacao = notificacaoAtual ? notificacaoAtual.numero : '';
        const tipoNotificacao = notificacaoAtual ? notificacaoAtual.descricao : '';
        const decisaoEtapa7 = notificacaoAtual?.dados?.etapa7?.cumprimento;
        const decisaoEtapa13 = notificacaoAtual?.dados?.etapa13?.decisao;
        const decisaoEtapa11 = notificacaoAtual?.dados?.etapa11?.decisao;
        const passarCertidaoEtapa11 = notificacaoAtual?.dados?.etapa11?.passar_certidao;

        let selNao = 'selected';
        let selSim = '';
        if (decisaoEtapa7 === 'atendida' || decisaoEtapa13 === 'defere' || (decisaoEtapa11 === 'defere' && passarCertidaoEtapa11 !== false)) {
            selNao = '';
            selSim = 'selected';
        }

        let mensagemGerenteHtml = '';
        if (notificacaoAtual?.dados?.etapa11) {
            const e11 = notificacaoAtual.dados.etapa11;
            const dataDecisaoStr = e11.data_decisao ? new Date(e11.data_decisao).toLocaleString('pt-BR') : '';
            if (e11.decisao === 'indefere') {
                mensagemGerenteHtml = `
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-left: 6px solid #ef4444; border-radius: 12px; padding: 18px 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(239,68,68,0.06);">
                    <div style="display: flex; align-items: flex-start; gap: 14px;">
                        <div style="background: #fee2e2; padding: 10px; border-radius: 10px; flex-shrink: 0;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        </div>
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 6px 0; color: #991b1b; font-size: 1.05rem; font-weight: 700;">
                                Decisão do Gerente: INDEFERIDO
                            </h4>
                            <p style="margin: 0 0 8px 0; color: #7f1d1d; font-size: 0.9rem; font-weight: 500;">
                                O gerente analisou a defesa e decidiu pelo <strong>indeferimento</strong>.
                            </p>
                            <div style="background: white; padding: 12px 16px; border-radius: 8px; border: 1px solid #fca5a5; font-size: 0.88rem; color: #1e293b;">
                                <strong style="color: #991b1b;">Motivo / Justificativa do Gerente:</strong>
                                <p style="margin: 4px 0 0 0; color: #334155; white-space: pre-wrap;">${e11.justificativa || 'Sem justificativa informada.'}</p>
                            </div>
                            ${dataDecisaoStr ? `<span style="display: inline-block; margin-top: 8px; font-size: 0.78rem; color: #991b1b; font-weight: 600;">Data da Decisão: ${dataDecisaoStr}</span>` : ''}
                        </div>
                    </div>
                </div>
                `;
            } else if (e11.decisao === 'defere' && e11.passar_certidao) {
                mensagemGerenteHtml = `
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 6px solid #16a34a; border-radius: 12px; padding: 18px 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(22,163,74,0.06);">
                    <div style="display: flex; align-items: flex-start; gap: 14px;">
                        <div style="background: #dcfce7; padding: 10px; border-radius: 10px; flex-shrink: 0;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                        </div>
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 6px 0; color: #14532d; font-size: 1.05rem; font-weight: 700;">
                                Decisão do Gerente: DEFERIDO (Gerar Certidão de Encerramento)
                            </h4>
                            <p style="margin: 0 0 8px 0; color: #166534; font-size: 0.9rem; font-weight: 500;">
                                O gerente <strong>deferiu</strong> a defesa e solicitou passar pela emissão da Certidão de Encerramento antes de encerrar o processo.
                            </p>
                            <div style="background: white; padding: 12px 16px; border-radius: 8px; border: 1px solid #86efac; font-size: 0.88rem; color: #1e293b;">
                                <strong style="color: #14532d;">Motivo / Justificativa do Gerente:</strong>
                                <p style="margin: 4px 0 0 0; color: #334155; white-space: pre-wrap;">${e11.justificativa || 'Sem justificativa informada.'}</p>
                            </div>
                            ${dataDecisaoStr ? `<span style="display: inline-block; margin-top: 8px; font-size: 0.78rem; color: #14532d; font-weight: 600;">Data da Decisão: ${dataDecisaoStr}</span>` : ''}
                        </div>
                    </div>
                </div>
                `;
            }
        }

        conteudo = `
            ${mensagemGerenteHtml}
            <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                    <div style="background:#f3e8ff; padding:10px; border-radius:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700;">Certidão Sem Defesa / Encerramento</h3>
                        <p style="margin:2px 0 0 0; color:#64748b; font-size:0.85rem;">Emissão de certidão para notificação com prazo expirado ou encerramento após análise do gerente.</p>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">
                    <div>
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Nº da Notificação <span style="color:#ef4444;">*</span></label>
                        <input type="text" id="inputNumNotificacaoCertidao" class="form-input" value="${numNotificacao}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b;" />
                    </div>
                    <div>
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Tipo da Infração <span style="color:#ef4444;">*</span></label>
                        <input type="text" id="inputTipoInfracaoCertidao" class="form-input" value="${tipoNotificacao}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; color:#1e293b;" />
                    </div>
                </div>

                <div style="background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:20px; display:flex; flex-direction:column; gap:10px;">
                    <button type="button" onclick="gerarCertidaoSemDefesa()" style="padding:12px 20px; background:#10b981; color:white; border:none; border-radius:8px; font-weight:600; font-size:1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 6px -1px rgba(16, 185, 129, 0.2); transition:all 0.2s;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Atualizar Certidão
                    </button>
                    <p style="margin:0; font-size:0.8rem; color:#64748b; text-align:center;">O documento puxará automaticamente os dados do Autuado, Imóvel e Vistoria cadastrados.</p>
                </div>
                
                <div style="background:#fef2f2; padding:16px; border-radius:10px; border:1px solid #fca5a5;">
                    <label style="display:block; font-size:0.9rem; font-weight:600; color:#991b1b; margin-bottom:8px;">O problema foi resolvido?</label>
                    <select id="selectResolvidoCertidao" class="form-input" style="width:100%; padding:10px; border-radius:8px; border:1px solid #fca5a5; background:white; font-size:0.95rem; color:#7f1d1d;">
                        <option value="nao" ${selNao}>Não, gerar Auto de Infração</option>
                        <option value="sim" ${selSim}>Sim, o problema foi sanado</option>
                    </select>
                </div>

                ${typeof window.obterHtmlBlocoCertidaoAssinada === 'function' ? window.obterHtmlBlocoCertidaoAssinada() : ''}
            </div>
        `;
    } else if (etapaNum === 14) {
        if (notificacaoAtual && notificacaoAtual.status !== 'auto_infracao' && notificacaoAtual.status !== 'encerrada') {
            notificacaoAtual.dados = notificacaoAtual.dados || {};
            if (!notificacaoAtual.dados.status_anterior_auto_infracao) {
                notificacaoAtual.dados.status_anterior_auto_infracao = notificacaoAtual.status || 'pendente_vencida';
            }
            notificacaoAtual.status = 'auto_infracao';
            atualizarNotificacaoNoBanco(notificacaoAtual.id, { status: 'auto_infracao', dados: notificacaoAtual.dados }).catch(err => console.warn(err));
        }
        const numNotificacao = notificacaoAtual ? notificacaoAtual.numero : (processoAtual.numero_processo || 'Desconhecido');
        const tipoInfracao = notificacaoAtual?.descricao || processoAtual?.dados?.fiscal?.infracao || 'Limpeza de Quintal';

        conteudo = `
            <div style="background:white; border:1px solid #DED9E2; border-radius:12px; padding:24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">
                    <div>
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Nº da Notificação Preliminar</label>
                        <input type="text" id="inputNumNotifAutoInfracao" class="form-input" value="${numNotificacao}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #DED9E2; background:#F7F4EA; font-size:0.95rem; color:#1e293b;" readonly />
                    </div>
                    <div>
                        <label style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin-bottom:8px;">Infração Constatada</label>
                        <input type="text" id="inputInfracaoAutoInfracao" class="form-input" value="${tipoInfracao}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #DED9E2; background:white; font-size:0.95rem; color:#1e293b;" />
                    </div>
                </div>

                <div style="background:#F0F4FA; border:1px solid #C0B9DD; padding:16px; border-radius:10px; margin-bottom:20px; display:flex; flex-direction:column; gap:10px;">
                    <button type="button" onclick="gerarAutoDeInfracao()" style="padding:12px 20px; background:#80A1D4; color:white; border:none; border-radius:8px; font-weight:600; font-size:1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 12px rgba(128, 161, 212, 0.3); transition:all 0.2s;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Atualizar Auto de Infração
                    </button>
                    <p style="margin:0; font-size:0.8rem; color:#475569; text-align:center;">O documento será gerado com cabeçalho oficial da SEMAC, numeração sequencial própria e penalidades legais.</p>
                </div>

                ${obterHtmlBlocoAutoInfracaoAssinado()}

                <div style="background:#FFF9EB; padding:14px; border-radius:10px; border:1px solid #F6D58E; color:#996B00; font-size:0.88rem; display:flex; align-items:center; gap:10px; margin-top:20px;">
                    <span>ℹ️</span>
                    <span>Ao clicar em <strong>"Avançar Etapa"</strong>, o Auto de Infração Assinado será validado e o processo seguirá automaticamente para a <strong>Etapa 15 (Gerente Gera a Multa)</strong>.</span>
                </div>
            </div>
        `;
    } else if (etapaNum === 33 || (notificacaoAtual && notificacaoAtual.status === 'encerrada')) {
        const numNotificacao = notificacaoAtual ? notificacaoAtual.numero : 'Desconhecido';
        const hist = notificacaoAtual?.dados?.historico || [];

        let encerramento = hist.slice().reverse().find(h => h.etapa_para === 'encerrada' || h.status === 'encerrada' || (h.condicao && h.condicao.toLowerCase().includes('encerramento')));
        const dataEnc = encerramento ? new Date(encerramento.data).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
        const usuEnc = encerramento ? encerramento.usuario : (perfilAtual?.nome || 'Sistema');

        let histHtml = '';
        if (hist.length > 0) {
            histHtml = '<table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:0.85rem;">' +
                '<tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1;"><th style="padding:8px; text-align:left;">Data</th><th style="padding:8px; text-align:left;">De ➔ Para</th><th style="padding:8px; text-align:left;">Ação / Status</th><th style="padding:8px; text-align:left;">Usuário</th></tr>' +
                hist.map(h => `<tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:8px;">${new Date(h.data).toLocaleDateString('pt-BR')}</td>
                    <td style="padding:8px;">Etapa ${h.etapa_de} ➔ ${h.etapa_para}</td>
                    <td style="padding:8px;"><b>${h.status || '-'}</b><br><span style="color:#64748b; font-size:0.75rem;">${h.condicao || ''}</span></td>
                    <td style="padding:8px;">${h.usuario || '-'}</td>
                </tr>`).join('') + '</table>';
        } else {
            histHtml = '<p style="color:#64748b; font-size:0.9rem;">Nenhum histórico registrado para esta notificação.</p>';
        }

        conteudo = `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:24px; border-bottom:1px solid #e2e8f0; padding-bottom:16px;">
                    <div style="background:#dcfce7; padding:12px; border-radius:12px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h2 style="margin:0; color:#1e293b; font-size:1.4rem; font-weight:800;">Notificação Encerrada: ${numNotificacao}</h2>
                        <p style="margin:4px 0 0 0; color:#166534; font-size:0.95rem; font-weight:600;">Esta notificação foi finalizada por <b>${usuEnc}</b> em <b>${dataEnc}</b>.</p>
                    </div>
                </div>

                <!-- Painel de Arquivos Gerados -->
                <div style="background:#f8fafc; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:24px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; border-bottom:2px solid #cbd5e1; padding-bottom:12px; flex-wrap:wrap; gap:12px;">
                        <div>
                            <h3 style="margin:0; color:#0f172a; font-size:1.1rem; font-weight:700;">Arquivos e Relatórios do Processo</h3>
                            <p style="margin:2px 0 0 0; color:#64748b; font-size:0.83rem;">Baixe cada documento individualmente ou faça o download de todos os arquivos do processo em um pacote ZIP.</p>
                        </div>
                        <button type="button" onclick="gerarZipComTodosDocumentos()" style="padding:10px 18px; background:linear-gradient(135deg, #1e40af, #2563eb); color:white; border:none; border-radius:8px; font-weight:700; font-size:0.88rem; cursor:pointer; box-shadow:0 2px 4px rgba(37,99,235,0.2); transition:all 0.2s; display:flex; align-items:center; gap:8px;">
                            📦 Baixar Pacote de Documentos (.ZIP)
                        </button>
                    </div>
                    <div id="gridArquivosEtapa29" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
                        <p style="color:#64748b; font-size:0.9rem; margin:0;">Carregando documentos assinados...</p>
                    </div>
                </div>

                <!-- Histórico Visual na Tela -->
                <div style="background:#f8fafc; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:10px;">
                    <h3 style="margin:0 0 12px 0; color:#0f172a; font-size:1.1rem; border-bottom:2px solid #cbd5e1; padding-bottom:8px;">Relatório - Etapas que o processo passou</h3>
                    ${histHtml}
                </div>
            </div>
        `;
    } else if (etapaNum === 29) {
        const numNotificacao = notificacaoAtual ? notificacaoAtual.numero : 'Desconhecido';
        const hist = notificacaoAtual?.dados?.historico || [];

        let histHtml = '';
        if (hist.length > 0) {
            histHtml = '<table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:0.85rem;">' +
                '<tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1;"><th style="padding:8px; text-align:left;">Data</th><th style="padding:8px; text-align:left;">De ➔ Para</th><th style="padding:8px; text-align:left;">Ação / Status</th><th style="padding:8px; text-align:left;">Usuário</th></tr>' +
                hist.map(h => `<tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:8px;">${new Date(h.data).toLocaleDateString('pt-BR')}</td>
                    <td style="padding:8px;">Etapa ${h.etapa_de} ➔ ${h.etapa_para}</td>
                    <td style="padding:8px;"><b>${h.status || '-'}</b><br><span style="color:#64748b; font-size:0.75rem;">${h.condicao || ''}</span></td>
                    <td style="padding:8px;">${h.usuario || '-'}</td>
                </tr>`).join('') + '</table>';
        } else {
            histHtml = '<p style="color:#64748b; font-size:0.9rem;">Nenhum histórico registrado para esta notificação.</p>';
        }

        conteudo = `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:24px; border-bottom:1px solid #e2e8f0; padding-bottom:16px;">
                    <div style="background:#dcfce7; padding:12px; border-radius:12px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h2 style="margin:0; color:#1e293b; font-size:1.4rem; font-weight:800;">Encerramento da Notificação: ${numNotificacao}</h2>
                        <p style="margin:4px 0 0 0; color:#64748b; font-size:0.95rem;">Verifique os documentos e o relatório de etapas antes de concluir definitivamente.</p>
                    </div>
                </div>

                <!-- Painel de Arquivos Gerados -->
                <div style="background:#f8fafc; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:24px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; border-bottom:2px solid #cbd5e1; padding-bottom:12px; flex-wrap:wrap; gap:12px;">
                        <div>
                            <h3 style="margin:0; color:#0f172a; font-size:1.1rem; font-weight:700;">Arquivos e Relatórios do Processo</h3>
                            <p style="margin:2px 0 0 0; color:#64748b; font-size:0.83rem;">Baixe cada documento individualmente ou faça o download de todos os arquivos do processo em um pacote ZIP.</p>
                        </div>
                        <button type="button" onclick="gerarZipComTodosDocumentos()" style="padding:10px 18px; background:linear-gradient(135deg, #1e40af, #2563eb); color:white; border:none; border-radius:8px; font-weight:700; font-size:0.88rem; cursor:pointer; box-shadow:0 2px 4px rgba(37,99,235,0.2); transition:all 0.2s; display:flex; align-items:center; gap:8px;">
                            📦 Baixar Pacote de Documentos (.ZIP)
                        </button>
                    </div>
                    <div id="gridArquivosEtapa29" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
                        <p style="color:#64748b; font-size:0.9rem; margin:0;">Carregando documentos assinados...</p>
                    </div>
                </div>

                <!-- Histórico Visual na Tela -->
                <div style="background:#f8fafc; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:32px;">
                    <h3 style="margin:0 0 12px 0; color:#0f172a; font-size:1.1rem; border-bottom:2px solid #cbd5e1; padding-bottom:8px;">Relatório - Etapas que o processo passou</h3>
                    ${histHtml}
                </div>

                <!-- Botão Gigante de Encerramento -->
                <div style="background:#f0fdf4; padding:32px; border:2px dashed #86efac; border-radius:16px; display:flex; flex-direction:column; align-items:center;">
                    <h3 style="margin:0 0 16px 0; color:#166534; font-size:1.3rem; text-align:center;">Deseja encerrar esta Notificação definitivamente?</h3>
                    <button type="button" onclick="finalizarEBaixarZipNotificacao()" style="padding:16px 36px; background:#16a34a; color:white; border:none; border-radius:12px; font-weight:800; font-size:1.15rem; cursor:pointer; display:flex; align-items:center; gap:10px; box-shadow:0 8px 20px rgba(22, 163, 74, 0.35); transition:all 0.2s;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        Sim, Encerrar Notificação Definitivamente
                    </button>
                    <p style="margin:14px 0 0 0; color:#15803d; font-size:0.88rem; font-weight:600; text-align:center;">Atenção: Ao clicar acima, a notificação será marcada como encerrada no sistema.</p>
                </div>
            </div>
        `;
    }

    formDiv.innerHTML = conteudo;
    setTimeout(() => { if (window.atualizarInterfaceNotificacoes) window.atualizarInterfaceNotificacoes(); }, 150);

    if ([5, 13].includes(etapaNum)) {
        setTimeout(() => {
            if (typeof window.configurarEventosReplicaAssinada === 'function') window.configurarEventosReplicaAssinada();
            if (typeof window.carregarEExibirAnexoReplicaAssinada === 'function') window.carregarEExibirAnexoReplicaAssinada();
        }, 150);
    }

    if (etapaNum === 10) {
        setTimeout(() => {
            if (typeof window.gerarCertidaoSemDefesa === 'function') window.gerarCertidaoSemDefesa(true);
            if (typeof window.configurarEventosCertidaoAssinada === 'function') window.configurarEventosCertidaoAssinada();
            if (typeof window.carregarEExibirAnexoCertidaoAssinada === 'function') window.carregarEExibirAnexoCertidaoAssinada();
        }, 150);
    }

    if (etapaNum === 14) {
        setTimeout(() => {
            if (typeof window.gerarAutoDeInfracao === 'function') window.gerarAutoDeInfracao(true);
            if (typeof window.configurarEventosAIAssinado === 'function') window.configurarEventosAIAssinado();
            if (typeof window.carregarEExibirAnexoAIAssinado === 'function') window.carregarEExibirAnexoAIAssinado();
        }, 150);
    }

    if (etapaNum === 29 || etapaNum === 33 || notificacaoAtual?.status === 'encerrada') {
        setTimeout(() => {
            const containerDoc = document.getElementById('containerDocumentoOficial');
            if (containerDoc) containerDoc.innerHTML = '';
            if (typeof window.carregarArquivosEtapa29 === 'function') window.carregarArquivosEtapa29();
        }, 150);
    }

    const areaDrop = formDiv.querySelector('#areaDropGenerico');
    const inputAnexo = formDiv.querySelector('#inputAnexoGenerico');
    if (areaDrop && inputAnexo) {
        const salvarAnexosGenericosDb = async () => {
            let error;
            if (notificacaoAtual) {
                const res = await supabaseClient.from('notificacoes').update({ dados: notificacaoAtual.dados }).eq('id', notificacaoAtual.id);
                error = res.error;
            } else {
                processoAtual.dados = processoAtual.dados || {};
                processoAtual.dados.campos = processoAtual.campos;
                const res = await supabaseClient.from('processos').update({ dados: processoAtual.dados }).eq('id', processoAtual.id);
                error = res.error;
            }
            if (error) {
                console.error('Erro ao salvar anexos', error);
                alert('Erro ao atualizar anexos no banco de dados.');
            }
        };

        const renderizarListaAnexos = () => {
            const listaDiv = formDiv.querySelector('#listaAnexosGenericos');
            listaDiv.innerHTML = '';

            const etapaKey = `etapa${etapaNum}`;
            const targetObj = notificacaoAtual ? (notificacaoAtual.dados = notificacaoAtual.dados || {}) : (processoAtual.campos = processoAtual.campos || {});
            targetObj[etapaKey] = targetObj[etapaKey] || {};

            let anexos = targetObj[etapaKey].anexos || [];

            // Migrar anexo legado único para array
            const anexoAntigo = targetObj[etapaKey].anexo;
            if (anexoAntigo && anexos.length === 0) {
                anexoAntigo.id = anexoAntigo.id || Math.random().toString(36).substring(7);
                anexos.push(anexoAntigo);
                targetObj[etapaKey].anexos = anexos;
                delete targetObj[etapaKey].anexo;
                salvarAnexosGenericosDb();
            }

            if (anexos.length === 0) {
                listaDiv.innerHTML = '<span style="font-size:0.9rem; color:#6d28d9; background: #ede9fe; padding: 4px 10px; border-radius: 12px; display: inline-block; width:fit-content; margin:0 auto;">Nenhum arquivo selecionado</span>';
                return;
            }

            anexos.forEach((a, i) => {
                const item = document.createElement('div');
                item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:10px 14px; border-radius:8px; border:1px solid #cbd5e1;';
                item.innerHTML = `
                    <span style="font-size:0.9rem; color:#334155; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:65%;" title="${a.nome}">${a.nome}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <button type="button" class="btn-ver-anexo" data-index="${i}" style="padding:4px 10px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; font-weight:600; font-size:0.8rem; cursor:pointer;">Visualizar</button>
                        <button type="button" class="btn-excluir-anexo" data-index="${i}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; font-size:1.2rem; line-height:1; padding:0 5px;" title="Remover anexo">×</button>
                    </div>
                `;
                listaDiv.appendChild(item);
            });

            listaDiv.querySelectorAll('.btn-ver-anexo').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const idx = e.target.getAttribute('data-index');
                    const targetAnexo = anexos[idx];
                    if (!targetAnexo) return;

                    let content = targetAnexo.base64 || targetAnexo.url || targetAnexo.dataUrl;

                    if (!content && (targetAnexo.documento_id || targetAnexo.id)) {
                        const docId = targetAnexo.documento_id || targetAnexo.id;
                        try {
                            const { data } = await supabaseClient
                                .from('documentos')
                                .select('url')
                                .eq('id', docId)
                                .maybeSingle();
                            if (data && data.url) {
                                content = data.url;
                            }
                        } catch (errDoc) {
                            console.error('Erro ao buscar documento em documentos:', errDoc);
                        }
                    }

                    if (content) {
                        window.abrirAnexoEmNovaAba(content, e, targetAnexo.nome);
                    } else {
                        alert('Conteúdo do arquivo não disponível.');
                    }
                });
            });

            listaDiv.querySelectorAll('.btn-excluir-anexo').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const idx = e.target.getAttribute('data-index');
                    const targetAnexo = anexos[idx];
                    if (confirm('Tem certeza que deseja remover este anexo?')) {
                        if (targetAnexo && (targetAnexo.documento_id || targetAnexo.id)) {
                            const docId = targetAnexo.documento_id || targetAnexo.id;
                            try {
                                await supabaseClient.from('documentos').delete().eq('id', docId);
                            } catch (errDel) {
                                console.error('Erro ao remover registro da tabela documentos:', errDel);
                            }
                        }
                        anexos.splice(idx, 1);
                        await salvarAnexosGenericosDb();
                        renderizarListaAnexos();
                    }
                });
            });
        };

        const preventDefaults = (e) => { e.preventDefault(); e.stopPropagation(); };
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
            areaDrop.addEventListener(evt, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(evt => {
            areaDrop.addEventListener(evt, () => areaDrop.style.background = '#ede9fe', false);
        });

        ['dragleave', 'drop'].forEach(evt => {
            areaDrop.addEventListener(evt, () => areaDrop.style.background = '#f5f3ff', false);
        });

        areaDrop.addEventListener('drop', (e) => {
            let dt = e.dataTransfer;
            let files = dt.files;
            if (files && files.length > 0) {
                inputAnexo.files = files;
                inputAnexo.dispatchEvent(new Event('change'));
            }
        });

        areaDrop.addEventListener('click', (e) => {
            if (e.target !== inputAnexo && !e.target.closest('button')) inputAnexo.click();
        });

        inputAnexo.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;

            const listaDiv = formDiv.querySelector('#listaAnexosGenericos');
            listaDiv.innerHTML = '<div style="text-align:center; color:#64748b; font-size:0.9rem;">Carregando arquivo(s)...</div>';

            const readPromises = files.map(file => new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve({
                    id: Math.random().toString(36).substring(7),
                    nome: file.name,
                    tipo: file.type,
                    dataUrl: ev.target.result,
                    data_upload: new Date().toISOString()
                });
                reader.readAsDataURL(file);
            }));

            const newAnexos = await Promise.all(readPromises);

            const etapaKey = `etapa${etapaNum}`;
            const targetObj = notificacaoAtual ? (notificacaoAtual.dados = notificacaoAtual.dados || {}) : (processoAtual.campos = processoAtual.campos || {});
            targetObj[etapaKey] = targetObj[etapaKey] || {};
            targetObj[etapaKey].anexos = targetObj[etapaKey].anexos || [];

            const anexosAtuais = targetObj[etapaKey].anexos;

            // Tratamento específico para Etapas 3 e 4: Salva o arquivo na tabela 'documentos'
            if (etapaNum === 3 || etapaNum === 4) {
                const rotuloCarregamento = etapaNum === 3 ? 'Salvando defesa(s) em documentos...' : 'Salvando comprovante(s) em documentos...';
                mostrarCarregamento(rotuloCarregamento);
                const perfilId = (typeof perfilAtual !== 'undefined' && perfilAtual?.id) ? perfilAtual.id : null;
                const tipoDoc = etapaNum === 3
                    ? 'Defesa'
                    : ((notificacaoAtual?.status === 'dilacao') ? 'Comprovante de Renda/Propriedade' : 'Comprovante de Propriedade');

                const anexosParaSalvar = [];

                for (const itemFile of newAnexos) {
                    const existe = anexosAtuais.some(a => a.nome === itemFile.nome);
                    if (existe) {
                        alert(`O arquivo "${itemFile.nome}" já foi anexado. Ele não será adicionado novamente.`);
                        continue;
                    }

                    try {
                        const { data: docIns, error: errDoc } = await supabaseClient
                            .from('documentos')
                            .insert([{
                                processo_id: processoAtual.id,
                                notificacao_id: notificacaoAtual?.id || null,
                                etapa_id: etapaNum,
                                tipo: tipoDoc,
                                nome_arquivo: itemFile.nome,
                                url: itemFile.dataUrl,
                                mime_type: itemFile.tipo,
                                gerado_automaticamente: false,
                                usuario_id: perfilId
                            }])
                            .select('id')
                            .single();

                        if (errDoc) throw errDoc;

                        // Guarda apenas a referência (ID do documento) no JSON da notificação
                        anexosParaSalvar.push({
                            id: docIns.id,
                            documento_id: docIns.id,
                            nome: itemFile.nome,
                            tipo: itemFile.tipo,
                            tipo_documento: tipoDoc,
                            data_upload: itemFile.data_upload
                        });
                    } catch (errIns) {
                        console.error(`Erro ao salvar documento da Etapa ${etapaNum} em documentos:`, errIns);
                        alert(`Erro ao salvar o arquivo "${itemFile.nome}" na tabela de documentos.`);
                    }
                }

                if (anexosParaSalvar.length > 0) {
                    targetObj[etapaKey].anexos = [...anexosAtuais, ...anexosParaSalvar];
                    await salvarAnexosGenericosDb();
                }
                ocultarCarregamento();
                renderizarListaAnexos();
                return;
            }

            const anexosFiltrados = newAnexos.filter(newAnexo => {
                const existe = anexosAtuais.some(a => a.nome === newAnexo.nome);
                if (existe) {
                    alert(`O arquivo "${newAnexo.nome}" já foi anexado. Ele não será adicionado novamente.`);
                }
                return !existe;
            });

            if (anexosFiltrados.length > 0) {
                targetObj[etapaKey].anexos = [...anexosAtuais, ...anexosFiltrados];
                await salvarAnexosGenericosDb();
            }
            renderizarListaAnexos();
        });

        renderizarListaAnexos();
    }

    if (etapaNum === 10) {
        setTimeout(() => {
            if (typeof window.gerarCertidaoSemDefesa === 'function') {
                window.gerarCertidaoSemDefesa(true);
            }
            const inpNum = formDiv.querySelector('#inputNumNotificacaoCertidao');
            const inpTipo = formDiv.querySelector('#inputTipoInfracaoCertidao');
            const selectRes = formDiv.querySelector('#selectResolvidoCertidao');
            if (inpNum) inpNum.addEventListener('input', () => window.gerarCertidaoSemDefesa(true));
            if (inpTipo) inpTipo.addEventListener('input', () => window.gerarCertidaoSemDefesa(true));
            if (selectRes) selectRes.addEventListener('change', () => window.gerarCertidaoSemDefesa(true));
        }, 150);
    }

    if (etapaNum === 14) {
        setTimeout(() => {
            if (typeof window.gerarAutoDeInfracao === 'function') {
                window.gerarAutoDeInfracao(true);
            }
            const inpInfr = formDiv.querySelector('#inputInfracaoAutoInfracao');
            if (inpInfr) inpInfr.addEventListener('input', () => window.gerarAutoDeInfracao(true));
        }, 150);
    }
}

// Renderiza processo cancelado em modo de visualização limpa.
async function renderizarProcessoCancelado(proc) {
    // Oculta elementos de ação/edicação
    const stepper = document.querySelector('.process-stepper-bar');
    const pageTabs = document.querySelector('.page-tabs');
    const tabEditar = document.getElementById('tabEditarProcesso');
    const painelAcoes = document.getElementById('painelAcoesEtapa1');
    const btnAvancar = document.getElementById('btnAvancarEtapa');
    const btnVoltar = document.getElementById('btnVoltarEtapa');
    const btnCancelar = document.getElementById('btnCancelarProcesso');
    const acoesTopbar = document.querySelector('.etapa-actions');

    if (stepper) stepper.style.display = 'none';
    if (pageTabs) pageTabs.style.display = 'none';
    if (tabEditar) tabEditar.style.display = 'none';
    if (painelAcoes) painelAcoes.style.display = 'none';
    if (btnAvancar) btnAvancar.style.display = 'none';
    if (btnVoltar) btnVoltar.style.display = 'none';
    if (btnCancelar) btnCancelar.style.display = 'none';
    if (acoesTopbar) acoesTopbar.style.display = 'none';

    // Garante que a aba do documento oficial esteja visível
    const tabDocumento = document.getElementById('tabDocumentoOficial');
    const tabContent = document.querySelector('.tab-content-box');
    if (tabDocumento) tabDocumento.style.display = 'block';
    if (tabContent) tabContent.style.display = 'block';

    // Renderiza documento oficial
    await renderizarPainelEtapa1(proc);
    renderizarDocumentoOficial(proc);

    // Adiciona aviso visual de cancelado no topo do documento
    const containerDoc = document.getElementById('containerDocumentoOficial');
    if (containerDoc) {
        let aviso = document.getElementById('avisoProcessoCancelado');
        if (!aviso) {
            aviso = document.createElement('div');
            aviso.id = 'avisoProcessoCancelado';
            aviso.style.cssText = 'background:#fee2e2; color:#991b1b; border:2px dashed #ef4444; border-radius:12px; padding:16px 20px; margin-bottom:20px; font-weight:700; text-align:center; font-size:1.05rem;';
            containerDoc.parentNode.insertBefore(aviso, containerDoc);
        }
        aviso.textContent = `⚠️ Processo Cancelado — Nº ${proc.numero_processo || 'S/N'}`;
    }

    restaurarEstadoSidebarEtapa();
    carregarUsuarioSidebarEtapa();
}

function mostrarModalSelecaoNotificacao(proc) {
    const modal = document.getElementById('modalSelecionarNotificacao');
    const lista = document.getElementById('listaOpcoesNotificacao');
    if (!modal || !lista) return;

    const notificacoes = obterNotificacoesProcesso(proc);
    lista.innerHTML = '';

    notificacoes.forEach((n, idx) => {
        if (n.status === 'atendida') return;

        const btn = document.createElement('button');
        btn.style.cssText = 'text-align:left; padding:14px 16px; border:1px solid #e2e8f0; border-radius:12px; background:white; cursor:pointer; transition:all 0.2s; display:flex; justify-content:space-between; align-items:center;';
        btn.innerHTML = `
            <div>
                <div style="font-weight:600; color:#0f172a; font-size:0.98rem;">${n.numero}</div>
                <div style="font-size:0.85rem; color:#64748b; margin-top:2px;">${n.descricao}</div>
            </div>
            <span style="background:#e0e7ff; color:#3730a3; padding:4px 10px; border-radius:8px; font-size:0.78rem; font-weight:600;">Etapa ${n.etapa_atual || 2}</span>
        `;
        btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#7c3aed'; btn.style.background = '#f5f3ff'; });
        btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#e2e8f0'; btn.style.background = 'white'; });
        btn.addEventListener('click', () => {
            const url = new URL(window.location.href);
            url.searchParams.set('notificacao', idx);
            window.location.search = url.search;
        });
        lista.appendChild(btn);
    });

    modal.style.display = 'flex';
}

// ── Carregar Dados do Processo no Supabase ────────────────────────────────
async function carregarProcessoCompleto(processoId) {
    try {
        const { data: proc, error } = await supabaseClient
            .from('processos')
            .select('*, etapas(numero, nome)')
            .eq('id', processoId)
            .single();

        if (error || !proc) {
            console.error('Erro ao carregar processo:', error);
            alert('Não foi possível carregar o processo.');
            return;
        }

        // Buscar infrações vinculadas na tabela de relacionamento processo_infracoes
        try {
            const { data: relInfracoes } = await supabaseClient
                .from('processo_infracoes')
                .select('infracao_id, infracoes_catalogo(codigo, descricao)')
                .eq('processo_id', processoId);

            if (relInfracoes && relInfracoes.length > 0) {
                proc.infracoes_lista = relInfracoes
                    .map(r => r.infracoes_catalogo ? `${r.infracoes_catalogo.descricao} | ${r.infracoes_catalogo.codigo}` : null)
                    .filter(Boolean);
            }
        } catch (e) {
            console.warn('Não foi possível carregar lista de processo_infracoes:', e);
        }

        // Buscar valor atual da UPFMD do banco de dados (tabela configuracoes_upfmd)
        try {
            const { data: cfgUpfmd, error: errCfg } = await supabaseClient
                .from('configuracoes_upfmd')
                .select('valor')
                .order('created_at', { ascending: false })
                .limit(1);

            if (cfgUpfmd && cfgUpfmd.length > 0 && cfgUpfmd[0].valor) {
                valorUpfmdAtual = parseFloat(cfgUpfmd[0].valor) || 103.00;
            }
        } catch (e) {
            console.warn('Usando UPFMD padrão 103.00:', e);
        }

        proc.dados = proc.dados || {};
        proc.campos = proc.campos || proc.dados.campos || {};

        // Carregar notificações da tabela (com migração automática de JSONB legado)
        let notificacoesBanco = await carregarNotificacoesDoBanco(processoId);
        notificacoesBanco = await migrarNotificacoesLegadas(proc, notificacoesBanco);
        proc.notificacoes = notificacoesBanco || [];

        // Tenta associar notificação se houver na URL
        const params = new URLSearchParams(window.location.search);
        const notificacaoParam = params.get('notificacao');
        if (notificacaoParam !== null && proc.notificacoes && proc.notificacoes.length > 0) {
            const parsed = parseInt(notificacaoParam, 10);
            if (!isNaN(parsed) && proc.notificacoes[parsed]) {
                notificacaoAtual = proc.notificacoes[parsed];
                proc.notificacaoSelecionada = parsed;
            } else {
                const foundIdx = proc.notificacoes.findIndex(n =>
                    String(n.id) === String(notificacaoParam) ||
                    String(n.notificacao_id) === String(notificacaoParam) ||
                    String(n.numero) === String(notificacaoParam) ||
                    String(n.numero_notificacao) === String(notificacaoParam)
                );
                if (foundIdx !== -1) {
                    notificacaoAtual = proc.notificacoes[foundIdx];
                    proc.notificacaoSelecionada = foundIdx;
                } else {
                    notificacaoAtual = null;
                }
            }
        } else {
            notificacaoAtual = null;
        }

        // O campo etapa_atual_id é o ID interno da tabela etapas; usamos o número para renderização.
        const etapaRelacionada = notificacaoAtual ? (Array.isArray(notificacaoAtual.etapas) ? notificacaoAtual.etapas[0] : notificacaoAtual.etapas) : (Array.isArray(proc.etapas) ? proc.etapas[0] : proc.etapas);
        const etapaAtual = notificacaoAtual
            ? parseInt(etapaRelacionada?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
            : parseInt(etapaRelacionada?.numero || proc.etapa_atual || proc.etapa_atual_id || 1, 10);

        proc.etapa_atual = etapaAtual;
        if (notificacaoAtual) proc.etapa_atual_id = notificacaoAtual.etapa_atual_id || etapaAtual;

        // Marca a notificação como lida automaticamente ao abrir a página do processo
        let alterouLida = false;
        if (notificacaoAtual?.dados?.notificacoes_menu) {
            notificacaoAtual.dados.notificacoes_menu.forEach(n => {
                if (!n.lida) { n.lida = true; alterouLida = true; }
            });
        }
        if (proc?.dados?.notificacoes_menu) {
            proc.dados.notificacoes_menu.forEach(n => {
                if (!n.lida) { n.lida = true; alterouLida = true; }
            });
        }
        if (proc?.notificacoes) {
            proc.notificacoes.forEach(sub => {
                if (sub?.dados?.notificacoes_menu) {
                    sub.dados.notificacoes_menu.forEach(n => {
                        if (!n.lida) { n.lida = true; alterouLida = true; }
                    });
                }
            });
        }

        processoAtual = proc;
        if (alterouLida && typeof salvarNotificacoesMenuNoBanco === 'function') {
            salvarNotificacoesMenuNoBanco();
        }
        console.log('[DEBUG] carregarProcessoCompleto — etapa_atual_id:', proc.etapa_atual_id, '| etapa_atual:', proc.etapa_atual, '| etapas:', proc.etapas);

        preencherCabecalhoPagina(proc);
        console.log('[DEBUG PAINEL] etapaAtual:', etapaAtual, '| vai renderizar painel?', (etapaAtual !== 2 && etapaAtual !== 16 && etapaAtual !== 17 && etapaAtual !== 30));
        if (etapaAtual !== 2 && etapaAtual !== 16 && etapaAtual !== 17 && etapaAtual !== 30) {
            preencherFormularioEdicao(proc);
            renderizarDocumentoOficial(proc);
        }
    } catch (err) {
        console.error('Erro geral ao carregar processo:', err);
    }
}

// ── Carregar Perfil do Usuário Logado ─────────────────────────────────────
async function carregarPerfilUsuario() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.href = 'index.html';
            return;
        }

        let { data: usuario } = await supabaseClient
            .from('profiles')
            .select('id, nome, cargo, matricula, cpf, auth_id')
            .eq('auth_id', session.user.id)
            .maybeSingle();

        if (!usuario && session.user.email) {
            const cpfLimpo = session.user.email.split('@')[0].replace(/\D/g, '');
            if (cpfLimpo) {
                let res = await supabaseClient
                    .from('profiles')
                    .select('id, nome, cargo, matricula, cpf, auth_id')
                    .eq('cpf', cpfLimpo)
                    .maybeSingle();
                if (!res.data && cpfLimpo.length === 11) {
                    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                    res = await supabaseClient
                        .from('profiles')
                        .select('id, nome, cargo, matricula, cpf, auth_id')
                        .eq('cpf', cpfFormatado)
                        .maybeSingle();
                }
                usuario = res.data;
            }
        }

        perfilAtual = usuario || { nome: 'Usuário', cargo: 'Fiscal de Postura' };
        window.currentUserProfile = perfilAtual;
    } catch (err) {
        console.error('Erro ao carregar perfil:', err);
        perfilAtual = { nome: 'Usuário', cargo: 'Fiscal de Postura' };
        window.currentUserProfile = perfilAtual;
    }
}

function normalizarCargo(cargo) {
    if (!cargo) return 'Fiscal de Postura';
    const limpo = cargo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (limpo.includes('interface') || (limpo.includes('gerente') && limpo.includes('juridic'))) return 'Gerente de Interface Jurídica';
    if (limpo.includes('administrativo')) return 'Administrativo de Posturas';
    if (limpo.includes('fiscal')) return 'Fiscal de Postura';
    if (limpo.includes('gerente')) return 'Gerente';
    if (limpo.includes('secretario') || limpo.includes('secretário')) return 'Secretário';
    if (limpo.includes('juridico') || limpo.includes('jurídico')) return 'Jurídico';
    if (limpo.includes('fazenda')) return 'Fazenda';
    return cargo;
}

function determinarModoAcesso(proc, perfil) {
    if (!proc || !perfil) return MODO_ACESSO.LEITURA_NOTIFICACAO;

    const cargo = normalizarCargo(perfil.cargo);
    const etapaAtual = parseInt(proc.etapa_atual || proc.etapa_atual_id || 1, 10);
    const isCriador = perfil.id && proc.fiscal_id && perfil.id === proc.fiscal_id;

    // Etapa 1.2 (Retorno do AR) é exclusiva do Administrativo de Posturas.
    // Qualquer outro cargo visualiza apenas o PDF da Notificação Preliminar.
    if (etapaAtual === 16 && cargo !== 'Administrativo de Posturas') {
        return MODO_ACESSO.LEITURA_NOTIFICACAO;
    }

    // Fiscal de Posturas que NÃO é o criador: só visualiza a notificação
    if (cargo === 'Fiscal de Postura' && !isCriador) {
        return MODO_ACESSO.LEITURA_NOTIFICACAO;
    }

    // Outros cargos: edição só se a etapa atual estiver no mapa do cargo
    const etapasPermitidas = ETAPAS_POR_CARGO[cargo] || [];
    if (etapasPermitidas.includes(etapaAtual)) {
        return MODO_ACESSO.NORMAL;
    }

    return MODO_ACESSO.VISUALIZACAO_COMPLETA;
}

// ── Aplicar Modo de Acesso na Interface ───────────────────────────────────
function aplicarModoAcesso(modo) {
    const etapaAtual = parseInt(processoAtual?.etapa_atual || processoAtual?.etapa_atual_id || 1, 10);
    const ehEtapa16 = etapaAtual === 16;

    const abas = document.querySelector('.page-tabs');
    const painelAcoes = document.getElementById('painelAcoesEtapa1');
    const btnSalvar = document.getElementById('btnSalvarEdicaoProcesso');
    const stepperPadrao = document.querySelector('.process-stepper-bar:not(#stepperEtapa16)');

    if (modo === MODO_ACESSO.LEITURA_NOTIFICACAO) {
        console.log('[DEBUG PAINEL] aplicarModoAcesso → LEITURA_NOTIFICACAO — painel será ocultado');
        // Sempre oculta abas, painel de ações da etapa 1 e botão salvar no modo leitura
        if (abas) abas.style.display = 'none';
        if (painelAcoes) painelAcoes.style.display = 'none';
        if (btnSalvar) btnSalvar.style.display = 'none';

        if (!ehEtapa16) {
            if (stepperPadrao) stepperPadrao.style.display = 'none';
        }

        const tabDocumento = document.getElementById('tabDocumentoOficial');
        if (tabDocumento) tabDocumento.style.display = 'block';

        const container = document.querySelector('.page-container');
        if (container && !document.getElementById('avisoModoLeitura')) {
            const aviso = document.createElement('div');
            aviso.id = 'avisoModoLeitura';
            aviso.className = 'alert alert-info';
            aviso.style.cssText = 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:12px 16px;border-radius:10px;margin-bottom:16px;font-size:0.9rem;';

            if (ehEtapa16) {
                aviso.innerHTML = '<strong>Etapa 1.2 — Retorno do AR em andamento.</strong><br>Este processo está com o <strong>Administrativo de Posturas</strong>. Você pode visualizar e baixar a Notificação Preliminar enquanto aguarda o retorno.';
            } else {
                aviso.innerHTML = 'Você está visualizando este processo no modo <strong>leitura</strong>. Apenas o documento oficial pode ser visualizado e baixado.';
            }
            container.insertBefore(aviso, container.firstChild);
        }
        return;
    }

    if (modo === MODO_ACESSO.VISUALIZACAO_COMPLETA) {
        console.log('[DEBUG PAINEL] aplicarModoAcesso → VISUALIZACAO_COMPLETA — painel será ocultado');
        if (!ehEtapa16) {
            if (painelAcoes) painelAcoes.style.display = 'none';
            if (btnSalvar) btnSalvar.style.display = 'none';

            // Desabilita todos os controles editáveis da Etapa 1
            const controlesEdicao = document.querySelectorAll('#painelAcoesEtapa1 input, #painelAcoesEtapa1 select, #painelAcoesEtapa1 button, #painelAcoesEtapa1 textarea, #inputValUpfmd, #selectEsquinaCalc');
            controlesEdicao.forEach(el => {
                if (el.id !== 'btnImprimirEtapa' && el.id !== 'btnBaixarRelatorioPdfEtapa') {
                    el.disabled = true;
                }
            });

            const abaEdicao = document.getElementById('tabEditarProcesso');
            if (abaEdicao) {
                abaEdicao.querySelectorAll('input, select, textarea').forEach(el => {
                    el.disabled = true;
                });
            }
        }

        const container = document.querySelector('.page-container');
        if (container && !document.getElementById('avisoModoVisualizacao')) {
            const aviso = document.createElement('div');
            aviso.id = 'avisoModoVisualizacao';
            aviso.className = 'alert alert-info';
            aviso.style.cssText = 'background:#f5f3ff;border:1px solid #ddd6fe;color:#5b21b6;padding:12px 16px;border-radius:10px;margin-bottom:16px;font-size:0.9rem;';
            aviso.innerHTML = 'Você está visualizando este processo no modo <strong>visualização</strong>. Alterações só podem ser feitas nas etapas atribuídas ao seu cargo.';
            container.insertBefore(aviso, container.firstChild);
        }
        return;
    }

    // MODO NORMAL: nada a ocultar/desabilitar
}

// ── Verifica se o usuário logado pode gerenciar a etapa atual ─────────────
function podeGerenciarEtapaAtual() {
    if (!processoAtual || !perfilAtual) return false;
    const cargo = normalizarCargo(perfilAtual.cargo);
    const etapaAtual = notificacaoAtual
        ? parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
        : parseInt(processoAtual.etapa_atual || processoAtual.etapa_atual_id || 1, 10);
    const etapasPermitidas = ETAPAS_POR_CARGO[cargo] || [];
    return etapasPermitidas.includes(etapaAtual);
}

// ── Retorna a etapa anterior com base no histórico ────────────────────────
// Ignora registros de "volta de etapa" para não criar ciclos (B->A->B->A).
// Busca a última transição NORMAL que levou o processo até a etapa atual
// e retorna a etapa de origem dessa transição.
async function obterEtapaAnterior(proc) {
    const etapaAtual = notificacaoAtual
        ? parseInt(notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
        : parseInt(proc.etapa_atual || proc.etapa_atual_id || 1, 10);

    try {
        let query = supabaseClient
            .from('historico_etapas')
            .select('etapa_de_id, etapa_para_id, condicao_aplicada')
            .eq('processo_id', proc.id)
            .neq('condicao_aplicada', 'Volta de etapa')
            .order('created_at', { ascending: false });

        if (notificacaoAtual) {
            query = query.eq('notificacao_id', notificacaoAtual.id);
        }

        const { data: hist } = await query;

        if (hist && hist.length > 0) {
            // Procura a transição que levou à etapa atual
            const transicaoParaAtual = hist.find(h =>
                parseInt(h.etapa_para_id, 10) === etapaAtual &&
                parseInt(h.etapa_de_id, 10) !== etapaAtual
            );

            if (transicaoParaAtual && transicaoParaAtual.etapa_de_id) {
                return parseInt(transicaoParaAtual.etapa_de_id, 10);
            }

            // Se não achou transição para a etapa atual, usa a origem da última transição normal
            const ultima = hist[0];
            if (ultima.etapa_de_id) {
                return parseInt(ultima.etapa_de_id, 10);
            }
        }
    } catch (err) {
        console.warn('Erro ao buscar etapa anterior:', err);
    }

    // Fallback: etapa anterior numérica
    return Math.max(1, etapaAtual - 1);
}

// ── Retorna a próxima etapa com base nas regras de transição ──────────────
function obterProximaEtapa(etapaAtual) {
    // Regras específicas; para etapas não mapeadas, avança numericamente
    const regras = {
        1: 16,
        16: 2,
        30: 18
    };
    return regras[etapaAtual] || etapaAtual + 1;
}

// ── Configura os botões padrão de Avançar/Voltar/Cancelar ─────────────────
function configurarBotoesNavegacaoPadrao() {
    const btnAvancar = document.getElementById('btnAvancarEtapa');
    const btnVoltar = document.getElementById('btnVoltarEtapa');
    const btnCancelar = document.getElementById('btnCancelarProcesso');

    const btnImprimir = document.getElementById('btnImprimirEtapa');
    if (btnImprimir) {
        const svgIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2 2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>`;
        if (ehStatusAutoInfracao(notificacaoAtual) || (!notificacaoAtual && (processoAtual?.etapa_atual >= 14))) {
            btnImprimir.innerHTML = `${svgIcon} Imprimir / PDF (Auto de Infração)`;
        } else {
            btnImprimir.innerHTML = `${svgIcon} Imprimir / PDF (Notificação)`;
        }
    }

    if (notificacaoAtual && notificacaoAtual.status === 'encerrada') {
        if (btnAvancar) btnAvancar.style.display = 'none';
        if (btnVoltar) btnVoltar.style.display = 'none';
        if (btnCancelar) btnCancelar.style.display = 'none';
        return;
    }

    const etapaAtual = notificacaoAtual
        ? parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
        : parseInt(processoAtual?.etapa_atual || processoAtual?.etapa_atual_id || 1, 10);
    const podeGerenciar = podeGerenciarEtapaAtual();

    // Etapas que possuem botão de avanço específico próprio no formulário
    const etapasComAvancoEspecifico = [2, 16, 17, 30];

    if (btnAvancar) {
        // Nas etapas 16 e 30 o avanço é feito pelos botões específicos do formulário
        if (!podeGerenciar || etapasComAvancoEspecifico.includes(etapaAtual)) {
            btnAvancar.style.display = 'none';
        } else {
            btnAvancar.style.display = '';
            vincularEventoUnico(btnAvancar, 'click', avancarEtapaPadrao);
        }
    }

    if (btnVoltar) {
        if (!podeGerenciar) {
            btnVoltar.style.display = 'none';
        } else {
            btnVoltar.style.display = '';
            if (etapaAtual === 1) {
                vincularEventoUnico(btnVoltar, 'click', () => {
                    alert('Este processo está na Etapa 1 (etapa inicial da notificação).');
                });
            } else {
                vincularEventoUnico(btnVoltar, 'click', voltarEtapaPadrao);
            }
        }
    }

    if (btnCancelar) {
        btnCancelar.style.display = podeGerenciar ? '' : 'none';
        if (podeGerenciar) {
            vincularEventoUnico(btnCancelar, 'click', cancelarProcesso);
        }
    }
}

// Remove listeners antigos clonando o elemento antes de vincular um novo handler
function vincularEventoUnico(elemento, evento, handler) {
    if (!elemento) return;
    const clone = elemento.cloneNode(true);
    elemento.parentNode.replaceChild(clone, elemento);
    clone.addEventListener(evento, handler);
}

async function avancarEtapaPadrao() {
    if (!processoAtual) return;
    if (!podeGerenciarEtapaAtual()) {
        alert('Você não tem permissão para avançar esta etapa.');
        return;
    }

    const etapaAtual = notificacaoAtual
        ? parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
        : parseInt(processoAtual.etapa_atual || processoAtual.etapa_atual_id || 1, 10);

    // Delega para as funções específicas quando existirem
    if (etapaAtual === 1) {
        await avancarEtapa1();
        return;
    }
    if (etapaAtual === 2) {
        await avancarEtapa2();
        return;
    }
    if (etapaAtual === 3) {
        await avancarEtapa3();
        return;
    }
    if (etapaAtual === 4) {
        await avancarEtapa4();
        return;
    }
    if (etapaAtual === 5) {
        await avancarEtapa5();
        return;
    }
    if (etapaAtual === 11) {
        await avancarEtapa11();
        return;
    }
    if (etapaAtual === 13) {
        await avancarEtapa13();
        return;
    }
    if (etapaAtual === 7) {
        await avancarEtapa7();
        return;
    }
    if (etapaAtual === 10) {
        await avancarEtapa10();
        return;
    }
    if (etapaAtual === 14) {
        await avancarEtapa14();
        return;
    }
    if (etapaAtual === 16) {
        await avancarEtapa16();
        return;
    }
    if (etapaAtual === 17) {
        await avancarEtapa17();
        return;
    }
    if (etapaAtual === 30) {
        await avancarEtapa30();
        return;
    }

    const proxEtapaNumero = obterProximaEtapa(etapaAtual);
    await moverProcessoParaEtapa(proxEtapaNumero, 'Avanço de etapa');
}

async function avancarEtapa3() {
    if (!processoAtual || !notificacaoAtual) return;
    mostrarCarregamento('Avançando etapa...');

    const anexosSalvos = notificacaoAtual.dados?.etapa3?.anexos || [];

    if (anexosSalvos.length > 0) {
        await moverProcessoParaEtapa(13, 'Defesa enviada');
    } else {
        const info = formatarDiasRestantes(notificacaoAtual.data_vencimento);
        if (info.vencido) {
            await moverProcessoParaEtapa(10, 'Prazo de defesa esgotado (Sem defesa)');
        } else {
            ocultarCarregamento();
            alert('A notificação ainda está no prazo. Para avançar sem anexar, aguarde o vencimento do prazo. Se possui a defesa, anexe o documento acima.');
            return;
        }
    }
}

async function avancarEtapa4() {
    if (!processoAtual || !notificacaoAtual) return;

    const anexos = notificacaoAtual.dados?.etapa4?.anexos || [];
    let proxEtapa = 7;
    let motivo = 'Comprovante verificado';

    if (notificacaoAtual.status === 'dilacao') {
        proxEtapa = 5;
        motivo = 'Avançando para análise de dilação';
    } else if (notificacaoAtual.status === 'defesa') {
        if (anexos.length < 1) {
            if (!confirm('Você não anexou o Comprovante de Propriedade. Sem ele, a defesa será negada. Deseja avançar sem o documento e ir direto para a Etapa 7?')) {
                return;
            }
            proxEtapa = 7;
            motivo = 'Defesa negada automaticamente por falta de documento';
        } else {
            proxEtapa = 3;
            motivo = 'Comprovante verificado, enviar defesa';
        }
    } else if (notificacaoAtual.status === 'atendida') {
        proxEtapa = 7;
        motivo = 'Notificação atendida';
    } else {
        proxEtapa = 7;
        motivo = 'Não atendida e vencida';
    }

    mostrarCarregamento('Avançando etapa...');
    await moverProcessoParaEtapa(proxEtapa, motivo);
}

async function avancarEtapa5() {
    if (!processoAtual || !notificacaoAtual) return;

    const select = document.getElementById('selectDecisaoDilacao');
    const txtJustificativa = document.getElementById('txtJustificativaDilacao');
    const inputDias = document.getElementById('inputDiasDilacao');

    const decisao = select ? select.value : '';
    const justificativa = txtJustificativa ? txtJustificativa.value.trim() : '';
    const dias = inputDias ? parseInt(inputDias.value, 10) : 0;

    if (!decisao) {
        alert('Por favor, selecione a decisão da dilação (Defere, Indefere, Manda para gerente).');
        return;
    }

    if (decisao === 'defere' && (!dias || dias <= 0)) {
        alert('Por favor, informe a quantidade de dias da dilação.');
        return;
    }

    if ((decisao === 'indefere' || decisao === 'gerente') && !justificativa) {
        alert('Por favor, preencha o motivo (justificativa).');
        return;
    }

    // Validação de obrigatoriedade do anexo da Réplica Assinada
    let temAnexoReplica = !!(notificacaoAtual?.dados?.replica_assinada_nome || notificacaoAtual?.dados?.anexo_replica_url);
    if (!temAnexoReplica && notificacaoAtual?.dados?.replica_id) {
        const { data: docReplica } = await supabaseClient
            .from('documentos')
            .select('id, url')
            .eq('id', notificacaoAtual.dados.replica_id)
            .not('url', 'is', null)
            .maybeSingle();
        if (docReplica?.url) temAnexoReplica = true;
    }

    if (!temAnexoReplica) {
        alert('⚠️ Anexo Obrigatório!\n\nPor favor, anexe o PDF da Réplica Assinada antes de avançar a etapa.');
        return;
    }

    mostrarCarregamento('Avançando etapa...');

    notificacaoAtual.dados = notificacaoAtual.dados || {};
    notificacaoAtual.dados.etapa5 = { decisao, justificativa, dias, data_decisao: new Date().toISOString() };

    // Atualiza/Gera e salva a Réplica HTML no banco antes de mover de etapa
    if (typeof window.gerarReplica === 'function') {
        await window.gerarReplica();
    }

    let proxEtapa = 2;
    let motivo = 'Dilação Deferida';

    if (decisao === 'defere') {
        let atualVenc = notificacaoAtual.data_vencimento ? new Date(notificacaoAtual.data_vencimento) : new Date();
        atualVenc.setDate(atualVenc.getDate() + dias);
        notificacaoAtual.data_vencimento = atualVenc.toISOString();
        notificacaoAtual.status = 'pendente';
        notificacaoAtual.dados.etapa2_ja_pediu_dilacao = true;
        proxEtapa = 2;
        motivo = 'Dilação Deferida';
    } else if (decisao === 'indefere') {
        proxEtapa = 7;
        motivo = 'Dilação Indeferida';
    } else if (decisao === 'gerente') {
        proxEtapa = 11;
        motivo = 'Análise do Gerente';
    }

    await atualizarNotificacaoNoBanco(notificacaoAtual.id, { dados: notificacaoAtual.dados, data_vencimento: notificacaoAtual.data_vencimento, status: notificacaoAtual.status });
    await moverProcessoParaEtapa(proxEtapa, motivo);
}

async function avancarEtapa13() {
    if (!processoAtual || !notificacaoAtual) return;

    const select = document.getElementById('selectDecisaoDilacao');
    const txtJustificativa = document.getElementById('txtJustificativaDilacao');
    const selectParecer = document.getElementById('selectParecerGerente');

    const decisao = select ? select.value : '';
    const justificativa = txtJustificativa ? txtJustificativa.value.trim() : '';
    const parecer = (decisao === 'gerente' && selectParecer) ? selectParecer.value : '';

    if (!decisao) {
        alert('Por favor, selecione a decisão da defesa (Defere, Indefere, Manda para gerente).');
        return;
    }

    if ((decisao === 'indefere' || decisao === 'gerente') && !justificativa) {
        alert('Por favor, preencha o motivo (justificativa).');
        return;
    }

    // Validação de obrigatoriedade do anexo da Réplica Assinada
    let temAnexoReplica = !!(notificacaoAtual?.dados?.replica_assinada_nome || notificacaoAtual?.dados?.anexo_replica_url);
    if (!temAnexoReplica && notificacaoAtual?.dados?.replica_id) {
        const { data: docReplica } = await supabaseClient
            .from('documentos')
            .select('id, url')
            .eq('id', notificacaoAtual.dados.replica_id)
            .not('url', 'is', null)
            .maybeSingle();
        if (docReplica?.url) temAnexoReplica = true;
    }

    if (!temAnexoReplica) {
        alert('⚠️ Anexo Obrigatório!\n\nPor favor, anexe o PDF da Réplica Assinada antes de avançar a etapa.');
        return;
    }

    mostrarCarregamento('Avançando etapa...');

    notificacaoAtual.dados = notificacaoAtual.dados || {};
    notificacaoAtual.dados.etapa13 = { decisao, justificativa, parecer, data_decisao: new Date().toISOString() };

    // Atualiza/Gera e salva a Réplica HTML no banco antes de mover de etapa
    if (typeof window.gerarReplica === 'function') {
        await window.gerarReplica();
    }

    let proxEtapa = 10;
    let motivo = 'Defesa Analisada';

    if (decisao === 'defere') {
        proxEtapa = 10;
        motivo = 'Defesa Deferida pelo Fiscal (encaminhado para Certidão)';
    } else if (decisao === 'indefere') {
        proxEtapa = 10;
        motivo = 'Defesa Indeferida pelo Fiscal';
    } else if (decisao === 'gerente') {
        proxEtapa = 11;
        motivo = 'Análise do Gerente';
    }

    await atualizarNotificacaoNoBanco(notificacaoAtual.id, { dados: notificacaoAtual.dados, status: notificacaoAtual.status });
    await moverProcessoParaEtapa(proxEtapa, motivo);
}

async function avancarEtapa11() {
    if (!processoAtual || !notificacaoAtual) return;

    const select = document.getElementById('selectDecisaoGerente');
    const txtJustificativa = document.getElementById('txtJustificativaGerente');
    const inputData = document.getElementById('inputDataDilacaoGerente');
    const selectCertidao = document.getElementById('selectGerarCertidaoGerente');

    const decisao = select ? select.value : '';
    const justificativa = txtJustificativa ? txtJustificativa.value.trim() : '';
    const dataVencimento = inputData ? inputData.value : '';
    const passarCertidao = (decisao === 'defere' && selectCertidao) ? (selectCertidao.value === 'sim') : false;

    if (!decisao) {
        alert('Por favor, selecione uma decisão.');
        return;
    }

    if (!justificativa) {
        alert('Por favor, preencha o motivo da decisão.');
        return;
    }

    if (decisao === 'dilatar' && !dataVencimento) {
        alert('Por favor, informe a nova data de vencimento.');
        return;
    }

    mostrarCarregamento('Avançando etapa...');

    notificacaoAtual.dados = notificacaoAtual.dados || {};
    notificacaoAtual.dados.etapa11 = { decisao, justificativa, dataVencimento, passar_certidao: passarCertidao, data_decisao: new Date().toISOString() };

    let proxEtapa = 10;
    let motivo = 'Gerente Analisou Defesa';

    if (decisao === 'defere') {
        if (passarCertidao) {
            proxEtapa = 10;
            motivo = 'Defesa Deferida pelo Gerente (encaminhado para Certidão)';

            // Notificação no menu para o fiscal responsável (criador do processo)
            const novaNotificacaoMenu = {
                id: 'notif_' + Date.now(),
                tipo: 'gerente_deferiu_certidao',
                titulo: 'Gerente Deferiu e Solicitou Certidão de Encerramento',
                mensagem: `O gerente deferiu a defesa do processo ${processoAtual.numero_processo} (Notificação ${notificacaoAtual.numero}) e decidiu gerar a Certidão de Encerramento antes de encerrar o processo.`,
                decisao: 'Deferido',
                opcao: 'Gerar Certidão de Encerramento',
                motivo: justificativa,
                numero_processo: processoAtual.numero_processo,
                numero_notificacao: notificacaoAtual.numero,
                processo_id: processoAtual.id,
                notificacao_id: notificacaoAtual.id,
                fiscal_id: processoAtual.fiscal_id,
                data: new Date().toISOString(),
                lida: false
            };

            notificacaoAtual.dados.notificacoes_menu = notificacaoAtual.dados.notificacoes_menu || [];
            notificacaoAtual.dados.notificacoes_menu.unshift(novaNotificacaoMenu);

            processoAtual.dados = processoAtual.dados || {};
            processoAtual.dados.notificacoes_menu = processoAtual.dados.notificacoes_menu || [];
            processoAtual.dados.notificacoes_menu.unshift(novaNotificacaoMenu);
        } else {
            proxEtapa = 29;
            motivo = 'Defesa Deferida pelo Gerente (Encerrado diretamente)';
        }
    } else if (decisao === 'indefere') {
        proxEtapa = 10;
        motivo = 'Defesa Indeferida pelo Gerente';
    } else if (decisao === 'dilatar') {
        proxEtapa = 2;
        motivo = 'Gerente Dilatou Prazo';

        notificacaoAtual.data_vencimento = dataVencimento + 'T23:59:59Z';
        // Impede que o fiscal peça nova dilação na Etapa 2
        notificacaoAtual.dados.etapa2_ja_pediu_dilacao = true;
    } else if (decisao === 'retorna_fiscal') {
        proxEtapa = 3;
        motivo = 'Gerente retornou para reanálise do Fiscal (' + justificativa + ')';
    }

    await atualizarNotificacaoNoBanco(notificacaoAtual.id, { dados: notificacaoAtual.dados, data_vencimento: notificacaoAtual.data_vencimento, status: notificacaoAtual.status });
    await moverProcessoParaEtapa(proxEtapa, motivo);
}

async function avancarEtapa7() {
    if (!processoAtual || !notificacaoAtual) return;

    const select = document.getElementById('selectCumprimento');
    const selectJuridico = document.getElementById('selectJuridico');

    const decisao = select ? select.value : '';
    const vaiParaJuridico = selectJuridico ? selectJuridico.value : 'nao';

    if (!decisao) {
        alert('Por favor, selecione uma opção de cumprimento.');
        return;
    }

    mostrarCarregamento('Avançando etapa...');

    notificacaoAtual.dados = notificacaoAtual.dados || {};
    notificacaoAtual.dados.etapa7 = {
        cumprimento: decisao,
        juridico: vaiParaJuridico,
        data_analise: new Date().toISOString()
    };
    await atualizarNotificacaoNoBanco(notificacaoAtual.id, { dados: notificacaoAtual.dados });

    let proxEtapa = 10;
    let motivo = 'Não Cumprido (Vencida)';

    if (vaiParaJuridico === 'sim') {
        proxEtapa = 32;
        motivo = 'Enviar para o Jurídico';
    } else {
        if (decisao === 'atendida') {
            proxEtapa = 10;
            motivo = 'Cumprido (Atendida)';
        }
    }

    await moverProcessoParaEtapa(proxEtapa, motivo);
}

async function finalizarEBaixarZipNotificacao() {
    if (!notificacaoAtual) return;

    const jaEncerrada = (notificacaoAtual.status === 'encerrada');
    if (jaEncerrada) {
        alert('Esta notificação já se encontra encerrada.');
        return;
    }

    if (!confirm('Tem certeza que deseja encerrar esta notificação definitivamente?')) {
        return;
    }

    mostrarCarregamento('Encerrando notificação...');

    try {
        const notifDados = { ...(notificacaoAtual.dados || {}) };
        notifDados.historico = notifDados.historico || [];
        notifDados.historico.push({
            etapa_de: parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual_id || 29, 10),
            etapa_para: 'encerrada',
            status: 'encerrada',
            condicao: 'Encerramento de Notificação',
            data: new Date().toISOString(),
            usuario: perfilAtual?.nome || 'Sistema'
        });

        await supabaseClient
            .from('notificacoes')
            .update({
                status: 'encerrada',
                dados: notifDados
            })
            .eq('id', notificacaoAtual.id);

        ocultarCarregamento();
        alert('Notificação encerrada com sucesso.');
        window.location.href = `etapa.html?processo=${processoAtual.id}`;
    } catch (err) {
        console.error('Erro ao encerrar notificação no banco:', err);
        alert('Erro ao atualizar status de encerramento no banco.');
        ocultarCarregamento();
    }
}

window.gerarZipComTodosDocumentos = async function () {
    if (!notificacaoAtual || !processoAtual) return;
    mostrarCarregamento('Gerando pacote ZIP com todos os documentos...');

    try {
        const zip = new JSZip();
        const numNotifLimpo = notificacaoAtual.numero.replace(/[\/\\]/g, '-');

        let docsBanco = [];
        try {
            const { data } = await supabaseClient
                .from('documentos')
                .select('*')
                .or(`notificacao_id.eq.${notificacaoAtual.id},processo_id.eq.${processoAtual.id}`)
                .not('url', 'is', null);
            docsBanco = data || [];
        } catch (errDoc) {
            console.error('Erro ao buscar documentos para ZIP:', errDoc);
        }

        const helperAddZip = async (nomeArquivo, urlOuData) => {
            if (!urlOuData) return false;
            try {
                if (urlOuData.startsWith('data:')) {
                    const base64Data = urlOuData.split(',')[1] || urlOuData;
                    zip.file(nomeArquivo, base64Data, { base64: true });
                    return true;
                } else if (urlOuData.startsWith('http://') || urlOuData.startsWith('https://') || urlOuData.startsWith('blob:')) {
                    const res = await fetch(urlOuData);
                    if (res.ok) {
                        const blob = await res.blob();
                        zip.file(nomeArquivo, blob);
                        return true;
                    }
                } else if (typeof urlOuData === 'string') {
                    zip.file(nomeArquivo, urlOuData);
                    return true;
                }
            } catch (e) {
                console.warn(`Aviso ao adicionar ${nomeArquivo} ao ZIP:`, e);
            }
            return false;
        };

        // 1. Notificação Preliminar Assinada (PDF ou DOC fallback)
        const docNP = docsBanco.find(d => ['Notificação Preliminar', 'Notificação Preliminar Assinada'].includes(d.tipo))
            || processoAtual?.campos?.anexo_np_assinada
            || (notificacaoAtual.dados?.notificacao_assinada_url ? { url: notificacaoAtual.dados.notificacao_assinada_url, nome_arquivo: notificacaoAtual.dados.notificacao_assinada_nome } : null);

        let urlNP = docNP?.url || docNP?.dataUrl || docNP?.base64;
        if (urlNP) {
            await helperAddZip(docNP?.nome_arquivo || docNP?.nome || `1_Notificacao_Preliminar_${numNotifLimpo}_Assinada.pdf`, urlNP);
        } else {
            const brasaoBase64 = await obterBrasaoBase64() || window.BRASAO_SEMAC_BASE64 || '';
            const conteudoWord = gerarHtmlCompativelComWordDoc(processoAtual, brasaoBase64);
            const fullDoc = '<html xmlns:o=\'urn:schemas-microsoft-com:office:office\' xmlns:w=\'urn:schemas-microsoft-com:office:word\' xmlns=\'http://www.w3.org/TR/REC-html40\'><head><meta charset="utf-8"><title>' + numNotifLimpo + '</title><style>@page{size:A4;margin:2cm}body{font-family:Calibri,\'Carlito\',Arial,sans-serif;color:#000;line-height:1.4}table{border-collapse:collapse}</style></head><body>' + conteudoWord + '</body></html>';
            zip.file(`1_Notificacao_Preliminar_${numNotifLimpo}.doc`, fullDoc);
        }

        // 2. Relatório Fiscal Assinado
        const docRF = docsBanco.find(d => ['Relatório Fiscal', 'Relatório Fiscal Assinado'].includes(d.tipo))
            || processoAtual?.campos?.anexo_rf_assinado
            || (notificacaoAtual.dados?.relatorio_fiscal_url ? { url: notificacaoAtual.dados.relatorio_fiscal_url, nome_arquivo: notificacaoAtual.dados.relatorio_fiscal_nome } : null);

        let urlRF = docRF?.url || docRF?.dataUrl || docRF?.base64;
        if (urlRF) {
            await helperAddZip(docRF?.nome_arquivo || docRF?.nome || `2_Relatorio_Fiscal_${numNotifLimpo}_Assinado.pdf`, urlRF);
        }

        // 3. BIC (Espelho Cadastral Imobiliário)
        const docBIC = docsBanco.find(d => ['BIC Espelho Cadastral', 'BIC', 'Espelho Cadastral', 'Boletim Informativo'].includes(d.tipo))
            || processoAtual?.dados?.documento_bic
            || processoAtual?.dados?.anexos?.bic_espelho_cadastral
            || (processoAtual?.campos?.bic_url ? { url: processoAtual.campos.bic_url, nome_arquivo: 'BIC_Espelho_Cadastral.pdf' } : null);

        let urlBIC = docBIC?.url || docBIC?.dataUrl || docBIC?.base64;
        if (urlBIC) {
            await helperAddZip(docBIC?.nome_arquivo || docBIC?.nome || `3_BIC_Espelho_Cadastral_${numNotifLimpo}.pdf`, urlBIC);
        }

        // 4. Anexo do AR (Aviso de Recebimento)
        const docAR = docsBanco.find(d => ['Anexo AR', 'AR', 'Aviso de Recebimento', 'Comprovante AR'].includes(d.tipo))
            || processoAtual?._arAnexosLocais?.[0]
            || processoAtual?.campos?.etapa16?.anexos_ar?.[0]
            || notificacaoAtual?.dados?.etapa16?.anexos_ar?.[0];

        let urlAR = docAR?.url || docAR?.dataUrl || docAR?.base64;
        if (urlAR) {
            await helperAddZip(docAR?.nome_arquivo || docAR?.nome || `4_Comprovante_AR_${numNotifLimpo}.pdf`, urlAR);
        }

        // 5. Decreto Municipal (se houver)
        const docDecreto = docsBanco.find(d => ['Decreto', 'Decreto Municipal'].includes(d.tipo));
        let urlDecreto = docDecreto?.url || docDecreto?.dataUrl || docDecreto?.base64 || processoAtual?.campos?.anexo_decreto_url;
        if (urlDecreto) {
            await helperAddZip(docDecreto?.nome_arquivo || docDecreto?.nome || `5_Decreto_Municipal_${numNotifLimpo}.pdf`, urlDecreto);
        }

        // 6. Edital do Gerente (se houver)
        const docEdital = docsBanco.find(d => ['Edital', 'Edital do Gerente', 'Anexo Edital', 'Edital de Notificação'].includes(d.tipo))
            || processoAtual?.campos?.etapa17?.anexo_edital
            || processoAtual?.dados?.campos?.etapa17?.anexo_edital
            || notificacaoAtual?.dados?.etapa17?.anexo_edital;

        let urlEdital = docEdital?.url || docEdital?.dataUrl || docEdital?.base64;
        if (urlEdital) {
            await helperAddZip(docEdital?.nome_arquivo || docEdital?.nome || `6_Edital_Gerente_${numNotifLimpo}.pdf`, urlEdital);
        }

        // 7. Defesa do Contribuinte (se houver)
        const docDefesa = docsBanco.find(d => ['Defesa', 'Defesa do Contribuinte'].includes(d.tipo));
        const anexosDefesa = notificacaoAtual.dados?.etapa3?.anexos || [];
        const objDef = docDefesa || anexosDefesa[0];
        let urlDef = objDef?.url || objDef?.base64 || objDef?.dataUrl;
        if (urlDef) {
            await helperAddZip(objDef?.nome_arquivo || objDef?.nome || `7_Defesa_${numNotifLimpo}.pdf`, urlDef);
        }

        // 8. Comprovante de Propriedade (se houver)
        const docProp = docsBanco.find(d => ['Comprovante de Propriedade', 'Propriedade', 'Matrícula', 'Escritura', 'Comprovante de Renda/Propriedade'].includes(d.tipo))
            || (notificacaoAtual.dados?.etapa4?.anexos ? notificacaoAtual.dados.etapa4.anexos.find(a => (a.nome || '').toLowerCase().includes('propriedade')) || notificacaoAtual.dados.etapa4.anexos[0] : null);

        let urlProp = docProp?.url || docProp?.dataUrl || docProp?.base64;
        if (urlProp) {
            await helperAddZip(docProp?.nome_arquivo || docProp?.nome || `8_Comprovante_Propriedade_${numNotifLimpo}.pdf`, urlProp);
        }

        // 9. Comprovante de Renda (se houver)
        const docRenda = docsBanco.find(d => ['Comprovante de Renda', 'Renda', 'Comprovante Renda'].includes(d.tipo))
            || (notificacaoAtual.dados?.etapa4?.anexos ? notificacaoAtual.dados.etapa4.anexos.find(a => (a.nome || '').toLowerCase().includes('renda')) || (notificacaoAtual.dados.etapa4.anexos.length > 1 ? notificacaoAtual.dados.etapa4.anexos[1] : null) : null);

        let urlRenda = docRenda?.url || docRenda?.dataUrl || docRenda?.base64;
        if (urlRenda) {
            await helperAddZip(docRenda?.nome_arquivo || docRenda?.nome || `9_Comprovante_Renda_${numNotifLimpo}.pdf`, urlRenda);
        }

        // 10. Réplica Assinada (se houver)
        const docReplica = docsBanco.find(d => ['Réplica', 'Réplica Assinada'].includes(d.tipo) || String(d.id) === String(notificacaoAtual.dados?.replica_id))
            || (notificacaoAtual.dados?.anexo_replica_url ? { url: notificacaoAtual.dados.anexo_replica_url, nome_arquivo: notificacaoAtual.dados.replica_assinada_nome } : null);

        let urlReplica = docReplica?.url || docReplica?.dataUrl || docReplica?.base64;
        if (urlReplica) {
            await helperAddZip(docReplica?.nome_arquivo || docReplica?.nome || `10_Replica_${numNotifLimpo}_Assinada.pdf`, urlReplica);
        }

        // 11. Certidão Assinada
        const docCertidao = docsBanco.find(d => ['Certidão', 'Certidão Sem Defesa'].includes(d.tipo) || String(d.id) === String(notificacaoAtual.dados?.certidao_id))
            || (notificacaoAtual.dados?.certidao_assinada_url ? { url: notificacaoAtual.dados.certidao_assinada_url, nome_arquivo: notificacaoAtual.dados.certidao_assinada_nome } : null);

        let urlCertidao = docCertidao?.url || docCertidao?.dataUrl || docCertidao?.base64;
        if (urlCertidao) {
            await helperAddZip(docCertidao?.nome_arquivo || docCertidao?.nome || `11_Certidao_${numNotifLimpo}_Assinada.pdf`, urlCertidao);
        } else {
            let certNum = notificacaoAtual?.numero_certidao;
            const docEl = document.getElementById('documentoPronto');
            if (certNum && docEl) {
                const brasaoBase64 = await obterBrasaoBase64() || window.BRASAO_SEMAC_BASE64 || '';
                const htmlCert = prepararConteudoDocumento(docEl.outerHTML, brasaoBase64);
                const numCertLimpo = certNum.replace(/[\/\\]/g, '-');
                const certDoc = '<html xmlns:o=\'urn:schemas-microsoft-com:office:office\' xmlns:w=\'urn:schemas-microsoft-com:office:word\' xmlns=\'http://www.w3.org/TR/REC-html40\'><head><meta charset="utf-8"><title>Certidao ' + numCertLimpo + '</title><style>@page{size:A4;margin:2cm}body{font-family:Calibri,\'Carlito\',Arial,sans-serif;color:#000;line-height:1.4}table{border-collapse:collapse}</style></head><body>' + htmlCert + '</body></html>';
                zip.file(`11_Certidao_${numCertLimpo}.doc`, certDoc);
            }
        }

        // 12. Auto de Infração Assinado (se houver)
        const docAI = docsBanco.find(d => ['Auto de Infração', 'Auto de Infração Assinado'].includes(d.tipo) || String(d.id) === String(notificacaoAtual.dados?.auto_infracao_id))
            || (notificacaoAtual.dados?.etapa14?.anexo_url ? { url: notificacaoAtual.dados.etapa14.anexo_url, nome_arquivo: notificacaoAtual.dados.etapa14.anexo_nome } : null);

        let urlAI = docAI?.url || docAI?.dataUrl || docAI?.base64;
        if (urlAI) {
            await helperAddZip(docAI?.nome_arquivo || docAI?.nome || `12_Auto_de_Infracao_${numNotifLimpo}_Assinado.pdf`, urlAI);
        }

        // 12. Relatório de Histórico (TXT)
        const hist = notificacaoAtual?.dados?.historico || [];
        let relatorioTxt = `RELATÓRIO DE HISTÓRICO - NOTIFICAÇÃO ${notificacaoAtual.numero}\r\n`;
        relatorioTxt += `Processo: ${processoAtual.numero_processo}\r\n`;
        relatorioTxt += `Data de Geração: ${new Date().toLocaleString('pt-BR')}\r\n`;
        relatorioTxt += `=====================================================\r\n\r\n`;

        if (hist.length === 0) {
            relatorioTxt += `Nenhum histórico registrado.\r\n`;
        } else {
            hist.forEach((h, i) => {
                relatorioTxt += `[Movimentação ${i + 1}]\r\n`;
                relatorioTxt += `Data: ${new Date(h.data).toLocaleString('pt-BR')}\r\n`;
                relatorioTxt += `Etapa: ${h.etapa_de} -> ${h.etapa_para}\r\n`;
                relatorioTxt += `Status: ${h.status || '-'}\r\n`;
                relatorioTxt += `Ação/Condição: ${h.condicao || '-'}\r\n`;
                relatorioTxt += `Usuário: ${h.usuario || '-'}\r\n`;
                relatorioTxt += `-----------------------------------------------------\r\n`;
            });
        }
        zip.file(`12_Historico_Movimentacoes_${numNotifLimpo}.txt`, relatorioTxt);

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Pacote_Documentos_Notificacao_${numNotifLimpo}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        ocultarCarregamento();
    } catch (err) {
        console.error('Erro ao gerar pacote ZIP com todos os documentos:', err);
        alert('Erro ao empacotar os documentos em ZIP.');
        ocultarCarregamento();
    }
};

window.abrirOuBaixarDocumento = function (url, nomePadrao) {
    if (!url) return false;
    const a = document.createElement('a');
    a.href = url;
    a.download = nomePadrao || 'documento_assinado.pdf';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
};

window.carregarArquivosEtapa29 = async function () {
    const gridEl = document.getElementById('gridArquivosEtapa29');
    if (!gridEl || !notificacaoAtual) return;

    let docsBanco = [];
    try {
        const { data } = await supabaseClient
            .from('documentos')
            .select('*')
            .or(`notificacao_id.eq.${notificacaoAtual.id},processo_id.eq.${processoAtual.id}`)
            .not('url', 'is', null);
        docsBanco = data || [];
    } catch (err) {
        console.error('Erro ao buscar documentos para Etapa 29:', err);
    }

    const listaCards = [];

    // 1. Notificação Preliminar Assinada
    const docNP = docsBanco.find(d => ['Notificação Preliminar', 'Notificação Preliminar Assinada'].includes(d.tipo))
        || processoAtual?.campos?.anexo_np_assinada
        || (notificacaoAtual.dados?.notificacao_assinada_url ? { url: notificacaoAtual.dados.notificacao_assinada_url, nome_arquivo: notificacaoAtual.dados.notificacao_assinada_nome || 'Notificacao_Preliminar_Assinada.pdf' } : null);

    listaCards.push({
        tipoKey: 'notificacao',
        titulo: 'Notificação Preliminar Assinada',
        subtitulo: docNP ? (docNP.nome_arquivo || docNP.nome || 'Notificação Preliminar (PDF Assinado)') : 'Notificação Preliminar (PDF Assinado)',
        icone: '📄',
        corBtn: '#eff6ff',
        corTexto: '#2563eb',
        corBorda: '#bfdbfe',
        labelBtn: '⬇ Baixar Notificação Assinada'
    });

    // 2. Relatório Fiscal Assinado
    const docRF = docsBanco.find(d => ['Relatório Fiscal', 'Relatório Fiscal Assinado'].includes(d.tipo))
        || processoAtual?.campos?.anexo_rf_assinado
        || (notificacaoAtual.dados?.relatorio_fiscal_url ? { url: notificacaoAtual.dados.relatorio_fiscal_url, nome_arquivo: notificacaoAtual.dados.relatorio_fiscal_nome || 'Relatorio_Fiscal_Assinado.pdf' } : null);

    if (docRF || notificacaoAtual.dados?.etapa2?.tem_relatorio_fiscal !== false) {
        listaCards.push({
            tipoKey: 'relatorio_fiscal',
            titulo: 'Relatório Fiscal Assinado',
            subtitulo: docRF ? (docRF.nome_arquivo || docRF.nome || 'Vistoria e Fotos (PDF Assinado)') : 'Relatório Fiscal de Vistoria (PDF Assinado)',
            icone: '📋',
            corBtn: '#f0fdf4',
            corTexto: '#16a34a',
            corBorda: '#bbf7d0',
            labelBtn: '⬇ Baixar Relatório Fiscal'
        });
    }

    // 3. BIC (Espelho Cadastral Imobiliário)
    const docBIC = docsBanco.find(d => ['BIC Espelho Cadastral', 'BIC', 'Espelho Cadastral', 'Boletim Informativo'].includes(d.tipo))
        || processoAtual?.dados?.documento_bic
        || processoAtual?.dados?.anexos?.bic_espelho_cadastral
        || (processoAtual?.campos?.bic_url ? { url: processoAtual.campos.bic_url, nome_arquivo: 'BIC_Espelho_Cadastral.pdf' } : null);

    if (docBIC || processoAtual?.documento_bic) {
        listaCards.push({
            tipoKey: 'bic',
            titulo: 'BIC — Espelho Cadastral',
            subtitulo: docBIC?.nome_arquivo || docBIC?.nome || 'Cadastro Imobiliário Municipal (PDF)',
            icone: '🏠',
            corBtn: '#f0f9ff',
            corTexto: '#0284c7',
            corBorda: '#bae6fd',
            labelBtn: '⬇ Baixar BIC / Espelho Cadastral'
        });
    }

    // 4. Anexo do AR (Aviso de Recebimento)
    const docAR = docsBanco.find(d => ['Anexo AR', 'AR', 'Aviso de Recebimento', 'Comprovante AR'].includes(d.tipo))
        || processoAtual?._arAnexosLocais?.[0]
        || processoAtual?.campos?.etapa16?.anexos_ar?.[0]
        || notificacaoAtual?.dados?.etapa16?.anexos_ar?.[0];

    if (docAR || processoAtual?.campos?.etapa16 || notificacaoAtual?.dados?.etapa16) {
        listaCards.push({
            tipoKey: 'ar',
            titulo: 'Anexo do AR (Aviso de Recebimento)',
            subtitulo: docAR?.nome_arquivo || docAR?.nome || 'Comprovante de entrega postal (PDF)',
            icone: '📬',
            corBtn: '#fff7ed',
            corTexto: '#ea580c',
            corBorda: '#ffedd5',
            labelBtn: '⬇ Baixar Comprovante AR'
        });
    }

    // 5. Decreto Municipal (se houver no processo)
    const temDecreto = processoAtual?.campos?.fiscDecreto === 'sim'
        || processoAtual?.dados?.proveniente_decreto
        || notificacaoAtual?.dados?.proveniente_decreto
        || processoAtual?.campos?.fiscNumeroDecreto;
    const docDecreto = docsBanco.find(d => ['Decreto', 'Decreto Municipal'].includes(d.tipo));

    if (temDecreto || docDecreto) {
        const numDec = processoAtual?.campos?.fiscNumeroDecreto || processoAtual?.dados?.numero_decreto || '17.326/2026';
        listaCards.push({
            tipoKey: 'decreto',
            titulo: `Decreto Nº ${numDec}`,
            subtitulo: docDecreto?.nome_arquivo || 'Decreto Municipal de Notificação (PDF)',
            icone: '📜',
            corBtn: '#fdf4ff',
            corTexto: '#c026d3',
            corBorda: '#f5d0fe',
            labelBtn: '⬇ Baixar Decreto Municipal'
        });
    }

    // 6. Edital do Gerente (Etapa 17 - quando houver)
    const docEdital = docsBanco.find(d => ['Edital', 'Edital do Gerente', 'Anexo Edital', 'Edital de Notificação'].includes(d.tipo))
        || processoAtual?.campos?.etapa17?.anexo_edital
        || processoAtual?.dados?.campos?.etapa17?.anexo_edital
        || notificacaoAtual?.dados?.etapa17?.anexo_edital;

    if (docEdital || processoAtual?.campos?.etapa17 || notificacaoAtual?.dados?.etapa17) {
        listaCards.push({
            tipoKey: 'edital_gerente',
            titulo: 'Edital do Gerente',
            subtitulo: docEdital?.nome_arquivo || docEdital?.nome || 'Edital de Notificação / Publicação (PDF)',
            icone: '📢',
            corBtn: '#f0fdf4',
            corTexto: '#047857',
            corBorda: '#a7f3d0',
            labelBtn: '⬇ Baixar Edital do Gerente'
        });
    }

    // 6. Defesa do Contribuinte (se houver)
    const docDefesa = docsBanco.find(d => ['Defesa', 'Defesa do Contribuinte'].includes(d.tipo));
    const anexosDefesa = notificacaoAtual.dados?.etapa3?.anexos || [];
    if (docDefesa || anexosDefesa.length > 0) {
        const nomeDef = docDefesa?.nome_arquivo || anexosDefesa[0]?.nome || 'Defesa_Contribuinte.pdf';
        listaCards.push({
            tipoKey: 'defesa',
            titulo: 'Defesa do Contribuinte',
            subtitulo: nomeDef,
            icone: '🛡️',
            corBtn: '#fff7ed',
            corTexto: '#c2410c',
            corBorda: '#ffedd5',
            labelBtn: '⬇ Baixar Defesa'
        });
    }

    // 7. Comprovante de Propriedade (se houver)
    const docProp = docsBanco.find(d => ['Comprovante de Propriedade', 'Propriedade', 'Matrícula', 'Escritura'].includes(d.tipo))
        || docsBanco.find(d => d.tipo === 'Comprovante de Renda/Propriedade')
        || (notificacaoAtual.dados?.etapa4?.anexos ? notificacaoAtual.dados.etapa4.anexos.find(a => (a.nome || '').toLowerCase().includes('propriedade') || (a.tipo || '').toLowerCase().includes('propriedade')) || notificacaoAtual.dados.etapa4.anexos[0] : null);

    if (docProp || notificacaoAtual.dados?.etapa4) {
        listaCards.push({
            tipoKey: 'comprovante_propriedade',
            titulo: 'Comprovante de Propriedade',
            subtitulo: docProp?.nome_arquivo || docProp?.nome || 'Matrícula / Escritura do Imóvel (PDF)',
            icone: '🔑',
            corBtn: '#f0fdf4',
            corTexto: '#15803d',
            corBorda: '#bbf7d0',
            labelBtn: '⬇ Baixar Comprovante Propriedade'
        });
    }

    // 8. Comprovante de Renda (se houver)
    const docRenda = docsBanco.find(d => ['Comprovante de Renda', 'Renda', 'Comprovante Renda'].includes(d.tipo))
        || (notificacaoAtual.dados?.etapa4?.anexos ? notificacaoAtual.dados.etapa4.anexos.find(a => (a.nome || '').toLowerCase().includes('renda') || (a.tipo || '').toLowerCase().includes('renda')) || (notificacaoAtual.dados.etapa4.anexos.length > 1 ? notificacaoAtual.dados.etapa4.anexos[1] : null) : null);

    if (docRenda) {
        listaCards.push({
            tipoKey: 'comprovante_renda',
            titulo: 'Comprovante de Renda',
            subtitulo: docRenda?.nome_arquivo || docRenda?.nome || 'Comprovante de Renda (PDF)',
            icone: '💵',
            corBtn: '#fefce8',
            corTexto: '#a16207',
            corBorda: '#fef08a',
            labelBtn: '⬇ Baixar Comprovante Renda'
        });
    }

    // 9. Réplica Assinada (se houver)
    const docReplica = docsBanco.find(d => ['Réplica', 'Réplica Assinada'].includes(d.tipo) || String(d.id) === String(notificacaoAtual.dados?.replica_id))
        || (notificacaoAtual.dados?.anexo_replica_url ? { url: notificacaoAtual.dados.anexo_replica_url, nome_arquivo: notificacaoAtual.dados.replica_assinada_nome || 'Replica_Assinada.pdf' } : null);

    if (docReplica || notificacaoAtual.dados?.etapa5 || notificacaoAtual.dados?.etapa13) {
        listaCards.push({
            tipoKey: 'replica',
            titulo: 'Réplica Assinada',
            subtitulo: docReplica ? (docReplica.nome_arquivo || docReplica.nome || 'Parecer Fiscal Assinado (PDF)') : 'Réplica do Fiscal Assinada (PDF)',
            icone: '📝',
            corBtn: '#f5f3ff',
            corTexto: '#7c3aed',
            corBorda: '#ddd6fe',
            labelBtn: '⬇ Baixar Réplica Assinada'
        });
    }

    // 10. Certidão Assinada
    const docCertidao = docsBanco.find(d => ['Certidão', 'Certidão Sem Defesa'].includes(d.tipo) || String(d.id) === String(notificacaoAtual.dados?.certidao_id))
        || (notificacaoAtual.dados?.certidao_assinada_url ? { url: notificacaoAtual.dados.certidao_assinada_url, nome_arquivo: notificacaoAtual.dados.certidao_assinada_nome || 'Certidao_Assinada.pdf' } : null);

    const numCert = notificacaoAtual.numero_certidao || notificacaoAtual.dados?.certidao_numero_sequencial || docCertidao?.numero_sequencial || 'Sem Defesa';
    listaCards.push({
        tipoKey: 'certidao',
        titulo: `Certidão Nº ${numCert}`,
        subtitulo: docCertidao ? (docCertidao.nome_arquivo || docCertidao.nome || 'Documento de Encerramento (PDF Assinado)') : 'Documento de Encerramento (PDF Assinado)',
        icone: '📜',
        corBtn: '#ecfdf5',
        corTexto: '#047857',
        corBorda: '#a7f3d0',
        labelBtn: '⬇ Baixar Certidão Assinada'
    });

    // 11. Auto de Infração Assinado (se houver no processo)
    const docAI = docsBanco.find(d => ['Auto de Infração', 'Auto de Infração Assinado'].includes(d.tipo) || String(d.id) === String(notificacaoAtual.dados?.auto_infracao_id))
        || (notificacaoAtual.dados?.etapa14?.anexo_url ? { url: notificacaoAtual.dados.etapa14.anexo_url, nome_arquivo: notificacaoAtual.dados.etapa14.anexo_nome || 'Auto_de_Infracao_Assinado.pdf' } : null);

    if (docAI || notificacaoAtual.dados?.etapa14 || notificacaoAtual.numero_auto_infracao) {
        const numAutoCard = notificacaoAtual.numero_auto_infracao || notificacaoAtual.dados?.numero_auto_infracao || docAI?.numero_sequencial || 'Emitido';
        listaCards.push({
            tipoKey: 'auto_infracao',
            titulo: `Auto de Infração Nº ${numAutoCard}`,
            subtitulo: docAI ? (docAI.nome_arquivo || docAI.nome || 'Auto de Infração Assinado (PDF)') : 'Auto de Infração Assinado (PDF)',
            icone: '🚨',
            corBtn: '#fef2f2',
            corTexto: '#dc2626',
            corBorda: '#fecaca',
            labelBtn: '⬇ Baixar Auto de Infração Assinado'
        });
    }

    // 11. Relatório de Etapas (Histórico)
    listaCards.push({
        tipoKey: 'historico',
        titulo: 'Relatório de Etapas',
        subtitulo: 'Histórico completo de movimentações (.txt)',
        icone: '📊',
        corBtn: '#f8fafc',
        corTexto: '#475569',
        corBorda: '#cbd5e1',
        labelBtn: '⬇ Baixar Relatório de Etapas'
    });

    gridEl.innerHTML = listaCards.map(card => `
        <div style="background:white; border:1px solid #cbd5e1; padding:16px; border-radius:10px; display:flex; flex-direction:column; justify-content:space-between; gap:12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:1.6rem;">${card.icone}</span>
                <div>
                    <h4 style="margin:0; color:#1e293b; font-size:0.95rem; font-weight:700;">${card.titulo}</h4>
                    <p style="margin:2px 0 0 0; color:#64748b; font-size:0.8rem;">${card.subtitulo}</p>
                </div>
            </div>
            <button type="button" onclick="baixarDocUnico('${card.tipoKey}')" style="width:100%; padding:10px 12px; background:${card.corBtn}; color:${card.corTexto}; border:1px solid ${card.corBorda}; border-radius:8px; font-weight:600; font-size:0.88rem; cursor:pointer; text-align:center; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:6px;">
                ${card.labelBtn}
            </button>
        </div>
    `).join('');
};

window.baixarDocUnico = async function (tipo) {
    if (!notificacaoAtual || !processoAtual) return;
    mostrarCarregamento(`Buscando ${tipo}...`);
    try {
        const numNotifLimpo = notificacaoAtual.numero.replace(/[\/\\]/g, '-');

        let docsBanco = [];
        try {
            const { data } = await supabaseClient
                .from('documentos')
                .select('*')
                .or(`notificacao_id.eq.${notificacaoAtual.id},processo_id.eq.${processoAtual.id}`)
                .not('url', 'is', null);
            docsBanco = data || [];
        } catch (errDoc) {
            console.error('Erro ao buscar documentos do banco:', errDoc);
        }

        if (tipo === 'notificacao' || tipo === 'notificacao_assinada') {
            const docNP = docsBanco.find(d => ['Notificação Preliminar', 'Notificação Preliminar Assinada'].includes(d.tipo))
                || processoAtual?.campos?.anexo_np_assinada
                || (notificacaoAtual.dados?.notificacao_assinada_url ? { url: notificacaoAtual.dados.notificacao_assinada_url, nome_arquivo: notificacaoAtual.dados.notificacao_assinada_nome } : null);

            let urlNP = docNP?.url || docNP?.dataUrl || docNP?.base64;
            if (!urlNP && docNP?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docNP.documento_id).maybeSingle();
                if (dFetch?.url) urlNP = dFetch.url;
            }

            if (urlNP) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlNP, docNP?.nome_arquivo || docNP?.nome || `Notificacao_Preliminar_${numNotifLimpo}_Assinada.pdf`);
                return;
            }

            ocultarCarregamento();
            if (typeof window.imprimirDocumentoOficial === 'function') {
                window.imprimirDocumentoOficial();
            } else {
                alert('Documento assinado da Notificação Preliminar não encontrado.');
            }
        } else if (tipo === 'edital_gerente' || tipo === 'edital') {
            const docEdital = docsBanco.find(d => ['Edital', 'Edital do Gerente', 'Anexo Edital', 'Edital de Notificação'].includes(d.tipo))
                || processoAtual?.campos?.etapa17?.anexo_edital
                || processoAtual?.dados?.campos?.etapa17?.anexo_edital
                || notificacaoAtual?.dados?.etapa17?.anexo_edital;

            let urlEdital = docEdital?.url || docEdital?.dataUrl || docEdital?.base64;
            if (!urlEdital && docEdital?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docEdital.documento_id).maybeSingle();
                if (dFetch?.url) urlEdital = dFetch.url;
            }

            if (urlEdital) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlEdital, docEdital?.nome_arquivo || docEdital?.nome || `Edital_Gerente_${numNotifLimpo}.pdf`);
                return;
            }
            ocultarCarregamento();
            alert('Edital do Gerente não encontrado.');
        } else if (tipo === 'relatorio_fiscal' || tipo === 'relatorio_fiscal_assinado') {
            const docRF = docsBanco.find(d => ['Relatório Fiscal', 'Relatório Fiscal Assinado'].includes(d.tipo))
                || processoAtual?.campos?.anexo_rf_assinado
                || (notificacaoAtual.dados?.relatorio_fiscal_url ? { url: notificacaoAtual.dados.relatorio_fiscal_url, nome_arquivo: notificacaoAtual.dados.relatorio_fiscal_nome } : null);

            let urlRF = docRF?.url || docRF?.dataUrl || docRF?.base64;
            if (!urlRF && docRF?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docRF.documento_id).maybeSingle();
                if (dFetch?.url) urlRF = dFetch.url;
            }

            if (urlRF) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlRF, docRF?.nome_arquivo || docRF?.nome || `Relatorio_Fiscal_${numNotifLimpo}_Assinado.pdf`);
                return;
            }

            ocultarCarregamento();
            if (typeof window.baixarRelatorioFiscalPdfEtapa === 'function') {
                window.baixarRelatorioFiscalPdfEtapa();
            } else {
                alert('Documento assinado do Relatório Fiscal não encontrado.');
            }
        } else if (tipo === 'bic') {
            const docBIC = docsBanco.find(d => ['BIC Espelho Cadastral', 'BIC', 'Espelho Cadastral', 'Boletim Informativo'].includes(d.tipo))
                || processoAtual?.dados?.documento_bic
                || processoAtual?.dados?.anexos?.bic_espelho_cadastral
                || (processoAtual?.campos?.bic_url ? { url: processoAtual.campos.bic_url, nome_arquivo: 'BIC_Espelho_Cadastral.pdf' } : null);

            let urlBIC = docBIC?.url || docBIC?.dataUrl || docBIC?.base64;
            if (!urlBIC && docBIC?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docBIC.documento_id).maybeSingle();
                if (dFetch?.url) urlBIC = dFetch.url;
            }

            if (urlBIC) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlBIC, docBIC?.nome_arquivo || docBIC?.nome || `BIC_Espelho_Cadastral_${numNotifLimpo}.pdf`);
                return;
            }
            ocultarCarregamento();
            alert('Arquivo BIC (Espelho Cadastral) não encontrado.');
        } else if (tipo === 'ar') {
            const docAR = docsBanco.find(d => ['Anexo AR', 'AR', 'Aviso de Recebimento', 'Comprovante AR'].includes(d.tipo))
                || processoAtual?._arAnexosLocais?.[0]
                || processoAtual?.campos?.etapa16?.anexos_ar?.[0]
                || notificacaoAtual?.dados?.etapa16?.anexos_ar?.[0];

            let urlAR = docAR?.url || docAR?.dataUrl || docAR?.base64;
            if (!urlAR && docAR?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docAR.documento_id).maybeSingle();
                if (dFetch?.url) urlAR = dFetch.url;
            }

            if (urlAR) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlAR, docAR?.nome_arquivo || docAR?.nome || `Comprovante_AR_${numNotifLimpo}.pdf`);
                return;
            }
            ocultarCarregamento();
            alert('Comprovante AR (Aviso de Recebimento) não encontrado.');
        } else if (tipo === 'decreto') {
            const docDecreto = docsBanco.find(d => ['Decreto', 'Decreto Municipal'].includes(d.tipo));
            let urlDecreto = docDecreto?.url || docDecreto?.dataUrl || docDecreto?.base64 || processoAtual?.campos?.anexo_decreto_url;

            if (!urlDecreto && docDecreto?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docDecreto.documento_id).maybeSingle();
                if (dFetch?.url) urlDecreto = dFetch.url;
            }

            if (urlDecreto) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlDecreto, docDecreto?.nome_arquivo || docDecreto?.nome || `Decreto_Municipal_${numNotifLimpo}.pdf`);
                return;
            }
            ocultarCarregamento();
            const numDec = processoAtual?.campos?.fiscNumeroDecreto || '17.326/2026';
            alert(`Processo regido pelo Decreto Municipal Nº ${numDec}. O arquivo PDF anexado do Decreto não foi localizado no banco.`);
        } else if (tipo === 'comprovante_renda') {
            const docRenda = docsBanco.find(d => ['Comprovante de Renda', 'Renda', 'Comprovante Renda'].includes(d.tipo))
                || (notificacaoAtual.dados?.etapa4?.anexos ? notificacaoAtual.dados.etapa4.anexos.find(a => (a.nome || '').toLowerCase().includes('renda')) || notificacaoAtual.dados.etapa4.anexos[1] : null);

            let urlRenda = docRenda?.url || docRenda?.dataUrl || docRenda?.base64;
            if (!urlRenda && docRenda?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docRenda.documento_id).maybeSingle();
                if (dFetch?.url) urlRenda = dFetch.url;
            }

            if (urlRenda) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlRenda, docRenda?.nome_arquivo || docRenda?.nome || `Comprovante_Renda_${numNotifLimpo}.pdf`);
                return;
            }
            ocultarCarregamento();
            alert('Comprovante de Renda não encontrado.');
        } else if (tipo === 'comprovante_propriedade') {
            const docProp = docsBanco.find(d => ['Comprovante de Propriedade', 'Propriedade', 'Matrícula', 'Escritura', 'Comprovante de Renda/Propriedade'].includes(d.tipo))
                || (notificacaoAtual.dados?.etapa4?.anexos ? notificacaoAtual.dados.etapa4.anexos.find(a => (a.nome || '').toLowerCase().includes('propriedade')) || notificacaoAtual.dados.etapa4.anexos[0] : null);

            let urlProp = docProp?.url || docProp?.dataUrl || docProp?.base64;
            if (!urlProp && docProp?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docProp.documento_id).maybeSingle();
                if (dFetch?.url) urlProp = dFetch.url;
            }

            if (urlProp) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlProp, docProp?.nome_arquivo || docProp?.nome || `Comprovante_Propriedade_${numNotifLimpo}.pdf`);
                return;
            }
            ocultarCarregamento();
            alert('Comprovante de Propriedade não encontrado.');
        } else if (tipo === 'defesa') {
            const docDef = docsBanco.find(d => ['Defesa', 'Defesa do Contribuinte'].includes(d.tipo));
            const anexosDefesa = notificacaoAtual.dados?.etapa3?.anexos || [];
            const objDef = docDef || anexosDefesa[0];
            const urlDef = objDef?.url || objDef?.base64 || objDef?.dataUrl;
            if (urlDef) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlDef, objDef?.nome_arquivo || objDef?.nome || `Defesa_${numNotifLimpo}.pdf`);
                return;
            }
            ocultarCarregamento();
            alert('Documento da Defesa não encontrado.');
        } else if (tipo === 'replica') {
            const docReplica = docsBanco.find(d => ['Réplica', 'Réplica Assinada'].includes(d.tipo) || String(d.id) === String(notificacaoAtual.dados?.replica_id))
                || (notificacaoAtual.dados?.anexo_replica_url ? { url: notificacaoAtual.dados.anexo_replica_url, nome_arquivo: notificacaoAtual.dados.replica_assinada_nome } : null);

            let urlReplica = docReplica?.url || docReplica?.dataUrl || docReplica?.base64;
            if (!urlReplica && docReplica?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docReplica.documento_id).maybeSingle();
                if (dFetch?.url) urlReplica = dFetch.url;
            }

            if (urlReplica) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlReplica, docReplica?.nome_arquivo || docReplica?.nome || `Replica_${numNotifLimpo}_Assinada.pdf`);
                return;
            }
            ocultarCarregamento();
            alert('Réplica Assinada não encontrada em PDF.');
        } else if (tipo === 'certidao') {
            const docCertidao = docsBanco.find(d => ['Certidão', 'Certidão Sem Defesa'].includes(d.tipo) || String(d.id) === String(notificacaoAtual.dados?.certidao_id))
                || (notificacaoAtual.dados?.certidao_assinada_url ? { url: notificacaoAtual.dados.certidao_assinada_url, nome_arquivo: notificacaoAtual.dados.certidao_assinada_nome } : null);

            let urlCertidao = docCertidao?.url || docCertidao?.dataUrl || docCertidao?.base64;
            if (!urlCertidao && docCertidao?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docCertidao.documento_id).maybeSingle();
                if (dFetch?.url) urlCertidao = dFetch.url;
            }

            if (urlCertidao) {
                ocultarCarregamento();
                window.abrirOuBaixarDocumento(urlCertidao, docCertidao?.nome_arquivo || docCertidao?.nome || `Certidao_${numNotifLimpo}_Assinada.pdf`);
                return;
            }

            let certNum = notificacaoAtual?.numero_certidao || 'XXX';
            const certLimpo = certNum.replace(/[\/\\]/g, '-');
            const docEl = document.getElementById('documentoPronto');

            if (docEl) {
                const brasaoBase64 = await obterBrasaoBase64() || window.BRASAO_SEMAC_BASE64 || '';
                const htmlLimpo = prepararConteudoDocumento(docEl.outerHTML, brasaoBase64);
                const tituloOriginal = document.title;
                document.title = `Certidao ${certLimpo}`;

                const estilos = `
                    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    body { margin: 0; padding: 20px; background: #fff; font-family: Calibri, 'Carlito', Arial, sans-serif; color: #000; max-width: 820px; margin: 0 auto; }
                    img { max-width: 100%; height: auto; }
                    @media print { body { padding: 0; margin: 0; } @page { size: A4; margin: 0; } }
                `;

                const printIframe = document.createElement('iframe');
                printIframe.style.position = 'fixed';
                printIframe.style.right = '0';
                printIframe.style.bottom = '0';
                printIframe.style.width = '0';
                printIframe.style.height = '0';
                printIframe.style.border = '0';
                document.body.appendChild(printIframe);

                const printDoc = printIframe.contentWindow.document;
                printDoc.open();
                printDoc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Certidao ${certLimpo}</title><style>${estilos}</style></head><body>${htmlLimpo}</body></html>`);
                printDoc.close();

                setTimeout(() => {
                    printIframe.contentWindow.focus();
                    printIframe.contentWindow.print();
                    setTimeout(() => {
                        if (document.body.contains(printIframe)) {
                            document.body.removeChild(printIframe);
                        }
                        document.title = tituloOriginal;
                    }, 1000);
                }, 500);
                ocultarCarregamento();
            } else {
                alert('Documento de certidão assinada não encontrado.');
                ocultarCarregamento();
            }
        } else if (tipo === 'auto_infracao') {
            const docAI = docsBanco.find(d => ['Auto de Infração', 'Auto de Infração Assinado'].includes(d.tipo) || String(d.id) === String(notificacaoAtual.dados?.auto_infracao_id))
                || (notificacaoAtual.dados?.etapa14?.anexo_url ? { url: notificacaoAtual.dados.etapa14.anexo_url, nome_arquivo: notificacaoAtual.dados.etapa14.anexo_nome } : null);

            let urlAI = docAI?.url || docAI?.dataUrl || docAI?.base64;
            if (!urlAI && docAI?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docAI.documento_id).maybeSingle();
                if (dFetch?.url) urlAI = dFetch.url;
            }

            if (urlAI) {
                ocultarCarregamento();
                const numAutoInfracao = notificacaoAtual?.numero_auto_infracao || notificacaoAtual?.dados?.numero_auto_infracao || processoAtual?.dados?.numero_auto_infracao || '2026/001';
                const procNum = (processoAtual?.numero_processo || '2026-000007').replace(/[\/\\]/g, '-');
                const nomeAutoFormatado = `Auto de Infração N° ${numAutoInfracao.replace(/[\/\\]/g, '-')} - Processo Nº ${procNum}.pdf`;
                window.abrirOuBaixarDocumento(urlAI, docAI?.nome_arquivo || docAI?.nome || nomeAutoFormatado);
                return;
            }
            ocultarCarregamento();
            alert('Auto de Infração Assinado não encontrado.');
        } else if (tipo === 'historico') {
            const hist = notificacaoAtual?.dados?.historico || [];
            let relatorioTxt = `RELATÓRIO DE HISTÓRICO - NOTIFICAÇÃO ${notificacaoAtual.numero}\r\n`;
            relatorioTxt += `Processo: ${processoAtual.numero_processo}\r\n`;
            relatorioTxt += `Data de Geração: ${new Date().toLocaleString('pt-BR')}\r\n`;
            relatorioTxt += `=====================================================\r\n\r\n`;

            if (hist.length === 0) {
                relatorioTxt += `Nenhum histórico registrado.\r\n`;
            } else {
                hist.forEach((h, i) => {
                    relatorioTxt += `[Movimentação ${i + 1}]\r\n`;
                    relatorioTxt += `Data: ${new Date(h.data).toLocaleString('pt-BR')}\r\n`;
                    relatorioTxt += `Etapa: ${h.etapa_de} -> ${h.etapa_para}\r\n`;
                    relatorioTxt += `Status: ${h.status || '-'}\r\n`;
                    relatorioTxt += `Ação/Condição: ${h.condicao || '-'}\r\n`;
                    relatorioTxt += `Usuário: ${h.usuario || '-'}\r\n`;
                    relatorioTxt += `-----------------------------------------------------\r\n`;
                });
            }
            const blob = new Blob([relatorioTxt], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Historico_Movimentacoes_${numNotifLimpo}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            ocultarCarregamento();
        }
    } catch (e) {
        console.error('Erro ao baixar documento único:', e);
        alert('Erro ao resgatar documento assinado.');
        ocultarCarregamento();
    }
};

// ── Liberação de reservas de números sequenciais ao voltar etapa ─────────
async function liberarNumerosEReservasEtapa(etapaOrigemNum) {
    if (!processoAtual) return;

    try {
        // 1) Réplica (Etapa 5 e Etapa 13)
        if ([5, 13].includes(etapaOrigemNum) && notificacaoAtual?.id) {
            const replicaAssinadaAnexada = notificacaoAtual.dados?.replica_assinada_nome || notificacaoAtual.dados?.anexo_replica_url;
            if (!replicaAssinadaAnexada) {
                const numReplicaAtual = notificacaoAtual.dados?.numero_replica;

                await supabaseClient
                    .from('documentos')
                    .delete()
                    .eq('notificacao_id', notificacaoAtual.id)
                    .eq('tipo', 'Réplica')
                    .eq('gerado_automaticamente', true);

                if (notificacaoAtual.dados?.replica_id) {
                    await supabaseClient
                        .from('documentos')
                        .delete()
                        .eq('id', notificacaoAtual.dados.replica_id);
                }

                if (numReplicaAtual) {
                    await supabaseClient.rpc('devolver_numero', { p_numero: numReplicaAtual, p_categoria: 'Réplica' });
                }

                const dadosAtualizados = { ...(notificacaoAtual.dados || {}) };
                delete dadosAtualizados.numero_replica;
                delete dadosAtualizados.replica_id;
                delete dadosAtualizados.html_replica;

                await supabaseClient
                    .from('notificacoes')
                    .update({ dados: dadosAtualizados })
                    .eq('id', notificacaoAtual.id);

                notificacaoAtual.dados = dadosAtualizados;
                console.log(`[Reserva Liberada] Número de Réplica liberado para a notificação ${notificacaoAtual.id}`);
            }
        }

        // 2) Auto de Infração (Etapa 15)
        if (etapaOrigemNum === 15) {
            const numAutoInfracaoAtual = notificacaoAtual?.dados?.numero_auto_infracao;

            if (notificacaoAtual?.id) {
                await supabaseClient
                    .from('autos_infracao')
                    .delete()
                    .eq('notificacao_id', notificacaoAtual.id);
            } else if (processoAtual?.id) {
                await supabaseClient
                    .from('autos_infracao')
                    .delete()
                    .eq('processo_id', processoAtual.id);
            }

            await supabaseClient
                .from('documentos')
                .delete()
                .eq('processo_id', processoAtual.id)
                .eq('tipo', 'Auto de Infração')
                .eq('gerado_automaticamente', true);

            if (numAutoInfracaoAtual) {
                await supabaseClient.rpc('devolver_numero', { p_numero: numAutoInfracaoAtual, p_categoria: 'Auto de Infração' });
            }

            if (notificacaoAtual?.dados) {
                const dadosAtualizados = { ...notificacaoAtual.dados };
                delete dadosAtualizados.numero_auto_infracao;
                delete dadosAtualizados.auto_infracao_id;
                await supabaseClient.from('notificacoes').update({ dados: dadosAtualizados }).eq('id', notificacaoAtual.id);
                notificacaoAtual.dados = dadosAtualizados;
            }
            console.log(`[Reserva Liberada] Número de Auto de Infração liberado.`);
        }

        // 3) Certidão Sem Defesa (Etapa 10 e Etapa 29)
        if ([10, 29].includes(etapaOrigemNum) && notificacaoAtual?.id) {
            const numCertidaoAtual = notificacaoAtual?.numero_certidao;

            await supabaseClient
                .from('documentos')
                .delete()
                .eq('notificacao_id', notificacaoAtual.id)
                .eq('tipo', 'Certidão')
                .eq('gerado_automaticamente', true);

            if (numCertidaoAtual) {
                await supabaseClient.rpc('devolver_numero', { p_numero: numCertidaoAtual, p_categoria: 'Certidão Sem Defesa' });
            }

            await supabaseClient
                .from('notificacoes')
                .update({ numero_certidao: null })
                .eq('id', notificacaoAtual.id);

            notificacaoAtual.numero_certidao = null;
            console.log(`[Reserva Liberada] Número de Certidão liberado para a notificação ${notificacaoAtual.id}`);
        }
    } catch (err) {
        console.error('Erro ao liberar reserva de número de documento:', err);
    }
}

async function voltarEtapaPadrao() {
    if (!processoAtual) return;
    if (!podeGerenciarEtapaAtual()) {
        alert('Você não tem permissão para voltar esta etapa.');
        return;
    }

    if (!confirm('Tem certeza que deseja voltar este processo para a etapa anterior?\nO controle será devolvido ao responsável pela etapa anterior.')) {
        return;
    }

    mostrarCarregamento('Voltando etapa...');
    const etapaAtualNum = notificacaoAtual
        ? parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
        : parseInt(processoAtual?.etapa_atual || processoAtual?.etapa_atual_id || 1, 10);

    await liberarNumerosEReservasEtapa(etapaAtualNum);

    const etapaAnterior = await obterEtapaAnterior(processoAtual);
    await moverProcessoParaEtapa(etapaAnterior, 'Volta de etapa');
}

async function cancelarProcesso() {
    if (!processoAtual) return;
    if (!podeGerenciarEtapaAtual()) {
        alert('Você não tem permissão para cancelar este processo.');
        return;
    }

    if (!confirm('ATENÇÃO: Cancelar o processo é irreversível.\nDeseja realmente cancelar?')) {
        return;
    }

    mostrarCarregamento('Cancelando processo...');
    try {
        await supabaseClient
            .from('processos')
            .update({ status: 'cancelado' })
            .eq('id', processoAtual.id);

        await supabaseClient
            .from('historico_etapas')
            .insert([{
                processo_id: processoAtual.id,
                etapa_de_id: processoAtual.etapa_atual_id,
                etapa_para_id: processoAtual.etapa_atual_id,
                usuario_id: perfilAtual?.id,
                condicao_aplicada: 'Processo cancelado',
                observacao: `Processo cancelado pelo ${perfilAtual?.cargo || 'usuário'} na Etapa ${processoAtual.etapa_atual_id || processoAtual.etapa_atual}.`,
                dados_etapa: {}
            }]);

        window.location.href = 'painel.html';
    } catch (err) {
        console.error('Erro ao cancelar processo:', err);
        alert('Erro ao cancelar o processo.');
        ocultarCarregamento();
    }
}

// ── Move o processo para uma etapa de destino ─────────────────────────────
async function moverProcessoParaEtapa(numeroEtapaDestino, motivo) {
    if (!processoAtual) return;

    try {
        const etapaAtualNum = notificacaoAtual
            ? parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
            : parseInt(processoAtual?.etapa_atual || processoAtual?.etapa_atual_id || 1, 10);

        if ((motivo && motivo.toLowerCase().includes('volta')) || numeroEtapaDestino < etapaAtualNum) {
            await liberarNumerosEReservasEtapa(etapaAtualNum);
        }

        const { data: etapaDest } = await supabaseClient
            .from('etapas')
            .select('id')
            .eq('numero', numeroEtapaDestino)
            .maybeSingle();

        const etapaDestId = etapaDest ? etapaDest.id : numeroEtapaDestino;

        if (notificacaoAtual) {
            const updates = { etapa_atual_id: etapaDestId };
            if (numeroEtapaDestino < 14) {
                const stAtual = (notificacaoAtual.status || '').toLowerCase();
                if (stAtual === 'auto_infracao' || stAtual === 'auto de infração' || stAtual === 'auto de infracao') {
                    const statusAnterior = notificacaoAtual.dados?.status_anterior_auto_infracao || 'pendente_vencida';
                    updates.status = statusAnterior;
                    notificacaoAtual.status = statusAnterior;
                }
            }
            if (numeroEtapaDestino === 2) {
                updates.status = 'pendente';
                notificacaoAtual.status = 'pendente';
            }

            // Grava no JSON o histórico da notificação
            const notifDados = { ...(notificacaoAtual.dados || {}) };
            notifDados.historico = notifDados.historico || [];
            notifDados.historico.push({
                etapa_de: parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual_id || 2, 10),
                etapa_para: numeroEtapaDestino,
                status: updates.status || notificacaoAtual.status,
                condicao: motivo || 'Avanço de etapa',
                data: new Date().toISOString(),
                usuario: perfilAtual?.nome || 'Sistema'
            });
            updates.dados = notifDados;

            // Atualiza apenas a notificação específica
            const { error: notifErr } = await supabaseClient
                .from('notificacoes')
                .update(updates)
                .eq('id', notificacaoAtual.id);

            if (notifErr) throw notifErr;

            notificacaoAtual.dados = notifDados;

            const { error: histErr } = await supabaseClient
                .from('historico_etapas')
                .insert([{
                    processo_id: processoAtual.id,
                    notificacao_id: notificacaoAtual.id,
                    etapa_de_id: notificacaoAtual.etapa_atual_id,
                    etapa_para_id: etapaDestId,
                    usuario_id: perfilAtual?.id,
                    condicao_aplicada: motivo,
                    observacao: `Notificação ${notificacaoAtual.numero} movida para a Etapa ${numeroEtapaDestino}.`,
                    dados_etapa: processoAtual.campos || {}
                }]);

            if (histErr) throw histErr;

            if (numeroEtapaDestino === 2) {
                window.location.href = `etapa.html?processo=${processoAtual.id}`;
            } else {
                window.location.reload();
            }
            return;
        }

        // Determina se o status deve mudar e se precisamos resetar dados do AR (Transições do Processo Geral)
        const updates = { etapa_atual_id: etapaDestId };

        if (numeroEtapaDestino === 16) {
            updates.status = 'aguardando_ar';
            // Reseta a data de inserção do AR para agora para dar novo prazo e evitar loop de redirecionamento
            if (processoAtual.campos && processoAtual.campos.etapa16) {
                processoAtual.campos.etapa16.data_insercao_ar = new Date().toISOString();
                processoAtual.dados = processoAtual.dados || {};
                processoAtual.dados.campos = processoAtual.campos;
                updates.dados = processoAtual.dados;
            }
        } else if (numeroEtapaDestino === 1) {
            updates.status = 'em_aberto';
        } else if (numeroEtapaDestino === 30) {
            updates.status = 'prazo_ar_expirado';
        }

        await supabaseClient
            .from('processos')
            .update(updates)
            .eq('id', processoAtual.id);

        await supabaseClient
            .from('historico_etapas')
            .insert([{
                processo_id: processoAtual.id,
                etapa_de_id: processoAtual.etapa_atual_id,
                etapa_para_id: etapaDestId,
                usuario_id: perfilAtual?.id,
                condicao_aplicada: motivo,
                observacao: `Movido da Etapa ${processoAtual.etapa_atual_id || processoAtual.etapa_atual} para a Etapa ${numeroEtapaDestino}.`,
                dados_etapa: processoAtual.campos || {}
            }]);

        window.location.href = `etapa.html?processo=${processoAtual.id}`;
    } catch (err) {
        console.error('Erro ao mover processo:', err);
        alert('Erro ao mover o processo de etapa.');
        ocultarCarregamento();
    }
}

// ── Helper para Obter Infrações Selecionadas no Processo ──────────────────
function obterDispositivosDoProcesso(proc) {
    if (!proc) return ['Falta de limpeza e conservação de imóvel não edificado - Posturas (SUB Processo) | 120000232'];
    const d = proc.dados || {};
    if (d.infracoes && Array.isArray(d.infracoes.dispositivos) && d.infracoes.dispositivos.length > 0) {
        return d.infracoes.dispositivos;
    }
    if (proc.infracoes && Array.isArray(proc.infracoes.dispositivos) && proc.infracoes.dispositivos.length > 0) {
        return proc.infracoes.dispositivos;
    }
    if (Array.isArray(proc.infracoes_lista) && proc.infracoes_lista.length > 0) {
        return proc.infracoes_lista;
    }
    if (Array.isArray(d.infracoes) && d.infracoes.length > 0) {
        return d.infracoes;
    }
    if (Array.isArray(proc.infracoes) && proc.infracoes.length > 0) {
        return proc.infracoes;
    }
    return ['Falta de limpeza e conservação de imóvel não edificado - Posturas (SUB Processo) | 120000232'];
}

// ── Helper para Extrair Dados do Imóvel para Cálculo ────────────────────────
function obterDadosImovelParaCalculo(proc) {
    const imv = (proc && proc.imovel) || (proc && proc.dados && proc.dados.imovel) || {};
    const areaNum = parseFloat(imv.area_total) || 288;
    const testadaNum = parseFloat(imv.testada) || 12;
    const profundidadeNum = parseFloat(imv.profundidade) || 0;
    const temEsquina = (proc?.campos?.imovel_esquina === 'sim' ||
        imv.esquina === 'sim' ||
        imv.esquina === true ||
        imv.esquina === 1 ||
        imv.esquina === '1' ||
        imv.possui_esquina === 'sim');
    return { areaNum, testadaNum, profundidadeNum, temEsquina };
}

// ── Helper de Cálculo Padrão de Multa (conforme calculo multas.docx) ────────
function calcularValorNumDefaultMulta(dispLow, areaNum, testadaNum, profundidadeNum, temEsquina, upfmd) {
    let profCalc = 0;
    if (temEsquina) {
        profCalc = (profundidadeNum && profundidadeNum > 0) ? profundidadeNum : (testadaNum > 0 ? (areaNum / testadaNum) : 0);
    }
    const testadaTotal = testadaNum + profCalc;

    if (dispLow.includes('120000232') || dispLow.includes('limpeza e conservação') || dispLow.includes('não edificado')) {
        return areaNum * upfmd * 0.15;
    } else if (dispLow.includes('120000228') || dispLow.includes('reincidência na inexistência de cercamento')) {
        return testadaTotal * upfmd * 2;
    } else if (dispLow.includes('120000227') || dispLow.includes('reincidência na inexistência de passeio')) {
        return testadaTotal * upfmd * 2;
    } else if (dispLow.includes('120000211') || dispLow.includes('cercamento')) {
        return testadaTotal * upfmd;
    } else if (dispLow.includes('120000226') || dispLow.includes('inexistência de passeio') || (dispLow.includes('passeio') && !dispLow.includes('reparos') && !dispLow.includes('reconstrução'))) {
        return testadaTotal * upfmd;
    } else if (dispLow.includes('120000229') || dispLow.includes('reconstrução de/ou reparo de muro') || dispLow.includes('reparo de muro') ||
        dispLow.includes('120000240') || dispLow.includes('reconstrução e/ou reparo de passeio') ||
        dispLow.includes('muro em má conservação') || dispLow.includes('danificado')) {
        return testadaTotal * upfmd * 0.5;
    } else if (dispLow.includes('120000236') || dispLow.includes('estabelecimento sem alvará')) {
        return upfmd * 50;
    } else {
        return upfmd * 10;
    }
}

async function renderizarStepperPadrao(proc) {
    if (!proc) return;
    const etapaNum = parseInt(proc.etapa_atual || proc.etapa_atual_id || 1, 10);

    // Obter histórico de etapas do banco de dados para construir o fluxo percorrido
    let stagesList = notificacaoAtual ? [2] : [1]; // O processo sempre começa na Etapa 1, notificação na Etapa 2

    try {
        let query = supabaseClient
            .from('historico_etapas')
            .select('etapa_para_id, created_at')
            .eq('processo_id', proc.id)
            .order('created_at', { ascending: true });

        if (notificacaoAtual) {
            query = query.eq('notificacao_id', notificacaoAtual.id);
        }

        const { data: hist } = await query;

        if (hist && hist.length > 0) {
            hist.forEach(h => {
                if (h.etapa_para_id) {
                    stagesList.push(parseInt(h.etapa_para_id, 10));
                }
            });
        }
    } catch (err) {
        console.warn('Erro ao carregar historico_etapas para o stepper:', err);
    }

    // Adiciona a etapa atual no final caso ela não esteja na lista
    if (!stagesList.includes(etapaNum)) {
        stagesList.push(etapaNum);
    }

    // Remover duplicatas consecutivas (ex: se o processo ficou na mesma etapa por re-salvamento)
    const uniqueStagesList = [];
    stagesList.forEach(num => {
        if (uniqueStagesList.length === 0 || uniqueStagesList[uniqueStagesList.length - 1] !== num) {
            uniqueStagesList.push(num);
        }
    });

    const stepperTrack = document.querySelector('.process-stepper-bar:not(#stepperEtapa16) .stepper-track');
    if (stepperTrack) {
        let htmlContent = '';
        uniqueStagesList.forEach((num, index) => {
            const isLast = index === uniqueStagesList.length - 1;
            const stepNumText = `ETAPA ${num}`;
            const stepTitleText = ETAPAS_MAP[num] || 'Processamento';

            let classes = 'step-item active';
            if (isLast) {
                classes += ' current';
            }

            htmlContent += `
                <div class="${classes}" data-step="${index + 1}">
                    <div class="step-circle">${index + 1}</div>
                    <div class="step-label">
                        <span class="step-num">${stepNumText}</span>
                        <span class="step-title">${stepTitleText}</span>
                    </div>
                </div>
            `;

            if (!isLast) {
                htmlContent += `<div class="step-divider"></div>`;
            }
        });
        stepperTrack.innerHTML = htmlContent;
    }
}

async function renderizarPainelEtapa1(proc) {
    console.log('[DEBUG PAINEL] renderizarPainelEtapa1 chamada — etapa_atual:', proc?.etapa_atual, '| proc.id:', proc?.id);

    // 1. Atualizar Stepper Visual no Topo
    await renderizarStepperPadrao(proc);

    // 2. Preencher Inputs de Valores das Multas
    const listaInputs = document.getElementById('listaInputsMultas');
    console.log('[DEBUG PAINEL] elemento #listaInputsMultas encontrado?', !!listaInputs);
    const painelEl = document.getElementById('painelAcoesEtapa1');
    console.log('[DEBUG PAINEL] elemento #painelAcoesEtapa1 encontrado?', !!painelEl, '| display:', painelEl?.style.display || getComputedStyle(painelEl || document.body).display);
    if (listaInputs) {
        listaInputs.innerHTML = '';
        const { areaNum, testadaNum, profundidadeNum, temEsquina } = obterDadosImovelParaCalculo(proc);
        const upfmdAtualProc = valorUpfmdAtual || parseFloat(proc.campos?.upfmd_utilizado) || 103.00;
        const dispositivos = obterDispositivosDoProcesso(proc);
        console.log('[DEBUG PAINEL] dispositivos encontrados:', dispositivos);
        console.log('[DEBUG PAINEL] areaNum:', areaNum, '| testadaNum:', testadaNum, '| upfmd:', upfmdAtualProc);

        function obterNomeCompletoInfracao(disp) {
            if (!disp) return 'Infração Geral';
            const dispLow = disp.toLowerCase();
            if (disp.includes('120000232') || dispLow.includes('limpeza e conservação') || dispLow.includes('não edificado')) {
                return 'Falta de limpeza e conservação de imóvel não edificado (120000232)';
            } else if (disp.includes('120000228') || dispLow.includes('reincidência na inexistência de cercamento')) {
                return 'Reincidência na inexistência de cercamento (120000228)';
            } else if (disp.includes('120000227') || dispLow.includes('reincidência na inexistência de passeio')) {
                return 'Reincidência na inexistência de passeio (120000227)';
            } else if (disp.includes('120000211') || dispLow.includes('cercamento')) {
                return 'Inexistência de cercamento (120000211)';
            } else if (disp.includes('120000226') || dispLow.includes('inexistência de passeio')) {
                return 'Inexistência de passeio (120000226)';
            } else if (disp.includes('120000229') || dispLow.includes('reconstrução de/ou reparo de muro') || dispLow.includes('reparo de muro')) {
                return 'Reconstrução de/ou reparo de muro (120000229)';
            } else if (disp.includes('120000240') || dispLow.includes('reconstrução e/ou reparo de passeio')) {
                return 'Reconstrução e/ou reparo de passeio (120000240)';
            } else if (dispLow.includes('muro em má conservação') || dispLow.includes('danificado')) {
                return 'Muro em má conservação ou danificado';
            } else if (disp.includes('120000233') || dispLow.includes('limpeza de quintal')) {
                return 'Limpeza de quintal (120000233)';
            } else if (disp.includes('120000237') || dispLow.includes('obstáculos em calçadas')) {
                return 'Obstáculos em calçadas impedindo livre trânsito (120000237)';
            } else if (disp.includes('120000239') || dispLow.includes('água servida')) {
                return 'Água servida (120000239)';
            } else if (disp.includes('120000236') || dispLow.includes('estabelecimento sem alvará')) {
                return 'Estabelecimento sem alvará (120000236)';
            } else if (disp.includes('120000234') || dispLow.includes('reparos por concessionárias')) {
                return 'Reparos por concessionárias (120000234)';
            } else if (disp.includes('120000230') || dispLow.includes('piso tátil')) {
                return 'Inexistência de sinalização adequada - piso tátil (120000230)';
            } else {
                return disp.split('|')[0].trim();
            }
        }

        const inputUpfmdEl = document.getElementById('inputValUpfmd');
        const selectEsquinaEl = document.getElementById('selectEsquinaCalc');

        if (selectEsquinaEl) {
            selectEsquinaEl.value = temEsquina ? 'sim' : 'nao';
        }
        if (inputUpfmdEl) {
            inputUpfmdEl.value = upfmdAtualProc.toFixed(2);
        }

        const recalcularValoresTela = () => {
            const novoUpfmd = parseFloat(inputUpfmdEl?.value) || 103.00;
            const ehEsquina = (selectEsquinaEl?.value === 'sim');
            document.querySelectorAll('.input-multa-val').forEach((inputEl, idx) => {
                const disp = dispositivos[idx];
                if (disp) {
                    const recVal = calcularValorNumDefaultMulta(disp.toLowerCase(), areaNum, testadaNum, profundidadeNum, ehEsquina, novoUpfmd);
                    inputEl.value = recVal.toFixed(2);
                }
            });
        };

        if (inputUpfmdEl) inputUpfmdEl.addEventListener('input', recalcularValoresTela);
        if (selectEsquinaEl) selectEsquinaEl.addEventListener('change', recalcularValoresTela);

        const blocoReincidencia = document.getElementById('blocoReincidenciaAnterior');
        const inputAiNum = document.getElementById('inputAutoInfracaoAntNum');
        const inputAiData = document.getElementById('inputAutoInfracaoAntData');
        const temReincidencia = dispositivos.some(d => {
            const low = (d || '').toLowerCase();
            return low.includes('120000228') || low.includes('120000227') || low.includes('reincid');
        });

        if (blocoReincidencia) {
            blocoReincidencia.style.display = temReincidencia ? 'block' : 'none';
        }
        if (inputAiNum) {
            inputAiNum.value = proc.campos?.auto_infracao_anterior_numero || '';
            inputAiNum.addEventListener('input', () => {
                processoAtual.campos = processoAtual.campos || {};
                processoAtual.campos.auto_infracao_anterior_numero = inputAiNum.value;
                renderizarDocumentoOficial(processoAtual);
            });
        }
        if (inputAiData) {
            inputAiData.value = proc.campos?.auto_infracao_anterior_data || '';
            inputAiData.addEventListener('input', () => {
                processoAtual.campos = processoAtual.campos || {};
                processoAtual.campos.auto_infracao_anterior_data = inputAiData.value;
                renderizarDocumentoOficial(processoAtual);
            });
        }

        dispositivos.forEach((disp, index) => {
            const numNotif = `${proc.numero_processo || '1000'}-${index + 1}`;
            const dispLow = disp.toLowerCase();
            const defVal = calcularValorNumDefaultMulta(dispLow, areaNum, testadaNum, profundidadeNum, temEsquina, upfmdAtualProc);
            const customVal = proc.campos?.multas_customizadas?.[index];
            const valFinal = (customVal !== undefined && customVal !== null && customVal !== '')
                ? parseFloat(customVal)
                : defVal;
            const nomeFormatado = obterNomeCompletoInfracao(disp);

            const div = document.createElement('div');
            div.className = 'multa-input-card';
            div.innerHTML = `
                <label class="multa-label" title="${nomeFormatado}">
                    <span style="color:#7c3aed; font-weight:700;">NP N° ${numNotif}</span> — ${nomeFormatado}
                </label>
                <div class="input-money-wrapper">
                    <span class="currency-prefix">R$</span>
                    <input type="number" step="0.01" class="form-input input-multa-val" data-index="${index}" value="${valFinal.toFixed(2)}">
                </div>
            `;
            listaInputs.appendChild(div);
        });
    }

    // 3. Status e Exibição dos Anexos Assinados (NP e RF)
    const anexoNP = proc.campos?.anexo_np_assinada;
    const anexoRF = proc.campos?.anexo_rf_assinado;
    const areaDropNP = document.getElementById('areaDropNP');
    const anexoBoxNP = document.getElementById('anexoNPAtual');
    const areaDropRF = document.getElementById('areaDropRF');
    const anexoBoxRF = document.getElementById('anexoRFAtual');
    const badgeStatus = document.getElementById('badgeAnexoNPStatus');

    let totalAnexados = 0;

    if (anexoNP && (anexoNP.dataUrl || anexoNP.url || anexoNP.documento_id)) {
        totalAnexados++;
        if (areaDropNP) areaDropNP.style.display = 'none';
        if (anexoBoxNP) {
            anexoBoxNP.style.display = 'flex';
            const nmEl = document.getElementById('nomeArquivoNP');
            if (nmEl) nmEl.textContent = anexoNP.nome || 'notificacao_assinada.pdf';
            const btnVer = document.getElementById('btnVerAnexoNP');
            if (btnVer) {
                btnVer.href = '#';
                btnVer.onclick = (e) => window.abrirAnexoObjeto(anexoNP, e);
            }
        }
    } else {
        if (areaDropNP) areaDropNP.style.display = 'block';
        if (anexoBoxNP) anexoBoxNP.style.display = 'none';
    }

    if (anexoRF && (anexoRF.dataUrl || anexoRF.url || anexoRF.documento_id)) {
        totalAnexados++;
        if (areaDropRF) areaDropRF.style.display = 'none';
        if (anexoBoxRF) {
            anexoBoxRF.style.display = 'flex';
            const nmEl = document.getElementById('nomeArquivoRF');
            if (nmEl) nmEl.textContent = anexoRF.nome || 'relatorio_fiscal_assinado.pdf';
            const btnVer = document.getElementById('btnVerAnexoRF');
            if (btnVer) {
                btnVer.href = '#';
                btnVer.onclick = (e) => window.abrirAnexoObjeto(anexoRF, e);
            }
        }
    } else {
        if (areaDropRF) areaDropRF.style.display = 'block';
        if (anexoBoxRF) anexoBoxRF.style.display = 'none';
    }

    if (badgeStatus) {
        if (totalAnexados === 2) {
            badgeStatus.textContent = 'Anexados (2/2)';
            badgeStatus.classList.add('ok');
        } else if (totalAnexados === 1) {
            badgeStatus.textContent = 'Parcial (1/2)';
            badgeStatus.classList.remove('ok');
        } else {
            badgeStatus.textContent = 'Pendente (0/2)';
            badgeStatus.classList.remove('ok');
        }
    }
}

// Helper: Extrair texto de arquivo PDF / texto para validações de anexos
async function extrairTextoDoArquivo(file) {
    if (!file) return '';
    try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            if (typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
                const pdf = await loadingTask.promise;
                let textCompleto = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items.map(item => item.str).join(' ');
                    textCompleto += pageText + ' ';
                }
                return textCompleto;
            }
        } else if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.html')) {
            return await file.text();
        }
    } catch (err) {
        console.warn('Não foi possível extrair texto do arquivo anexado:', err);
    }
    return '';
}

function configurarEventosPainelEtapa1() {
    const btnAtualizarMultas = document.getElementById('btnAtualizarMultasDoc');
    if (btnAtualizarMultas) {
        btnAtualizarMultas.addEventListener('click', async () => {
            if (!processoAtual) return;
            processoAtual.campos = processoAtual.campos || {};
            processoAtual.campos.multas_customizadas = {};

            const novoUpfmd = parseFloat(document.getElementById('inputValUpfmd')?.value) || valorUpfmdAtual || 103.00;
            processoAtual.campos.upfmd_utilizado = novoUpfmd;
            processoAtual.campos.imovel_esquina = document.getElementById('selectEsquinaCalc')?.value || 'nao';
            const inputAiNum = document.getElementById('inputAutoInfracaoAntNum');
            const inputAiData = document.getElementById('inputAutoInfracaoAntData');
            if (inputAiNum) processoAtual.campos.auto_infracao_anterior_numero = inputAiNum.value.trim();
            if (inputAiData) processoAtual.campos.auto_infracao_anterior_data = inputAiData.value.trim();

            if (novoUpfmd) {
                try {
                    const { error: errUp } = await supabaseClient.from('configuracoes_upfmd').insert([{
                        valor: novoUpfmd,
                        ano: new Date().getFullYear()
                    }]);
                    if (errUp) {
                        console.warn('Erro do Supabase ao salvar em configuracoes_upfmd:', errUp.message);
                    } else {
                        valorUpfmdAtual = novoUpfmd;
                    }
                } catch (errUp) {
                    console.warn('Não foi possível gravar histórico em configuracoes_upfmd:', errUp);
                }
            }

            document.querySelectorAll('.input-multa-val').forEach(inp => {
                processoAtual.campos.multas_customizadas[inp.dataset.index] = parseFloat(inp.value) || 0;
            });

            processoAtual.dados = processoAtual.dados || {};
            processoAtual.dados.campos = processoAtual.campos;

            const { error } = await supabaseClient
                .from('processos')
                .update({ dados: processoAtual.dados })
                .eq('id', processoAtual.id);

            if (error) {
                console.error('Erro ao salvar multas:', error);
                alert('Erro ao salvar valores: ' + error.message);
                return;
            }

            renderizarDocumentoOficial(processoAtual);
            const fb = document.getElementById('multasSalvasFeedback');
            if (fb) {
                fb.style.display = 'inline';
                setTimeout(() => { fb.style.display = 'none'; }, 4000);
            }
        });
    }

    const areaDropNP = document.getElementById('areaDropNP');
    const inputArquivoNP = document.getElementById('inputArquivoNP');
    if (areaDropNP && inputArquivoNP) {
        areaDropNP.addEventListener('click', (e) => {
            if (e.target !== inputArquivoNP) inputArquivoNP.click();
        });

        inputArquivoNP.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Extrai texto para validação de conteúdo da Notificação Preliminar
            const textoExtraido = await extrairTextoDoArquivo(file);
            if (textoExtraido && textoExtraido.trim().length > 0) {
                const textoNorm = textoExtraido.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (!textoNorm.includes('NOTIFICACAO PRELIMINAR')) {
                    alert('⚠️ Documento Incompatível!\n\nO arquivo anexado não contém o texto "NOTIFICAÇÃO PRELIMINAR". Por favor, verifique se selecionou o documento correto.');
                    e.target.value = '';
                    return;
                }
            }

            const reader = new FileReader();
            reader.onload = async (ev) => {
                const fileUrl = ev.target.result;
                const perfilId = (typeof perfilAtual !== 'undefined' && perfilAtual?.id) ? perfilAtual.id : null;

                // 1. Salva/Atualiza a URL do arquivo na tabela centralizada 'documentos'
                let docId = null;
                try {
                    const { data: docExistente } = await supabaseClient
                        .from('documentos')
                        .select('id')
                        .eq('processo_id', processoAtual.id)
                        .eq('tipo', 'Notificação Preliminar')
                        .maybeSingle();

                    if (docExistente) {
                        const { data: docUp } = await supabaseClient
                            .from('documentos')
                            .update({
                                url: fileUrl,
                                nome_arquivo: file.name,
                                mime_type: file.type,
                                gerado_automaticamente: false,
                                usuario_id: perfilId || undefined
                            })
                            .eq('id', docExistente.id)
                            .select('id')
                            .single();
                        docId = docUp?.id || docExistente.id;
                    } else {
                        const { data: docIns } = await supabaseClient
                            .from('documentos')
                            .insert([{
                                processo_id: processoAtual.id,
                                etapa_id: processoAtual.etapa_atual_id || 1,
                                tipo: 'Notificação Preliminar',
                                nome_arquivo: file.name,
                                url: fileUrl,
                                mime_type: file.type,
                                gerado_automaticamente: false,
                                usuario_id: perfilId
                            }])
                            .select('id')
                            .single();
                        docId = docIns?.id;
                    }
                } catch (errDoc) {
                    console.error('Erro ao salvar documento em documentos:', errDoc);
                }

                // 2. Armazena apenas a referência por documento_id nos campos do processo
                processoAtual.campos = processoAtual.campos || {};
                processoAtual.campos.anexo_np_assinada = {
                    nome: file.name,
                    documento_id: docId,
                    data_upload: new Date().toISOString()
                };

                processoAtual.dados = processoAtual.dados || {};
                processoAtual.dados.campos = processoAtual.campos;

                processoAtual.dados.notificacao_preliminar = {
                    documento_id: docId,
                    assinado: true,
                    nome: file.name,
                    data_upload: new Date().toISOString()
                };

                const { error } = await supabaseClient
                    .from('processos')
                    .update({ dados: processoAtual.dados })
                    .eq('id', processoAtual.id);

                if (error) {
                    alert('Erro ao anexar Notificação Assinada: ' + error.message);
                } else {
                    renderizarPainelEtapa1(processoAtual);
                }
            };
            reader.readAsDataURL(file);
        });
    }

    const btnRemoverAnexoNP = document.getElementById('btnRemoverAnexoNP');
    if (btnRemoverAnexoNP) {
        btnRemoverAnexoNP.addEventListener('click', async () => {
            if (!processoAtual) return;
            if (!confirm('Deseja substituir ou remover a Notificação Preliminar Assinada?')) return;

            processoAtual.campos = processoAtual.campos || {};
            delete processoAtual.campos.anexo_np_assinada;
            processoAtual.dados = processoAtual.dados || {};
            processoAtual.dados.campos = processoAtual.campos;

            await supabaseClient
                .from('processos')
                .update({ dados: processoAtual.dados })
                .eq('id', processoAtual.id);

            renderizarPainelEtapa1(processoAtual);
        });
    }

    // Drag & Drop / Upload Relatório Fiscal Assinado (RF)
    const areaDropRF = document.getElementById('areaDropRF');
    const inputArquivoRF = document.getElementById('inputArquivoRF');
    if (areaDropRF && inputArquivoRF) {
        areaDropRF.addEventListener('click', (e) => {
            if (e.target !== inputArquivoRF) inputArquivoRF.click();
        });

        inputArquivoRF.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Extrai texto para validação do Relatório Fiscal
            const textoExtraido = await extrairTextoDoArquivo(file);
            if (textoExtraido && textoExtraido.trim().length > 0) {
                // Normaliza o texto removendo acentos e colapsando qualquer espaço/quebra de linha
                const textoNorm = textoExtraido.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

                // 1. Valida se contém "RELATORIO FISCAL" ou "RELATORIO"
                if (!textoNorm.includes('RELATORIO FISCAL') && !textoNorm.includes('RELATORIO')) {
                    alert('⚠️ Documento Incompatível!\n\nO arquivo anexado não contém o texto "RELATÓRIO FISCAL". Por favor, verifique se selecionou o documento correto.');
                    e.target.value = '';
                    return;
                }

                // 2. Valida se a numeração do Relatório/Processo coincide
                const numRel = (processoAtual.dados?.relatorio_fiscal?.numero_relatorio || processoAtual.numero_relatorio || '').trim();
                const numProc = (processoAtual.numero_processo || processoAtual.numero || '').trim();

                let bateuNumero = false;
                if (!numRel && !numProc) {
                    bateuNumero = true;
                } else {
                    const candidatos = [];
                    for (const raw of [numRel, numProc]) {
                        if (!raw) continue;
                        candidatos.push(raw);
                        candidatos.push(raw.replace('/', ''));
                        const partes = raw.split('/');
                        if (partes.length === 2) {
                            candidatos.push(`${partes[1]}/${partes[0]}`);
                            const p0Clean = partes[0].replace(/^0+/, '') || '0';
                            const p1Clean = partes[1].replace(/^0+/, '') || '0';
                            candidatos.push(`${p0Clean}/${p1Clean}`);
                            candidatos.push(`${p1Clean}/${p0Clean}`);
                        }
                    }

                    for (const cand of candidatos) {
                        const candNorm = cand.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        if (textoNorm.includes(candNorm)) {
                            bateuNumero = true;
                            break;
                        }
                    }

                    if (!bateuNumero) {
                        for (const raw of [numRel, numProc]) {
                            if (!raw) continue;
                            const numsEncontrados = (raw.match(/\d+/g) || []).map(n => n.replace(/^0+/, '')).filter(n => n !== '');
                            if (numsEncontrados.length > 0 && numsEncontrados.every(n => textoNorm.includes(n))) {
                                bateuNumero = true;
                                break;
                            }
                        }
                    }
                }

                if (!bateuNumero) {
                    const numEsperado = numRel || numProc;
                    alert(`⚠️ Numeração de Relatório Incompatível!\n\nO Relatório Fiscal anexado não corresponde a este processo.\n\nNúmero esperado: RELATÓRIO FISCAL ${numEsperado}\n\nPor favor, verifique o arquivo e tente novamente.`);
                    e.target.value = '';
                    return;
                }
            }

            const reader = new FileReader();
            reader.onload = async (ev) => {
                const fileUrl = ev.target.result;
                const perfilId = (typeof perfilAtual !== 'undefined' && perfilAtual?.id) ? perfilAtual.id : null;
                const numRel = (processoAtual.dados?.relatorio_fiscal?.numero_relatorio || processoAtual.numero_relatorio || '').trim();

                // 1. Salva/Atualiza a URL do arquivo na tabela centralizada 'documentos'
                let docId = null;
                try {
                    const { data: docExistente } = await supabaseClient
                        .from('documentos')
                        .select('id')
                        .eq('processo_id', processoAtual.id)
                        .eq('tipo', 'Relatório Fiscal')
                        .maybeSingle();

                    if (docExistente) {
                        const { data: docUp } = await supabaseClient
                            .from('documentos')
                            .update({
                                url: fileUrl,
                                nome_arquivo: file.name,
                                mime_type: file.type,
                                gerado_automaticamente: false,
                                usuario_id: perfilId || undefined
                            })
                            .eq('id', docExistente.id)
                            .select('id')
                            .single();
                        docId = docUp?.id || docExistente.id;
                    } else {
                        const { data: docIns } = await supabaseClient
                            .from('documentos')
                            .insert([{
                                processo_id: processoAtual.id,
                                etapa_id: processoAtual.etapa_atual_id || 1,
                                tipo: 'Relatório Fiscal',
                                nome_arquivo: file.name,
                                url: fileUrl,
                                mime_type: file.type,
                                gerado_automaticamente: false,
                                numero_sequencial: numRel || null,
                                usuario_id: perfilId
                            }])
                            .select('id')
                            .single();
                        docId = docIns?.id;
                    }
                } catch (errDoc) {
                    console.error('Erro ao salvar Relatório Fiscal em documentos:', errDoc);
                }

                // 2. Nos campos do processo, armazena apenas a referência por documento_id
                processoAtual.campos = processoAtual.campos || {};
                processoAtual.campos.anexo_rf_assinado = {
                    nome: file.name,
                    documento_id: docId,
                    data_upload: new Date().toISOString()
                };

                processoAtual.dados = processoAtual.dados || {};
                processoAtual.dados.campos = processoAtual.campos;

                const rfOld = processoAtual.dados.relatorio_fiscal || {};
                processoAtual.dados.relatorio_fiscal = {
                    documento_id: docId,
                    numero_relatorio: rfOld.numero_relatorio || numRel || '',
                    pa: rfOld.pa || '',
                    assinado: true,
                    nome: file.name,
                    data_upload: new Date().toISOString()
                };

                const { error } = await supabaseClient
                    .from('processos')
                    .update({ dados: processoAtual.dados })
                    .eq('id', processoAtual.id);

                if (error) {
                    alert('Erro ao anexar Relatório Fiscal Assinado: ' + error.message);
                } else {
                    renderizarPainelEtapa1(processoAtual);
                }
            };
            reader.readAsDataURL(file);
        });
    }

    const btnRemoverAnexoRF = document.getElementById('btnRemoverAnexoRF');
    if (btnRemoverAnexoRF) {
        btnRemoverAnexoRF.addEventListener('click', async () => {
            if (!processoAtual) return;
            if (!confirm('Deseja substituir ou remover o Relatório Fiscal Assinado?')) return;

            processoAtual.campos = processoAtual.campos || {};
            delete processoAtual.campos.anexo_rf_assinado;
            processoAtual.dados = processoAtual.dados || {};
            processoAtual.dados.campos = processoAtual.campos;

            await supabaseClient
                .from('processos')
                .update({ dados: processoAtual.dados })
                .eq('id', processoAtual.id);

            renderizarPainelEtapa1(processoAtual);
        });
    }
}

// ── Bloco e Validação da Réplica Assinada (Etapas 5 e 13) ───────────────────────
function gerarHtmlBlocoAnexoReplica() {
    return `
        <div class="card-anexo-replica" style="margin-top: 24px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
                <div style="background:#f3e8ff; padding:10px; border-radius:10px;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                </div>
                <div style="flex:1;">
                    <h4 style="margin:0; font-size:1rem; font-weight:700; color:#1e293b;">Anexar Réplica Assinada <span style="color:#ef4444;">*</span></h4>
                    <p style="margin:2px 0 0 0; color:#64748b; font-size:0.83rem;">Após gerar ou baixar a Réplica, anexe o documento final assinado em PDF aqui.</p>
                </div>
                <span id="badgeStatusAnexoReplica" class="badge-status-anexo" style="padding:4px 10px; border-radius:12px; font-size:0.8rem; font-weight:600; background:#f1f5f9; color:#64748b;">Pendente</span>
            </div>

            <div id="areaDropReplicaAssinada" class="drop-area-clean" style="border: 2px dashed #8b5cf6; border-radius: 10px; padding: 20px; text-align: center; background: #f5f3ff; cursor: pointer; transition: all 0.2s ease;">
                <p style="margin:0; font-weight:600; color:#5b21b6; font-size:0.95rem;">Clique para selecionar ou arraste a Réplica Assinada aqui</p>
                <p style="margin:4px 0 12px 0; color:#7c3aed; font-size:0.82rem;">Formato aceito: PDF (Máx. 10MB)</p>
                <input type="file" id="inputArquivoReplicaAssinada" accept=".pdf" style="display:none;" />
                <button type="button" class="btn-selecionar-arquivo" onclick="document.getElementById('inputArquivoReplicaAssinada').click()" style="padding:8px 16px; border-radius:6px; border:none; background:#7c3aed; cursor:pointer; font-weight:600; color:#ffffff; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.2);">Escolher Arquivo PDF</button>
            </div>

            <div id="anexoReplicaAtual" class="arquivo-anexado-box" style="display:none; margin-top:14px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:14px;">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div class="file-icon-badge" style="font-size:1.4rem;">📄</div>
                        <div>
                            <div id="nomeArquivoReplicaAssinada" style="font-weight:600; color:#0f172a; font-size:0.95rem;">replica_assinada.pdf</div>
                            <div id="dataArquivoReplicaAssinada" style="color:#16a34a; font-weight:600; font-size:0.8rem;">Anexado com sucesso</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <a id="btnVerAnexoReplica" href="#" target="_blank" class="btn-sm btn-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #cbd5e1; color:#334155; text-decoration:none; font-size:0.82rem; font-weight:600;">Visualizar</a>
                        <button id="btnRemoverAnexoReplica" type="button" class="btn-sm btn-danger-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #fecaca; background:#fef2f2; color:#dc2626; font-size:0.82rem; font-weight:600; cursor:pointer;">Substituir / Remover</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.configurarEventosReplicaAssinada = function () {
    const areaDrop = document.getElementById('areaDropReplicaAssinada');
    const inputArquivo = document.getElementById('inputArquivoReplicaAssinada');
    const btnRemover = document.getElementById('btnRemoverAnexoReplica');

    if (areaDrop && inputArquivo) {
        areaDrop.addEventListener('click', (e) => {
            if (e.target !== inputArquivo && !e.target.classList.contains('btn-selecionar-arquivo')) {
                inputArquivo.click();
            }
        });

        inputArquivo.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            mostrarCarregamento('Validando Réplica Assinada...');

            try {
                const textoExtraido = await extrairTextoDoArquivo(file);
                const textoNorm = (textoExtraido || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
                const nomeNorm = file.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                // 1. Validação da Nomenclatura "RÉPLICA"
                if (!textoNorm.includes('REPLICA') && !nomeNorm.includes('REPLICA')) {
                    ocultarCarregamento();
                    alert('⚠️ Documento Incompatível!\n\nO arquivo anexado não contém a palavra "RÉPLICA". Por favor, verifique se selecionou o documento correto.');
                    e.target.value = '';
                    return;
                }

                // 2. Validação da Numeração
                const numReplica = (notificacaoAtual?.dados?.numero_replica || '').trim();
                const numNotif = (notificacaoAtual?.numero || document.getElementById('etapaProcNumero')?.textContent || '').trim();
                const numProc = (processoAtual?.numero_processo || processoAtual?.numero || '').trim();

                let bateuNumero = false;
                if (!numReplica && !numNotif && !numProc) {
                    bateuNumero = true;
                } else {
                    const candidatos = [];
                    for (const raw of [numReplica, numNotif, numProc]) {
                        if (!raw) continue;
                        candidatos.push(raw);
                        candidatos.push(raw.replace('/', ''));
                        const partes = raw.split('/');
                        if (partes.length === 2) {
                            candidatos.push(`${partes[1]}/${partes[0]}`);
                            const p0Clean = partes[0].replace(/^0+/, '') || '0';
                            const p1Clean = partes[1].replace(/^0+/, '') || '0';
                            candidatos.push(`${p0Clean}/${p1Clean}`);
                            candidatos.push(`${p1Clean}/${p0Clean}`);
                        }
                    }

                    for (const cand of candidatos) {
                        const candNorm = cand.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        if (textoNorm.includes(candNorm) || nomeNorm.includes(candNorm)) {
                            bateuNumero = true;
                            break;
                        }
                    }

                    if (!bateuNumero) {
                        for (const raw of [numReplica, numNotif, numProc]) {
                            if (!raw) continue;
                            const numsEncontrados = (raw.match(/\d+/g) || []).map(n => n.replace(/^0+/, '')).filter(n => n !== '');
                            if (numsEncontrados.length > 0 && numsEncontrados.every(n => textoNorm.includes(n) || nomeNorm.includes(n))) {
                                bateuNumero = true;
                                break;
                            }
                        }
                    }
                }

                if (!bateuNumero) {
                    ocultarCarregamento();
                    const numEsperado = numReplica || numNotif || numProc;
                    alert(`⚠️ Numeração de Réplica Incompatível!\n\nA Réplica anexada não corresponde a esta notificação.\n\nNúmero esperado: RÉPLICA ${numEsperado}\n\nPor favor, verifique o arquivo e tente novamente.`);
                    e.target.value = '';
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const fileUrl = ev.target.result;
                    const perfilId = (typeof perfilAtual !== 'undefined' && perfilAtual?.id) ? perfilAtual.id : null;

                    let docId = notificacaoAtual?.dados?.replica_id || null;

                    try {
                        const { data: docExistente } = await supabaseClient
                            .from('documentos')
                            .select('id')
                            .eq('notificacao_id', notificacaoAtual.id)
                            .eq('tipo', 'Réplica')
                            .maybeSingle();

                        if (docExistente) {
                            docId = docExistente.id;
                            await supabaseClient
                                .from('documentos')
                                .update({
                                    url: fileUrl,
                                    nome_arquivo: file.name,
                                    mime_type: file.type,
                                    gerado_automaticamente: false,
                                    usuario_id: perfilId || undefined
                                })
                                .eq('id', docExistente.id);
                        } else {
                            const { data: docIns } = await supabaseClient
                                .from('documentos')
                                .insert([{
                                    processo_id: processoAtual.id,
                                    notificacao_id: notificacaoAtual.id,
                                    etapa_id: processoAtual.etapa_atual_id || 5,
                                    tipo: 'Réplica',
                                    nome_arquivo: file.name,
                                    url: fileUrl,
                                    mime_type: file.type,
                                    gerado_automaticamente: false,
                                    numero_sequencial: numReplica || null,
                                    usuario_id: perfilId
                                }])
                                .select('id')
                                .single();
                            docId = docIns?.id;
                        }
                    } catch (errDoc) {
                        console.error('Erro ao salvar Réplica em documentos:', errDoc);
                    }

                    // Salva na notificação APENAS o replica_id (sem salvar o arquivo base64 no JSON)
                    notificacaoAtual.dados = notificacaoAtual.dados || {};
                    notificacaoAtual.dados.replica_id = docId;
                    notificacaoAtual.dados.numero_replica = numReplica;
                    notificacaoAtual.dados.replica_assinada_nome = file.name;
                    notificacaoAtual.dados.data_upload_replica = new Date().toISOString();

                    await supabaseClient
                        .from('notificacoes')
                        .update({ dados: notificacaoAtual.dados })
                        .eq('id', notificacaoAtual.id);

                    window.exibirReplicaAssinadaUI(file.name, fileUrl);
                    ocultarCarregamento();
                    alert('Réplica Assinada anexada com sucesso!');
                };
                reader.readAsDataURL(file);
            } catch (errVal) {
                ocultarCarregamento();
                console.error('Erro ao validar Réplica:', errVal);
                alert('Erro ao validar e anexar Réplica Assinada.');
            }
        });
    }

    if (btnRemover) {
        btnRemover.addEventListener('click', async () => {
            if (!confirm('Deseja remover o anexo da Réplica Assinada?')) return;
            mostrarCarregamento('Removendo anexo...');
            try {
                if (notificacaoAtual?.dados?.replica_id) {
                    await supabaseClient
                        .from('documentos')
                        .update({ url: null })
                        .eq('id', notificacaoAtual.dados.replica_id);
                }

                if (notificacaoAtual?.dados) {
                    delete notificacaoAtual.dados.replica_assinada_nome;
                    delete notificacaoAtual.dados.data_upload_replica;
                    await supabaseClient
                        .from('notificacoes')
                        .update({ dados: notificacaoAtual.dados })
                        .eq('id', notificacaoAtual.id);
                }

                window.removerReplicaAssinadaUI();
                ocultarCarregamento();
            } catch (errRem) {
                ocultarCarregamento();
                console.error('Erro ao remover Réplica Assinada:', errRem);
                alert('Erro ao remover anexo da Réplica Assinada.');
            }
        });
    }
};

window.carregarEExibirAnexoReplicaAssinada = async function () {
    if (!notificacaoAtual) return;

    let docReplica = null;
    if (notificacaoAtual.dados?.replica_id) {
        const { data } = await supabaseClient
            .from('documentos')
            .select('id, url, nome_arquivo, created_at')
            .eq('id', notificacaoAtual.dados.replica_id)
            .maybeSingle();
        docReplica = data;
    }

    if (!docReplica && notificacaoAtual.id) {
        const { data } = await supabaseClient
            .from('documentos')
            .select('id, url, nome_arquivo, created_at')
            .eq('notificacao_id', notificacaoAtual.id)
            .eq('tipo', 'Réplica')
            .not('url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        docReplica = data;
    }

    if (docReplica && docReplica.url) {
        window.exibirReplicaAssinadaUI(docReplica.nome_arquivo || 'Replica_Assinada.pdf', docReplica.url);
    } else {
        window.removerReplicaAssinadaUI();
    }
};

window.exibirReplicaAssinadaUI = function (nome, url) {
    const areaDrop = document.getElementById('areaDropReplicaAssinada');
    const boxAtual = document.getElementById('anexoReplicaAtual');
    const nomeEl = document.getElementById('nomeArquivoReplicaAssinada');
    const btnVer = document.getElementById('btnVerAnexoReplica');
    const badge = document.getElementById('badgeStatusAnexoReplica');

    if (areaDrop) areaDrop.style.display = 'none';
    if (boxAtual) boxAtual.style.display = 'block';
    if (nomeEl) nomeEl.textContent = nome;
    if (btnVer) btnVer.href = url;
    if (badge) {
        badge.textContent = 'Anexado';
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
    }
};

window.removerReplicaAssinadaUI = function () {
    const areaDrop = document.getElementById('areaDropReplicaAssinada');
    const boxAtual = document.getElementById('anexoReplicaAtual');
    const inputArquivo = document.getElementById('inputArquivoReplicaAssinada');
    const badge = document.getElementById('badgeStatusAnexoReplica');

    if (areaDrop) areaDrop.style.display = 'block';
    if (boxAtual) boxAtual.style.display = 'none';
    if (inputArquivo) inputArquivo.value = '';
    if (badge) {
        badge.textContent = 'Pendente';
        badge.style.background = '#f1f5f9';
        badge.style.color = '#64748b';
    }
};

// ── Bloco de Anexo da Certidão Assinada (Etapas 10 e 29) ───────────────────
window.obterHtmlBlocoCertidaoAssinada = function () {
    return `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-top:20px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:10px; border-radius:10px; display:flex; align-items:center; justify-content:center;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                </div>
                <div style="flex:1;">
                    <h4 style="margin:0; font-size:1rem; font-weight:700; color:#1e293b;">Anexar Certidão Assinada <span style="color:#ef4444;">*</span></h4>
                    <p style="margin:2px 0 0 0; color:#64748b; font-size:0.83rem;">Após gerar ou baixar a Certidão, anexe o documento final assinado em PDF aqui.</p>
                </div>
                <span id="badgeStatusAnexoCertidao" class="badge-status-anexo" style="padding:4px 10px; border-radius:12px; font-size:0.8rem; font-weight:600; background:#f1f5f9; color:#64748b;">Pendente</span>
            </div>

            <div id="areaDropCertidaoAssinada" class="drop-area-clean" style="border: 2px dashed #10b981; border-radius: 10px; padding: 20px; text-align: center; background: #ecfdf5; cursor: pointer; transition: all 0.2s ease;">
                <p style="margin:0; font-weight:600; color:#047857; font-size:0.95rem;">Clique para selecionar ou arraste a Certidão Assinada aqui</p>
                <p style="margin:4px 0 12px 0; color:#059669; font-size:0.82rem;">Formato aceito: PDF (Máx. 10MB)</p>
                <input type="file" id="inputArquivoCertidaoAssinada" accept=".pdf" style="display:none;" />
                <button type="button" class="btn-selecionar-arquivo" onclick="document.getElementById('inputArquivoCertidaoAssinada').click()" style="padding:8px 16px; border-radius:6px; border:none; background:#10b981; cursor:pointer; font-weight:600; color:#ffffff; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);">Escolher Arquivo PDF</button>
            </div>

            <div id="anexoCertidaoAtual" class="arquivo-anexado-box" style="display:none; margin-top:14px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:14px;">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div class="file-icon-badge" style="font-size:1.4rem;">📄</div>
                        <div>
                            <div id="nomeArquivoCertidaoAssinada" style="font-weight:600; color:#0f172a; font-size:0.95rem;">certidao_assinada.pdf</div>
                            <div id="dataArquivoCertidaoAssinada" style="color:#16a34a; font-weight:600; font-size:0.8rem;">Anexado com sucesso</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <a id="btnVerAnexoCertidao" href="#" target="_blank" class="btn-sm btn-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #cbd5e1; color:#334155; text-decoration:none; font-size:0.82rem; font-weight:600;">Visualizar</a>
                        <button id="btnRemoverAnexoCertidao" type="button" class="btn-sm btn-danger-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #fecaca; background:#fef2f2; color:#dc2626; font-size:0.82rem; font-weight:600; cursor:pointer;">Substituir / Remover</button>
                    </div>
                </div>
            </div>
        </div>
    `;
};

window.configurarEventosCertidaoAssinada = function () {
    const areaDrop = document.getElementById('areaDropCertidaoAssinada');
    const inputArquivo = document.getElementById('inputArquivoCertidaoAssinada');
    const btnRemover = document.getElementById('btnRemoverAnexoCertidao');

    if (areaDrop && inputArquivo) {
        areaDrop.addEventListener('click', (e) => {
            if (e.target !== inputArquivo && !e.target.classList.contains('btn-selecionar-arquivo')) {
                inputArquivo.click();
            }
        });

        inputArquivo.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            mostrarCarregamento('Validando Certidão Assinada...');

            try {
                const textoExtraido = await extrairTextoDoArquivo(file);
                const textoNorm = (textoExtraido || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
                const nomeNorm = file.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                // 1. Validação da Nomenclatura "CERTIDAO"
                if (!textoNorm.includes('CERTIDAO') && !nomeNorm.includes('CERTIDAO')) {
                    ocultarCarregamento();
                    alert('⚠️ Documento Incompatível!\n\nO arquivo anexado não contém a palavra "CERTIDÃO". Por favor, verifique se selecionou o documento correto.');
                    e.target.value = '';
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const fileUrl = ev.target.result;
                    const perfilId = (typeof perfilAtual !== 'undefined' && perfilAtual?.id) ? perfilAtual.id : null;

                    let docId = notificacaoAtual?.dados?.certidao_id || null;
                    let numCertidao = notificacaoAtual?.dados?.certidao_numero_sequencial || notificacaoAtual?.numero_certidao || null;

                    try {
                        const { data: docExistente } = await supabaseClient
                            .from('documentos')
                            .select('id, numero_sequencial')
                            .eq('notificacao_id', notificacaoAtual.id)
                            .in('tipo', ['Certidão', 'Certidão Sem Defesa'])
                            .maybeSingle();

                        if (docExistente) {
                            docId = docExistente.id;
                            if (docExistente.numero_sequencial) numCertidao = docExistente.numero_sequencial;
                            await supabaseClient
                                .from('documentos')
                                .update({
                                    url: fileUrl,
                                    nome_arquivo: file.name,
                                    mime_type: file.type,
                                    gerado_automaticamente: false,
                                    usuario_id: perfilId || undefined
                                })
                                .eq('id', docExistente.id);
                        } else {
                            const { data: docIns } = await supabaseClient
                                .from('documentos')
                                .insert([{
                                    processo_id: processoAtual.id,
                                    notificacao_id: notificacaoAtual.id,
                                    etapa_id: processoAtual.etapa_atual_id || 10,
                                    tipo: 'Certidão',
                                    nome_arquivo: file.name,
                                    url: fileUrl,
                                    mime_type: file.type,
                                    gerado_automaticamente: false,
                                    numero_sequencial: numCertidao || null,
                                    usuario_id: perfilId
                                }])
                                .select('id')
                                .single();
                            docId = docIns?.id;
                        }
                    } catch (errDoc) {
                        console.error('Erro ao salvar Certidão em documentos:', errDoc);
                    }

                    // Salva na notificação APENAS a referência certidao_id (sem salvar URL/Base64 no JSON)
                    notificacaoAtual.dados = notificacaoAtual.dados || {};
                    notificacaoAtual.dados.certidao_id = docId;
                    if (numCertidao) notificacaoAtual.dados.certidao_numero_sequencial = numCertidao;
                    notificacaoAtual.dados.certidao_assinada_nome = file.name;
                    notificacaoAtual.dados.data_upload_certidao = new Date().toISOString();

                    await supabaseClient
                        .from('notificacoes')
                        .update({ dados: notificacaoAtual.dados })
                        .eq('id', notificacaoAtual.id);

                    window.exibirCertidaoAssinadaUI(file.name, fileUrl);
                    ocultarCarregamento();
                    alert('Certidão Assinada anexada com sucesso!');
                };
                reader.readAsDataURL(file);
            } catch (errVal) {
                ocultarCarregamento();
                console.error('Erro ao validar Certidão:', errVal);
                alert('Erro ao validar e anexar Certidão Assinada.');
            }
        });
    }

    if (btnRemover) {
        btnRemover.addEventListener('click', async () => {
            if (!confirm('Deseja remover o anexo da Certidão Assinada?')) return;
            mostrarCarregamento('Removendo anexo...');
            try {
                let docId = notificacaoAtual?.dados?.certidao_id;
                if (docId) {
                    await supabaseClient
                        .from('documentos')
                        .update({ url: null })
                        .eq('id', docId);
                }

                if (notificacaoAtual?.dados) {
                    delete notificacaoAtual.dados.certidao_assinada_nome;
                    delete notificacaoAtual.dados.data_upload_certidao;
                    await supabaseClient
                        .from('notificacoes')
                        .update({ dados: notificacaoAtual.dados })
                        .eq('id', notificacaoAtual.id);
                }

                window.removerCertidaoAssinadaUI();
                ocultarCarregamento();
            } catch (errRem) {
                ocultarCarregamento();
                console.error('Erro ao remover Certidão Assinada:', errRem);
                alert('Erro ao remover anexo da Certidão Assinada.');
            }
        });
    }
};

window.carregarEExibirAnexoCertidaoAssinada = async function () {
    if (!notificacaoAtual) return;

    let docCertidao = null;
    if (notificacaoAtual.dados?.certidao_id) {
        const { data } = await supabaseClient
            .from('documentos')
            .select('id, url, nome_arquivo, created_at')
            .eq('id', notificacaoAtual.dados.certidao_id)
            .maybeSingle();
        docCertidao = data;
    }

    if (!docCertidao && notificacaoAtual.id) {
        const { data } = await supabaseClient
            .from('documentos')
            .select('id, url, nome_arquivo, created_at')
            .eq('notificacao_id', notificacaoAtual.id)
            .in('tipo', ['Certidão', 'Certidão Sem Defesa'])
            .not('url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        docCertidao = data;
    }

    if (docCertidao && docCertidao.url) {
        window.exibirCertidaoAssinadaUI(docCertidao.nome_arquivo || 'Certidao_Assinada.pdf', docCertidao.url);
    } else {
        window.removerCertidaoAssinadaUI();
    }
};

window.exibirCertidaoAssinadaUI = function (nome, url) {
    const areaDrop = document.getElementById('areaDropCertidaoAssinada');
    const boxAtual = document.getElementById('anexoCertidaoAtual');
    const nomeEl = document.getElementById('nomeArquivoCertidaoAssinada');
    const btnVer = document.getElementById('btnVerAnexoCertidao');
    const badge = document.getElementById('badgeStatusAnexoCertidao');

    if (areaDrop) areaDrop.style.display = 'none';
    if (boxAtual) boxAtual.style.display = 'block';
    if (nomeEl) nomeEl.textContent = nome;
    if (btnVer) btnVer.href = url;
    if (badge) {
        badge.textContent = 'Anexado';
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
    }
};

window.removerCertidaoAssinadaUI = function () {
    const areaDrop = document.getElementById('areaDropCertidaoAssinada');
    const boxAtual = document.getElementById('anexoCertidaoAtual');
    const inputArquivo = document.getElementById('inputArquivoCertidaoAssinada');
    const badge = document.getElementById('badgeStatusAnexoCertidao');

    if (areaDrop) areaDrop.style.display = 'block';
    if (boxAtual) boxAtual.style.display = 'none';
    if (inputArquivo) inputArquivo.value = '';
    if (badge) {
        badge.textContent = 'Pendente';
        badge.style.background = '#f1f5f9';
        badge.style.color = '#64748b';
    }
};

// ── Avançar da Etapa 1 para a Etapa 1.2 (Retorno do AR) ───────────────────
async function avancarEtapa1() {
    if (!processoAtual) return;

    const anexoNP = processoAtual.campos?.anexo_np_assinada;
    const anexoRF = processoAtual.campos?.anexo_rf_assinado;

    if (!anexoNP || !anexoRF) {
        let msg = 'Atenção: Para avançar da Etapa 1, é obrigatório anexar os seguintes documentos no 2º passo:';
        if (!anexoNP) msg += '\n• Notificação Preliminar Assinada';
        if (!anexoRF) msg += '\n• Relatório Fiscal Assinado';
        alert(msg);
        return;
    }

    if (!confirm('Deseja avançar o processo para a Etapa 1.2 (Retorno do AR)?\nApós o avanço, o Administrativo de Posturas fará o registro do AR.')) {
        return;
    }

    mostrarCarregamento('Avançando etapa...');

    try {
        const { data: etapa16 } = await supabaseClient
            .from('etapas')
            .select('id')
            .eq('numero', 16)
            .maybeSingle();
        const etapa16Id = etapa16 ? etapa16.id : 16;

        await supabaseClient
            .from('processos')
            .update({ etapa_atual_id: etapa16Id, status: 'aguardando_ar' })
            .eq('id', processoAtual.id);

        await supabaseClient
            .from('notificacoes')
            .update({ etapa_atual_id: etapa16Id, data_movimentacao: new Date().toISOString() })
            .eq('processo_id', processoAtual.id);

        await supabaseClient
            .from('historico_etapas')
            .insert([{
                processo_id: processoAtual.id,
                etapa_de_id: processoAtual.etapa_atual_id,
                etapa_para_id: etapa16Id,
                usuario_id: perfilAtual?.id,
                condicao_aplicada: 'Notificação Preliminar e Relatório Fiscal assinados anexados',
                observacao: 'Processo enviado para o Administrativo de Posturas registrar o AR.',
                dados_etapa: {
                    anexo_np_nome: anexoNP?.nome,
                    anexo_rf_nome: anexoRF?.nome,
                    data_upload: new Date().toISOString()
                }
            }]);

        window.location.href = `etapa.html?processo=${processoAtual.id}`;
    } catch (err) {
        console.error('Erro ao avançar para Etapa 1.2:', err);
        alert('Erro ao avançar o processo. Tente novamente.');
        ocultarCarregamento();
    }
}

// ── Preencher Cabeçalho e Badges ──────────────────────────────────────────
function preencherCabecalhoPagina(proc) {
    const elNum = document.getElementById('etapaProcNumero');
    if (elNum) {
        if (notificacaoAtual) {
            elNum.parentNode.innerHTML = `Notificação Nº <span id="etapaProcNumero">${notificacaoAtual.numero || 'S/N'}</span>`;
            const btnVoltarPainel = document.querySelector('.etapa-topbar .btn-voltar[href="painel.html"]');
            if (btnVoltarPainel) {
                btnVoltarPainel.href = `etapa.html?processo=${proc.id}`;
                btnVoltarPainel.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                    Voltar ao Processo
                `;
            }
        } else {
            elNum.parentNode.innerHTML = `Processo Nº <span id="etapaProcNumero">${proc.numero_processo || 'S/N'}</span>`;
        }
    }

    const elBadgeNum = document.getElementById('etapaNumBadge');
    if (elBadgeNum) {
        const numEtapaExibida = notificacaoAtual
            ? (notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual || 2)
            : (proc.etapa_atual || proc.etapa_atual_id || 1);
        elBadgeNum.textContent = `Etapa ${numEtapaExibida}`;
    }

    const elBadgeSt = document.getElementById('etapaStatusBadge');
    if (elBadgeSt) {
        const rawStatus = proc.status || 'em_aberto';
        const stLow = rawStatus.toLowerCase();

        // Mapeamento amigável do status
        const statusMap = {
            'em_aberto': 'Em Aberto',
            'em_andamento': 'Em Andamento',
            'aguardando_ar': 'Aguardando AR',
            'prazo_ar_expirado': 'Prazo do AR Expirado',
            'finalizado': 'Finalizado',
            'cancelado': 'Cancelado'
        };

        const friendlyStatus = statusMap[stLow] || rawStatus;
        elBadgeSt.textContent = friendlyStatus;

        let bg = '#dcfce7'; // green default (finalizado / concluido)
        let color = '#166534';

        if (stLow === 'em_aberto' || stLow === 'em_andamento') {
            bg = '#eff6ff'; // blue
            color = '#1e40af';
        } else if (stLow === 'aguardando_ar') {
            bg = '#fef9c3'; // yellow
            color = '#854d0e';
        } else if (stLow === 'prazo_ar_expirado' || stLow === 'cancelado') {
            bg = '#fee2e2'; // red
            color = '#991b1b';
        }
        elBadgeSt.style.background = bg;
        elBadgeSt.style.color = color;
    }
}

// ── Preencher Formulário da Aba "Editar Dados" ────────────────────────────
function preencherFormularioEdicao(proc) {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val !== undefined && val !== null ? val : '';
    };

    const d = proc.dados || {};
    const cont = d.contribuinte || {};
    const imv = d.imovel || {};
    const fisc = d.fiscal || {};

    setVal('editProcId', proc.id);

    setVal('editContNome', cont.nome);
    setVal('editContCpfCnpj', cont.cpf_cnpj);
    setVal('editContLogradouro', cont.logradouro);
    setVal('editContNumero', cont.numero);
    setVal('editContComplemento', cont.complemento);
    setVal('editContBairro', cont.bairro);
    setVal('editContMunicipio', cont.municipio || 'Divinópolis');
    setVal('editContCep', cont.cep || '');

    setVal('editImvCodigo', imv.codigo_reduzido);
    setVal('editImvInscricao', imv.inscricao);
    setVal('editImvLogradouro', imv.logradouro);
    setVal('editImvNumero', imv.numero);
    setVal('editImvBairro', imv.bairro);
    setVal('editImvTestada', imv.testada || '');
    setVal('editImvArea', imv.area_total || '');

    setVal('editFiscDataVistoria', fisc.data_vistoria);
    setVal('editFiscDecreto', fisc.decreto || 'não');
    setVal('editFiscDescricao', fisc.descricao);
}

// ── Gera o HTML do bloco de uma única notificação/infração ────────────────
function gerarBlocoInfracao(proc, disp, index) {
    const numNotif = `${proc.numero_processo || '1000'}-${index + 1}`;
    const dispLow = (disp || '').toLowerCase();
    const { areaNum, testadaNum, profundidadeNum, temEsquina } = obterDadosImovelParaCalculo(proc);
    const upfmd = valorUpfmdAtual || parseFloat(proc.campos?.upfmd_utilizado) || 103.00;
    const defaultMulta = calcularValorNumDefaultMulta(dispLow, areaNum, testadaNum, profundidadeNum, temEsquina, upfmd);
    const customMulta = proc.campos?.multas_customizadas?.[index];
    const valMultaFinal = (customMulta !== undefined && customMulta !== null && customMulta !== '')
        ? parseFloat(customMulta)
        : defaultMulta;
    const valFormatado = valMultaFinal.toFixed(2).replace('.', ',');

    let titulo = '';
    let prazo = '';
    let itens = '';
    let penalidade = '';
    let obsFiscal = '';

    const numAI = proc.campos?.auto_infracao_anterior_numero || 'XXXX';
    const dataAI = proc.campos?.auto_infracao_anterior_data || 'XX/ XX/ 20XX';
    const textoObsReincidencia = `Na hipótese de reincidência, aplicar-se-á em dobro a multa respectivamente prevista no art. 4º da Lei 7.174/2010. Auto de Infração expedido anteriormente: nº ${numAI} em ${dataAI}.`;

    if (disp.includes('120000232') || dispLow.includes('limpeza e conservação') || dispLow.includes('não edificado')) {
        titulo = 'Falta de limpeza e conservação de imóvel não edificado: infração aos artigos 1º e 2º, III, da Lei 7.174/2010.';
        prazo = '15 DIAS';
        itens = `<li>Executar o serviço de limpeza e remoção do lixo doméstico e entulhos (quando houver) do imóvel de sua propriedade.</li>
                 <li><strong>Proibido:</strong> queimadas, cortar árvores e movimentação de terra (terraplanagem).</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 3º, IV da LEI 7.174/2010, e outras legislações. MULTA NO VALOR DE 15% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) multiplicado pela área total do lote, atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (disp.includes('120000228') || dispLow.includes('reincidência na inexistência de cercamento')) {
        titulo = 'Reincidência na Inexistência de Cercamento: Infração ao artigo 2º, I, da Lei 7.174/2010.';
        prazo = '60 DIAS';
        itens = `<li>Executar os serviço de construção de muro do imóvel de sua propriedade.</li>
                 <li><strong>Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010:</strong> muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.</li>
                 <li><strong>Não autorizado:</strong> arames lisos e farpado, e cerca viva.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 3º, I, da Lei 7.174/2010, e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, multiplicado por 2 (dois) atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        obsFiscal = textoObsReincidencia;
    } else if (disp.includes('120000227') || dispLow.includes('reincidência na inexistência de passeio')) {
        titulo = 'Reincidência na Inexistência de passeio: infração ao artigo 1º, § 1º e artigo 2º, I, da Lei 7.174/2010.';
        prazo = '60 DIAS';
        itens = `<li>Executar o serviço de construção de passeio pela testada do imóvel de sua propriedade.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 3º, II, da Lei 7.174/2010 e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada multiplicado por 2 (dois), atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong> (valor dobrado em face da reincidência na infração).`;
        obsFiscal = textoObsReincidencia;
    } else if (disp.includes('120000211') || dispLow.includes('cercamento')) {
        titulo = 'Inexistência de cercamento: infração ao artigo 1º da Lei 7.174/2010.';
        prazo = '60 DIAS';
        itens = `<li>Executar os serviço de construção de muro do imóvel de sua propriedade.</li>
                 <li><strong>Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010:</strong> muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.</li>
                 <li><strong>Não autorizado:</strong> arames lisos e farpado, e cerca viva.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, I e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (disp.includes('120000226') || dispLow.includes('inexistência de passeio')) {
        titulo = 'Inexistência de passeio: infração ao artigo 1º, § 1º e artigo 2º, I, da Lei 7.174/2010.';
        prazo = '60 DIAS';
        itens = `<li>Executar o serviço de construção de passeio pela testada do imóvel de sua propriedade.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, II e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (disp.includes('120000229') || dispLow.includes('reconstrução de/ou reparo de muro') || dispLow.includes('reparo de muro')) {
        titulo = 'Reconstrução e/ou reparo de muro: infração ao artigo 2º, II, da Lei 7.174/2010.';
        prazo = '15 DIAS';
        itens = `<li>Executar o serviço de reconstrução de muro pela testada do imóvel de sua propriedade.</li>
                 <li><strong>Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010:</strong> muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.</li>
                 <li><strong>Não autorizado:</strong> arames lisos e farpado, e cerca viva.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, III e outras legislações. MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (disp.includes('120000240') || dispLow.includes('reconstrução e/ou reparo de passeio')) {
        titulo = 'Reconstrução e/ou reparo de passeio: infração ao artigo 1º, § 1º e artigo 2º, II, da Lei 7.174/2010.';
        prazo = '15 DIAS';
        itens = `<li>Executar o serviço de reconstrução de passeio/calçada pela testada do imóvel de sua propriedade.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, III e outras legislações. MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (dispLow.includes('muro em má conservação') || dispLow.includes('danificado')) {
        titulo = 'Muro em má conservação ou danificado: infração ao artigo 1º, § 1º e artigo 2º, II, da Lei 7.174/2010.';
        prazo = '15 DIAS';
        itens = `<li>Executar o serviço de reconstrução de passeio/calçada pela testada do imóvel de sua propriedade.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela 7.174/2010, artigo 3º, III e outras legislações. MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (disp.includes('120000233') || dispLow.includes('limpeza de quintal')) {
        titulo = 'Limpeza de quintal: infração aos artigos 14 e 15 da Lei nº 6.907/2008.';
        prazo = '10 DIAS';
        itens = `<li>Executar o serviço de limpeza e remoção do lixo doméstico e entulhos (quando houver) do imóvel de sua propriedade.</li>
                 <li><strong>Proibido:</strong> Queimadas, cortar árvores e movimentação de terra (terraplanagem).</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 18 da LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008, e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (disp.includes('120000237') || dispLow.includes('obstáculos em calçadas')) {
        titulo = 'Obstáculos em calçadas impedindo o livre trânsito de pedestres e veículos: infração ao artigo 6°, XIII, XIV da Lei 6.907/2008.';
        prazo = '10 DIAS';
        itens = `<li>Retirar os obstáculos do passeio.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 11 da LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008, e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (disp.includes('120000239') || dispLow.includes('água servida')) {
        titulo = 'Água servida: infração ao artigo 6, inciso IV da Lei nº 6.907/2008.';
        prazo = '10 DIAS';
        itens = `<li>Ligação da água servida à rede de esgoto.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 11 da LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008 e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (disp.includes('120000236') || dispLow.includes('estabelecimento sem alvará')) {
        titulo = 'Estabelecimento sem alvará: infração ao artigo 190 da Lei nº 6.907/2008.';
        prazo = '10 DIAS';
        itens = `<li>Regularizar o alvará de funcionamento e localização.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 195, LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008, E OUTRAS LEGISLAÇÕES. MULTA NO VALOR DE: 50 UPFMD, atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (disp.includes('120000234') || dispLow.includes('reparos por concessionárias')) {
        titulo = 'Reparos por concessionárias: infração ao artigo 163 da Lei 6907/2008 e ao artigo 1º, §3º, da Lei nº 7.174/2010.';
        prazo = '10 DIAS, a contar do término de sua respectiva obra e serviço';
        itens = `<li>Executar serviço de reconstrução de muros e passeios danificados.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 172 da Lei 6907/2008 e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else if (disp.includes('120000230') || dispLow.includes('piso tátil')) {
        titulo = 'Inexistência de sinalização adequada piso tátil: infração ao artigo 106, IV, da Lei 6.907/2008.';
        prazo = '10 DIAS';
        itens = `<li>Executar a sinalização adequada no piso de acordo com as normas vigentes com alerta para portadores de deficiência.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 142 da Lei nº 6.907/ 2008 e outras legislações. MULTA NO VALOR DE 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
    } else {
        titulo = `Infração constatada: ${disp}`;
        prazo = '10 DIAS';
        itens = `<li>Regularizar a situação técnica e documental junto à Secretaria de Meio Ambiente e Cuidado Animal - SEMAC nos termos da legislação municipal vigente.</li>`;
        penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas na legislação municipal vigente.`;
    }

    const obsHtml = obsFiscal ? `<p style="margin:8px 0 0 0; font-size:10.5pt; color:#333;"><strong>Observação do Fiscal:</strong> ${obsFiscal}</p>` : '';

    return `
        <div class="doc-infracao-bloco" data-notificacao-index="${index}">
            <div class="doc-infracao-titulo">NOTIFICAÇÃO PRELIMINAR N° ${numNotif}</div>
            <p style="margin:4px 0;"><strong>${titulo}</strong></p>
            <p style="margin:10px 0 6px 0;">O autuado tem o prazo de até <strong>${prazo}</strong> para tomar as providências:</p>
            <ul class="doc-infracao-ul">
                ${itens}
            </ul>
            <p style="margin:10px 0 0 0; text-align:justify;">${penalidade}</p>
            ${obsHtml}
        </div>
    `;
}

// ── Renderizar Documento Oficial IDÊNTICO ao Modelo .docx ─────────────────
function renderizarDocumentoOficial(proc) {
    console.log('[DEBUG] renderizarDocumentoOficial — container:', !!document.getElementById('containerDocumentoOficial'));
    const container = document.getElementById('containerDocumentoOficial');
    if (!container) return;

    const etapaAtual = (typeof notificacaoAtual !== 'undefined' && notificacaoAtual)
        ? parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || proc?.etapa_atual || proc?.etapa_atual_id || 1, 10)
        : parseInt(proc?.etapa_atual || proc?.etapa_atual_id || 1, 10);

    const ehAuto = (typeof notificacaoAtual !== 'undefined' && notificacaoAtual) ? ehStatusAutoInfracao(notificacaoAtual) : (etapaAtual >= 14 || ehStatusAutoInfracao(proc));

    if (ehAuto) {
        if (window.gerarAutoDeInfracao) {
            window.gerarAutoDeInfracao(true);
            return;
        }
    }

    if (etapaAtual === 5 || etapaAtual === 13) {
        if (window.gerarReplica) window.gerarReplica();
        return;
    }
    if (etapaAtual === 10) {
        if (window.gerarCertidaoSemDefesa) window.gerarCertidaoSemDefesa();
        return;
    }
    if (etapaAtual === 14) {
        if (window.gerarAutoDeInfracao) window.gerarAutoDeInfracao();
        return;
    }

    const d = proc.dados || {};
    const cont = d.contribuinte || {};
    const imv = d.imovel || {};
    const fisc = d.fiscal || {};
    const inf = d.infracoes || {};

    // Data de Vistoria formatada
    const dataFmt = window.formatarDataVistoriaRobusta(fisc.data_vistoria || fisc.data || proc?.created_at) || new Date().toLocaleDateString('pt-BR');

    // Decomposição da Inscrição (ex: 01.036.00181.00300.00000.0 -> Zona, Quadra, Lote)
    let zona = 'XXX', quadra = 'XXXX', lote = 'XXXXX';
    if (imv.inscricao) {
        const parts = imv.inscricao.replace(/\s/g, '').split('.');
        if (parts.length >= 4) {
            zona = parts[0] || 'XXX';
            quadra = parts[2] || 'XXXX';
            lote = parts[3] || 'XXXXX';
        }
    }

    const testada = imv.testada || 'XX';
    const areaTotal = imv.area_total || '288';

    // Gerar blocos de infração conforme Modelo - Notificação Preliminar.docx
    const dispositivos = obterDispositivosDoProcesso(proc);

    let blocosInfracoesHtml = '';
    dispositivos.forEach((disp, index) => {
        blocosInfracoesHtml += gerarBlocoInfracao(proc, disp, index);
        return;

        // Código legado mantido abaixo apenas como referência (substituído por gerarBlocoInfracao)
        const numNotif = `${proc.numero_processo || '1000'}-${index + 1}`;
        const dispLow = disp.toLowerCase();
        const { areaNum, testadaNum, profundidadeNum, temEsquina } = obterDadosImovelParaCalculo(proc);
        const upfmd = valorUpfmdAtual || parseFloat(proc.campos?.upfmd_utilizado) || 103.00;
        const defaultMulta = calcularValorNumDefaultMulta(dispLow, areaNum, testadaNum, profundidadeNum, temEsquina, upfmd);
        const customMulta = proc.campos?.multas_customizadas?.[index];
        const valMultaFinal = (customMulta !== undefined && customMulta !== null && customMulta !== '')
            ? parseFloat(customMulta)
            : defaultMulta;
        const valFormatado = valMultaFinal.toFixed(2).replace('.', ',');

        let titulo = '';
        let prazo = '';
        let itens = '';
        let penalidade = '';
        let obsFiscal = '';

        const numAI = proc.campos?.auto_infracao_anterior_numero || 'XXXX';
        const dataAI = proc.campos?.auto_infracao_anterior_data || 'XX/ XX/ 20XX';
        const textoObsReincidencia = `Na hipótese de reincidência, aplicar-se-á em dobro a multa respectivamente prevista no art. 4º da Lei 7.174/2010. Auto de Infração expedido anteriormente: nº ${numAI} em ${dataAI}.`;

        if (disp.includes('120000232') || dispLow.includes('limpeza e conservação') || dispLow.includes('não edificado')) {
            titulo = 'Falta de limpeza e conservação de imóvel não edificado: infração aos artigos 1º e 2º, III, da Lei 7.174/2010.';
            prazo = '15 DIAS';
            itens = `<li>Executar o serviço de limpeza e remoção do lixo doméstico e entulhos (quando houver) do imóvel de sua propriedade.</li>
                     <li><strong>Proibido:</strong> queimadas, cortar árvores e movimentação de terra (terraplanagem).</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 3º, IV da LEI 7.174/2010, e outras legislações. MULTA NO VALOR DE 15% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) multiplicado pela área total do lote, atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000228') || dispLow.includes('reincidência na inexistência de cercamento')) {
            titulo = 'Reincidência na Inexistência de Cercamento: Infração ao artigo 2º, I, da Lei 7.174/2010.';
            prazo = '60 DIAS';
            itens = `<li>Executar os serviço de construção de muro do imóvel de sua propriedade.</li>
                     <li><strong>Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010:</strong> muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.</li>
                     <li><strong>Não autorizado:</strong> arames lisos e farpado, e cerca viva.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 3º, I, da Lei 7.174/2010, e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, multiplicado por 2 (dois) atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
            obsFiscal = textoObsReincidencia;
        } else if (disp.includes('120000227') || dispLow.includes('reincidência na inexistência de passeio')) {
            titulo = 'Reincidência na Inexistência de passeio: infração ao artigo 1º, § 1º e artigo 2º, I, da Lei 7.174/2010.';
            prazo = '60 DIAS';
            itens = `<li>Executar o serviço de construção de passeio pela testada do imóvel de sua propriedade.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 3º, II, da Lei 7.174/2010 e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada multiplicado por 2 (dois), atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong> (valor dobrado em face da reincidência na infração).`;
            obsFiscal = textoObsReincidencia;
        } else if (disp.includes('120000211') || dispLow.includes('cercamento')) {
            titulo = 'Inexistência de cercamento: infração ao artigo 1º da Lei 7.174/2010.';
            prazo = '60 DIAS';
            itens = `<li>Executar os serviço de construção de muro do imóvel de sua propriedade.</li>
                     <li><strong>Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010:</strong> muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.</li>
                     <li><strong>Não autorizado:</strong> arames lisos e farpado, e cerca viva.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, I e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000226') || dispLow.includes('inexistência de passeio')) {
            titulo = 'Inexistência de passeio: infração ao artigo 1º, § 1º e artigo 2º, I, da Lei 7.174/2010.';
            prazo = '60 DIAS';
            itens = `<li>Executar o serviço de construção de passeio pela testada do imóvel de sua propriedade.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, II e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000229') || dispLow.includes('reconstrução de/ou reparo de muro') || dispLow.includes('reparo de muro')) {
            titulo = 'Reconstrução e/ou reparo de muro: infração ao artigo 2º, II, da Lei 7.174/2010.';
            prazo = '15 DIAS';
            itens = `<li>Executar o serviço de reconstrução de muro pela testada do imóvel de sua propriedade.</li>
                     <li><strong>Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010:</strong> muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.</li>
                     <li><strong>Não autorizado:</strong> arames lisos e farpado, e cerca viva.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, III e outras legislações. MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000240') || dispLow.includes('reconstrução e/ou reparo de passeio')) {
            titulo = 'Reconstrução e/ou reparo de passeio: infração ao artigo 1º, § 1º e artigo 2º, II, da Lei 7.174/2010.';
            prazo = '15 DIAS';
            itens = `<li>Executar o serviço de reconstrução de passeio/calçada pela testada do imóvel de sua propriedade.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, III e outras legislações. MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (dispLow.includes('muro em má conservação') || dispLow.includes('danificado')) {
            titulo = 'Muro em má conservação ou danificado: infração ao artigo 1º, § 1º e artigo 2º, II, da Lei 7.174/2010.';
            prazo = '15 DIAS';
            itens = `<li>Executar o serviço de reconstrução de passeio/calçada pela testada do imóvel de sua propriedade.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela 7.174/2010, artigo 3º, III e outras legislações. MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000233') || dispLow.includes('limpeza de quintal')) {
            titulo = 'Limpeza de quintal: infração aos artigos 14 e 15 da Lei nº 6.907/2008.';
            prazo = '10 DIAS';
            itens = `<li>Executar o serviço de limpeza e remoção do lixo doméstico e entulhos (quando houver) do imóvel de sua propriedade.</li>
                     <li><strong>Proibido:</strong> Queimadas, cortar árvores e movimentação de terra (terraplanagem).</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 18 da LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008, e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000237') || dispLow.includes('obstáculos em calçadas')) {
            titulo = 'Obstáculos em calçadas impedindo o livre trânsito de pedestres e veículos: infração ao artigo 6°, XIII, XIV da Lei 6.907/2008.';
            prazo = '10 DIAS';
            itens = `<li>Retirar os obstáculos do passeio.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 11 da LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008, e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000239') || dispLow.includes('água servida')) {
            titulo = 'Água servida: infração ao artigo 6, inciso IV da Lei nº 6.907/2008.';
            prazo = '10 DIAS';
            itens = `<li>Ligação da água servida à rede de esgoto.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 11 da LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008 e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000236') || dispLow.includes('estabelecimento sem alvará')) {
            titulo = 'Estabelecimento sem alvará: infração ao artigo 190 da Lei nº 6.907/2008.';
            prazo = '10 DIAS';
            itens = `<li>Regularizar o alvará de funcionamento e localização.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 195, LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008, E OUTRAS LEGISLAÇÕES. MULTA NO VALOR DE: 50 UPFMD, atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000234') || dispLow.includes('reparos por concessionárias')) {
            titulo = 'Reparos por concessionárias: infração ao artigo 163 da Lei 6907/2008 e ao artigo 1º, §3º, da Lei nº 7.174/2010.';
            prazo = '10 DIAS, a contar do término de sua respectiva obra e serviço';
            itens = `<li>Executar serviço de reconstrução de muros e passeios danificados.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 172 da Lei 6907/2008 e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000230') || dispLow.includes('piso tátil')) {
            titulo = 'Inexistência de sinalização adequada piso tátil: infração ao artigo 106, IV, da Lei 6.907/2008.';
            prazo = '10 DIAS';
            itens = `<li>Executar a sinalização adequada no piso de acordo com as normas vigentes com alerta para portadores de deficiência.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 142 da Lei nº 6.907/ 2008 e outras legislações. MULTA NO VALOR DE 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else {
            titulo = `Infração constatada: ${disp}`;
            prazo = '10 DIAS';
            itens = `<li>Regularizar a situação técnica e documental junto à Secretaria de Meio Ambiente e Cuidado Animal - SEMAC nos termos da legislação municipal.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas na legislação municipal vigente.`;
        }

        const obsHtml = obsFiscal ? `<p style="margin:8px 0 0 0; font-size:10.5pt; color:#333;"><strong>Observação do Fiscal:</strong> ${obsFiscal}</p>` : '';

        const bloco = `
            <div class="doc-infracao-bloco">
                <div class="doc-infracao-titulo">NOTIFICAÇÃO PRELIMINAR N° ${numNotif}</div>
                <p style="margin:4px 0;"><strong>${titulo}</strong></p>
                <p style="margin:10px 0 6px 0;">O autuado tem o prazo de até <strong>${prazo}</strong> para tomar as providências:</p>
                <ul class="doc-infracao-ul">
                    ${itens}
                </ul>
                <p style="margin:10px 0 0 0; text-align:justify;">${penalidade}</p>
                ${obsHtml}
            </div>
        `;

        blocosInfracoesHtml += bloco;
    });

    // Montar HTML exato do documento oficial idêntico ao Modelo - Notificação Preliminar.pdf
    const htmlOficial = `
        <div class="doc-oficial-wrapper" id="documentoPronto">
            <div class="doc-page-content">
                <!-- 1. CABEÇALHO IDÊNTICO AO MODELO - NOTIFICAÇÃO PRELIMINAR -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border-collapse: collapse;">
                    <tr>
                        <td width="100" rowspan="2" align="center" valign="top" style="padding-right: 12px; width: 100px;">
                            <img src="${window.BRASAO_SEMAC_BASE64 || 'assets/img/brasao_semac.jpeg'}" alt="Brasão Divinópolis" style="width: 85px; height: auto; display: block; margin: 0 auto;">
                        </td>
                        <td bgcolor="#F78C26" style="background-color: #F78C26; height: 14px; font-size: 1px; line-height: 14px;">&nbsp;</td>
                    </tr>
                    <tr>
                        <td valign="top" style="padding-top: 10px; font-size: 9.5pt; color: #000; line-height: 1.4;">
                            <strong>SECRETARIA MUNICIPAL DE MEIO AMBIENTE E CUIDADO ANIMAL - SEMAC</strong><br>
                            DIRETORIA DE MEIO AMBIENTE<br>
                            GERÊNCIA DE FISCALIZAÇÃO DE POSTURAS<br>
                            <span style="font-size: 9pt;">Av. Paraná, nº2061, sala 207 - Bairro São José - Divinópolis, Minas Gerais</span><br>
                            <span style="font-size: 9pt;">CEP: 35.501-170 Tel: (37) 3229-8176</span>
                        </td>
                    </tr>
                </table>

                <!-- 2. TÍTULO -->
                <div class="doc-title-section">
                    <div class="doc-h1">NOTIFICAÇÃO PRELIMINAR</div>
                    <div class="doc-h2">Fiscalização de Posturas</div>
                    <div class="doc-data-right">Divinópolis- MG ${dataFmt}</div>
                </div>

                <!-- 3. INFORMAÇÕES DO CONTRIBUINTE -->
                <div class="doc-sec-heading">Informações do Contribuinte</div>
                <div class="doc-info-grid">
                    <div>
                        <div><strong>Contribuinte:</strong> ${cont.nome || 'Não informado'}</div>
                        <div><strong>Logradouro:</strong> ${cont.logradouro || 'Não informado'}</div>
                        <div><strong>CEP:</strong> ${cont.cep || '35500-000'}</div>
                        <div><strong>Município:</strong> ${cont.municipio || 'Divinópolis'}</div>
                    </div>
                    <div>
                        <div><strong>CPF/CNPJ:</strong> ${cont.cpf_cnpj || 'Não informado'}</div>
                        <div><strong>Bairro:</strong> ${cont.bairro || 'Não informado'}</div>
                        <div><strong>Número:</strong> ${cont.numero || 'S/N'}</div>
                    </div>
                </div>

                <!-- 4. INFORMAÇÕES DO IMÓVEL -->
                <div class="doc-sec-heading" style="margin-top: 18px;">Informações do imóvel</div>
                <div class="doc-info-grid">
                    <div>
                        <div><strong>Inscrição:</strong> ${imv.inscricao || 'XX.XXX.XXXX.XXXXX'}</div>
                        <div><strong>Logradouro:</strong> ${imv.logradouro || 'Não informado'}, n° ${imv.numero || 'S/N'}</div>
                        <div><strong>Bairro:</strong> ${imv.bairro || 'Não informado'}</div>
                    </div>
                    <div>
                        <div><strong>Zona:</strong> ${zona}</div>
                        <div><strong>Quadra:</strong> ${quadra}</div>
                        <div><strong>Lote:</strong> ${lote}</div>
                    </div>
                </div>

                <!-- 5. TEXTO INTRODUTÓRIO -->
                <div class="doc-intro-p">
                    Verificamos que o imóvel de sua propriedade situado na ${imv.logradouro || 'Rua/Av. XXXXXXXXX'}, ${imv.numero || '0'}, - ${imv.bairro || 'XXXXXXXXXX'} - com ${testada}m de extensão e ${areaTotal}m² de área total, necessita da(s) seguinte(s) regularização(es):
                </div>

                <!-- 6. BLOCOS DE INFRAÇÃO -->
                ${blocosInfracoesHtml}

                <!-- 7. OBSERVAÇÕES E INSTRUÇÕES -->
                <div class="doc-obs-section">
                    <p>Observação: o prazo é contado <strong>a partir da data do recebimento.</strong></p>
                    <p>O autuado tem o prazo de <strong>10 DIAS</strong> para apresentação de defesa via App Divinópolis, disponível para download no Google Play Store (Androids) e na App Store (iPhone).</p>
                    <p><strong>Instruções:</strong> link (<span style="color:#F78C26;">colocar aqui o link com as instruções</span>).</p>
                </div>

                <!-- 8. ASSINATURA FISCAL -->
                <div class="doc-fiscal-sig">
                    <div class="sig-line">________________________________________________</div>
                    <div class="sig-name">${fisc.nome || 'Nome Fiscal'}</div>
                    <div class="sig-role">Fiscal de Posturas</div>
                    <div class="sig-mat">Matrícula :${fisc.matricula || 'XXXXXXX'}</div>
                </div>

                <!-- 9. RECIBO DO AUTUADO -->
                <div class="doc-autuado-receipt">
                    <div class="receipt-label">Recebi 2° via da presente Notificação Preliminar da qual fico ciente</div>
                    <div class="receipt-box">
                        <div class="receipt-left">
                            <span>Assinatura do Autuado:</span>
                        </div>
                        <div class="receipt-right">
                            <span>Ciente em:</span>
                            <div class="receipt-date-slashes">/ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; /</div>
                        </div>
                    </div>
                    <div class="receipt-city">Divinópolis - MG</div>
                </div>
            </div>

            <!-- 10. RODAPÉ LARANJA -->
            <div class="doc-footer-orange-bar"></div>
        </div>
    `;

    container.innerHTML = htmlOficial;
}

// ============================================================================
// ETAPA 2 — DEFESA OU DILAÇÃO DE PRAZO (Fiscal de Postura)
// ============================================================================

const PRAZOS_NOTIFICACAO = {
    'falta de limpeza e conservação de imóvel não edificado': 15,
    'inexistência de cercamento': 60,
    'inexistência de passeio': 60,
    'reincidência na inexistência de cercamento': 60,
    'reincidência na inexistência de passeio': 60,
    'reconstrução e/ou reparos em muro': 15,
    'reconstrução e/ou reparos passeio': 15,
    'reconstrução e/ou reparos muro': 15,
    'limpeza de quintal': 10,
    'obstáculos em calçadas': 10,
    'água servida': 10,
    'estabelecimento sem alvará': 10,
    'reparos por concessionárias': 10,
    'piso tátil': 10
};

function obterPrazoNotificacao(descricao) {
    if (!descricao) return 15;
    const descLow = descricao.toLowerCase();
    for (const [termo, prazo] of Object.entries(PRAZOS_NOTIFICACAO)) {
        if (descLow.includes(termo)) return prazo;
    }
    return 15;
}

async function obterNotificacoesEtapa2(proc) {
    // Prioriza notificações já carregadas da tabela 'notificacoes'.
    if (proc.notificacoes && Array.isArray(proc.notificacoes) && proc.notificacoes.length > 0) {
        return normalizarNotificacoesTabela(proc, proc.notificacoes);
    }

    // Fallback: dados antigos em JSONB ou derivados dos dispositivos.
    const dispositivos = obterDispositivosDoProcesso(proc);
    const dados = proc.campos?.etapa2 || {};
    const notificacoesSalvas = dados.notificacoes || [];

    let dataInicio = dados.data_inicio_etapa2;
    if (!dataInicio) {
        try {
            const { data: hist } = await supabaseClient
                .from('historico_etapas')
                .select('created_at')
                .eq('processo_id', proc.id)
                .eq('etapa_para_id', 2)
                .order('created_at', { ascending: false })
                .limit(1);

            if (hist && hist.length > 0 && hist[0].created_at) {
                dataInicio = hist[0].created_at;
            }
        } catch (e) {
            console.warn('Erro ao buscar data de entrada na Etapa 2:', e);
        }
    }
    if (!dataInicio) {
        dataInicio = proc.campos?.etapa17?.data_anexo_edital || proc.created_at || new Date().toISOString();
    }

    return dispositivos.map((disp, index) => {
        const salva = notificacoesSalvas[index] || {};
        const numero = salva.numero || `${proc.numero_processo || 'S/N'}/${String(index + 1).padStart(2, '0')}`;
        const prazoDias = salva.prazo_dias || obterPrazoNotificacao(disp);
        const dataVencimento = salva.data_vencimento || calcularDataVencimento(dataInicio, prazoDias);
        return {
            index,
            numero,
            descricao: disp,
            prazo_dias: prazoDias,
            data_inicio: dataInicio,
            data_vencimento: dataVencimento,
            status: salva.status || 'pendente',
            etapa_atual: salva.etapa_atual || 2,
            data_movimentacao: salva.data_movimentacao || null,
            dados: salva.dados || {}
        };
    });
}

function normalizarNotificacoesTabela(proc, notificacoes) {
    let dataInicioGlobal = proc.campos?.etapa2?.data_inicio_etapa2;
    if (!dataInicioGlobal) dataInicioGlobal = proc.created_at || new Date().toISOString();

    return notificacoes.map((n, index) => {
        const etapaNumero = parseInt(n.etapas?.numero || n.etapa_atual || 2, 10);
        const dataInicio = n.data_inicio || dataInicioGlobal;
        const prazoDias = n.prazo_dias || obterPrazoNotificacao(n.descricao);
        const dataVencimento = n.data_vencimento || calcularDataVencimento(dataInicio, prazoDias);
        return {
            id: n.id,
            index,
            numero: n.numero || `${proc.numero_processo || 'S/N'}/${String(index + 1).padStart(2, '0')}`,
            descricao: n.descricao || '—',
            prazo_dias: prazoDias,
            data_inicio: dataInicio,
            data_vencimento: dataVencimento,
            status: n.status || 'pendente',
            etapa_atual: etapaNumero,
            data_movimentacao: n.data_movimentacao || null,
            dados: n.dados || {}
        };
    });
}

function calcularDataVencimento(dataInicio, dias) {
    const data = new Date(dataInicio);
    data.setDate(data.getDate() + dias);
    return data.toISOString();
}

function formatarDiasRestantes(dataVencimentoISO) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const vencimento = new Date(dataVencimentoISO);
    vencimento.setHours(0, 0, 0, 0);
    const diffMs = vencimento - hoje;
    const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias < 0) return { texto: `Vencido há ${Math.abs(diffDias)} dias`, vencido: true, dias: diffDias };
    if (diffDias === 0) return { texto: 'Vence hoje', vencido: true, dias: 0 };
    return { texto: `${diffDias} dias restantes`, vencido: false, dias: diffDias };
}

async function renderizarEtapa2(proc) {
    const modo = determinarModoAcesso(proc, perfilAtual);

    const topbarPadrao = document.querySelector('.etapa-topbar:not(#topbarEtapa2)');
    const stepperPadrao = document.querySelector('.process-stepper-bar:not(#stepperEtapa16)');
    const abas = document.querySelector('.page-tabs');
    const tabContent = document.querySelector('.tab-content-box:not(#formularioEtapa2)');

    if (topbarPadrao) topbarPadrao.style.display = '';
    if (stepperPadrao) stepperPadrao.style.display = '';
    if (abas) abas.style.display = 'none';
    if (tabContent) tabContent.style.display = 'none';

    const container2 = document.getElementById('etapa2Container');
    const topbar2 = document.getElementById('topbarEtapa2');
    const formulario2 = document.getElementById('formularioEtapa2');
    if (container2) container2.style.display = 'block';
    if (topbar2) topbar2.style.display = 'none';
    if (formulario2) formulario2.style.display = '';

    const notificacoes = await obterNotificacoesEtapa2(proc);
    const lista = document.getElementById('listaNotificacoesEtapa2');
    if (lista) {
        lista.innerHTML = '';
        if (notificacoes.length === 0) {
            lista.innerHTML = '<p style="color:#64748b; font-size:0.95rem;">Nenhuma notificação pendente.</p>';
        } else {
            notificacoes.forEach(n => {
                const infoPrazo = formatarDiasRestantes(n.data_vencimento);
                const card = document.createElement('div');
                card.className = 'card-notificacao-etapa2';
                card.dataset.index = n.index;

                // Verifica se a notificação já avançou para outra etapa
                const etapaNotif = parseInt(n.etapas?.numero || n.etapa_atual_id || n.etapa_atual || 2, 10);
                const jaAvancou = etapaNotif > 2;

                card.style.cssText = 'background:white; border:1px solid #DED9E2; border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:12px; transition:all 0.2s ease;';

                if (jaAvancou) {
                    card.style.cursor = 'pointer';
                    if (n.status === 'encerrada') {
                        card.style.border = '2px solid #75C9C8';
                        card.addEventListener('mouseenter', () => { card.style.borderColor = '#5eb5b4'; card.style.boxShadow = '0 4px 12px rgba(117,201,200,0.2)'; });
                        card.addEventListener('mouseleave', () => { card.style.borderColor = '#75C9C8'; card.style.boxShadow = 'none'; });
                    } else {
                        card.style.border = '2px solid #80A1D4';
                        card.addEventListener('mouseenter', () => { card.style.borderColor = '#6888bc'; card.style.boxShadow = '0 4px 12px rgba(128,161,212,0.2)'; });
                        card.addEventListener('mouseleave', () => { card.style.borderColor = '#80A1D4'; card.style.boxShadow = 'none'; });
                    }
                    card.addEventListener('click', (e) => {
                        if (!e.target.closest('button')) {
                            window.location.search = `?processo=${processoAtual.id}&notificacao=${n.id}`;
                        }
                    });
                } else {
                    card.style.cursor = 'pointer';
                    card.addEventListener('mouseenter', () => { card.style.borderColor = '#C0B9DD'; card.style.boxShadow = '0 4px 12px rgba(192,185,221,0.2)'; });
                    card.addEventListener('mouseleave', () => { card.style.borderColor = '#DED9E2'; card.style.boxShadow = 'none'; });
                }

                let statusBadge = '';
                if (ehStatusAutoInfracao(n)) statusBadge = '<span style="background:#FDF2F2; color:#B93838; border:1px solid #F8A4A4; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Auto de Infração</span>';
                else if (n.status === 'encerrada') statusBadge = '<span style="background:#EAE6EE; color:#4A4553; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Encerrada</span>';
                else if (n.status === 'atendida') statusBadge = '<span style="background:#EBF9F9; color:#2B7A78; border:1px solid #75C9C8; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Atendida</span>';
                else if (n.status === 'defesa') statusBadge = '<span style="background:#F0F4FA; color:#3B5888; border:1px solid #C0B9DD; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Defesa</span>';
                else if (n.status === 'dilacao') statusBadge = '<span style="background:#FFF9EB; color:#996B00; border:1px solid #F6D58E; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Dilação</span>';
                else if (infoPrazo.vencido) statusBadge = '<span style="background:#FDF2F2; color:#B93838; border:1px solid #F8A4A4; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Vencida</span>';
                else statusBadge = '<span style="background:#F7F4EA; color:#475569; border:1px solid #DED9E2; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Pendente</span>';

                const podeAvancar = !jaAvancou;
                const btnAvancarHtml = podeAvancar
                    ? `<button type="button" class="btn-avancar-notif" data-index="${n.index}" style="margin-top:8px; padding:10px 18px; border-radius:8px; border:none; background:#80A1D4; color:white; font-weight:600; font-size:0.88rem; cursor:pointer; box-shadow:0 4px 12px rgba(128,161,212,0.3); transition:all 0.2s ease;">Avançar Notificação</button>`
                    : '';

                const prazoHtml = (n.status === 'atendida' || jaAvancou)
                    ? ''
                    : `<div style="display:flex; align-items:center; gap:8px; font-size:0.88rem; color:#475569;">
                        <span>📅 Prazo: ${new Date(n.data_vencimento).toLocaleDateString('pt-BR')}</span>
                        <span style="${infoPrazo.vencido ? 'color:#B93838; font-weight:600;' : 'color:#2B7A78; font-weight:600;'}">(${infoPrazo.texto})</span>
                    </div>`;

                let textoMotivo = '';
                if (n.status === 'atendida') textoMotivo = 'Houve Cumprimento (Atendida)';
                else if (n.status === 'encerrada') textoMotivo = 'Notificação Encerrada / Finalizada';
                else if (n.status === 'pendente_vencida') textoMotivo = 'Notificação vencida (Prazo esgotado)';
                else if (n.status === 'defesa') textoMotivo = 'Defesa Apresentada';
                else if (n.status === 'dilacao') textoMotivo = 'Dilação de Prazo Solicitada';
                else textoMotivo = 'Motivo não especificado';

                const controlesHtml = jaAvancou ?
                    `<div style="font-size:0.9rem; color:#3B5888; font-weight:600; padding:10px; background:#F0F4FA; border:1px solid #C0B9DD; border-radius:8px; text-align:center;">
                        Esta notificação avançou e está na Etapa ${etapaNotif}. Clique para abrir.
                        <div style="font-size:0.82rem; color:#475569; margin-top:4px; font-weight:normal;">Avançou pois: <b>${textoMotivo}</b></div>
                    </div>` :
                    `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
                        <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; color:#334155; cursor:pointer; padding:6px 10px; border:1px solid #e2e8f0; border-radius:8px;">
                            <input type="radio" name="statusNotif_${n.index}" value="pendente" ${n.status === 'pendente' ? 'checked' : ''} data-index="${n.index}"> Pendente
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; color:#334155; cursor:pointer; padding:6px 10px; border:1px solid #e2e8f0; border-radius:8px;">
                            <input type="radio" name="statusNotif_${n.index}" value="atendida" ${n.status === 'atendida' ? 'checked' : ''} data-index="${n.index}"> Atendida
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; color:#334155; cursor:pointer; padding:6px 10px; border:1px solid #e2e8f0; border-radius:8px;">
                            <input type="radio" name="statusNotif_${n.index}" value="defesa" ${n.status === 'defesa' ? 'checked' : ''} data-index="${n.index}"> Defesa
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; color:#334155; cursor:pointer; padding:6px 10px; border:1px solid #e2e8f0; border-radius:8px; ${n.dados?.etapa2_ja_pediu_dilacao ? 'opacity:0.5; cursor:not-allowed; pointer-events:none;' : ''}">
                            <input type="radio" name="statusNotif_${n.index}" value="dilacao" ${n.status === 'dilacao' ? 'checked' : ''} data-index="${n.index}" ${n.dados?.etapa2_ja_pediu_dilacao ? 'disabled' : ''}> Dilação de Prazo
                        </label>
                    </div>`;

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
                        <div>
                            <div style="font-size:0.8rem; color:#64748b; font-weight:600; margin-bottom:2px;">Notificação ${n.numero}</div>
                            <div style="font-size:0.98rem; color:#0f172a; font-weight:600;">${n.descricao}</div>
                        </div>
                        ${statusBadge}
                    </div>
                    ${prazoHtml}
                    ${controlesHtml}
                    ${btnAvancarHtml}
                `;
                lista.appendChild(card);
            });
        }
    }

    const badge = document.getElementById('badgeStatusEtapa2');
    if (badge) {
        const todasAtendidas = notificacoes.every(n => n.status === 'atendida');
        if (todasAtendidas) {
            badge.textContent = 'Concluído';
            badge.style.background = '#bbf7d0';
            badge.style.color = '#166534';
        } else {
            badge.textContent = 'Aguardando';
            badge.style.background = '#fef9c3';
            badge.style.color = '#854d0e';
        }
    }

    if (modo !== MODO_ACESSO.NORMAL && formulario2) {
        formulario2.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = true;
        });
    }
}

// Exibe o trecho do documento oficial referente à notificação clicada.
function mostrarDocumentoNotificacao(proc, index) {
    const area = document.getElementById('areaDocumentoNotificacao');
    const conteudo = document.getElementById('conteudoDocumentoNotificacao');
    if (!area || !conteudo) return;

    const dispositivos = obterDispositivosDoProcesso(proc);
    const disp = dispositivos[index];
    if (!disp) return;

    const blocoInfracao = gerarBlocoInfracao(proc, disp, index);

    const d = proc.dados || {};
    const cont = d.contribuinte || {};
    const imv = d.imovel || {};

    conteudo.innerHTML = `
        <div class="doc-oficial-wrapper" style="margin:0; box-shadow:none; border:none;">
            <div class="doc-page-content" style="padding:24px 32px;">
                <div style="font-size:10pt; color:#64748b; margin-bottom:14px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                    <strong>Notificação ${proc.numero_processo || 'S/N'}-${String(index + 1).padStart(2, '0')}</strong> — ${cont.nome || 'Contribuinte'}<br>
                    Imóvel: ${imv.logradouro || '—'}, ${imv.numero || 'S/N'} — ${imv.bairro || '—'}
                </div>
                ${blocoInfracao}
            </div>
        </div>
    `;

    area.style.display = 'block';
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function configurarEventosEtapa2() {
    const btnSalvar = document.getElementById('btnSalvarEtapa2');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarEtapa2);

    const btnFechar = document.getElementById('btnFecharDocumentoNotificacao');
    if (btnFechar) {
        btnFechar.addEventListener('click', () => {
            const area = document.getElementById('areaDocumentoNotificacao');
            if (area) area.style.display = 'none';
        });
    }

    const lista = document.getElementById('listaNotificacoesEtapa2');
    if (lista) {
        lista.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-avancar-notif');
            if (btn) {
                const index = parseInt(btn.dataset.index, 10);
                avancarNotificacaoEtapa2(index);
                return;
            }

            // Ignora cliques em controles interativos do card
            if (e.target.closest('input, label, button, select, textarea')) return;

            const card = e.target.closest('.card-notificacao-etapa2');
            if (card) {
                const index = parseInt(card.dataset.index, 10);
                mostrarDocumentoNotificacao(processoAtual, index);
            }
        });
    }
}

function coletarStatusNotificacoesEtapa2() {
    const notificacoes = [];
    const lista = document.getElementById('listaNotificacoesEtapa2');
    if (!lista) return notificacoes;

    lista.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
        const index = parseInt(radio.dataset.index, 10);
        notificacoes[index] = radio.value;
    });

    return notificacoes;
}

async function salvarEtapa2() {
    if (!processoAtual) return;
    processoAtual.campos = processoAtual.campos || {};
    processoAtual.campos.etapa2 = processoAtual.campos.etapa2 || {};

    const statusList = coletarStatusNotificacoesEtapa2();
    const notificacoesAtuais = await obterNotificacoesEtapa2(processoAtual);

    try {
        // Atualiza cada notificação no banco (quando possui id da tabela)
        for (let i = 0; i < notificacoesAtuais.length; i++) {
            const n = notificacoesAtuais[i];
            const novoStatus = statusList[i] || n.status;
            if (n.id) {
                await atualizarNotificacaoNoBanco(n.id, { status: novoStatus });
            }
        }

        // Mantém o JSONB como cache/compatibilidade
        processoAtual.campos.etapa2.notificacoes = notificacoesAtuais.map((n, i) => ({
            ...n,
            status: statusList[i] || n.status
        }));

        processoAtual.dados = processoAtual.dados || {};
        processoAtual.dados.campos = processoAtual.campos;

        await supabaseClient
            .from('processos')
            .update({ dados: processoAtual.dados })
            .eq('id', processoAtual.id);

        // Recarrega notificações para refletir atualizações
        processoAtual.notificacoes = await carregarNotificacoesDoBanco(processoAtual.id);
        await renderizarEtapa2(processoAtual);
    } catch (err) {
        console.error('Erro ao salvar Etapa 2:', err);
        alert('Erro ao salvar status das notificações.');
    }
}

async function avancarEtapa2() {
    if (!processoAtual) return;
    mostrarCarregamento('Avançando etapa...');

    await salvarEtapa2();

    const notificacoes = await obterNotificacoesEtapa2(processoAtual);

    const temDefesa = notificacoes.some(n => n.status === 'defesa');
    const temDilacao = notificacoes.some(n => n.status === 'dilacao');
    const temVencidaNaoAtendida = notificacoes.some(n => {
        if (n.status === 'atendida' || n.status === 'defesa' || n.status === 'dilacao') return false;
        const info = formatarDiasRestantes(n.data_vencimento);
        return info.vencido;
    });
    const todasAtendidas = notificacoes.length > 0 && notificacoes.every(n => n.status === 'atendida');

    try {
        let proxEtapaNumero;
        let status;
        let condicao;

        if (temDefesa) {
            proxEtapaNumero = 4;
            status = 'defesa';
            condicao = 'Defesa apresentada';
        } else if (temDilacao) {
            proxEtapaNumero = 4;
            status = 'dilacao_prazo';
            condicao = 'Dilação de prazo solicitada';
        } else if (temVencidaNaoAtendida) {
            proxEtapaNumero = 7;
            status = 'em_andamento';
            condicao = 'Notificação(ões) vencida(s) sem atendimento';
        } else if (todasAtendidas) {
            proxEtapaNumero = 7;
            status = 'em_andamento';
            condicao = 'Todas as notificações atendidas';
        } else {
            ocultarCarregamento();
            alert('Atenção: Existem notificações pendentes que ainda estão no prazo. Para avançar apenas as notificações já verificadas, utilize os botões individuais "Avançar Notificação" presentes em cada quadro. O botão geral avança apenas quando TODAS as notificações do processo estiverem prontas.');
            return;
        }

        // Atualiza todas as notificações relevantes no banco
        const dataMov = new Date().toISOString();
        const { data: proxEtapa } = await supabaseClient
            .from('etapas')
            .select('id')
            .eq('numero', proxEtapaNumero || 2)
            .maybeSingle();
        const proxEtapaId = proxEtapa ? proxEtapa.id : (proxEtapaNumero || 2);

        const etapaDb2 = await supabaseClient.from('etapas').select('id').eq('numero', 2).maybeSingle();
        const etapa2Id = etapaDb2.data?.id || 2;

        for (const n of notificacoes) {
            const deveMover =
                (proxEtapaNumero === 7 && n.status === 'pendente' && formatarDiasRestantes(n.data_vencimento).vencido) ||
                (proxEtapaNumero === 4 && n.status === 'defesa') ||
                (proxEtapaNumero === 4 && n.status === 'dilacao') ||
                (proxEtapaNumero === 7 && n.status === 'atendida');

            if (deveMover && n.id) {
                const etapaDeId = n.etapa_atual_id || etapa2Id;

                const notifDados = { ...(n.dados || {}) };
                notifDados.historico = notifDados.historico || [];
                notifDados.historico.push({
                    etapa_de: parseInt(n.etapas?.numero || n.etapa_atual_id || 2, 10),
                    etapa_para: proxEtapaNumero,
                    status: n.status,
                    condicao: condicao || 'Movimentação em lote',
                    data: dataMov,
                    usuario: perfilAtual?.nome || 'Sistema'
                });

                await atualizarNotificacaoNoBanco(n.id, {
                    status: n.status,
                    etapa_atual_id: proxEtapaId,
                    data_movimentacao: dataMov,
                    dados: notifDados
                });

                await supabaseClient
                    .from('historico_etapas')
                    .insert([{
                        processo_id: processoAtual.id,
                        notificacao_id: n.id,
                        etapa_de_id: etapaDeId,
                        etapa_para_id: proxEtapaId,
                        usuario_id: perfilAtual?.id,
                        condicao_aplicada: condicao,
                        observacao: `Notificação ${n.numero} avançou da Etapa 2 para a Etapa ${proxEtapaNumero}.`,
                        dados_etapa: { status: n.status }
                    }]);
            }
        }

        processoAtual.notificacoes = await carregarNotificacoesDoBanco(processoAtual.id);

        if (proxEtapaNumero) {
            const updateData = {
                status: status,
                dados: processoAtual.dados
            };
            // Não alteramos o etapa_atual_id do processo, mantemos na etapa 2!
            await supabaseClient
                .from('processos')
                .update(updateData)
                .eq('id', processoAtual.id);

            await supabaseClient
                .from('historico_etapas')
                .insert([{
                    processo_id: processoAtual.id,
                    etapa_de_id: processoAtual.etapa_atual_id,
                    etapa_para_id: proxEtapaId,
                    usuario_id: perfilAtual?.id,
                    condicao_aplicada: condicao,
                    observacao: `Status das notificações: ${notificacoes.map(n => `${n.numero}=${n.status}`).join(', ')}`,
                    dados_etapa: { etapa2: processoAtual.campos?.etapa2 || {} }
                }]);

            window.location.href = `etapa.html?processo=${processoAtual.id}`;
        } else {
            await supabaseClient
                .from('processos')
                .update({ status: status, dados: processoAtual.dados })
                .eq('id', processoAtual.id);

            await supabaseClient
                .from('historico_etapas')
                .insert([{
                    processo_id: processoAtual.id,
                    etapa_de_id: processoAtual.etapa_atual_id,
                    etapa_para_id: processoAtual.etapa_atual_id,
                    usuario_id: perfilAtual?.id,
                    condicao_aplicada: condicao,
                    observacao: 'Processo finalizado: todas as notificações foram atendidas.',
                    dados_etapa: { etapa2: processoAtual.campos?.etapa2 || {} }
                }]);

            alert('Processo finalizado com sucesso: todas as notificações foram atendidas.');
            window.location.href = 'painel.html';
        }
    } catch (err) {
        console.error('Erro ao avançar Etapa 2:', err);
        alert('Erro ao avançar para a próxima etapa.');
        ocultarCarregamento();
    }
}

// Avança uma notificação específica da Etapa 2 para sua próxima etapa.
async function avancarNotificacaoEtapa2(index) {
    if (!processoAtual) return;

    const statusList = coletarStatusNotificacoesEtapa2();
    let statusSelecionado = statusList[index];

    const notificacoes = await obterNotificacoesEtapa2(processoAtual);
    const notif = notificacoes[index];
    if (!notif) {
        alert('Notificação não encontrada.');
        return;
    }

    const info = formatarDiasRestantes(notif.data_vencimento);
    const isVencida = info.vencido;

    if (!statusSelecionado || statusSelecionado === 'pendente') {
        if (!isVencida) {
            alert('A notificação ainda está no prazo. Selecione um status (Atendida, Defesa ou Dilação) para avançar manualmente.');
            return;
        }
        statusSelecionado = 'pendente_vencida';
    }

    mostrarCarregamento('Avançando notificação...');

    let proxEtapaNumero;
    let statusProcesso;
    let condicao;

    if (statusSelecionado === 'atendida') {
        proxEtapaNumero = 7;
        statusProcesso = 'notificacao_atendida';
        condicao = 'Notificação atendida';
    } else if (statusSelecionado === 'pendente_vencida') {
        proxEtapaNumero = 7;
        statusProcesso = 'em_andamento';
        condicao = 'Notificação vencida (Pendente)';
    } else if (statusSelecionado === 'defesa') {
        proxEtapaNumero = 4;
        statusProcesso = 'defesa';
        condicao = 'Defesa apresentada';
    } else if (statusSelecionado === 'dilacao') {
        proxEtapaNumero = 4;
        statusProcesso = 'dilacao_prazo';
        condicao = 'Dilação de prazo solicitada';
    } else {
        ocultarCarregamento();
        return;
    }

    const dataMov = new Date().toISOString();

    try {
        let proxEtapaId = null;
        if (proxEtapaNumero) {
            const { data: proxEtapa } = await supabaseClient
                .from('etapas')
                .select('id')
                .eq('numero', proxEtapaNumero)
                .maybeSingle();
            proxEtapaId = proxEtapa ? proxEtapa.id : null;
        }

        // Atualiza a notificação no banco com histórico em JSON
        if (notif.id) {
            const notifDados = { ...(notif.dados || {}) };
            notifDados.historico = notifDados.historico || [];
            notifDados.historico.push({
                etapa_de: parseInt(notif.etapas?.numero || notif.etapa_atual_id || 2, 10),
                etapa_para: proxEtapaNumero || 2,
                status: statusSelecionado,
                condicao: condicao || 'Movimentação inicial',
                data: dataMov,
                usuario: perfilAtual?.nome || 'Sistema'
            });

            await atualizarNotificacaoNoBanco(notif.id, {
                status: statusSelecionado,
                etapa_atual_id: proxEtapaId,
                data_movimentacao: dataMov,
                dados: notifDados
            });
            notif.dados = notifDados;
        }

        // Atualiza cache JSONB
        processoAtual.campos = processoAtual.campos || {};
        processoAtual.campos.etapa2 = processoAtual.campos.etapa2 || {};
        const notifCache = processoAtual.campos.etapa2.notificacoes || [];
        notifCache[index] = {
            ...notif,
            status: statusSelecionado,
            etapa_atual: proxEtapaNumero || 'concluida',
            data_movimentacao: dataMov
        };
        processoAtual.campos.etapa2.notificacoes = notifCache;
        processoAtual.dados = processoAtual.dados || {};
        processoAtual.dados.campos = processoAtual.campos;

        // Recarrega notificações para refletir a movimentação
        processoAtual.notificacoes = await carregarNotificacoesDoBanco(processoAtual.id);

        const etapaProcesso = calcularEtapaProcesso(processoAtual);
        const updateData = { dados: processoAtual.dados };
        if (etapaProcesso) {
            const { data: etapaDb } = await supabaseClient
                .from('etapas')
                .select('id')
                .eq('numero', etapaProcesso)
                .maybeSingle();
            updateData.etapa_atual_id = etapaDb ? etapaDb.id : etapaProcesso;
            updateData.status = 'em_aberto';
        } else {
            updateData.status = 'finalizado';
        }

        await supabaseClient
            .from('processos')
            .update(updateData)
            .eq('id', processoAtual.id);

        // Registra histórico vinculado à notificação
        await supabaseClient
            .from('historico_etapas')
            .insert([{
                processo_id: processoAtual.id,
                notificacao_id: notif.id || null,
                etapa_de_id: 2,
                etapa_para_id: proxEtapaId || 2,
                usuario_id: perfilAtual?.id,
                condicao_aplicada: condicao,
                observacao: `Notificação ${notif.numero}: ${notif.descricao}`,
                dados_etapa: { notificacaoIndex: index, notificacao: notif }
            }]);

        const proximaEtapaAtiva = calcularEtapaProcesso(processoAtual);
        if (!proximaEtapaAtiva) {
            alert('Processo finalizado: todas as notificações foram atendidas.');
            window.location.href = 'painel.html';
        } else {
            window.location.search = `?processo=${processoAtual.id}&notificacao=${notif.id}`;
        }
    } catch (err) {
        console.error('Erro ao avançar notificação:', err);
        alert('Erro ao avançar a notificação.');
        ocultarCarregamento();
    }
}

// ============================================================================
// ETAPA 1.2 / 16 — RETORNO DO AR (Administrativo de Posturas)
// ============================================================================

async function renderizarEtapa16(proc) {
    console.log('[DEBUG] renderizarEtapa16 — etapa:', proc?.etapa_atual, '| modo:', determinarModoAcesso(proc, perfilAtual));
    // Verifica prazo do AR; se expirado, move para Etapa 30 e interrompe a renderização
    const moveuEtapa30 = await verificarPrazo15DiasEtapa16(proc);
    if (moveuEtapa30) return;

    const modo = determinarModoAcesso(proc, perfilAtual);

    // Elementos da interface padrão
    const topbarPadrao = document.querySelector('.etapa-topbar:not(#topbarEtapa16)');
    const stepperPadrao = document.querySelector('.process-stepper-bar:not(#stepperEtapa16)');
    const abas = document.querySelector('.page-tabs');
    const tabContent = document.querySelector('.tab-content-box:not(#formularioEtapa16)');

    const container16 = document.getElementById('etapa16Container');
    const topbar16 = document.getElementById('topbarEtapa16');
    const stepper16 = document.getElementById('stepperEtapa16');
    const formulario16 = document.getElementById('formularioEtapa16');
    const avisoFiscal = document.getElementById('avisoEtapa16Fiscal');

    if (!container16) return;

    // ── MODO LEITURA: Fiscal de Posturas só visualiza a Notificação Preliminar ──
    if (modo === MODO_ACESSO.LEITURA_NOTIFICACAO) {
        // Esconde o formulário do AR e o stepper específico
        if (topbar16) topbar16.style.display = 'none';
        if (stepper16) stepper16.style.display = 'none';
        if (formulario16) formulario16.style.display = 'none';

        // Reaproveita a interface padrão, mas mostra apenas o documento oficial
        container16.style.display = 'block';
        if (topbarPadrao) topbarPadrao.style.display = '';
        if (stepperPadrao) stepperPadrao.style.display = '';
        if (abas) abas.style.display = 'none';
        if (tabContent) tabContent.style.display = 'block';

        // Esconde os painéis de ação da Etapa 1 (multas e anexo da NP assinada)
        const painelAcoes = document.getElementById('painelAcoesEtapa1');
        if (painelAcoes) painelAcoes.style.display = 'none';

        // Ativa a aba do documento oficial
        document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
        const tabDocumento = document.getElementById('tabDocumentoOficial');
        if (tabDocumento) tabDocumento.style.display = 'block';

        // Preenche cabeçalho padrão e ajusta badges para Etapa 1.2
        preencherCabecalhoPagina(proc);
        const elBadgeNum = document.getElementById('etapaNumBadge');
        const elBadgeSt = document.getElementById('etapaStatusBadge');
        if (elBadgeNum) elBadgeNum.textContent = 'Etapa 1.2';
        if (elBadgeSt) elBadgeSt.textContent = 'Retorno do AR';

        // Renderiza a Notificação Preliminar
        renderizarDocumentoOficial(proc);

        // O aviso geral da página já foi inserido por aplicarModoAcesso
        if (avisoFiscal) avisoFiscal.style.display = 'none';

        return;
    }

    // ── MODO NORMAL / VISUALIZAÇÃO: Administrativo de Posturas edita o AR ──
    // Mantém o cabeçalho padrão igual ao da Etapa 1 (título, badges e ações)
    if (topbarPadrao) topbarPadrao.style.display = '';
    if (stepperPadrao) stepperPadrao.style.display = '';
    if (abas) abas.style.display = 'none';
    if (tabContent) tabContent.style.display = 'none';

    container16.style.display = 'block';
    if (topbar16) topbar16.style.display = 'none';
    if (stepper16) stepper16.style.display = 'none';
    if (formulario16) formulario16.style.display = '';
    if (avisoFiscal) avisoFiscal.style.display = 'none';

    const campos = proc.campos || {};
    const dadosAR = campos.etapa16 || {};

    setVal('arNumero', dadosAR.numero_ar);
    setVal('arDataRecebimento', dadosAR.data_recebimento);
    setVal('arRetornoSemSucesso', dadosAR.notificacao_efetivada || (dadosAR.retorno_sem_sucesso === 'sim' ? 'nao' : 'sim'));
    setVal('arDataUltimaTentativa', dadosAR.data_ultima_tentativa);
    setVal('arMotivoCorreios', dadosAR.motivo_correios);

    toggleBlocoRetornoSemSucesso();
    await carregarEExibirAnexosAR(proc);

    // Verifica prazo de 30 dias
    verificarPrazoAR(proc, dadosAR);

    // Desabilita o formulário para quem não tem permissão de edição
    if (modo !== MODO_ACESSO.NORMAL && formulario16) {
        formulario16.querySelectorAll('input, select, button').forEach(el => {
            el.disabled = true;
        });
    }
}

function toggleBlocoRetornoSemSucesso() {
    const select = document.getElementById('arRetornoSemSucesso');
    const bloco = document.getElementById('blocoRetornoSemSucesso');
    if (select && bloco) {
        // Exibe o bloco de retorno sem sucesso quando Notificação efetivada? for 'nao'
        bloco.style.display = select.value === 'nao' ? 'block' : 'none';
    }
}

async function carregarEExibirAnexosAR(proc) {
    if (!proc) return;
    proc._arAnexosLocais = [];

    try {
        const { data: docsDB } = await supabaseClient
            .from('documentos')
            .select('id, nome_arquivo, url')
            .eq('processo_id', proc.id)
            .eq('tipo', 'Anexo AR')
            .order('created_at', { ascending: true });

        if (docsDB && docsDB.length > 0) {
            proc._arAnexosLocais = docsDB.map(d => ({
                documento_id: d.id,
                nome: d.nome_arquivo,
                url: d.url
            }));
        }
    } catch (e) {
        console.warn('Aviso ao consultar anexos do AR em documentos:', e);
    }

    if (proc._arAnexosLocais.length === 0) {
        const dadosAR = proc.campos?.etapa16 || proc.dados?.etapa16 || {};
        if (Array.isArray(dadosAR.anexos_ar)) {
            proc._arAnexosLocais = [...dadosAR.anexos_ar];
        } else if (dadosAR.anexo_ar) {
            proc._arAnexosLocais = [dadosAR.anexo_ar];
        }
    }

    renderizarListaAnexosAR();
}

function renderizarListaAnexosAR() {
    const container = document.getElementById('listaAnexosARContainer');
    if (!container) return;
    container.innerHTML = '';

    const anexos = processoAtual?._arAnexosLocais || [];

    if (anexos.length === 0) {
        container.innerHTML = `<div style="padding:12px; border:1px dashed #cbd5e1; background:#f8fafc; border-radius:8px; text-align:center; color:#64748b; font-size:0.85rem;">Nenhum anexo do AR inserido ainda. (Obrigatório para avançar)</div>`;
        return;
    }

    anexos.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'arquivo-anexado-box';
        div.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-top:4px;';

        const isSalvo = !!item.documento_id;
        const statusHtml = isSalvo
            ? '<span style="color:#16a34a; font-weight:600; font-size:0.8rem;">✓ Salvo no banco (documentos)</span>'
            : '<span style="color:#ea580c; font-weight:600; font-size:0.8rem;">⚠️ Pendente de envio (clique em Salvar/Avançar)</span>';

        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="font-size:1.3rem;">📎</div>
                <div>
                    <div style="font-weight:600; color:#0f172a; font-size:0.9rem;">${item.nome || 'anexo_ar'}</div>
                    ${statusHtml}
                </div>
            </div>
            <div style="display:flex; gap:8px;">
                <button type="button" class="btn-ver-ar-item" data-idx="${idx}" style="padding:6px 12px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:0.82rem; font-weight:600; cursor:pointer;">Visualizar</button>
                <button type="button" class="btn-remover-ar-item" data-idx="${idx}" style="padding:6px 12px; border-radius:8px; border:1px solid #fecaca; background:#fef2f2; color:#dc2626; font-size:0.82rem; font-weight:600; cursor:pointer;">Remover</button>
            </div>
        `;

        container.appendChild(div);
    });

    container.querySelectorAll('.btn-ver-ar-item').forEach(btn => {
        btn.onclick = async (e) => {
            const idx = parseInt(btn.getAttribute('data-idx'), 10);
            const item = processoAtual._arAnexosLocais[idx];
            if (!item) return;

            let fileUrl = item.url || item.dataUrl;
            if (!fileUrl && item.documento_id) {
                try {
                    const { data: doc } = await supabaseClient
                        .from('documentos')
                        .select('url')
                        .eq('id', item.documento_id)
                        .maybeSingle();
                    if (doc && doc.url) fileUrl = doc.url;
                } catch (err) {
                    console.error('Erro ao buscar URL do anexo do AR:', err);
                }
            }

            if (fileUrl) {
                window.abrirAnexoEmNovaAba(fileUrl, e, item.nome);
            } else {
                alert('Não foi possível carregar o anexo do AR.');
            }
        };
    });

    container.querySelectorAll('.btn-remover-ar-item').forEach(btn => {
        btn.onclick = async () => {
            const idx = parseInt(btn.getAttribute('data-idx'), 10);
            const item = processoAtual._arAnexosLocais[idx];
            if (!item) return;

            if (confirm(`Deseja remover o anexo "${item.nome}"?`)) {
                if (item.documento_id) {
                    try {
                        await supabaseClient.from('documentos').delete().eq('id', item.documento_id);
                    } catch (eDel) {
                        console.warn('Aviso ao excluir anexo da tabela documentos:', eDel);
                    }
                }
                processoAtual._arAnexosLocais.splice(idx, 1);
                renderizarListaAnexosAR();
            }
        };
    });
}

function verificarPrazoAR(proc, dadosAR) {
    const badge = document.getElementById('badgeStatusAR');
    if (!badge || !dadosAR.numero_ar) return;

    const dataAR = dadosAR.data_insercao_ar || proc.data_criacao;
    if (!dataAR) return;

    const inicio = new Date(dataAR);
    const hoje = new Date();
    const diffDias = Math.floor((hoje - inicio) / (1000 * 60 * 60 * 24));

    if (diffDias > 15) {
        badge.textContent = 'Prazo de 15 dias expirado';
        badge.style.background = '#fecaca';
        badge.style.color = '#991b1b';
    } else if (dadosAR.data_recebimento) {
        badge.textContent = 'AR Recebido';
        badge.style.background = '#bbf7d0';
        badge.style.color = '#166534';
    } else {
        badge.textContent = `Aguardando AR (${15 - diffDias} dias restantes)`;
    }
}

async function verificarPrazo15DiasEtapa16(proc) {
    const dadosAR = proc.campos?.etapa16 || {};
    if (!dadosAR.numero_ar || dadosAR.data_recebimento) return false;

    const params = new URLSearchParams(window.location.search);
    const testeSegundos = parseInt(params.get('teste_prazo_ar'), 10);
    const prazoMs = isNaN(testeSegundos) ? 15 * 24 * 60 * 60 * 1000 : testeSegundos * 1000;

    const dataInsercao = dadosAR.data_insercao_ar || proc.data_criacao || proc.created_at;
    if (!dataInsercao) return false;

    const inicio = new Date(dataInsercao);
    const agora = new Date();
    const diffMs = agora - inicio;

    if (diffMs >= prazoMs) {
        try {
            const { data: etapa30 } = await supabaseClient
                .from('etapas')
                .select('id')
                .eq('numero', 30)
                .maybeSingle();
            const etapa30Id = etapa30 ? etapa30.id : 30;

            await supabaseClient
                .from('processos')
                .update({ etapa_atual_id: etapa30Id, status: 'prazo_ar_expirado' })
                .eq('id', proc.id);

            await supabaseClient
                .from('historico_etapas')
                .insert([{
                    processo_id: proc.id,
                    etapa_de_id: proc.etapa_atual_id,
                    etapa_para_id: etapa30Id,
                    usuario_id: perfilAtual?.id,
                    condicao_aplicada: 'Prazo de 15 dias do AR expirado',
                    observacao: `Nº AR: ${dadosAR.numero_ar} | Inserido em: ${new Date(dataInsercao).toLocaleString('pt-BR')}`,
                    dados_etapa: { etapa16: dadosAR }
                }]);

            alert('O prazo do AR foi expirado. O processo foi encaminhado para a Etapa 30 (Gerência Localiza o AR).');
            window.location.href = `etapa.html?processo=${proc.id}`;
            return true;
        } catch (err) {
            console.error('Erro ao mover processo para Etapa 30:', err);
        }
    }

    return false;
}

function configurarEventosEtapa16() {
    const selectRetorno = document.getElementById('arRetornoSemSucesso');
    if (selectRetorno) selectRetorno.addEventListener('change', toggleBlocoRetornoSemSucesso);

    const areaDrop = document.getElementById('areaDropAR');
    const inputFile = document.getElementById('inputArquivoAR');
    if (areaDrop && inputFile) {
        areaDrop.addEventListener('click', () => inputFile.click());
        areaDrop.addEventListener('dragover', (e) => { e.preventDefault(); areaDrop.classList.add('dragover'); });
        areaDrop.addEventListener('dragleave', () => areaDrop.classList.remove('dragover'));
        areaDrop.addEventListener('drop', (e) => {
            e.preventDefault();
            areaDrop.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                processarArquivosAR(e.dataTransfer.files);
            }
        });
        inputFile.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                processarArquivosAR(e.target.files);
            }
        });
    }

    const btnSalvar = document.getElementById('btnSalvarEtapa16');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarEtapa16);

    const btnAvancar = document.getElementById('btnAvancarEtapa16');
    if (btnAvancar) btnAvancar.addEventListener('click', avancarEtapa16);
}

async function processarArquivosAR(files) {
    if (!files || files.length === 0) return;
    if (!processoAtual) return;

    processoAtual._arAnexosLocais = processoAtual._arAnexosLocais || [];

    for (const file of Array.from(files)) {
        const dataUrl = await new Promise(resolve => {
            const r = new FileReader();
            r.onload = e => resolve(e.target.result);
            r.readAsDataURL(file);
        });

        processoAtual._arAnexosLocais.push({
            nome: file.name,
            tipo: file.type || 'application/pdf',
            dataUrl: dataUrl
        });
    }

    renderizarListaAnexosAR();
}

async function persistirAnexosAR(exigirObrigatorio = false) {
    if (!processoAtual) return false;

    processoAtual._arAnexosLocais = processoAtual._arAnexosLocais || [];

    if (exigirObrigatorio && processoAtual._arAnexosLocais.length === 0) {
        alert('⚠️ O anexo do AR é OBRIGATÓRIO para avançar de etapa!\n\nPor favor, adicione pelo menos um anexo do AR antes de avançar.');
        return false;
    }

    const perfilId = (typeof perfilAtual !== 'undefined' && perfilAtual?.id) ? perfilAtual.id : null;
    const etapa16Id = 16;
    const refsAnexos = [];

    for (const item of processoAtual._arAnexosLocais) {
        if (item.documento_id) {
            refsAnexos.push({
                documento_id: item.documento_id,
                nome: item.nome
            });
        } else if (item.dataUrl) {
            try {
                const { data: docRes, error: errDoc } = await supabaseClient
                    .from('documentos')
                    .insert([{
                        processo_id: processoAtual.id,
                        etapa_id: etapa16Id,
                        tipo: 'Anexo AR',
                        nome_arquivo: item.nome,
                        url: item.dataUrl,
                        gerado_automaticamente: false,
                        usuario_id: perfilId
                    }])
                    .select('id, nome_arquivo, url')
                    .single();

                if (errDoc) throw errDoc;

                if (docRes && docRes.id) {
                    item.documento_id = docRes.id;
                    item.url = docRes.url;
                    delete item.dataUrl;
                    refsAnexos.push({
                        documento_id: docRes.id,
                        nome: docRes.nome_arquivo
                    });
                }
            } catch (errIns) {
                console.error('Erro ao salvar anexo AR na tabela documentos:', errIns);
                alert('Erro ao salvar anexo do AR no banco de dados: ' + (errIns.message || errIns));
                return false;
            }
        }
    }

    processoAtual.campos = processoAtual.campos || {};
    processoAtual.campos.etapa16 = processoAtual.campos.etapa16 || {};
    processoAtual.campos.etapa16.anexos_ar = refsAnexos;
    delete processoAtual.campos.etapa16.anexo_ar;

    renderizarListaAnexosAR();
    return true;
}

async function salvarEtapa16() {
    if (!processoAtual) return;

    const anexosOK = await persistirAnexosAR(false);
    if (!anexosOK) return;

    processoAtual.campos = processoAtual.campos || {};
    processoAtual.campos.etapa16 = processoAtual.campos.etapa16 || {};

    const getVal = id => document.getElementById(id)?.value?.trim() || '';
    const numeroARAnterior = processoAtual.campos.etapa16.numero_ar;
    const notificacaoEfetivada = getVal('arRetornoSemSucesso') || 'sim';

    processoAtual.campos.etapa16.numero_ar = getVal('arNumero');
    processoAtual.campos.etapa16.data_recebimento = getVal('arDataRecebimento');
    processoAtual.campos.etapa16.notificacao_efetivada = notificacaoEfetivada;
    processoAtual.campos.etapa16.retorno_sem_sucesso = (notificacaoEfetivada === 'nao') ? 'sim' : 'nao';
    processoAtual.campos.etapa16.data_ultima_tentativa = getVal('arDataUltimaTentativa');
    processoAtual.campos.etapa16.motivo_correios = getVal('arMotivoCorreios');

    if (notificacaoEfetivada === 'nao') {
        const lista = processoAtual.campos.etapa16.retornos_sem_sucesso || [];
        const ultimo = lista[lista.length - 1];
        const dataAtual = processoAtual.campos.etapa16.data_ultima_tentativa || '';
        const motivoAtual = processoAtual.campos.etapa16.motivo_correios || '';
        const jaRegistrado = ultimo &&
            ultimo.data === dataAtual &&
            ultimo.motivo === motivoAtual;

        if (!jaRegistrado) {
            lista.push({
                data: dataAtual || new Date().toISOString(),
                motivo: motivoAtual,
                registrado_em: new Date().toISOString()
            });
            processoAtual.campos.etapa16.retornos_sem_sucesso = lista;
        }
    }

    if (processoAtual.campos.etapa16.numero_ar) {
        const numeroAnterior = numeroARAnterior || '';
        const numeroAtual = processoAtual.campos.etapa16.numero_ar;
        if (!processoAtual.campos.etapa16.data_insercao_ar || numeroAtual !== numeroAnterior) {
            processoAtual.campos.etapa16.data_insercao_ar = new Date().toISOString();
        }
    }

    if (processoAtual.campos.etapa16.data_recebimento) {
        await aplicarDataRecebimentoComoInicioPrazo(processoAtual, processoAtual.campos.etapa16.data_recebimento);
    }

    try {
        processoAtual.dados = processoAtual.dados || {};
        processoAtual.dados.campos = processoAtual.campos;

        await supabaseClient
            .from('processos')
            .update({ dados: processoAtual.dados })
            .eq('id', processoAtual.id);
        alert('Dados do AR salvos com sucesso.');
    } catch (err) {
        console.error('Erro ao salvar AR:', err);
        alert('Erro ao salvar dados do AR.');
    }
}

async function avancarEtapa16() {
    if (!processoAtual) return;

    const anexosOK = await persistirAnexosAR(true);
    if (!anexosOK) return;

    const getVal = id => document.getElementById(id)?.value?.trim() || '';
    const dadosAR = processoAtual.campos?.etapa16 || {};
    const notificacaoEfetivada = getVal('arRetornoSemSucesso') || 'sim';
    const dataRecebimento = getVal('arDataRecebimento');

    let proximaEtapaNumero = null;
    let condicao = '';

    if (notificacaoEfetivada === 'sim') {
        const passouEtapa14 = await processoPassouPorEtapa(processoAtual, 14);
        proximaEtapaNumero = passouEtapa14 ? 18 : 2;
        condicao = passouEtapa14 ? 'AR recebido após Etapa 14' : 'AR recebido após Etapa 1';
    } else {
        proximaEtapaNumero = 17;
        condicao = 'Retorno do AR sem sucesso (Notificação não efetivada)';
    }

    if (!proximaEtapaNumero) {
        alert('Preencha a Data de Recebimento pelo Proprietário ou registre 3 retornos sem sucesso para avançar.');
        return;
    }

    mostrarCarregamento('Avançando etapa...');

    try {
        const { data: proxEtapa } = await supabaseClient
            .from('etapas')
            .select('id')
            .eq('numero', proximaEtapaNumero)
            .maybeSingle();

        const proxEtapaId = proxEtapa ? proxEtapa.id : proximaEtapaNumero;

        // Se estiver indo para a Etapa 2, garante que as notificações existam
        if (proximaEtapaNumero === 2) {
            await criarNotificacoesDoProcesso(processoAtual);
        }

        // Aplica a data de recebimento como data inicial do prazo de vencimento das notificações
        if (dataRecebimento) {
            await aplicarDataRecebimentoComoInicioPrazo(processoAtual, dataRecebimento);
        }

        processoAtual.dados = processoAtual.dados || {};
        processoAtual.dados.campos = processoAtual.campos;

        await supabaseClient
            .from('processos')
            .update({
                etapa_atual_id: proxEtapaId,
                status: 'em_andamento',
                dados: processoAtual.dados
            })
            .eq('id', processoAtual.id);

        // Ao sair da Etapa 1.2, as notificações acompanham o processo para a próxima etapa
        if (proximaEtapaNumero === 2) {
            await atualizarNotificacoesParaEtapa2(processoAtual, proxEtapaId);
        } else {
            await supabaseClient
                .from('notificacoes')
                .update({ etapa_atual_id: proxEtapaId, data_movimentacao: new Date().toISOString() })
                .eq('processo_id', processoAtual.id);
        }

        await supabaseClient
            .from('historico_etapas')
            .insert([{
                processo_id: processoAtual.id,
                etapa_de_id: processoAtual.etapa_atual_id,
                etapa_para_id: proxEtapaId,
                usuario_id: perfilAtual?.id,
                condicao_aplicada: condicao,
                observacao: `Nº AR: ${dadosAR.numero_ar || 'N/A'} | Data recebimento: ${dataRecebimento || 'N/A'}`,
                dados_etapa: { etapa16: dadosAR }
            }]);

        window.location.href = `etapa.html?processo=${processoAtual.id}`;
    } catch (err) {
        console.error('Erro ao avançar etapa:', err);
        alert('Erro ao avançar para a próxima etapa.');
        ocultarCarregamento();
    }
}

// ============================================================================
// ETAPA 17 — GERÊNCIA GERA O EDITAL
// ============================================================================

function renderizarEtapa17(proc) {
    const modo = determinarModoAcesso(proc, perfilAtual);

    // Mantém o cabeçalho padrão igual ao da Etapa 1 (título, badges e ações)
    const topbarPadrao = document.querySelector('.etapa-topbar:not(#topbarEtapa17)');
    const stepperPadrao = document.querySelector('.process-stepper-bar:not(#stepperEtapa16)');
    const abas = document.querySelector('.page-tabs');
    const tabContent = document.querySelector('.tab-content-box:not(#formularioEtapa17)');

    if (topbarPadrao) topbarPadrao.style.display = '';
    if (stepperPadrao) stepperPadrao.style.display = '';
    if (abas) abas.style.display = 'none';
    if (tabContent) tabContent.style.display = 'none';

    const container17 = document.getElementById('etapa17Container');
    const topbar17 = document.getElementById('topbarEtapa17');
    const formulario17 = document.getElementById('formularioEtapa17');
    if (container17) container17.style.display = 'block';
    if (topbar17) topbar17.style.display = 'none';
    if (formulario17) formulario17.style.display = '';

    const dadosEtapa17 = proc.campos?.etapa17 || {};
    renderizarAnexoEdital(dadosEtapa17.anexo_edital);

    if (modo !== MODO_ACESSO.NORMAL && formulario17) {
        formulario17.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = true;
        });
    }
}

function configurarEventosEtapa17() {
    const areaDrop = document.getElementById('areaDropEdital');
    const inputFile = document.getElementById('inputArquivoEdital');
    if (areaDrop && inputFile) {
        areaDrop.addEventListener('click', (e) => {
            if (e.target !== inputFile) inputFile.click();
        });
        areaDrop.addEventListener('dragover', (e) => { e.preventDefault(); areaDrop.classList.add('dragover'); });
        areaDrop.addEventListener('dragleave', () => areaDrop.classList.remove('dragover'));
        areaDrop.addEventListener('drop', (e) => {
            e.preventDefault();
            areaDrop.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                inputFile.files = e.dataTransfer.files;
                processarArquivoEdital(e.dataTransfer.files[0]);
            }
        });
        inputFile.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) processarArquivoEdital(e.target.files[0]);
        });
    }

    const btnRemover = document.getElementById('btnRemoverAnexoEdital');
    if (btnRemover) {
        btnRemover.addEventListener('click', () => {
            if (processoAtual) {
                processoAtual.campos = processoAtual.campos || {};
                processoAtual.campos.etapa17 = processoAtual.campos.etapa17 || {};
                delete processoAtual.campos.etapa17.anexo_edital;
                renderizarAnexoEdital(null);
            }
        });
    }

    const btnSalvar = document.getElementById('btnSalvarEtapa17');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarEtapa17);

    const btnAvancar = document.getElementById('btnAvancarEtapa17');
    if (btnAvancar) btnAvancar.addEventListener('click', avancarEtapa17);
}

function processarArquivoEdital(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const anexo = {
            nome: file.name,
            tipo: file.type,
            dataUrl: e.target.result
        };
        if (processoAtual) {
            processoAtual.campos = processoAtual.campos || {};
            processoAtual.campos.etapa17 = processoAtual.campos.etapa17 || {};
            processoAtual.campos.etapa17.anexo_edital = anexo;
        }
        renderizarAnexoEdital(anexo);
    };
    reader.readAsDataURL(file);
}

function renderizarAnexoEdital(anexo) {
    const areaDrop = document.getElementById('areaDropEdital');
    const anexoBox = document.getElementById('anexoEditalAtual');
    const nomeEl = document.getElementById('nomeArquivoEdital');
    const btnVer = document.getElementById('btnVerAnexoEdital');
    const badge = document.getElementById('badgeStatusEdital');

    if (anexo && (anexo.dataUrl || anexo.url)) {
        if (areaDrop) areaDrop.style.display = 'none';
        if (anexoBox) anexoBox.style.display = '';
        if (nomeEl) nomeEl.textContent = anexo.nome || 'edital.pdf';
        if (btnVer) {
            btnVer.href = '#';
            btnVer.onclick = (e) => window.abrirAnexoEmNovaAba(anexo.dataUrl || anexo.url, e);
        }
        if (badge) {
            badge.textContent = 'Anexado';
            badge.style.background = '#bbf7d0';
            badge.style.color = '#166534';
        }
    } else {
        if (areaDrop) areaDrop.style.display = '';
        if (anexoBox) anexoBox.style.display = 'none';
        if (btnVer) btnVer.href = '#';
        if (badge) {
            badge.textContent = 'Pendente';
            badge.style.background = '#fef9c3';
            badge.style.color = '#854d0e';
        }
    }
}

async function salvarEtapa17() {
    if (!processoAtual) return;
    processoAtual.campos = processoAtual.campos || {};
    processoAtual.campos.etapa17 = processoAtual.campos.etapa17 || {};

    const anexo = processoAtual.campos.etapa17.anexo_edital;
    if (anexo) {
        processoAtual.campos.etapa17.data_anexo_edital = new Date().toISOString();
    }

    try {
        processoAtual.dados = processoAtual.dados || {};
        processoAtual.dados.campos = processoAtual.campos;

        await supabaseClient
            .from('processos')
            .update({ dados: processoAtual.dados })
            .eq('id', processoAtual.id);
        alert('Edital salvo com sucesso.');
    } catch (err) {
        console.error('Erro ao salvar Etapa 17:', err);
        alert('Erro ao salvar edital.');
    }
}

async function avancarEtapa17() {
    if (!processoAtual) return;

    const anexo = processoAtual.campos?.etapa17?.anexo_edital;
    if (!anexo) {
        alert('Anexe o edital gerado para avançar.');
        return;
    }

    mostrarCarregamento('Avançando etapa...');

    try {
        const passouEtapa14 = await processoPassouPorEtapa(processoAtual, 14);
        console.log('[DEBUG] avancarEtapa17 — passouEtapa14:', passouEtapa14);
        const proxEtapaNumero = passouEtapa14 ? 18 : 2;
        const status = passouEtapa14 ? 'edital_gerado_defesa' : 'edital_gerado_prazo';

        const { data: proxEtapa } = await supabaseClient
            .from('etapas')
            .select('id')
            .eq('numero', proxEtapaNumero)
            .maybeSingle();

        const proxEtapaId = proxEtapa ? proxEtapa.id : proxEtapaNumero;

        // Se estiver indo para a Etapa 2, garante que as notificações existam
        if (proxEtapaNumero === 2) {
            await criarNotificacoesDoProcesso(processoAtual);
        }

        processoAtual.dados = processoAtual.dados || {};
        processoAtual.dados.campos = processoAtual.campos;

        await supabaseClient
            .from('processos')
            .update({
                etapa_atual_id: proxEtapaId,
                status: status,
                dados: processoAtual.dados
            })
            .eq('id', processoAtual.id);

        // Atualiza todas as notificações do processo para a etapa de destino
        if (proxEtapaNumero === 2) {
            await atualizarNotificacoesParaEtapa2(processoAtual, proxEtapaId);
        } else {
            await supabaseClient
                .from('notificacoes')
                .update({ etapa_atual_id: proxEtapaId, data_movimentacao: new Date().toISOString() })
                .eq('processo_id', processoAtual.id);
        }

        await supabaseClient
            .from('historico_etapas')
            .insert([{
                processo_id: processoAtual.id,
                etapa_de_id: processoAtual.etapa_atual_id,
                etapa_para_id: proxEtapaId,
                usuario_id: perfilAtual?.id,
                condicao_aplicada: 'Edital gerado e anexado',
                observacao: `Destino: Etapa ${proxEtapaNumero} (${passouEtapa14 ? 'passou pela Etapa 14' : 'não passou pela Etapa 14'}).`,
                dados_etapa: { etapa17: processoAtual.campos?.etapa17 || {} }
            }]);

        window.location.href = `etapa.html?processo=${processoAtual.id}`;
    } catch (err) {
        console.error('Erro ao avançar Etapa 17:', err);
        alert('Erro ao avançar para a próxima etapa.');
        ocultarCarregamento();
    }
}

// ============================================================================
// ETAPA 30 — GERENTE LOCALIZA O AR
// ============================================================================

function renderizarEtapa30(proc) {
    const modo = determinarModoAcesso(proc, perfilAtual);

    // Mantém o cabeçalho padrão igual ao da Etapa 1 (título, badges e ações)
    const topbarPadrao = document.querySelector('.etapa-topbar:not(#topbarEtapa30)');
    const stepperPadrao = document.querySelector('.process-stepper-bar:not(#stepperEtapa16)');
    const abas = document.querySelector('.page-tabs');
    const tabContent = document.querySelector('.tab-content-box:not(#formularioEtapa30)');

    if (topbarPadrao) topbarPadrao.style.display = '';
    if (stepperPadrao) stepperPadrao.style.display = '';
    if (abas) abas.style.display = 'none';
    if (tabContent) tabContent.style.display = 'none';

    // Mostra container da Etapa 30 (sem o topbar específico)
    const container30 = document.getElementById('etapa30Container');
    const topbar30 = document.getElementById('topbarEtapa30');
    const formulario30 = document.getElementById('formularioEtapa30');
    if (container30) container30.style.display = 'block';
    if (topbar30) topbar30.style.display = 'none';
    if (formulario30) formulario30.style.display = '';

    const dadosAR = proc.campos?.etapa16 || {};
    setVal('ar30Numero', dadosAR.numero_ar);

    const dadosEtapa30 = proc.campos?.etapa30 || {};
    setVal('ar30Efetivado', dadosEtapa30.efetivado || '');
    setVal('ar30Observacao', dadosEtapa30.observacao || '');

    // Controle de permissão: apenas Gerente edita
    if (modo !== MODO_ACESSO.NORMAL && formulario30) {
        formulario30.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = true;
        });
    }
}

function configurarEventosEtapa30() {
    const btnSalvar = document.getElementById('btnSalvarEtapa30');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarEtapa30);

    const btnAvancar = document.getElementById('btnAvancarEtapa30');
    if (btnAvancar) btnAvancar.addEventListener('click', avancarEtapa30);
}

async function salvarEtapa30() {
    if (!processoAtual) return;
    processoAtual.campos = processoAtual.campos || {};
    processoAtual.campos.etapa30 = processoAtual.campos.etapa30 || {};

    processoAtual.campos.etapa30.efetivado = document.getElementById('ar30Efetivado')?.value || '';
    processoAtual.campos.etapa30.observacao = document.getElementById('ar30Observacao')?.value?.trim() || '';

    try {
        processoAtual.dados = processoAtual.dados || {};
        processoAtual.dados.campos = processoAtual.campos;

        await supabaseClient
            .from('processos')
            .update({ dados: processoAtual.dados })
            .eq('id', processoAtual.id);
        alert('Dados salvos com sucesso.');
    } catch (err) {
        console.error('Erro ao salvar Etapa 30:', err);
        alert('Erro ao salvar dados.');
    }
}

async function avancarEtapa30() {
    if (!processoAtual) return;
    const efetivado = document.getElementById('ar30Efetivado')?.value;

    if (!efetivado) {
        alert('Informe se o AR foi efetivado/localizado para avançar.');
        return;
    }

    mostrarCarregamento('Avançando etapa...');

    try {
        let proxEtapaNumero;
        let condicao;

        if (efetivado === 'nao') {
            proxEtapaNumero = 17;
            condicao = 'AR não efetivado';
        } else {
            const passouEtapa14 = await processoPassouPorEtapa(processoAtual, 14);
            if (passouEtapa14) {
                proxEtapaNumero = 18;
                condicao = 'AR efetivado/localizado (já passou pela Etapa 14)';
            } else {
                proxEtapaNumero = 2;
                condicao = 'AR efetivado/localizado (sem Etapa 14 anterior)';
            }
        }

        const { data: proxEtapa } = await supabaseClient
            .from('etapas')
            .select('id')
            .eq('numero', proxEtapaNumero)
            .maybeSingle();

        const proxEtapaId = proxEtapa ? proxEtapa.id : proxEtapaNumero;

        // Se estiver indo para a Etapa 2, garante que as notificações existam
        if (proxEtapaNumero === 2) {
            await criarNotificacoesDoProcesso(processoAtual);
        }

        processoAtual.dados = processoAtual.dados || {};
        processoAtual.dados.campos = processoAtual.campos;

        await supabaseClient
            .from('processos')
            .update({
                etapa_atual_id: proxEtapaId,
                status: efetivado === 'sim' ? 'ar_efetivado' : 'ar_nao_efetivado',
                dados: processoAtual.dados
            })
            .eq('id', processoAtual.id);

        // Atualiza todas as notificações do processo para a etapa de destino
        if (proxEtapaNumero === 2) {
            await atualizarNotificacoesParaEtapa2(processoAtual, proxEtapaId);
        } else {
            await supabaseClient
                .from('notificacoes')
                .update({ etapa_atual_id: proxEtapaId, data_movimentacao: new Date().toISOString() })
                .eq('processo_id', processoAtual.id);
        }

        await supabaseClient
            .from('historico_etapas')
            .insert([{
                processo_id: processoAtual.id,
                etapa_de_id: processoAtual.etapa_atual_id,
                etapa_para_id: proxEtapaId,
                usuario_id: perfilAtual?.id,
                condicao_aplicada: condicao,
                observacao: document.getElementById('ar30Observacao')?.value?.trim() || '',
                dados_etapa: { etapa30: processoAtual.campos?.etapa30 || {} }
            }]);

        window.location.href = `etapa.html?processo=${processoAtual.id}`;
    } catch (err) {
        console.error('Erro ao avançar Etapa 30:', err);
        alert('Erro ao avançar para a próxima etapa.');
        ocultarCarregamento();
    }
}

// ── Verifica se o processo já passou por uma etapa específica no histórico ─
async function processoPassouPorEtapa(proc, numeroEtapa) {
    try {
        const { data: hist } = await supabaseClient
            .from('historico_etapas')
            .select('etapa_de_id, etapa_para_id')
            .eq('processo_id', proc.id);

        if (!hist || hist.length === 0) return false;

        const idsUnicos = new Set();
        hist.forEach(h => {
            if (h.etapa_de_id) idsUnicos.add(h.etapa_de_id);
            if (h.etapa_para_id) idsUnicos.add(h.etapa_para_id);
        });

        if (idsUnicos.size === 0) return false;

        const { data: etapas } = await supabaseClient
            .from('etapas')
            .select('id, numero')
            .in('id', Array.from(idsUnicos));

        if (!etapas || etapas.length === 0) return false;

        const numerosNoHistorico = new Set(etapas.map(e => parseInt(e.numero, 10)));
        return numerosNoHistorico.has(numeroEtapa);
    } catch (err) {
        console.warn(`Erro ao verificar histórico da Etapa ${numeroEtapa}:`, err);
        return false;
    }
}

// ── Verifica se o processo passou pela Etapa 17 (Edital) ──────────────────
// Quando isso ocorre, o prazo de vencimento das notificações passa a ser 20 dias.
async function processoPassouPelaEtapa17(proc) {
    return processoPassouPorEtapa(proc, 17);
}

// ── Configurar Navegação em Abas na Página ────────────────────────────────
function configurarAbasPagina() {
    const botoes = document.querySelectorAll('.tab-button');
    const panes = document.querySelectorAll('.tab-pane');

    botoes.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.tab;

            botoes.forEach(b => b.classList.remove('active'));
            panes.forEach(p => p.style.display = 'none');

            btn.classList.add('active');
            const painel = document.getElementById(targetId);
            if (painel) painel.style.display = 'block';
        });
    });
}

// ── Salvar Edições do Processo ────────────────────────────────────────────
async function salvarEdicoesProcesso() {
    const processoId = document.getElementById('editProcId')?.value;
    if (!processoId) return;

    try {
        const getVal = id => document.getElementById(id)?.value?.trim() || '';

        const dadosAtuais = processoAtual?.dados || {};

        const novosDados = {
            ...dadosAtuais,
            contribuinte: {
                ...dadosAtuais.contribuinte,
                nome: getVal('editContNome'),
                cpf_cnpj: getVal('editContCpfCnpj'),
                logradouro: getVal('editContLogradouro'),
                numero: getVal('editContNumero'),
                complemento: getVal('editContComplemento'),
                bairro: getVal('editContBairro'),
                municipio: getVal('editContMunicipio'),
                cep: getVal('editContCep')
            },
            imovel: {
                ...dadosAtuais.imovel,
                codigo_reduzido: getVal('editImvCodigo'),
                inscricao: getVal('editImvInscricao'),
                logradouro: getVal('editImvLogradouro'),
                numero: getVal('editImvNumero'),
                bairro: getVal('editImvBairro'),
                testada: getVal('editImvTestada'),
                area_total: getVal('editImvArea')
            },
            fiscal: {
                ...dadosAtuais.fiscal,
                data_vistoria: document.getElementById('editFiscDataVistoria')?.value || '',
                decreto: document.getElementById('editFiscDecreto')?.value || 'não',
                descricao: getVal('editFiscDescricao')
            }
        };

        const { error } = await supabaseClient
            .from('processos')
            .update({
                dados: novosDados,
                updated_at: new Date().toISOString()
            })
            .eq('id', processoId);

        if (error) throw error;

        processoAtual.dados = novosDados;
        renderizarDocumentoOficial(processoAtual);

        alert('Alterações salvas com sucesso!');
    } catch (err) {
        console.error('Erro ao salvar alterações:', err);
        alert('Erro ao salvar alterações: ' + err.message);
    }
}

// ── Imprimir Documento Oficial (PDF via Impressão do Navegador) ────────────
// Garante que o containerDocumentoOficial tenha um documento gerado.
// Se a etapa não gerou documento próprio, renderiza a Notificação Preliminar.
async function garantirDocumentoParaExportar() {
    const container = document.getElementById('containerDocumentoOficial');
    if (!container) return false;

    // Se já existe um documento gerado na etapa (ex: Certidão da etapa 10), usa ele.
    if (container.querySelector('#documentoPronto')) return true;

    // Senão, gera a Notificação Preliminar do processo.
    if (!processoAtual) return false;
    try {
        mostrarCarregamento('Preparando documento...');
        // renderizarDocumentoOficial funciona em qualquer etapa sem depender do painel da Etapa 1
        renderizarDocumentoOficial(processoAtual);
        ocultarCarregamento();
        return !!container.querySelector('#documentoPronto');
    } catch (e) {
        ocultarCarregamento();
        console.error('Erro ao gerar documento para exportar:', e);
        return false;
    }
}
// ── Download do Relatório Fiscal em PDF ────────────────────────────
async function baixarRelatorioFiscalPdfEtapa() {
    const btn = document.getElementById('btnBaixarRelatorioPdfEtapa');
    const oldText = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px; display:inline-block; border: 2px solid transparent; border-top-color: currentColor; border-radius: 50%; animation: spin 1s linear infinite;"></div> Preparando PDF...`;
    }

    try {
        if (!processoAtual) {
            throw new Error("Processo não encontrado.");
        }

        const etapaNum = notificacaoAtual
            ? parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
            : parseInt(processoAtual?.etapa_atual || processoAtual?.etapa_atual_id || 1, 10);

        // Se for Etapa 10 (Certidão), baixa/imprime a visualização perfeita da Certidão
        if (etapaNum === 10) {
            if (typeof window.gerarCertidaoSemDefesa === 'function') {
                await window.gerarCertidaoSemDefesa(true);
            }
            const containerCertidao = document.getElementById('containerDocumentoOficial');

            // Captura e garante o salvamento do campo livre da certidão antes de exportar
            const campoEl = containerCertidao ? containerCertidao.querySelector('#campoLivreCertidao') : null;
            if (campoEl) {
                const hint = campoEl.getAttribute('data-placeholder') || 'clique aqui para digitar...';
                const txt = campoEl.textContent.trim();
                const valorFinal = (txt === '' || txt === hint) ? '' : txt;
                if (notificacaoAtual) {
                    notificacaoAtual.dados = notificacaoAtual.dados || {};
                    if (notificacaoAtual.dados.campo_livre_certidao !== valorFinal) {
                        notificacaoAtual.dados.campo_livre_certidao = valorFinal;
                        await supabaseClient
                            .from('notificacoes')
                            .update({ dados: notificacaoAtual.dados })
                            .eq('id', notificacaoAtual.id);
                    }
                }
            }

            const docEl = containerCertidao ? containerCertidao.querySelector('#documentoPronto') : null;
            const brasaoBase64 = await obterBrasaoBase64() || window.BRASAO_SEMAC_BASE64 || '';
            let rawHtml = docEl ? prepararConteudoDocumento(docEl.outerHTML, brasaoBase64) : (containerCertidao ? containerCertidao.innerHTML : '');

            // Trata o campo livre na versão do PDF impresso
            if (rawHtml) {
                const divTemp = document.createElement('div');
                divTemp.innerHTML = rawHtml;
                const campoTemp = divTemp.querySelector('#campoLivreCertidao');
                if (campoTemp) {
                    const hint = campoTemp.getAttribute('data-placeholder') || 'clique aqui para digitar...';
                    const txt = campoTemp.textContent.trim();
                    if (txt === '' || txt === hint) {
                        campoTemp.textContent = '';
                        campoTemp.style.borderBottom = 'none';
                    } else {
                        campoTemp.textContent = txt;
                        campoTemp.style.color = '#000';
                        campoTemp.style.fontStyle = 'normal';
                        campoTemp.style.borderBottom = 'none';
                    }
                }
                rawHtml = divTemp.innerHTML;
            }

            const htmlComImagens = rawHtml;

            if (!htmlComImagens || htmlComImagens.trim() === '') {
                alert('A Certidão ainda não foi gerada para esta notificação.');
                if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
                return;
            }

            const certNum = notificacaoAtual?.numero_certidao || notificacaoAtual?.dados?.certidao_numero_sequencial || 'XXX';
            const numLimpo = certNum.replace(/[\/\\]/g, '-');

            const tituloOriginal = document.title;
            document.title = `Certidao ${numLimpo}`;

            const estilos = `
                * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                body { margin: 0; padding: 20px; background: #fff; font-family: Calibri, 'Segoe UI', sans-serif; color: black; }
                img { max-width: 100%; height: auto; }
                @media print { body { padding: 0; margin: 0; } @page { size: A4; margin: 0; } }
            `;

            const printIframe = document.createElement('iframe');
            printIframe.style.position = 'absolute';
            printIframe.style.width = '0';
            printIframe.style.height = '0';
            printIframe.style.border = 'none';
            document.body.appendChild(printIframe);

            const printDoc = printIframe.contentWindow.document;
            printDoc.open();
            printDoc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Certidao ${numLimpo}</title><style>${estilos}</style></head><body>${htmlComImagens}</body></html>`);
            printDoc.close();

            setTimeout(() => {
                printIframe.contentWindow.focus();
                printIframe.contentWindow.print();
                setTimeout(() => {
                    if (document.body.contains(printIframe)) {
                        document.body.removeChild(printIframe);
                    }
                    document.title = tituloOriginal;
                }, 1000);
            }, 500);

            if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
            return;
        }

        // Se for Etapa 5 ou 13 (Réplica), baixa/imprime o documento que está sendo visualizado na tela
        if (etapaNum === 5 || etapaNum === 13) {
            if (typeof window.gerarReplica === 'function') {
                await window.gerarReplica();
            }
            const containerReplica = document.getElementById('containerDocumentoOficial');
            const htmlComImagens = (containerReplica && containerReplica.innerHTML && containerReplica.innerHTML.trim() !== '')
                ? containerReplica.innerHTML
                : (notificacaoAtual?.dados?.html_replica || '');

            if (!htmlComImagens || htmlComImagens.trim() === '') {
                alert('A Réplica ainda não foi gerada para esta notificação.');
                if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
                return;
            }

            const numReplica = notificacaoAtual?.dados?.numero_replica || 'XXX';
            const numLimpo = numReplica.replace(/[\/\\]/g, '-');
            const nomeArquivo = `Replica ${numLimpo}.pdf`;

            const tituloOriginal = document.title;
            document.title = `Replica ${numLimpo}`;

            const estilos = `
                * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                body { margin: 0; padding: 20px; background: #fff; font-family: Calibri, 'Segoe UI', sans-serif; color: black; }
                img { max-width: 100%; height: auto; }
                @media print { body { padding: 0; margin: 0; } @page { size: A4; margin: 0; } }
            `;

            const printIframe = document.createElement('iframe');
            printIframe.style.position = 'absolute';
            printIframe.style.width = '0';
            printIframe.style.height = '0';
            printIframe.style.border = 'none';
            document.body.appendChild(printIframe);

            const printDoc = printIframe.contentWindow.document;
            printDoc.open();
            printDoc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Replica ${numLimpo}</title><style>${estilos}</style></head><body>${htmlComImagens}</body></html>`);
            printDoc.close();

            setTimeout(() => {
                printIframe.contentWindow.focus();
                printIframe.contentWindow.print();
                setTimeout(() => {
                    if (document.body.contains(printIframe)) {
                        document.body.removeChild(printIframe);
                    }
                    document.title = tituloOriginal;
                }, 1000);
            }, 500);

            if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
            return;
        }

        let relatorioUrl = null;
        const docId = processoAtual.dados?.relatorio_fiscal?.documento_id;

        if (docId) {
            const { data: doc } = await supabaseClient
                .from('documentos')
                .select('url')
                .eq('id', docId)
                .maybeSingle();
            if (doc && doc.url) relatorioUrl = doc.url;
        }

        if (!relatorioUrl) {
            const { data: doc } = await supabaseClient
                .from('documentos')
                .select('url')
                .eq('processo_id', processoAtual.id)
                .eq('tipo', 'Relatório Fiscal')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (doc && doc.url) relatorioUrl = doc.url;
        }

        if (!relatorioUrl) {
            alert('Não há relatório fiscal salvo na tabela documentos para este processo.');
            return;
        }

        const numeroRelatorio = processoAtual.dados?.relatorio_fiscal?.numero_relatorio || processoAtual.numero_relatorio || 'XXX';
        const numLimpo = numeroRelatorio.replace(/[\/\\]/g, '-');
        const nomeArquivo = `Relatorio Fiscal ${numLimpo}.pdf`;
        const tituloDoc = `Relatorio Fiscal ${numLimpo}`;

        const tituloOriginal = document.title;
        document.title = tituloDoc;

        // Se for um documento assinado (PDF Base64 ou URL), força o download com a nomenclatura exata solicitada
        if (relatorioUrl.startsWith('data:') || relatorioUrl.startsWith('http://') || relatorioUrl.startsWith('https://') || relatorioUrl.startsWith('blob:')) {
            if (relatorioUrl.startsWith('data:')) {
                try {
                    const arr = relatorioUrl.split(',');
                    const mimeMatch = arr[0].match(/:(.*?);/);
                    const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
                    const bstr = atob(arr[1]);
                    let n = bstr.length;
                    const u8arr = new Uint8Array(n);
                    while (n--) {
                        u8arr[n] = bstr.charCodeAt(n);
                    }
                    const blob = new Blob([u8arr], { type: mime });
                    const blobUrl = URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = nomeArquivo;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
                    document.title = tituloOriginal;
                    return;
                } catch (e) {
                    console.error('Erro ao baixar PDF:', e);
                }
            }
            window.abrirAnexoEmNovaAba(relatorioUrl, null, nomeArquivo);
            document.title = tituloOriginal;
            return;
        }

        // Se for o HTML provisório do relatório
        const htmlComImagens = relatorioUrl;

        const estilos = `
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { margin: 0; padding: 20px; background: #fff; font-family: Calibri, 'Segoe UI', sans-serif; color: black; }
            img { max-width: 100%; height: auto; }
            @media print { body { padding: 0; margin: 0; } @page { size: A4; margin: 0; } }
        `;

        const printIframe = document.createElement('iframe');
        printIframe.style.position = 'absolute';
        printIframe.style.width = '0';
        printIframe.style.height = '0';
        printIframe.style.border = 'none';
        document.body.appendChild(printIframe);

        const printDoc = printIframe.contentWindow.document;
        printDoc.open();
        printDoc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${tituloDoc}</title><style>${estilos}</style></head><body>${htmlComImagens}</body></html>`);
        printDoc.close();

        setTimeout(() => {
            printIframe.contentWindow.focus();
            printIframe.contentWindow.print();
            setTimeout(() => {
                if (document.body.contains(printIframe)) {
                    document.body.removeChild(printIframe);
                }
                document.title = tituloOriginal;
            }, 1000);
        }, 500);

    } catch (err) {
        console.error('Erro ao baixar relatório fiscal:', err);
        alert('Erro ao carregar o relatório fiscal: ' + (err.message || 'Falha desconhecida'));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldText;
        }
    }
}

async function imprimirDocumentoOficial() {
    if (!processoAtual) { alert('Processo não encontrado.'); return; }

    const etapaAtual = notificacaoAtual
        ? parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
        : parseInt(processoAtual?.etapa_atual || 1, 10);

    const isAuto = (typeof notificacaoAtual !== 'undefined' && notificacaoAtual) ? ehStatusAutoInfracao(notificacaoAtual) : (etapaAtual >= 14);
    const numNotifLimpo = (notificacaoAtual?.numero || processoAtual?.numero_processo || '2026-000001').replace(/[\/\\]/g, '-');

    // ── Notificação com status de Auto de Infração ──
    if (isAuto) {
        // Tenta buscar o Auto de Infração Assinado se já existir anexo/arquivo no banco
        mostrarCarregamento('Buscando Auto de Infração Assinado...');
        try {
            let docsBanco = [];
            if (notificacaoAtual?.id || processoAtual?.id) {
                const { data } = await supabaseClient
                    .from('documentos')
                    .select('*')
                    .or(`notificacao_id.eq.${notificacaoAtual?.id || 0},processo_id.eq.${processoAtual.id}`)
                    .not('url', 'is', null);
                docsBanco = data || [];
            }

            const docAI = docsBanco.find(d => ['Auto de Infração', 'Auto de Infração Assinado'].includes(d.tipo) || String(d.id) === String(notificacaoAtual?.dados?.auto_infracao_id))
                || (notificacaoAtual?.dados?.etapa14?.anexo_url ? { url: notificacaoAtual.dados.etapa14.anexo_url, nome_arquivo: notificacaoAtual.dados.etapa14.anexo_nome } : null);

            let urlAI = docAI?.url || docAI?.dataUrl || docAI?.base64;
            if (!urlAI && docAI?.documento_id) {
                const { data: dFetch } = await supabaseClient.from('documentos').select('url').eq('id', docAI.documento_id).maybeSingle();
                if (dFetch?.url) urlAI = dFetch.url;
            }

            if (urlAI) {
                ocultarCarregamento();
                const numAutoInfracao = notificacaoAtual?.numero_auto_infracao || notificacaoAtual?.dados?.numero_auto_infracao || processoAtual?.dados?.numero_auto_infracao || '2026/001';
                const procNum = (processoAtual?.numero_processo || '2026-000007').replace(/[\/\\]/g, '-');
                const nomeAutoFormatado = `Auto de Infração N° ${numAutoInfracao.replace(/[\/\\]/g, '-')} - Processo Nº ${procNum}.pdf`;
                window.abrirOuBaixarDocumento(urlAI, docAI?.nome_arquivo || docAI?.nome || nomeAutoFormatado);
                return;
            }
        } catch (errAI) {
            console.warn('Erro ao buscar Auto de Infração Assinado:', errAI);
        }
        ocultarCarregamento();

        // Se não houver anexo assinado, pega o Auto de Infração atualmente visualizado em tela
        let docEl = document.getElementById('documentoPronto');
        if (!docEl || !docEl.innerHTML.includes('AUTO DE INFRAÇÃO')) {
            try {
                mostrarCarregamento('Preparando Auto de Infração para impressão...');
                await window.gerarAutoDeInfracao(false);
                ocultarCarregamento();
                docEl = document.getElementById('documentoPronto');
            } catch (e) {
                ocultarCarregamento();
                console.error('Erro ao gerar Auto de Infração para impressão:', e);
                alert('Erro ao gerar o Auto de Infração para impressão.');
                return;
            }
        }

        if (!docEl) { alert('Documento de Auto de Infração não encontrado.'); return; }

        const numAutoInfracao = notificacaoAtual?.numero_auto_infracao || notificacaoAtual?.dados?.numero_auto_infracao || processoAtual?.dados?.numero_auto_infracao || '2026/001';
        const procNum = (processoAtual?.numero_processo || document.getElementById('etapaProcNumero')?.textContent || '2026-000007').replace(/[\/\\]/g, '-');
        const titulo = `Auto de Infração N° ${numAutoInfracao} - Processo Nº ${procNum}`;

        const brasaoBase64 = await obterBrasaoBase64() || window.BRASAO_SEMAC_BASE64 || 'assets/img/brasao_semac.jpeg';
        let conteudoLimpo = docEl.outerHTML;

        if (brasaoBase64) {
            conteudoLimpo = conteudoLimpo.replace(/src="assets\/img\/brasao_semac\.jpeg"/g, `src="${brasaoBase64}"`);
        }

        conteudoLimpo = `<div class="doc-oficial-wrapper">${conteudoLimpo}</div>`;

        const estilos = `
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { margin: 0; padding: 0; background: #fff; font-family: Calibri, 'Carlito', Arial, sans-serif; color: #000; }
            img { max-width: 100%; height: auto; }
            .doc-oficial-wrapper { max-width: 820px; margin: 0 auto; background: #fff; }
            .doc-sec-heading { font-size: 11.5pt; font-weight: bold; margin-bottom: 4px; }
            .doc-info-grid { display: grid; grid-template-columns: 1.35fr 1fr; column-gap: 20px; font-size: 11pt; line-height: 1.45; }
            table { border-collapse: collapse; }
            @media print { body { padding: 0; margin: 0; } @page { size: A4; margin: 0; } }
        `;

        let iframe = document.getElementById('iframeImpressaoOficial');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'iframeImpressaoOficial';
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0px';
            iframe.style.height = '0px';
            iframe.style.border = '0';
            document.body.appendChild(iframe);
        }

        const docIframe = iframe.contentWindow || iframe.contentDocument;
        const doc = docIframe.document || docIframe;

        const tituloOriginal = document.title;
        document.title = titulo;

        doc.open();
        doc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title><style>${estilos}</style></head><body>${conteudoLimpo}</body></html>`);
        doc.close();

        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
                document.title = tituloOriginal;
            }, 1000);
        }, 500);

        return;
    }

    // ── Etapas < 14: Lógica Original para Notificação Preliminar ──
    try {
        mostrarCarregamento('Preparando Notificação Preliminar para impressão...');
        // Força sempre a renderização da Notificação Preliminar do processo no container
        renderizarDocumentoOficial(processoAtual);
        ocultarCarregamento();
    } catch (e) {
        ocultarCarregamento();
        console.error('Erro ao gerar Notificação Preliminar para impressão:', e);
        alert('Erro ao gerar a Notificação Preliminar para impressão.');
        return;
    }

    const docEl = document.getElementById('documentoPronto');
    if (!docEl) { alert('Documento não encontrado.'); return; }

    const procNum = processoAtual?.numero_processo || document.getElementById('etapaProcNumero')?.textContent || '2026-000001';
    const titulo = `Notificação Preliminar - Processo Nº ${procNum.replace(/[\/\\]/g, '-')}`;

    const brasaoBase64 = await obterBrasaoBase64() || window.BRASAO_SEMAC_BASE64 || 'assets/img/brasao_semac.jpeg';
    let conteudoLimpo = gerarHtmlCompativelComWordDoc(processoAtual, brasaoBase64);
    conteudoLimpo = `<div class="doc-oficial-wrapper"><div class="doc-page-content">${conteudoLimpo}</div></div>`;

    const estilos = `
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { margin: 0; padding: 20px; background: #fff; font-family: Calibri, 'Carlito', Arial, sans-serif; color: #000; max-width: 820px; margin: 0 auto; }
        img { max-width: 100%; height: auto; }
        .doc-oficial-wrapper { max-width: 820px; margin: 0 auto; background: #fff; }
        .doc-page-content { padding: 40px 55px 32px 55px; }
        .doc-title-section { text-align: center; margin-top: 20px; margin-bottom: 12px; }
        .doc-h1 { font-size: 15.5pt; font-weight: bold; text-transform: uppercase; }
        .doc-h2 { font-size: 12.5pt; margin-top: 2px; }
        .doc-data-right { text-align: right; font-size: 11pt; margin-top: 14px; margin-bottom: 16px; }
        .doc-sec-heading { font-size: 11.5pt; font-weight: bold; margin-bottom: 4px; }
        .doc-info-grid { display: grid; grid-template-columns: 1.35fr 1fr; column-gap: 20px; font-size: 11pt; line-height: 1.45; }
        .doc-intro-p { font-size: 11pt; text-align: justify; margin: 22px 0 20px 0; line-height: 1.45; }
        .doc-infracao-bloco { margin: 24px 0; font-size: 11pt; line-height: 1.45; }
        .doc-infracao-titulo { font-size: 13pt; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; }
        .doc-infracao-ul { margin: 8px 0 12px 0; padding-left: 20px; }
        .doc-infracao-ul li { margin-bottom: 4px; }
        .doc-obs-section { margin: 32px 0; font-size: 11pt; line-height: 1.5; }
        .doc-fiscal-sig { text-align: center; margin: 48px auto 40px auto; max-width: 380px; font-size: 11pt; }
        .doc-autuado-receipt { margin-top: 36px; font-size: 11pt; }
        .receipt-box { display: grid; grid-template-columns: 2.2fr 1fr; border: 2px solid #000; height: 96px; }
        .receipt-left { padding: 8px 10px; }
        .receipt-right { border-left: 2px solid #000; padding: 8px 10px; display: flex; flex-direction: column; justify-content: space-between; }
        .receipt-date-slashes { text-align: center; font-size: 14pt; margin-bottom: 12px; }
        .doc-footer-orange-bar { width: 100%; height: 0; border-top: 16px solid #F78C26 !important; background-color: #F78C26 !important; }
        @media print { body { padding: 0; margin: 0; } @page { size: A4; margin: 0; } }
    `;

    let iframe = document.getElementById('iframeImpressaoOficial');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'iframeImpressaoOficial';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
    }

    const docIframe = iframe.contentWindow || iframe.contentDocument;
    const doc = docIframe.document || docIframe;

    const tituloOriginal = document.title;
    document.title = titulo;

    doc.open();
    doc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title><style>${estilos}</style></head><body>${conteudoLimpo}</body></html>`);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
            document.title = tituloOriginal;
        }, 1000);
    }, 500);
}

// ── Funções Auxiliares para Documentos ─────────────────────────────────────
async function obterBrasaoBase64() {
    if (window.BRASAO_SEMAC_BASE64) return window.BRASAO_SEMAC_BASE64;
    return 'assets/img/brasao_semac.jpeg';
}

function prepararConteudoDocumento(conteudo, brasaoBase64) {
    if (!conteudo) return '';
    let divTemp = document.createElement('div');
    divTemp.innerHTML = conteudo;
    let campo = divTemp.querySelector('#campoLivreCertidao');
    if (campo) {
        const hint = campo.getAttribute('data-placeholder') || '';
        if (campo.textContent.trim() === hint) {
            campo.textContent = '';
        }
    }
    return divTemp.innerHTML
        .replace(/src="assets\/img\/brasao_semac\.jpeg"/g, `src="${brasaoBase64}"`)
        .replace(/src='assets\/img\/brasao_semac\.jpeg'/g, `src="${brasaoBase64}"`);
}

// ── Gerar HTML compatível com Microsoft Word (.DOC) com Tabelas nativas ──
function gerarHtmlCompativelComWordDoc(proc, brasaoSrc) {
    const d = proc?.dados || {};
    const cont = d.contribuinte || {};
    const imv = d.imovel || {};
    const fisc = d.fiscal || {};

    const dataFmt = fisc.data_vistoria
        ? new Date(fisc.data_vistoria + 'T12:00:00').toLocaleDateString('pt-BR')
        : new Date().toLocaleDateString('pt-BR');

    let zona = 'XXX', quadra = 'XXXX', lote = 'XXXXX';
    if (imv.inscricao) {
        const parts = imv.inscricao.replace(/\s/g, '').split('.');
        if (parts.length >= 4) {
            zona = parts[0] || 'XXX';
            quadra = parts[2] || 'XXXX';
            lote = parts[3] || 'XXXXX';
        }
    }

    const testada = imv.testada || 'XX';
    const areaTotal = imv.area_total || '288';

    const dispositivos = obterDispositivosDoProcesso(proc || {});
    let blocosInfracoesHtml = '';
    const { areaNum, testadaNum, profundidadeNum, temEsquina } = obterDadosImovelParaCalculo(proc || {});
    const upfmd = valorUpfmdAtual || parseFloat(proc?.campos?.upfmd_utilizado) || 103.00;

    dispositivos.forEach((disp, index) => {
        const numNotif = `${proc?.numero_processo || '1000'}-${index + 1}`;
        const dispLow = (disp || '').toLowerCase();
        const defaultMulta = calcularValorNumDefaultMulta(dispLow, areaNum, testadaNum, profundidadeNum, temEsquina, upfmd);
        const customMulta = proc?.campos?.multas_customizadas?.[index];
        const valMultaFinal = (customMulta !== undefined && customMulta !== null && customMulta !== '')
            ? parseFloat(customMulta)
            : defaultMulta;
        const valFormatado = valMultaFinal.toFixed(2).replace('.', ',');

        let titulo = '', prazo = '', itens = '', penalidade = '', obsFiscal = proc?.campos?.infracoes_obs?.[index] || '';
        const numAI = proc?.campos?.auto_infracao_anterior_numero || 'XXXX';
        const dataAI = proc?.campos?.auto_infracao_anterior_data || 'XX/ XX/ 20XX';
        const textoObsReincidencia = `Na hipótese de reincidência, aplicar-se-á em dobro a multa respectivamente prevista no art. 4º da Lei 7.174/2010. Auto de Infração expedido anteriormente: nº ${numAI} em ${dataAI}.`;

        if (disp.includes('120000232') || dispLow.includes('limpeza e conservação') || dispLow.includes('não edificado')) {
            titulo = 'Falta de limpeza e conservação de imóvel não edificado: infração aos artigos 1º e 2º, III, da Lei 7.174/2010.';
            prazo = '15 DIAS';
            itens = `<li>Executar o serviço de limpeza e remoção do lixo doméstico e entulhos (quando houver) do imóvel de sua propriedade.</li>
                     <li><strong>Proibido:</strong> queimadas, cortar árvores e movimentação de terra (terraplanagem).</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 3º, IV da LEI 7.174/2010, e outras legislações. MULTA NO VALOR DE 15% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) multiplicado pela área total do lote, atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000228') || dispLow.includes('reincidência na inexistência de cercamento')) {
            titulo = 'Reincidência na Inexistência de Cercamento: Infração ao artigo 2º, I, da Lei 7.174/2010.';
            prazo = '60 DIAS';
            itens = `<li>Executar os serviço de construção de muro do imóvel de sua propriedade.</li>
                     <li><strong>Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010:</strong> muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.</li>
                     <li><strong>Não autorizado:</strong> arames lisos e farpado, e cerca viva.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 3º, I, da Lei 7.174/2010, e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, multiplicado por 2 (dois) atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
            obsFiscal = textoObsReincidencia;
        } else if (disp.includes('120000227') || dispLow.includes('reincidência na inexistência de passeio')) {
            titulo = 'Reincidência na Inexistência de passeio: infração ao artigo 1º, § 1º e artigo 2º, I, da Lei 7.174/2010.';
            prazo = '60 DIAS';
            itens = `<li>Executar o serviço de construção de passeio pela testada do imóvel de sua propriedade.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 3º, II, da Lei 7.174/2010 e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada multiplicado por 2 (dois), atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong> (valor dobrado em face da reincidência na infração).`;
            obsFiscal = textoObsReincidencia;
        } else if (disp.includes('120000211') || dispLow.includes('cercamento')) {
            titulo = 'Inexistência de cercamento: infração ao artigo 1º da Lei 7.174/2010.';
            prazo = '60 DIAS';
            itens = `<li>Executar os serviço de construção de muro do imóvel de sua propriedade.</li>
                     <li><strong>Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010:</strong> muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.</li>
                     <li><strong>Não autorizado:</strong> arames lisos e farpado, e cerca viva.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, I e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000226') || dispLow.includes('inexistência de passeio')) {
            titulo = 'Inexistência de passeio: infração ao artigo 1º, § 1º e artigo 2º, I, da Lei 7.174/2010.';
            prazo = '60 DIAS';
            itens = `<li>Executar o serviço de construção de passeio pela testada do imóvel de sua propriedade.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, II e outras legislações. MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000229') || dispLow.includes('reconstrução de/ou reparo de muro') || dispLow.includes('reparo de muro')) {
            titulo = 'Reconstrução e/ou reparo de muro: infração ao artigo 2º, II, da Lei 7.174/2010.';
            prazo = '15 DIAS';
            itens = `<li>Executar o serviço de reconstrução de muro pela testada do imóvel de sua propriedade.</li>
                     <li><strong>Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010:</strong> muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.</li>
                     <li><strong>Não autorizado:</strong> arames lisos e farpado, e cerca viva.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, III e outras legislações. MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000240') || dispLow.includes('reconstrução e/ou reparo de passeio')) {
            titulo = 'Reconstrução e/ou reparo de passeio: infração ao artigo 1º, § 1º e artigo 2º, II, da Lei 7.174/2010.';
            prazo = '15 DIAS';
            itens = `<li>Executar o serviço de reconstrução de passeio/calçada pela testada do imóvel de sua propriedade.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, III e outras legislações. MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (dispLow.includes('muro em má conservação') || dispLow.includes('danificado')) {
            titulo = 'Muro em má conservação ou danificado: infração ao artigo 1º, § 1º e artigo 2º, II, da Lei 7.174/2010.';
            prazo = '15 DIAS';
            itens = `<li>Executar o serviço de reconstrução de muro pela testada do imóvel de sua propriedade.</li>
                     <li><strong>Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010:</strong> muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.</li>
                     <li><strong>Não autorizado:</strong> arames lisos e farpado, e cerca viva.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pela Lei 7.174/2010, artigo 3º, III e outras legislações. MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000233') || dispLow.includes('material de construção')) {
            titulo = 'Depósito de material de construção em passeio ou via pública: infração ao artigo 6°, I, da Lei 6.907/2008.';
            prazo = '24 HORAS';
            itens = `<li>Desobstrução imediata do passeio e/ou via pública e a remoção de todo e qualquer material de construção depositado.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 11 da LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008, e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondente ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000235') || dispLow.includes('obstáculos em calçadas')) {
            titulo = 'Obstáculos em calçadas impedindo o livre trânsito de pedestres e veículos: infração ao artigo 6°, XIII, XIV da Lei 6.907/2008.';
            prazo = '10 DIAS';
            itens = `<li>Retirar os obstáculos do passeio.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 11 da LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008, e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000239') || dispLow.includes('água servida')) {
            titulo = 'Água servida: infração ao artigo 6, inciso IV da Lei nº 6.907/2008.';
            prazo = '10 DIAS';
            itens = `<li>Ligação da água servida à rede de esgoto.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 11 da LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008 e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000236') || dispLow.includes('estabelecimento sem alvará')) {
            titulo = 'Estabelecimento sem alvará: infração ao artigo 190 da Lei nº 6.907/2008.';
            prazo = '10 DIAS';
            itens = `<li>Regularizar o alvará de funcionamento e localização.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 195, LEI Nº 6.907, DE 22 DE DEZEMBRO DE 2008, E OUTRAS LEGISLAÇÕES. MULTA NO VALOR DE: 50 UPFMD, atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000234') || dispLow.includes('reparos por concessionárias')) {
            titulo = 'Reparos por concessionárias: infração ao artigo 163 da Lei 6907/2008 e ao artigo 1º, §3º, da Lei nº 7.174/2010.';
            prazo = '10 DIAS, a contar do término de sua respectiva obra e serviço';
            itens = `<li>Executar serviço de reconstrução de muros e passeios danificados.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 172 da Lei 6907/2008 e outras legislações. MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else if (disp.includes('120000230') || dispLow.includes('piso tátil')) {
            titulo = 'Inexistência de sinalização adequada piso tátil: infração ao artigo 106, IV, da Lei 6.907/2008.';
            prazo = '10 DIAS';
            itens = `<li>Executar a sinalização adequada no piso de acordo com as normas vigentes com alerta para portadores de deficiência.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas pelo artigo 142 da Lei nº 6.907/ 2008 e outras legislações. MULTA NO VALOR DE 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ ${valFormatado}</strong>.`;
        } else {
            titulo = `Infração constatada: ${disp}`;
            prazo = '10 DIAS';
            itens = `<li>Regularizar a situação técnica e documental junto à Secretaria de Meio Ambiente e Cuidado Animal - SEMAC nos termos da legislação municipal.</li>`;
            penalidade = `O <strong>NÃO CUMPRIMENTO</strong> da presente notificação preliminar sujeitará o infrator às penalidades previstas na legislação municipal vigente.`;
        }

        const obsHtml = obsFiscal ? `<p style="margin:8px 0 0 0; font-size:10.5pt; color:#333;"><strong>Observação do Fiscal:</strong> ${obsFiscal}</p>` : '';

        blocosInfracoesHtml += `
            <div style="margin: 24px 0; font-size: 11pt; line-height: 1.45;">
                <div style="font-size: 13pt; font-weight: bold; text-transform: uppercase; margin-bottom: 6px;">NOTIFICAÇÃO PRELIMINAR N° ${numNotif}</div>
                <p style="margin:4px 0;"><strong>${titulo}</strong></p>
                <p style="margin:10px 0 6px 0;">O autuado tem o prazo de até <strong>${prazo}</strong> para tomar as providências:</p>
                <ul style="margin: 8px 0 12px 0; padding-left: 20px;">
                    ${itens}
                </ul>
                <p style="margin:10px 0 0 0; text-align:justify;">${penalidade}</p>
                ${obsHtml}
            </div>
        `;
    });

    return `
        <!-- 1. CABEÇALHO IDÊNTICO AO MODELO - NOTIFICAÇÃO PRELIMINAR -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border-collapse: collapse;">
            <tr>
                <td width="100" rowspan="2" align="center" valign="top" style="padding-right: 12px; width: 100px;">
                    <img src="${brasaoSrc}" width="85" style="width: 85px; height: auto; display: block; margin: 0 auto;">
                </td>
                <td bgcolor="#F78C26" style="background-color: #F78C26; height: 14px; font-size: 1px; line-height: 14px;">&nbsp;</td>
            </tr>
            <tr>
                <td valign="top" style="padding-top: 10px; font-size: 9.5pt; color: #000; line-height: 1.4;">
                    <strong>SECRETARIA MUNICIPAL DE MEIO AMBIENTE E CUIDADO ANIMAL - SEMAC</strong><br>
                    DIRETORIA DE MEIO AMBIENTE<br>
                    GERÊNCIA DE FISCALIZAÇÃO DE POSTURAS<br>
                    <span style="font-size: 9pt;">Av. Paraná, nº2061, sala 207 - Bairro São José - Divinópolis, Minas Gerais</span><br>
                    <span style="font-size: 9pt;">CEP: 35.501-170 Tel: (37) 3229-8176</span>
                </td>
            </tr>
        </table>

        <!-- 2. TÍTULO -->
        <div style="text-align: center; margin-top: 20px; margin-bottom: 12px;">
            <div style="font-size: 15.5pt; font-weight: bold; text-transform: uppercase;">NOTIFICAÇÃO PRELIMINAR</div>
            <div style="font-size: 12.5pt; margin-top: 2px;">Fiscalização de Posturas</div>
            <div style="text-align: right; font-size: 11pt; margin-top: 14px; margin-bottom: 16px;">Divinópolis- MG ${dataFmt}</div>
        </div>

        <!-- 3. INFORMAÇÕES DO CONTRIBUINTE (TABELA DE 2 COLUNAS) -->
        <div style="font-size: 11.5pt; font-weight: bold; margin-bottom: 6px;">Informações do Contribuinte</div>
        <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 11pt; line-height: 1.45; margin-bottom: 16px;">
            <tr>
                <td width="58%" valign="top">
                    <div><strong>Contribuinte:</strong> ${cont.nome || 'Não informado'}</div>
                    <div><strong>Logradouro:</strong> ${cont.logradouro || 'Não informado'}</div>
                    <div><strong>CEP:</strong> ${cont.cep || '35500-000'}</div>
                    <div><strong>Município:</strong> ${cont.municipio || 'Divinópolis'}</div>
                </td>
                <td width="42%" valign="top">
                    <div><strong>CPF/CNPJ:</strong> ${cont.cpf_cnpj || 'Não informado'}</div>
                    <div><strong>Bairro:</strong> ${cont.bairro || 'Não informado'}</div>
                    <div><strong>Número:</strong> ${cont.numero || 'S/N'}</div>
                </td>
            </tr>
        </table>

        <!-- 4. INFORMAÇÕES DO IMÓVEL (TABELA DE 2 COLUNAS) -->
        <div style="font-size: 11.5pt; font-weight: bold; margin-top: 14px; margin-bottom: 6px;">Informações do imóvel</div>
        <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 11pt; line-height: 1.45; margin-bottom: 18px;">
            <tr>
                <td width="58%" valign="top">
                    <div><strong>Inscrição:</strong> ${imv.inscricao || 'XX.XXX.XXXX.XXXXX'}</div>
                    <div><strong>Logradouro:</strong> ${imv.logradouro || 'Não informado'}, n° ${imv.numero || 'S/N'}</div>
                    <div><strong>Bairro:</strong> ${imv.bairro || 'Não informado'}</div>
                </td>
                <td width="42%" valign="top">
                    <div><strong>Zona:</strong> ${zona}</div>
                    <div><strong>Quadra:</strong> ${quadra}</div>
                    <div><strong>Lote:</strong> ${lote}</div>
                </td>
            </tr>
        </table>

        <!-- 5. TEXTO INTRODUTÓRIO -->
        <div style="font-size: 11pt; text-align: justify; margin: 22px 0 20px 0; line-height: 1.45;">
            Verificamos que o imóvel de sua propriedade situado na ${imv.logradouro || 'Rua/Av. XXXXXXXXX'}, ${imv.numero || '0'}, - ${imv.bairro || 'XXXXXXXXXX'} - com ${testada}m de extensão e ${areaTotal}m² de área total, necessita da(s) seguinte(s) regularização(es):
        </div>

        <!-- 6. BLOCOS DE INFRAÇÃO -->
        ${blocosInfracoesHtml}

        <!-- 7. OBSERVAÇÕES E INSTRUÇÕES -->
        <div style="margin: 32px 0; font-size: 11pt; line-height: 1.5;">
            <p>Observação: o prazo é contado <strong>a partir da data do recebimento.</strong></p>
            <p>O autuado tem o prazo de <strong>10 DIAS</strong> para apresentação de defesa via App Divinópolis, disponível para download no Google Play Store (Androids) e na App Store (iPhone).</p>
            <p><strong>Instruções:</strong> link (<span style="color:#F78C26;">colocar aqui o link com as instruções</span>).</p>
        </div>

        <!-- 8. ASSINATURA FISCAL -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 45px; margin-bottom: 35px;">
            <tr>
                <td align="center" style="font-size: 11pt;">
                    <div>________________________________________________</div>
                    <div><strong>${fisc.nome || 'Nome Fiscal'}</strong></div>
                    <div>Fiscal de Posturas</div>
                    <div>Matrícula: ${fisc.matricula || 'XXXXXXX'}</div>
                </td>
            </tr>
        </table>

        <!-- 9. RECIBO DO AUTUADO -->
        <div style="margin-top: 36px; font-size: 11pt;">
            <div style="margin-bottom: 6px;">Recebi 2° via da presente Notificação Preliminar da qual fico ciente</div>
            <table width="100%" cellpadding="10" cellspacing="0" border="1" style="border-collapse: collapse; border: 2px solid #000; font-size: 11pt;">
                <tr>
                    <td width="68%" valign="top" style="border: 2px solid #000; height: 80px;">
                        <span>Assinatura do Autuado:</span>
                    </td>
                    <td width="32%" valign="top" align="center" style="border: 2px solid #000; height: 80px;">
                        <div style="text-align: left; margin-bottom: 25px;">Ciente em:</div>
                        <div style="font-size: 14pt;">____ / ____ / ________</div>
                    </td>
                </tr>
            </table>
            <div style="margin-top: 6px; font-size: 11pt;">Divinópolis - MG</div>
        </div>

        <!-- 10. RODAPÉ LARANJA -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 35px;">
            <tr>
                <td bgcolor="#F78C26" style="background-color: #F78C26; height: 16px; font-size: 1px; line-height: 16px;">&nbsp;</td>
            </tr>
        </table>
    `;
}

// ── Controle Colapsável do Menu Lateral ────────────────────────────────────
function toggleSidebarEtapa(abrir) {
    const sidebar = document.getElementById('sidebarEtapa');
    const btnAbrir = document.getElementById('btnAbrirSidebarEtapa');
    if (!sidebar) return;

    if (abrir) {
        sidebar.style.width = '260px';
        sidebar.style.minWidth = '260px';
        sidebar.style.padding = '';
        sidebar.style.opacity = '1';
        if (btnAbrir) btnAbrir.style.display = 'none';
        localStorage.setItem('sidebar_etapa_aberto', 'sim');
    } else {
        sidebar.style.width = '0px';
        sidebar.style.minWidth = '0px';
        sidebar.style.padding = '0px';
        sidebar.style.opacity = '0';
        if (btnAbrir) btnAbrir.style.display = 'inline-flex';
        localStorage.setItem('sidebar_etapa_aberto', 'nao');
    }
}

function restaurarEstadoSidebarEtapa() {
    const estadoSalvo = localStorage.getItem('sidebar_etapa_aberto');
    if (estadoSalvo === 'nao') {
        toggleSidebarEtapa(false);
    } else {
        toggleSidebarEtapa(true);
    }
}

async function carregarUsuarioSidebarEtapa() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('auth_id', session.user.id)
            .single();

        if (profile) {
            const nomeEl = document.getElementById('sidebarUserNameEtapa');
            const matEl = document.getElementById('sidebarUserMatriculaEtapa');
            const avatarEl = document.getElementById('sidebarAvatarEtapa');
            if (nomeEl) nomeEl.textContent = profile.nome || session.user.email;
            if (matEl) matEl.textContent = `Matrícula: ${profile.matricula || '---'}`;
            if (avatarEl) {
                const fotoSalva = profile.avatar_url || localStorage.getItem('user_avatar_' + session.user.id);
                if (fotoSalva) {
                    avatarEl.innerHTML = `<img src="${fotoSalva}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                } else {
                    const iniciais = (profile.nome || 'FP').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
                    avatarEl.textContent = iniciais;
                }
            }
        }

        const btnLogout = document.getElementById('btnLogoutEtapa');
        if (btnLogout) {
            btnLogout.addEventListener('click', async () => {
                await supabaseClient.auth.signOut();
                window.location.href = 'index.html';
            });
        }
    } catch (e) {
        console.error('Erro ao carregar usuário na sidebar:', e);
    }
}

window.toggleSidebarEtapa = toggleSidebarEtapa;

window.gerarCertidaoSemDefesa = async function (auto = false) {
    if (!processoAtual) return;

    const numNotificacao = document.getElementById('inputNumNotificacaoCertidao')?.value || notificacaoAtual?.numero || '';
    const tipoInfracao = document.getElementById('inputTipoInfracaoCertidao')?.value || notificacaoAtual?.descricao || '';

    const d = processoAtual.dados || {};
    const cont = d.contribuinte || {};
    const imv = d.imovel || {};
    const fisc = d.fiscal || {};

    const nomeAutuado = cont.nome || '';
    const cpfCnpj = cont.cpf_cnpj || '';
    // Endereço na ordem correta: logradouro, nº, bairro, município
    const _endLog = cont.logradouro || cont.endereco || '';
    const _endLogFmt = _endLog ? ((/^rua |^av\.|^avenida |^travessa |^alameda /i).test(_endLog) ? _endLog : `Rua ${_endLog}`) : '';
    const _endNum = cont.numero ? `, nº${cont.numero}` : '';
    const _endBai = cont.bairro ? `, bairro ${cont.bairro}` : '';
    const _endMun = cont.cidade ? `, ${cont.cidade}, MG` : '';
    const enderecoAutuado = `${_endLogFmt}${_endNum}${_endBai}${_endMun}`;

    const inscricao = imv.inscricao || '';

    // Data de vistoria
    const dataVistoriaFmt = fisc.data_vistoria
        ? new Date(fisc.data_vistoria + 'T12:00:00').toLocaleDateString('pt-BR')
        : new Date().toLocaleDateString('pt-BR');

    // Data Ciencia
    const dataRecebimento = processoAtual?.campos?.etapa16?.data_recebimento || processoAtual?.campos?.etapa16?.data_recebimento_proprietario || processoAtual?.dados?.etapa16?.data_recebimento || processoAtual?.dados?.etapa16?.data_recebimento_proprietario || notificacaoAtual?.dados?.etapa16?.data_recebimento_proprietario || notificacaoAtual?.dados?.etapa16?.data_recebimento || (notificacaoAtual?.data_inicio ? notificacaoAtual.data_inicio.split('T')[0] : null);
    let dataCienciaFmt = '___/___/_____';
    let dataDefesaFmt = '___/___/_____';

    if (dataRecebimento) {
        const dCiencia = new Date(dataRecebimento.includes('T') ? dataRecebimento : dataRecebimento + 'T12:00:00');
        dataCienciaFmt = dCiencia.toLocaleDateString('pt-BR');

        const dDefesa = new Date(dCiencia);
        dDefesa.setDate(dDefesa.getDate() + 10);
        dataDefesaFmt = dDefesa.toLocaleDateString('pt-BR');
    }

    const dataAtualFmt = new Date().toLocaleDateString('pt-BR');
    const nomeFiscal = perfilAtual?.nome || 'Fiscal de Posturas';
    const _anoAtual = new Date().getFullYear();

    // ── Número da certidão: sequencial atômico ──────────────────────────────
    // Usa o número já persistido na notificação; reserva novo apenas na 1ª vez.
    let numCertidao = notificacaoAtual?.numero_certidao || '';

    if (!numCertidao && notificacaoAtual?.id) {
        try {
            const { data: numReservado, error: errRes } = await supabaseClient
                .rpc('reservar_numero', { p_ano: _anoAtual, p_categoria: 'Certidão Sem Defesa' });

            if (errRes || !numReservado) {
                console.warn('Falha ao reservar número de certidão via RPC, buscando fallback:', errRes?.message);
                const { data } = await supabaseClient
                    .from('notificacoes')
                    .select('numero_certidao')
                    .like('numero_certidao', `${_anoAtual}/%`);

                let max = 0;
                if (data && data.length > 0) {
                    data.forEach(item => {
                        if (item.numero_certidao) {
                            const p = item.numero_certidao.split('/');
                            if (p.length === 2) {
                                const v = parseInt(p[1], 10);
                                if (!isNaN(v) && v > max) max = v;
                            }
                        }
                    });
                }
                numCertidao = `${_anoAtual}/${String(max + 1).padStart(3, '0')}`;
            } else {
                numCertidao = numReservado;
            }

            // Persiste na tabela notificacoes para que recargas não gerem outro número
            await supabaseClient
                .from('notificacoes')
                .update({ numero_certidao: numCertidao })
                .eq('id', notificacaoAtual.id);
            notificacaoAtual.numero_certidao = numCertidao;

            // Também cria/atualiza o registro padronizado na tabela 'documentos'
            const usuarioId = typeof perfilAtual !== 'undefined' && perfilAtual?.id ? perfilAtual.id : (window.obterPerfilUsuario?.()?.id || null);
            const { data: docExistente } = await supabaseClient
                .from('documentos')
                .select('id')
                .eq('notificacao_id', notificacaoAtual.id)
                .eq('tipo', 'Certidão')
                .maybeSingle();

            if (docExistente?.id) {
                await supabaseClient
                    .from('documentos')
                    .update({
                        numero_sequencial: numCertidao,
                        nome_arquivo: `Certidao_${numCertidao.replace(/[\/\\]/g, '-')}.pdf`
                    })
                    .eq('id', docExistente.id);
                if (notificacaoAtual.dados) notificacaoAtual.dados.certidao_id = docExistente.id;
            } else {
                const { data: docIns } = await supabaseClient
                    .from('documentos')
                    .insert([{
                        processo_id: processoAtual.id,
                        notificacao_id: notificacaoAtual.id,
                        etapa_id: processoAtual.etapa_atual_id || processoAtual.etapa_atual,
                        tipo: 'Certidão',
                        nome_arquivo: `Certidao_${numCertidao.replace(/[\/\\]/g, '-')}.pdf`,
                        gerado_automaticamente: true,
                        numero_sequencial: numCertidao,
                        usuario_id: usuarioId || undefined
                    }])
                    .select('id')
                    .single();
                if (docIns?.id && notificacaoAtual.dados) {
                    notificacaoAtual.dados.certidao_id = docIns.id;
                    await supabaseClient.from('notificacoes').update({ dados: notificacaoAtual.dados }).eq('id', notificacaoAtual.id);
                }
            }
        } catch (e) {
            console.warn('Erro inesperado ao reservar certidão:', e);
            numCertidao = `${_anoAtual}/XXX`;
        }
    } else if (!numCertidao) {
        numCertidao = `${_anoAtual}/XXX`;
    }
    // ─────────────────────────────────────────────────────────────────────────

    const imvLogradouro = imv.logradouro || imv.rua || '';
    const imvBairro = imv.bairro || '';

    const selectResolvido = document.getElementById('selectResolvidoCertidao');
    const isResolvido = selectResolvido ? selectResolvido.value === 'sim' : false;
    const textoCumprimento = isResolvido
        ? `certificamos que houve o cumprimento da obrigação:`
        : `certificamos não cumprimento da obrigação:`;

    const campoLivreSalvo = notificacaoAtual?.dados?.campo_livre_certidao || '';
    const hasCampoLivre = campoLivreSalvo.trim().length > 0;
    const campoLivreContent = hasCampoLivre ? campoLivreSalvo : '';
    const campoLivreStyle = hasCampoLivre
        ? 'border-bottom: 1.5px solid #000; outline: none; display: inline; color: #000; font-style: normal; white-space: pre-wrap; word-break: break-word;'
        : 'border-bottom: 1.5px dashed #94a3b8; outline: none; display: inline-block; min-width: 140px; color: #94a3b8; font-style: italic; white-space: pre-wrap; word-break: break-word;';

    const htmlCertidao = `
        <div id="documentoPronto" style="margin-top: 20px; font-family: Calibri, 'Carlito', Arial, sans-serif;">
            <div style="padding: 40px 55px 0 55px; background: white; max-width: 820px; margin: 0 auto; color: #000; box-shadow: 0 2px 10px rgba(0,0,0,0.08); border: 1px solid #cbd5e1;">
                <!-- CABEÇALHO: logo + linha laranja + nome da secretaria -->
                <div style="display: flex; align-items: flex-start; gap: 18px; margin-bottom: 16px;">
                    <div style="display: flex; flex-direction: column; align-items: center; width: 100px; flex-shrink: 0;">
                        <img src="assets/img/brasao_semac.jpeg" alt="Brasão SEMAC" style="width: 90px; height: auto;" />
                    </div>
                    <div style="flex: 1;">
                        <div style="width: 100%; height: 10px; background-color: #F78C26; margin-bottom: 6px; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
                        <div style="font-size: 10pt; font-weight: bold; color: #000; line-height: 1.3;">SECRETARIA MUNICIPAL DE MEIO AMBIENTE E CUIDADO ANIMAL - SEMAC</div>
                        <div style="font-size: 10pt; font-weight: bold; color: #000; line-height: 1.3;">DIRETORIA DE MEIO AMBIENTE</div>
                        <div style="font-size: 10pt; font-weight: bold; color: #000; line-height: 1.3;">GERÊNCIA DE FISCALIZAÇÃO DE POSTURAS</div>
                        <div style="font-size: 9pt; color: #000; margin-top: 3px; line-height: 1.3;">Av. Paraná, nº2061, sala 207 - Bairro São José - Divinópolis, Minas Gerais CEP:35.501-170 Tel: (37) 3229-8176</div>
                    </div>
                </div>

                <!-- CORPO: idêntico ao Certidão sem defesa.docx -->
                <div style="font-size: 12pt; line-height: 1.5; color: #000; margin-top: 20px;">

                    <p style="margin: 0; text-align: center; font-size: 12pt;"><strong>CERTIDÃO ${numCertidao}</strong></p>
                    <p style="margin: 1px 0; text-align: center; font-size: 12pt;">Fiscalização de Posturas</p>
                    <p style="margin: 1px 0 28px 0; text-align: right; font-size: 12pt;">Divinópolis - MG ${dataAtualFmt}</p>

                    <p style="margin: 0; text-align: justify; line-height: 1.6;">
                        Certifico que o autuado ${nomeAutuado} CPF ${cpfCnpj}, cujo endereço de correspondência é ${enderecoAutuado}, <span id="campoLivreCertidao" contenteditable="true" data-placeholder="clique aqui para digitar..." style="${campoLivreStyle}">${campoLivreContent}</span> referente à Notificação Preliminar ${numNotificacao} do imóvel localizado na ${imvLogradouro}${imvBairro ? ', bairro ' + imvBairro : ''}, com inscrição imobiliária ${inscricao}, a qual teve ciência no dia ${dataCienciaFmt} pelos correios por meio do aviso de recebimento (AR), com prazo para defesa até ${dataDefesaFmt}.
                    </p>

                    <p style="margin: 18px 0 0 0; text-align: justify; line-height: 1.6;">
                        Em vistoria realizada no dia ${dataVistoriaFmt}, ${textoCumprimento} ${tipoInfracao}.
                    </p>

                </div>

                <!-- ASSINATURA -->
                <div style="text-align: center; margin-top: 80px; padding-bottom: 28px; font-size: 12pt;">
                    <div style="display: inline-block; min-width: 280px; border-top: 1px solid #000; padding-top: 6px;">
                        <div>${nomeFiscal}</div>
                        <div>Fiscal de Posturas</div>
                    </div>
                </div>

                <!-- RODAPÉ LARANJA -->
                <div style="width: calc(100% + 104px); margin-left: -52px; height: 16px; background-color: #F78C26; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>

            </div>
        </div>
    `;

    const container = document.getElementById('containerDocumentoOficial');
    if (container) {
        container.innerHTML = htmlCertidao;

        // Comportamento de placeholder e ajuste dinâmico no campo livre
        const campo = container.querySelector('#campoLivreCertidao');
        if (campo) {
            const hint = campo.getAttribute('data-placeholder') || '';

            const salvarCampoLivreDb = async (txtVal) => {
                if (!notificacaoAtual) return;
                notificacaoAtual.dados = notificacaoAtual.dados || {};
                if (notificacaoAtual.dados.campo_livre_certidao !== txtVal) {
                    notificacaoAtual.dados.campo_livre_certidao = txtVal;
                    try {
                        await supabaseClient
                            .from('notificacoes')
                            .update({ dados: notificacaoAtual.dados })
                            .eq('id', notificacaoAtual.id);
                    } catch (err) {
                        console.warn('Erro ao salvar campo livre da certidão:', err);
                    }
                }
            };

            const atualizarEstado = () => {
                const txt = campo.textContent.trim();
                if (txt === '' || txt === hint) {
                    if (document.activeElement !== campo && txt === '') {
                        campo.textContent = hint;
                    }
                    campo.style.display = 'inline-block';
                    campo.style.minWidth = '140px';
                    campo.style.color = '#94a3b8';
                    campo.style.fontStyle = 'italic';
                    salvarCampoLivreDb('');
                } else {
                    campo.style.display = 'inline';
                    campo.style.minWidth = '0px';
                    campo.style.color = '#000';
                    campo.style.fontStyle = 'normal';
                    salvarCampoLivreDb(txt);
                }
            };

            campo.addEventListener('focus', () => {
                if (campo.textContent.trim() === hint) {
                    campo.textContent = '';
                    campo.style.display = 'inline-block';
                    campo.style.minWidth = '140px';
                    campo.style.color = '#000';
                    campo.style.fontStyle = 'normal';
                }
            });

            campo.addEventListener('blur', atualizarEstado);
            campo.addEventListener('input', atualizarEstado);

            atualizarEstado();
        }

        // Scroll para o documento quando acionado manualmente
        if (auto !== true) {
            container.scrollIntoView({ behavior: 'smooth' });
        }
    } else {
        alert("Erro: Container de impressão não encontrado.");
    }
};

window.avancarEtapa10 = async function () {
    if (!processoAtual || !notificacaoAtual) return;

    const select = document.getElementById('selectResolvidoCertidao');
    const resolvido = select ? select.value : '';

    if (!resolvido) {
        alert('Por favor, selecione se o problema foi resolvido ou não antes de avançar.');
        return;
    }

    // Validação de obrigatoriedade do anexo da Certidão Assinada
    let temAnexoCertidao = !!(notificacaoAtual?.dados?.certidao_assinada_nome || notificacaoAtual?.dados?.certidao_id);
    if (temAnexoCertidao && notificacaoAtual?.dados?.certidao_id) {
        const { data: docCert } = await supabaseClient
            .from('documentos')
            .select('id, url')
            .eq('id', notificacaoAtual.dados.certidao_id)
            .not('url', 'is', null)
            .maybeSingle();
        temAnexoCertidao = !!(docCert && docCert.url);
    } else if (!temAnexoCertidao && notificacaoAtual?.id) {
        const { data: docCert } = await supabaseClient
            .from('documentos')
            .select('id, url')
            .eq('notificacao_id', notificacaoAtual.id)
            .in('tipo', ['Certidão', 'Certidão Sem Defesa'])
            .not('url', 'is', null)
            .maybeSingle();
        temAnexoCertidao = !!(docCert && docCert.url);
        if (docCert?.id && notificacaoAtual) {
            notificacaoAtual.dados = notificacaoAtual.dados || {};
            notificacaoAtual.dados.certidao_id = docCert.id;
        }
    }

    if (!temAnexoCertidao) {
        alert('⚠️ Anexo Obrigatório!\n\nPor favor, anexe o PDF da Certidão Assinada antes de avançar a etapa.');
        return;
    }

    mostrarCarregamento('Avançando etapa...');

    let proxEtapa = 14;
    let motivo = 'Não Cumprido (Certidão Sem Defesa)';

    if (resolvido === 'sim') {
        proxEtapa = 29;
        motivo = 'Cumprido (Certidão Sem Defesa)';
    }

    notificacaoAtual.dados = notificacaoAtual.dados || {};
    notificacaoAtual.dados.etapa10 = {
        resolvido: resolvido,
        data_certidao: new Date().toISOString(),
        numero_notificacao_ref: document.getElementById('inputNumNotificacaoCertidao')?.value || '',
        tipo_infracao_ref: document.getElementById('inputTipoInfracaoCertidao')?.value || ''
    };
    await atualizarNotificacaoNoBanco(notificacaoAtual.id, { dados: notificacaoAtual.dados });

    await moverProcessoParaEtapa(proxEtapa, motivo);
};

// ============================================================================
// ETAPA 14 — AUTO DE INFRAÇÃO (Geração de Documento Oficial)
// ============================================================================

window.obterDadosLegaisEValoresAuto = function (infracaoDesc, fisc, proc) {
    const p = proc || processoAtual || {};
    const dispItem = infracaoDesc || notificacaoAtual?.descricao || fisc?.infracao || 'Limpeza de Quintal';
    const dispLow = (dispItem || '').toLowerCase();

    const upfmdVal = window.valorUpfmdAtual || parseFloat(p?.campos?.upfmd_utilizado) || 103.00;

    const { areaNum, testadaNum, profundidadeNum, temEsquina } = window.obterDadosImovelParaCalculo
        ? window.obterDadosImovelParaCalculo(p)
        : { areaNum: parseFloat(fisc?.area_lote_m2 || 288), testadaNum: parseFloat(fisc?.testada_metros || 12), profundidadeNum: 0, temEsquina: false };

    const numAI = p?.campos?.auto_infracao_anterior_numero || notificacaoAtual?.dados?.etapa14?.numero_auto_infracao || 'XXXX';
    const dataAI = p?.campos?.auto_infracao_anterior_data || 'XX/ XX/ 20XX';

    let idxNotif = 0;
    if (p?.notificacoes && Array.isArray(p.notificacoes) && notificacaoAtual) {
        const foundIdx = p.notificacoes.findIndex(n => String(n.id) === String(notificacaoAtual.id));
        if (foundIdx >= 0) idxNotif = foundIdx;
    }

    // Pega o valor numérico padrão usando a função da Notificação Preliminar
    const defMulta = window.calcularValorNumDefaultMulta
        ? window.calcularValorNumDefaultMulta(dispLow, areaNum, testadaNum, profundidadeNum, temEsquina, upfmdVal)
        : 10 * upfmdVal;

    const customMulta = p?.campos?.multas_customizadas?.[idxNotif] ?? notificacaoAtual?.dados?.multas_customizadas?.[idxNotif] ?? notificacaoAtual?.dados?.multa_customizada;
    const valMultaFinal = (customMulta !== undefined && customMulta !== null && customMulta !== '')
        ? parseFloat(customMulta)
        : defMulta;

    const valFormatado = valMultaFinal.toFixed(2).replace('.', ',');

    let leiBase = 'Lei 7.174/2010';
    let dispositivoTexto = '';
    let multaTextoHeader = '';
    let obsFiscal = '';

    // 1) SUBPROCESSO – Falta de limpeza e conservação de imóvel não edificado
    if (dispLow.includes('120000232') || (dispLow.includes('limpeza') && dispLow.includes('não edificado'))) {
        leiBase = 'Lei 7.174/2010';
        dispositivoTexto = 'infração aos artigos 1º e 2º, III, da Lei 7.174/2010.';
        multaTextoHeader = `MULTA NO VALOR DE 15% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) multiplicado pela área total do lote, atualmente correspondendo ao valor de: R$ ${valFormatado}.`;

        // 4) SUBPROCESSO – Reincidência na inexistência de cercamento
    } else if (dispLow.includes('120000228') || (dispLow.includes('reincidência') && dispLow.includes('cercamento'))) {
        leiBase = 'Lei 7.174/2010';
        dispositivoTexto = 'infração ao artigo 2º, I, da Lei 7.174/2010.';
        multaTextoHeader = `MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, multiplicado por 2 (dois) atualmente correspondente ao valor de: R$ ${valFormatado}.`;
        obsFiscal = `Observação do Fiscal: Na hipótese de reincidência, aplicar-se-á em dobro a multa respectivamente prevista no art. 4º da Lei 7.174/2010. Auto de Infração expedido anteriormente: nº ${numAI} em ${dataAI}.`;

        // 5) SUBPROCESSO – Reincidência na inexistência de passeio
    } else if (dispLow.includes('120000227') || (dispLow.includes('reincidência') && dispLow.includes('passeio'))) {
        leiBase = 'Lei 7.174/2010';
        dispositivoTexto = 'infração ao artigo 1º, § 1º e artigo 2º, I, da Lei 7.174/2010.';
        multaTextoHeader = `MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada multiplicado por 2 (dois), atualmente correspondente ao valor de: R$ ${valFormatado} (valor dobrado em face da reincidência na infração).`;
        obsFiscal = `Observação do Fiscal: Na hipótese de reincidência, aplicar-se-á em dobro a multa respectivamente prevista no art. 4º da Lei 7.174/2010. Auto de Infração expedido anteriormente: nº ${numAI} em ${dataAI}.`;

        // 2) SUBPROCESSO – Inexistência de cercamento
    } else if (dispLow.includes('120000211') || (dispLow.includes('inexistência') && dispLow.includes('cercamento')) || dispLow.includes('cercamento')) {
        leiBase = 'Lei 7.174/2010';
        dispositivoTexto = 'infração ao artigo 1º da Lei 7.174/2010.';
        multaTextoHeader = `MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: R$ ${valFormatado}.`;

        // 3) SUBPROCESSO – Inexistência de passeio
    } else if (dispLow.includes('120000226') || (dispLow.includes('inexistência') && dispLow.includes('passeio')) || dispLow.includes('passeio')) {
        leiBase = 'Lei 7.174/2010';
        dispositivoTexto = 'infração ao artigo 1º, § 1º e artigo 2º, I, da Lei 7.174/2010.';
        multaTextoHeader = `MULTA NO VALOR 01 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: R$ ${valFormatado}.`;

        // 6) SUBPROCESSO – Reconstrução e/ou reparos em muro
    } else if (dispLow.includes('120000229') || (dispLow.includes('reconstrução') && dispLow.includes('muro')) || (dispLow.includes('reparo') && dispLow.includes('muro'))) {
        leiBase = 'Lei 7.174/2010';
        dispositivoTexto = 'infração ao artigo 2º, II, da Lei 7.174/2010.';
        multaTextoHeader = `MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: R$ ${valFormatado}.`;

        // 7) SUBPROCESSO – Reconstrução e/ou reparos passeio
    } else if (dispLow.includes('120000240') || (dispLow.includes('reconstrução') && dispLow.includes('passeio')) || (dispLow.includes('reparo') && dispLow.includes('passeio'))) {
        leiBase = 'Lei 7.174/2010';
        dispositivoTexto = 'infração ao artigo 1º, § 1º e artigo 2º, II, da Lei 7.174/2010.';
        multaTextoHeader = `MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: R$ ${valFormatado}.`;

        // 8) SUBPROCESSO – Muro em má conservação ou danificado
    } else if (dispLow.includes('má conservação') || dispLow.includes('danificado')) {
        leiBase = 'Lei 7.174/2010';
        dispositivoTexto = 'infração ao artigo 1º, § 1º e artigo 2º, II, da Lei 7.174/2010.';
        multaTextoHeader = `MULTA NO VALOR 50% da UPFMD (Unidade Padrão Fiscal do Município de Divinópolis) por metro linear de testada, atualmente correspondente ao valor de: R$ ${valFormatado}.`;

        // 9) SUBPROCESSO – Limpeza de quintal
    } else if (dispLow.includes('120000233') || dispLow.includes('limpeza de quintal') || dispLow.includes('quintal')) {
        leiBase = 'Lei nº 6.907/2008';
        dispositivoTexto = 'infração aos artigos 14 e 15 da Lei nº 6.907/2008.';
        multaTextoHeader = `MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: R$ ${valFormatado}.`;

        // 10) SUBPROCESSO – Obstáculos em calçadas
    } else if (dispLow.includes('120000237') || dispLow.includes('obstáculo') || dispLow.includes('obstaculo')) {
        leiBase = 'Lei nº 6.907/2008';
        dispositivoTexto = 'infração ao artigo 6°, XIII, XIV da Lei 6.907/2008.';
        multaTextoHeader = `MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: R$ ${valFormatado}.`;

        // 11) SUBPROCESSO – Água servida
    } else if (dispLow.includes('120000239') || dispLow.includes('água servida') || dispLow.includes('agua servida')) {
        leiBase = 'Lei nº 6.907/2008';
        dispositivoTexto = 'infração ao artigo 6, inciso IV da Lei nº 6.907/2008.';
        multaTextoHeader = `MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: R$ ${valFormatado}.`;

        // 12) SUBPROCESSO – Estabelecimento sem alvará
    } else if (dispLow.includes('120000236') || dispLow.includes('alvará') || dispLow.includes('alvara')) {
        leiBase = 'Lei nº 6.907/2008';
        dispositivoTexto = 'infração ao artigo 190 da Lei nº 6.907/2008.';
        multaTextoHeader = `MULTA NO VALOR DE: 50 UPFMD atualmente correspondendo ao valor de: R$ ${valFormatado}.`;

        // 13) SUBPROCESSO – Reparos por concessionárias
    } else if (dispLow.includes('120000234') || dispLow.includes('concessionária') || dispLow.includes('concessionaria')) {
        leiBase = 'Lei nº 6.907/2008 e Lei nº 7.174/2010';
        dispositivoTexto = 'infração ao artigo 163 da Lei 6.907/2008 e ao artigo 1º, §3º, da Lei nº 7.174/2010.';
        multaTextoHeader = `MULTA NO VALOR de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: R$ ${valFormatado}.`;

        // 14) SUBPROCESSO – Piso Tátil
    } else if (dispLow.includes('120000230') || dispLow.includes('piso tátil') || dispLow.includes('piso tatil')) {
        leiBase = 'Lei nº 6.907/2008';
        dispositivoTexto = 'infração ao artigo 106, IV, da Lei 6.907/2008.';
        multaTextoHeader = `MULTA NO VALOR DE 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: R$ ${valFormatado}.`;

        // Fallback
    } else {
        dispositivoTexto = `infração à legislação municipal vigente.`;
        multaTextoHeader = `MULTA NO VALOR DE 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: R$ ${valFormatado}.`;
    }

    const textoCompleto = `
        <p style="margin: 0 0 10px 0; text-align: justify;">
            O motivo da infração é baseado na ${leiBase} pelo descumprimento dos dispositivos: <strong>${dispositivoTexto}</strong>
        </p>
        <p style="margin: 0 0 10px 0; text-align: justify;">
            ${multaTextoHeader}
        </p>
        ${obsFiscal ? `<p style="margin: 4px 0 0 0; text-align: justify; font-style: italic; font-size: 10pt;">${obsFiscal}</p>` : ''}
    `;

    return {
        textoCompleto
    };
};

window.gerarAutoDeInfracao = async function (auto = false) {
    if (!processoAtual) return;

    const d = {
        ...(processoAtual?.dados || {}),
        ...(notificacaoAtual?.dados || {})
    };
    const cont = d.contribuinte || processoAtual?.dados?.contribuinte || {};
    const imv = d.imovel || processoAtual?.dados?.imovel || {};
    const fisc = d.fiscal || processoAtual?.dados?.fiscal || {};

    const nomeAutuado = cont.nome || 'Não informado';
    const cpfCnpj = cont.cpf_cnpj || 'Não informado';

    // Endereço Autuado
    const endAutuadoLog = cont.logradouro || cont.endereco || 'Não informado';
    const endAutuadoNumVal = cont.numero || 'Não informado';
    const endAutuadoBairroVal = cont.bairro || 'Não informado';
    const endAutuadoCepVal = cont.cep || 'Não informado';

    // Imóvel Fiscalizado
    const imvRua = imv.logradouro || imv.rua || 'Não informado';
    const imvNum = imv.numero || 'XXXX';
    const imvBairro = imv.bairro || 'Não informado';

    // Decomposição da Inscrição (ex: 01.036.00181.00300.00000.0 -> Zona, Quadra, Lote)
    let zona = 'XXX', quadra = 'XXXX', lote = 'XXXXX';
    if (imv.inscricao) {
        const parts = imv.inscricao.replace(/\s/g, '').split('.');
        if (parts.length >= 4) {
            zona = parts[0] || 'XXX';
            quadra = parts[2] || 'XXXX';
            lote = parts[3] || 'XXXXX';
        }
    }

    // Data de vistoria
    const dataVistoriaFmt = window.formatarDataVistoriaRobusta(fisc.data_vistoria || fisc.data || notificacaoAtual?.created_at || processoAtual?.created_at) || new Date().toLocaleDateString('pt-BR');

    const dataAtualFmt = new Date().toLocaleDateString('pt-BR');
    const nomeFiscal = perfilAtual?.nome || fisc.nome || 'Nome Fiscal';
    const matriculaFiscal = perfilAtual?.matricula || fisc.matricula || 'XXXXXXX';
    const _anoAtual = new Date().getFullYear();

    // Número do Auto de Infração: sequencial atômico próprio da tabela autos_infracao
    let numAutoInfracao = notificacaoAtual?.numero_auto_infracao || notificacaoAtual?.dados?.numero_auto_infracao || processoAtual?.dados?.numero_auto_infracao || '';

    if (!numAutoInfracao && (notificacaoAtual?.id || processoAtual?.id)) {
        try {
            // Tenta consultar registro prévio na tabela autos_infracao
            let queryAuto = supabaseClient.from('autos_infracao').select('*');
            if (notificacaoAtual?.id) {
                queryAuto = queryAuto.eq('notificacao_id', notificacaoAtual.id);
            } else {
                queryAuto = queryAuto.eq('processo_id', processoAtual.id);
            }
            const { data: autoExistente } = await queryAuto.maybeSingle();

            if (autoExistente && autoExistente.numero) {
                numAutoInfracao = autoExistente.numero;
            } else {
                const { data: numReservado, error: errRes } = await supabaseClient
                    .rpc('reservar_numero', { p_ano: _anoAtual, p_categoria: 'Auto de Infração' });

                if (errRes || !numReservado) {
                    console.warn('Falha ao reservar número de Auto de Infração:', errRes?.message);
                    numAutoInfracao = `${_anoAtual}/XXX`;
                } else {
                    numAutoInfracao = numReservado;

                    const provenienteDecreto = !!(
                        processoAtual?.dados?.campos?.etapa1?.proveniente_decreto ||
                        processoAtual?.dados?.proveniente_decreto ||
                        processoAtual?.proveniente_decreto
                    );

                    const dataEmissao = new Date();
                    const dataVenc = new Date();
                    dataVenc.setDate(dataVenc.getDate() + 20);

                    // Insere registro na tabela própria autos_infracao
                    const { error: errInsertAuto } = await supabaseClient
                        .from('autos_infracao')
                        .insert({
                            processo_id: processoAtual.id,
                            notificacao_id: notificacaoAtual?.id || null,
                            usuario_id: perfilAtual?.id || null,
                            numero: numAutoInfracao,
                            notificacao_anterior_numero: notificacaoAtual?.numero || null,
                            proveniente_decreto: provenienteDecreto,
                            prazo_dias: 20,
                            data_emissao: dataEmissao.toISOString(),
                            data_vencimento: dataVenc.toISOString(),
                            status: 'emitido',
                            etapa_atual_id: 14,
                            dados: {
                                infracao_descricao: document.getElementById('inputInfracaoAutoInfracao')?.value || notificacaoAtual?.descricao || fisc.infracao || '',
                                autuado_nome: nomeAutuado,
                                autuado_cpf_cnpj: cpfCnpj,
                                fiscal_nome: nomeFiscal,
                                fiscal_matricula: matriculaFiscal
                            }
                        });

                    if (errInsertAuto) {
                        console.warn('Aviso ao salvar auto na tabela autos_infracao:', errInsertAuto.message);
                    }

                    if (notificacaoAtual?.id) {
                        notificacaoAtual.dados = notificacaoAtual.dados || {};
                        notificacaoAtual.dados.numero_auto_infracao = numAutoInfracao;
                        await supabaseClient
                            .from('notificacoes')
                            .update({ dados: notificacaoAtual.dados })
                            .eq('id', notificacaoAtual.id);
                    }
                }
            }
            if (notificacaoAtual) notificacaoAtual.numero_auto_infracao = numAutoInfracao;
        } catch (e) {
            console.warn('Erro ao processar Auto de Infração na tabela:', e);
            numAutoInfracao = `${_anoAtual}/XXX`;
        }
    } else if (!numAutoInfracao) {
        numAutoInfracao = `${_anoAtual}/XXX`;
    }

    const inputInfracao = document.getElementById('inputInfracaoAutoInfracao')?.value || notificacaoAtual?.descricao || fisc.infracao || 'Limpeza de Quintal';
    const inputNotifNum = document.getElementById('inputNumNotifAutoInfracao')?.value || notificacaoAtual?.numero || processoAtual.numero_processo || 'XXXX';

    const dadosLegais = window.obterDadosLegaisEValoresAuto(inputInfracao, fisc, processoAtual);

    const htmlAuto = `
        <div id="documentoPronto" style="margin-top: 20px; font-family: Calibri, 'Carlito', Arial, sans-serif;">
            <div style="padding: 40px 55px 0 55px; background: white; max-width: 820px; margin: 0 auto; color: #000; box-shadow: 0 2px 10px rgba(0,0,0,0.08); border: 1px solid #cbd5e1;">
                
                <!-- CABEÇALHO: idêntico a Certidão e Notificação -->
                <div style="display: flex; align-items: flex-start; gap: 18px; margin-bottom: 16px;">
                    <div style="display: flex; flex-direction: column; align-items: center; width: 100px; flex-shrink: 0;">
                        <img src="assets/img/brasao_semac.jpeg" alt="Brasão SEMAC" style="width: 90px; height: auto;" />
                    </div>
                    <div style="flex: 1;">
                        <div style="width: 100%; height: 10px; background-color: #F78C26; margin-bottom: 6px; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
                        <div style="font-size: 10pt; font-weight: bold; color: #000; line-height: 1.3;">SECRETARIA MUNICIPAL DE MEIO AMBIENTE E CUIDADO ANIMAL - SEMAC</div>
                        <div style="font-size: 10pt; font-weight: bold; color: #000; line-height: 1.3;">DIRETORIA DE MEIO AMBIENTE</div>
                        <div style="font-size: 10pt; font-weight: bold; color: #000; line-height: 1.3;">GERÊNCIA DE FISCALIZAÇÃO DE POSTURAS</div>
                        <div style="font-size: 9pt; color: #000; margin-top: 3px; line-height: 1.3;">Av. Paraná, nº2061, sala 207 - Bairro São José - Divinópolis, Minas Gerais CEP:35.501-170 Tel: (37) 3229-8176</div>
                    </div>
                </div>

                <!-- TÍTULO -->
                <div style="text-align: center; margin-top: 15px; margin-bottom: 12px;">
                    <div style="font-size: 14pt; font-weight: bold; color: #000; text-transform: uppercase;">AUTO DE INFRAÇÃO Nº ${numAutoInfracao}</div>
                    <div style="font-size: 11pt; font-weight: bold; color: #000;">Fiscalização de Posturas</div>
                </div>
                <div style="text-align: right; font-size: 11pt; margin-bottom: 18px;">Divinópolis- MG ${dataAtualFmt}</div>

                <!-- 1. INFORMAÇÕES DO CONTRIBUINTE -->
                <div class="doc-sec-heading">Informações do Contribuinte</div>
                <div class="doc-info-grid">
                    <div>
                        <div><strong>Contribuinte:</strong> ${nomeAutuado}</div>
                        <div><strong>Logradouro:</strong> ${endAutuadoLog}</div>
                        <div><strong>CEP:</strong> ${endAutuadoCepVal}</div>
                        <div><strong>Município:</strong> Divinópolis</div>
                    </div>
                    <div>
                        <div><strong>CPF/CNPJ:</strong> ${cpfCnpj}</div>
                        <div><strong>Bairro:</strong> ${endAutuadoBairroVal}</div>
                        <div><strong>Número:</strong> ${endAutuadoNumVal}</div>
                    </div>
                </div>

                <!-- 2. INFORMAÇÕES DO IMÓVEL -->
                <div class="doc-sec-heading" style="margin-top: 18px;">Informações do imóvel</div>
                <div class="doc-info-grid">
                    <div>
                        <div><strong>Inscrição:</strong> ${imv.inscricao || 'XX.XXX.XXXX.XXXXX'}</div>
                        <div><strong>Logradouro:</strong> ${imvRua}, n° ${imvNum}</div>
                        <div><strong>Bairro:</strong> ${imvBairro}</div>
                    </div>
                    <div>
                        <div><strong>Zona:</strong> ${zona}</div>
                        <div><strong>Quadra:</strong> ${quadra}</div>
                        <div><strong>Lote:</strong> ${lote}</div>
                    </div>
                </div>

                <!-- CORPO DO AUTO DE INFRAÇÃO (FISCAL DE POSTURAS — NÃO DECRETO) -->
                <div style="font-size: 11pt; line-height: 1.6; color: #000; margin-top: 20px;">
                    <p style="margin: 0 0 14px 0; text-align: justify;">
                        O imóvel, situado na <strong>${imvRua}, n° ${imvNum}, bairro ${imvBairro}</strong>, foi fiscalizado no dia <strong>${dataVistoriaFmt}</strong> pelo motivo descrito: <strong>${inputInfracao}</strong>.
                    </p>

                    <p style="margin: 0 0 14px 0; text-align: justify;">
                        Até a presente data foi verificado: o não cumprimento da obrigação da Notificação Preliminar nº: <strong>${inputNotifNum} (${inputInfracao})</strong>.
                    </p>

                    <p style="margin: 0 0 14px 0; text-align: justify;">
                        ${dadosLegais.textoCompleto}
                    </p>

                    <p style="margin: 0 0 20px 0; text-align: justify;">
                        O autuado tem o prazo de <strong>20 DIAS</strong> para apresentação de defesa via App Divinópolis, disponível para download no Google Play Store (Androids) e na App Store (iPhone). Instruções: <a href="https://www.divinopolis.mg.gov.br/portal/servicos/1053/posturas/" target="_blank" style="color:#000; font-weight:bold; text-decoration:underline;">https://www.divinopolis.mg.gov.br</a>.
                    </p>
                </div>

                <!-- ASSINATURA DO FISCAL -->
                <div style="text-align: center; margin-top: 50px; padding-bottom: 10px; font-size: 11pt;">
                    <div style="display: inline-block; min-width: 280px; border-top: 1px solid #000; padding-top: 6px;">
                        <div><strong>${nomeFiscal}</strong></div>
                        <div>Fiscal de Posturas</div>
                        <div>Matricula : ${matriculaFiscal}</div>
                    </div>
                </div>

                <!-- RECIBO DO AUTUADO -->
                <div style="margin-top: 30px; font-size: 11pt;">
                    <div style="margin-bottom: 6px;">Recebi 2° via do presente Auto de Infração do qual fico ciente;</div>
                    <table width="100%" cellpadding="10" cellspacing="0" border="1" style="border-collapse: collapse; border: 2px solid #000; font-size: 11pt;">
                        <tr>
                            <td width="68%" valign="top" style="border: 2px solid #000; height: 80px;">
                                <span>Assinatura do Autuado:</span>
                            </td>
                            <td width="32%" valign="top" align="center" style="border: 2px solid #000; height: 80px;">
                                <div style="text-align: left; margin-bottom: 25px;">Ciente em:</div>
                                <div style="font-size: 14pt;">____ / ____ / ________</div>
                            </td>
                        </tr>
                    </table>
                    <div style="margin-top: 6px; font-size: 11pt;">Divinópolis - MG</div>
                </div>

                <!-- RODAPÉ LARANJA -->
                <div style="width: calc(100% + 104px); margin-left: -52px; height: 16px; background-color: #F78C26; margin-top: 35px; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>

            </div>
        </div>
    `;

    const container = document.getElementById('containerDocumentoOficial');
    if (container) {
        container.innerHTML = htmlAuto;
        if (auto !== true) {
            container.scrollIntoView({ behavior: 'smooth' });
        }
    }
};

function obterHtmlBlocoAutoInfracaoAssinado() {
    return `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-top:20px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                <div style="background:#fef2f2; border:1px solid #fca5a5; padding:10px; border-radius:10px; display:flex; align-items:center; justify-content:center;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                </div>
                <div style="flex:1;">
                    <h4 style="margin:0; font-size:1rem; font-weight:700; color:#1e293b;">Anexar Auto de Infração Assinado <span style="color:#ef4444;">*</span></h4>
                    <p style="margin:2px 0 0 0; color:#64748b; font-size:0.83rem;">Após gerar ou imprimir o Auto de Infração, anexe o documento assinado em PDF aqui.</p>
                </div>
                <span id="badgeStatusAnexoAI" class="badge-status-anexo" style="padding:4px 10px; border-radius:12px; font-size:0.8rem; font-weight:600; background:#f1f5f9; color:#64748b;">Pendente</span>
            </div>

            <div id="areaDropAIAssinado" class="drop-area-clean" style="border: 2px dashed #ef4444; border-radius: 10px; padding: 20px; text-align: center; background: #fff5f5; cursor: pointer; transition: all 0.2s ease;">
                <p style="margin:0; font-weight:600; color:#991b1b; font-size:0.95rem;">Clique para selecionar ou arraste o Auto de Infração Assinado aqui</p>
                <p style="margin:4px 0 12px 0; color:#b91c1c; font-size:0.82rem;">Formato aceito: PDF (Máx. 10MB)</p>
                <input type="file" id="inputArquivoAIAssinado" accept=".pdf" style="display:none;" />
                <button type="button" class="btn-selecionar-arquivo" onclick="document.getElementById('inputArquivoAIAssinado').click()" style="padding:8px 16px; border-radius:6px; border:none; background:#ef4444; cursor:pointer; font-weight:600; color:#ffffff; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.2);">Escolher Arquivo PDF</button>
            </div>

            <div id="anexoAIAtual" class="arquivo-anexado-box" style="display:none; margin-top:14px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:14px;">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div class="file-icon-badge" style="font-size:1.4rem;">🚨</div>
                        <div>
                            <div id="nomeArquivoAIAssinado" style="font-weight:600; color:#0f172a; font-size:0.95rem;">auto_infracao_assinado.pdf</div>
                            <div id="dataArquivoAIAssinado" style="color:#16a34a; font-weight:600; font-size:0.8rem;">Anexado com sucesso</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <a id="btnVerAnexoAI" href="#" target="_blank" class="btn-sm btn-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #cbd5e1; color:#334155; text-decoration:none; font-size:0.82rem; font-weight:600;">Visualizar</a>
                        <button id="btnRemoverAnexoAI" type="button" class="btn-sm btn-danger-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #fecaca; background:#fef2f2; color:#dc2626; font-size:0.82rem; font-weight:600; cursor:pointer;">Substituir / Remover</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
window.obterHtmlBlocoAutoInfracaoAssinado = obterHtmlBlocoAutoInfracaoAssinado;

window.configurarEventosAIAssinado = function () {
    const areaDrop = document.getElementById('areaDropAIAssinado');
    const inputArquivo = document.getElementById('inputArquivoAIAssinado');
    const btnRemover = document.getElementById('btnRemoverAnexoAI');

    if (areaDrop && inputArquivo) {
        areaDrop.addEventListener('click', (e) => {
            if (e.target !== inputArquivo && !e.target.classList.contains('btn-selecionar-arquivo')) {
                inputArquivo.click();
            }
        });

        areaDrop.addEventListener('dragover', (e) => {
            e.preventDefault();
            areaDrop.style.borderColor = '#dc2626';
            areaDrop.style.background = '#fee2e2';
        });

        areaDrop.addEventListener('dragleave', (e) => {
            e.preventDefault();
            areaDrop.style.borderColor = '#ef4444';
            areaDrop.style.background = '#fff5f5';
        });

        areaDrop.addEventListener('drop', async (e) => {
            e.preventDefault();
            areaDrop.style.borderColor = '#ef4444';
            areaDrop.style.background = '#fff5f5';
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                inputArquivo.files = e.dataTransfer.files;
                inputArquivo.dispatchEvent(new Event('change'));
            }
        });

        inputArquivo.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            mostrarCarregamento('Validando Auto de Infração Assinado...');

            try {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const fileUrl = ev.target.result;
                    const perfilId = (typeof perfilAtual !== 'undefined' && perfilAtual?.id) ? perfilAtual.id : null;

                    let docId = notificacaoAtual?.dados?.auto_infracao_id || null;
                    let numAuto = notificacaoAtual?.dados?.numero_auto_infracao || notificacaoAtual?.numero_auto_infracao || null;

                    try {
                        const { data: docExistente } = await supabaseClient
                            .from('documentos')
                            .select('id, numero_sequencial')
                            .eq('notificacao_id', notificacaoAtual.id)
                            .in('tipo', ['Auto de Infração', 'Auto de Infração Assinado'])
                            .maybeSingle();

                        if (docExistente) {
                            docId = docExistente.id;
                            if (docExistente.numero_sequencial) numAuto = docExistente.numero_sequencial;
                            await supabaseClient
                                .from('documentos')
                                .update({
                                    url: fileUrl,
                                    nome_arquivo: file.name,
                                    mime_type: file.type,
                                    gerado_automaticamente: false,
                                    usuario_id: perfilId || undefined
                                })
                                .eq('id', docExistente.id);
                        } else {
                            const { data: docIns } = await supabaseClient
                                .from('documentos')
                                .insert([{
                                    processo_id: processoAtual.id,
                                    notificacao_id: notificacaoAtual.id,
                                    etapa_id: 14,
                                    tipo: 'Auto de Infração',
                                    nome_arquivo: file.name,
                                    url: fileUrl,
                                    mime_type: file.type,
                                    gerado_automaticamente: false,
                                    numero_sequencial: numAuto || null,
                                    usuario_id: perfilId || undefined
                                }])
                                .select('id')
                                .single();

                            if (docIns) docId = docIns.id;
                        }
                    } catch (errDb) {
                        console.warn('Aviso ao salvar Auto de Infração no banco:', errDb);
                    }

                    notificacaoAtual.dados = notificacaoAtual.dados || {};
                    notificacaoAtual.dados.auto_infracao_id = docId;
                    notificacaoAtual.dados.etapa14 = notificacaoAtual.dados.etapa14 || {};
                    notificacaoAtual.dados.etapa14.anexo_url = fileUrl;
                    notificacaoAtual.dados.etapa14.anexo_nome = file.name;
                    notificacaoAtual.dados.etapa14.data_anexo = new Date().toISOString();

                    await atualizarNotificacaoNoBanco(notificacaoAtual.id, { dados: notificacaoAtual.dados });

                    ocultarCarregamento();
                    alert('Auto de Infração Assinado anexado com sucesso!');
                    window.carregarEExibirAnexoAIAssinado();
                };
                reader.readAsDataURL(file);
            } catch (err) {
                ocultarCarregamento();
                alert('Erro ao processar arquivo: ' + err.message);
            }
        });
    }

    if (btnRemover) {
        btnRemover.addEventListener('click', async () => {
            if (!confirm('Deseja substituir ou remover o Auto de Infração Assinado?')) return;
            mostrarCarregamento('Removendo anexo...');

            try {
                if (notificacaoAtual?.id) {
                    await supabaseClient
                        .from('documentos')
                        .delete()
                        .eq('notificacao_id', notificacaoAtual.id)
                        .in('tipo', ['Auto de Infração', 'Auto de Infração Assinado']);
                }

                if (notificacaoAtual?.dados?.etapa14) {
                    delete notificacaoAtual.dados.etapa14.anexo_url;
                    delete notificacaoAtual.dados.etapa14.anexo_nome;
                    delete notificacaoAtual.dados.auto_infracao_id;
                    await atualizarNotificacaoNoBanco(notificacaoAtual.id, { dados: notificacaoAtual.dados });
                }
            } catch (e) {
                console.warn('Erro ao remover anexo AI:', e);
            }

            ocultarCarregamento();
            alert('Anexo do Auto de Infração Assinado removido com sucesso!');
            window.carregarEExibirAnexoAIAssinado();
        });
    }
};

window.carregarEExibirAnexoAIAssinado = async function () {
    const areaDrop = document.getElementById('areaDropAIAssinado');
    const boxAtual = document.getElementById('anexoAIAtual');
    const badgeStatus = document.getElementById('badgeStatusAnexoAI');
    const nomeEl = document.getElementById('nomeArquivoAIAssinado');
    const dataEl = document.getElementById('dataArquivoAIAssinado');
    const btnVer = document.getElementById('btnVerAnexoAI');

    if (!areaDrop || !boxAtual) return;

    let docUrl = notificacaoAtual?.dados?.etapa14?.anexo_url || null;
    let docNome = notificacaoAtual?.dados?.etapa14?.anexo_nome || 'auto_infracao_assinado.pdf';
    let docData = notificacaoAtual?.dados?.etapa14?.data_anexo || null;

    if (!docUrl && notificacaoAtual?.id) {
        const { data: docDb } = await supabaseClient
            .from('documentos')
            .select('*')
            .eq('notificacao_id', notificacaoAtual.id)
            .in('tipo', ['Auto de Infração', 'Auto de Infração Assinado'])
            .not('url', 'is', null)
            .maybeSingle();

        if (docDb) {
            docUrl = docDb.url;
            docNome = docDb.nome_arquivo || docNome;
            docData = docDb.created_at || docData;
            notificacaoAtual.dados = notificacaoAtual.dados || {};
            notificacaoAtual.dados.etapa14 = notificacaoAtual.dados.etapa14 || {};
            notificacaoAtual.dados.etapa14.anexo_url = docUrl;
            notificacaoAtual.dados.etapa14.anexo_nome = docNome;
        }
    }

    if (docUrl) {
        areaDrop.style.display = 'none';
        boxAtual.style.display = 'block';

        if (badgeStatus) {
            badgeStatus.textContent = 'Anexado';
            badgeStatus.style.background = '#dcfce7';
            badgeStatus.style.color = '#15803d';
        }
        if (nomeEl) nomeEl.textContent = docNome;
        if (dataEl) {
            dataEl.textContent = docData ? `Anexado em ${new Date(docData).toLocaleString('pt-BR')}` : 'Anexado com sucesso';
        }
        if (btnVer) {
            btnVer.onclick = (e) => window.abrirAnexoEmNovaAba(docUrl, e, docNome);
        }
    } else {
        areaDrop.style.display = 'block';
        boxAtual.style.display = 'none';

        if (badgeStatus) {
            badgeStatus.textContent = 'Pendente';
            badgeStatus.style.background = '#f1f5f9';
            badgeStatus.style.color = '#64748b';
        }
    }
};

window.avancarEtapa14 = async function () {
    if (!processoAtual || !notificacaoAtual) return;

    // Validação do Anexo Obrigatório do Auto de Infração Assinado
    let temAnexoAI = !!(notificacaoAtual?.dados?.etapa14?.anexo_url || notificacaoAtual?.dados?.auto_infracao_id);
    if (!temAnexoAI && notificacaoAtual?.id) {
        const { data: docAI } = await supabaseClient
            .from('documentos')
            .select('id, url')
            .eq('notificacao_id', notificacaoAtual.id)
            .in('tipo', ['Auto de Infração', 'Auto de Infração Assinado'])
            .not('url', 'is', null)
            .maybeSingle();
        temAnexoAI = !!(docAI && docAI.url);
    }

    if (!temAnexoAI) {
        alert('⚠️ Anexo Obrigatório!\n\nPor favor, anexe o PDF do Auto de Infração Assinado antes de avançar para a Etapa 15.');
        return;
    }

    mostrarCarregamento('Avançando para Etapa 15 (Gerente Gera a Multa)...');

    const numAuto = notificacaoAtual.numero_auto_infracao || notificacaoAtual.dados?.numero_auto_infracao || `${new Date().getFullYear()}/000001`;

    notificacaoAtual.status = 'auto_infracao';
    notificacaoAtual.dados = notificacaoAtual.dados || {};
    notificacaoAtual.dados.numero_auto_infracao = numAuto;
    notificacaoAtual.dados.etapa14 = notificacaoAtual.dados.etapa14 || {};
    notificacaoAtual.dados.etapa14.data_emissao = new Date().toISOString();
    notificacaoAtual.dados.etapa14.numero_auto_infracao = numAuto;
    notificacaoAtual.dados.etapa14.usuario_emissor = perfilAtual?.nome || 'Fiscal de Posturas';

    await atualizarNotificacaoNoBanco(notificacaoAtual.id, { status: 'auto_infracao', dados: notificacaoAtual.dados });

    // Atualiza tabela própria autos_infracao
    try {
        await supabaseClient
            .from('autos_infracao')
            .update({
                status: 'enviado_gerencia',
                etapa_atual_id: 15,
                updated_at: new Date().toISOString()
            })
            .eq('processo_id', processoAtual.id)
            .eq('numero', numAuto);
    } catch (e) {
        console.warn('Aviso ao atualizar etapa na tabela autos_infracao:', e);
    }

    await moverProcessoParaEtapa(15, 'Auto de Infração Emitido');
};

// ── Helper para abrir Base64 no Chrome de forma segura ──
window.abrirAnexoEmNovaAba = function (urlOuBase64, event, nomeArquivo) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (!urlOuBase64 || urlOuBase64 === '#') return;

    if (urlOuBase64.startsWith('data:')) {
        try {
            const arr = urlOuBase64.split(',');
            const mimeMatch = arr[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], { type: mime });
            const blobUrl = URL.createObjectURL(blob);

            const win = window.open(blobUrl, '_blank');
            if (!win) {
                const a = document.createElement('a');
                a.href = blobUrl;
                a.target = '_blank';
                if (nomeArquivo) a.download = nomeArquivo;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
            setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        } catch (e) {
            console.error('Erro ao converter base64 para blob:', e);
            alert('Não foi possível abrir o anexo base64.');
        }
    } else if (typeof urlOuBase64 === 'string' && (urlOuBase64.trim().startsWith('<') || urlOuBase64.includes('<html') || urlOuBase64.includes('<div') || urlOuBase64.includes('<style'))) {
        try {
            const blob = new Blob([urlOuBase64], { type: 'text/html;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, '_blank');
            setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        } catch (e) {
            console.error('Erro ao abrir HTML em nova aba:', e);
            window.open(urlOuBase64, '_blank');
        }
    } else {
        window.open(urlOuBase64, '_blank');
    }
};

window.abrirAnexoObjeto = async function (anexoObj, event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (!anexoObj) return;

    let url = anexoObj.dataUrl || anexoObj.url || anexoObj.base64;
    const nome = anexoObj.nome || anexoObj.nome_arquivo || 'documento.pdf';

    if (!url && anexoObj.documento_id) {
        try {
            const { data: doc } = await supabaseClient
                .from('documentos')
                .select('url')
                .eq('id', anexoObj.documento_id)
                .maybeSingle();
            if (doc && doc.url) {
                url = doc.url;
            }
        } catch (e) {
            console.error('Erro ao buscar URL do documento:', e);
        }
    }

    if (!url) {
        alert('Conteúdo/URL do documento não encontrado na tabela documentos.');
        return;
    }

    window.abrirAnexoEmNovaAba(url, event, nome);
};

window.abrirAnexoNotificacao = function (etapaKey, index) {
    const anexos = notificacaoAtual?.dados?.[etapaKey]?.anexos || [];
    const anexo = anexos[index];
    if (!anexo) {
        alert('Anexo não encontrado.');
        return;
    }
    const content = anexo.base64 || anexo.url || anexo.dataUrl;
    if (!content) {
        alert('Conteúdo do anexo indisponível.');
        return;
    }
    window.abrirAnexoEmNovaAba(content, null, anexo.nome);
};

// ── Etapa 5: Funções da Dilação e Réplica ──

window.toggleOpcoesGerente = function () {
    const val = document.getElementById('selectDecisaoGerente')?.value;
    const blocoData = document.getElementById('blocoDataDilacaoGerente');
    const blocoJust = document.getElementById('blocoJustificativaGerente');
    const blocoCertidao = document.getElementById('blocoCertidaoGerente');

    if (blocoData) blocoData.style.display = (val === 'dilatar') ? 'block' : 'none';
    if (blocoCertidao) blocoCertidao.style.display = (val === 'defere') ? 'block' : 'none';
    if (blocoJust) blocoJust.style.display = (val !== '') ? 'block' : 'none';
};

window.toggleOpcoesDilacao = function () {
    const val = document.getElementById('selectDecisaoDilacao')?.value;
    const blocoDias = document.getElementById('blocoDiasDilacao');
    const blocoJustificativa = document.getElementById('blocoJustificativaDilacao');
    const blocoParecer = document.getElementById('blocoParecerGerente');

    if (blocoDias) blocoDias.style.display = (val === 'defere') ? 'block' : 'none';
    if (blocoJustificativa) blocoJustificativa.style.display = (val === 'indefere' || val === 'gerente') ? 'block' : 'none';
    if (blocoParecer) blocoParecer.style.display = (val === 'gerente') ? 'block' : 'none';

    window.gerarReplica();
};

window.contadorImagensReplica = 0;

window.adicionarCampoImagemReplica = function () {
    window.contadorImagensReplica++;
    const id = window.contadorImagensReplica;

    const div = document.createElement('div');
    div.id = `item-imagem-replica-${id}`;
    div.style.cssText = 'position:relative; background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:8px; display:flex; gap:16px; align-items:center;';

    div.innerHTML = `
        <button type="button" onclick="document.getElementById('item-imagem-replica-${id}').remove()" style="position:absolute; top:-8px; right:-8px; background:#ef4444; color:white; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer; font-weight:bold; font-size:12px; z-index:10; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.1);" title="Remover Imagem">✕</button>
        <div style="flex:1;">
            <label style="display:block; font-size:0.85rem; font-weight:600; color:#475569; margin-bottom:4px;">Selecione a Imagem</label>
            <input type="file" class="replica-imagem-arquivo" accept="image/*" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; background:white;">
        </div>
        <div style="flex:2;">
            <label style="display:block; font-size:0.85rem; font-weight:600; color:#475569; margin-bottom:4px;">Legenda da Imagem</label>
            <input type="text" class="replica-imagem-legenda" placeholder="Ex: Foto do local..." style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; outline:none;">
        </div>
    `;

    document.getElementById('containerImagensForm').appendChild(div);
};

window.gerarReplica = async function () {
    if (!processoAtual) return;

    const etapaAtual = notificacaoAtual
        ? parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
        : parseInt(processoAtual?.etapa_atual || processoAtual?.etapa_atual_id || 1, 10);

    // Se NÃO for etapa de edição da réplica (5 ou 13) e já existir o HTML da Réplica no banco, renderiza o salvo:
    if (![5, 13].includes(etapaAtual) && notificacaoAtual?.dados?.html_replica) {
        const container = document.getElementById('containerDocumentoOficial');
        if (container) {
            container.innerHTML = notificacaoAtual.dados.html_replica;
        }
        return;
    }

    const d = processoAtual.dados || {};
    const cont = processoAtual.campos?.contribuinte || d.contribuinte || {};
    const imovel = processoAtual.campos?.imovel || d.imovel || {};

    // Obter PA
    const pa = d.relatorio_fiscal?.pa || d.relatorio_fiscal?.numero_processo_administrativo || 'Não informado';

    const numNotificacao = notificacaoAtual?.numero || document.getElementById('etapaProcNumero')?.textContent || 'XXX';
    const imvLogradouro = imovel.logradouro || imovel.rua || '—';
    const imvNumero = imovel.numero || '—';
    const numLimpo = numNotificacao.replace(/[\/\\]/g, '-');
    const motivoInfracao = notificacaoAtual?.descricao || 'Regularização solicitada';

    // Datas
    const arData = processoAtual?.campos?.etapa16?.data_insercao_ar || processoAtual?.dados?.campos?.etapa16?.data_insercao_ar || processoAtual?.dados?.etapa16?.data_insercao_ar || notificacaoAtual?.dados?.etapa16?.data_insercao_ar || d.data_insercao_ar || notificacaoAtual?.dados?.etapa16?.data_recebimento || '—';
    const arDataFmt = arData !== '—' ? new Date(arData.includes('T') ? arData : arData + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

    const vencData = notificacaoAtual?.data_vencimento;
    const vencDataFmt = vencData ? new Date(vencData).toLocaleDateString('pt-BR') : '—';

    // Número da Réplica
    let numReplica = notificacaoAtual?.dados?.numero_replica || '';
    const _anoAtual = new Date().getFullYear();

    if (!numReplica && notificacaoAtual?.id) {
        try {
            // Verifica se já existe um documento gerado para esta réplica
            const { data: docExistente } = await supabaseClient
                .from('documentos')
                .select('id, numero_sequencial')
                .eq('notificacao_id', notificacaoAtual.id)
                .eq('tipo', 'Réplica')
                .maybeSingle();

            let docId = null;
            if (docExistente && docExistente.numero_sequencial) {
                numReplica = docExistente.numero_sequencial;
                docId = docExistente.id;
            } else {
                const { data: numReservado, error: errRes } = await supabaseClient
                    .rpc('reservar_numero', { p_ano: _anoAtual, p_categoria: 'Réplica' });

                if (errRes || !numReservado) {
                    const { data } = await supabaseClient
                        .from('documentos')
                        .select('numero_sequencial')
                        .eq('tipo', 'Réplica')
                        .like('numero_sequencial', `${_anoAtual}/%`);

                    let max = 0;
                    if (data && data.length > 0) {
                        data.forEach(item => {
                            const nr = item.numero_sequencial;
                            if (nr) {
                                const partes = nr.split('/');
                                if (partes.length === 2) {
                                    const val = parseInt(partes[1], 10);
                                    if (!isNaN(val) && val > max) max = val;
                                }
                            }
                        });
                    }
                    numReplica = `${_anoAtual}/${String(max + 1).padStart(3, '0')}`;
                } else {
                    numReplica = numReservado;
                }

                const usuarioId = typeof perfilAtual !== 'undefined' && perfilAtual?.id ? perfilAtual.id : (window.obterPerfilUsuario?.()?.id || null);

                const { data: docIns } = await supabaseClient.from('documentos').insert([{
                    processo_id: processoAtual.id,
                    notificacao_id: notificacaoAtual.id,
                    etapa_id: processoAtual.etapa_atual_id || processoAtual.etapa_atual,
                    tipo: 'Réplica',
                    nome_arquivo: `Replica_${numReplica.replace(/[\/\\]/g, '-')}.pdf`,
                    gerado_automaticamente: true,
                    numero_sequencial: numReplica,
                    usuario_id: usuarioId || undefined
                }]).select('id').single();
                docId = docIns?.id;
            }

            // Mantém no JSON para retrocompatibilidade e vinculação de id
            const novosDados = { ...(notificacaoAtual.dados || {}), numero_replica: numReplica, replica_id: docId || notificacaoAtual.dados?.replica_id };
            await supabaseClient.from('notificacoes').update({ dados: novosDados }).eq('id', notificacaoAtual.id);
            notificacaoAtual.dados = novosDados;
        } catch (e) {
            console.error('Erro ao gerar numero replica na tabela documentos', e);
            numReplica = `XXX/${_anoAtual}`;
        }
    } else if (!numReplica) {
        numReplica = `XXX/${_anoAtual}`;
    }

    const selectDecisao = document.getElementById('selectDecisaoDilacao');
    const d13 = notificacaoAtual?.dados?.etapa13 || {};
    const d5 = notificacaoAtual?.dados?.etapa5 || {};

    const decisao = selectDecisao ? selectDecisao.value : (d13.decisao || d5.decisao || '');
    const txtJustificativa = document.getElementById('txtJustificativaDilacao') ? document.getElementById('txtJustificativaDilacao').value : (d13.justificativa || d5.justificativa || '');
    const dias = document.getElementById('inputDiasDilacao') ? document.getElementById('inputDiasDilacao').value : (d5.dias || 0);
    const parecer = document.getElementById('selectParecerGerente') ? document.getElementById('selectParecerGerente').value : (d13.parecer || '');

    let textoDecisao = '';
    if (etapaAtual === 5 || d5.decisao) {
        if (decisao === 'defere') {
            textoDecisao = `Após análise da dilação informamos que seu pedido foi deferido. O prazo foi prorrogado por mais ${dias} dias.<br><br>Sem mais para o momento, estamos à disposição para maiores esclarecimentos.<br><br>Atenciosamente,`;
        } else if (decisao === 'indefere') {
            textoDecisao = `Após análise da defesa/dilação informamos que seu pedido foi indeferido, pois ${txtJustificativa}.<br><br>Sem mais para o momento, estamos à disposição para maiores esclarecimentos.<br><br>Atenciosamente,`;
        } else if (decisao === 'gerente') {
            textoDecisao = `Senhora Gerente,<br><br>Após análise da dilação/defesa informamos que não somos favoráveis a solicitação apresentada pelo contribuinte, pois ${txtJustificativa}. Encaminhamos o pedido para análise e resposta.<br><br>Respeitosamente,`;
        }
    } else if (etapaAtual === 13 || etapaAtual === 11 || d13.decisao) {
        if (decisao === 'defere') {
            textoDecisao = `Após análise da defesa informamos que seu pedido foi deferido.<br><br>Sem mais para o momento, estamos à disposição para maiores esclarecimentos.<br><br>Atenciosamente,`;
        } else if (decisao === 'indefere') {
            textoDecisao = `Após análise da defesa informamos que seu pedido foi indeferido, pois ${txtJustificativa}.<br><br>Sem mais para o momento, estamos à disposição para maiores esclarecimentos.<br><br>Atenciosamente,`;
        } else if (decisao === 'gerente') {
            if (parecer === 'favoravel') {
                textoDecisao = `Senhor(a) Gerente,<br><br>Após análise da defesa informamos que somos favoráveis a solicitação apresentada pelo contribuinte, pois ${txtJustificativa}. Encaminhamos o pedido para análise e resposta.<br><br>Respeitosamente,`;
            } else {
                textoDecisao = `Senhor(a) Gerente,<br><br>Após análise da defesa informamos que não somos favoráveis a solicitação apresentada pelo contribuinte, pois ${txtJustificativa}. Encaminhamos o pedido para análise e resposta.<br><br>Respeitosamente,`;
            }
        }
    }

    const nomeFiscal = typeof perfilAtual !== 'undefined' && perfilAtual?.nome ? perfilAtual.nome : (processoAtual?.profiles?.nome || window.obterPerfilUsuario?.()?.nome || 'Fiscal de Posturas');
    const matriculaFiscal = typeof perfilAtual !== 'undefined' && perfilAtual?.matricula ? perfilAtual.matricula : (processoAtual?.profiles?.matricula || window.obterPerfilUsuario?.()?.matricula || '');
    const dataAtual = new Date().toLocaleDateString('pt-BR');

    // Construir Imagens HTML a partir do container form
    let imgsHTML = '';
    const formItems = document.querySelectorAll('#containerImagensForm > div');
    const filesPromises = [];

    for (const item of formItems) {
        const fileInput = item.querySelector('.replica-imagem-arquivo');
        const legendaInput = item.querySelector('.replica-imagem-legenda');
        const file = fileInput?.files[0];

        if (file) {
            const prom = new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const legendaTexto = legendaInput?.value?.trim() || '';
                    resolve(`
                        <div style="margin:20px auto; text-align:center; padding:10px; display:inline-block; resize:both; overflow:hidden; max-width:100%; min-width:150px; min-height:150px; border:1px dashed #ccc;">
                            <img src="${e.target.result}" style="max-width:100%; max-height:400px; display:block; margin:0 auto; border-radius:8px;">
                            ${legendaTexto ? `<div style="margin-top:10px; font-size:11pt; color:#334155;">${legendaTexto}</div>` : ''}
                        </div>
                    `);
                };
                reader.readAsDataURL(file);
            });
            filesPromises.push(prom);
        }
    }

    const loadedImages = await Promise.all(filesPromises);
    imgsHTML = loadedImages.join('');

    const htmlReplica = `
        <div id="documentoPronto" style="margin-top: 20px; font-family: Calibri, 'Carlito', Arial, sans-serif;">
            <div style="padding: 50px 55px 30px 55px; background: white; max-width: 820px; margin: 0 auto; color: #000;">
                
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border-collapse: collapse;">
                    <tr>
                        <td width="100" rowspan="2" align="center" valign="top" style="padding-right: 12px; width: 100px;">
                            <img src="assets/img/brasao_semac.jpeg" width="85" style="width: 85px; height: auto; display: block; margin: 0 auto;">
                        </td>
                        <td bgcolor="#F78C26" style="background-color: #F78C26; height: 14px; font-size: 1px; line-height: 14px;">&nbsp;</td>
                    </tr>
                    <tr>
                        <td valign="top" style="padding-top: 10px; font-size: 9.5pt; color: #000; line-height: 1.4;">
                            <strong>SECRETARIA MUNICIPAL DE MEIO AMBIENTE E CUIDADO ANIMAL - SEMAC</strong><br>
                            DIRETORIA DE MEIO AMBIENTE<br>
                            GERÊNCIA DE FISCALIZAÇÃO DE POSTURAS<br>
                            <span style="font-size: 9pt;">Av. Paraná, nº2061, sala 207 - Bairro São José - Divinópolis, Minas Gerais</span><br>
                            <span style="font-size: 9pt;">CEP: 35.501-170 Tel: (37) 3229-8176</span>
                        </td>
                    </tr>
                </table>

                <div style="text-align: center; margin: 28px 0 24px 0;">
                    <p style="margin: 0; text-align: center; font-size: 12pt;"><strong>RÉPLICA ${numReplica}</strong></p>
                </div>

                <div style="margin-bottom: 20px; font-size: 11pt; line-height: 1.4;">
                    <strong>Autuado(a):</strong> ${cont.nome || '—'}<br>
                    <strong>PA:</strong> ${pa}
                </div>

                <div style="font-size: 11pt; line-height: 1.6; text-align: justify; margin-bottom: 20px;">
                    <p style="margin-bottom: 12px; text-indent: 40px;">
                        O contribuinte acima qualificado, com base no artigo 231 da Lei 6.907/08, diante da notificação ${numNotificacao}, a qual afirma que o imóvel de sua propriedade, situado na Rua/Av ${imvLogradouro} Nº: ${imvNumero}, precisa da(s) seguinte(s) regularização(es): ${motivoInfracao}, cuja notificação foi enviada via Aviso de Recebimento (AR) no dia ${arDataFmt}, com vencimento dia ${vencDataFmt}.
                    </p>
                    <p style="margin-bottom: 12px; text-indent: 40px;">
                        ${textoDecisao}
                    </p>
                </div>

                <div style="text-align: right; margin-bottom: 40px; font-size: 11pt;">
                    Divinópolis/MG, ${dataAtual}
                </div>

                <div style="text-align: center; margin-top: 60px; padding-bottom: 28px; font-size: 12pt;">
                    <div style="display: inline-block; min-width: 280px; border-top: 1px solid #000; padding-top: 6px;">
                        <div>${nomeFiscal}</div>
                        <div>Fiscal de Posturas</div>
                        ${matriculaFiscal ? `<div>Matrícula: ${matriculaFiscal}</div>` : ''}
                    </div>
                </div>

                <div id="containerImagensReplica" style="margin-top: 20px; text-align:center;">
                    ${imgsHTML}
                </div>

                <div style="width: calc(100% + 104px); margin-left: -52px; height: 16px; background-color: #F78C26; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin-top: 40px;"></div>
            </div>
        </div>
    `;

    const container = document.getElementById('containerDocumentoOficial');
    if (container) {
        container.innerHTML = htmlReplica;
    }

    if (notificacaoAtual && htmlReplica) {
        notificacaoAtual.dados = notificacaoAtual.dados || {};
        notificacaoAtual.dados.html_replica = htmlReplica;
        notificacaoAtual.dados.numero_replica = numReplica;

        try {
            await supabaseClient
                .from('notificacoes')
                .update({ dados: notificacaoAtual.dados })
                .eq('id', notificacaoAtual.id);
        } catch (e) {
            console.error('Erro ao salvar html_replica no banco:', e);
        }
    }
};

/* ── Central de Notificações no Menu ─────────────────────── */
window.toggleDropdownNotificacoes = function () {
    const dropdown = document.getElementById('dropdownNotificacoes');
    if (!dropdown) return;
    if (dropdown.style.display === 'none' || !dropdown.style.display) {
        dropdown.style.display = 'block';
        window.atualizarInterfaceNotificacoes();
    } else {
        dropdown.style.display = 'none';
    }
};

window.atualizarInterfaceNotificacoes = function () {
    const listDiv = document.getElementById('listaNotificacoesMenu');
    const badgeEl = document.getElementById('badgeContadorNotificacoes');
    if (!listDiv) return;

    let todanotifs = [];
    const setKeys = new Set();

    const addNotif = (n) => {
        if (!n) return;
        const key = (n.data || '') + (n.titulo || '') + (n.mensagem || '');
        if (!setKeys.has(key)) {
            setKeys.add(key);
            todanotifs.push(n);
        }
    };

    (notificacaoAtual?.dados?.notificacoes_menu || []).forEach(addNotif);
    (processoAtual?.dados?.notificacoes_menu || []).forEach(addNotif);
    (processoAtual?.notificacoes || []).forEach(notif => {
        (notif?.dados?.notificacoes_menu || []).forEach(addNotif);
    });

    todanotifs.sort((a, b) => new Date(b.data) - new Date(a.data));

    if (badgeEl) {
        const naoLidas = todanotifs.filter(n => !n.lida).length;
        if (naoLidas > 0) {
            badgeEl.textContent = naoLidas;
            badgeEl.style.display = 'inline-block';
        } else {
            badgeEl.style.display = 'none';
        }
    }

    if (todanotifs.length === 0) {
        listDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 0.85rem;">Nenhuma notificação registrada.</div>';
        return;
    }

    let html = '';
    todanotifs.forEach((n, idx) => {
        const isNova = !n.lida;
        html += `
        <div style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; background: ${isNova ? '#f0f9ff' : '#ffffff'}; transition: background 0.2s;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-weight: 700; font-size: 0.85rem; color: #1e293b;">${n.titulo}</span>
                    <span style="font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; ${isNova ? 'background:#dbeafe; color:#1d4ed8;' : 'background:#f1f5f9; color:#64748b;'}">
                        ${isNova ? 'NOVA' : 'Antiga'}
                    </span>
                </div>
                <span style="font-size: 0.72rem; color: #94a3b8;">${n.data ? new Date(n.data).toLocaleDateString('pt-BR') : ''}</span>
            </div>
            <p style="margin: 0 0 6px 0; font-size: 0.82rem; color: #475569; line-height: 1.4;">${n.mensagem}</p>
            ${n.motivo ? `<div style="background:#f8fafc; border:1px solid #cbd5e1; padding:8px 12px; border-radius:6px; font-size:0.8rem; color:#334155; margin-bottom:8px;"><strong>Motivo do Gerente:</strong> ${n.motivo}</div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <span style="font-size:0.75rem; font-weight:600; color:#2563eb;">Proc: ${n.numero_processo || ''}</span>
                <div style="display:flex; gap:6px;">
                    ${isNova ? `<button type="button" onclick="window.marcarNotificacaoLida(${idx})" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:4px 10px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">Ciente</button>` : ''}
                    <button type="button" onclick="window.removerNotificacaoMenu(${idx})" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;" title="Excluir notificação">Excluir</button>
                </div>
            </div>
        </div>
        `;
    });
    listDiv.innerHTML = html;
};

async function salvarNotificacoesMenuNoBanco() {
    try {
        if (notificacaoAtual?.id) {
            await supabaseClient
                .from('notificacoes')
                .update({ dados: notificacaoAtual.dados })
                .eq('id', notificacaoAtual.id);
        }
        if (processoAtual?.id) {
            await supabaseClient
                .from('processos')
                .update({ dados: processoAtual.dados })
                .eq('id', processoAtual.id);
        }
    } catch (e) {
        console.error('Erro ao atualizar notificações no banco:', e);
    }
}

window.marcarNotificacaoLida = async function (idx) {
    if (notificacaoAtual?.dados?.notificacoes_menu?.[idx]) {
        notificacaoAtual.dados.notificacoes_menu[idx].lida = true;
    }
    if (processoAtual?.dados?.notificacoes_menu?.[idx]) {
        processoAtual.dados.notificacoes_menu[idx].lida = true;
    }
    (processoAtual?.notificacoes || []).forEach(notif => {
        if (notif?.dados?.notificacoes_menu?.[idx]) {
            notif.dados.notificacoes_menu[idx].lida = true;
        }
    });
    window.atualizarInterfaceNotificacoes();
    await salvarNotificacoesMenuNoBanco();
};

window.removerNotificacaoMenu = async function (idx) {
    if (notificacaoAtual?.dados?.notificacoes_menu) {
        notificacaoAtual.dados.notificacoes_menu.splice(idx, 1);
    }
    if (processoAtual?.dados?.notificacoes_menu) {
        processoAtual.dados.notificacoes_menu.splice(idx, 1);
    }
    (processoAtual?.notificacoes || []).forEach(notif => {
        if (notif?.dados?.notificacoes_menu) {
            notif.dados.notificacoes_menu.splice(idx, 1);
        }
    });
    window.atualizarInterfaceNotificacoes();
    await salvarNotificacoesMenuNoBanco();
};

window.marcarTodasNotificacoesLidas = async function () {
    (notificacaoAtual?.dados?.notificacoes_menu || []).forEach(n => n.lida = true);
    (processoAtual?.dados?.notificacoes_menu || []).forEach(n => n.lida = true);
    (processoAtual?.notificacoes || []).forEach(notif => {
        (notif?.dados?.notificacoes_menu || []).forEach(n => n.lida = true);
    });
    window.atualizarInterfaceNotificacoes();
    await salvarNotificacoesMenuNoBanco();
};

window.limparAntigasNotificacoesMenu = async function () {
    if (notificacaoAtual?.dados?.notificacoes_menu) {
        notificacaoAtual.dados.notificacoes_menu = notificacaoAtual.dados.notificacoes_menu.filter(n => !n.lida);
    }
    if (processoAtual?.dados?.notificacoes_menu) {
        processoAtual.dados.notificacoes_menu = processoAtual.dados.notificacoes_menu.filter(n => !n.lida);
    }
    (processoAtual?.notificacoes || []).forEach(notif => {
        if (notif?.dados?.notificacoes_menu) {
            notif.dados.notificacoes_menu = notif.dados.notificacoes_menu.filter(n => !n.lida);
        }
    });
    window.atualizarInterfaceNotificacoes();
    await salvarNotificacoesMenuNoBanco();
};

document.addEventListener('click', function (e) {
    const btn = document.getElementById('btnMenuNotificacoes');
    const dropdown = document.getElementById('dropdownNotificacoes');
    if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});
