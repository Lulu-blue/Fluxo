-- ============================================================
-- OFÍCIOS JÁ SALVOS: tira o dia da data, deixando só mês e ano
--   "Divinópolis, 17 de setembro de 2026."  ->  "Divinópolis, setembro de 2026."
--
-- Vale só para os ofícios avulsos do painel (tabela oficios_gfp), que guardam o
-- texto pronto. Os da Etapa 15 são montados na hora pelo sistema e já saem no
-- formato novo, sem precisar de nada aqui.
--
-- Rode um PASSO por vez no SQL Editor do Supabase.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PASSO 1 — Ver o que vai mudar (não altera nada)
-- ────────────────────────────────────────────────────────────
SELECT
    numero,
    substring(conteudo_html from 'Divinópolis,[^<.]*')                                  AS data_hoje,
    substring(regexp_replace(conteudo_html, '(Divinópolis,)\s*\d{1,2}\s+de\s+', '\1 ', 'g')
              from 'Divinópolis,[^<.]*')                                                AS data_depois
FROM oficios_gfp
WHERE conteudo_html ~ 'Divinópolis,\s*\d{1,2}\s+de\s+'
ORDER BY numero;


-- ────────────────────────────────────────────────────────────
-- PASSO 2 — Aplicar
-- Mexe só no pedaço logo depois de "Divinópolis,"; o resto do ofício fica igual.
-- ────────────────────────────────────────────────────────────
UPDATE oficios_gfp
SET conteudo_html = regexp_replace(conteudo_html, '(Divinópolis,)\s*\d{1,2}\s+de\s+', '\1 ', 'g'),
    texto_busca   = regexp_replace(texto_busca,   '(divinopolis,)\s*\d{1,2}\s+de\s+', '\1 ', 'g')
WHERE conteudo_html ~ 'Divinópolis,\s*\d{1,2}\s+de\s+';


-- ────────────────────────────────────────────────────────────
-- PASSO 3 — Conferir: precisa voltar VAZIO
-- ────────────────────────────────────────────────────────────
SELECT numero, substring(conteudo_html from 'Divinópolis,[^<.]*') AS ainda_com_dia
FROM oficios_gfp
WHERE conteudo_html ~ 'Divinópolis,\s*\d{1,2}\s+de\s+';
