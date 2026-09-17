-- ============================================================
-- MIGRAÇÃO DE ANEXOS — FINALIZAÇÃO
--
-- Rode SÓ depois de:
--   • a migração completa ter terminado;
--   • o 02_conferir.sql ter mostrado tudo em ordem;
--   • o sistema ter sido usado normalmente por alguns dias, abrindo ARs e
--     Multas migrados, sem nenhum problema.
--
-- Remove as funções temporárias. Depois disto o comando "reverter" do script
-- deixa de funcionar — os backups continuam valendo, mas voltar um documento
-- passaria a exigir recriar as funções com 01_preparar.sql.
-- ============================================================

DROP FUNCTION IF EXISTS migracao_anexo_aplicar(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS migracao_anexo_reverter(UUID, TEXT, TEXT, TEXT);

NOTIFY pgrst, 'reload schema';

-- Confirma que sumiram (deve voltar vazio)
SELECT proname
FROM pg_proc
WHERE proname IN ('migracao_anexo_aplicar', 'migracao_anexo_reverter');

-- ────────────────────────────────────────────────────────────
-- O espaço em disco NÃO diminui com a migração sozinha.
-- O Postgres só marca o base64 antigo como reutilizável; para devolver o
-- espaço é preciso um VACUUM FULL, que é o passo 4, feito à parte, fora do
-- horário de expediente (ele trava as tabelas enquanto roda).
-- ────────────────────────────────────────────────────────────
