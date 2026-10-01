# Etapa 31 — Comprovante de Pagamento

## Descrição
Parecida com a Etapa 18, mas **sem a opção de defesa**: o Auto já passou pelo jurídico e pelo despacho. O prazo aparece retomado conforme a escolha feita na Etapa 25.

## Condições de Saída
| Condição | Destino |
|----------|---------|
| Realizou o pagamento? **Sim** | → Etapa 29 (Fiscal Emite Certidão) |
| Realizou o pagamento? **Não** | → Etapa 28 (Certificação do Vencimento) |

## Campos da Tela
- **Resumo do Auto**: processo, número do Auto, infração, autuado e o despacho do Secretário.
- **Documentos do processo**: abrir ou baixar o PDF oficial com capa, além dos botões **Ver parecer jurídico** e **Ver despacho do Secretário** para consulta rápida. Nesta altura ele já traz, no fim, o parecer jurídico, o **despacho do Secretário**, o **ofício à Fazenda** (quando houver) e a **resposta dada no protocolo**, além da nova multa anexada.
- **Prazo**: data de vencimento e quantos dias faltam (ou há quantos venceu), dizendo se o prazo recomeçou com 30 dias ou continuou de onde parou.
- **Comprovante** (opcional): anexo do comprovante de pagamento.
- **Realizou o pagamento?** (obrigatório): Sim ou Não.

## Documentos Gerados
Nenhum.

## Uploads Necessários
Opcional: comprovante de pagamento.

## Observações
- O prazo é gravado na notificação (Auto) ao sair da Etapa 25, com `prazo_origem = 'etapa25'`.
- Implementação: `assets/js/etapa25_fazenda.js` (`window.Etapa31`).
