-- ============================================================
-- TABELA: modelos_parecer  (Etapa 19 — Parecer Jurídico)
-- ------------------------------------------------------------
-- Modelos-padrão de parecer jurídico, editáveis pelo próprio
-- jurídico dentro do sistema.
--
-- texto           -> versão em uso, editável na tela
-- texto_original  -> semente original, nunca alterada pela tela
--                    (permite "restaurar modelo original")
--
-- Marcadores dentro do texto:
--   {{CHAVE}}   -> preenchido automaticamente pelo sistema
--                  (nº do auto, nome, endereço, datas, assinante)
--   [INSTRUÇÃO] -> preenchido à mão pelo jurídico; a tela destaca
--                  os que ficaram pendentes antes de gerar o .docx
-- ============================================================

CREATE TABLE IF NOT EXISTS modelos_parecer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave VARCHAR(60) NOT NULL UNIQUE,         -- Ex: limpeza_reducao_50
    titulo VARCHAR(160) NOT NULL,              -- Nome exibido na tela
    codigos_infracao TEXT[] DEFAULT '{}',      -- Ex: {120000232,120000233}
    decisao VARCHAR(30) NOT NULL,              -- deferimento | indeferimento | reducao_50 | deferimento_parcial | diligencia
    base_legal VARCHAR(200),
    ordem INT DEFAULT 0,
    texto TEXT NOT NULL,
    texto_original TEXT NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    atualizado_por UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modelos_parecer_codigos ON modelos_parecer USING GIN (codigos_infracao);
CREATE INDEX IF NOT EXISTS idx_modelos_parecer_decisao ON modelos_parecer(decisao);

ALTER TABLE modelos_parecer DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE modelos_parecer TO anon, authenticated, service_role;

-- ============================================================
-- SEMENTES
-- Reexecutar este arquivo NÃO sobrescreve o texto editado pelo
-- jurídico: o ON CONFLICT só atualiza o texto_original e os
-- metadados de classificação.
-- ============================================================

INSERT INTO modelos_parecer (chave, titulo, codigos_infracao, decisao, base_legal, ordem, texto, texto_original) VALUES

-- ─────────────────────────── LIMPEZA ───────────────────────────
('limpeza_reducao_50',
 'Limpeza — deferimento da redução de 50%',
 ARRAY['120000232','120000233'],
 'reducao_50',
 'Art. 2º, IV, da Lei Municipal nº 7.174/2010',
 10,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} em relação à multa aplicada pela falta de limpeza do lote situado na {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A irregularidade foi constatada em {{DATA_CONSTATACAO}}. A fotografia apresentada pela contribuinte demonstra a posterior limpeza do imóvel, sem prejuízo de eventual vistoria fiscal para verificar a situação do lote. Nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010, satisfeita a exigência objeto do auto de infração, a penalidade pode ser reduzida em até 50%.

Opino pelo deferimento da redução de 50% da multa aplicada no Auto de Infração nº {{AUTO_NUMERO}}. A limpeza posterior justifica a redução, mas não afasta a infração constatada, permanecendo válido o auto.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} em relação à multa aplicada pela falta de limpeza do lote situado na {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A irregularidade foi constatada em {{DATA_CONSTATACAO}}. A fotografia apresentada pela contribuinte demonstra a posterior limpeza do imóvel, sem prejuízo de eventual vistoria fiscal para verificar a situação do lote. Nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010, satisfeita a exigência objeto do auto de infração, a penalidade pode ser reduzida em até 50%.

Opino pelo deferimento da redução de 50% da multa aplicada no Auto de Infração nº {{AUTO_NUMERO}}. A limpeza posterior justifica a redução, mas não afasta a infração constatada, permanecendo válido o auto.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

('limpeza_indeferimento',
 'Limpeza — indeferimento (regularização incompleta)',
 ARRAY['120000232','120000233'],
 'indeferimento',
 'Art. 2º, IV, da Lei Municipal nº 7.174/2010',
 11,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} em relação à multa aplicada pela falta de limpeza do lote situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

Embora as fotografias apresentadas indiquem que houve capina, elas também mostram [DESCREVER OS RESÍDUOS OU A IRREGULARIDADE REMANESCENTE]. Assim, não ficou comprovada a limpeza adequada do imóvel nem o atendimento integral da exigência objeto do auto de infração.

O art. 2º, inciso IV, da Lei Municipal nº 7.174/2010 condiciona a redução da penalidade à satisfação da exigência objeto da notificação ou do auto. Diante da regularização incompleta, opino pelo indeferimento do pedido de redução de 50% da multa e pela manutenção do Auto de Infração nº {{AUTO_NUMERO}}.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} em relação à multa aplicada pela falta de limpeza do lote situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

