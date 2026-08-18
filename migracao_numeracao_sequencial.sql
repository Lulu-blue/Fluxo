-- ============================================================
-- MIGRAÇÃO: Numeração Sequencial Atômica Unificada (Padrão SEMAC)
-- Sistema Fluxograma de Processos — Divinópolis/SEMAC
-- ============================================================

-- Remover as tabelas e funções específicas (se existirem)
DROP FUNCTION IF EXISTS reservar_numero_processo(INTEGER);
DROP FUNCTION IF EXISTS devolver_numero_processo(TEXT);
DROP TABLE IF EXISTS numeros_processo_disponiveis;

DROP FUNCTION IF EXISTS reservar_numero_certidao(INTEGER);
DROP FUNCTION IF EXISTS devolver_numero_certidao(TEXT);
DROP TABLE IF EXISTS numeros_certidao_disponiveis;

-- ──────────────────────────────────────────────────────────────
-- PARTE 1: Tabela Única de Fila (Reciclagem de Números)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS numeros_disponiveis (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    categoria TEXT NOT NULL,           -- ex: "Processo", "Certidão Sem Defesa", etc.
    numero_sequencial TEXT NOT NULL,   -- ex: "000001"
    ano INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(categoria, numero_sequencial, ano)
);

ALTER TABLE numeros_disponiveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "numeros_disponiveis_acesso_total" ON numeros_disponiveis;
CREATE POLICY "numeros_disponiveis_acesso_total"
    ON numeros_disponiveis
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2.2 Adicionar colunas necessárias
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS numero_certidao TEXT;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS numero_relatorio TEXT;

-- ──────────────────────────────────────────────────────────────
-- PARTE 2: Funções RPC Atômicas Unificadas
-- ──────────────────────────────────────────────────────────────

-- 2.1 Função RPC para reservar próximo número por categoria
CREATE OR REPLACE FUNCTION reservar_numero(p_ano INTEGER, p_categoria TEXT)
RETURNS TEXT AS $$
DECLARE
    v_seq  TEXT;
    v_prox INTEGER;
    v_tamanho_pad INTEGER;
BEGIN
    -- Tamanho do padding baseado na categoria (Processo = 6, outros = 3)
    IF p_categoria = 'Processo' THEN
        v_tamanho_pad := 6;
    ELSE
        v_tamanho_pad := 3;
    END IF;

    -- 1º: tenta pegar o menor número devolvido na fila (reutiliza buraco)
    SELECT numero_sequencial INTO v_seq
    FROM numeros_disponiveis
    WHERE ano = p_ano AND categoria = p_categoria
    ORDER BY LPAD(numero_sequencial, 10, '0')
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_seq IS NOT NULL THEN
        DELETE FROM numeros_disponiveis
        WHERE numero_sequencial = v_seq AND ano = p_ano AND categoria = p_categoria;
        RETURN p_ano::TEXT || '/' || v_seq;
    END IF;

    -- 2º: fila vazia → calcula MAX + 1 com base na categoria
    IF p_categoria = 'Processo' THEN
        SELECT COALESCE(MAX(split_part(numero_processo, '/', 2)::INTEGER), 0) + 1 INTO v_prox
        FROM processos
        WHERE numero_processo LIKE p_ano::TEXT || '/%';
    ELSIF p_categoria = 'Certidão Sem Defesa' THEN
        SELECT COALESCE(MAX(split_part(numero_certidao, '/', 2)::INTEGER), 0) + 1 INTO v_prox
        FROM notificacoes
        WHERE numero_certidao LIKE p_ano::TEXT || '/%';
    ELSIF p_categoria = 'Auto de Infração' THEN
        SELECT COALESCE(MAX(split_part(numero, '/', 2)::INTEGER), 0) + 1 INTO v_prox
        FROM autos_infracao
        WHERE numero LIKE p_ano::TEXT || '/%';
    ELSIF p_categoria = 'Relatório Fiscal' THEN
        SELECT COALESCE(MAX(split_part(numero_relatorio, '/', 2)::INTEGER), 0) + 1 INTO v_prox
        FROM processos
        WHERE numero_relatorio LIKE p_ano::TEXT || '/%';
    ELSE
        v_prox := 1;
    END IF;

    RETURN p_ano::TEXT || '/' || LPAD(v_prox::TEXT, v_tamanho_pad, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2 Função RPC: devolve número à fila
CREATE OR REPLACE FUNCTION devolver_numero(p_numero TEXT, p_categoria TEXT)
RETURNS VOID AS $$
DECLARE
    v_partes TEXT[];
    v_seq    TEXT;
    v_ano    INTEGER;
BEGIN
    v_partes := string_to_array(p_numero, '/');
    IF array_length(v_partes, 1) < 2 THEN RETURN; END IF;

    v_ano := v_partes[1]::INTEGER;
    v_seq := v_partes[2];

    INSERT INTO numeros_disponiveis (categoria, numero_sequencial, ano)
    VALUES (p_categoria, v_seq, v_ano)
    ON CONFLICT (categoria, numero_sequencial, ano) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────
-- FIM DA MIGRAÇÃO
-- ──────────────────────────────────────────────────────────────
