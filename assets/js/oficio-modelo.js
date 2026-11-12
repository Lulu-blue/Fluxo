// ============================================================
// MODELO DO OFÍCIO SEMAC - GFP (Etapa 15)
// Fica num arquivo só porque dois lugares desenham o mesmo documento:
//   * a Etapa 15 (etapa.js), onde o Gerente edita o destinatário e baixa o PDF;
//   * a aba Ofícios do painel, no atalho "Ver ofício", que abre só o documento
//     sem carregar o processo inteiro.
// Mudou o texto do ofício? Muda aqui e vale para os dois.
// ============================================================

window.CARGO_SECRETARIO_FAZENDA_OFICIO = 'Secretário Municipal de Fazenda';
window.CARGO_ASSINATURA_OFICIO = 'Gerente de Fiscalização de Posturas';

window.escaparHtmlOficio = function (txt) {
    const div = document.createElement('div');
    div.textContent = txt == null ? '' : String(txt);
    return div.innerHTML;
};

/**
 * Monta o HTML do ofício. Todos os campos são opcionais; o que faltar vira "—".
 * @param {Object} d
 * @param {String} d.numero              Ex: "2026/536"
 * @param {String} d.dataTexto           Ex: "setembro de 2026"
 * @param {String} d.secretarioNome      Destinatário (Secretário Municipal de Fazenda)
 * @param {String} d.secretarioCargo
 * @param {String} d.gerenteNome         Quem assina
 * @param {String} d.autuado             Nome do contribuinte
 * @param {String} d.numeroAutoInfracao
 * @param {String} d.pa                  Processo administrativo
 * @param {Boolean} d.nomeEditavel       true deixa o nome do destinatário editável na tela
 */
/**
 * Moldura do ofício (cabeçalho, número, destinatário, assunto e assinatura).
 * O corpo vem pronto em d.corpoHtml, então cada etapa escreve o texto dela sem
 * repetir o papel timbrado.
 */
window.montarHtmlOficioSemac = function (d) {
    const esc = window.escaparHtmlOficio;
    const estiloNomeEditavel = d.nomeEditavel
        ? 'outline:none; border-bottom:1px dashed #2563eb; padding:0 2px; cursor:text; min-width:180px; display:inline-block;'
        : '';

    return `
        <div id="${d.idDocumento || 'documentoOficioGfp'}" style="font-family: Calibri, 'Carlito', Arial, sans-serif;">
            <div style="padding: 50px 55px 30px 55px; background: white; max-width: 820px; margin: 0 auto; color: #000;">

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; border-collapse: collapse;">
                    <tr>
                        <td width="100" rowspan="2" align="center" valign="top" style="padding-right: 12px; width: 100px;">
                            <img src="assets/img/brasao_semac.jpeg" width="85" style="width: 85px; height: auto; display: block; margin: 0 auto;">
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

                <hr style="border:none; border-top:1px solid #000; margin: 0 0 22px 0;">

                <div style="text-align: right; font-size: 12pt; margin-bottom: 6px;">
                    <strong>OFÍCIO SEMAC - <u>GFP</u> Nº ${esc(d.numero || '—')}</strong>
                </div>
                <div style="text-align: right; font-size: 10.5pt; margin-bottom: 30px;">
                    Divinópolis, ${esc(d.dataTexto || '')}.
                </div>

                <div style="font-size: 11pt; line-height: 1.5; margin-bottom: 26px;">
                    Ao Senhor<br>
                    <span id="nomeSecretarioFazendaOficio"
                          ${d.nomeEditavel ? 'contenteditable="true" spellcheck="false" data-placeholder="Nome do Secretário Municipal de Fazenda"' : ''}
                          style="${estiloNomeEditavel}">${esc(d.secretarioNome)}</span><br>
                    ${esc(d.secretarioCargo || window.CARGO_SECRETARIO_FAZENDA_OFICIO)}
                </div>

                <div style="font-size: 11pt; margin-bottom: 24px;">
                    <strong>Assunto: ${esc(d.assunto || 'Emissão de guia para pagamento')}</strong>
                </div>

                ${d.corpoHtml || ''}

                <div style="text-align: center; margin-top: 70px; padding-bottom: 28px; font-size: 11pt; line-height: 1.5;">
                    <div><em>(assinado digitalmente)</em></div>
                    <div><strong>${esc(d.gerenteNome)}</strong></div>
                    <div><strong>${window.CARGO_ASSINATURA_OFICIO}</strong></div>
                </div>
            </div>
        </div>
    `;
};

