# Etapa 1 — Possui Decreto/Notificação

## Descrição:
Cria uma nova solicitação


## Condições de Saída
| Condição | Destino |
|----------|---------|
| So avança para essa etapa se anexar o pdf e o campo Decorrente de Decreto estiver como (Não) | → Etapa 16|
| So avança para essa etapa se anexar o pdf e o campo Decorrente de Decreto estiver como (Sim) | → Etapa 14 (Auto de Infração) |
| So avança para essa etapa se anexar o pdf e o campo Processo já existente? estiver como (Sim) | → Etapa 14 (Auto de Infração) |

## Campos da Tela
Ao clicar em nova solicitação ele abre a telinha pedindo o primeiro o CPF/CNPJ do solicitante (Verifica se o cpf/cnpj pode existir com base na conta matematica), se não existir na base, ele pede o nome do solicitante e o email se tiver(email não é obrigatório).

Depois vem as informações 
- Primeiro uma opção de anexar e coletar as informações do documento anexado essa parte deve chamar "Anexo Planilha em XLSX da BETHA", o modelo é o "modelo NP.pdf", a pessoa vai poder colocar esse documento em DOC, csv, ou XLSX. Se a pessoa anexar deve auto preencher os campos abaixo com base no arquivo anexado.
- Se não anexar deve preencher manualmente os campos abaixo: 
Primeiro formulario: Dados do "Contribuente"
    - Nome do Contribuente (No modelo NP esta em INFORMAÇÕES DO CONTRIBUINTE na frente de Contribuinte)
    - CPF/CNPJ do Contribuente (No modelo NP esta em INFORMAÇÕES DO CONTRIBUINTE na frente de Nº CPF / CNPJ)
    - Logradouro Contribuente (No modelo NP esta em INFORMAÇÕES DO CONTRIBUINTE na frente de Logradouro:)
    - Número Contribuente (No modelo NP esta em INFORMAÇÕES DO CONTRIBUINTE na frente de Número:)
    - Complemento (No modelo NP esta em INFORMAÇÕES DO CONTRIBUINTE na frente de Observacão:)
    - Bairro do Contribuente (No modelo NP esta em INFORMAÇÕES DO CONTRIBUINTE na frente de Bairro:)
    - Municipio do Contribuente (No modelo NP esta em INFORMAÇÕES DO CONTRIBUINTE na frente de Munícipio:)
    - CEP do Contribuente (No modelo NP esta em INFORMAÇÕES DO CONTRIBUINTE na frente de CEP:)

Segundo Formulario: Dados do Imóvel
    - Codigo Reduzido do Imóvel (No modelo NP esta em INFORMAÇÕES DO IMÓVEL na frente de Código:)
    - Inscrição do Imovel (No modelo NP esta em INFORMAÇÕES DO IMÓVEL na frente de Inscrição do Imóvel:)
        - Com base no numero preenchido, seja automatico ou manual, deve fazer uma separação automatica: cada parte da sua numeração 01.036.00181.00300.00000.0:
            - 01 (Setor): É a macrorregião ou distrito geográfico da cidade onde o imóvel está localizado.
            - 036 (Zona): Uma subdivisão dentro da zona, geralmente englobando um bairro específico ou um conjunto de bairros.
            - 00181 (Quadra): É o número do quarteirão exato onde o imóvel se encontra dentro desse setor.
            - 00300 (Lote): Identifica a posição do terreno específico dentro dessa quadra.
    - Logradouro Imóvel (No modelo NP esta em INFORMAÇÕES DO IMÓVEL na frente de Logradouro::)
    - Número Imóvel (No modelo NP esta em INFORMAÇÕES DO IMÓVEL na frente de Número:)
    - Complemento Imóvel (No modelo NP esta em INFORMAÇÕES DO IMÓVEL na frente de Complemento:)
    - Bairro Imóvel (No modelo NP esta em INFORMAÇÕES DO IMÓVEL na frente de Bairro:)
    - Área Total (No modelo NP esta em "Verificamos que o imóvel de sua propriedade situado à JOSE TEODORO FERREIRA, 0, - SANTA ROSA - com 12 m de extensao e **300 m²** de área", o valor que deve ser pego é o em negrito )
    - Testada (No modelo NP esta em "Verificamos que o imóvel de sua propriedade situado à JOSE TEODORO FERREIRA, 0, - SANTA ROSA - com **12 m** de extensao e 300 m² de área":)
    - Profundidade (No modelo NP pode aparecer nessa mesma frase "Verificamos que o imóvel de sua propriedade situado à JOSE TEODORO FERREIRA, 0, - SANTA ROSA - com 12 m de extensao e 300 m² de área" mas tera a palavra profundidade na frente)

