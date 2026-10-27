/* ============================================================
   Processos — Etapa 0: Listagem, Filtros e Exportação CSV
   ============================================================ */

// ── Mapa de etapas (para exibição) ──────────────────────────
const ETAPAS_MAP = {
    1: 'Notificação',
    2: 'Andamento',
    3: 'Defesa',
    4: 'Comprovantes',
    5: 'Análise dilação de prazo',
    10: 'Certidão de cumprimento',
    13: 'Análise da defesa',
    14: 'Auto de Infração (AI)',
    15: 'Multa do AI',
    16: 'Dados do AR',
    17: 'Publicação do edital',
    18: 'Andamento do AI',
    19: 'Parecer Jurídico',
    20: 'Arquivamento do AI',
    21: 'Comunicação interna (Fiscal)',
    22: 'Comunicação interna (Gerência)',
    24: 'Despacho Administrativo',
    25: 'Encaminhamento do despacho',
    26: 'Análise para dar desconto',
    28: 'Certificação do vencimento',
    29: 'Certidão de encerramento',
    30: 'AR pendente',
    31: 'Comprovante pagamento'
};

const STATUS_COLORS = {
    em_aberto: '#80A1D4',
    finalizado: '#75C9C8',
    cancelado: '#F8A4A4'
};

// Fundo da linha conforme o cargo responsável pela etapa atual (ver painel.css)
const CLASSE_LINHA_POR_RESPONSAVEL = {
    'Gerente': 'linha-etapa-gerente',
    'Jurídico': 'linha-etapa-juridico',
    'Administrativo': 'linha-etapa-administrativo',
    'Secretário': 'linha-etapa-secretario'
};

// ── Helpers para processos com notificações independentes ─────
function obterNotificacoesProcesso(item) {
    if (item?.notificacoes && Array.isArray(item.notificacoes)) return item.notificacoes;
    return item?.dados?.campos?.etapa2?.notificacoes || [];
}

function numeroEtapaNotificacao(n) {
    if (!n) return 1;

    // 1. Tentar n.etapa_atual_id (chave int4 da etapa)
    if (n.etapa_atual_id !== undefined && n.etapa_atual_id !== null) {
        const num = parseInt(n.etapa_atual_id, 10);
        if (!isNaN(num) && num > 0) return num;
    }

    // 2. Tentar objeto da junção etapas
    const etapaObj = Array.isArray(n.etapas) ? n.etapas[0] : n.etapas;
    if (etapaObj?.numero !== undefined && etapaObj?.numero !== null) {
        const num = parseInt(etapaObj.numero, 10);
        if (!isNaN(num) && num > 0) return num;
    }
    if (etapaObj?.id !== undefined && etapaObj?.id !== null) {
        const num = parseInt(etapaObj.id, 10);
        if (!isNaN(num) && num > 0) return num;
    }

    // 3. Fallbacks
    if (n.etapa_atual !== undefined && n.etapa_atual !== null) {
        const num = parseInt(n.etapa_atual, 10);
        if (!isNaN(num) && num > 0) return num;
    }

    return 2;
}

function extrairEtapaNumero(proc) {
    if (!proc) return 1;

    // 1. Tentar proc.etapa_atual_id (chave int4 da etapa)
    if (proc.etapa_atual_id !== undefined && proc.etapa_atual_id !== null) {
        const num = parseInt(proc.etapa_atual_id, 10);
        if (!isNaN(num) && num > 0) return num;
    }

    // 2. Tentar objeto da junção etapas
    const etapaObj = Array.isArray(proc.etapas) ? proc.etapas[0] : proc.etapas;
    if (etapaObj?.numero !== undefined && etapaObj?.numero !== null) {
        const num = parseInt(etapaObj.numero, 10);
        if (!isNaN(num) && num > 0) return num;
    }
    if (etapaObj?.id !== undefined && etapaObj?.id !== null) {
        const num = parseInt(etapaObj.id, 10);
        if (!isNaN(num) && num > 0) return num;
    }

    // 3. Fallbacks
    if (proc.etapa_atual !== undefined && proc.etapa_atual !== null) {
        const num = parseInt(proc.etapa_atual, 10);
        if (!isNaN(num) && num > 0) return num;
    }

    const d = proc.dados || {};
    const camposEtapa = [d.etapa_atual_id, d.etapa_atual, d.etapa, d.etapa_id, d.etapaAtual, d.etapa_numero];
    for (const val of camposEtapa) {
        if (val !== undefined && val !== null) {
            const num = parseInt(val, 10);
            if (!isNaN(num) && num > 0) return num;
        }
    }

    return 1;
}

function calcularEtapaProcesso(item) {
    const notificacoes = obterNotificacoesProcesso(item);
    if (!notificacoes || notificacoes.length === 0) {
        return extrairEtapaNumero(item);
    }

    const ativas = notificacoes.filter(n => n.status !== 'atendida');
    if (ativas.length === 0) return extrairEtapaNumero(item);

    return ativas.reduce((maior, n) => {
        const etapa = numeroEtapaNotificacao(n);
        return etapa > maior ? etapa : maior;
    }, 0) || extrairEtapaNumero(item);
}

