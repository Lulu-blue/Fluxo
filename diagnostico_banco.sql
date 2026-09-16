-- ============================================================
-- DIAGNÓSTICO: por que o banco fica indisponível e só volta com "Restart database"
-- Rode uma consulta por vez no SQL Editor do Supabase e compare com o esperado.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Tamanho das tabelas — onde o espaço está indo
--    Esperado num sistema deste porte: poucas dezenas de MB no total.
--    Se 'processos' ou 'documentos' aparecerem com centenas de MB, é base64.
-- ────────────────────────────────────────────────────────────
SELECT
    c.relname                                        AS tabela,
    pg_size_pretty(pg_total_relation_size(c.oid))    AS total,
    pg_size_pretty(pg_relation_size(c.oid))          AS dados_proprios,
    pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) AS indices_e_toast,
    c.reltuples::BIGINT                              AS linhas_aprox
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC;

RESULTADO: | tabela                   | total      | dados_proprios | indices_e_toast | linhas_aprox |
| ------------------------ | ---------- | -------------- | --------------- | ------------ |
| documentos               | 178 MB     | 240 kB         | 177 MB          | 768          |
| processos                | 110 MB     | 256 kB         | 109 MB          | 180          |
| historico_etapas         | 59 MB      | 472 kB         | 58 MB           | 178          |
| autos_infracao           | 12 MB      | 64 kB          | 12 MB           | 51           |
| notificacoes             | 544 kB     | 48 kB          | 496 kB          | 24           |
| decretos                 | 272 kB     | 8192 bytes     | 264 kB          | -1           |
| chats_interface_juridica | 216 kB     | 8192 bytes     | 208 kB          | -1           |
| imoveis                  | 208 kB     | 64 kB          | 144 kB          | 131          |
| profiles                 | 192 kB     | 32 kB          | 160 kB          | 53           |
| processo_infracoes       | 96 kB      | 24 kB          | 72 kB           | 51           |
| contribuintes            | 88 kB      | 24 kB          | 64 kB           | 113          |
| numeros_descartados      | 80 kB      | 8192 bytes     | 72 kB           | 2            |
| sequenciais_contadores   | 64 kB      | 8192 bytes     | 56 kB           | 6            |
| etapas                   | 48 kB      | 8192 bytes     | 40 kB           | -1           |
| transicoes               | 48 kB      | 8192 bytes     | 40 kB           | 60           |
| infracoes_catalogo       | 24 kB      | 8192 bytes     | 16 kB           | -1           |
| configuracoes_upfmd      | 24 kB      | 8192 bytes     | 16 kB           | -1           |
| checklist_respostas      | 24 kB      | 0 bytes        | 24 kB           | -1           |
| checklist_itens          | 8192 bytes | 0 bytes        | 8192 bytes      | -1           |
-- ────────────────────────────────────────────────────────────
-- 2. Os 20 processos com o campo `dados` mais pesado
--    O painel de Solicitações lê a coluna `dados` INTEIRA de 50 processos por vez.
--    Se a média aqui for de alguns MB, cada abertura do painel move centenas de MB.
-- ────────────────────────────────────────────────────────────
SELECT
    numero_processo,
    pg_size_pretty(octet_length(dados::text)::BIGINT) AS tamanho_real,
    pg_size_pretty(pg_column_size(dados)::BIGINT)     AS tamanho_comprimido,
    created_at::DATE                                  AS criado_em
FROM processos
ORDER BY octet_length(dados::text) DESC
LIMIT 20;

