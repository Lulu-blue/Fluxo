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

        const linkProcesso = montarLinkEtapa(item);

        tr.innerHTML = `
            ${devCheckHtml}
            <td class="col-protocolo">
                <a href="${linkProcesso}" class="link-processo" title="Abrir processo (clique com o botão direito para abrir em nova guia)">
                    <span class="protocolo-badge">${item.numero_processo || '—'}</span>
                </a>
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
                <a href="${linkProcesso}" class="btn-abrir-processo" data-id="${item.id}" data-etapa="${etapaNumero}" title="Abrir Processo (botão direito para abrir em nova guia)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Abrir
                </a>
            </td>
        `;

        tr.style.borderLeft = `4px solid ${STATUS_COLORS[statusClass] || '#94a3b8'}`;
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
        responsavel: elResp ? elResp.value : '',
        infracoes: Array.from(document.querySelectorAll('.chk-filtro-infracao:checked')).map(c => c.value)
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
        document.querySelectorAll('.chk-filtro-infracao:checked').forEach(c => c.checked = false);
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

    // Navegação Menu Lateral (Solicitações / Avisos / Instruções / Apuração / Configurações)
    const TITULOS_PAGINA = {
        solicitacoes: 'Solicitações',
        avisos: 'Avisos',
        instrucoes: 'Instruções',
        apuracao: 'Apuração de Dados',
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
            if (breadcrumb) breadcrumb.textContent = 'Painel / ' + (TITULOS_PAGINA[page] || 'Solicitações');

            if (page === 'avisos' || page === 'instrucoes') {
                const secao = document.getElementById('secao-' + page);
                if (secao) secao.style.display = 'block';
                if (pageTitle) pageTitle.textContent = TITULOS_PAGINA[page];
                if (headerActions) headerActions.style.display = 'none';
                if (page === 'instrucoes') restaurarChecklistInstrucoes();
                if (page === 'avisos') renderizarFeedAvisos();
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
                if (pageTitle) pageTitle.textContent = 'Apuração de Dados';
                if (headerActions) headerActions.style.display = 'none';

                // Carregar/Renderizar Apuração
                if (typeof window.carregarEExibirApuracaoDados === 'function') {
                    window.carregarEExibirApuracaoDados();
                }
            } else {
                if (secaoSolicitacoes) secaoSolicitacoes.style.display = 'block';
                if (pageTitle) pageTitle.textContent = 'Solicitações';
                if (headerActions) headerActions.style.display = 'flex';
            }
        });
    });

    configurarChecklistInstrucoes();

    // Faixa temporária no topo: leva para a aba Avisos
    const faixaAviso = document.getElementById('faixaAvisoImportante');
    if (faixaAviso) {
        faixaAviso.addEventListener('click', () => {
            const linkAvisos = document.querySelector('.sidebar-nav a[data-page="avisos"]');
            if (linkAvisos) linkAvisos.click();
        });
    }
}

