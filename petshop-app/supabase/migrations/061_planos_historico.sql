-- ============================================================
-- PETSHOP SaaS - Migration 061: ajustes do histórico dos planos
-- ============================================================
-- Achados no teste da 060:
-- • Eventos da mesma operação (assinar + gerar períodos) ficavam com a
--   mesma hora (NOW() é o início da transação) e apareciam fora de ordem:
--   agora cada evento usa o relógio de verdade (clock_timestamp()).
-- • Primeiro período: "benefícios liberados" (não "renovados").
-- • Status da cobrança com inicial maiúscula ("Pendente → Pago") e
--   plano "criado"/"alterado" no texto.
-- As funções abaixo são as da 060 com só essas mudanças.
-- ============================================================

ALTER TABLE assinatura_historico ALTER COLUMN created_at SET DEFAULT clock_timestamp();

-- fn_plano_registrar e o gerador gravam created_at pelo default acima.

CREATE OR REPLACE FUNCTION fn_gerar_periodos_assinatura(p_id_assinatura UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a       assinatura%ROWTYPE;
  v_ultimo  assinatura_periodo%ROWTYPE;
  v_n       INTEGER;
  v_ini     DATE;
  v_fim     DATE;
  v_id      UUID;
  v_criados INTEGER := 0;
BEGIN
  SELECT * INTO v_a FROM assinatura WHERE id_assinatura = p_id_assinatura FOR UPDATE;
  IF NOT FOUND OR v_a.status <> 'ativa' THEN
    RETURN 0;
  END IF;

  LOOP
    SELECT * INTO v_ultimo FROM assinatura_periodo WHERE id_assinatura = p_id_assinatura ORDER BY numero DESC LIMIT 1;
    IF FOUND THEN
      EXIT WHEN v_ultimo.fim >= CURRENT_DATE;
      v_n := v_ultimo.numero;
    ELSE
      v_n := 0;
    END IF;
    EXIT WHEN v_criados >= 240;

    v_ini := fn_plano_inicio_periodo(v_a.data_inicio, v_a.periodicidade, v_a.intervalo_dias, v_n);
    v_fim := fn_plano_inicio_periodo(v_a.data_inicio, v_a.periodicidade, v_a.intervalo_dias, v_n + 1) - 1;

    INSERT INTO assinatura_periodo (id_lojista, id_assinatura, numero, inicio, fim)
    VALUES (v_a.id_lojista, v_a.id_assinatura, v_n + 1, v_ini, v_fim)
    RETURNING id_periodo INTO v_id;

    INSERT INTO assinatura_periodo_servico (id_periodo, id_servico, quantidade)
    SELECT v_id, ps.id_servico, ps.quantidade FROM plano_servico ps WHERE ps.id_plano = v_a.id_plano;

    INSERT INTO assinatura_cobranca (id_lojista, id_assinatura, id_periodo, valor, vencimento, forma_pagamento, status)
    VALUES (v_a.id_lojista, v_a.id_assinatura, v_id, v_a.valor, v_ini, v_a.forma_pagamento, 'pendente');

    INSERT INTO assinatura_historico (id_lojista, id_plano, id_assinatura, tipo, descricao, id_usuario)
    VALUES (
      v_a.id_lojista, v_a.id_plano, v_a.id_assinatura,
      CASE WHEN v_n = 0 THEN 'periodo_iniciado' ELSE 'renovada' END,
      format('Período %s (%s a %s) — benefícios %s e cobrança de R$ %s gerada, vencimento %s',
             v_n + 1, to_char(v_ini, 'DD/MM/YYYY'), to_char(v_fim, 'DD/MM/YYYY'),
             CASE WHEN v_n = 0 THEN 'liberados' ELSE 'renovados' END,
             fn_fmt_valor(v_a.valor), to_char(v_ini, 'DD/MM/YYYY')),
      auth.uid()
    );
    v_criados := v_criados + 1;
  END LOOP;
  RETURN v_criados;
END;
$$;

CREATE OR REPLACE FUNCTION fn_atualizar_cobranca_plano(p_id_cobranca UUID, p_forma TEXT, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c assinatura_cobranca%ROWTYPE;
  v_a assinatura%ROWTYPE;
  v_forma TEXT;
BEGIN
  SELECT * INTO v_c FROM assinatura_cobranca WHERE id_cobranca = p_id_cobranca FOR UPDATE;
  IF NOT FOUND OR NOT fn_gestor_da_loja(v_c.id_lojista) THEN
    RAISE EXCEPTION 'Cobrança não encontrada';
  END IF;
  IF p_status NOT IN ('pendente', 'pago', 'cancelado') THEN
    RAISE EXCEPTION 'Status de pagamento inválido';
  END IF;
  v_forma := COALESCE(p_forma, v_c.forma_pagamento);
  IF v_forma IS DISTINCT FROM v_c.forma_pagamento AND NOT fn_forma_pagamento_aceita(v_c.id_lojista, v_forma) THEN
    RAISE EXCEPTION 'Esta loja não aceita essa forma de pagamento';
  END IF;
  IF p_status = 'pago' AND v_forma IS NULL THEN
    RAISE EXCEPTION 'Informe a forma de pagamento para registrar o pagamento';
  END IF;

  UPDATE assinatura_cobranca SET
    forma_pagamento = v_forma,
    status = p_status,
    pago_em = CASE WHEN p_status = 'pago' THEN COALESCE(pago_em, NOW()) ELSE NULL END
  WHERE id_cobranca = p_id_cobranca;

  SELECT * INTO v_a FROM assinatura WHERE id_assinatura = v_c.id_assinatura;
  PERFORM fn_plano_registrar(v_c.id_lojista, v_a.id_plano, v_c.id_assinatura,
    CASE WHEN p_status = 'pago' AND v_c.status <> 'pago' THEN 'pagamento_registrado' ELSE 'cobranca_alterada' END,
    format('Cobrança de R$ %s (vencimento %s): %s → %s, forma %s',
           fn_fmt_valor(v_c.valor), to_char(v_c.vencimento, 'DD/MM/YYYY'),
           initcap(v_c.status), initcap(p_status), fn_rotulo_forma_pagamento(v_forma)));
END;
$$;

CREATE OR REPLACE FUNCTION fn_salvar_plano(
  p_id_plano        UUID,
  p_nome            TEXT,
  p_descricao       TEXT,
  p_valor           NUMERIC,
  p_periodicidade   TEXT,
  p_intervalo_dias  INTEGER,
  p_servicos        JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja   UUID := auth_lojista_id();
  v_id     UUID := p_id_plano;
  v_item   JSONB;
  v_qtd    INTEGER;
  v_ids    UUID[] := '{}';
  v_resumo TEXT;
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode gerenciar planos';
  END IF;
  IF char_length(btrim(COALESCE(p_nome, ''))) < 2 THEN
    RAISE EXCEPTION 'Dê um nome ao plano';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'Informe o valor do plano';
  END IF;
  IF p_periodicidade NOT IN ('mensal', 'quinzenal', 'trimestral', 'semestral', 'anual', 'personalizado') THEN
    RAISE EXCEPTION 'Período de cobrança inválido';
  END IF;
  IF p_periodicidade = 'personalizado' AND (p_intervalo_dias IS NULL OR p_intervalo_dias NOT BETWEEN 1 AND 730) THEN
    RAISE EXCEPTION 'No período personalizado, informe a cada quantos dias (1 a 730)';
  END IF;
  IF p_servicos IS NULL OR jsonb_typeof(p_servicos) <> 'array' OR jsonb_array_length(p_servicos) = 0 THEN
    RAISE EXCEPTION 'Inclua pelo menos um serviço no plano';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_servicos) LOOP
    v_qtd := (v_item ->> 'quantidade')::INTEGER;
    IF v_qtd IS NULL OR v_qtd NOT BETWEEN 1 AND 999 THEN
      RAISE EXCEPTION 'A quantidade de cada serviço deve ser de 1 a 999';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM servico WHERE id_servico = (v_item ->> 'id_servico')::UUID AND id_lojista = v_loja) THEN
      RAISE EXCEPTION 'Serviço não encontrado nesta loja';
    END IF;
    IF (v_item ->> 'id_servico')::UUID = ANY (v_ids) THEN
      RAISE EXCEPTION 'O mesmo serviço foi incluído duas vezes';
    END IF;
    v_ids := v_ids || (v_item ->> 'id_servico')::UUID;
  END LOOP;

  IF v_id IS NULL THEN
    INSERT INTO plano (id_lojista, nome, descricao, valor, periodicidade, intervalo_dias)
    VALUES (v_loja, btrim(p_nome), NULLIF(btrim(COALESCE(p_descricao, '')), ''), p_valor, p_periodicidade,
            CASE WHEN p_periodicidade = 'personalizado' THEN p_intervalo_dias END)
    RETURNING id_plano INTO v_id;
  ELSE
    UPDATE plano SET
      nome = btrim(p_nome),
      descricao = NULLIF(btrim(COALESCE(p_descricao, '')), ''),
      valor = p_valor,
      periodicidade = p_periodicidade,
      intervalo_dias = CASE WHEN p_periodicidade = 'personalizado' THEN p_intervalo_dias END
    WHERE id_plano = v_id AND id_lojista = v_loja;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plano não encontrado';
    END IF;
    DELETE FROM plano_servico WHERE id_plano = v_id;
  END IF;

  INSERT INTO plano_servico (id_plano, id_servico, quantidade)
  SELECT v_id, (e.item ->> 'id_servico')::UUID, (e.item ->> 'quantidade')::INTEGER
  FROM jsonb_array_elements(p_servicos) AS e(item);

  SELECT string_agg(s.nome || ' ×' || ps.quantidade, ', ' ORDER BY s.nome) INTO v_resumo
  FROM plano_servico ps JOIN servico s ON s.id_servico = ps.id_servico WHERE ps.id_plano = v_id;

  PERFORM fn_plano_registrar(v_loja, v_id, NULL,
    CASE WHEN p_id_plano IS NULL THEN 'plano_criado' ELSE 'plano_alterado' END,
    format('Plano %s "%s": R$ %s, %s — %s', CASE WHEN p_id_plano IS NULL THEN 'criado' ELSE 'alterado' END, btrim(p_nome), fn_fmt_valor(p_valor),
           CASE WHEN p_periodicidade = 'personalizado' THEN 'a cada ' || p_intervalo_dias || ' dias' ELSE p_periodicidade END,
           v_resumo));
  RETURN v_id;
END;
$$;
