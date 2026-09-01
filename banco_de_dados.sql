-- ============================================================
-- BANCO DE DADOS — Sistema Fluxograma de Processos
-- Compatível com Supabase (PostgreSQL)
-- ============================================================
-- Se precisar LIMPAR TUDO e recriar do zero, execute primeiro:
/*
DROP TABLE IF EXISTS documentos CASCADE;
DROP TABLE IF EXISTS checklist_respostas CASCADE;
DROP TABLE IF EXISTS checklist_itens CASCADE;
DROP TABLE IF EXISTS historico_etapas CASCADE;
DROP TABLE IF EXISTS processo_infracoes CASCADE;
DROP TABLE IF EXISTS processos CASCADE;
DROP TABLE IF EXISTS transicoes CASCADE;
DROP TABLE IF EXISTS etapas CASCADE;
DROP TABLE IF EXISTS infracoes_catalogo CASCADE;
DROP TABLE IF EXISTS imoveis CASCADE;
DROP TABLE IF EXISTS contribuintes CASCADE;
DROP TABLE IF EXISTS solicitantes CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
*/
-- ============================================================

-- ┌─────────────────────────────────────────────────────────────┐
-- │  1. TABELA: profiles                                        │
-- │  Fiscais de Postura que operam o sistema                    │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(200),
    cpf VARCHAR(14) UNIQUE NOT NULL,          -- 000.000.000-00
    matricula VARCHAR(30),                     -- Matrícula do fiscal (ex: 99044459/2)
    cargo VARCHAR(50) DEFAULT 'Fiscal de Postura',
    email VARCHAR(200),
    avatar_url TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca por CPF (login)
CREATE INDEX IF NOT EXISTS idx_profiles_cpf ON profiles(cpf);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  TABELA: contribuintes                                      │
-- │  Dados do contribuinte (do modelo NP - INFORMAÇÕES DO CONT) │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS contribuintes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID,                          -- vinculado depois de criar o processo
    nome VARCHAR(200) NOT NULL,
    cpf_cnpj VARCHAR(18),
    logradouro VARCHAR(300),
    numero VARCHAR(20),
    complemento VARCHAR(200),
    bairro VARCHAR(100),
    municipio VARCHAR(100),
    cep VARCHAR(10),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  TABELA: imoveis                                            │
