// ============================================================================
// INSTRUÇÕES (aba do painel)
// ============================================================================
// Um índice com uma instrução por etapa. Cada instrução tem objetivo, passos e
// um checklist próprio. O checklist fica salvo neste navegador, separado por
// instrução (localStorage), e só a própria pessoa vê.
//
// cargos: cargos normalizados (normalizarCargo, em solicitacoes.js) que
// trabalham na etapa; servem para o filtro "Do meu cargo".

(function () {

const GRUPOS_INSTRUCOES = [
    { id: 'abertura', titulo: 'Abertura do processo' },
    { id: 'ar', titulo: 'Entrega ao contribuinte (AR e edital)' },
    { id: 'notificacao', titulo: 'Notificação Preliminar / Auto de Fiscalização' },
    { id: 'auto', titulo: 'Auto de Infração' },
    { id: 'encerramento', titulo: 'Encerramento' }
];

const FISCAL = ['Fiscal de Postura'];
const GERENTE = ['Gerente'];

const INSTRUCOES = [
    // ── Abertura ───────────────────────────────────────────────────────────
    {
        id: 'novo-processo',
        grupo: 'abertura',
        etapa: 'Início',
        titulo: 'Novo processo',
        responsavel: 'Fiscal de Posturas e Fiscal de Meio Ambiente',
        cargos: FISCAL,
        objetivo: 'Cadastrar o processo com os dados do contribuinte, do imóvel, das infrações e o Relatório Fiscal.',
        passos: [
            {
                titulo: 'Anexe o BIC ou o comprovante do CNPJ',
                texto: 'Na tela de Processos, clique em Novo processo e anexe o BIC (Espelho Cadastral) em PDF. Os dados do contribuinte e do imóvel são preenchidos a partir dele. Para empresa sem BIC, anexe no mesmo campo o Comprovante de Inscrição no CNPJ: o nome empresarial, o CNPJ e o endereço do comprovante preenchem o contribuinte e o imóvel.',
                dica: 'A leitura do PDF pode falhar em alguns campos. Confira tudo o que foi preenchido automaticamente. Com o comprovante do CNPJ, os campos opcionais que ficarem vazios somem do formulário e dos documentos.'
            },
            {
                titulo: 'Confira contribuinte e imóvel',
                texto: 'Revise nome, CPF/CNPJ, endereço, código reduzido, inscrição imobiliária, testada e área. Esses dados alimentam todos os documentos do processo.'
            },
            {
                titulo: 'Preencha os dados da fiscalização',
                texto: 'Informe a data e a hora da vistoria e descreva a fiscalização. Em Posturas, indique se o processo decorre de Decreto de notificação; nesse caso, as imagens da vistoria são obrigatórias.',
                dica: 'No Meio Ambiente é possível marcar um ou mais fiscais contribuidores. Eles assinam apenas o Relatório Fiscal. O usuário Dev escolhe se o processo é de Posturas ou de Meio Ambiente.'
            },
            {
                titulo: 'Informe reincidência e processo existente',
                texto: 'Em A infração é reincidente?, marque Sim quando o contribuinte já foi autuado pela mesma infração: informe o nº do processo anterior e o nº e a data do Auto anterior. Se o processo anterior não estiver no sistema, anexe os documentos dele. Em Processo já existente?, marque Sim quando o processo já começou fora do sistema (veja a instrução Processo já existente).',
                dica: 'A reincidência vai direto para o Auto de Infração, e o Relatório Fiscal é gerado sem precisar preencher o último passo.'
            },
            {
                titulo: 'Marque as infrações',
                texto: 'Selecione os dispositivos legais transgredidos. Cada infração gera um documento com número próprio.',
                dica: 'No Meio Ambiente, abaixo de cada infração marcada aparece um quadro: defina o prazo das providências, informe o nº do protocolo e confira a multa. Algumas infrações ambientais não têm Auto de Fiscalização e vão direto para o Auto de Infração. A infração de alvará (ALVARA-PJ) só aparece com o comprovante do CNPJ.'
            },
            {
                titulo: 'Revise o Relatório Fiscal',
                texto: 'Preencha atendimento, assunto e o texto do relatório. Abra o editor e leia o documento antes de gerar.'
            },
            {
                titulo: 'Gere o processo',
                texto: 'Clique em Gerar notificação (ou Gerar Auto de Fiscalização / Gerar Auto de Infração). O sistema cria o processo e abre a etapa inicial.'
            }
        ],
        checklist: [
            'Anexei o BIC (ou o comprovante do CNPJ) e conferi os dados preenchidos.',
            'Informei a data e a hora da vistoria.',
            'Respondi se a infração é reincidente e se o processo já existe.',
            'Marquei as infrações corretas.',
            'No Meio Ambiente: conferi prazo, protocolo e multa de cada infração.',
            'Li o Relatório Fiscal no editor antes de gerar.'
        ]
    },
    {
        id: 'processo-existente',
        grupo: 'abertura',
        etapa: 'Início',
        titulo: 'Processo já existente',
        responsavel: 'Fiscal de Posturas e Fiscal de Meio Ambiente',
        cargos: FISCAL,
        objetivo: 'Cadastrar no sistema um processo que já começou em papel ou em outro sistema, para ele continuar a partir da etapa em que está.',
        passos: [
            {
                titulo: 'Preencha os passos iniciais',
                texto: 'Abra o Novo processo e preencha contribuinte, imóvel e fiscalização como em um processo novo, com o BIC ou o comprovante do CNPJ.'
            },
            {
                titulo: 'Marque Processo já existente',
                texto: 'No passo Infrações, em Processo já existente?, marque Sim. Informe o número do processo e escolha em qual etapa ele está. O processo entra direto nessa etapa.',
                dica: 'Com o número do processo em branco, o sistema gera o próximo da sequência.'
            },
            {
                titulo: 'Informe as numerações',
                texto: 'Preencha o nº do Relatório Fiscal e o nº da Notificação Preliminar (ou do Auto de Fiscalização). A partir da Etapa 14, informe também o nº do Auto de Infração. O que ficar em branco o sistema numera.'
            },
            {
                titulo: 'Anexe os documentos que já existem',
                texto: 'O sistema pede só os documentos das fases pelas quais o processo já passou: Relatório Fiscal, notificação, AR, defesa, Réplica, Certidão e Auto de Infração. Nos ARs, informe o número, a data de recebimento ou a data do edital: essa data inicia o prazo.',
                dica: 'Todos os anexos são opcionais. O que faltar pode ser anexado depois, na etapa correspondente.'
            },
            {
                titulo: 'Marque as infrações e cadastre',
                texto: 'Selecione as infrações e clique em Cadastrar processo. Não há o passo do Relatório Fiscal: nenhum documento novo é gerado, o processo só entra no sistema.'
            }
        ],
        checklist: [
            'Informei o número do processo e a etapa atual.',
            'Preenchi as numerações que o processo já tem.',
            'Anexei os documentos assinados que existem.',
            'Informei as datas do AR ou do edital.',
            'Conferi as infrações antes de cadastrar.'
        ]
    },
    {
        id: 'etapa-1',
        grupo: 'abertura',
        etapa: 'Etapa 1',
        titulo: 'Notificação Preliminar / Auto de Fiscalização',
        responsavel: 'Fiscal',
        cargos: FISCAL,
        objetivo: 'Conferir, assinar e anexar o documento da Etapa 1 e o Relatório Fiscal.',
        passos: [
            {
                titulo: 'Confira os dados',
                texto: 'Revise endereço, infrações e dispositivos. Para corrigir algo, use a aba Editar dados do processo.',
                dica: 'Corrigir antes de assinar é rápido. Depois de assinado, o documento precisa ser refeito.'
            },
            {
                titulo: 'Confira a multa',
                texto: 'No quadro de valores das multas, confira cada valor e clique em Salvar valores e atualizar documento PDF. Depois, verifique o valor no texto do documento.'
            },
            {
                titulo: 'Baixe e assine',
                texto: 'Leia a prévia, clique em Imprimir / Baixar e abra o arquivo. Confira nome, endereço e número antes de assinar.'
            },
            {
                titulo: 'Anexe os documentos assinados',
                texto: 'Anexe a Notificação Preliminar (ou Auto de Fiscalização) assinada e o Relatório Fiscal assinado. Clique em Visualizar e confirme que são deste processo.'
            },
            {
                titulo: 'Avance a etapa',
                texto: 'Com os dois anexos, clique em Avançar etapa. O processo segue para o Retorno do AR.'
            }
        ],
        checklist: [
            'Conferi os dados do processo.',
            'Salvei os valores da multa e conferi no documento.',
            'Conferi o PDF baixado antes de assinar.',
            'Anexei e visualizei o documento assinado.',
            'Anexei e visualizei o Relatório Fiscal assinado.'
        ]
    },

    // ── AR e edital ────────────────────────────────────────────────────────
    {
        id: 'etapa-16',
        grupo: 'ar',
        etapa: 'Etapa 1.2 / 16',
        titulo: 'Retorno do AR',
        responsavel: 'Administrativo de Posturas',
        cargos: ['Administrativo de Posturas'],
        objetivo: 'Registrar o Aviso de Recebimento (AR) e a data em que o contribuinte recebeu o documento.',
        passos: [
            {
                titulo: 'Cadastre o número do AR',
                texto: 'Informe o número do AR. A partir do cadastro, o sistema conta 15 dias; sem retorno nesse período, o processo vai para a Etapa 30.'
            },
            {
                titulo: 'Registre o retorno',
                texto: 'Em Notificação efetivada?, marque Sim e informe a data de recebimento pelo proprietário, com o anexo do AR. Essa data inicia o prazo.'
            },
            {
                titulo: 'Retorno sem sucesso',
                texto: 'Marque Não e informe a data da última tentativa, o motivo dado pelos Correios e o anexo do AR.',
                dica: 'São 3 tentativas para a Notificação Preliminar / Auto de Fiscalização e 1 para o Auto de Infração. Esgotadas, o processo segue para o edital.'
            }
        ],
        checklist: [
            'Conferi o número do AR.',
            'Informei a data de recebimento correta.',
            'Anexei o AR legível.',
            'Quando sem sucesso, informei data e motivo da tentativa.'
        ]
    },
    {
        id: 'etapa-30',
        grupo: 'ar',
        etapa: 'Etapa 30',
        titulo: 'Localizar o AR',
        responsavel: 'Gerente',
        cargos: GERENTE,
        objetivo: 'Localizar o AR que passou 15 dias sem retorno.',
        passos: [
            {
                titulo: 'Localize o AR',
                texto: 'Use o número do AR em destaque na tela para consultar a situação da entrega.'
            },
            {
                titulo: 'AR efetivado',
                texto: 'Informe a data de recebimento e anexe o AR. Os dois são obrigatórios e a data inicia o prazo.'
            },
            {
                titulo: 'AR não efetivado',
                texto: 'Marque a opção correspondente. O processo segue para a publicação do edital.'
            }
        ],
        checklist: [
            'Consultei a situação do AR.',
            'Informei a data de recebimento, se houve entrega.',
            'Anexei o AR.'
        ]
    },
    {
        id: 'etapa-17',
        grupo: 'ar',
        etapa: 'Etapa 17',
        titulo: 'Publicação do edital',
        responsavel: 'Gerente e Administrativo de Posturas',
        cargos: ['Gerente', 'Administrativo de Posturas'],
        objetivo: 'Anexar o edital quando o contribuinte não foi encontrado pelos Correios.',
        passos: [
            {
                titulo: 'Confira a origem',
                texto: 'Veja na tela se o edital é da Notificação Preliminar / Auto de Fiscalização ou do Auto de Infração.'
            },
            {
                titulo: 'Anexe o edital publicado',
                texto: 'O anexo é obrigatório. A data do anexo passa a ser o início do prazo.'
            },
            {
                titulo: 'Avance a etapa',
                texto: 'O processo volta para o andamento correspondente, com o prazo contado a partir do edital.'
            }
        ],
        checklist: [
            'Conferi de qual documento é o edital.',
            'Anexei o edital publicado.'
        ]
    },

    // ── Notificação Preliminar / Auto de Fiscalização ─────────────────────
    {
        id: 'etapa-2',
        grupo: 'notificacao',
        etapa: 'Etapa 2',
        titulo: 'Andamento das notificações',
        responsavel: 'Fiscal',
        cargos: FISCAL,
        objetivo: 'Indicar o que aconteceu com cada notificação dentro do prazo.',
        passos: [
            {
                titulo: 'Confira cada quadro',
                texto: 'Cada notificação tem número, descrição, vencimento e dias restantes.'
            },
            {
                titulo: 'Marque a situação',
                texto: 'Atendida segue para o encerramento. Defesa segue para o envio da defesa. Dilação de prazo segue para os documentos da dilação. Sem marcação, a notificação aguarda o prazo.',
                dica: 'Vencido o prazo sem atendimento, a notificação pode avançar como vencida e seguirá para o Auto de Infração.'
            },
            {
                titulo: 'Avance a notificação',
                texto: 'Use o botão Avançar notificação de cada quadro. O botão geral só avança quando todas estão prontas.'
            }
        ],
        checklist: [
            'Conferi o vencimento de cada notificação.',
            'Marquei a situação conforme o protocolo recebido.',
            'Avancei apenas as notificações prontas.'
        ]
    },
    {
        id: 'etapa-3',
        grupo: 'notificacao',
        etapa: 'Etapa 3',
        titulo: 'Envio da defesa',
        responsavel: 'Fiscal',
        cargos: FISCAL,
        objetivo: 'Anexar a defesa apresentada pelo contribuinte.',
        passos: [
            {
                titulo: 'Anexe a defesa',
                texto: 'Anexe os arquivos da defesa (PDF, JPG ou PNG). É possível anexar mais de um.'
            },
            {
                titulo: 'Avance a etapa',
                texto: 'Com a defesa anexada, o processo segue para a análise da defesa. Sem anexo e com o prazo vencido, segue para a Certidão.'
            }
        ],
        checklist: [
            'Anexei todos os arquivos da defesa.',
            'Conferi que a defesa é deste processo.'
        ]
    },
    {
        id: 'etapa-4',
        grupo: 'notificacao',
        etapa: 'Etapa 4',
        titulo: 'Documentos da dilação de prazo',
        responsavel: 'Fiscal',
        cargos: FISCAL,
        objetivo: 'Reunir os documentos do pedido de dilação.',
        passos: [
            {
                titulo: 'Anexe os documentos',
                texto: 'Cada documento tem o seu campo: pedido de dilação, comprovante de renda e comprovante de propriedade. Todos são opcionais.'
            },
            {
                titulo: 'Avance a etapa',
                texto: 'O processo segue para a análise da dilação.'
            }
        ],
        checklist: [
            'Anexei os documentos recebidos no campo correto.'
        ]
    },
    {
        id: 'etapa-5',
        grupo: 'notificacao',
        etapa: 'Etapa 5',
        titulo: 'Análise da dilação de prazo',
        responsavel: 'Fiscal',
        cargos: FISCAL,
        objetivo: 'Decidir o pedido de dilação e emitir a Réplica.',
        passos: [
            {
                titulo: 'Analise o pedido',
                texto: 'Leia o pedido e os comprovantes anexados na etapa anterior.'
            },
            {
                titulo: 'Registre a decisão',
                texto: 'Para deferir, informe a quantidade de dias; o prazo é somado ao vencimento. Para indeferir, o motivo é obrigatório.',
                dica: 'Para consultar a Gerência ou o Jurídico, use o chat. Enquanto aguarda a resposta, use Paralisar aguardando o Jurídico para suspender a contagem do prazo.'
            },
            {
                titulo: 'Emita a Réplica',
                texto: 'Confira a prévia, baixe, assine e anexe a Réplica assinada. O anexo é obrigatório para avançar.'
            }
        ],
        checklist: [
            'Analisei o pedido e os comprovantes.',
            'Registrei a decisão e, se indeferida, o motivo.',
            'Anexei a Réplica assinada.'
        ]
    },
    {
        id: 'etapa-13',
        grupo: 'notificacao',
        etapa: 'Etapa 13',
        titulo: 'Análise da defesa',
        responsavel: 'Fiscal',
        cargos: FISCAL,
        objetivo: 'Decidir a defesa e emitir a Réplica.',
        passos: [
            {
                titulo: 'Analise a defesa',
                texto: 'Leia a defesa e os comprovantes anexados.'
            },
            {
                titulo: 'Registre a decisão',
                texto: 'Defira ou indefira. No indeferimento, o motivo é obrigatório.',
                dica: 'Use o chat para consultar a Gerência ou o Jurídico e o botão Paralisar aguardando o Jurídico enquanto espera a resposta.'
            },
            {
                titulo: 'Emita a Réplica',
                texto: 'Confira a prévia, adicione imagens se necessário, baixe, assine e anexe a Réplica assinada.'
            }
        ],
        checklist: [
            'Analisei a defesa e os comprovantes.',
            'Registrei a decisão e o motivo.',
            'Anexei a Réplica assinada.'
        ]
    },
    {
        id: 'etapa-10',
        grupo: 'notificacao',
        etapa: 'Etapa 10',
        titulo: 'Certidão de cumprimento',
        responsavel: 'Fiscal',
        cargos: FISCAL,
        objetivo: 'Certificar se a obrigação foi cumprida.',
        passos: [
            {
                titulo: 'Confira o cumprimento',
                texto: 'Em O problema foi resolvido?, marque Sim ou Não. A opção pode vir marcada pela etapa anterior.'
            },
            {
                titulo: 'Emita a Certidão',
                texto: 'Confira a prévia, baixe, assine e anexe a Certidão assinada.'
            },
            {
                titulo: 'Avance a etapa',
                texto: 'Com Sim, o processo segue para o encerramento. Com Não, segue para o Auto de Infração.'
            }
        ],
        checklist: [
            'Conferi se a obrigação foi cumprida.',
            'Anexei a Certidão assinada.'
        ]
    },

    // ── Auto de Infração ───────────────────────────────────────────────────
    {
        id: 'etapa-14',
        grupo: 'auto',
        etapa: 'Etapa 14',
        titulo: 'Auto de Infração',
        responsavel: 'Fiscal',
        cargos: FISCAL,
        objetivo: 'Emitir e anexar o Auto de Infração assinado.',
        passos: [
            {
                titulo: 'Preencha os dados do Auto',
                texto: 'Informe se o autuado apresentou defesa. No Meio Ambiente, informe também a data da verificação.',
                dica: 'A nota do fiscal do Auto pode ser editada nesta etapa. Ela não altera a Notificação Preliminar / Auto de Fiscalização já entregue.'
            },
            {
                titulo: 'Confira a multa',
                texto: 'No quadro de cálculo, confira o valor e clique em salvar. Verifique o valor no texto do Auto.'
            },
            {
                titulo: 'Baixe, assine e anexe',
                texto: 'Anexe o Auto de Infração assinado. Em processo por decreto, anexe também o Relatório Fiscal assinado.'
            }
        ],
        checklist: [
            'Informei se houve defesa.',
            'Salvei e conferi o valor da multa no Auto.',
            'Anexei o Auto de Infração assinado.'
        ]
    },
    {
        id: 'etapa-15',
        grupo: 'auto',
        etapa: 'Etapa 15',
        titulo: 'Multa do Auto de Infração',
        responsavel: 'Gerente e Administrativo de Posturas',
        cargos: ['Gerente', 'Administrativo de Posturas'],
        objetivo: 'Anexar a multa e emitir o Ofício à Fazenda.',
        passos: [
            {
                titulo: 'Confira a capa do processo',
                texto: 'Verifique número do processo, autuado, Auto de Infração e situação da defesa.'
            },
            {
                titulo: 'Anexe a multa',
                texto: 'O documento da multa é obrigatório para avançar.'
            },
            {
                titulo: 'Emita o Ofício SEMAC – GFP',
                texto: 'Gere o ofício ao Secretário Municipal de Fazenda, baixe e registre a situação.'
            }
        ],
        checklist: [
            'Conferi a capa do processo.',
            'Anexei o documento da multa.',
            'Emiti o Ofício SEMAC – GFP.'
        ]
    },
    {
        id: 'etapa-18',
        grupo: 'auto',
        etapa: 'Etapa 18',
        titulo: 'Andamento do Auto de Infração',
        responsavel: 'Gerente e Jurídico',
        cargos: ['Gerente', 'Jurídico'],
        objetivo: 'Indicar o que aconteceu com cada Auto dentro do prazo de defesa.',
        passos: [
            {
                titulo: 'Confira cada Auto',
                texto: 'Cada Auto tem o seu quadro, com prazo de defesa, situação e nº do protocolo.'
            },
            {
                titulo: 'Escolha a opção',
                texto: 'Defesa segue para o Parecer Jurídico. Pagamento segue para o encerramento. Não fez o pagamento segue para a certificação do vencimento. Desconto segue para a análise de desconto.'
            }
        ],
        checklist: [
            'Conferi o prazo e o protocolo de cada Auto.',
            'Escolhi a opção correta para cada Auto.'
        ]
    },
    {
        id: 'etapa-26',
        grupo: 'auto',
        etapa: 'Etapa 26',
        titulo: 'Análise para dar desconto',
        responsavel: 'Fiscal',
        cargos: FISCAL,
        objetivo: 'Decidir o pedido de desconto e emitir a Réplica.',
        passos: [
            {
                titulo: 'Registre a decisão',
                texto: 'Defira ou indefira. No indeferimento, o motivo é obrigatório.'
            },
            {
                titulo: 'Anexe a Réplica assinada',
                texto: 'Deferido, o Auto segue para o Gerente ajustar o valor. Indeferido, volta ao andamento do Auto.'
            }
        ],
        checklist: [
            'Registrei a decisão e o motivo.',
            'Anexei a Réplica assinada.'
        ]
    },
    {
        id: 'etapa-19',
        grupo: 'auto',
        etapa: 'Etapa 19',
        titulo: 'Parecer Jurídico',
        responsavel: 'Jurídico e Gerente de Interface Jurídica',
        cargos: ['Jurídico', 'Gerente de Interface Jurídica'],
        objetivo: 'Analisar a defesa do Auto e redigir o parecer.',
        passos: [
            {
                titulo: 'Registre a defesa',
                texto: 'Anexe o arquivo e/ou cole o texto da defesa. O botão Analisar defesa com IA ajuda na leitura.'
            },
            {
                titulo: 'Escolha a decisão',
                texto: 'As opções disponíveis dependem da infração.'
            },
            {
                titulo: 'Redija o parecer',
                texto: 'O modelo vem preenchido e pode ser editado. Trechos entre colchetes impedem o avanço até serem completados.'
            },
            {
                titulo: 'Encaminhe',
                texto: 'Envie ao Fiscal ou à Gerência para diligência, ou ao Secretário com o parecer pronto.'
            }
        ],
        checklist: [
            'Registrei a defesa.',
            'Escolhi a decisão.',
            'Revisei o parecer e removi os colchetes.',
            'Escolhi o encaminhamento correto.'
        ]
    },
    {
        id: 'etapa-21-22',
        grupo: 'auto',
        etapa: 'Etapas 21 e 22',
        titulo: 'Comunicação Interna',
        responsavel: 'Fiscal (21) e Gerente (22)',
        cargos: ['Fiscal de Postura', 'Gerente'],
        objetivo: 'Responder a diligência pedida pelo Jurídico.',
        passos: [
            {
                titulo: 'Leia o pedido',
                texto: 'Confira o pedido do Jurídico, a defesa e as respostas anteriores.'
            },
            {
                titulo: 'Responda',
                texto: 'Escreva a resposta e/ou anexe documentos. Pelo menos um dos dois é obrigatório. O processo volta ao Parecer Jurídico.'
            }
        ],
        checklist: [
            'Li o pedido do Jurídico.',
            'Respondi com texto ou anexo.'
        ]
    },
    {
        id: 'etapa-24',
        grupo: 'auto',
        etapa: 'Etapa 24',
        titulo: 'Despacho do Secretário',
        responsavel: 'Secretário',
        cargos: ['Secretário'],
        objetivo: 'Decidir o processo a partir do parecer jurídico.',
        passos: [
            {
                titulo: 'Consulte os documentos',
                texto: 'Abra o processo unificado na tela, com defesa, comunicações internas e parecer.'
            },
            {
                titulo: 'Registre a decisão',
                texto: 'A decisão vem pré-marcada com o que o parecer opinou e pode ser alterada.'
            },
            {
                titulo: 'Emita o despacho',
                texto: 'Use Gerar resposta padrão, revise o texto ou anexe o despacho assinado.'
            }
        ],
        checklist: [
            'Consultei o parecer e os documentos.',
            'Registrei a decisão.',
            'Revisei o despacho.'
        ]
    },
    {
        id: 'etapa-25',
        grupo: 'auto',
        etapa: 'Etapa 25',
        titulo: 'Cumprimento do despacho',
        responsavel: 'Gerente',
        cargos: GERENTE,
        objetivo: 'Executar o que foi decidido no despacho ou no desconto.',
        passos: [
            {
                titulo: 'Escolha o desfecho',
                texto: 'Redução de 50%, alteração de valor, cancelamento ou continuidade na cobrança.'
            },
            {
                titulo: 'Emita o ofício, quando houver',
                texto: 'Na redução e na alteração de valor, revise o Ofício à Fazenda e anexe a nova multa.'
            },
            {
                titulo: 'Copie a mensagem para o protocolo',
                texto: 'Revise a mensagem e use o botão copiar.'
            }
        ],
        checklist: [
            'Escolhi o desfecho conforme o despacho.',
            'Revisei o ofício e anexei a nova multa, quando necessário.',
            'Copiei a mensagem para o protocolo.'
        ]
    },
    {
        id: 'etapa-31',
        grupo: 'auto',
        etapa: 'Etapa 31',
        titulo: 'Comprovante de pagamento',
        responsavel: 'Fiscal',
        cargos: FISCAL,
        objetivo: 'Registrar se a multa foi paga.',
        passos: [
            {
                titulo: 'Confira o prazo',
                texto: 'A tela informa se o prazo recomeçou ou continuou após o despacho.'
            },
            {
                titulo: 'Registre o pagamento',
                texto: 'Em Verificação de pagamento, marque Houve pagamento ou Não houve pagamento e anexe o comprovante, se houver. Com pagamento, segue para o encerramento; sem pagamento, para a certificação do vencimento.'
            }
        ],
        checklist: [
            'Conferi o prazo.',
            'Registrei se houve pagamento.'
        ]
    },

    // ── Encerramento ───────────────────────────────────────────────────────
    {
        id: 'etapa-28',
        grupo: 'encerramento',
        etapa: 'Etapa 28',
        titulo: 'Certificação do vencimento',
        responsavel: 'Gerente',
        cargos: GERENTE,
        objetivo: 'Certificar o vencimento do Auto sem pagamento.',
        passos: [
            {
                titulo: 'Confira o PDF completo',
                texto: 'Verifique se o processo reúne Auto, multa, AR e edital.'
            },
            {
                titulo: 'Copie a mensagem para o protocolo',
                texto: 'Revise o texto e use o botão copiar. A edição não fica salva.'
            }
        ],
        checklist: [
            'Conferi o PDF completo.',
            'Copiei a mensagem para o protocolo.'
        ]
    },
    {
        id: 'etapa-20',
        grupo: 'encerramento',
        etapa: 'Etapa 20',
        titulo: 'Arquivamento (dívida ativa)',
        responsavel: 'Gerente',
        cargos: GERENTE,
        objetivo: 'Arquivar o processo enviado à dívida ativa.',
        passos: [
            {
                titulo: 'Confira o PDF completo',
                texto: 'A última página registra o envio à dívida ativa.'
            },
            {
                titulo: 'Arquive',
                texto: 'Clique em arquivar. Se necessário, é possível desfazer o arquivamento e o Auto volta ao andamento.'
            }
        ],
        checklist: [
            'Conferi o PDF completo.',
            'Arquivei o processo.'
        ]
    },
    {
        id: 'etapa-29',
        grupo: 'encerramento',
        etapa: 'Etapa 29',
        titulo: 'Certidão de encerramento',
        responsavel: 'Fiscal e Gerente',
        cargos: ['Fiscal de Postura', 'Gerente'],
        objetivo: 'Encerrar o processo com a Certidão de encerramento.',
        passos: [
            {
                titulo: 'Confira o processo completo',
                texto: 'Abra o PDF completo e confira os documentos e o relatório de etapas.'
            },
            {
                titulo: 'Anexe a Certidão assinada',
                texto: 'Baixe a Certidão de encerramento, assine e anexe. O anexo é obrigatório.'
            },
            {
                titulo: 'Encerre',
                texto: 'Clique em Encerrar definitivamente e confirme. A cópia final do processo é guardada no sistema.',
                dica: 'Depois de encerrado, o processo não volta. Confira tudo antes.'
            }
        ],
        checklist: [
            'Conferi o PDF completo e o relatório de etapas.',
            'Anexei a Certidão de encerramento assinada.',
            'Encerrei o processo.'
        ]
    }
];

// Próximas etapas de cada instrução, com a condição de cada caminho (o fluxo
// se ramifica). Lista vazia = fim do processo; sem entrada = texto de PROXIMA_LIVRE.
const PROXIMA_LIVRE = {
    'processo-existente': 'O processo continua na etapa escolhida no cadastro. Abra a instrução dessa etapa pelo índice.'
};

const PROXIMAS_ETAPAS = {
    'novo-processo': [
        { id: 'etapa-1', quando: 'Processo com Notificação Preliminar ou Auto de Fiscalização' },
        { id: 'etapa-14', quando: 'Processo por decreto, reincidência ou infração que vai direto para o Auto de Infração' }
    ],
    'etapa-1': [{ id: 'etapa-16' }],
    'etapa-16': [
        { id: 'etapa-2', quando: 'AR efetivado (Notificação Preliminar / Auto de Fiscalização)' },
        { id: 'etapa-18', quando: 'AR efetivado (Auto de Infração)' },
        { id: 'etapa-17', quando: 'Tentativas de entrega esgotadas' },
        { id: 'etapa-30', quando: '15 dias sem retorno do AR' }
    ],
    'etapa-30': [
        { id: 'etapa-2', quando: 'AR efetivado (Notificação Preliminar / Auto de Fiscalização)' },
        { id: 'etapa-18', quando: 'AR efetivado (Auto de Infração)' },
        { id: 'etapa-17', quando: 'AR não efetivado' }
    ],
    'etapa-17': [
        { id: 'etapa-2', quando: 'Edital da Notificação Preliminar / Auto de Fiscalização' },
        { id: 'etapa-18', quando: 'Edital do Auto de Infração' }
    ],
    'etapa-2': [
        { id: 'etapa-3', quando: 'Defesa' },
        { id: 'etapa-4', quando: 'Dilação de prazo' },
        { id: 'etapa-29', quando: 'Atendida' },
        { id: 'etapa-10', quando: 'Prazo vencido' }
    ],
    'etapa-3': [
        { id: 'etapa-13', quando: 'Defesa anexada' },
        { id: 'etapa-10', quando: 'Prazo vencido sem defesa' }
    ],
    'etapa-4': [{ id: 'etapa-5' }],
    'etapa-5': [
        { id: 'etapa-2', quando: 'Dilação deferida, ou indeferida dentro do prazo' },
        { id: 'etapa-10', quando: 'Dilação indeferida com o prazo vencido' }
    ],
    'etapa-13': [{ id: 'etapa-10' }],
    'etapa-10': [
        { id: 'etapa-29', quando: 'Obrigação cumprida' },
        { id: 'etapa-14', quando: 'Obrigação não cumprida' }
    ],
    'etapa-14': [{ id: 'etapa-15' }],
    'etapa-15': [{ id: 'etapa-16', quando: 'Retorno do AR do Auto de Infração' }],
    'etapa-18': [
        { id: 'etapa-19', quando: 'Defesa' },
        { id: 'etapa-29', quando: 'Pagamento' },
        { id: 'etapa-28', quando: 'Não fez o pagamento' },
        { id: 'etapa-26', quando: 'Desconto' }
    ],
    'etapa-26': [
        { id: 'etapa-25', quando: 'Desconto deferido' },
        { id: 'etapa-18', quando: 'Desconto indeferido' }
    ],
    'etapa-19': [
        { id: 'etapa-21-22', quando: 'Diligência com o Fiscal ou a Gerência' },
        { id: 'etapa-24', quando: 'Parecer pronto' }
    ],
    'etapa-21-22': [{ id: 'etapa-19', quando: 'Resposta enviada ao Jurídico' }],
    'etapa-24': [{ id: 'etapa-25' }],
    'etapa-25': [
        { id: 'etapa-31', quando: 'Redução de 50%, alteração de valor ou continuidade na cobrança' },
        { id: 'etapa-29', quando: 'Cancelamento' }
    ],
    'etapa-31': [
        { id: 'etapa-29', quando: 'Pagamento realizado' },
        { id: 'etapa-28', quando: 'Pagamento não realizado' }
    ],
    'etapa-28': [{ id: 'etapa-20' }],
    'etapa-20': [],
    'etapa-29': []
};

// Posição de cada etapa no fluxograma: [faixa, ordem]. A ordem do processo corre
// da esquerda para a direita; as faixas (1 em cima, 2 no meio, 3 embaixo) separam
// os desvios do caminho principal, que fica na faixa do meio.
const POSICOES_FLUXOGRAMA = {
    'novo-processo': [2, 1],
    'etapa-1': [2, 2],
    'etapa-17': [1, 3], 'etapa-16': [2, 3], 'etapa-30': [3, 3],
    'etapa-2': [2, 4],
    'etapa-3': [1, 5], 'etapa-4': [3, 5],
    'etapa-13': [1, 6], 'etapa-5': [3, 6],
    'etapa-10': [2, 7],
    'etapa-14': [2, 8],
    'etapa-15': [2, 9],
    'etapa-18': [2, 10],
    'etapa-19': [1, 11], 'etapa-26': [3, 11],
    'etapa-21-22': [1, 12], 'etapa-24': [2, 12],
    'etapa-25': [2, 13],
    'etapa-31': [2, 14], 'etapa-28': [3, 14],
    'etapa-29': [1, 15], 'etapa-20': [3, 15]
};

// ── Estado ──────────────────────────────────────────────────────────────────
const PREFIXO_CHECKLIST_INSTRUCAO = 'fluxograma:checklist-instrucao:';
const CHAVE_MODO_INDICE = 'fluxograma:instrucoes-modo';
let instrucaoAberta = null;
let filtroInstrucoesMeuCargo = false;
let modoIndiceInstrucoes = (() => {
    try { return localStorage.getItem(CHAVE_MODO_INDICE) === 'fluxo' ? 'fluxo' : 'lista'; } catch (e) { return 'lista'; }
})();

function lerChecklistInstrucao(id) {
    try {
        return JSON.parse(localStorage.getItem(PREFIXO_CHECKLIST_INSTRUCAO + id)) || {};
    } catch (e) {
        return {};
    }
}

function gravarChecklistInstrucao(id, estado) {
    try {
        localStorage.setItem(PREFIXO_CHECKLIST_INSTRUCAO + id, JSON.stringify(estado));
    } catch (e) {
        /* navegador sem storage disponível — segue sem salvar */
    }
}

function escaparInstrucao(txt) {
    return String(txt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cargoDoUsuarioInstrucoes() {
    const cargo = window.currentUserProfile?.cargo || '';
    return typeof normalizarCargo === 'function' ? normalizarCargo(cargo) : cargo;
}

// ── Índice ──────────────────────────────────────────────────────────────────
function renderizarIndiceInstrucoes() {
    const area = document.getElementById('instrucoesConteudo');
    if (!area) return;

    const cargo = cargoDoUsuarioInstrucoes();
    const podeFiltrar = cargo && cargo !== 'Dev';
    const visiveis = INSTRUCOES.filter(i => !filtroInstrucoesMeuCargo || !podeFiltrar || i.cargos.includes(cargo));

    const grupos = GRUPOS_INSTRUCOES.map(g => {
        const itens = visiveis.filter(i => i.grupo === g.id);
        if (!itens.length) return '';
        return `
            <section class="instr-indice-grupo">
                <h3>${escaparInstrucao(g.titulo)}</h3>
                <div class="instr-indice-lista">
                    ${itens.map(i => {
                        const feitos = Object.values(lerChecklistInstrucao(i.id)).filter(Boolean).length;
                        return `
                        <button type="button" class="instr-indice-item" data-instrucao="${i.id}">
                            <span class="instr-indice-etapa">${escaparInstrucao(i.etapa)}</span>
                            <span class="instr-indice-titulo">${escaparInstrucao(i.titulo)}${feitos ? ` <span class="instr-indice-progresso">· ${feitos} de ${i.checklist.length} no checklist</span>` : ''}</span>
                            <span class="instr-indice-quem">${escaparInstrucao(i.responsavel)}</span>
                        </button>`;
                    }).join('')}
                </div>
            </section>`;
    }).join('');

    const ehFluxo = modoIndiceInstrucoes === 'fluxo';
    area.innerHTML = `
        <div class="instr-barra-indice">
            <div class="instr-modo" role="group" aria-label="Forma de exibição">
                <button type="button" data-modo="lista" class="${ehFluxo ? '' : 'ativo'}">Lista</button>
                <button type="button" data-modo="fluxo" class="${ehFluxo ? 'ativo' : ''}">Fluxograma</button>
            </div>
            ${podeFiltrar ? `
                <label class="instr-filtro-cargo">
                    <input type="checkbox" id="chkInstrucoesMeuCargo" ${filtroInstrucoesMeuCargo ? 'checked' : ''}>
                    <span>Mostrar só as etapas do meu cargo</span>
                </label>` : ''}
        </div>
        ${ehFluxo
            ? htmlFluxogramaInstrucoes(new Set(visiveis.map(i => i.id)))
            : (grupos || '<p class="instr-vazio">Nenhuma instrução para o seu cargo.</p>')}
    `;

    area.querySelectorAll('[data-instrucao]').forEach(btn => {
        btn.addEventListener('click', () => abrirInstrucao(btn.dataset.instrucao));
    });
    area.querySelectorAll('[data-modo]').forEach(btn => {
        btn.addEventListener('click', () => {
            modoIndiceInstrucoes = btn.dataset.modo;
            try { localStorage.setItem(CHAVE_MODO_INDICE, modoIndiceInstrucoes); } catch (e) { /* segue sem salvar */ }
            renderizarIndiceInstrucoes();
        });
    });
    document.getElementById('chkInstrucoesMeuCargo')?.addEventListener('change', (e) => {
        filtroInstrucoesMeuCargo = e.target.checked;
        renderizarIndiceInstrucoes();
    });
    if (ehFluxo) ligarFluxogramaInstrucoes();
}

// ── Fluxograma ──────────────────────────────────────────────────────────────
// Cards em grade (POSICOES_FLUXOGRAMA) e setas em SVG desenhadas por cima, a
// partir das posições reais dos cards. As setas vêm de PROXIMAS_ETAPAS; as que
// voltam para uma etapa anterior (à esquerda) ficam tracejadas.
function htmlFluxogramaInstrucoes(idsVisiveis) {
    const cards = INSTRUCOES.filter(i => POSICOES_FLUXOGRAMA[i.id]).map(i => {
        const [faixa, ordem] = POSICOES_FLUXOGRAMA[i.id];
        const apagado = !idsVisiveis.has(i.id);
        return `
            <button type="button" class="instr-fluxo-card grupo-${i.grupo}${apagado ? ' apagado' : ''}" data-instrucao="${i.id}"
                style="grid-column:${ordem}; grid-row:${faixa};" title="Abrir a instrução: ${escaparInstrucao(i.etapa)} — ${escaparInstrucao(i.titulo)}">
                <span class="instr-fluxo-etapa">${escaparInstrucao(i.etapa)}</span>
                <span class="instr-fluxo-titulo">${escaparInstrucao(i.titulo)}</span>
                <span class="instr-fluxo-cargo">${escaparInstrucao(i.responsavel)}</span>
            </button>`;
    }).join('');
    const legenda = GRUPOS_INSTRUCOES.map(g =>
        `<span class="instr-fluxo-legenda-item grupo-${g.id}">${escaparInstrucao(g.titulo)}</span>`).join('');
    return `
        <p class="instr-fluxo-ajuda">Clique em uma etapa para abrir a instrução. Passe o mouse para destacar os caminhos que saem dela. O processo segue da esquerda para a direita; setas tracejadas voltam para uma etapa anterior.</p>
        <div class="instr-fluxo-legenda">${legenda}</div>
        <div class="instr-fluxo-rolagem">
            <div class="instr-fluxo" id="instrFluxograma" style="grid-template-columns: repeat(${Math.max(...Object.values(POSICOES_FLUXOGRAMA).map(p => p[1]))}, 150px);">
                <svg class="instr-fluxo-linhas" id="instrFluxoLinhas" aria-hidden="true"></svg>
                ${cards}
            </div>
        </div>`;
}

let observadorTamanhoFluxo = null;

function ligarFluxogramaInstrucoes() {
    const fluxo = document.getElementById('instrFluxograma');
    if (!fluxo) return;
    requestAnimationFrame(desenharLinhasFluxograma);

    // Redesenha as setas quando o tamanho muda (janela, menu lateral)
    if (observadorTamanhoFluxo) observadorTamanhoFluxo.disconnect();
    if (typeof ResizeObserver === 'function') {
        observadorTamanhoFluxo = new ResizeObserver(() => desenharLinhasFluxograma());
        observadorTamanhoFluxo.observe(fluxo);
    }

    fluxo.querySelectorAll('.instr-fluxo-card').forEach(card => {
        const id = card.dataset.instrucao;
        card.addEventListener('mouseenter', () => destacarCaminhosFluxograma(id, true));
        card.addEventListener('mouseleave', () => destacarCaminhosFluxograma(id, false));
        card.addEventListener('focus', () => destacarCaminhosFluxograma(id, true));
        card.addEventListener('blur', () => destacarCaminhosFluxograma(id, false));
    });
}

function destacarCaminhosFluxograma(id, ligar) {
    const fluxo = document.getElementById('instrFluxograma');
    if (!fluxo) return;
    fluxo.classList.toggle('com-destaque', ligar);
    fluxo.querySelectorAll(`path[data-de="${id}"]`).forEach(p => {
        p.classList.toggle('ativo', ligar);
        p.setAttribute('marker-end', ligar ? 'url(#setaFluxoAtiva)' : 'url(#setaFluxo)');
    });
    (PROXIMAS_ETAPAS[id] || []).forEach(p => {
        fluxo.querySelector(`.instr-fluxo-card[data-instrucao="${p.id}"]`)?.classList.toggle('destino', ligar);
    });
    fluxo.querySelector(`.instr-fluxo-card[data-instrucao="${id}"]`)?.classList.toggle('origem', ligar);
}

function desenharLinhasFluxograma() {
    const fluxo = document.getElementById('instrFluxograma');
    const svg = document.getElementById('instrFluxoLinhas');
    if (!fluxo || !svg || !fluxo.offsetWidth) return;

    const base = fluxo.getBoundingClientRect();
    const caixa = id => {
        const el = fluxo.querySelector(`.instr-fluxo-card[data-instrucao="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    };

    const largura = fluxo.scrollWidth;
    const altura = fluxo.scrollHeight;
    svg.setAttribute('width', largura);
    svg.setAttribute('height', altura);
    svg.setAttribute('viewBox', `0 0 ${largura} ${altura}`);

    // Limites de cada faixa (o card mais alto manda) e os corredores horizontais
    // entre elas: margem de cima, vão entre as faixas 1 e 2, vão entre 2 e 3 e
    // margem de baixo. Nenhum card fica neles, então a seta não atravessa nada.
    const limitesFaixa = faixa => {
        const caixas = Object.entries(POSICOES_FLUXOGRAMA)
            .filter(([, [f]]) => f === faixa).map(([id]) => caixa(id)).filter(Boolean);
        if (!caixas.length) return null;
        return { topo: Math.min(...caixas.map(c => c.y)), base: Math.max(...caixas.map(c => c.y + c.h)) };
    };
    const f1 = limitesFaixa(1), f2 = limitesFaixa(2), f3 = limitesFaixa(3);
    const corredores = {
        margemTopo: f1 ? f1.topo - 20 : 16,
        vao12: f1 && f2 ? (f1.base + f2.topo) / 2 : altura / 3,
        vao23: f2 && f3 ? (f2.base + f3.topo) / 2 : (2 * altura) / 3,
        margemBase: f3 ? f3.base + 20 : altura - 16
    };
    const usoCorredor = {};
    const usoLado = {};
    const deslocamento = n => (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 7;

    const caminhos = [];
    Object.entries(PROXIMAS_ETAPAS).forEach(([de, lista]) => {
        const a = caixa(de);
        if (!a) return;
        lista.forEach(({ id: para }) => {
            const b = caixa(para);
            if (!b) return;
            const [faixaA, ordemA] = POSICOES_FLUXOGRAMA[de];
            const [faixaB, ordemB] = POSICOES_FLUXOGRAMA[para];
            let d;
            const volta = ordemB < ordemA;

            if (ordemB === ordemA + 1) {
                // Etapa logo à direita: curva do meio da direita ao meio da esquerda
                const x1 = a.x + a.w, y1 = a.y + a.h / 2;
                const x2 = b.x, y2 = b.y + b.h / 2;
                const meio = (x2 - x1) / 2;
                d = `M ${x1} ${y1} C ${x1 + meio} ${y1}, ${x2 - meio} ${y2}, ${x2} ${y2}`;
            } else if (ordemB === ordemA) {
                // Mesma coluna: linha reta entre as faixas
                const deCima = a.y < b.y;
                const x1 = a.x + a.w / 2, y1 = deCima ? a.y + a.h : a.y;
                const x2 = b.x + b.w / 2, y2 = deCima ? b.y : b.y + b.h;
                d = `M ${x1} ${y1} L ${x2} ${y2}`;
            } else {
                // Longa ou de retorno: sai por cima ou por baixo, corre pelo
                // corredor e entra por cima ou por baixo do destino
                let corredor;
                if (faixaA === 1 && faixaB === 1) corredor = 'margemTopo';
                else if (faixaA === 3 && faixaB === 3) corredor = 'margemBase';
                // Faixa do meio com ela mesma: corredor de baixo, que tem menos setas
                else if (faixaA === 2 && faixaB === 2) corredor = 'vao23';
                else if (Math.max(faixaA, faixaB) === 3 && Math.min(faixaA, faixaB) >= 2) corredor = 'vao23';
                else corredor = 'vao12';
                const yCorredor = corredores[corredor] + deslocamento(usoCorredor[corredor] = (usoCorredor[corredor] || 0) + 1);

                const ladoDe = yCorredor > a.y + a.h / 2 ? 'baixo' : 'cima';
                const ladoPara = yCorredor > b.y + b.h / 2 ? 'baixo' : 'cima';
                const nA = usoLado[de + ladoDe] = (usoLado[de + ladoDe] || 0) + 1;
                const nB = usoLado[para + ladoPara] = (usoLado[para + ladoPara] || 0) + 1;
                const x1 = a.x + a.w / 2 + deslocamento(nA - 1) * 2;
                const y1 = ladoDe === 'baixo' ? a.y + a.h : a.y;
                const x2 = b.x + b.w / 2 + deslocamento(nB - 1) * 2;
                const y2 = ladoPara === 'baixo' ? b.y + b.h : b.y;
                d = `M ${x1} ${y1} L ${x1} ${yCorredor} L ${x2} ${yCorredor} L ${x2} ${y2}`;
            }
            caminhos.push(`<path d="${d}" data-de="${de}" class="${volta ? 'volta' : ''}" marker-end="url(#setaFluxo)"></path>`);
        });
    });

    svg.innerHTML = `
        <defs>
            <marker id="setaFluxo" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" class="seta"></path>
            </marker>
            <marker id="setaFluxoAtiva" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" class="seta-ativa"></path>
            </marker>
        </defs>
        ${caminhos.join('')}`;
}

// ── Instrução aberta ────────────────────────────────────────────────────────
function abrirInstrucao(id) {
    const instrucao = INSTRUCOES.find(i => i.id === id);
    const area = document.getElementById('instrucoesConteudo');
    if (!instrucao || !area) return;
    instrucaoAberta = id;

    area.innerHTML = `
        <button type="button" class="btn-inline instr-voltar" id="btnVoltarIndiceInstrucoes">&larr; Voltar ao índice</button>

        <div class="instr-cabecalho">
            <span class="instr-indice-etapa">${escaparInstrucao(instrucao.etapa)}</span>
            <h2>${escaparInstrucao(instrucao.titulo)}</h2>
            <p><strong>Responsável:</strong> ${escaparInstrucao(instrucao.responsavel)}</p>
            <p><strong>Objetivo:</strong> ${escaparInstrucao(instrucao.objetivo)}</p>
        </div>

        <ol class="instr-passos">
            ${instrucao.passos.map(p => `
                <li>
                    <h3>${escaparInstrucao(p.titulo)}</h3>
                    <p>${escaparInstrucao(p.texto)}</p>
                    ${p.dica ? `<p class="instr-dica"><b>Atenção</b><span>${escaparInstrucao(p.dica)}</span></p>` : ''}
                </li>`).join('')}
        </ol>

        <section class="instr-checklist">
            <div class="instr-checklist-topo">
                <h3>Checklist</h3>
                <button type="button" class="btn-inline" id="btnLimparChecklistInstrucao">Limpar para o próximo processo</button>
            </div>
            <p class="instr-checklist-nota">Marque cada item conforme concluir. Fica salvo neste navegador e só você vê.</p>
            ${instrucao.checklist.map((item, n) => `
                <label class="instr-item">
                    <input type="checkbox" data-item="${n}">
                    <span>${escaparInstrucao(item)}</span>
                </label>`).join('')}
            <p class="instr-placar" id="placarChecklistInstrucao"></p>
        </section>

        ${htmlProximasEtapas(id)}

        <button type="button" class="btn-inline instr-voltar" id="btnVoltarIndiceInstrucoesFim">&larr; Voltar ao índice</button>
    `;

    document.getElementById('btnVoltarIndiceInstrucoes').addEventListener('click', fecharInstrucao);
    document.getElementById('btnVoltarIndiceInstrucoesFim').addEventListener('click', fecharInstrucao);
    area.querySelectorAll('[data-proxima]').forEach(btn => {
        btn.addEventListener('click', () => abrirInstrucao(btn.dataset.proxima));
    });
    area.querySelectorAll('.instr-item input[data-item]').forEach(cb => {
        cb.addEventListener('change', () => {
            const estado = lerChecklistInstrucao(id);
            estado[cb.dataset.item] = cb.checked;
            gravarChecklistInstrucao(id, estado);
            atualizarChecklistInstrucao(instrucao);
        });
    });
    document.getElementById('btnLimparChecklistInstrucao').addEventListener('click', () => {
        gravarChecklistInstrucao(id, {});
        atualizarChecklistInstrucao(instrucao);
    });
    atualizarChecklistInstrucao(instrucao);

    const wrapper = document.querySelector('.main-wrapper');
    if (wrapper) wrapper.scrollTop = 0;
}

// "Próxima etapa": um botão por caminho possível, com a condição de cada um
function htmlProximasEtapas(id) {
    const proximas = (PROXIMAS_ETAPAS[id] || [])
        .map(p => ({ ...p, instrucao: INSTRUCOES.find(i => i.id === p.id) }))
        .filter(p => p.instrucao);
    if (!proximas.length) {
        return `
        <section class="instr-proximas">
            <h3>Próxima etapa</h3>
            <p class="instr-proximas-fim">${escaparInstrucao(PROXIMA_LIVRE[id] || 'Esta é a última etapa do processo.')}</p>
        </section>`;
    }
    return `
        <section class="instr-proximas">
            <h3>${proximas.length > 1 ? 'Próxima etapa, conforme o caso' : 'Próxima etapa'}</h3>
            <div class="instr-proximas-lista">
                ${proximas.map(p => `
                    <button type="button" class="instr-proxima" data-proxima="${p.id}">
                        ${p.quando ? `<span class="instr-proxima-quando">${escaparInstrucao(p.quando)}</span>` : ''}
                        <span class="instr-proxima-destino">${escaparInstrucao(p.instrucao.etapa)} — ${escaparInstrucao(p.instrucao.titulo)} &rarr;</span>
                    </button>`).join('')}
            </div>
        </section>`;
}

function atualizarChecklistInstrucao(instrucao) {
    const estado = lerChecklistInstrucao(instrucao.id);
    document.querySelectorAll('#instrucoesConteudo .instr-item input[data-item]').forEach(cb => {
        cb.checked = !!estado[cb.dataset.item];
    });
    const total = instrucao.checklist.length;
    const feitos = instrucao.checklist.filter((_, n) => estado[n]).length;
    const placar = document.getElementById('placarChecklistInstrucao');
    if (placar) {
        const completo = feitos === total;
        placar.textContent = completo ? `${total} de ${total} concluídos.` : `${feitos} de ${total} concluídos.`;
        placar.classList.toggle('ok', completo);
    }
}

function fecharInstrucao() {
    instrucaoAberta = null;
    renderizarIndiceInstrucoes();
    const wrapper = document.querySelector('.main-wrapper');
    if (wrapper) wrapper.scrollTop = 0;
}

// Chamada ao abrir a aba Instruções no menu lateral. Reabre a instrução que
// estava aberta; senão, mostra o índice.
window.renderizarInstrucoes = function () {
    if (instrucaoAberta) abrirInstrucao(instrucaoAberta);
    else renderizarIndiceInstrucoes();
};
})();
