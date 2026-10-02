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
--   3. As cópias do mesmo arquivo dentro dos JSONs são trocadas pelo próprio
--      banco, lendo e gravando na mesma instrução. Um UPDATE vindo do script
--      precisaria reenviar o JSON inteiro e poderia apagar uma edição feita ao
--      mesmo tempo por outra pessoa.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- Troca, dentro de um JSON, toda string exatamente igual a p_antigo.
-- Serve para qualquer tipo de anexo: a cópia do arquivo pode estar em
-- `etapa15.multa_url`, `etapa14.anexo_url`, `anexos[].url`, nas mensagens do
-- chat ou em qualquer chave nova que apareça depois.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migracao_jsonb_trocar_texto(
    p_dados  JSONB,
    p_antigo TEXT,
    p_novo   TEXT
) RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_resultado JSONB;
BEGIN
    IF p_dados IS NULL THEN
        RETURN NULL;
    END IF;

    CASE jsonb_typeof(p_dados)
        WHEN 'string' THEN
            IF p_dados #>> '{}' = p_antigo THEN
                RETURN to_jsonb(p_novo);
            END IF;
            RETURN p_dados;

        WHEN 'array' THEN
            SELECT COALESCE(jsonb_agg(migracao_jsonb_trocar_texto(item, p_antigo, p_novo)), '[]'::jsonb)
              INTO v_resultado
              FROM jsonb_array_elements(p_dados) AS item;
            RETURN v_resultado;

        WHEN 'object' THEN
            SELECT COALESCE(jsonb_object_agg(chave, migracao_jsonb_trocar_texto(valor, p_antigo, p_novo)), '{}'::jsonb)
              INTO v_resultado
              FROM jsonb_each(p_dados) AS campos(chave, valor);
            RETURN v_resultado;

        ELSE
            RETURN p_dados;
    END CASE;
END;
$$;


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
    v_n_chats     INT := 0;
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

    -- Cópias do mesmo arquivo guardadas em JSON, em qualquer chave. Restrito
    -- ao processo deste documento (sem varrer as tabelas inteiras) e só onde o
    -- conteúdo é exatamente o base64 que acabou de ser conferido; qualquer
    -- outro valor fica intocado.
    --
    -- A troca lê e grava o JSON na mesma instrução, então o Postgres relê a
    -- versão corrente da linha: uma edição feita por outra pessoa no mesmo
    -- instante não é perdida.
    UPDATE processos
       SET dados = migracao_jsonb_trocar_texto(dados, v_url_atual, p_url_nova)
     WHERE id = v_processo_id
       AND dados IS NOT NULL
       AND strpos(dados::text, v_url_atual) > 0;
    GET DIAGNOSTICS v_n_processos = ROW_COUNT;

    UPDATE notificacoes
       SET dados = migracao_jsonb_trocar_texto(dados, v_url_atual, p_url_nova)
     WHERE processo_id = v_processo_id
       AND dados IS NOT NULL
       AND strpos(dados::text, v_url_atual) > 0;
    GET DIAGNOSTICS v_n_notif = ROW_COUNT;

    UPDATE autos_infracao
       SET dados = migracao_jsonb_trocar_texto(dados, v_url_atual, p_url_nova)
     WHERE processo_id = v_processo_id
       AND dados IS NOT NULL
       AND strpos(dados::text, v_url_atual) > 0;
    GET DIAGNOSTICS v_n_autos = ROW_COUNT;

    UPDATE chats_interface_juridica
       SET mensagens = migracao_jsonb_trocar_texto(mensagens, v_url_atual, p_url_nova)
     WHERE processo_id = v_processo_id
       AND mensagens IS NOT NULL
       AND strpos(mensagens::text, v_url_atual) > 0;
    GET DIAGNOSTICS v_n_chats = ROW_COUNT;

    RETURN jsonb_build_object(
        'status', 'migrado',
        'tipo', v_tipo,
        'copias_processos', v_n_processos,
        'copias_notificacoes', v_n_notif,
        'copias_autos_infracao', v_n_autos,
        'copias_chats', v_n_chats
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
    v_n_chats     INT := 0;
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

    -- Desfaz as cópias em JSON pelo mesmo caminho da ida: só troca onde o
    -- valor é exatamente o link gravado por esta migração.
    UPDATE processos
       SET dados = migracao_jsonb_trocar_texto(dados, p_url_nova, p_url_original)
     WHERE id = v_processo_id
       AND dados IS NOT NULL
       AND strpos(dados::text, p_url_nova) > 0;
    GET DIAGNOSTICS v_n_processos = ROW_COUNT;

    UPDATE notificacoes
       SET dados = migracao_jsonb_trocar_texto(dados, p_url_nova, p_url_original)
     WHERE processo_id = v_processo_id
       AND dados IS NOT NULL
       AND strpos(dados::text, p_url_nova) > 0;
    GET DIAGNOSTICS v_n_notif = ROW_COUNT;

    UPDATE autos_infracao
       SET dados = migracao_jsonb_trocar_texto(dados, p_url_nova, p_url_original)
     WHERE processo_id = v_processo_id
       AND dados IS NOT NULL
       AND strpos(dados::text, p_url_nova) > 0;
    GET DIAGNOSTICS v_n_autos = ROW_COUNT;

    UPDATE chats_interface_juridica
       SET mensagens = migracao_jsonb_trocar_texto(mensagens, p_url_nova, p_url_original)
     WHERE processo_id = v_processo_id
       AND mensagens IS NOT NULL
       AND strpos(mensagens::text, p_url_nova) > 0;
    GET DIAGNOSTICS v_n_chats = ROW_COUNT;

    RETURN jsonb_build_object(
        'status', 'revertido',
        'copias_processos', v_n_processos,
        'copias_notificacoes', v_n_notif,
        'copias_autos_infracao', v_n_autos,
        'copias_chats', v_n_chats
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