// ── Avisos (mural de publicações) ───────────────────────────
// Para publicar um aviso novo, acrescente um objeto no INÍCIO desta lista.
// nivel: 'critico' | 'atencao' | 'info'  (cor da etiqueta)
// layout: 'documento' exibe o corpo como peça oficial; qualquer outro valor usa o texto comum.
const AVISOS_PUBLICADOS = [
    {
        id: 'nova-aba-instrucoes',
        nivel: 'info',
        tag: 'Atualização do sistema',
        titulo: 'Nova aba: Instruções',
        data: '11/09/2026',
        autor: 'Desenvolvimento do Fluxograma',
        resumo: 'O passo a passo completo do processo, com dicas e checklist, agora fica sempre disponível no menu lateral.',
        corpo: `
            <p class="pub-lead">Foi adicionada ao menu lateral a aba <strong>Instruções</strong>, com o caminho
            completo de um processo — do momento em que ele é aberto até o clique em <code>Avançar Etapa</code>.</p>

            <h3 class="pub-sub">O que tem lá</h3>
            <ul class="pub-lista">
                <li><strong>Sete passos numerados</strong>, em linguagem direta, na ordem em que as telas aparecem.</li>
                <li>Uma <strong>dica prática</strong> em cada passo, com o detalhe que costuma passar batido.</li>
                <li>Um <strong>checklist marcável</strong> para acompanhar a conferência enquanto você trabalha. Ele
                fica salvo no seu navegador, é individual e ninguém mais vê.</li>
            </ul>

            <h3 class="pub-sub">Para que serve</h3>
            <p class="pub-lead">A ideia é simples: tirar da memória o que não precisa estar lá. Em vez de lembrar em
            que ordem fazer as coisas ou perguntar para quem está do lado, a sequência inteira fica a um clique de
            distância, aberta na tela enquanto o processo é conduzido.</p>

            <p class="pub-lead">Se alguma tela estiver confusa, travando ou puxando algo errado, me procure. Prefiro
            muito mais arrumar o sistema do que ver alguém perdendo tempo com ele.</p>
        `
    },
    {
        id: 'notificacao-preliminar-desatencao',
        nivel: 'critico',
        tag: 'Aviso importante',
        titulo: 'Notificação Preliminar de Desatenção',
        data: '11/09/2026',
        autor: 'Fiscalização de Posturas',
        resumo: 'Documento interno sobre a conferência dos processos: o que temos encontrado, o que isso causa e o que muda com um clique. Leitura recomendada antes de avançar qualquer etapa.',
        layout: 'documento',
        corpo: `
        <div class="doc-notificacao">
            <div class="doc-folha">

                <header class="doc-timbre">
                    <div class="doc-orgao">
                        Divisão de Fiscalização de Posturas &middot; Fluxo de Processos<br>
                        Comunicado interno <strong>CI-001/2026</strong> — via única, sem AR
                    </div>
                    <h1>Notificação <span class="doc-rubro">preliminar</span> de desatenção</h1>
                    <p class="doc-subtitulo">Desta vez o autuado é a gente mesmo. Vale ler com o mesmo cuidado que a
                        gente cobra do contribuinte.</p>
                    <div class="doc-carimbo">Conferido?<span class="doc-caixas">( ) sim &nbsp; ( ) não</span></div>
                </header>

                <dl class="doc-campos">
                    <div class="doc-campo">
                        <dt>Autuado(a)</dt>
                        <dd>Todos nós, quando a pressa fala mais alto</dd>
                    </div>
                    <div class="doc-campo">
                        <dt>CPF/CNPJ</dt>
                        <dd><em>não conferido — como de costume</em></dd>
                    </div>
                    <div class="doc-campo doc-largo">
                        <dt>Dispositivos internos transgredidos</dt>
                        <dd>Art. 1º ao 5º do Manual do Bom Senso — que, curiosamente, nunca foi revogado</dd>
                    </div>
                    <div class="doc-campo">
                        <dt>Prazo para regularização</dt>
                        <dd>Imediato. Venceu ontem, na verdade.</dd>
                    </div>
                    <div class="doc-campo">
                        <dt>Reincidência</dt>
                        <dd>Sim — com uma constância admirável</dd>
                    </div>
                </dl>

                <section class="doc-secao">
                    <span class="doc-eyebrow">I — Preâmbulo</span>
                    <h2>Não é difícil. É pressa.</h2>
                    <p class="doc-lead">Vamos combinar uma coisa antes de começar: o sistema mostra o nome do
                        contribuinte na tela, deixa abrir o PDF antes de anexar e coloca um botão
                        <code>Visualizar</code> colado no arquivo que você acabou de subir. Está tudo à mão, em
                        português, sem senha e sem fila.</p>
                    <p class="doc-lead">O que acontece depois de um documento errado seguir no fluxo é menos simpático:
                        alguém abre processo por processo, um por um, pra descobrir onde foi parar o auto de infração de
                        um contribuinte que não tinha nada a ver com a história. Não é um trabalho difícil. É só um
                        trabalho que não precisava existir.</p>
                    <p class="doc-lead">Então fica o pedido, com todo o carinho: <b>não custa olhar.</b></p>
                </section>

                <section class="doc-secao">
                    <span class="doc-eyebrow">Rol de constatações</span>
                    <h2>Do mais bobo ao imperdoável</h2>

                    <div class="doc-rol">

                        <div class="doc-art">
                            <div class="doc-art-meta"><span>Art. 1º</span><span class="doc-grau leve">Leve</span><span>Frequência: constante</span></div>
                            <h3>Não conferir o nome do contribuinte antes de começar</h3>
                            <p>O nome e o <code>CPF/CNPJ</code> aparecem na tela, na primeira linha, em negrito. Não é
                                letra miúda de contrato, é o cabeçalho. Abrir o processo errado e perceber três etapas
                                depois não chega a ser azar — é a única linha que precisava de dois segundos de
                                leitura.</p>
                            <p class="doc-agravante"><b>Agravante</b>Depois de gerar documento no processo errado, o
                                engano já está em PDF, numerado e com data.</p>
                        </div>

                        <div class="doc-art">
                            <div class="doc-art-meta"><span>Art. 2º</span><span class="doc-grau leve">Leve</span><span>Reincidência: alta</span></div>
                            <h3>Gerar o processo sem ler o relatório</h3>
                            <p>O relatório aparece inteiro na tela antes de virar processo: endereço, motivo da
                                notificação, dispositivo transgredido, tudo montado. Clicar em gerar sem passar o olho é
                                assinar embaixo de um texto que ninguém leu — o que costuma explicar as perguntas sobre
                                por que o endereço saiu errado.</p>
                            <p class="doc-agravante"><b>Agravante</b>Documento gerado consome numeração sequencial.
                                Errou, queimou um número.</p>
                        </div>

                        <div class="doc-art">
                            <div class="doc-art-meta"><span>Art. 3º</span><span class="doc-grau media">Média</span><span>Modalidade: distração seletiva</span></div>
                            <h3>Esquecer que existe um botão de editar</h3>
                            <p>Existe uma aba chamada <code>Editar Dados do Processo</code>. Fica no topo, ao lado da
                                aba do documento oficial, com esse nome exato, escrito por extenso em português. Ninguém
                                escondeu e ninguém precisa de senha. Ela está ali, disponível, sem fila — e mesmo assim
                                raramente é clicada, porque é mais rápido avançar tudo em série e depois dizer que não
                                notou.</p>
                            <p class="doc-agravante"><b>Agravante</b>O sistema é novo, e sistema novo pede
                                <b>mais</b> cuidado, não menos — ainda mais quando o que está em jogo é documentação com
                                o CPF de outras pessoas. Eu sentei com cada um pra ensinar e continuo disponível pra
                                quem quiser perguntar. Perguntar, aliás, costuma funcionar bem melhor do que reclamar
                                depois.</p>
                        </div>

                        <div class="doc-art">
                            <div class="doc-art-meta"><span>Art. 4º</span><span class="doc-grau media">Média</span><span>Consequência: assinatura em erro</span></div>
                            <h3>Baixar e assinar sem abrir o que baixou</h3>
                            <p>Entre clicar em <code>Baixar Relatório (.pdf)</code> e estampar a assinatura existe um
                                passo pequeno: <b>abrir o arquivo</b>. Duplo clique, dez segundos. Pular esse passo
                                significa garantir com o nome funcional o conteúdo de um documento que ninguém viu.</p>
                            <p class="doc-agravante"><b>Agravante</b>Documento assinado errado não se conserta editando.
                                Refaz-se inteiro.</p>
                        </div>

                        <div class="doc-art doc-capital">
                            <div class="doc-art-meta"><span>Art. 5º</span><span class="doc-grau grave">Gravíssima</span><span>Sem atenuantes</span></div>
                            <h3>Anexar documento de outro processo e avançar etapa sem olhar</h3>
                            <p>Esta é a campeã: um auto de infração de <b>outro contribuinte</b> anexado no processo
                                errado, seguido de um <code>Avançar Etapa</code> sem que ninguém tenha clicado em
                                <code>Visualizar</code> uma única vez.</p>
                            <p>E o <code>Visualizar</code> fica ao lado do anexo. No mesmo cartão. Colado no
                                <code>Substituir / Remover</code>. Abre o PDF em outra aba. É um clique. <b>Um.</b></p>
                            <p>O resultado é o dado de um cidadão dentro do processo de outro, um documento que não
                                sustenta o que deveria sustentar, um processo que pode ser questionado — e a tarefa,
                                para alguém, de varrer processo por processo até achar cada documento trocado.</p>
                            <p>E isso não fica entre nós: <b>esses processos seguem para a Fazenda</b> — com o nome de
                                vocês e com a <b>assinatura</b> de vocês no documento. Quem assina é quem responde pelo
                                que assinou, e nesse ponto não tem sistema, nem estágio, nem tela que assuma o lugar de
                                ninguém.</p>
                            <p class="doc-agravante"><b>Agravante máximo</b>Depois que a etapa avança, o documento já
                                circulou. O que era um detalhe de dois segundos vira problema de todo mundo.</p>
                        </div>

                    </div>
                </section>

                <section class="doc-secao">
                    <span class="doc-eyebrow">II — Sobre avançar tudo de uma vez</span>
                    <h2>Ninguém vai ficar sem pontuação</h2>
                    <p class="doc-lead">A pressa costuma ter um motivo, e não é muito difícil adivinhar qual é. Então
                        vamos tirar esse peso da mesa agora.</p>
                    <p class="doc-lead"><b>Está tudo salvo.</b> Cada etapa avançada, cada documento gerado e cada anexo
                        enviado fica registrado no banco, com autor e data. Nada se perde porque alguém foi devagar. O
                        que se perde é quando o documento sai errado — e esse, sim, não volta.</p>

                    <p class="doc-destaque">A pontuação fecha no fim do mês. Não é hoje, não é agora.</p>

                    <p class="doc-lead">A integração com o outro sistema ainda tem defeito, eu sei — e estou
                        corrigindo. É uma estagiária construindo isso, então vai no ritmo que dá. Mas defeito de
                        integração eu conserto até o fechamento. Auto de infração assinado no processo errado, que já
                        saiu daqui com o nome de vocês, esse eu não consigo consertar.</p>
                    <p class="doc-lead">Ou seja: não há motivo nenhum pra avançar etapa no automático. <b>O mês inteiro
                            está disponível. Dá pra gastar trinta segundos.</b></p>
                </section>

                <section class="doc-secao">
                    <span class="doc-eyebrow">III — Medidas para regularização</span>
                    <h2>O processo, do começo ao fim</h2>
                    <p class="doc-lead">Sete passos. Nenhum deles é difícil, e todos são obrigatórios. O passo a passo
                        detalhado, com dicas, está na aba <b>Instruções</b>.</p>

                    <ol class="doc-passos">
                        <li>
                            <h3>Confira de quem é o processo antes de tocar em qualquer coisa</h3>
                            <p>Leia o <code>Protocolo</code>, o <b>Nome do Contribuinte</b> e o <code>CPF/CNPJ</code>.
                                Confirme que é esse mesmo. Só então continue.</p>
                            <p class="doc-obs"><b>Não vale</b><span>Abrir o primeiro da lista e presumir que é o
                                    certo.</span></p>
                        </li>
                        <li>
                            <h3>Preencha e revise os dados antes de gerar</h3>
                            <p>Endereço, motivo da notificação e dispositivos transgredidos. O sistema puxa esses campos
                                automaticamente para a Notificação, para a Réplica e para o Auto — errado aqui é errado
                                em tudo que vier depois.</p>
                            <p class="doc-obs"><b>Lembre</b><span>Os dados vêm de um PDF. A extração acerta quase
                                    sempre, não sempre.</span></p>
                        </li>
                        <li class="doc-chave">
                            <h3>Precisa corrigir algo? A aba se chama "Editar Dados do Processo"</h3>
                            <p>Topo da tela, ao lado da aba do documento oficial. Corrija <b>antes</b> de gerar, não
                                depois de descobrir o erro já assinado.</p>
                            <p class="doc-obs"><b>Não vale</b><span>Pedir para alguém ajustar no banco o que se resolve
                                    em dois cliques na própria tela.</span></p>
                        </li>
                        <li>
                            <h3>Leia o documento na tela antes de gerar</h3>
                            <p>O relatório aparece montado, com cabeçalho, numeração e texto final. Leia. Se estiver
                                errado, volte ao passo 3. Só depois gere.</p>
                            <p class="doc-obs"><b>Lembre</b><span>Cada documento gerado consome um número da sequência.
                                    Errar aqui custa um número a mais.</span></p>
                        </li>
                        <li>
                            <h3>Baixe o PDF e abra o arquivo</h3>
                            <p>Clique em <code>Baixar Relatório (.pdf)</code>, abra o PDF e confira nome, endereço e
                                número da notificação <b>dentro</b> do arquivo. Só então imprima e assine.</p>
                            <p class="doc-obs"><b>Não vale</b><span>Assinar uma pilha de papel sem olhar folha por
                                    folha.</span></p>
                        </li>
                        <li class="doc-chave">
                            <h3>Anexe o assinado — e clique em "Visualizar"</h3>
                            <p>Suba o PDF no campo de anexo da etapa. Depois de subir, clique em
                                <code>Visualizar</code>, ao lado do anexo, e confirme com os próprios olhos que o nome
                                do contribuinte e o número da notificação no PDF são <b>os deste processo</b>.</p>
                            <p class="doc-obs"><b>Errou o arquivo?</b><span>O <code>Substituir / Remover</code> está
                                    logo ali, do lado. Não custa nada e ninguém fica sabendo.</span></p>
                        </li>
                        <li class="doc-chave">
                            <h3>Só agora clique em "Avançar Etapa"</h3>
                            <p>Avançar é o último ato, não o primeiro. Depois dele o documento entra no fluxo e vai para
                                a próxima mesa com o seu nome nele.</p>
                            <p class="doc-obs"><b>Antes de clicar</b><span>Percorra o checklist abaixo. Leva menos tempo
                                    do que desfazer.</span></p>
                        </li>
                    </ol>
                </section>

                <section class="doc-secao">
                    <span class="doc-eyebrow">IV — Termo de compromisso</span>
                    <h2>Checklist antes de avançar etapa</h2>
                    <p class="doc-lead">Use a cada processo. Se sobrar qualquer item em branco, ainda não terminou. É o
                        mesmo checklist da aba Instruções — marcar aqui marca lá.</p>

                    <div class="doc-checklist">
                        <div class="doc-checklist-topo">
                            <h3>Checagem obrigatória</h3>
                            <button type="button" class="doc-limpar" id="btnLimparChecklistDoc">Limpar para o próximo
                                processo</button>
                        </div>

                        <label class="doc-item" for="chkDoc1"><input type="checkbox" id="chkDoc1" data-chk="1"><span>Li
                                o <b>nome do contribuinte</b> e o CPF/CNPJ na tela e confirmei que é este
                                processo.</span></label>
                        <label class="doc-item" for="chkDoc2"><input type="checkbox" id="chkDoc2"
                                data-chk="2"><span>Revisei endereço, motivo e dispositivos transgredidos <b>antes</b> de
                                gerar.</span></label>
                        <label class="doc-item" for="chkDoc3"><input type="checkbox" id="chkDoc3"
                                data-chk="3"><span>Usei a aba <b>Editar Dados do Processo</b> para corrigir o que estava
                                errado.</span></label>
                        <label class="doc-item" for="chkDoc4"><input type="checkbox" id="chkDoc4" data-chk="4"><span>Li
                                o documento inteiro na tela antes de clicar em gerar.</span></label>
                        <label class="doc-item" for="chkDoc5"><input type="checkbox" id="chkDoc5"
                                data-chk="5"><span>Abri o PDF baixado e conferi o conteúdo antes de assinar.</span></label>
                        <label class="doc-item" for="chkDoc6"><input type="checkbox" id="chkDoc6"
                                data-chk="6"><span>Cliquei em <b>Visualizar</b> depois de anexar e vi o documento com
                                meus próprios olhos.</span></label>
                        <label class="doc-item" for="chkDoc7"><input type="checkbox" id="chkDoc7"
                                data-chk="7"><span>Confirmei que o documento anexado é <b>deste contribuinte</b>, e não
                                de outro processo.</span></label>

                        <p class="doc-placar" data-placar>0 de 7 conferidos — não avance ainda.</p>
                    </div>
                </section>

                <section class="doc-desabafo">
                    <span class="doc-eyebrow">V — Nota de quem construiu isto &middot; desabafo, fora do documento
                        oficial</span>
                    <h2>É um PDF. Eu não faço milagre.</h2>

                    <div class="doc-desabafo-corpo">
                        <p>Vou sair do tom de ofício por um instante, porque esta parte não é institucional: é minha.</p>
                        <p>Este sistema foi feito por <b>uma pessoa</b>, do lado de vocês, pra tirar trabalho manual da
                            mão de vocês. Eu sentei com cada um pra ensinar, e continuo disponível pra quem chegar e
                            perguntar. Cansa um pouco ouvir que o sistema é ruim vindo de quem ainda não abriu o que
                            anexou.</p>
                        <p>E tem uma parte que eu preciso que fique clara: os dados do contribuinte são extraídos de um
                            <b>PDF</b>. Um PDF. Nenhuma extração garante 100% em todos os casos — nem a minha, nem
                            nenhuma. <b>É exatamente por isso que a conferência existe, e é por isso que ela é de
                                vocês.</b> Eu entrego o campo já preenchido e editável; olhar se puxou certo leva o
                            tempo de ler uma linha.</p>
                        <p>Achar chato corrigir o nome de uma rua, num campo que já veio preenchido, num formulário que
                            já montou o documento inteiro — não é exatamente excesso de trabalho.</p>
                        <p class="doc-cansada">E sim: eu estou cansada. Muito.</p>
                        <p>Ainda assim eu vou continuar arrumando os defeitos, porque eu quero que isso funcione bem pra
                            vocês. Só peço a contrapartida mais barata que existe: <b>clicar em Visualizar antes de
                                avançar.</b></p>
                        <p class="doc-escolha">A alternativa, afinal, é voltar a fazer o documento inteiro do zero, na
                            mão, como era antes. A gente escolhe.</p>
                    </div>
                </section>

                <footer class="doc-rodape">
                    <p class="doc-nota-final">Nada aqui exige treinamento novo, permissão especial ou sistema
                        diferente. Exige <strong>abrir o que foi anexado antes de mandar pra frente</strong>. O botão
                        está lá. Sempre esteve.</p>
                    <div class="doc-assinatura">Divisão de Fiscalização de Posturas<br>Ciente em ____/____/______</div>
                </footer>

            </div>
        </div>
        `
    }
];