Terceiro Formulario: Fiscal
    - Nome do Fiscal (pega o nome do fiscal/usuario)
    - Matricula do Fiscal (pega a matricula do fiscal/usuario - deve ter no banco de dados dos usuarios)
    - Data da Vistoria (pega a data atual mas pode ser alterada para uma data anterior)
    - Descrição da Fiscalização (opcional e mais na frente tera respostas padroes para preencher automaticamente baseado no Formulario Infrações no campo selecionado de "Quais dispositivos legais foram transgredidos?")
    - Imagem da Vistoria (opcional, onde a pessoa pode anexar uma ou mais imagens)
    - Decorrente de Decreto de Notificação? (sim ou não, é o que define a proxima etapa)
        - Anexo do decreto de notificação (se for sim)

Quarto formulario: Infrações
    - A infração é reincidente ?(opcional)
    - Quais dispositivos legais foram transgredidos?
        - Falta de limpeza e conservação de imóvel não edificado - Posturas (SUB Processo) | 120000232
        - Inexistência de Cercamento - Posturas (SUB Processo) | 120000211
        - Inexistência de passeio - Posturas (SUB Processo) | 120000226
        - Reincidência na inexistência de cercamento e/ou passeio - Posturas (SUB Processo) | 120000228
        - Reincidência na inexistência de passeio - Posturas (SUB Processo) | 120000227
        - Reconstrução de/ou reparo de muro - Posturas (SUB Processo) | 120000229
        - Reconstrução e/ou reparo de passeio- Posturas (SUB Processo) | 120000240
        - Limpeza de Quintal - Posturas (SUB Processo) | 120000233
        - Obstáculos em calçadas - Posturas (SUB Processo) | 120000237
        - Água servida - (SUB Processo) | 120000239
        - Estabelecimento sem Alvará - Posturas (SUB Processo) | 120000236
        - Reparos por concessionárias - Posturas (SUB Processo) | 120000234
        - Piso Tátil - Posturas (SUB Processo) | 120000230
        (Pode selecionar mais de uma)
    - Processo já Existente?(sim ou não, se sim anexa ele)

## Documentos Gerados
Apos inserir todos os dados vai gerar um documento chamado Notificação Preliminar - Protocolo Nº [NUMERO_DO_PROTOCOLO], com os dados preenchidos acima. O ducumento deve ser igual ao modelo "Modelo - Notificação Preliminar.pdf". O usuário deve ter a opção de baixar o documento em PDF ou DOC.
    Cada um dos "Quais dispositivos legais foram transgredidos?" selecionados vai gerar um Numero de Notificação DIferente e uma descrição diferente, e antes de gerar o documeto deve pedir os valores da Multa para cada um deles. 

## Observação
Quando em "Quais dispositivos legais foram transgredidos?" os tipos:
- Reincidência na Inexistência de Cercamento
- Reincidência na Inexistência de passeio
Vai pedir para preencher o campo: N° Auto de Infração expedido anteriormente e Data do Auto de Infração expedido anteriormente
para preencher os campos no texto:
"Observação do Fiscal: Na hipótese de reincidência, aplicar-se-á em dobro a multa
respectivamente prevista no art. 4º da Lei 7.174/2010. Auto de Infração expedido anteriormente: nº
[NÚMERO DO AUTO DE INFRAÇÃO] em [DATA DO AUTO DE INFRAÇÃO]."