-- │  Dados do imóvel (do modelo NP - INFORMAÇÕES DO IMÓVEL)     │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS imoveis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID,
    codigo_reduzido VARCHAR(20),              -- Código reduzido do imóvel
    inscricao_imovel VARCHAR(30),             -- 01.036.00181.00300.00000.0
    zona VARCHAR(5),                           -- Parte 1 da inscrição
    setor VARCHAR(5),                          -- Parte 2
    quadra VARCHAR(10),                        -- Parte 3
    lote VARCHAR(10),                          -- Parte 4
    logradouro VARCHAR(300),
    numero VARCHAR(20),
    complemento VARCHAR(200),
    bairro VARCHAR(100),
    area_total NUMERIC(12,2),                 -- m²
    testada NUMERIC(12,2),                    -- metros
    profundidade NUMERIC(12,2),               -- metros
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  TABELA: infracoes_catalogo                                 │
-- │  Catálogo fixo dos dispositivos legais transgredidos         │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS infracoes_catalogo (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL,              -- Ex: 120000232
    descricao VARCHAR(300) NOT NULL,          -- Ex: Falta de limpeza e conservação...
    categoria VARCHAR(50) DEFAULT 'Posturas',
    ativo BOOLEAN DEFAULT TRUE
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  TABELA: processo_infracoes                                 │
-- │  Infrações selecionadas para cada processo (N:N)            │
-- │  Cada infração gera número de notificação diferente         │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS processo_infracoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID NOT NULL,
    infracao_id INT NOT NULL REFERENCES infracoes_catalogo(id),
    numero_notificacao VARCHAR(30),           -- Nº único da notificação desta infração
    valor_multa NUMERIC(12,2),                -- Valor da multa para esta infração
    descricao_personalizada TEXT,             -- Descrição específica
    reincidente BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- (índice de CPF já criado acima)

-- ┌─────────────────────────────────────────────────────────────┐
-- │  TABELA: notificacoes                                       │
-- │  Cada infração/notificação gerada no processo, com etapa,   │
-- │  prazo e status independentes.                              │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS notificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
    processo_infracao_id UUID REFERENCES processo_infracoes(id) ON DELETE SET NULL,
    numero VARCHAR(50) NOT NULL,              -- Número único da notificação
    descricao TEXT,                            -- Descrição/dispositivo legal
    prazo_dias INT DEFAULT 15,
    data_inicio TIMESTAMPTZ DEFAULT NOW(),
    data_vencimento TIMESTAMPTZ,
    status VARCHAR(30) DEFAULT 'pendente',    -- 'pendente', 'atendida', 'defesa', 'dilacao'
    etapa_atual_id INT REFERENCES etapas(id),  -- Etapa em que a notificação se encontra
    data_movimentacao TIMESTAMPTZ,
    dados JSONB DEFAULT '{}',                  -- Campos extras específicos da notificação
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_processo ON notificacoes(processo_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_status ON notificacoes(status);
CREATE INDEX IF NOT EXISTS idx_notificacoes_etapa ON notificacoes(etapa_atual_id);

-- Vínculo 1:1 entre infração e notificação
ALTER TABLE processo_infracoes
    ADD COLUMN IF NOT EXISTS notificacao_id UUID REFERENCES notificacoes(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_processo_infracoes_notif
    ON processo_infracoes(notificacao_id) WHERE notificacao_id IS NOT NULL;

-- Vínculo opcional de histórico e documentos com notificação
ALTER TABLE historico_etapas
    ADD COLUMN IF NOT EXISTS notificacao_id UUID REFERENCES notificacoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_historico_notificacao ON historico_etapas(notificacao_id);

ALTER TABLE documentos
    ADD COLUMN IF NOT EXISTS notificacao_id UUID REFERENCES notificacoes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_documentos_notificacao ON documentos(notificacao_id);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  2. TABELA: etapas                                          │
-- │  Catálogo fixo das 32 etapas do fluxograma                 │
-- │  Inserida uma vez, consultada sempre                        │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS etapas (
    id SERIAL PRIMARY KEY,
    numero INT UNIQUE NOT NULL,               -- 1 a 32
    nome VARCHAR(200) NOT NULL,               -- "Possui Decreto/Notificação"
    descricao TEXT,                            -- Descrição longa da etapa
    tipo VARCHAR(30) DEFAULT 'normal',        -- 'inicio', 'normal', 'encerramento'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  3. TABELA: transicoes                                      │
-- │  Mapa de transições possíveis entre etapas                  │
-- │  Representa as setas do Mermaid                             │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS transicoes (
    id SERIAL PRIMARY KEY,
    etapa_origem_id INT NOT NULL REFERENCES etapas(id),
    etapa_destino_id INT NOT NULL REFERENCES etapas(id),
    condicao VARCHAR(200) NOT NULL,           -- "Possui Decreto? Sim", "Checklist: preenchido"
    descricao TEXT,                            -- Descrição adicional da condição
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(etapa_origem_id, etapa_destino_id, condicao)
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  4. TABELA: processos                                       │
-- │  Cada processo criado por um fiscal                         │
-- │  Possui numeração sequencial e pode estar em qualquer etapa │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS processos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_processo VARCHAR(30) UNIQUE NOT NULL,  -- Ex: "2026/000001"
    numero_relatorio TEXT,                        -- Ex: "2026/001"
    fiscal_id UUID NOT NULL REFERENCES profiles(id),
    etapa_atual_id INT NOT NULL REFERENCES etapas(id) DEFAULT 1,
    status VARCHAR(30) DEFAULT 'em_aberto',       -- 'em_aberto', 'finalizado', 'cancelado'

    possui_decreto BOOLEAN,
    processo_existente BOOLEAN,
    processo_existente_ref VARCHAR(30),            -- Referência ao processo existente

    -- Dados do fiscal na vistoria
    data_vistoria DATE,
    descricao_fiscalizacao TEXT,
    decreto_url TEXT,                              -- URL do decreto anexado

    -- Campos JSONB para dados dinâmicos extras
    dados JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frequentes
CREATE INDEX idx_processos_fiscal ON processos(fiscal_id);
CREATE INDEX idx_processos_etapa ON processos(etapa_atual_id);
CREATE INDEX idx_processos_status ON processos(status);
CREATE INDEX idx_processos_numero ON processos(numero_processo);

-- Numeração de processos gerenciada via RPC atômica (ver seção de funções abaixo)

-- ┌─────────────────────────────────────────────────────────────┐
-- │  5. TABELA: historico_etapas                                │
-- │  Registra cada movimentação do processo entre etapas        │
-- │  (audit trail completo)                                     │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS historico_etapas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
    etapa_de_id INT REFERENCES etapas(id),        -- NULL na criação do processo
    etapa_para_id INT NOT NULL REFERENCES etapas(id),
    transicao_id INT REFERENCES transicoes(id),    -- Qual transição foi utilizada
    usuario_id UUID NOT NULL REFERENCES profiles(id),
    condicao_aplicada VARCHAR(200),                -- A condição que causou a transição
    observacao TEXT,                                -- Observação livre do fiscal
    dados_etapa JSONB DEFAULT '{}',                -- Snapshot dos dados preenchidos na etapa
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_historico_processo ON historico_etapas(processo_id);
CREATE INDEX idx_historico_data ON historico_etapas(created_at);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  6. TABELA: checklist_itens                                 │
-- │  Itens de checklist configuráveis por etapa                 │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS checklist_itens (
    id SERIAL PRIMARY KEY,
    etapa_id INT NOT NULL REFERENCES etapas(id),
    descricao VARCHAR(300) NOT NULL,
    obrigatorio BOOLEAN DEFAULT TRUE,
    ordem INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  7. TABELA: checklist_respostas                             │
-- │  Respostas do checklist por processo                        │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS checklist_respostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
    checklist_item_id INT NOT NULL REFERENCES checklist_itens(id),
    preenchido BOOLEAN DEFAULT FALSE,
    valor TEXT,                                    -- Valor preenchido (se aplicável)
    usuario_id UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(processo_id, checklist_item_id)
);

-- ┌─────────────────────────────────────────────────────────────┐
-- │  8. TABELA: documentos                                      │
-- │  Documentos gerados ou enviados em cada etapa               │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
    etapa_id INT NOT NULL REFERENCES etapas(id),
    tipo VARCHAR(100) NOT NULL,               -- 'auto_infracao', 'certidao', 'edital', 'defesa', 'comprovante', etc.
    nome_arquivo VARCHAR(300),
    url TEXT,                                  -- URL do arquivo (Cloudinary, Storage, etc.)
    mime_type VARCHAR(100),
    tamanho_bytes BIGINT,
    gerado_automaticamente BOOLEAN DEFAULT FALSE,
    numero_sequencial TEXT,                    -- Ex: "2026/001" (para réplicas, certidões, etc)
    usuario_id UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documentos_processo ON documentos(processo_id);
CREATE INDEX idx_documentos_etapa ON documentos(etapa_id);

-- ============================================================
-- DADOS INICIAIS: Cadastro das 32 etapas
-- ============================================================
INSERT INTO etapas (numero, nome, tipo) VALUES
    (1,  'Possui Decreto/Notificação',          'inicio'),
    (2,  'Defesa ou Dilação de Prazo',           'normal'),
    (3,  'Envio da 1ª Defesa',                   'normal'),
    (4,  'Comprovante Propriedade',              'normal'),
    (5,  'Análise Dilação de Prazo',             'normal'),
    (6,  'Defesa Com Dilação',                   'normal'),
    (7,  'Análise da Defesa Sem Dilação',        'normal'),
    (8,  'Fiscal Analisa a Defesa (Pós Dilação)','normal'),
    (9,  'Envio da Defesa Sem Dilação',          'normal'),
    (10, 'Certidão Sem Defesa',                  'normal'),
    (11, 'Gerente antes Infração',               'normal'),
    (12, 'Gerente antes Auto de Infração',       'normal'),
    (13, 'Fiscal Analisa a Defesa (1ª)',         'normal'),
    (14, 'Auto de Infração',                     'normal'),
    (15, 'Gerente Gera a Multa',                 'normal'),
    (16, 'Retorno do AR',                        'normal'),
    (17, 'Gerência Gera o Edital',               'normal'),
    (18, 'Solicitar Defesa ou Recurso',          'normal'),
    (19, 'Envio de Defesa ou Pagamento',         'normal'),
    (20, 'Realizar Pagamento',                   'normal'),
    (21, 'Fiscal Convocado pelo Jurídico',       'normal'),
    (22, 'Gerente Convocado pelo Jurídico',      'normal'),
    (23, 'Parecer Jurídico',                     'normal'),
    (24, 'Secretário Despacha',                  'normal'),
    (25, 'Gerente Cumpre o Decreto',             'normal'),
    (26, 'Fazenda Gera a Multa',                 'normal'),
    (27, 'Devolvimento para o Setor',            'normal'),
    (28, 'Certificação do Vencimento',           'encerramento'),
    (29, 'Fiscal Emite Certidão',                'encerramento'),
    (30, 'Gerente Localiza o AR',                'normal'),
    (31, 'Comprovante Pagamento',                'normal'),
    (32, 'Consulta no Jurídico',                 'encerramento');

-- ============================================================
-- DADOS INICIAIS: Transições entre etapas (mapa do fluxograma)
-- ============================================================
INSERT INTO transicoes (etapa_origem_id, etapa_destino_id, condicao) VALUES
    -- E1 → saídas
    ((SELECT id FROM etapas WHERE numero = 1),  (SELECT id FROM etapas WHERE numero = 2),  'Possui Decreto? Não'),
    ((SELECT id FROM etapas WHERE numero = 1),  (SELECT id FROM etapas WHERE numero = 14), 'Possui Decreto? Sim'),
    ((SELECT id FROM etapas WHERE numero = 1),  (SELECT id FROM etapas WHERE numero = 14), 'Processo já Existente? Sim'),

    -- E2 → saídas
    ((SELECT id FROM etapas WHERE numero = 2),  (SELECT id FROM etapas WHERE numero = 4),  'Defesa ou Dilação de Prazo'),
    ((SELECT id FROM etapas WHERE numero = 2),  (SELECT id FROM etapas WHERE numero = 7),  'Notificação Atendida ou Vencida'),

    -- E3 → saídas
    ((SELECT id FROM etapas WHERE numero = 3),  (SELECT id FROM etapas WHERE numero = 13), 'Defesa Anexada (Checklist preenchido)'),
    ((SELECT id FROM etapas WHERE numero = 3),  (SELECT id FROM etapas WHERE numero = 10), 'Prazo Vencido Sem Defesa (Checklist pendente)'),

    -- E4 → saídas
    ((SELECT id FROM etapas WHERE numero = 4),  (SELECT id FROM etapas WHERE numero = 3),  'Envio da 1ª Defesa'),
    ((SELECT id FROM etapas WHERE numero = 4),  (SELECT id FROM etapas WHERE numero = 5),  'Análise Dilação de Prazo'),
    ((SELECT id FROM etapas WHERE numero = 4),  (SELECT id FROM etapas WHERE numero = 7),  'Sem Comprovante / Atendida / Vencida'),

    -- E5 → saídas
    ((SELECT id FROM etapas WHERE numero = 5),  (SELECT id FROM etapas WHERE numero = 2),  'Dilação Aceita'),
    ((SELECT id FROM etapas WHERE numero = 5),  (SELECT id FROM etapas WHERE numero = 7),  'Dilação Negada'),
    ((SELECT id FROM etapas WHERE numero = 5),  (SELECT id FROM etapas WHERE numero = 11), 'Análise do Gerente'),

    -- E6 → saída
    ((SELECT id FROM etapas WHERE numero = 6),  (SELECT id FROM etapas WHERE numero = 8),  'Sempre'),

    -- E7 → saídas
    ((SELECT id FROM etapas WHERE numero = 7),  (SELECT id FROM etapas WHERE numero = 10), 'Houve Cumprimento? Sim'),
    ((SELECT id FROM etapas WHERE numero = 7),  (SELECT id FROM etapas WHERE numero = 10), 'Houve Cumprimento? Não'),
    ((SELECT id FROM etapas WHERE numero = 7),  (SELECT id FROM etapas WHERE numero = 32), 'Enviar para o Jurídico'),

    -- E8 → saídas
    ((SELECT id FROM etapas WHERE numero = 8),  (SELECT id FROM etapas WHERE numero = 29), 'Defesa Deferida'),
    ((SELECT id FROM etapas WHERE numero = 8),  (SELECT id FROM etapas WHERE numero = 10), 'Defesa Indeferida'),
    ((SELECT id FROM etapas WHERE numero = 8),  (SELECT id FROM etapas WHERE numero = 12), 'Enviar para Gerente'),
    ((SELECT id FROM etapas WHERE numero = 8),  (SELECT id FROM etapas WHERE numero = 32), 'Enviar para Jurídico'),

    -- E9 → saída
    ((SELECT id FROM etapas WHERE numero = 9),  (SELECT id FROM etapas WHERE numero = 7),  'Sempre'),

    -- E10 → saídas
    ((SELECT id FROM etapas WHERE numero = 10), (SELECT id FROM etapas WHERE numero = 14), 'Foi resolvido? Não'),
    ((SELECT id FROM etapas WHERE numero = 10), (SELECT id FROM etapas WHERE numero = 29), 'Foi resolvido? Sim'),

    -- E11 → saídas
    ((SELECT id FROM etapas WHERE numero = 11), (SELECT id FROM etapas WHERE numero = 10), 'Análise do gerente: deferido (com certidão)'),
    ((SELECT id FROM etapas WHERE numero = 11), (SELECT id FROM etapas WHERE numero = 29), 'Análise do gerente: deferido (sem certidão)'),
    ((SELECT id FROM etapas WHERE numero = 11), (SELECT id FROM etapas WHERE numero = 10), 'Análise do gerente: indeferido'),
    ((SELECT id FROM etapas WHERE numero = 11), (SELECT id FROM etapas WHERE numero = 2),  'Análise do gerente: dilatar prazo'),
    ((SELECT id FROM etapas WHERE numero = 11), (SELECT id FROM etapas WHERE numero = 3),  'Análise do gerente: retornar ao fiscal'),
    ((SELECT id FROM etapas WHERE numero = 11), (SELECT id FROM etapas WHERE numero = 32), 'Enviar para o Jurídico'),

    -- E12 → saídas
    ((SELECT id FROM etapas WHERE numero = 12), (SELECT id FROM etapas WHERE numero = 10), 'Análise do gerente: indeferido'),
    ((SELECT id FROM etapas WHERE numero = 12), (SELECT id FROM etapas WHERE numero = 29), 'Análise do gerente: deferido'),
    ((SELECT id FROM etapas WHERE numero = 12), (SELECT id FROM etapas WHERE numero = 2),  'Análise do gerente: dilatar prazo'),
    ((SELECT id FROM etapas WHERE numero = 12), (SELECT id FROM etapas WHERE numero = 32), 'Enviar para o Jurídico'),

    -- E13 → saídas
    ((SELECT id FROM etapas WHERE numero = 13), (SELECT id FROM etapas WHERE numero = 10), 'Defesa Deferida'),
    ((SELECT id FROM etapas WHERE numero = 13), (SELECT id FROM etapas WHERE numero = 10), 'Defesa Indeferida'),
    ((SELECT id FROM etapas WHERE numero = 13), (SELECT id FROM etapas WHERE numero = 11), 'Enviar para Gerente'),
    ((SELECT id FROM etapas WHERE numero = 13), (SELECT id FROM etapas WHERE numero = 32), 'Enviar para Jurídico'),

    -- E14 → saída
    ((SELECT id FROM etapas WHERE numero = 14), (SELECT id FROM etapas WHERE numero = 15), 'Sempre'),

    -- E15 → saída
    ((SELECT id FROM etapas WHERE numero = 15), (SELECT id FROM etapas WHERE numero = 16), 'Sempre'),

    -- E16 → saídas
    ((SELECT id FROM etapas WHERE numero = 16), (SELECT id FROM etapas WHERE numero = 30), 'Pendente/Não Voltou'),
    ((SELECT id FROM etapas WHERE numero = 16), (SELECT id FROM etapas WHERE numero = 17), 'Não Efetivado'),
    ((SELECT id FROM etapas WHERE numero = 16), (SELECT id FROM etapas WHERE numero = 18), 'Efetivado'),

    -- E17 → saída
    ((SELECT id FROM etapas WHERE numero = 17), (SELECT id FROM etapas WHERE numero = 18), 'Sempre'),

    -- E18 → saídas
    ((SELECT id FROM etapas WHERE numero = 18), (SELECT id FROM etapas WHERE numero = 19), 'Checklist preenchido'),
    ((SELECT id FROM etapas WHERE numero = 18), (SELECT id FROM etapas WHERE numero = 20), 'Checklist pendente'),

    -- E19 → saídas
    ((SELECT id FROM etapas WHERE numero = 19), (SELECT id FROM etapas WHERE numero = 23), 'Checklist preenchido'),
    ((SELECT id FROM etapas WHERE numero = 19), (SELECT id FROM etapas WHERE numero = 20), 'Checklist pendente'),

    -- E20 → saída
    ((SELECT id FROM etapas WHERE numero = 20), (SELECT id FROM etapas WHERE numero = 31), 'Sempre'),

    -- E23 → saídas
    ((SELECT id FROM etapas WHERE numero = 23), (SELECT id FROM etapas WHERE numero = 22), 'Encaminhar a Gerência'),
    ((SELECT id FROM etapas WHERE numero = 23), (SELECT id FROM etapas WHERE numero = 21), 'Devolver ao Fiscal'),
    ((SELECT id FROM etapas WHERE numero = 23), (SELECT id FROM etapas WHERE numero = 24), 'Secretário para Despacho'),

    -- E24 → saída
    ((SELECT id FROM etapas WHERE numero = 24), (SELECT id FROM etapas WHERE numero = 25), 'Sempre'),

    -- E25 → saída
    ((SELECT id FROM etapas WHERE numero = 25), (SELECT id FROM etapas WHERE numero = 26), 'Sempre'),

    -- E26 → saída
    ((SELECT id FROM etapas WHERE numero = 26), (SELECT id FROM etapas WHERE numero = 27), 'Sempre'),

    -- E27 → saídas
    ((SELECT id FROM etapas WHERE numero = 27), (SELECT id FROM etapas WHERE numero = 19), 'Checklist preenchido'),
    ((SELECT id FROM etapas WHERE numero = 27), (SELECT id FROM etapas WHERE numero = 20), 'Checklist pendente'),

    -- E30 → saídas
    ((SELECT id FROM etapas WHERE numero = 30), (SELECT id FROM etapas WHERE numero = 17), 'Não Efetivado'),
    ((SELECT id FROM etapas WHERE numero = 30), (SELECT id FROM etapas WHERE numero = 18), 'Efetivado'),

    -- E31 → saídas
    ((SELECT id FROM etapas WHERE numero = 31), (SELECT id FROM etapas WHERE numero = 28), 'Não realizou o pagamento'),
    ((SELECT id FROM etapas WHERE numero = 31), (SELECT id FROM etapas WHERE numero = 32), 'Enviar para o Jurídico');

-- ============================================================
-- TABELAS E FUNÇÕES: Numeração sequencial atômica unificada
-- (anti-race-condition, reutilização de números cancelados)
-- ============================================================

-- Fila de números descartados para reutilização
CREATE TABLE IF NOT EXISTS numeros_descartados (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    categoria TEXT NOT NULL,
    numero_sequencial TEXT NOT NULL,
    ano INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(categoria, numero_sequencial, ano)
);
ALTER TABLE numeros_descartados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "numeros_descartados_acesso_total" ON numeros_descartados;
CREATE POLICY "numeros_descartados_acesso_total"
    ON numeros_descartados FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabela de números disponíveis (usada diretamente pelo projeto SEMAC)
CREATE TABLE IF NOT EXISTS numeros_disponiveis (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    categoria TEXT NOT NULL,
    numero_sequencial TEXT NOT NULL,
    ano INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(categoria, numero_sequencial, ano)
);
ALTER TABLE numeros_disponiveis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "numeros_disponiveis_acesso_total" ON numeros_disponiveis;
CREATE POLICY "numeros_disponiveis_acesso_total"
    ON numeros_disponiveis FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS sequenciais_contadores (
    id SERIAL PRIMARY KEY,
    categoria TEXT NOT NULL,
    ano INTEGER NOT NULL,
    ultimo_numero INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(categoria, ano)
);
ALTER TABLE sequenciais_contadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sequenciais_contadores_acesso_total" ON sequenciais_contadores;
CREATE POLICY "sequenciais_contadores_acesso_total" ON sequenciais_contadores FOR ALL USING (true) WITH CHECK (true);

-- Coluna para armazenar o número da certidão na notificação (se aplicável)
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS numero_certidao TEXT;

-- Drop de TODAS as assinaturas sobrecarregadas de reservar_numero e devolver_numero no banco de dados
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (
        SELECT proname, oidvectortypes(proargtypes) as argtypes 
        FROM pg_proc 
        WHERE proname IN ('reservar_numero', 'devolver_numero')
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proname || '(' || r.argtypes || ') CASCADE';
    END LOOP;
END $$;

-- Helper privado para verificar se um número já está em uso na tabela de destino
CREATE OR REPLACE FUNCTION _numero_existe_em_uso(p_ano INTEGER, p_categoria TEXT, p_cand TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_existe BOOLEAN := FALSE;
BEGIN
    IF p_categoria = 'Processo' THEN
        SELECT EXISTS(SELECT 1 FROM processos WHERE numero_processo = p_cand) INTO v_existe;
    ELSIF p_categoria = 'Relatório Fiscal' THEN
        SELECT EXISTS(SELECT 1 FROM processos WHERE numero_relatorio = p_cand) INTO v_existe;
    ELSIF p_categoria = 'Auto de Infração' THEN
        SELECT EXISTS(SELECT 1 FROM autos_infracao WHERE numero = p_cand) INTO v_existe;
    ELSIF p_categoria IN ('Certidão Sem Defesa', 'Certidão') THEN
        SELECT EXISTS(
            SELECT 1 FROM documentos WHERE tipo IN ('Certidão', 'Certidão Sem Defesa') AND numero_sequencial = p_cand
            UNION ALL
            SELECT 1 FROM notificacoes WHERE numero_certidao = p_cand
        ) INTO v_existe;
    ELSIF p_categoria = 'Réplica' THEN
        SELECT EXISTS(SELECT 1 FROM documentos WHERE tipo = 'Réplica' AND numero_sequencial = p_cand) INTO v_existe;
    ELSE
        SELECT EXISTS(SELECT 1 FROM documentos WHERE tipo = p_categoria AND numero_sequencial = p_cand) INTO v_existe;
    END IF;
    RETURN v_existe;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Reserva próximo número de forma atômica por categoria com rigorosa checagem de unicidade
CREATE OR REPLACE FUNCTION reservar_numero(p_ano INTEGER, p_categoria TEXT)
RETURNS TEXT AS $$
DECLARE
    r_desc RECORD;
    v_seq TEXT;
    v_cand TEXT;
    v_prox INTEGER := 0;
    v_max_existente INTEGER := 0;
    v_tamanho_pad INTEGER;
BEGIN
    IF p_categoria IS NULL OR TRIM(p_categoria) = '' THEN
        RAISE EXCEPTION 'Categoria inválida para reserva de número.';
    END IF;

    v_tamanho_pad := CASE 
        WHEN p_categoria = 'Processo' THEN 6 
        ELSE 3 
    END;

    -- 1. Tentar buscar da tabela numeros_descartados
    BEGIN
        FOR r_desc IN 
            SELECT id, numero_sequencial 
            FROM numeros_descartados
            WHERE ano = p_ano AND (
                LOWER(categoria) = LOWER(p_categoria) OR 
                (p_categoria IN ('Certidão Sem Defesa', 'Certidão') AND LOWER(categoria) IN ('certidão sem defesa', 'certidão'))
            )
            ORDER BY LPAD(regexp_replace(numero_sequencial, '\D', '', 'g'), 10, '0')::BIGINT ASC
            FOR UPDATE SKIP LOCKED
        LOOP
            v_seq := LPAD(regexp_replace(r_desc.numero_sequencial, '\D', '', 'g'), v_tamanho_pad, '0');
            v_cand := p_ano::TEXT || '/' || v_seq;

            -- Remove de descartados e disponiveis se existir
            DELETE FROM numeros_descartados WHERE id = r_desc.id;
            BEGIN
                DELETE FROM numeros_disponiveis 
                WHERE ano = p_ano AND (
                    LOWER(categoria) = LOWER(p_categoria) OR 
                    (p_categoria IN ('Certidão Sem Defesa', 'Certidão') AND LOWER(categoria) IN ('certidão sem defesa', 'certidão'))
                ) AND numero_sequencial = r_desc.numero_sequencial;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;

            -- Se o número NÃO estiver em uso em nenhuma tabela principal, pode reutilizar!
            IF NOT _numero_existe_em_uso(p_ano, p_categoria, v_cand) THEN
                RETURN v_cand;
            END IF;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 2. Tentar em numeros_disponiveis (usado pelo SEMAC)
    BEGIN
        FOR r_desc IN 
            SELECT numero_sequencial 
            FROM numeros_disponiveis
            WHERE ano = p_ano AND (
                LOWER(categoria) = LOWER(p_categoria) OR 
                (p_categoria IN ('Certidão Sem Defesa', 'Certidão') AND LOWER(categoria) IN ('certidão sem defesa', 'certidão'))
            )
            ORDER BY LPAD(regexp_replace(numero_sequencial, '\D', '', 'g'), 10, '0')::BIGINT ASC
            FOR UPDATE SKIP LOCKED
        LOOP
            v_seq := LPAD(regexp_replace(r_desc.numero_sequencial, '\D', '', 'g'), v_tamanho_pad, '0');
            v_cand := p_ano::TEXT || '/' || v_seq;

            DELETE FROM numeros_disponiveis 
            WHERE ano = p_ano AND (
                LOWER(categoria) = LOWER(p_categoria) OR 
                (p_categoria IN ('Certidão Sem Defesa', 'Certidão') AND LOWER(categoria) IN ('certidão sem defesa', 'certidão'))
            ) AND numero_sequencial = r_desc.numero_sequencial;

            IF NOT _numero_existe_em_uso(p_ano, p_categoria, v_cand) THEN
                RETURN v_cand;
            END IF;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 3. Buscar MAX atual existente na tabela de destino para garantir que a sequência nunca volte para trás
    IF p_categoria = 'Processo' THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(numero_processo, '/', 2), '\D', '', 'g'), '')::INTEGER), 0) INTO v_max_existente FROM processos WHERE numero_processo LIKE p_ano::TEXT || '/%';
    ELSIF p_categoria = 'Relatório Fiscal' THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(numero_relatorio, '/', 2), '\D', '', 'g'), '')::INTEGER), 0) INTO v_max_existente FROM processos WHERE numero_relatorio IS NOT NULL AND numero_relatorio LIKE p_ano::TEXT || '/%';
    ELSIF p_categoria = 'Réplica' THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(numero_sequencial, '/', 2), '\D', '', 'g'), '')::INTEGER), 0) INTO v_max_existente FROM documentos WHERE tipo = 'Réplica' AND numero_sequencial LIKE p_ano::TEXT || '/%';
    ELSIF p_categoria IN ('Certidão Sem Defesa', 'Certidão') THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(numero_sequencial, '/', 2), '\D', '', 'g'), '')::INTEGER), 0) INTO v_max_existente FROM documentos WHERE tipo IN ('Certidão', 'Certidão Sem Defesa') AND numero_sequencial LIKE p_ano::TEXT || '/%';
    ELSIF p_categoria = 'Auto de Infração' THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(numero, '/', 2), '\D', '', 'g'), '')::INTEGER), 0) INTO v_max_existente FROM autos_infracao WHERE numero LIKE p_ano::TEXT || '/%';
    ELSE
        SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(numero_sequencial, '/', 2), '\D', '', 'g'), '')::INTEGER), 0) INTO v_max_existente FROM documentos WHERE tipo = p_categoria AND numero_sequencial LIKE p_ano::TEXT || '/%';
    END IF;

    -- 4. Incrementar contador em sequenciais_contadores
    SELECT ultimo_numero INTO v_prox
    FROM sequenciais_contadores
    WHERE ano = p_ano AND categoria = p_categoria
    FOR UPDATE;

    IF v_prox IS NULL THEN
        v_prox := v_max_existente + 1;
        INSERT INTO sequenciais_contadores (categoria, ano, ultimo_numero)
        VALUES (p_categoria, p_ano, v_prox)
        ON CONFLICT (categoria, ano) DO UPDATE
        SET ultimo_numero = GREATEST(sequenciais_contadores.ultimo_numero + 1, EXCLUDED.ultimo_numero);
    ELSE
        v_prox := GREATEST(v_prox + 1, v_max_existente + 1);
    END IF;

    -- Garantir que o candidato final não exista em uso (loop de segurança)
    v_cand := p_ano::TEXT || '/' || LPAD(v_prox::TEXT, v_tamanho_pad, '0');
    WHILE _numero_existe_em_uso(p_ano, p_categoria, v_cand) LOOP
        v_prox := v_prox + 1;
        v_cand := p_ano::TEXT || '/' || LPAD(v_prox::TEXT, v_tamanho_pad, '0');
    END LOOP;

    -- Atualiza o contador com a posição final confirmada
    UPDATE sequenciais_contadores
    SET ultimo_numero = v_prox
    WHERE ano = p_ano AND categoria = p_categoria;

    RETURN v_cand;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Devolve número cancelado para a fila de descartes (sem inverter ano e numero_sequencial)