function renderizarFeedAvisos() {
    const feed = document.getElementById('avisosFeed');
    if (!feed) return;

    // Volta sempre para a lista ao entrar na aba
    fecharAviso();

    feed.innerHTML = AVISOS_PUBLICADOS.map(aviso => `
        <article class="aviso-pub ${aviso.nivel}" data-aviso="${aviso.id}" role="button" tabindex="0">
            <div class="aviso-topo">
                <span class="aviso-tag">${aviso.tag}</span>
                <span class="aviso-data">${aviso.data}</span>
            </div>
            <h3>${aviso.titulo}</h3>
            <p>${aviso.resumo}</p>
            <span class="aviso-link">Ler publicação &rarr;</span>
        </article>
    `).join('');

    feed.querySelectorAll('[data-aviso]').forEach(card => {
        card.addEventListener('click', () => abrirAviso(card.getAttribute('data-aviso')));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                abrirAviso(card.getAttribute('data-aviso'));
            }
        });
    });
}

function abrirAviso(id) {
    const aviso = AVISOS_PUBLICADOS.find(a => a.id === id);
    const lista = document.getElementById('avisosLista');
    const leitura = document.getElementById('avisosLeitura');
    if (!aviso || !lista || !leitura) return;

    const ehDocumento = aviso.layout === 'documento';
    leitura.className = 'aviso-leitura ' + aviso.nivel + (ehDocumento ? ' documento' : '');

    const cabecalho = ehDocumento ? '' : `
        <div class="aviso-leitura-topo">
            <span class="aviso-tag">${aviso.tag}</span>
            <span class="aviso-data">Publicado em ${aviso.data} &middot; ${aviso.autor}</span>
        </div>
        <h2>${aviso.titulo}</h2>
    `;

    leitura.innerHTML = `
        <button type="button" class="btn-inline aviso-voltar" id="btnVoltarAvisos">&larr; Voltar aos avisos</button>
        ${cabecalho}
        <div class="aviso-leitura-corpo">${aviso.corpo}</div>
    `;

    lista.style.display = 'none';
    leitura.style.display = 'block';
    document.getElementById('btnVoltarAvisos').addEventListener('click', fecharAviso);

    // O documento traz uma cópia do checklist; religa os eventos e restaura o estado.
    if (ehDocumento) configurarChecklistInstrucoes();

    const wrapper = document.querySelector('.main-wrapper');
    if (wrapper) wrapper.scrollTop = 0;
}