RESULTADO: 
| numero_processo | tamanho_real | tamanho_comprimido | criado_em  |
| --------------- | ------------ | ------------------ | ---------- |
| 2026/000347     | 14 MB        | 14 MB              | 2026-08-28 |
| 2026/000319     | 9013 kB      | 9013 kB            | 2026-08-27 |
| 2026/000376     | 8106 kB      | 8107 kB            | 2026-09-03 |
| 2026/000325     | 7013 kB      | 7013 kB            | 2026-08-27 |
| 2026/000323     | 7013 kB      | 7013 kB            | 2026-08-27 |
| 2026/000327     | 7012 kB      | 7013 kB            | 2026-08-27 |
| 2026/000328     | 7012 kB      | 7012 kB            | 2026-08-27 |
| 2026/000317     | 1631 kB      | 1631 kB            | 2026-08-27 |
| 2026/000316     | 1539 kB      | 1539 kB            | 2026-08-27 |
| 2026/000339     | 1484 kB      | 1484 kB            | 2026-08-26 |
| 2026/000322     | 623 kB       | 623 kB             | 2026-08-27 |
| 2026/000301     | 589 kB       | 589 kB             | 2026-08-27 |
| 2026/000318     | 566 kB       | 566 kB             | 2026-08-27 |
| 2026/000324     | 332 kB       | 332 kB             | 2026-08-27 |
| 2026/000369     | 249 kB       | 249 kB             | 2026-09-03 |
| 2026/000290     | 249 kB       | 249 kB             | 2026-08-25 |
| 2026/000321     | 248 kB       | 248 kB             | 2026-08-27 |
| 2026/000350     | 248 kB       | 248 kB             | 2026-08-28 |
| 2026/000281     | 248 kB       | 248 kB             | 2026-08-24 |
| 2026/000389     | 248 kB       | 248 kB             | 2026-09-03 |

-- Média e total da coluna `dados` (o que o painel carrega a cada página de 50)
SELECT
    COUNT(*)                                                      AS processos,
    pg_size_pretty(AVG(octet_length(dados::text))::BIGINT)        AS media_por_processo,
    pg_size_pretty(SUM(octet_length(dados::text))::BIGINT)        AS total,
    pg_size_pretty((AVG(octet_length(dados::text)) * 50)::BIGINT) AS estimado_por_pagina_do_painel
FROM processos;

RESULTADO: 
| processos | media_por_processo | total | estimado_por_pagina_do_painel |
| --------- | ------------------ | ----- | ----------------------------- |
| 183       | 446 kB             | 80 MB | 22 MB                         |

-- ────────────────────────────────────────────────────────────
-- 3. Documentos guardados como base64 dentro do banco
--    A coluna documentos.url recebe data URLs (data:application/pdf;base64,...).
--    Várias telas fazem SELECT * em documentos, o que arrasta esses blobs junto.
-- ────────────────────────────────────────────────────────────
SELECT
    tipo,
    COUNT(*)                                                  AS qtd,
    COUNT(*) FILTER (WHERE url LIKE 'data:%')                 AS em_base64,
    pg_size_pretty(SUM(octet_length(COALESCE(url, '')))::BIGINT) AS peso_total
FROM documentos
GROUP BY tipo
ORDER BY SUM(octet_length(COALESCE(url, ''))) DESC;

RESULTADO:
| tipo                   | qtd | em_base64 | peso_total |
| ---------------------- | --- | --------- | ---------- |
| Anexo AR               | 115 | 115       | 100 MB     |
| imagem                 | 204 | 18        | 44 MB      |
| Multa                  | 71  | 71        | 17 MB      |
| Relatório Fiscal       | 182 | 0         | 7699 kB    |
| Notificação Preliminar | 2   | 2         | 353 kB     |
| BIC Espelho Cadastral  | 181 | 0         | 20 kB      |
| Auto de Infração       | 175 | 0         | 18 kB      |
| Ofício GFP             | 4   | 0         | 0 bytes    |
-- O maior documento único (o pior caso de um SELECT * em documentos)
SELECT
    tipo,
    nome_arquivo,
    pg_size_pretty(octet_length(COALESCE(url, ''))::BIGINT) AS tamanho
FROM documentos
ORDER BY octet_length(COALESCE(url, '')) DESC
LIMIT 10;

