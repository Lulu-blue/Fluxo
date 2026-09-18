// ============================================================
// OFÍCIO SEMAC - GFP AVULSO (botão "Gerar Ofício" e aba "Ofícios" do painel)
// Exclusivo do Gerente de Posturas e do Dev (ver usuarioPodeGerarOficioAvulso).
//
// Numeração: usa a MESMA sequência dos ofícios da Etapa 15 — RPC
// reservar_numero com a categoria 'Ofício GFP'. O número é gravado em
// oficios_gfp assim que é reservado, e a função _numero_existe_em_uso do banco
// olha documentos + oficios_gfp, então os dois lados nunca repetem número.
// Um trigger em oficios_gfp recusa, como última trava, número já usado na Etapa 15.
//
// Ciclo de vida do número:
//   gerar    → reserva e grava a linha (o número já conta como usado)
//   salvar   → grava assunto, texto e texto_busca
//   baixar   → grava tudo e baixado_em; a partir daqui o número é definitivo
//   fechar/descartar sem salvar nem baixar → apaga a linha e devolve o número à fila
//
// Imagens: vão para o Cloudinary e o ofício guarda só o link — base64 dentro do
// banco foi o que derrubou o sistema, então nada de data: URL em conteudo_html.
// ============================================================

const CATEGORIA_OFICIO_AVULSO = 'Ofício GFP';
const CARGO_ASSINATURA_OFICIO_AVULSO = 'Gerente de Fiscalização de Posturas';
const TENTATIVAS_RESERVA_OFICIO_AVULSO = 3;
const PASTA_CLOUDINARY_OFICIOS = 'oficios_gfp';
const FORMATOS_IMAGEM_OFICIO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
const LARGURA_MINIMA_IMAGEM_OFICIO = 30;
const LIMITE_LISTA_OFICIOS = 300;

// { id, numero, salvo, baixado, alterado } do ofício aberto no modal
let oficioAvulsoAtual = null;
let oficioAvulsoOcupado = false;
let uploadsImagemOficioPendentes = 0;
let ultimaSelecaoOficio = null;
let imagemOficioSelecionada = null;

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modalOficioAvulso');
    if (!modal) return;

    document.getElementById('btnGerarOficio').addEventListener('click', abrirOficioAvulso);
    document.getElementById('btnGerarOficioAba').addEventListener('click', abrirOficioAvulso);
    document.getElementById('btnFecharOficioAvulso').addEventListener('click', fecharOficioAvulso);
    document.getElementById('btnDescartarOficioAvulso').addEventListener('click', descartarOficioAvulso);
    document.getElementById('btnSalvarOficioAvulso').addEventListener('click', () => salvarOficioAvulso());
    document.getElementById('btnBaixarOficioAvulso').addEventListener('click', baixarOficioAvulsoPdf);

    document.querySelectorAll('#oficioAvulsoToolbar button[data-comando]').forEach(btn => {
        // mousedown com preventDefault mantém a seleção dentro do documento
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => document.execCommand(btn.dataset.comando, false, null));
    });

    configurarImagensOficio(modal);
    configurarAbaOficios();
});

// Fechar a aba sem salvar nem baixar: tenta liberar o número (melhor esforço).
// A ordem importa: se só o devolver_numero chegasse ao banco, reservar_numero
// veria a linha ainda existente e pularia o número, sem risco de repetição.
window.addEventListener('beforeunload', () => {
    const oficio = oficioAvulsoAtual;
    if (oficio && !oficio.salvo && !oficio.baixado) {
        supabaseClient.from('oficios_gfp').delete().eq('id', oficio.id)
            .then(({ error }) => {
                if (!error) supabaseClient.rpc('devolver_numero', { p_numero: oficio.numero, p_categoria: CATEGORIA_OFICIO_AVULSO });
            });
    }
});

