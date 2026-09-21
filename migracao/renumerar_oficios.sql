-- ============================================================
-- RENUMERAÇÃO DOS OFÍCIOS GFP CONFORME A PLANILHA DE OFÍCIOS
--
-- Origem dos números: "PLANILHA DE OFÍCIOS (1).ods" (a fonte correta).
-- O casamento foi feito pela coluna Assunto da planilha, nas linhas
-- "EMISSÃO DE GUIA DE PAGAMENTO PA <n>/<ano>", comparando <n>/<ano> com o
-- numero_processo do banco (PA 426/2026  ->  2026/000426). O ano entra na
-- comparação de propósito: a planilha tem PA 93/2022 e PA 93/2026.
--
-- Como fica a numeração:
--   * 35 processos estão na planilha e recebem o número dela;
--   * todos os demais ofícios do banco seguem a sequência a partir de
--     535 (o último número da planilha), em ordem de data de criação:
--     536, 537, 538... Assim não sobra buraco na numeração.
--
-- Rode um PASSO por vez, conferindo o resultado antes de seguir.
-- Faça um backup do banco antes (Supabase > Database > Backups).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PASSO 1 — Números que vêm da planilha
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS mapa_renumeracao_oficios;
CREATE TABLE mapa_renumeracao_oficios (
    processo_id     UUID PRIMARY KEY,
    numero_processo TEXT NOT NULL,          -- conferido contra processos.numero_processo
    numero_novo     TEXT NOT NULL UNIQUE,
    origem          TEXT NOT NULL
);

INSERT INTO mapa_renumeracao_oficios (processo_id, numero_processo, numero_novo, origem) VALUES
    ('6926397a-2519-4e4f-93e6-3c5874d170f4', '2026/000289', '2026/473', 'planilha'),
    ('6a7737c8-b7e1-423b-8da3-f38960fa6fae', '2026/000373', '2026/483', 'planilha'),
    ('3410f845-0dea-4b32-acba-e23e50e0d647', '2026/000385', '2026/493', 'planilha'),
    ('f7a0c70d-e568-4a44-88a4-5984a91ac84c', '2026/000392', '2026/495', 'planilha'),
    ('c6121e7f-0a9d-4564-a7a5-3cfd59655c9d', '2026/000396', '2026/500', 'planilha'),
    ('b113f370-756a-4d56-9cc7-7be93cce3b22', '2026/000397', '2026/501', 'planilha'),
    ('8bb5a440-2995-4b8e-90c7-c7b446cdd5ec', '2026/000399', '2026/502', 'planilha'),
    ('25d2964b-6a2f-45d3-a306-854615f6fa6d', '2026/000400', '2026/503', 'planilha'),
    ('e98be5b0-5c2f-4313-bfe4-8c6c7ae1145f', '2026/000387', '2026/504', 'planilha'),
    ('ae69a3e9-a707-416a-ab2f-80d840b4acd3', '2026/000388', '2026/505', 'planilha'),
    ('73da2a41-5b1a-4e10-bb90-b76985e63ecc', '2026/000401', '2026/506', 'planilha'),
    ('ae9af272-d02d-49b4-8a96-88cd80df2619', '2026/000402', '2026/507', 'planilha'),
    ('32a7b4fb-d425-409f-9ff8-82fd915233c6', '2026/000403', '2026/508', 'planilha'),
    ('1e5410ce-cc79-45a4-9464-3df950b19bf3', '2026/000404', '2026/509', 'planilha'),
    ('712c3049-ac31-43ed-a9d6-4b90d8626da5', '2026/000405', '2026/510', 'planilha'),
    ('75bdc425-16c0-4ac3-990e-96de95b16fa1', '2026/000293', '2026/511', 'planilha'),
    ('52101f10-3a36-4f89-97bd-81df77a5783a', '2026/000410', '2026/514', 'planilha'),
    ('c8b77d01-0dc8-43ae-94fa-ad00ea281f45', '2026/000407', '2026/515', 'planilha'),
    ('0247e5c8-b713-442e-98d0-c3e27d2de55d', '2026/000412', '2026/517', 'planilha'),
    ('e7af5147-13bd-4634-9f06-249fd394aa7c', '2026/000409', '2026/518', 'planilha'),
    ('cf27e7aa-39e8-460a-b0db-5dc54a292f3e', '2026/000414', '2026/520', 'planilha'),
    ('74c32084-ebac-4566-b0e7-cdf9fad3ee6a', '2026/000416', '2026/521', 'planilha'),
    ('f1ce9a36-24e2-4954-a88b-62b682c3c117', '2026/000417', '2026/522', 'planilha'),
    ('03414a5b-3e3c-43b9-b5aa-45a924bba41d', '2026/000419', '2026/523', 'planilha'),
    ('1dd99311-7d48-4412-8e14-20a496d9cb9b', '2026/000420', '2026/524', 'planilha'),
    ('0edd7b24-fb21-4006-9a81-fdadf1b1d411', '2026/000421', '2026/525', 'planilha'),
    ('df49a8e1-7406-4d16-9c69-99aa3622160c', '2026/000422', '2026/526', 'planilha'),
    ('7dd0e5be-bfd1-4fb8-b33a-c1dcd7a5b35b', '2026/000423', '2026/527', 'planilha'),
    ('82fb2ca3-18e7-46e4-9c97-1cbd554813d2', '2026/000425', '2026/528', 'planilha'),
    ('95d3382e-bce4-49d8-ae83-2f10e16a8715', '2026/000424', '2026/529', 'planilha'),
    ('671668e7-9422-47c5-a3b2-7f39bc41b317', '2026/000426', '2026/530', 'planilha'),
    ('71c5d262-522f-414e-b860-0fdce213d9a6', '2026/000427', '2026/531', 'planilha'),
    ('08970e22-5451-4771-bb8b-41b15c065446', '2026/000428', '2026/532', 'planilha'),
    ('ea014234-4372-4b91-8ddf-63b14270d1b8', '2026/000430', '2026/533', 'planilha'),
    ('964dd5ae-3460-4a83-b97d-61cca65eef16', '2026/000431', '2026/534', 'planilha');