RESULTADO:
| tipo             | nome_arquivo                   | tamanho |
| ---------------- | ------------------------------ | ------- |
| imagem           | 24-057-342.jpg                 | 8766 kB |
| Relatório Fiscal | Relatorio_Fiscal_2026-931.html | 7680 kB |
| imagem           | 20260827_092631.jpg            | 3658 kB |
| imagem           | 20260827_092631.jpg            | 3658 kB |
| imagem           | 20260827_092631.jpg            | 3658 kB |
| imagem           | 20260827_092631.jpg            | 3658 kB |
| imagem           | 20260827_092646.jpg            | 3107 kB |
| imagem           | 20260827_092646.jpg            | 3107 kB |
| imagem           | 20260827_092646.jpg            | 3107 kB |
| imagem           | 20260827_092646.jpg            | 3107 kB |
-- ────────────────────────────────────────────────────────────
-- 4. Tamanho das conversas do chat
--    A lista de conversas faz SELECT * (todas as conversas, todas as mensagens)
--    a cada 8 segundos enquanto o chat estiver aberto.
-- ────────────────────────────────────────────────────────────
SELECT
    COUNT(*)                                                   AS conversas,
    pg_size_pretty(SUM(octet_length(mensagens::text))::BIGINT) AS peso_de_uma_leitura,
    MAX(jsonb_array_length(mensagens))                         AS maior_conversa_em_mensagens
FROM chats_interface_juridica;

RESULTADO:
| conversas | peso_de_uma_leitura | maior_conversa_em_mensagens |
| --------- | ------------------- | --------------------------- |
| 1         | 738 bytes           | 2                           |

-- ────────────────────────────────────────────────────────────
-- 5. As consultas que mais consomem tempo do banco
--    Confirma QUAL tela está derrubando. Olhe as primeiras linhas:
--    total_tempo alto + muitas chamadas = o gargalo.
-- ────────────────────────────────────────────────────────────
SELECT
    LEFT(query, 120)                          AS consulta,
    calls                                     AS chamadas,
    ROUND(total_exec_time::NUMERIC / 1000, 1) AS total_seg,
    ROUND(mean_exec_time::NUMERIC, 1)         AS media_ms,
    ROUND(max_exec_time::NUMERIC, 1)          AS pior_ms
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 25;

