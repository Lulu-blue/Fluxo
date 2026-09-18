-- ============================================================
-- MARCA COMO "ASSINADO" OS OFÍCIOS QUE ESTÃO NA PLANILHA DE OFÍCIOS
--
-- São os 35 processos que casaram com a "PLANILHA DE OFÍCIOS (1).ods"
-- (os mesmos marcados como origem 'planilha' em renumerar_oficios.sql).
-- Eles já foram emitidos e assinados de verdade, então a situação deles
-- passa de "sem movimentação" para "assinado".
--
-- Os ofícios que NÃO estão na planilha ficam como estão: são os que entraram
-- na sequência a partir de 536 e ainda não tiveram movimentação.
--
-- PRÉ-REQUISITO: rode antes o migracao/situacao_oficios.sql, que cria a coluna.
-- Rode um PASSO por vez no SQL Editor do Supabase.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PASSO 1 — Carrega a lista
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS oficios_da_planilha;
CREATE TABLE oficios_da_planilha (
    processo_id     UUID PRIMARY KEY,
    numero_processo TEXT NOT NULL,   -- conferido contra processos.numero_processo
    numero_oficio   TEXT NOT NULL    -- número da planilha, só para conferência visual
);

INSERT INTO oficios_da_planilha (processo_id, numero_processo, numero_oficio) VALUES
    ('6926397a-2519-4e4f-93e6-3c5874d170f4', '2026/000289', '2026/473'),
    ('6a7737c8-b7e1-423b-8da3-f38960fa6fae', '2026/000373', '2026/483'),
    ('3410f845-0dea-4b32-acba-e23e50e0d647', '2026/000385', '2026/493'),
    ('f7a0c70d-e568-4a44-88a4-5984a91ac84c', '2026/000392', '2026/495'),
    ('c6121e7f-0a9d-4564-a7a5-3cfd59655c9d', '2026/000396', '2026/500'),
    ('b113f370-756a-4d56-9cc7-7be93cce3b22', '2026/000397', '2026/501'),
    ('8bb5a440-2995-4b8e-90c7-c7b446cdd5ec', '2026/000399', '2026/502'),
    ('25d2964b-6a2f-45d3-a306-854615f6fa6d', '2026/000400', '2026/503'),
    ('e98be5b0-5c2f-4313-bfe4-8c6c7ae1145f', '2026/000387', '2026/504'),
    ('ae69a3e9-a707-416a-ab2f-80d840b4acd3', '2026/000388', '2026/505'),
    ('73da2a41-5b1a-4e10-bb90-b76985e63ecc', '2026/000401', '2026/506'),
    ('ae9af272-d02d-49b4-8a96-88cd80df2619', '2026/000402', '2026/507'),
    ('32a7b4fb-d425-409f-9ff8-82fd915233c6', '2026/000403', '2026/508'),
    ('1e5410ce-cc79-45a4-9464-3df950b19bf3', '2026/000404', '2026/509'),
    ('712c3049-ac31-43ed-a9d6-4b90d8626da5', '2026/000405', '2026/510'),
    ('75bdc425-16c0-4ac3-990e-96de95b16fa1', '2026/000293', '2026/511'),
    ('52101f10-3a36-4f89-97bd-81df77a5783a', '2026/000410', '2026/514'),
    ('c8b77d01-0dc8-43ae-94fa-ad00ea281f45', '2026/000407', '2026/515'),
    ('0247e5c8-b713-442e-98d0-c3e27d2de55d', '2026/000412', '2026/517'),
    ('e7af5147-13bd-4634-9f06-249fd394aa7c', '2026/000409', '2026/518'),
    ('cf27e7aa-39e8-460a-b0db-5dc54a292f3e', '2026/000414', '2026/520'),
    ('74c32084-ebac-4566-b0e7-cdf9fad3ee6a', '2026/000416', '2026/521'),
    ('f1ce9a36-24e2-4954-a88b-62b682c3c117', '2026/000417', '2026/522'),
    ('03414a5b-3e3c-43b9-b5aa-45a924bba41d', '2026/000419', '2026/523'),
    ('1dd99311-7d48-4412-8e14-20a496d9cb9b', '2026/000420', '2026/524'),
    ('0edd7b24-fb21-4006-9a81-fdadf1b1d411', '2026/000421', '2026/525'),
    ('df49a8e1-7406-4d16-9c69-99aa3622160c', '2026/000422', '2026/526'),
    ('7dd0e5be-bfd1-4fb8-b33a-c1dcd7a5b35b', '2026/000423', '2026/527'),
    ('82fb2ca3-18e7-46e4-9c97-1cbd554813d2', '2026/000425', '2026/528'),
    ('95d3382e-bce4-49d8-ae83-2f10e16a8715', '2026/000424', '2026/529'),
    ('671668e7-9422-47c5-a3b2-7f39bc41b317', '2026/000426', '2026/530'),
    ('71c5d262-522f-414e-b860-0fdce213d9a6', '2026/000427', '2026/531'),
    ('08970e22-5451-4771-bb8b-41b15c065446', '2026/000428', '2026/532'),
    ('ea014234-4372-4b91-8ddf-63b14270d1b8', '2026/000430', '2026/533'),
    ('964dd5ae-3460-4a83-b97d-61cca65eef16', '2026/000431', '2026/534');

-- Tem que devolver 35
SELECT COUNT(*) AS total_na_planilha FROM oficios_da_planilha;


-- ────────────────────────────────────────────────────────────
-- PASSO 2 — Prévia: o que vai mudar (não altera nada)
-- A coluna confere precisa ser true em todas as linhas.
-- ────────────────────────────────────────────────────────────
SELECT
    l.numero_oficio                          AS oficio_na_planilha,
    d.numero_sequencial                      AS oficio_no_banco,
    p.numero_processo,
    (p.numero_processo = l.numero_processo)  AS confere,
    COALESCE(d.situacao, 'sem movimentação') AS situacao_hoje,
    'assinado'                               AS situacao_depois
FROM oficios_da_planilha l
LEFT JOIN processos  p ON p.id = l.processo_id
LEFT JOIN documentos d ON d.processo_id = l.processo_id AND d.tipo = 'Ofício GFP'
ORDER BY l.numero_oficio;


-- ────────────────────────────────────────────────────────────
-- PASSO 3 — Marca como assinado
-- ────────────────────────────────────────────────────────────
UPDATE documentos d
SET situacao = 'assinado'
FROM oficios_da_planilha l
JOIN processos p ON p.id = l.processo_id AND p.numero_processo = l.numero_processo
WHERE d.processo_id = l.processo_id
  AND d.tipo = 'Ofício GFP';


-- ────────────────────────────────────────────────────────────
-- PASSO 4 — Confere e limpa
-- ────────────────────────────────────────────────────────────

-- 4a. Todos os da planilha têm que aparecer como 'assinado'
SELECT COALESCE(d.situacao, 'sem movimentação') AS situacao, COUNT(*) AS quantos
FROM oficios_da_planilha l
JOIN documentos d ON d.processo_id = l.processo_id AND d.tipo = 'Ofício GFP'
GROUP BY 1
ORDER BY 1;

-- 4b. Panorama geral dos ofícios da Etapa 15
SELECT COALESCE(situacao, 'sem movimentação') AS situacao, COUNT(*) AS quantos
FROM documentos WHERE tipo = 'Ofício GFP'
GROUP BY 1
ORDER BY 1;

DROP TABLE oficios_da_planilha;
