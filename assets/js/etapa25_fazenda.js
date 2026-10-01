/* ============================================================================
   etapa25_fazenda.js — Etapa 25 (Gerente cumpre o decreto) e Etapa 31
   ----------------------------------------------------------------------------
   Etapa 25: o gerente vê o processo unificado, escolhe o desfecho, gera o
   ofício à Fazenda (quando houver) e copia a mensagem do protocolo.

     • Redução de 50%     → ofício + mensagem → Etapa 31, prazo de 30 dias
     • Alteração de valor → ofício (com parágrafo escrito na hora) → Etapa 31, 30 dias
     • Cancelamento       → só a mensagem → Etapa 29 (encerra)
     • Continuidade       → só a mensagem → Etapa 31, com o prazo que sobrou

   As duas primeiras exigem o anexo da nova multa para avançar.

   Etapa 31: mostra o prazo retomado e registra se o pagamento foi feito
   (Sim → Etapa 29, Não → Etapa 28).

   Textos dos ofícios e das mensagens: tabela modelos_parecer, tipos
   'oficio_fazenda' e 'mensagem_fazenda' (migracao/modelos_parecer.sql).
   ============================================================================ */

(function () {
    'use strict';

    console.info('[Etapa 25/31] versão 2026-09-28');

    const P = () => window.ParecerCompartilhado;

    const OPCOES = {
        reducao_50: {
            rotulo: 'Redução de 50%',
            cor: '#2563eb',
            fundo: '#eff6ff',
            temOficio: true,
            exigeNovaMulta: true,
            destino: 31,
            prazo: 'reiniciar',
            detalhe: 'Ofício à Fazenda pedindo a guia com desconto. O prazo recomeça com 30 dias na Etapa 31.'
        },
        alteracao_valor: {
            rotulo: 'Alteração de valor',
            cor: '#7c3aed',
            fundo: '#f5f3ff',
            temOficio: true,
            exigeTextoManual: true,
            exigeNovaMulta: true,
            destino: 31,
            prazo: 'reiniciar',
            detalhe: 'Ofício à Fazenda com a justificativa escrita por você. O prazo recomeça com 30 dias na Etapa 31.'
        },
        cancelamento: {
            rotulo: 'Cancelamento',
            cor: '#16a34a',
            fundo: '#f0fdf4',
            temOficio: false,
            destino: 29,
            prazo: 'nenhum',
            detalhe: 'Sem ofício: só a mensagem para a Fazenda. O processo é encerrado (Etapa 29).'
        },
        continuidade: {
            rotulo: 'Continuidade na cobrança',
            cor: '#b45309',
            fundo: '#fffbeb',
            temOficio: false,
            destino: 31,
            prazo: 'retomar',
            detalhe: 'Sem ofício. Na Etapa 31 o prazo volta a correr de onde parou.'
        }
    };

    const DIAS_PRAZO_NOVO = 30;

    // Cópia dos modelos usada só enquanto migracao/modelos_parecer.sql não foi
    // executado. Com o banco atualizado, valem os textos de lá (editáveis).
    const MODELOS_PADRAO = {
        oficio_fazenda: {
            reducao_50: `Prezado Senhor,

Considerando o **Auto de Infração nº {{AUTO_NUMERO}}** em face de **{{DEFENDENTE}}**, cujo **PA {{PROCESSO_NUMERO}}** tramitou corretamente, com os devidos documentos e prazos estabelecidos.

Considerando ainda que foram respeitados os princípios da legalidade, da ampla defesa e do contraditório.

Informo que ao final, a fiscalização verificou em nova vistoria no imóvel, que após o recebimento do Auto de Infração houve o cumprimento da obrigação, ficando assim, concedido a **redução de 50%** do valor das penalidades impostas, nos moldes legais.

Diante dos fatos, requisito portanto, que seja emitido a guia para o pagamento da penalidade com o desconto legal, **eventual pedido de inscrição em dívida ativa será encaminhado após término do prazo recursal.**

Coloco-me à disposição para quaisquer esclarecimentos adicionais.

Atenciosamente,`,
            alteracao_valor: `Prezado Senhor,

Considerando o **Auto de Infração nº {{AUTO_NUMERO}}** em face de **{{DEFENDENTE}}**, cujo **PA {{PROCESSO_NUMERO}}** tramitou corretamente, com os devidos documentos e prazos estabelecidos.

Considerando ainda que foram respeitados os princípios da legalidade, da ampla defesa e do contraditório.

{{TEXTO_MANUAL}}

Diante dos fatos, requisito portanto, que seja emitido a guia para o pagamento da penalidade com o desconto legal, **eventual pedido de inscrição em dívida ativa será encaminhado após término do prazo recursal.**

Coloco-me à disposição para quaisquer esclarecimentos adicionais.

Atenciosamente,`
        },
        mensagem_fazenda: {
            reducao_50: 'Protocolo enviado para a fazenda solicitando redução de 50% do valor',
            alteracao_valor: 'Protocolo enviado para a fazenda solicitando a alteração de valor',
            cancelamento: 'Protocolo enviado para a fazenda solicitando o cancelamento da penalidade',
            continuidade: 'Darei continuidade na cobrança conforme o despacho'
        }
    };

    let usandoModelosPadrao = false;

    let modelos = [];
    let auto = null;
    let assinatura = { secretario: null, gerente: null };

    const esc = txt => P().escaparHtml(txt);

    function dados25() { return P().dadosEtapa(25); }
    function dados31() { return P().dadosEtapa(31); }

    // ------------------------------------------------------------------ dados

    async function carregarModelos() {
        const { data, error } = await supabaseClient
            .from('modelos_parecer')
            .select('*')
            .eq('ativo', true)
            .order('ordem', { ascending: true });
        if (error) throw error;
        modelos = (data || []).filter(m => ['oficio_fazenda', 'mensagem_fazenda'].includes(m.tipo));
    }

    // Texto do modelo: o do banco quando existir; senão, a cópia local.
    function textoModelo(tipo, decisao) {
        const doBanco = modelos.find(m => m.tipo === tipo && m.decisao === decisao);
        if (doBanco) return doBanco.texto;
        const padrao = MODELOS_PADRAO[tipo]?.[decisao] || null;
        if (padrao) usandoModelosPadrao = true;
        return padrao;
    }

    function valores() {
        const v = P().valoresMarcadores(auto);
        return {
            AUTO_NUMERO: v.AUTO_NUMERO || '—',
            DEFENDENTE: v.DEFENDENTE || '—',
            PROCESSO_NUMERO: processoAtual?.numero_processo || '—'
        };
    }

    function preencher(texto, extras = {}) {
        const vals = { ...valores(), ...extras };
        return String(texto || '').replace(/\{\{([A-Z_]+)\}\}/g, (marcador, chave) => vals[chave] ?? marcador);
    }

    function mensagemDaOpcao(opcao) {
        const texto = textoModelo('mensagem_fazenda', opcao);
        return texto ? preencher(texto) : '';
    }

    // Texto simples do modelo → parágrafos do ofício. **negrito** vira <strong>.
    function corpoOficioHtml(opcao, textoManual) {
        const modelo = textoModelo('oficio_fazenda', opcao);
        if (!modelo) return '';
        const texto = preencher(modelo, { TEXTO_MANUAL: textoManual || '[descreva aqui o motivo da alteração de valor]' });

        const paragrafos = texto.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => {
            const comNegrito = esc(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            const recuo = /^Prezado/.test(p) ? '' : 'text-indent: 40px;';
            return `<p style="margin: 0 0 16px 0; ${recuo}">${comNegrito.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        return `<div id="e25OficioCorpo" contenteditable="true" spellcheck="false"
                     style="font-size: 11pt; line-height: 1.6; text-align: justify; outline:none; border:1px dashed transparent; border-radius:6px; padding:4px;"
                     onfocus="this.style.borderColor='#c4b5fd'" onblur="this.style.borderColor='transparent'">${paragrafos}</div>`;
    }

    async function montarOficio(opcao, textoManual) {
        if (!window.montarHtmlOficioSemac) return '';
        if (!assinatura.secretario && window.obterSecretarioFazenda) {
            assinatura.secretario = await window.obterSecretarioFazenda();
        }
        if (!assinatura.gerente && window.obterGerentePosturas) {
            assinatura.gerente = await window.obterGerentePosturas();
        }
        const salvo = dados25();
        return window.montarHtmlOficioSemac({
            idDocumento: 'documentoOficioFazenda',
            numero: salvo.oficio_numero || `XXX/${new Date().getFullYear()}`,
            dataTexto: window.dataTextoOficio ? window.dataTextoOficio() : '',
            secretarioNome: assinatura.secretario?.nome || 'Secretário Municipal de Fazenda',
            secretarioCargo: assinatura.secretario?.cargo || 'Secretário Municipal de Fazenda',
            gerenteNome: assinatura.gerente?.nome || perfilAtual?.nome || '—',
            assunto: 'Emissão de guia para pagamento',
            corpoHtml: corpoOficioHtml(opcao, textoManual)
        });
    }

    // ------------------------------------------------------------------- prazo

    function notificacaoDoAuto() {
        return auto?.notificacao || notificacaoAtual || null;
    }

    // Quantos dias ainda faltavam quando o processo parou nesta etapa.
    // Vencimento atual do Auto: na notificação, na lista de Autos da Etapa 18
    // ou no que a própria Etapa 31 já tiver guardado.
    function vencimentoAtual() {
        const notif = notificacaoDoAuto();
        if (notif?.data_vencimento) return notif.data_vencimento;

        const autosEtapa18 = processoAtual?.campos?.etapa18?.autos || [];
        const doAuto = autosEtapa18.find(a => (notif?.id && a.id === notif.id) || (auto?.numero && a.numero === auto.numero));
        if (doAuto?.data_vencimento) return doAuto.data_vencimento;

        return dados31().data_vencimento || null;
    }

    // Dias que ainda faltavam. Negativo quando o prazo já venceu, null quando o
    // Auto não tem prazo registrado.
    function diasQueSobraram() {
        const vencimento = vencimentoAtual();
        if (!vencimento) return null;
        return Math.ceil((new Date(vencimento) - new Date()) / 86400000);
    }

    // O que acontece com o prazo ao avançar:
    //   novo   → recomeça com 30 dias
    //   retoma → continua com os dias que sobraram
    //   mantem → já estava vencido: fica vencido, sem reiniciar
    //   sem    → o Auto não tem prazo registrado
    function planoDePrazo(opcao) {
        const regra = OPCOES[opcao]?.prazo;
        if (regra === 'reiniciar') return { tipo: 'novo', dias: DIAS_PRAZO_NOVO };
        if (regra !== 'retomar') return { tipo: 'nenhum' };

        const faltam = diasQueSobraram();
        if (faltam === null) return { tipo: 'sem' };
        if (faltam <= 0) return { tipo: 'mantem', dias: faltam, vencimento: vencimentoAtual() };
        return { tipo: 'retoma', dias: faltam };
    }

    function somarDiasCorridos(dias) {
        const data = new Date();
        data.setDate(data.getDate() + (parseInt(dias, 10) || 0));
        return data.toISOString();
    }

    // Aplica o plano de prazo ao entrar na Etapa 31.
    async function aplicarPrazoParaEtapa31(plano) {
        const alvo31 = dados31();
        alvo31.prazo_plano = plano.tipo;

        // Prazo vencido continua vencido, e Auto sem prazo continua sem: em
        // nenhum dos dois casos a contagem é reiniciada.
        if (plano.tipo === 'mantem' || plano.tipo === 'sem') {
            alvo31.data_vencimento = plano.vencimento || null;
            alvo31.dias_vencidos = plano.tipo === 'mantem' ? Math.abs(plano.dias) : null;
            return { prazo_dias: null };
        }

        const agora = new Date().toISOString();
        const vencimento = somarDiasCorridos(plano.dias);
        const campos = {
            prazo_dias: plano.dias,
            data_inicio: agora,
            data_vencimento: vencimento,
            prazo_origem: 'etapa25'
        };

        const notif = notificacaoDoAuto();
        if (notif?.id) {
            try {
                await gravarPrazoNotificacao(notif.id, campos);
            } catch (err) {
                // Banco sem migracao/prazo_origem_etapa25.sql rejeita o valor
                // novo de prazo_origem (erro 400). O prazo em si é o que importa.
                console.warn('[Etapa 25] Gravando o prazo sem prazo_origem:', err?.message || err);
                const { prazo_origem, ...semOrigem } = campos;
                await atualizarNotificacaoNoBanco(notif.id, semOrigem);
            }
            Object.assign(notif, campos);
        }

        alvo31.prazo_dias = plano.dias;
        alvo31.data_inicio = agora;
        alvo31.data_vencimento = vencimento;
        return campos;
    }

    // ------------------------------------------------------------------ tela 25

    function html(uploadHtml) {
        const cartao = 'background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;';
        const titulo = 'margin:0 0 4px 0; color:#1e293b; font-size:1rem; font-weight:700;';
        const sub = 'margin:0 0 12px 0; color:#64748b; font-size:0.85rem;';
        const botao = 'padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#334155; font-weight:600; font-size:0.88rem; cursor:pointer;';

        return `
            <div id="etapa25Fazenda" style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                    <div style="background:#fef3c7; padding:10px; border-radius:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700;">Cumprimento do Despacho</h3>
                        <p style="margin:2px 0 0 0; color:#64748b; font-size:0.85rem;">Escolha o desfecho, gere o ofício à Fazenda e copie a mensagem do protocolo.</p>
                    </div>
                </div>

                <div id="e25Resumo" style="${cartao} margin-bottom:20px; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;"></div>

                <div style="${cartao} margin-bottom:20px;">
                    <h4 style="${titulo}">1. Documentos do processo</h4>
                    <p style="${sub}">O mesmo PDF oficial com capa das etapas anteriores, agora com o parecer e o despacho.</p>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button type="button" id="e25BtnUnificado" class="btn-primary" style="padding:10px 18px;">Abrir processo unificado (PDF)</button>
                        <button type="button" id="e25BtnBaixarUnificado" style="${botao}">Baixar processo unificado</button>
                        <button type="button" id="e25BtnVerParecer" style="${botao}">Ver parecer jurídico</button>
                        <button type="button" id="e25BtnVerDespacho" style="${botao}">Ver despacho do Secretário</button>
                    </div>
                </div>

                <div style="${cartao} margin-bottom:20px;">
                    <h4 style="${titulo}">2. Desfecho <span style="color:#ef4444;">*</span></h4>
                    <p style="${sub}">A escolha define o ofício, a mensagem do protocolo e para onde o Auto segue.</p>
                    <div id="e25Opcoes" style="display:flex; flex-direction:column; gap:8px;">
                        ${Object.entries(OPCOES).map(([chave, o]) => `
                            <label class="e25-opcao" data-opcao="${chave}" style="display:flex; align-items:flex-start; gap:10px; padding:12px 14px; border-radius:10px; border:2px solid #e2e8f0; background:white; cursor:pointer;">
                                <input type="radio" name="e25Opcao" value="${chave}" style="margin-top:3px; accent-color:${o.cor};">
                                <span><strong style="color:${o.cor};">${o.rotulo}</strong><br><span style="font-size:0.83rem; color:#64748b;">${o.detalhe}</span></span>
                            </label>
                        `).join('')}
                    </div>
                    <div id="e25PrazoAviso" hidden style="margin-top:12px; background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:10px 12px; border-radius:8px; font-size:0.85rem;"></div>
                </div>

                <div id="e25BlocoTextoManual" hidden style="${cartao} margin-bottom:20px;">
                    <h4 style="${titulo}">3. Justificativa da alteração de valor <span style="color:#ef4444;">*</span></h4>
                    <p style="${sub}">Este parágrafo entra no meio do ofício, no lugar do texto padrão.</p>
                    <textarea id="e25TextoManual" rows="4" placeholder="Ex.: após nova medição da testada, verificou-se que o valor lançado deve ser retificado para..." style="width:100%; box-sizing:border-box; padding:12px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.92rem; color:#1e293b; resize:vertical; font-family:inherit;"></textarea>
                </div>

                <div id="e25BlocoOficio" hidden style="${cartao} margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
                        <div>
                            <h4 style="${titulo}">4. Ofício para a Fazenda</h4>
                            <p style="margin:0; color:#64748b; font-size:0.85rem;">Gerado a partir do modelo. <strong>Clique no texto para editar</strong> antes de imprimir; o nome do destinatário também é editável.</p>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" id="e25BtnAtualizarOficio" style="${botao}">Restaurar texto do modelo</button>
                            <button type="button" id="e25BtnImprimirOficio" class="btn-primary" style="padding:10px 18px;">Imprimir / PDF</button>
                        </div>
                    </div>
                    <div id="e25AvisoModelo" hidden style="margin-bottom:10px; background:#fffbeb; border:1px solid #fde68a; color:#78350f; padding:10px 12px; border-radius:8px; font-size:0.83rem;"></div>
                    <div id="e25Oficio" style="border:1px solid #e2e8f0; border-radius:8px; background:white; max-height:420px; overflow:auto;"></div>
                </div>

                <div id="e25BlocoMensagem" hidden style="${cartao} margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
                        <div>
                            <h4 style="${titulo}">5. Mensagem para o protocolo</h4>
                            <p style="margin:0; color:#64748b; font-size:0.85rem;">Copie e cole na resposta do protocolo.</p>
                        </div>
                        <button type="button" id="e25BtnCopiarMensagem" style="${botao}">Copiar mensagem</button>
                    </div>
                    <textarea id="e25Mensagem" rows="2" style="width:100%; box-sizing:border-box; padding:12px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.92rem; color:#1e293b; resize:vertical; font-family:inherit;"></textarea>
                </div>

                <div id="e25BlocoMulta" hidden style="${cartao}">
                    <h4 style="${titulo}">6. Nova multa emitida pela Fazenda <span style="color:#ef4444;">*</span></h4>
                    <p style="${sub}">Anexe a nova guia recebida da Fazenda. Sem ela o Auto não avança.</p>
                    ${uploadHtml('Clique para selecionar ou arraste a nova multa aqui')}
                </div>

                <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                    <button type="button" id="e25BtnSalvar" class="btn-primary" style="padding:12px 24px;">Salvar rascunho</button>
                </div>
            </div>
        `;
    }

    function renderizarResumo(idContainer) {
        const el = document.getElementById(idContainer);
        if (!el) return;
        const v = P().valoresMarcadores(auto);
        const descricao = window.obterDescricaoInfracao
            ? window.obterDescricaoInfracao(auto?.descricao)
            : auto?.descricao;
        const decisao24 = P().dadosEtapa(24)?.decisao;
        const campos = [
            ['Processo', processoAtual?.numero_processo || '—'],
            ['Auto de Infração', v.AUTO_NUMERO || '—'],
            ['Infração', descricao || '—'],
            ['Autuado', v.DEFENDENTE || '—'],
            ['Despacho do Secretário', decisao24 ? (P().DECISOES[decisao24]?.rotulo || decisao24) : 'não registrado']
        ];
        el.innerHTML = campos.map(([rotulo, valor]) => `
            <div>
                <div style="font-size:0.75rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.03em;">${rotulo}</div>
                <div style="font-size:0.92rem; color:#1e293b; font-weight:500; margin-top:2px;">${esc(valor)}</div>
            </div>
        `).join('');
    }

    function opcaoMarcada() {
        return document.querySelector('input[name="e25Opcao"]:checked')?.value || '';
    }

    function destacarOpcao() {
        const marcada = opcaoMarcada();
        document.querySelectorAll('.e25-opcao').forEach(label => {
            const o = OPCOES[label.dataset.opcao];
            const ativa = label.dataset.opcao === marcada;
            label.style.borderColor = ativa ? o.cor : '#e2e8f0';
            label.style.background = ativa ? o.fundo : 'white';
        });
    }

    function oficioFoiEditado() {
        const salvo = dados25();
        const atual = document.getElementById('e25Oficio')?.innerHTML || '';
        return !!salvo.oficio_html && atual.trim() !== '' && salvo.oficio_editado;
    }

    // gerarDoModelo=true descarta as edições e volta ao texto do modelo.
    async function atualizarOficio(gerarDoModelo = true) {
        const opcao = opcaoMarcada();
        const alvo = document.getElementById('e25Oficio');
        if (!alvo || !OPCOES[opcao]?.temOficio) return;

        const salvo = dados25();
        if (!gerarDoModelo && salvo.oficio_html && salvo.opcao === opcao) {
            alvo.innerHTML = salvo.oficio_html;
        } else {
            alvo.innerHTML = await montarOficio(opcao, document.getElementById('e25TextoManual')?.value || '');
        }

        const aviso = document.getElementById('e25AvisoModelo');
        if (aviso) {
            aviso.hidden = !usandoModelosPadrao;
            aviso.innerHTML = 'Usando o texto embutido no sistema: os modelos ainda não estão no banco. '
                + 'Rode <strong>migracao/modelos_parecer.sql</strong> para poder editar o modelo padrão pela tela de modelos.';
        }

        // Toda edição feita no documento é guardada com o Auto.
        alvo.addEventListener('input', () => {
            const dados = dados25();
            dados.oficio_html = alvo.innerHTML;
            dados.oficio_editado = true;
        }, { once: false });
    }

    async function regerarOficioDoModelo() {
        if (dados25().oficio_editado && !confirm('Isso descarta as alterações feitas no ofício e volta ao texto do modelo. Deseja continuar?')) return;
        const dados = dados25();
        dados.oficio_editado = false;
        dados.oficio_html = '';
        await atualizarOficio(true);
    }

    async function aoMudarOpcao() {
        const opcao = opcaoMarcada();
        const config = OPCOES[opcao];
        destacarOpcao();
        if (!config) return;

        document.getElementById('e25BlocoTextoManual').hidden = !config.exigeTextoManual;
        document.getElementById('e25BlocoOficio').hidden = !config.temOficio;
        document.getElementById('e25BlocoMulta').hidden = !config.exigeNovaMulta;

        const mensagemArea = document.getElementById('e25Mensagem');
        const salvo = dados25();
        document.getElementById('e25BlocoMensagem').hidden = false;
        mensagemArea.value = (salvo.opcao === opcao && salvo.mensagem) ? salvo.mensagem : mensagemDaOpcao(opcao);

        const aviso = document.getElementById('e25PrazoAviso');
        if (aviso) {
            aviso.hidden = config.destino !== 31;
            if (config.destino === 31) {
                const plano = planoDePrazo(opcao);
                const mensagens = {
                    novo: () => `Ao avançar, o prazo recomeça: <strong>${plano.dias} dias</strong> a partir de hoje, vencendo em <strong>${new Date(somarDiasCorridos(plano.dias)).toLocaleDateString('pt-BR')}</strong>.`,
                    retoma: () => `Ao avançar, o prazo volta a correr de onde parou: <strong>${plano.dias} dia(s)</strong> restantes, vencendo em <strong>${new Date(somarDiasCorridos(plano.dias)).toLocaleDateString('pt-BR')}</strong>.`,
                    mantem: () => `Este Auto <strong>já está vencido há ${Math.abs(plano.dias)} dia(s)</strong> (venceu em ${new Date(plano.vencimento).toLocaleDateString('pt-BR')}). Não há prazo a retomar: ele segue vencido na Etapa 31.`,
                    sem: () => 'Este Auto <strong>não tem prazo registrado</strong>. Ele seguirá para a Etapa 31 sem prazo; confira antes de avançar.'
                };
                aviso.innerHTML = (mensagens[plano.tipo] || (() => ''))();
                const alerta = plano.tipo === 'mantem' || plano.tipo === 'sem';
                aviso.style.background = alerta ? '#fffbeb' : '#eff6ff';
                aviso.style.borderColor = alerta ? '#fde68a' : '#bfdbfe';
                aviso.style.color = alerta ? '#78350f' : '#1e40af';
            }
        }

        if (config.temOficio) await atualizarOficio(dados25().opcao !== opcao || !dados25().oficio_html);
    }

    function imprimirOficio() {
        const documento = document.getElementById('documentoOficioFazenda');
        if (!documento) {
            alert('Gere o ofício antes de imprimir.');
            return;
        }
        const janela = window.open('', '_blank');
        if (!janela) {
            alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.');
            return;
        }
        janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ofício à Fazenda</title></head><body>${documento.outerHTML}</body></html>`);
        janela.document.close();
        janela.focus();
        setTimeout(() => janela.print(), 400);
    }

    async function copiarMensagem() {
        const area = document.getElementById('e25Mensagem');
        const btn = document.getElementById('e25BtnCopiarMensagem');
        if (!area?.value.trim()) return;
        try {
            await navigator.clipboard.writeText(area.value);
        } catch (e) {
            area.select();
            document.execCommand('copy');
        }
        if (btn) {
            const original = btn.textContent;
            btn.textContent = 'Copiado ✓';
            setTimeout(() => { btn.textContent = original; }, 2000);
        }
    }

    function coletar() {
        return {
            opcao: opcaoMarcada(),
            texto_manual: document.getElementById('e25TextoManual')?.value || '',
            mensagem: document.getElementById('e25Mensagem')?.value || ''
        };
    }

    function gravar(form) {
        const dados = dados25();
        const oficioNaTela = document.getElementById('e25Oficio')?.innerHTML || '';
        if (OPCOES[form.opcao]?.temOficio && oficioNaTela.trim()) dados.oficio_html = oficioNaTela;
        Object.assign(dados, form, {
            auto_numero: auto?.numero || '',
            atualizado_em: new Date().toISOString(),
            atualizado_por: perfilAtual?.nome || ''
        });
        return dados;
    }

    async function salvarRascunho() {
        gravar(coletar());
        mostrarCarregamento('Salvando...');
        try {
            await P().persistirDados();
            ocultarCarregamento();
            alert('Salvo.');
        } catch (err) {
            ocultarCarregamento();
            console.error('[Etapa 25] Erro ao salvar:', err);
            alert('Erro ao salvar.');
        }
    }

    async function avancar() {
        if (!notificacaoAtual && P().autosNaEtapa(25).length) {
            alert('O cumprimento é por Auto de Infração. Abra o Auto na lista para seguir.');
            return;
        }

        const form = coletar();
        const config = OPCOES[form.opcao];
        if (!config) {
            alert('Escolha o desfecho (item 2).');
            return;
        }
        if (config.exigeTextoManual && !form.texto_manual.trim()) {
            alert('Escreva a justificativa da alteração de valor (item 3).');
            return;
        }
        if (config.exigeNovaMulta && (dados25().anexos || []).length === 0) {
            alert('Anexe a nova multa emitida pela Fazenda antes de avançar (item 6).');
            return;
        }

        mostrarCarregamento('Registrando o cumprimento...');
        try {
            const dados = gravar(form);
            if (!config.temOficio) dados.oficio_html = '';
            dados.data_cumprimento = new Date().toISOString();

            if (config.destino === 31) {
                const campos = await aplicarPrazoParaEtapa31(planoDePrazo(form.opcao));
                dados.dias_prazo = campos.prazo_dias;
            }

            await P().persistirDados();
            await moverProcessoParaEtapa(config.destino, `Cumprimento do despacho: ${config.rotulo}`);
        } catch (err) {
            ocultarCarregamento();
            console.error('[Etapa 25] Erro ao avançar:', err);
            alert('Erro ao registrar o cumprimento.');
        }
    }

    async function configurar() {
        const raiz = document.getElementById('etapa25Fazenda');
        if (!raiz || !processoAtual) return;

        if (!notificacaoAtual) {
            const naEtapa = P().autosNaEtapa(25);
            if (naEtapa.length) {
                P().renderizarListaDeAutos(raiz, naEtapa, 'O cumprimento é por Auto de Infração. Clique no Auto para seguir.');
                return;
            }
        }

        auto = P().montarAuto(notificacaoAtual);
        try {
            await carregarModelos();
        } catch (err) {
            console.error('[Etapa 25] Erro ao carregar modelos:', err);
        }
        renderizarResumo('e25Resumo');

        const salvo = dados25();
        if (salvo.opcao) {
            const radio = document.querySelector(`input[name="e25Opcao"][value="${salvo.opcao}"]`);
            if (radio) radio.checked = true;
        }
        const manual = document.getElementById('e25TextoManual');
        if (manual) manual.value = salvo.texto_manual || '';
        await aoMudarOpcao();

        document.querySelectorAll('input[name="e25Opcao"]').forEach(r => r.addEventListener('change', aoMudarOpcao));
        manual?.addEventListener('input', () => {
            clearTimeout(manual._t);
            // Enquanto o ofício não foi editado à mão, ele acompanha o texto digitado.
            manual._t = setTimeout(() => { if (!dados25().oficio_editado) atualizarOficio(true); }, 400);
        });
        document.getElementById('e25BtnAtualizarOficio')?.addEventListener('click', regerarOficioDoModelo);
        document.getElementById('e25BtnImprimirOficio')?.addEventListener('click', imprimirOficio);
        document.getElementById('e25BtnCopiarMensagem')?.addEventListener('click', copiarMensagem);
        document.getElementById('e25BtnSalvar')?.addEventListener('click', salvarRascunho);
        document.getElementById('e25BtnUnificado')?.addEventListener('click', () => window.ProcessoUnificado?.gerar('abrir', auto));
        document.getElementById('e25BtnBaixarUnificado')?.addEventListener('click', () => window.ProcessoUnificado?.gerar('download', auto));
        document.getElementById('e25BtnVerParecer')?.addEventListener('click', () => window.ProcessoUnificado?.verParecer(auto));
        document.getElementById('e25BtnVerDespacho')?.addEventListener('click', () => window.ProcessoUnificado?.verDespacho(auto));

        if (!P().podeEditar()) {
            raiz.querySelectorAll('input[type="radio"], textarea').forEach(el => {
                el.disabled = el.tagName === 'INPUT';
                el.readOnly = el.tagName === 'TEXTAREA';
            });
            ['e25BtnSalvar', 'e25BtnAtualizarOficio'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.hidden = true;
            });
        }
    }

    // ------------------------------------------------------------------ tela 31

    function html31(uploadHtml) {
        const cartao = 'background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;';
        const titulo = 'margin:0 0 4px 0; color:#1e293b; font-size:1rem; font-weight:700;';
        const sub = 'margin:0 0 12px 0; color:#64748b; font-size:0.85rem;';

        return `
            <div id="etapa31Pagamento" style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                    <div style="background:#ecfdf5; padding:10px; border-radius:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="1" y="4" width="22" height="16" rx="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700;">Comprovante de Pagamento</h3>
                        <p style="margin:2px 0 0 0; color:#64748b; font-size:0.85rem;">O prazo voltou a correr conforme a decisão da Etapa 25.</p>
                    </div>
                </div>

                <div id="e31Resumo" style="${cartao} margin-bottom:20px; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;"></div>

                <div id="e31Prazo" style="margin-bottom:20px;"></div>

                <div style="${cartao} margin-bottom:20px;">
                    <h4 style="${titulo}">Documentos do processo</h4>
                    <p style="${sub}">PDF oficial com capa, já com o parecer, o despacho do Secretário, o ofício à Fazenda e a resposta dada no protocolo.</p>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button type="button" id="e31BtnUnificado" class="btn-primary" style="padding:10px 18px;">Abrir processo unificado (PDF)</button>
                        <button type="button" id="e31BtnBaixarUnificado" style="padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#334155; font-weight:600; font-size:0.88rem; cursor:pointer;">Baixar processo unificado</button>
                        <button type="button" id="e31BtnVerParecer" style="padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#334155; font-weight:600; font-size:0.88rem; cursor:pointer;">Ver parecer jurídico</button>
                        <button type="button" id="e31BtnVerDespacho" style="padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#334155; font-weight:600; font-size:0.88rem; cursor:pointer;">Ver despacho do Secretário</button>
                    </div>
                </div>

                <div style="${cartao} margin-bottom:20px;">
                    <h4 style="${titulo}">Comprovante (opcional)</h4>
                    <p style="${sub}">Anexe o comprovante de pagamento, se houver.</p>
                    ${uploadHtml('Clique para selecionar ou arraste o comprovante aqui')}
                </div>

                <div style="${cartao}">
                    <h4 style="${titulo}">Realizou o pagamento? <span style="color:#ef4444;">*</span></h4>
                    <p style="${sub}">Sim encerra o processo (Etapa 29). Não segue para a certificação do vencimento (Etapa 28).</p>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <label class="e31-opcao" data-opcao="sim" style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-radius:10px; border:2px solid #e2e8f0; background:white; cursor:pointer; font-weight:600; color:#16a34a;">
                            <input type="radio" name="e31Pagou" value="sim" style="accent-color:#16a34a;"> Sim, pagou
                        </label>
                        <label class="e31-opcao" data-opcao="nao" style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-radius:10px; border:2px solid #e2e8f0; background:white; cursor:pointer; font-weight:600; color:#dc2626;">
                            <input type="radio" name="e31Pagou" value="nao" style="accent-color:#dc2626;"> Não pagou
                        </label>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                    <button type="button" id="e31BtnSalvar" class="btn-primary" style="padding:12px 24px;">Salvar rascunho</button>
                </div>
            </div>
        `;
    }

    function renderizarPrazo31() {
        const el = document.getElementById('e31Prazo');
        if (!el) return;
        const dados = dados31();
        const notif = notificacaoDoAuto();
        const vencimento = dados.data_vencimento || notif?.data_vencimento;
        const escolha25 = dados25().opcao;

        if (!vencimento) {
            el.innerHTML = '<div style="background:#fffbeb; border:1px solid #fde68a; color:#78350f; padding:12px 16px; border-radius:10px; font-size:0.9rem;">Este Auto não tem prazo registrado.</div>';
            return;
        }

        const faltam = Math.ceil((new Date(vencimento) - new Date()) / 86400000);
        const vencido = faltam <= 0;

        // Como o prazo chegou aqui, conforme a escolha da Etapa 25.
        const origemPorPlano = {
            novo: 'O prazo recomeçou com 30 dias na Etapa 25.',
            retoma: 'O prazo continuou de onde havia parado, conforme a Etapa 25.',
            mantem: 'Este Auto já estava vencido na Etapa 25: o prazo não foi reiniciado.',
            sem: 'A Etapa 25 não encontrou prazo registrado para este Auto.'
        };
        const origem = origemPorPlano[dados.prazo_plano]
            || (OPCOES[escolha25]?.prazo === 'reiniciar' ? origemPorPlano.novo : (escolha25 ? origemPorPlano.retoma : ''));

        el.innerHTML = `
            <div style="background:${vencido ? '#fef2f2' : '#ecfdf5'}; border:1px solid ${vencido ? '#fecaca' : '#a7f3d0'}; color:${vencido ? '#991b1b' : '#065f46'}; padding:14px 16px; border-radius:10px;">
                <div style="font-weight:700; font-size:0.95rem;">
                    Vencimento: ${new Date(vencimento).toLocaleDateString('pt-BR')}
                    — ${faltam < 0 ? `vencido há ${Math.abs(faltam)} dia(s)` : (faltam === 0 ? 'vence hoje' : `faltam ${faltam} dia(s)`)}
                </div>
                ${origem ? `<div style="font-size:0.85rem; margin-top:4px;">${origem}</div>` : ''}
            </div>
        `;
    }

    function destacarOpcao31() {
        const marcada = document.querySelector('input[name="e31Pagou"]:checked')?.value;
        document.querySelectorAll('.e31-opcao').forEach(label => {
            const ativa = label.dataset.opcao === marcada;
            const cor = label.dataset.opcao === 'sim' ? '#16a34a' : '#dc2626';
            label.style.borderColor = ativa ? cor : '#e2e8f0';
            label.style.background = ativa ? (label.dataset.opcao === 'sim' ? '#f0fdf4' : '#fef2f2') : 'white';
        });
    }

    async function salvarRascunho31() {
        const dados = dados31();
        dados.pagou = document.querySelector('input[name="e31Pagou"]:checked')?.value || '';
        mostrarCarregamento('Salvando...');
        try {
            await P().persistirDados();
            ocultarCarregamento();
            alert('Salvo.');
        } catch (err) {
            ocultarCarregamento();
            console.error('[Etapa 31] Erro ao salvar:', err);
            alert('Erro ao salvar.');
        }
    }

    async function avancar31() {
        if (!notificacaoAtual && P().autosNaEtapa(31).length) {
            alert('O pagamento é por Auto de Infração. Abra o Auto na lista para seguir.');
            return;
        }

        const pagou = document.querySelector('input[name="e31Pagou"]:checked')?.value || '';
        if (!pagou) {
            alert('Informe se o pagamento foi realizado.');
            return;
        }

        mostrarCarregamento('Registrando...');
        try {
            const dados = dados31();
            dados.pagou = pagou;
            dados.registrado_em = new Date().toISOString();
            dados.registrado_por = perfilAtual?.nome || '';
            await P().persistirDados();

            const destino = pagou === 'sim' ? 29 : 28;
            const motivo = pagou === 'sim' ? 'Pagamento realizado' : 'Pagamento não realizado';
            await moverProcessoParaEtapa(destino, motivo);
        } catch (err) {
            ocultarCarregamento();
            console.error('[Etapa 31] Erro ao avançar:', err);
            alert('Erro ao registrar o pagamento.');
        }
    }

    async function configurar31() {
        const raiz = document.getElementById('etapa31Pagamento');
        if (!raiz || !processoAtual) return;

        if (!notificacaoAtual) {
            const naEtapa = P().autosNaEtapa(31);
            if (naEtapa.length) {
                P().renderizarListaDeAutos(raiz, naEtapa, 'O pagamento é por Auto de Infração. Clique no Auto para seguir.');
                return;
            }
        }

        auto = P().montarAuto(notificacaoAtual);
        renderizarResumo('e31Resumo');
        renderizarPrazo31();

        const salvo = dados31();
        if (salvo.pagou) {
            const radio = document.querySelector(`input[name="e31Pagou"][value="${salvo.pagou}"]`);
            if (radio) radio.checked = true;
        }
        destacarOpcao31();

        document.querySelectorAll('input[name="e31Pagou"]').forEach(r => r.addEventListener('change', destacarOpcao31));
        document.getElementById('e31BtnSalvar')?.addEventListener('click', salvarRascunho31);
        document.getElementById('e31BtnUnificado')?.addEventListener('click', () => window.ProcessoUnificado?.gerar('abrir', auto));
        document.getElementById('e31BtnBaixarUnificado')?.addEventListener('click', () => window.ProcessoUnificado?.gerar('download', auto));
        document.getElementById('e31BtnVerParecer')?.addEventListener('click', () => window.ProcessoUnificado?.verParecer(auto));
        document.getElementById('e31BtnVerDespacho')?.addEventListener('click', () => window.ProcessoUnificado?.verDespacho(auto));

        if (!P().podeEditar()) {
            raiz.querySelectorAll('input[type="radio"]').forEach(el => { el.disabled = true; });
            const btn = document.getElementById('e31BtnSalvar');
            if (btn) btn.hidden = true;
        }
    }

    window.Etapa25 = { html, configurar, avancar };
    window.Etapa31 = { html: html31, configurar: configurar31, avancar: avancar31 };
})();
