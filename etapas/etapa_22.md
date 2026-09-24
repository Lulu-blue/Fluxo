# Etapa 22 — Gerente Convocado pelo Jurídico

## Descrição
Mesma mecânica da Etapa 21, mudando quem responde: o jurídico envia o Auto de Infração à gerência pedindo algo por escrito (conferir cálculo, confirmar informação, dar posição). A gerência responde e o Auto volta para a Etapa 19.

Vale por **Auto de Infração**, não pelo processo: o processo continua no painel da Etapa 18.

## Condições de Saída
| Condição | Destino |
|----------|---------|
| Gerência respondeu (texto e/ou anexo) | → Etapa 19 (Parecer Jurídico) |

## Campos da Tela
- **Resumo do Auto:** número, infração, autuado e imóvel.
- **Pedido do jurídico:** o texto enviado na Etapa 19, com autor e data. O pedido é opcional; sem ele aparece "(sem pedido escrito — analisar a defesa)".
- **Defesa apresentada:** texto e anexos registrados na Etapa 19.
- **Idas e vindas anteriores:** rodadas já concluídas, com Fiscal ou Gerência.
- **Resposta ao jurídico:** texto livre + anexos. É obrigatório **o texto ou ao menos um anexo**.
- Botão **Salvar rascunho**; o avanço usa o botão padrão de avançar etapa.

## Documentos Gerados
Nenhum. A resposta fica registrada no Auto e aparece na Etapa 19.

## Uploads Necessários
Opcionais: documentos, cálculos ou outros arquivos da consulta (PDF, JPG, PNG).

## Observações
- Quem edita: **Gerente** (e Dev). Os demais cargos veem em modo leitura.
- Implementação: `assets/js/etapa19_parecer.js` (`window.Etapa22`), a mesma função que gera a tela da Etapa 21 — muda apenas quem é o convocado.
- Com 21 e 22 voltando para a 19, a única saída definitiva da Etapa 19 é a **Etapa 24 (Secretário para Despacho)**.
