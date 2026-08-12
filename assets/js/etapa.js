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
    'Administrativo de Posturas': [16, 17],
    'Gerente': [11, 12, 15, 17, 22, 25, 30],
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

    // 4. Se o processo tem notificações independentes, pode ser necessário selecionar uma
    const notificacoes = obterNotificacoesProcesso(processoAtual);
    const indiceURL = obterIndiceNotificacaoDaURL();

    if (notificacoes.length > 0) {
        if (indiceURL !== null && notificacoes[indiceURL]) {
            aplicarNotificacaoSelecionada(processoAtual, indiceURL);
            await inicializarPaginaEtapa();
        } else if (processoTemNotificacoesDivergentes(processoAtual)) {
            mostrarModalSelecaoNotificacao(processoAtual);
            // A inicialização acontece após o usuário escolher no modal
        } else {
            // Todas as notificações ativas estão na mesma etapa: seleciona a primeira ativa
            const primeiraAtiva = notificacoes.findIndex(n => n.status !== 'atendida');
            if (primeiraAtiva >= 0) {
                aplicarNotificacaoSelecionada(processoAtual, primeiraAtiva);
            }
            await inicializarPaginaEtapa();
        }
    } else {
        await inicializarPaginaEtapa();
    }
});

// Aplica a notificação selecionada como "etapa atual" do processo para renderização
function aplicarNotificacaoSelecionada(proc, indice) {
    const notificacoes = obterNotificacoesProcesso(proc);
    const notif = notificacoes[indice];
    if (!notif) return;

    // Guarda apenas o índice da notificação escolhida para renderização do documento.
    // A etapa do processo é a fonte da verdade e não deve ser sobrescrita pela notificação.
    proc.notificacaoSelecionada = indice;
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
        
        if (notificacaoAtual && [3, 4, 5, 7, 10, 29, 33].includes(etapaAtual)) {
            renderizarFormularioDinamico(etapaAtual);
        } else if (etapaAtual === 1 && !notificacaoAtual) {
            renderizarFormularioDinamico(1);
            configurarEventosPainelEtapa1();
            renderizarPainelEtapa1(processoAtual);
            const tabForm = document.getElementById('tabFormulario');
            if (tabForm) setTimeout(() => tabForm.click(), 50);
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

                <!-- Bloco 2: Anexo da Notificação -->
                <div class="etapa1-card" id="cardAnexoNP" style="margin-top: 18px;">
                    <div class="etapa1-card-header">
                        <div class="header-icon">📄</div>
                        <div style="flex:1;">
                            <h3 class="etapa1-card-title">2º Passo: Anexar Notificação Preliminar Assinada</h3>
                            <p class="etapa1-card-subtitle">Após gerar ou imprimir o documento, anexe a via assinada
                                para habilitar o avanço do processo.</p>
                        </div>
                        <span id="badgeAnexoNPStatus" class="badge-status-anexo">Pendente</span>
                    </div>

                    <div class="anexo-upload-wrapper">
                        <div id="areaDropNP" class="drop-area-clean">
                            <p style="margin:0; font-weight:600; color:#1e293b; font-size:0.95rem;">Clique para
                                selecionar ou arraste a Notificação Assinada aqui</p>
                            <input type="file" id="inputArquivoNP" accept=".pdf,.jpg,.jpeg,.png" style="display:none;">
                        </div>

                        <div id="anexoNPAtual" class="arquivo-anexado-box" style="display:none;">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <div class="file-icon-badge" style="font-size:1.4rem;">📎</div>
                                <div>
                                    <div id="nomeArquivoNP" style="font-weight:600; color:#0f172a; font-size:0.95rem;">
                                        notificacao_assinada.pdf</div>
                                    <div id="dataArquivoNP" style="color:#16a34a; font-weight:600; font-size:0.8rem;">Anexado com sucesso</div>
                                </div>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <a id="btnVerAnexoNP" href="#" target="_blank" class="btn-sm btn-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #cbd5e1; color:#334155; text-decoration:none; font-size:0.82rem; font-weight:600;">Visualizar</a>
                                <button id="btnRemoverAnexoNP" class="btn-sm btn-danger-outline" style="padding:6px 12px; border-radius:8px; border:1px solid #fecaca; background:#fef2f2; color:#dc2626; font-size:0.82rem; font-weight:600; cursor:pointer;">Substituir / Remover</button>
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

        conteudo = `
            <h3 style="margin-top:0; color:#0f172a; font-size:1.1rem; margin-bottom:12px;">Defesa Apresentada</h3>
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

        setTimeout(() => { if(window.gerarReplica) window.gerarReplica(); }, 300);

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
            </div>
        `;
    } else if (etapaNum === 13) {
        const decisaoAnterior = notificacaoAtual?.dados?.etapa13?.decisao || '';
        const justificativaAnterior = notificacaoAtual?.dados?.etapa13?.justificativa || '';

        const btnBaixar = document.getElementById('btnBaixarRelatorioPdfEtapa');
        if (btnBaixar) btnBaixar.innerHTML = btnBaixar.innerHTML.replace('Relatório', 'Réplica');

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
        let selNao = 'selected';
        let selSim = '';
        if (decisaoEtapa7 === 'atendida') {
            selNao = '';
            selSim = 'selected';
        }
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
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700;">Certidão Sem Defesa</h3>
                        <p style="margin:2px 0 0 0; color:#64748b; font-size:0.85rem;">Emissão de certidão para notificação com prazo expirado sem apresentação de defesa.</p>
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
            </div>
        `;
    } else if (etapaNum === 33) {
        const numNotificacao = notificacaoAtual ? notificacaoAtual.numero : 'Desconhecido';
        const hist = notificacaoAtual?.dados?.historico || [];
        
        let encerramento = hist.find(h => h.etapa_para === 'encerrada' || h.status === 'encerrada');
        const dataEnc = encerramento ? new Date(encerramento.data).toLocaleString('pt-BR') : 'Data não registrada';
        const usuEnc = encerramento ? encerramento.usuario : 'Sistema';

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
                    <h3 style="margin:0 0 16px 0; color:#0f172a; font-size:1.1rem; border-bottom:2px solid #cbd5e1; padding-bottom:8px;">Arquivos e Relatórios do Processo</h3>
                    
                    <div style="display:flex; justify-content:center; align-items:center; margin-bottom:16px;">
                        <button type="button" onclick="finalizarEBaixarZipNotificacao()" style="padding:16px 32px; background:#2563eb; color:white; border:none; border-radius:12px; font-weight:700; font-size:1.1rem; cursor:pointer; display:flex; align-items:center; gap:10px; box-shadow:0 6px 16px rgba(37, 99, 235, 0.3); transition:all 0.2s;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Baixar ZIP Completo
                        </button>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
                        <div style="background:white; border:1px solid #cbd5e1; padding:16px; border-radius:10px; display:flex; flex-direction:column; gap:10px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:1.5rem;">📄</span>
                                <div>
                                    <h4 style="margin:0; color:#1e293b; font-size:1rem;">Notificação Preliminar</h4>
                                    <p style="margin:0; color:#64748b; font-size:0.8rem;">Documento original (.doc)</p>
                                </div>
                            </div>
                            <button type="button" onclick="baixarDocUnico('notificacao')" style="padding:8px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; font-weight:600; cursor:pointer; text-align:center; transition:all 0.2s;">
                                ⬇ Baixar Arquivo
                            </button>
                        </div>

                        <div style="background:white; border:1px solid #cbd5e1; padding:16px; border-radius:10px; display:flex; flex-direction:column; gap:10px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:1.5rem;">📊</span>
                                <div>
                                    <h4 style="margin:0; color:#1e293b; font-size:1rem;">Relatório de Etapas</h4>
                                    <p style="margin:0; color:#64748b; font-size:0.8rem;">Histórico completo (.txt)</p>
                                </div>
                            </div>
                            <button type="button" onclick="baixarDocUnico('historico')" style="padding:8px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; font-weight:600; cursor:pointer; text-align:center; transition:all 0.2s;">
                                ⬇ Baixar Relatório
                            </button>
                        </div>
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
                    <h3 style="margin:0 0 16px 0; color:#0f172a; font-size:1.1rem; border-bottom:2px solid #cbd5e1; padding-bottom:8px;">Arquivos e Relatórios do Processo</h3>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
                        
                        <div style="background:white; border:1px solid #cbd5e1; padding:16px; border-radius:10px; display:flex; flex-direction:column; gap:10px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:1.5rem;">📄</span>
                                <div>
                                    <h4 style="margin:0; color:#1e293b; font-size:1rem;">Notificação Preliminar</h4>
                                    <p style="margin:0; color:#64748b; font-size:0.8rem;">Documento original (.doc)</p>
                                </div>
                            </div>
                            <button type="button" onclick="baixarDocUnico('notificacao')" style="padding:8px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; font-weight:600; cursor:pointer; text-align:center; transition:all 0.2s;">
                                ⬇ Baixar Arquivo
                            </button>
                        </div>

                        <div style="background:white; border:1px solid #cbd5e1; padding:16px; border-radius:10px; display:flex; flex-direction:column; gap:10px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:1.5rem;">📊</span>
                                <div>
                                    <h4 style="margin:0; color:#1e293b; font-size:1rem;">Relatório de Etapas</h4>
                                    <p style="margin:0; color:#64748b; font-size:0.8rem;">Histórico completo (.txt)</p>
                                </div>
                            </div>
                            <button type="button" onclick="baixarDocUnico('historico')" style="padding:8px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; border-radius:6px; font-weight:600; cursor:pointer; text-align:center; transition:all 0.2s;">
                                ⬇ Baixar Relatório
                            </button>
                        </div>

                    </div>
                </div>

                <!-- Histórico Visual na Tela -->
                <div style="background:#f8fafc; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:32px;">
                    <h3 style="margin:0 0 12px 0; color:#0f172a; font-size:1.1rem; border-bottom:2px solid #cbd5e1; padding-bottom:8px;">Relatório - Etapas que o processo passou</h3>
                    ${histHtml}
                </div>

                <!-- Botão Gigante de Finalização -->
                <div style="display:flex; flex-direction:column; align-items:center; background:#f0fdf4; padding:32px; border:2px dashed #86efac; border-radius:16px;">
                    <h3 style="margin:0 0 16px 0; color:#166534; font-size:1.3rem; text-align:center;">Deseja finalizar esta Notificação definitivamente?</h3>
                    <button type="button" onclick="finalizarEBaixarZipNotificacao()" style="padding:18px 40px; background:#16a34a; color:white; border:none; border-radius:12px; font-weight:800; font-size:1.25rem; cursor:pointer; display:flex; align-items:center; gap:12px; box-shadow:0 8px 20px rgba(22, 163, 74, 0.4); transition:all 0.2s;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Sim, Finalizar e Baixar Todos os Arquivos (ZIP)
                    </button>
                    <p style="margin:16px 0 0 0; color:#15803d; font-size:0.9rem; font-weight:600; text-align:center;">Atenção: Ao clicar acima, a notificação será encerrada e você não poderá retornar etapas.</p>
                </div>
            </div>
        `;
    }

    formDiv.innerHTML = conteudo;

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
                    <span style="font-size:0.9rem; color:#334155; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:85%;" title="${a.nome}">${a.nome}</span>
                    <button type="button" class="btn-excluir-anexo" data-index="${i}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; font-size:1.2rem; line-height:1; padding:0 5px;" title="Remover anexo">×</button>
                `;
                listaDiv.appendChild(item);
            });

            listaDiv.querySelectorAll('.btn-excluir-anexo').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const idx = e.target.getAttribute('data-index');
                    if (confirm('Tem certeza que deseja remover este anexo?')) {
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
        const notificacaoId = params.get('notificacao');
        if (notificacaoId && proc.notificacoes) {
            notificacaoAtual = proc.notificacoes.find(n => n.id === notificacaoId);
        }

        // O campo etapa_atual_id é o ID interno da tabela etapas; usamos o número para renderização.
        const etapaRelacionada = notificacaoAtual ? (Array.isArray(notificacaoAtual.etapas) ? notificacaoAtual.etapas[0] : notificacaoAtual.etapas) : (Array.isArray(proc.etapas) ? proc.etapas[0] : proc.etapas);
        const etapaAtual = notificacaoAtual 
            ? parseInt(etapaRelacionada?.numero || notificacaoAtual.etapa_atual || notificacaoAtual.etapa_atual_id || 2, 10)
            : parseInt(etapaRelacionada?.numero || proc.etapa_atual || proc.etapa_atual_id || 1, 10);
            
        proc.etapa_atual = etapaAtual;
        if (notificacaoAtual) proc.etapa_atual_id = notificacaoAtual.etapa_atual_id;
        
        processoAtual = proc;
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

        perfilAtual = usuario || { cargo: 'Fiscal de Postura' };
    } catch (err) {
        console.error('Erro ao carregar perfil:', err);
        perfilAtual = { cargo: 'Fiscal de Postura' };
    }
}

function normalizarCargo(cargo) {
    if (!cargo) return 'Fiscal de Postura';
    const limpo = cargo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
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
    if (etapaAtual === 7) {
        await avancarEtapa7();
        return;
    }
    if (etapaAtual === 10) {
        await avancarEtapa10();
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
    
    mostrarCarregamento('Avançando etapa...');

    notificacaoAtual.dados = notificacaoAtual.dados || {};
    notificacaoAtual.dados.etapa5 = { decisao, justificativa, dias, data_decisao: new Date().toISOString() };
    
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

    // Se já estiver encerrada, apenas baixa o ZIP (não finaliza de novo nem volta pra painel forçado)
    const jaEncerrada = (notificacaoAtual.status === 'encerrada');

    if (!jaEncerrada) {
        if (!confirm('Tem certeza que deseja finalizar esta notificação?\nUm arquivo ZIP será baixado com os documentos, e a notificação será encerrada permanentemente.')) {
            return;
        }
    }

    mostrarCarregamento('Gerando Documentos e ZIP...');

    try {
        const zip = new JSZip();
        const numNotifLimpo = notificacaoAtual.numero.replace(/[\/\\]/g, '-');
        const brasaoBase64 = await obterBrasaoBase64() || window.BRASAO_SEMAC_BASE64 || '';
        
        // 1. Gerar documento da Notificação Preliminar (DOC)
        const conteudoWord = gerarHtmlCompativelComWordDoc(processoAtual, brasaoBase64);
        const fullDoc = '<html xmlns:o=\'urn:schemas-microsoft-com:office:office\' xmlns:w=\'urn:schemas-microsoft-com:office:word\' xmlns=\'http://www.w3.org/TR/REC-html40\'><head><meta charset="utf-8"><title>' + numNotifLimpo + '</title><style>@page{size:A4;margin:2cm}body{font-family:Calibri,\'Carlito\',Arial,sans-serif;color:#000;line-height:1.4}table{border-collapse:collapse}</style></head><body>' + conteudoWord + '</body></html>';
        zip.file(`Notificacao_Preliminar_${numNotifLimpo}.doc`, fullDoc);

        // 2. Gerar Relatório de Histórico (TXT)
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
        zip.file(`Historico_Movimentacoes_${numNotifLimpo}.txt`, relatorioTxt);

        // Gera e baixa o arquivo ZIP
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Documentos_Notificacao_${numNotifLimpo}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Se ainda não estava encerrada, atualiza banco e volta ao painel
        if (!jaEncerrada) {
            const notifDados = { ...(notificacaoAtual.dados || {}) };
            notifDados.historico = notifDados.historico || [];
            notifDados.historico.push({
                etapa_de: parseInt(notificacaoAtual.etapas?.numero || notificacaoAtual.etapa_atual_id || 29, 10),
                etapa_para: 'encerrada',
                status: 'encerrada',
                condicao: 'Finalização e Baixa de Arquivos',
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
            
            // Voltar para a Etapa 2
            window.location.href = `etapa.html?processo=${processoAtual.id}`;
        } else {
            ocultarCarregamento();
        }

    } catch (err) {
        console.error('Erro ao gerar ZIP de finalização:', err);
        alert('Ocorreu um erro ao gerar o arquivo ZIP. Tente novamente.');
        ocultarCarregamento();
    }
}

window.baixarDocUnico = async function(tipo) {
    if (!notificacaoAtual || !processoAtual) return;
    mostrarCarregamento(`Gerando ${tipo}...`);
    try {
        const numNotifLimpo = notificacaoAtual.numero.replace(/[\/\\]/g, '-');
        if (tipo === 'notificacao') {
            const brasaoBase64 = await obterBrasaoBase64() || window.BRASAO_SEMAC_BASE64 || '';
            const conteudoWord = gerarHtmlCompativelComWordDoc(processoAtual, brasaoBase64);
            const fullDoc = '<html xmlns:o=\'urn:schemas-microsoft-com:office:office\' xmlns:w=\'urn:schemas-microsoft-com:office:word\' xmlns=\'http://www.w3.org/TR/REC-html40\'><head><meta charset="utf-8"><title>' + numNotifLimpo + '</title><style>@page{size:A4;margin:2cm}body{font-family:Calibri,\'Carlito\',Arial,sans-serif;color:#000;line-height:1.4}table{border-collapse:collapse}</style></head><body>' + conteudoWord + '</body></html>';
            const blob = new Blob([fullDoc], { type: 'application/msword;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Notificacao_Preliminar_${numNotifLimpo}.doc`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
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
        }
    } catch (e) {
        console.error('Erro ao baixar documento único:', e);
        alert('Erro ao gerar documento.');
    }
    ocultarCarregamento();
};

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
        const { data: etapaDest } = await supabaseClient
            .from('etapas')
            .select('id')
            .eq('numero', numeroEtapaDestino)
            .maybeSingle();

        const etapaDestId = etapaDest ? etapaDest.id : numeroEtapaDestino;

        if (notificacaoAtual) {
            const updates = { etapa_atual_id: etapaDestId };
            if (numeroEtapaDestino === 2) {
                updates.status = 'pendente';
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

    // 3. Status e Exibição do Anexo Assinado da NP
    const anexoNP = proc.campos?.anexo_np_assinada;
    const areaDrop = document.getElementById('areaDropNP');
    const anexoBox = document.getElementById('anexoNPAtual');
    const badgeStatus = document.getElementById('badgeAnexoNPStatus');

    if (anexoNP && (anexoNP.dataUrl || anexoNP.url)) {
        if (areaDrop) areaDrop.style.display = 'none';
        if (anexoBox) {
            anexoBox.style.display = 'flex';
            const nmEl = document.getElementById('nomeArquivoNP');
            if (nmEl) nmEl.textContent = anexoNP.nome || 'notificacao_assinada.pdf';
            const btnVer = document.getElementById('btnVerAnexoNP');
            if (btnVer) {
                btnVer.href = '#';
                btnVer.onclick = (e) => window.abrirAnexoEmNovaAba(anexoNP.dataUrl || anexoNP.url, e);
            }
        }
        if (badgeStatus) {
            badgeStatus.textContent = 'Anexado';
            badgeStatus.classList.add('ok');
        }
    } else {
        if (areaDrop) areaDrop.style.display = 'block';
        if (anexoBox) anexoBox.style.display = 'none';
        if (badgeStatus) {
            badgeStatus.textContent = 'Pendente';
            badgeStatus.classList.remove('ok');
        }
    }
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

    const areaDrop = document.getElementById('areaDropNP');
    const inputArquivo = document.getElementById('inputArquivoNP');
    if (areaDrop && inputArquivo) {
        areaDrop.addEventListener('click', (e) => {
            if (e.target !== inputArquivo) inputArquivo.click();
        });

        inputArquivo.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (ev) => {
                processoAtual.campos = processoAtual.campos || {};
                processoAtual.campos.anexo_np_assinada = {
                    nome: file.name,
                    tipo: file.type,
                    dataUrl: ev.target.result,
                    data_upload: new Date().toISOString()
                };

                processoAtual.dados = processoAtual.dados || {};
                processoAtual.dados.campos = processoAtual.campos;

                const { error } = await supabaseClient
                    .from('processos')
                    .update({ dados: processoAtual.dados })
                    .eq('id', processoAtual.id);

                if (error) {
                    alert('Erro ao anexar arquivo: ' + error.message);
                } else {
                    renderizarPainelEtapa1(processoAtual);
                }
            };
            reader.readAsDataURL(file);
        });
    }

    const btnRemoverAnexo = document.getElementById('btnRemoverAnexoNP');
    if (btnRemoverAnexo) {
        btnRemoverAnexo.addEventListener('click', async () => {
            if (!processoAtual) return;
            if (!confirm('Deseja substituir ou remover o anexo da Notificação Assinada?')) return;

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
}

// ── Avançar da Etapa 1 para a Etapa 1.2 (Retorno do AR) ───────────────────
async function avancarEtapa1() {
    if (!processoAtual) return;

    const anexo = processoAtual.campos?.anexo_np_assinada;
    if (!anexo) {
        alert('Atenção: Para avançar da Etapa 1, confira as multas e anexe a Notificação Preliminar assinada no 2º passo.');
        return;
    }

    if (!confirm('Deseja avançar o processo para a Etapa 1.2 (Retorno do AR)?\nApós o avanço, o Administrativo de Posturas fará o registro do AR.')) {
        return;
    }

    mostrarCarregamento('Avançando etapa...');

    try {
        // Busca o ID da etapa 16 no banco
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

        // Atualiza todas as notificações do processo para a etapa 16,
        // mantendo a notificação sincronizada com a etapa do processo.
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
                condicao_aplicada: 'Notificação Preliminar assinada anexada',
                observacao: 'Processo enviado para o Administrativo de Posturas registrar o AR.',
                dados_etapa: { anexo_np_assinada: anexo }
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

    const etapaAtual = parseInt(proc?.etapa_atual || proc?.etapa_atual_id || 1, 10);
    if (etapaAtual === 5 || etapaAtual === 13) {
        if (window.gerarReplica) window.gerarReplica();
        return;
    }

    const d = proc.dados || {};
    const cont = d.contribuinte || {};
    const imv = d.imovel || {};
    const fisc = d.fiscal || {};
    const inf = d.infracoes || {};

    // Data de Vistoria formatada
    const dataFmt = fisc.data_vistoria
        ? new Date(fisc.data_vistoria + 'T12:00:00').toLocaleDateString('pt-BR')
        : new Date().toLocaleDateString('pt-BR');

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
            data_movimentacao: salva.data_movimentacao || null
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
            data_movimentacao: n.data_movimentacao || null
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

                card.style.cssText = 'background:white; border:1px solid #e2e8f0; border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:12px; transition:all 0.2s ease;';
                
                if (jaAvancou) {
                    card.style.cursor = 'pointer';
                    if (n.status === 'encerrada') {
                        card.style.border = '2px solid #10b981';
                        card.addEventListener('mouseenter', () => { card.style.borderColor = '#059669'; card.style.boxShadow = '0 4px 12px rgba(16,185,129,0.15)'; });
                        card.addEventListener('mouseleave', () => { card.style.borderColor = '#10b981'; card.style.boxShadow = 'none'; });
                    } else {
                        card.style.border = '2px solid #3b82f6';
                        card.addEventListener('mouseenter', () => { card.style.borderColor = '#7c3aed'; card.style.boxShadow = '0 4px 12px rgba(124,58,237,0.15)'; });
                        card.addEventListener('mouseleave', () => { card.style.borderColor = '#3b82f6'; card.style.boxShadow = 'none'; });
                    }
                    card.addEventListener('click', (e) => {
                        if (!e.target.closest('button')) {
                            window.location.search = `?processo=${processoAtual.id}&notificacao=${n.id}`;
                        }
                    });
                } else {
                    card.style.cursor = 'pointer';
                    card.addEventListener('mouseenter', () => { card.style.borderColor = '#7c3aed'; card.style.boxShadow = '0 4px 12px rgba(124,58,237,0.10)'; });
                    card.addEventListener('mouseleave', () => { card.style.borderColor = '#e2e8f0'; card.style.boxShadow = 'none'; });
                }

                let statusBadge = '';
                if (n.status === 'encerrada') statusBadge = '<span style="background:#e5e7eb; color:#374151; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Encerrada</span>';
                else if (n.status === 'atendida') statusBadge = '<span style="background:#bbf7d0; color:#166534; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Atendida</span>';
                else if (n.status === 'defesa') statusBadge = '<span style="background:#dbeafe; color:#1e40af; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Defesa</span>';
                else if (n.status === 'dilacao') statusBadge = '<span style="background:#fef9c3; color:#854d0e; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Dilação</span>';
                else if (infoPrazo.vencido) statusBadge = '<span style="background:#fecaca; color:#991b1b; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Vencida</span>';
                else statusBadge = '<span style="background:#f1f5f9; color:#475569; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Pendente</span>';

                const podeAvancar = !jaAvancou;
                const btnAvancarHtml = podeAvancar
                    ? `<button type="button" class="btn-avancar-notif" data-index="${n.index}" style="margin-top:8px; padding:8px 16px; border-radius:8px; border:none; background:#7c3aed; color:white; font-weight:600; font-size:0.88rem; cursor:pointer;">Avançar Notificação</button>`
                    : '';

                const prazoHtml = (n.status === 'atendida' || jaAvancou)
                    ? ''
                    : `<div style="display:flex; align-items:center; gap:8px; font-size:0.88rem; color:#475569;">
                        <span>📅 Prazo: ${new Date(n.data_vencimento).toLocaleDateString('pt-BR')}</span>
                        <span style="${infoPrazo.vencido ? 'color:#991b1b; font-weight:600;' : 'color:#166534; font-weight:600;'}">(${infoPrazo.texto})</span>
                    </div>`;
                    
                let textoMotivo = '';
                if (n.status === 'atendida') textoMotivo = 'Houve Cumprimento (Atendida)';
                else if (n.status === 'encerrada') textoMotivo = 'Notificação Encerrada / Finalizada';
                else if (n.status === 'pendente_vencida') textoMotivo = 'Notificação vencida (Prazo esgotado)';
                else if (n.status === 'defesa') textoMotivo = 'Defesa Apresentada';
                else if (n.status === 'dilacao') textoMotivo = 'Dilação de Prazo Solicitada';
                else textoMotivo = 'Motivo não especificado';

                const controlesHtml = jaAvancou ? 
                    `<div style="font-size:0.9rem; color:#1e40af; font-weight:600; padding:8px; background:#eff6ff; border-radius:8px; text-align:center;">
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
                        <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; color:#334155; cursor:pointer; padding:6px 10px; border:1px solid #e2e8f0; border-radius:8px; ${n.dados?.etapa2_ja_pediu_dilacao ? 'opacity:0.5; cursor:not-allowed;' : ''}">
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
    setVal('arRetornoSemSucesso', dadosAR.retorno_sem_sucesso || 'sim');
    setVal('arDataUltimaTentativa', dadosAR.data_ultima_tentativa);
    setVal('arMotivoCorreios', dadosAR.motivo_correios);

    toggleBlocoRetornoSemSucesso();
    renderizarAnexoAR(dadosAR.anexo_ar);

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
        bloco.style.display = select.value === 'nao' ? 'block' : 'none';
    }
}

function renderizarAnexoAR(anexo) {
    const areaDrop = document.getElementById('areaDropAR');
    const anexoBox = document.getElementById('anexoARAtual');
    const nomeEl = document.getElementById('nomeArquivoAR');
    const btnVer = document.getElementById('btnVerAnexoAR');

    if (anexo && (anexo.dataUrl || anexo.url)) {
        if (areaDrop) areaDrop.style.display = 'none';
        if (anexoBox) anexoBox.style.display = '';
        if (nomeEl) nomeEl.textContent = anexo.nome || 'arquivo_anexo';
        if (btnVer) {
            btnVer.href = '#';
            btnVer.onclick = (e) => window.abrirAnexoEmNovaAba(anexo.dataUrl || anexo.url, e);
        }
    } else {
        if (areaDrop) areaDrop.style.display = '';
        if (anexoBox) anexoBox.style.display = 'none';
        if (btnVer) btnVer.href = '#';
    }
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

// ── Verifica prazo de 15 dias do AR e move para Etapa 30 automaticamente ──
// Para teste rápido, adicione ?teste_prazo_ar=10 na URL (valor em segundos).
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
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                inputFile.files = e.dataTransfer.files;
                processarArquivoAR(e.dataTransfer.files[0]);
            }
        });
        inputFile.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) processarArquivoAR(e.target.files[0]);
        });
    }

    const btnRemover = document.getElementById('btnRemoverAnexoAR');
    if (btnRemover) {
        btnRemover.addEventListener('click', () => {
            if (processoAtual) {
                processoAtual.campos = processoAtual.campos || {};
                processoAtual.campos.etapa16 = processoAtual.campos.etapa16 || {};
                delete processoAtual.campos.etapa16.anexo_ar;
                renderizarAnexoAR(null);
            }
        });
    }

    const btnSalvar = document.getElementById('btnSalvarEtapa16');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarEtapa16);

    const btnAvancar = document.getElementById('btnAvancarEtapa16');
    if (btnAvancar) btnAvancar.addEventListener('click', avancarEtapa16);
}

function processarArquivoAR(file) {
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
            processoAtual.campos.etapa16 = processoAtual.campos.etapa16 || {};
            processoAtual.campos.etapa16.anexo_ar = anexo;
        }
        renderizarAnexoAR(anexo);
    };
    reader.readAsDataURL(file);
}

async function salvarEtapa16() {
    if (!processoAtual) return;
    processoAtual.campos = processoAtual.campos || {};
    processoAtual.campos.etapa16 = processoAtual.campos.etapa16 || {};

    const getVal = id => document.getElementById(id)?.value?.trim() || '';
    const numeroARAnterior = processoAtual.campos.etapa16.numero_ar;
    const retornoAnterior = processoAtual.campos.etapa16.retorno_sem_sucesso;
    processoAtual.campos.etapa16.numero_ar = getVal('arNumero');
    processoAtual.campos.etapa16.data_recebimento = getVal('arDataRecebimento');
    processoAtual.campos.etapa16.retorno_sem_sucesso = getVal('arRetornoSemSucesso') || 'nao';
    processoAtual.campos.etapa16.data_ultima_tentativa = getVal('arDataUltimaTentativa');
    processoAtual.campos.etapa16.motivo_correios = getVal('arMotivoCorreios');

    // Registra cada retorno sem sucesso para controle do limite de 3 vezes.
    // Evita duplicar se os dados da última tentativa forem idênticos ao último registro.
    if (processoAtual.campos.etapa16.retorno_sem_sucesso === 'sim') {
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

    // Registra a data/hora de inserção do número do AR para controle do prazo de 30 dias.
    // Se o número do AR for alterado, registra uma nova data de inserção.
    if (processoAtual.campos.etapa16.numero_ar) {
        const numeroAnterior = numeroARAnterior || '';
        const numeroAtual = processoAtual.campos.etapa16.numero_ar;
        if (!processoAtual.campos.etapa16.data_insercao_ar || numeroAtual !== numeroAnterior) {
            processoAtual.campos.etapa16.data_insercao_ar = new Date().toISOString();
            console.log('data_insercao_ar registrada/atualizada:', processoAtual.campos.etapa16.data_insercao_ar);
        }
    }

    // Se a data de recebimento foi preenchida, aplica como data inicial do prazo de vencimento
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
    const dadosAR = processoAtual.campos?.etapa16 || {};
    const dataRecebimento = document.getElementById('arDataRecebimento')?.value;

    // Conta retornos sem sucesso já registrados
    const retornosSemSucesso = dadosAR.retornos_sem_sucesso || [];
    const tem3Retornos = retornosSemSucesso.length >= 3 ||
        (dadosAR.retorno_sem_sucesso === 'sim' && retornosSemSucesso.length >= 2);

    // Determina a próxima etapa conforme as regras do fluxo
    let proximaEtapaNumero = null;
    let condicao = '';

    if (tem3Retornos) {
        proximaEtapaNumero = 17;
        condicao = '3 retornos sem sucesso';
    } else if (dataRecebimento) {
        const passouEtapa14 = await processoPassouPorEtapa(processoAtual, 14);
        proximaEtapaNumero = passouEtapa14 ? 18 : 2;
        condicao = passouEtapa14 ? 'AR recebido após Etapa 14' : 'AR recebido após Etapa 1';
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
    } catch(e) {
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

        let htmlComImagens = '';
        let nomeArquivo = '';

        const etapaAtual = parseInt(processoAtual?.etapa_atual || processoAtual?.etapa_atual_id || 1, 10);
        
        if (etapaAtual === 5 || etapaAtual === 13) {
            const containerReplica = document.getElementById('containerDocumentoOficial');
            if (!containerReplica || !containerReplica.querySelector('div')) {
                alert('A Réplica ainda não foi gerada. Preencha os dados e clique em "Gerar/Atualizar Réplica".');
                return;
            }
            htmlComImagens = containerReplica.innerHTML;
            const numReplica = notificacaoAtual?.numero_replica || 'XXX';
            nomeArquivo = `Replica_${numReplica.replace(/[\/\\]/g, '-')}`;
        } else {
            htmlComImagens = processoAtual.dados?.relatorio_fiscal?.html_customizado;
            if (!htmlComImagens) {
                alert('Não há relatório fiscal salvo para este processo. O processo pode não ter sido concluído corretamente.');
                return;
            }
            const numeroRelatorio = processoAtual.dados?.relatorio_fiscal?.numero_relatorio || 'XXX';
            nomeArquivo = `Relatorio_Fiscal_${numeroRelatorio.replace(/[\/\\]/g, '-')}`;
        }

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
        printDoc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${nomeArquivo}</title><style>${estilos}</style></head><body>${htmlComImagens}</body></html>`);
        printDoc.close();

        setTimeout(() => {
            printIframe.contentWindow.focus();
            printIframe.contentWindow.print();
            setTimeout(() => {
                document.body.removeChild(printIframe);
            }, 1000);
        }, 500);

    } catch (err) {
        console.error('Erro ao gerar PDF do relatório:', err);
        alert('Erro ao gerar PDF do relatório: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldText;
        }
    }
}

async function imprimirDocumentoOficial() {
    const ok = await garantirDocumentoParaExportar();
    if (!ok) { alert('Não foi possível gerar o documento para impressão.'); return; }

    const docEl = document.getElementById('documentoPronto');
    if (!docEl) { alert('Documento não encontrado.'); return; }

    const numCertidaoEl = document.getElementById('inputNumNotificacaoCertidao');
    const isCertidao = !!numCertidaoEl || !!document.querySelector('#campoLivreCertidao');
    const procNum = processoAtual?.numero_processo || document.getElementById('etapaProcNumero')?.textContent || '2026-000001';
    const _numNotif = numCertidaoEl?.value || notificacaoAtual?.numero || procNum || 'XXX';
    const _anoAtual = new Date().getFullYear();
    const _certNum = _numNotif.includes('/') ? _numNotif : `${_numNotif}/${_anoAtual}`;
    const titulo = isCertidao
        ? `Certidão Nº ${_certNum.replace(/[\/\\]/g, '-')}`
        : `Processo Nº ${procNum.replace(/[\/\\]/g, '-')}`;

    const brasaoBase64 = await obterBrasaoBase64() || window.BRASAO_SEMAC_BASE64 || 'assets/img/brasao_semac.jpeg';
    
    // Se for etapa 5, documentoPronto é a Réplica (que ocultamos). 
    // Precisamos gerar a notificação real para a impressão.
    const etapaAtual = parseInt(processoAtual?.etapa_atual || processoAtual?.etapa_atual_id || 1, 10);
    let conteudoLimpo = '';
    
    if (etapaAtual === 5 || etapaAtual === 13) {
        conteudoLimpo = gerarHtmlCompativelComWordDoc(processoAtual, brasaoBase64);
        conteudoLimpo = `<div class="doc-oficial-wrapper"><div class="doc-page-content">${conteudoLimpo}</div></div>`;
    } else {
        conteudoLimpo = prepararConteudoDocumento(docEl.outerHTML, brasaoBase64);
    }

    const estilos = `
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { margin: 0; padding: 20px; background: #fff; font-family: Calibri, 'Carlito', Arial, sans-serif; color: #000; max-width: 820px; margin: 0 auto; }
        img { max-width: 100%; height: auto; }
        /* Classes do documento oficial */
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

    // Criar iframe oculto se não existir
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

    // Salvar o título original da página e aplicar o título correto para o diálogo de impressão
    const tituloOriginal = document.title;
    document.title = titulo;

    doc.open();
    doc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title><style>${estilos}</style></head><body>${conteudoLimpo}</body></html>`);
    doc.close();

    // Aguarda renderização e aciona a impressão direta da caixa de diálogo do sistema
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

window.gerarCertidaoSemDefesa = async function(auto = false) {
    if (!processoAtual) return;

    const numNotificacao = document.getElementById('inputNumNotificacaoCertidao').value || notificacaoAtual?.numero || '';
    const tipoInfracao = document.getElementById('inputTipoInfracaoCertidao').value || notificacaoAtual?.descricao || '';

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
                console.warn('Falha ao reservar número de certidão:', errRes?.message);
                numCertidao = `${_anoAtual}/XXX`;
            } else {
                numCertidao = numReservado;
                // Persiste no banco para que recargas não gerem outro número
                await supabaseClient
                    .from('notificacoes')
                    .update({ numero_certidao: numCertidao })
                    .eq('id', notificacaoAtual.id);
                // Atualiza o estado local para evitar reserva dupla
                notificacaoAtual.numero_certidao = numCertidao;
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
                        Certifico que o autuado ${nomeAutuado} CPF ${cpfCnpj}, cujo endereço de correspondência é ${enderecoAutuado}, <span id="campoLivreCertidao" contenteditable="true" data-placeholder="clique aqui para digitar..." style="border-bottom: 1.5px dashed #94a3b8; outline: none; display: inline-block; min-width: 140px; color: #94a3b8; font-style: italic; white-space: pre-wrap; word-break: break-word;"></span> referente à Notificação Preliminar ${numNotificacao} do imóvel localizado na ${imvLogradouro}${imvBairro ? ', bairro ' + imvBairro : ''}, com inscrição imobiliária ${inscricao}, a qual teve ciência no dia ${dataCienciaFmt} pelos correios por meio do aviso de recebimento (AR), com prazo para defesa até ${dataDefesaFmt}.
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

            const atualizarEstado = () => {
                const txt = campo.textContent.trim();
                if (txt === '' || txt === hint) {
                    if (txt === '') campo.textContent = hint;
                    campo.style.display = 'inline-block';
                    campo.style.minWidth = '140px';
                    campo.style.color = '#94a3b8';
                    campo.style.fontStyle = 'italic';
                } else {
                    campo.style.display = 'inline';
                    campo.style.minWidth = '0px';
                    campo.style.color = '#000';
                    campo.style.fontStyle = 'normal';
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

window.avancarEtapa10 = async function() {
    if (!processoAtual || !notificacaoAtual) return;
    
    const select = document.getElementById('selectResolvidoCertidao');
    const resolvido = select ? select.value : '';

    if (!resolvido) {
        alert('Por favor, selecione se o problema foi resolvido ou não antes de avançar.');
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

// ── Helper para abrir Base64 no Chrome de forma segura ──
window.abrirAnexoEmNovaAba = function(urlOuBase64, event) {
    if (event) event.preventDefault();
    if (!urlOuBase64 || urlOuBase64 === '#') return;

    if (urlOuBase64.startsWith('data:')) {
        try {
            const arr = urlOuBase64.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], { type: mime });
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, '_blank');
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch (e) {
            console.error('Erro ao converter base64 para blob:', e);
            window.open(urlOuBase64, '_blank');
        }
    } else {
        window.open(urlOuBase64, '_blank');
    }
};

// ── Etapa 5: Funções da Dilação e Réplica ──

window.toggleOpcoesDilacao = function() {
    const val = document.getElementById('selectDecisaoDilacao')?.value;
    const blocoDias = document.getElementById('blocoDiasDilacao');
    const blocoJustificativa = document.getElementById('blocoJustificativaDilacao');
    
    if (blocoDias) blocoDias.style.display = (val === 'defere') ? 'block' : 'none';
    if (blocoJustificativa) blocoJustificativa.style.display = (val === 'indefere' || val === 'gerente') ? 'block' : 'none';
    
    window.gerarReplica();
};

window.contadorImagensReplica = 0;

window.adicionarCampoImagemReplica = function() {
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

window.gerarReplica = async function() {
    if (!processoAtual) return;
    
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

            if (docExistente && docExistente.numero_sequencial) {
                numReplica = docExistente.numero_sequencial;
            } else {
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
                
                const usuarioId = typeof perfilAtual !== 'undefined' && perfilAtual?.id ? perfilAtual.id : (window.obterPerfilUsuario?.()?.id || null);
                
                if (usuarioId) {
                    await supabaseClient.from('documentos').insert([{
                        processo_id: processoAtual.id,
                        notificacao_id: notificacaoAtual.id,
                        etapa_id: processoAtual.etapa_atual_id || processoAtual.etapa_atual,
                        tipo: 'Réplica',
                        nome_arquivo: `Replica_${numReplica.replace(/[\\/\\\\]/g, '-')}.pdf`,
                        gerado_automaticamente: true,
                        numero_sequencial: numReplica,
                        usuario_id: usuarioId
                    }]);
                }
            }
            
            // Mantém no JSON para retrocompatibilidade
            const novosDados = { ...(notificacaoAtual.dados || {}), numero_replica: numReplica };
            await supabaseClient.from('notificacoes').update({ dados: novosDados }).eq('id', notificacaoAtual.id);
            notificacaoAtual.dados = novosDados;
        } catch(e) {
            console.error('Erro ao gerar numero replica na tabela documentos', e);
            numReplica = `XXX/${_anoAtual}`;
        }
    } else if (!numReplica) {
        numReplica = `XXX/${_anoAtual}`;
    }

    const selectDecisao = document.getElementById('selectDecisaoDilacao');
    const decisao = selectDecisao ? selectDecisao.value : '';
    const txtJustificativa = document.getElementById('txtJustificativaDilacao') ? document.getElementById('txtJustificativaDilacao').value : '';
    const dias = document.getElementById('inputDiasDilacao') ? document.getElementById('inputDiasDilacao').value : 0;
    
    const etapaAtual = parseInt(processoAtual?.etapa_atual || processoAtual?.etapa_atual_id || 1, 10);
    
    let textoDecisao = '';
    if (etapaAtual === 5) {
        if (decisao === 'defere') {
            textoDecisao = `Após análise da dilação informamos que seu pedido foi deferido. O prazo foi prorrogado por mais ${dias} dias.<br><br>Sem mais para o momento, estamos à disposição para maiores esclarecimentos.<br><br>Atenciosamente,`;
        } else if (decisao === 'indefere') {
            textoDecisao = `Após análise da defesa/dilação informamos que seu pedido foi indeferido, pois ${txtJustificativa}.<br><br>Sem mais para o momento, estamos à disposição para maiores esclarecimentos.<br><br>Atenciosamente,`;
        } else if (decisao === 'gerente') {
            textoDecisao = `Senhora Gerente,<br><br>Após análise da dilação/defesa informamos que não somos favoráveis a solicitação apresentada pelo contribuinte, pois ${txtJustificativa}. Encaminhamos o pedido para análise e resposta.<br><br>Respeitosamente,`;
        }
    } else if (etapaAtual === 13) {
        if (decisao === 'defere') {
            textoDecisao = `Após análise da defesa informamos que seu pedido foi deferido.<br><br>Sem mais para o momento, estamos à disposição para maiores esclarecimentos.<br><br>Atenciosamente,`;
        } else if (decisao === 'indefere') {
            textoDecisao = `Após análise da defesa informamos que seu pedido foi indeferido, pois ${txtJustificativa}.<br><br>Sem mais para o momento, estamos à disposição para maiores esclarecimentos.<br><br>Atenciosamente,`;
        } else if (decisao === 'gerente') {
            textoDecisao = `Senhora Gerente,<br><br>Após análise da defesa informamos que não somos favoráveis a solicitação apresentada pelo contribuinte, pois ${txtJustificativa}. Encaminhamos o pedido para análise e resposta.<br><br>Respeitosamente,`;
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
};
