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

### Quando o AR foi efetivado
Marcando **"Sim, AR efetivado"**, a tela pede dois itens obrigatórios:
- **Data de recebimento pelo proprietário** — é dela que o prazo do autuado passa a contar;
- **Anexo(s) do AR** — o comprovante da entrega.

Os dois ficam guardados junto com os dados do AR da Etapa 16 (`campos.etapa16.data_recebimento` e `anexos_ar`), e o prazo é iniciado na hora de salvar e de avançar. Sem a data ou sem o anexo, a etapa não avança.

## Check List
- AR efetivado?
    - Efetivado: data de recebimento + anexo do AR → etapa 18 (se passou pela 14) ou etapa 2
    - Não efetivado: etapa 17