function fecharAviso() {
    const lista = document.getElementById('avisosLista');
    const leitura = document.getElementById('avisosLeitura');
    if (lista) lista.style.display = 'block';
    if (leitura) {
        leitura.style.display = 'none';
        leitura.innerHTML = '';
    }
}

// ── Checklist de conferência (aba Instruções e documento de Avisos) ──
// As duas telas mostram o mesmo checklist; o estado é identificado por data-chk,
// então marcar em uma reflete na outra. Persistência local, por navegador.
const CHAVE_CHECKLIST_INSTRUCOES = 'fluxograma:checklist-instrucoes';
const TOTAL_ITENS_CHECKLIST = 7;

function lerChecklistInstrucoes() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_CHECKLIST_INSTRUCOES)) || {};
    } catch (e) {
        return {};
    }
}

function gravarChecklistInstrucoes(estado) {
    try {
        localStorage.setItem(CHAVE_CHECKLIST_INSTRUCOES, JSON.stringify(estado));
    } catch (e) {
        /* navegador sem storage disponível — segue sem persistir */
    }
}

function atualizarPlacarChecklist() {
    const estado = lerChecklistInstrucoes();
    const feitos = Object.values(estado).filter(Boolean).length;
    const completo = feitos === TOTAL_ITENS_CHECKLIST;
    const texto = completo
        ? `${TOTAL_ITENS_CHECKLIST} de ${TOTAL_ITENS_CHECKLIST} conferidos — pode avançar a etapa.`
        : `${feitos} de ${TOTAL_ITENS_CHECKLIST} conferidos.`;

    document.querySelectorAll('#placarChecklist, [data-placar]').forEach(placar => {
        placar.textContent = texto;
        placar.classList.toggle('ok', completo);
    });
}

