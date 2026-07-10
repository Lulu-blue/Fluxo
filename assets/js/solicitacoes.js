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
        // Buscar dados do usuário na tabela profiles (ou usuarios como fallback)
        let tabelaAlvo = 'profiles';
        let { data: usuario, error: errProf } = await supabaseClient
            .from('profiles')
            .select('id, nome, full_name, cargo, role, matricula, cpf, auth_id, email')
            .eq('auth_id', session.user.id)
            .maybeSingle();

        if (errProf || !usuario) {
            let resFb = await supabaseClient
                .from('usuarios')
                .select('id, nome, cargo, matricula, cpf, auth_id')
                .eq('auth_id', session.user.id)
                .maybeSingle();
            if (resFb.data) {
                usuario = resFb.data;
                tabelaAlvo = 'usuarios';
            }
        }

        if (!usuario && session.user.email) {
            const cpfLimpo = session.user.email.split('@')[0].replace(/\D/g, '');
            if (cpfLimpo) {
                let res = await supabaseClient
                    .from('profiles')
                    .select('id, nome, full_name, cargo, role, matricula, cpf, auth_id, email')
                    .eq('cpf', cpfLimpo)
                    .maybeSingle();
                if (!res.data) {
                    res = await supabaseClient
                        .from('usuarios')
                        .select('id, nome, cargo, matricula, cpf, auth_id')
                        .eq('cpf', cpfLimpo)
                        .maybeSingle();
                    if (res.data) tabelaAlvo = 'usuarios';
                }
                if (!res.data && cpfLimpo.length === 11) {
                    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                    res = await supabaseClient
                        .from('profiles')
                        .select('id, nome, full_name, cargo, role, matricula, cpf, auth_id, email')
                        .eq('cpf', cpfFormatado)
                        .maybeSingle();
                    if (!res.data) {
                        res = await supabaseClient
                            .from('usuarios')
                            .select('id, nome, cargo, matricula, cpf, auth_id')
                            .eq('cpf', cpfFormatado)
                            .maybeSingle();
                        if (res.data) tabelaAlvo = 'usuarios';
                    }
                }
                usuario = res.data;
                if (usuario && !usuario.auth_id) {
                    await supabaseClient
                        .from(tabelaAlvo)
                        .update({ auth_id: session.user.id })
                        .eq('id', usuario.id);
                }
            }
        }

        if (usuario) {
            currentUserId = usuario.id;
            window.currentUserProfile = usuario;
            window.tabelaPerfilAlvo = tabelaAlvo;
            const nomeExibicao = usuario.nome || usuario.full_name || 'Usuário';
            const elUserName = document.getElementById('userName');
            if (elUserName) elUserName.textContent = nomeExibicao;

            const elMatricula = document.getElementById('userMatricula');
            if (elMatricula) elMatricula.textContent = "Matrícula: " + (usuario.matricula || '---');

            const avatar = document.querySelector('.user-avatar');
            if (avatar) {
                const initials = nomeExibicao.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                avatar.textContent = initials;
            }

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
            if (pCargo) pCargo.value = usuario.cargo || usuario.role || 'Fiscal de Posturas';
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
                solicitantes ( nome, cpf_cnpj ),
                etapas ( numero, nome )
            `, { count: 'exact' });

        // Aplicar filtros
        const filtros = coletarFiltros();

        if (filtros.protocolo) {
            query = query.ilike('numero_processo', `%${filtros.protocolo}%`);
        }
        if (filtros.nome) {
            query = query.ilike('solicitantes.nome', `%${filtros.nome}%`);
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

        const cpfCnpj = item.solicitantes?.cpf_cnpj || item.dados?.cpf_cnpj_solicitante || '—';
        const nomeSolicitante = item.solicitantes?.nome || item.dados?.nome_solicitante || '—';
        const dataInicio = formatarData(item.created_at);
        const dataFinal = item.dados?.data_final ? formatarData(item.dados.data_final) : '—';
        const diasVenc = calcularDiasVencimento(item.dados?.data_final);
        const descricao = item.dados?.descricao || '—';
        const etapaNumero = item.etapas?.numero || '—';
        const etapaNome = item.etapas?.nome || ETAPAS_MAP[etapaNumero] || '—';
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
                <span class="etapa-badge">E${etapaNumero}</span>
                <span class="etapa-nome">${truncar(etapaNome, 25)}</span>
            </td>
            <td class="col-acoes">
                <button class="btn-abrir-processo" data-id="${item.id}" data-etapa="${etapaNumero}" title="Abrir Processo">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Abrir
                </button>
            </td>
        `;

        // Linha de status com cor
        tr.style.borderLeft = `4px solid ${STATUS_COLORS[statusClass] || '#94a3b8'}`;

        tabelaBody.appendChild(tr);
    });

    // Bind botões "Abrir Processo"
    document.querySelectorAll('.btn-abrir-processo').forEach(btn => {
        btn.addEventListener('click', () => {
            const processoId = btn.dataset.id;
            const etapa = btn.dataset.etapa;
            // Redireciona para a tela da etapa correspondente
            window.location.href = `etapa.html?processo=${processoId}&etapa=${etapa}`;
        });
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
        const cpfCnpj = item.solicitantes?.cpf_cnpj || item.dados?.cpf_cnpj_solicitante || '';
        const nome = item.solicitantes?.nome || item.dados?.nome_solicitante || '';
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
                    const box = document.getElementById('perfilAvatarBox');
                    const nomeHeader = document.getElementById('perfilHeaderNome');
                    const cargoHeader = document.getElementById('perfilHeaderCargo');
                    const n = window.currentUserProfile.nome || window.currentUserProfile.full_name || 'Usuário';
                    if (nomeHeader) nomeHeader.textContent = n;
                    if (cargoHeader) cargoHeader.textContent = window.currentUserProfile.cargo || window.currentUserProfile.role || 'Fiscal de Postura';
                    if (box) box.textContent = n.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
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

    const tabela = window.tabelaPerfilAlvo || 'profiles';
    const profileId = window.currentUserProfile?.id || currentUserId;

    if (!profileId) {
        alert('Erro: ID do perfil não identificado.');
        return;
    }

    const updateObj = {
        nome: nome,
        matricula: matricula
    };
    if (tabela === 'profiles') {
        updateObj.full_name = nome;
    }

    const { error } = await supabaseClient
        .from(tabela)
        .update(updateObj)
        .eq('id', profileId);

    if (error) {
        console.error('Erro ao salvar perfil:', error);
        alert('Erro ao atualizar o perfil. Verifique as permissões de banco.');
    } else {
        alert('Alterações salvas com sucesso!');
        await verificarSessao();
    }
}