-- Tem que devolver 35
SELECT COUNT(*) AS vindos_da_planilha FROM mapa_renumeracao_oficios;


-- ────────────────────────────────────────────────────────────
-- PASSO 2 — Os que não estão na planilha entram na sequência,
--           por ordem de data de criação, a partir de 536
-- ────────────────────────────────────────────────────────────
INSERT INTO mapa_renumeracao_oficios (processo_id, numero_processo, numero_novo, origem)
WITH pendentes AS (
    SELECT
        p.id                AS processo_id,
        p.numero_processo,
        COALESCE(
            (SELECT MIN(d.created_at) FROM documentos d
              WHERE d.processo_id = p.id AND d.tipo = 'Ofício GFP'),
            p.created_at
        ) AS criado_em
    FROM processos p
    WHERE p.id NOT IN (SELECT processo_id FROM mapa_renumeracao_oficios)
      AND (
            EXISTS (SELECT 1 FROM documentos d
                     WHERE d.processo_id = p.id AND d.tipo = 'Ofício GFP')
         OR p.dados ? 'numero_oficio_gfp'
         OR EXISTS (SELECT 1 FROM notificacoes n
                     WHERE n.processo_id = p.id AND n.dados ? 'numero_oficio_gfp')
          )
),
numerados AS (
    SELECT
        processo_id,
        numero_processo,
        535 + ROW_NUMBER() OVER (ORDER BY criado_em, numero_processo) AS seq
    FROM pendentes
)
SELECT
    processo_id,
    numero_processo,
    -- GREATEST evita o LPAD cortar o número ao passar de 999
    '2026/' || LPAD(seq::TEXT, GREATEST(3, LENGTH(seq::TEXT)), '0'),
    'sequência'
