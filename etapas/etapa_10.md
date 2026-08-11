# Etapa 10 — Certidão Sem Defesa

## Descrição
Emissão de certidão quando não houve defesa apresentada. O fiscal verifica se o problema foi resolvido.

## Condições de Saída
| Condição | Destino |
|----------|---------|
| Foi resolvido? Não | → Etapa 14 (Auto de Infração) |
| Foi resolvido? Sim | → Etapa 29 (Fiscal Emite Certidão) |

## Campos da Tela
- **O problema foi resolvido?**: (Opção Sim/Não) Deve vir **sempre marcado como Não** por padrão.

## Documentos Gerados
- **Certidão**:
  - *Regra Especial*: Se a opção "O problema foi resolvido?" for marcada como **Sim**, a última frase do documento (após a data da vistoria e a vírgula) deverá ser: *"certificamos que houve o cumprimento da obrigação: ..."*

## Uploads Necessários
- (Adicionar se necessário fotos ou comprovações da vistoria)

## Observações
- Se for **Não** (padrão), o processo segue para a Etapa 14.
- Se for **Sim**, o documento Certidão sofre a alteração textual descrita acima e o processo avança para a Etapa 29.