RESULTADO: 
[
  {
    "consulta": "WITH pgrst_source AS ( SELECT \"public\".\"processos\".\"id\", \"public\".\"processos\".\"updated_at\", \"public\".\"processos\".\"dados\"",
    "chamadas": 508,
    "total_seg": "120.9",
    "media_ms": "238.0",
    "pior_ms": "7266.0"
  },
  {
    "consulta": "WITH pgrst_source AS ( SELECT \"public\".\"processos\".\"id\", \"public\".\"processos\".\"numero_processo\", \"public\".\"processos\".\"n",
    "chamadas": 25,
    "total_seg": "26.2",
    "media_ms": "1046.7",
    "pior_ms": "7559.1"
  },
  {
    "consulta": "SELECT\n  e.name,\n  n.nspname AS schema,\n  e.default_version,\n  x.extversion AS installed_version,\n  e.comment,\n  ev.sche",
    "chamadas": 8,
    "total_seg": "24.6",
    "media_ms": "3078.2",
    "pior_ms": "6688.3"
  },
  {
    "consulta": "SELECT\n    numero_processo,\n    pg_size_pretty(octet_length(dados::text)::BIGINT) AS tamanho_real,\n    pg_size_pretty(pg",
    "chamadas": 1,
    "total_seg": "6.9",
    "media_ms": "6947.8",
    "pior_ms": "6947.8"
  },
  {
    "consulta": "WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT \"p_ano",
    "chamadas": 2,
    "total_seg": "5.3",
    "media_ms": "2651.4",
    "pior_ms": "5217.9"
  },
  {
    "consulta": "with _base_query as (select * from public.processos order by processos.id asc nulls last limit $1 offset $2)\n  select id",
    "chamadas": 1,
    "total_seg": "5.2",
    "media_ms": "5220.8",
    "pior_ms": "5220.8"
  },
  {
    "consulta": "SELECT\n    COUNT(*)                                                      AS processos,\n    pg_size_pretty(AVG(octet_leng",
    "chamadas": 1,
    "total_seg": "5.1",
    "media_ms": "5119.6",
    "pior_ms": "5119.6"
  },
  {
    "consulta": "-- FROZEN legacy path (pgMetaScopedIntrospection off): do not edit -- it must\n    -- keep matching production behavior u",
    "chamadas": 20,
    "total_seg": "4.9",
    "media_ms": "247.3",
    "pior_ms": "1013.6"
  },
  {
    "consulta": "select set_config('search_path', $1, true), set_config($2, $3, true), set_config('role', $4, true), set_config('request.",
    "chamadas": 748,
    "total_seg": "4.7",
    "media_ms": "6.3",
    "pior_ms": "177.7"
  },
  {
    "consulta": "WITH pgrst_source AS (INSERT INTO \"public\".\"documentos\"(\"etapa_id\", \"gerado_automaticamente\", \"nome_arquivo\", \"notificac",
    "chamadas": 2,
    "total_seg": "4.1",
    "media_ms": "2065.6",
    "pior_ms": "4120.0"
  },
  {
    "consulta": "SELECT\n    tipo,\n    COUNT(*)                                                  AS qtd,\n    COUNT(*) FILTER (WHERE url LI",
    "chamadas": 1,
    "total_seg": "3.5",
    "media_ms": "3488.3",
    "pior_ms": "3488.3"
  },
  {
    "consulta": "CREATE OR REPLACE FUNCTION pg_temp.count_estimate(\n    query text\n) RETURNS integer LANGUAGE plpgsql AS $$\nDECLARE\n    p",
    "chamadas": 8,
    "total_seg": "2.2",
    "media_ms": "275.7",
    "pior_ms": "758.0"
  },
  {
    "consulta": "-- Adapted from information_schema.schemata\n\nselect\n  n.oid as id,\n  n.nspname as name,\n  u.rolname as owner,\n   obj_des",
    "chamadas": 10,
    "total_seg": "2.1",
    "media_ms": "214.4",
    "pior_ms": "1070.0"
  },
  {
    "consulta": "SELECT\n  con.oid as id,\n  con.conname as constraint_name,\n  con.confdeltype as deletion_action,\n  con.confupdtype as upd",
    "chamadas": 13,
    "total_seg": "1.7",
    "media_ms": "132.3",
    "pior_ms": "418.4"
  },
  {
    "consulta": "with table_privileges as (\n-- FROZEN legacy path: served while the pgMetaScopedIntrospection flag is off.\n-- Do not edit",
    "chamadas": 8,
    "total_seg": "1.6",
    "media_ms": "200.0",
    "pior_ms": "845.3"
  },
  {
    "consulta": "select exists(select $1 from auth.users)",
    "chamadas": 14,
    "total_seg": "1.5",
    "media_ms": "108.1",
    "pior_ms": "752.4"
  },
  {
    "consulta": "with policies as (\nselect\n  pol.oid :: int8 as id,\n  n.nspname as schema,\n  c.relname as table,\n  c.oid :: int8 as table",
    "chamadas": 8,
    "total_seg": "1.5",
    "media_ms": "188.7",
    "pior_ms": "427.6"
  },
  {
    "consulta": "-- FROZEN legacy path: served while the pgMetaScopedIntrospection flag is off.\n-- Do not edit -- it must keep matching p",
    "chamadas": 8,
    "total_seg": "1.3",
    "media_ms": "165.9",
    "pior_ms": "606.1"
  },
  {
    "consulta": "explain with _base_query as (select * from public.sequenciais_contadores order by sequenciais_contadores.categoria asc n",
    "chamadas": 10,
    "total_seg": "1.2",
    "media_ms": "116.0",
    "pior_ms": "587.0"
  },
  {
    "consulta": "with records as (\n      select\n        c.oid::int8 as \"id\",\n        nc.nspname as \"schema\",\n        c.relname as \"name\",",
    "chamadas": 9,
    "total_seg": "0.9",
    "media_ms": "100.4",
    "pior_ms": "447.5"
  },
  {
    "consulta": "SELECT name FROM pg_timezone_names",
    "chamadas": 2,
    "total_seg": "0.9",
    "media_ms": "439.8",
    "pior_ms": "825.5"
  },
  {
    "consulta": "WITH pgrst_source AS (UPDATE \"public\".\"processos\" SET \"dados\" = \"pgrst_body\".\"dados\" FROM (SELECT $1 AS json_data) pgrst",
    "chamadas": 3,
    "total_seg": "0.8",
    "media_ms": "276.7",
    "pior_ms": "547.0"
  },
  {
    "consulta": "update public.sequenciais_contadores set (ultimo_numero) = (select ultimo_numero from json_populate_record($1::public.se",
    "chamadas": 5,
    "total_seg": "0.7",
    "media_ms": "131.8",
    "pior_ms": "590.2"
  },
  {
    "consulta": "with f as (\n      \n-- CTE with sane arg_modes, arg_names, and arg_types.\n-- All three are always of the same length.\n-- ",
    "chamadas": 2,
    "total_seg": "0.6",
    "media_ms": "314.5",
    "pior_ms": "324.4"
  },
  {
    "consulta": "WITH pgrst_source AS ( SELECT \"public\".\"profiles\".\"id\", \"public\".\"profiles\".\"auth_id\", \"public\".\"profiles\".\"cpf\", \"publi",
    "chamadas": 6,
    "total_seg": "0.5",
    "media_ms": "78.3",
    "pior_ms": "410.2"
  }
]

