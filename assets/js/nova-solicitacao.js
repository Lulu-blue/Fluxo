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
let numerosReservadosEditor = { processo: null, relatorio: null, certidao: null };
let bicArquivoAnexado = null;

// Configurar Worker do PDF.js se disponível
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── Helper: enviar arquivo para Cloudinary (ou Base64 DataURL fallback) ──
async function fileToBase64(file) {
    if (typeof window.uploadParaCloudinary === 'function') {
        try {
            const urlCloud = await window.uploadParaCloudinary(file, 'semac_documentos');
            return urlCloud;
        } catch (cldErr) {
            console.warn('[Cloudinary Warning] Upload de arquivo em nova-solicitacao falhou, caindo para DataURL:', cldErr);
        }
    }
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

// Devolve números reservados se a página for recarregada ou fechada sem salvar
window.addEventListener('beforeunload', () => {
    if (typeof numerosReservadosEditor !== 'undefined' && (numerosReservadosEditor.processo || numerosReservadosEditor.relatorio)) {
        if (typeof devolverNumerosReservadosEditor === 'function') {
            devolverNumerosReservadosEditor();
        }
    }
});

// ── Abrir / Fechar Modal ────────────────────────────────────
async function abrirModal() {
    const modal = document.getElementById('modalNovaSolicitacao');
    if (modal) modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    currentWizardStep = 1;
    carregarOpcoesDecreto();
    atualizarWizard();
    carregarDadosFiscal();

    // Reserva imediatamente o número do Processo e do Relatório Fiscal com Row Lock
    if (typeof garantirNumerosReservados === 'function') {
        await garantirNumerosReservados();
    }
}

async function fecharModal() {
    const modal = document.getElementById('modalNovaSolicitacao');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    bicArquivoAnexado = null;

    // Se a pessoa fechar/descartar o modal sem finalizar, libera os números reservados
    if (typeof devolverNumerosReservadosEditor === 'function') {
        await devolverNumerosReservadosEditor();
    }
}

// ── Gerenciamento Dinâmico de Decretos ───────────────────────
let cacheDecretos = [];

async function carregarOpcoesDecreto(valorSelecionado = '') {
    const select = document.getElementById('fiscNumeroDecreto');
    if (!select) return;

    select.innerHTML = '<option value="">Carregando decretos...</option>';

    try {
        const { data, error } = await supabaseClient
            .from('decretos')
            .select('id, numero, data_decreto')
            .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
            cacheDecretos = data;
        } else {
            cacheDecretos = [
                { id: 'default_17326', numero: '17.326/2026', data_decreto: '2026-07-02', nome_arquivo: 'Decreto 17.326-26.pdf' }
            ];
        }
    } catch (e) {
        console.warn('Erro ao carregar decretos do Supabase:', e);
        cacheDecretos = [
            { id: 'default_17326', numero: '17.326/2026', data_decreto: '2026-07-02', nome_arquivo: 'Decreto 17.326-26.pdf' }
        ];
    }

    const valAtual = valorSelecionado || select.value;
    select.innerHTML = '<option value="">Selecione o decreto...</option>';

    cacheDecretos.forEach(dec => {
        const opt = document.createElement('option');
        opt.value = dec.id;

        let dataFmt = '';
        if (dec.data_decreto) {
            const parts = dec.data_decreto.split('-');
            dataFmt = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dec.data_decreto;
        }
        opt.textContent = `${dec.numero}${dataFmt ? ' (' + dataFmt + ')' : ''}`;

        if (String(dec.id) === String(valAtual) || dec.numero === valAtual) opt.selected = true;
        select.appendChild(opt);
    });

    const optOutro = document.createElement('option');
    optOutro.value = 'outro';
    optOutro.textContent = 'Outro...';
    if (valAtual === 'outro') optOutro.selected = true;
    select.appendChild(optOutro);
}

function obterNumeroDecretoSelecionado() {
    const decretoSim = document.getElementById('fiscDecreto')?.value === 'sim';
    if (!decretoSim) return null;

    const sel = document.getElementById('fiscNumeroDecreto')?.value;
    if (!sel) return null;

    if (sel === 'outro') {
        return document.getElementById('fiscNumeroDecretoOutro')?.value?.trim() || null;
    }
    const dec = cacheDecretos.find(d => String(d.id) === String(sel) || d.numero === sel);
    return dec ? dec.numero : sel;
}

function obterDataDecretoSelecionada() {
    const decretoSim = document.getElementById('fiscDecreto')?.value === 'sim';
    if (!decretoSim) return null;

    const sel = document.getElementById('fiscNumeroDecreto')?.value;
    if (!sel) return null;

    if (sel === 'outro') {
        return document.getElementById('fiscDataDecretoOutro')?.value?.trim() || null;
    }
    const dec = cacheDecretos.find(d => String(d.id) === String(sel) || d.numero === sel);
    return dec ? dec.data_decreto : null;
}

