# Etapa 30 — Gerente Localiza o AR

## Descrição
O gerente localiza o AR (Aviso de Recebimento) que está pendente ou não voltou.

## Condições de Saída
| Condição | Destino |
|----------|---------|
| Não Efetivado | → Etapa 17 (Gerência Gera o Edital) |
--> Se JÁ passou pela etapa 14:
    | Efetivado | → Etapa 18 (Solicitar Defesa ou Recurso) |
--> Se NÃO passou pela etapa 14:
    | Efetivado | → Etapa 2 
    
## Campos da Tela
Quando chega nessa etapa, deve aparecer uma notificação para o usuário Gerente de Posturas que existe um processo Pendente e ele deve ser localizado.
Vai aparecer para ele todas as informações do processo, mas o mais importante que é o Numero do AR.
Gerencia fai informar se Foi efetivado ou não.

## Check List 
- Ar efetivado?
    - Efetivado: etapa 17
    - Não Efetivado: etapa 18/2