CREATE OR REPLACE FUNCTION devolver_numero(p_numero TEXT, p_categoria TEXT)
RETURNS VOID AS $$
DECLARE
    v_partes TEXT[];
    v_ano INTEGER;
    v_seq TEXT;
    v_p1_num INTEGER;
    v_p2_num INTEGER;
BEGIN
    IF p_numero IS NULL OR TRIM(p_numero) = '' OR p_categoria IS NULL OR TRIM(p_categoria) = '' THEN
        RETURN;
    END IF;

    v_partes := string_to_array(p_numero, '/');
    IF array_length(v_partes, 1) < 2 THEN 
        RETURN; 
    END IF;

    v_p1_num := NULLIF(regexp_replace(v_partes[1], '\D', '', 'g'), '')::INTEGER;
    v_p2_num := NULLIF(regexp_replace(v_partes[2], '\D', '', 'g'), '')::INTEGER;

    -- Detectar qual parte é o ano (4 dígitos e entre 1900 e 2100)
    IF v_p1_num IS NOT NULL AND v_p1_num >= 1900 AND v_p1_num <= 2100 AND LENGTH(TRIM(v_partes[1])) = 4 THEN
        -- Formato "ANO/NUMERO" (ex: 2026/000123) -> v_ano = 2026, v_seq = "000123"
        v_ano := v_p1_num;
        v_seq := TRIM(v_partes[2]);
    ELSIF v_p2_num IS NOT NULL AND v_p2_num >= 1900 AND v_p2_num <= 2100 AND LENGTH(TRIM(v_partes[2])) = 4 THEN
        -- Formato "NUMERO/ANO" (ex: 000123/2026) -> v_ano = 2026, v_seq = "000123"
        v_ano := v_p2_num;
        v_seq := TRIM(v_partes[1]);
    ELSE
        -- Fallback seguro
        v_ano := COALESCE(v_p2_num, EXTRACT(YEAR FROM NOW())::INTEGER);
        v_seq := TRIM(v_partes[1]);
    END IF;

    BEGIN
        INSERT INTO numeros_descartados (categoria, numero_sequencial, ano)
        VALUES (p_categoria, v_seq, v_ano)
        ON CONFLICT (categoria, numero_sequencial, ano) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        INSERT INTO numeros_disponiveis (categoria, numero_sequencial, ano)
        VALUES (p_categoria, v_seq, v_ano)
        ON CONFLICT (categoria, numero_sequencial, ano) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNÇÃO: Atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION atualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at_profiles
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();