FROM numerados;

-- Lista o que o passo 2 montou, em ordem de data
SELECT m.numero_novo, m.numero_processo, d.numero_sequencial AS oficio_hoje, MIN(d.created_at)::DATE AS criado_em
FROM mapa_renumeracao_oficios m
LEFT JOIN documentos d ON d.processo_id = m.processo_id AND d.tipo = 'Ofício GFP'
WHERE m.origem = 'sequência'
GROUP BY m.numero_novo, m.numero_processo, d.numero_sequencial
ORDER BY m.numero_novo;


-- ────────────────────────────────────────────────────────────
-- PASSO 3 — Conferência (não altera nada)
-- ────────────────────────────────────────────────────────────

-- 3a. O número do processo bate? Só as linhas com confere = true serão alteradas.
SELECT
    m.origem,
    m.numero_processo                       AS processo_no_mapa,
    p.numero_processo                       AS processo_no_banco,
    (p.numero_processo = m.numero_processo) AS confere,
    d.numero_sequencial                     AS oficio_hoje,
    m.numero_novo                           AS oficio_correto,
    p.dados->>'numero_oficio_gfp'           AS guardado_no_json
FROM mapa_renumeracao_oficios m
LEFT JOIN processos p  ON p.id = m.processo_id
LEFT JOIN documentos d ON d.processo_id = m.processo_id AND d.tipo = 'Ofício GFP'
ORDER BY m.numero_novo;

-- 3b. Sobrou algum ofício de fora do mapa? Precisa vir VAZIO.
SELECT d.numero_sequencial, p.numero_processo, d.created_at::DATE
FROM documentos d
JOIN processos p ON p.id = d.processo_id
WHERE d.tipo = 'Ofício GFP'
  AND d.processo_id NOT IN (SELECT processo_id FROM mapa_renumeracao_oficios)
ORDER BY d.numero_sequencial;

-- 3c. Algum número novo já está em uso por um ofício avulso do painel?
--     Precisa vir VAZIO, senão haveria número repetido no fim.
SELECT m.numero_novo, o.numero, o.baixado_em
FROM mapa_renumeracao_oficios m
JOIN oficios_gfp o ON o.numero = m.numero_novo;

-- 3d. Resumo: quantos de cada origem e qual a faixa da sequência
SELECT origem, COUNT(*) AS quantos, MIN(numero_novo) AS primeiro, MAX(numero_novo) AS ultimo
FROM mapa_renumeracao_oficios GROUP BY origem;

| origem    | quantos | primeiro | ultimo   |
| --------- | ------- | -------- | -------- |
| sequência | 39      | 2026/536 | 2026/574 |
| planilha  | 35      | 2026/473 | 2026/534 |

-- ────────────────────────────────────────────────────────────
-- PASSO 4 — Aplica a renumeração (tudo ou nada)
-- O "p.numero_processo = m.numero_processo" garante que só muda quem confere.
-- ────────────────────────────────────────────────────────────
BEGIN;

-- 4a. documentos: número e nome do arquivo
UPDATE documentos d
SET numero_sequencial = m.numero_novo,
    nome_arquivo      = 'Oficio_GFP_' || REPLACE(m.numero_novo, '/', '-') || '.pdf'
FROM mapa_renumeracao_oficios m
JOIN processos p ON p.id = m.processo_id AND p.numero_processo = m.numero_processo
WHERE d.processo_id = m.processo_id
  AND d.tipo = 'Ofício GFP';

-- 4b. processos.dados->>'numero_oficio_gfp' (cópia usada pela tela da Etapa 15)
UPDATE processos p
SET dados = jsonb_set(COALESCE(p.dados, '{}'::jsonb), '{numero_oficio_gfp}', to_jsonb(m.numero_novo))
FROM mapa_renumeracao_oficios m
WHERE p.id = m.processo_id
  AND p.numero_processo = m.numero_processo
  AND p.dados ? 'numero_oficio_gfp';