const ETAPAS_POR_CARGO = {
    'Dev': [1, 2, 3, 4, 5, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 28, 29, 30, 31],
    'Fiscal de Postura': [1, 2, 3, 4, 5, 10, 13, 14, 19, 21, 26, 29, 31],
    'Administrativo de Posturas': [15, 16, 17],
    // Etapa 18 (defesa do Auto de Infração): Gerente de Posturas e Jurídico
    // Etapas 28 (Certificação do Vencimento) e 20 (Arquivamento): só o Gerente de Posturas
    'Gerente': [15, 17, 18, 20, 22, 25, 28, 29, 30],
    'Gerente de Posturas': [15, 17, 18, 20, 22, 25, 28, 29, 30],
    'Gerente de Interface Jurídica': [1, 2, 3, 4, 5, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 28, 29, 30, 31],
    'Secretário': [24],
    'Jurídico': [18],
    // A Etapa 26 virou a Análise de Desconto; o perfil fica sem etapas até ser redefinido
    'Fazenda': []
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

// Situação de cada notificação / Auto (notificacoes.situacao), mantida pelo banco.
// Um processo pode ter notificações em
// situações diferentes: uma encerrada, outra virando Auto, outra arquivada.
const SITUACOES_PROCESSO = {
    notificacao_preliminar: 'Notificação Preliminar',
    // Meio Ambiente
    auto_fiscalizacao: 'Auto de Fiscalização',
    auto_infracao: 'Auto de Infração',
    arquivado: 'Arquivado',
    encerrado: 'Encerrado',
    cancelado: 'Cancelado'
};

function montarBadgeSituacao(situacao, quantidade) {
    const chave = String(situacao || '').toLowerCase();
    const rotulo = SITUACOES_PROCESSO[chave];
    const sufixo = quantidade > 1 ? ` (${quantidade})` : '';
    if (!rotulo) {
        // Valor antigo, fora da lista
        return `<span class="situacao-badge outro">${situacao || '—'}</span>`;
    }
    return `<span class="situacao-badge ${chave}">${rotulo}${sufixo}</span>`;
}

// Processos que têm ALGUMA notificação na situação escolhida (filtro Situação).
// Devolve null quando a coluna não existe no banco.
async function obterProcessosPorSituacaoDaNotificacao(situacao) {
    try {
        const { data, error } = await supabaseClient
            .from('notificacoes')
            .select('processo_id')
            .eq('situacao', situacao);
        if (error) {
            if (String(error.message || '').includes('situacao')) return null;
            console.warn('[PAINEL] Erro no filtro de situação:', error.message);
            return null;
        }
        return [...new Set((data || []).map(n => n.processo_id).filter(Boolean))];
    } catch (e) {
        console.warn('[PAINEL] Erro no filtro de situação:', e);
        return null;
    }
}

// Traz as situações das notificações dos processos listados numa consulta só
let painelTemSituacaoNotificacao = true;

async function anexarSituacoesDasNotificacoes(itens) {
    if (!painelTemSituacaoNotificacao || !itens || itens.length === 0) return;
    const ids = itens.map(i => i.id).filter(Boolean);
    if (ids.length === 0) return;

    try {
        const { data, error } = await supabaseClient
            .from('notificacoes')
            .select('id, numero, processo_id, situacao, dados')
            .in('processo_id', ids);

        if (error) {
            if (String(error.message || '').includes('situacao')) {
                console.warn('[PAINEL] Coluna de situação das notificações não existe no banco.');
                painelTemSituacaoNotificacao = false;
            }
            return;
        }

        const porProcesso = {};
        (data || []).forEach(n => {
            if (!n.processo_id || !n.situacao) return;
            porProcesso[n.processo_id] = porProcesso[n.processo_id] || {};
            porProcesso[n.processo_id][n.situacao] = (porProcesso[n.processo_id][n.situacao] || 0) + 1;
        });
        // Paralisado esperando o Jurídico: o painel avisa, senão só quem abre o processo sabe
        const aguardandoJuridico = {};
        (data || []).forEach(n => {
            if (n.processo_id && n.dados?.aguardando_juridico) aguardandoJuridico[n.processo_id] = true;
        });

        // Um botão de PDF unificado por notificação / Auto (PA Nº …)
        const pasPorProcesso = {};
        (data || []).forEach(n => {
            if (!n.processo_id || !n.id) return;
            (pasPorProcesso[n.processo_id] = pasPorProcesso[n.processo_id] || []).push({ id: n.id, numero: n.numero || '' });
        });

        itens.forEach(item => {
            item.notificacoes_pa = (pasPorProcesso[item.id] || [])
                .sort((a, b) => String(a.numero).localeCompare(String(b.numero), 'pt-BR', { numeric: true }));
            item.situacoes_notificacoes = porProcesso[item.id] || null;
            item.aguardando_juridico = !!aguardandoJuridico[item.id];
        });
    } catch (e) {
        console.warn('[PAINEL] Erro ao buscar a situação das notificações:', e);
    }
}

// Uma linha por processo, mostrando a situação de cada notificação dele.
// Sem notificações, cai no resumo do processo.
const ORDEM_SITUACOES = ['auto_infracao', 'auto_fiscalizacao', 'notificacao_preliminar', 'arquivado', 'encerrado', 'cancelado'];

const BADGE_AGUARDANDO_JURIDICO =
    '<span style="display:inline-block; padding:2px 10px; border-radius:12px; font-size:0.72rem; font-weight:700; '
    + 'background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe; white-space:nowrap;">Aguardando Jurídico</span>';

// PDF unificado de cada notificação / Auto, aberto em outra aba. O rótulo é o
// número da notificação depois do número do processo: 2026/000123/02 → PA Nº 02.
function montarBotoesPdfUnificado(item) {
    const escapeHtml = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const icone = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    const base = `etapa.html?processo=${encodeURIComponent(item.id)}&pdf_unido=1`;
    const pas = item.notificacoes_pa || [];
    if (pas.length === 0) {
        return `<a href="${base}" target="_blank" rel="noopener" class="btn-abrir-processo btn-processo-unido" title="Abrir em outra aba o PDF unificado do processo">${icone} PDF</a>`;
    }
    return pas.map(pa => {
        const sufixo = String(pa.numero || '').split('/').pop() || '—';
        return `<a href="${base}&notificacao=${encodeURIComponent(pa.id)}" target="_blank" rel="noopener" class="btn-abrir-processo btn-processo-unido" title="Abrir em outra aba o PDF unificado de ${escapeHtml(pa.numero || 'notificação')}">${icone} PA Nº ${escapeHtml(sufixo)}</a>`;
    }).join('');
}

function montarColunaSituacao(item) {
    const paralisado = item.aguardando_juridico ? BADGE_AGUARDANDO_JURIDICO : '';
    const porSituacao = item.situacoes_notificacoes;
    if (!porSituacao || Object.keys(porSituacao).length === 0) {
        return paralisado
            ? `<div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">${montarBadgeSituacao(item.status)}${paralisado}</div>`
            : montarBadgeSituacao(item.status);
    }
    const chaves = Object.keys(porSituacao).sort((a, b) => {
        const ia = ORDEM_SITUACOES.indexOf(a), ib = ORDEM_SITUACOES.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return `<div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">`
        + chaves.map(k => montarBadgeSituacao(k, porSituacao[k])).join('')
        + paralisado
        + `</div>`;
}

function obterCargoResponsavelPelaEtapa(etapaNum) {
    const num = parseInt(etapaNum, 10);
    // 17 e 18 são compartilhadas (Administrativo / Jurídico); a linha fica com a cor da Gerência
    if ([11, 12, 15, 17, 18, 20, 22, 25, 28, 29, 30].includes(num)) return 'Gerente';
    if ([16, 17].includes(num)) return 'Administrativo';
    if ([24].includes(num)) return 'Secretário';
    if ([19].includes(num)) return 'Jurídico';
    return 'Fiscal';
}

// ── Destaque de multa anexada (Etapa 15) ─────────────────────
// A linha fica num roxo mais escuro quando o Documento da Multa já foi anexado.
// A verificação é opcional e vem desligada: quem quiser liga no filtro
// "Destaque de Multa", que só aparece para quem cuida da multa —
// Gerente de Posturas, Administrativo de Posturas e Dev.
// A comparação é pelo cargo exato (ignorando acento e caixa) para não pegar outras
// gerências, como a de Meio Ambiente.
const CARGOS_COM_DESTAQUE_MULTA = ['gerente de posturas', 'administrativo de posturas'];

function cargoPodeUsarDestaqueMulta() {
    const cargoBruto = window.currentUserProfile?.cargo || '';
    if (normalizarCargo(cargoBruto) === 'Dev') return true;
    const cargo = cargoBruto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return CARGOS_COM_DESTAQUE_MULTA.includes(cargo);
}

function usuarioVeDestaqueMulta() {
    const chk = document.getElementById('chkDestacarMultaAnexada');
    return !!(chk && chk.checked) && cargoPodeUsarDestaqueMulta();
}

// ── Botões do cabeçalho: Novo Processo × Gerar Ofício ───────
// Só o Fiscal abre processo (é ele quem assina o Relatório e o Auto de Infração).
// O Gerente de Posturas e o Administrativo de Posturas ganham, no mesmo lugar, o
// Ofício SEMAC - GFP avulso. Quem assina é sempre o Gerente de Posturas, mesmo
// quando o Administrativo gera (ver buscarNomeGerentePosturas em oficio-avulso.js).
// O Dev vê os dois botões, lado a lado, para poder testar os dois fluxos.
// Os cargos são comparados pelo nome exato, como no destaque de multa,
// para não liberar outras gerências.
function usuarioPodeCriarProcesso() {
    const cargo = normalizarCargo(window.currentUserProfile?.cargo);
    return cargo === 'Fiscal de Postura' || cargo === 'Dev';
}

const CARGOS_GERAM_OFICIO_AVULSO = ['gerente de posturas', 'administrativo de posturas'];

function usuarioPodeGerarOficioAvulso() {
    const cargoBruto = window.currentUserProfile?.cargo || '';
    if (normalizarCargo(cargoBruto) === 'Dev') return true;
    const cargo = cargoBruto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return CARGOS_GERAM_OFICIO_AVULSO.includes(cargo);
}

function configurarBotoesAcaoPorCargo() {
    const btnNovo = document.getElementById('btnNovaSolicitacao');
    const btnOficio = document.getElementById('btnGerarOficio');
    const tabOficios = document.getElementById('tab-oficios');
    if (btnNovo) btnNovo.style.display = usuarioPodeCriarProcesso() ? '' : 'none';
    if (btnOficio) btnOficio.style.display = usuarioPodeGerarOficioAvulso() ? '' : 'none';
    if (tabOficios) tabOficios.style.display = usuarioPodeGerarOficioAvulso() ? 'flex' : 'none';
}

window.usuarioPodeCriarProcesso = usuarioPodeCriarProcesso;
window.usuarioPodeGerarOficioAvulso = usuarioPodeGerarOficioAvulso;

// Mostra o filtro do destaque só para os cargos que cuidam da multa
function configurarFiltroDestaqueMulta() {
    const grupo = document.getElementById('grupoDestaqueMulta');
    if (grupo) grupo.style.display = cargoPodeUsarDestaqueMulta() ? 'flex' : 'none';
}

// A multa da Etapa 15 fica em dados.etapa15 do processo e/ou da notificação
function processoTemMultaAnexada(item) {
    const temMulta = (dados) => !!(dados?.etapa15?.multa_url || dados?.etapa15?.multa_id || dados?.multa_id);
    if (temMulta(item?.dados)) return true;
    return obterNotificacoesProcesso(item).some(n => temMulta(n?.dados));
}

function itemPertenceAoCargo(item, cargoAlvo) {
    if (!cargoAlvo) return true;
    const cargoNorm = normalizarCargo(cargoAlvo);
    if (cargoNorm === 'Dev') return true;

    // Fiscal de Meio Ambiente tem as etapas do Fiscal de Postura, mas cada um só
    // responde pelos processos do seu tipo (meio-ambiente.js)
    if (cargoNorm === 'Fiscal de Postura' && typeof window.processoEhMeioAmbiente === 'function') {
        const filtroMeioAmbiente = window.ehCargoMeioAmbiente(cargoAlvo);
        if (filtroMeioAmbiente !== window.processoEhMeioAmbiente(item)) return false;
    }

    const etapasPermitidas = ETAPAS_POR_CARGO[cargoNorm] || ETAPAS_POR_CARGO[cargoAlvo] || ETAPAS_POR_CARGO['Gerente'] || [];
    if (etapasPermitidas.length === 0) return true;

    // 1. Verificar se a etapa calculada do processo pertence ao cargo
    const etapaCalculada = calcularEtapaProcesso(item);
    if (etapasPermitidas.includes(etapaCalculada)) return true;

    // 2. Verificar se a etapa bruta do processo pertence ao cargo
    const etapaProcBruta = extrairEtapaNumero(item);
    if (etapasPermitidas.includes(etapaProcBruta)) return true;

    // 3. Verificar se alguma notificação do processo pertence ao cargo
    const notificacoes = obterNotificacoesProcesso(item);
    if (notificacoes && notificacoes.length > 0) {
        return notificacoes.some(n => etapasPermitidas.includes(numeroEtapaNotificacao(n)));
    }

    return false;
}

function montarLinkEtapa(item) {
    const id = item?.id || item?.processo_id || item?.numero_processo || '';
    return `etapa.html?processo=${id}`;
}

window.abrirProcessoAuto = function (id) {
    if (id && String(id).trim() !== '' && String(id) !== 'undefined') {
        localStorage.setItem('ultimoProcessoId', id);
        window.location.href = `etapa.html?processo=${id}`;
    } else {
        window.location.href = 'painel.html';
    }
};

// ── Estado da aplicação ─────────────────────────────────────
let currentOffset = 0;
let hasMoreRecords = true;
let totalProcessosFiltro = null;
let rotuloDecretoFiltro = '';
let isFetchingMore = false;
let currentUserId = null;
let dadosTabela = []; // dados exibidos acumulados (para exportação)

// ── Elementos do DOM ────────────────────────────────────────
const filtersPanel = document.getElementById('filtersPanel');
const tabelaBody = document.getElementById('tabelaBody');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const resultsCount = document.getElementById('resultsCount');

// ── Inicialização ───────────────────────────────────────────
// O painel de filtros gruda logo abaixo do header, que também é sticky.
// Como a altura do header muda com o zoom e com a largura da tela, ela é medida
// aqui e publicada em --painel-header-h, usada pelo CSS do .filters-panel.
function publicarAlturaHeaderPainel() {
    const header = document.querySelector('.painel-header');
    if (!header) return;
    document.documentElement.style.setProperty('--painel-header-h', `${header.offsetHeight}px`);
}

document.addEventListener('DOMContentLoaded', async () => {
    limparAutofillInvasivoFiltros();
    bindEventos();
    carregarOpcoesFiscaisFiltro();
    publicarAlturaHeaderPainel();
    window.addEventListener('resize', publicarAlturaHeaderPainel);

    // Primeiro valida a sessão de forma segura
    const sessaoValida = await verificarSessao();
    if (sessaoValida) {
        await carregarSolicitacoes();
    }

    setTimeout(limparAutofillInvasivoFiltros, 300);
});

// ── Auxiliar para limpar tokens de autenticação corrompidos ────
function limparTokensAutenticacao() {
    try {
        sessionStorage.removeItem('currentUserProfile');
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
        console.warn('Erro ao limpar tokens:', e);
    }
}

// ── Verificar sessão ativa ──────────────────────────────────
async function verificarSessao() {
    try {
        // Tentar preencher com perfil do cache para renderização instantânea
        const cached = sessionStorage.getItem('currentUserProfile');
        if (cached) {
            try {
                const uCached = JSON.parse(cached);
                if (uCached && uCached.id) {
                    currentUserId = uCached.id;
                    window.currentUserProfile = uCached;
                    window.tabelaPerfilAlvo = 'profiles';
                    preencherDadosInterfaceUsuario(uCached);
                }
            } catch (e) { }
        }

        const authRes = await supabaseClient.auth.getSession().catch(err => {
            console.warn('Falha ao comunicar com Auth Supabase (CORS/Network/522):', err);
            return { data: { session: null }, error: err };
        });

        const session = authRes?.data?.session;
        if (authRes?.error || !session) {
            console.warn('Sessão expirada ou inválida. Redirecionando para login...');
            limparTokensAutenticacao();
            window.location.href = 'index.html';
            return false;
        }

        // Buscar dados do usuário na tabela profiles
        let { data: usuario } = await supabaseClient
            .from('profiles')
            .select('id, auth_id, cpf, nome, cargo, matricula, email, avatar_url')
            .eq('auth_id', session.user.id)
            .maybeSingle();

        if (!usuario && session.user.email) {
            const cpfLimpo = session.user.email.split('@')[0].replace(/\D/g, '');
            if (cpfLimpo) {
                let res = await supabaseClient
                    .from('profiles')
                    .select('id, auth_id, cpf, nome, cargo, matricula, email, avatar_url')
                    .eq('cpf', cpfLimpo)
                    .maybeSingle();
                if (!res.data && cpfLimpo.length === 11) {
                    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                    res = await supabaseClient
                        .from('profiles')
                        .select('id, auth_id, cpf, nome, cargo, matricula, email, avatar_url')
                        .eq('cpf', cpfFormatado)
                        .maybeSingle();
                }
                usuario = res.data;
                if (usuario && !usuario.auth_id) {
                    await supabaseClient
                        .from('profiles')
                        .update({ auth_id: session.user.id })
                        .eq('id', usuario.id);
                }
            }
        }

        // Se ainda não existir perfil no banco, criar automaticamente para o usuário autenticado
        if (!usuario && session.user) {
            const cpfLimpo = session.user.email ? session.user.email.split('@')[0].replace(/\D/g, '') : '';
            const cpfFormatado = cpfLimpo.length === 11
                ? cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                : (cpfLimpo || '000.000.000-00');

            const novoPerfil = {
                auth_id: session.user.id,
                cpf: cpfFormatado,
                nome: 'Fiscal de Postura',
                cargo: 'Fiscal de Postura',
                email: session.user.email
            };

            const { data: criado } = await supabaseClient
                .from('profiles')
                .insert([novoPerfil])
                .select()
                .maybeSingle();

            if (criado) {
                usuario = criado;
            } else {
                usuario = novoPerfil;
            }
        }

        if (usuario) {
            currentUserId = usuario.id || session.user.id;
            window.currentUserProfile = usuario;
            window.tabelaPerfilAlvo = 'profiles';
            sessionStorage.setItem('currentUserProfile', JSON.stringify(usuario));
            preencherDadosInterfaceUsuario(usuario);
        }
        return true;
    } catch (err) {
        console.error('Erro ao verificar sessão:', err);
        limparTokensAutenticacao();
        window.location.href = 'index.html';
        return false;
    }
}

function preencherDadosInterfaceUsuario(usuario) {
    const nomeExibicao = usuario.nome || 'Usuário';
    const elUserName = document.getElementById('userName');
    if (elUserName) elUserName.textContent = nomeExibicao;

    const elMatricula = document.getElementById('userMatricula');
    if (elMatricula) elMatricula.textContent = "Matrícula: " + (usuario.matricula || '---');

    // Aplicar avatar customizado ou iniciais
    if (typeof aplicarAvatarUsuario === 'function') {
        aplicarAvatarUsuario(usuario, nomeExibicao);
    }

    // Preencher campos da aba Configurações
    const pNome = document.getElementById('perfil-nome');
    const pEmail = document.getElementById('perfil-email');
    const pCpf = document.getElementById('perfil-cpf');
    const pMatricula = document.getElementById('perfil-matricula');
    const pCargo = document.getElementById('perfil-cargo');
    if (pNome) pNome.value = nomeExibicao;
    if (pEmail) pEmail.value = usuario.email || '';
    if (pCpf) pCpf.value = usuario.cpf || '';
    if (pMatricula) pMatricula.value = usuario.matricula || '';
    if (pCargo) pCargo.value = usuario.cargo || 'Fiscal de Postura';

    const nomeHeader = document.getElementById('perfilHeaderNome');
    const cargoHeader = document.getElementById('perfilHeaderCargo');
    if (nomeHeader) nomeHeader.textContent = nomeExibicao;
    if (cargoHeader) cargoHeader.textContent = usuario.cargo || 'Fiscal de Postura';

    // Verificar visibilidade da aba Apuração de Dados (Secretário(a) e Dev)
    if (typeof verificarEExibirTabApuracao === 'function') {
        verificarEExibirTabApuracao(usuario);
    }

    // Filtro do destaque de multa: visível só para os cargos que cuidam dela
    configurarFiltroDestaqueMulta();

    configurarBotoesAcaoPorCargo();

    // Quando se chega pela sidebar da etapa (painel.html#oficios, #instrucoes, ...)
    abrirPaginaDoHash();
}

// Abre a aba indicada na URL. Usado pelos links da sidebar da tela de etapa,
// que precisam voltar ao painel já na página certa.
let hashDaUrlJaAplicado = false;

function abrirPaginaDoHash() {
    if (hashDaUrlJaAplicado) return;

    const pagina = (window.location.hash || '').replace('#', '').trim();
    if (!pagina) return;

    const link = document.querySelector(`.sidebar-nav a[data-page="${pagina}"]`);
    if (!link) return;

    // Aba restrita que o cargo não enxerga: mantém o painel nas Processos
    if (link.style.display === 'none') return;

    hashDaUrlJaAplicado = true;
    link.click();
}

// ── Carregar Processos com filtros ────────────────────────
// ── Carregar Processos com filtros (com lote dinâmico e resiliência a timeout/redes) ──
let currentFetchId = 0;
let dynamicBatchSize = 50;

// Colunas processos.data_inicio_prazo / data_vencimento.
// Mantidas pelo banco: vencimento mais próximo entre as notificações em aberto e o
// início que corresponde a ele.
let painelTemColunasPrazo = true;

async function carregarSolicitacoes(append = false, tentativa = 1) {
    if (isFetchingMore && append) return;

    if (!append) {
        currentOffset = 0;
        dadosTabela = [];
        hasMoreRecords = true;
        // A lista foi refeita: o marco do sino é recalculado na próxima verificação
        marcoSincronizacaoNotificacoes = null;
        mostrarLoading(true);
    } else {
        isFetchingMore = true;
        mostrarLoadingCarregarMais(true);
    }

    const myFetchId = ++currentFetchId;

    // Verificar se o cliente está offline antes de iniciar requisição
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        isFetchingMore = false;
        mostrarLoading(false);
        mostrarLoadingCarregarMais(false);
        if (resultsCount) {
            resultsCount.innerHTML = `Sem conexão com a internet. <a href="#" onclick="carregarSolicitacoes(false, 1); return false;" style="color:#2563eb; text-decoration:underline; font-weight:600; margin-left:6px;">Tentar novamente</a>`;
        }
        return;
    }

    try {
        // Montar query base
        // Observação: já tentamos buscar só sub-campos de `dados` via várias expressões
        // dados->x separadas para economizar tráfego, mas isso piorou a performance:
        // cada expressão dados->x força o Postgres a descomprimir (detoast) a coluna
        // `dados` inteira de novo, então 15 extrações = 15 descompressões por linha.
        // Para processos com anexos/imagens grandes em `dados`, isso é MAIS lento que
        // buscar a coluna inteira uma única vez — o que causou timeout no banco.
        // Buscando `dados` inteiro (uma descompressão por linha) de volta.
        let query = supabaseClient
            .from('processos')
            .select(`
                id,
                numero_processo,
                numero_relatorio,
                status,
                etapa_atual_id,
                dados,
                created_at,
                updated_at,
                fiscal_id${painelTemColunasPrazo ? ',\n                data_inicio_prazo,\n                data_vencimento' : ''}
            `, append ? {} : { count: 'exact' });

        // Aplicar filtros
        const filtros = coletarFiltros();

        if (filtros.protocolo) {
            query = query.ilike('numero_processo', `%${filtros.protocolo}%`);
        }
        if (filtros.relatorio) {
            const rTerm = filtros.relatorio.trim();
            const relProcIds = [];
            try {
                const { data: docsRel } = await supabaseClient
                    .from('documentos')
                    .select('processo_id')
                    .ilike('tipo', '%relatorio%')
                    .ilike('numero_sequencial', `%${rTerm}%`);
                if (docsRel) docsRel.forEach(d => { if (d.processo_id) relProcIds.push(d.processo_id); });
            } catch (eRel) { }

            const uniqueRelIds = [...new Set(relProcIds)];
            let orRel = `numero_relatorio.ilike.%${rTerm}%`;
            if (uniqueRelIds.length > 0) {
                orRel += `,id.in.(${uniqueRelIds.join(',')})`;
            }
            query = query.or(orRel);
        }
        if (filtros.auto) {
            const autoTerm = filtros.auto.trim();
            const autoProcIds = [];
            try {
                const { data: docsAuto } = await supabaseClient
                    .from('documentos')
                    .select('processo_id')
                    .ilike('tipo', '%auto%')
                    .ilike('numero_sequencial', `%${autoTerm}%`);
                if (docsAuto) docsAuto.forEach(d => { if (d.processo_id) autoProcIds.push(d.processo_id); });
            } catch (eDocAuto) { }

            try {
                const { data: autosMatch } = await supabaseClient
                    .from('autos_infracao')
                    .select('processo_id')
                    .ilike('numero', `%${autoTerm}%`);
                if (autosMatch) autosMatch.forEach(a => { if (a.processo_id) autoProcIds.push(a.processo_id); });
            } catch (eAuto) { }

            const uniqueAutoIds = [...new Set(autoProcIds)];
            if (uniqueAutoIds.length > 0) {
                query = query.in('id', uniqueAutoIds);
            } else {
                query = query.eq('id', '00000000-0000-0000-0000-000000000000');
            }
        }
        if (filtros.notificacao) {
            const notifTerm = filtros.notificacao.trim();
            const notifProcIds = [];
            try {
                const { data: docsNotif } = await supabaseClient
                    .from('documentos')
                    .select('processo_id')
                    .ilike('tipo', '%notifica%')
                    .ilike('numero_sequencial', `%${notifTerm}%`);
                if (docsNotif) docsNotif.forEach(d => { if (d.processo_id) notifProcIds.push(d.processo_id); });
            } catch (eDocNotif) { }

            // A NP e o Auto de Fiscalização impressos mostram "2026/000668-1", mas a
            // notificação é gravada como "2026/000668/01": procura os dois formatos
            const termosNotif = [notifTerm];
            const formatoImpresso = notifTerm.match(/^(.*\d)\s*-\s*(\d{1,2})$/);
            if (formatoImpresso) termosNotif.push(`${formatoImpresso[1]}/${formatoImpresso[2].padStart(2, '0')}`);

            try {
                const { data: notifsMatch } = await supabaseClient
                    .from('notificacoes')
                    .select('processo_id')
                    .or(termosNotif.map(t => `numero.ilike.%${t.replace(/[,()]/g, '')}%`).join(','));
                if (notifsMatch) notifsMatch.forEach(n => { if (n.processo_id) notifProcIds.push(n.processo_id); });
            } catch (eNotif) { }

            const uniqueNotifIds = [...new Set(notifProcIds)];
            if (uniqueNotifIds.length > 0) {
                query = query.in('id', uniqueNotifIds);
            } else {
                query = query.eq('id', '00000000-0000-0000-0000-000000000000');
            }
        }
        if (filtros.infracoes && filtros.infracoes.length > 0) {
            // Um processo pode ter várias infrações, cada uma virando uma notificação
            // própria (processo_infracoes). Trazemos o processo se QUALQUER UMA das
            // infrações dele bater com alguma das selecionadas no filtro.
            const infraProcIds = [];
            try {
                const { data: catInfra } = await supabaseClient
                    .from('infracoes_catalogo')
                    .select('id')
                    .in('codigo', filtros.infracoes);
                const catIds = (catInfra || []).map(c => c.id);
                if (catIds.length > 0) {
                    const { data: procInfra } = await supabaseClient
                        .from('processo_infracoes')
                        .select('processo_id')
                        .in('infracao_id', catIds);
                    if (procInfra) procInfra.forEach(p => { if (p.processo_id) infraProcIds.push(p.processo_id); });
                }
            } catch (eInfra) { }

            const uniqueInfraIds = [...new Set(infraProcIds)];
            if (uniqueInfraIds.length > 0) {
                query = query.in('id', uniqueInfraIds);
            } else {
                query = query.eq('id', '00000000-0000-0000-0000-000000000000');
            }
        }
        if (filtros.nome) {
            query = query.ilike('dados->contribuinte->>nome', `%${filtros.nome}%`);
        }
        if (filtros.cpf) {
            const rawCpf = filtros.cpf.trim();
            const cleanCpf = rawCpf.replace(/\D/g, '');
            const contribProcIds = [];

            if (cleanCpf || rawCpf) {
                try {
                    const { data: contribs } = await supabaseClient
                        .from('contribuintes')
                        .select('id')
                        .or(`cpf_cnpj.ilike.%${cleanCpf || rawCpf}%,cpf_cnpj.ilike.%${rawCpf}%`);
                    if (contribs && contribs.length > 0) {
                        const cIds = contribs.map(c => c.id);
                        const { data: procContribs } = await supabaseClient
                            .from('processos')
                            .select('id')
                            .in('contribuinte_id', cIds);
                        if (procContribs) procContribs.forEach(p => contribProcIds.push(p.id));
                    }
                } catch (eContrib) { }
            }

            let orCpf = `dados->contribuinte->>cpf_cnpj.ilike.%${rawCpf}%`;
            if (cleanCpf && cleanCpf !== rawCpf) {
                orCpf += `,dados->contribuinte->>cpf_cnpj.ilike.%${cleanCpf}%`;
            }
            const uniqueContribProcIds = [...new Set(contribProcIds)];
            if (uniqueContribProcIds.length > 0) {
                orCpf += `,id.in.(${uniqueContribProcIds.join(',')})`;
            }
            query = query.or(orCpf);
        }
        if (filtros.codigoReduzido) {
            // Código reduzido do imóvel: o gravado no processo e, pelo cadastro de
            // imóveis, os processos ligados a ele (imovel_id)
            const termoCodigo = filtros.codigoReduzido.replace(/[,()%]/g, '').trim();
            const procIdsImovel = [];
            try {
                const { data: imoveisCodigo } = await supabaseClient
                    .from('imoveis')
                    .select('id')
                    .ilike('codigo_reduzido', `%${termoCodigo}%`);
                if (imoveisCodigo && imoveisCodigo.length > 0) {
                    const { data: procImoveis } = await supabaseClient
                        .from('processos')
                        .select('id')
                        .in('imovel_id', imoveisCodigo.map(i => i.id));
                    (procImoveis || []).forEach(p => procIdsImovel.push(p.id));
                }
            } catch (eImovel) { }

            let orCodigo = `dados->imovel->>codigo_reduzido.ilike.%${termoCodigo}%`;
            const unicosImovel = [...new Set(procIdsImovel)];
            if (unicosImovel.length > 0) orCodigo += `,id.in.(${unicosImovel.join(',')})`;
            query = query.or(orCodigo);
        }
        if (filtros.fiscal) {
            query = query.eq('fiscal_id', filtros.fiscal);
        }

        if (filtros.dataInicio) {
            query = query.gte('created_at', filtros.dataInicio);
        }
        if (filtros.dataFim) {
            query = query.lte('created_at', filtros.dataFim + 'T23:59:59');
        }
        if (filtros.etapa) {
            query = query.eq('etapa_atual_id', parseInt(filtros.etapa));
        }
        // Ordenar por vencimento: data mais antiga primeiro — vencidos há mais tempo,
        // depois os que vencem hoje e os mais próximos de vencer. Processos sem prazo
        // iniciado (AR ainda não voltou) não têm data e ficam de fora.
        const ordenarPorVencimento = filtros.prazo === 'vencimento' && painelTemColunasPrazo;
        if (ordenarPorVencimento) {
            query = query.not('data_vencimento', 'is', null);
        }
        if (filtros.situacao) {
            // A situação é de cada notificação:
            // traz o processo que tiver ALGUMA notificação nessa situação. Processos
            // sem notificação entram pelo resumo em processos.status.
            const idsPorSituacao = await obterProcessosPorSituacaoDaNotificacao(filtros.situacao);
            if (idsPorSituacao && idsPorSituacao.length > 0) {
                query = query.or(`id.in.(${idsPorSituacao.join(',')}),status.eq.${filtros.situacao}`);
            } else {
                query = query.eq('status', filtros.situacao);
            }
        }
        if (filtros.descricao) {
            query = query.ilike('dados->>descricao', `%${filtros.descricao}%`);
        }
        if (filtros.criador === 'meu' && currentUserId) {
            query = query.eq('fiscal_id', currentUserId);
        }
        if (filtros.decreto === 'sim') {
            query = query.eq('possui_decreto', true);
        } else if (filtros.decreto === 'nao') {
            // Falso ou vazio (processos antigos sem a coluna preenchida)
            query = query.not('possui_decreto', 'is', true);
        }

        // Execução em lote adaptativo (redimensiona automaticamente se o banco expirar tempo)
        const effectiveBatch = Math.max(10, dynamicBatchSize);
        const from = currentOffset;
        const to = currentOffset + effectiveBatch - 1;

        if (ordenarPorVencimento) {
            query = query.order('data_vencimento', { ascending: true });
        }
        const { data, error, count } = await query
            .range(from, to)
            .order('created_at', { ascending: false });

        if (error) {
            // Banco sem as colunas de prazo: abre sem as datas
            if (painelTemColunasPrazo && String(error.message || '').includes('data_')) {
                console.warn('[PAINEL] Colunas de prazo não existem no banco.');
                painelTemColunasPrazo = false;
                isFetchingMore = false;
                return carregarSolicitacoes(append, tentativa);
            }
            throw error;
        }

        // Ignorar se outra requisição já foi disparada
        if (myFetchId !== currentFetchId) return;

        const rawData = data || [];
        // Total do filtro (só na primeira página; o "carregar mais" mantém).
        // Com o filtro Responsável, que é aplicado aqui no navegador, não há total.
        if (!append) {
            totalProcessosFiltro = (typeof count === 'number' && !filtros.responsavel) ? count : null;
            rotuloDecretoFiltro = filtros.decreto === 'sim' ? ' por decreto' : (filtros.decreto === 'nao' ? ' sem decreto' : '');
        }

        // Buscar nomes dos fiscais via query separada ultrarrápida
        const fiscalIds = [...new Set(rawData.map(i => i.fiscal_id).filter(Boolean))];
        let profilesMap = {};
        if (fiscalIds.length > 0) {
            try {
                const { data: profs } = await supabaseClient
                    .from('profiles')
                    .select('id, nome')
                    .in('id', fiscalIds);
                if (profs) {
                    profs.forEach(p => profilesMap[p.id] = p);
                }
            } catch (pErr) {
                console.warn('Erro ao carregar perfis dos fiscais:', pErr);
            }
        }

        rawData.forEach(item => {
            if (item.fiscal_id && profilesMap[item.fiscal_id]) {
                item.profiles = profilesMap[item.fiscal_id];
            }
        });

        // Situação de cada notificação / Auto (coluna Situação)
        await anexarSituacoesDasNotificacoes(rawData);

        // Se retornou menos que o lote efetivo, indica fim dos dados
        if (rawData.length < effectiveBatch) {
            hasMoreRecords = false;
        } else {
            hasMoreRecords = true;
        }

        currentOffset += rawData.length;

        let novosDados = rawData;
        if (filtros.responsavel) {
            let cargoAlvo = filtros.responsavel;
            if (cargoAlvo === 'minha_responsabilidade') {
                cargoAlvo = window.currentUserProfile?.cargo || 'Fiscal de Postura';
            }
            novosDados = rawData.filter(item => itemPertenceAoCargo(item, cargoAlvo));
        }

        if (append) {
            dadosTabela = [...dadosTabela, ...novosDados];
        } else {
            dadosTabela = novosDados;
        }

        renderizarTabela(dadosTabela, filtros.responsavel);
        atualizarContadorECarregarMais();
        setTimeout(() => { if (window.atualizarInterfaceNotificacoesPainel) window.atualizarInterfaceNotificacoesPainel(); }, 150);
        iniciarSincronizacaoNotificacoesPainel();

    } catch (err) {
        console.error(`Erro ao carregar processos (tentativa ${tentativa}):`, err);

        const isTimeout = err?.code === '57014' || String(err?.message || '').toLowerCase().includes('timeout') || String(err?.details || '').toLowerCase().includes('timeout');
        const isNetworkErr = String(err).includes('Failed to fetch') || String(err?.message || '').includes('Failed to fetch') || String(err).includes('ERR_ADDRESS_UNREACHABLE');

        // Em caso de statement timeout do PostgreSQL (57014), reduz o tamanho do lote para o servidor responder mais rápido
        if (isTimeout) {
            dynamicBatchSize = Math.max(15, Math.floor(dynamicBatchSize / 2));
            console.warn(`Statement timeout detectado no banco de dados. Lote ajustado para ${dynamicBatchSize} registros.`);
        }

        if (tentativa < 3 && !isNetworkErr) {
            const delay = isTimeout ? 2000 : 1500;
            console.log(`Re-tentando carregar processos em ${delay / 1000}s (tentativa ${tentativa + 1})...`);
            setTimeout(() => carregarSolicitacoes(append, tentativa + 1), delay);
            return;
        }

        if (resultsCount) {
            const msgStatus = isNetworkErr
                ? `Sem conexão com o servidor Supabase.`
                : isTimeout
                    ? `Tempo limite excedido na consulta do banco de dados.`
                    : `Erro ao carregar dados.`;
            resultsCount.innerHTML = `${msgStatus} <a href="#" onclick="dynamicBatchSize = 25; carregarSolicitacoes(false, 1); return false;" style="color:#2563eb; text-decoration:underline; font-weight:600; margin-left:6px;">Tentar novamente</a>`;
        }
    } finally {
        isFetchingMore = false;
        mostrarLoading(false);
        mostrarLoadingCarregarMais(false);
    }
}

// ── Renderizar tabela ───────────────────────────────────────
function renderizarTabela(dados, cargoFiltro) {
    tabelaBody.innerHTML = '';

    if (!dados || dados.length === 0) {
        emptyState.style.display = 'flex';
        document.getElementById('tabelaSolicitacoes').style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    document.getElementById('tabelaSolicitacoes').style.display = 'table';

    let cargoAlvoNorm = null;
    if (cargoFiltro) {
        let cargoNome = cargoFiltro === 'minha_responsabilidade' ? (window.currentUserProfile?.cargo || 'Fiscal de Postura') : cargoFiltro;
        cargoAlvoNorm = normalizarCargo(cargoNome);
    }

    const mostrarDestaqueMulta = usuarioVeDestaqueMulta();

    dados.forEach(item => {
        const tr = document.createElement('tr');

        const nomeSolicitante = item.dados?.contribuinte?.nome || item.dados?.nome_solicitante || '—';
        const dataInicio = formatarData(item.data_inicio_prazo);
        const dataFinal = formatarData(item.data_vencimento);
        const diasVenc = calcularDiasVencimento(item.data_vencimento);
        const profileObj = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        const nomeFiscal = profileObj?.nome || item.dados?.fiscal?.nome || item.dados?.fiscal_nome || item.dados?.fiscal?.fiscNome || '—';
        const etapaNumero = item.status === 'cancelado' ? '—' : (extrairEtapaNumero(item) || '—');
        const etapaNome = item.status === 'cancelado' ? 'Cancelado' : (etapaNumero === '—' ? 'Concluído' : (item.etapas?.nome || ETAPAS_MAP[etapaNumero] || '—'));
        const statusClass = item.status || 'em_aberto';


        const isDev = window.currentUserProfile && normalizarCargo(window.currentUserProfile.cargo) === 'Dev';
        if (isDev) {
            const thCheck = document.getElementById('thCheck');
            const devActions = document.getElementById('devActionsContainer');
            if (thCheck) thCheck.style.display = 'table-cell';
            if (devActions) devActions.style.display = 'flex';
        }

        const devCheckHtml = isDev ? `<td class="col-check" style="text-align: center;"><input type="checkbox" class="chk-process" data-id="${item.id}" onclick="event.stopPropagation(); window.atualizarContagemSelecionados && window.atualizarContagemSelecionados();" /></td>` : '';

        const linkProcesso = montarLinkEtapa(item);

        tr.innerHTML = `
            ${devCheckHtml}
            <td class="col-protocolo">
                <a href="${linkProcesso}" class="link-processo" title="Abrir processo (clique com o botão direito para abrir em nova guia)">
                    <span class="protocolo-badge">${item.numero_processo || '—'}</span>
                </a>
            </td>
            <td class="col-codigo-imovel">${item.dados?.imovel?.codigo_reduzido || '—'}</td>
            <td class="col-nome">${nomeSolicitante}</td>
            <td class="col-data">${dataInicio}</td>
            <td class="col-data">${dataFinal}</td>
            <td class="col-dias">${montarBadgeDiasVencimento(diasVenc)}</td>
            <td class="col-descricao" title="${nomeFiscal}">${truncar(nomeFiscal, 30)}</td>
            <td class="col-situacao">${montarColunaSituacao(item)}</td>
            <td class="col-etapa">
                ${etapaNumero === '—' ? '' : `<span class="etapa-badge">E${etapaNumero}</span>`}
                <span class="etapa-nome">${truncar(etapaNome, 25)}</span>
            </td>
            <td class="col-acoes">
                <a href="${linkProcesso}" class="btn-abrir-processo" data-id="${item.id}" data-etapa="${etapaNumero}" title="Abrir processo (botão direito para abrir em nova guia)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Abrir
                </a>
                ${montarBotoesPdfUnificado(item)}
            </td>
        `;

        // Fiscal de Meio Ambiente: a situação e a etapa falam em Auto de Fiscalização
        // no lugar de Notificação Preliminar (meio-ambiente.js)
        const ehProcessoMeioAmbiente = !!(window.processoEhMeioAmbiente && window.processoEhMeioAmbiente(item));
        if (ehProcessoMeioAmbiente) window.aplicarTermosAutoFiscalizacao(tr);

        tr.style.borderLeft = `4px solid ${STATUS_COLORS[statusClass] || '#94a3b8'}`;

        if (etapaNumero !== '—') {
            const classeResponsavel = CLASSE_LINHA_POR_RESPONSAVEL[obterCargoResponsavelPelaEtapa(etapaNumero)];
            if (classeResponsavel) tr.classList.add(classeResponsavel);
        }

        // Multa já anexada na Etapa 15: roxo mais escuro (só para os cargos que cuidam dela)
        if (mostrarDestaqueMulta && processoTemMultaAnexada(item)) {
            tr.classList.add('linha-multa-anexada');
            tr.title = 'Documento da multa já anexado (Etapa 15)';
        }

        tr.style.cursor = 'pointer';

        // Ignora cliques em elementos que já têm comportamento próprio (links inclusive,
        // para o navegador cuidar de Ctrl+clique / abrir em nova guia nativamente).
        const cliqueEmElementoProprio = (e) => e.target.closest('button, input, a');

        tr.addEventListener('click', (e) => {
            if (cliqueEmElementoProprio(e)) return;
            if (e.ctrlKey || e.metaKey) {
                window.open(linkProcesso, '_blank');
                return;
            }
            window.abrirProcessoAuto(item.id || item.processo_id || item.numero_processo);
        });

        // Clique do meio (botão do scroll) abre em nova guia
        tr.addEventListener('auxclick', (e) => {
            if (e.button !== 1 || cliqueEmElementoProprio(e)) return;
            e.preventDefault();
            window.open(linkProcesso, '_blank');
        });

        tabelaBody.appendChild(tr);

        // Se o filtro por responsável estiver ativo, criar sub-linha estendida abaixo de todo o processo
        if (cargoFiltro && cargoAlvoNorm) {
            const notificacoes = obterNotificacoesProcesso(item);
            if (notificacoes && notificacoes.length > 0) {
                const etapasDoCargo = ETAPAS_POR_CARGO[cargoAlvoNorm] || [];
                const notifsDoCargo = notificacoes.filter(n => etapasDoCargo.includes(numeroEtapaNotificacao(n)));

                if (notifsDoCargo.length > 0) {
                    const trDet = document.createElement('tr');
                    trDet.className = 'tr-notificacao-detalhe';

                    const boxes = notifsDoCargo.map(n => {
                        const numNotif = n.numero || n.numero_notificacao || n.dados?.numero || (n.id ? String(n.id).slice(0, 8) : '1');
                        const eNum = numeroEtapaNotificacao(n);
                        const eNome = ETAPAS_MAP[eNum] || `Etapa ${eNum}`;
                        const respCargo = obterCargoResponsavelPelaEtapa(eNum);

                        // Identificar índice ou ID para direcionamento correto
                        const idxNoProc = notificacoes.findIndex(itemNotif => itemNotif === n || (itemNotif.id && itemNotif.id === n.id));
                        const targetParam = idxNoProc >= 0 ? idxNoProc : (n.id || n.notificacao_id || n.numero || '');

                        return `
                        <div onclick="event.stopPropagation(); window.abrirNotificacaoEPromoverLida('${item.id}', '${targetParam}')" 
                             style="background: white; border: 1px solid #DED9E2; border-left: 5px solid #80A1D4; padding: 10px 16px; border-radius: 8px; font-size: 0.8rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04); cursor: pointer; transition: all 0.2s ease;"
                             onmouseenter="this.style.borderColor='#80A1D4'; this.style.boxShadow='0 4px 12px rgba(128,161,212,0.18)'"
                             onmouseleave="this.style.borderColor='#DED9E2'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'"
                             title="Clique para abrir esta notificação específica">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <strong style="color: #1e293b; font-size: 0.84rem;">Notificação #${numNotif}</strong>
                                <span style="font-size: 0.72rem; background: #F0F4FA; color: #3B5888; border: 1px solid #C0B9DD; font-weight: 700; padding: 2px 8px; border-radius: 4px;">Sua etapa — Clique para abrir</span>
                            </div>
                            <div style="display: flex; gap: 24px; color: #475569; font-size: 0.78rem; flex-wrap: wrap;">
                                <span><strong style="color: #64748b;">Etapa:</strong> E${eNum} (${eNome})</span>
                                <span><strong style="color: #64748b;">Responsável:</strong> ${respCargo}</span>
                            </div>
                        </div>`;
                    }).join('');

                    trDet.innerHTML = `
                        <td colspan="10" style="padding: 6px 16px 14px 16px; background: #F7F4EA; border-bottom: 2px solid #DED9E2;">
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${boxes}
                            </div>
                        </td>
                    `;

                    if (ehProcessoMeioAmbiente) window.aplicarTermosAutoFiscalizacao(trDet);
                    tabelaBody.appendChild(trDet);
                }
            }
        }
    });
}

// ── Limpar Autofill Invasivo ────────────────────────────────
function limparAutofillInvasivoFiltros() {
    const elDesc = document.getElementById('filtroDescricao');
    if (!elDesc) return;

    const val = elDesc.value.trim();
    if (!val) return;

    const cpfUser = window.currentUserProfile?.cpf;
    const isCpfMatch = val.match(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/) || (cpfUser && val === cpfUser) || (val.replace(/\D/g, '').length === 11 && !isNaN(val.replace(/\D/g, '')));

    if (isCpfMatch) {
        elDesc.value = '';
    }
}

// ── Carregar opções de fiscais para o filtro ───────────────
async function carregarOpcoesFiscaisFiltro() {
    const sel = document.getElementById('filtroFiscal');
    if (!sel) return;

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('id, nome, cargo')
            .ilike('cargo', '%fiscal%')
            .order('nome', { ascending: true });

        if (error) throw error;

        sel.innerHTML = '<option value="">Todos os Fiscais</option>';

        if (data && data.length > 0) {
            data.forEach(p => {
                if (!p.nome) return;
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.nome;
                sel.appendChild(opt);
            });
        }
    } catch (err) {
        console.warn('Erro ao carregar lista de fiscais para filtro:', err);
    }
}

// ── Coletar valores dos filtros ─────────────────────────────
function coletarFiltros() {
    limparAutofillInvasivoFiltros();
    const elResp = document.getElementById('filtroResponsavel');
    const elFiscal = document.getElementById('filtroFiscal');
    return {
        protocolo: document.getElementById('filtroProtocolo')?.value.trim() || '',
        relatorio: document.getElementById('filtroRelatorio')?.value.trim() || '',
        auto: document.getElementById('filtroAuto')?.value.trim() || '',
        notificacao: document.getElementById('filtroNotificacao')?.value.trim() || '',
        nome: document.getElementById('filtroNome')?.value.trim() || '',
        cpf: document.getElementById('filtroCpf')?.value.trim() || '',
        codigoReduzido: document.getElementById('filtroCodigoReduzido')?.value.trim() || '',
        fiscal: elFiscal ? elFiscal.value : '',
        status: document.getElementById('filtroStatus')?.value || '',
        dataInicio: document.getElementById('filtroDataInicio')?.value || '',
        dataFim: document.getElementById('filtroDataFim')?.value || '',
        etapa: document.getElementById('filtroEtapa')?.value || '',
        situacao: document.getElementById('filtroSituacao')?.value || '',
        decreto: document.getElementById('filtroDecreto')?.value || '',
        prazo: document.getElementById('filtroPrazo')?.value || '',
        descricao: document.getElementById('filtroDescricao')?.value.trim() || '',
        criador: document.getElementById('filtroCriador')?.value || '',
        responsavel: elResp ? elResp.value : '',
        infracoes: Array.from(document.querySelectorAll('.chk-filtro-infracao:checked')).map(c => c.value)
    };
}

function montarTextoSituacaoCsv(item) {
    const porSituacao = item.situacoes_notificacoes;
    if (!porSituacao || Object.keys(porSituacao).length === 0) {
        return SITUACOES_PROCESSO[String(item.status || '').toLowerCase()] || item.status || '';
    }
    return Object.keys(porSituacao)
        .map(k => `${SITUACOES_PROCESSO[k] || k}${porSituacao[k] > 1 ? ` (${porSituacao[k]})` : ''}`)
        .join(' + ');
}

// ── Exportar CSV ────────────────────────────────────────────
function exportarCSV() {
    if (!dadosTabela || dadosTabela.length === 0) {
        alert('Nenhum dado para exportar.');
        return;
    }

    const headers = ['Protocolo', 'Código reduzido', 'CPF/CNPJ', 'Nome do contribuente', 'Data início', 'Data final', 'Dias p/ Vencimento', 'Fiscal', 'Situação', 'Etapa'];

    const rows = dadosTabela.map(item => {
        const cpfCnpj = item.dados?.contribuinte?.cpf_cnpj || item.dados?.cpf_cnpj_solicitante || '';
        const nome = item.dados?.contribuinte?.nome || item.dados?.nome_solicitante || '';
        const dataInicio = item.data_inicio_prazo ? formatarData(item.data_inicio_prazo) : '';
        const dataFinal = item.data_vencimento ? formatarData(item.data_vencimento) : '';
        const diasVenc = calcularDiasVencimento(item.data_vencimento);
        const profileObj = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        const nomeFiscal = profileObj?.nome || item.dados?.fiscal?.nome || item.dados?.fiscal_nome || item.dados?.fiscal?.fiscNome || '';
        const etapa = `${item.etapas?.numero || ''} - ${item.etapas?.nome || ETAPAS_MAP[item.etapas?.numero] || ''}`;

        return [
            item.numero_processo || '',
            item.dados?.imovel?.codigo_reduzido || '',
            cpfCnpj,
            nome,
            dataInicio,
            dataFinal,
            diasVenc === null ? '' : diasVenc,
            nomeFiscal,
            montarTextoSituacaoCsv(item),
            etapa
        ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `solicitacoes_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

// ── Utilidades de formatação ────────────────────────────────
function formatarData(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR');
}

// Dias entre hoje e o vencimento, contando por dia (como a página da etapa).
// null = sem prazo; negativo = vencido.
function calcularDiasVencimento(dataFinal) {
    if (!dataFinal) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const final = new Date(dataFinal);
    if (isNaN(final.getTime())) return null;
    final.setHours(0, 0, 0, 0);
    return Math.round((final - hoje) / (1000 * 60 * 60 * 24));
}

function montarBadgeDiasVencimento(dias) {
    if (dias === null) return '<span class="dias-badge">—</span>';
    if (dias < 0) {
        const n = Math.abs(dias);
        return `<span class="dias-badge urgente">Vencido há ${n} dia${n === 1 ? '' : 's'}</span>`;
    }
    if (dias === 0) return '<span class="dias-badge urgente">Vence hoje</span>';
    const classe = dias <= 5 ? 'urgente' : dias <= 15 ? 'alerta' : '';
    return `<span class="dias-badge ${classe}">${dias} dia${dias === 1 ? '' : 's'}</span>`;
}

function truncar(str, max) {
    if (!str || str === '—') return '—';
    return str.length > max ? str.slice(0, max) + '...' : str;
}

// ── Loading / Paginação / Contador ──────────────────────────
// ── Loading / Carregar Mais / Contador ──────────────────────────
function mostrarLoading(show) {
    if (loadingState) loadingState.style.display = show ? 'flex' : 'none';

    const btnPesquisar = document.getElementById('btnAplicarFiltros');
    if (btnPesquisar) {
        btnPesquisar.disabled = show;
        if (show) {
            if (!btnPesquisar.dataset.originalContent) {
                btnPesquisar.dataset.originalContent = btnPesquisar.innerHTML;
            }
            btnPesquisar.innerHTML = `
                <div class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-top-color: #ffffff; border-right-color: transparent; margin-right: 6px; display: inline-block; vertical-align: middle;"></div>
                <span>Carregando...</span>
            `;
        } else if (btnPesquisar.dataset.originalContent) {
            btnPesquisar.innerHTML = btnPesquisar.dataset.originalContent;
        }
    }
}

function mostrarLoadingCarregarMais(show) {
    const btn = document.getElementById('btnCarregarMais');
    if (!btn) return;
    btn.disabled = show;
    if (show) {
        if (!btn.dataset.originalContent) btn.dataset.originalContent = btn.innerHTML;
        btn.innerHTML = `<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; border-top-color: #ffffff; border-right-color: transparent; margin-right: 8px; display: inline-block; vertical-align: middle;"></div> Carregando mais...`;
    } else if (btn.dataset.originalContent) {
        btn.innerHTML = btn.dataset.originalContent;
    }
}

function atualizarContadorECarregarMais() {
    const btnCarregarMais = document.getElementById('btnCarregarMais');
    const msgFim = document.getElementById('msgFimRegistros');
    const totalSumCount = document.getElementById('totalSumCount');

    const totalLoaded = dadosTabela.length;

    if (totalLoaded === 0) {
        if (resultsCount) resultsCount.textContent = 'Nenhuma solicitação encontrada';
        if (btnCarregarMais) btnCarregarMais.style.display = 'none';
        if (msgFim) msgFim.style.display = 'none';
    } else {
        if (resultsCount) {
            const carregados = `${totalLoaded} processo${totalLoaded > 1 ? 's' : ''} carregado${totalLoaded > 1 ? 's' : ''}`;
            resultsCount.innerHTML = totalProcessosFiltro !== null
                ? `<strong>Total: ${totalProcessosFiltro} processo${totalProcessosFiltro === 1 ? '' : 's'}${rotuloDecretoFiltro}</strong> · ${carregados}`
                : carregados;
        }

        if (hasMoreRecords) {
            if (btnCarregarMais) btnCarregarMais.style.display = 'inline-flex';
            if (msgFim) msgFim.style.display = 'none';
        } else {
            if (btnCarregarMais) btnCarregarMais.style.display = 'none';
            if (msgFim) {
                msgFim.style.display = 'block';
                if (totalSumCount) totalSumCount.textContent = totalLoaded;
            }
        }
    }
}

// ── Bind de eventos ─────────────────────────────────────────
function bindEventos() {
    // Toggle filtros
    const btnToggleFilters = document.getElementById('btnToggleFilters');
    if (btnToggleFilters) {
        btnToggleFilters.addEventListener('click', () => {
            filtersPanel.classList.toggle('open');
            limparAutofillInvasivoFiltros();
            setTimeout(limparAutofillInvasivoFiltros, 100);
            setTimeout(limparAutofillInvasivoFiltros, 300);
        });
    }

    // Destaque de multa anexada: só repinta a tabela já carregada, sem ir ao banco
    const chkDestaqueMulta = document.getElementById('chkDestacarMultaAnexada');
    if (chkDestaqueMulta) {
        chkDestaqueMulta.addEventListener('change', () => {
            if (dadosTabela && dadosTabela.length > 0) {
                renderizarTabela(dadosTabela, coletarFiltros().responsavel);
            }
        });
    }

    // Pesquisar
    document.getElementById('btnAplicarFiltros').addEventListener('click', () => {
        carregarSolicitacoes(false);
    });

    // Limpar filtros
    document.getElementById('btnLimparFiltros').addEventListener('click', () => {
        if (document.getElementById('filtroProtocolo')) document.getElementById('filtroProtocolo').value = '';
        if (document.getElementById('filtroRelatorio')) document.getElementById('filtroRelatorio').value = '';
        if (document.getElementById('filtroAuto')) document.getElementById('filtroAuto').value = '';
        if (document.getElementById('filtroNotificacao')) document.getElementById('filtroNotificacao').value = '';
        if (document.getElementById('filtroNome')) document.getElementById('filtroNome').value = '';
        if (document.getElementById('filtroCpf')) document.getElementById('filtroCpf').value = '';
        if (document.getElementById('filtroCodigoReduzido')) document.getElementById('filtroCodigoReduzido').value = '';
        if (document.getElementById('filtroFiscal')) document.getElementById('filtroFiscal').value = '';
        if (document.getElementById('filtroDataInicio')) document.getElementById('filtroDataInicio').value = '';
        if (document.getElementById('filtroDataFim')) document.getElementById('filtroDataFim').value = '';
        if (document.getElementById('filtroEtapa')) document.getElementById('filtroEtapa').value = '';
        if (document.getElementById('filtroSituacao')) document.getElementById('filtroSituacao').value = '';
        if (document.getElementById('filtroDecreto')) document.getElementById('filtroDecreto').value = '';
        if (document.getElementById('filtroPrazo')) document.getElementById('filtroPrazo').value = '';
        if (document.getElementById('filtroDescricao')) document.getElementById('filtroDescricao').value = '';
        if (document.getElementById('filtroCriador')) document.getElementById('filtroCriador').value = '';
        const elResp = document.getElementById('filtroResponsavel');
        if (elResp) elResp.value = '';
        document.querySelectorAll('.chk-filtro-infracao:checked').forEach(c => c.checked = false);
        const chkMulta = document.getElementById('chkDestacarMultaAnexada');
        if (chkMulta) chkMulta.checked = false;
        window.atualizarLabelFiltroInfracao?.();
        carregarSolicitacoes(false);
    });

    // Dropdown do filtro "Tipo de Infração"
    const btnFiltroInfracao = document.getElementById('btnFiltroInfracao');
    const painelFiltroInfracao = document.getElementById('painelFiltroInfracao');
    const lblFiltroInfracao = document.getElementById('lblFiltroInfracao');
    if (btnFiltroInfracao && painelFiltroInfracao && lblFiltroInfracao) {
        window.atualizarLabelFiltroInfracao = () => {
            const marcadas = painelFiltroInfracao.querySelectorAll('.chk-filtro-infracao:checked').length;
            lblFiltroInfracao.textContent = marcadas === 0 ? 'Todas' : `${marcadas} selecionada${marcadas > 1 ? 's' : ''}`;
        };

        btnFiltroInfracao.addEventListener('click', (e) => {
            e.stopPropagation();
            const abrindo = painelFiltroInfracao.style.display === 'none';
            painelFiltroInfracao.style.display = abrindo ? 'block' : 'none';
            btnFiltroInfracao.classList.toggle('active', abrindo);
        });

        painelFiltroInfracao.addEventListener('click', (e) => e.stopPropagation());

        painelFiltroInfracao.addEventListener('change', (e) => {
            if (e.target.classList.contains('chk-filtro-infracao')) {
                window.atualizarLabelFiltroInfracao();
            }
        });

        document.addEventListener('click', () => {
            painelFiltroInfracao.style.display = 'none';
            btnFiltroInfracao.classList.remove('active');
        });
    }

    // Exportar CSV
    document.getElementById('btnExportCSV').addEventListener('click', exportarCSV);

    // Eventos Exclusivos DEV
    const chkSelectAll = document.getElementById('chkSelectAll');
    if (chkSelectAll) {
        chkSelectAll.addEventListener('change', (e) => {
            document.querySelectorAll('.chk-process').forEach(chk => {
                chk.checked = e.target.checked;
            });
            if (window.atualizarContagemSelecionados) window.atualizarContagemSelecionados();
        });
    }

    const btnExcluir = document.getElementById('btnExcluirSelecionados');
    if (btnExcluir) {
        btnExcluir.addEventListener('click', async () => {
            if (window.excluirProcessosSelecionados) await window.excluirProcessosSelecionados();
        });
    }

    // Botão Carregar Mais
    const btnCarregarMais = document.getElementById('btnCarregarMais');
    if (btnCarregarMais) {
        btnCarregarMais.addEventListener('click', () => {
            if (!isFetchingMore && hasMoreRecords) {
                carregarSolicitacoes(true);
            }
        });
    }

    // Enter nos campos de filtro para pesquisar
    document.querySelectorAll('.filters-grid input, .filters-grid select').forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                carregarSolicitacoes(false);
            }
        });
    });

    // Logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.href = 'index.html';
        });
    }

    // Eventos do Filtro de Apuração de Dados
    const btnFiltrarAp = document.getElementById('btnFiltrarApuracao');
    if (btnFiltrarAp) {
        btnFiltrarAp.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.carregarEExibirApuracaoDados === 'function') {
                window.carregarEExibirApuracaoDados();
            }
        });
    }

    ['apuracaoDataInicio', 'apuracaoDataFim'].forEach(idInput => {
        const inp = document.getElementById(idInput);
        if (inp) {
            inp.addEventListener('change', () => {
                if (typeof window.carregarEExibirApuracaoDados === 'function') {
                    window.carregarEExibirApuracaoDados();
                }
            });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (typeof window.carregarEExibirApuracaoDados === 'function') {
                        window.carregarEExibirApuracaoDados();
                    }
                }
            });
        }
    });

    // Navegação Menu Lateral (Processos / Ofícios / Instruções / Apuração / Configurações)
    const TITULOS_PAGINA = {
        solicitacoes: 'Painel de processos',
        oficios: 'Ofícios',
        instrucoes: 'Instruções',
        apuracao: 'Apuração de dados',
        configuracoes: 'Configurações'
    };

    document.querySelectorAll('.sidebar-nav a[data-page]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
            link.classList.add('active');

            const page = link.getAttribute('data-page');
            const secaoSolicitacoes = document.getElementById('secao-solicitacoes');
            const secaoConfiguracoes = document.getElementById('secao-configuracoes');
            const secaoApuracao = document.getElementById('secao-apuracao');
            const pageTitle = document.getElementById('pageTitle');
            const breadcrumb = document.querySelector('.header-breadcrumb');
            const headerActions = document.querySelector('.header-actions');

            // Esconde todas as seções antes de exibir a escolhida
            Object.keys(TITULOS_PAGINA).forEach(nome => {
                const secao = document.getElementById('secao-' + nome);
                if (secao) secao.style.display = 'none';
            });
            if (breadcrumb) breadcrumb.textContent = 'Painel / ' + (TITULOS_PAGINA[page] || 'Processos');

            if (page === 'instrucoes') {
                const secao = document.getElementById('secao-' + page);
                if (secao) secao.style.display = 'block';
                if (pageTitle) pageTitle.textContent = TITULOS_PAGINA[page];
                if (headerActions) headerActions.style.display = 'none';
                if (typeof window.renderizarInstrucoes === 'function') window.renderizarInstrucoes();
            } else if (page === 'oficios') {
                const secaoOficios = document.getElementById('secao-oficios');
                if (secaoOficios) secaoOficios.style.display = 'block';
                if (pageTitle) pageTitle.textContent = TITULOS_PAGINA[page];
                // A aba tem o próprio botão "Gerar Ofício" junto da lista
                if (headerActions) headerActions.style.display = 'none';
                if (typeof window.carregarListaOficios === 'function') window.carregarListaOficios();
            } else if (page === 'configuracoes') {
                if (secaoConfiguracoes) secaoConfiguracoes.style.display = 'block';
                if (pageTitle) pageTitle.textContent = 'Configurações';
                if (headerActions) headerActions.style.display = 'none';

                // Preencher header banner do perfil
                if (window.currentUserProfile) {
                    const nomeHeader = document.getElementById('perfilHeaderNome');
                    const cargoHeader = document.getElementById('perfilHeaderCargo');
                    const n = window.currentUserProfile.nome || 'Usuário';
                    if (nomeHeader) nomeHeader.textContent = n;
                    if (cargoHeader) cargoHeader.textContent = window.currentUserProfile.cargo || 'Fiscal de Postura';
                    aplicarAvatarUsuario(window.currentUserProfile, n);
                }
            } else if (page === 'apuracao') {
                if (secaoApuracao) secaoApuracao.style.display = 'block';
                if (pageTitle) pageTitle.textContent = 'Apuração de dados';
                if (headerActions) headerActions.style.display = 'none';

                // Carregar/Renderizar Apuração
                if (typeof window.carregarEExibirApuracaoDados === 'function') {
                    window.carregarEExibirApuracaoDados();
                }
            } else {
                if (secaoSolicitacoes) secaoSolicitacoes.style.display = 'block';
                if (pageTitle) pageTitle.textContent = 'Processos';
                if (headerActions) headerActions.style.display = 'flex';
            }
        });
    });

}

