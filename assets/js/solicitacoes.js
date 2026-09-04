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
    'Dev': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
    'Fiscal de Postura': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 18, 19, 20, 21, 27, 28, 29, 31, 32],
    'Administrativo de Posturas': [15, 16, 17],
    'Gerente': [11, 12, 15, 17, 22, 25, 29, 30],
    'Gerente de Posturas': [11, 12, 15, 17, 22, 25, 29, 30],
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
    if (cargoNorm === 'Dev') return true;
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
const BATCH_SIZE = 50;
let hasMoreRecords = true;
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
document.addEventListener('DOMContentLoaded', async () => {
    limparAutofillInvasivoFiltros();
    bindEventos();
    carregarOpcoesFiscaisFiltro();

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
}

// ── Carregar solicitações com filtros ────────────────────────
// ── Carregar solicitações com filtros (com lote dinâmico e resiliência a timeout/redes) ──
let currentFetchId = 0;
let dynamicBatchSize = 50;

async function carregarSolicitacoes(append = false, tentativa = 1) {
    if (isFetchingMore && append) return;

    if (!append) {
        currentOffset = 0;
        dadosTabela = [];
        hasMoreRecords = true;
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
                fiscal_id
            `);

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

            try {
                const { data: notifsMatch } = await supabaseClient
                    .from('notificacoes')
                    .select('processo_id')
                    .ilike('numero', `%${notifTerm}%`);
                if (notifsMatch) notifsMatch.forEach(n => { if (n.processo_id) notifProcIds.push(n.processo_id); });
            } catch (eNotif) { }

            const uniqueNotifIds = [...new Set(notifProcIds)];
            if (uniqueNotifIds.length > 0) {
                query = query.in('id', uniqueNotifIds);
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
        if (filtros.descricao) {
            query = query.ilike('dados->>descricao', `%${filtros.descricao}%`);
        }
        if (filtros.criador === 'meu' && currentUserId) {
            query = query.eq('fiscal_id', currentUserId);
        }

        // Execução em lote adaptativo (redimensiona automaticamente se o banco expirar tempo)
        const effectiveBatch = Math.max(10, dynamicBatchSize);
        const from = currentOffset;
        const to = currentOffset + effectiveBatch - 1;

        const { data, error } = await query
            .range(from, to)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Ignorar se outra requisição já foi disparada
        if (myFetchId !== currentFetchId) return;

        const rawData = data || [];

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

    } catch (err) {
        console.error(`Erro ao carregar solicitações (tentativa ${tentativa}):`, err);

        const isTimeout = err?.code === '57014' || String(err?.message || '').toLowerCase().includes('timeout') || String(err?.details || '').toLowerCase().includes('timeout');
        const isNetworkErr = String(err).includes('Failed to fetch') || String(err?.message || '').includes('Failed to fetch') || String(err).includes('ERR_ADDRESS_UNREACHABLE');

        // Em caso de statement timeout do PostgreSQL (57014), reduz o tamanho do lote para o servidor responder mais rápido
        if (isTimeout) {
            dynamicBatchSize = Math.max(15, Math.floor(dynamicBatchSize / 2));
            console.warn(`Statement timeout detectado no banco de dados. Lote ajustado para ${dynamicBatchSize} registros.`);
        }

        if (tentativa < 3 && !isNetworkErr) {
            const delay = isTimeout ? 2000 : 1500;
            console.log(`Re-tentando carregar solicitações em ${delay / 1000}s (tentativa ${tentativa + 1})...`);
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

    dados.forEach(item => {
        const tr = document.createElement('tr');

        const cpfCnpj = item.dados?.contribuinte?.cpf_cnpj || item.dados?.cpf_cnpj_solicitante || '—';
        const nomeSolicitante = item.dados?.contribuinte?.nome || item.dados?.nome_solicitante || '—';
        const dataInicio = formatarData(item.created_at);
        const dataFinal = item.dados?.data_final ? formatarData(item.dados.data_final) : '—';
        const diasVenc = calcularDiasVencimento(item.dados?.data_final);
        const profileObj = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        const nomeFiscal = profileObj?.nome || item.dados?.fiscal?.nome || item.dados?.fiscal_nome || item.dados?.fiscal?.fiscNome || '—';
        const etapaNumero = item.status === 'cancelado' ? '—' : (extrairEtapaNumero(item) || '—');
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
                <button type="button" class="btn-abrir-processo" onclick="window.abrirProcessoAuto('${item.id || item.processo_id || item.numero_processo}')" data-id="${item.id}" data-etapa="${etapaNumero}" title="Abrir Processo">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Abrir
                </button>
            </td>
        `;

        tr.style.borderLeft = `4px solid ${STATUS_COLORS[statusClass] || '#94a3b8'}`;
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', (e) => {
            if (!e.target.closest('button') && !e.target.closest('input')) {
                window.abrirProcessoAuto(item.id || item.processo_id || item.numero_processo);
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
        fiscal: elFiscal ? elFiscal.value : '',
        status: document.getElementById('filtroStatus')?.value || '',
        dataInicio: document.getElementById('filtroDataInicio')?.value || '',
        dataFim: document.getElementById('filtroDataFim')?.value || '',
        etapa: document.getElementById('filtroEtapa')?.value || '',
        descricao: document.getElementById('filtroDescricao')?.value.trim() || '',
        criador: document.getElementById('filtroCriador')?.value || '',
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
            resultsCount.textContent = `${totalLoaded} solicitação${totalLoaded > 1 ? 'ões' : ''} carregada${totalLoaded > 1 ? 's' : ''}`;
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
        if (document.getElementById('filtroFiscal')) document.getElementById('filtroFiscal').value = '';
        if (document.getElementById('filtroDataInicio')) document.getElementById('filtroDataInicio').value = '';
        if (document.getElementById('filtroDataFim')) document.getElementById('filtroDataFim').value = '';
        if (document.getElementById('filtroEtapa')) document.getElementById('filtroEtapa').value = '';
        if (document.getElementById('filtroDescricao')) document.getElementById('filtroDescricao').value = '';
        if (document.getElementById('filtroCriador')) document.getElementById('filtroCriador').value = '';
        const elResp = document.getElementById('filtroResponsavel');
        if (elResp) elResp.value = '';
        carregarSolicitacoes(false);
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

    // Navegação Menu Lateral (Solicitações / Configurações)
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
            const headerActions = document.querySelector('.header-actions');

            if (page === 'configuracoes') {
                if (secaoSolicitacoes) secaoSolicitacoes.style.display = 'none';
                if (secaoConfiguracoes) secaoConfiguracoes.style.display = 'block';
                if (secaoApuracao) secaoApuracao.style.display = 'none';
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
                if (secaoSolicitacoes) secaoSolicitacoes.style.display = 'none';
                if (secaoConfiguracoes) secaoConfiguracoes.style.display = 'none';
                if (secaoApuracao) secaoApuracao.style.display = 'block';
                if (pageTitle) pageTitle.textContent = 'Apuração de Dados';
                if (headerActions) headerActions.style.display = 'none';

                // Carregar/Renderizar Apuração
                if (typeof window.carregarEExibirApuracaoDados === 'function') {
                    window.carregarEExibirApuracaoDados();
                }
            } else {
                if (secaoSolicitacoes) secaoSolicitacoes.style.display = 'block';
                if (secaoConfiguracoes) secaoConfiguracoes.style.display = 'none';
                if (secaoApuracao) secaoApuracao.style.display = 'none';
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
window.atualizarContagemSelecionados = function () {
    const chks = document.querySelectorAll('.chk-process:checked');
    const lbl = document.getElementById('lblSelecionados');
    if (lbl) {
        lbl.textContent = `${chks.length} selecionado${chks.length !== 1 ? 's' : ''}`;
    }
};

window.excluirProcessosSelecionados = async function () {
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

        while (temMais) {
            let query = supabaseClient
                .from('processos')
                .select(`
                    id,
                    numero_processo,
                    status,
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
                `);

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
        const fiscaisMap = {};

        let globalTotalProcessos = procs.length;
        let globalTotalMultasValor = 0;
        let globalQtdMultas = 0;

        procs.forEach(p => {
            const profileObj = (p.fiscal_id && apuracaoProfilesMap[p.fiscal_id]) || p.profiles || {};
            const fiscalNome = profileObj.nome || p.fiscal_dados?.nome || p.campos?.fiscal?.nome || 'Fiscal Não Atribuído';
            const fiscalIdKey = p.fiscal_id || profileObj.id || fiscalNome;
            const matricula = profileObj.matricula || p.fiscal_dados?.matricula || p.campos?.fiscal?.matricula || '---';

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
            const temAutoOuMulta = (p.etapa_atual_id >= 14 || p.status === 'multa' || p.etapa14 || p.etapa15);
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
                    label: 'Qtd. de Processos',
                    data: dataProcessos,
                    backgroundColor: 'rgba(37, 99, 235, 0.75)',
                    borderColor: '#1d4ed8',
                    borderWidth: 1.5,
                    borderRadius: 8,
                    hoverBackgroundColor: '#2563eb'
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
                    label: 'Valor de Multas (R$)',
                    data: dataMultas,
                    backgroundColor: 'rgba(16, 185, 129, 0.75)',
                    borderColor: '#047857',
                    borderWidth: 1.5,
                    borderRadius: 8,
                    hoverBackgroundColor: '#059669'
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
}

window.exportarApuracaoCSV = function () {
    const elTabela = document.getElementById('tabelaApuracaoFiscaisBody');
    if (!elTabela) return;

    let csvContent = "data:text/csv;charset=utf-8,Fiscal;Matricula;Total Processos;Multas Geradas;Valor Total (R$)\n";
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
