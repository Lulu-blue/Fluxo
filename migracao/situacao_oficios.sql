-- ============================================================
-- SITUAÇÃO DO OFÍCIO (baixado / assinado / sem movimentação)
--
-- Vale para os dois tipos de ofício:
--   * Etapa 15  -> documentos.situacao   (linhas com tipo = 'Ofício GFP')
--   * Painel    -> oficios_gfp.situacao  (só depois de virar PDF; rascunho não tem situação)
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Pode rodar de novo.
-- ============================================================

ALTER TABLE documentos  ADD COLUMN IF NOT EXISTS situacao TEXT;
ALTER TABLE oficios_gfp ADD COLUMN IF NOT EXISTS situacao TEXT;

-- Só aceita os três valores previstos (NULL = ainda sem movimentação)
ALTER TABLE documentos  DROP CONSTRAINT IF EXISTS documentos_situacao_valida;
ALTER TABLE documentos  ADD  CONSTRAINT documentos_situacao_valida
    CHECK (situacao IS NULL OR situacao IN ('baixado', 'assinado', 'sem_movimentacao'));

ALTER TABLE oficios_gfp DROP CONSTRAINT IF EXISTS oficios_gfp_situacao_valida;
ALTER TABLE oficios_gfp ADD  CONSTRAINT oficios_gfp_situacao_valida
    CHECK (situacao IS NULL OR situacao IN ('baixado', 'assinado', 'sem_movimentacao'));

-- Ofícios do painel que já viraram PDF começam como "baixado"
UPDATE oficios_gfp SET situacao = 'baixado'
WHERE situacao IS NULL AND baixado_em IS NOT NULL;

-- Faz a API do Supabase enxergar as colunas novas na hora
NOTIFY pgrst, 'reload schema';

-- Conferência
SELECT 'documentos'  AS tabela, COALESCE(situacao, '(sem movimentação)') AS situacao, COUNT(*)
FROM documentos WHERE tipo = 'Ofício GFP' GROUP BY 2
UNION ALL
SELECT 'oficios_gfp', COALESCE(situacao, CASE WHEN baixado_em IS NULL THEN '(rascunho)' ELSE '(sem movimentação)' END), COUNT(*)
FROM oficios_gfp GROUP BY 2
ORDER BY 1, 2;