CREATE TRIGGER trg_updated_at_processos
    BEFORE UPDATE ON processos
    FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();

CREATE TRIGGER trg_updated_at_checklist
    BEFORE UPDATE ON checklist_respostas
    FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();

CREATE TRIGGER trg_updated_at_notificacoes
    BEFORE UPDATE ON notificacoes
    FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();

-- ============================================================
-- RLS (Row Level Security) — Supabase
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles leitura pública" ON profiles;
DROP POLICY IF EXISTS "Profiles alteração autenticada" ON profiles;
CREATE POLICY "Profiles leitura pública" ON profiles FOR SELECT USING (true);
CREATE POLICY "Profiles alteração autenticada" ON profiles FOR ALL USING (auth.uid() IS NOT NULL);
ALTER TABLE processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_respostas ENABLE ROW LEVEL SECURITY;

-- Política: Acesso autenticado a processos, histórico, documentos e checklist
DROP POLICY IF EXISTS "Fiscal vê seus processos" ON processos;
DROP POLICY IF EXISTS "Fiscal vê seu histórico" ON historico_etapas;
DROP POLICY IF EXISTS "Fiscal vê seus documentos" ON documentos;
DROP POLICY IF EXISTS "Fiscal vê seu checklist" ON checklist_respostas;
DROP POLICY IF EXISTS "Acesso autenticado processos" ON processos;
DROP POLICY IF EXISTS "Acesso autenticado historico" ON historico_etapas;
DROP POLICY IF EXISTS "Acesso autenticado documentos" ON documentos;
DROP POLICY IF EXISTS "Acesso autenticado checklist" ON checklist_respostas;