// ── Abrir: novo ou existente ────────────────────────────────
function mostrarModalOficioAvulso(mensagem) {
    document.getElementById('containerOficioAvulso').innerHTML =
        `<div class="oficio-avulso-status">${escaparHtmlOficioAvulso(mensagem)}</div>`;
    document.getElementById('oficioAvulsoNumeroTitulo').textContent = '';
    document.getElementById('modalOficioAvulso').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function mostrarErroOficioAvulso(texto, detalhe) {
    document.getElementById('containerOficioAvulso').innerHTML = `<div class="oficio-avulso-status" style="color:#b91c1c;">
        ${texto}<br><small>${escaparHtmlOficioAvulso(detalhe || '')}</small>
    </div>`;
}

function podeUsarOficioAvulso() {
    if (typeof window.usuarioPodeGerarOficioAvulso === 'function' && !window.usuarioPodeGerarOficioAvulso()) {
        alert('⚠️ Apenas o Gerente de Posturas pode gerar ofícios.');
        return false;
    }
    return !oficioAvulsoOcupado && !oficioAvulsoAtual;
}

async function abrirOficioAvulso() {
    if (!podeUsarOficioAvulso()) return;
    mostrarModalOficioAvulso('Reservando o número do ofício...');

    definirOficioAvulsoOcupado(true);
    try {
        const [registro, nomeGerente] = await Promise.all([
            reservarRegistroOficioAvulso(),
            buscarNomeGerentePosturas()
        ]);
        oficioAvulsoAtual = { id: registro.id, numero: registro.numero, salvo: false, baixado: false, alterado: false };
        exibirDocumentoOficioAvulso(montarModeloOficioAvulso(registro.numero, nomeGerente), registro.numero);
        recarregarListaOficiosSeVisivel();
    } catch (e) {
        console.error('[OFÍCIO AVULSO] Erro ao reservar o número:', e);
        mostrarErroOficioAvulso('Não foi possível reservar o número do ofício. Nenhum número foi consumido.<br>Feche esta janela e tente novamente.', e?.message);
    } finally {
        definirOficioAvulsoOcupado(false);
    }
}

async function abrirOficioAvulsoExistente(id) {
    if (!podeUsarOficioAvulso()) return;
    mostrarModalOficioAvulso('Carregando o ofício...');

    definirOficioAvulsoOcupado(true);
    try {
        const { data, error } = await supabaseClient
            .from('oficios_gfp')
            .select('id, numero, conteudo_html, baixado_em')
            .eq('id', id)
            .single();
        if (error) throw error;

        // Linha sem texto: o número foi reservado mas o ofício nunca foi salvo
        // (ex.: a aba foi fechada no meio). Abre o modelo e segue como um novo.
        const nuncaSalvo = !data.conteudo_html;
        const html = nuncaSalvo
            ? montarModeloOficioAvulso(data.numero, await buscarNomeGerentePosturas())
            : data.conteudo_html;

        oficioAvulsoAtual = { id: data.id, numero: data.numero, salvo: !nuncaSalvo, baixado: !!data.baixado_em, alterado: false };
        exibirDocumentoOficioAvulso(html, data.numero);
    } catch (e) {
        console.error('[OFÍCIO AVULSO] Erro ao abrir o ofício:', e);
        mostrarErroOficioAvulso('Não foi possível abrir o ofício. Feche esta janela e tente novamente.', e?.message);
    } finally {
        definirOficioAvulsoOcupado(false);
    }
}

// Reserva pelo contador do banco e grava a linha na hora.
// Sem fallback local: se o banco não reserva, é melhor não gerar do que arriscar número repetido.
async function reservarRegistroOficioAvulso() {
    const ano = new Date().getFullYear();

    for (let tentativa = 1; tentativa <= TENTATIVAS_RESERVA_OFICIO_AVULSO; tentativa++) {
        const { data: numero, error: errReserva } = await supabaseClient
            .rpc('reservar_numero', { p_ano: ano, p_categoria: CATEGORIA_OFICIO_AVULSO });
        if (errReserva || !numero) {
            throw new Error(errReserva?.message || 'O banco não devolveu um número.');
        }

        const { data: registro, error: errInsert } = await supabaseClient
            .from('oficios_gfp')
            .insert([{ numero, ano, usuario_id: window.currentUserProfile?.id || null }])
            .select('id, numero')
            .single();

        if (!errInsert) return registro;

        // 23505: número já usado (unique ou trigger contra a Etapa 15) — o número
        // de fato está em uso, então não é devolvido; pede o próximo.
        if (errInsert.code === '23505') {
            console.warn(`[OFÍCIO AVULSO] Número ${numero} já estava em uso, reservando outro.`);
            continue;
        }

        await supabaseClient.rpc('devolver_numero', { p_numero: numero, p_categoria: CATEGORIA_OFICIO_AVULSO });
        throw new Error(errInsert.message);
    }
    throw new Error('Todos os números reservados já estavam em uso.');
}

// Assinatura: o perfil com cargo exatamente "Gerente de Posturas" (mesma regra da Etapa 15)
async function buscarNomeGerentePosturas() {
    try {
        const { data } = await supabaseClient
            .from('profiles')
            .select('nome, cargo')
            .ilike('cargo', '%postura%');
        const gerente = (data || []).find(p => normalizarTextoOficio(p.cargo) === 'gerente de posturas');
        if (gerente?.nome) return gerente.nome;
        console.warn('[OFÍCIO AVULSO] Nenhum perfil com o cargo "Gerente de Posturas" foi encontrado.');
    } catch (e) {
        console.warn('[OFÍCIO AVULSO] Erro ao buscar o Gerente de Posturas:', e);
    }
    return '';
}

// ── Modelo do documento ─────────────────────────────────────
// Estilos inline para a impressão sair igual à tela.
// data-oficio-editavel marca as áreas que voltam a ser editáveis ao reabrir;
// o número fica fora delas, para não ser apagado nem alterado.
function montarModeloOficioAvulso(numero, nomeGerente) {
    // A data do ofício leva só mês e ano ("setembro de 2026"), sem o dia
    const dataExtenso = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const assinatura = nomeGerente
        ? escaparHtmlOficioAvulso(nomeGerente)
        : '<span style="color: #F78C26;">(Nome do Gerente)</span>';

    return `
        <div id="documentoOficioAvulso"
             style="font-family: Calibri, 'Carlito', Arial, sans-serif; color: #000; background: #fff; width: 210mm; min-height: 296mm; display: flex; flex-direction: column;">
            <div style="padding: 50px 55px 30px 55px; flex: 1;">

                <div data-oficio-editavel>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border-collapse: collapse;">
                        <tr>
                            <td width="100" rowspan="2" align="center" valign="top" style="padding-right: 12px; width: 100px;">
                                <img src="assets/img/brasao_semac.jpeg" alt="Brasão Divinópolis" style="width: 85px; max-width: 100%; height: auto; display: block; margin: 0 auto;">
                            </td>
                            <td bgcolor="#F78C26" style="background-color: #F78C26; height: 14px; font-size: 1px; line-height: 14px;">&nbsp;</td>
                        </tr>
                        <tr>
                            <td valign="top" style="padding-top: 10px; font-size: 9.5pt; color: #000; line-height: 1.4;">
                                <strong>SECRETARIA MUNICIPAL DE MEIO AMBIENTE E CUIDADO ANIMAL - SEMAC</strong><br>
                                <strong>DIRETORIA DE MEIO AMBIENTE</strong><br>
                                <strong>GERÊNCIA DE FISCALIZAÇÃO DE POSTURAS</strong><br>
                                <span style="font-size: 9pt;">Av. Paraná, nº2061, sala 207 - Bairro São José - Divinópolis, Minas Gerais</span><br>
                                <span style="font-size: 9pt;">CEP:35.501-170 Tel: (37) 3229-8176</span>
                            </td>
                        </tr>
                    </table>
                    <hr style="border: none; border-top: 1px solid #000; margin: 0 0 22px 0;">
                </div>

                <div style="text-align: right; font-size: 12pt; margin-bottom: 6px;">
                    <strong>OFÍCIO SEMAC - <u>GFP</u> Nº <span data-oficio-numero>${escaparHtmlOficioAvulso(numero)}</span></strong>
                </div>

                <div data-oficio-editavel style="font-size: 11pt; line-height: 1.6;">
                    <div style="text-align: right; font-size: 10.5pt; margin-bottom: 30px;">Divinópolis, ${dataExtenso}.</div>

                    <p style="margin: 0 0 24px 0;"><strong>Assunto:</strong> </p>

                    <p style="margin: 0 0 16px 0; text-indent: 40px;">Prezado ,</p>
                    <p style="margin: 0 0 16px 0; text-indent: 40px; text-align: justify;"><br></p>
                    <p style="margin: 0 0 16px 0; text-indent: 40px;">Coloco-me à disposição para quaisquer esclarecimentos adicionais.</p>
                    <p style="margin: 0 0 16px 0; text-indent: 40px;">Atenciosamente,</p>

                    <div style="text-align: center; margin-top: 70px; line-height: 1.5;">
                        <div><em>(assinado digitalmente)</em></div>
                        <div><strong>${assinatura}</strong></div>
                        <div><strong>${CARGO_ASSINATURA_OFICIO_AVULSO}</strong></div>
                    </div>
                </div>
            </div>

            <div style="background-color: #F78C26; height: 14px; flex-shrink: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></div>
        </div>
    `;
}

// Coloca o HTML (modelo novo ou salvo no banco) no modal e liga a edição
function exibirDocumentoOficioAvulso(html, numero) {
    desselecionarImagemOficio();
    ultimaSelecaoOficio = null;

    const container = document.getElementById('containerOficioAvulso');
    container.innerHTML = html;
    const folha = container.querySelector('#documentoOficioAvulso');

    folha.classList.add('oficio-avulso-folha');
    marcarAreasEditaveisOficio(folha);
    folha.querySelectorAll('[data-oficio-numero]').forEach(el => el.classList.add('oficio-avulso-numero'));

    document.getElementById('oficioAvulsoNumeroTitulo').textContent = `Nº ${numero}`;
    aplicarModoEdicaoOficio();

    folha.addEventListener('input', () => {
        desselecionarImagemOficio();
        marcarOficioAvulsoAlterado();
    });
    folha.addEventListener('click', (e) => {
        if (oficioAvulsoEditavel() && e.target.tagName === 'IMG' && e.target.closest('[data-oficio-editavel]')) {
            selecionarImagemOficio(e.target);
        } else {
            desselecionarImagemOficio();
        }
    });
    folha.addEventListener('paste', aoColarNoOficio);

    atualizarBotoesOficioAvulso();
}

function marcarOficioAvulsoAlterado() {
    if (oficioAvulsoAtual) oficioAvulsoAtual.alterado = true;
}

// Ofícios salvos pela primeira versão do editor não têm data-oficio-editavel.
// Sem isso eles reabriam travados, impossíveis de editar.
function marcarAreasEditaveisOficio(folha) {
    if (!folha.querySelector('[data-oficio-editavel]')) {
        const corpo = folha.querySelector('#corpoOficioAvulso');
        const cabecalho = folha.querySelector('table')?.parentElement;
        [cabecalho, corpo].forEach(el => el?.setAttribute('data-oficio-editavel', ''));
    }
}

// Rascunho é editável; depois de baixado o ofício vira somente leitura
function oficioAvulsoEditavel() {
    return !!oficioAvulsoAtual && !oficioAvulsoAtual.baixado;
}

function aplicarModoEdicaoOficio() {
    const folha = document.getElementById('documentoOficioAvulso');
    if (!folha) return;
    const editavel = oficioAvulsoEditavel();

    folha.querySelectorAll('[data-oficio-editavel]').forEach(el => {
        el.setAttribute('contenteditable', editavel ? 'true' : 'false');
        el.setAttribute('spellcheck', editavel ? 'true' : 'false');
    });
    if (!editavel) desselecionarImagemOficio();

    const toolbar = document.getElementById('oficioAvulsoToolbar');
    if (toolbar) toolbar.style.display = editavel ? '' : 'none';

    const aviso = document.getElementById('oficioAvulsoAviso');
    if (aviso) {
        aviso.style.display = editavel ? 'none' : 'block';
        aviso.textContent = '🔒 Este ofício já foi baixado e não pode mais ser editado. Aqui dá para consultá-lo e baixar o PDF de novo.';
    }

    const subtitulo = document.getElementById('oficioAvulsoSubtitulo');
    if (subtitulo) {
        subtitulo.textContent = editavel
            ? 'Edite direto no documento. Arraste ou cole imagens no texto; clique na imagem e puxe o canto azul para mudar o tamanho.'
            : 'Somente leitura.';
    }
}

// ── Imagens: colar, arrastar, botão e redimensionar ─────────
function configurarImagensOficio(modal) {
    const input = document.getElementById('inputImagemOficio');
    const btnImagem = document.getElementById('btnInserirImagemOficio');
    btnImagem.addEventListener('mousedown', (e) => e.preventDefault());
    btnImagem.addEventListener('click', () => {
        if (oficioAvulsoAtual) input.click();
    });
    input.addEventListener('change', () => {
        inserirImagensOficio(input.files, rangeInsercaoOficio());
        input.value = '';
    });

    // Guarda onde o cursor estava, para o botão inserir no lugar certo
    document.addEventListener('selectionchange', () => {
        const sel = window.getSelection();
        if (sel.rangeCount && estaEmAreaEditavelOficio(sel.getRangeAt(0).startContainer)) {
            ultimaSelecaoOficio = sel.getRangeAt(0).cloneRange();
        }
    });

    // Arrastar arquivo para qualquer ponto do modal (sem isso o navegador abriria a imagem e a página seria perdida).
    // Arrastar uma imagem que já está no ofício continua nativo (só move): o Chrome
    // às vezes anuncia esse arraste como "Files", por isso o controle por dragstart.
    let arrastandoDeDentro = false;
    modal.addEventListener('dragstart', () => { arrastandoDeDentro = true; });
    modal.addEventListener('dragend', () => { arrastandoDeDentro = false; });
    const temArquivos = (e) => !arrastandoDeDentro && Array.from(e.dataTransfer?.types || []).includes('Files');
    modal.addEventListener('dragover', (e) => {
        if (temArquivos(e)) e.preventDefault();
    });
    modal.addEventListener('drop', (e) => {
        if (!temArquivos(e)) return;
        e.preventDefault();
        inserirImagensOficio(e.dataTransfer.files, rangeNoPontoOficio(e.clientX, e.clientY) || rangeInsercaoOficio());
    });

    // Alça de redimensionamento: fica dentro da área rolável, então acompanha o scroll
    const area = modal.querySelector('.modal-editor-body');
    const alca = document.createElement('div');
    alca.className = 'oficio-imagem-alca';
    alca.hidden = true;
    alca.innerHTML = '<span></span>';
    area.appendChild(alca);

    let arraste = null;
    alca.addEventListener('pointerdown', (e) => {
        if (!imagemOficioSelecionada) return;
        e.preventDefault();
        alca.setPointerCapture(e.pointerId);
        arraste = { x: e.clientX, largura: imagemOficioSelecionada.getBoundingClientRect().width };
    });
    alca.addEventListener('pointermove', (e) => {
        if (!arraste || !imagemOficioSelecionada) return;
        const img = imagemOficioSelecionada;
        const maxima = img.closest('[data-oficio-editavel]')?.clientWidth || arraste.largura;
        const largura = Math.max(LARGURA_MINIMA_IMAGEM_OFICIO, Math.min(maxima, arraste.largura + (e.clientX - arraste.x)));
        img.removeAttribute('width');
        img.removeAttribute('height');
        img.style.width = `${Math.round(largura)}px`;
        img.style.height = 'auto';
        posicionarAlcaImagemOficio();
    });
    const terminarArraste = () => {
        if (!arraste) return;
        arraste = null;
        marcarOficioAvulsoAlterado();
    };
    alca.addEventListener('pointerup', terminarArraste);
    alca.addEventListener('pointercancel', terminarArraste);

    document.addEventListener('keydown', (e) => {
        if (!imagemOficioSelecionada || !modal.classList.contains('open')) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            imagemOficioSelecionada.remove();
            desselecionarImagemOficio();
            marcarOficioAvulsoAlterado();
        } else if (e.key === 'Escape') {
            desselecionarImagemOficio();
        }
    });
    window.addEventListener('resize', posicionarAlcaImagemOficio);
}