function obterDecretoIdSelecionado() {
    const decretoSim = document.getElementById('fiscDecreto')?.value === 'sim';
    if (!decretoSim) return null;

    const sel = document.getElementById('fiscNumeroDecreto')?.value;
    if (!sel || sel === 'outro') return null;
    return sel;
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

function obterStepLabel(stepIndex) {
    return STEP_LABELS[stepIndex - 1];
}

function atualizarLabelsUIWizardStep5() {
    const decretoSim = document.getElementById('fiscDecreto')?.value === 'sim';

    const step5Small = document.querySelector('.progress-step[data-step="5"] small');
    if (step5Small) {
        step5Small.textContent = 'Relatório Fiscal';
    }

    const step5H3 = document.querySelector('#step5 h3');
    if (step5H3) {
        step5H3.textContent = 'Relatório Fiscal';
    }

    const step5Desc = document.querySelector('#step5 .step-desc');
    if (step5Desc) {
        if (decretoSim) {
            step5Desc.textContent = 'Confira o texto e a prévia do Relatório Fiscal referente ao Decreto antes de gerar o processo.';
        } else {
            step5Desc.textContent = 'Preencha as informações adicionais para o Relatório Fiscal e edite o texto base se necessário.';
        }
    }

    const atendimentoRow = document.getElementById('relAtendimentoTipo')?.closest('.form-row');
    const textoGroup = document.getElementById('relTextoVistoria')?.closest('.form-group');
    const btnAbrirEditor = document.getElementById('btnAbrirEditorRelatorio');
    const btnBaixarCertidao = document.getElementById('btnBaixarCertidaoPdf');
    const btnEditorRow = btnAbrirEditor?.closest('.form-row') || btnBaixarCertidao?.closest('.form-row');

    const btnFinalizar = document.getElementById('btnWizardFinalizar');
    if (btnFinalizar) {
        if (decretoSim) {
            btnFinalizar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Gerar Auto de Infração`;
            btnFinalizar.dataset.originalHtml = btnFinalizar.innerHTML;
        } else {
            btnFinalizar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Gerar Notificação`;
            btnFinalizar.dataset.originalHtml = btnFinalizar.innerHTML;
        }
    }

    if (decretoSim) {
        if (atendimentoRow) atendimentoRow.style.display = 'none';
        if (textoGroup) textoGroup.style.display = 'none';
    } else {
        if (atendimentoRow) atendimentoRow.style.display = 'flex';
        if (textoGroup) textoGroup.style.display = 'block';
    }

    if (btnEditorRow) btnEditorRow.style.display = 'flex';
    if (btnAbrirEditor) btnAbrirEditor.style.display = 'inline-flex';
    if (btnBaixarCertidao) btnBaixarCertidao.style.display = 'none';
}

// ── Navegação do Wizard ─────────────────────────────────────
function atualizarWizard() {
    atualizarLabelsUIWizardStep5();

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
        `Passo ${currentWizardStep} de ${TOTAL_STEPS} — ${obterStepLabel(currentWizardStep)}`;

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
            const decretoSim = document.getElementById('fiscDecreto')?.value === 'sim';
            const msgCarregando = decretoSim ? 'Criando Auto de Infração...' : 'Criando Notificação...';
            btnFinalizar.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;"></div> ${msgCarregando}`;
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
            if (!bicArquivoAnexado) {
                alert('O anexo do Espelho Cadastral (BIC) em PDF é obrigatório.');
                const areaBic = document.getElementById('uploadAreaBic') || document.getElementById('bicFileInfo');
                if (areaBic) areaBic.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return false;
            }
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

            // Validação das Imagens da Vistoria com Legenda (Obrigatório)
            const containerImagens = document.getElementById('lista-imagens-legenda');
            const itensImagens = containerImagens ? containerImagens.querySelectorAll('.item-imagem-legenda') : [];
            let temImagemValida = false;

            for (const item of itensImagens) {
                const imgInput = item.querySelector('.imagem-arquivo');
                if (imgInput && (imgInput.files?.length > 0 || imgInput.getAttribute('data-base64'))) {
                    temImagemValida = true;
                    break;
                }
            }

            if (!temImagemValida) {
                alert('É OBRIGATÓRIO anexar pelo menos 1 Imagem da Vistoria com Legenda.');
                if (containerImagens && itensImagens.length === 0) {
                    if (typeof window.adicionarCampoImagemLegenda === 'function') {
                        window.adicionarCampoImagemLegenda();
                    }
                }
                const areaImagens = document.getElementById('container-imagens-legenda');
                if (areaImagens) areaImagens.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return false;
            }

            const decreto = document.getElementById('fiscDecreto')?.value;
            if (!decreto) {
                alert('Informe se é decorrente de Decreto de Notificação.');
                document.getElementById('fiscDecreto')?.focus();
                return false;
            }

            if (decreto === 'sim') {
                const numDecretoSel = document.getElementById('fiscNumeroDecreto')?.value;
                if (!numDecretoSel) {
                    alert('Selecione o Número do Decreto.');
                    document.getElementById('fiscNumeroDecreto')?.focus();
                    return false;
                }

                if (numDecretoSel === 'outro') {
                    const numDecretoOutro = document.getElementById('fiscNumeroDecretoOutro')?.value?.trim();
                    if (!numDecretoOutro) {
                        alert('Informe o Número do Decreto no campo "Outro".');
                        document.getElementById('fiscNumeroDecretoOutro')?.focus();
                        return false;
                    }

                    const dataDecretoOutro = document.getElementById('fiscDataDecretoOutro')?.value?.trim();
                    if (!dataDecretoOutro) {
                        alert('Informe a Data do Novo Decreto.');
                        document.getElementById('fiscDataDecretoOutro')?.focus();
                        return false;
                    }

                    const fileDecreto = document.getElementById('inputDecreto')?.files?.[0];
                    if (!fileDecreto) {
                        alert('O anexo do Novo Decreto (PDF/Doc) é obrigatório.');
                        document.getElementById('inputDecreto')?.focus();
                        return false;
                    }
                }
            }

            return true;
        }
        case 4: {
            const decretoSim = document.getElementById('fiscDecreto')?.value === 'sim';
            const checked = document.querySelectorAll('#infracoesList input[name="infracao"]:checked');
            if (checked.length === 0) {
                alert('Selecione pelo menos um dispositivo legal transgredido.');
                return false;
            }
            if (decretoSim && checked.length > 1) {
                alert('Para processos decorrentes de Decreto, é permitido selecionar apenas 1 dispositivo legal transgredido.');
                return false;
            }
            return true;
        }
        case 5: {
            const decretoSim = document.getElementById('fiscDecreto')?.value === 'sim';
            if (decretoSim) return true;

            const atendimentoTipo = document.getElementById('relAtendimentoTipo')?.value?.trim();
            const atendimentoValor = document.getElementById('relAtendimentoValor')?.value?.trim();
            const assunto = document.getElementById('relAssunto')?.value?.trim();
            const textoVistoria = document.getElementById('relTextoVistoria')?.value?.trim();

            if (!atendimentoTipo) {
                alert('Selecione o Tipo em "Para atendimento" (Ex: Denúncia, Memorando, etc.).');
                document.getElementById('relAtendimentoTipo')?.focus();
                return false;
            }
            const semNumero = atendimentoTipo === 'Constatação do Fiscal inloco sem denuncia Formalizada';
            if (!semNumero && !atendimentoValor) {
                alert('Informe o Número em "Para atendimento" (Ex: 123/2026).');
                document.getElementById('relAtendimentoValor')?.focus();
                return false;
            }
            if (!assunto) {
                alert('Informe o "Assunto" no Relatório Fiscal.');
                document.getElementById('relAssunto')?.focus();
                return false;
            }
            if (!textoVistoria) {
                alert('Informe o Texto do Relatório (Descreva as transgressões) antes de prosseguir.');
                document.getElementById('relTextoVistoria')?.focus();
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
        document.getElementById('imvSetor').textContent = parts[0] || '—';
        document.getElementById('imvZona').textContent = parts[1] || '—';
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
    for (let s = 1; s <= 5; s++) {
        if (!validarStep(s)) return;
    }

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

        // 3. Gerar numeração do processo, relatório ou certidão
        const anoAtual = new Date().getFullYear();
        let numeroProcesso = numerosReservadosEditor.processo;
        let numeroRelatorio = null;
        let numeroCertidao = null;
        const decretoSim = dados.fiscal.decreto === 'sim';

        if (!numeroProcesso) {
            const { data: np, error: errNumProc } = await supabaseClient
                .rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Processo' });
            if (!errNumProc && np) {
                numeroProcesso = np;
            } else {
                console.warn('RPC reservar_numero para Processo falhou no envio final, buscando fallback:', errNumProc?.message);
                numeroProcesso = await obterNumeroFallbackJS(anoAtual, 'Processo', 6, 'processos', 'numero_processo');
            }
        }

        numeroRelatorio = numerosReservadosEditor.relatorio;
        if (!numeroRelatorio) {
            const { data: nr, error: errNumRel } = await supabaseClient
                .rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Relatório Fiscal' });
            if (!errNumRel && nr) {
                numeroRelatorio = nr;
            } else {
                console.warn('RPC reservar_numero para Relatório Fiscal falhou no envio final, buscando fallback:', errNumRel?.message);
                numeroRelatorio = await obterNumeroFallbackJS(anoAtual, 'Relatório Fiscal', 3, 'processos', 'numero_relatorio');
            }
        }

        // Limpa os números reservados para não devolvê-los acidentalmente após o uso
        numerosReservadosEditor.processo = null;
        numerosReservadosEditor.relatorio = null;
        numerosReservadosEditor.certidao = null;

        dados.relatorio_fiscal = dados.relatorio_fiscal || {};
        dados.relatorio_fiscal.numero_relatorio = numeroRelatorio;

        // 4. Determinar a Etapa Inicial (14 se Decreto, 1 se Padrão)
        const targetEtapaNumero = decretoSim ? 14 : 1;
        let etapaId = 1;
        const { data: etapaTarget } = await supabaseClient
            .from('etapas')
            .select('id')
            .eq('numero', targetEtapaNumero)
            .maybeSingle();
        if (etapaTarget) etapaId = etapaTarget.id;

        // 4.5 Converter BIC para Base64 antes de gravar o processo
        let bicObjetoSalvar = null;
        if (bicArquivoAnexado) {
            try {
                const bicBase64 = await fileToBase64(bicArquivoAnexado);
                bicObjetoSalvar = {
                    nome: bicArquivoAnexado.name,
                    tipo: bicArquivoAnexado.type || 'application/pdf',
                    dataUrl: bicBase64,
                    data_upload: new Date().toISOString()
                };
            } catch (eBic) {
                console.warn('Erro ao converter arquivo BIC para base64:', eBic);
            }
        }

        // 4.6 Tratar Decreto de Notificação e salvar novo se for "Outro..."
        let decretoIdFinal = null;
        if (dados.fiscal.decreto === 'sim') {
            const selVal = document.getElementById('fiscNumeroDecreto')?.value;
            if (selVal === 'outro') {
                const numOutro = document.getElementById('fiscNumeroDecretoOutro')?.value?.trim();
                const dataOutro = document.getElementById('fiscDataDecretoOutro')?.value?.trim();
                const fileDecreto = document.getElementById('inputDecreto')?.files?.[0];

                let base64Decreto = null;
                if (fileDecreto) {
                    try {
                        base64Decreto = await fileToBase64(fileDecreto);
                    } catch (e) { console.warn('Erro ao ler arquivo do decreto:', e); }
                }

                try {
                    const { data: decCriado, error: errDec } = await supabaseClient
                        .from('decretos')
                        .insert([{
                            numero: numOutro,
                            data_decreto: dataOutro,
                            arquivo_url: base64Decreto,
                            nome_arquivo: fileDecreto ? fileDecreto.name : null
                        }])
                        .select()
                        .single();

                    if (!errDec && decCriado) {
                        decretoIdFinal = decCriado.id;
                    }
                } catch (eDecIns) {
                    console.warn('Erro ao salvar novo decreto no banco de dados:', eDecIns);
                }
            } else if (selVal && selVal !== 'default_17326') {
                decretoIdFinal = selVal;
            }
        }

        // 5. Inserir processo em 'processos' com verificação automática de colisão
        const novoProcessoObj = {
            fiscal_id: profileId,
            etapa_atual_id: etapaId,
            status: 'em_aberto',
            possui_decreto: decretoSim,
            decreto_id: decretoIdFinal,
            processo_existente: dados.infracoes.processo_existente === 'sim',
            processo_existente_ref: dados.infracoes.processo_ref || null,
            data_vistoria: dados.fiscal.data_vistoria || null,
            descricao_fiscalizacao: dados.fiscal.descricao || null,
            dados: {
                contribuinte: dados.contribuinte,
                imovel: dados.imovel,
                fiscal: {
                    ...dados.fiscal,
                    decreto_id: decretoIdFinal
                },
                infracoes: dados.infracoes,
                relatorio_fiscal: dados.relatorio_fiscal,
                certidao: dados.certidao || null,
                anexos: {}
            }
        };

        let procCriado = null;
        let errProc = null;
        let tentativasProc = 0;
        const maxTentativasProc = 5;

        while (tentativasProc < maxTentativasProc) {
            tentativasProc++;
            novoProcessoObj.numero_processo = numeroProcesso;
            novoProcessoObj.numero_relatorio = numeroRelatorio;

            const resIns = await supabaseClient
                .from('processos')
                .insert([novoProcessoObj])
                .select()
                .single();

            procCriado = resIns.data;
            errProc = resIns.error;

            if (!errProc && procCriado) {
                break; // Inserção com sucesso!
            }

            const errMsg = errProc?.message || '';
            const isDupProc = errMsg.includes('processos_numero_processo_key') || errProc?.code === '23505';
            const isDupRel = errMsg.includes('processos_numero_relatorio_key');

            if (isDupProc || isDupRel) {
                console.warn(`[TENTATIVA ${tentativasProc}/${maxTentativasProc}] Colisão de número na inserção do processo. Proc: ${numeroProcesso}, Rel: ${numeroRelatorio}. Solicitando novo número...`);

                if (isDupProc) {
                    const { data: np } = await supabaseClient.rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Processo' });
                    if (np) {
                        numeroProcesso = np;
                    } else {
                        numeroProcesso = await obterNumeroFallbackJS(anoAtual, 'Processo', 6, 'processos', 'numero_processo');
                    }
                }

                if (isDupRel) {
                    const { data: nr } = await supabaseClient.rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Relatório Fiscal' });
                    if (nr) {
                        numeroRelatorio = nr;
                    } else {
                        numeroRelatorio = await obterNumeroFallbackJS(anoAtual, 'Relatório Fiscal', 3, 'processos', 'numero_relatorio');
                    }
                    dados.relatorio_fiscal = dados.relatorio_fiscal || {};
                    dados.relatorio_fiscal.numero_relatorio = numeroRelatorio;
                    novoProcessoObj.dados.relatorio_fiscal = dados.relatorio_fiscal;
                }
            } else {
                break;
            }
        }

        if (errProc || !procCriado) {
            console.error('Erro ao inserir processo após tentativas:', errProc);
            if (numeroProcesso) await supabaseClient.rpc('devolver_numero', { p_numero: numeroProcesso, p_categoria: 'Processo' });
            if (numeroRelatorio) await supabaseClient.rpc('devolver_numero', { p_numero: numeroRelatorio, p_categoria: 'Relatório Fiscal' });
            throw new Error(errProc?.message || 'Falha ao gravar o processo no banco de dados.');
        }

        // 5.5 Registrar o documento Relatório Fiscal na tabela documentos centralizada
        try {
            let relatorioUrl = construirHtmlRelatorioFiscal(numeroRelatorio, numeroProcesso, procCriado);
            if (window.relatorioCustomizadoHTML && window.relatorioCustomizadoHTML.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('RELATORIO FISCAL')) {
                relatorioUrl = window.relatorioCustomizadoHTML;
            }
            const { data: docRF } = await supabaseClient.from('documentos').insert([{
                processo_id: procCriado.id,
                etapa_id: etapaId,
                tipo: 'Relatório Fiscal',
                nome_arquivo: `Relatorio_Fiscal_${numeroRelatorio.replace(/[\/\\]/g, '-')}.html`,
                url: relatorioUrl,
                gerado_automaticamente: true,
                numero_sequencial: numeroRelatorio,
                usuario_id: profileId
            }]).select('id').single();

            if (docRF && docRF.id) {
                procCriado.dados = procCriado.dados || {};
                procCriado.dados.relatorio_fiscal = procCriado.dados.relatorio_fiscal || {};
                procCriado.dados.relatorio_fiscal.documento_id = docRF.id;
                delete procCriado.dados.relatorio_fiscal.html_customizado;

                await supabaseClient
                    .from('processos')
                    .update({ dados: procCriado.dados })
                    .eq('id', procCriado.id);
            }
        } catch (errDoc) {
            console.error('Erro ao registrar relatório na tabela documentos:', errDoc);
        }

        // Registrar o documento BIC na tabela centralizada documentos
        if (bicObjetoSalvar && procCriado) {
            try {
                const { data: docBic } = await supabaseClient.from('documentos').insert([{
                    processo_id: procCriado.id,
                    etapa_id: etapaId,
                    tipo: 'BIC Espelho Cadastral',
                    nome_arquivo: bicObjetoSalvar.nome,
                    url: bicObjetoSalvar.dataUrl,
                    gerado_automaticamente: false,
                    usuario_id: profileId
                }]).select('id').single();

                if (docBic && docBic.id) {
                    procCriado.dados = procCriado.dados || {};
                    procCriado.dados.documento_bic = {
                        nome: bicObjetoSalvar.nome,
                        documento_id: docBic.id
                    };
                    procCriado.dados.anexos = procCriado.dados.anexos || {};
                    procCriado.dados.anexos.bic_espelho_cadastral = {
                        nome: bicObjetoSalvar.nome,
                        documento_id: docBic.id
                    };
                    await supabaseClient
                        .from('processos')
                        .update({ dados: procCriado.dados })
                        .eq('id', procCriado.id);
                }
            } catch (errDocBic) {
                console.warn('Erro ao registrar BIC na tabela documentos:', errDocBic);
            }
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
                                status: decretoSim ? 'auto_infracao' : 'pendente',
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
                    etapa: targetEtapaNumero,
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
        const containerImagensSalvar = document.getElementById('lista-imagens-legenda');
        if (containerImagensSalvar) {
            const itensSalvar = containerImagensSalvar.querySelectorAll('.item-imagem-legenda');
            if (itensSalvar.length > 0) {
                anexosParaSalvar.imagens_vistoria = [];
                for (let i = 0; i < itensSalvar.length; i++) {
                    const item = itensSalvar[i];
                    const imgInput = item.querySelector('.imagem-arquivo');
                    const legInput = item.querySelector('.imagem-legenda');
                    
                    const imgBase64 = imgInput ? imgInput.getAttribute('data-base64') : null;
                    const legenda = legInput ? legInput.value : '';
                    const imgFile = imgInput && imgInput.files ? imgInput.files[0] : null;

                    if (imgFile) {
                        try {
                            // Faz upload para o Cloudinary (ou pega Base64 se falhar)
                            const imgFinalUrl = await fileToBase64(imgFile);

                            let docId = null;
                            if (procCriado && procCriado.id) {
                                try {
                                    const { data: docCriado, error: errDoc } = await supabaseClient.from('documentos').insert([{
                                        processo_id: procCriado.id,
                                        etapa_id: etapaId,
                                        tipo: 'imagem',
                                        nome_arquivo: imgFile.name,
                                        url: imgFinalUrl,
                                        gerado_automaticamente: false,
                                        usuario_id: profileId
                                    }]).select();
                                    
                                    if (docCriado && docCriado.length > 0) {
                                        docId = docCriado[0].id;
                                    }
                                } catch (eImgDoc) {
                                    console.warn('Aviso ao registrar imagem na tabela documentos:', eImgDoc);
                                }
                            }

                            anexosParaSalvar.imagens_vistoria.push({
                                nome: imgFile.name,
                                tipo: imgFile.type,
                                documento_id: docId,
                                url: imgFinalUrl,
                                legenda: legenda,
                                data_upload: new Date().toISOString()
                            });
                        } catch (e) {
                            console.warn('Erro ao salvar imagem:', e);
                        }
                    }
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

        const msgSucesso = decretoSim
            ? `Processo Nº ${numeroProcesso} e Auto de Infração gerados com sucesso!`
            : `Processo Nº ${numeroProcesso} criado com sucesso!`;
        alert(msgSucesso);
        window.location.href = `etapa.html?processo=${procCriado.id}&etapa=${targetEtapaNumero}`;
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
            numero_decreto: obterNumeroDecretoSelecionado(),
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
async function garantirNumerosReservados() {
    const anoAtual = new Date().getFullYear();

    if (!numerosReservadosEditor.processo) {
        try {
            const { data: np, error: errProc } = await supabaseClient.rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Processo' });
            if (!errProc && np) {
                numerosReservadosEditor.processo = np;
            } else {
                console.warn('RPC reservar_numero para Processo falhou, executando fallback local:', errProc?.message);
                numerosReservadosEditor.processo = await obterNumeroFallbackJS(anoAtual, 'Processo', 6, 'processos', 'numero_processo');
            }
        } catch (e) {
            console.warn('Erro ao reservar número de processo:', e);
        }
    }

    if (!numerosReservadosEditor.relatorio) {
        try {
            const { data: nr, error: errRel } = await supabaseClient.rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Relatório Fiscal' });
            if (!errRel && nr) {
                numerosReservadosEditor.relatorio = nr;
            } else {
                console.warn('RPC reservar_numero para Relatório Fiscal falhou, executando fallback local:', errRel?.message);
                numerosReservadosEditor.relatorio = await obterNumeroFallbackJS(anoAtual, 'Relatório Fiscal', 3, 'processos', 'numero_relatorio');
            }
        } catch (e) {
            console.warn('Erro ao reservar número de relatório:', e);
        }
    }
}

async function prepararEtapaRelatorio() {
    const infracoesSelecionadas = Array.from(document.querySelectorAll('input[name="infracao"]:checked')).map(el => {
        return el.nextElementSibling.textContent.trim().toLowerCase();
    });
    const listaInfracoesStr = infracoesSelecionadas.join(', ');

    const textarea = document.getElementById('relTextoVistoria');
    if (textarea && !textarea.value.trim()) {
        textarea.value = listaInfracoesStr || 'falta de limpeza e conservação de imóvel não edificado, inexistência de cercamento e inexistência de passeio';
    }

    await garantirNumerosReservados();
    renderizarDocumentoRelatorio();
}

function renderizarDocumentoRelatorio() {
    const container = document.getElementById('previewRelatorioContainer');
    if (!container) return;
    container.style.display = 'block';

    if (window.relatorioCustomizadoHTML) {
        let html = window.relatorioCustomizadoHTML;
        if (numerosReservadosEditor.relatorio) {
            html = html.replace(/RELATÓRIO FISCAL XXX\/\d{4}/g, `RELATÓRIO FISCAL ${numerosReservadosEditor.relatorio}`);
        }
        if (numerosReservadosEditor.processo) {
            html = html.replace(/Processo:<\/strong>\s*XXX\/\d{4}/g, `Processo:</strong> ${numerosReservadosEditor.processo}`);
        }
        container.innerHTML = html;
    } else {
        container.innerHTML = construirHtmlRelatorioFiscal(
            numerosReservadosEditor.relatorio,
            numerosReservadosEditor.processo
        );
    }
}

function construirHtmlRelatorioFiscal(numeroRelatorio, numeroProcesso, procObj = null) {
    const proc = procObj || (typeof processoAtual !== 'undefined' ? processoAtual : null);
    const dProc = proc?.dados || {};
    const iProc = dProc.imovel || {};
    const rProc = dProc.relatorio_fiscal || {};

    const decretoSim = document.getElementById('fiscDecreto')?.value === 'sim' || (proc && (proc.possui_decreto || dProc.fiscal?.decreto === 'sim'));
    if (decretoSim) {
        return construirHtmlRelatorioFiscalDecreto(numeroRelatorio, numeroProcesso, proc);
    }

    const ano = new Date().getFullYear();
    const numeroRelatorioTBD = numeroRelatorio || proc?.numero_relatorio || rProc.numero_relatorio || `XXX/${ano}`;
    const numeroProcessoTBD = numeroProcesso || proc?.numero_processo || `XXX/${ano}`;
    const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const atendimentoTipo = document.getElementById('relAtendimentoTipo')?.value || '';
    const atendimentoValor = document.getElementById('relAtendimentoValor')?.value || '';
    const atendimento = (atendimentoTipo || atendimentoValor) ? (atendimentoTipo + ' ' + atendimentoValor).trim() : (rProc.atendimento || 'campo escrito');

    const assunto = document.getElementById('relAssunto')?.value || rProc.assunto || 'colocar aqui o título da denúncia';
    const pa = document.getElementById('relPA')?.value || rProc.pa || '';

    // Imovel info
    const logradouroImv = document.getElementById('imvLogradouro')?.value || iProc.logradouro || 'XXX';
    const numeroImv = document.getElementById('imvNumero')?.value || iProc.numero || 'XXXX';
    const bairroImv = document.getElementById('imvBairro')?.value || iProc.bairro || 'XXXX';
    const textoVistoria = document.getElementById('relTextoVistoria')?.value || rProc.texto_vistoria ||
        'falta de limpeza e conservação de imóvel não edificado, inexistência de cercamento e inexistência de passeio';

    const paHtml = pa ? `<p style="margin:0;"><strong>PA:</strong> ${pa}</p>` : '';

    const dataVistoriaRaw = document.getElementById('fiscDataVistoria')?.value || dProc.fiscal?.data_vistoria || proc?.data_vistoria;
    let textoDataHora = '';
    if (dataVistoriaRaw) {
        const parts = dataVistoriaRaw.split('T');
        const dataPart = parts[0];
        const horaPart = parts[1] || '';

        if (dataPart) {
            const dataArr = dataPart.split('-');
            const dataFmt = dataArr.length === 3 ? `${dataArr[2]}/${dataArr[1]}/${dataArr[0]}` : dataPart;

            if (horaPart) {
                textoDataHora = ` no dia ${dataFmt} às ${horaPart.substring(0, 5)}`;
            } else {
                textoDataHora = ` no dia ${dataFmt}`;
            }
        }
    }

    const inscricaoValor = document.getElementById('imvInscricao')?.value || iProc.inscricao || 'Não informada';
    const inscricaoLabel = inscricaoValor.replace(/\D/g, '').length === 14 ? 'CNPJ' : 'Inscrição Imobiliária';

    // Coleta das imagens adicionadas no painel ou salvas no processo
    let htmlImagens = '';
    const containerImagens = document.getElementById('lista-imagens-legenda');
    if (containerImagens) {
        const itens = containerImagens.querySelectorAll('.item-imagem-legenda');
        if (itens.length > 0) {
            itens.forEach((item) => {
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

    if (!htmlImagens && dProc.anexos?.imagens_vistoria && Array.isArray(dProc.anexos.imagens_vistoria)) {
        dProc.anexos.imagens_vistoria.forEach(img => {
            const src = img.dataUrl || img.url;
            if (src) {
                htmlImagens += `
                    <div style="text-align: center; margin: 20px 0; page-break-inside: avoid;">
                        <div style="display: inline-block; resize: both; overflow: hidden; max-width: 100%; min-width: 150px; min-height: 150px; border: 1px dashed #ccc; padding: 4px;">
                            <img src="${src}" style="width: 100%; height: 100%; object-fit: contain; display: block;" />
                        </div>
                        ${img.nome ? `<p style="margin-top: 5px; font-style: italic; color: #555;">${img.nome}</p>` : ''}
                    </div>
                `;
            }
        });
    }

    return `
        <div style="font-family: Calibri, 'Segoe UI', sans-serif; color: black; max-width: 820px; margin: 0 auto; line-height: 1.2; font-size: 10pt; padding: 40px 55px 30px 55px; background: white;">
            <!-- 1. CABEÇALHO IDÊNTICO AO MODELO - NOTIFICAÇÃO PRELIMINAR -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border-collapse: collapse;">
                <tr>
                    <td width="100" rowspan="2" align="center" valign="top" style="padding-right: 12px; width: 100px;">
                        <img src="${BRASAO_PREFEITURA_BASE64}" alt="Brasão Divinópolis" style="width: 85px; height: auto; display: block; margin: 0 auto;">
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
            <div style="margin-bottom: 20px;">
                <p style="margin:0 0 6px 0;"><strong>Para atendimento:</strong> ${atendimento}</p>
                <p style="margin:0 0 6px 0;"><strong>Assunto:</strong> ${assunto}</p>
                <p style="margin:0 0 6px 0;"><strong>Processo:</strong> ${numeroProcessoTBD}</p>
                ${paHtml ? paHtml.replace('margin:0;', 'margin:0 0 6px 0;') : ''}
            </div>

            <!-- Local da Atuação -->
            <div style="margin-bottom: 30px;">
                <div style="font-size: 10.5pt; font-weight: bold; margin-bottom: 6px;">Local da Autuação</div>
                <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 10pt; line-height: 1.45;">
                    <tr>
                        <td width="58%" valign="top">
                            <div><strong>Logradouro:</strong> ${logradouroImv}, n° ${numeroImv}</div>
                            <div><strong>Bairro:</strong> ${bairroImv}</div>
                        </td>
                        <td width="42%" valign="top">
                            <div><strong>${inscricaoLabel}:</strong> ${inscricaoValor}</div>
                        </td>
                    </tr>
                </table>
            </div>

            <!-- Corpo -->
            <div style="margin-bottom: 20px; text-align: justify;">
                <p style="margin:0 0 6px 0;">Prezado(a),</p>
                <p style="text-indent: 30px; margin:0 0 6px 0;">informamos que em vistoria${textoDataHora} ao local indicado, verificamos que houve ${textoVistoria}.</p>
            </div>

            <!-- Bloco Inseparável: Imagens + Encerramento + Assinatura (Se a assinatura for para a página 2, a imagem desce junto) -->
            <div style="page-break-inside: avoid; break-inside: avoid; -webkit-region-break-inside: avoid;">
                ${htmlImagens}
                <p style="text-indent: 30px; margin: 15px 0 6px 0; text-align: justify;">Sem mais para o momento, estamos à disposição para maiores esclarecimentos.</p>

                <!-- Assinatura -->
                <div style="margin-top: 40px; page-break-inside: avoid; break-inside: avoid;">
                    <p style="margin:0 0 40px 0; text-align: left;">Atenciosamente,</p>
                    <div style="text-align: center;">
                        <p style="margin:0;">_________________________________________</p>
                        <p style="margin:5px 0 0 0;"><strong>${fiscalData.nome || 'Nome do Fiscal'}</strong></p>
                        <p style="margin:2px 0 0 0;">${fiscalData.cargo || 'Cargo do Fiscal'}</p>
                        <p style="margin:2px 0 0 0;">Matrícula: ${fiscalData.matricula || 'XXXXXXXX'}</p>
                    </div>
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

// ── Renderização e Preparação da Certidão (Decreto) ─────────
async function garantirNumerosReservadosCertidao() {
    const anoAtual = new Date().getFullYear();

    if (!numerosReservadosEditor.processo) {
        try {
            const { data: np, error: errProc } = await supabaseClient.rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Processo' });
            if (!errProc && np) {
                numerosReservadosEditor.processo = np;
            } else {
                console.warn('RPC reservar_numero para Processo falhou, executando fallback local:', errProc?.message);
                const { data } = await supabaseClient
                    .from('processos')
                    .select('numero_processo')
                    .like('numero_processo', `${anoAtual}/%`);
                let max = 0;
                if (data && data.length > 0) {
                    data.forEach(item => {
                        if (item.numero_processo) {
                            const p = item.numero_processo.split('/');
                            if (p.length === 2) {
                                const v = parseInt(p[1], 10);
                                if (!isNaN(v) && v > max) max = v;
                            }
                        }
                    });
                }
                numerosReservadosEditor.processo = `${anoAtual}/${String(max + 1).padStart(6, '0')}`;
            }
        } catch (e) {
            console.warn('Erro ao reservar número de processo:', e);
        }
    }

    if (!numerosReservadosEditor.certidao) {
        try {
            const { data: nc, error: errCert } = await supabaseClient.rpc('reservar_numero', { p_ano: anoAtual, p_categoria: 'Certidão Sem Defesa' });
            if (!errCert && nc) {
                numerosReservadosEditor.certidao = nc;
            } else {
                console.warn('RPC reservar_numero para Certidão falhou, executando fallback local:', errCert?.message);
                const { data } = await supabaseClient
                    .from('notificacoes')
                    .select('numero_certidao')
                    .like('numero_certidao', `${anoAtual}/%`);
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
                numerosReservadosEditor.certidao = `${anoAtual}/${String(max + 1).padStart(3, '0')}`;
            }
        } catch (e) {
            console.warn('Erro ao reservar número de certidão:', e);
        }
    }
}

async function prepararEtapaCertidaoDecreto() {
    await garantirNumerosReservadosCertidao();
    renderizarDocumentoCertidaoDecreto();
}

function renderizarDocumentoCertidaoDecreto() {
    const container = document.getElementById('previewRelatorioContainer');
    if (!container) return;
    container.style.display = 'block';

    container.innerHTML = construirHtmlCertidaoDecreto(
        numerosReservadosEditor.certidao,
        numerosReservadosEditor.processo
    );
}

function construirHtmlRelatorioFiscalDecreto(numeroRelatorio, numeroProcesso, procObj = null) {
    const proc = procObj || (typeof processoAtual !== 'undefined' ? processoAtual : null);
    const dProc = proc?.dados || {};
    const cProc = dProc.contribuinte || {};
    const iProc = dProc.imovel || {};
    const fProc = dProc.fiscal || {};

    const ano = new Date().getFullYear();
    const numeroRelatorioTBD = numeroRelatorio || proc?.numero_relatorio || dProc.relatorio_fiscal?.numero_relatorio || proc?.numero_certidao || dProc.certidao?.numero_certidao || (typeof numerosReservadosEditor !== 'undefined' ? (numerosReservadosEditor.relatorio || numerosReservadosEditor.certidao) : null) || `XXX/${ano}`;
    const numeroProcessoTBD = numeroProcesso || proc?.numero_processo || (typeof numerosReservadosEditor !== 'undefined' ? numerosReservadosEditor.processo : null) || `XXX/${ano}`;
    const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Contribuinte Info
    const contNome = document.getElementById('contNome')?.value?.trim() || cProc.nome || 'ALVORADA IMOVEIS LTDA';
    let rawCpfCnpj = document.getElementById('contCpfCnpj')?.value?.trim() || cProc.cpf_cnpj || '20.159.208/0001-65';
    let contCpfCnpj = rawCpfCnpj;

    const logrCont = document.getElementById('contLogradouro')?.value?.trim() || cProc.logradouro || 'Rua MINAS GERAIS';
    const numCont = document.getElementById('contNumero')?.value?.trim() || cProc.numero || '309';
    const compCont = document.getElementById('contComplemento')?.value?.trim() || cProc.complemento || '';
    const bairroCont = document.getElementById('contBairro')?.value?.trim() || cProc.bairro || 'CENTRO';
    const cepCont = document.getElementById('contCep')?.value?.trim() || cProc.cep || '35500-007';
    const munCont = document.getElementById('contMunicipio')?.value?.trim() || cProc.municipio || cProc.cidade || 'Divinópolis';

    // Imóvel Info
    const imvInscricao = document.getElementById('imvInscricao')?.value?.trim() || iProc.inscricao || '01.025.00183.00033.00000.0';
    const imvLogradouro = document.getElementById('imvLogradouro')?.value?.trim() || iProc.logradouro || 'Rua CATALUNHA';
    const imvNumero = document.getElementById('imvNumero')?.value?.trim() || iProc.numero || '0';
    const compImv = document.getElementById('imvComplemento')?.value?.trim() || iProc.complemento || '';
    const imvBairro = document.getElementById('imvBairro')?.value?.trim() || iProc.bairro || 'PARAISO';

    // Extraction of Zona, Quadra, Lote from Inscrição Imobiliária
    let imvZona = iProc.zona || 'XXX';
    let imvQuadra = iProc.quadra || 'XXXX';
    let imvLote = iProc.lote || 'XXXXX';
    if (imvInscricao) {
        const parts = imvInscricao.replace(/\s/g, '').split('.');
        if (parts.length >= 4) {
            imvZona = parts[1] || imvZona;
            imvQuadra = parts[2] || imvQuadra;
            imvLote = parts[3] || imvLote;
        }
    }

    // Decreto Info
    const decretoNumero = (typeof obterNumeroDecretoSelecionado === 'function' ? obterNumeroDecretoSelecionado() : null) || fProc.numero_decreto || '17.326/2026';
    const decretoDataRaw = (typeof obterDataDecretoSelecionada === 'function' ? obterDataDecretoSelecionada() : null) || fProc.data_decreto;
    let decretoDataFmt = '02/07/2026';
    if (decretoDataRaw) {
        const parts = decretoDataRaw.split('T')[0].split('-');
        if (parts.length === 3) decretoDataFmt = `${parts[2]}/${parts[1]}/${parts[0]}`;
        else decretoDataFmt = decretoDataRaw;
    }

    // Transgressões & Prazos
    const infracoesSelecionadas = Array.from(document.querySelectorAll('#infracoesList input[name="infracao"]:checked')).map(el => {
        return el.nextElementSibling.textContent.trim().toLowerCase();
    });
    const dispositivosTransgredidosStr = infracoesSelecionadas.length > 0
        ? infracoesSelecionadas.join(', ')
        : (dProc.infracoes?.descricao || fProc.infracao || 'falta de limpeza e conservação de imóvel não edificado');

    const prazoDias = typeof obterPrazoNotificacaoNovaSolicitacao === 'function'
        ? obterPrazoNotificacaoNovaSolicitacao(dispositivosTransgredidosStr)
        : 15;

    // Cálculo da data de vencimento com base na data do Decreto (+ prazoDias)
    let dataVencimentoFmt = '17/07/2026';
    const decDateStr = decretoDataRaw || '2026-07-02';
    if (decDateStr) {
        let y, m, d;
        if (decDateStr.includes('-')) {
            const parts = decDateStr.split('T')[0].split('-');
            if (parts.length === 3) {
                y = parseInt(parts[0], 10);
                m = parseInt(parts[1], 10) - 1;
                d = parseInt(parts[2], 10);
            }
        } else if (decDateStr.includes('/')) {
            const parts = decDateStr.split('/');
            if (parts.length === 3) {
                d = parseInt(parts[0], 10);
                m = parseInt(parts[1], 10) - 1;
                y = parseInt(parts[2], 10);
            }
        }

        if (y && m !== undefined && d) {
            const dtDec = new Date(y, m, d);
            dtDec.setDate(dtDec.getDate() + prazoDias);
            const diaV = String(dtDec.getDate()).padStart(2, '0');
            const mesV = String(dtDec.getMonth() + 1).padStart(2, '0');
            const anoV = dtDec.getFullYear();
            dataVencimentoFmt = `${diaV}/${mesV}/${anoV}`;
        }
    }

    // Data da Vistoria para exibição
    const dataVistoriaRaw = document.getElementById('fiscDataVistoria')?.value || fProc.data_vistoria || proc?.data_vistoria;
    let dataVistoriaFmt = '02/07/2026';
    if (dataVistoriaRaw) {
        const parts = dataVistoriaRaw.split('T');
        const dataPart = parts[0];
        if (dataPart) {
            const arr = dataPart.split('-');
            if (arr.length === 3) {
                dataVistoriaFmt = `${arr[2]}/${arr[1]}/${arr[0]}`;
            }
        }
    }

    // Imagens de vistoria
    let htmlImagens = '';
    const containerImagens = document.getElementById('lista-imagens-legenda');
    if (containerImagens) {
        const itens = containerImagens.querySelectorAll('.item-imagem-legenda');
        if (itens.length > 0) {
            itens.forEach((item) => {
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
    } else if (dProc.anexos?.imagens_vistoria && Array.isArray(dProc.anexos.imagens_vistoria)) {
        dProc.anexos.imagens_vistoria.forEach(img => {
            const src = img.dataUrl || img.url;
            if (src) {
                htmlImagens += `
                    <div style="text-align: center; margin: 20px 0; page-break-inside: avoid;">
                        <div style="display: inline-block; resize: both; overflow: hidden; max-width: 100%; min-width: 150px; min-height: 150px; border: 1px dashed #ccc; padding: 4px;">
                            <img src="${src}" style="width: 100%; height: 100%; object-fit: contain; display: block;" />
                        </div>
                        ${img.nome ? `<p style="margin-top: 5px; font-style: italic; color: #555;">${img.nome}</p>` : ''}
                    </div>
                `;
            }
        });
    }

    const fiscAutor = typeof window.obterFiscalAutorDoProcesso === 'function' ? window.obterFiscalAutorDoProcesso(proc, null) : {};
    const fNome = fProc.nome || fProc.fiscNome || proc?.fiscal_responsavel || fiscAutor.nome || (typeof fiscalData !== 'undefined' ? fiscalData?.nome : null) || (typeof perfilAtual !== 'undefined' ? perfilAtual?.nome : null) || 'Nome do Fiscal';
    const fCargo = fProc.cargo || fiscAutor.cargo || (typeof fiscalData !== 'undefined' ? fiscalData?.cargo : null) || (typeof perfilAtual !== 'undefined' ? perfilAtual?.cargo : null) || 'Cargo do Fiscal';
    const fMatricula = fProc.matricula || fProc.fiscMatricula || proc?.fiscal_matricula || fiscAutor.matricula || (typeof fiscalData !== 'undefined' ? fiscalData?.matricula : null) || (typeof perfilAtual !== 'undefined' ? perfilAtual?.matricula : null) || 'XXXXXXXX';

    return `
        <div style="font-family: Calibri, 'Segoe UI', sans-serif; color: black; max-width: 820px; margin: 0 auto; line-height: 1.3; font-size: 10pt; padding: 40px 55px 30px 55px; background: white;">
            <!-- CABEÇALHO IDÊNTICO -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border-collapse: collapse;">
                <tr>
                    <td width="100" rowspan="2" align="center" valign="top" style="padding-right: 12px; width: 100px;">
                        <img src="${BRASAO_PREFEITURA_BASE64}" alt="Brasão Divinópolis" style="width: 85px; height: auto; display: block; margin: 0 auto;">
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

            <!-- Título -->
            <div style="text-align: center; font-weight: bold; margin-top: 25px; margin-bottom: 5px;">
                <p style="margin:0; font-size: 12pt;">RELATÓRIO FISCAL ${numeroRelatorioTBD}</p>
            </div>
            <div style="text-align: center; margin-bottom: 15px;">
                <p style="margin:0;">Fiscalização de Posturas</p>
            </div>

            <!-- Data -->
            <div style="text-align: right; margin-bottom: 20px;">
                <p style="margin:0;">Divinópolis- MG ${dataAtual}</p>
            </div>

            <!-- Processo -->
            <div style="margin-bottom: 20px;">
                <p style="margin:0 0 10px 0;"><strong>Processo:</strong> ${numeroProcessoTBD}</p>
            </div>

            <!-- Informações do Contribuinte -->
            <div style="font-size: 10.5pt; font-weight: bold; margin-bottom: 6px; margin-top: 15px;">Informações do Contribuinte</div>
            <table width="100%" cellpadding="2" cellspacing="0" border="0" style="font-size: 10pt; line-height: 1.45; margin-bottom: 15px;">
                <tr>
                    <td width="58%" valign="top">
                        <div><strong>Contribuinte:</strong> ${contNome}</div>
                        <div><strong>Logradouro:</strong> ${logrCont}</div>
                        <div><strong>CEP:</strong> ${cepCont}</div>
                        <div><strong>Município:</strong> ${munCont}</div>
                    </td>
                    <td width="42%" valign="top">
                        <div><strong>CPF/CNPJ:</strong> ${contCpfCnpj}</div>
                        <div><strong>Bairro:</strong> ${bairroCont}</div>
                        <div><strong>Número:</strong> ${numCont}</div>
                        ${compCont ? `<div><strong>Complemento:</strong> ${compCont}</div>` : ''}
                    </td>
                </tr>
            </table>

            <!-- Informações do imóvel -->
            <div style="font-size: 10.5pt; font-weight: bold; margin-bottom: 6px; margin-top: 15px;">Informações do imóvel</div>
            <table width="100%" cellpadding="2" cellspacing="0" border="0" style="font-size: 10pt; line-height: 1.45; margin-bottom: 25px;">
                <tr>
                    <td width="58%" valign="top">
                        <div><strong>Inscrição:</strong> ${imvInscricao}</div>
                        <div><strong>Logradouro:</strong> ${imvLogradouro}, n° ${imvNumero}</div>
                        <div><strong>Bairro:</strong> ${imvBairro}</div>
                    </td>
                    <td width="42%" valign="top">
                        <div><strong>Zona:</strong> ${imvZona}</div>
                        <div><strong>Quadra:</strong> ${imvQuadra}</div>
                        <div><strong>Lote:</strong> ${imvLote}</div>
                        ${compImv ? `<div><strong>Complemento:</strong> ${compImv}</div>` : ''}
                    </td>
                </tr>
            </table>

            <!-- Corpo -->
            <div style="margin-bottom: 20px; text-align: justify; line-height: 1.5;">
                <p style="text-indent: 30px; margin:0 0 16px 0;">
                    Certifico que o autuado, não se manifestou sobre a interposição de defesa referente ao Decreto <strong>${decretoNumero}</strong>, publicado no dia <strong>${decretoDataFmt}</strong> no Diário Oficial dos Municípios Mineiros, o qual notificou todos os proprietários de imóveis situados na zona urbana do município de Divinópolis à regularização conforme as leis 7.174/2010 e 6.907/2008. O prazo para <strong>${dispositivosTransgredidosStr}</strong> foi de <strong>${prazoDias}</strong> dias, findo aquele no dia <strong>${dataVencimentoFmt}</strong>.
                </p>

                <p style="text-indent: 30px; margin:0 0 16px 0;">
                    Em vistoria realizada dia <strong>${dataVistoriaFmt}</strong>, certificamos o não cumprimento da obrigação de Limpeza conforme levantamento fotográfico.
                </p>
            </div>

            <!-- Bloco Inseparável: Imagens + Assinatura (Se a assinatura for para a página 2, a imagem desce junto) -->
            <div style="page-break-inside: avoid; break-inside: avoid; -webkit-region-break-inside: avoid;">
                ${htmlImagens}

                <!-- Assinatura -->
                <div style="margin-top: 40px; page-break-inside: avoid; break-inside: avoid;">
                    <div style="text-align: center;">
                        <p style="margin:0;">_________________________________________</p>
                        <p style="margin:5px 0 0 0;"><strong>${fNome}</strong></p>
                        <p style="margin:2px 0 0 0;">${fCargo}</p>
                        <p style="margin:2px 0 0 0;">Matrícula: ${fMatricula}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function construirHtmlCertidaoDecreto(numeroCertidao, numeroProcesso, procObj = null) {
    return construirHtmlRelatorioFiscalDecreto(numeroCertidao, numeroProcesso, procObj);
}

window.construirHtmlRelatorioFiscalDecreto = construirHtmlRelatorioFiscalDecreto;
window.construirHtmlCertidaoDecreto = construirHtmlRelatorioFiscalDecreto;

// ── Editor WYSIWYG do Relatório Fiscal ──────────────────────
async function abrirEditorRelatorio() {
    if (!validarStep(5)) return;

    const feedback = document.getElementById('feedbackEditorRelatorio');
    if (feedback) {
        feedback.textContent = 'Gerando documento...';
        feedback.className = 'input-feedback info';
    }

    try {
        await garantirNumerosReservados();

        const editor = document.getElementById('editorRelatorio');
        if (window.relatorioCustomizadoHTML) {
            let html = window.relatorioCustomizadoHTML;
            if (numerosReservadosEditor.relatorio) {
                html = html.replace(/RELATÓRIO FISCAL XXX\/\d{4}/g, `RELATÓRIO FISCAL ${numerosReservadosEditor.relatorio}`);
            }
            if (numerosReservadosEditor.processo) {
                html = html.replace(/Processo:<\/strong>\s*XXX\/\d{4}/g, `Processo:</strong> ${numerosReservadosEditor.processo}`);
            }
            editor.innerHTML = html;
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

function salvarRelatorioFiscal() {
    const editor = document.getElementById('editorRelatorio');
    if (editor) {
        window.relatorioCustomizadoHTML = editor.innerHTML;
        const container = document.getElementById('previewRelatorioContainer');
        if (container) {
            container.innerHTML = window.relatorioCustomizadoHTML;
            container.style.display = 'block';
        }
    }

    // Fecha o modal mantendo as alterações salvas no formulário
    const modal = document.getElementById('modalEditorRelatorio');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('open');
    }
    document.body.style.overflow = '';
    relatorioEditorAberto = false;
}

async function fecharEditorRelatorio() {
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

    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('open');
    }
    document.body.style.overflow = '';
    relatorioEditorAberto = false;
}

async function devolverNumerosReservadosEditor() {
    try {
        if (numerosReservadosEditor.processo) {
            await supabaseClient.rpc('devolver_numero', { p_numero: numerosReservadosEditor.processo, p_categoria: 'Processo' });
            numerosReservadosEditor.processo = null;
        }
        if (numerosReservadosEditor.relatorio) {
            await supabaseClient.rpc('devolver_numero', { p_numero: numerosReservadosEditor.relatorio, p_categoria: 'Relatório Fiscal' });
            numerosReservadosEditor.relatorio = null;
        }
        if (numerosReservadosEditor.certidao) {
            await supabaseClient.rpc('devolver_numero', { p_numero: numerosReservadosEditor.certidao, p_categoria: 'Certidão Sem Defesa' });
            numerosReservadosEditor.certidao = null;
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
            body { margin: 0; padding: 0; background: #fff; font-family: Calibri, 'Segoe UI', sans-serif; color: black; }
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

        // Aguarda renderização e aciona a impressão direta da caixa de diálogo do sistema
        setTimeout(() => {
            printIframe.contentWindow.focus();
            printIframe.contentWindow.print();

            // Fecha o editor após imprimir
            relatorioEditorAberto = false;
            const modal = document.getElementById('modalEditorRelatorio');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('open');
            }
            document.body.style.overflow = '';

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

async function baixarCertidaoDecretoPdf() {
    const btn = document.getElementById('btnBaixarCertidaoPdf');
    const oldText = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;"></div> Preparando PDF...`;
    }

    const tituloOriginal = document.title;

    try {
        const container = document.getElementById('previewRelatorioContainer');
        let htmlConteudo = container ? container.innerHTML : '';

        if (!htmlConteudo || !htmlConteudo.trim()) {
            htmlConteudo = construirHtmlCertidaoDecreto(
                numerosReservadosEditor.certidao,
                numerosReservadosEditor.processo
            );
        }

        const numeroCertidao = numerosReservadosEditor.certidao || `XXX/${new Date().getFullYear()}`;
        const numLimpo = numeroCertidao.replace(/[\/\\]/g, '-');
        const tituloFormatado = `Certidão N° ${numLimpo}`;

        document.title = tituloFormatado;

        const estilos = `
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { margin: 0; padding: 0; background: #fff; font-family: Calibri, 'Segoe UI', sans-serif; color: black; }
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
        printDoc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${tituloFormatado}</title><style>${estilos}</style></head><body>${htmlConteudo}</body></html>`);
        printDoc.close();

        setTimeout(() => {
            printIframe.contentWindow.focus();
            printIframe.contentWindow.print();
            setTimeout(() => {
                document.title = tituloOriginal;
                if (printIframe.parentNode) {
                    document.body.removeChild(printIframe);
                }
            }, 1000);
        }, 500);
    } catch (err) {
        document.title = tituloOriginal;
        console.error('Erro ao gerar PDF da certidão:', err);
        alert('Erro ao gerar PDF da certidão: ' + err.message);
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
    ['relAtendimentoTipo', 'relAtendimentoValor', 'relAssunto', 'relPA', 'relTextoVistoria'].forEach(id => {
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

    const btnSalvarRel = document.getElementById('btnSalvarRelatorio');
    if (btnSalvarRel) {
        btnSalvarRel.addEventListener('click', salvarRelatorioFiscal);
    }

    const btnBaixarPdf = document.getElementById('btnBaixarRelatorioPdf');
    if (btnBaixarPdf) {
        btnBaixarPdf.addEventListener('click', baixarRelatorioFiscalPdf);
    }

    const btnBaixarCertidaoPdf = document.getElementById('btnBaixarCertidaoPdf');
    if (btnBaixarCertidaoPdf) {
        btnBaixarCertidaoPdf.addEventListener('click', baixarCertidaoDecretoPdf);
    }

    // Fecha o editor ao clicar fora do container
    const modalEditor = document.getElementById('modalEditorRelatorio');
    if (modalEditor) {
        modalEditor.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) fecharEditorRelatorio();
        });
    }

    // Decreto — mostrar/esconder campo e gerenciar opções do decreto
    const elFiscDecreto = document.getElementById('fiscDecreto');
    if (elFiscDecreto) {
        elFiscDecreto.addEventListener('change', (e) => {
            const sim = e.target.value === 'sim';
            const areaDecreto = document.getElementById('decretoAnexoArea');
            if (areaDecreto) areaDecreto.style.display = sim ? 'block' : 'none';
            if (sim) {
                carregarOpcoesDecreto();
                const elNumDecreto = document.getElementById('fiscNumeroDecreto');
                const elGroupOutro = document.getElementById('decretoOutroGroup');
                if (elNumDecreto && elGroupOutro) {
                    elGroupOutro.style.display = elNumDecreto.value === 'outro' ? 'block' : 'none';
                }
                const checkedList = document.querySelectorAll('#infracoesList input[name="infracao"]:checked');
                if (checkedList.length > 1) {
                    checkedList.forEach((cb, idx) => {
                        if (idx > 0) cb.checked = false;
                    });
                    if (typeof atualizarDescricaoFiscalizacaoPadrao === 'function') {
                        atualizarDescricaoFiscalizacaoPadrao();
                    }
                }
            }
        });
    }

    const elNumDecreto = document.getElementById('fiscNumeroDecreto');
    if (elNumDecreto) {
        elNumDecreto.addEventListener('change', (e) => {
            const groupOutro = document.getElementById('decretoOutroGroup');
            const inputOutro = document.getElementById('fiscNumeroDecretoOutro');
            if (e.target.value === 'outro') {
                if (groupOutro) groupOutro.style.display = 'block';
                if (inputOutro) inputOutro.focus();
            } else {
                if (groupOutro) groupOutro.style.display = 'none';
                if (inputOutro) inputOutro.value = '';
            }
        });
    }

    // Processo existente — mostrar/esconder campo
    document.getElementById('infProcessoExistente').addEventListener('change', (e) => {
        document.getElementById('processoExistenteAnexo').style.display =
            e.target.value === 'sim' ? 'block' : 'none';
    });

    // Auto-preenchimento das respostas padrão de infração na Descrição da Fiscalização
    document.querySelectorAll('#infracoesList input[name="infracao"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const decretoSim = document.getElementById('fiscDecreto')?.value === 'sim';
            if (decretoSim && e.target.checked) {
                document.querySelectorAll('#infracoesList input[name="infracao"]').forEach(otherCb => {
                    if (otherCb !== e.target) {
                        otherCb.checked = false;
                    }
                });
            }
            atualizarDescricaoFiscalizacaoPadrao();
        });
    });

    const elRelTipo = document.getElementById('relAtendimentoTipo');
    const elRelVal = document.getElementById('relAtendimentoValor');
    if (elRelTipo && elRelVal) {
        const toggleAtendimentoValor = () => {
            const semNumero = elRelTipo.value === 'Constatação do Fiscal inloco sem denuncia Formalizada';
            if (semNumero) {
                elRelVal.value = '';
                elRelVal.style.display = 'none';
            } else {
                elRelVal.style.display = 'block';
            }
        };
        elRelTipo.addEventListener('change', toggleAtendimentoValor);
        toggleAtendimentoValor();
    }
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

    // Upload BIC (Espelho Cadastral PDF) — Drag & Drop + Seleção de Arquivo
    const dropAreaBic = document.getElementById('uploadAreaBic');
    const fileInputBic = document.getElementById('inputBic');

    if (dropAreaBic && fileInputBic) {
        dropAreaBic.addEventListener('click', (e) => {
            if (e.target !== fileInputBic && e.target.tagName !== 'LABEL') {
                fileInputBic.click();
            }
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropAreaBic.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropAreaBic.classList.add('drag-active');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropAreaBic.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropAreaBic.classList.remove('drag-active');
            }, false);
        });

        dropAreaBic.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file) handleArquivoBic(file);
        });

        fileInputBic.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleArquivoBic(file);
        });
    }

    const btnRemoveBic = document.getElementById('btnRemoveBic');
    if (btnRemoveBic) {
        btnRemoveBic.addEventListener('click', () => {
            if (fileInputBic) fileInputBic.value = '';
            bicArquivoAnexado = null;
            const infoEl = document.getElementById('bicFileInfo');
            if (infoEl) infoEl.style.display = 'none';
            const dropEl = document.getElementById('uploadAreaBic');
            if (dropEl) dropEl.style.display = 'flex';
            const feedbackEl = document.getElementById('bicFeedback');
            if (feedbackEl) { feedbackEl.textContent = ''; feedbackEl.className = 'field-feedback'; }
        });
    }

    // Upload Imagens vistoria (removido, imagens agora são inseridas no passo 5)

    // Upload Decreto (Drag & Drop + Seleção)
    const dropAreaDecreto = document.getElementById('uploadAreaDecreto');
    const elInputDecreto = document.getElementById('inputDecreto');
    if (dropAreaDecreto && elInputDecreto) {
        dropAreaDecreto.addEventListener('click', (e) => {
            if (e.target !== elInputDecreto && e.target.tagName !== 'LABEL') {
                elInputDecreto.click();
            }
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropAreaDecreto.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropAreaDecreto.classList.add('drag-active');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropAreaDecreto.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropAreaDecreto.classList.remove('drag-active');
            }, false);
        });

        const handleDecretoFile = (file) => {
            if (file) {
                const nameEl = document.getElementById('decretoFileName');
                if (nameEl) nameEl.textContent = file.name;
                const infoEl = document.getElementById('decretoFileInfo');
                if (infoEl) infoEl.style.display = 'flex';
                dropAreaDecreto.style.display = 'none';
            }
        };

        dropAreaDecreto.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file) {
                // Set the file to the input manually (DataTransfer object trick)
                const dt = new DataTransfer();
                dt.items.add(file);
                elInputDecreto.files = dt.files;
                handleDecretoFile(file);
            }
        });

        elInputDecreto.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleDecretoFile(file);
        });
    }

    const elBtnRemoveDecreto = document.getElementById('btnRemoveDecreto');
    if (elBtnRemoveDecreto) {
        elBtnRemoveDecreto.addEventListener('click', () => {
            if (elInputDecreto) elInputDecreto.value = '';
            const infoEl = document.getElementById('decretoFileInfo');
            if (infoEl) infoEl.style.display = 'none';
            if (dropAreaDecreto) dropAreaDecreto.style.display = 'flex';
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

    fileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (evt) {
                fileInput.setAttribute('data-base64', evt.target.result);
                window.relatorioCustomizadoHTML = null;
                if (typeof renderizarDocumentoRelatorio === 'function') renderizarDocumentoRelatorio();
            };
            reader.readAsDataURL(file);
        } else {
            fileInput.removeAttribute('data-base64');
            window.relatorioCustomizadoHTML = null;
            if (typeof renderizarDocumentoRelatorio === 'function') renderizarDocumentoRelatorio();
        }
    });

    legendaInput.addEventListener('input', () => {
        window.relatorioCustomizadoHTML = null;
        if (typeof renderizarDocumentoRelatorio === 'function') renderizarDocumentoRelatorio();
    });

    window.relatorioCustomizadoHTML = null;
    if (typeof renderizarDocumentoRelatorio === 'function') renderizarDocumentoRelatorio();
};