-- Se a consulta acima der erro de extensão ausente, habilite antes:
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- (e rode de novo depois de algumas horas de uso, para ter amostra)


-- ────────────────────────────────────────────────────────────
-- 6. Conexões abertas agora — descarta (ou confirma) esgotamento de conexões
--    Compare 'total' com o limite do seu plano (SHOW max_connections).
-- ────────────────────────────────────────────────────────────
SELECT
    state,
    COUNT(*) AS total,
    MAX(NOW() - state_change) AS mais_antiga
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY total DESC;
RESULTADO: | state  | total | mais_antiga      |
| ------ | ----- | ---------------- |
| idle   | 10    | 00:26:34.523886  |
| active | 1     | -00:00:00.000003 |
| null   | 1     | null             |

SHOW max_connections;

RESULTADO: 
| max_connections |
| --------------- |
| 60              |
-- Consultas rodando há mais de 30 segundos neste instante
SELECT
    pid,
    NOW() - query_start AS duracao,
    state,
    LEFT(query, 150)    AS consulta
FROM pg_stat_activity
WHERE datname = current_database()
  AND state <> 'idle'
  AND NOW() - query_start > INTERVAL '30 seconds'
ORDER BY duracao DESC;

RESULTADO:
Success. No rows returned

-- ────────────────────────────────────────────────────────────
-- 7. Inchaço por linhas mortas (tabelas muito atualizadas sem limpeza)
--    processos.dados é reescrito inteiro a cada update; cada versão antiga
--    fica ocupando espaço até o autovacuum passar.
-- ────────────────────────────────────────────────────────────
SELECT
    relname                        AS tabela,
    n_live_tup                     AS linhas_vivas,
    n_dead_tup                     AS linhas_mortas,
    CASE WHEN n_live_tup > 0
         THEN ROUND(100.0 * n_dead_tup / n_live_tup, 1)
         ELSE 0 END                AS pct_morto,
    last_autovacuum,
    last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;