// ── Salvar Dados de Perfil / Configurações ──────────────────
async function salvarDadosPerfil() {
    const nome = document.getElementById('perfil-nome')?.value?.trim();
    const matricula = document.getElementById('perfil-matricula')?.value?.trim();

    if (!nome) {
        alert('Por favor, informe seu nome completo.');
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        alert('Sua sessão expirou. Faça login novamente.');
        return;
    }

    const profileId = window.currentUserProfile?.id || currentUserId;
    const updateObj = {
        nome: nome,
        matricula: matricula
    };

    let error;

    if (profileId) {
        const res = await supabaseClient
            .from('profiles')
            .update(updateObj)
            .eq('id', profileId);
        error = res.error;
    } else {
        // Se ainda não tinha ID, atualiza por auth_id ou cria novo
        const resUp = await supabaseClient
            .from('profiles')
            .update(updateObj)
            .eq('auth_id', session.user.id);

        error = resUp.error;
        if (!error && (!resUp.data || resUp.data.length === 0)) {
            const cpfLimpo = session.user.email ? session.user.email.split('@')[0].replace(/\D/g, '') : '00000000000';
            const cpfFormatado = cpfLimpo.length === 11
                ? cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
                : cpfLimpo;

            const resIns = await supabaseClient
                .from('profiles')
                .insert([{
                    auth_id: session.user.id,
                    cpf: cpfFormatado,
                    nome: nome,
                    matricula: matricula,
                    email: session.user.email
                }]);
            error = resIns.error;
        }
    }

    if (error) {
        console.error('Erro ao salvar perfil:', error);
        alert('Erro ao atualizar o perfil: ' + error.message);
    } else {
        alert('Alterações salvas com sucesso!');
        await verificarSessao();
    }
}