window.removerCampoImagemLegenda = function (id) {
    const el = document.getElementById(`item-imagem-legenda-${id}`);
    if (el) {
        el.remove();
        window.relatorioCustomizadoHTML = null;
        if (typeof renderizarDocumentoRelatorio === 'function') renderizarDocumentoRelatorio();
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



// ── Extração de texto de PDF usando PDF.js ──────────────────────
async function extrairTextoPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    let textoCompleto = '';

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const textoPagina = textContent.items.map(item => item.str).join('\n');
        textoCompleto += textoPagina + '\n';
    }
    return textoCompleto;
}

function extrairDadosEspelhoCadastral(textoCompleto) {
    const dados = {};
    const linhas = textoCompleto.split('\n')
        .map(l => l.trim().replace(/^Endere[çc]o:\s*/i, ''))
        .filter(l => l.length > 0);

    console.log('=== BIC PDF TEXTO COMPLETO ===\n', textoCompleto);

    // 1. CNPJ / CPF
    const cnpjM = textoCompleto.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}\-\d{2}\b/) || textoCompleto.match(/\b\d{3}\.\d{3}\.\d{3}\-\d{2}\b/);
    if (cnpjM) dados.responsavel_cnpj = cnpjM[0];

    // 2. Inscrição Imobiliária
    const inscM = textoCompleto.match(/\b\d{2}\.\d{3}\.\d{5}\.\d{5}\.\d{5}\.\d\b/);
    if (inscM) dados.inscricao_imobiliaria = inscM[0];

    // 3. Código do Imóvel (5 dígitos, ex: 58843 — ignora CEP 35... e complementos 00...)
    const cods = textoCompleto.match(/\b\d{5}\b/g) || [];
    for (const c of cods) {
        if (!c.startsWith('35') && !c.startsWith('00')) {
            dados.codigo_imovel = c;
            break;
        }
    }

    // 4. Nome do Responsável (Contribuinte)
    for (const line of linhas) {
        if (/\b(?:LTDA|S\/A|EIRELI|MEI|EPP|IMOVEIS|IMÓVEIS|CONSTRUTORA|EMPREENDIMENTOS|COMERCIO|COMÉRCIO)\b/i.test(line)) {
            if (!/PREFEITURA|ESTADO|GOVERNO/i.test(line)) {
                dados.responsavel_nome = line;
                break;
            }
        }
    }

    // Fallback para Nome: se não encontrou empresa
    if (!dados.responsavel_nome) {
        const nomeIdx = linhas.findIndex(l => /^Nome:/i.test(l));
        if (nomeIdx >= 0 && nomeIdx < linhas.length - 1) {
            for (let i = nomeIdx + 1; i < Math.min(linhas.length, nomeIdx + 5); i++) {
                const l = linhas[i];
                if (!l.endsWith(':') && !/Endereço|CNPJ|CPF|RESPONSÁVEL/i.test(l)) {
                    dados.responsavel_nome = l;
                    break;
                }
            }
        }
    }

    // Limpar o nome caso o CPF/CNPJ ou labels tenham vindo na mesma linha
    if (dados.responsavel_nome) {
        dados.responsavel_nome = dados.responsavel_nome
            .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}\-\d{2}\b/g, '')
            .replace(/\b\d{3}\.\d{3}\.\d{3}\-\d{2}\b/g, '')
            .replace(/CPF\/CNPJ/i, '')
            .replace(/CPF:/i, '')
            .replace(/CNPJ:/i, '')
            .replace(/[-\s]+$/g, '') // remove hífens e espaços do final
            .replace(/\s{2,}/g, ' ') // remove espaços duplos
            .trim();
    }

    // 5. CEPs no documento
    const ceps = (textoCompleto.match(/\b\d{5}\-\d{3}\b/g) || []);
    dados.cep_responsavel = ceps[0] || null;
    dados.cep_imovel = ceps[1] || ceps[0] || null;

    // 6. Endereços (Ruas)
    const ruas = linhas.filter(l => /^(?:Rua|Av|Avenida|Alameda|Praça|Rodovia|Servidão|Viela)\b/i.test(l));

    // Endereço do Contribuinte
    let baseRespLine = ruas.length > 0 ? ruas[0] : '';
    let endRespLine = baseRespLine;
    const idxResp = linhas.indexOf(baseRespLine);
    if (idxResp >= 0 && idxResp < linhas.length - 1) {
        if (linhas[idxResp + 1].startsWith('-') || /\d{5}\-\d{3}/.test(linhas[idxResp + 1])) {
            endRespLine += ' ' + linhas[idxResp + 1];
        }
    }
    dados.endereco_responsavel = endRespLine;

    // Endereço do Imóvel
    let baseImvLine = ruas.length > 1 ? ruas[1] : (ruas.length > 0 ? ruas[0] : '');
    dados.endereco_imovel = baseImvLine;

    // 7. Métricas do Imóvel
    const areaM = textoCompleto.match(/Area Total do Terreno:[\s\n]*([\d\.,]+)/i);
    if (areaM) dados.area_total_terreno_m2 = areaM[1];

    const profM = textoCompleto.match(/Profundidade:[\s\n]*([\d\.,]+)/i);
    if (profM) dados.profundidade = profM[1];

    console.log('=== BIC DADOS EXTRAÍDOS FINAL ===', dados);
    return dados;
}

