/* ============================================================================
   ia_defesa.js — Resumo da defesa com IA rodando no próprio navegador
   ----------------------------------------------------------------------------
   O modelo é baixado uma vez e roda na placa de vídeo do computador (WebLLM).
   O texto da defesa NÃO é enviado para nenhum servidor: só o modelo trafega,
   e uma vez só. Só o texto da defesa é entregue ao modelo — nome, CPF,
   endereço e inscrição não entram no prompt.

   A IA apenas RESUME e SUGERE. Quem decide e assina é o jurídico.
   ============================================================================ */

(function () {
    'use strict';

    console.info('[IA da defesa] versão 2026-09-25');

    const URL_WEBLLM = 'https://esm.run/@mlc-ai/web-llm@0.2';

    // Ordem de preferência: 1.5B dá respostas melhores; 0.5B é o plano B para
    // máquinas mais fracas.
    const MODELOS = ['Qwen2.5-1.5B-Instruct', 'Qwen2.5-0.5B-Instruct'];

    // Alegações que o modelo pode marcar. Vieram do levantamento em
    // etapas/etapa_19_pesquisa_defesas.md.
    const ALEGACOES = {
        regularizou_no_prazo: 'Regularizou dentro do prazo da notificação',
        regularizou_depois: 'Regularizou depois do prazo ou da autuação',
        nega_irregularidade: 'Nega a irregularidade constatada',
        terceiros: 'Atribui a irregularidade a terceiros',
        nao_e_responsavel: 'Alega não ser o proprietário ou responsável',
        nao_foi_notificado: 'Alega não ter recebido a notificação',
        vicio_no_auto: 'Aponta erro ou vício no auto de infração',
        motivo_pessoal: 'Alega motivo pessoal (saúde, idade, viagem)',
        dificuldade_financeira: 'Alega dificuldade financeira',
        contesta_valor: 'Contesta o valor da multa ou a reincidência',
        pede_reducao: 'Pede redução ou parcelamento',
        outro: 'Outro argumento'
    };

    let webllm = null;
    let motor = null;
    let modeloCarregado = null;

    // ------------------------------------------------------------------ apoio

    async function suportaWebGPU() {
        if (!navigator.gpu || !window.isSecureContext) return false;
        try {
            const adapter = await navigator.gpu.requestAdapter();
            return !!adapter && !adapter.isFallbackAdapter;
        } catch (e) {
            return false;
        }
    }

    async function temShaderF16() {
        try {
            const adapter = await navigator.gpu.requestAdapter();
            return !!adapter?.features?.has('shader-f16');
        } catch (e) {
            return false;
        }
    }

    async function carregarBiblioteca() {
        // window.__WEBLLM permite injetar a biblioteca nos testes automatizados.
        if (!webllm) webllm = window.__WEBLLM || await import(/* webpackIgnore: true */ URL_WEBLLM);
        return webllm;
    }

    async function escolherModelo() {
        await carregarBiblioteca();
        const ids = webllm.prebuiltAppConfig.model_list.map(m => m.model_id);
        const quantizacao = (await temShaderF16()) ? 'q4f16' : 'q4f32';
        for (const base of MODELOS) {
            const escolhido = ids.find(id => id.startsWith(base) && id.includes(quantizacao))
                || ids.find(id => id.startsWith(base));
            if (escolhido) return escolhido;
        }
        throw new Error('Nenhum modelo compatível encontrado na lista do WebLLM.');
    }

    async function carregar(onProgresso) {
        await carregarBiblioteca();
        const modelo = await escolherModelo();
        if (motor && modeloCarregado === modelo) return modelo;

        if (motor) {
            try { await motor.unload(); } catch (e) { /* já descartado */ }
            motor = null;
        }

        motor = await webllm.CreateMLCEngine(modelo, {
            initProgressCallback: p => {
                if (onProgresso) onProgresso({ etapa: 'download', progresso: p.progress || 0, texto: p.text || '' });
            }
        });
        modeloCarregado = modelo;
        return modelo;
    }

    // ------------------------------------------------------------------ prompt

    function listaDecisoes(decisoesPermitidas) {
        const rotulos = {
            deferimento: 'deferimento (a defesa procede; o auto deve ser cancelado)',
            indeferimento: 'indeferimento (a defesa não procede; o auto se mantém)',
            reducao_50: 'reducao_50 (a irregularidade foi corrigida depois da autuação; cabe reduzir a multa em 50%)',
            deferimento_parcial: 'deferimento_parcial (procede só em parte, por exemplo para afastar a reincidência)',
            diligencia: 'diligencia (faltam documentos ou é preciso nova vistoria antes de decidir)'
        };
        return decisoesPermitidas.map(d => `- ${rotulos[d] || d}`).join('\n');
    }

    function montarPrompt(textoDefesa, contexto, reforcado) {
        const decisoes = listaDecisoes(contexto.decisoes || ['deferimento', 'indeferimento']);
        const alegacoes = Object.entries(ALEGACOES).map(([chave, texto]) => `- ${chave}: ${texto}`).join('\n');

        const base = `Você auxilia o setor jurídico de uma prefeitura na triagem de defesas administrativas contra autos de infração de posturas municipais.

Infração do auto: ${contexto.infracao || 'não informada'}

Defesa apresentada:
"""
${textoDefesa}
"""

Alegações possíveis (use as chaves exatamente como estão):
${alegacoes}

Decisões possíveis para esta infração (use a chave exata):
${decisoes}

Responda APENAS com um objeto JSON válido, sem markdown e sem comentários, neste formato:
{"resumo": "2 a 4 frases em português objetivo, sem opinião", "alegacoes": ["chave", "chave"], "sugestao": "chave da decisão", "motivo": "uma frase explicando a sugestão"}`;

        return reforcado
            ? `Sua resposta anterior não era um JSON válido.\n\n${base}\n\nResponda somente o JSON, começando com { e terminando com }.`
            : base;
    }

    function extrairJson(texto) {
        const inicio = String(texto || '').indexOf('{');
        const fim = String(texto || '').lastIndexOf('}');
        if (inicio === -1 || fim <= inicio) throw new Error('A resposta não trouxe um JSON.');
        return JSON.parse(texto.slice(inicio, fim + 1));
    }

    function validar(dados, contexto) {
        const decisoes = contexto.decisoes || [];
        const resumo = String(dados.resumo || '').trim();
        if (!resumo) throw new Error('A resposta veio sem resumo.');

        const alegacoes = Array.isArray(dados.alegacoes)
            ? dados.alegacoes.filter(a => ALEGACOES[a])
            : [];
        const sugestao = decisoes.includes(dados.sugestao) ? dados.sugestao : null;

        return {
            resumo,
            alegacoes,
            sugestao,
            motivo: String(dados.motivo || '').trim(),
            alegacoes_ignoradas: Array.isArray(dados.alegacoes)
                ? dados.alegacoes.filter(a => !ALEGACOES[a])
                : []
        };
    }

    // ------------------------------------------------------------------ análise

    async function gerar(prompt, onParcial) {
        const stream = await motor.chat.completions.create({
            temperature: 0.1,
            max_tokens: 700,
            stream: true,
            messages: [
                { role: 'system', content: 'Você responde exclusivamente com JSON válido, em português do Brasil.' },
                { role: 'user', content: prompt }
            ]
        });

        let texto = '';
        for await (const parte of stream) {
            const pedaco = parte.choices?.[0]?.delta?.content || '';
            if (pedaco) {
                texto += pedaco;
                if (onParcial) onParcial(texto);
            }
        }
        return texto;
    }

    /**
     * Resume a defesa e sugere uma decisão.
     * @param {String} textoDefesa  Apenas o texto da defesa.
     * @param {Object} contexto     { infracao, decisoes: ['indeferimento', ...] }
     * @param {Object} eventos      { onProgresso, onParcial }
     */
    async function analisar(textoDefesa, contexto = {}, eventos = {}) {
        const texto = String(textoDefesa || '').trim();
        if (texto.length < 40) throw new Error('O texto da defesa é curto demais para ser resumido.');

        if (eventos.onProgresso) eventos.onProgresso({ etapa: 'modelo', texto: 'Preparando o modelo...' });
        const modelo = await carregar(eventos.onProgresso);

        const inicio = performance.now();
        let erroAnterior = null;

        for (let tentativa = 1; tentativa <= 2; tentativa++) {
            if (eventos.onProgresso) {
                eventos.onProgresso({
                    etapa: 'analise',
                    texto: tentativa === 1 ? 'Lendo a defesa...' : 'A resposta veio fora do formato; tentando de novo...'
                });
            }
            try {
                const bruto = await gerar(montarPrompt(texto, contexto, tentativa > 1), eventos.onParcial);
                const resultado = validar(extrairJson(bruto), contexto);
                return {
                    ...resultado,
                    modelo,
                    segundos: Math.round((performance.now() - inicio) / 1000),
                    gerado_em: new Date().toISOString()
                };
            } catch (err) {
                erroAnterior = err;
                if (/device.*lost|DEVICE_HUNG|DEVICE_REMOVED|disposed/i.test(err.message || '')) {
                    motor = null;
                    modeloCarregado = null;
                    throw new Error('A placa de vídeo travou durante a análise. Recarregue a página (F5) e tente de novo — o modelo baixado continua guardado.');
                }
            }
        }
        throw new Error(`A IA não devolveu um resultado válido: ${erroAnterior?.message || 'formato inesperado'}`);
    }

    async function apagarModelo() {
        await carregarBiblioteca();
        const modelo = modeloCarregado || await escolherModelo();
        if (motor) {
            try { await motor.unload(); } catch (e) { /* já descartado */ }
            motor = null;
        }
        await webllm.deleteModelAllInfoInCache(modelo);
        modeloCarregado = null;
    }

    window.IADefesa = {
        ALEGACOES,
        suportaWebGPU,
        carregar,
        analisar,
        apagarModelo,
        modeloEmUso: () => modeloCarregado
    };
})();