CREATE POLICY "Acesso autenticado processos" ON processos FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Acesso autenticado historico" ON historico_etapas FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Acesso autenticado documentos" ON documentos FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Acesso autenticado checklist" ON checklist_respostas FOR ALL USING (auth.uid() IS NOT NULL);

-- Etapas e transições são públicas (leitura)
CREATE POLICY "Etapas públicas" ON etapas FOR SELECT USING (true);
-- Nota: transições não tem RLS habilitado, ficam públicas por padrão

-- RLS para novas tabelas
ALTER TABLE contribuintes ENABLE ROW LEVEL SECURITY;
ALTER TABLE imoveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE processo_infracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contribuintes acesso autenticado" ON contribuintes FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Imoveis acesso autenticado" ON imoveis FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Infracoes acesso autenticado" ON processo_infracoes FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Catalogo infracoes publico" ON infracoes_catalogo FOR SELECT USING (true);

DROP POLICY IF EXISTS "Notificacoes acesso autenticado" ON notificacoes;
CREATE POLICY "Notificacoes acesso autenticado" ON notificacoes FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================
-- DADOS INICIAIS: Catálogo de Infrações (Dispositivos Legais)
-- ============================================================
INSERT INTO infracoes_catalogo (codigo, descricao, categoria) VALUES
    ('120000232', 'Falta de limpeza e conservação de imóvel não edificado',    'Posturas'),
    ('120000211', 'Inexistência de Cercamento',                                'Posturas'),
    ('120000226', 'Inexistência de passeio',                                   'Posturas'),
    ('120000228', 'Reincidência na inexistência de cercamento e/ou passeio',   'Posturas'),
    ('120000227', 'Reincidência na inexistência de passeio',                   'Posturas'),
    ('120000229', 'Reconstrução de/ou reparo de muro',                         'Posturas'),
    ('120000240', 'Reconstrução e/ou reparo de passeio',                       'Posturas'),
    ('120000233', 'Limpeza de Quintal',                                        'Posturas'),
    ('120000237', 'Obstáculos em calçadas',                                    'Posturas'),
    ('120000239', 'Água servida',                                              'Posturas'),
    ('120000236', 'Estabelecimento sem Alvará',                                'Posturas'),
    ('120000234', 'Reparos por concessionárias',                               'Posturas'),
    ('120000230', 'Piso Tátil',                                                'Posturas');

