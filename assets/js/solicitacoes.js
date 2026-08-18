/* ============================================================
   SOLICITAÇÕES — Etapa 0: Listagem, Filtros e Exportação CSV
   ============================================================ */

// ── Mapa de etapas (para exibição) ──────────────────────────
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

const STATUS_LABELS = {
    em_aberto: 'Em Aberto',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado'
};

const STATUS_COLORS = {
    em_aberto: '#3b82f6',
    finalizado: '#10b981',
    cancelado: '#ef4444'
};

// ── Helpers para processos com notificações independentes ─────
function obterNotificacoesProcesso(item) {
    if (item?.notificacoes && Array.isArray(item.notificacoes)) return item.notificacoes;
    return item?.dados?.campos?.etapa2?.notificacoes || [];
}

function numeroEtapaNotificacao(n) {
    if (n.etapas?.numero) return parseInt(n.etapas.numero, 10);
    if (n.etapa_atual_id) {
        // Fallback: se não vier o join de etapas, assume mapeamento direto (em geral id == numero)
        return parseInt(n.etapa_atual_id, 10);
    }
    return parseInt(n.etapa_atual || 2, 10);
}

function calcularEtapaProcesso(item) {
    const notificacoes = obterNotificacoesProcesso(item);
    if (!notificacoes || notificacoes.length === 0) {
        return parseInt(item?.etapas?.numero || item?.etapa_atual_id || 1, 10);
    }

    const ativas = notificacoes.filter(n => n.status !== 'atendida');
    if (ativas.length === 0) return null;

    return ativas.reduce((maior, n) => {
        const etapa = numeroEtapaNotificacao(n);
        return etapa > maior ? etapa : maior;
    }, 0) || parseInt(item?.etapas?.numero || item?.etapa_atual_id || 1, 10);
}

function montarLinkEtapa(item) {
    const notificacoes = obterNotificacoesProcesso(item);
    const etapaNumero = calcularEtapaProcesso(item);

    if (!notificacoes || notificacoes.length === 0) {
        return `etapa.html?processo=${item.id}&etapa=${etapaNumero || item.etapas?.numero || 1}`;
    }

    const etapasAtivas = new Set(
        notificacoes
            .filter(n => n.status !== 'atendida')
            .map(n => numeroEtapaNotificacao(n))
    );

    if (etapasAtivas.size > 1) {
        // Notificações em etapas diferentes: abre sem índice para mostrar o modal de seleção
        return `etapa.html?processo=${item.id}`;
    }

    const primeiraAtiva = notificacoes.findIndex(n => n.status !== 'atendida');
    if (primeiraAtiva >= 0) {
        return `etapa.html?processo=${item.id}&notificacao=${primeiraAtiva}`;
    }

    return `etapa.html?processo=${item.id}`;
}

// ── Estado da aplicação ─────────────────────────────────────
let currentPage = 1;
const pageSize = 20;
let totalRecords = 0;
let currentUserId = null;
let dadosTabela = []; // dados exibidos atualmente (para exportação)

// ── Elementos do DOM ────────────────────────────────────────
const filtersPanel = document.getElementById('filtersPanel');
const tabelaBody = document.getElementById('tabelaBody');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const resultsCount = document.getElementById('resultsCount');
const paginationInfo = document.getElementById('paginationInfo');

// ── Inicialização ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await verificarSessao();
    await carregarSolicitacoes();
    bindEventos();
});

