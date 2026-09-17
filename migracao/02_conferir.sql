-- ============================================================
-- MIGRAÇÃO DE ANEXOS — CONFERÊNCIA
-- Rode antes de começar (foto do "antes") e depois de migrar (foto do "depois").
-- Nenhuma consulta aqui altera dados.
-- Estas consultas leem a coluna pesada; prefira rodar fora do expediente.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Situação dos documentos de Anexo AR e Multa
--    Depois da migração, "em_base64" deve ser zero — ou só os que o script
--    listou como problema / grande demais.
-- ────────────────────────────────────────────────────────────
SELECT
    tipo,
    COUNT(*)                                                    AS total,
    COUNT(*) FILTER (WHERE url LIKE 'data:%')                   AS em_base64,
    COUNT(*) FILTER (WHERE url LIKE 'https://%')                AS em_link,
    COUNT(*) FILTER (WHERE url IS NULL OR url = '')             AS sem_arquivo,
    pg_size_pretty(SUM(octet_length(url)) FILTER (WHERE url LIKE 'data:%')) AS peso_ainda_em_base64
FROM documentos
WHERE tipo IN ('Anexo AR', 'Multa')
GROUP BY tipo
ORDER BY tipo;


-- ────────────────────────────────────────────────────────────
-- 2. Cópias da Multa em JSON que ainda estão em base64
--    Depois da migração, devem sobrar só as que não batem com nenhum documento
--    (a migração nunca troca uma cópia com conteúdo diferente).
-- ────────────────────────────────────────────────────────────
SELECT 'processos' AS tabela, COUNT(*) AS copias_em_base64
FROM processos
WHERE dados->'etapa15'->>'multa_url' LIKE 'data:%'
UNION ALL
SELECT 'notificacoes', COUNT(*)
FROM notificacoes
WHERE dados->'etapa15'->>'multa_url' LIKE 'data:%'
UNION ALL
SELECT 'autos_infracao', COUNT(*)
FROM autos_infracao
WHERE dados->>'multa_url' LIKE 'data:%';


-- ────────────────────────────────────────────────────────────
-- 3. Coerência depois da migração: a cópia da Multa no processo aponta para o
--    mesmo link do documento. Deve voltar vazio.
-- ────────────────────────────────────────────────────────────
SELECT
    p.numero_processo,
    d.id                                        AS documento_id,
    LEFT(d.url, 60)                             AS link_no_documento,
    LEFT(p.dados->'etapa15'->>'multa_url', 60)  AS valor_no_processo
FROM processos p
JOIN documentos d
  ON d.id::TEXT = p.dados->'etapa15'->>'multa_id'
WHERE d.tipo = 'Multa'
  AND d.url LIKE 'https://%'
  AND p.dados->'etapa15'->>'multa_url' IS DISTINCT FROM d.url;


-- ────────────────────────────────────────────────────────────
-- 4. Nenhum documento migrado pode ter ficado com link vazio ou quebrado.
--    Deve voltar vazio.
-- ────────────────────────────────────────────────────────────
SELECT id, tipo, nome_arquivo, url
FROM documentos
WHERE tipo IN ('Anexo AR', 'Multa')
  AND url IS NOT NULL
  AND url NOT LIKE 'data:%'
  AND url !~* '^https://res\.cloudinary\.com/[^/]+/(image|raw|video)/upload/.+';


-- ────────────────────────────────────────────────────────────
-- 5. Para informação: outros base64 que continuam no banco e ficam FORA do
--    escopo desta migração (edital, imagens antigas, cópias legadas etc.).
--    Não é erro — é o mapa do que ainda pesa.
-- ────────────────────────────────────────────────────────────
SELECT 'processos.dados' AS onde, COUNT(*) AS linhas_com_base64
FROM processos
WHERE dados::TEXT LIKE '%;base64,%'
UNION ALL
SELECT 'notificacoes.dados', COUNT(*)
FROM notificacoes
WHERE dados::TEXT LIKE '%;base64,%'
UNION ALL
SELECT 'autos_infracao.dados', COUNT(*)
FROM autos_infracao
WHERE dados::TEXT LIKE '%;base64,%'
UNION ALL
SELECT 'historico_etapas.dados_etapa', COUNT(*)
FROM historico_etapas
WHERE dados_etapa::TEXT LIKE '%;base64,%'
UNION ALL
SELECT 'documentos (outros tipos)', COUNT(*)
FROM documentos
WHERE tipo NOT IN ('Anexo AR', 'Multa')
  AND url LIKE 'data:%';
