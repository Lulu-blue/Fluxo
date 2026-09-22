/* ============================================================================
   etapa19_parecer.js — Etapa 19: Parecer Jurídico
   ----------------------------------------------------------------------------
   O jurídico anexa ou cola a defesa, escolhe a decisão (deferido, indeferido
   ou redução de 50%, conforme a infração) e recebe o texto do parecer já
   montado a partir dos modelos da tabela modelos_parecer
   (migracao/modelos_parecer.sql). O texto fica editável e pode ser copiado.

   Depende das globais do etapa.js: processoAtual, notificacaoAtual,
   perfilAtual, supabaseClient, mostrarCarregamento, ocultarCarregamento,
   moverProcessoParaEtapa, atualizarNotificacaoNoBanco, extrairTextoDoArquivo,
   obterNotificacoesProcesso, obterDispositivosDoProcesso,
   podeGerenciarEtapaAtual.
   ============================================================================ */

(function () {
    'use strict';

    const DESTINOS = [
        { etapa: 22, rotulo: 'Encaminhar à Gerência', detalhe: 'Etapa 22 — Gerente convocado pelo Jurídico' },
        { etapa: 21, rotulo: 'Devolver ao Fiscal', detalhe: 'Etapa 21 — Fiscal convocado pelo Jurídico' },
        { etapa: 24, rotulo: 'Secretário para Despacho', detalhe: 'Etapa 24 — Secretário despacha' }
    ];

    const DECISOES = {
        deferimento: { rotulo: 'Deferido', cor: '#16a34a', fundo: '#f0fdf4' },
        indeferimento: { rotulo: 'Indeferido', cor: '#dc2626', fundo: '#fef2f2' },
        reducao_50: { rotulo: 'Redução de 50%', cor: '#2563eb', fundo: '#eff6ff' },
        deferimento_parcial: { rotulo: 'Deferido parcialmente (afastar reincidência)', cor: '#7c3aed', fundo: '#f5f3ff' },
        diligencia: { rotulo: 'Solicitar complementação documental', cor: '#b45309', fundo: '#fffbeb' }
    };

    // Texto usado quando um dado do processo não existe: vira pendência
    // entre colchetes, igual às instruções dos modelos.
    const MARCADOR_PENDENTE = {
        AUTO_NUMERO: '[NÚMERO/ANO]',
        DEFENDENTE: '[NOME]',
        ENDERECO: '[ENDEREÇO]',
        INSCRICAO: '[NÚMERO DA INSCRIÇÃO]',
        DATA_CONSTATACAO: '[DATA]',
        ASSINANTE_NOME: '[NOME DO ASSINANTE]',
        ASSINANTE_OAB: '[OAB]'
    };

    let modelos = [];
    let assinatura = null;
    let autoSelecionado = null;
    let textoModeloAplicado = '';

    // ------------------------------------------------------------------ util

    function escaparHtml(txt) {
        return String(txt ?? '').replace(/[&<>"']/g, ch => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
    }

    function numeroEtapaDaNotificacao(n) {
        const rel = Array.isArray(n.etapas) ? n.etapas[0] : n.etapas;
        return parseInt(rel?.numero || n.etapa_atual || n.etapa_atual_id || 0, 10);
    }

    // Etapa real do processo no banco (a página troca etapa_atual pela da
    // notificação aberta, mas não processoAtual.etapas).
    function numeroEtapaRealDoProcesso() {
        const rel = Array.isArray(processoAtual.etapas) ? processoAtual.etapas[0] : processoAtual.etapas;
        return parseInt(rel?.numero || 0, 10);
    }

    // Mesmo lugar onde o etapa.js guarda os anexos genéricos da etapa.
    function dadosEtapa19() {
        const alvo = notificacaoAtual
            ? (notificacaoAtual.dados = notificacaoAtual.dados || {})
            : (processoAtual.campos = processoAtual.campos || {});
        alvo.etapa19 = alvo.etapa19 || {};
        return alvo.etapa19;
    }

    async function persistirDados() {
        if (notificacaoAtual) {
            await atualizarNotificacaoNoBanco(notificacaoAtual.id, { dados: notificacaoAtual.dados });
            return;
        }
        processoAtual.dados = processoAtual.dados || {};
        processoAtual.dados.campos = processoAtual.campos;
        const { error } = await supabaseClient
            .from('processos')
            .update({ dados: processoAtual.dados })
            .eq('id', processoAtual.id);
        if (error) throw error;
    }

    function podeEditar() {
        return typeof podeGerenciarEtapaAtual === 'function' && podeGerenciarEtapaAtual();
    }

    // ------------------------------------------------------------------ dados

    function montarAuto(notificacao) {
        const descricao = notificacao?.descricao
            || (obterDispositivosDoProcesso(processoAtual) || [])[0]
            || '';
        const numero = notificacao?.dados?.etapa14?.numero_auto_infracao
            || processoAtual.campos?.etapa14?.numero_auto_infracao
            || processoAtual.dados?.etapa14?.numero_auto_infracao
            || notificacao?.numero
            || '';
        return {
            notificacao: notificacao || null,
            numero,
            descricao,
            codigo: window.extrairCodigoSubprocesso ? window.extrairCodigoSubprocesso(descricao) : ''
        };
    }

    // Autos (notificações) do processo que estão na Etapa 19.
    function autosNaEtapa19() {
        return obterNotificacoesProcesso(processoAtual).filter(n => numeroEtapaDaNotificacao(n) === 19);
    }

    async function carregarModelos() {
        const { data, error } = await supabaseClient
            .from('modelos_parecer')
            .select('*')
            .eq('ativo', true)
            .order('ordem', { ascending: true });
        if (error) throw error;
        modelos = data || [];

        const { data: cfg } = await supabaseClient
            .from('configuracoes_parecer')
            .select('*')
            .limit(1)
            .maybeSingle();
        assinatura = cfg || null;
    }

    function valoresMarcadores(auto) {
        const d = processoAtual.dados || {};
        const cont = d.contribuinte || {};
        const imv = d.imovel || {};
        const fisc = d.fiscal || {};

        const partesEndereco = [
            imv.logradouro || imv.rua,
            imv.numero ? `nº ${imv.numero}` : '',
            imv.bairro ? `Bairro ${imv.bairro}` : ''
        ].filter(Boolean);

        return {
            AUTO_NUMERO: auto?.numero || '',
            DEFENDENTE: cont.nome || processoAtual.campos?.contNome || '',
            ENDERECO: partesEndereco.length ? `${partesEndereco.join(', ')}, Divinópolis/MG` : '',
            INSCRICAO: imv.inscricao || '',
            DATA_CONSTATACAO: (window.formatarDataVistoriaRobusta && window.formatarDataVistoriaRobusta(fisc.data_vistoria || fisc.data)) || '',
            DATA_HOJE: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }),
            ASSINANTE_NOME: assinatura?.assinante_nome || perfilAtual?.nome || '',
            ASSINANTE_OAB: assinatura?.assinante_oab || ''
        };
    }

    function preencherModelo(texto, auto) {
        const valores = valoresMarcadores(auto);
        return String(texto || '').replace(/\{\{([A-Z_]+)\}\}/g, (marcador, chave) =>
            valores[chave] || MARCADOR_PENDENTE[chave] || marcador
        );
    }

    function listarPendencias(texto) {
        return String(texto || '').match(/\[[^\[\]\n]+\]/g) || [];
    }

    // Decisões disponíveis para o código da infração. Decisão sem modelo
    // próprio usa o 'parecer_livre' (escrito à mão).
    function opcoesDecisao(codigo) {
        const doCodigo = modelos.filter(m => (m.codigos_infracao || []).includes(codigo));
        const livre = modelos.find(m => m.chave === 'parecer_livre') || null;
        const modeloDe = decisao => doCodigo.find(m => m.decisao === decisao) || null;

        const opcoes = [
            { decisao: 'deferimento', modelo: modeloDe('deferimento') || livre },
            { decisao: 'indeferimento', modelo: modeloDe('indeferimento') || livre }
        ];
        if (modeloDe('reducao_50')) opcoes.push({ decisao: 'reducao_50', modelo: modeloDe('reducao_50') });
        if (modeloDe('deferimento_parcial')) opcoes.push({ decisao: 'deferimento_parcial', modelo: modeloDe('deferimento_parcial') });

        const complementacao = modelos.find(m => m.chave === 'complementacao_documental');
        if (complementacao) opcoes.push({ decisao: 'diligencia', modelo: complementacao });

        return opcoes;
    }

    // ------------------------------------------------------------------ HTML

    function html(uploadHtml) {
        const cartao = 'background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;';
        const titulo = 'margin:0 0 4px 0; color:#1e293b; font-size:1rem; font-weight:700;';
        const sub = 'margin:0 0 12px 0; color:#64748b; font-size:0.85rem;';
        const botaoSec = 'padding:8px 14px; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#334155; font-weight:600; font-size:0.85rem; cursor:pointer;';

        return `
            <div id="etapa19Parecer" style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                    <div style="background:#f3e8ff; padding:10px; border-radius:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700;">Parecer Jurídico</h3>
                        <p style="margin:2px 0 0 0; color:#64748b; font-size:0.85rem;">Anexe ou cole a defesa, escolha a decisão e revise o texto do parecer.</p>
                    </div>
                </div>

                <div id="e19Erro" hidden style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:0.9rem;"></div>

                <div id="e19Resumo" style="${cartao} margin-bottom:20px; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;"></div>

                <div style="display:grid; grid-template-columns:1fr; gap:20px;">
                    <div style="${cartao}">
                        <h4 style="${titulo}">1. Defesa</h4>
                        <p style="${sub}">Anexe o arquivo da defesa ou cole o texto abaixo. O texto de PDFs anexados é copiado automaticamente para o campo.</p>
                        ${uploadHtml('Clique para selecionar ou arraste a defesa aqui')}
                        <label for="e19TextoDefesa" style="display:block; font-size:0.9rem; font-weight:600; color:#334155; margin:4px 0 8px 0;">Texto da defesa</label>
                        <textarea id="e19TextoDefesa" rows="7" placeholder="Cole aqui o texto da defesa..." style="width:100%; box-sizing:border-box; padding:12px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.92rem; color:#1e293b; resize:vertical; font-family:inherit;"></textarea>
                        <div id="e19AvisoPdf" hidden style="margin-top:8px; font-size:0.85rem; color:#92400e;"></div>
                    </div>

                    <div style="${cartao}">
                        <h4 style="${titulo}">2. Decisão <span style="color:#ef4444;">*</span></h4>
                        <p id="e19InfoInfracao" style="${sub}"></p>
                        <div id="e19Decisoes" style="display:flex; flex-wrap:wrap; gap:10px;"></div>
                        <div id="e19AvisoLivre" hidden style="margin-top:12px; font-size:0.85rem; color:#475569; background:#f1f5f9; padding:10px 12px; border-radius:8px;">
                            Não há modelo para esta decisão nesta infração. O texto abre com a estrutura básica para ser escrito à mão.
                        </div>
                    </div>

                    <div style="${cartao}">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
                            <div>
                                <h4 style="${titulo}">3. Texto do parecer</h4>
                                <p style="margin:0; color:#64748b; font-size:0.85rem;">Edite à vontade. Os trechos entre [colchetes] precisam ser preenchidos.</p>
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <button type="button" id="e19BtnCopiar" style="padding:8px 16px; border-radius:8px; border:none; background:#7c3aed; color:white; font-weight:600; font-size:0.85rem; cursor:pointer;">Copiar texto</button>
                                <button type="button" id="e19BtnReaplicar" style="${botaoSec}">Recarregar modelo</button>
                                <button type="button" id="e19BtnEditarModelo" style="${botaoSec}">Editar modelo padrão</button>
                            </div>
                        </div>
                        <textarea id="e19TextoParecer" rows="18" placeholder="Escolha a decisão acima para carregar o modelo do parecer." style="width:100%; box-sizing:border-box; padding:14px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; line-height:1.55; color:#1e293b; resize:vertical; font-family:inherit;"></textarea>
                        <div id="e19Pendencias" hidden style="margin-top:10px; background:#fffbeb; border:1px solid #fde68a; color:#78350f; padding:10px 12px; border-radius:8px; font-size:0.85rem;"></div>
                    </div>

                    <div style="${cartao}">
                        <h4 style="${titulo}">4. Encaminhamento <span style="color:#ef4444;">*</span></h4>
                        <p style="${sub}">Para onde o processo segue depois do parecer. Depois de escolher, use o botão de avançar etapa.</p>
                        <div id="e19Destinos" style="display:flex; flex-direction:column; gap:8px;">
                            ${DESTINOS.map(d => `
                                <label style="display:flex; align-items:center; gap:10px; background:white; border:1px solid #cbd5e1; border-radius:8px; padding:10px 14px; cursor:pointer;">
                                    <input type="radio" name="e19Destino" value="${d.etapa}">
                                    <span><strong style="color:#1e293b;">${d.rotulo}</strong><br><span style="font-size:0.82rem; color:#64748b;">${d.detalhe}</span></span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                    <button type="button" id="e19BtnSalvar" class="btn-primary" style="padding:12px 24px;">Salvar rascunho</button>
                </div>
            </div>
        `;
    }

    // ------------------------------------------------------------------ tela

    function mostrarErro(msg) {
        const el = document.getElementById('e19Erro');
        if (!el) return;
        el.hidden = !msg;
        el.innerHTML = msg || '';
    }

    function renderizarResumo() {
        const el = document.getElementById('e19Resumo');
        if (!el) return;
        const v = valoresMarcadores(autoSelecionado);
        const descricao = window.obterDescricaoInfracao
            ? window.obterDescricaoInfracao(autoSelecionado?.descricao)
            : autoSelecionado?.descricao;
        const campos = [
            ['Auto de Infração', v.AUTO_NUMERO],
            ['Infração', descricao],
            ['Autuado', v.DEFENDENTE],
            ['Imóvel', v.ENDERECO],
            ['Inscrição imobiliária', v.INSCRICAO],
            ['Constatação', v.DATA_CONSTATACAO]
        ];
        el.innerHTML = campos.map(([rotulo, valor]) => `
            <div>
                <div style="font-size:0.75rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.03em;">${rotulo}</div>
                <div style="font-size:0.92rem; color:${valor ? '#1e293b' : '#b45309'}; font-weight:500; margin-top:2px;">${valor ? escaparHtml(valor) : 'Não informado'}</div>
            </div>
        `).join('');
    }

    function renderizarDecisoes(decisaoSalva) {
        const el = document.getElementById('e19Decisoes');
        const info = document.getElementById('e19InfoInfracao');
        if (!el) return;

        const codigo = autoSelecionado?.codigo || '';
        if (info) {
            info.textContent = codigo
                ? `Infração identificada pelo código ${codigo}. As opções abaixo seguem os modelos cadastrados para ela.`
                : 'Não foi possível identificar o código da infração. Os pareceres serão escritos a partir da estrutura básica.';
        }

        el.innerHTML = opcoesDecisao(codigo).map(op => {
            const d = DECISOES[op.decisao];
            return `
                <label class="e19-opcao" data-decisao="${op.decisao}" style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-radius:10px; border:2px solid #e2e8f0; background:white; cursor:pointer; font-weight:600; color:${d.cor};">
                    <input type="radio" name="e19Decisao" value="${op.decisao}" ${op.decisao === decisaoSalva ? 'checked' : ''} style="accent-color:${d.cor};">
                    ${d.rotulo}
                </label>
            `;
        }).join('');

        destacarDecisao();
        el.querySelectorAll('input[name="e19Decisao"]').forEach(radio => {
            radio.addEventListener('change', () => aoMudarDecisao(radio.value));
        });
    }

    function destacarDecisao() {
        const marcada = document.querySelector('input[name="e19Decisao"]:checked')?.value;
        document.querySelectorAll('.e19-opcao').forEach(label => {
            const d = DECISOES[label.dataset.decisao];
            const ativa = label.dataset.decisao === marcada;
            label.style.borderColor = ativa ? d.cor : '#e2e8f0';
            label.style.background = ativa ? d.fundo : 'white';
        });
    }

    function modeloDaDecisao(decisao) {
        return opcoesDecisao(autoSelecionado?.codigo || '').find(op => op.decisao === decisao)?.modelo || null;
    }

    function textoFoiEditado() {
        const atual = document.getElementById('e19TextoParecer')?.value || '';
        return atual.trim() !== '' && atual !== textoModeloAplicado;
    }

    function aplicarModelo(decisao) {
        const modelo = modeloDaDecisao(decisao);
        const area = document.getElementById('e19TextoParecer');
        const avisoLivre = document.getElementById('e19AvisoLivre');
        if (!area) return;

        if (avisoLivre) avisoLivre.hidden = !(modelo && modelo.chave === 'parecer_livre');
        if (!modelo) {
            area.value = '';
            textoModeloAplicado = '';
            mostrarErro('Nenhum modelo de parecer encontrado. Verifique se o script <strong>migracao/modelos_parecer.sql</strong> foi executado no banco.');
        } else {
            area.value = preencherModelo(modelo.texto, autoSelecionado);
            textoModeloAplicado = area.value;
        }
        atualizarPendencias();
    }

    function aoMudarDecisao(decisao) {
        if (textoFoiEditado() && !confirm('O texto do parecer foi editado. Trocar a decisão substitui o texto pelo modelo da nova decisão. Deseja continuar?')) {
            const anterior = dadosEtapa19().decisao;
            const radioAnterior = document.querySelector(`input[name="e19Decisao"][value="${anterior}"]`);
            if (radioAnterior) radioAnterior.checked = true;
            else document.querySelectorAll('input[name="e19Decisao"]').forEach(r => { r.checked = false; });
            destacarDecisao();
            return;
        }
        dadosEtapa19().decisao = decisao;
        destacarDecisao();
        aplicarModelo(decisao);
    }

    function atualizarPendencias() {
        const el = document.getElementById('e19Pendencias');
        if (!el) return;
        const pendencias = listarPendencias(document.getElementById('e19TextoParecer')?.value);
        el.hidden = pendencias.length === 0;
        if (pendencias.length) {
            const lista = pendencias.slice(0, 8).map(p => `<li>${escaparHtml(p)}</li>`).join('');
            const resto = pendencias.length > 8 ? `<li>… e mais ${pendencias.length - 8}</li>` : '';
            el.innerHTML = `<strong>${pendencias.length} trecho(s) entre colchetes para preencher:</strong><ul style="margin:6px 0 0 18px; padding:0;">${lista}${resto}</ul>`;
        }
    }

    async function copiarTexto() {
        const area = document.getElementById('e19TextoParecer');
        const btn = document.getElementById('e19BtnCopiar');
        if (!area || !area.value.trim()) {
            alert('Não há texto de parecer para copiar.');
            return;
        }
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

    function recarregarModelo() {
        const decisao = document.querySelector('input[name="e19Decisao"]:checked')?.value;
        if (!decisao) {
            alert('Escolha a decisão primeiro.');
            return;
        }
        if (textoFoiEditado() && !confirm('Isso descarta as alterações feitas no texto e recarrega o modelo. Deseja continuar?')) return;
        aplicarModelo(decisao);
    }

    // Anexos em PDF: copia o texto para o campo da defesa. Roda junto com o
    // upload genérico do etapa.js, que guarda o arquivo em etapa19.anexos.
    async function extrairTextoDosAnexos(evento) {
        const arquivos = Array.from(evento.target.files || []);
        const area = document.getElementById('e19TextoDefesa');
        const aviso = document.getElementById('e19AvisoPdf');
        if (!area || !arquivos.length) return;

        const semTexto = [];
        for (const arquivo of arquivos) {
            const ehPdf = arquivo.type === 'application/pdf' || arquivo.name.toLowerCase().endsWith('.pdf');
            if (!ehPdf) continue;
            const texto = (await extrairTextoDoArquivo(arquivo) || '').replace(/\s+/g, ' ').trim();
            if (!texto) {
                semTexto.push(arquivo.name);
                continue;
            }
            const separador = area.value.trim() ? '\n\n' : '';
            area.value += `${separador}--- ${arquivo.name} ---\n${texto}`;
        }
        if (aviso) {
            aviso.hidden = semTexto.length === 0;
            aviso.textContent = semTexto.length
                ? `Não foi possível ler o texto de: ${semTexto.join(', ')}. O arquivo parece ser digitalizado (imagem). Cole o texto manualmente, se precisar dele.`
                : '';
        }
    }

    // ------------------------------------------------------------ modelo padrão

    function abrirEdicaoModelo() {
        const decisao = document.querySelector('input[name="e19Decisao"]:checked')?.value;
        const modelo = decisao ? modeloDaDecisao(decisao) : null;
        if (!modelo) {
            alert('Escolha a decisão para editar o modelo correspondente.');
            return;
        }

        let modal = document.getElementById('e19ModalModelo');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'e19ModalModelo';
            modal.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.6); backdrop-filter:blur(3px); z-index:9998; display:flex; align-items:center; justify-content:center; padding:24px;';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="background:white; border-radius:18px; padding:24px; max-width:860px; width:100%; max-height:92vh; overflow-y:auto; box-shadow:0 20px 50px rgba(0,0,0,0.25);">
                <h2 style="margin:0 0 4px 0; font-size:1.2rem; color:#1e293b;">Editar modelo padrão</h2>
                <p style="margin:0 0 4px 0; color:#475569; font-size:0.92rem; font-weight:600;">${escaparHtml(modelo.titulo)}</p>
                <p style="margin:0 0 14px 0; color:#64748b; font-size:0.85rem;">
                    A alteração vale para <strong>todos os próximos pareceres</strong> com este modelo.
                    Marcadores preenchidos pelo sistema: {{AUTO_NUMERO}}, {{DEFENDENTE}}, {{ENDERECO}}, {{INSCRICAO}},
                    {{DATA_CONSTATACAO}}, {{DATA_HOJE}}, {{ASSINANTE_NOME}}, {{ASSINANTE_OAB}}.
                </p>
                <textarea id="e19TextoModelo" rows="20" style="width:100%; box-sizing:border-box; padding:12px; border-radius:8px; border:1px solid #cbd5e1; font-size:0.9rem; line-height:1.5; font-family:inherit; resize:vertical;">${escaparHtml(modelo.texto)}</textarea>
                <div style="display:flex; justify-content:space-between; gap:10px; margin-top:16px; flex-wrap:wrap;">
                    <button type="button" id="e19BtnRestaurarModelo" style="padding:10px 16px; border-radius:8px; border:1px solid #fecaca; background:#fef2f2; color:#dc2626; font-weight:600; cursor:pointer;">Restaurar modelo original</button>
                    <div style="display:flex; gap:10px;">
                        <button type="button" id="e19BtnCancelarModelo" style="padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#334155; font-weight:600; cursor:pointer;">Cancelar</button>
                        <button type="button" id="e19BtnSalvarModelo" class="btn-primary" style="padding:10px 18px;">Salvar modelo</button>
                    </div>
                </div>
            </div>
        `;
        modal.style.display = 'flex';

        const fechar = () => { modal.style.display = 'none'; };
        modal.querySelector('#e19BtnCancelarModelo').addEventListener('click', fechar);
        modal.querySelector('#e19BtnRestaurarModelo').addEventListener('click', () => {
            if (confirm('Substituir o texto pelo modelo original? A alteração só é gravada ao clicar em "Salvar modelo".')) {
                modal.querySelector('#e19TextoModelo').value = modelo.texto_original;
            }
        });
        modal.querySelector('#e19BtnSalvarModelo').addEventListener('click', async () => {
            const novoTexto = modal.querySelector('#e19TextoModelo').value;
            if (!novoTexto.trim()) {
                alert('O modelo não pode ficar vazio.');
                return;
            }
            mostrarCarregamento('Salvando modelo...');
            const { error } = await supabaseClient
                .from('modelos_parecer')
                .update({ texto: novoTexto, atualizado_por: perfilAtual?.id || null, updated_at: new Date().toISOString() })
                .eq('id', modelo.id);
            ocultarCarregamento();
            if (error) {
                console.error('[Etapa 19] Erro ao salvar modelo:', error);
                alert('Erro ao salvar o modelo.');
                return;
            }
            modelo.texto = novoTexto;
            fechar();
            if (confirm('Modelo salvo. Deseja recarregar o texto deste parecer com o modelo atualizado?')) {
                aplicarModelo(decisao);
            }
        });
    }

    // ------------------------------------------------------------ salvar/avançar

    function coletarFormulario() {
        return {
            decisao: document.querySelector('input[name="e19Decisao"]:checked')?.value || '',
            destino: parseInt(document.querySelector('input[name="e19Destino"]:checked')?.value || '0', 10) || null,
            defesa_texto: document.getElementById('e19TextoDefesa')?.value || '',
            parecer_texto: document.getElementById('e19TextoParecer')?.value || ''
        };
    }

    function gravarNoObjeto(form) {
        const dados = dadosEtapa19();
        const modelo = form.decisao ? modeloDaDecisao(form.decisao) : null;
        Object.assign(dados, form, {
            modelo_chave: modelo?.chave || null,
            auto_numero: autoSelecionado?.numero || '',
            auto_notificacao_id: autoSelecionado?.notificacao?.id || null,
            codigo_infracao: autoSelecionado?.codigo || '',
            atualizado_em: new Date().toISOString(),
            atualizado_por: perfilAtual?.nome || ''
        });
        return dados;
    }

    async function salvarRascunho() {
        gravarNoObjeto(coletarFormulario());
        mostrarCarregamento('Salvando parecer...');
        try {
            await persistirDados();
            ocultarCarregamento();
            alert('Parecer salvo.');
        } catch (err) {
            ocultarCarregamento();
            console.error('[Etapa 19] Erro ao salvar:', err);
            alert('Erro ao salvar o parecer.');
        }
    }

    async function avancar() {
        if (!notificacaoAtual && autosNaEtapa19().length) {
            alert('O parecer é emitido por Auto de Infração. Abra o Auto na lista para emitir o parecer.');
            return;
        }
        const form = coletarFormulario();

        if (!form.decisao) {
            alert('Escolha a decisão do parecer (item 2).');
            return;
        }
        if (!form.parecer_texto.trim()) {
            alert('O texto do parecer está vazio (item 3).');
            return;
        }
        if (!form.destino) {
            alert('Escolha para onde o processo segue (item 4).');
            return;
        }
        const pendencias = listarPendencias(form.parecer_texto);
        if (pendencias.length && !confirm(`O parecer ainda tem ${pendencias.length} trecho(s) entre colchetes sem preencher. Deseja avançar mesmo assim?`)) {
            return;
        }

        const destino = DESTINOS.find(d => d.etapa === form.destino);
        const motivo = `Parecer Jurídico: ${DECISOES[form.decisao].rotulo} — ${destino.rotulo}`;

        mostrarCarregamento('Salvando parecer e avançando...');
        try {
            const dados = gravarNoObjeto(form);
            dados.data_parecer = new Date().toISOString();
            await persistirDados();

            // Com o Auto aberto, moverProcessoParaEtapa move só a notificação:
            // o processo continua no painel da Etapa 18, porque pode ter outros
            // Autos (ou NPs) em etapas diferentes. Processo que a versão antiga
            // da Etapa 18 levou para a 19 volta para o painel da 18.
            if (notificacaoAtual && numeroEtapaRealDoProcesso() === 19) {
                const { data: etapa18 } = await supabaseClient
                    .from('etapas')
                    .select('id')
                    .eq('numero', 18)
                    .maybeSingle();
                if (etapa18) {
                    const { error } = await supabaseClient
                        .from('processos')
                        .update({ etapa_atual_id: etapa18.id })
                        .eq('id', processoAtual.id);
                    if (error) throw error;
                }
            }

            await moverProcessoParaEtapa(form.destino, motivo);
        } catch (err) {
            ocultarCarregamento();
            console.error('[Etapa 19] Erro ao avançar:', err);
            alert('Erro ao salvar o parecer e avançar a etapa.');
        }
    }

    // ------------------------------------------------------------ inicialização

    // O parecer é de um Auto: aberta pelo processo, a etapa só lista os
    // Autos que estão na 19 para abrir cada um (o processo fica na 18).
    function renderizarListaDeAutos(raiz, notificacoes) {
        const itens = notificacoes.map(n => {
            const auto = montarAuto(n);
            const descricao = window.obterDescricaoInfracao ? window.obterDescricaoInfracao(auto.descricao) : auto.descricao;
            const rascunho = n.dados?.etapa19?.parecer_texto
                ? '<span style="background:#fef9c3; color:#854d0e; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Rascunho salvo</span>'
                : '<span style="background:#F7F4EA; color:#475569; border:1px solid #DED9E2; padding:3px 10px; border-radius:10px; font-size:0.78rem; font-weight:600;">Aguardando parecer</span>';
            return `
                <a href="etapa.html?processo=${encodeURIComponent(processoAtual.id)}&notificacao=${encodeURIComponent(n.id)}"
                   style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; background:white; border:2px solid #80A1D4; border-radius:14px; padding:16px 18px; text-decoration:none;">
                    <div>
                        <div style="font-size:0.85rem; color:#64748b; font-weight:700; margin-bottom:2px;">Auto de Infração: ${escaparHtml(auto.numero || 'Sem número')}</div>
                        <div style="font-size:0.95rem; color:#0f172a; font-weight:600;">${escaparHtml(descricao)}</div>
                    </div>
                    ${rascunho}
                </a>
            `;
        }).join('');

        raiz.innerHTML = `
            <h3 style="margin:0 0 4px 0; color:#1e293b; font-size:1.15rem; font-weight:700;">Parecer Jurídico</h3>
            <p style="margin:0 0 16px 0; color:#64748b; font-size:0.9rem;">O parecer é emitido por Auto de Infração. Clique no Auto para abrir a análise da defesa.</p>
            <div style="display:flex; flex-direction:column; gap:12px;">${itens}</div>
        `;
    }

    function aplicarSomenteLeitura() {
        ['e19TextoDefesa', 'e19TextoParecer'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.readOnly = true;
        });
        document.querySelectorAll('#etapa19Parecer input[type="radio"]').forEach(el => { el.disabled = true; });
        ['e19BtnSalvar', 'e19BtnEditarModelo', 'e19BtnReaplicar'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.hidden = true;
        });
        const upload = document.querySelector('#etapa19Parecer .anexo-upload-wrapper #areaDropGenerico');
        if (upload) upload.hidden = true;
    }

    async function configurar() {
        const raiz = document.getElementById('etapa19Parecer');
        if (!raiz || !processoAtual) return;

        if (!notificacaoAtual) {
            const naEtapa = autosNaEtapa19();
            if (naEtapa.length) {
                renderizarListaDeAutos(raiz, naEtapa);
                return;
            }
        }

        try {
            await carregarModelos();
        } catch (err) {
            console.error('[Etapa 19] Erro ao carregar modelos:', err);
            mostrarErro('Não foi possível carregar os modelos de parecer. Verifique se o script <strong>migracao/modelos_parecer.sql</strong> foi executado no banco.');
        }

        // Sem notificação aberta e sem Autos na 19: processo antigo sem
        // notificações, em que o próprio processo é o Auto.
        autoSelecionado = montarAuto(notificacaoAtual);
        const dados = dadosEtapa19();
        renderizarResumo();
        renderizarDecisoes(dados.decisao || '');

        // Restaura o rascunho salvo; sem rascunho, carrega o modelo da decisão salva.
        const areaDefesa = document.getElementById('e19TextoDefesa');
        const areaParecer = document.getElementById('e19TextoParecer');
        if (areaDefesa) areaDefesa.value = dados.defesa_texto || '';
        if (dados.parecer_texto) {
            areaParecer.value = dados.parecer_texto;
            const modelo = dados.decisao ? modeloDaDecisao(dados.decisao) : null;
            textoModeloAplicado = modelo ? preencherModelo(modelo.texto, autoSelecionado) : '';
            const avisoLivre = document.getElementById('e19AvisoLivre');
            if (avisoLivre) avisoLivre.hidden = !(modelo && modelo.chave === 'parecer_livre');
        } else if (dados.decisao) {
            aplicarModelo(dados.decisao);
        }
        atualizarPendencias();

        if (dados.destino) {
            const radioDestino = document.querySelector(`input[name="e19Destino"][value="${dados.destino}"]`);
            if (radioDestino) radioDestino.checked = true;
        }

        areaParecer?.addEventListener('input', atualizarPendencias);
        document.getElementById('e19BtnCopiar')?.addEventListener('click', copiarTexto);
        document.getElementById('e19BtnReaplicar')?.addEventListener('click', recarregarModelo);
        document.getElementById('e19BtnEditarModelo')?.addEventListener('click', abrirEdicaoModelo);
        document.getElementById('e19BtnSalvar')?.addEventListener('click', salvarRascunho);
        document.getElementById('inputAnexoGenerico')?.addEventListener('change', extrairTextoDosAnexos);

        if (!podeEditar()) aplicarSomenteLeitura();
    }

    window.Etapa19 = { html, configurar, avancar };
})();