function estaEmAreaEditavelOficio(node) {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !!el?.closest('#documentoOficioAvulso [data-oficio-editavel]');
}

function rangeNoPontoOficio(x, y) {
    let range = null;
    if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
        }
    }
    return range && estaEmAreaEditavelOficio(range.startContainer) ? range : null;
}

// Onde o cursor está (ou estava); sem cursor, no fim do corpo do ofício
function rangeInsercaoOficio() {
    if (ultimaSelecaoOficio && estaEmAreaEditavelOficio(ultimaSelecaoOficio.startContainer)) {
        return ultimaSelecaoOficio.cloneRange();
    }
    const areas = document.querySelectorAll('#documentoOficioAvulso [data-oficio-editavel]');
    const corpo = areas[areas.length - 1];
    if (!corpo) return null;
    const range = document.createRange();
    range.selectNodeContents(corpo);
    range.collapse(false);
    return range;
}

// Imagem colada (print, imagem copiada) vira upload; qualquer outra coisa entra
// como texto puro (evita estilos do Word e imagens em base64 no banco).
// Texto copiado do Word também traz uma figura do trecho no clipboard — quando
// há texto, o texto vence.
function aoColarNoOficio(e) {
    e.preventDefault();
    const dados = e.clipboardData || window.clipboardData;
    const texto = dados.getData('text/plain');
    const imagens = Array.from(dados.files || []).filter(f => f.type.startsWith('image/'));
    if (imagens.length && !texto.trim()) {
        inserirImagensOficio(imagens, rangeInsercaoOficio());
        return;
    }
    document.execCommand('insertText', false, texto);
}