// ── Funções de Avatar e Alteração de Senha ─────────────────────────────────
function aplicarAvatarUsuario(usuario, nomeExibicao) {
    const avatarSidebar = document.querySelector('.user-avatar');
    const avatarBox = document.getElementById('perfilAvatarBox');
    const initials = (nomeExibicao || 'Usuário').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const key = 'user_avatar_' + (usuario?.id || 'default');
    const savedAvatar = usuario?.avatar_url || localStorage.getItem(key);

    if (savedAvatar) {
        if (avatarSidebar) {
            avatarSidebar.style.backgroundImage = `url(${savedAvatar})`;
            avatarSidebar.style.backgroundSize = 'cover';
            avatarSidebar.style.backgroundPosition = 'center';
            avatarSidebar.textContent = '';
        }
        if (avatarBox) {
            avatarBox.style.backgroundImage = `url(${savedAvatar})`;
            avatarBox.style.backgroundSize = 'cover';
            avatarBox.style.backgroundPosition = 'center';
            avatarBox.textContent = '';
        }
    } else {
        if (avatarSidebar) {
            avatarSidebar.style.backgroundImage = 'none';
            avatarSidebar.textContent = initials;
        }
        if (avatarBox) {
            avatarBox.style.backgroundImage = 'none';
            avatarBox.textContent = initials;
        }
    }
}

