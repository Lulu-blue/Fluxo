# Etapa 1.2 — Retorno do AR

## Descrição
Essa etapa é quando o Fiscal de posturas insere a Notificação assinada. O fiscal so pode seguir para esse etapa se ele anexar um pdf em 2º Passo: Anexar Notificação Preliminar Assinada, quando ele anexar que vai permitir ele seguir para a próxima etapa( enquanto não tiver nada anexado ele não pode seguir para a próxima etapa).

## Condições de Saída
| Condição | Destino |
|----------|---------|
| So numero do AR preenchido e passo 15 dias des dessa data  | → Etapa 30|
| Retorno sem sucesso  feito 3 vezes| → Etapa 17|
| Data de recebimento pelo Proprietario preenchida
 - Se for logo depois da etapa 1| → Etapa 2|
 - Se tiver passado pela etapa 14| → Etapa 18|

## Campos da Tela
Agora apos o fiscal avançar, essa etapa vai para um outro cargo, o Administrativo de Posturas.
Para o fiscal, enquanto o Administrativo de posturas não finalizar aparece apenas que a etapa esta com o usuario tal esperando finalizar. 

Para o Administrativo de posturas, essa etapa abre os seguintes campos: 
-   Numero do AR(apartir da data que inseriu esse campo começa a contar o prazo de 15 dias, se passar desse prazo sem avançar a etapa, ele vai pular de etapa automaticamente para a etapa 30)
-   Retorno sem sucesso ( se seleciona que sim aparece os campos abaixo)
    - Data da ultima tentativa
    - Motivo dado pelos correios
    - Anexo do AR
    ( Se for necessario preencher a primeira vez o processo volta uma etapa,ou seja, retorna para o fiscal fazer alguma alteração (Aparece uma notificação para ele na área de trabalho indicando o retorno) e voltar para o Administrativo de posturas novamente)( O Administrativo de posturas pode inserir essas informações até 3 vezes, Na terceira a etapa pula automaticamente para a etapa 17)
-   Data de recebimento pelo Proprietario (Começa a contar o prazo de Vencimento)
-   Anexo do AR
(So pode avançar para a proxima etapa manualmente se preencher a data de recebimento pelo proprietario)

