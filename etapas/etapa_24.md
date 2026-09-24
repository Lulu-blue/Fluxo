# Etapa 24 — Secretário Despacha

## Descrição
O secretário lê o processo, decide e emite o **Despacho Administrativo**. Exige o **parecer jurídico já emitido** na Etapa 19: sem ele, a tela avisa e não deixa avançar.

Vale por **Auto de Infração**, não pelo processo: o processo continua no painel da Etapa 18.

## Condições de Saída
| Condição | Destino |
|----------|---------|
| Decisão registrada (deferido, indeferido ou redução de 50%) | → Etapa 25 (Gerente Cumpre o Decreto) |

## Campos da Tela
1. **Documentos do processo**
   - **Abrir / Baixar processo unificado:** é o **PDF oficial com capa**, o mesmo gerado nas etapas de encerramento (`window.gerarPdfProcessoCompletoEtapa15`), agora completo. Depois da capa e dos documentos do banco (BIC, relatório, notificação, AR, multa, Auto de Infração), entram as peças da fase jurídica, nesta ordem: **defesa** (o texto colado vira uma página com o cabeçalho da SEMAC, seguido dos anexos), **movimentações com Fiscal e Gerência** (uma página com cada pedido, cada resposta e seus anexos) e, **por último, o parecer jurídico**. Textos longos são quebrados em quantas páginas forem necessárias. Entra também a **página com os dados do AR** (número, data de cadastro, recebimento ou tentativas e motivo dos Correios), logo depois do arquivo do AR.
   - **Ver parecer jurídico** e **Ver defesa:** abrem cada um separado, para consulta rápida.
   - Abaixo, a lista numerada do que entra no processo unificado.
2. **Decisão** (obrigatória): deferido, indeferido ou redução de 50%. Vem pré-marcada com o que o parecer opinou, e o secretário pode trocar.
3. **Documento do despacho** (opcional): anexo do despacho já assinado.
4. **Despacho Administrativo**: o botão **Gerar resposta padrão** monta o texto do modelo da decisão escolhida, já preenchido com processo, origem, interessado, CPF, auto e data. O texto fica editável e pode ser copiado. Colchetes pendentes **bloqueiam** o avanço.

Há ainda **Salvar rascunho**; o avanço usa o botão padrão de avançar etapa.

## Documentos Gerados
- **Despacho Administrativo** (texto), gravado no Auto e disponível para copiar.

## Uploads Necessários
Opcional: documento do despacho assinado (PDF, JPG, PNG).

## Observações
- Modelos de despacho: tabela `modelos_parecer` com `tipo = 'despacho'` (chaves `despacho_deferimento`, `despacho_indeferimento`, `despacho_reducao_50`), criados por `migracao/modelos_parecer.sql`.
- Marcadores próprios do despacho: `{{PROCESSO_NUMERO}}`, `{{CPF}}`, `{{ORIGEM_CABECALHO}}` e `{{ORIGEM}}`. Os dois últimos se adaptam ao processo: **Notificação Preliminar** quando houve NP, **Decreto Municipal** nos processos por decreto e, na falta dos dois, o próprio **Auto de Infração**.
- Para avançar é preciso ter o despacho escrito **ou** o documento anexado.
- Implementação: `assets/js/etapa24_despacho.js` (`window.Etapa24`), que reaproveita as peças da Etapa 19 por `window.ParecerCompartilhado`.