RESULTADO: 
| tabela                     | linhas_vivas | linhas_mortas | pct_morto | last_autovacuum | last_autoanalyze |
| -------------------------- | ------------ | ------------- | --------- | --------------- | ---------------- |
| sequenciais_contadores     | 0            | 7             | 0         | null            | null             |
| processos                  | 0            | 3             | 0         | null            | null             |
| users                      | 0            | 1             | 0         | null            | null             |
| sessions                   | 0            | 1             | 0         | null            | null             |
| refresh_tokens             | 1            | 1             | 100.0     | null            | null             |
| mfa_recovery_code_sets     | 0            | 0             | 0         | null            | null             |
| buckets                    | 0            | 0             | 0         | null            | null             |
| identities                 | 0            | 0             | 0         | null            | null             |
| oauth_consents             | 0            | 0             | 0         | null            | null             |
| numeros_descartados        | 0            | 0             | 0         | null            | null             |
| oauth_authorizations       | 0            | 0             | 0         | null            | null             |
| oauth_client_states        | 0            | 0             | 0         | null            | null             |
| scim_users                 | 0            | 0             | 0         | null            | null             |
| subscription               | 0            | 0             | 0         | null            | null             |
| scim_tokens                | 0            | 0             | 0         | null            | null             |
| mfa_amr_claims             | 0            | 0             | 0         | null            | null             |
| chats_interface_juridica   | 0            | 0             | 0         | null            | null             |
| messages                   | 0            | 0             | 0         | null            | null             |
| webauthn_challenges        | 0            | 0             | 0         | null            | null             |
| oauth_clients              | 0            | 0             | 0         | null            | null             |
| webauthn_credentials       | 0            | 0             | 0         | null            | null             |
| instances                  | 0            | 0             | 0         | null            | null             |
| checklist_itens            | 0            | 0             | 0         | null            | null             |
| mfa_recovery_codes         | 0            | 0             | 0         | null            | null             |
| s3_multipart_uploads_parts | 0            | 0             | 0         | null            | null             |
| sso_providers              | 0            | 0             | 0         | null            | null             |
| imoveis                    | 0            | 0             | 0         | null            | null             |
| saml_providers             | 0            | 0             | 0         | null            | null             |
| migrations                 | 0            | 0             | 0         | null            | null             |
| notificacoes               | 0            | 0             | 0         | null            | null             |
| configuracoes_upfmd        | 0            | 0             | 0         | null            | null             |
| decretos                   | 0            | 0             | 0         | null            | null             |
| contribuintes              | 0            | 0             | 0         | null            | null             |
| processo_infracoes         | 0            | 0             | 0         | null            | null             |
| transicoes                 | 0            | 0             | 0         | null            | null             |
| schema_migrations          | 0            | 0             | 0         | null            | null             |
| custom_oauth_providers     | 0            | 0             | 0         | null            | null             |
| saml_relay_states          | 0            | 0             | 0         | null            | null             |
| schema_migrations          | 0            | 0             | 0         | null            | null             |
| buckets_vectors            | 0            | 0             | 0         | null            | null             |
| sso_domains                | 0            | 0             | 0         | null            | null             |
| mfa_challenges             | 0            | 0             | 0         | null            | null             |
| documentos                 | 3            | 0             | 0.0       | null            | null             |
| buckets_analytics          | 0            | 0             | 0         | null            | null             |
| flow_state                 | 0            | 0             | 0         | null            | null             |
| autos_infracao             | 0            | 0             | 0         | null            | null             |
| mfa_factors                | 0            | 0             | 0         | null            | null             |
| s3_multipart_uploads       | 0            | 0             | 0         | null            | null             |
| one_time_tokens            | 0            | 0             | 0         | null            | null             |
| profiles                   | 0            | 0             | 0         | null            | null             |
| secrets                    | 0            | 0             | 0         | null            | null             |
| etapas                     | 0            | 0             | 0         | null            | null             |
| objects                    | 0            | 0             | 0         | null            | null             |
| vector_indexes             | 0            | 0             | 0         | null            | null             |
| checklist_respostas        | 0            | 0             | 0         | null            | null             |
| historico_etapas           | 0            | 0             | 0         | null            | null             |
| infracoes_catalogo         | 0            | 0             | 0         | null            | null             |
| audit_log_entries          | 0            | 0             | 0         | null            | null             |