// Insere um aviso "Enviando imagem..." em cada ponto e troca pela imagem quando o upload termina
function inserirImagensOficio(arquivos, range) {
    if (!oficioAvulsoAtual || !range) return;

    let posicao = range;
    Array.from(arquivos || []).forEach(arquivo => {
        if (!FORMATOS_IMAGEM_OFICIO.includes((arquivo.type || '').toLowerCase())) {
            alert(`"${arquivo.name}" não foi inserido: use imagens JPG, PNG, WEBP, GIF ou BMP.`);
            return;
        }

        const aviso = document.createElement('span');
        aviso.className = 'oficio-imagem-enviando';
        aviso.contentEditable = 'false';
        aviso.dataset.oficioEnviando = '';
        aviso.textContent = 'Enviando imagem...';

        posicao.insertNode(aviso);
        posicao = document.createRange();
        posicao.setStartAfter(aviso);
        posicao.collapse(true);

        enviarImagemOficio(arquivo, aviso);
    });
}

async function enviarImagemOficio(arquivo, aviso) {
    uploadsImagemOficioPendentes++;
    atualizarBotoesOficioAvulso();
    try {
        const url = await window.uploadParaCloudinary(arquivo, PASTA_CLOUDINARY_OFICIOS);
        if (!url) {
            // uploadParaCloudinary já avisou a pessoa
            aviso.remove();
            return;
        }
        if (!/^https?:\/\//.test(url)) throw new Error('Upload para o Cloudinary não devolveu um link.');

        const img = await carregarImagemOficio(url);
        if (!aviso.isConnected) return; // o ofício foi fechado durante o envio

        // Começa com no máximo 60% da largura do texto; depois a pessoa ajusta pela alça
        const larguraTexto = aviso.closest('[data-oficio-editavel]')?.clientWidth || 600;
        img.alt = arquivo.name || 'Imagem';
        img.style.width = `${Math.round(Math.min(img.naturalWidth, larguraTexto * 0.6))}px`;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        aviso.replaceWith(img);
        marcarOficioAvulsoAlterado();
    } catch (e) {
        console.error('[OFÍCIO AVULSO] Erro ao inserir imagem:', e);
        if (aviso.isConnected) {
            aviso.remove();
            alert(`Não foi possível inserir a imagem "${arquivo.name}". Tente novamente.`);
        }
    } finally {
        uploadsImagemOficioPendentes--;
        atualizarBotoesOficioAvulso();
    }
}

function carregarImagemOficio(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('A imagem enviada não pôde ser carregada.'));
        img.src = url;
    });
}

function selecionarImagemOficio(img) {
    if (imagemOficioSelecionada && imagemOficioSelecionada !== img) {
        imagemOficioSelecionada.classList.remove('oficio-imagem-selecionada');
    }
    imagemOficioSelecionada = img;
    img.classList.add('oficio-imagem-selecionada');
    posicionarAlcaImagemOficio();
}

function desselecionarImagemOficio() {
    if (imagemOficioSelecionada) imagemOficioSelecionada.classList.remove('oficio-imagem-selecionada');
    imagemOficioSelecionada = null;
    const alca = document.querySelector('.oficio-imagem-alca');
    if (alca) alca.hidden = true;
}

function posicionarAlcaImagemOficio() {
    const alca = document.querySelector('.oficio-imagem-alca');
    const img = imagemOficioSelecionada;
    if (!alca) return;
    if (!img || !img.isConnected) {
        desselecionarImagemOficio();
        return;
    }
    const area = alca.parentElement;
    const ri = img.getBoundingClientRect();
    const ra = area.getBoundingClientRect();
    alca.style.left = `${ri.right - ra.left + area.scrollLeft - 8}px`;
    alca.style.top = `${ri.bottom - ra.top + area.scrollTop - 8}px`;
    alca.querySelector('span').textContent = `${Math.round(ri.width)} px`;
    alca.hidden = false;
}

// ── Salvar / Baixar ─────────────────────────────────────────
function montarHtmlOficioAvulso({ paraSalvar }) {
    const folha = document.getElementById('documentoOficioAvulso');
    if (!folha) return '';

    const clone = folha.cloneNode(true);
    clone.removeAttribute('class');
    clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    clone.querySelectorAll('[spellcheck]').forEach(el => el.removeAttribute('spellcheck'));
    clone.querySelectorAll('.oficio-avulso-numero, .oficio-imagem-selecionada').forEach(el => {
        el.classList.remove('oficio-avulso-numero', 'oficio-imagem-selecionada');
        if (!el.classList.length) el.removeAttribute('class');
    });
    clone.querySelectorAll('[data-oficio-enviando]').forEach(el => el.remove());
    // Trava de segurança: nunca grava imagem embutida no banco
    if (paraSalvar) clone.querySelectorAll('img[src^="data:"]').forEach(img => img.remove());
    return clone.outerHTML;
}

