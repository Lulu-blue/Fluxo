// ============================================================================
// FISCALIZAÇÃO DE MEIO AMBIENTE
// ============================================================================
// O Fiscal de Meio Ambiente segue o mesmo fluxo do Fiscal de Postura (o cargo
// contém "fiscal", então normalizarCargo o trata igual nas permissões). Muda:
//   - os dispositivos legais transgredidos (INFRACOES_MEIO_AMBIENTE, tirados de
//     "Textos AFs completos e no padrão correto");
//   - o documento da Etapa 1, que se chama Auto de Fiscalização, com prazo de
//     defesa de 20 dias úteis e instruções novas de protocolo;
//   - o Relatório Fiscal pode levar a assinatura de fiscais contribuidores, que
//     ficam em dados.fiscais_contribuidores para o SEMAC pontuar todos. O resto
//     do processo (Auto de Infração etc.) continua só com quem criou.
// Carregado por painel.html (antes de nova-solicitacao.js) e etapa.html (antes
// de etapa.js).

const CARGO_FISCAL_MEIO_AMBIENTE = 'Fiscal de Meio Ambiente';
window.CARGO_FISCAL_MEIO_AMBIENTE = CARGO_FISCAL_MEIO_AMBIENTE;

function normalizarTextoMA(txt) {
    return String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

window.ehCargoMeioAmbiente = function (cargo) {
    const c = normalizarTextoMA(cargo);
    return c.includes('fiscal') && c.includes('meio ambiente');
};

// ── Catálogo ───────────────────────────────────────────────────────────────
// penalidade: {VALOR} vira o valor da multa (editável pelo fiscal). upfmd: a
// multa padrão é essa quantidade de UPFMD; sem ele, a multa padrão é `valor`.
// As providências são fixas; só o prazo delas é escolhido pelo fiscal.
// atencao aparece antes da penalidade; atencaoPosMulta, depois.
const PENALIDADE_CODEMA = 'O <strong>NÃO CUMPRIMENTO</strong> do presente Auto de Fiscalização dentro do prazo legal sujeitará o infrator às penalidades previstas pelo Anexo único da Resolução CODEMA nº 01 de 27 de abril de 2023, multa no importe de <strong>R$ {VALOR}</strong>';
const PENALIDADE_ART133_I = 'O <strong>NÃO CUMPRIMENTO</strong> do presente Auto de Fiscalização dentro do prazo legal sujeitará o infrator às penalidades previstas pelo artigo 133, I, do Decreto Municipal nº 4748/2002, multa no importe de <strong>R$ {VALOR}</strong>';
const PENALIDADE_ART133_II = 'O <strong>NÃO CUMPRIMENTO</strong> do presente Auto de Fiscalização dentro do prazo legal sujeitará o infrator às penalidades previstas pelo artigo 133, II, do Decreto Municipal nº 4748/2002, multa no importe de <strong>R$ {VALOR}</strong>';

const INFRACOES_MEIO_AMBIENTE = [
    {
        codigo: 'MA-01',
        rotulo: 'Descarte de resíduos de construção em lote vago',
        descricao: 'Descarte irregular de resíduos de construção civil.',
        dispositivo: 'Lei Municipal nº 5451/2002 e artigos 53 e 135, alínea “m”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Retirar os resíduos de construção civil descartados no imóvel.'],
        valor: 6275.50,
        penalidade: `${PENALIDADE_CODEMA}.`
    },
    {
        codigo: 'MA-02',
        rotulo: 'Bota-fora – descarte de resíduos sólidos em logradouros públicos',
        descricao: 'Descarte irregular de resíduos sólidos em logradouro público.',
        dispositivo: 'Lei Municipal nº 5451/2002 e artigos 53, 56 e 135, alínea “m”, do Decreto Municipal nº 4748/2002.',
        providencias: [
            'Retirar os resíduos sólidos descartados no imóvel autuado;',
            'Apresentar o comprovante de destinação dos resíduos em local autorizado pelo órgão ambiental competente.'
        ],
        valor: 6275.50,
        penalidade: `${PENALIDADE_CODEMA}.`
    },
    {
        codigo: 'MA-03',
        rotulo: 'Movimentação de terra, desaterro e aterro sem autorização',
        descricao: 'Movimentação de terra para execução de aterro e/ou desaterro sem autorização do órgão ambiental competente.',
        dispositivo: 'Lei Municipal nº 5451/2002 e artigos 57, 68 e 135, alínea “m”, do Decreto Municipal nº 4748/2002.',
        providencias: [
            'Paralisar a movimentação de terra para execução de aterro e/ou desaterro no imóvel autuado.',
            'Apresentar autorização emitida pelo órgão ambiental competente.'
        ],
        valor: 6275.50,
        penalidade: `${PENALIDADE_CODEMA}.`
    },
    {
        codigo: 'MA-04',
        rotulo: 'Iniciar atividades sem licença ambiental de instalação',
        descricao: 'Iniciar as atividades de instalação sem a devida licença ambiental no órgão competente.',
        dispositivo: 'Lei Municipal nº 5451/2002 e artigo 102 e seguintes (Título V – Da Licença Ambiental) e 135, alínea “a” do Decreto Municipal nº 4748/2002.',
        providencias: ['Apresentar a licença de instalação junto ao órgão ambiental competente.'],
        valor: 11980.00,
        penalidade: `${PENALIDADE_CODEMA}.`
    },
    {
        codigo: 'MA-05',
        rotulo: 'Instalar, construir e ampliar atividade poluidora em desacordo com a LP e a LI',
        descricao: 'Iniciar as atividades em desacordo com as condições estabelecidas quando da licença prévia e/ou de instalação.',
        dispositivo: 'Lei Municipal nº 5451/2002 e artigo 102 e seguintes (Título V – Da Licença Ambiental) e 134, alínea “a”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Apresentar o cumprimento das condições estabelecidas quando da licença prévia e/ou de instalação.'],
        valor: 570.00,
        penalidade: `${PENALIDADE_CODEMA}.`
    },
    {
        codigo: 'MA-06',
        rotulo: 'Exercer atividade licenciada em desacordo com a Licença de Operação',
        descricao: 'Operar em desconformidade com as condições estabelecidas na Licença de Operação.',
        dispositivo: 'Lei Municipal nº 5451/2002 e artigo 102 e seguintes (Título V – Da Licença Ambiental) e 135, alínea “b”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Apresentar o cumprimento das condições estabelecidas na Licença de Operação.'],
        valor: 6275.50,
        penalidade: `${PENALIDADE_CODEMA}.`,
        atencaoPosMulta: 'a partir do descumprimento da segunda condicionante será computado um acréscimo de 30% no valor da multa, não podendo ultrapassar o valor máximo de R$ 11.980,00 (onze mil e novecentos e oitenta reais).'
    },
    {
        codigo: 'MA-07',
        rotulo: 'Deixar de atender a convocação para licenciamento ou procedimento corretivo',
        descricao: 'Deixar de atender a convocação para licenciamento ou procedimento corretivo, formulado pelo órgão competente.',
        dispositivo: 'Lei Municipal nº 5451/2002 e artigo 102 e seguintes (Título V – Da Licença Ambiental) e 134, alínea “b”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Apresentar o cumprimento das condições estabelecidas quando da licença prévia e/ou de instalação.'],
        valor: 570.00,
        penalidade: `${PENALIDADE_ART133_I}.`
    },
    {
        codigo: 'MA-08',
        rotulo: 'Poda de árvores',
        descricao: 'Poda de árvores.',
        dispositivo: 'Lei 5451/2002, art. 134, alínea “e”, do Decreto 4748/2002.',
        providencias: ['Apresentar autorização para efetuar a poda emitida pelo órgão ambiental competente com data de emissão anterior ao Auto de Fiscalização.'],
        valor: 312.50,
        penalidade: `${PENALIDADE_CODEMA} por ato.`
    },
    {
        codigo: 'MA-09',
        rotulo: 'Maltrato de árvores',
        descricao: 'Maltrato de árvores.',
        dispositivo: 'Lei 5451/2002, art. 134, alínea “e”, do Decreto 4748/2002.',
        // Nem sempre há providência: o fiscal escreve, se houver
        providencias: [],
        valor: 312.50,
        penalidade: `${PENALIDADE_CODEMA} por ato.`
    },
    {
        codigo: 'MA-10',
        rotulo: 'Supressão ou morte, mesmo que acidental, de árvores',
        descricao: 'Supressão/morte de uma árvore localizada no passeio.',
        dispositivo: 'Lei 5451/2002, art. 134, alínea “g”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Apresentar autorização emitida pelo órgão ambiental competente com data de emissão anterior ao Auto de Fiscalização.'],
        valor: 570.00,
        penalidade: `${PENALIDADE_CODEMA} por indivíduo.`
    },
    {
        codigo: 'MA-11',
        rotulo: 'Sonegar dados ou informações solicitadas pela FUMED ou CODEMA',
        descricao: 'Sonegar dados e/ou informações solicitadas pelo órgão competente e/ou CODEMA.',
        dispositivo: 'Lei Municipal nº 5451/2002, artigos 9 e 135, alínea “c”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Apresentar dados e/ou informações solicitadas pelo órgão competente e/ou CODEMA.'],
        valor: 11980.00,
        penalidade: 'O <strong>NÃO CUMPRIMENTO</strong> do presente Auto de Fiscalização dentro do prazo legal sujeitará o infrator às penalidades previstas pelo artigo 133, II, do Decreto Municipal nº 4748/2002, multa no importe de <strong>R$ {VALOR}</strong> para infrações graves.'
    },
    {
        // Uma infração só, com o tipo de efluente escolhido pelo fiscal
        // (config_af.variante). Descrição, dispositivo e providência vêm do tipo.
        // Os códigos MA-13 e MA-14 eram os tipos separados e não são mais usados.
        codigo: 'MA-12',
        rotulo: 'Emitir ou lançar efluentes líquidos, gasosos ou resíduos sólidos causadores de degradação ambiental',
        descricao: 'Emitir ou lançar efluentes líquidos, gasosos ou resíduos sólidos, causadores de degradação ambiental, em desacordo com a legislação pertinente.',
        dispositivo: '',
        providencias: [],
        valor: 6275.50,
        penalidade: `${PENALIDADE_CODEMA} por ato/imóvel.`,
        variantes: {
            liquidos: {
                nome: 'Efluentes líquidos',
                descricao: 'Emitir ou lançar efluentes líquidos, causadores de degradação ambiental, em desacordo com a legislação pertinente.',
                dispositivo: 'Lei Municipal nº 5451/2002, artigos 32 e seguintes (Capítulo III – Da Poluição Hídrica) e 135, alínea “d”, do Decreto Municipal nº 4748/2002.',
                providencias: ['Paralisar a emissão de efluentes líquidos causadores de degradação ambiental.']
            },
            gasosos: {
                nome: 'Efluentes gasosos',
                descricao: 'Emitir ou lançar efluentes gasosos, causadores de degradação ambiental, em desacordo com a legislação pertinente.',
                dispositivo: 'Lei Municipal nº 5451/2002, artigos 21 e seguintes (Capítulo II – Da Poluição Atmosférica) e 135, alínea “d”, do Decreto Municipal nº 4748/2002.',
                providencias: ['Paralisar a emissão de efluentes gasosos causadores de degradação ambiental.']
            },
            solidos: {
                nome: 'Resíduos sólidos',
                descricao: 'Emitir ou lançar efluentes resíduos sólidos, causadores de degradação ambiental, em desacordo com a legislação pertinente.',
                dispositivo: 'Lei Municipal nº 5451/2002, artigos 52 e seguintes (Capítulo IV – Da Poluição do Solo) e 135, alínea “d”, do Decreto Municipal nº 4748/2002.',
                providencias: ['Paralisar a emissão de efluentes resíduos sólidos causadores de degradação ambiental.']
            }
        }
    },
    {
        codigo: 'MA-15',
        rotulo: 'Deixar de executar análise ou medição solicitada pela FUMED (alínea h)',
        descricao: 'Deixar de executar análise ou medição solicitada pelo órgão competente.',
        dispositivo: 'Lei Municipal nº 5451/ 2002, artigos 13 e seguintes e 135, “h”, do Decreto Municipal nº 4748/2002 e da Lei Municipal nº 5380/2002.',
        providencias: ['Considerando a necessidade de comprovação da adequação dos níveis de emissão sonora decorrente dos equipamentos instalados na área externa do estabelecimento, FICA O RESPONSÁVEL AUTUADO A APRESENTAR LAUDO TÉCNICO DE RUÍDO, elaborado por profissional habilitado, contendo a avaliação dos níveis de pressão sonora emitidos pelos equipamentos utilizados no estabelecimento, de acordo com as legislações vigentes referentes ao tema.'],
        valor: 571.00,
        penalidade: `${PENALIDADE_CODEMA} por solicitação não cumprida.`
    },
    {
        codigo: 'MA-16',
        rotulo: 'Ausência de mecanismos de estabilidade de taludes, rampas e platôs',
        descricao: 'Ausência de mecanismos de manutenção da estabilidade de taludes, rampas e platôs.',
        dispositivo: 'Lei Municipal nº 5451/ 2002, artigo 135, “n”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Apresentar o cumprimento dos mecanismos de manutenção da estabilidade de taludes, rampas e platôs.'],
        valor: 11980.00,
        penalidade: `${PENALIDADE_ART133_II} para infrações graves.`
    },
    {
        codigo: 'MA-17',
        rotulo: 'Solicitação de análise de água',
        descricao: 'Irregularidade relativa ao uso/proteção/conservação dos recursos hídricos.',
        dispositivo: 'Lei Municipal nº 5451/2002 e artigo 12, Parágrafo único, do Decreto Municipal nº 4748/2002.',
        providencias: ['Análise da água, diante da necessidade de esclarecimento técnico uma vez que foram constatadas irregularidades'],
        atencao: 'essa análise deverá observar as determinações e as especificações estabelecidas pelo órgão ambiental municipal.',
        valor: 11980.00,
        penalidade: 'O <strong>NÃO CUMPRIMENTO</strong> do presente Auto de Fiscalização dentro do prazo legal sujeitará o infrator às penalidades previstas no Art. 135, “p”, do Decreto Municipal nº 4748/2002 multa no importe de <strong>R$ {VALOR}</strong>.'
    },
    {
        codigo: 'MA-18',
        rotulo: 'Outdoor – poluição visual',
        descricao: 'Constatamos outdoor em desacordo com a legislação ambiental.',
        dispositivo: 'Lei Municipal nº 5451/2002; artigo 64 do Decreto Municipal nº 4748/2002 (CAPÍTULO V – DA POLUIÇÃO VISUAL EM LOGRADOUROS PÚBLICOS); artigos 11, inciso I e 16 do Decreto 9493/2010 e artigo 111 e seguintes da Lei 6.907/2008.',
        providencias: ['Proceder com a imediata retirada do outdoor no local autuado, instalado no passeio público em desconformidade com a legislação vigente.'],
        upfmd: 10,
        penalidade: 'O <strong>NÃO CUMPRIMENTO</strong> do presente Auto de Fiscalização dentro do prazo legal sujeitará o infrator às penalidades previstas pelo artigo 142, da Lei 6.907/2008, multa no valor de 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: <strong>R$ {VALOR}</strong>. Também será realizada a retirada do Outdoor.'
    },
    {
        codigo: 'MA-19',
        rotulo: 'Depósito ou queima de lixo ao ar livre',
        descricao: 'Em vistoria, constatamos o depósito e/ou queima de lixo ao ar livre.',
        dispositivo: 'Lei Municipal nº 5451/ 2002, artigo 135, “n”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Paralisar e retirar o depósito e/ou queima de lixo ao ar livre.'],
        valor: 570.00,
        penalidade: `${PENALIDADE_CODEMA} por ato.`
    },
    {
        codigo: 'MA-20',
        rotulo: 'Contribuir para que um corpo d’água fique em categoria de qualidade inferior',
        descricao: 'Alteração a qualidade de corpo d’água prevista na classificação oficial.',
        dispositivo: 'Lei Municipal nº 5451/2002, artigos 32 e seguintes (Capítulo III – Da Poluição Hídrica) e 135, alínea “e”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Cessar as irregularidades que causam alteração no corpo d’água.'],
        valor: 571.00,
        penalidade: `${PENALIDADE_ART133_II}.`
    },
    {
        codigo: 'MA-21',
        rotulo: 'Contribuir para que a qualidade do ar seja inferior aos padrões estabelecidos',
        descricao: 'Alteração na qualidade do ar deixando a sua qualidade inferior aos padrões estabelecidos.',
        dispositivo: 'Lei Municipal nº 5451/2002, artigos 21 e seguintes (Capítulo II – Da Poluição Atmosférica) e 135, alínea “f”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Cessar as irregularidades que causam alteração na qualidade do ar.'],
        valor: 571.00,
        penalidade: `${PENALIDADE_ART133_II}.`
    },
    {
        codigo: 'MA-22',
        rotulo: 'Ato que inicie, facilite ou possa provocar incêndio',
        descricao: 'De acordo com denúncia encaminhada a essa Fiscalização, o autuado cometeu ato que iniciou/facilitou/provocou incêndio.',
        dispositivo: 'Lei Municipal nº 5451/2002, artigos 78 e 135, alínea “g”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Paralisar ato que inicie/facilite/provoque incêndio.'],
        valor: 571.00,
        penalidade: `${PENALIDADE_ART133_II}.`
    },
    {
        codigo: 'MA-23',
        rotulo: 'Deixar de executar análise ou medição solicitada pela FUMED (alínea p)',
        descricao: 'Ocorrência de pertubação do sossego/emissão de ruídos provenientes do endereço identificado acima.',
        dispositivo: 'Lei Municipal nº 5451/ 2002, artigos 13 e seguintes e 135, “p”, do Decreto Municipal nº 4748/2002 e da Lei Municipal nº 5380/2002.',
        providencias: ['Comprovação da adequação dos níveis de emissão sonora decorrente dos equipamentos instalados na área externa do estabelecimento;'],
        atencao: 'FICA O RESPONSÁVEL/AUTUADO A APRESENTAR LAUDO TÉCNICO DE RUÍDO, elaborado por profissional habilitado, contendo a avaliação dos níveis de pressão sonora emitidos pelos equipamentos utilizados no estabelecimento, de acordo com as legislações vigentes.',
        valor: 571.00,
        penalidade: `${PENALIDADE_ART133_II}.`
    },
    {
        codigo: 'MA-24',
        rotulo: 'Utilização ou detonação de explosivos sem autorização da FUMED',
        descricao: 'Constatamos a utilização ou detonação de explosivos ou similares sem autorização da FUMED.',
        dispositivo: 'Lei Municipal nº 5451/ 2002, artigos 16 e 135, “i”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Paralisar a utilização ou detonação de explosivos ou similares no local.'],
        valor: 571.00,
        penalidade: `${PENALIDADE_ART133_II}.`
    },
    {
        codigo: 'MA-25',
        rotulo: 'Serviços de construção civil em horário especial sem autorização da FUMED',
        descricao: 'Constatamos a utilização ou detonação de explosivos ou similares sem autorização da FUMED.',
        dispositivo: 'Lei Municipal nº 5451/2002, artigos 14, 15, 18 e 135, “j”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Paralisar a utilização ou detonação de explosivos ou similares no local.'],
        valor: 571.00,
        penalidade: `${PENALIDADE_CODEMA} por ato.`
    },
    {
        codigo: 'MA-26',
        rotulo: 'Ruído de 10 dB a 40 dB acima do permitido',
        descricao: 'Constatamos através do laudo que foi gerado ruído de 10 dB a 40 dB acima do permitido.',
        dispositivo: 'Lei Municipal nº 5451/ 2002, artigos 14, 15 e 135, “k”, do Decreto Municipal nº 4748/2002 e Lei Municipal nº 5380/2002.',
        providencias: ['Suspender o ruído gerado acima do permitido, conforme dispõe o artigo 131, III, do Decreto Municipal nº 4748/2002.'],
        valor: 6275.50,
        penalidade: `${PENALIDADE_CODEMA} por medição.`
    },
    {
        codigo: 'MA-27',
        rotulo: 'Aterro sanitário ou industrial sem proteção das águas superficiais e subterrâneas',
        descricao: 'Aterro sanitário/industrial operando sem medidas necessárias e eficazes para proteção das águas superficiais e subterrâneas.',
        dispositivo: 'Lei Municipal nº 5451/ 2002, artigos 32 e seguintes (Capítulo III – Poluição Hídrica), artigos 52 e seguintes (Capítulo IV – Da Poluição do Solo) e 135, “l”, do Decreto Municipal nº 4748/2002.',
        providencias: [
            'Suspender a atividade, conforme determina o artigo 131, III, do Decreto Municipal nº 4748/2002;',
            'Apresentar o cumprimento da adoção das medidas necessárias e eficazes para proteção das águas superficiais e subterrâneas.'
        ],
        valor: 6275.50,
        penalidade: `${PENALIDADE_CODEMA} por medição.`
    },
    {
        codigo: 'MA-28',
        rotulo: 'Edificação em área com vegetação arbórea sem anuência da FUMED',
        descricao: 'Implantação de edificações em áreas revestidas, total ou parcialmente, por vegetação de porte arbórea sem a prévia anuência do órgão competente.',
        dispositivo: 'Lei Municipal nº 5451/ 2002, artigos 70 e 135, “o”, do Decreto Municipal nº 4748/2002.',
        providencias: ['Suspender a atividade, conforme determina o artigo 131, III, do Decreto Municipal nº 4748/2002 e apresentar a autorização do órgão ambiental competente.'],
        valor: 11980.00,
        penalidade: `${PENALIDADE_ART133_II} para infrações graves.`
    }
];
// ── Textos do Auto de Infração ("Textos Ai") ──────────────────────────────
// ai.penalidade vem logo depois de "MULTA NO VALOR DE R$ {VALOR}"; com
// ai.penalidadeCompleta o texto da multa é todo o template. ai.descricao e
// ai.dispositivo só existem quando o Auto de Infração diz diferente do AF.
const AI_CODEMA = ', conforme Anexo único da Resolução CODEMA nº 01 de 27 de abril de 2023.';
const AI_CODEMA_DISPOE = ', conforme dispõe o Anexo único da Resolução CODEMA nº 01 de 27 de abril de 2023.';
const AI_ART133_II = ', penalidade prevista pelo artigo 133, II, do Decreto Municipal nº 4748/2002.';
const AI_ART133_II_GRAVES = ' para infrações graves, penalidades previstas pelo artigo 133, II, do Decreto Municipal nº 4748/2002.';
const AI_ART133_III = ', conforme art. 133, III do Decreto 4748/2002.';
const AI_GRAVISSIMAS = ', conforme art. 133, III do Decreto 4748/2002, para infrações gravíssimas.';

