/* ============================================================
   NOVA SOLICITAÇÃO — Etapa 1: Wizard de 5 passos
   ============================================================ */

const STEP_LABELS = ['Solicitante', 'Contribuinte', 'Imóvel', 'Fiscal', 'Infrações'];
let currentWizardStep = 1;
const TOTAL_STEPS = 5;
let fiscalData = { nome: '', matricula: '' };
let selectedImages = [];

// ── Inicialização ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    bindWizardEventos();
    // Data da vistoria padrão = hoje
    document.getElementById('fiscDataVistoria').value = new Date().toISOString().split('T')[0];
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

        // 1. Tentar por auth_id na tabela profiles (com fallback para usuarios)
        let tabelaAlvo = 'profiles';
        let { data: usuario } = await supabaseClient
            .from('profiles')
            .select('id, nome, full_name, matricula, cpf, auth_id')
            .eq('auth_id', session.user.id)
            .maybeSingle();

        if (!usuario) {
            const resFb = await supabaseClient
                .from('usuarios')
                .select('id, nome, matricula, cpf, auth_id')
                .eq('auth_id', session.user.id)
                .maybeSingle();
            if (resFb.data) {
                usuario = resFb.data;
                tabelaAlvo = 'usuarios';
            }
        }

        // 2. Tentar pelo CPF extraído do email de login (ex: 22222222222@email.com)
        if (!usuario && session.user.email) {
            const cpfLimpo = session.user.email.split('@')[0].replace(/\D/g, '');
            if (cpfLimpo) {
                let res = await supabaseClient
                    .from('profiles')
                    .select('id, nome, full_name, matricula, cpf, auth_id')
                    .eq('cpf', cpfLimpo)
                    .maybeSingle();
                if (!res.data) {
                    res = await supabaseClient
                        .from('usuarios')
                        .select('id, nome, matricula, cpf, auth_id')
                        .eq('cpf', cpfLimpo)
                        .maybeSingle();
                    if (res.data) tabelaAlvo = 'usuarios';
                }
                if (!res.data && cpfLimpo.length === 11) {
                    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                    res = await supabaseClient
                        .from('profiles')
                        .select('id, nome, full_name, matricula, cpf, auth_id')
                        .eq('cpf', cpfFormatado)
                        .maybeSingle();
                    if (!res.data) {
                        res = await supabaseClient
                            .from('usuarios')
                            .select('id, nome, matricula, cpf, auth_id')
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
            fiscalData = { nome: usuario.nome || usuario.full_name || '', matricula: usuario.matricula || '' };
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

function avancarStep() {
    if (!validarStep(currentWizardStep)) return;
    if (currentWizardStep < TOTAL_STEPS) {
        currentWizardStep++;
        atualizarWizard();
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
            const cpf = document.getElementById('solCpfCnpj').value.replace(/\D/g, '');
            if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) {
                mostrarFeedback('solCpfFeedback', 'Informe um CPF ou CNPJ válido.', 'error');
                return false;
            }
            if (!validarCpfCnpj(cpf)) {
                mostrarFeedback('solCpfFeedback', 'CPF/CNPJ inválido (dígitos verificadores).', 'error');
                return false;
            }
            return true;
        }
        case 2: {
            const nome = document.getElementById('contNome').value.trim();
            if (!nome) {
                alert('Informe o nome do contribuinte.');
                return false;
            }
            return true;
        }
        case 3:
            return true; // Imóvel é opcional
        case 4: {
            const decreto = document.getElementById('fiscDecreto').value;
            if (!decreto) {
                alert('Informe se é decorrente de Decreto de Notificação.');
                return false;
            }
            return true;
        }
        case 5: {
            const checked = document.querySelectorAll('input[name="infracao"]:checked');
            if (checked.length === 0) {
                alert('Selecione pelo menos um dispositivo legal transgredido.');
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
    const weights1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    const weights2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
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
    if (!validarStep(5)) return;

    const btn = document.getElementById('btnWizardFinalizar');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Salvando...';
    btn.disabled = true;

    try {
        // Coletar todos os dados
        const dados = coletarTodosDados();
        console.log('Dados da solicitação:', dados);

        // Por enquanto salvar no console (quando as tabelas existirem, salva no Supabase)
        alert('Solicitação criada com sucesso!\n\nOs dados foram coletados. Quando o banco de dados estiver configurado, serão salvos automaticamente.');

        fecharModal();
    } catch (err) {
        console.error('Erro ao salvar solicitação:', err);
        alert('Erro ao salvar: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function coletarTodosDados() {
    const infracoesSelecionadas = [];
    document.querySelectorAll('input[name="infracao"]:checked').forEach(cb => {
        infracoesSelecionadas.push(cb.value);
    });

    return {
        solicitante: {
            cpf_cnpj: document.getElementById('solCpfCnpj').value,
            nome: document.getElementById('solNome').value,
            email: document.getElementById('solEmail').value,
        },
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
        }
    };
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
    aplicarMascaraCpfCnpj(document.getElementById('solCpfCnpj'));
    aplicarMascaraCpfCnpj(document.getElementById('contCpfCnpj'));

    // Buscar solicitante
    document.getElementById('btnBuscarSolicitante').addEventListener('click', buscarSolicitante);
    document.getElementById('solCpfCnpj').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); buscarSolicitante(); }
    });

    // Inscrição do imóvel — decomposição automática
    document.getElementById('imvInscricao').addEventListener('input', (e) => {
        decomporInscricao(e.target.value);
    });

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

    // Upload Imagens vistoria
    document.getElementById('inputImagens').addEventListener('change', (e) => {
        const preview = document.getElementById('imagesPreview');
        Array.from(e.target.files).forEach(file => {
            selectedImages.push(file);
            const reader = new FileReader();
            reader.onload = (ev) => {
                const div = document.createElement('div');
                div.className = 'image-thumb';
                div.innerHTML = `<img src="${ev.target.result}" alt="${file.name}"><button class="btn-remove-img" title="Remover">✕</button>`;
                div.querySelector('.btn-remove-img').addEventListener('click', () => {
                    div.remove();
                    selectedImages = selectedImages.filter(f => f !== file);
                });
                preview.appendChild(div);
            };
            reader.readAsDataURL(file);
        });
    });

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

// ── Buscar solicitante no banco ─────────────────────────────
async function buscarSolicitante() {
    const cpfRaw = document.getElementById('solCpfCnpj').value.replace(/\D/g, '');
    if (!cpfRaw || (cpfRaw.length !== 11 && cpfRaw.length !== 14)) {
        mostrarFeedback('solCpfFeedback', 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).', 'error');
        return;
    }
    if (!validarCpfCnpj(cpfRaw)) {
        mostrarFeedback('solCpfFeedback', 'CPF/CNPJ inválido.', 'error');
        return;
    }

    mostrarFeedback('solCpfFeedback', 'Buscando...', 'info');

    try {
        const { data, error } = await supabaseClient
            .from('solicitantes')
            .select('*')
            .eq('cpf_cnpj', cpfRaw)
            .maybeSingle();

        if (data) {
            document.getElementById('solNome').value = data.nome;
            document.getElementById('solEmail').value = data.email || '';
            document.getElementById('solDadosExtras').style.display = 'block';
            mostrarFeedback('solCpfFeedback', '✓ Solicitante encontrado!', 'success');
        } else {
            document.getElementById('solNome').value = '';
            document.getElementById('solEmail').value = '';
            document.getElementById('solDadosExtras').style.display = 'block';
            mostrarFeedback('solCpfFeedback', 'Não encontrado. Preencha os dados abaixo.', 'info');
        }
    } catch (err) {
        // Tabela pode não existir ainda
        document.getElementById('solDadosExtras').style.display = 'block';
        mostrarFeedback('solCpfFeedback', 'Banco indisponível. Preencha manualmente.', 'info');
    }
}

// ── Manipulador de importação de arquivo (Drag & Drop ou Clique) ──
async function handleArquivoAnexo(file) {
    document.getElementById('bethaFileName').textContent = file.name;
    document.getElementById('bethaFileInfo').style.display = 'flex';
    document.getElementById('uploadAreaBetha').style.display = 'none';

    const ext = file.name.split('.').pop().toLowerCase();

    try {
        if (ext === 'docx') {
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);
            const docXml = await zip.file('word/document.xml').async('text');
            // Extrair todos os nós de texto <w:t> do XML do Word
            const regexText = /<w:t[^>]*>([^<]*)<\/w:t>/g;
            let match;
            const textParts = [];
            while ((match = regexText.exec(docXml)) !== null) {
                textParts.push(match[1]);
            }
            const textoCompleto = textParts.join(' ');
            extrairDadosDoTextoNP(textoCompleto);
        } else if (ext === 'xlsx' || ext === 'csv') {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const csvText = XLSX.utils.sheet_to_csv(firstSheet);
            extrairDadosDoTextoNP(csvText);
        } else {
            const texto = await file.text();
            extrairDadosDoTextoNP(texto);
        }
    } catch (err) {
        console.error('Erro ao processar arquivo:', err);
    }
}

// ── Extração inteligente de dados (Modelo NP ou Planilha) ──
function extrairDadosDoTextoNP(texto) {
    console.log('Analisando texto do arquivo:', texto);

    const partes = texto.split(/INFORMAÇÕES\s+DO\s+IMÓVEL|Informações\s+do\s+imóvel/i);
    const secContribuinte = partes[0] || texto;
    const secImovel = partes[1] || texto;

    // --- 1. CONTRIBUINTE ---
    // Nome do contribuinte
    const mContNome = secContribuinte.match(/Contribuinte[:\s]+(?:ESPOLIO\s+DE\s+([^\n\r]+?)|([A-ZÀ-Úa-zà-ú0-9\s]+?))(?=\s+Logradouro|\s+CEP|\s+Nº|\s+CPF|\n|$)/i);
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
    const mContLog = secContribuinte.match(/Logradouro[:\s]+([^\n\r]+?)(?=\s+CEP|\s+Município|\s+Nº|\s+CPF|\s+Bairro|\n|$)/i);
    if (mContLog) {
        document.getElementById('contLogradouro').value = mContLog[1].trim();
    }

    // CEP
    const mContCep = secContribuinte.match(/CEP[:\s]+([\d\-]+)/i);
    if (mContCep) {
        document.getElementById('contCep').value = mContCep[1].trim();
    }

    // Município
    const mContMun = secContribuinte.match(/Município[:\s]+([^\n\r]+?)(?=\s+Nº|\s+CPF|\s+Bairro|\n|$)/i);
    if (mContMun && mContMun[1].trim()) {
        document.getElementById('contMunicipio').value = mContMun[1].trim();
    }

    // Bairro do contribuinte
    const mContBairro = secContribuinte.match(/Bairro[:\s]+([^\n\r]+?)(?=\s+Número|\s+Observac[ãa]o|\s+Informações|\n|$)/i);
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

    // Código Reduzido (busca após Código:, se vazio busca Matrícula:)
    let codImv = '';
    const mImvCod = secImovel.match(/Código[:\s]+(\d+)/i);
    if (mImvCod) {
        codImv = mImvCod[1];
    } else {
        const mImvMat = secImovel.match(/Matr[íi]cula[:\s]+(\d+)/i);
        if (mImvMat) codImv = mImvMat[1];
    }
    if (codImv) {
        document.getElementById('imvCodigo').value = codImv.trim();
    }

    // Logradouro, Número, Bairro do Imóvel
    const mImvSit = secImovel.match(/situado\s+[àa|na]+\s+([^,]+),\s*([^\s,]+)[,\s]+-\s*([^-]+)\s*-/i);
    if (mImvSit) {
        document.getElementById('imvLogradouro').value = mImvSit[1].trim();
        document.getElementById('imvNumero').value = mImvSit[2].trim();
        document.getElementById('imvBairro').value = mImvSit[3].trim();
    } else {
        const mImvLog = secImovel.match(/Logradouro[:\s]+([^\n\r]+?)(?=\s+Complemento|\s+Matrícula|\s+Número|\s+Bairro|\n|$)/i);
        if (mImvLog) document.getElementById('imvLogradouro').value = mImvLog[1].trim();
        const mImvBairro = secImovel.match(/Bairro[:\s]+([^\n\r]+?)(?=\s+Inscrição|\s+Zona|\n|$)/i);
        if (mImvBairro) document.getElementById('imvBairro').value = mImvBairro[1].trim();
    }

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
        box = document.createElement('div');
        box.id = 'parseFeedbackBox';
        box.style.cssText = 'margin-top:14px;padding:12px 16px;background:#ecfdf5;border:1px solid #10b981;border-radius:8px;color:#065f46;font-size:0.85rem;display:flex;align-items:center;gap:10px;';
        const parent = document.getElementById('bethaFileInfo').parentElement;
        parent.appendChild(box);
    }
    box.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    <div><strong>Dados extraídos automaticamente com sucesso!</strong><br>Os passos 2 (Contribuinte) e 3 (Imóvel) foram preenchidos com as informações do arquivo.</div>`;
    box.style.display = 'flex';
}
