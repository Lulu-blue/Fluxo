# Etapa 25 — Gerente Cumpre o Decreto

## Descrição
Depois do despacho do Secretário, o gerente escolhe o desfecho, gera o ofício à Fazenda (quando houver) e copia a mensagem para responder no protocolo. Vale por **Auto de Infração**; o processo continua no painel da Etapa 18.

## Condições de Saída
| Opção | Ofício | Anexo obrigatório | Destino | Prazo |
|---|---|---|---|---|
| Redução de 50% | Sim | Nova multa | → Etapa 31 | Recomeça: 30 dias a partir da entrada na 31 |
| Alteração de valor | Sim (com parágrafo escrito pelo gerente) | Nova multa | → Etapa 31 | Recomeça: 30 dias |
| Cancelamento | Não | — | → Etapa 29 (encerra) | Não se aplica |
| Continuidade na cobrança | Não | — | → Etapa 31 | Continua de onde parou (os dias que faltavam) |

Na continuidade, o prazo **nunca é reiniciado**:
- **Ainda no prazo:** segue com os dias que faltavam, contados a partir da entrada na Etapa 31.
- **Já vencido:** continua vencido, mantendo a data original. A tela avisa há quantos dias venceu.
- **Sem prazo registrado:** a tela avisa e o Auto segue sem prazo, em vez de ganhar um novo.

## Campos da Tela
1. **Documentos do processo:** abrir ou baixar o PDF oficial com capa, o mesmo das Etapas 19 e 24 — aqui ele já inclui o **despacho do Secretário** no fim. Há também os botões **Ver parecer jurídico** e **Ver despacho do Secretário**, que abrem cada peça sozinha.
2. **Desfecho** (obrigatório): as quatro opções acima, cada uma explicando o que acontece com o prazo.
3. **Justificativa da alteração de valor** (só nessa opção, obrigatória): entra no meio do ofício, no lugar do texto padrão.
4. **Ofício para a Fazenda**: gerado a partir do modelo, no papel timbrado da SEMAC. O texto é **editável na própria tela** (clique e escreva), assim como o nome do destinatário. As edições são salvas com o Auto e entram no PDF unificado. O botão **Restaurar texto do modelo** descarta as alterações e volta ao padrão.
5. **Mensagem para o protocolo**: texto curto, editável, com botão de copiar.
6. **Nova multa emitida pela Fazenda** (redução e alteração): anexo obrigatório para avançar.

## Documentos Gerados
- **Ofício SEMAC – GFP à Fazenda** (redução de 50% e alteração de valor).

## Uploads Necessários
Nova multa emitida pela Fazenda, nas opções de redução e alteração.

## Observações
- Enquanto `migracao/modelos_parecer.sql` não for executado, a tela usa uma cópia dos textos embutida no próprio arquivo e mostra um aviso. Com o SQL rodado, valem os textos do banco, editáveis.
- Modelos: tabela `modelos_parecer`, tipos `oficio_fazenda` e `mensagem_fazenda` (`migracao/modelos_parecer.sql`). No corpo do ofício, `**texto**` vira negrito e a linha em branco separa parágrafos. Marcadores: `{{AUTO_NUMERO}}`, `{{DEFENDENTE}}`, `{{PROCESSO_NUMERO}}` e `{{TEXTO_MANUAL}}`.
- Implementação: `assets/js/etapa25_fazenda.js` (`window.Etapa25`). O papel timbrado vem de `window.montarHtmlOficioSemac`, em `assets/js/oficio-modelo.js`, o mesmo do ofício da Etapa 15.