window.montarHtmlOficioGfp = function (d) {
    const esc = window.escaparHtmlOficio;
    return window.montarHtmlOficioSemac({
        ...d,
        assunto: 'Emissão de guia para pagamento',
        corpoHtml: `
<div style="font-size: 11pt; line-height: 1.6; text-align: justify;">
                    <p style="margin: 0 0 16px 0;">Prezado Senhor,</p>

                    <p style="margin: 0 0 16px 0; text-indent: 40px;">
                        Encaminho a Vossa Senhoria o <strong>Auto de Infração nº ${esc(d.numeroAutoInfracao || '—')}</strong>,
                        lavrado em face do contribuinte <strong>${esc(d.autuado || '—')}</strong>,
                        cujo <strong>PA ${esc(d.pa || '—')}</strong> tramitou corretamente, devidamente fundamentado
                        no respectivo Auto de Infração.
                    </p>

                    <p style="margin: 0 0 16px 0; text-indent: 40px;">
                        Informo que o referido Auto de Infração será regularmente entregue ao autuado junto com a guia de
                        pagamento, oportunidade em que será assegurado o exercício do contraditório e da ampla defesa,
                        observando-se o prazo recursal previsto na legislação aplicável.
                    </p>

                    <p style="margin: 0 0 16px 0; text-indent: 40px;">
                        Diante dos fatos, requisito portanto, que seja emitido a guia para o pagamento da penalidade na
                        integralidade,<strong><u> eventual pedido de inscrição em dívida ativa será encaminhado após término
                        do prazo recursal.</u></strong>
                    </p>

                    <p style="margin: 0 0 16px 0; text-indent: 40px;">
                        Coloco-me à disposição para quaisquer esclarecimentos adicionais.
                    </p>

                    <p style="margin: 0 0 16px 0; text-indent: 40px;">Atenciosamente,</p>
                </div>
        `
    });
};

// Data do ofício: mês e ano, sem o dia
window.dataTextoOficio = function (data) {
    return (data ? new Date(data) : new Date())
        .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

// ── Faixa laranja do fim do documento como rodapé da impressão ─────────────
// Chamada em toda impressão (iframe) logo antes do print(). Na impressão, a faixa
// laranja que fecha o documento some do fim do texto e o navegador a desenha no
// pé de cada página (margem inferior do @page). A faixa é reconhecida pela classe
// doc-rodape-laranja ou, em documento salvo antes dela (ofícios e relatórios
// guardados no banco), como o último bloco laranja sem texto depois dele.
// Também apaga o cabeçalho/rodapé automático do navegador (data, título, endereço
// do arquivo), que aparecia nas margens.
// opcoes.forcarRodape: documentos cujo modelo não tem a faixa no fim (Ofício GFP)
// ou que podem vir de um HTML antigo sem ela (Réplica) ganham o rodapé assim mesmo.
window.prepararImpressaoComRodape = function (doc, opcoes = {}) {
    if (!doc?.body || !doc.head) return;

    // O quadro de tela de alguns documentos (Certidão, Auto de Infração) tem
    // borda e sombra; no papel isso virava uma linha no alto da página
    doc.body.querySelectorAll('[style*="box-shadow"]').forEach(el => {
        if (/border:\s*1px solid #cbd5e1/i.test(el.getAttribute('style') || '')) {
            el.style.border = 'none';
            el.style.boxShadow = 'none';
        }
    });

    if (!doc.body.querySelector('.doc-rodape-laranja')) {
        const ehLaranja = el => /#f78c26|rgb\(\s*247\s*,\s*140\s*,\s*38\s*\)/i.test(el.getAttribute('style') || '');
        const candidatos = Array.from(doc.body.querySelectorAll('div'))
            .filter(el => ehLaranja(el) && !el.textContent.replace(/\u00a0/g, '').trim() && !el.querySelector('img'));
        const faixa = candidatos[candidatos.length - 1];
        if (faixa) {
            // A faixa do topo também é laranja: só vale a que não tem texto depois dela
            const andarilho = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
            andarilho.currentNode = faixa;
            let temTextoDepois = false;
            for (let n = andarilho.nextNode(); n; n = andarilho.nextNode()) {
                if (faixa.contains(n) || /^(SCRIPT|STYLE)$/.test(n.parentNode?.nodeName)) continue;
                if (n.textContent.replace(/\u00a0/g, '').trim()) { temTextoDepois = true; break; }
            }
            if (!temTextoDepois) faixa.classList.add('doc-rodape-laranja');
        }
    }
    if (opcoes.forcarRodape && !doc.body.querySelector('.doc-rodape-laranja')) {
        const marcador = doc.createElement('div');
        marcador.className = 'doc-rodape-laranja';
        doc.body.appendChild(marcador);
    }

    if (doc.getElementById('estiloRodapeImpressao')) return;
    const estilo = doc.createElement('style');
    estilo.id = 'estiloRodapeImpressao';
    estilo.textContent = `@media print {
        @page { @top-left { content: ''; } @top-right { content: ''; } @bottom-left { content: ''; } @bottom-right { content: ''; } }
        .doc-rodape-laranja { display: none !important; }
        body:has(.doc-rodape-laranja) { page: comRodape; }
        @page comRodape {
            @bottom-left { content: none; } @bottom-right { content: none; }
            @bottom-center { content: ''; width: 100%; vertical-align: bottom; border-bottom: 16px solid #F78C26; margin-bottom: 6mm; }
        }
    }`;
    doc.head.appendChild(estilo);
};