// ── Manipulador de upload do BIC (PDF/DOC) ──────────────────────
async function handleArquivoBic(file) {
    if (!file) return;

    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
        alert('Por favor, selecione um arquivo válido (.pdf, .doc ou .docx) do Espelho Cadastral (BIC).');
        return;
    }

    const nameEl = document.getElementById('bicFileName');
    if (nameEl) nameEl.textContent = file.name;
    const infoEl = document.getElementById('bicFileInfo');
    if (infoEl) infoEl.style.display = 'flex';
    const dropEl = document.getElementById('uploadAreaBic');
    if (dropEl) dropEl.style.display = 'none';

    mostrarFeedback('bicFeedback', `Lendo arquivo ${ext.toUpperCase()} do Espelho Cadastral...`, 'info');

    try {
        let textoCompleto = '';
        if (ext === 'pdf') {
            textoCompleto = await extrairTextoPdf(file);
        } else if (ext === 'docx') {
            textoCompleto = await extrairTextoDocx(file);
        } else if (ext === 'doc') {
            textoCompleto = await extrairTextoDoc(file);
        }

        const dadosExt = extrairDadosEspelhoCadastral(textoCompleto);

        bicArquivoAnexado = file;

        // Helper para preencher o campo do formulário apenas se estiver vazio
        function preencherSeVazio(id, valor) {
            if (valor === undefined || valor === null || valor === '') return;
            const el = document.getElementById(id);
            if (!el) return;
            if (!el.value || el.value.trim() === '') {
                el.value = valor;
            }
        }

        const temPlanilhaBetha = typeof bathaArquivoAnexado !== 'undefined' && bathaArquivoAnexado !== null;

        // ── 1. DADOS DO CONTRIBUINTE (Passo 1) ──────────────────────
        preencherSeVazio('contNome', dadosExt.responsavel_nome);
        preencherSeVazio('contCpfCnpj', dadosExt.responsavel_cnpj);
        preencherSeVazio('contCep', dadosExt.cep_responsavel);

        if (dadosExt.endereco_responsavel) {
            const raw = dadosExt.endereco_responsavel;

            const pRuaNum = raw.split(' - ')[0] || raw;
            if (pRuaNum.includes(',')) {
                const parts = pRuaNum.split(',');
                preencherSeVazio('contLogradouro', parts[0].trim());
                preencherSeVazio('contNumero', parts[1].trim());
            } else {
                preencherSeVazio('contLogradouro', pRuaNum.trim());
            }

            if (raw.includes(' - ')) {
                const parts = raw.split(' - ');
                if (parts.length >= 2) {
                    const bairroClean = parts[1].split(',')[0].trim();
                    preencherSeVazio('contBairro', bairroClean);
                }
            }

            preencherSeVazio('contMunicipio', 'Divinópolis');
        }

        // ── 2. DADOS DO IMÓVEL (Passo 2) ──────────────────────────
        preencherSeVazio('imvCodigo', dadosExt.codigo_imovel);

        if (dadosExt.inscricao_imobiliaria) {
            const elInsc = document.getElementById('imvInscricao');
            if (elInsc) {
                if (!elInsc.value || elInsc.value.trim() === '') {
                    elInsc.value = dadosExt.inscricao_imobiliaria;
                    if (typeof decomporInscricao === 'function') {
                        decomporInscricao(dadosExt.inscricao_imobiliaria);
                    }
                }
            }
        }

        if (dadosExt.endereco_imovel) {
            const rawImv = dadosExt.endereco_imovel;

            if (rawImv.includes(',')) {
                const parts = rawImv.split(',');
                preencherSeVazio('imvLogradouro', parts[0].trim());

                const rest = parts[1].trim();
                const numM = rest.match(/^(\d+)/);
                if (numM) {
                    preencherSeVazio('imvNumero', numM[1]);
                }
            }

            if (rawImv.includes(' - ')) {
                const partsB = rawImv.split(' - ');
                if (partsB.length >= 2) {
                    const bairroVal = partsB[1].split('-')[0].trim();
                    preencherSeVazio('imvBairro', bairroVal);
                }
            }
        }

        if (dadosExt.area_total_terreno_m2) {
            const valNum = parseFloat(dadosExt.area_total_terreno_m2.replace('.', '').replace(',', '.'));
            if (!isNaN(valNum)) preencherSeVazio('imvAreaTotal', valNum);
        }

        if (dadosExt.profundidade) {
            const valProf = parseFloat(dadosExt.profundidade.replace('.', '').replace(',', '.'));
            if (!isNaN(valProf)) preencherSeVazio('imvProfundidade', valProf);
        }

        const elAreaVal = parseFloat(document.getElementById('imvAreaTotal')?.value) || 0;
        const elProfVal = parseFloat(document.getElementById('imvProfundidade')?.value) || 0;
        if (elAreaVal > 0 && elProfVal > 0) {
            const elTest = document.getElementById('imvTestada');
            if (elTest && (!elTest.value || elTest.value.trim() === '')) {
                elTest.value = (elAreaVal / elProfVal).toFixed(2);
            }
        }

        if (temPlanilhaBetha) {
            mostrarFeedback('bicFeedback', '✓ BIC (PDF) anexado com sucesso! (Dados da Planilha Betha mantidos)', 'success');
        } else {
            mostrarFeedback('bicFeedback', '✓ Dados do contribuinte e imóvel importados do BIC com sucesso!', 'success');
        }
    } catch (err) {
        console.error('Erro ao ler PDF do BIC:', err);
        mostrarFeedback('bicFeedback', 'Erro ao ler arquivo PDF do BIC: ' + err.message, 'error');
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
        const celulas = linha.split(/[,;]/).map(c => c.trim()).filter(c => c !== '');
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
    // Remove o título da seção para não casar a palavra em "INFORMAÇÕES DO CONTRIBUINTE"
    const secContribuinteClean = secContribuinte.replace(/INFORMA[ÇC][ÕO]ES\s+DO\s+CONTRIBUINTE/gi, '');

    // Nome do contribuinte (suporta mesmo linha com `:` ou linha seguinte no DOCX)
    let mContNome = secContribuinteClean.match(/(?:^|\n)\s*Contribuinte[:\s]+(?:ESP[ÓO]LIO\s+DE\s+([^\n\r]+?)|([^\n\r]+?))(?=\s+(?:Nº|CPF|CNPJ|Logradouro|CEP|Município|Bairro)|\n|$)/i);
    if (!mContNome) {
        mContNome = secContribuinteClean.match(/(?:^|\n)\s*Contribuinte[:\s]*\n\s*(?:ESP[ÓO]LIO\s+DE\s+([^\n\r]+?)|([^\n\r]+?))(?=\s*(?:\n|Nº|CPF|CNPJ|Logradouro|CEP|Município|Bairro|$))/i);
    }
    if (mContNome) {
        const valRaw = ((mContNome[1] ? 'ESPÓLIO DE ' + mContNome[1] : mContNome[2]) || '').trim();
        if (valRaw && !/^(?:Contribuinte|INFORMA[ÇC][ÕO]ES|Nº|CPF|CNPJ)$/i.test(valRaw)) {
            document.getElementById('contNome').value = valRaw;
        }
    }

    // CPF/CNPJ (suporta mesma linha ou linha seguinte no DOCX)
    const mContCpf = secContribuinte.match(/(?:CPF\/CNPJ|CPF\s*\/?\s*CNPJ|Nº\s*CPF\s*\/\s*CNPJ)[:\s]*\n?\s*([\d\.\-\/]{8,20})/i);
    if (mContCpf) {
        document.getElementById('contCpfCnpj').value = mContCpf[1].replace(/\s+/g, '').trim();
    }

    // Logradouro do contribuinte
    const mContLog = secContribuinte.match(/Logradouro[:\s]*\n?\s*([^\n\r]+?)(?=\s+(?:CEP|Município|Número|Nº|CPF|Bairro)|\n|$)/i);
    if (mContLog && mContLog[1].trim()) {
        document.getElementById('contLogradouro').value = mContLog[1].trim();
    }

    // CEP
    const mContCep = secContribuinte.match(/CEP[:\s]*\n?\s*([\d\-]+)/i);
    if (mContCep) {
        document.getElementById('contCep').value = mContCep[1].trim();
    }

    // Município
    const mContMun = secContribuinte.match(/Munic[íi]pio[:\s]*\n?\s*([^\n\r]+?)(?=\s+(?:Número|Nº|CPF|Bairro|Observac[ãa]o)|\n|$)/i);
    if (mContMun && mContMun[1].trim()) {
        document.getElementById('contMunicipio').value = mContMun[1].trim();
    }

    // Bairro do contribuinte
    const mContBairro = secContribuinte.match(/Bairro[:\s]*\n?\s*([^\n\r]+?)(?=\s+(?:Número|Observac[ãa]o|Informações|INFORMAÇÕES)|\n|$)/i);
    if (mContBairro && mContBairro[1].trim()) {
        document.getElementById('contBairro').value = mContBairro[1].trim();
    }

    // Número do contribuinte
    const mContNum = secContribuinte.match(/N[úu]mero[:\s]*\n?\s*([^\n\r]+?)(?=\s+Observac[ãa]o|\s+Informações|\s+Bairro|\n|$)/i);
    if (mContNum && mContNum[1].trim()) {
        document.getElementById('contNumero').value = mContNum[1].trim();
    }

    // Observação / Complemento
    const mContComp = secContribuinte.match(/Observa[çc][ãa]o[:\s]*\n?\s*([^\n\r]+?)(?=\s+(?:INFORMAÇÕES|Informações|Contribuinte|Logradouro|CEP|Nº|CPF|Bairro|Número)|\n|$)/i);
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
    const mImvInsc = secImovel.match(/Inscri[çc][ãa]o(?:\s+do\s+Im[óo]vel)?[:\s]*\n?\s*([\d\.]+)/i);
    if (mImvInsc) {
        const insc = mImvInsc[1].trim();
        document.getElementById('imvInscricao').value = insc;
        decomporInscricao(insc);
    }

    // Código Reduzido
    let codImv = '';
    const mImvCod = secImovel.match(/C[óo]digo[:\s]*\n?\s*(\d{3,})(?=\s+Quadra|\s+Número|\s+Logradouro|\s+Matrícula|\s+Inscrição|\n|$)/i);
    if (mImvCod) {
        codImv = mImvCod[1];
    } else {
        const mImvMat = secImovel.match(/Matr[íi]cula[:\s]*\n?\s*(\d+)/i);
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

// ── Fallback JS de Reserva de Números (Prioriza numeros_descartados com verificação de unicidade) ──
async function obterNumeroFallbackJS(anoAtual, categoria, tamanhoPad, tabela, coluna) {
    try {
        const { data: desc } = await supabaseClient
            .from('numeros_descartados')
            .select('id, numero_sequencial')
            .eq('ano', anoAtual)
            .ilike('categoria', categoria)
            .order('numero_sequencial', { ascending: true });

        if (desc && desc.length > 0) {
            for (const item of desc) {
                const numPadded = String(item.numero_sequencial).replace(/\D/g, '').padStart(tamanhoPad, '0');
                const candidato = `${anoAtual}/${numPadded}`;

                // Verifica se o número já existe na tabela de destino
                const { data: ex } = await supabaseClient
                    .from(tabela)
                    .select(coluna)
                    .eq(coluna, candidato)
                    .maybeSingle();

                // Remove da tabela de descartados
                await supabaseClient.from('numeros_descartados').delete().eq('id', item.id);

                if (!ex) {
                    return candidato;
                }
            }
        }
    } catch (e) {
        console.warn('Fallback JS ao buscar numeros_descartados:', e);
    }

    try {
        const { data } = await supabaseClient
            .from(tabela)
            .select(coluna)
            .like(coluna, `${anoAtual}/%`);
        let max = 0;
        if (data && data.length > 0) {
            data.forEach(item => {
                const val = item[coluna];
                if (val) {
                    const p = val.split('/');
                    if (p.length === 2) {
                        const v = parseInt(p[1].replace(/\D/g, ''), 10);
                        if (!isNaN(v) && v > max) max = v;
                    }
                }
            });
        }

        let proximo = max + 1;
        while (proximo < max + 1000) {
            const candidato = `${anoAtual}/${String(proximo).padStart(tamanhoPad, '0')}`;
            const { data: ex } = await supabaseClient
                .from(tabela)
                .select(coluna)
                .eq(coluna, candidato)
                .maybeSingle();
            if (!ex) {
                return candidato;
            }
            proximo++;
        }
        return `${anoAtual}/${String(max + 1).padStart(tamanhoPad, '0')}`;
    } catch (e) {
        console.error('Erro no fallback MAX:', e);
        return `${anoAtual}/${String(1).padStart(tamanhoPad, '0')}`;
    }
}
