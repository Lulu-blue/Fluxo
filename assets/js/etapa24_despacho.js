/* ============================================================================
   etapa24_despacho.js — Etapa 24: Secretário Despacha
   ----------------------------------------------------------------------------
   Exige o parecer da Etapa 19 pronto. Mostra o processo unificado (todos os
   documentos em ordem de chegada, com a defesa, as idas e vindas com Fiscal e
   Gerência e o parecer), permite abrir a defesa e o parecer separados, e
   registra a decisão do secretário com o Despacho Administrativo.

   Usa as peças de assets/js/etapa19_parecer.js via window.ParecerCompartilhado.
   ============================================================================ */

(function () {
    'use strict';

    console.info('[Etapa 24] versão 2026-09-25');

    const P = () => window.ParecerCompartilhado;

    const DECISOES_24 = {
        deferimento: { rotulo: 'Deferido', cor: '#16a34a', fundo: '#f0fdf4' },
        indeferimento: { rotulo: 'Indeferido', cor: '#dc2626', fundo: '#fef2f2' },
        reducao_50: { rotulo: 'Redução de 50%', cor: '#2563eb', fundo: '#eff6ff' }
    };

    let modelosDespacho = [];
    let auto = null;
    let documentosBanco = [];

    function esc(txt) {
        return P().escaparHtml(txt);
    }

    function dados24() {
        return P().dadosEtapa(24);
    }

    function dados19() {
        return P().dadosEtapa19();
    }

    // ------------------------------------------------------------------ dados

    async function carregarModelosDespacho() {
        const { data, error } = await supabaseClient
            .from('modelos_parecer')
            .select('*')
            .eq('ativo', true)
            .order('ordem', { ascending: true });
        if (error) throw error;
        modelosDespacho = (data || []).filter(m => m.tipo === 'despacho');
    }

    // Documentos do processo e do Auto, na ordem em que chegaram.
    async function carregarDocumentos() {
        const procId = processoAtual?.id;
        const notifId = auto?.notificacao?.id;
        if (!procId) return [];
        try {
            let query = supabaseClient.from('documentos').select('*').not('url', 'is', null);
            query = notifId
                ? query.or(`notificacao_id.eq.${notifId},processo_id.eq.${procId}`)
                : query.eq('processo_id', procId);
            const { data } = await query.order('created_at', { ascending: true });
            return data || [];
        } catch (err) {
            console.error('[Etapa 24] Erro ao buscar documentos:', err);
            return [];
        }
    }

    // Processo por decreto não tem Notificação Preliminar: nesse caso o
    // despacho cita o Decreto e, na falta dele, o próprio Auto de Infração.
    function origemDoProcesso() {
        const numeroNotificacao = auto?.notificacao?.numero;
        const ehDecreto = !!(processoAtual?.possui_decreto
            || processoAtual?.campos?.fiscDecreto === 'sim'
            || processoAtual?.dados?.fiscal?.decreto === 'sim'
            || auto?.notificacao?.dados?.possui_decreto);

        if (ehDecreto) {
            const numeroDecreto = processoAtual?.decreto_numero
                || processoAtual?.campos?.fiscNumeroDecreto
                || processoAtual?.dados?.numero_decreto
                || processoAtual?.dados?.fiscal?.decreto_numero;
            if (numeroDecreto) {
                return {
                    cabecalho: `Decreto Municipal nº: ${numeroDecreto}`,
                    corpo: `no Decreto Municipal nº ${numeroDecreto}`
                };
            }
        }

        if (numeroNotificacao) {
            return {
                cabecalho: `Notificação Preliminar nº: ${numeroNotificacao}`,
                corpo: `na Notificação Preliminar nº ${numeroNotificacao}`
            };
        }

        const numeroAuto = auto?.numero || '[NÚMERO/ANO]';
        return {
            cabecalho: `Auto de Infração nº: ${numeroAuto}`,
            corpo: `no Auto de Infração nº ${numeroAuto}`
        };
    }

    function valoresDespacho() {
        const v = P().valoresMarcadores(auto);
        const cont = processoAtual?.dados?.contribuinte || {};
        const origem = origemDoProcesso();
        return {
            ...v,
            PROCESSO_NUMERO: processoAtual?.numero_processo || '[NÚMERO DO PROCESSO]',
            NOTIFICACAO_NUMERO: auto?.notificacao?.numero || auto?.numero || '[NÚMERO/ANO]',
            ORIGEM_CABECALHO: origem.cabecalho,
            ORIGEM: origem.corpo,
            CPF: cont.cpf_cnpj || cont.cpf || '[CPF]'
        };
    }

    function montarDespacho(decisao) {
        const modelo = modelosDespacho.find(m => m.decisao === decisao);
        if (!modelo) return '';
        const valores = valoresDespacho();
        // {{OBSERVACAO}} sobrou em modelos antigos: sai do texto.
        let texto = String(modelo.texto || '').replace('{{OBSERVACAO}}', '');
        texto = texto.replace(/\{\{([A-Z_]+)\}\}/g, (marcador, chave) => valores[chave] ?? marcador);
        return texto.replace(/\n{3,}/g, '\n\n').trim();
    }

    // ------------------------------------------------------- processo unificado

    function ehImagem(item) {
        const tipo = (item.mime_type || item.tipo_arquivo || '').toLowerCase();
        const nome = (item.nome_arquivo || item.nome || '').toLowerCase();
        return tipo.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp|gif)$/.test(nome);
    }

    function ehPdf(item) {
        const tipo = (item.mime_type || '').toLowerCase();
        const nome = (item.nome_arquivo || item.nome || '').toLowerCase();
        return tipo === 'application/pdf' || nome.endsWith('.pdf');
    }

    function paginaArquivo(titulo, item) {
        const url = item.url || item.dataUrl || '';
        const nome = item.nome_arquivo || item.nome || 'Arquivo';
        let corpo;
        if (ehImagem(item)) {
            corpo = `<img src="${esc(url)}" alt="${esc(nome)}" style="max-width:100%; max-height:23cm; display:block; margin:0 auto;">`;
        } else if (ehPdf(item)) {
            corpo = `<iframe src="${esc(url)}#view=FitH" style="width:100%; height:23cm; border:1px solid #cbd5e1;"></iframe>`;
        } else {
            corpo = `<p style="font-size:0.95rem;">Arquivo anexado ao processo.</p>`;
        }
        return `
            <section class="pagina">
                <h2>${esc(titulo)}</h2>
                <p class="legenda">${esc(nome)}${item.created_at ? ' · ' + P().dataHora(item.created_at) : ''} · <a href="${esc(url)}" target="_blank" rel="noopener">abrir em nova aba</a></p>
                ${corpo}
            </section>
        `;
    }

    function paginaTexto(titulo, legenda, texto) {
        return `
            <section class="pagina">
                <h2>${esc(titulo)}</h2>
                ${legenda ? `<p class="legenda">${esc(legenda)}</p>` : ''}
                <div class="texto">${esc(texto || '—')}</div>
            </section>
        `;
    }

    function abrirJanela(titulo, conteudoHtml) {
        const janela = window.open('', '_blank');
        if (!janela) {
            alert('O navegador bloqueou a abertura da janela. Permita pop-ups para este site.');
            return;
        }
        janela.document.write(`
            <!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
            <title>${esc(titulo)}</title>
            <style>
                body { font-family: 'Inter', system-ui, sans-serif; color:#1e293b; margin:0; padding:24px; background:#f1f5f9; }
                .pagina { background:white; padding:28px; margin:0 auto 20px; max-width:21cm; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
                h1 { font-size:1.3rem; max-width:21cm; margin:0 auto 16px; }
                h2 { font-size:1.05rem; margin:0 0 6px; border-bottom:1px solid #e2e8f0; padding-bottom:6px; }
                h3 { font-size:0.95rem; margin:0 0 4px; }
                .legenda { font-size:0.8rem; color:#64748b; margin:0 0 12px; }
                .texto { white-space:pre-wrap; font-size:0.95rem; line-height:1.6; }
                .diligencia { border-left:3px solid #cbd5e1; padding-left:12px; margin-bottom:18px; }
                .anexos { font-size:0.85rem; margin:8px 0 0 18px; padding:0; }
                @media print {
                    body { background:white; padding:0; }
                    .pagina { box-shadow:none; border-radius:0; margin:0; padding:0 0 12px; page-break-after:always; }
                    h1 { page-break-after:avoid; }
                }
            </style></head><body>
            <h1>${esc(titulo)}</h1>
            ${conteudoHtml}
            </body></html>
        `);
        janela.document.close();
    }

    // ---------------- páginas novas para o PDF oficial do processo ----------------

    function cabecalhoSemac() {
        const brasao = window.BRASAO_SEMAC_BASE64 || 'assets/img/brasao_semac.jpeg';
        return `
            <div style="display:flex; align-items:flex-start; gap:18px; margin-bottom:25px;">
                <div style="width:100px; flex-shrink:0;">
                    <img src="${brasao}" alt="Brasão SEMAC" style="width:90px; height:auto;" />
                </div>
                <div style="flex:1;">
                    <div style="width:100%; height:10px; background-color:#F78C26; margin-bottom:6px; -webkit-print-color-adjust:exact; print-color-adjust:exact;"></div>
                    <div style="font-size:10pt; font-weight:bold; color:#000; line-height:1.3;">SECRETARIA MUNICIPAL DE MEIO AMBIENTE E CUIDADO ANIMAL - SEMAC</div>
                    <div style="font-size:10pt; font-weight:bold; color:#000; line-height:1.3;">DIRETORIA DE MEIO AMBIENTE</div>
                    <div style="font-size:10pt; font-weight:bold; color:#000; line-height:1.3;">GERÊNCIA DE FISCALIZAÇÃO DE POSTURAS</div>
                    <div style="font-size:9pt; color:#000; margin-top:3px; line-height:1.3;">Av. Paraná, nº2061, sala 207 - Bairro São José - Divinópolis, Minas Gerais CEP:35.501-170</div>
                </div>
            </div>
        `;
    }

    function paginaOficial(titulo, subtitulo, corpoHtml) {
        return `
            ${cabecalhoSemac()}
            <div style="text-align:center; font-size:14pt; font-weight:bold; text-transform:uppercase; color:#000; border-bottom:1px solid #cbd5e1; padding-bottom:10px; margin:24px 0 8px;">
                ${esc(titulo)}
            </div>
            ${subtitulo ? `<div style="text-align:center; font-size:9.5pt; color:#475569; margin-bottom:18px;">${esc(subtitulo)}</div>` : ''}
            ${corpoHtml}
        `;
    }

    function corpoTexto(texto) {
        return `<div style="white-space:pre-wrap; text-align:justify; font-size:11pt; line-height:1.7; color:#000;">${esc(texto || '—')}</div>`;
    }

    // Defesa, movimentações e parecer, nessa ordem, para entrarem no fim do
    // PDF oficial do processo (depois da capa e dos documentos do banco).
    function itensFinaisDoProcesso() {
        const d19 = dados19();
        const v = valoresDespacho();
        const itens = [];

        if (d19.defesa_texto && d19.defesa_texto.trim()) {
            itens.push({
                tipo: 'pagina',
                nome: 'Defesa (texto)',
                html: paginaOficial(
                    'Defesa Administrativa',
                    `Auto de Infração nº ${v.AUTO_NUMERO} · texto registrado pelo Jurídico`,
                    corpoTexto(d19.defesa_texto)
                )
            });
        }

        (d19.anexos || []).forEach(anexo => {
            const url = anexo.url || anexo.dataUrl;
            if (url) itens.push({ tipo: 'arquivo', nome: anexo.nome || 'Defesa (anexo)', url });
        });

        const diligencias = P().listarDiligencias();
        if (diligencias.length) {
            const blocos = diligencias.map((d, i) => {
                const papel = P().papelDiligencia(d);
                const r = d.resposta;
                const anexos = (r?.anexos || []).map(a => esc(a.nome || 'Anexo')).join(', ');
                return `
                    <div style="margin-bottom:22px; padding-left:12px; border-left:3px solid #cbd5e1;">
                        <div style="font-size:11pt; font-weight:bold; color:#000; margin-bottom:4px;">Movimentação ${i + 1} — Jurídico → ${esc(papel)}</div>
                        <div style="font-size:9.5pt; color:#475569; margin-bottom:6px;">Enviado por ${esc(d.enviado_por || '—')} em ${P().dataHora(d.enviado_em) || '—'}</div>
                        <div style="white-space:pre-wrap; text-align:justify; font-size:11pt; line-height:1.6; color:#000;">${esc(d.mensagem || '—')}</div>
                        <div style="font-size:9.5pt; color:#475569; margin:10px 0 6px;">Resposta d${papel === 'Gerência' ? 'a' : 'o'} ${esc(papel)}${r ? ` · ${esc(r.respondido_por || '—')} · ${P().dataHora(r.respondido_em) || '—'}` : ''}</div>
                        <div style="white-space:pre-wrap; text-align:justify; font-size:11pt; line-height:1.6; color:#000;">${r ? esc(r.texto || '—') : 'Sem resposta registrada.'}</div>
                        ${anexos ? `<div style="font-size:9.5pt; color:#475569; margin-top:6px;">Anexos da resposta: ${anexos}</div>` : ''}
                    </div>
                `;
            }).join('');

            itens.push({
                tipo: 'pagina',
                nome: 'Movimentações',
                html: paginaOficial(
                    'Movimentações entre Jurídico, Fiscal e Gerência',
                    `Auto de Infração nº ${v.AUTO_NUMERO} · ${diligencias.length} movimentação(ões)`,
                    blocos
                )
            });

            diligencias.forEach(d => (d.resposta?.anexos || []).forEach(a => {
                const url = a.url || a.dataUrl;
                if (url) itens.push({ tipo: 'arquivo', nome: a.nome || 'Anexo da resposta', url });
            }));
        }

        if (d19.parecer_texto) {
            itens.push({
                tipo: 'pagina',
                nome: 'Parecer Jurídico',
                html: paginaOficial(
                    'Parecer Jurídico',
                    `Auto de Infração nº ${v.AUTO_NUMERO} · ${P().DECISOES[d19.decisao]?.rotulo || 'sem decisão registrada'}`,
                    corpoTexto(d19.parecer_texto)
                )
            });
        }

        return itens;
    }

    // Usa o mesmo PDF oficial das outras etapas (capa + documentos do banco)
    // e acrescenta no fim a defesa, as movimentações e o parecer.
    async function gerarProcessoUnificado(acao) {
        if (typeof window.gerarPdfProcessoCompletoEtapa15 !== 'function') {
            alert('Gerador do processo unificado não encontrado.');
            return;
        }
        const v = valoresDespacho();
        await window.gerarPdfProcessoCompletoEtapa15(acao, {
            paginaDadosAr: true,
            itensFinais: itensFinaisDoProcesso(),
            nomeArquivo: `Processo_Completo_SEMAC_${String(v.PROCESSO_NUMERO).replace(/[\/\\]/g, '-')}.pdf`
        });
    }

    function abrirParecer() {
        const d19 = dados19();
        if (!d19.parecer_texto) {
            alert('O parecer jurídico ainda não foi emitido.');
            return;
        }
        abrirJanela('Parecer Jurídico', paginaTexto('Parecer Jurídico', `Decisão do jurídico: ${P().DECISOES[d19.decisao]?.rotulo || '—'}`, d19.parecer_texto));
    }

    function abrirDefesa() {
        const d19 = dados19();
        const anexos = d19.anexos || [];
        if (!d19.defesa_texto && !anexos.length) {
            alert('Não há defesa registrada neste Auto.');
            return;
        }
        const paginas = [
            d19.defesa_texto ? paginaTexto('Defesa apresentada (texto)', '', d19.defesa_texto) : '',
            ...anexos.map(a => paginaArquivo('Defesa apresentada (anexo)', a))
        ].filter(Boolean);
        abrirJanela('Defesa apresentada', paginas.join(''));
    }

    // -------------------------------------------------------------------- tela

    function html(uploadHtml) {
        const cartao = 'background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;';
        const titulo = 'margin:0 0 4px 0; color:#1e293b; font-size:1rem; font-weight:700;';
        const sub = 'margin:0 0 12px 0; color:#64748b; font-size:0.85rem;';
        const botao = 'padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#334155; font-weight:600; font-size:0.88rem; cursor:pointer;';

        return `
            <div id="etapa24Despacho" style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                    <div style="background:#eef2ff; padding:10px; border-radius:10px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4338ca" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 11l3 3L22 4"></path>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#1e293b; font-size:1.15rem; font-weight:700;">Despacho do Secretário</h3>
                        <p style="margin:2px 0 0 0; color:#64748b; font-size:0.85rem;">Leia o processo, decida e emita o Despacho Administrativo.</p>
                    </div>
                </div>

                <div id="e24Aviso" hidden style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:0.9rem;"></div>

                <div id="e24Resumo" style="${cartao} margin-bottom:20px; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;"></div>

                <div style="${cartao} margin-bottom:20px;">
                    <h4 style="${titulo}">1. Documentos do processo</h4>
                    <p style="${sub}">O processo unificado é o PDF oficial com capa, o mesmo das etapas de encerramento, agora completo: capa, documentos do processo, Auto de Infração, defesa, movimentações com Fiscal e Gerência e, por último, o parecer jurídico.</p>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button type="button" id="e24BtnUnificado" class="btn-primary" style="padding:10px 18px;">Abrir processo unificado (PDF)</button>
                        <button type="button" id="e24BtnBaixarUnificado" style="${botao}">Baixar processo unificado</button>
                        <button type="button" id="e24BtnParecer" style="${botao}">Ver parecer jurídico</button>
                        <button type="button" id="e24BtnDefesa" style="${botao}">Ver defesa</button>
                    </div>
                    <div id="e24ListaDocs" style="margin-top:14px;"></div>
                </div>

                <div style="${cartao} margin-bottom:20px;">
                    <h4 style="${titulo}">2. Decisão <span style="color:#ef4444;">*</span></h4>
                    <p id="e24InfoParecer" style="${sub}"></p>
                    <div id="e24Decisoes" style="display:flex; flex-wrap:wrap; gap:10px;">
                        ${Object.entries(DECISOES_24).map(([chave, d]) => `
                            <label class="e24-opcao" data-decisao="${chave}" style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-radius:10px; border:2px solid #e2e8f0; background:white; cursor:pointer; font-weight:600; color:${d.cor};">
                                <input type="radio" name="e24Decisao" value="${chave}" style="accent-color:${d.cor};"> ${d.rotulo}
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div style="${cartao} margin-bottom:20px;">
                    <h4 style="${titulo}">3. Documento do despacho <span style="color:#94a3b8; font-weight:500;">(opcional)</span></h4>
                    <p style="${sub}">Anexe o despacho já assinado, se houver.</p>
                    ${uploadHtml('Clique para selecionar ou arraste o documento do despacho aqui')}
                </div>

                <div style="${cartao}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
                        <div>
                            <h4 style="${titulo}">4. Despacho Administrativo</h4>
                            <p style="margin:0; color:#64748b; font-size:0.85rem;">Gere o texto padrão da decisão e edite à vontade antes de enviar.</p>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" id="e24BtnGerar" class="btn-primary" style="padding:10px 18px;">Gerar resposta padrão</button>
                            <button type="button" id="e24BtnCopiar" style="${botao}">Copiar texto</button>
                        </div>
                    </div>
                    <textarea id="e24Despacho" rows="18" placeholder="Escolha a decisão acima e clique em Gerar resposta padrão." style="width:100%; box-sizing:border-box; padding:14px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-size:0.95rem; line-height:1.55; color:#1e293b; resize:vertical; font-family:inherit;"></textarea>
                    <div id="e24Pendencias" hidden style="margin-top:10px; background:#fffbeb; border:1px solid #fde68a; color:#78350f; padding:10px 12px; border-radius:8px; font-size:0.85rem;"></div>
                </div>

                <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                    <button type="button" id="e24BtnSalvar" class="btn-primary" style="padding:12px 24px;">Salvar rascunho</button>
                </div>
            </div>
        `;
    }

    function renderizarResumo() {
        const el = document.getElementById('e24Resumo');
        if (!el) return;
        const v = valoresDespacho();
        const campos = [
            ['Processo', v.PROCESSO_NUMERO],
            ['Auto de Infração', v.AUTO_NUMERO],
            ['Notificação Preliminar', v.NOTIFICACAO_NUMERO],
            ['Interessado', v.DEFENDENTE],
            ['CPF/CNPJ', v.CPF],
            ['Imóvel', v.ENDERECO]
        ];
        el.innerHTML = campos.map(([rotulo, valor]) => `
            <div>
                <div style="font-size:0.75rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.03em;">${rotulo}</div>
                <div style="font-size:0.92rem; color:#1e293b; font-weight:500; margin-top:2px;">${esc(valor)}</div>
            </div>
        `).join('');
    }

    function renderizarListaDocs() {
        const el = document.getElementById('e24ListaDocs');
        if (!el) return;
        const d19 = dados19();
        const linhas = [];
        documentosBanco.forEach(doc => linhas.push(`${doc.tipo || 'Documento'} — ${doc.nome_arquivo || 'arquivo'}`));
        if (d19.defesa_texto) linhas.push('Defesa (texto colado pelo jurídico)');
        (d19.anexos || []).forEach(a => linhas.push(`Defesa (anexo) — ${a.nome || 'arquivo'}`));
        const dil = P().listarDiligencias();
        if (dil.length) linhas.push(`Movimentações com Fiscal/Gerência — ${dil.length}`);
        if (d19.parecer_texto) linhas.push('Parecer Jurídico');

        el.innerHTML = `
            <div style="font-size:0.8rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.03em; margin-bottom:6px;">Conteúdo do processo unificado (${linhas.length})</div>
            <ol style="margin:0; padding-left:20px; color:#334155; font-size:0.88rem; line-height:1.6;">
                ${linhas.map(l => `<li>${esc(l)}</li>`).join('') || '<li>Nenhum documento encontrado.</li>'}
            </ol>
        `;
    }

    function destacarDecisao() {
        const marcada = document.querySelector('input[name="e24Decisao"]:checked')?.value;
        document.querySelectorAll('.e24-opcao').forEach(label => {
            const d = DECISOES_24[label.dataset.decisao];
            const ativa = label.dataset.decisao === marcada;
            label.style.borderColor = ativa ? d.cor : '#e2e8f0';
            label.style.background = ativa ? d.fundo : 'white';
        });
    }

    function atualizarPendencias() {
        const el = document.getElementById('e24Pendencias');
        if (!el) return;
        const pendencias = P().listarPendencias(document.getElementById('e24Despacho')?.value);
        el.hidden = pendencias.length === 0;
        if (pendencias.length) {
            el.innerHTML = `<strong>${pendencias.length} trecho(s) entre colchetes para preencher:</strong> ${pendencias.map(p => esc(p)).join(', ')}`;
        }
    }

    function gerarDespacho() {
        const decisao = document.querySelector('input[name="e24Decisao"]:checked')?.value;
        if (!decisao) {
            alert('Escolha a decisão (item 2) antes de gerar o despacho.');
            return;
        }
        const area = document.getElementById('e24Despacho');
        if (area.value.trim() && !confirm('Isso substitui o texto atual do despacho. Deseja continuar?')) return;

        const texto = montarDespacho(decisao);
        if (!texto) {
            alert('Modelo de despacho não encontrado. Verifique se o script migracao/modelos_parecer.sql foi executado no banco.');
            return;
        }
        area.value = texto;
        atualizarPendencias();
    }

    async function copiarTexto() {
        const area = document.getElementById('e24Despacho');
        const btn = document.getElementById('e24BtnCopiar');
        if (!area?.value.trim()) {
            alert('Não há texto de despacho para copiar.');
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

    // ------------------------------------------------------------ salvar/avançar

    function coletar() {
        return {
            decisao: document.querySelector('input[name="e24Decisao"]:checked')?.value || '',
            despacho_texto: document.getElementById('e24Despacho')?.value || ''
        };
    }

    function gravar(form) {
        const dados = dados24();
        Object.assign(dados, form, {
            auto_numero: auto?.numero || '',
            atualizado_em: new Date().toISOString(),
            atualizado_por: perfilAtual?.nome || ''
        });
        return dados;
    }

    async function salvarRascunho() {
        gravar(coletar());
        mostrarCarregamento('Salvando despacho...');
        try {
            await P().persistirDados();
            ocultarCarregamento();
            alert('Despacho salvo.');
        } catch (err) {
            ocultarCarregamento();
            console.error('[Etapa 24] Erro ao salvar:', err);
            alert(navigator.onLine
                ? `Erro ao salvar o despacho: ${err?.message || 'falha inesperada'}`
                : 'Não foi possível salvar: o sistema está sem conexão com o servidor.\n\nO que você digitou continua na tela. Verifique a internet e tente de novo.');
        }
    }

    async function avancar() {
        if (!notificacaoAtual && P().autosNaEtapa(24).length) {
            alert('O despacho é por Auto de Infração. Abra o Auto na lista para despachar.');
            return;
        }
        if (!dados19().parecer_texto) {
            alert('Este Auto não tem parecer jurídico registrado. A Etapa 24 exige o parecer pronto.');
            return;
        }

        const form = coletar();
        if (!form.decisao) {
            alert('Marque a decisão do secretário (item 2).');
            return;
        }
        if (!form.despacho_texto.trim() && !(dados24().anexos || []).length) {
            alert('Gere o Despacho Administrativo (item 4) ou anexe o documento assinado (item 3).');
            return;
        }
        // Colchetes pendentes barram o avanço, igual ao parecer da Etapa 19.
        const pendencias = P().listarPendencias(form.despacho_texto);
        if (pendencias.length) {
            alert(
                `O despacho ainda tem ${pendencias.length} trecho(s) entre colchetes para preencher:\n\n`
                + `${pendencias.slice(0, 8).join('\n')}${pendencias.length > 8 ? '\n(e outros)' : ''}\n\n`
                + 'Preencha ou apague esses trechos no item 4 antes de avançar.'
            );
            const area = document.getElementById('e24Despacho');
            if (area) {
                area.focus();
                const pos = area.value.indexOf(pendencias[0]);
                if (pos >= 0) area.setSelectionRange(pos, pos + pendencias[0].length);
            }
            return;
        }

        mostrarCarregamento('Registrando o despacho...');
        try {
            const dados = gravar(form);
            dados.data_despacho = new Date().toISOString();
            await P().persistirDados();
            await moverProcessoParaEtapa(25, `Despacho do Secretário: ${DECISOES_24[form.decisao].rotulo}`);
        } catch (err) {
            ocultarCarregamento();
            console.error('[Etapa 24] Erro ao avançar:', err);
            alert(navigator.onLine
                ? `Erro ao registrar o despacho: ${err?.message || 'falha inesperada'}`
                : 'Não foi possível registrar o despacho: o sistema está sem conexão com o servidor.\n\nO que você digitou continua na tela. Verifique a internet e tente de novo.');
        }
    }

    // ------------------------------------------------------------ inicialização

    async function configurar() {
        const raiz = document.getElementById('etapa24Despacho');
        if (!raiz || !processoAtual) return;

        if (!notificacaoAtual) {
            const naEtapa = P().autosNaEtapa(24);
            if (naEtapa.length) {
                P().renderizarListaDeAutos(raiz, naEtapa, 'O despacho é por Auto de Infração. Clique no Auto para despachar.');
                return;
            }
        }

        auto = P().montarAuto(notificacaoAtual);

        try {
            await carregarModelosDespacho();
        } catch (err) {
            console.error('[Etapa 24] Erro ao carregar modelos:', err);
        }
        documentosBanco = await carregarDocumentos();

        renderizarResumo();
        renderizarListaDocs();

        const d19 = dados19();
        const aviso = document.getElementById('e24Aviso');
        if (!d19.parecer_texto && aviso) {
            aviso.hidden = false;
            aviso.innerHTML = '<strong>Sem parecer jurídico.</strong> Este Auto chegou à Etapa 24 sem o parecer da Etapa 19. O despacho não pode ser concluído até o parecer ser emitido.';
        }

        const info = document.getElementById('e24InfoParecer');
        if (info) {
            info.textContent = d19.decisao
                ? `O parecer jurídico opinou por: ${P().DECISOES[d19.decisao]?.rotulo || d19.decisao}.`
                : 'O parecer jurídico não registrou uma decisão.';
        }

        // Restaura o rascunho; sem rascunho, já marca o que o parecer opinou.
        const dados = dados24();
        const decisaoInicial = dados.decisao || (DECISOES_24[d19.decisao] ? d19.decisao : '');
        if (decisaoInicial) {
            const radio = document.querySelector(`input[name="e24Decisao"][value="${decisaoInicial}"]`);
            if (radio) radio.checked = true;
        }
        destacarDecisao();

        const despacho = document.getElementById('e24Despacho');
        if (despacho) despacho.value = dados.despacho_texto || '';
        atualizarPendencias();

        document.querySelectorAll('input[name="e24Decisao"]').forEach(radio => radio.addEventListener('change', destacarDecisao));
        despacho?.addEventListener('input', atualizarPendencias);
        document.getElementById('e24BtnUnificado')?.addEventListener('click', () => gerarProcessoUnificado('abrir'));
        document.getElementById('e24BtnBaixarUnificado')?.addEventListener('click', () => gerarProcessoUnificado('download'));
        document.getElementById('e24BtnParecer')?.addEventListener('click', abrirParecer);
        document.getElementById('e24BtnDefesa')?.addEventListener('click', abrirDefesa);
        document.getElementById('e24BtnGerar')?.addEventListener('click', gerarDespacho);
        document.getElementById('e24BtnCopiar')?.addEventListener('click', copiarTexto);
        document.getElementById('e24BtnSalvar')?.addEventListener('click', salvarRascunho);

        if (!P().podeEditar()) {
            if (despacho) despacho.readOnly = true;
            document.querySelectorAll('#etapa24Despacho input[type="radio"]').forEach(el => { el.disabled = true; });
            ['e24BtnSalvar', 'e24BtnGerar'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.hidden = true;
            });
            const upload = document.querySelector('#etapa24Despacho #areaDropGenerico');
            if (upload) upload.hidden = true;
        }
    }

    window.Etapa24 = { html, configurar, avancar };
})();