-- ============================================================
-- TABELA: configuracoes_upfmd
-- Valor da Unidade Padrão Fiscal do Município de Divinópolis (UPFMD)
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracoes_upfmd (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    valor NUMERIC(10, 2) NOT NULL DEFAULT 103.00,
    ano INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    atualizado_por UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE configuracoes_upfmd ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "UPFMD publico select" ON configuracoes_upfmd;
DROP POLICY IF EXISTS "UPFMD publico insert" ON configuracoes_upfmd;
CREATE POLICY "UPFMD publico select" ON configuracoes_upfmd FOR SELECT USING (true);
CREATE POLICY "UPFMD publico insert" ON configuracoes_upfmd FOR ALL USING (true);

INSERT INTO configuracoes_upfmd (valor, ano)
VALUES (103.00, EXTRACT(YEAR FROM CURRENT_DATE))
ON CONFLICT DO NOTHING;

-- ============================================================
-- MIGRAÇÃO: Notificações legadas do JSONB para tabela própria
-- ============================================================
-- Executa apenas para processos que ainda não possuem notificações
-- na tabela notificacoes mas possuem dados em dados->campos->etapa2->notificacoes.
DO $$
DECLARE
    rec RECORD;
    notif JSONB;
    nova_notif_id UUID;
    etapa_num INT;
    etapa_db_id INT;
BEGIN
    FOR rec IN
        SELECT id, numero_processo, dados
        FROM processos
        WHERE dados->'campos'->'etapa2'->'notificacoes' IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM notificacoes n WHERE n.processo_id = processos.id
          )
    LOOP
        FOR notif IN SELECT * FROM jsonb_array_elements(rec.dados->'campos'->'etapa2'->'notificacoes')
        LOOP
            etapa_num := COALESCE((notif->>'etapa_atual')::INT, 2);

            SELECT id INTO etapa_db_id
            FROM etapas
            WHERE numero = etapa_num;

            INSERT INTO notificacoes (
                processo_id,
                numero,
                descricao,
                prazo_dias,
                data_inicio,
                data_vencimento,
                status,
                etapa_atual_id,
                data_movimentacao,
                dados
            ) VALUES (
                rec.id,
                COALESCE(notif->>'numero', rec.numero_processo || '/01'),
                notif->>'descricao',
                COALESCE((notif->>'prazo_dias')::INT, 15),
                COALESCE((notif->>'data_inicio')::TIMESTAMPTZ, rec.created_at),
                (notif->>'data_vencimento')::TIMESTAMPTZ,
                COALESCE(notif->>'status', 'pendente'),
                etapa_db_id,
                (notif->>'data_movimentacao')::TIMESTAMPTZ,
                jsonb_build_object('migrado_de_jsonb', true, 'indice_original', notif->>'index')
            )
            RETURNING id INTO nova_notif_id;

            -- Vincula infração do processo à notificação (primeira compatível)
            UPDATE processo_infracoes
            SET notificacao_id = nova_notif_id
            WHERE processo_id = rec.id
              AND notificacao_id IS NULL
              AND id IN (
                  SELECT id FROM processo_infracoes
                  WHERE processo_id = rec.id AND notificacao_id IS NULL
                  ORDER BY created_at
                  LIMIT 1
              );
        END LOOP;
    END LOOP;
