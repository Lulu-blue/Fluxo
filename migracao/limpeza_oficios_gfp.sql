-- ============================================================
-- LIMPEZA: números de Ofício GFP reservados à toa
--
-- Um defeito na geração do ofício reservava um número novo a cada redesenho da
-- etapa 15, em vez de reaproveitar o já emitido. Resultado: várias linhas de
-- 'Ofício GFP' para o mesmo processo e a sequência queimada sem necessidade.
-- O defeito já está corrigido em etapa.js; este script arruma o que ficou.
--
-- Critério: para cada processo fica o ofício MAIS ANTIGO (o primeiro número
-- emitido); os demais são apagados e seus números voltam para a fila de
-- reaproveitamento.
--
-- Rode um PASSO por vez, na ordem. O passo 1 não altera nada.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PASSO 1 — CONFERÊNCIA (não altera nada)
-- Mostra, por processo, qual ofício fica e quantos serão apagados.
-- ────────────────────────────────────────────────────────────
WITH manter AS (
    SELECT DISTINCT ON (processo_id)
        id, processo_id, numero_sequencial
    FROM documentos
    WHERE tipo = 'Ofício GFP'
    ORDER BY processo_id, created_at ASC
)
SELECT
    p.numero_processo,
    m.numero_sequencial                                   AS oficio_que_fica,
    COUNT(d.id)                                           AS total_de_linhas,
    COUNT(d.id) - 1                                       AS serao_apagadas,
    STRING_AGG(d.numero_sequencial, ', ' ORDER BY d.created_at)
        FILTER (WHERE d.id <> m.id)                       AS numeros_devolvidos
FROM manter m
JOIN processos  p ON p.id = m.processo_id
JOIN documentos d ON d.processo_id = m.processo_id AND d.tipo = 'Ofício GFP'
GROUP BY p.numero_processo, m.id, m.numero_sequencial
ORDER BY serao_apagadas DESC, p.numero_processo;

-- Resumo em uma linha
SELECT
    COUNT(*)                                          AS linhas_hoje,
    COUNT(DISTINCT processo_id)                       AS processos_com_oficio,
    COUNT(*) - COUNT(DISTINCT processo_id)            AS serao_apagadas
FROM documentos
WHERE tipo = 'Ofício GFP';


-- ────────────────────────────────────────────────────────────
-- PASSO 2 — Uma única fonte da verdade para o número
-- O número passa a viver em processos.dados. A cópia em notificacoes.dados é
-- removida: ela é lida primeiro pelo código e, se apontasse para uma linha
-- apagada, venceria a linha correta.
-- ────────────────────────────────────────────────────────────
UPDATE processos p
SET dados = jsonb_set(
        COALESCE(p.dados, '{}'::jsonb),
        '{numero_oficio_gfp}',
        to_jsonb(m.numero_sequencial)
    )
FROM (
    SELECT DISTINCT ON (processo_id) processo_id, numero_sequencial
    FROM documentos
    WHERE tipo = 'Ofício GFP' AND numero_sequencial IS NOT NULL
    ORDER BY processo_id, created_at ASC
) m
WHERE p.id = m.processo_id
  AND p.dados->>'numero_oficio_gfp' IS DISTINCT FROM m.numero_sequencial;

UPDATE notificacoes
SET dados = dados - 'numero_oficio_gfp'
WHERE dados ? 'numero_oficio_gfp';


-- ────────────────────────────────────────────────────────────
-- PASSO 3 — Apaga as linhas sobrando e devolve os números
-- Só apaga ofícios SEM arquivo anexado (url nula), que é o caso de todos os
-- gerados automaticamente. Se algum dia um ofício for anexado, ele fica.
-- ────────────────────────────────────────────────────────────
WITH manter AS (
    SELECT DISTINCT ON (processo_id) id
    FROM documentos
    WHERE tipo = 'Ofício GFP'
    ORDER BY processo_id, created_at ASC
),
removidos AS (
    DELETE FROM documentos d
    WHERE d.tipo = 'Ofício GFP'
      AND d.url IS NULL
      AND d.id NOT IN (SELECT id FROM manter)
    RETURNING d.numero_sequencial
)
SELECT
    numero_sequencial                                AS numero_devolvido,
    devolver_numero(numero_sequencial, 'Ofício GFP') AS devolvido
FROM removidos
WHERE numero_sequencial IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- PASSO 4 — Verificação final
-- ────────────────────────────────────────────────────────────

-- Deve sobrar exatamente um ofício por processo (nenhuma linha aqui)
SELECT
    p.numero_processo,
    COUNT(*) AS linhas
FROM documentos d
JOIN processos p ON p.id = d.processo_id
WHERE d.tipo = 'Ofício GFP'
GROUP BY p.numero_processo
HAVING COUNT(*) > 1;

-- Nenhum número repetido entre processos diferentes (nenhuma linha aqui)
SELECT
    numero_sequencial,
    COUNT(*) AS vezes
FROM documentos
WHERE tipo = 'Ofício GFP'
GROUP BY numero_sequencial
HAVING COUNT(*) > 1;

-- Como ficou: um ofício por processo, e o que voltou para a fila
SELECT
    p.numero_processo,
    d.numero_sequencial AS oficio,
    d.created_at::DATE  AS emitido_em
FROM documentos d
JOIN processos p ON p.id = d.processo_id
WHERE d.tipo = 'Ofício GFP'
ORDER BY
    NULLIF(regexp_replace(split_part(d.numero_sequencial, '/', 1), '\D', '', 'g'), '')::INT,
    NULLIF(regexp_replace(split_part(d.numero_sequencial, '/', 2), '\D', '', 'g'), '')::INT;

-- Os números que voltaram para a fila de reaproveitamento.
-- numeros_descartados é a fila que o reservar_numero consulta antes de gerar
-- um número novo.
SELECT
    numero_sequencial,
    ano,
    created_at
FROM numeros_descartados
WHERE categoria = 'Ofício GFP'
ORDER BY ano, regexp_replace(numero_sequencial, '\D', '', 'g')::INT;
