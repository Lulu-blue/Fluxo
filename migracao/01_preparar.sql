-- ============================================================
-- MIGRAÇÃO DE ANEXOS (base64 → Cloudinary) — PREPARAÇÃO
--
-- Cria duas funções TEMPORÁRIAS usadas pelo script migracao/migrar_anexos.mjs.
-- Rode este arquivo inteiro uma vez no SQL Editor antes de migrar.
-- Ao terminar a migração, remova as funções com 03_finalizar.sql.
--
-- Por que funções no banco, e não um UPDATE direto pelo script:
--   1. A troca acontece numa única transação, com a linha travada.
--   2. O banco confere, ele mesmo, que ainda guarda EXATAMENTE o arquivo que
--      foi copiado para o backup (comparando o hash SHA-256). Se alguém tiver
--      trocado o arquivo depois do backup, nada é alterado.
--   3. As cópias da Multa dentro de `dados` são trocadas com jsonb_set, que
--      mexe só naquela chave. Um UPDATE vindo do script precisaria reenviar o
--      JSON inteiro e poderia apagar uma edição feita ao mesmo tempo por alguém.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- Troca o base64 de um documento pelo link do Cloudinary
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migracao_anexo_aplicar(
    p_documento_id    UUID,
    p_sha256_original TEXT,
    p_url_nova        TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url_atual   TEXT;
    v_tipo        TEXT;
    v_processo_id UUID;
    v_n_processos INT := 0;
    v_n_notif     INT := 0;
    v_n_autos     INT := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: é preciso estar autenticado.';
    END IF;

    IF p_url_nova IS NULL OR p_url_nova !~* '^https://' THEN
        RAISE EXCEPTION 'Link novo inválido (precisa começar com https://): %', p_url_nova;
    END IF;

    -- Trava a linha: ninguém altera este documento até o fim da transação
    SELECT url, tipo, processo_id
      INTO v_url_atual, v_tipo, v_processo_id
      FROM documentos
     WHERE id = p_documento_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'nao_encontrado');
    END IF;

    IF v_url_atual IS NULL OR v_url_atual NOT LIKE 'data:%' THEN
        RETURN jsonb_build_object('status', 'nao_esta_em_base64');
    END IF;

    -- Só troca se o banco ainda guarda exatamente o conteúdo copiado e conferido
    IF encode(sha256(convert_to(v_url_atual, 'UTF8')), 'hex') <> p_sha256_original THEN
        RETURN jsonb_build_object('status', 'conteudo_diferente_do_backup');
    END IF;

    UPDATE documentos SET url = p_url_nova WHERE id = p_documento_id;

    IF v_tipo = 'Multa' THEN
        -- Cópias da mesma Multa guardadas em JSON. Restrito ao processo deste
        -- documento (sem varrer a tabela inteira) e só onde o conteúdo é
        -- idêntico, comparado por hash. Uma cópia diferente fica intocada.
        UPDATE processos
           SET dados = jsonb_set(dados, '{etapa15,multa_url}', to_jsonb(p_url_nova))
         WHERE id = v_processo_id
           AND dados IS NOT NULL
           AND dados->'etapa15'->>'multa_url' LIKE 'data:%'
           AND encode(sha256(convert_to(dados->'etapa15'->>'multa_url', 'UTF8')), 'hex') = p_sha256_original;
        GET DIAGNOSTICS v_n_processos = ROW_COUNT;

        UPDATE notificacoes
           SET dados = jsonb_set(dados, '{etapa15,multa_url}', to_jsonb(p_url_nova))
         WHERE processo_id = v_processo_id
           AND dados IS NOT NULL
           AND dados->'etapa15'->>'multa_url' LIKE 'data:%'
           AND encode(sha256(convert_to(dados->'etapa15'->>'multa_url', 'UTF8')), 'hex') = p_sha256_original;
        GET DIAGNOSTICS v_n_notif = ROW_COUNT;

        UPDATE autos_infracao
           SET dados = jsonb_set(dados, '{multa_url}', to_jsonb(p_url_nova))
         WHERE processo_id = v_processo_id
           AND dados IS NOT NULL
           AND dados->>'multa_url' LIKE 'data:%'
           AND encode(sha256(convert_to(dados->>'multa_url', 'UTF8')), 'hex') = p_sha256_original;
        GET DIAGNOSTICS v_n_autos = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'status', 'migrado',
        'copias_processos', v_n_processos,
        'copias_notificacoes', v_n_notif,
        'copias_autos_infracao', v_n_autos
    );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Desfaz a troca de um documento, devolvendo o base64 original do backup
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migracao_anexo_reverter(
    p_documento_id    UUID,
    p_url_nova        TEXT,
    p_url_original    TEXT,
    p_sha256_original TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url_atual   TEXT;
    v_tipo        TEXT;
    v_processo_id UUID;
    v_n_processos INT := 0;
    v_n_notif     INT := 0;
    v_n_autos     INT := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: é preciso estar autenticado.';
    END IF;

    -- O original enviado do backup precisa bater com o hash registrado
    IF p_url_original IS NULL
       OR p_url_original NOT LIKE 'data:%'
       OR encode(sha256(convert_to(p_url_original, 'UTF8')), 'hex') <> p_sha256_original THEN
        RAISE EXCEPTION 'O original do backup não confere com o hash registrado. Nada foi alterado.';
    END IF;

    SELECT url, tipo, processo_id
      INTO v_url_atual, v_tipo, v_processo_id
      FROM documentos
     WHERE id = p_documento_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'nao_encontrado');
    END IF;

    -- Só desfaz o que esta migração fez. Se o link foi trocado depois
    -- (ex.: alguém anexou outro arquivo), não sobrescreve.
    IF v_url_atual IS DISTINCT FROM p_url_nova THEN
        RETURN jsonb_build_object('status', 'link_diferente');
    END IF;

    UPDATE documentos SET url = p_url_original WHERE id = p_documento_id;

    IF v_tipo = 'Multa' THEN
        UPDATE processos
           SET dados = jsonb_set(dados, '{etapa15,multa_url}', to_jsonb(p_url_original))
         WHERE id = v_processo_id
           AND dados IS NOT NULL
           AND dados->'etapa15'->>'multa_url' = p_url_nova;
        GET DIAGNOSTICS v_n_processos = ROW_COUNT;

        UPDATE notificacoes
           SET dados = jsonb_set(dados, '{etapa15,multa_url}', to_jsonb(p_url_original))
         WHERE processo_id = v_processo_id
           AND dados IS NOT NULL
           AND dados->'etapa15'->>'multa_url' = p_url_nova;
        GET DIAGNOSTICS v_n_notif = ROW_COUNT;

        UPDATE autos_infracao
           SET dados = jsonb_set(dados, '{multa_url}', to_jsonb(p_url_original))
         WHERE processo_id = v_processo_id
           AND dados IS NOT NULL
           AND dados->>'multa_url' = p_url_nova;
        GET DIAGNOSTICS v_n_autos = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'status', 'revertido',
        'copias_processos', v_n_processos,
        'copias_notificacoes', v_n_notif,
        'copias_autos_infracao', v_n_autos
    );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- Permissões: só usuários logados; nunca o acesso anônimo
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION migracao_anexo_aplicar(UUID, TEXT, TEXT)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION migracao_anexo_reverter(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION migracao_anexo_aplicar(UUID, TEXT, TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION migracao_anexo_reverter(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Faz a API do Supabase enxergar as funções novas na hora
NOTIFY pgrst, 'reload schema';
