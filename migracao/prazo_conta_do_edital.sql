-- ============================================================
-- PRAZO DE DEFESA CONTA DA DATA DO EDITAL
--
-- Rode DEPOIS de migracao/prazos_processos.sql (já rodada).
--
-- Regra do início do prazo, agora em três casos:
--   1) data de recebimento pelo proprietário            -> prazo_origem 'recebimento'
--   2) o AR não encontrou o proprietário e saiu edital  -> prazo_origem 'edital'
--      (data em que o edital foi anexado na Etapa 17)
--   3) sem recebimento e sem edital                     -> prazo_origem 'cadastro_ar'
--
-- Se um AR novo for cadastrado DEPOIS do edital, vale o AR novo.
--
-- Este arquivo:
--   * libera o valor 'edital' na coluna notificacoes.prazo_origem;
--   * recalcula as notificações em aberto que hoje contam do cadastro do AR
--     mas cujo processo tem edital anexado em data igual ou posterior.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Pode rodar de novo.
-- ============================================================

BEGIN;

ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_prazo_origem_valida;
ALTER TABLE notificacoes ADD  CONSTRAINT notificacoes_prazo_origem_valida
    CHECK (prazo_origem IS NULL OR prazo_origem IN ('recebimento', 'cadastro_ar', 'edital', 'legado'));

-- Mesma conta do sistema (etapa.js calcularDataVencimento):
-- 10 dias = dias úteis (pula sábado e domingo); outros valores = dias corridos
CREATE OR REPLACE FUNCTION pg_temp.somar_prazo(p_inicio TIMESTAMPTZ, p_dias INT)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql AS $$
DECLARE
    v_local TIMESTAMP := p_inicio AT TIME ZONE 'America/Sao_Paulo';
    v_uteis INT := 0;
BEGIN
    IF COALESCE(p_dias, 20) = 10 THEN
        WHILE v_uteis < 10 LOOP
            v_local := v_local + INTERVAL '1 day';
            IF EXTRACT(ISODOW FROM v_local) < 6 THEN
                v_uteis := v_uteis + 1;
            END IF;
        END LOOP;
    ELSE
        v_local := v_local + make_interval(days => COALESCE(p_dias, 20));
    END IF;
    RETURN v_local AT TIME ZONE 'America/Sao_Paulo';
END;
$$;

-- Notificações em aberto cujo prazo conta do cadastro do AR, mas cujo processo
-- tem edital anexado em data igual ou posterior a esse cadastro
CREATE TEMP TABLE _edital_base ON COMMIT DROP AS
SELECT n.id,
       n.prazo_dias,
       ((COALESCE(p.dados #>> '{campos,etapa17,data_anexo_edital}',
                  p.dados #>> '{etapa17,data_anexo_edital}')::TIMESTAMPTZ
         AT TIME ZONE 'America/Sao_Paulo')::DATE || ' 12:00')::TIMESTAMP
         AT TIME ZONE 'America/Sao_Paulo' AS inicio_edital
FROM notificacoes n
JOIN processos p ON p.id = n.processo_id
WHERE n.prazo_origem = 'cadastro_ar'
  AND lower(COALESCE(n.status, '')) NOT IN ('encerrada', 'atendida', 'pagamento')
  AND COALESCE(p.dados #>> '{campos,etapa17,data_anexo_edital}',
               p.dados #>> '{etapa17,data_anexo_edital}') IS NOT NULL
  AND COALESCE(p.dados #>> '{campos,etapa17,data_anexo_edital}',
               p.dados #>> '{etapa17,data_anexo_edital}')::TIMESTAMPTZ
      >= COALESCE(NULLIF(COALESCE(p.dados #>> '{campos,etapa16,data_insercao_ar}',
                                  p.dados #>> '{etapa16,data_insercao_ar}'), ''), '1900-01-01')::TIMESTAMPTZ;

-- Não mexe em updated_at dos processos (o sino do painel usa essa coluna)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_processos') THEN
        ALTER TABLE processos DISABLE TRIGGER trg_updated_at_processos;
    END IF;
END $$;

UPDATE notificacoes n
SET data_inicio     = b.inicio_edital,
    data_vencimento = pg_temp.somar_prazo(b.inicio_edital, n.prazo_dias),
    prazo_origem    = 'edital'
FROM _edital_base b
WHERE b.id = n.id AND b.inicio_edital IS NOT NULL;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_updated_at_processos') THEN
        ALTER TABLE processos ENABLE TRIGGER trg_updated_at_processos;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Conferência: como ficou a origem do prazo das notificações em aberto
SELECT COALESCE(prazo_origem, '(prazo não iniciado)') AS origem, COUNT(*)
FROM notificacoes
WHERE lower(COALESCE(status, '')) NOT IN ('encerrada', 'atendida', 'pagamento')
GROUP BY 1 ORDER BY 1;
