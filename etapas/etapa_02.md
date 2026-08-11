# Etapa 2 — Defesa ou Dilação de Prazo

## Descrição
Começa a contar o prazo de vencimento e a defesa ou dilação de prazo
Detalhe importante: cada tipo selecionado em "Quais dispositivos legais foram transgredidos?" gera um numero de Notificação diferente então tem prazos de vencimento diferentes, os valores estão em Vencimentos.docx que esta nessa pasta etapas.
Cada numero de notificação segue sua etapa separadamente
## Condições de Saída
| Condição | Destino |
|----------|---------|
|Notificações atendidas| → Etapa 7
|Defesa (fiscal seleciona que ouve defesa dentro do prazo)| → Etapa 4 |
|Dilação de Prazo (Fiscal seleciona que houve o pedido para Dilação de prazo)| → Etapa 4 |
|Não Atendido e Vencido (Fiscal não selecionou nenhuma opção e o prazo venceu)| → Etapa 7|

## Campos da Tela
Para o fiscal fica em uma tela contando o prazo de vencimento para CADA numero de Notificação Gerado e o prazo de 10 dias para defesa de cada uma das NPs. 
Enquanto o prazo não vence o fiscal vai ver alem dos prazos para cada numero de notificação ele vai poder selecionar se foi atendido ou não, se foi atendido ele vai selecionar a opção e essa notificação vai aparecer como "Notificação atendida" e entra a etapa 7.
Se o fiscal seleciona defesa ou dilação de prazo vai para a etapa 4, ficando salvo a opção selecionada.
se não foi atendido ele vai deixar a opção em branco ate que chegue no prazo de vencimento, quando chegar no prazo de vencimento Vai avançar automaticamente para a etapa 7, informando que venceu.