const TEXTOS_AUTO_INFRACAO_MA = {
    'MA-01': { penalidade: AI_CODEMA },
    'MA-02': { penalidade: AI_CODEMA },
    'MA-03': { penalidade: AI_CODEMA },
    'MA-04': { penalidade: AI_CODEMA },
    'MA-05': { penalidade: AI_CODEMA },
    'MA-06': { penalidade: AI_CODEMA },
    'MA-07': { penalidade: ' para infrações leves, conforme às penalidades previstas pelo artigo 133, I, do Decreto Municipal nº 4748/2002.' },
    'MA-08': { penalidade: ' por ato' + AI_CODEMA },
    'MA-09': { penalidade: ' por ato' + AI_CODEMA },
    'MA-10': { penalidade: ' por indivíduo' + AI_CODEMA },
    'MA-11': { penalidade: AI_ART133_II_GRAVES },
    'MA-12': { penalidade: ' por ato/imóvel' + AI_CODEMA },
    'MA-15': { penalidade: ' por solicitação não cumprida' + AI_CODEMA },
    'MA-16': { penalidade: AI_ART133_II_GRAVES },
    'MA-17': { descricao: 'Solicitação análise de água', penalidade: ', conforme às penalidades previstas no Art. 135, “p”, do Decreto Municipal nº 4748/2002.' },
    'MA-18': { penalidadeCompleta: 'MULTA NO VALOR DE 10 UPFMD (Unidade Padrão Fiscal do Município de Divinópolis), atualmente correspondendo ao valor de: R$ {VALOR}. Será feita também a retirada do Outdoor, conforme às penalidades previstas pelo artigo 142, da Lei 6.907/2008.' },
    'MA-19': { dispositivo: 'Lei Municipal nº 5451/2002, artigos 28 e 134, alínea “d”, do Decreto Municipal nº 4748/2002.', penalidade: ' por ato' + AI_CODEMA },
    'MA-20': { descricao: 'Contribuir para que um corpo de d’água fique em categoria de qualidade inferior à prevista em classificação oficial', penalidade: AI_ART133_II },
    'MA-21': { descricao: 'Contribuir para que um corpo de d’água fique em categoria de qualidade inferior à prevista em classificação oficial', penalidade: AI_ART133_II },
    'MA-22': { descricao: 'Ato que inicie, facilite ou possa provocar incêndio', penalidade: AI_ART133_II },
    'MA-23': { descricao: 'Deixar de executar análise ou medição solicitada pela FUMED (ALÍNEA P)', penalidade: AI_ART133_II },
    'MA-24': { descricao: 'Utilização ou detonação de explosivos ou similares sem autorização da FUMED.', penalidade: AI_ART133_II },
    'MA-25': { penalidade: ' por solicitação não cumprida' + AI_CODEMA },
    'MA-26': { descricao: 'Através do laudo, foi constatado, que foi gerado ruído de 10 dB a 40 dB acima do permitido.', penalidade: ' por medição' + AI_CODEMA },
    'MA-27': { descricao: 'Aterro sanitário ou industrial sem medidas necessárias e eficazes para proteção das águas superficiais e subterrâneas', penalidade: ' por medição' + AI_CODEMA },
    'MA-28': { penalidade: AI_ART133_II_GRAVES }
};
INFRACOES_MEIO_AMBIENTE.forEach(i => { i.ai = TEXTOS_AUTO_INFRACAO_MA[i.codigo] || { penalidade: AI_CODEMA }; });

