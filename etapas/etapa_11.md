# Etapa 11 — Gerente antes Infração

## Descrição
O gerente analisa o caso antes da infração e decide o encaminhamento.
Deve aparecer todos os documento para ele abrir e visualisar e baixar se quiser, mas os principais são: A replica e a Defesa anexada, Se não vier defesa deve vim como principal o Comprovante de renda e o comprovante de residencia.
Os outros documentos deve ficar disponivel para visualização e download, mas não devem ser os principais, deve ficar na parte de baixo.

Apos a analise ele deve escolher uma das opções abaixo:
- Indeferido
- Deferido
- Dilatar prazo (deve ter campo para digitar a nova data de vencimento e não permitir o fiscal clicar em dilatar prazo)
- Mandar de volta para o fiscal para ele analisar novamente a defesa
obs: todos eles devem ter um campo de texto para escrever o motivo da decisão.

## Condições de Saída
| Condição | Destino |
|----------|---------|
| Análise: Indeferido | → Etapa 10 (Certidão Sem Defesa - Marcado como Não) |
| Análise: Deferido | → Etapa 29 (Fiscal Emite Certidão) |
| Análise: Dilatar prazo | → Etapa 2 |
|Mandar de volta para o fiscal para ele analisar novamente a defesa| → Etapa 3 (A defesa ja anexada mas com o motivo em destaque para o fiscal analisar antes de avançar a etapa novamente)|

## Campos da Tela
<!-- PREENCHA AQUI -->

## Documentos Gerados
<!-- PREENCHA AQUI -->

## Uploads Necessários
<!-- PREENCHA AQUI -->

## Observações
<!-- PREENCHA AQUI -->