async function alterarFotoPerfil(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const img = new Image();
        img.onload = async function () {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 150;
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            // A foto (já reduzida) vai para o Cloudinary; o perfil guarda só o link.
            const blobAvatar = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
            const urlAvatar = (blobAvatar && typeof window.uploadParaCloudinary === 'function')
                ? await window.uploadParaCloudinary(new File([blobAvatar], 'avatar.jpg', { type: 'image/jpeg' }), 'avatares')
                : null;
            if (typeof urlAvatar !== 'string' || !/^https?:\/\//i.test(urlAvatar)) {
                alert('Não foi possível enviar a foto de perfil. Tente de novo.');
                return;
            }

            const profileId = window.currentUserProfile?.id;
            const key = 'user_avatar_' + (profileId || 'default');
            try { localStorage.setItem(key, urlAvatar); } catch (eLs) { /* sem armazenamento local */ }

            if (window.currentUserProfile) {
                window.currentUserProfile.avatar_url = urlAvatar;
                if (profileId) {
                    await supabaseClient.from('profiles').update({ avatar_url: urlAvatar }).eq('id', profileId);
                } else if (window.currentUserProfile.auth_id) {
                    await supabaseClient.from('profiles').update({ avatar_url: urlAvatar }).eq('auth_id', window.currentUserProfile.auth_id);
                } else if (window.currentUserProfile.cpf) {
                    await supabaseClient.from('profiles').update({ avatar_url: urlAvatar }).eq('cpf', window.currentUserProfile.cpf);
                }
            }
            aplicarAvatarUsuario(window.currentUserProfile || {}, document.getElementById('perfilHeaderNome')?.textContent || 'FP');
            alert('Foto de perfil alterada com sucesso!');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function alterarSenhaUsuario() {
    const novaSenha = document.getElementById('perfilNovaSenha')?.value;
    const confirmaSenha = document.getElementById('perfilConfirmaSenha')?.value;

    if (!novaSenha || novaSenha.length < 6) {
        alert('A nova senha deve ter no mínimo 6 caracteres.');
        return;
    }
    if (novaSenha !== confirmaSenha) {
        alert('As senhas digitadas não coincidem.');
        return;
    }

    try {
        const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });
        if (error) {
            alert('Erro ao alterar senha: ' + error.message);
        } else {
            alert('Senha alterada com sucesso!');
            document.getElementById('perfilNovaSenha').value = '';
            document.getElementById('perfilConfirmaSenha').value = '';
        }
    } catch (err) {
        console.error('Erro na alteração de senha:', err);
        alert('Erro ao atualizar senha.');
    }
}

