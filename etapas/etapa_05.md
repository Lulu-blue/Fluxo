# Etapa 5 — Análise Dilação de Prazo

## Descrição
Gera a Replica informando se Defere ou Indefere ou manda para o gerente


## Campos da Tela
Vai aparecer as 3 opções para o fiscal
- Defere
    - Aparece campo de quantos dias sera a dilação
    - E volta para a etapa 2 com o novo prazo de vencimento MAS sem a opção de marcar dilação de prazo novamente.

- Indeferimento
    - Campo de texto para escrever o motivo do indeferimento. "pois: "
    - Vai para a etapa 7

- Manda para o gerente
    - Campo de texto para escrever o motivo. "pois: "
    - Manda para a etapa 11

## Documentos Gerados
Todos devem gerar uma Replica (igual ao Relatorio de Vistoria, tem sua numeração sequencial propria, tem o mesmo cabeçalho, tem a opção de inserir imagens com legenda e ajusta-las). 
    - As diferenças da Replica para o relatório:
        -  Não terá: Protocolo/Denúncia/Comunicação Interna; Assunto; Processo; Qualquer campo de Local da Autuação;
    - Tera: Autuado(a): (Preenchido automaticamente com o nome do contribuinte daquele processo), e PA que nesse caso é obrigatorio, (será pego automaticamente caso ja tenha sido usado no Relatorio de Vistoria daquele Processo);
    - O texto inicial será: "O contribuinte acima qualificado, com base no artigo 231 da Lei 6.907/08, diante da notificação XXXX, a qual afirma que o imóvel de sua propriedade, situado na Rua XX Nº: XXXX, precisa da(s) seguinte(s) regularização(es): (puxar aqui o motivo, exemplo: Limpeza/Inexistência de cercamento, etc), cuja notificação foi enviada via Aviso de Recebimento (AR) no dia XX/XX/20XX, com vencimento dia XX/XX/20XX." A notificação puxa automaticamente, e o endereço tambem puxa automaticamente daquele imovel daquele processo, Ja a data de envio do AR puxa automaticamente da data que foi preenchida o codigo do ar na etapa 16, e a data de vencimento puxa automaticamente da data que foi calculada usada na etapa 2.
    - Apos esse texto terá um outro texto que sera com base no tipo de seleção que o fiscal fez.
        - Deferido
            - "Após análise da dilação informamos que seu pedido foi deferido. Sem mais para o momento, estamos à disposição para maiores esclarecimentos.
            Atenciosamente,"
        - Indeferido
            - "Após análise da defesa/dilação informamos que seu pedido foi indeferido, pois (campo texto). Sem mais para o momento, estamos à disposição para maiores esclarecimentos.
            Atenciosamente,"
        - Mandar para o gerente
            - "Senhora Gerente,
            Após análise da dilação/dilação informamos que não somos favoráveis a solicitação apresentada pelo contribuinte, pois (campo texto). Encaminhamos o pedido para análise e resposta.
            Respeitosamente,"
    - Depois da Assinatura vai vim as imagens com as legendas, caso a pessoa tenha inserido, não é obrigatorio

## PDF
- No botão ao lado de Baixar Notificação (PDF), Deve ter a opção de Baixar Replica (PDF). 