// ── Infrações que vão direto para o Auto de Infração (sem AF) ──────────────
// O processo nasce na Etapa 14. {REDS} vira o nº do REDS informado pelo fiscal.
const lei5451 = (resto) => `Lei Municipal nº 5451/2002 e ${resto}`;
const INFRACOES_MA_DIRETO_AI = [
    ['MA-29', 'Queimada (REDS)', 'Efetuou limpeza do seu imóvel através de queimada, conforme REDS nº {REDS}.',
        'Lei 5451/2002 e artigos 134, alínea "h" e 140, parágrafo único, do Decreto 4748/2002.', 570.00, AI_CODEMA, { reds: true }],
    ['MA-30', 'Queimada vegetação arbórea (REDS)', 'Efetuou limpeza do seu imóvel através de queimada com vegetação de porte arbóreo, conforme REDS nº {REDS}.',
        lei5451('artigos 135, alínea "q" e 140, parágrafo único, do Decreto 4748/2002.'), 6275.00, AI_CODEMA, { reds: true }],
    ['MA-31', 'Queimada (denúncia)', 'Efetuou limpeza do seu imóvel através de queimada, conforme constatado em vistoria no local após denúncia.',
        'Lei Municipal 5451/2002 e artigos 134, alínea "h" e 140 do Decreto Municipal nº 4748/2002.', 570.00, AI_CODEMA],
    ['MA-32', 'Queimada vegetação arbórea (denúncia)', 'Efetuou limpeza do seu imóvel através de queimada com vegetação de porte arbóreo.',
        lei5451('artigos 135, alínea "q" e 140 do Decreto Municipal nº 4748/2002.'), 6275.00, AI_CODEMA],
    ['MA-33', 'Deixar de executar análise ou medição solicitada pela FUMED (laudo de medição não apresentado)', 'Deixar de executar análise ou medição solicitada pela FUMED.',
        'Lei Municipal nº 5451/2002, artigos 13 e seguintes do Decreto Municipal nº 4.748/2002 e artigos 1º e 2º §§ 1º a 4º da Lei Municipal nº 5.380/2002.', 11980.00, ', conforme dispõe nos artigos 133, II e 135, “p” do Decreto 4748/2002.'],
    ['MA-34', 'Descumprimento de condicionantes do licenciamento ambiental (CODEMA)', 'Descumprir determinação formulada pela plenária do CODEMA, inclusive Plano de Controle Ambiental, medidas mitigadoras, de monitoração, ou equivalentes, aprovadas quando do licenciamento.',
        'Lei 5451/2002 e artigos 136, alínea "b" do Decreto 4748/2002.', 25000.00, AI_ART133_III],
    ['MA-35', 'Intervenção/degradar área de preservação permanente', 'Degradar área de preservação permanente.',
        'Lei 5451/2002 e artigos 65, VIII e 136, alínea "t".', 18490.50, AI_CODEMA],
    ['MA-36', 'Iniciar atividades sem licença ambiental de operação', 'Dar início ou prosseguir atividade efetiva ou potencialmente poluidora, ou degradadora do meio ambiente sem a Licença de Operação.',
        lei5451('artigo 102 e seguintes (Título V – Da Licença Ambiental) e 136, alínea “a”, do Decreto Municipal nº 4748/2002.'), 25000.00, AI_ART133_III],
    ['MA-37', 'Descumprir total ou parcialmente Termo de Compromisso ou de Ajustamento de Conduta', 'Descumprimento do Termo de Compromisso e/ou de Ajustamento de Conduta.',
        lei5451('artigo 136, alínea “c”, do Decreto Municipal nº 4748/2002.'), 11981.00, AI_GRAVISSIMAS],
    ['MA-38', 'Obstar ou dificultar ação fiscalizadora', 'Obstou/dificultou a ação fiscalizadora.',
        lei5451('artigos 9 e 136, alínea “d”, do Decreto Municipal nº 4748/2002.'), 11981.00, AI_GRAVISSIMAS],
    ['MA-39', 'Prestar informação falsa ou adulterar dado técnico', 'Prestar informação falsa e/ou adulterar dado técnico.',
        lei5451('artigos 128 e seguintes (Título VII – Dos registros dos Técnicos e Empresas) e 136, alínea “e”, do Decreto Municipal nº 4748/2002.'), 11981.00, AI_GRAVISSIMAS],
    ['MA-40', 'Causar poluição ou degradação que provoque mortandade de mamíferos, aves, répteis, anfíbios ou peixes', 'Causar poluição ou degradação que provoque mortandade de mamíferos, aves, répteis, anfíbios ou peixes.',
        lei5451('artigos 44, parágrafo único e 136, alínea “g”, do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-41', 'Causar poluição ou degradação com efeitos adversos à biota nativa, plantas cultivadas ou criações de animais', 'Causar poluição ou degradação que provoque destruição ou outros efeitos adversos a biota nativa ou às plantas cultivadas e às criações de animais.',
        lei5451('artigos 65 (Capítulo I – Da Fauna e Flora) e 136, alínea “f”, do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-42', 'Causar poluição ou degradação ambiental que possa trazer dano à saúde humana', 'Causar poluição ou degradação ambiental que possa trazer dano a saúde humana',
        lei5451('artigos 2º, III, “a”, 3º e 136, alínea “h”, do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-43', 'Causar poluição hídrica que torne necessária a interrupção do abastecimento público de água', 'Causar poluição hídrica que torne necessária a interrupção do abastecimento público de água',
        lei5451('artigos 2º, III, “g”, 3º e 136, alínea “i”, do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-44', 'Causar poluição atmosférica que provoque a retirada dos habitantes de um quarteirão ou comunidade', 'Causar poluição atmosférica que provoque a retirada ainda que momentânea dos habitantes de um quarteirão urbana ou comunidade equivalente.',
        lei5451('artigos 2º, III, “a”, 3º e 136, alínea “j”, do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-45', 'Causar poluição ou degradação do solo que torne a área imprópria para a ocupação humana', 'Causar poluição ou degradação do solo, que torne uma área urbana ou rural, imprópria para a ocupação humana',
        lei5451('artigos 2º, III, “a”, 3º e 136, alínea “k”, do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-46', 'Ferir, matar ou capturar espécies raras da biota regional nas Unidades de Conservação', 'Ferir, matar ou capturar por quaisquer meios nas Unidades de Conservação, exemplar de espécies consideradas raras da biota regional',
        lei5451('artigos 2º, VII, 3º e 136, alínea “l”, do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-47', 'Degradação por assoreamento ou erosão acelerada nas Unidades de Conservação', 'Realizar atividades que causam degradação ambiental, mediante assoreamento de coleções de água ou erosão acelerada nas Unidades de Conservação',
        lei5451('artigos 2º, VII, 3º e 136, alínea “m”, do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-48', 'Maltrato de árvores (sem Auto de Fiscalização)', 'Maltrato de árvores.',
        'Lei Municipal nº 5451/2002, artigos 134, alínea “e” e 140 do Decreto Municipal nº 4748/2002.', 312.50, ' por ato' + AI_CODEMA_DISPOE],
    ['MA-49', 'Praticar ato que inicie ou possa iniciar incêndio em formações vegetais nas Unidades de Conservação', 'Praticar ato que inicie ou possa iniciar incêndio em formações vegetais nas Unidades de Conservação.',
        lei5451('artigos 2º, VII, 3º e 136, alínea “n”, do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-50', 'Desrespeitar intervenção de uso ou de passagem nas Unidades de Conservação', 'Desrespeitar intervenção de uso, de passagem, ou outras estabelecidas administrativamente nas Unidades de Conservação.',
        lei5451('artigos 2º, VII, 3º e 136, alínea “o” do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-51', 'Suprimir ou danificar árvore declarada imune de corte', 'Desrespeitar intervenção de uso, de passagem, ou outras estabelecidas administrativamente nas Unidades de Conservação.',
        lei5451('artigos 81, 136, alínea “p” e 140 do Decreto Municipal nº 4748/2002.'), 18490.50, AI_CODEMA_DISPOE],
    ['MA-52', 'Transportar, estocar ou manipular explosivos ou materiais perigosos sem autorização da FUMED', 'Transportar, estocar e manipular explosivos, materiais tóxicos, radioativos ou potencialmente perigosos à saúde pública ou ao bem-estar da comunidade, sem autorização do órgão competente.',
        lei5451('artigos 16 e 136, alínea “q” do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-53', 'Emitir mais de 40 dB acima do limite permitido', 'Emitir mais de 40 dB (quarenta decibéis) acima do limite permitido.',
        lei5451('artigos 16 e 136, alínea “r” do Decreto Municipal nº 4748/2002.'), 18490.50, AI_CODEMA_DISPOE],
    ['MA-54', 'Implantação de projetos de parcelamento de solo sem autorização do CODEMA', 'Implantação de projetos de parcelamento de solo sem autorização do CODEMA.',
        lei5451('artigo 136, alínea “s” do Decreto Municipal nº 4748/2002.'), 25000.00, AI_CODEMA_DISPOE],
    ['MA-55', 'Degradar área de preservação permanente', 'Degradar área de preservação permanente.',
        lei5451('artigos 69 e 136, alínea “t” do Decreto Municipal nº 4748/2002.'), 18490.50, AI_CODEMA_DISPOE],
    ['MA-56', 'Destruir, inutilizar ou deteriorar bem ou arquivo especialmente protegido', '',
        lei5451('artigo 136, alínea “u” do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS, {
            variantes: {
                bem: {
                    nome: 'I – Bem especialmente protegido',
                    descricao: 'Destruir, inutilizar ou deteriorar bem especialmente protegido por lei, ato administrativo ou decisão judicial.'
                },
                arquivo: {
                    nome: 'II – Arquivo, registro, museu, biblioteca ou similar',
                    descricao: 'Destruir, inutilizar ou deteriorar arquivo, registro, museu, biblioteca, pinacoteca, instalação científica ou similar protegida por lei, ato administrativo ou decisão judicial.'
                }
            }
        }],
    ['MA-57', 'Alterar edificação ou local especialmente protegido sem autorização', 'Alterar o aspecto ou estrutura de edificação ou local especialmente protegido por lei, ato administrativo ou decisão judicial, em razão de seu valor paisagístico, ecológico, turístico, artístico, histórico, cultural, religioso, arqueológico, etnográfico ou monumental, sem autorização de autoridade competente ou em desacordo com a concedida.',
        lei5451('artigo 136, alínea “v” do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-58', 'Pichar, grafitar ou conspurcar edificação ou monumento urbano', 'Pichar, grafitar ou por outro meio conspurcar edificação ou monumento urbano.',
        lei5451('artigo 136, alínea “x” do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS],
    ['MA-59', 'Promover construção em solo não edificável sem autorização', 'Promover construção em solo não edificável, ou no seu entorno, assim considerado em razão de seu valor paisagístico, ecológico, turístico, artístico, histórico, cultural, religioso, arqueológico, etnográfico ou monumental, sem autorização de autoridade competente ou em desacordo com a concedida.',
        lei5451('artigo 136, alínea “y” do Decreto Municipal nº 4748/2002.'), 25000.00, AI_GRAVISSIMAS]
];
INFRACOES_MA_DIRETO_AI.forEach(([codigo, rotulo, descricao, dispositivo, valor, penalidadeAI, extra]) => {
    INFRACOES_MEIO_AMBIENTE.push({
        codigo, rotulo, descricao, dispositivo, valor,
        semAF: true,
        providencias: [],
        penalidade: '',
        ai: { penalidade: penalidadeAI },
        ...(extra || {})
    });
});

window.INFRACOES_MEIO_AMBIENTE = INFRACOES_MEIO_AMBIENTE;

// Acha a infração pelo código (MA-01), que vai no valor do checkbox e na
// descrição do catálogo, ou pelo rótulo/descrição (o Auto de Infração passa o
// texto já "traduzido" por obterDescricaoInfracao).
window.encontrarInfracaoMeioAmbiente = function (texto) {
    if (!texto) return null;
    const str = String(texto);
    const m = str.match(/\bMA-(\d{2})\b/i);
    if (m) return INFRACOES_MEIO_AMBIENTE.find(i => i.codigo === `MA-${m[1]}`) || null;
    const alvo = normalizarTextoMA(str);
    return INFRACOES_MEIO_AMBIENTE.find(i => normalizarTextoMA(i.rotulo) === alvo)
        || INFRACOES_MEIO_AMBIENTE.find(i => normalizarTextoMA(i.descricao) === alvo)
        || null;
};

// Processo aberto por Fiscal de Meio Ambiente. O setor é gravado na criação;
// os códigos MA-xx cobrem processo gravado antes disso.
window.processoEhMeioAmbiente = function (proc) {
    const p = proc || (typeof processoAtual !== 'undefined' ? processoAtual : null);
    if (!p) return false;
    if (p.dados?.setor === 'meio_ambiente') return true;
    const disps = p.dados?.infracoes?.dispositivos;
    return Array.isArray(disps) && disps.some(d => /^MA-\d{2}$/i.test(String(d).trim()));
};

// ── Multa ──────────────────────────────────────────────────────────────────
window.valorPadraoMultaMeioAmbiente = function (item, upfmd) {
    if (!item) return 0;
    if (item.upfmd) {
        const u = parseFloat(upfmd) || window.valorUpfmdAtual || 0;
        return Math.round(item.upfmd * u * 100) / 100;
    }
    return item.valor || 0;
};

function formatarMoedaMA(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Configuração do fiscal por infração ────────────────────────────────────
// Gravada no wizard em dados.infracoes.config_af[codigo]:
//   { modo: 'imediato' | 'prazo', dias, uteis, variante? }
// variante: só no MA-12 (liquidos | gasosos | solidos).
window.obterConfigAutoFiscalizacao = function (proc, item) {
    const p = proc || (typeof processoAtual !== 'undefined' ? processoAtual : null);
    const cfg = p?.dados?.infracoes?.config_af?.[item?.codigo] || {};
    return {
        modo: cfg.modo === 'prazo' ? 'prazo' : 'imediato',
        dias: parseInt(cfg.dias, 10) || 0,
        uteis: !!cfg.uteis,
        variante: cfg.variante || '',
        reds: cfg.reds || '',
        protocolo: cfg.protocolo || ''
    };
};

// Nº do protocolo municipal da defesa ("protocolada via protocolo municipal n° …"),
// informado pelo fiscal em cada infração. O Auto de Fiscalização tem uma linha só
// para todas as infrações: junta os números diferentes.
window.protocolosAutoFiscalizacao = function (proc) {
    const p = proc || (typeof processoAtual !== 'undefined' ? processoAtual : null);
    const config = p?.dados?.infracoes?.config_af || {};
    const disps = p?.dados?.infracoes?.dispositivos || Object.keys(config);
    return [...new Set(disps.map(c => String(config[c]?.protocolo || '').trim()).filter(Boolean))];
};

window.textoProtocoloDefesaMA = function (proc) {
    const lista = window.protocolosAutoFiscalizacao(proc);
    return lista.length ? ` n° <strong>${lista.map(escaparHtmlMA).join(', ')}</strong>` : '';
};

// A infração com os textos do tipo escolhido (MA-12); as demais voltam iguais.
window.resolverInfracaoMeioAmbiente = function (proc, item) {
    if (!item || !item.variantes) return item;
    const cfg = window.obterConfigAutoFiscalizacao(proc, item);
    const variante = item.variantes[cfg.variante];
    return variante ? { ...item, ...variante } : item;
};

// Dias de prazo de cumprimento e se contam em dias úteis, para o cálculo do
// vencimento da notificação. null = não é infração de Meio Ambiente.
window.prazoAutoFiscalizacao = function (proc, descricaoOuCodigo) {
    const item = window.resolverInfracaoMeioAmbiente(proc, window.encontrarInfracaoMeioAmbiente(descricaoOuCodigo));
    if (!item) return null;
    const cfg = window.obterConfigAutoFiscalizacao(proc, item);
    if (cfg.modo !== 'prazo' || !item.providencias.length) return { dias: 0, uteis: false };
    return { dias: cfg.dias, uteis: cfg.uteis };
};

function escaparHtmlMA(txt) {
    return String(txt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Monta o texto de um Auto de Fiscalização (o que fica abaixo do número).
//   valorMulta: o valor final (calculado ou digitado no card de multas)
window.montarTextoAutoFiscalizacao = function (proc, itemCatalogo, valorMulta) {
    const item = window.resolverInfracaoMeioAmbiente(proc, itemCatalogo);
    const cfg = window.obterConfigAutoFiscalizacao(proc, item);
    const providencias = item.providencias;

    let prazoHtml = '';
    if (providencias.length) {
        prazoHtml = cfg.modo === 'prazo'
            ? `<p style="margin:10px 0 6px 0;">O autuado tem o prazo de até <strong>${cfg.dias} DIAS${cfg.uteis ? ' ÚTEIS' : ''}</strong> para tomar as providências:</p>`
            : '<p style="margin:10px 0 6px 0;">O autuado deverá adotar <strong>de imediato</strong> as providências exigidas:</p>';
        prazoHtml += `<ul style="margin: 6px 0 10px 0; padding-left: 20px;">${providencias.map(p => `<li>${escaparHtmlMA(p)}</li>`).join('')}</ul>`;
    }

    const penalidade = item.penalidade.replace('{VALOR}', formatarMoedaMA(valorMulta));

    return `
        <p style="margin:4px 0;">${escaparHtmlMA(item.descricao)}</p>
        <p style="margin:6px 0;"><strong>Dispositivo(s) legal(is) transgredido(s):</strong> ${escaparHtmlMA(item.dispositivo)}</p>
        ${prazoHtml}
        ${item.atencao ? `<p style="margin:6px 0; text-align:justify;"><strong>Atenção:</strong> ${escaparHtmlMA(item.atencao)}</p>` : ''}
        <p style="margin:10px 0 0 0; text-align:justify;">${penalidade}</p>
        ${item.atencaoPosMulta ? `<p style="margin:6px 0 0 0; text-align:justify;"><strong>Atenção:</strong> ${escaparHtmlMA(item.atencaoPosMulta)}</p>` : ''}
    `;
};

// ── Corpo do Auto de Infração (Meio Ambiente) ─────────────────────────────
// Segue o "Modelo completo A iNFRAÇÃO". opts:
//   valor, numeroAF (nº do Auto de Fiscalização, quando houve), dataVerificacao
//   (dd/mm/aaaa), numeroProtocolo, prazoDefesa, tabelasHtml (contribuinte e
//   imóvel) e observacoesHtml (nota do fiscal).
window.montarCorpoAutoInfracaoMA = function (proc, itemCatalogo, opts = {}) {
    const item = window.resolverInfracaoMeioAmbiente(proc, itemCatalogo);
    const cfg = window.obterConfigAutoFiscalizacao(proc, itemCatalogo);
    const ai = itemCatalogo.ai || {};
    const temVariante = !!(itemCatalogo.variantes && item !== itemCatalogo);

    let descricao = (temVariante ? item.descricao : (ai.descricao || itemCatalogo.descricao)) || '';
    descricao = descricao.replace('{REDS}', cfg.reds || 'XX').trim();
    const dispositivo = ai.dispositivo || item.dispositivo;
    const valorFmt = formatarMoedaMA(opts.valor);
    const multa = ai.penalidadeCompleta
        ? ai.penalidadeCompleta.replace('{VALOR}', valorFmt)
        : `MULTA NO VALOR DE R$ ${valorFmt}${ai.penalidade || AI_CODEMA}`;
    const data = escaparHtmlMA(opts.dataVerificacao || 'XX/XX/XXXX');

    const fato = itemCatalogo.semAF
        ? `Foi verificado na data <strong>${data}</strong>, o seguinte fato constitutivo da infração: <strong>${escaparHtmlMA(descricao.replace(/\.$/, ''))}</strong>.`
        : `Na data <strong>${data}</strong> foi verificado: o não cumprimento das providências solicitadas no Auto de Fiscalização nº: <strong>${escaparHtmlMA(opts.numeroAF || 'XX')}</strong> - ${escaparHtmlMA(descricao)}`;

    return `
        <div style="font-size: 10pt; line-height: 1.35; color: #000; margin-top: 10px;">
            ${opts.tabelasHtml || ''}
            <p style="margin: 0 0 8px 0; text-align: justify;">${fato}</p>
            <p style="margin: 0 0 8px 0; text-align: justify;">O motivo da infração é baseado na <strong>${escaparHtmlMA(dispositivo)}</strong></p>
            <p style="margin: 0 0 10px 0; text-align: justify; font-weight: bold;">${escaparHtmlMA(multa)}</p>
            ${opts.observacoesHtml || ''}
            <p style="margin: 0 0 8px 0; text-align: justify;">
                O autuado tem o prazo de <strong>${escaparHtmlMA(opts.prazoDefesa || '20 DIAS')}</strong> para apresentação de defesa, protocolada via protocolo municipal n° <strong>${escaparHtmlMA(cfg.protocolo || opts.numeroProtocolo || 'XXX')}</strong>.
            </p>
            <div style="margin: 0 0 10px 0;">${window.htmlInstrucoesDefesaMeioAmbiente()}</div>
        </div>
    `;
};

// Infrações sem Auto de Fiscalização abrem o processo direto no Auto de Infração
window.infracaoMeioAmbienteVaiDiretoAoAuto = function (codigoOuTexto) {
    return !!window.encontrarInfracaoMeioAmbiente(codigoOuTexto)?.semAF;
};

// ── Textos fixos do Auto de Fiscalização ──────────────────────────────────
const URL_PROTOCOLO_BETHA = 'https://protocolo.betha.cloud/#/cidadao/solicitacao-abertura/ZGF0YWJhc2U6MTE5NyxlbnRpZGFkZToxMDA2NQ==';
const URL_MANUAL_PROTOCOLO = 'https://servicos.prefeituradivinopolis.com.br/govdigital/adm/external/doc/global/Manual%20de%20Consulta%20a%20Protocolos_1.pdf';

window.htmlInstrucoesDefesaMeioAmbiente = function () {
    return `
        <p style="margin:8px 0 2px 0;">Passo a passo para inserir sua defesa no protocolo: ${URL_PROTOCOLO_BETHA}</p>
        <div style="margin:0 0 0 0;">1) Crie um acesso ou entre com login;</div>
        <div>2) Vá em "Gestão de Processos" no canto esquerdo da tela;</div>
        <div>3) Clique em "Visualizar meus Processos";</div>
        <div>4) Localize o número do protocolo indicado na Notificação ou Auto de Fiscalização ou Auto de Infração;</div>
        <div>5) Clique na aba "Documentos" e inserira a defesa e os documentos;</div>
        <div>6) Clique na aba "Comentários" e insira as alegações e os demais documentos.</div>
        <div>7) Clique em "Movimentar" e "Devolver ao Solicitante".</div>
        <div style="margin-top:4px;">Em caso de dúvidas, acesse o manual através do link:</div>
        <div style="word-break: break-all;">${URL_MANUAL_PROTOCOLO}</div>
    `;
};

window.PRAZO_DEFESA_AUTO_FISCALIZACAO = '20 DIAS ÚTEIS';

// Subtítulo dos documentos ("Fiscalização de Posturas" / "de Meio Ambiente")
window.subtituloFiscalizacao = function (proc) {
    return window.processoEhMeioAmbiente(proc) ? 'Fiscalização de Meio Ambiente' : 'Fiscalização de Posturas';
};

// ── "Notificação Preliminar" → "Auto de Fiscalização" na interface ────────
// Em processo de Meio Ambiente, o documento da Etapa 1 é o Auto de Fiscalização,
// mas as telas das etapas, avisos, alerts e nomes de etapa (que vêm do banco)
// falam em Notificação Preliminar em centenas de lugares. Em vez de duplicar
// cada texto, a troca é feita no que aparece na tela, com a concordância
// ("da Notificação Preliminar" → "do Auto de Fiscalização").
// Só o texto exibido muda: dados gravados (documentos.tipo, condições do
// histórico, situação) continuam com os nomes de sempre.
const LETRA_MA = 'A-Za-zÀ-ÿ';
const TERMO_NP = '(Notificação Preliminar|Notificação preliminar|notificação preliminar|NOTIFICAÇÃO PRELIMINAR|NP)';
const TERMO_NPS = '(Notificações Preliminares|notificações preliminares|NOTIFICAÇÕES PRELIMINARES)';

function termoAutoFiscalizacao(termo) {
    if (termo === 'NP') return 'AF';
    if (termo === 'NOTIFICAÇÃO PRELIMINAR') return 'AUTO DE FISCALIZAÇÃO';
    if (termo === 'notificação preliminar') return 'auto de fiscalização';
    if (termo === 'NOTIFICAÇÕES PRELIMINARES') return 'AUTOS DE FISCALIZAÇÃO';
    if (termo === 'notificações preliminares') return 'autos de fiscalização';
    if (termo === 'Notificações Preliminares') return 'Autos de Fiscalização';
    return 'Auto de Fiscalização';
}

// Artigo/preposição feminino → masculino, mantendo a maiúscula
const ARTIGOS_MA = {
    a: 'o', da: 'do', na: 'no', pela: 'pelo', 'à': 'ao', uma: 'um', numa: 'num',
    as: 'os', das: 'dos', nas: 'nos', pelas: 'pelos', 'às': 'aos',
    esta: 'este', essa: 'esse', nesta: 'neste', nessa: 'nesse', desta: 'deste', dessa: 'desse',
    estas: 'estes', essas: 'esses', destas: 'destes', dessas: 'desses',
    sua: 'seu', suas: 'seus', nenhuma: 'nenhum', toda: 'todo', todas: 'todos', outra: 'outro', outras: 'outros'
};

// "Notificação" sozinha também é o documento da Etapa 1 (cada infração gera uma).
const TERMO_NOTIF = '(Notificações|notificações|NOTIFICAÇÕES|Notificação|notificação|NOTIFICAÇÃO)(\\(ões\\))?';
function termoNotificacaoSozinha(termo, plural) {
    const ehPlural = /ões$/i.test(termo);
    const maiusculo = termo === termo.toUpperCase();
    if (plural) return maiusculo ? 'AUTO(S) DE FISCALIZAÇÃO' : 'Auto(s) de Fiscalização';
    if (maiusculo) return ehPlural ? 'AUTOS DE FISCALIZAÇÃO' : 'AUTO DE FISCALIZAÇÃO';
    return ehPlural ? 'Autos de Fiscalização' : 'Auto de Fiscalização';
}

// Expressões em que "notificação" não é o documento da Etapa 1
const EXPRESSOES_PROTEGIDAS_MA = /(Decreto(?: Municipal)? de [Nn]otificação|Decreto [Nn]otificação|Edital de [Nn]otificação|Central de Notificações)/g;
function artigoMasculino(art) {
    const m = ARTIGOS_MA[art.toLowerCase()];
    if (!m) return art;
    if (art === art.toUpperCase()) return m.toUpperCase();
    return art[0] === art[0].toUpperCase() ? m[0].toUpperCase() + m.slice(1) : m;
}

const ARTIGOS_RE = Object.keys(ARTIGOS_MA).join('|');
const REGRAS_AUTO_FISCALIZACAO = [
    // artigo + (presente/nova/mesma) + termo
    [new RegExp(`(?<![${LETRA_MA}])(${ARTIGOS_RE}) (presente |nova |mesma |própria )?${TERMO_NPS}`, 'gi'),
        (m, art, adj, termo) => `${artigoMasculino(art)} ${adj ? adjMasc(adj) : ''}${termoAutoFiscalizacao(termo)}`],
    [new RegExp(`(?<![${LETRA_MA}])(${ARTIGOS_RE}) (presente |nova |mesma |própria )?${TERMO_NP}(?![${LETRA_MA}])`, 'gi'),
        (m, art, adj, termo) => /^np$/i.test(termo) && termo !== 'NP'
            ? m
            : `${artigoMasculino(art)} ${adj ? adjMasc(adj) : ''}${termoAutoFiscalizacao(termo)}`],
    [new RegExp(TERMO_NPS, 'g'), (m, termo) => termoAutoFiscalizacao(termo)],
    [new RegExp(`(?<![${LETRA_MA}])${TERMO_NP}(?![${LETRA_MA}])`, 'g'), (m, termo) => termoAutoFiscalizacao(termo)],
    // "notificação" sozinha, com artigo e sem
    [new RegExp(`(?<![${LETRA_MA}])(${ARTIGOS_RE})(\\(s\\))? (nova |mesma |própria )?${TERMO_NOTIF}(?![${LETRA_MA}])`, 'gi'),
        (m, art, artPlural, adj, termo, plural) => `${artigoMasculino(art)}${artPlural || ''} ${adj ? adjMasc(adj) : ''}${termoNotificacaoSozinha(termo, plural)}`],
    [new RegExp(`(?<![${LETRA_MA}])${TERMO_NOTIF}(?![${LETRA_MA}])`, 'g'),
        (m, termo, plural) => termoNotificacaoSozinha(termo, plural)],
    // adjetivo depois do termo: "Auto de Fiscalização assinada" → "assinado"
    [/((?:Autos?|AUTOS?|autos?|Auto\(s\)) de [Ff]iscalização|AF) (assinad|enviad|anexad|gerad|recebid|encerrad|emitid|vencid|cumprid|atendid|vinculad|selecionad|relacionad|expedid|lavrad|finalizad|verificad|efetivad|movid|criad|cadastrad|notificad)a(s?)(?![A-Za-zÀ-ÿ])/g,
        (m, termo, raiz, plural) => `${termo} ${raiz}o${plural}`],
    [/((?:Autos?|AUTOS?|autos?|Auto\(s\)) de [Ff]iscalização|AF) (Assinad|Enviad|Anexad|Gerad|Recebid|Encerrad|Emitid|Vencid|Finalizad|Efetivad)a(s?)(?![A-Za-zÀ-ÿ])/g,
        (m, termo, raiz, plural) => `${termo} ${raiz}o${plural}`],
    // "os Autos de Fiscalização foram atendidas" → "atendidos"
    [/(Autos de Fiscalização[^.!?\n]{0,40}? (?:foram|estão|ficaram|forem|serão|sejam) )(atendid|verificad|encerrad|vencid|cumprid|finalizad)as(?![A-Za-zÀ-ÿ])/g,
        (m, inicio, raiz) => `${inicio}${raiz}os`],
    [/(Auto de Fiscalização [A-Za-zÀ-ÿ]+o) \/ ([A-Za-zÀ-ÿ]+d)a(?![A-Za-zÀ-ÿ])/g, (m, inicio, raiz) => `${inicio} / ${raiz}o`],
    [/(Auto de Fiscalização) (da|na) qual/g, (m, termo, art) => `${termo} ${art === 'da' ? 'do' : 'no'} qual`],
    [/(?<![A-Za-zÀ-ÿ])([Tt])odas os /g, (m, t) => `${t}odos os `]
];

function adjMasc(adj) {
    const mapa = { 'presente ': 'presente ', 'nova ': 'novo ', 'mesma ': 'mesmo ', 'própria ': 'próprio ' };
    const chave = adj.toLowerCase();
    const trocado = mapa[chave] || adj;
    return adj[0] === adj[0].toUpperCase() ? trocado[0].toUpperCase() + trocado.slice(1) : trocado;
}

window.trocarTermosAutoFiscalizacao = function (texto) {
    if (typeof texto !== 'string' || !texto) return texto;
    if (!/notifica|NP/i.test(texto)) return texto;
    const protegidas = [];
    const semExpressoes = texto.replace(EXPRESSOES_PROTEGIDAS_MA, (m) => `\u0000${protegidas.push(m) - 1}\u0000`);
    return REGRAS_AUTO_FISCALIZACAO
        .reduce((t, [re, sub]) => t.replace(re, sub), semExpressoes)
        .replace(/\u0000(\d+)\u0000/g, (m, i) => protegidas[i]);
};

const ATRIBUTOS_TEXTO_MA = ['title', 'placeholder', 'aria-label', 'data-placeholder'];

// Troca os termos nos textos e atributos visíveis de `raiz` (sem mexer em campos
// de digitação, para não atrapalhar o cursor de quem está escrevendo).
window.aplicarTermosAutoFiscalizacao = function (raiz) {
    if (!raiz) return;
    // Chat e central de notificações (sino) falam de outro tipo de "notificação"
    const ehIgnorado = (el) => !!el && (el.closest('script, style, textarea, [contenteditable="true"], [data-sem-troca-af], '
        + '.chat-drawer, .chat-drawer-overlay, #dropdownNotificacoes, [onclick*="DropdownNotificacoes"]') !== null);
    if (raiz.nodeType === Node.TEXT_NODE) {
        if (!ehIgnorado(raiz.parentElement)) {
            const novo = window.trocarTermosAutoFiscalizacao(raiz.nodeValue);
            if (novo !== raiz.nodeValue) raiz.nodeValue = novo;
        }
        return;
    }
    if (raiz.nodeType !== Node.ELEMENT_NODE && raiz.nodeType !== Node.DOCUMENT_NODE) return;
    const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const textos = [];
    while (walker.nextNode()) textos.push(walker.currentNode);
    textos.forEach(n => {
        if (ehIgnorado(n.parentElement)) return;
        const novo = window.trocarTermosAutoFiscalizacao(n.nodeValue);
        if (novo !== n.nodeValue) n.nodeValue = novo;
    });
    const elementos = raiz.nodeType === Node.ELEMENT_NODE ? [raiz, ...raiz.querySelectorAll('*')] : [...raiz.querySelectorAll('*')];
    elementos.forEach(el => {
        ATRIBUTOS_TEXTO_MA.forEach(attr => {
            const v = el.getAttribute(attr);
            if (v) {
                const novo = window.trocarTermosAutoFiscalizacao(v);
                if (novo !== v) el.setAttribute(attr, novo);
            }
        });
    });
};

// Liga a troca na página inteira: o que já está na tela, o que for desenhado
// depois (MutationObserver), os alert/confirm/prompt e o título da aba.
let trocaAutoFiscalizacaoAtiva = false;
window.ativarTermosAutoFiscalizacaoNaPagina = function () {
    if (trocaAutoFiscalizacaoAtiva || !document.body) return;
    trocaAutoFiscalizacaoAtiva = true;

    window.aplicarTermosAutoFiscalizacao(document.body);
    document.title = window.trocarTermosAutoFiscalizacao(document.title);

    const observador = new MutationObserver(mutacoes => {
        mutacoes.forEach(m => {
            if (m.type === 'childList') m.addedNodes.forEach(n => window.aplicarTermosAutoFiscalizacao(n));
            else if (m.type === 'attributes' && m.target.nodeType === Node.ELEMENT_NODE) {
                const v = m.target.getAttribute(m.attributeName);
                const novo = window.trocarTermosAutoFiscalizacao(v);
                if (v && novo !== v) m.target.setAttribute(m.attributeName, novo);
            }
        });
    });
    observador.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ATRIBUTOS_TEXTO_MA });

    ['alert', 'confirm', 'prompt'].forEach(nome => {
        const original = window[nome].bind(window);
        window[nome] = (msg, ...resto) => original(window.trocarTermosAutoFiscalizacao(String(msg ?? '')), ...resto);
    });
};

// ── Fiscal contribuidor (só no Relatório Fiscal) ──────────────────────────
// Contribuidores gravados no processo: a lista nova (fiscais_contribuidores) ou,
// em processo antigo, o único fiscal_contribuidor
window.contribuidoresDoProcesso = function (dados) {
    const d = dados || {};
    if (Array.isArray(d.fiscais_contribuidores)) return d.fiscais_contribuidores.filter(f => f && f.nome);
    return d.fiscal_contribuidor?.nome ? [d.fiscal_contribuidor] : [];
};

// Assinaturas do autor e dos contribuidores, 2 por linha (a última, se sobrar
// uma, fica centralizada). Sem contribuidor, devolve '' e quem chama mantém a
// assinatura de sempre.
window.htmlAssinaturasRelatorioComContribuidor = function (autor, contribuidores) {
    const lista = (Array.isArray(contribuidores) ? contribuidores : [contribuidores]).filter(f => f && f.nome);
    if (!lista.length) return '';
    const bloco = (f, largura) => `
        <td width="${largura}" align="center" valign="top" style="padding: 0 8px;">
            <p style="margin:0;">______________________________</p>
            <p style="margin:5px 0 0 0;"><strong>${escaparHtmlMA(f.nome)}</strong></p>
            <p style="margin:2px 0 0 0;">${escaparHtmlMA(f.cargo || CARGO_FISCAL_MEIO_AMBIENTE)}</p>
            <p style="margin:2px 0 0 0;">Matrícula: ${escaparHtmlMA(f.matricula || 'XXXXXXXX')}</p>
        </td>`;
    const todos = [autor, ...lista];
    const linhas = [];
    for (let i = 0; i < todos.length; i += 2) {
        const par = todos.slice(i, i + 2);
        const espaco = i === 0 ? '' : 'margin-top: 40px;';
        linhas.push(`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${espaco} page-break-inside: avoid;"><tr>${par.length === 2
            ? bloco(par[0], '50%') + bloco(par[1], '50%')
            : bloco(par[0], '100%')}</tr></table>`);
    }
    return linhas.join('');
};

// Outros Fiscais de Meio Ambiente ativos, para o select do wizard
window.carregarFiscaisMeioAmbiente = async function (idExcluir) {
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('id, nome, matricula, cargo, cpf, ativo')
            .ilike('cargo', '%meio ambiente%')
            .order('nome');
        if (error) throw error;
        return (data || []).filter(p => p.ativo !== false && window.ehCargoMeioAmbiente(p.cargo) && p.id !== idExcluir);
    } catch (err) {
        console.warn('Erro ao carregar Fiscais de Meio Ambiente:', err);
        return [];
    }
};