// ── Verificar sessão ativa ──────────────────────────────────
async function verificarSessao() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.href = 'index.html';
            return;
        }
        // Buscar dados do usuário na tabela profiles
        let { data: usuario } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('auth_id', session.user.id)
            .maybeSingle();

        if (!usuario && session.user.email) {
            const cpfLimpo = session.user.email.split('@')[0].replace(/\D/g, '');
            if (cpfLimpo) {
                let res = await supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('cpf', cpfLimpo)
                    .maybeSingle();
                if (!res.data && cpfLimpo.length === 11) {
                    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                    res = await supabaseClient
                        .from('profiles')
                        .select('*')
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
                // Caso não retorne por inserção, cria objeto em memória
                usuario = novoPerfil;
            }
        }

        if (usuario) {
            currentUserId = usuario.id || session.user.id;
            window.currentUserProfile = usuario;
            window.tabelaPerfilAlvo = 'profiles';
            const nomeExibicao = usuario.nome || 'Usuário';
            const elUserName = document.getElementById('userName');
            if (elUserName) elUserName.textContent = nomeExibicao;

            const elMatricula = document.getElementById('userMatricula');
            if (elMatricula) elMatricula.textContent = "Matrícula: " + (usuario.matricula || '---');

            // Aplicar avatar customizado ou iniciais
            aplicarAvatarUsuario(usuario, nomeExibicao);

            // Preencher campos da aba Configurações
            const pNome = document.getElementById('perfil-nome');
            const pEmail = document.getElementById('perfil-email');
            const pCpf = document.getElementById('perfil-cpf');
            const pMatricula = document.getElementById('perfil-matricula');
            const pCargo = document.getElementById('perfil-cargo');
            if (pNome) pNome.value = nomeExibicao;
            if (pEmail) pEmail.value = usuario.email || session.user.email || '';
            if (pCpf) pCpf.value = usuario.cpf || '';
            if (pMatricula) pMatricula.value = usuario.matricula || '';
            if (pCargo) pCargo.value = usuario.cargo || 'Fiscal de Postura';

            // Atualizar o banner no topo da aba de configurações se já estiver no DOM
            const nomeHeader = document.getElementById('perfilHeaderNome');
            const cargoHeader = document.getElementById('perfilHeaderCargo');
            if (nomeHeader) nomeHeader.textContent = nomeExibicao;
            if (cargoHeader) cargoHeader.textContent = usuario.cargo || 'Fiscal de Postura';
        }
    } catch (err) {
        console.error('Erro ao verificar sessão:', err);
    }
}

