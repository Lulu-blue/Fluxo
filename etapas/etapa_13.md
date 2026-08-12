# Etapa 13 — Fiscal Analisa a Defesa (1ª Defesa)

## Descrição
Gera a Replica informando se Defere ou Indefere ou manda para o gerente.


## Campos da Tela
Vai aparecer as 3 opções para o fiscal
- Defere
    - E volta para a etapa 29.

- Indeferimento
    - Campo de texto para escrever o motivo do indeferimento. "pois: "
    - Vai para a etapa 14

- Manda para o gerente
    - Seleciona se é favorável ou não.
    - Campo de texto para escrever o motivo. "pois: "
    - Manda para a etapa 11

## Documentos Gerados
Todos devem gerar uma Replica (igual a etapa 3). 
    - As diferenças dessa Replica para a da etapa 3, é que nessa os textos são ligeiramente diferentes.
        - Deferido
            - "Após análise da defesa informamos que seu pedido foi deferido. Sem mais para o momento, estamos à disposição para maiores esclarecimentos.
            Atenciosamente,"
        - Indeferido
            - "Após análise da defesa informamos que seu pedido foi indeferido, pois (campo texto). Sem mais para o momento, estamos à disposição para maiores esclarecimentos.
            Atenciosamente,"
        - Mandar para o gerente
            - Não Favoravel: 
                - "Senhor(a) Gerente,
                Após análise da defesa informamos que não somos favoráveis a solicitação apresentada pelo contribuinte, pois (campo texto). Encaminhamos o pedido para análise e resposta.
                Respeitosamente,"
            - Favoravel: 
                - "Senhor(a) Gerente,
                Após análise da defesa informamos que somos favoráveis a solicitação apresentada pelo contribuinte, pois (campo texto). Encaminhamos o pedido para análise e resposta.
                Respeitosamente,"
    - Depois da Assinatura vai vim as imagens com as legendas, caso a pessoa tenha inserido, não é obrigatorio

## PDF
- No botão ao lado de Baixar Notificação (PDF), Deve ter a opção de Baixar Replica (PDF). 