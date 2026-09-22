-- ============================================================
-- PAGAMENTO PARA DE CONTAR PRAZO
--
-- Rode DEPOIS de migracao/prazos_processos.sql (já rodada).
--
-- Na Etapa 18, "Pagamento" leva o Auto para a Etapa 29: ele está em
-- encerramento, só esperando o fiscal fazer a última etapa. Por isso uma
-- notificação com status 'pagamento' deixa de entrar no prazo do processo
-- (Data Início / Data Final / Dias p/ Venc. e a ordenação por vencimento do
-- painel), igual às encerradas e atendidas.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Pode rodar de novo.
-- ============================================================

BEGIN;

-- Mesma função de prazos_processos.sql, com 'pagamento' na lista de fechadas
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

    -- Processo cancelado ou encerrado não tem prazo correndo
    IF v_status NOT IN ('cancelado', 'encerrado') THEN
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

    -- Só grava se mudou, para não mexer em updated_at (o sino do painel usa)
    UPDATE processos
       SET data_inicio_prazo = v_inicio,
           data_vencimento   = v_venc
     WHERE id = p_id
       AND (data_inicio_prazo IS DISTINCT FROM v_inicio OR data_vencimento IS DISTINCT FROM v_venc);
END;
$$;

-- Recalcula os processos que já têm alguma notificação em pagamento,
-- sem mexer em updated_at
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_processos') THEN
        ALTER TABLE processos DISABLE TRIGGER trg_updated_at_processos;
    END IF;
END $$;

DO $$ BEGIN
    PERFORM atualizar_prazo_processo(p.id)
    FROM processos p
    WHERE EXISTS (SELECT 1 FROM notificacoes n
                  WHERE n.processo_id = p.id AND lower(COALESCE(n.status, '')) = 'pagamento');
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_processos') THEN
        ALTER TABLE processos ENABLE TRIGGER trg_updated_at_processos;
    END IF;
END $$;

COMMIT;

-- Conferência: processos com notificação em pagamento e o prazo que ficou no painel
SELECT p.numero_processo,
       n.numero AS notificacao_em_pagamento,
       to_char(p.data_vencimento AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS vencimento_no_painel
FROM processos p
JOIN notificacoes n ON n.processo_id = p.id AND lower(COALESCE(n.status, '')) = 'pagamento'
ORDER BY p.numero_processo;
