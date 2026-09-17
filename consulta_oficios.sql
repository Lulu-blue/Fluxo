-- ============================================================
-- Todos os números de Ofício GFP usados, com o processo de cada um
-- Rode no SQL Editor do Supabase.
-- ============================================================

SELECT
    d.numero_sequencial              AS numero_oficio,
    p.numero_processo                AS numero_processo,
    p.id                             AS processo_id,
    d.id                             AS documento_id,
    d.notificacao_id,
    d.created_at::DATE               AS emitido_em
FROM documentos d
JOIN processos p ON p.id = d.processo_id
WHERE d.tipo = 'Ofício GFP'
ORDER BY
    -- ordena pelo ano e depois pelo sequencial, tratando "2026/007" como número
    NULLIF(regexp_replace(split_part(d.numero_sequencial, '/', 1), '\D', '', 'g'), '')::INT,
    NULLIF(regexp_replace(split_part(d.numero_sequencial, '/', 2), '\D', '', 'g'), '')::INT;


-- ────────────────────────────────────────────────────────────
-- Variante: pega também os números que ficaram só no JSON do processo
-- (numero_oficio_gfp em processos.dados / notificacoes.dados),
-- sem linha correspondente em documentos.
-- ────────────────────────────────────────────────────────────
SELECT
    numero_oficio,
    numero_processo,
    processo_id,
    origem
FROM (
    SELECT
        d.numero_sequencial                  AS numero_oficio,
        p.numero_processo,
        p.id                                 AS processo_id,
        'documentos'                         AS origem
    FROM documentos d
    JOIN processos p ON p.id = d.processo_id
    WHERE d.tipo = 'Ofício GFP'
      AND d.numero_sequencial IS NOT NULL

    UNION

    SELECT
        p.dados->>'numero_oficio_gfp',
        p.numero_processo,
        p.id,
        'processos.dados'
    FROM processos p
    WHERE p.dados->>'numero_oficio_gfp' IS NOT NULL

    UNION

    SELECT
        n.dados->>'numero_oficio_gfp',
        p.numero_processo,
        p.id,
        'notificacoes.dados'
    FROM notificacoes n
    JOIN processos p ON p.id = n.processo_id
    WHERE n.dados->>'numero_oficio_gfp' IS NOT NULL
) t
ORDER BY
    NULLIF(regexp_replace(split_part(numero_oficio, '/', 1), '\D', '', 'g'), '')::INT,
    NULLIF(regexp_replace(split_part(numero_oficio, '/', 2), '\D', '', 'g'), '')::INT;


-- ────────────────────────────────────────────────────────────
-- Conferência: números repetidos (o mesmo ofício em mais de um processo)
-- ────────────────────────────────────────────────────────────
SELECT
    d.numero_sequencial                          AS numero_oficio,
    COUNT(*)                                     AS vezes,
    STRING_AGG(DISTINCT p.numero_processo, ', ') AS processos
FROM documentos d
JOIN processos p ON p.id = d.processo_id
WHERE d.tipo = 'Ofício GFP'
GROUP BY d.numero_sequencial
HAVING COUNT(*) > 1
ORDER BY vezes DESC;