END $$;

-- ┌─────────────────────────────────────────────────────────────┐
-- │  TABELA: autos_infracao                                     │
-- │  Registra Autos de Infração gerados no sistema             │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS autos_infracao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
    notificacao_id UUID REFERENCES notificacoes(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    numero VARCHAR(50) NOT NULL UNIQUE,
    notificacao_anterior_numero VARCHAR(50),
    proveniente_decreto BOOLEAN DEFAULT FALSE,
    prazo_dias INT DEFAULT 20,
    data_emissao TIMESTAMPTZ DEFAULT NOW(),
    data_vencimento TIMESTAMPTZ,
    status VARCHAR(30) DEFAULT 'emitido',
    etapa_atual_id INT REFERENCES etapas(id),
    dados JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autos_infracao_processo ON autos_infracao(processo_id);
CREATE INDEX IF NOT EXISTS idx_autos_infracao_notificacao ON autos_infracao(notificacao_id);
CREATE INDEX IF NOT EXISTS idx_autos_infracao_usuario ON autos_infracao(usuario_id);
CREATE INDEX IF NOT EXISTS idx_autos_infracao_numero ON autos_infracao(numero);

-- Permissões de Acesso
ALTER TABLE autos_infracao DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE autos_infracao TO anon, authenticated, service_role;

-- ┌─────────────────────────────────────────────────────────────┐
-- │  TABELA: chats_interface_juridica                           │
-- │  Registra conversas e anexos com a Interface Jurídica      │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS chats_interface_juridica (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID REFERENCES processos(id) ON DELETE CASCADE,
    notificacao_id UUID REFERENCES notificacoes(id) ON DELETE SET NULL,
    solicitante_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    solicitante_nome VARCHAR(200),
    solicitante_cargo VARCHAR(100),
    mensagens JSONB DEFAULT '[]'::jsonb,
    lida_gerente BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chats_processo ON chats_interface_juridica(processo_id);

-- Permissões de Acesso (RLS desabilitado para simulação / acesso direto)
ALTER TABLE chats_interface_juridica DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE chats_interface_juridica TO anon, authenticated, service_role;
