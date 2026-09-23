-- ============================================================
-- SITUAÇÃO "ARQUIVADO" (processos.status)
--
-- Rode DEPOIS de migracao/situacao_processos.sql e prazos_processos.sql.
--
-- A coluna status passa a ter cinco valores:
--   notificacao_preliminar | auto_infracao | arquivado | encerrado | cancelado
--
-- Arquivado é o processo que foi para a dívida ativa na Etapa 20. Ele não foi
-- encerrado: o Gerente pode desfazer o arquivamento, e aí o Auto volta para a
-- Etapa 18 e a situação volta sozinha para auto_infracao.
--
-- O arquivamento é marcado em dados.arquivado — na notificação (o Auto) ou no
-- processo, quando não há notificação.
--
-- Arquivado também não conta prazo, como cancelado e encerrado.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Pode rodar de novo.
-- ============================================================

BEGIN;

-- ── Situação do processo, agora com 'arquivado' ────────────────────────────
CREATE OR REPLACE FUNCTION situacao_processo_calculada(p_id UUID, p_status TEXT, p_passou BOOLEAN)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_status TEXT := lower(COALESCE(p_status, ''));
    v_todas_encerradas BOOLEAN;
    v_tem_arquivada BOOLEAN;
    v_processo_arquivado BOOLEAN;
BEGIN
    -- Situações definitivas: só saem daqui se o sistema gravar outro valor
    IF v_status IN ('cancelado', 'encerrado', 'arquivado') THEN
        RETURN v_status;
    END IF;
    IF v_status = 'finalizado' THEN
        RETURN 'encerrado';
    END IF;

    SELECT COALESCE((dados #>> '{arquivado}')::BOOLEAN, FALSE)
      INTO v_processo_arquivado
      FROM processos WHERE id = p_id;
    IF v_processo_arquivado THEN
        RETURN 'arquivado';
    END IF;

    SELECT COUNT(*) > 0 AND COALESCE(bool_and(status = 'encerrada'), FALSE),
           COALESCE(bool_or((n.dados #>> '{arquivado}')::BOOLEAN), FALSE)
      INTO v_todas_encerradas, v_tem_arquivada
      FROM notificacoes n WHERE n.processo_id = p_id;

    IF v_todas_encerradas THEN
        -- Encerrou porque foi arquivado (dívida ativa), não por cumprimento
        RETURN CASE WHEN v_tem_arquivada THEN 'arquivado' ELSE 'encerrado' END;
    END IF;

    RETURN CASE WHEN p_passou THEN 'auto_infracao' ELSE 'notificacao_preliminar' END;
END;
$$;

-- ── Arquivado não conta prazo ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION atualizar_prazo_processo(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_status TEXT;
    v_inicio TIMESTAMPTZ;
    v_venc   TIMESTAMPTZ;
BEGIN
    SELECT lower(COALESCE(status, '')) INTO v_status FROM processos WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_status NOT IN ('cancelado', 'encerrado', 'arquivado') THEN
        SELECT n.data_inicio, n.data_vencimento
          INTO v_inicio, v_venc
          FROM notificacoes n
         WHERE n.processo_id = p_id
           AND n.prazo_origem IS NOT NULL
           AND n.data_vencimento IS NOT NULL
           -- pagamento: Auto em encerramento, esperando o fiscal
           AND lower(COALESCE(n.status, '')) NOT IN ('encerrada', 'atendida', 'pagamento')
         ORDER BY n.data_vencimento ASC
         LIMIT 1;
    END IF;

    UPDATE processos
       SET data_inicio_prazo = v_inicio,
           data_vencimento   = v_venc
     WHERE id = p_id
       AND (data_inicio_prazo IS DISTINCT FROM v_inicio OR data_vencimento IS DISTINCT FROM v_venc);
END;
$$;

-- ── Recalcula os processos que já estão arquivados ─────────────────────────
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_processos') THEN
        ALTER TABLE processos DISABLE TRIGGER trg_updated_at_processos;
    END IF;
END $$;

DO $$ BEGIN
    PERFORM atualizar_prazo_processo(p.id)
    FROM processos p
    WHERE COALESCE((p.dados #>> '{arquivado}')::BOOLEAN, FALSE)
       OR EXISTS (SELECT 1 FROM notificacoes n
                  WHERE n.processo_id = p.id
                    AND COALESCE((n.dados #>> '{arquivado}')::BOOLEAN, FALSE));
END $$;

-- Grava 'arquivado' direto: quem já estava como 'encerrado' não seria recalculado,
-- porque encerrado é uma situação definitiva.
UPDATE processos p
SET status = 'arquivado'
WHERE p.status IS DISTINCT FROM 'arquivado'
  AND p.status IS DISTINCT FROM 'cancelado'
  AND (COALESCE((p.dados #>> '{arquivado}')::BOOLEAN, FALSE)
       OR EXISTS (SELECT 1 FROM notificacoes n
                  WHERE n.processo_id = p.id
                    AND COALESCE((n.dados #>> '{arquivado}')::BOOLEAN, FALSE)));

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_processos') THEN
        ALTER TABLE processos ENABLE TRIGGER trg_updated_at_processos;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Conferência
SELECT status, COUNT(*) FROM processos GROUP BY 1 ORDER BY 1;