Embora as fotografias apresentadas indiquem que houve capina, elas também mostram [DESCREVER OS RESÍDUOS OU A IRREGULARIDADE REMANESCENTE]. Assim, não ficou comprovada a limpeza adequada do imóvel nem o atendimento integral da exigência objeto do auto de infração.

O art. 2º, inciso IV, da Lei Municipal nº 7.174/2010 condiciona a redução da penalidade à satisfação da exigência objeto da notificação ou do auto. Diante da regularização incompleta, opino pelo indeferimento do pedido de redução de 50% da multa e pela manutenção do Auto de Infração nº {{AUTO_NUMERO}}.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

-- ─────────────────────────── MURO ───────────────────────────
('muro_reducao_50',
 'Muro — deferimento da redução de 50% (construído após a autuação)',
 ARRAY['120000211'],
 'reducao_50',
 'Art. 2º, IV, da Lei Municipal nº 7.174/2010',
 20,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela ausência de muro no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A documentação apresentada demonstra que o muro foi construído após a autuação, atendendo à exigência objeto do auto de infração. Nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010, a regularização permite a redução da penalidade em até 50%.

Opino pelo deferimento da redução de 50% da multa aplicada no Auto de Infração nº {{AUTO_NUMERO}}. A construção posterior do muro justifica a redução, mas não afasta a infração constatada, permanecendo válido o auto.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela ausência de muro no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A documentação apresentada demonstra que o muro foi construído após a autuação, atendendo à exigência objeto do auto de infração. Nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010, a regularização permite a redução da penalidade em até 50%.

Opino pelo deferimento da redução de 50% da multa aplicada no Auto de Infração nº {{AUTO_NUMERO}}. A construção posterior do muro justifica a redução, mas não afasta a infração constatada, permanecendo válido o auto.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

('muro_indeferimento',
 'Muro — indeferimento',
 ARRAY['120000211'],
 'indeferimento',
 'Art. 2º, IV, da Lei Municipal nº 7.174/2010',
 21,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela ausência de muro no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A falta do muro foi constatada em {{DATA_CONSTATACAO}}, conforme [AUTO/RELATÓRIO/FOTOGRAFIAS]. A defesa alega [RESUMIR], mas [INDICAR POR QUE A ALEGAÇÃO NÃO AFASTA A INFRAÇÃO]. Também não foi comprovada a construção do muro, requisito para a redução da penalidade prevista no art. 2º, inciso IV, da Lei Municipal nº 7.174/2010.

Opino pelo indeferimento da defesa e do pedido de redução da multa, mantendo-se o Auto de Infração nº {{AUTO_NUMERO}} e a penalidade aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela ausência de muro no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A falta do muro foi constatada em {{DATA_CONSTATACAO}}, conforme [AUTO/RELATÓRIO/FOTOGRAFIAS]. A defesa alega [RESUMIR], mas [INDICAR POR QUE A ALEGAÇÃO NÃO AFASTA A INFRAÇÃO]. Também não foi comprovada a construção do muro, requisito para a redução da penalidade prevista no art. 2º, inciso IV, da Lei Municipal nº 7.174/2010.

Opino pelo indeferimento da defesa e do pedido de redução da multa, mantendo-se o Auto de Infração nº {{AUTO_NUMERO}} e a penalidade aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

-- ─────────────────────────── PASSEIO ───────────────────────────
('passeio_reducao_50',
 'Passeio — deferimento da redução de 50% (construído após a autuação)',
 ARRAY['120000226'],
 'reducao_50',
 'Art. 2º, IV, da Lei Municipal nº 7.174/2010',
 30,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela ausência de passeio no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A documentação juntada demonstra que o passeio foi construído após a autuação, em atendimento à exigência objeto do auto de infração, conforme [INDICAR A PROVA DA EXECUÇÃO E DA CONFORMIDADE DO PASSEIO]. O art. 2º, inciso IV, da Lei Municipal nº 7.174/2010 permite a redução da penalidade em até 50% quando satisfeita essa exigência.

Opino pelo deferimento da redução de 50% da multa aplicada no Auto de Infração nº {{AUTO_NUMERO}}. A construção posterior do passeio justifica a redução, mas não afasta a infração constatada, permanecendo válido o auto.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela ausência de passeio no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A documentação juntada demonstra que o passeio foi construído após a autuação, em atendimento à exigência objeto do auto de infração, conforme [INDICAR A PROVA DA EXECUÇÃO E DA CONFORMIDADE DO PASSEIO]. O art. 2º, inciso IV, da Lei Municipal nº 7.174/2010 permite a redução da penalidade em até 50% quando satisfeita essa exigência.

Opino pelo deferimento da redução de 50% da multa aplicada no Auto de Infração nº {{AUTO_NUMERO}}. A construção posterior do passeio justifica a redução, mas não afasta a infração constatada, permanecendo válido o auto.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

('passeio_indeferimento',
 'Passeio — indeferimento',
 ARRAY['120000226'],
 'indeferimento',
 'Art. 2º, IV, da Lei Municipal nº 7.174/2010',
 31,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela ausência de passeio no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A falta do passeio foi constatada em {{DATA_CONSTATACAO}}, conforme [AUTO/RELATÓRIO/FOTOGRAFIAS]. A defesa alega [RESUMIR], mas [INDICAR POR QUE A ALEGAÇÃO NÃO AFASTA A INFRAÇÃO]. Não há comprovação de que o passeio tenha sido construído em atendimento à exigência do auto, razão pela qual não se aplica a redução prevista no art. 2º, inciso IV, da Lei Municipal nº 7.174/2010.

Opino pelo indeferimento da defesa e do pedido de redução da multa, mantendo-se o Auto de Infração nº {{AUTO_NUMERO}} e a penalidade aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela ausência de passeio no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A falta do passeio foi constatada em {{DATA_CONSTATACAO}}, conforme [AUTO/RELATÓRIO/FOTOGRAFIAS]. A defesa alega [RESUMIR], mas [INDICAR POR QUE A ALEGAÇÃO NÃO AFASTA A INFRAÇÃO]. Não há comprovação de que o passeio tenha sido construído em atendimento à exigência do auto, razão pela qual não se aplica a redução prevista no art. 2º, inciso IV, da Lei Municipal nº 7.174/2010.

Opino pelo indeferimento da defesa e do pedido de redução da multa, mantendo-se o Auto de Infração nº {{AUTO_NUMERO}} e a penalidade aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

-- ─────────────────── RECONSTRUÇÃO DE MURO ───────────────────
('reconstrucao_muro_reducao_50',
 'Reconstrução de muro — deferimento da redução de 50%',
 ARRAY['120000229'],
 'reducao_50',
 'Art. 2º, IV, da Lei Municipal nº 7.174/2010',
 40,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela falta de reconstrução do muro do imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A documentação juntada demonstra que o muro foi reconstruído após a autuação, atendendo à exigência objeto do auto de infração, conforme [INDICAR A PROVA DA RECONSTRUÇÃO]. Nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010, a satisfação da exigência permite reduzir a penalidade em até 50%.

Opino pelo deferimento da redução de 50% da multa aplicada no Auto de Infração nº {{AUTO_NUMERO}}. A reconstrução posterior justifica a redução, mas não afasta a infração constatada, permanecendo válido o auto.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela falta de reconstrução do muro do imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A documentação juntada demonstra que o muro foi reconstruído após a autuação, atendendo à exigência objeto do auto de infração, conforme [INDICAR A PROVA DA RECONSTRUÇÃO]. Nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010, a satisfação da exigência permite reduzir a penalidade em até 50%.

Opino pelo deferimento da redução de 50% da multa aplicada no Auto de Infração nº {{AUTO_NUMERO}}. A reconstrução posterior justifica a redução, mas não afasta a infração constatada, permanecendo válido o auto.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

('reconstrucao_muro_indeferimento',
 'Reconstrução de muro — indeferimento',
 ARRAY['120000229'],
 'indeferimento',
 'Art. 2º, IV, da Lei Municipal nº 7.174/2010',
 41,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela falta de reconstrução do muro do imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A necessidade de reconstrução foi constatada em {{DATA_CONSTATACAO}}, conforme [AUTO/RELATÓRIO/FOTOGRAFIAS]. A defesa alega [RESUMIR], mas [INDICAR POR QUE A ALEGAÇÃO NÃO AFASTA A INFRAÇÃO]. A documentação apresentada não comprova a reconstrução do muro e, portanto, não demonstra o atendimento da exigência necessária à redução da multa, nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010.

Opino pelo indeferimento da defesa e do pedido de redução da multa, mantendo-se o Auto de Infração nº {{AUTO_NUMERO}} e a penalidade aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela falta de reconstrução do muro do imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A necessidade de reconstrução foi constatada em {{DATA_CONSTATACAO}}, conforme [AUTO/RELATÓRIO/FOTOGRAFIAS]. A defesa alega [RESUMIR], mas [INDICAR POR QUE A ALEGAÇÃO NÃO AFASTA A INFRAÇÃO]. A documentação apresentada não comprova a reconstrução do muro e, portanto, não demonstra o atendimento da exigência necessária à redução da multa, nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010.

Opino pelo indeferimento da defesa e do pedido de redução da multa, mantendo-se o Auto de Infração nº {{AUTO_NUMERO}} e a penalidade aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

-- ────────────────── RECONSTRUÇÃO DE PASSEIO ──────────────────
('reconstrucao_passeio_reducao_50',
 'Reconstrução de passeio — deferimento da redução de 50%',
 ARRAY['120000240'],
 'reducao_50',
 'Art. 2º, IV, da Lei Municipal nº 7.174/2010',
 50,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela falta de reconstrução do passeio do imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A documentação juntada demonstra que o passeio foi reconstruído após a autuação, atendendo à exigência objeto do auto de infração, conforme [INDICAR A PROVA DA RECONSTRUÇÃO E DA CONFORMIDADE DO PASSEIO]. Nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010, a satisfação da exigência permite reduzir a penalidade em até 50%.

Opino pelo deferimento da redução de 50% da multa aplicada no Auto de Infração nº {{AUTO_NUMERO}}. A reconstrução posterior justifica a redução, mas não afasta a infração constatada, permanecendo válido o auto.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela falta de reconstrução do passeio do imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A documentação juntada demonstra que o passeio foi reconstruído após a autuação, atendendo à exigência objeto do auto de infração, conforme [INDICAR A PROVA DA RECONSTRUÇÃO E DA CONFORMIDADE DO PASSEIO]. Nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010, a satisfação da exigência permite reduzir a penalidade em até 50%.

Opino pelo deferimento da redução de 50% da multa aplicada no Auto de Infração nº {{AUTO_NUMERO}}. A reconstrução posterior justifica a redução, mas não afasta a infração constatada, permanecendo válido o auto.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

('reconstrucao_passeio_indeferimento',
 'Reconstrução de passeio — indeferimento',
 ARRAY['120000240'],
 'indeferimento',
 'Art. 2º, IV, da Lei Municipal nº 7.174/2010',
 51,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela falta de reconstrução do passeio do imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A necessidade de reconstrução foi constatada em {{DATA_CONSTATACAO}}, conforme [AUTO/RELATÓRIO/FOTOGRAFIAS]. A defesa alega [RESUMIR], mas [INDICAR POR QUE A ALEGAÇÃO NÃO AFASTA A INFRAÇÃO]. A documentação apresentada não comprova a reconstrução adequada do passeio e, portanto, não demonstra o atendimento da exigência necessária à redução da multa, nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010.

Opino pelo indeferimento da defesa e do pedido de redução da multa, mantendo-se o Auto de Infração nº {{AUTO_NUMERO}} e a penalidade aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a multa aplicada pela falta de reconstrução do passeio do imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A necessidade de reconstrução foi constatada em {{DATA_CONSTATACAO}}, conforme [AUTO/RELATÓRIO/FOTOGRAFIAS]. A defesa alega [RESUMIR], mas [INDICAR POR QUE A ALEGAÇÃO NÃO AFASTA A INFRAÇÃO]. A documentação apresentada não comprova a reconstrução adequada do passeio e, portanto, não demonstra o atendimento da exigência necessária à redução da multa, nos termos do art. 2º, inciso IV, da Lei Municipal nº 7.174/2010.

Opino pelo indeferimento da defesa e do pedido de redução da multa, mantendo-se o Auto de Infração nº {{AUTO_NUMERO}} e a penalidade aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

-- ─────────────────────── REINCIDÊNCIA ───────────────────────
('reincidencia_indeferimento',
 'Reincidência comprovada — indeferimento (multa em dobro mantida)',
 ARRAY['120000227','120000228'],
 'indeferimento',
 'Art. 4º da Lei Municipal nº 7.174/2010',
 60,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a aplicação da multa em dobro, por reincidência, relativa à [CONSTRUÇÃO/RECONSTRUÇÃO] DE [MURO/PASSEIO] no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A irregularidade objeto do presente auto está demonstrada por [INDICAR A PROVA]. Consta também dos autos o Auto de Infração nº [NÚMERO/ANO], referente à infração anterior que fundamentou a reincidência, conforme [INDICAR OS DOCUMENTOS PERTINENTES]. A alegação de [RESUMIR A DEFESA] não afasta [EXPLICAR O MOTIVO CONCRETO].

Comprovada a reincidência, aplica-se a multa em dobro prevista no art. 4º da Lei Municipal nº 7.174/2010. Opino pelo indeferimento da defesa e pela manutenção do Auto de Infração nº {{AUTO_NUMERO}} e da multa aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a aplicação da multa em dobro, por reincidência, relativa à [CONSTRUÇÃO/RECONSTRUÇÃO] DE [MURO/PASSEIO] no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A irregularidade objeto do presente auto está demonstrada por [INDICAR A PROVA]. Consta também dos autos o Auto de Infração nº [NÚMERO/ANO], referente à infração anterior que fundamentou a reincidência, conforme [INDICAR OS DOCUMENTOS PERTINENTES]. A alegação de [RESUMIR A DEFESA] não afasta [EXPLICAR O MOTIVO CONCRETO].

Comprovada a reincidência, aplica-se a multa em dobro prevista no art. 4º da Lei Municipal nº 7.174/2010. Opino pelo indeferimento da defesa e pela manutenção do Auto de Infração nº {{AUTO_NUMERO}} e da multa aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

('reincidencia_nao_comprovada',
 'Reincidência não comprovada — deferimento parcial (afasta a multa em dobro)',
 ARRAY['120000227','120000228'],
 'deferimento_parcial',
 'Art. 4º da Lei Municipal nº 7.174/2010',
 61,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a aplicação da multa em dobro, por reincidência, relativa à [CONSTRUÇÃO/RECONSTRUÇÃO] DE [MURO/PASSEIO] no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A reincidência exige a identificação da infração anterior que fundamenta o agravamento. No caso, [INDICAR O PROBLEMA: não consta o auto anterior nos autos / o auto indicado se refere a outro imóvel ou responsável / não há comprovação suficiente da infração anterior]. Assim, não está demonstrado o pressuposto para a aplicação da multa em dobro.

Opino pelo deferimento parcial da defesa, exclusivamente para afastar a reincidência e recalcular a multa em seu valor simples. Mantém-se o Auto de Infração nº {{AUTO_NUMERO}} quanto à irregularidade nele constatada.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra a aplicação da multa em dobro, por reincidência, relativa à [CONSTRUÇÃO/RECONSTRUÇÃO] DE [MURO/PASSEIO] no imóvel situado à {{ENDERECO}}, inscrição imobiliária nº {{INSCRICAO}}.

A reincidência exige a identificação da infração anterior que fundamenta o agravamento. No caso, [INDICAR O PROBLEMA: não consta o auto anterior nos autos / o auto indicado se refere a outro imóvel ou responsável / não há comprovação suficiente da infração anterior]. Assim, não está demonstrado o pressuposto para a aplicação da multa em dobro.

Opino pelo deferimento parcial da defesa, exclusivamente para afastar a reincidência e recalcular a multa em seu valor simples. Mantém-se o Auto de Infração nº {{AUTO_NUMERO}} quanto à irregularidade nele constatada.

Encaminhe-se à autoridade competente para decisão e, em caso de acolhimento, para emissão de guia atualizada.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

-- ───────────────────────── QUEIMADA ─────────────────────────
('queimada_indeferimento',
 'Queimada — indeferimento',
 ARRAY[]::TEXT[],
 'indeferimento',
 NULL,
 70,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra o auto de infração lavrado em razão de queimada constatada em {{DATA_CONSTATACAO}}, no imóvel situado à {{ENDERECO}}.

A ocorrência está demonstrada por [INDICAR: relatório fiscal, fotografias, REDS ou outros documentos], que registram a queima de [DESCREVER A VEGETAÇÃO OU O MATERIAL ATINGIDO]. [SE HOUVER ATINGIMENTO COMPROVADO DE ÁRVORES: Os documentos também registram o atingimento de [DESCREVER AS ÁRVORES E OS DANOS CONSTATADOS], conforme descrito no auto de infração.]

A defesa alega [RESUMIR A ALEGAÇÃO]. Contudo, [EXPLICAR POR QUE A ALEGAÇÃO NÃO AFASTA A RESPONSABILIDADE OU A CONSTATAÇÃO DA INFRAÇÃO]. Desse modo, permanecem demonstrados os fatos que fundamentaram a autuação, observado o enquadramento legal indicado no auto.

Opino pelo indeferimento da defesa e pela manutenção do Auto de Infração nº {{AUTO_NUMERO}} e da multa aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra o auto de infração lavrado em razão de queimada constatada em {{DATA_CONSTATACAO}}, no imóvel situado à {{ENDERECO}}.

A ocorrência está demonstrada por [INDICAR: relatório fiscal, fotografias, REDS ou outros documentos], que registram a queima de [DESCREVER A VEGETAÇÃO OU O MATERIAL ATINGIDO]. [SE HOUVER ATINGIMENTO COMPROVADO DE ÁRVORES: Os documentos também registram o atingimento de [DESCREVER AS ÁRVORES E OS DANOS CONSTATADOS], conforme descrito no auto de infração.]

A defesa alega [RESUMIR A ALEGAÇÃO]. Contudo, [EXPLICAR POR QUE A ALEGAÇÃO NÃO AFASTA A RESPONSABILIDADE OU A CONSTATAÇÃO DA INFRAÇÃO]. Desse modo, permanecem demonstrados os fatos que fundamentaram a autuação, observado o enquadramento legal indicado no auto.

Opino pelo indeferimento da defesa e pela manutenção do Auto de Infração nº {{AUTO_NUMERO}} e da multa aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

-- ─────────────────────── ÁGUA SERVIDA ───────────────────────
('agua_servida_deferimento',
 'Água servida — deferimento (cancelamento do auto)',
 ARRAY['120000239'],
 'deferimento',
 'Art. 6º, IV, da Lei Municipal nº 6.907/2008',
 80,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra autuação por escoamento de água proveniente do imóvel situado à {{ENDERECO}} em direção à rua.

A defesa demonstra, por meio de [INDICAR A PROVA], que [EXPLICAR POR QUE O ESCOAMENTO NÃO OCORREU OU NÃO PODE SER ATRIBUÍDO AO AUTUADO]. Assim, não ficou comprovada a conduta descrita no art. 6º, inciso IV, da Lei Municipal nº 6.907/2008.

Opino pelo deferimento da defesa e pelo cancelamento do Auto de Infração nº {{AUTO_NUMERO}} e da respectiva multa.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra autuação por escoamento de água proveniente do imóvel situado à {{ENDERECO}} em direção à rua.

A defesa demonstra, por meio de [INDICAR A PROVA], que [EXPLICAR POR QUE O ESCOAMENTO NÃO OCORREU OU NÃO PODE SER ATRIBUÍDO AO AUTUADO]. Assim, não ficou comprovada a conduta descrita no art. 6º, inciso IV, da Lei Municipal nº 6.907/2008.

Opino pelo deferimento da defesa e pelo cancelamento do Auto de Infração nº {{AUTO_NUMERO}} e da respectiva multa.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

('agua_servida_indeferimento',
 'Água servida — indeferimento',
 ARRAY['120000239'],
 'indeferimento',
 'Art. 6º, IV, da Lei Municipal nº 6.907/2008',
 81,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra autuação por escoamento de água proveniente do imóvel situado à {{ENDERECO}} em direção à rua.

O escoamento foi constatado em {{DATA_CONSTATACAO}}, conforme [INDICAR A PROVA]. A defesa alega [RESUMIR]; contudo, [EXPLICAR POR QUE A ALEGAÇÃO NÃO AFASTA A CONSTATAÇÃO OU A RESPONSABILIDADE]. Permanece demonstrada a infração ao art. 6º, inciso IV, da Lei Municipal nº 6.907/2008.

Opino pelo indeferimento da defesa e pela manutenção do Auto de Infração nº {{AUTO_NUMERO}} e da multa aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra autuação por escoamento de água proveniente do imóvel situado à {{ENDERECO}} em direção à rua.

O escoamento foi constatado em {{DATA_CONSTATACAO}}, conforme [INDICAR A PROVA]. A defesa alega [RESUMIR]; contudo, [EXPLICAR POR QUE A ALEGAÇÃO NÃO AFASTA A CONSTATAÇÃO OU A RESPONSABILIDADE]. Permanece demonstrada a infração ao art. 6º, inciso IV, da Lei Municipal nº 6.907/2008.

Opino pelo indeferimento da defesa e pela manutenção do Auto de Infração nº {{AUTO_NUMERO}} e da multa aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

-- ─────────────────── OBSTÁCULO NO PASSEIO ───────────────────
('obstaculo_passeio_deferimento',
 'Obstáculo no passeio — deferimento (cancelamento do auto)',
 ARRAY['120000237','120000235'],
 'deferimento',
 'Art. 6º, XIV, e/ou art. 75 da Lei Municipal nº 6.907/2008',
 90,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra autuação pela presença de [DESCREVER O OBJETO] no passeio situado à {{ENDERECO}}.

Conforme [INDICAR A PROVA], [EXPLICAR POR QUE NÃO FICOU COMPROVADA A OBSTRUÇÃO DA FAIXA LIVRE OU O EMBARAÇO AO TRÂNSITO DE PEDESTRES, OU POR QUE O FATO NÃO PODE SER ATRIBUÍDO AO AUTUADO]. Desse modo, não ficou demonstrada a infração descrita no auto, à luz do art. 6º, inciso XIV, e/ou do art. 75 da Lei Municipal nº 6.907/2008, conforme o enquadramento adotado na autuação.

Opino pelo deferimento da defesa e pelo cancelamento do Auto de Infração nº {{AUTO_NUMERO}} e da respectiva multa.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra autuação pela presença de [DESCREVER O OBJETO] no passeio situado à {{ENDERECO}}.

Conforme [INDICAR A PROVA], [EXPLICAR POR QUE NÃO FICOU COMPROVADA A OBSTRUÇÃO DA FAIXA LIVRE OU O EMBARAÇO AO TRÂNSITO DE PEDESTRES, OU POR QUE O FATO NÃO PODE SER ATRIBUÍDO AO AUTUADO]. Desse modo, não ficou demonstrada a infração descrita no auto, à luz do art. 6º, inciso XIV, e/ou do art. 75 da Lei Municipal nº 6.907/2008, conforme o enquadramento adotado na autuação.

Opino pelo deferimento da defesa e pelo cancelamento do Auto de Infração nº {{AUTO_NUMERO}} e da respectiva multa.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

('obstaculo_passeio_indeferimento',
 'Obstáculo no passeio — indeferimento',
 ARRAY['120000237','120000235'],
 'indeferimento',
 'Art. 6º, XIV, e/ou art. 75 da Lei Municipal nº 6.907/2008',
 91,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra autuação pela presença de [DESCREVER O OBJETO] no passeio situado à {{ENDERECO}}.

Conforme [INDICAR A PROVA], em {{DATA_CONSTATACAO}} o objeto [DESCREVER SUA LOCALIZAÇÃO NA FAIXA LIVRE E/OU COMO PREJUDICAVA A CIRCULAÇÃO]. A defesa alega [RESUMIR]; contudo, [EXPLICAR POR QUE A ALEGAÇÃO NÃO AFASTA A CONSTATAÇÃO OU A RESPONSABILIDADE]. Permanece demonstrada a infração ao [ART. 6º, XIV, E/OU ART. 75] da Lei Municipal nº 6.907/2008, conforme o fato e o enquadramento descritos no auto.

Opino pelo indeferimento da defesa e pela manutenção do Auto de Infração nº {{AUTO_NUMERO}} e da multa aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$PARECER JURÍDICO – AUTO DE INFRAÇÃO Nº {{AUTO_NUMERO}}

Trata-se de defesa apresentada por {{DEFENDENTE}} contra autuação pela presença de [DESCREVER O OBJETO] no passeio situado à {{ENDERECO}}.

Conforme [INDICAR A PROVA], em {{DATA_CONSTATACAO}} o objeto [DESCREVER SUA LOCALIZAÇÃO NA FAIXA LIVRE E/OU COMO PREJUDICAVA A CIRCULAÇÃO]. A defesa alega [RESUMIR]; contudo, [EXPLICAR POR QUE A ALEGAÇÃO NÃO AFASTA A CONSTATAÇÃO OU A RESPONSABILIDADE]. Permanece demonstrada a infração ao [ART. 6º, XIV, E/OU ART. 75] da Lei Municipal nº 6.907/2008, conforme o fato e o enquadramento descritos no auto.

Opino pelo indeferimento da defesa e pela manutenção do Auto de Infração nº {{AUTO_NUMERO}} e da multa aplicada.

Encaminhe-se à autoridade competente para decisão.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$),

-- ──────────────── COMPLEMENTAÇÃO DOCUMENTAL ────────────────
('complementacao_documental',
 'Complementação documental — diligência (serve a qualquer infração)',
 ARRAY[]::TEXT[],
 'diligencia',
 NULL,
 100,
 $tpl$MANIFESTAÇÃO – COMPLEMENTAÇÃO DOCUMENTAL

Para a análise da manifestação referente ao Auto de Infração nº {{AUTO_NUMERO}}, é necessária a complementação dos documentos apresentados.

Solicita-se ao requerente a juntada de [INDICAR OS DOCUMENTOS FALTANTES: fotografias do imóvel, documento de identificação, procuração, comprovação da condição de proprietário ou responsável, entre outros pertinentes ao caso]. Os documentos devem permitir a identificação do imóvel e a verificação dos fatos alegados.

[Se não houver documentos anexados: Até o momento, não foram apresentados documentos que permitam verificar as alegações formuladas no pedido.]

Após a juntada, retornem os autos para análise e emissão de parecer jurídico.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$,
 $tpl$MANIFESTAÇÃO – COMPLEMENTAÇÃO DOCUMENTAL

Para a análise da manifestação referente ao Auto de Infração nº {{AUTO_NUMERO}}, é necessária a complementação dos documentos apresentados.

Solicita-se ao requerente a juntada de [INDICAR OS DOCUMENTOS FALTANTES: fotografias do imóvel, documento de identificação, procuração, comprovação da condição de proprietário ou responsável, entre outros pertinentes ao caso]. Os documentos devem permitir a identificação do imóvel e a verificação dos fatos alegados.

[Se não houver documentos anexados: Até o momento, não foram apresentados documentos que permitam verificar as alegações formuladas no pedido.]

Após a juntada, retornem os autos para análise e emissão de parecer jurídico.

Divinópolis/MG, {{DATA_HOJE}}.

{{ASSINANTE_NOME}}
{{ASSINANTE_OAB}}$tpl$)

ON CONFLICT (chave) DO UPDATE SET
    titulo           = EXCLUDED.titulo,
    codigos_infracao = EXCLUDED.codigos_infracao,
    decisao          = EXCLUDED.decisao,
    base_legal       = EXCLUDED.base_legal,
    ordem            = EXCLUDED.ordem,
    texto_original   = EXCLUDED.texto_original;  -- 'texto' preservado: é o que o jurídico editou

-- ============================================================
-- Assinatura padrão do parecer (editável pelo jurídico)
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracoes_parecer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assinante_nome VARCHAR(160) NOT NULL,
    assinante_oab VARCHAR(40),
    assinante_cargo VARCHAR(120),
    atualizado_por UUID REFERENCES profiles(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE configuracoes_parecer DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE configuracoes_parecer TO anon, authenticated, service_role;

INSERT INTO configuracoes_parecer (assinante_nome, assinante_oab, assinante_cargo)
SELECT 'Fernanda Clainer Drumond Grossi', 'OAB/MG 164.427', 'Interface Jurídica'
WHERE NOT EXISTS (SELECT 1 FROM configuracoes_parecer);
