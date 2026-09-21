-- ============================================================
-- SITUAÇÃO DO PROCESSO (processos.status)
--
-- A coluna status passa a guardar só a situação do processo:
--   * notificacao_preliminar -> ainda não passou pela Etapa 14
--   * auto_infracao          -> já passou pela Etapa 14
--   * encerrado              -> todas as notificações encerradas (ou processo finalizado)
--   * cancelado              -> cancelado manualmente
--
-- E ganha a coluna passou_auto_infracao (true/false), que NUNCA volta a false.
-- Ela existe porque "encerrado" e "cancelado" escondem se o processo chegou a
-- virar Auto de Infração — e a Apuração precisa saber isso para contar a multa.
--
-- Quem mantém os dois valores é o próprio banco (triggers abaixo), a partir do
-- histórico de etapas e das notificações. O sistema não precisa gravar a
-- situação em cada movimentação; valores antigos que ele ainda grava
-- ('aguardando_ar', 'em_andamento', 'ar_efetivado'...) são convertidos na hora.
--
-- Regra para "passou pela Etapa 14" (mesma da página da etapa):
--   está na Etapa 14 agora, OU o histórico tem a Etapa 14, OU alguma
--   notificação está na Etapa 14 / com status auto_infracao.
-- A tabela autos_infracao NÃO entra na regra: até esta versão, abrir um processo
-- de NP nas Etapas 16/17/30 podia gerar um número de Auto por engano (ver a
-- consulta de conferência no fim do arquivo).
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Pode rodar de novo.
-- Tudo roda numa transação: se algo falhar, nada fica pela metade.
-- ============================================================

BEGIN;

ALTER TABLE processos ADD COLUMN IF NOT EXISTS passou_auto_infracao BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_processos_passou_auto ON processos(passou_auto_infracao);

-- ── Regra: o processo já passou pela Etapa 14? ──────────────────────────────
CREATE OR REPLACE FUNCTION processo_passou_auto_infracao(p_id UUID, p_etapa INT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH e14 AS (SELECT id FROM etapas WHERE numero = 14)
    SELECT COALESCE(p_etapa IN (SELECT id FROM e14), FALSE)
        OR EXISTS (
            SELECT 1 FROM historico_etapas h
            WHERE h.processo_id = p_id
              AND (h.etapa_de_id IN (SELECT id FROM e14) OR h.etapa_para_id IN (SELECT id FROM e14))
        )
        OR EXISTS (
            SELECT 1 FROM notificacoes n
            WHERE n.processo_id = p_id
              AND (n.status = 'auto_infracao' OR n.etapa_atual_id IN (SELECT id FROM e14))
        );
$$;

-- ── Regra: qual é a situação do processo? ───────────────────────────────────
-- Cancelado e encerrado são definitivos: só saem dali se o sistema gravar outro
-- valor de propósito (reabertura).
CREATE OR REPLACE FUNCTION situacao_processo_calculada(p_id UUID, p_status TEXT, p_passou BOOLEAN)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_status TEXT := lower(COALESCE(p_status, ''));
    v_todas_encerradas BOOLEAN;
BEGIN
    IF v_status IN ('cancelado', 'encerrado') THEN
        RETURN v_status;
    END IF;
    IF v_status = 'finalizado' THEN
        RETURN 'encerrado';
    END IF;

    SELECT COUNT(*) > 0 AND COALESCE(bool_and(status = 'encerrada'), FALSE)
      INTO v_todas_encerradas
      FROM notificacoes WHERE processo_id = p_id;
    IF v_todas_encerradas THEN
        RETURN 'encerrado';
    END IF;

    RETURN CASE WHEN p_passou THEN 'auto_infracao' ELSE 'notificacao_preliminar' END;
END;
$$;

-- ── Trigger 1: toda gravação em processos recalcula a situação ──────────────
CREATE OR REPLACE FUNCTION trg_processos_situacao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Uma vez true, fica true: só consulta o histórico enquanto ainda é false
    IF NOT COALESCE(NEW.passou_auto_infracao, FALSE) THEN
        NEW.passou_auto_infracao := processo_passou_auto_infracao(NEW.id, NEW.etapa_atual_id);
    END IF;
    NEW.status := situacao_processo_calculada(NEW.id, NEW.status, NEW.passou_auto_infracao);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_processos_situacao ON processos;
CREATE TRIGGER trg_processos_situacao
    BEFORE INSERT OR UPDATE ON processos
    FOR EACH ROW EXECUTE FUNCTION trg_processos_situacao();

-- ── Trigger 2: histórico e notificações também mudam a situação ─────────────
-- Só grava no processo se algo mudou de fato, para não mexer em updated_at
-- (o sino do painel usa essa coluna para saber o que atualizar).
CREATE OR REPLACE FUNCTION trg_recalcular_situacao_do_processo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    p processos%ROWTYPE;
    v_passou BOOLEAN;
    v_status TEXT;
BEGIN
    SELECT * INTO p FROM processos WHERE id = NEW.processo_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    v_passou := p.passou_auto_infracao OR processo_passou_auto_infracao(p.id, p.etapa_atual_id);
    v_status := situacao_processo_calculada(p.id, p.status, v_passou);

    IF v_status IS DISTINCT FROM p.status OR v_passou IS DISTINCT FROM p.passou_auto_infracao THEN
        UPDATE processos SET status = v_status, passou_auto_infracao = v_passou WHERE id = p.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_historico_situacao_processo ON historico_etapas;
CREATE TRIGGER trg_historico_situacao_processo
    AFTER INSERT ON historico_etapas
    FOR EACH ROW EXECUTE FUNCTION trg_recalcular_situacao_do_processo();

DROP TRIGGER IF EXISTS trg_notificacoes_situacao_processo ON notificacoes;
CREATE TRIGGER trg_notificacoes_situacao_processo
    AFTER INSERT OR UPDATE OF status, etapa_atual_id ON notificacoes
    FOR EACH ROW EXECUTE FUNCTION trg_recalcular_situacao_do_processo();

-- ── Preenche os processos que já existem ────────────────────────────────────
-- Desliga o trigger de updated_at só durante o preenchimento, para os processos
-- não parecerem "movimentados agora" no painel.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_processos') THEN
        ALTER TABLE processos DISABLE TRIGGER trg_updated_at_processos;
    END IF;
END $$;

-- O trigger BEFORE UPDATE também recalcula o status de cada linha
-- (OR com o valor atual: ao rodar de novo, quem já era true continua true)
UPDATE processos p
SET passou_auto_infracao = p.passou_auto_infracao OR processo_passou_auto_infracao(p.id, p.etapa_atual_id);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_processos') THEN
        ALTER TABLE processos ENABLE TRIGGER trg_updated_at_processos;
    END IF;
END $$;

-- Faz a API do Supabase enxergar a coluna nova na hora
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- CONFERÊNCIA
-- ============================================================

-- 1) Quantos processos em cada situação
SELECT status, passou_auto_infracao, COUNT(*)
FROM processos
GROUP BY 1, 2
ORDER BY 1, 2;

-- 2) Autos de Infração de processos que NUNCA passaram pela Etapa 14.
--    Provavelmente foram numerados por engano ao abrir um processo de NP nas
--    Etapas 16/17/30. Só para revisão — este arquivo não apaga nada.
SELECT a.numero AS numero_auto, a.created_at, p.numero_processo, p.status
FROM autos_infracao a
JOIN processos p ON p.id = a.processo_id
WHERE NOT p.passou_auto_infracao
ORDER BY a.created_at DESC;