function normalizarTextoOficio(txt) {
    return (txt || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extrairAssuntoOficioAvulso() {
    const folha = document.getElementById('documentoOficioAvulso');
    const match = (folha?.innerText || '').match(/Assunto:[ \t]*(.*)/i);
    return match ? match[1].trim() : '';
}

async function salvarOficioAvulso({ silencioso = false, marcarBaixado = false } = {}) {
    if (!oficioAvulsoAtual || oficioAvulsoOcupado) return false;
    if (!oficioAvulsoEditavel()) return false; // já baixado: o texto é definitivo
    if (uploadsImagemOficioPendentes > 0) {
        alert('Aguarde terminar o envio das imagens.');
        return false;
    }

    definirOficioAvulsoOcupado(true);
    try {
        return await gravarOficioAvulso(montarAlteracoesOficioAvulso({ marcarBaixado }), { silencioso, marcarBaixado });
    } finally {
        definirOficioAvulsoOcupado(false);
    }
}

// Parte que fala com o banco. Fica separada porque o "Baixar" precisa manter os
// botões travados da gravação até a impressão, num bloqueio só.
async function gravarOficioAvulso(alteracoes, { silencioso = false, marcarBaixado = false } = {}) {
    try {
        const { error } = await supabaseClient
            .from('oficios_gfp')
            .update(alteracoes)
            .eq('id', oficioAvulsoAtual.id);
        if (error) throw error;

        oficioAvulsoAtual.salvo = true;
        oficioAvulsoAtual.alterado = false;
        if (marcarBaixado) oficioAvulsoAtual.baixado = true;
        recarregarListaOficiosSeVisivel();
        if (!silencioso) alert(`✅ Ofício Nº ${oficioAvulsoAtual.numero} salvo.`);
        return true;
    } catch (e) {
        console.error('[OFÍCIO AVULSO] Erro ao salvar:', e);
        alert('Não foi possível salvar o ofício. Tente novamente.');
        return false;
    }
}

function montarAlteracoesOficioAvulso({ marcarBaixado }) {
    const folha = document.getElementById('documentoOficioAvulso');
    const assunto = extrairAssuntoOficioAvulso();
    const alteracoes = {
        assunto: assunto || null,
        conteudo_html: montarHtmlOficioAvulso({ paraSalvar: true }),
        texto_busca: normalizarTextoOficio(`${oficioAvulsoAtual.numero} ${folha?.innerText || ''}`)
    };
    if (marcarBaixado) {
        alteracoes.baixado_em = new Date().toISOString();
        alteracoes.situacao = 'baixado';
    }
    return alteracoes;
}

// Gravar e esperar as imagens do Cloudinary carregarem leva alguns segundos:
// tudo isto roda com os botões travados e um "Preparando PDF..." no lugar do rótulo,
// senão dois cliques abriam duas janelas de impressão.
async function baixarOficioAvulsoPdf() {
    if (!oficioAvulsoAtual || oficioAvulsoOcupado) return;
    if (uploadsImagemOficioPendentes > 0) {
        alert('Aguarde terminar o envio das imagens.');
        return;
    }
    desselecionarImagemOficio();

    const vaiVirarDefinitivo = oficioAvulsoEditavel();
    if (vaiVirarDefinitivo) {
        const confirmar = confirm(
            `Baixar o ofício Nº ${oficioAvulsoAtual.numero} em PDF?\n\n` +
            'Ele deixa de ser rascunho e não poderá mais ser editado.'
        );
        if (!confirmar) return;
    }

    definirOficioAvulsoOcupado(true);
    mostrarCarregandoBotaoBaixarOficio(true);
    try {
        await prepararEImprimirOficio(vaiVirarDefinitivo);
    } finally {
        mostrarCarregandoBotaoBaixarOficio(false);
        definirOficioAvulsoOcupado(false);
    }
}

function mostrarCarregandoBotaoBaixarOficio(carregando) {
    const btn = document.getElementById('btnBaixarOficioAvulso');
    if (!btn) return;
    if (carregando) {
        if (!btn.dataset.htmlOriginal) btn.dataset.htmlOriginal = btn.innerHTML;
        btn.innerHTML = '<div class="spinner" style="width:14px; height:14px; border-width:2px; margin-right:8px;"></div> Preparando PDF...';
    } else if (btn.dataset.htmlOriginal) {
        btn.innerHTML = btn.dataset.htmlOriginal;
        delete btn.dataset.htmlOriginal;
    }
}

async function prepararEImprimirOficio(vaiVirarDefinitivo) {
    if (vaiVirarDefinitivo) {
        // Grava antes de imprimir: a partir daqui o número e o texto são definitivos
        const alteracoes = montarAlteracoesOficioAvulso({ marcarBaixado: true });
        const ok = await gravarOficioAvulso(alteracoes, { silencioso: true, marcarBaixado: true });
        if (!ok) return;
        aplicarModoEdicaoOficio();
    }

    const numLimpo = oficioAvulsoAtual.numero.replace(/[\/\\]/g, '-');
    const html = montarHtmlOficioAvulso({ paraSalvar: false });

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
    printDoc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Oficio GFP ${numLimpo}</title><style>${estilos}</style></head><body>${html}</body></html>`);
    printDoc.close();

    // Espera o brasão e as imagens do Cloudinary carregarem para não saírem em branco no PDF
    const imagens = Array.from(printDoc.images).filter(img => !img.complete);
    await Promise.race([
        Promise.all(imagens.map(img => new Promise(r => { img.onload = img.onerror = r; }))),
        new Promise(r => setTimeout(r, 10000))
    ]);

    const tituloOriginal = document.title;
    document.title = `Oficio GFP ${numLimpo}`;
    printIframe.contentWindow.focus();
    printIframe.contentWindow.print();
    setTimeout(() => {
        if (document.body.contains(printIframe)) document.body.removeChild(printIframe);
        document.title = tituloOriginal;
    }, 1000);
}

// ── Fechar / Descartar ──────────────────────────────────────
async function fecharOficioAvulso() {
    if (oficioAvulsoOcupado) return;
    const oficio = oficioAvulsoAtual;

    if (oficio && !oficio.salvo && !oficio.baixado) {
        const confirmar = confirm(
            `O ofício Nº ${oficio.numero} ainda não foi salvo nem baixado.\n\n` +
            'Fechar agora descarta o ofício e libera o número. Deseja continuar?'
        );
        if (!confirmar) return;
        if (!(await apagarRegistroOficioAvulso())) return;
    } else if (oficio && (oficio.alterado || uploadsImagemOficioPendentes > 0)) {
        if (!confirm('Há alterações que não foram salvas. Fechar mesmo assim?')) return;
    }

    esconderModalOficioAvulso();
}

async function descartarOficioAvulso() {
    const oficio = oficioAvulsoAtual;
    if (!oficio || oficioAvulsoOcupado || oficio.baixado) return;

    const confirmar = confirm(`Descartar o ofício Nº ${oficio.numero}?\n\nO texto será apagado e o número volta para a fila.`);
    if (!confirmar) return;
    if (await apagarRegistroOficioAvulso()) esconderModalOficioAvulso();
}

// Apaga a linha ANTES de devolver o número — assim o número nunca fica
// disponível na fila enquanto ainda consta como usado.
async function apagarRegistroOficioAvulso() {
    const oficio = oficioAvulsoAtual;
    definirOficioAvulsoOcupado(true);
    try {
        const { error } = await supabaseClient.from('oficios_gfp').delete().eq('id', oficio.id);
        if (error) throw error;

        const { error: errDevolver } = await supabaseClient
            .rpc('devolver_numero', { p_numero: oficio.numero, p_categoria: CATEGORIA_OFICIO_AVULSO });
        // Falhar aqui só deixa um buraco na sequência; não gera repetição
        if (errDevolver) console.warn('[OFÍCIO AVULSO] Número não devolvido à fila:', errDevolver.message);
        return true;
    } catch (e) {
        console.error('[OFÍCIO AVULSO] Erro ao descartar:', e);
        alert('Não foi possível descartar o ofício. Tente novamente.');
        return false;
    } finally {
        definirOficioAvulsoOcupado(false);
    }
}

function esconderModalOficioAvulso() {
    desselecionarImagemOficio();
    ultimaSelecaoOficio = null;
    oficioAvulsoAtual = null;
    document.getElementById('modalOficioAvulso').classList.remove('open');
    document.body.style.overflow = '';
    recarregarListaOficiosSeVisivel();
}

// ── Estado dos botões ───────────────────────────────────────
function definirOficioAvulsoOcupado(ocupado) {
    oficioAvulsoOcupado = ocupado;
    atualizarBotoesOficioAvulso();
}

function atualizarBotoesOficioAvulso() {
    const semOficio = !oficioAvulsoAtual;
    const enviandoImagem = uploadsImagemOficioPendentes > 0;

    const editavel = oficioAvulsoEditavel();
    const btnSalvar = document.getElementById('btnSalvarOficioAvulso');
    const btnBaixar = document.getElementById('btnBaixarOficioAvulso');
    const btnDescartar = document.getElementById('btnDescartarOficioAvulso');
    const btnImagem = document.getElementById('btnInserirImagemOficio');
    const btnFechar = document.getElementById('btnFecharOficioAvulso');

    if (btnSalvar) {
        btnSalvar.disabled = oficioAvulsoOcupado || semOficio || enviandoImagem;
        btnSalvar.style.display = editavel || semOficio ? '' : 'none';
    }
    if (btnBaixar) {
        btnBaixar.disabled = oficioAvulsoOcupado || semOficio || enviandoImagem;
        btnBaixar.lastChild.textContent = editavel ? ' Baixar Ofício (.pdf)' : ' Baixar PDF de novo';
    }
    if (btnDescartar) {
        btnDescartar.disabled = oficioAvulsoOcupado || semOficio;
        // Depois de baixado o número é definitivo: não dá mais para devolvê-lo
        btnDescartar.style.display = editavel || semOficio ? '' : 'none';
    }
    if (btnImagem) btnImagem.disabled = oficioAvulsoOcupado || semOficio || !editavel;
    if (btnFechar) btnFechar.disabled = oficioAvulsoOcupado;
}

// ============================================================
// ABA "OFÍCIOS" — lista os avulsos (oficios_gfp) e os da Etapa 15 (documentos)
// A lista nunca lê conteudo_html: a busca por palavra usa texto_busca no banco.
// Os ofícios da Etapa 15 não têm texto guardado (são montados na hora a partir
// do processo), então neles a busca acha só o número e o número do processo.
// ============================================================

function configurarAbaOficios() {
    document.getElementById('btnPesquisarOficios').addEventListener('click', carregarListaOficios);
    document.getElementById('btnLimparFiltrosOficios').addEventListener('click', () => {
        ['filtroOficioBusca', 'filtroOficioDataInicio', 'filtroOficioDataFim', 'filtroOficioOrigem']
            .forEach(id => { document.getElementById(id).value = ''; });
        carregarListaOficios();
    });
    ['filtroOficioBusca', 'filtroOficioDataInicio', 'filtroOficioDataFim'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', (e) => {
            if (e.key === 'Enter') carregarListaOficios();
        });
    });
    document.getElementById('filtroOficioOrigem').addEventListener('change', carregarListaOficios);

    document.getElementById('btnFecharOficioEtapa15').addEventListener('click', fecharOficioEtapa15);
    document.getElementById('btnBaixarOficioEtapa15').addEventListener('click', baixarOficioEtapa15Pdf);
    document.getElementById('btnAbrirProcessoDoOficio').addEventListener('click', () => {
        if (oficioEtapa15Atual?.processoId && typeof window.abrirProcessoAuto === 'function') {
            window.abrirProcessoAuto(oficioEtapa15Atual.processoId);
        }
    });

    document.getElementById('tabelaOficiosBody').addEventListener('change', (e) => {
        const select = e.target.closest('select[data-acao="situacao"]');
        if (select) salvarSituacaoOficio(select);
    });

    document.getElementById('tabelaOficiosBody').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-acao]');
        if (!btn) return;
        if (btn.dataset.acao === 'abrir-oficio') abrirOficioAvulsoExistente(btn.dataset.id);
        if (btn.dataset.acao === 'excluir-oficio') excluirOficioDaLista(btn.dataset);
        if (btn.dataset.acao === 'ver-oficio') abrirOficioEtapa15(btn.dataset.id);
        if (btn.dataset.acao === 'abrir-processo' && typeof window.abrirProcessoAuto === 'function') {
            window.abrirProcessoAuto(btn.dataset.id);
        }
    });
}

function recarregarListaOficiosSeVisivel() {
    const secao = document.getElementById('secao-oficios');
    if (secao && secao.style.display !== 'none') carregarListaOficios();
}

// Datas do filtro são do dia local; o banco guarda em UTC
function intervaloDatasOficios() {
    const inicio = document.getElementById('filtroOficioDataInicio').value;
    const fim = document.getElementById('filtroOficioDataFim').value;
    const desde = inicio ? new Date(`${inicio}T00:00:00`).toISOString() : null;
    let ate = null;
    if (fim) {
        const d = new Date(`${fim}T00:00:00`);
        d.setDate(d.getDate() + 1);
        ate = d.toISOString();
    }
    return { desde, ate };
}

let buscaOficiosAtual = 0;

async function carregarListaOficios() {
    const idBusca = ++buscaOficiosAtual;
    const tbody = document.getElementById('tabelaOficiosBody');
    const vazio = document.getElementById('oficiosVazio');
    const carregando = document.getElementById('oficiosCarregando');
    const contador = document.getElementById('oficiosCount');

    tbody.innerHTML = '';
    vazio.style.display = 'none';
    carregando.style.display = 'flex';
    contador.textContent = 'Carregando...';

    const origem = document.getElementById('filtroOficioOrigem').value;
    const palavras = normalizarTextoOficio(document.getElementById('filtroOficioBusca').value)
        .split(' ')
        .map(p => p.replace(/[%_\\]/g, ''))
        .filter(Boolean);
    const { desde, ate } = intervaloDatasOficios();

    // Uma origem com erro não esconde a outra
    const [resAvulsos, resEtapa15] = await Promise.allSettled([
        origem === 'etapa15' ? [] : buscarOficiosAvulsos(palavras, desde, ate),
        origem === 'avulso' ? [] : buscarOficiosEtapa15(palavras, desde, ate)
    ]);
    if (idBusca !== buscaOficiosAtual) return; // chegou uma busca mais nova

    const falhas = [];
    if (resAvulsos.status === 'rejected') {
        console.error('[OFÍCIOS] Erro ao carregar os ofícios do painel:', resAvulsos.reason);
        falhas.push('do painel');
    }
    if (resEtapa15.status === 'rejected') {
        console.error('[OFÍCIOS] Erro ao carregar os ofícios da Etapa 15:', resEtapa15.reason);
        falhas.push('da Etapa 15');
    }

    const linhas = [
        ...(resAvulsos.value || []),
        ...(resEtapa15.value || [])
    ].sort(compararNumeroOficioDesc);

    carregando.style.display = 'none';
    contador.textContent = `${linhas.length} ${linhas.length === 1 ? 'ofício encontrado' : 'ofícios encontrados'}`
        + (falhas.length ? ` — ⚠️ não foi possível carregar os ofícios ${falhas.join(' e ')}` : '');

    if (!linhas.length) {
        if (!falhas.length) vazio.style.display = 'flex';
        return;
    }
    tbody.innerHTML = linhas.map(montarLinhaOficio).join('');
}

window.carregarListaOficios = carregarListaOficios;

async function buscarOficiosAvulsos(palavras, desde, ate) {
    let query = supabaseClient
        .from('oficios_gfp')
        .select('id, numero, assunto, created_at, baixado_em, situacao, profiles(nome)')
        .order('created_at', { ascending: false })
        .limit(LIMITE_LISTA_OFICIOS);
    if (desde) query = query.gte('created_at', desde);
    if (ate) query = query.lt('created_at', ate);
    // Cada palavra precisa aparecer em algum lugar do ofício, em qualquer ordem
    palavras.forEach(p => { query = query.ilike('texto_busca', `%${p}%`); });

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(o => ({
        origem: 'avulso',
        id: o.id,
        numero: o.numero,
        data: o.created_at,
        descricao: o.assunto || '(sem assunto)',
        autor: o.profiles?.nome || '—',
        baixado: !!o.baixado_em,
        situacao: o.situacao || 'sem_movimentacao'
    }));
}

async function buscarOficiosEtapa15(palavras, desde, ate) {
    let query = supabaseClient
        .from('documentos')
        .select('id, numero_sequencial, created_at, processo_id, situacao, processos(numero_processo), profiles(nome)')
        .eq('tipo', CATEGORIA_OFICIO_AVULSO)
        .not('numero_sequencial', 'is', null)
        .order('created_at', { ascending: false })
        .limit(LIMITE_LISTA_OFICIOS);
    if (desde) query = query.gte('created_at', desde);
    if (ate) query = query.lt('created_at', ate);

    const { data, error } = await query;
    if (error) throw error;
    return (data || [])
        .filter(d => {
            if (!palavras.length) return true;
            const texto = normalizarTextoOficio(`${d.numero_sequencial} ${d.processos?.numero_processo || ''}`);
            return palavras.every(p => texto.includes(p));
        })
        .map(d => ({
            origem: 'etapa15',
            id: d.processo_id,
            documento_id: d.id,
            numero: d.numero_sequencial,
            data: d.created_at,
            descricao: `Processo ${d.processos?.numero_processo || '—'}`,
            autor: d.profiles?.nome || '—',
            baixado: true,
            situacao: d.situacao || 'sem_movimentacao'
        }));
}

// Exclui de vez a linha do banco (só ofícios do painel).
// Quem decide o destino do número é a pessoa: ou ele volta para a fila e sai no
// próximo ofício, ou fica reservado para sempre (deixando um buraco na sequência).
async function excluirOficioDaLista({ id, numero, baixado }) {
    if (oficioAvulsoAtual?.id === id) {
        alert('Feche o ofício antes de excluí-lo.');
        return;
    }

    const oQueEh = baixado ? `o ofício Nº ${numero}` : `o rascunho do ofício Nº ${numero}`;
    if (!confirm(`Excluir ${oQueEh}?\n\nO texto será apagado do sistema.\nEsta ação não pode ser desfeita.`)) return;

    const alertaPdf = baixado
        ? '\n\n⚠️ Este ofício já foi baixado em PDF. Se ele já foi assinado ou enviado, liberar o número faria dois documentos diferentes levarem o mesmo número.'
        : '';
    const liberarNumero = confirm(
        `O número ${numero} pode ser usado em um novo ofício?\n\n` +
        `OK = liberar: o próximo ofício gerado receberá o ${numero}.\n` +
        `Cancelar = manter reservado: nenhum outro ofício levará esse número.${alertaPdf}`
    );

    try {
        const { error } = await supabaseClient.from('oficios_gfp').delete().eq('id', id);
        if (error) throw error;

        let liberado = false;
        if (liberarNumero) {
            const { error: errDevolver } = await supabaseClient
                .rpc('devolver_numero', { p_numero: numero, p_categoria: CATEGORIA_OFICIO_AVULSO });
            if (errDevolver) console.warn('[OFÍCIOS] Número não devolvido à fila:', errDevolver.message);
            liberado = !errDevolver;
        }

        carregarListaOficios();
        alert(liberado
            ? `Ofício excluído. O número ${numero} voltou para a fila e sairá no próximo ofício.`
            : `Ofício excluído. O número ${numero} segue reservado e não será usado de novo.`);
    } catch (e) {
        console.error('[OFÍCIOS] Erro ao excluir:', e);
        alert('Não foi possível excluir o ofício. Tente novamente.');
    }
}

// "2026/065" → ordena por ano e depois pela sequência, do mais novo para o mais antigo
function compararNumeroOficioDesc(a, b) {
    const partes = (n) => String(n || '').split('/').map(p => parseInt(p.replace(/\D/g, ''), 10) || 0);
    const [anoA, seqA] = partes(a.numero);
    const [anoB, seqB] = partes(b.numero);
    return (anoB - anoA) || (seqB - seqA);
}

function montarLinhaOficio(o) {
    const data = o.data ? new Date(o.data).toLocaleDateString('pt-BR') : '—';
    const origem = o.origem === 'avulso'
        ? '<span class="oficio-origem oficio-origem-avulso">Painel</span>'
        : '<span class="oficio-origem oficio-origem-etapa15">Etapa 15</span>';

    // Rascunho ainda não é ofício de verdade: não tem situação para escolher.
    // Ofício da Etapa 15 e avulso já baixado em PDF podem ser marcados.
    const situacao = (o.origem === 'avulso' && !o.baixado)
        ? '<span class="oficio-situacao oficio-situacao-rascunho">Rascunho</span>'
        : montarSeletorSituacaoOficio(o);

    // Excluir só existe para os ofícios do painel; os da Etapa 15 pertencem ao processo
    const id = escaparHtmlOficioAvulso(o.id);
    const acao = o.origem === 'avulso'
        ? `<button type="button" class="oficio-acao" data-acao="abrir-oficio" data-id="${id}">${o.baixado ? 'Ver' : 'Editar'}</button>
           <button type="button" class="oficio-acao oficio-acao-perigo" data-acao="excluir-oficio" data-id="${id}"
                   data-numero="${escaparHtmlOficioAvulso(o.numero)}" data-baixado="${o.baixado ? '1' : ''}">Excluir</button>`
        : `<button type="button" class="oficio-acao" data-acao="ver-oficio" data-id="${id}">Ver ofício</button>
           <button type="button" class="oficio-acao" data-acao="abrir-processo" data-id="${id}">Ver processo</button>`;

    const classeLinha = (o.origem === 'avulso' && !o.baixado) ? 'rascunho' : o.situacao;

    return `<tr class="linha-situacao-${classeLinha}">
        <td><strong>${escaparHtmlOficioAvulso(o.numero)}</strong></td>
        <td>${data}</td>
        <td>${origem}</td>
        <td>${escaparHtmlOficioAvulso(o.descricao)}</td>
        <td>${escaparHtmlOficioAvulso(o.autor)}</td>
        <td>${situacao}</td>
        <td style="text-align: right;">${acao}</td>
    </tr>`;
}

const SITUACOES_OFICIO = [
    ['sem_movimentacao', 'Sem movimentação'],
    ['baixado', 'Baixado'],
    ['assinado', 'Assinado']
];

function montarSeletorSituacaoOficio(o) {
    const opcoes = SITUACOES_OFICIO
        .map(([valor, rotulo]) => `<option value="${valor}"${o.situacao === valor ? ' selected' : ''}>${rotulo}</option>`)
        .join('');
    const alvo = o.origem === 'avulso' ? o.id : o.documento_id;
    return `<select class="oficio-situacao-select situacao-${o.situacao}" data-acao="situacao" data-origem="${o.origem}"
                    data-id="${escaparHtmlOficioAvulso(alvo)}" data-atual="${o.situacao}">${opcoes}</select>`;
}

// A cor acompanha a situação escolhida (cinza, azul ou verde)
function pintarSeletorSituacaoOficio(select) {
    SITUACOES_OFICIO.forEach(([valor]) => select.classList.remove(`situacao-${valor}`));
    select.classList.add(`situacao-${select.value}`);

    const linha = select.closest('tr');
    if (linha) {
        SITUACOES_OFICIO.forEach(([valor]) => linha.classList.remove(`linha-situacao-${valor}`));
        linha.classList.add(`linha-situacao-${select.value}`);
    }
}

// Etapa 15 guarda em documentos.situacao; ofício do painel, em oficios_gfp.situacao
async function salvarSituacaoOficio(select) {
    const { origem, id, atual } = select.dataset;
    const valor = select.value;
    if (valor === atual) return;

    select.disabled = true;
    try {
        const tabela = origem === 'avulso' ? 'oficios_gfp' : 'documentos';
        const { error } = await supabaseClient.from(tabela).update({ situacao: valor }).eq('id', id);
        if (error) throw error;
        select.dataset.atual = valor;
        pintarSeletorSituacaoOficio(select);
    } catch (e) {
        console.error('[OFÍCIOS] Erro ao salvar a situação:', e);
        alert('Não foi possível salvar a situação do ofício. Tente novamente.');
        select.value = atual;
        pintarSeletorSituacaoOficio(select);
    } finally {
        select.disabled = false;
    }
}

function escaparHtmlOficioAvulso(txt) {
    const div = document.createElement('div');
    div.textContent = txt == null ? '' : String(txt);
    return div.innerHTML.replace(/"/g, '&quot;');
}


// ============================================================
// ATALHO "VER OFÍCIO" — abre só o documento da Etapa 15, sem carregar o processo
// O ofício da Etapa 15 não fica guardado pronto no banco: ele é montado a partir
// dos dados do processo, pelo mesmo modelo que a Etapa 15 usa (oficio-modelo.js).
// Por isso aqui busca-se apenas o punhado de campos que o documento mostra —
// nunca a coluna `dados` inteira, que é pesada.
// ============================================================

let oficioEtapa15Atual = null;   // { processoId, numero }

async function abrirOficioEtapa15(processoId) {
    const container = document.getElementById('containerOficioEtapa15');
    container.innerHTML = '<div class="oficio-avulso-status">Carregando o ofício...</div>';
    document.getElementById('oficioEtapa15NumeroTitulo').textContent = '';
    document.getElementById('modalOficioEtapa15').classList.add('open');
    document.body.style.overflow = 'hidden';
    oficioEtapa15Atual = { processoId, numero: '' };

    try {
        const [processo, documento, auto, secretario, gerenteNome] = await Promise.all([
            buscarDadosProcessoDoOficio(processoId),
            buscarDocumentoOficioEtapa15(processoId),
            buscarAutoInfracaoDoProcesso(processoId),
            buscarSecretarioFazenda(),
            buscarNomeGerentePosturas()
        ]);

        const numero = documento?.numero_sequencial || '—';
        oficioEtapa15Atual = { processoId, numero };
        document.getElementById('oficioEtapa15NumeroTitulo').textContent = `Nº ${numero}`;
        document.getElementById('oficioEtapa15Subtitulo').textContent =
            `Processo ${processo?.numero_processo || '—'} — documento da Etapa 15, somente leitura.`;

        container.innerHTML = window.montarHtmlOficioGfp({
            numero,
            // Mesma data que a Etapa 15 mostra: o mês em que o ofício está sendo visto
            dataTexto: window.dataTextoOficio(),
            secretarioNome: secretario.nome,
            secretarioCargo: secretario.cargo,
            gerenteNome,
            autuado: processo?.contribuinte?.nome || processo?.campos?.contNome || '—',
            numeroAutoInfracao: auto || processo?.numero_auto_infracao || '—',
            pa: processo?.relatorio_fiscal?.pa
                || processo?.relatorio_fiscal?.numero_processo_administrativo
                || processo?.numero_processo
                || '—',
            nomeEditavel: false
        });
        container.querySelector('#documentoOficioGfp')?.classList.add('oficio-avulso-folha');
    } catch (e) {
        console.error('[OFÍCIO ETAPA 15] Erro ao abrir:', e);
        container.innerHTML = `<div class="oficio-avulso-status" style="color:#b91c1c;">
            Não foi possível montar o ofício. Abra o processo para vê-lo na Etapa 15.<br>
            <small>${escaparHtmlOficioAvulso(e?.message || '')}</small></div>`;
    }
}

// Pega do JSON só os pedaços que o ofício usa, em vez da coluna `dados` inteira
async function buscarDadosProcessoDoOficio(processoId) {
    const { data, error } = await supabaseClient
        .from('processos')
        .select('numero_processo, contribuinte:dados->contribuinte, campos:dados->campos, relatorio_fiscal:dados->relatorio_fiscal, numero_auto_infracao:dados->>numero_auto_infracao')
        .eq('id', processoId)
        .single();
    if (error) throw error;
    return data;
}

async function buscarDocumentoOficioEtapa15(processoId) {
    const { data } = await supabaseClient
        .from('documentos')
        .select('numero_sequencial')
        .eq('tipo', CATEGORIA_OFICIO_AVULSO)
        .eq('processo_id', processoId)
        .order('created_at', { ascending: true })
        .limit(1);
    return (data || [])[0];
}

async function buscarAutoInfracaoDoProcesso(processoId) {
    const { data } = await supabaseClient
        .from('autos_infracao')
        .select('numero')
        .eq('processo_id', processoId)
        .order('created_at', { ascending: false })
        .limit(1);
    return (data || [])[0]?.numero;
}

// Destinatário fixo: linha 100 da tabela etapas (mesma regra da Etapa 15)
async function buscarSecretarioFazenda() {
    try {
        const { data } = await supabaseClient
            .from('etapas')
            .select('nome, tipo')
            .eq('numero', 100)
            .maybeSingle();
        if (data?.nome) return { nome: data.nome, cargo: data.tipo || window.CARGO_SECRETARIO_FAZENDA_OFICIO };
    } catch (e) {
        console.warn('[OFÍCIO ETAPA 15] Erro ao buscar o Secretário de Fazenda:', e);
    }
    return { nome: '', cargo: window.CARGO_SECRETARIO_FAZENDA_OFICIO };
}

function fecharOficioEtapa15() {
    document.getElementById('modalOficioEtapa15').classList.remove('open');
    document.body.style.overflow = '';
    oficioEtapa15Atual = null;
}

async function baixarOficioEtapa15Pdf() {
    const docEl = document.getElementById('containerOficioEtapa15').querySelector('#documentoOficioGfp');
    if (!docEl) return;

    const numLimpo = String(oficioEtapa15Atual?.numero || 'XXX').replace(/[\/\\]/g, '-');
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
    printDoc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Oficio GFP ${numLimpo}</title><style>${estilos}</style></head><body>${docEl.outerHTML}</body></html>`);
    printDoc.close();

    const imagens = Array.from(printDoc.images).filter(img => !img.complete);
    await Promise.race([
        Promise.all(imagens.map(img => new Promise(r => { img.onload = img.onerror = r; }))),
        new Promise(r => setTimeout(r, 10000))
    ]);

    const tituloOriginal = document.title;
    document.title = `Oficio GFP ${numLimpo}`;
    printIframe.contentWindow.focus();
    printIframe.contentWindow.print();
    setTimeout(() => {
        if (document.body.contains(printIframe)) document.body.removeChild(printIframe);
        document.title = tituloOriginal;
    }, 1000);
}
