-- ============================================================
-- SITUAÇÃO DE CADA NOTIFICAÇÃO / AUTO (notificacoes.situacao)
--
-- Rode DEPOIS de situacao_processos.sql, prazos_processos.sql e
-- situacao_arquivado.sql.
--
-- A situação é de CADA notificação, não do processo: num mesmo processo uma
-- notificação pode estar encerrada, outra virar Auto de Infração e outra ser
-- arquivada. A coluna nova guarda isso por linha:
--
--   notificacao_preliminar | auto_infracao | arquivado | encerrado | cancelado
--
-- notificacoes.status continua sendo o andamento (pendente, defesa, dilacao,
-- atendida, pagamento...). A situação é só a fase do documento.
--
-- processos.status continua existindo como RESUMO do processo (é o que o painel
-- usa para ordenar e o que a Apuração lê), e segue as mesmas regras de antes.
--
-- Quem mantém a coluna é o banco (triggers abaixo).
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Pode rodar de novo.
-- ============================================================

BEGIN;

ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS situacao TEXT;
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_situacao_valida;
ALTER TABLE notificacoes ADD  CONSTRAINT notificacoes_situacao_valida
    CHECK (situacao IS NULL OR situacao IN
        ('notificacao_preliminar', 'auto_infracao', 'arquivado', 'encerrado', 'cancelado'));
CREATE INDEX IF NOT EXISTS idx_notificacoes_situacao ON notificacoes(situacao);

-- ── Esta notificação já virou Auto de Infração? ────────────────────────────
-- Vale o que é da própria notificação: o histórico dela, o status de Auto ou o
-- número do Auto guardado nos dados.
CREATE OR REPLACE FUNCTION notificacao_virou_auto(p_id UUID, p_status TEXT, p_dados JSONB)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(p_status, '') = 'auto_infracao'
        OR COALESCE(p_dados #>> '{numero_auto_infracao}', '') <> ''
        OR COALESCE(p_dados #>> '{etapa14,numero_auto_infracao}', '') <> ''
        OR EXISTS (
            SELECT 1 FROM historico_etapas h
            WHERE h.notificacao_id = p_id
              AND (h.etapa_de_id IN (SELECT id FROM etapas WHERE numero = 14)
                OR h.etapa_para_id IN (SELECT id FROM etapas WHERE numero = 14))
        )
        OR EXISTS (SELECT 1 FROM autos_infracao a WHERE a.notificacao_id = p_id);
$$;

-- ── Situação de uma notificação ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION situacao_notificacao_calculada(
    p_id UUID, p_processo_id UUID, p_status TEXT, p_dados JSONB, p_situacao_atual TEXT)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_status_processo TEXT;
BEGIN
    SELECT lower(COALESCE(status, '')) INTO v_status_processo FROM processos WHERE id = p_processo_id;
    IF v_status_processo = 'cancelado' THEN
        RETURN 'cancelado';
    END IF;

    -- Arquivado (dívida ativa, Etapa 20): dá para desfazer, por isso vem antes de encerrado
    IF COALESCE((p_dados #>> '{arquivado}')::BOOLEAN, FALSE) THEN
        RETURN 'arquivado';
    END IF;

    IF lower(COALESCE(p_status, '')) = 'encerrada' THEN
        RETURN 'encerrado';
    END IF;

    -- Uma vez Auto de Infração, continua Auto enquanto não for encerrado/arquivado
    IF COALESCE(p_situacao_atual, '') = 'auto_infracao'
       OR notificacao_virou_auto(p_id, p_status, p_dados) THEN
        RETURN 'auto_infracao';
    END IF;

    RETURN 'notificacao_preliminar';
END;
$$;

-- ── Trigger: toda gravação na notificação recalcula a situação dela ────────
CREATE OR REPLACE FUNCTION trg_notificacoes_situacao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    NEW.situacao := situacao_notificacao_calculada(
        NEW.id, NEW.processo_id, NEW.status, NEW.dados,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.situacao ELSE NULL END);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificacoes_situacao ON notificacoes;
CREATE TRIGGER trg_notificacoes_situacao
    BEFORE INSERT OR UPDATE ON notificacoes
    FOR EACH ROW EXECUTE FUNCTION trg_notificacoes_situacao();

-- ── Trigger: histórico da notificação (entrada na Etapa 14) recalcula ──────
CREATE OR REPLACE FUNCTION trg_historico_situacao_notificacao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.notificacao_id IS NOT NULL THEN
        UPDATE notificacoes SET situacao = situacao
         WHERE id = NEW.notificacao_id;   -- o BEFORE UPDATE acima recalcula
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_historico_situacao_notificacao ON historico_etapas;
CREATE TRIGGER trg_historico_situacao_notificacao
    AFTER INSERT ON historico_etapas
    FOR EACH ROW EXECUTE FUNCTION trg_historico_situacao_notificacao();

-- ── Trigger: processo cancelado/reaberto recalcula as notificações dele ────
CREATE OR REPLACE FUNCTION trg_processos_situacao_notificacoes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF lower(COALESCE(NEW.status, '')) = 'cancelado' OR lower(COALESCE(OLD.status, '')) = 'cancelado' THEN
        UPDATE notificacoes SET situacao = situacao WHERE processo_id = NEW.id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_processos_situacao_notificacoes ON processos;
CREATE TRIGGER trg_processos_situacao_notificacoes
    AFTER UPDATE OF status ON processos
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION trg_processos_situacao_notificacoes();

-- ── Preenche as notificações que já existem ────────────────────────────────
-- Só grava a coluna nova. Os triggers de updated_at (de processos e de
-- notificações) ficam desligados durante o preenchimento, para as datas de
-- alteração continuarem sendo as reais.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_processos') THEN
        ALTER TABLE processos DISABLE TRIGGER trg_updated_at_processos;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_notificacoes') THEN
        ALTER TABLE notificacoes DISABLE TRIGGER trg_updated_at_notificacoes;
    END IF;
END $$;

UPDATE notificacoes SET situacao = situacao;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_processos') THEN
        ALTER TABLE processos ENABLE TRIGGER trg_updated_at_processos;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_notificacoes') THEN
        ALTER TABLE notificacoes ENABLE TRIGGER trg_updated_at_notificacoes;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- CONFERÊNCIA
-- ============================================================

-- 1) Situação das notificações
SELECT COALESCE(situacao, '(sem situação)') AS situacao, COUNT(*)
FROM notificacoes GROUP BY 1 ORDER BY 1;

-- 2) Processos com notificações em situações diferentes (o caso que motivou a mudança)
SELECT p.numero_processo,
       string_agg(DISTINCT n.situacao, ' + ' ORDER BY n.situacao) AS situacoes,
       p.status AS resumo_do_processo
FROM processos p
JOIN notificacoes n ON n.processo_id = p.id
GROUP BY p.numero_processo, p.status
HAVING COUNT(DISTINCT n.situacao) > 1
ORDER BY p.numero_processo;
