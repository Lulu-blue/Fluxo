# Etapa 21 — Fiscal Convocado pelo Jurídico

## Descrição
O jurídico devolve o Auto de Infração ao fiscal para uma diligência: pede por escrito algo que precisa ser feito ou esclarecido (nova vistoria, foto, informação). O fiscal responde e o Auto volta para a Etapa 19.

Vale por **Auto de Infração**, não pelo processo: o processo continua no painel da Etapa 18.

## Condições de Saída
| Condição | Destino |
|----------|---------|
| Fiscal respondeu (texto e/ou anexo) | → Etapa 19 (Parecer Jurídico) |

## Campos da Tela
- **Resumo do Auto:** número, infração, autuado e imóvel.
- **Pedido do jurídico:** o texto enviado na Etapa 19, com autor e data. O pedido é opcional; quando o jurídico não escreve nada, aparece "(sem pedido escrito — analisar a defesa)".
- **Defesa apresentada:** o texto e os anexos que o jurídico registrou na Etapa 19.
- **Idas e vindas anteriores:** pedidos e respostas já concluídos, se houver.
- **Resposta ao jurídico:** campo de texto livre + anexos. É obrigatório preencher **o texto ou anexar ao menos um arquivo**.
- Botão **Salvar rascunho**; o avanço usa o botão padrão de avançar etapa.

## Documentos Gerados
Nenhum. A resposta fica registrada no Auto e aparece na Etapa 19.

## Uploads Necessários
Opcionais: fotos, relatórios ou outros documentos da diligência (PDF, JPG, PNG).

## Observações
- A ida e volta pode se repetir: cada rodada fica guardada como uma "diligência" com pedido e resposta.
- Quem edita: **Fiscal de Postura** (e Dev). Os demais cargos veem a tela em modo leitura.
- Implementação: `assets/js/etapa19_parecer.js` (`window.Etapa21`), que lê e grava no mesmo bloco `etapa19` do Auto.