-- 4c. notificacoes.dados->>'numero_oficio_gfp' (mesma cópia, quando a etapa roda por notificação)
UPDATE notificacoes n
SET dados = jsonb_set(COALESCE(n.dados, '{}'::jsonb), '{numero_oficio_gfp}', to_jsonb(m.numero_novo))
FROM mapa_renumeracao_oficios m
JOIN processos p ON p.id = m.processo_id AND p.numero_processo = m.numero_processo
WHERE n.processo_id = m.processo_id
  AND n.dados ? 'numero_oficio_gfp';

COMMIT;


-- ────────────────────────────────────────────────────────────
-- PASSO 5 — Confere o resultado
-- ────────────────────────────────────────────────────────────

-- 5a. A coluna ok tem que ser true em todas as linhas
SELECT
    p.numero_processo,
    m.origem,
    m.numero_novo                 AS esperado,
    d.numero_sequencial           AS em_documentos,
    p.dados->>'numero_oficio_gfp' AS em_processos_dados,
    (d.numero_sequencial = m.numero_novo
     AND COALESCE(p.dados->>'numero_oficio_gfp', m.numero_novo) = m.numero_novo) AS ok
FROM mapa_renumeracao_oficios m
JOIN processos p  ON p.id = m.processo_id
LEFT JOIN documentos d ON d.processo_id = m.processo_id AND d.tipo = 'Ofício GFP'
ORDER BY m.numero_novo;

-- 5b. Número repetido depois da troca? Precisa vir VAZIO.
SELECT numero, COUNT(*) AS vezes, STRING_AGG(origem, ', ') AS onde
FROM (
    SELECT d.numero_sequencial AS numero, 'processo ' || p.numero_processo AS origem
    FROM documentos d JOIN processos p ON p.id = d.processo_id
    WHERE d.tipo = 'Ofício GFP'
    UNION ALL
    SELECT o.numero, 'avulso do painel' FROM oficios_gfp o
) t
GROUP BY numero
HAVING COUNT(*) > 1
ORDER BY numero;

-- 5c. Buraco na sequência? Lista os números que ficaram faltando de 1 até o último.
WITH usados AS (
    SELECT DISTINCT NULLIF(regexp_replace(split_part(numero_sequencial, '/', 2), '\D', '', 'g'), '')::INT AS n
    FROM documentos WHERE tipo = 'Ofício GFP' AND numero_sequencial LIKE '2026/%'
)
SELECT g AS numero_nao_usado
FROM generate_series(1, (SELECT MAX(n) FROM usados)) g
WHERE g NOT IN (SELECT n FROM usados WHERE n IS NOT NULL)
ORDER BY g;


-- ────────────────────────────────────────────────────────────
-- PASSO 6 — Acerta o contador e limpa
-- Sem isto o próximo ofício gerado pelo sistema sairia com número errado.
-- ────────────────────────────────────────────────────────────
INSERT INTO sequenciais_contadores (categoria, ano, ultimo_numero)
SELECT 'Ofício GFP', 2026, MAX(NULLIF(regexp_replace(split_part(numero_sequencial, '/', 2), '\D', '', 'g'), '')::INT)
FROM documentos WHERE tipo = 'Ofício GFP' AND numero_sequencial LIKE '2026/%'
ON CONFLICT (categoria, ano) DO UPDATE SET ultimo_numero = EXCLUDED.ultimo_numero;

-- Fila de números descartados: limpa sobras da numeração antiga de 2026
DELETE FROM numeros_descartados WHERE categoria = 'Ofício GFP' AND ano = 2026;

-- O próximo ofício sairá com ultimo_numero + 1
SELECT categoria, ano, ultimo_numero FROM sequenciais_contadores WHERE categoria = 'Ofício GFP';

DROP TABLE mapa_renumeracao_oficios;