/* ── Central de Notificações no Painel ───────────────────── */
window.toggleDropdownNotificacoesPainel = function () {
    const dropdown = document.getElementById('dropdownNotificacoesPainel');
    if (!dropdown) return;
    if (dropdown.style.display === 'none' || !dropdown.style.display) {
        dropdown.style.display = 'block';
        window.atualizarInterfaceNotificacoesPainel();
    } else {
        dropdown.style.display = 'none';
    }
};

// Notificação direcionada (destinatario_id) só vale para aquela pessoa;
// as demais seguem o filtro por cargo.
function notificacaoEhParaMim(n) {
    const usrLogado = window.currentUserProfile || window.perfilAtual || null;
    if (n.destinatario_id) return !!usrLogado?.id && n.destinatario_id === usrLogado.id;
    const meuCargo = usrLogado?.cargo ? normalizarCargo(usrLogado.cargo) : null;
    if (n.destinatario_cargo && meuCargo) return normalizarCargo(n.destinatario_cargo) === meuCargo;
    return true;
}

// ── Sincronização automática do sino ─────────────────────────────────────
// Busca os processos alterados desde a última verificação e atualiza o sino.
//
// A consulta é feita em DUAS ETAPAS de propósito:
//   1ª) descobre QUAIS processos mudaram lendo só `id` e `updated_at`, colunas
//       pequenas, sem encostar em `dados`;
//   2ª) só então lê o menu de notificações das poucas linhas que interessam.
//
// Pedir `dados->notificacoes_menu` direto obriga o Postgres a descomprimir a
// coluna `dados` INTEIRA (que guarda anexos em base64, com processos de até
// 14 MB) de cada linha que casar com o filtro — é a mesma armadilha já
// documentada em carregarSolicitacoes. Em produção esta era disparadamente a
// consulta mais cara do banco: 508 chamadas somando 121s, com picos de 7s.
const INTERVALO_NOTIFICACOES_PAINEL_MS = 30000;
// Sem interação nenhuma por este tempo, o polling para até a pessoa voltar.
// `document.hidden` não cobre o caso mais comum: a aba fica em primeiro plano
// e a pessoa sai para almoçar — o navegador não suspende esses timers.
const INATIVIDADE_MAXIMA_PAINEL_MS = 5 * 60 * 1000;

let pollingNotificacoesPainel = null;
let sincronizandoNotificacoes = false;
let ultimaInteracaoUsuario = Date.now();
// Até onde já verificamos. Precisa ser guardado à parte de dadosTabela: se o
// marco saísse sempre das linhas em tela, um processo alterado que não está na
// página atual manteria o filtro parado no passado e a mesma leva voltaria em
// toda sincronização, para sempre.
let marcoSincronizacaoNotificacoes = null;

function registrarInteracaoUsuario() {
    const estavaOcioso = Date.now() - ultimaInteracaoUsuario > INATIVIDADE_MAXIMA_PAINEL_MS;
    ultimaInteracaoUsuario = Date.now();
    if (estavaOcioso) sincronizarNotificacoesPainel();
}

async function sincronizarNotificacoesPainel() {
    if (document.hidden || sincronizandoNotificacoes || !dadosTabela || dadosTabela.length === 0) return;
    if (Date.now() - ultimaInteracaoUsuario > INATIVIDADE_MAXIMA_PAINEL_MS) return;

    if (!marcoSincronizacaoNotificacoes) {
        marcoSincronizacaoNotificacoes = dadosTabela.reduce((max, i) => (i.updated_at && i.updated_at > max ? i.updated_at : max), '');
    }
    if (!marcoSincronizacaoNotificacoes) return;

    sincronizandoNotificacoes = true;
    try {
        // 1ª etapa: colunas pequenas. No caso comum volta vazia e acaba aqui.
        // Ordem crescente: se houver mais alterações do que o limite, o marco
        // avança até a última desta leva e a próxima verificação pega o resto,
        // em vez de pular o que ficou para trás.
        const { data: alterados, error } = await supabaseClient
            .from('processos')
            .select('id, updated_at')
            .gt('updated_at', marcoSincronizacaoNotificacoes)
            .order('updated_at', { ascending: true })
            .limit(100);

        if (error || !alterados || alterados.length === 0) return;

        // O marco avança mesmo para processos fora da tela, senão eles voltariam
        // em toda verificação sem nunca sair do filtro.
        marcoSincronizacaoNotificacoes = alterados.reduce(
            (max, p) => (p.updated_at && p.updated_at > max ? p.updated_at : max),
            marcoSincronizacaoNotificacoes
        );

        const idsVisiveis = alterados
            .filter(p => dadosTabela.some(i => i.id === p.id))
            .map(p => p.id);
        if (idsVisiveis.length === 0) return;

        // 2ª etapa: agora sim lê `dados`, e só das linhas que estão na tela
        const { data: menus } = await supabaseClient
            .from('processos')
            .select('id, updated_at, notificacoes_menu:dados->notificacoes_menu')
            .in('id', idsVisiveis);

        let mudou = false;
        (menus || []).forEach(p => {
            const item = dadosTabela.find(i => i.id === p.id);
            if (!item) return;
            item.updated_at = p.updated_at;
            item.dados = item.dados || {};
            const novas = p.notificacoes_menu || [];
            if (JSON.stringify(novas) !== JSON.stringify(item.dados.notificacoes_menu || [])) {
                item.dados.notificacoes_menu = novas;
                mudou = true;
            }
        });

        if (mudou && window.atualizarInterfaceNotificacoesPainel) window.atualizarInterfaceNotificacoesPainel();
    } catch (err) {
        console.warn('Erro ao sincronizar notificações do painel:', err);
    } finally {
        sincronizandoNotificacoes = false;
    }
}

function iniciarSincronizacaoNotificacoesPainel() {
    if (pollingNotificacoesPainel) return;
    pollingNotificacoesPainel = setInterval(sincronizarNotificacoesPainel, INTERVALO_NOTIFICACOES_PAINEL_MS);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) registrarInteracaoUsuario();
    });

    // Qualquer sinal de que tem alguém ali mantém a sincronização viva
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(evento => {
        document.addEventListener(evento, registrarInteracaoUsuario, { passive: true });
    });
}

// Lista exibida no sino. Guarda as mesmas referências de item.dados.notificacoes_menu,
// para que as ações localizem a notificação certa mesmo com a lista filtrada e ordenada.
let notificacoesPainelVisiveis = [];

function localizarNotificacaoPainel(idx) {
    const n = notificacoesPainelVisiveis[idx];
    if (!n) return null;
    for (const item of (dadosTabela || [])) {
        const pos = (item?.dados?.notificacoes_menu || []).indexOf(n);
        if (pos >= 0) return { item, pos, n };
    }
    return null;
}

window.atualizarInterfaceNotificacoesPainel = function () {
    const listDiv = document.getElementById('listaNotificacoesMenuPainel');
    const badgeEl = document.getElementById('badgeContadorNotificacoesPainel');
    if (!listDiv) return;

    let todanotifs = [];

    (dadosTabela || []).forEach(item => {
        const procNotifs = item?.dados?.notificacoes_menu || [];
        procNotifs.forEach(n => {
            if (notificacaoEhParaMim(n)) todanotifs.push(n);
        });
        (item?.notificacoes || []).forEach(notif => {
            const subNotifs = notif?.dados?.notificacoes_menu || [];
            subNotifs.forEach(n => {
                if (notificacaoEhParaMim(n)) todanotifs.push(n);
            });
        });
    });

    todanotifs.sort((a, b) => new Date(b.created_at || b.data || 0) - new Date(a.created_at || a.data || 0));
    notificacoesPainelVisiveis = todanotifs;

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
                <span style="font-size: 0.72rem; color: #94a3b8;">${n.created_at ? new Date(n.created_at).toLocaleDateString('pt-BR') : (n.data ? new Date(n.data).toLocaleDateString('pt-BR') : '')}</span>
            </div>
            <p style="margin: 0 0 6px 0; font-size: 0.82rem; color: #475569; line-height: 1.4;">${n.mensagem}</p>
            ${n.motivo ? `<div style="background:#f8fafc; border:1px solid #cbd5e1; padding:8px 12px; border-radius:6px; font-size:0.8rem; color:#334155; margin-bottom:8px;"><strong>Motivo do Gerente:</strong> ${n.motivo}</div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <span style="font-size:0.75rem; font-weight:600; color:#2563eb;">Proc: ${n.numero_processo || ''}</span>
                <div style="display:flex; gap:6px;">
                    ${n.processo_id ? `<button type="button" onclick="window.abrirNotificacaoEPromoverLida('${n.processo_id}', '${n.notificacao_id || ''}', ${idx})" style="background:#2563eb; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">Ver Processo</button>` : ''}
                    <button type="button" onclick="window.removerNotificacaoPainel('${n.processo_id || ''}', ${idx})" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; cursor:pointer;" title="Excluir notificação">Excluir</button>
                </div>
            </div>
        </div>
        `;
    });
    listDiv.innerHTML = html;
};

window.abrirNotificacaoEPromoverLida = async function (processoId, notificacaoId, idx) {
    let eChatJuridico = false;
    let itemAlterado = null;

    if (idx !== undefined) {
        // Veio do sino: marca só a notificação clicada
        const alvo = localizarNotificacaoPainel(idx);
        if (alvo) {
            eChatJuridico = alvo.n.tipo === 'chat_juridico';
            alvo.n.lida = true;
            itemAlterado = alvo.item;
        }
    } else {
        // Veio da tabela: marca como lidas as notificações deste processo que são do usuário
        const item = (dadosTabela || []).find(i => i.id === processoId);
        (item?.dados?.notificacoes_menu || []).forEach(n => {
            if (!notificacaoEhParaMim(n)) return;
            if (n.tipo === 'chat_juridico') eChatJuridico = true;
            n.lida = true;
            itemAlterado = item;
        });
    }

    if (itemAlterado) {
        try {
            await supabaseClient.rpc('atualizar_notificacoes_processo', {
                p_processo_id: itemAlterado.id,
                p_notificacoes: itemAlterado.dados.notificacoes_menu
            });
        } catch (e) {
            console.error('Erro ao marcar notificação como lida:', e);
        }
    }

    let url = `etapa.html?processo=${processoId}`;
    if (notificacaoId && String(notificacaoId).trim() !== '' && String(notificacaoId) !== 'undefined' && String(notificacaoId) !== 'null') {
        url += `&notificacao=${notificacaoId}`;
    }
    if (eChatJuridico) {
        url += `&chat=1`;
    }
    window.location.href = url;
};

window.marcarTodasNotificacoesLidasPainel = async function () {
    (dadosTabela || []).forEach(async (item) => {
        if (item?.dados?.notificacoes_menu) {
            let alterou = false;
            item.dados.notificacoes_menu.forEach(n => {
                if (!n.lida && notificacaoEhParaMim(n)) {
                    n.lida = true;
                    alterou = true;
                }
            });
            if (alterou && item.id) {
                try {
                    await supabaseClient.rpc('atualizar_notificacoes_processo', {
                        p_processo_id: item.id,
                        p_notificacoes: item.dados.notificacoes_menu
                    });
                } catch (e) {
                    console.error('Erro ao atualizar processo:', e);
                }
            }
        }
    });
    window.atualizarInterfaceNotificacoesPainel();
};