function restaurarChecklistInstrucoes() {
    const salvo = lerChecklistInstrucoes();
    document.querySelectorAll('input[type="checkbox"][data-chk]').forEach(input => {
        input.checked = !!salvo[input.dataset.chk];
    });
    atualizarPlacarChecklist();
}

function configurarChecklistInstrucoes() {
    document.querySelectorAll('input[type="checkbox"][data-chk]').forEach(input => {
        if (input.dataset.ligado === '1') return;
        input.dataset.ligado = '1';
        input.addEventListener('change', () => {
            const estado = lerChecklistInstrucoes();
            estado[input.dataset.chk] = input.checked;
            gravarChecklistInstrucoes(estado);
            restaurarChecklistInstrucoes();
        });
    });

    document.querySelectorAll('#btnLimparChecklist, #btnLimparChecklistDoc').forEach(btn => {
        if (btn.dataset.ligado === '1') return;
        btn.dataset.ligado = '1';
        btn.addEventListener('click', () => {
            gravarChecklistInstrucoes({});
            restaurarChecklistInstrucoes();
        });
    });

    restaurarChecklistInstrucoes();
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
            await supabaseClient.rpc('atualizar_notificacoes_processo', {
                p_processo_id: item.id,
                p_notificacoes: item.dados.notificacoes_menu
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
            item.dados.notificacoes_menu.forEach(n => n.lida = true);
            if (item.id) {
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
            item.dados.notificacoes_menu = item.dados.notificacoes_menu.filter(n => !n.lida);
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
    const item = (dadosTabela || []).find(i => i.id === processoId);
    if (item && item.dados?.notificacoes_menu) {
        item.dados.notificacoes_menu.splice(idx, 1);
        try {
            await supabaseClient.rpc('atualizar_notificacoes_processo', {
                p_processo_id: item.id,
                p_notificacoes: item.dados.notificacoes_menu
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

            // 2. Notificações NÃO têm numeração própria reservada (reservar_numero nunca é
            // chamado com categoria 'Notificação') — o campo `numero` de cada notificação é
            // só "{numero_processo}/NN" (ver etapa.js). Por isso não devolvemos nada aqui:
            // devolver esse valor sob a categoria 'Notificação' reinseria o número do
            // PROCESSO (já devolvido corretamente acima como 'Processo') sob a categoria
            // errada, causando duplicidade/confusão nas numerações disponíveis.

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
