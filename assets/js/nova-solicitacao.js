/* ============================================================
   NOVA SOLICITAÇÃO — Etapa 1: Wizard de 5 passos
   ============================================================ */

const STEP_LABELS = ['Contribuinte', 'Imóvel', 'Fiscal', 'Infrações', 'Relatório Fiscal'];
let currentWizardStep = 1;
const TOTAL_STEPS = 5;
let fiscalData = { nome: '', matricula: '', cargo: '' };
let selectedImages = [];
let isWizardLoading = false;
window.relatorioCustomizadoHTML = null;
const BRASAO_PREFEITURA_BASE64 = "assets/img/brasao_semac.jpeg";
let relatorioEditorAberto = false;
let numerosReservadosEditor = { processo: null, relatorio: null };

// ── Helper: converter arquivo para Base64 ───────────────────
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
}

// ── Inicialização ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    bindWizardEventos();
    // Data da vistoria padrão = hoje (com hora)
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('fiscDataVistoria').value = now.toISOString().slice(0, 16);
});

// ── Abrir / Fechar Modal ────────────────────────────────────
function abrirModal() {
    const modal = document.getElementById('modalNovaSolicitacao');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    currentWizardStep = 1;
    atualizarWizard();
    carregarDadosFiscal();
}

function fecharModal() {
    const modal = document.getElementById('modalNovaSolicitacao');
    modal.classList.remove('open');
    document.body.style.overflow = '';
}

