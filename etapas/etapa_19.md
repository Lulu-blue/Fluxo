# Etapa 19 — Parecer Jurídico

## Descrição
O jurídico anexa ou cola a defesa, decide e emite o parecer. Vale por **Auto de Infração**: o processo continua no painel da Etapa 18, e cada Auto é analisado na sua própria tela (abre pelo card da Etapa 18).

## Condições de Saída
| Condição | Destino |
|----------|---------|
| Devolver ao Fiscal (diligência) | → Etapa 21 (Fiscal Convocado) |
| Encaminhar à Gerência (diligência) | → Etapa 22 (Gerente Convocado) |
| Parecer pronto | → Etapa 24 (Secretário para Despacho) |

As Etapas 21 e 22 devolvem o Auto para a 19. A saída definitiva é a 24.

## Campos da Tela
- **Resumo do Auto:** número, infração, autuado, imóvel, inscrição e data da constatação.
- **Idas e vindas com o Fiscal e a Gerência:** cada rodada com o pedido, a resposta, os anexos, quem fez e quando.
- **Documentos do processo:** abrir ou baixar o **PDF oficial com capa**, o mesmo da Etapa 24 (capa, documentos do processo, dados do AR, Auto de Infração e, quando existirem, defesa, movimentações e parecer).
1. **Defesa:** anexo e/ou texto colado. O texto de PDFs anexados é extraído automaticamente.
   - **Resumo automático da defesa (IA):** o botão *Analisar defesa com IA* lê o texto e devolve um **resumo**, as **alegações identificadas** e uma **sugestão de decisão**, com o botão *Usar esta sugestão*. A IA nunca marca a decisão sozinha nem escreve o parecer. O bloco só aparece em computadores com WebGPU; sem isso, a etapa funciona normalmente.
   - O modelo roda **no próprio computador** (WebLLM): só o texto da defesa é entregue a ele — nome, CPF, endereço e inscrição não entram no prompt — e nada é enviado para servidores. O modelo é baixado uma vez e fica guardado no navegador.
2. **Decisão:** deferido, indeferido e, conforme a infração, redução de 50% ou deferimento parcial; há ainda a opção de complementação documental. As opções vêm dos modelos cadastrados para o código da infração.
3. **Texto do parecer:** modelo preenchido e editável, com botões de copiar, recarregar o modelo e editar o modelo padrão. Trechos entre [colchetes] **bloqueiam** o avanço.
4. **Encaminhamento:** 21, 22 ou 24.

Há ainda **Salvar rascunho**; o avanço usa o botão padrão de avançar etapa.

## Regras de avanço
- **Para 21 ou 22 (diligência):** exige **a defesa** (anexo ou texto). Parecer, decisão e pedido escrito são opcionais.
- **Para 24:** exige decisão e texto do parecer sem colchetes pendentes. Sem defesa, pede confirmação.

## Documentos Gerados
- **Parecer jurídico** (texto), gravado no Auto e disponível para copiar. Entra no PDF unificado do processo.

## Uploads Necessários
Defesa do autuado (PDF, JPG, PNG) — ou o texto colado.

## Observações
- Quem edita: **Jurídico** e **Gerente de Interface Jurídica** (e Dev).
- Modelos de parecer: tabela `modelos_parecer` com `tipo = 'parecer'`, criados por `migracao/modelos_parecer.sql`.
- IA do resumo: `assets/js/ia_defesa.js` (`window.IADefesa`), com WebLLM e o modelo Qwen2.5 1.5B (0.5B como plano B em máquinas mais fracas). A análise fica gravada em `etapa19.ia`.
- Implementação: `assets/js/etapa19_parecer.js` (`window.Etapa19`, `window.Etapa21`, `window.Etapa22`). O PDF unificado vem de `window.ProcessoUnificado`, em `assets/js/etapa24_despacho.js`.