window.limparAntigasNotificacoesPainel = async function () {
    (dadosTabela || []).forEach(async (item) => {
        if (item?.dados?.notificacoes_menu) {
            const antes = item.dados.notificacoes_menu.length;
            // Remove só as lidas que são do usuário; as de outras pessoas/cargos ficam
            item.dados.notificacoes_menu = item.dados.notificacoes_menu.filter(n => !(n.lida && notificacaoEhParaMim(n)));
            if (item.dados.notificacoes_menu.length !== antes && item.id) {
                try {
                    await supabaseClient.rpc('atualizar_notificacoes_processo', {
                        p_processo_id: item.id,
                        p_notificacoes: item.dados.notificacoes_menu
                    });
                } catch (e) {
                    console.error('Erro ao atualizar processo:', e);
                }
            }
        }
    });
    window.atualizarInterfaceNotificacoesPainel();
};

window.removerNotificacaoPainel = async function (processoId, idx) {
    const alvo = localizarNotificacaoPainel(idx);
    if (alvo) {
        alvo.item.dados.notificacoes_menu.splice(alvo.pos, 1);
        try {
            await supabaseClient.rpc('atualizar_notificacoes_processo', {
                p_processo_id: alvo.item.id,
                p_notificacoes: alvo.item.dados.notificacoes_menu
            });
        } catch (e) {
            console.error('Erro ao excluir notificação:', e);
        }
    }
    window.atualizarInterfaceNotificacoesPainel();
};

document.addEventListener('click', function (e) {
    const btn = document.getElementById('btnMenuNotificacoesPainel');
    const dropdown = document.getElementById('dropdownNotificacoesPainel');
    if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// ── Funções Exclusivas DEV: Seleção e Exclusão em Lote ─────────────────────────────
window.atualizarContagemSelecionados = function () {
    const chks = document.querySelectorAll('.chk-process:checked');
    const lbl = document.getElementById('lblSelecionados');
    if (lbl) {
        lbl.textContent = `${chks.length} selecionado${chks.length !== 1 ? 's' : ''}`;
    }
};

// Junta todas as numerações de um processo que precisam voltar para a fila
// (numeros_descartados) quando ele é excluído. Precisa rodar ANTES da exclusão,
// porque autos, documentos e notificações somem junto com o processo.
async function coletarNumerosParaDevolver(pItem) {
    const pid = pItem.id;
    const lista = [];
    const vistos = new Set();
    const add = (numero, categoria) => {
        const n = String(numero || '').trim();
        if (!n || !categoria) return;
        const chave = `${categoria}|${n}`;
        if (vistos.has(chave)) return;
        vistos.add(chave);
        lista.push({ numero: n, categoria });
    };

    // 1. Número do Processo e do Relatório
    add(pItem.numero_processo, 'Processo');
    add(pItem.dados?.relatorio_fiscal?.numero_relatorio || pItem.numero_relatorio || pItem.dados?.numero_relatorio, 'Relatório Fiscal');

    // 2. Notificações NÃO têm numeração própria reservada (reservar_numero nunca é
    // chamado com categoria 'Notificação') — o campo `numero` de cada notificação é
    // só "{numero_processo}/NN" (ver etapa.js). Por isso não devolvemos nada aqui:
    // devolver esse valor sob a categoria 'Notificação' reinseria o número do
    // PROCESSO (já devolvido acima como 'Processo') sob a categoria errada.

    // 3. Autos de Infração
    const { data: autos } = await supabaseClient.from('autos_infracao').select('numero').eq('processo_id', pid);
    (autos || []).forEach(a => add(a.numero, 'Auto de Infração'));

    // 4. Documentos com numeração própria (Certidão, Réplica, Ofício GFP da Etapa 15...)
    const { data: docs } = await supabaseClient.from('documentos').select('numero_sequencial, tipo').eq('processo_id', pid).not('numero_sequencial', 'is', null);
    (docs || []).forEach(d => {
        let cat = d.tipo;
        if (cat === 'Relatório Fiscal Assinado') cat = 'Relatório Fiscal';
        else if (cat === 'Auto de Infração Assinado') cat = 'Auto de Infração';
        else if (cat === 'Notificação Preliminar Assinada' || cat === 'Notificação Preliminar') cat = 'Notificação';
        else if (cat === 'Certidão Assinada') cat = 'Certidão Sem Defesa';
        add(d.numero_sequencial, cat);
    });

    // 5. Ofício GFP da Etapa 15: o número também fica em dados.numero_oficio_gfp
    // (do processo ou de cada notificação). Pega daqui também, para o caso de a
    // linha em documentos não ter sido gravada — senão o número nunca voltaria.
    add(pItem.dados?.numero_oficio_gfp, 'Ofício GFP');
    const { data: notifs } = await supabaseClient.from('notificacoes').select('numero_oficio_gfp:dados->>numero_oficio_gfp').eq('processo_id', pid);
    (notifs || []).forEach(n => add(n.numero_oficio_gfp, 'Ofício GFP'));

    return lista;
}

window.excluirProcessosSelecionados = async function () {
    const chks = document.querySelectorAll('.chk-process:checked');
    if (chks.length === 0) {
        alert('Nenhum processo selecionado para exclusão.');
        return;
    }

    if (!confirm(`Tem certeza que deseja EXCLUIR DEFINITIVAMENTE ${chks.length} processo(s)?\n\nATENÇÃO: Esta ação é irreversível. O sistema apagará todos os dados anexados e devolverá todas as numerações (protocolo, relatório, Autos, Certidões, Ofícios GFP) para a tabela de números descartados.`)) {
        return;
    }

    mostrarLoading(true);
    let excluidos = 0;

    try {
        for (let i = 0; i < chks.length; i++) {
            const pid = chks[i].getAttribute('data-id');
            const pItem = dadosTabela.find(p => p.id === pid);
            if (!pItem) continue;

            console.log(`[EXCLUSÃO LOTE DEV] Processando exclusão do processo ${pid}`);

            // Ordem: junta os números, apaga o processo e SÓ DEPOIS devolve os números.
            // Se devolvesse antes, um reservar_numero feito no intervalo tiraria o
            // número da fila, veria que ainda consta como usado e o descartaria de vez
            // (mesma regra do ofício avulso, em oficio-avulso.js). E se a exclusão
            // falhar, nada é devolvido — o número continua com o processo.
            const numeros = await coletarNumerosParaDevolver(pItem);

            // Exclusão em cascata (o banco apaga processo_infracoes, notificacoes,
            // historico_etapas, documentos, autos_infracao...)
            const { error: errDel } = await supabaseClient.from('processos').delete().eq('id', pid);

            if (errDel) {
                console.error(`Erro ao excluir processo ${pid}:`, errDel);
                continue;
            }
            excluidos++;

            for (const { numero, categoria } of numeros) {
                const { error: errDev } = await supabaseClient
                    .rpc('devolver_numero', { p_numero: numero, p_categoria: categoria });
                // Falhar aqui só deixa um buraco na sequência; não gera repetição
                if (errDev) console.warn(`[EXCLUSÃO] ${categoria} ${numero} não devolvido à fila:`, errDev.message);
            }
        }

        alert(`${excluidos} processo(s) excluído(s) com sucesso. As numerações foram devolvidas para os descartes.`);
        const chkAll = document.getElementById('chkSelectAll');
        if (chkAll) chkAll.checked = false;
        window.atualizarContagemSelecionados();

        carregarSolicitacoes();
    } catch (err) {
        console.error('Erro na exclusão em lote:', err);
        alert('Erro ao excluir processos em lote.');
    } finally {
        mostrarLoading(false);
    }
};

// ============================================================================
// APURAÇÃO DE DADOS EXECUTIVA (SECRETÁRIO E DEV)
// ============================================================================

function verificarEExibirTabApuracao(usuario) {
    const tabApuracao = document.getElementById('tab-apuracao');
    if (!tabApuracao) return;

    const cargoRaw = usuario?.cargo || '';
    const cargoNorm = (typeof normalizarCargo === 'function') ? normalizarCargo(cargoRaw) : cargoRaw;

    // Apenas cargo Secretário(a) ou Dev tem permissão
    const ehSecretarioOuDev = (cargoNorm === 'Secretário' || cargoNorm === 'Dev');

    if (ehSecretarioOuDev) {
        tabApuracao.style.display = 'flex';
    } else {
        tabApuracao.style.display = 'none';
    }
}

window.verificarEExibirTabApuracao = verificarEExibirTabApuracao;

let chartProcessosInst = null;
let chartMultasInst = null;
let chartPizzaArrecadacaoInst = null;

// Pizza da arrecadação: cores categóricas validadas (contraste e daltonismo)
// em ordem fixa, uma por fatia; "Outros" em cinza claro, que recua. No máximo
// 6 fatias: além disso as fatias pequenas não se comparam a olho.
const CORES_PIZZA_ARRECADACAO = ['#79d8b7', '#6cc0da', '#9d87ec', '#df7fe7', '#ec9797'];
const COR_PIZZA_OUTROS = '#cbd5e1';
const FATIAS_PIZZA_COM_NOME = 5;

function inicializarDatasApuracao() {
    const elInicio = document.getElementById('apuracaoDataInicio');
    const elFim = document.getElementById('apuracaoDataFim');

    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');

    if (elInicio && !elInicio.value) {
        elInicio.value = `${ano}-${mes}-01`;
    }
    if (elFim && !elFim.value) {
        elFim.value = `${ano}-${mes}-${dia}`;
    }
}

window.inicializarDatasApuracao = inicializarDatasApuracao;

window.carregarEExibirApuracaoDados = async function () {
    inicializarDatasApuracao();

    const elTabelaBody = document.getElementById('tabelaApuracaoFiscaisBody');
    if (elTabelaBody) {
        elTabelaBody.innerHTML = `
            <tr>
                <td colspan="5" style="padding: 24px; text-align: center; color: #64748b;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                        Carregando apuração gerencial do banco de dados...
                    </div>
                </td>
            </tr>
        `;
    }

    try {
        const dInicio = document.getElementById('apuracaoDataInicio')?.value;
        const dFim = document.getElementById('apuracaoDataFim')?.value;

        let todosProcessos = [];
        let offset = 0;
        const limitBatch = 100;
        let temMais = true;

        // processos.valor_total_multas: soma dos Autos
        // gravada pelo banco. Sem a coluna, a apuração usa o cálculo antigo.
        const { error: errColunaTotal } = await supabaseClient
            .from('processos')
            .select('valor_total_multas')
            .limit(1);
        const temValorTotalMultas = !errColunaTotal;
        if (!temValorTotalMultas) {
            console.warn('[APURAÇÃO] processos.valor_total_multas não existe. Usando o cálculo antigo.');
        }

        // Com valor_total_multas, só o nome/matrícula do fiscal saem do JSON (e só
        // como texto): dados->campos e dados->fiscal ainda guardam anexos em base64
        // e fazem a consulta estourar o tempo limite.
        const selectApuracao = temValorTotalMultas
            ? `
                    id,
                    numero_processo,
                    status,
                    passou_auto_infracao,
                    etapa_atual_id,
                    created_at,
                    fiscal_id,
                    valor_total_multas,
                    fiscal_nome:dados->fiscal->>nome,
                    fiscal_matricula:dados->fiscal->>matricula,
                    campos_fiscal_nome:dados->campos->fiscal->>nome,
                    campos_fiscal_matricula:dados->campos->fiscal->>matricula
                `
            : `
                    id,
                    numero_processo,
                    status,
                    passou_auto_infracao,
                    etapa_atual_id,
                    created_at,
                    fiscal_id,
                    campos:dados->campos,
                    etapa14:dados->etapa14,
                    etapa15:dados->etapa15,
                    solicitacao:dados->solicitacao,
                    infracoes:dados->infracoes,
                    fiscal_dados:dados->fiscal,
                    multa_valor:dados->multa_valor,
                    valor_multa:dados->valor_multa,
                    multas_customizadas:dados->multas_customizadas
                `;

        while (temMais) {
            let query = supabaseClient
                .from('processos')
                .select(selectApuracao);

            if (dInicio) query = query.gte('created_at', dInicio + 'T00:00:00');
            if (dFim) query = query.lte('created_at', dFim + 'T23:59:59');

            const { data: lote, error } = await query
                .range(offset, offset + limitBatch - 1)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('[APURAÇÃO] Erro ao carregar processos:', error);
                if (elTabelaBody) elTabelaBody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #ef4444;">Erro ao carregar dados do banco de dados.</td></tr>`;
                return;
            }

            if (lote && lote.length > 0) {
                todosProcessos.push(...lote);
                if (lote.length < limitBatch) {
                    temMais = false;
                } else {
                    offset += limitBatch;
                }
            } else {
                temMais = false;
            }
        }

        // Carregar dados de perfis de forma otimizada
        const apuracaoFiscalIds = [...new Set(todosProcessos.map(p => p.fiscal_id).filter(Boolean))];
        let apuracaoProfilesMap = {};
        if (apuracaoFiscalIds.length > 0) {
            try {
                const { data: profs } = await supabaseClient
                    .from('profiles')
                    .select('id, nome, matricula, cargo')
                    .in('id', apuracaoFiscalIds);
                if (profs) {
                    profs.forEach(pr => apuracaoProfilesMap[pr.id] = pr);
                }
            } catch (eP) {
                console.warn('[APURAÇÃO] Erro ao carregar perfis de fiscais:', eP);
            }
        }

        const procs = todosProcessos;

        // Quantidade de Autos com valor em cada processo (coluna "Multas Geradas")
        const autosComValorPorProcesso = {};
        if (temValorTotalMultas) {
            const ids = procs.map(p => p.id);
            for (let i = 0; i < ids.length; i += 100) {
                const { data: autosLote, error: errAutos } = await supabaseClient
                    .from('autos_infracao')
                    .select('processo_id')
                    .in('processo_id', ids.slice(i, i + 100))
                    .gt('valor_multa', 0);
                if (errAutos) {
                    console.warn('[APURAÇÃO] Erro ao contar os Autos:', errAutos);
                    break;
                }
                (autosLote || []).forEach(a => {
                    autosComValorPorProcesso[a.processo_id] = (autosComValorPorProcesso[a.processo_id] || 0) + 1;
                });
            }
        }

        const fiscaisMap = {};

        let globalTotalProcessos = procs.length;
        let globalTotalMultasValor = 0;
        let globalQtdMultas = 0;

        procs.forEach(p => {
            const profileObj = (p.fiscal_id && apuracaoProfilesMap[p.fiscal_id]) || p.profiles || {};
            const fiscalNome = profileObj.nome || p.fiscal_dados?.nome || p.campos?.fiscal?.nome
                || p.fiscal_nome || p.campos_fiscal_nome || 'Fiscal não atribuído';
            const fiscalIdKey = p.fiscal_id || profileObj.id || fiscalNome;
            const matricula = profileObj.matricula || p.fiscal_dados?.matricula || p.campos?.fiscal?.matricula
                || p.fiscal_matricula || p.campos_fiscal_matricula || '---';

            if (!fiscaisMap[fiscalIdKey]) {
                fiscaisMap[fiscalIdKey] = {
                    nome: fiscalNome,
                    matricula: matricula,
                    totalProcessos: 0,
                    qtdMultas: 0,
                    valorMultas: 0
                };
            }

            fiscaisMap[fiscalIdKey].totalProcessos += 1;

            // Valor gravado pelo banco: soma dos Autos de Infração do processo
            if (temValorTotalMultas) {
                const valorTotal = Number(p.valor_total_multas) || 0;
                if (valorTotal > 0) {
                    const qtdAutos = autosComValorPorProcesso[p.id] || 1;
                    fiscaisMap[fiscalIdKey].qtdMultas += qtdAutos;
                    fiscaisMap[fiscalIdKey].valorMultas += valorTotal;
                    globalTotalMultasValor += valorTotal;
                    globalQtdMultas += qtdAutos;
                }
                return;
            }

            let valMultaProc = 0;

            // 1. Verificar valores diretos de multa
            if (p.multa_valor) {
                valMultaProc = parseFloat(p.multa_valor) || 0;
            } else if (p.valor_multa) {
                valMultaProc = parseFloat(p.valor_multa) || 0;
            } else if (p.campos?.valor_multa) {
                valMultaProc = parseFloat(p.campos.valor_multa) || 0;
            } else if (p.campos?.multa_valor) {
                valMultaProc = parseFloat(p.campos.multa_valor) || 0;
            }

            // 2. Verificar multas customizadas (Array, Objeto ou Valor individual)
            if (valMultaProc === 0) {
                const custom = p.multas_customizadas || p.campos?.multas_customizadas;
                if (custom) {
                    if (Array.isArray(custom)) {
                        valMultaProc = custom.reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
                    } else if (typeof custom === 'object') {
                        valMultaProc = Object.values(custom).reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
                    } else if (typeof custom === 'number' || typeof custom === 'string') {
                        valMultaProc = parseFloat(custom) || 0;
                    }
                }
            }

            // 3. Verificar dados específicos das etapas de multa (Etapa 15 ou 14)
            if (valMultaProc === 0) {
                if (p.etapa15?.valor_multa || p.etapa15?.multa_valor) {
                    valMultaProc = parseFloat(p.etapa15.valor_multa || p.etapa15.multa_valor) || 0;
                } else if (p.etapa14?.valor_multa || p.etapa14?.multa_valor) {
                    valMultaProc = parseFloat(p.etapa14.valor_multa || p.etapa14.multa_valor) || 0;
                }
            }

            // 4. Se o processo está em Etapa 14+ (Auto de Infração em diante) ou possui multa gerada
            // Não usa mais "etapa >= 14": as Etapas 16, 17 e 30 também recebem processos
            // que ainda estão em Notificação Preliminar. passou_auto_infracao continua
            // true mesmo depois de encerrado/cancelado, então a multa não se perde.
            const temAutoOuMulta = (p.passou_auto_infracao === true || p.status === 'auto_infracao' || p.etapa14 || p.etapa15);
            if (valMultaProc === 0 && temAutoOuMulta) {
                if (typeof window.obterDadosLegaisEValoresAuto === 'function') {
                    try {
                        const infracaoDesc = p.infracoes?.descricao || p.solicitacao?.infracao || p.campos?.infracao || p.fiscal_dados?.infracao || '';
                        const fiscObj = p.fiscal_dados || p.campos?.fiscal || {};
                        const pFake = {
                            ...p,
                            campos: p.campos || {},
                            dados: {
                                campos: p.campos || {},
                                infracoes: p.infracoes,
                                fiscal: fiscObj
                            }
                        };
                        const resLegais = window.obterDadosLegaisEValoresAuto(infracaoDesc, fiscObj, pFake);
                        if (resLegais && resLegais.valMultaFinal && resLegais.valMultaFinal > 0) {
                            valMultaProc = parseFloat(resLegais.valMultaFinal);
                        } else if (resLegais && resLegais.valFormatado) {
                            const valParsed = parseFloat(resLegais.valFormatado.replace(/\./g, '').replace(',', '.'));
                            if (!isNaN(valParsed) && valParsed > 0) {
                                valMultaProc = valParsed;
                            }
                        }
                    } catch (e) {
                        console.warn('[APURAÇÃO] Erro ao calcular valor legal da multa:', e);
                    }
                }

                // Fallback legal padrão (10 UPFMDs ~ R$ 1.050,00 se o cálculo retornar 0)
                if (valMultaProc === 0) {
                    const upfmd = window.valorUpfmdAtual || parseFloat(p.campos?.upfmd_utilizado) || 105.00;
                    valMultaProc = 10 * upfmd;
                }
            }

            // Só é multa gerada se o processo virou Auto de Infração. Os valores da
            // Etapa 1 (multas_customizadas) também existem em processos que ainda
            // estão em Notificação Preliminar e não podem entrar na soma.
            if (!temAutoOuMulta) valMultaProc = 0;

            if (valMultaProc > 0) {
                fiscaisMap[fiscalIdKey].qtdMultas += 1;
                fiscaisMap[fiscalIdKey].valorMultas += valMultaProc;
                globalTotalMultasValor += valMultaProc;
                globalQtdMultas += 1;
            }
        });

        const listaFiscais = Object.values(fiscaisMap).sort((a, b) => b.totalProcessos - a.totalProcessos);
        const qtdFiscais = listaFiscais.length;

        // Atualizar os KPIs
        const elTotalProc = document.getElementById('kpiApuracaoTotalProcessos');
        const elTotalMultas = document.getElementById('kpiApuracaoTotalMultas');
        const elTotalFiscais = document.getElementById('kpiApuracaoTotalFiscais');
        const elMediaProc = document.getElementById('subkpiMediaProc');
        const elMediaMultaFiscal = document.getElementById('kpiApuracaoMediaMultaFiscal');

        if (elTotalProc) elTotalProc.textContent = globalTotalProcessos.toLocaleString('pt-BR');
        if (elTotalMultas) elTotalMultas.textContent = globalTotalMultasValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        if (elTotalFiscais) elTotalFiscais.textContent = qtdFiscais;
        if (elMediaProc) elMediaProc.textContent = `• Média: ${(globalTotalProcessos / (qtdFiscais || 1)).toFixed(1)} proc/fiscal`;
        if (elMediaMultaFiscal) elMediaMultaFiscal.textContent = (globalTotalMultasValor / (qtdFiscais || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        // Renderizar Tabela
        if (elTabelaBody) {
            if (listaFiscais.length === 0) {
                elTabelaBody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #64748b;">Nenhum registro encontrado no período selecionado.</td></tr>`;
            } else {
                let htmlTabela = '';
                listaFiscais.forEach(f => {
                    const pctArrecadacao = globalTotalMultasValor > 0 ? ((f.valorMultas / globalTotalMultasValor) * 100).toFixed(1) : '0,0';
                    const valFmt = f.valorMultas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    htmlTabela += `
                        <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                            <td style="padding: 14px 16px; font-weight: 700; color: #0f172a;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <div style="width:32px; height:32px; border-radius:50%; background:#e0f2fe; color:#0369a1; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">
                                        ${f.nome.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div>${f.nome}</div>
                                        <div style="font-size:0.75rem; color:#64748b; font-weight:normal;">Matrícula: ${f.matricula}</div>
                                    </div>
                                </div>
                            </td>
                            <td style="padding: 14px 16px; text-align: center; font-weight: 800; color: #2563eb; font-size: 1.05rem;">
                                ${f.totalProcessos}
                            </td>
                            <td style="padding: 14px 16px; text-align: center; font-weight: 700; color: #475569;">
                                ${f.qtdMultas}
                            </td>
                            <td style="padding: 14px 16px; text-align: right; font-weight: 800; color: #059669; font-size: 1rem;">
                                ${valFmt}
                            </td>
                            <td style="padding: 14px 16px; text-align: right; font-weight: 700; color: #64748b;">
                                <span style="background:#ecfdf5; color:#047857; padding:4px 8px; border-radius:6px; font-size:0.78rem;">${pctArrecadacao}%</span>
                            </td>
                        </tr>
                    `;
                });
                elTabelaBody.innerHTML = htmlTabela;
            }
        }

        renderizarGraficosApuracao(listaFiscais);

    } catch (err) {
        console.error('[APURAÇÃO] Erro inesperado:', err);
    }
};

function renderizarGraficosApuracao(listaFiscais) {
    if (typeof Chart === 'undefined') {
        console.warn('[APURAÇÃO] Chart.js ainda não foi carregado.');
        return;
    }

    const labelsFiscais = listaFiscais.map(f => f.nome.length > 18 ? f.nome.slice(0, 16) + '...' : f.nome);
    const dataProcessos = listaFiscais.map(f => f.totalProcessos);
    const dataMultas = listaFiscais.map(f => f.valorMultas);

    if (chartProcessosInst) chartProcessosInst.destroy();
    if (chartMultasInst) chartMultasInst.destroy();

    const ctxProc = document.getElementById('chartProcessosPorFiscal')?.getContext('2d');
    if (ctxProc) {
        chartProcessosInst = new Chart(ctxProc, {
            type: 'bar',
            data: {
                labels: labelsFiscais,
                datasets: [{
                    label: 'Qtd. de processos',
                    data: dataProcessos,
                    backgroundColor: 'rgba(89, 132, 224, 0.75)',
                    borderColor: '#3b63d3',
                    borderWidth: 1.5,
                    borderRadius: 8,
                    hoverBackgroundColor: '#497ae4'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) { return ` ${ctx.raw} processo(s)`; }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0, font: { weight: 'bold' } },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11, weight: 'bold' } }
                    }
                }
            }
        });
    }

    const ctxMultas = document.getElementById('chartMultasPorFiscal')?.getContext('2d');
    if (ctxMultas) {
        chartMultasInst = new Chart(ctxMultas, {
            type: 'bar',
            data: {
                labels: labelsFiscais,
                datasets: [{
                    label: 'Valor de multas (R$)',
                    data: dataMultas,
                    backgroundColor: 'rgba(16, 185, 129, 0.75)',
                    borderColor: '#047857',
                    borderWidth: 1.5,
                    borderRadius: 8,
                    hoverBackgroundColor: '#1aa174'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const val = ctx.raw || 0;
                                return ' ' + val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return 'R$ ' + value.toLocaleString('pt-BR');
                            },
                            font: { weight: 'bold' }
                        },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11, weight: 'bold' } }
                    }
                }
            }
        });
    }

    renderizarPizzaArrecadacao(listaFiscais);
}

