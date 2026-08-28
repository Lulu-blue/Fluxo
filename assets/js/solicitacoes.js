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
    em_aberto: '#80A1D4',
    finalizado: '#75C9C8',
    cancelado: '#F8A4A4'
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

function obterCargoResponsavelPelaEtapa(etapaNum) {
    const num = parseInt(etapaNum, 10);
    if ([11, 12, 15, 17, 22, 25, 29, 30].includes(num)) return 'Gerente';
    if ([16, 17].includes(num)) return 'Administrativo';
    if ([24].includes(num)) return 'Secretário';
    if ([23].includes(num)) return 'Jurídico';
    if ([26].includes(num)) return 'Fazenda';
    return 'Fiscal';
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

function montarLinkEtapa(item) {
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
// ── Carregar solicitações com filtros (com retry automático) ──
let currentFetchId = 0;

async function carregarSolicitacoes(tentativa = 1) {
    mostrarLoading(true);
    
    const myFetchId = ++currentFetchId;

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
                    dados
                )
            `);

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

        // Paginação e Execução
        const requiresClientFilter = !!filtros.responsavel;
        const from = (currentPage - 1) * pageSize;
        // Pede 1 item a mais para saber se tem próxima página (sem precisar de count)
        const to = from + pageSize; 

        if (!requiresClientFilter) {
            query = query.range(from, to);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Ignorar se outra requisição já foi feita
        if (myFetchId !== currentFetchId) return;

        let resultData = data || [];
        if (requiresClientFilter) {
            let cargoAlvo = filtros.responsavel;
            if (cargoAlvo === 'minha_responsabilidade') {
                cargoAlvo = window.currentUserProfile?.cargo || 'Fiscal de Postura';
            }
            resultData = resultData.filter(item => itemPertenceAoCargo(item, cargoAlvo));
            totalRecords = resultData.length;
            
            // Paginação Client-Side
            resultData = resultData.slice(from, from + pageSize);
        } else {
            const hasNextPage = resultData.length > pageSize;
            if (hasNextPage) {
                // Remove o item extra da exibição
                resultData.pop();
                totalRecords = from + pageSize + 1; // Força ter mais páginas
            } else {
                totalRecords = from + resultData.length; // É a última página exata
            }
        }

        dadosTabela = resultData;

        renderizarTabela(dadosTabela, filtros.responsavel);
        atualizarPaginacao();
        atualizarContador();
        setTimeout(() => { if (window.atualizarInterfaceNotificacoesPainel) window.atualizarInterfaceNotificacoesPainel(); }, 150);

    } catch (err) {
        console.error(`Erro ao carregar solicitações (tentativa ${tentativa}):`, err);
        if (tentativa < 3) {
            console.log(`Re-tentando carregar solicitações em 1.5s (tentativa ${tentativa + 1})...`);
            setTimeout(() => carregarSolicitacoes(tentativa + 1), 1500);
            return;
        }
        if (resultsCount) {
            resultsCount.innerHTML = `Erro ao carregar dados. <a href="#" onclick="carregarSolicitacoes(1); return false;" style="color:#2563eb; text-decoration:underline; font-weight:600; margin-left:6px;">Tentar novamente</a>`;
        }
        renderizarTabela([]);
    } finally {
        mostrarLoading(false);
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

    dados.forEach(item => {
        const tr = document.createElement('tr');

        const cpfCnpj = item.dados?.contribuinte?.cpf_cnpj || item.dados?.cpf_cnpj_solicitante || '—';
        const nomeSolicitante = item.dados?.contribuinte?.nome || item.dados?.nome_solicitante || '—';
        const dataInicio = formatarData(item.created_at);
        const dataFinal = item.dados?.data_final ? formatarData(item.dados.data_final) : '—';
        const diasVenc = calcularDiasVencimento(item.dados?.data_final);
        const profileObj = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        const nomeFiscal = profileObj?.nome || item.dados?.fiscal?.nome || item.dados?.fiscal_nome || item.dados?.fiscal?.fiscNome || '—';
        const etapaNumero = item.status === 'cancelado' ? '—' : (calcularEtapaProcesso(item) || '—');
        const etapaNome = item.status === 'cancelado' ? 'Cancelado' : (etapaNumero === '—' ? 'Concluído' : (item.etapas?.nome || ETAPAS_MAP[etapaNumero] || '—'));
        const statusClass = item.status || 'em_aberto';

        const linkEtapa = montarLinkEtapa(item, cargoFiltro);

        const isDev = window.currentUserProfile && normalizarCargo(window.currentUserProfile.cargo) === 'Dev';
        if (isDev) {
            const thCheck = document.getElementById('thCheck');
            const devActions = document.getElementById('devActionsContainer');
            if (thCheck) thCheck.style.display = 'table-cell';
            if (devActions) devActions.style.display = 'flex';
        }

        const devCheckHtml = isDev ? `<td class="col-check" style="text-align: center;"><input type="checkbox" class="chk-process" data-id="${item.id}" onclick="event.stopPropagation(); window.atualizarContagemSelecionados && window.atualizarContagemSelecionados();" /></td>` : '';

        tr.innerHTML = `
            ${devCheckHtml}
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
            <td class="col-descricao" title="${nomeFiscal}">${truncar(nomeFiscal, 30)}</td>
            <td class="col-etapa">
                ${etapaNumero === '—' ? '' : `<span class="etapa-badge">E${etapaNumero}</span>`}
                <span class="etapa-nome">${truncar(etapaNome, 25)}</span>
            </td>
            <td class="col-acoes">
                <button type="button" class="btn-abrir-processo" onclick="window.location.href='${linkEtapa}'" data-id="${item.id}" data-etapa="${etapaNumero}" title="Abrir Processo">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Abrir
                </button>
            </td>
        `;

        tr.style.borderLeft = `4px solid ${STATUS_COLORS[statusClass] || '#94a3b8'}`;
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                window.location.href = linkEtapa;
            }
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
                                <span style="font-size: 0.72rem; background: #F0F4FA; color: #3B5888; border: 1px solid #C0B9DD; font-weight: 700; padding: 2px 8px; border-radius: 4px;">Sua Etapa — Clique para abrir</span>
                            </div>
                            <div style="display: flex; gap: 24px; color: #475569; font-size: 0.78rem; flex-wrap: wrap;">
                                <span><strong style="color: #64748b;">Etapa:</strong> E${eNum} (${eNome})</span>
                                <span><strong style="color: #64748b;">Responsável:</strong> ${respCargo}</span>
                            </div>
                        </div>`;
                    }).join('');

                    trDet.innerHTML = `
                        <td colspan="9" style="padding: 6px 16px 14px 16px; background: #F7F4EA; border-bottom: 2px solid #DED9E2;">
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${boxes}
                            </div>
                        </td>
                    `;

                    tabelaBody.appendChild(trDet);
                }
            }
        }
    });
}