// ── Carregar solicitações com filtros ────────────────────────
async function carregarSolicitacoes() {
    mostrarLoading(true);

    try {
        // Montar query base
        let query = supabaseClient
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
                etapas ( numero, nome ),
                notificacoes (*, etapas(numero))
            `, { count: 'exact' });

        // Aplicar filtros
        const filtros = coletarFiltros();

        if (filtros.protocolo) {
            query = query.ilike('numero_processo', `%${filtros.protocolo}%`);
        }
        if (filtros.nome) {
            query = query.ilike('dados->contribuinte->>nome', `%${filtros.nome}%`);
        }
        if (filtros.status) {
            query = query.eq('status', filtros.status);
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
        if (filtros.descricao) {
            query = query.ilike('dados->>descricao', `%${filtros.descricao}%`);
        }
        if (filtros.criador === 'meu' && currentUserId) {
            query = query.eq('fiscal_id', currentUserId);
        }

        // Paginação
        const from = (currentPage - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        totalRecords = count || 0;
        dadosTabela = data || [];

        renderizarTabela(dadosTabela);
        atualizarPaginacao();
        atualizarContador();
        setTimeout(() => { if (window.atualizarInterfaceNotificacoesPainel) window.atualizarInterfaceNotificacoesPainel(); }, 150);

    } catch (err) {
        console.error('Erro ao carregar solicitações:', err);
        resultsCount.textContent = 'Erro ao carregar dados';
        // Se não tiver as tabelas no banco ainda, mostrar estado vazio
        renderizarTabela([]);
    }

    mostrarLoading(false);
}

// ── Renderizar tabela ───────────────────────────────────────
function renderizarTabela(dados) {
    tabelaBody.innerHTML = '';

    if (!dados || dados.length === 0) {
        emptyState.style.display = 'flex';
        document.getElementById('tabelaSolicitacoes').style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    document.getElementById('tabelaSolicitacoes').style.display = 'table';

    dados.forEach(item => {
        const tr = document.createElement('tr');

        const cpfCnpj = item.dados?.contribuinte?.cpf_cnpj || item.dados?.cpf_cnpj_solicitante || '—';
        const nomeSolicitante = item.dados?.contribuinte?.nome || item.dados?.nome_solicitante || '—';
        const dataInicio = formatarData(item.created_at);
        const dataFinal = item.dados?.data_final ? formatarData(item.dados.data_final) : '—';
        const diasVenc = calcularDiasVencimento(item.dados?.data_final);
        const descricao = item.dados?.descricao || '—';
        const etapaNumero = item.status === 'cancelado' ? '—' : (calcularEtapaProcesso(item) || '—');
        const etapaNome = item.status === 'cancelado' ? 'Cancelado' : (etapaNumero === '—' ? 'Concluído' : (item.etapas?.nome || ETAPAS_MAP[etapaNumero] || '—'));
        const statusClass = item.status || 'em_aberto';

        tr.innerHTML = `
            <td class="col-protocolo">
                <span class="protocolo-badge">${item.numero_processo || '—'}</span>
            </td>
            <td class="col-cpf">${formatarCpfCnpj(cpfCnpj)}</td>
            <td class="col-nome">${nomeSolicitante}</td>
            <td class="col-data">${dataInicio}</td>
            <td class="col-data">${dataFinal}</td>
            <td class="col-dias">
                <span class="dias-badge ${diasVenc <= 5 ? 'urgente' : diasVenc <= 15 ? 'alerta' : ''}">${diasVenc >= 0 ? diasVenc + ' dias' : '—'}</span>
            </td>
            <td class="col-descricao" title="${descricao}">${truncar(descricao, 40)}</td>
            <td class="col-etapa">
                ${etapaNumero === '—' ? '' : `<span class="etapa-badge">E${etapaNumero}</span>`}
                <span class="etapa-nome">${truncar(etapaNome, 25)}</span>
            </td>
            <td class="col-acoes">
                <button type="button" class="btn-abrir-processo" onclick="window.location.href='${montarLinkEtapa(item)}'" data-id="${item.id}" data-etapa="${etapaNumero}" title="Abrir Processo">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Abrir
                </button>
            </td>
        `;

        // Linha de status com cor
        tr.style.borderLeft = `4px solid ${STATUS_COLORS[statusClass] || '#94a3b8'}`;
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                window.location.href = montarLinkEtapa(item);
            }
        });

        tabelaBody.appendChild(tr);
    });
}

// ── Coletar valores dos filtros ─────────────────────────────
function coletarFiltros() {
    return {
        protocolo: document.getElementById('filtroProtocolo').value.trim(),
        nome: document.getElementById('filtroNome').value.trim(),
        status: document.getElementById('filtroStatus').value,
        dataInicio: document.getElementById('filtroDataInicio').value,
        dataFim: document.getElementById('filtroDataFim').value,
        etapa: document.getElementById('filtroEtapa').value,
        descricao: document.getElementById('filtroDescricao').value.trim(),
        criador: document.getElementById('filtroCriador').value
    };
}

// ── Exportar CSV ────────────────────────────────────────────
function exportarCSV() {
    if (!dadosTabela || dadosTabela.length === 0) {
        alert('Nenhum dado para exportar.');
        return;
    }

    const headers = ['Protocolo', 'CPF/CNPJ', 'Nome do Solicitante', 'Data Início', 'Data Final', 'Dias p/ Vencimento', 'Descrição', 'Etapa'];

    const rows = dadosTabela.map(item => {
        const cpfCnpj = item.dados?.contribuinte?.cpf_cnpj || item.dados?.cpf_cnpj_solicitante || '';
        const nome = item.dados?.contribuinte?.nome || item.dados?.nome_solicitante || '';
        const dataInicio = formatarData(item.created_at);
        const dataFinal = item.dados?.data_final ? formatarData(item.dados.data_final) : '';
        const diasVenc = calcularDiasVencimento(item.dados?.data_final);
        const descricao = item.dados?.descricao || '';
        const etapa = `${item.etapas?.numero || ''} - ${item.etapas?.nome || ETAPAS_MAP[item.etapas?.numero] || ''}`;

        return [
            item.numero_processo || '',
            cpfCnpj,
            nome,
            dataInicio,
            dataFinal,
            diasVenc >= 0 ? diasVenc : '',
            descricao,
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

function formatarCpfCnpj(value) {
    if (!value || value === '—') return '—';
    const digits = value.replace(/\D/g, '');
    if (digits.length === 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (digits.length === 14) {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return value;
}

function calcularDiasVencimento(dataFinal) {
    if (!dataFinal) return -1;
    const agora = new Date();
    const final = new Date(dataFinal);
    const diff = Math.ceil((final - agora) / (1000 * 60 * 60 * 24));
    return diff;
}

function truncar(str, max) {
    if (!str || str === '—') return '—';
    return str.length > max ? str.slice(0, max) + '...' : str;
}

// ── Loading / Paginação / Contador ──────────────────────────
function mostrarLoading(show) {
    loadingState.style.display = show ? 'flex' : 'none';
}

function atualizarPaginacao() {
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    paginationInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    document.getElementById('btnPrevPage').disabled = currentPage <= 1;
    document.getElementById('btnNextPage').disabled = currentPage >= totalPages;
}

function atualizarContador() {
    if (totalRecords === 0) {
        resultsCount.textContent = 'Nenhuma solicitação encontrada';
    } else {
        resultsCount.textContent = `${totalRecords} solicitação${totalRecords > 1 ? 'ões' : ''} encontrada${totalRecords > 1 ? 's' : ''}`;
    }
}

// ── Bind de eventos ─────────────────────────────────────────
function bindEventos() {
    // Toggle filtros
    document.getElementById('btnToggleFilters').addEventListener('click', () => {
        filtersPanel.classList.toggle('open');
    });

    // Pesquisar
    document.getElementById('btnAplicarFiltros').addEventListener('click', () => {
        currentPage = 1;
        carregarSolicitacoes();
    });

    // Limpar filtros
    document.getElementById('btnLimparFiltros').addEventListener('click', () => {
        document.getElementById('filtroProtocolo').value = '';
        document.getElementById('filtroNome').value = '';
        document.getElementById('filtroStatus').value = '';
        document.getElementById('filtroDataInicio').value = '';
        document.getElementById('filtroDataFim').value = '';
        document.getElementById('filtroEtapa').value = '';
        document.getElementById('filtroDescricao').value = '';
        document.getElementById('filtroCriador').value = '';
        currentPage = 1;
        carregarSolicitacoes();
    });

    // Exportar CSV
    document.getElementById('btnExportCSV').addEventListener('click', exportarCSV);

    // Nova Solicitação → abre modal (handler em nova-solicitacao.js)

    // Paginação
    document.getElementById('btnPrevPage').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            carregarSolicitacoes();
        }
    });
    document.getElementById('btnNextPage').addEventListener('click', () => {
        const totalPages = Math.ceil(totalRecords / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            carregarSolicitacoes();
        }
    });

    // Enter nos campos de filtro para pesquisar
    document.querySelectorAll('.filters-grid input, .filters-grid select').forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                currentPage = 1;
                carregarSolicitacoes();
            }
        });
    });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = 'index.html';
    });

    // Navegação Menu Lateral (Solicitações / Configurações)
    document.querySelectorAll('.sidebar-nav a[data-page]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
            link.classList.add('active');

            const page = link.getAttribute('data-page');
            const secaoSolicitacoes = document.getElementById('secao-solicitacoes');
            const secaoConfiguracoes = document.getElementById('secao-configuracoes');
            const pageTitle = document.getElementById('pageTitle');
            const headerActions = document.querySelector('.header-actions');

            if (page === 'configuracoes') {
                if (secaoSolicitacoes) secaoSolicitacoes.style.display = 'none';
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
            } else {
                if (secaoSolicitacoes) secaoSolicitacoes.style.display = 'block';
                if (secaoConfiguracoes) secaoConfiguracoes.style.display = 'none';
                if (pageTitle) pageTitle.textContent = 'Solicitações';
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

    reader.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
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
            const base64Avatar = canvas.toDataURL('image/jpeg', 0.85);

            const profileId = window.currentUserProfile?.id;
            const key = 'user_avatar_' + (profileId || 'default');
            localStorage.setItem(key, base64Avatar);

            if (window.currentUserProfile) {
                window.currentUserProfile.avatar_url = base64Avatar;
                if (profileId) {
                    await supabaseClient.from('profiles').update({ avatar_url: base64Avatar }).eq('id', profileId);
                } else if (window.currentUserProfile.auth_id) {
                    await supabaseClient.from('profiles').update({ avatar_url: base64Avatar }).eq('auth_id', window.currentUserProfile.auth_id);
                } else if (window.currentUserProfile.cpf) {
                    await supabaseClient.from('profiles').update({ avatar_url: base64Avatar }).eq('cpf', window.currentUserProfile.cpf);
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

window.atualizarInterfaceNotificacoesPainel = function () {
    const listDiv = document.getElementById('listaNotificacoesMenuPainel');
    const badgeEl = document.getElementById('badgeContadorNotificacoesPainel');
    if (!listDiv) return;

    let todanotifs = [];
    (dadosTabela || []).forEach(item => {
        const procNotifs = item?.dados?.notificacoes_menu || [];
        procNotifs.forEach(n => todanotifs.push(n));
        (item?.notificacoes || []).forEach(notif => {
            const subNotifs = notif?.dados?.notificacoes_menu || [];
            subNotifs.forEach(n => todanotifs.push(n));
        });
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
    const item = (dadosTabela || []).find(i => i.id === processoId);
    if (item && item.dados?.notificacoes_menu) {
        if (idx !== undefined && item.dados.notificacoes_menu[idx]) {
            item.dados.notificacoes_menu[idx].lida = true;
        } else {
            item.dados.notificacoes_menu.forEach(n => n.lida = true);
        }
        try {
            await supabaseClient.from('processos').update({ dados: item.dados }).eq('id', item.id);
        } catch (e) {
            console.error('Erro ao marcar notificação como lida:', e);
        }
    }
    let url = `etapa.html?processo=${processoId}`;
    if (notificacaoId) {
        url += `&notificacao=${notificacaoId}`;
    }
    window.location.href = url;
};

window.marcarTodasNotificacoesLidasPainel = async function () {
    (dadosTabela || []).forEach(async (item) => {
        if (item?.dados?.notificacoes_menu) {
            item.dados.notificacoes_menu.forEach(n => n.lida = true);
            if (item.id) {
                try {
                    await supabaseClient.from('processos').update({ dados: item.dados }).eq('id', item.id);
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
            item.dados.notificacoes_menu = item.dados.notificacoes_menu.filter(n => !n.lida);
            if (item.dados.notificacoes_menu.length !== antes && item.id) {
                try {
                    await supabaseClient.from('processos').update({ dados: item.dados }).eq('id', item.id);
                } catch (e) {
                    console.error('Erro ao atualizar processo:', e);
                }
            }
        }
    });
    window.atualizarInterfaceNotificacoesPainel();
};

window.removerNotificacaoPainel = async function (processoId, idx) {
    const item = (dadosTabela || []).find(i => i.id === processoId);
    if (item && item.dados?.notificacoes_menu) {
        item.dados.notificacoes_menu.splice(idx, 1);
        try {
            await supabaseClient.from('processos').update({ dados: item.dados }).eq('id', item.id);
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