// ── Carregar dados do fiscal logado ─────────────────────────
async function carregarDadosFiscal() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        // 1. Tentar por auth_id na tabela profiles
        let { data: usuario } = await supabaseClient
            .from('profiles')
            .select('id, nome, matricula, cargo, cpf, auth_id')
            .eq('auth_id', session.user.id)
            .maybeSingle();

        // 2. Tentar pelo CPF extraído do email de login (ex: 22222222222@email.com)
        if (!usuario && session.user.email) {
            const cpfLimpo = session.user.email.split('@')[0].replace(/\D/g, '');
            if (cpfLimpo) {
                let res = await supabaseClient
                    .from('profiles')
                    .select('id, nome, matricula, cargo, cpf, auth_id')
                    .eq('cpf', cpfLimpo)
                    .maybeSingle();
                if (!res.data && cpfLimpo.length === 11) {
                    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                    res = await supabaseClient
                        .from('profiles')
                        .select('id, nome, matricula, cargo, cpf, auth_id')
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

        if (usuario) {
            fiscalData = { nome: usuario.nome || '', matricula: usuario.matricula || '', cargo: usuario.cargo || '' };
            document.getElementById('fiscNome').value = fiscalData.nome;
            document.getElementById('fiscMatricula').value = fiscalData.matricula;
        } else {
            // Se não encontrar no banco, preencher com o nome do cabeçalho
            const nomeHeader = document.getElementById('userName')?.textContent;
            if (nomeHeader && nomeHeader !== 'Usuário') {
                document.getElementById('fiscNome').value = nomeHeader;
            }
        }
    } catch (err) {
        console.error('Erro ao carregar dados do fiscal:', err);
    }
}

// ── Navegação do Wizard ─────────────────────────────────────
function atualizarWizard() {
    // Mostrar/esconder steps
    for (let i = 1; i <= TOTAL_STEPS; i++) {
        const el = document.getElementById(`step${i}`);
        if (el) el.style.display = i === currentWizardStep ? 'block' : 'none';
    }

    // Progress bar
    document.querySelectorAll('.progress-step').forEach(s => {
        const n = parseInt(s.dataset.step);
        s.classList.toggle('active', n === currentWizardStep);
        s.classList.toggle('completed', n < currentWizardStep);
    });

    // Label
    document.getElementById('modalStepLabel').textContent =
        `Passo ${currentWizardStep} de ${TOTAL_STEPS} — ${STEP_LABELS[currentWizardStep - 1]}`;

    // Botões
    document.getElementById('btnWizardVoltar').style.display = currentWizardStep > 1 ? 'flex' : 'none';
    document.getElementById('btnWizardAvancar').style.display = currentWizardStep < TOTAL_STEPS ? 'flex' : 'none';
    document.getElementById('btnWizardFinalizar').style.display = currentWizardStep === TOTAL_STEPS ? 'flex' : 'none';

    // Scroll top do modal body
    document.querySelector('.modal-body').scrollTop = 0;
}

async function avancarStep() {
    if (isWizardLoading) return;
    if (!validarStep(currentWizardStep)) return;

    setWizardLoading(true);
    try {
        if (currentWizardStep === 1) {
            await buscarContribuinteNoBanco(true);
        }
        if (currentWizardStep === 2) {
            await buscarImovelNoBanco(true);
        }
        if (currentWizardStep < TOTAL_STEPS) {
            currentWizardStep++;
            if (currentWizardStep === 5) {
                prepararEtapaRelatorio();
            }
            atualizarWizard();
        }
    } finally {
        setWizardLoading(false);
    }
}

// Controla estado de carregamento dos botões do wizard (evita duplo clique)
function setWizardLoading(carregando) {
    isWizardLoading = carregando;
    const btnAvancar = document.getElementById('btnWizardAvancar');
    const btnFinalizar = document.getElementById('btnWizardFinalizar');

    if (btnAvancar) {
        if (carregando) {
            if (!btnAvancar.dataset.originalHtml) btnAvancar.dataset.originalHtml = btnAvancar.innerHTML;
            btnAvancar.disabled = true;
            btnAvancar.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;"></div> Carregando...`;
        } else {
            btnAvancar.disabled = false;
            btnAvancar.innerHTML = btnAvancar.dataset.originalHtml || `Avançar <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
        }
    }

    if (btnFinalizar) {
        if (carregando) {
            if (!btnFinalizar.dataset.originalHtml) btnFinalizar.dataset.originalHtml = btnFinalizar.innerHTML;
            btnFinalizar.disabled = true;
            btnFinalizar.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;"></div> Criando Notificação...`;
        } else {
            btnFinalizar.disabled = false;
            btnFinalizar.innerHTML = btnFinalizar.dataset.originalHtml || `Finalizar Solicitação <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
        }
    }
}

function voltarStep() {
    if (currentWizardStep > 1) {
        currentWizardStep--;
        atualizarWizard();
    }
}

// ── Validação por step ──────────────────────────────────────
function validarStep(step) {
    switch (step) {
        case 1: {
            const obrigatoriosContribuinte = [
                { id: 'contNome', nome: 'Nome do Contribuinte' },
                { id: 'contCpfCnpj', nome: 'CPF/CNPJ do Contribuinte' },
                { id: 'contLogradouro', nome: 'Logradouro do Contribuinte' },
                { id: 'contNumero', nome: 'Número do Contribuinte' },
                { id: 'contBairro', nome: 'Bairro do Contribuinte' },
                { id: 'contMunicipio', nome: 'Município do Contribuinte' },
                { id: 'contCep', nome: 'CEP do Contribuinte' }
            ];
            for (const campo of obrigatoriosContribuinte) {
                if (!document.getElementById(campo.id)?.value?.trim()) {
                    alert(`O campo "${campo.nome}" é obrigatório.`);
                    document.getElementById(campo.id)?.focus();
                    return false;
                }
            }
            return true;
        }
        case 2: {
            const obrigatoriosImovel = [
                { id: 'imvCodigo', nome: 'Código Reduzido do Imóvel' },
                { id: 'imvInscricao', nome: 'Inscrição do Imóvel' },
                { id: 'imvLogradouro', nome: 'Logradouro do Imóvel' },
                { id: 'imvNumero', nome: 'Número do Imóvel' },
                { id: 'imvBairro', nome: 'Bairro do Imóvel' },
                { id: 'imvAreaTotal', nome: 'Área Total do Imóvel' },
                { id: 'imvTestada', nome: 'Testada do Imóvel' }
            ];
            for (const campo of obrigatoriosImovel) {
                if (!document.getElementById(campo.id)?.value?.trim()) {
                    alert(`O campo "${campo.nome}" é obrigatório.`);
                    document.getElementById(campo.id)?.focus();
                    return false;
                }
            }
            return true;
        }
        case 3: {
            const dataVistoria = document.getElementById('fiscDataVistoria')?.value?.trim();
            if (!dataVistoria) {
                alert('Informe a Data da Vistoria.');
                document.getElementById('fiscDataVistoria')?.focus();
                return false;
            }

            const decreto = document.getElementById('fiscDecreto').value;
            if (!decreto) {
                alert('Informe se é decorrente de Decreto de Notificação.');
                document.getElementById('fiscDecreto')?.focus();
                return false;
            }

            if (decreto === 'sim') {
                const arquivoDecreto = document.getElementById('inputDecreto')?.files?.[0];
                const nomeDecreto = document.getElementById('decretoFileName')?.textContent?.trim();
                if (!arquivoDecreto && !nomeDecreto) {
                    alert('Anexe o arquivo do Decreto de Notificação.');
                    return false;
                }
            }

            return true;
        }
        case 4: {
            const checked = document.querySelectorAll('input[name="infracao"]:checked');
            if (checked.length === 0) {
                alert('Selecione pelo menos um dispositivo legal transgredido.');
                return false;
            }
            return true;
        }
        case 5: {
            const atendimentoTipo = document.getElementById('relAtendimentoTipo')?.value?.trim();
            const atendimentoValor = document.getElementById('relAtendimentoValor')?.value?.trim();
            const assunto = document.getElementById('relAssunto')?.value?.trim();
            
            if (!atendimentoTipo || !atendimentoValor) {
                alert('Informe o tipo e o valor para "Para atendimento".');
                if (!atendimentoTipo) document.getElementById('relAtendimentoTipo')?.focus();
                else document.getElementById('relAtendimentoValor')?.focus();
                return false;
            }
            if (!assunto) {
                alert('Informe o "Assunto".');
                document.getElementById('relAssunto')?.focus();
                return false;
            }
            return true;
        }
    }
    return true;
}

// ── Validação CPF/CNPJ (algoritmo matemático) ──────────────
function validarCpfCnpj(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 11) return validarCPF(digits);
    if (digits.length === 14) return validarCNPJ(digits);
    return false;
}

function validarCPF(cpf) {
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
    let rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    if (rest !== parseInt(cpf[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    return rest === parseInt(cpf[10]);
}

function validarCNPJ(cnpj) {
    if (/^(\d)\1{13}$/.test(cnpj)) return false;
    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(cnpj[i]) * weights1[i];
    let rest = sum % 11;
    const d1 = rest < 2 ? 0 : 11 - rest;
    if (parseInt(cnpj[12]) !== d1) return false;
    sum = 0;
    for (let i = 0; i < 13; i++) sum += parseInt(cnpj[i]) * weights2[i];
    rest = sum % 11;
    const d2 = rest < 2 ? 0 : 11 - rest;
    return parseInt(cnpj[13]) === d2;
}

// ── Máscara CPF/CNPJ ────────────────────────────────────────
function aplicarMascaraCpfCnpj(input) {
    input.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length <= 11) {
            if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
            else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
            else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        } else {
            v = v.slice(0, 14);
            v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
        }
        e.target.value = v;
    });
}

// ── Decomposição da inscrição do imóvel ─────────────────────
function decomporInscricao(inscricao) {
    // Formato: 01.036.00181.00300.00000.0
    const parts = inscricao.replace(/\s/g, '').split('.');
    if (parts.length >= 4) {
        document.getElementById('imvZona').textContent = parts[0] || '—';
        document.getElementById('imvSetor').textContent = parts[1] || '—';
        document.getElementById('imvQuadra').textContent = parts[2] || '—';
        document.getElementById('imvLote').textContent = parts[3] || '—';
        document.getElementById('inscriptionBreakdown').style.display = 'flex';
    } else {
        document.getElementById('inscriptionBreakdown').style.display = 'none';
    }
}

// ── Feedback visual ─────────────────────────────────────────
function mostrarFeedback(elId, msg, type) {
    const el = document.getElementById(elId);
    el.textContent = msg;
    el.className = `input-feedback ${type}`;
    if (type === 'success') setTimeout(() => { el.textContent = ''; el.className = 'input-feedback'; }, 3000);
}

// ── Finalizar solicitação ───────────────────────────────────
async function finalizarSolicitacao() {
    if (isWizardLoading) return;
    if (!validarStep(4)) return;

    setWizardLoading(true);

    try {
        const dados = coletarTodosDados();

        // 1. Verificar sessão ativa e identificar fiscal
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            alert('Sua sessão expirou. Faça login novamente.');
            return;
        }

        let profileId = window.currentUserProfile?.id;
        if (!profileId) {
            const { data: pData } = await supabaseClient
                .from('profiles')
                .select('id')
                .eq('auth_id', session.user.id)
                .maybeSingle();
            if (pData) profileId = pData.id;
        }

        if (!profileId) {
            alert('Erro: ID do perfil do fiscal não identificado.');
            return;
        }

        // 3. Gerar numeração do processo e do relatório
        const anoAtual = new Date().getFullYear();
        let numeroProcesso = numerosReservadosEditor.processo;
        let numeroRelatorio = numerosReservadosEditor.relatorio;

        if (!numeroProcesso) {
            const { data: np, error: errNumProc } = await supabaseClient
                .rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Processo' });
            if (errNumProc || !np) {
                throw new Error('Falha ao reservar número de processo: ' + (errNumProc?.message || 'resposta vazia da RPC'));
            }
            numeroProcesso = np;
        }

        if (!numeroRelatorio) {
            const { data: nr, error: errNumRel } = await supabaseClient
                .rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Relatório Fiscal' });
            if (errNumRel || !nr) {
                throw new Error('Falha ao reservar número do relatório: ' + (errNumRel?.message || 'resposta vazia da RPC'));
            }
            numeroRelatorio = nr;
        }

        // Limpa os números reservados para não devolvê-los acidentalmente após o uso
        numerosReservadosEditor.processo = null;
        numerosReservadosEditor.relatorio = null;

        // Antes de salvar, vamos gerar o documento final em PDF do Relatório
        dados.relatorio_fiscal.numero_relatorio = numeroRelatorio;

        // 4. Determinar a Etapa 1
        let etapaId = 1;
        const { data: etapa1 } = await supabaseClient
            .from('etapas')
            .select('id')
            .eq('numero', 1)
            .maybeSingle();
        if (etapa1) etapaId = etapa1.id;

        // 5. Inserir processo em 'processos' com verificação automática de colisão
        const novoProcessoObj = {
            fiscal_id: profileId,
            etapa_atual_id: etapaId,
            status: 'em_aberto',
            possui_decreto: dados.fiscal.decreto === 'sim',
            processo_existente: dados.infracoes.processo_existente === 'sim',
            processo_existente_ref: dados.infracoes.processo_ref || null,
            data_vistoria: dados.fiscal.data_vistoria || null,
            descricao_fiscalizacao: dados.fiscal.descricao || null,
            dados: {
                contribuinte: dados.contribuinte,
                imovel: dados.imovel,
                fiscal: dados.fiscal,
                infracoes: dados.infracoes,
                relatorio_fiscal: dados.relatorio_fiscal
            },
            numero_relatorio: numeroRelatorio
        };

        novoProcessoObj.numero_processo = numeroProcesso;

        const { data: procCriado, error: errProc } = await supabaseClient
            .from('processos')
            .insert([novoProcessoObj])
            .select()
            .single();

        if (errProc) {
            console.error('Erro ao inserir processo:', errProc);
            // Devolve os números para a fila caso a inserção falhe
            await supabaseClient.rpc('devolver_numero', { p_numero: numeroProcesso, p_categoria: 'Processo' }).catch(() => { });
            await supabaseClient.rpc('devolver_numero', { p_numero: numeroRelatorio, p_categoria: 'Relatório Fiscal' }).catch(() => { });
            throw new Error(errProc?.message || 'Falha ao gravar o processo no banco de dados.');
        }

        // 6. Inserir registro em 'contribuintes' apenas se ainda não existir
        if (dados.contribuinte && dados.contribuinte.nome) {
            let contExistente = null;
            if (dados.contribuinte.cpf_cnpj) {
                const { data } = await supabaseClient
                    .from('contribuintes')
                    .select('id')
                    .eq('cpf_cnpj', dados.contribuinte.cpf_cnpj)
                    .limit(1);
                if (data && data.length > 0) contExistente = data[0];
            }
            if (!contExistente) {
                const { data } = await supabaseClient
                    .from('contribuintes')
                    .select('id')
                    .ilike('nome', dados.contribuinte.nome)
                    .limit(1);
                if (data && data.length > 0) contExistente = data[0];
            }

            if (!contExistente) {
                await supabaseClient
                    .from('contribuintes')
                    .insert([{
                        processo_id: procCriado.id,
                        nome: dados.contribuinte.nome,
                        cpf_cnpj: dados.contribuinte.cpf_cnpj || null,
                        logradouro: dados.contribuinte.logradouro || null,
                        numero: dados.contribuinte.numero || null,
                        complemento: dados.contribuinte.complemento || null,
                        bairro: dados.contribuinte.bairro || null,
                        municipio: dados.contribuinte.municipio || null,
                        cep: dados.contribuinte.cep || null
                    }]);
            }
        }

        // 7. Inserir registro em 'imoveis' apenas se ainda não existir
        if (dados.imovel && (dados.imovel.inscricao || dados.imovel.logradouro || dados.imovel.codigo_reduzido)) {
            let imovelExistente = null;
            if (dados.imovel.codigo_reduzido) {
                const { data } = await supabaseClient
                    .from('imoveis')
                    .select('id')
                    .eq('codigo_reduzido', dados.imovel.codigo_reduzido)
                    .limit(1);
                if (data && data.length > 0) imovelExistente = data[0];
            }
            if (!imovelExistente && dados.imovel.inscricao) {
                const { data } = await supabaseClient
                    .from('imoveis')
                    .select('id')
                    .eq('inscricao_imovel', dados.imovel.inscricao)
                    .limit(1);
                if (data && data.length > 0) imovelExistente = data[0];
            }

            if (!imovelExistente) {
                const pFloat = (v) => v ? parseFloat(String(v).replace(',', '.')) || null : null;
                await supabaseClient
                    .from('imoveis')
                    .insert([{
                        processo_id: procCriado.id,
                        codigo_reduzido: dados.imovel.codigo_reduzido || null,
                        inscricao_imovel: dados.imovel.inscricao || null,
                        logradouro: dados.imovel.logradouro || null,
                        numero: dados.imovel.numero || null,
                        complemento: dados.imovel.complemento || null,
                        bairro: dados.imovel.bairro || null,
                        area_total: pFloat(dados.imovel.area_total),
                        testada: pFloat(dados.imovel.testada),
                        profundidade: pFloat(dados.imovel.profundidade)
                    }]);
            }
        }

        // 8. Inserir infrações em 'processo_infracoes' e criar notificações vinculadas
        let notificacoesCriadas = [];
        if (dados.infracoes.dispositivos && dados.infracoes.dispositivos.length > 0) {
            const { data: listaCat } = await supabaseClient
                .from('infracoes_catalogo')
                .select('id, codigo, descricao')
                .in('codigo', dados.infracoes.dispositivos);

            if (listaCat && listaCat.length > 0) {
                const infInserts = listaCat.map(cat => ({
                    processo_id: procCriado.id,
                    infracao_id: cat.id,
                    reincidente: dados.infracoes.reincidente === 'sim'
                }));

                const { data: infracoesCriadas, error: errInfracoes } = await supabaseClient
                    .from('processo_infracoes')
                    .insert(infInserts)
                    .select('id, infracao_id, infracoes_catalogo(descricao)');

                if (errInfracoes) {
                    console.error('Erro ao inserir infrações:', errInfracoes);
                } else if (infracoesCriadas && infracoesCriadas.length > 0) {
                    const dataInicio = procCriado.created_at || new Date().toISOString();

                    for (let i = 0; i < infracoesCriadas.length; i++) {
                        const inf = infracoesCriadas[i];
                        const descricaoCat = inf.infracoes_catalogo?.descricao || '';
                        const numeroNotif = `${numeroProcesso}/${String(i + 1).padStart(2, '0')}`;
                        const prazoDias = obterPrazoNotificacaoNovaSolicitacao(descricaoCat);
                        const dataVenc = new Date(dataInicio);
                        dataVenc.setDate(dataVenc.getDate() + prazoDias);

                        const { data: notif, error: errNotif } = await supabaseClient
                            .from('notificacoes')
                            .insert([{
                                processo_id: procCriado.id,
                                processo_infracao_id: inf.id,
                                numero: numeroNotif,
                                descricao: descricaoCat,
                                prazo_dias: prazoDias,
                                data_inicio: dataInicio,
                                data_vencimento: dataVenc.toISOString(),
                                status: 'pendente',
                                etapa_atual_id: etapaId
                            }])
                            .select()
                            .single();

                        if (errNotif) {
                            console.warn('Erro ao criar notificação:', errNotif);
                        } else {
                            notificacoesCriadas.push(notif);
                            await supabaseClient
                                .from('processo_infracoes')
                                .update({ notificacao_id: notif.id })
                                .eq('id', inf.id);
                        }
                    }
                }
            }
        }

        // 9. Registrar histórico inicial em 'historico_etapas'
        await supabaseClient
            .from('historico_etapas')
            .insert([{
                processo_id: procCriado.id,
                etapa_de_id: null,
                etapa_para_id: etapaId,
                usuario_id: profileId,
                condicao_aplicada: 'Abertura de Solicitação',
                observacao: dados.fiscal.descricao || 'Processo gerado pelo Assistente de Nova Solicitação.',
                dados_etapa: {
                    etapa: 1,
                    numero_processo: numeroProcesso,
                    ...dados
                }
            }]);

        // 10. Salvar anexos (decreto e imagens de vistoria) no JSONB dados do processo
        const anexosParaSalvar = {};

        // Decreto anexo
        if (dados.fiscal.decreto === 'sim') {
            const arquivoDecreto = document.getElementById('inputDecreto')?.files?.[0];
            if (arquivoDecreto) {
                try {
                    const decretoBase64 = await fileToBase64(arquivoDecreto);
                    anexosParaSalvar.decreto_anexo = {
                        nome: arquivoDecreto.name,
                        tipo: arquivoDecreto.type,
                        dataUrl: decretoBase64,
                        data_upload: new Date().toISOString()
                    };
                } catch (e) {
                    console.warn('Erro ao converter decreto:', e);
                }
            }
        }

        // Imagens de vistoria
        if (selectedImages.length > 0) {
            anexosParaSalvar.imagens_vistoria = [];
            for (const imgFile of selectedImages) {
                try {
                    const imgBase64 = await fileToBase64(imgFile);
                    anexosParaSalvar.imagens_vistoria.push({
                        nome: imgFile.name,
                        tipo: imgFile.type,
                        dataUrl: imgBase64,
                        data_upload: new Date().toISOString()
                    });
                } catch (e) {
                    console.warn('Erro ao converter imagem:', e);
                }
            }
        }

        // Gravar anexos no banco se houver algum
        if (Object.keys(anexosParaSalvar).length > 0) {
            const dadosAtual = procCriado.dados || {};
            dadosAtual.anexos = anexosParaSalvar;
            await supabaseClient
                .from('processos')
                .update({ dados: dadosAtual })
                .eq('id', procCriado.id);
        }

        // Fecha o editor, se estiver aberto, sem devolver os números (já foram usados)
        numerosReservadosEditor.processo = null;
        numerosReservadosEditor.relatorio = null;
        relatorioEditorAberto = false;
        const modalEditor = document.getElementById('modalEditorRelatorio');
        if (modalEditor) {
            modalEditor.style.display = 'none';
            modalEditor.classList.remove('open');
        }
        document.body.style.overflow = '';

        alert(`Processo Nº ${numeroProcesso} criado com sucesso!`);
        window.location.href = `etapa.html?processo=${procCriado.id}&etapa=1`;
    } catch (err) {
        console.error('Erro ao salvar solicitação:', err);
        alert('Erro ao salvar solicitação: ' + err.message);
    } finally {
        setWizardLoading(false);
    }
}

// ── Prazos padrão de cada tipo de notificação ─────────────────────────────
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

function obterPrazoNotificacaoNovaSolicitacao(descricao) {
    if (!descricao) return 15;
    const descLow = descricao.toLowerCase();
    for (const [termo, prazo] of Object.entries(PRAZOS_NOTIFICACAO)) {
        if (descLow.includes(termo)) return prazo;
    }
    return 15;
}

// ── Mapa Oficial de Respostas Padrões de Cada Notificação ─────────────────
const MAPA_TEXTOS_NOTIFICACAO = {
    '120000232': `1) Falta de limpeza e conservação de imóvel não edificado: infração aos artigos 1º e 2º, III, da Lei 7.174/2010.\nPrazo: 15 DIAS para tomar as Providências:\n- Executar o serviço de limpeza e remoção do lixo doméstico e entulhos (quando houver) do imóvel de sua propriedade.\n- Proibido: queimadas, cortar árvores e movimentação de terra (terraplanagem).`,
    '120000211': `2) Inexistência de cercamento: infração ao artigo 1º da Lei 7.174/2010.\nPrazo: 60 DIAS para tomar as providências:\n- Executar o serviço de construção de muro do imóvel de sua propriedade.\n- Autorizado pelo artigo 1°, § 2°, da Lei 7.174/2010: muro de chapa, alvenaria, tela grossa de arame ou grades de ferro.\n- Não autorizado: arames lisos e farpados, e cerca viva.`,
    '120000226': `3) Inexistência de passeio: infração ao artigo 1º, § 1º e artigo 2º, I, da Lei 7.174/2010.\nPrazo: 60 DIAS para tomar as providências:\n- Executar o serviço de construção de passeio pela testada do imóvel de sua propriedade.`,
    '120000228': `4) Reincidência na Inexistência de Cercamento: Infração ao artigo 2º, I, da Lei 7.174/2010.\nPrazo: 60 DIAS para tomar as providências:\n- Executar o serviço de construção de muro do imóvel de sua propriedade.\nObservação do Fiscal: Na hipótese de reincidência, aplicar-se-á em dobro a multa respectivamente prevista no art. 4º da Lei 7.174/2010.`,
    '120000227': `5) Reincidência na Inexistência de passeio: infração ao artigo 1º, § 1º e artigo 2º, I, da Lei 7.174/2010.\nPrazo: 60 DIAS para tomar as providências:\n- Executar o serviço de construção de passeio pela testada do imóvel de sua propriedade.\nObservação do Fiscal: Na hipótese de reincidência, aplicar-se-á em dobro a multa respectivamente prevista no art. 4º da Lei 7.174/2010.`,
    '120000229': `6) Reconstrução e/ou reparo de muro: infração ao artigo 2º, II, da Lei 7.174/2010.\nPrazo: 15 DIAS para tomar as providências:\n- Executar o serviço de reconstrução de muro pela testada do imóvel de sua propriedade.`,
    '120000240': `7) Reconstrução e/ou reparo de passeio: infração ao artigo 1º, § 1º e artigo 2º, II, da Lei 7.174/2010.\nPrazo: 15 DIAS para tomar as providências:\n- Executar o serviço de reconstrução de passeio/calçada pela testada do imóvel de sua propriedade.`,
    '120000233': `9) Limpeza de quintal: infração aos artigos 14 e 15 da Lei nº 6.907/2008.\nPrazo: 10 DIAS para tomar as providências:\n- Executar o serviço de limpeza e remoção do lixo doméstico e entulhos (quando houver) do imóvel de sua propriedade.\n- Proibido: Queimadas, cortar árvores e movimentação de terra (terraplanagem).`,
    '120000237': `10) Obstáculos em calçadas impedindo o livre trânsito de pedestres e veículos: infração ao artigo 6°, XIII, XIV da Lei 6.907/2008.\nPrazo: 10 DIAS para tomar as providências:\n- Retirar os obstáculos do passeio.`,
    '120000239': `11) Água servida: infração ao artigo 6, inciso IV da Lei nº 6.907/2008.\nPrazo: 10 DIAS para tomar as providências:\n- Ligação da água servida à rede de esgoto.`,
    '120000236': `12) Estabelecimento sem alvará: infração ao artigo 190 da Lei nº 6.907/2008.\nPrazo: 10 DIAS para tomar as providências:\n- Regularizar o alvará de funcionamento e localização.`,
    '120000234': `13) Reparos por concessionárias: infração ao artigo 163 da Lei 6.907/2008 e ao artigo 1º, §3º, da Lei nº 7.174/2010.\nPrazo: 10 DIAS, a contar do término de sua respectiva obra e serviço:\n- Executar serviço de reconstrução de muros e passeios danificados.`,
    '120000230': `14) Inexistência de sinalização adequada piso tátil: infração ao artigo 106, IV, da Lei 6.907/2008.\nPrazo: 10 DIAS para tomar as providências:\n- Executar a sinalização adequada no piso de acordo com as normas vigentes com alerta para portadores de deficiência.`
};

function atualizarDescricaoFiscalizacaoPadrao() {
    const descEl = document.getElementById('fiscDescricao');
    if (!descEl) return;

    if (descEl.value.trim() !== '' && descEl.dataset.auto !== 'true') return;

    const selecionados = [];
    document.querySelectorAll('#infracoesList input[name="infracao"]:checked').forEach(cb => {
        if (MAPA_TEXTOS_NOTIFICACAO[cb.value]) {
            selecionados.push(MAPA_TEXTOS_NOTIFICACAO[cb.value]);
        }
    });

    if (selecionados.length > 0) {
        descEl.value = selecionados.join('\n\n----------------------------------------\n\n');
        descEl.dataset.auto = 'true';
    } else {
        if (descEl.dataset.auto === 'true') {
            descEl.value = '';
            descEl.dataset.auto = 'false';
        }
    }
}

function coletarTodosDados() {
    const infracoesSelecionadas = [];
    document.querySelectorAll('input[name="infracao"]:checked').forEach(cb => {
        infracoesSelecionadas.push(cb.value);
    });

    return {
        contribuinte: {
            nome: document.getElementById('contNome').value,
            cpf_cnpj: document.getElementById('contCpfCnpj').value,
            logradouro: document.getElementById('contLogradouro').value,
            numero: document.getElementById('contNumero').value,
            complemento: document.getElementById('contComplemento').value,
            bairro: document.getElementById('contBairro').value,
            municipio: document.getElementById('contMunicipio').value,
            cep: document.getElementById('contCep').value,
        },
        imovel: {
            codigo_reduzido: document.getElementById('imvCodigo').value,
            inscricao: document.getElementById('imvInscricao').value,
            logradouro: document.getElementById('imvLogradouro').value,
            numero: document.getElementById('imvNumero').value,
            complemento: document.getElementById('imvComplemento').value,
            bairro: document.getElementById('imvBairro').value,
            area_total: document.getElementById('imvAreaTotal').value,
            testada: document.getElementById('imvTestada').value,
            profundidade: document.getElementById('imvProfundidade').value,
        },
        fiscal: {
            nome: document.getElementById('fiscNome').value,
            matricula: document.getElementById('fiscMatricula').value,
            data_vistoria: document.getElementById('fiscDataVistoria').value,
            descricao: document.getElementById('fiscDescricao').value,
            decreto: document.getElementById('fiscDecreto').value,
        },
        infracoes: {
            reincidente: document.getElementById('infReincidente').value,
            processo_existente: document.getElementById('infProcessoExistente').value,
            processo_ref: document.getElementById('infProcessoRef').value,
            dispositivos: infracoesSelecionadas,
        },
        relatorio_fiscal: {
            atendimento: (document.getElementById('relAtendimentoTipo').value + ' ' + document.getElementById('relAtendimentoValor').value).trim(),
            assunto: document.getElementById('relAssunto').value,
            pa: document.getElementById('relPA').value,
            texto_vistoria: document.getElementById('relTextoVistoria').value,
            html_customizado: window.relatorioCustomizadoHTML || null
        }
    };
}

// ── Renderização e Preparação do Relatório Fiscal ────────────
function prepararEtapaRelatorio() {
    const infracoesSelecionadas = Array.from(document.querySelectorAll('input[name="infracao"]:checked')).map(el => {
        return el.nextElementSibling.textContent.trim().toLowerCase();
    });
    const listaInfracoesStr = infracoesSelecionadas.join(', ');

    const textarea = document.getElementById('relTextoVistoria');
    if (!textarea.value.trim()) {
        textarea.value = listaInfracoesStr || 'falta de limpeza e conservação de imóvel não edificado, inexistência de cercamento e inexistência de passeio';
    }

    renderizarDocumentoRelatorio();
}

function renderizarDocumentoRelatorio() {
    const container = document.getElementById('previewRelatorioContainer');
    if (!container) return;
    container.style.display = 'block';

    if (window.relatorioCustomizadoHTML) {
        container.innerHTML = window.relatorioCustomizadoHTML;
    } else {
        container.innerHTML = construirHtmlRelatorioFiscal();
    }
}

function construirHtmlRelatorioFiscal(numeroRelatorio, numeroProcesso) {
    const ano = new Date().getFullYear();
    const numeroRelatorioTBD = numeroRelatorio || `XXX/${ano}`;
    const numeroProcessoTBD = numeroProcesso || `XXX/${ano}`;
    const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const atendimentoTipo = document.getElementById('relAtendimentoTipo')?.value || '';
    const atendimentoValor = document.getElementById('relAtendimentoValor')?.value || '';
    const atendimento = (atendimentoTipo + ' ' + atendimentoValor).trim() || 'campo escrito';
    
    const assunto = document.getElementById('relAssunto')?.value || 'colocar aqui o título da denúncia';
    const pa = document.getElementById('relPA')?.value || '';

    // Imovel info
    const logradouroImv = document.getElementById('imvLogradouro')?.value || 'XXX';
    const numeroImv = document.getElementById('imvNumero')?.value || 'XXXX';
    const bairroImv = document.getElementById('imvBairro')?.value || 'XXXX';
    const textoVistoria = document.getElementById('relTextoVistoria')?.value ||
        'falta de limpeza e conservação de imóvel não edificado, inexistência de cercamento e inexistência de passeio';

    const paHtml = pa ? `<p style="margin:0;"><strong>PA:</strong> ${pa}</p>` : '';

    // Coleta das imagens adicionadas no painel
    let htmlImagens = '';
    const containerImagens = document.getElementById('lista-imagens-legenda');
    if (containerImagens) {
        const itens = containerImagens.querySelectorAll('.item-imagem-legenda');
        if (itens.length > 0) {
            itens.forEach((item, index) => {
                const imgInput = item.querySelector('.imagem-arquivo');
                const legInput = item.querySelector('.imagem-legenda');
                const base64 = imgInput ? imgInput.getAttribute('data-base64') : null;
                const legenda = legInput ? legInput.value : '';

                if (base64) {
                    htmlImagens += `
                        <div style="text-align: center; margin: 20px 0; page-break-inside: avoid;">
                            <div style="display: inline-block; resize: both; overflow: hidden; max-width: 100%; min-width: 150px; min-height: 150px; border: 1px dashed #ccc; padding: 4px;">
                                <img src="${base64}" style="width: 100%; height: 100%; object-fit: contain; display: block;" />
                            </div>
                            ${legenda ? `<p style="margin-top: 5px; font-style: italic; color: #555;">${legenda}</p>` : ''}
                        </div>
                    `;
                }
            });
        }
    }

    return `
        <div style="font-family: Calibri, 'Segoe UI', sans-serif; color: black; max-width: 800px; margin: 0 auto; line-height: 1.2; font-size: 10pt; padding: 20px;">
            <!-- 1. CABEÇALHO IDÊNTICO AO MODELO - NOTIFICAÇÃO PRELIMINAR -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border-collapse: collapse;">
                <tr>
                    <td width="130" rowspan="2" align="center" valign="top" style="padding-right: 2px; width: 130px;">
                        <img src="${BRASAO_PREFEITURA_BASE64}" alt="Brasão Divinópolis" style="width: 130px; height: auto; display: block; margin: 0 auto;">
                    </td>
                    <td bgcolor="#F78C26" style="background-color: #F78C26; height: 14px; font-size: 1px; line-height: 14px;">&nbsp;</td>
                </tr>
                <tr>
                    <td valign="top" style="padding-top: 10px; font-size: 10pt; color: #000; line-height: 1.35;">
                        <strong>SECRETARIA MUNICIPAL DE MEIO AMBIENTE E CUIDADO ANIMAL - SEMAC</strong><br>
                        DIRETORIA DE MEIO AMBIENTE<br>
                        GERÊNCIA DE FISCALIZAÇÃO DE POSTURAS<br>
                        <span style="font-size: 10pt;">Av. Paraná, nº2061, sala 207 - Bairro São José - Divinópolis, Minas Gerais</span><br>
                        <span style="font-size: 10pt;">CEP:35.501-170 Tel: (37) 3229-8176</span>
                    </td>
                </tr>
            </table>

            <!-- Título -->
            <div style="text-align: center; font-weight: bold; margin-top: 30px; margin-bottom: 5px;">
                <p style="margin:0; font-size: 12pt;">RELATÓRIO FISCAL ${numeroRelatorioTBD}</p>
            </div>
            <div style="text-align: center; margin-bottom: 30px;">
                <p style="margin:0;">Fiscalização de Posturas</p>
            </div>

            <!-- Data -->
            <div style="text-align: right; margin-bottom: 30px;">
                <p style="margin:0;">Divinópolis - MG <br> ${dataAtual}</p>
            </div>

            <!-- Identificação -->
            <div style="margin-bottom: 30px;">
                <p style="margin:0 0 6px 0;"><strong>Para atendimento:</strong> ${atendimento}</p>
                <p style="margin:0 0 6px 0;"><strong>Assunto:</strong> ${assunto}</p>
                <p style="margin:0 0 6px 0;"><strong>Processo:</strong> ${numeroProcessoTBD}</p>
                ${paHtml ? paHtml.replace('margin:0;', 'margin:0 0 6px 0;') : ''}
            </div>

            <!-- Corpo -->
            <div style="margin-bottom: 40px; text-align: justify;">
                <p style="margin:0 0 6px 0;">Prezado(a),</p>
                <p style="text-indent: 30px; margin:0 0 6px 0;">informamos que em vistoria ao local indicado, Rua ${logradouroImv}, nº${numeroImv} no bairro ${bairroImv}, verificamos que houve ${textoVistoria}.</p>
                ${htmlImagens}
                <p style="text-indent: 30px; margin:0 0 6px 0;">Sem mais para o momento, estamos à disposição para maiores esclarecimentos.</p>
            </div>

            <!-- Assinatura -->
            <div style="margin-top: 60px;">
                <p style="margin:0 0 60px 0; text-align: left;">Atenciosamente,</p>
                <div style="text-align: center;">
                    <p style="margin:0;">_________________________________________</p>
                    <p style="margin:5px 0 0 0;"><strong>${fiscalData.nome || 'Nome do Fiscal'}</strong></p>
                    <p style="margin:2px 0 0 0;">${fiscalData.cargo || 'Cargo do Fiscal'}</p>
                    <p style="margin:2px 0 0 0;">Matrícula: ${fiscalData.matricula || 'XXXXXXXX'}</p>
                </div>
            </div>

            <!-- Rodapé -->
            <div style="text-align: center; margin-top: 80px; font-size: 10pt;">
                <p style="margin:0;">Página 1</p>
            </div>

            <!-- Linha laranja inferior -->
            <div style="height: 10px; background: #F78C26; margin-top: 12px;"></div>
        </div>
    `;
}

// ── Editor WYSIWYG do Relatório Fiscal ──────────────────────
async function abrirEditorRelatorio() {
    if (!validarStep(5)) return;

    const feedback = document.getElementById('feedbackEditorRelatorio');
    if (feedback) {
        feedback.textContent = 'Gerando documento...';
        feedback.className = 'input-feedback info';
    }

    try {
        const anoAtual = new Date().getFullYear();

        // Reserva números temporários para preview realista
        if (!numerosReservadosEditor.processo) {
            const { data: np } = await supabaseClient.rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Processo' });
            numerosReservadosEditor.processo = np || `XXX/${anoAtual}`;
        }
        if (!numerosReservadosEditor.relatorio) {
            const { data: nr } = await supabaseClient.rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Relatório Fiscal' });
            numerosReservadosEditor.relatorio = nr || `XXX/${anoAtual}`;
        }

        const editor = document.getElementById('editorRelatorio');
        if (window.relatorioCustomizadoHTML) {
            editor.innerHTML = window.relatorioCustomizadoHTML;
        } else {
            editor.innerHTML = construirHtmlRelatorioFiscal(numerosReservadosEditor.relatorio, numerosReservadosEditor.processo);
        }

        const modal = document.getElementById('modalEditorRelatorio');
        modal.style.display = 'flex';
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        relatorioEditorAberto = true;
    } catch (err) {
        console.error('Erro ao abrir editor do relatório:', err);
        alert('Erro ao abrir editor do relatório: ' + err.message);
    } finally {
        if (feedback) {
            feedback.textContent = '';
            feedback.className = 'input-feedback';
        }
    }
}

async function fecharEditorRelatorio() {
    if (relatorioEditorAberto && (numerosReservadosEditor.processo || numerosReservadosEditor.relatorio)) {
        const confirmar = confirm('Se voltar ao formulário sem finalizar, os números reservados serão liberados. Deseja continuar?');
        if (!confirmar) return;
        await devolverNumerosReservadosEditor();
    }

    const modal = document.getElementById('modalEditorRelatorio');

    // Salvar as alterações feitas no editor antes de fechar
    const editor = document.getElementById('editorRelatorio');
    if (editor && relatorioEditorAberto) {
        window.relatorioCustomizadoHTML = editor.innerHTML;
        const container = document.getElementById('previewRelatorioContainer');
        if (container) {
            container.innerHTML = window.relatorioCustomizadoHTML;
        }
    }

    modal.style.display = 'none';
    modal.classList.remove('open');
    document.body.style.overflow = '';
    relatorioEditorAberto = false;
}

async function devolverNumerosReservadosEditor() {
    try {
        if (numerosReservadosEditor.processo) {
            await supabaseClient.rpc('devolver_numero', { p_numero: numerosReservadosEditor.processo, p_categoria: 'Processo' }).catch(() => { });
            numerosReservadosEditor.processo = null;
        }
        if (numerosReservadosEditor.relatorio) {
            await supabaseClient.rpc('devolver_numero', { p_numero: numerosReservadosEditor.relatorio, p_categoria: 'Relatório Fiscal' }).catch(() => { });
            numerosReservadosEditor.relatorio = null;
        }
    } catch (e) {
        console.warn('Erro ao devolver números reservados:', e);
    }
}

async function baixarRelatorioFiscalPdf() {
    const btn = document.getElementById('btnBaixarRelatorioPdf');
    const oldText = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;"></div> Preparando PDF...`;
    }

    try {
        const editor = document.getElementById('editorRelatorio');

        // Salvar as alterações antes de imprimir
        window.relatorioCustomizadoHTML = editor.innerHTML;
        const previewContainer = document.getElementById('previewRelatorioContainer');
        if (previewContainer) {
            previewContainer.innerHTML = window.relatorioCustomizadoHTML;
        }

        const numeroRelatorio = numerosReservadosEditor.relatorio || `XXX/${new Date().getFullYear()}`;
        const nomeArquivo = `Relatorio_Fiscal_${numeroRelatorio.replace('/', '-')}`;

        const htmlComImagens = editor.innerHTML;

        const estilos = `
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { margin: 0; padding: 20px; background: #fff; font-family: Calibri, 'Segoe UI', sans-serif; color: black; }
            img { max-width: 100%; height: auto; }
            @media print { body { padding: 0; margin: 0; } @page { size: A4; margin: 2cm; } }
        `;

        // Criar iframe oculto se não existir
        let iframe = document.getElementById('iframeImpressaoRelatorio');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'iframeImpressaoRelatorio';
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
        document.title = nomeArquivo;

        doc.open();
        doc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${nomeArquivo}</title><style>${estilos}</style></head><body>${htmlComImagens}</body></html>`);
        doc.close();

        // Aguarda renderização e aciona a impressão direta da caixa de diálogo do sistema
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
                document.title = tituloOriginal;
                
                // Fecha o editor após imprimir
                relatorioEditorAberto = false;
                const modal = document.getElementById('modalEditorRelatorio');
                if (modal) {
                    modal.style.display = 'none';
                    modal.classList.remove('open');
                }
                document.body.style.overflow = '';
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

// Converte <img src="caminho/relativo"> para base64 para o documento Word
async function embutirImagensComoBase64(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const imagens = Array.from(doc.querySelectorAll('img'));

    for (const img of imagens) {
        const src = img.getAttribute('src');
        if (!src) continue;
        // Já está embutido como data URI; mantém como está
        if (src.startsWith('data:')) continue;
        try {
            const response = await fetch(src);
            if (!response.ok) continue;
            const blob = await response.blob();
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            img.setAttribute('src', base64);
        } catch (e) {
            console.warn('Não foi possível embutir imagem:', src, e);
        }
    }

    return doc.body.innerHTML;
}

// ── Bind de todos os eventos ────────────────────────────────
function bindWizardEventos() {
    // Abrir modal
    document.getElementById('btnNovaSolicitacao').addEventListener('click', abrirModal);

    // Fechar modal
    document.getElementById('btnFecharModal').addEventListener('click', fecharModal);
    document.getElementById('modalNovaSolicitacao').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) fecharModal();
    });

    // Navegação wizard
    document.getElementById('btnWizardAvancar').addEventListener('click', avancarStep);
    document.getElementById('btnWizardVoltar').addEventListener('click', voltarStep);
    document.getElementById('btnWizardFinalizar').addEventListener('click', finalizarSolicitacao);

    // Máscara CPF nos inputs
    aplicarMascaraCpfCnpj(document.getElementById('contCpfCnpj'));

    // Buscar contribuinte automaticamente
    const contNomeEl = document.getElementById('contNome');
    const contCpfEl = document.getElementById('contCpfCnpj');
    if (contNomeEl) {
        contNomeEl.addEventListener('blur', () => buscarContribuinteNoBanco(true));
        contNomeEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); buscarContribuinteNoBanco(false); }
        });
    }
    if (contCpfEl) {
        contCpfEl.addEventListener('blur', () => buscarContribuinteNoBanco(true));
        contCpfEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); buscarContribuinteNoBanco(false); }
        });
    }

    // Buscar imóvel automaticamente por Código ou Inscrição
    const imvCodEl = document.getElementById('imvCodigo');
    const imvInscEl = document.getElementById('imvInscricao');
    if (imvCodEl) {
        imvCodEl.addEventListener('blur', () => buscarImovelNoBanco(true));
        imvCodEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); buscarImovelNoBanco(false); }
        });
    }
    if (imvInscEl) {
        imvInscEl.addEventListener('input', (e) => {
            decomporInscricao(e.target.value);
        });
        imvInscEl.addEventListener('blur', () => buscarImovelNoBanco(true));
        imvInscEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); buscarImovelNoBanco(false); }
        });
    }

    // Eventos do Step 5 - Atualização do Preview e Editor
    ['relAtendimentoTipo', 'relAtendimentoValor', 'relAssunto', 'relPA', 'relTextoVistoria', 'relIncluirDataHora'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                window.relatorioCustomizadoHTML = null; // Reseta o customizado se alterar os campos base
                renderizarDocumentoRelatorio();
                // Se o editor estiver aberto, sincroniza o conteúdo
                if (relatorioEditorAberto) {
                    const editor = document.getElementById('editorRelatorio');
                    if (editor) {
                        editor.innerHTML = construirHtmlRelatorioFiscal(
                            numerosReservadosEditor.relatorio,
                            numerosReservadosEditor.processo
                        );
                    }
                }
            });
        }
    });

    // Botão abrir editor WYSIWYG do relatório
    const btnAbrirEditor = document.getElementById('btnAbrirEditorRelatorio');
    if (btnAbrirEditor) {
        btnAbrirEditor.addEventListener('click', abrirEditorRelatorio);
    }

    // Botões do modal editor
    const btnFecharEditor = document.getElementById('btnFecharEditorRelatorio');
    if (btnFecharEditor) {
        btnFecharEditor.addEventListener('click', fecharEditorRelatorio);
    }

    const btnVoltarEditor = document.getElementById('btnEditorRelatorioVoltar');
    if (btnVoltarEditor) {
        btnVoltarEditor.addEventListener('click', fecharEditorRelatorio);
    }

    const btnBaixarPdf = document.getElementById('btnBaixarRelatorioPdf');
    if (btnBaixarPdf) {
        btnBaixarPdf.addEventListener('click', baixarRelatorioFiscalPdf);
    }

    // Fecha o editor ao clicar fora do container
    const modalEditor = document.getElementById('modalEditorRelatorio');
    if (modalEditor) {
        modalEditor.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) fecharEditorRelatorio();
        });
    }

    // Decreto — mostrar/esconder anexo
    document.getElementById('fiscDecreto').addEventListener('change', (e) => {
        document.getElementById('decretoAnexoArea').style.display =
            e.target.value === 'sim' ? 'block' : 'none';
    });

    // Processo existente — mostrar/esconder campo
    document.getElementById('infProcessoExistente').addEventListener('change', (e) => {
        document.getElementById('processoExistenteAnexo').style.display =
            e.target.value === 'sim' ? 'block' : 'none';
    });

    // Auto-preenchimento das respostas padrão de infração na Descrição da Fiscalização
    document.querySelectorAll('#infracoesList input[name="infracao"]').forEach(cb => {
        cb.addEventListener('change', atualizarDescricaoFiscalizacaoPadrao);
    });
    const descEl = document.getElementById('fiscDescricao');
    if (descEl) {
        descEl.addEventListener('input', () => {
            descEl.dataset.auto = 'false';
        });
    }

    // Upload BETHA — Drag & Drop + Seleção de Arquivo
    const dropArea = document.getElementById('uploadAreaBetha');
    const fileInput = document.getElementById('inputBetha');

    dropArea.addEventListener('click', (e) => {
        if (e.target !== fileInput && e.target.tagName !== 'LABEL') {
            fileInput.click();
        }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropArea.classList.add('drag-active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropArea.classList.remove('drag-active');
        }, false);
    });

    dropArea.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file) handleArquivoAnexo(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleArquivoAnexo(file);
    });

    document.getElementById('btnRemoveBetha').addEventListener('click', () => {
        fileInput.value = '';
        document.getElementById('bethaFileInfo').style.display = 'none';
        document.getElementById('uploadAreaBetha').style.display = 'flex';
    });

    // Upload Imagens vistoria (removido, imagens agora são inseridas no passo 5)

    // Upload Decreto
    document.getElementById('inputDecreto').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('decretoFileName').textContent = file.name;
            document.getElementById('decretoFileInfo').style.display = 'flex';
        }
    });
    if (document.getElementById('btnRemoveDecreto')) {
        document.getElementById('btnRemoveDecreto').addEventListener('click', () => {
            document.getElementById('inputDecreto').value = '';
            document.getElementById('decretoFileInfo').style.display = 'none';
        });
    }

    // Máscara CEP
    document.getElementById('contCep').addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').slice(0, 8);
        if (v.length > 5) v = v.replace(/(\d{5})(\d{1,3})/, '$1-$2');
        e.target.value = v;
    });

    // ESC fecha modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') fecharModal();
    });
}


// ── Buscar contribuinte no banco (por Nome ou CPF/CNPJ) ─────────
async function buscarContribuinteNoBanco(silencioso = false) {
    const nomeVal = document.getElementById('contNome')?.value?.trim();
    const cpfInput = document.getElementById('contCpfCnpj')?.value?.trim();
    const cpfRaw = cpfInput ? cpfInput.replace(/\D/g, '') : '';

    if (!nomeVal && !cpfRaw) return;

    if (!silencioso) {
        mostrarFeedback('contFeedback', 'Buscando contribuinte no banco...', 'info');
    }

    let cpfFormatado = cpfRaw;
    if (cpfRaw.length === 11) {
        cpfFormatado = cpfRaw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (cpfRaw.length === 14) {
        cpfFormatado = cpfRaw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }

    try {
        let data = null;

        // 1. Tentar buscar primeiro por CPF/CNPJ se informado
        if (cpfRaw) {
            let resCpf = await supabaseClient
                .from('contribuintes')
                .select('*')
                .eq('cpf_cnpj', cpfFormatado)
                .maybeSingle();

            data = resCpf.data;
            if (!data) {
                let resRaw = await supabaseClient
                    .from('contribuintes')
                    .select('*')
                    .eq('cpf_cnpj', cpfRaw)
                    .maybeSingle();
                data = resRaw.data;
            }
            if (!data && cpfInput !== cpfFormatado && cpfInput !== cpfRaw) {
                let resInp = await supabaseClient
                    .from('contribuintes')
                    .select('*')
                    .eq('cpf_cnpj', cpfInput)
                    .maybeSingle();
                data = resInp.data;
            }
        }

        // 2. Se não achou por CPF (ou não tem CPF), buscar pelo Nome exato ou ilike
        if (!data && nomeVal) {
            let resNome = await supabaseClient
                .from('contribuintes')
                .select('*')
                .ilike('nome', nomeVal)
                .limit(1)
                .maybeSingle();
            data = resNome.data;
        }

        if (data) {
            const setIfEmpty = (id, val) => {
                const el = document.getElementById(id);
                if (el && (!el.value || el.value.trim() === '' || el.value === 'Divinópolis')) {
                    if (val) el.value = val;
                }
            };
            setIfEmpty('contNome', data.nome);
            setIfEmpty('contCpfCnpj', data.cpf_cnpj);
            setIfEmpty('contLogradouro', data.logradouro);
            setIfEmpty('contNumero', data.numero);
            setIfEmpty('contComplemento', data.complemento);
            setIfEmpty('contBairro', data.bairro);
            setIfEmpty('contMunicipio', data.municipio || 'Divinópolis');
            setIfEmpty('contCep', data.cep);

            mostrarFeedback('contFeedback', '✓ Contribuinte encontrado no banco! Dados preenchidos.', 'success');
        } else if (!silencioso) {
            mostrarFeedback('contFeedback', 'Contribuinte não encontrado. Preencha os dados abaixo.', 'info');
        }
    } catch (err) {
        console.error('Erro ao buscar contribuinte:', err);
    }
}

// --- GERENCIAMENTO DE IMAGENS COM LEGENDA (RELATÓRIO FISCAL) ---
let contadorImagensLegenda = 0;
window.adicionarCampoImagemLegenda = function () {
    contadorImagensLegenda++;
    const container = document.getElementById('lista-imagens-legenda');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'item-imagem-legenda form-group';
    div.id = `item-imagem-legenda-${contadorImagensLegenda}`;
    div.style = 'display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm); background: var(--bg-offwhite); position: relative; margin-top: 10px;';

    div.innerHTML = `
        <button type="button" onclick="removerCampoImagemLegenda(${contadorImagensLegenda})" style="position: absolute; top: 8px; right: 8px; background: var(--danger-color); color: white; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-weight: bold; font-size: 11px; display: flex; align-items: center; justify-content: center; z-index: 10;" title="Remover">✕</button>
        <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.75rem; font-weight: 600;">Selecione a Imagem</label>
            <input type="file" class="imagem-arquivo form-input" accept="image/*" style="padding: 6px;">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
            <label style="font-size: 0.75rem; font-weight: 600;">Legenda da Imagem</label>
            <input type="text" class="imagem-legenda form-input" placeholder="Ex: Vista frontal do lote..." style="padding: 8px;">
        </div>
    `;
    container.appendChild(div);

    const fileInput = div.querySelector('.imagem-arquivo');
    const legendaInput = div.querySelector('.imagem-legenda');

    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                fileInput.setAttribute('data-base64', evt.target.result);
                window.relatorioCustomizadoHTML = null;
                if(typeof renderizarDocumentoRelatorio === 'function') renderizarDocumentoRelatorio();
            };
            reader.readAsDataURL(file);
        } else {
            fileInput.removeAttribute('data-base64');
            window.relatorioCustomizadoHTML = null;
            if(typeof renderizarDocumentoRelatorio === 'function') renderizarDocumentoRelatorio();
        }
    });

    legendaInput.addEventListener('input', () => {
        window.relatorioCustomizadoHTML = null;
        if(typeof renderizarDocumentoRelatorio === 'function') renderizarDocumentoRelatorio();
    });
    
    window.relatorioCustomizadoHTML = null;
    if(typeof renderizarDocumentoRelatorio === 'function') renderizarDocumentoRelatorio();
};

window.removerCampoImagemLegenda = function (id) {
    const el = document.getElementById(`item-imagem-legenda-${id}`);
    if (el) {
        el.remove();
        window.relatorioCustomizadoHTML = null;
        if(typeof renderizarDocumentoRelatorio === 'function') renderizarDocumentoRelatorio();
    }
};

// ── Buscar imóvel no banco (por Código Reduzido ou Inscrição) ───
async function buscarImovelNoBanco(silencioso = false) {
    const codVal = document.getElementById('imvCodigo')?.value?.trim();
    const inscVal = document.getElementById('imvInscricao')?.value?.trim();

    if (!codVal && !inscVal) return;

    if (!silencioso) {
        mostrarFeedback('imvFeedback', 'Buscando imóvel no banco...', 'info');
    }

    try {
        let data = null;

        // 1. Tentar por Código Reduzido se informado
        if (codVal) {
            let resCod = await supabaseClient
                .from('imoveis')
                .select('*')
                .eq('codigo_reduzido', codVal)
                .maybeSingle();
            data = resCod.data;
        }

        // 2. Se não achou, tentar por Inscrição do Imóvel
        if (!data && inscVal) {
            let resInsc = await supabaseClient
                .from('imoveis')
                .select('*')
                .eq('inscricao_imovel', inscVal)
                .maybeSingle();
            data = resInsc.data;
        }

        if (data) {
            const setIfEmpty = (id, val) => {
                const el = document.getElementById(id);
                if (el && (!el.value || el.value.trim() === '')) {
                    if (val !== undefined && val !== null) el.value = val;
                }
            };

            setIfEmpty('imvCodigo', data.codigo_reduzido);
            setIfEmpty('imvInscricao', data.inscricao_imovel);
            setIfEmpty('imvLogradouro', data.logradouro);
            setIfEmpty('imvNumero', data.numero);
            setIfEmpty('imvComplemento', data.complemento);
            setIfEmpty('imvBairro', data.bairro);
            setIfEmpty('imvAreaTotal', data.area_total);
            setIfEmpty('imvTestada', data.testada);
            setIfEmpty('imvProfundidade', data.profundidade);

            // Se tem inscrição, decompor automaticamente
            if (data.inscricao_imovel && typeof decomporInscricao === 'function') {
                decomporInscricao(data.inscricao_imovel);
            }

            mostrarFeedback('imvFeedback', '✓ Imóvel encontrado no banco! Dados preenchidos.', 'success');
        } else if (!silencioso) {
            mostrarFeedback('imvFeedback', 'Imóvel não encontrado. Preencha os dados abaixo.', 'info');
        }
    } catch (err) {
        console.error('Erro ao buscar imóvel:', err);
    }
}



// ── Manipulador de importação de arquivo (Drag & Drop ou Clique) ──
async function handleArquivoAnexo(file) {
    document.getElementById('bethaFileName').textContent = file.name;
    document.getElementById('bethaFileInfo').style.display = 'flex';
    document.getElementById('uploadAreaBetha').style.display = 'none';

    const ext = file.name.split('.').pop().toLowerCase();
    let textoExtraido = '';

    try {
        if (ext === 'docx') {
            textoExtraido = await extrairTextoDocx(file);
        } else if (ext === 'doc') {
            textoExtraido = await extrairTextoDoc(file);
        } else if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
            textoExtraido = await extrairTextoPlanilha(file);
        } else {
            textoExtraido = await file.text();
        }

        if (!textoExtraido || !textoExtraido.trim()) {
            alert('Não foi possível ler o conteúdo do arquivo. Tente .docx, .xlsx ou .csv.');
            return;
        }

        extrairDadosDoTextoNP(textoExtraido);
        mostrarFeedbackParseSucesso();
    } catch (err) {
        console.error('Erro ao processar arquivo:', err);
        alert('Erro ao processar o arquivo: ' + (err.message || 'formato não suportado'));
    }
}

async function extrairTextoDocx(file) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file('word/document.xml').async('text');

    // Insere marcadores de quebra entre parágrafos e células mantendo os espaços do texto
    const xmlComMarcadores = docXml
        .replace(/<\/w:tc>/gi, ' <w:t>###TAB###</w:t> ')
        .replace(/<\/w:tr>/gi, ' <w:t>###LINHA###</w:t> ')
        .replace(/<\/w:p>/gi, ' <w:t>###LINHA###</w:t> ');

    const regexText = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    const textParts = [];
    let match;
    while ((match = regexText.exec(xmlComMarcadores)) !== null) {
        textParts.push(match[1]);
    }

    const textoBruto = textParts
        .join(' ')
        .replace(/###TAB###/g, '\t')
        .replace(/###LINHA###/g, '\n');

    // Normaliza espaços mantendo as quebras de linha
    return textoBruto
        .split('\n')
        .map(linha => linha.replace(/\s+/g, ' ').trim())
        .filter(linha => linha.length > 0)
        .join('\n');
}

async function extrairTextoPlanilha(file) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(firstSheet);
}

async function extrairTextoDoc(file) {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Muitos arquivos .doc exportados por sistemas (BETHA) são na verdade HTML.
    // Detecta pelo BOM UTF-8 seguido de <html ou <!DOCTYPE.
    let inicio = 0;
    if (data.length > 3 && data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) {
        inicio = 3;
    }
    const primeirosBytes = data.slice(inicio, inicio + 100);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const amostra = decoder.decode(primeirosBytes).trim().toLowerCase();

    if (amostra.startsWith('<html') || amostra.startsWith('<!doctype')) {
        const html = decoder.decode(data);
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    // .doc binário (formato OLE/Word antigo): extrai strings UTF-16 LE legíveis
    return extrairTextoStringsDoBuffer(data);
}

function extrairTextoStringsDoBuffer(data) {
    const partes = [];
    const len = data.length;
    let i = 0;

    while (i < len - 1) {
        const c1 = data[i];
        const c2 = data[i + 1];

        // UTF-16 LE: byte alto 0x00 e byte baixo imprimível, ou caracteres latinos comuns
        if (c2 === 0x00 && ((c1 >= 0x20 && c1 <= 0x7E) || c1 === 0x0A || c1 === 0x0D)) {
            let j = i;
            const chars = [];
            while (j < len - 1 && data[j + 1] === 0x00) {
                const ch = data[j];
                if (ch >= 0x20 && ch <= 0x7E) {
                    chars.push(String.fromCharCode(ch));
                    j += 2;
                } else if (ch === 0x0A || ch === 0x0D) {
                    chars.push(' ');
                    j += 2;
                } else {
                    break;
                }
            }
            if (chars.length >= 4) {
                partes.push(chars.join(''));
                i = j;
                continue;
            }
        }

        // UTF-16 LE com caracteres acentuados (faixa latina básica: 0x00C0-0x00FF no word alto)
        if (c2 >= 0x00 && c2 <= 0x04 && c1 >= 0x20) {
            let j = i;
            const chars = [];
            while (j < len - 1) {
                const low = data[j];
                const high = data[j + 1];
                if (high === 0x00 && (low < 0x20 || low > 0x7E) && low !== 0x0A && low !== 0x0D) break;
                if (high > 0x04) break;
                const code = low | (high << 8);
                if (code >= 0x20 && code <= 0xFFFF) {
                    chars.push(String.fromCharCode(code));
                    j += 2;
                } else {
                    break;
                }
            }
            if (chars.length >= 4) {
                partes.push(chars.join(''));
                i = j;
                continue;
            }
        }

        i++;
    }

    return partes.join(' ');
}

// ── Extrai logradouro, número e bairro da frase "situado à ..." ──
function extrairLogradouroSituado(texto) {
    const resultado = { logradouro: '', numero: '', bairro: '' };
    // Tenta o formato completo: situado à RUA, NÚMERO, - BAIRRO -
    let m = texto.match(/situado\s+(?:à|a|na)\s+([^,]+?)\s*,\s*([^\s,]+?)\s*,\s*-\s*([^-]+?)\s*-/i);
    if (m) {
        resultado.logradouro = m[1].trim();
        resultado.numero = m[2].trim();
        resultado.bairro = m[3].trim();
        return resultado;
    }
    // Fallback: situado à RUA NÚMERO - BAIRRO (sem vírgula entre logradouro e número)
    m = texto.match(/situado\s+(?:à|a|na)\s+([A-ZÀ-Úa-zà-ú\s]+?)\s+(\d+)\s*,?\s*-\s*([^-]+?)\s*-/i);
    if (m) {
        resultado.logradouro = m[1].trim();
        resultado.numero = m[2].trim();
        resultado.bairro = m[3].trim();
    }
    return resultado;
}

// ── Extrai campos do imóvel pelos rótulos, ignorando valores que são outros rótulos ──
function extrairCamposImovelPorRotulos(secImovel) {
    const resultado = { logradouro: '', numero: '', bairro: '', complemento: '' };
    const rotulos = [
        { nome: 'codigo', regex: /Código:/i },
        { nome: 'logradouro', regex: /Logradouro:/i },
        { nome: 'complemento', regex: /Complemento:/i },
        { nome: 'matricula', regex: /Matr[íi]cula:/i },
        { nome: 'numero', regex: /Número:/i },
        { nome: 'loteamento', regex: /Loteamento:/i },
        { nome: 'lote', regex: /Lote:/i },
        { nome: 'quadra', regex: /Quadra:/i },
        { nome: 'bairro', regex: /Bairro:/i },
        { nome: 'inscricao', regex: /Inscrição(?:\s+do\s+Imóvel)?:/i }
    ];

    const posicoes = [];
    rotulos.forEach(r => {
        const m = secImovel.match(r.regex);
        if (m) {
            posicoes.push({ nome: r.nome, index: m.index, matchLen: m[0].length });
        }
    });

    posicoes.sort((a, b) => a.index - b.index);

    for (let i = 0; i < posicoes.length; i++) {
        const atual = posicoes[i];
        const inicio = atual.index + atual.matchLen;
        const fim = (i + 1 < posicoes.length) ? posicoes[i + 1].index : secImovel.length;
        let valor = secImovel.substring(inicio, fim).trim();

        // Limpa quebras de linha e remove se o valor for outro rótulo
        valor = valor.split(/[\r\n]/)[0].trim();
        if (!valor) continue;
        if (rotulos.some(r => r.regex.test(valor))) continue;

        if (atual.nome === 'logradouro') resultado.logradouro = valor;
        else if (atual.nome === 'numero') resultado.numero = valor;
        else if (atual.nome === 'bairro') {
            // Em alguns modelos o lote/quadra/inscrição gruda no bairro; remove números/pontos do final.
            const bairroLimpo = valor.replace(/[\s\.\d]+$/g, '').trim();
            resultado.bairro = bairroLimpo || valor;
        }
        else if (atual.nome === 'complemento') resultado.complemento = valor;
    }

    return resultado;
}

// ── Extrai logradouro e bairro do imóvel considerando o layout de colunas do BETHA ──
// No modelo .xls exportado, o rótulo "Bairro:" pode ficar sozinho em uma linha e o valor
// aparecer na mesma linha do "Logradouro:", deslocado para a direita.
function extrairLogradouroEBairroImovel(textoOriginal) {
    const linhas = textoOriginal.split(/\r?\n/);
    let dentroImovel = false;
    let bairroVazioNaLinhaAnterior = false;
    const resultado = { logradouro: '', bairro: '' };

    for (let i = 0; i < linhas.length; i++) {
        const celulas = linhas[i]
            .split(',')
            .map(c => c.trim())
            .map((val, idx) => ({ idx, val }))
            .filter(c => c.val !== '');

        const rowText = celulas.map(c => c.val).join(' ');

        if (/INFORMAÇÕES\s+DO\s+IMÓVEL|Informações\s+do\s+imóvel/i.test(rowText)) {
            dentroImovel = true;
            continue;
        }
        if (dentroImovel && /Verificamos|Usuário:/i.test(rowText)) {
            dentroImovel = false;
        }
        if (!dentroImovel) continue;

        // Linha com o rótulo Bairro: (pode vir vazia no .xls do BETHA)
        const idxBairro = celulas.findIndex(c => c.val.toLowerCase().startsWith('bairro'));
        if (idxBairro >= 0) {
            const valoresDepois = celulas.slice(idxBairro + 1).filter(c => c.val !== '');
            if (valoresDepois.length > 0) {
                resultado.bairro = valoresDepois.map(c => c.val).join(' ');
                bairroVazioNaLinhaAnterior = false;
            } else {
                bairroVazioNaLinhaAnterior = true;
            }
        }

        // Linha com o rótulo Logradouro:
        const idxLog = celulas.findIndex(c => c.val.toLowerCase().startsWith('logradouro'));
        if (idxLog >= 0) {
            const valoresDepois = celulas.slice(idxLog + 1).filter(c => c.val !== '');
            if (valoresDepois.length > 0) {
                resultado.logradouro = valoresDepois[0].val;
                // Se o bairro estava vazio na linha anterior, o valor extra à direita é o bairro
                if (bairroVazioNaLinhaAnterior && valoresDepois.length > 1) {
                    resultado.bairro = valoresDepois.slice(1).map(c => c.val).join(' ');
                }
            }
            break;
        }
    }

    return resultado;
}

// ── Extração inteligente de dados (Modelo NP ou Planilha) ──
function extrairDadosDoTextoNP(texto) {
    console.log('Analisando texto bruto do arquivo:', texto);

    // ── LIMPEZA DE CSV COM MUITAS COLUNAS VAZIAS (planilhas exportadas do BETHA) ──
    // Planilhas .xls/.xlsx do BETHA geram CSVs com dezenas de colunas vazias.
    // Aqui convertemos cada linha em uma lista de células não-vazias e
    // montamos um texto limpo com uma informação por linha.
    const linhas = texto.split(/\r?\n/);
    const linhasLimpas = [];
    linhas.forEach(linha => {
        const celulas = linha.split(',').map(c => c.trim()).filter(c => c !== '');
        if (celulas.length > 0) {
            linhasLimpas.push(celulas.join(' '));
        }
    });
    const textoLimpo = linhasLimpas.join('\n');
    console.log('Texto limpo:', textoLimpo);

    const partes = textoLimpo.split(/INFORMAÇÕES\s+DO\s+IMÓVEL|Informações\s+do\s+imóvel/i);
    const secContribuinte = partes[0] || textoLimpo;
    const secImovel = partes[1] || textoLimpo;

    // --- 1. CONTRIBUINTE ---
    // Nome do contribuinte (evita casar a palavra dentro de "INFORMAÇÕES DO CONTRIBUINTE")
    const mContNome = secContribuinte.match(/Contribuinte\s*:\s*(?:ESPOLIO\s+DE\s+([^\n\r]+?)|([^\n\r]+?))(?=\s+(?:Nº\s+CPF|CPF|Logradouro|CEP|Município)|\n|$)/i);
    if (mContNome) {
        const nome = (mContNome[1] ? 'ESPÓLIO DE ' + mContNome[1] : mContNome[2]).trim();
        document.getElementById('contNome').value = nome;
    }

    // CPF/CNPJ (permite espaços entre dígitos que o Word possa introduzir)
    const mContCpf = secContribuinte.match(/(?:CPF\/CNPJ|CPF\s*\/?\s*CNPJ|Nº\s*CPF\s*\/\s*CNPJ)[:\s]*([0-9\.\-\/\s]+?[0-9]{2})(?=\s+[A-Za-zÀ-Úà-ú]|\s*Bairro|\n|$)/i);
    if (mContCpf) {
        document.getElementById('contCpfCnpj').value = mContCpf[1].replace(/\s+/g, '').trim();
    }

    // Logradouro do contribuinte
    const mContLog = secContribuinte.match(/Logradouro[:\s]+([^\n\r]+?)(?=\s+(?:CEP|Município|Número|Nº|CPF|Bairro)|\n|$)/i);
    if (mContLog) {
        document.getElementById('contLogradouro').value = mContLog[1].trim();
    }

    // CEP
    const mContCep = secContribuinte.match(/CEP[:\s]+([\d\-]+)/i);
    if (mContCep) {
        document.getElementById('contCep').value = mContCep[1].trim();
    }

    // Município
    const mContMun = secContribuinte.match(/Município[:\s]+([^\n\r]+?)(?=\s+(?:Número|Nº|CPF|Bairro|Observac[ãa]o)|\n|$)/i);
    if (mContMun && mContMun[1].trim()) {
        document.getElementById('contMunicipio').value = mContMun[1].trim();
    }

    // Bairro do contribuinte
    const mContBairro = secContribuinte.match(/Bairro[:\s]+([^\n\r]+?)(?=\s+(?:Número|Observac[ãa]o|Informações|INFORMAÇÕES)|\n|$)/i);
    if (mContBairro) {
        document.getElementById('contBairro').value = mContBairro[1].trim();
    }

    // Número do contribuinte
    const mContNum = secContribuinte.match(/Número[:\s]+([^\n\r]+?)(?=\s+Observac[ãa]o|\s+Informações|\s+Bairro|\n|$)/i);
    if (mContNum) {
        document.getElementById('contNumero').value = mContNum[1].trim();
    }

    // Observação / Complemento
    const mContComp = secContribuinte.match(/Observa[çc][ãa]o[:\s]+([^\n\r]+?)(?=\s+(?:INFORMAÇÕES|Informações|Contribuinte|Logradouro|CEP|Nº|CPF|Bairro|Número)|\n|$)/i);
    if (mContComp) {
        const val = mContComp[1].trim();
        if (!val.toLowerCase().startsWith('contribuinte') && !val.toLowerCase().startsWith('informação') && !val.toLowerCase().startsWith('informacoes')) {
            document.getElementById('contComplemento').value = val;
        } else {
            document.getElementById('contComplemento').value = '';
        }
    }

    // --- 2. IMÓVEL ---
    // Inscrição do Imóvel
    const mImvInsc = secImovel.match(/Inscrição(?:\s+do\s+Imóvel)?[:\s]+([\d\.]+)/i);
    if (mImvInsc) {
        const insc = mImvInsc[1].trim();
        document.getElementById('imvInscricao').value = insc;
        decomporInscricao(insc);
    }

    // Código Reduzido (busca após Código: na seção do imóvel, evita pegar Código: do contribuinte)
    let codImv = '';
    const mImvCod = secImovel.match(/Código[:\s]+(\d{3,})(?=\s+Quadra|\s+Número|\s+Logradouro|\s+Matrícula|\s+Inscrição|\n|$)/i);
    if (mImvCod) {
        codImv = mImvCod[1];
    } else {
        const mImvMat = secImovel.match(/Matr[íi]cula[:\s]+(\d+)/i);
        if (mImvMat) codImv = mImvMat[1];
    }
    if (codImv) {
        document.getElementById('imvCodigo').value = codImv.trim();
    }

    // Logradouro, Número, Bairro e Complemento do Imóvel
    // Prioridade 1: frase descritiva "situado à RUA, NÚMERO, - BAIRRO -"
    const camposSituado = extrairLogradouroSituado(secImovel);

    // Prioridade 2: parser de colunas do BETHA (funciona para CSV/xls)
    const camposColunas = extrairLogradouroEBairroImovel(texto);

    // Prioridade 3: rótulos explícitos no texto
    const camposRotulos = extrairCamposImovelPorRotulos(secImovel);

    // Define o logradouro
    const logradouroFinal = (camposSituado.logradouro || camposColunas.logradouro || camposRotulos.logradouro || '').replace(/\s+/g, ' ').trim();
    if (logradouroFinal) document.getElementById('imvLogradouro').value = logradouroFinal;

    // Define o número
    const numeroFinal = (camposSituado.numero || camposRotulos.numero || '').replace(/\s+/g, ' ').trim();
    if (numeroFinal) document.getElementById('imvNumero').value = numeroFinal;

    // Define o bairro
    const bairroFinal = (camposSituado.bairro || camposColunas.bairro || camposRotulos.bairro || '').replace(/\s+/g, ' ').trim();
    if (bairroFinal) document.getElementById('imvBairro').value = bairroFinal;

    // Define o complemento
    const complementoFinal = (camposRotulos.complemento || '').replace(/\s+/g, ' ').trim();
    if (complementoFinal) document.getElementById('imvComplemento').value = complementoFinal;

    // Área Total
    const mImvArea = secImovel.match(/(\d+(?:\.\d+)?)\s*m²/i);
    if (mImvArea) {
        document.getElementById('imvAreaTotal').value = mImvArea[1].trim();
    }

    // Testada
    const mImvTestada = secImovel.match(/(\d+(?:\.\d+)?)\s*m\s+de\s+(?:Extensao|extensão)/i);
    if (mImvTestada) {
        document.getElementById('imvTestada').value = mImvTestada[1].trim();
    }

    mostrarFeedbackParseSucesso();
}

function mostrarFeedbackParseSucesso() {
    let box = document.getElementById('parseFeedbackBox');
    if (!box) {
        const bethaFileInfo = document.getElementById('bethaFileInfo');
        if (!bethaFileInfo || !bethaFileInfo.parentElement) return;
        box = document.createElement('div');
        box.id = 'parseFeedbackBox';
        box.style.cssText = 'margin-top:14px;padding:12px 16px;background:#ecfdf5;border:1px solid #10b981;border-radius:8px;color:#065f46;font-size:0.85rem;display:flex;align-items:center;gap:10px;';
        bethaFileInfo.parentElement.appendChild(box);
    }
    box.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    <div><strong>Dados extraídos automaticamente com sucesso!</strong><br>Os passos 1 (Contribuinte) e 2 (Imóvel) foram preenchidos com as informações do arquivo.</div>`;
    box.style.display = 'flex';
}