// % da arrecadação por fiscal: os 5 maiores em fatias próprias e o resto em
// "Outros". A legenda ao lado repete nome, % e valor em texto, e a tabela
// abaixo traz todos os fiscais.
function renderizarPizzaArrecadacao(listaFiscais) {
    const canvas = document.getElementById('chartArrecadacaoPizza');
    const legenda = document.getElementById('legendaArrecadacaoPizza');
    if (!canvas || !legenda) return;
    if (chartPizzaArrecadacaoInst) {
        chartPizzaArrecadacaoInst.destroy();
        chartPizzaArrecadacaoInst = null;
    }

    const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const pct = v => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const comValor = (listaFiscais || [])
        .filter(f => (f.valorMultas || 0) > 0)
        .sort((a, b) => b.valorMultas - a.valorMultas);
    const total = comValor.reduce((s, f) => s + f.valorMultas, 0);

    if (total <= 0) {
        canvas.style.display = 'none';
        legenda.innerHTML = '<li style="color:#64748b; font-size:0.9rem;">Nenhuma multa gerada no período selecionado.</li>';
        return;
    }
    canvas.style.display = '';

    const fatias = comValor.slice(0, FATIAS_PIZZA_COM_NOME).map((f, i) => ({
        nome: f.nome, valor: f.valorMultas, cor: CORES_PIZZA_ARRECADACAO[i]
    }));
    const resto = comValor.slice(FATIAS_PIZZA_COM_NOME);
    if (resto.length > 0) {
        fatias.push({
            nome: `Outros (${resto.length} ${resto.length > 1 ? 'fiscais' : 'fiscal'})`,
            valor: resto.reduce((s, f) => s + f.valorMultas, 0),
            cor: COR_PIZZA_OUTROS
        });
    }

    if (typeof Chart !== 'undefined') {
        chartPizzaArrecadacaoInst = new Chart(canvas.getContext('2d'), {
            type: 'pie',
            data: {
                labels: fatias.map(f => f.nome),
                datasets: [{
                    data: fatias.map(f => f.valor),
                    backgroundColor: fatias.map(f => f.cor),
                    // 2px da cor do fundo entre as fatias
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${brl(ctx.raw || 0)} (${pct(((ctx.raw || 0) / total) * 100)})`
                        }
                    }
                }
            }
        });
    }

    // Texto em cor de texto; a cor fica só no marcador ao lado
    legenda.innerHTML = fatias.map(f => `
        <li style="display:flex; align-items:center; gap:10px; font-size:0.9rem;">
            <span aria-hidden="true" style="width:12px; height:12px; border-radius:3px; background:${f.cor}; flex-shrink:0;"></span>
            <span style="flex:1; min-width:0; color:#0f172a; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(f.nome)}">${esc(f.nome)}</span>
            <span style="color:#0f172a; font-weight:800; font-variant-numeric:tabular-nums;">${pct((f.valor / total) * 100)}</span>
            <span style="color:#64748b; font-size:0.8rem; font-variant-numeric:tabular-nums; min-width:92px; text-align:right;">${brl(f.valor)}</span>
        </li>
    `).join('');
}

window.exportarApuracaoCSV = function () {
    const elTabela = document.getElementById('tabelaApuracaoFiscaisBody');
    if (!elTabela) return;

    let csvContent = "data:text/csv;charset=utf-8,Fiscal;Matricula;Total processos;Multas geradas;Valor total (R$)\n";
    const rows = elTabela.querySelectorAll('tr');

    rows.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 4) {
            const fiscalInfo = tds[0].innerText.replace(/\n/g, ' ').trim();
            const procCount = tds[1].innerText.trim();
            const multasCount = tds[2].innerText.trim();
            const valorTotal = tds[3].innerText.replace('R$', '').trim();
            csvContent += `"${fiscalInfo}";"${procCount}";"${multasCount}";"${valorTotal}"\n`;
        }
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `apuracao_dados_fiscais_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