// ── Coletar valores dos filtros ─────────────────────────────
function coletarFiltros() {
    const elResp = document.getElementById('filtroResponsavel');
    return {
        protocolo: document.getElementById('filtroProtocolo').value.trim(),
        nome: document.getElementById('filtroNome').value.trim(),
        status: document.getElementById('filtroStatus').value,
        dataInicio: document.getElementById('filtroDataInicio').value,
        dataFim: document.getElementById('filtroDataFim').value,
        etapa: document.getElementById('filtroEtapa').value,
        descricao: document.getElementById('filtroDescricao').value.trim(),
        criador: document.getElementById('filtroCriador').value,
        responsavel: elResp ? elResp.value : ''
    };
}

// ── Exportar CSV ────────────────────────────────────────────
function exportarCSV() {
    if (!dadosTabela || dadosTabela.length === 0) {
        alert('Nenhum dado para exportar.');
        return;
    }

    const headers = ['Protocolo', 'CPF/CNPJ', 'Nome do Solicitante', 'Data Início', 'Data Final', 'Dias p/ Vencimento', 'Fiscal', 'Etapa'];

    const rows = dadosTabela.map(item => {
        const cpfCnpj = item.dados?.contribuinte?.cpf_cnpj || item.dados?.cpf_cnpj_solicitante || '';
        const nome = item.dados?.contribuinte?.nome || item.dados?.nome_solicitante || '';
        const dataInicio = formatarData(item.created_at);
        const dataFinal = item.dados?.data_final ? formatarData(item.dados.data_final) : '';
        const diasVenc = calcularDiasVencimento(item.dados?.data_final);
        const profileObj = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        const nomeFiscal = profileObj?.nome || item.dados?.fiscal?.nome || item.dados?.fiscal_nome || item.dados?.fiscal?.fiscNome || '';
        const etapa = `${item.etapas?.numero || ''} - ${item.etapas?.nome || ETAPAS_MAP[item.etapas?.numero] || ''}`;

        return [
            item.numero_processo || '',
            cpfCnpj,
            nome,
            dataInicio,
            dataFinal,
            diasVenc >= 0 ? diasVenc : '',
            nomeFiscal,
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
    const usrLogado = window.currentUserProfile || window.perfilAtual || null;
    const meuCargo = usrLogado?.cargo ? normalizarCargo(usrLogado.cargo) : null;

    (dadosTabela || []).forEach(item => {
        const procNotifs = item?.dados?.notificacoes_menu || [];
        procNotifs.forEach(n => {
            if (n.destinatario_cargo && meuCargo) {
                if (normalizarCargo(n.destinatario_cargo) !== meuCargo) return;
            }
            todanotifs.push(n);
        });
        (item?.notificacoes || []).forEach(notif => {
            const subNotifs = notif?.dados?.notificacoes_menu || [];
            subNotifs.forEach(n => {
                if (n.destinatario_cargo && meuCargo) {
                    if (normalizarCargo(n.destinatario_cargo) !== meuCargo) return;
                }
                todanotifs.push(n);
            });
        });
    });

    todanotifs.sort((a, b) => new Date(b.created_at || b.data || 0) - new Date(a.created_at || a.data || 0));

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
    const item = (dadosTabela || []).find(i => i.id === processoId);
    let eChatJuridico = false;

    if (item && item.dados?.notificacoes_menu) {
        if (idx !== undefined && item.dados.notificacoes_menu[idx]) {
            if (item.dados.notificacoes_menu[idx].tipo === 'chat_juridico') eChatJuridico = true;
            item.dados.notificacoes_menu[idx].lida = true;
        } else {
            item.dados.notificacoes_menu.forEach(n => {
                if (n.tipo === 'chat_juridico') eChatJuridico = true;
                n.lida = true;
            });
        }
        try {
            await supabaseClient.from('processos').update({ dados: item.dados }).eq('id', item.id);
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

// ── Funções Exclusivas DEV: Seleção e Exclusão em Lote ─────────────────────────────
window.atualizarContagemSelecionados = function() {
    const chks = document.querySelectorAll('.chk-process:checked');
    const lbl = document.getElementById('lblSelecionados');
    if (lbl) {
        lbl.textContent = `${chks.length} selecionado${chks.length !== 1 ? 's' : ''}`;
    }
};

window.excluirProcessosSelecionados = async function() {
    const chks = document.querySelectorAll('.chk-process:checked');
    if (chks.length === 0) {
        alert('Nenhum processo selecionado para exclusão.');
        return;
    }

    if (!confirm(`Tem certeza que deseja EXCLUIR DEFINITIVAMENTE ${chks.length} processo(s)?\n\nATENÇÃO: Esta ação é irreversível. O sistema apagará todos os dados anexados e devolverá todas as numerações (Protocolo, Relatório, Autos, Certidões) para a tabela de números descartados.`)) {
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

            // 1. Devolver Número do Processo e Relatório (se tiver)
            if (pItem.numero_processo) {
                await supabaseClient.rpc('devolver_numero', { p_numero: pItem.numero_processo, p_categoria: 'Processo' });
            }
            const nRel = pItem.dados?.relatorio_fiscal?.numero_relatorio || pItem.numero_relatorio || pItem.dados?.numero_relatorio;
            if (nRel) {
                await supabaseClient.rpc('devolver_numero', { p_numero: nRel, p_categoria: 'Relatório Fiscal' });
            }

            // 2. Devolver números de Notificações
            const { data: notifs } = await supabaseClient.from('notificacoes').select('numero, dados').eq('processo_id', pid);
            if (notifs && notifs.length > 0) {
                for (const n of notifs) {
                    const numNotif = n.numero || n.dados?.numero || n.dados?.numero_notificacao;
                    if (numNotif) {
                        await supabaseClient.rpc('devolver_numero', { p_numero: numNotif, p_categoria: 'Notificação' });
                    }
                }
            }

            // 3. Devolver números de Autos de Infração
            const { data: autos } = await supabaseClient.from('autos_infracao').select('numero').eq('processo_id', pid);
            if (autos && autos.length > 0) {
                for (const a of autos) {
                    if (a.numero) {
                        await supabaseClient.rpc('devolver_numero', { p_numero: a.numero, p_categoria: 'Auto de Infração' });
                    }
                }
            }

            // 4. Devolver números de Documentos Sequenciais (Ex: Certidão)
            const { data: docs } = await supabaseClient.from('documentos').select('numero_sequencial, tipo').eq('processo_id', pid).not('numero_sequencial', 'is', null);
            if (docs && docs.length > 0) {
                for (const d of docs) {
                    if (d.numero_sequencial) {
                        let cat = d.tipo;
                        if (cat === 'Relatório Fiscal Assinado') cat = 'Relatório Fiscal';
                        else if (cat === 'Auto de Infração Assinado') cat = 'Auto de Infração';
                        else if (cat === 'Notificação Preliminar Assinada' || cat === 'Notificação Preliminar') cat = 'Notificação';
                        else if (cat === 'Certidão Assinada') cat = 'Certidão Sem Defesa';
                        await supabaseClient.rpc('devolver_numero', { p_numero: d.numero_sequencial, p_categoria: cat });
                    }
                }
            }

            // 5. Exclusão em cascata (O banco apagará processo_infracoes, notificacoes, historico_etapas, documentos, autos_infracao...)
            const { error: errDel } = await supabaseClient.from('processos').delete().eq('id', pid);
            
            if (errDel) {
                console.error(`Erro ao excluir processo ${pid}:`, errDel);
            } else {
                excluidos++;
            }
        }

        alert(`${excluidos} processo(s) excluído(s) com sucesso. As numerações foram devolvidas para os Descartes.`);
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
