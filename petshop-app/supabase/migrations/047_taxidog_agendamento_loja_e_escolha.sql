-- ============================================================
-- PETSHOP SaaS - Migration 047: TaxiDog no agendamento da loja e
--                               escolha de quem faz a corrida
-- ============================================================
-- 1) A loja (dono, administrador ou funcionário com agenda) passa a poder
--    marcar TaxiDog no agendamento que ela mesma cria (balcão/telefone).
--    A cotação nesse caso ignora "disponível no agendamento online" — a
--    loja oferece o TaxiDog mesmo que o cliente não possa pedir sozinho;
--    basta o TaxiDog estar ativado.
--
-- 2) Quem agenda pode escolher QUAL TaxiDog faz a corrida (opcional,
--    "sem preferência" = ninguém, como antes): o cliente no link/conta
--    dele e a loja no agendamento interno. A corrida já nasce atribuída.
--    fn_taxidogs_publicos lista os TaxiDogs (só nome) pra essas telas.
--
-- Assinaturas mudam (parâmetros novos com DEFAULT): as antigas são
-- removidas antes, pra não sobrar duas versões sobrecarregadas.
-- ============================================================

DROP FUNCTION IF EXISTS fn_criar_agendamento_com_taxidog(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS fn_criar_agendamento_multiplo_com_taxidog(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS fn_anexar_taxidog(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS fn_cotar_taxidog(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION);

-- ============================================================
-- Cotação: igual à 042 + p_interno (agendamento feito pela loja)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_cotar_taxidog(
  p_id_lojista UUID,
  p_modalidade TEXT,
  p_bairro     TEXT,
  p_cidade     TEXT,
  p_uf         TEXT,
  p_lat        DOUBLE PRECISION DEFAULT NULL,
  p_lng        DOUBLE PRECISION DEFAULT NULL,
  p_interno    BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (disponivel BOOLEAN, valor NUMERIC, distancia_km NUMERIC, criterio TEXT, motivo TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_cfg          taxidog_config%ROWTYPE;
  v_regiao       taxidog_regiao%ROWTYPE;
  v_faixa        taxidog_faixa%ROWTYPE;
  v_dist         NUMERIC;
  v_trecho       NUMERIC(10,2);
  v_ida_volta    NUMERIC(10,2);
  v_valor        NUMERIC(10,2);
  v_criterio     TEXT;
  v_achou_regiao BOOLEAN := FALSE;
  -- "Interno" só vale pra quem é da própria loja; pra qualquer outro
  -- (inclusive anônimo) continua exigindo o TaxiDog liberado online.
  v_interno      BOOLEAN := COALESCE(p_interno, FALSE) AND auth_lojista_id() IS NOT DISTINCT FROM p_id_lojista;
BEGIN
  IF p_modalidade IS NULL OR p_modalidade NOT IN ('buscar', 'entregar', 'buscar_entregar') THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT, 'Tipo de transporte inválido.'::TEXT;
    RETURN;
  END IF;

  SELECT c.* INTO v_cfg
  FROM taxidog_config c
  JOIN lojista l ON l.id_lojista = c.id_lojista
  WHERE c.id_lojista = p_id_lojista
    AND c.ativo AND l.ativo
    AND (v_interno OR (c.disponivel_online AND l.aceita_agendamento_online));

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT, 'O TaxiDog não está disponível nesta loja no momento.'::TEXT;
    RETURN;
  END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL AND v_cfg.origem_lat IS NOT NULL AND v_cfg.origem_lng IS NOT NULL THEN
    v_dist := fn_distancia_km(v_cfg.origem_lat, v_cfg.origem_lng, p_lat, p_lng);
  END IF;

  IF v_cfg.modo_cobranca = 'fixo' THEN
    v_valor := CASE p_modalidade
      WHEN 'buscar' THEN v_cfg.valor_buscar
      WHEN 'entregar' THEN v_cfg.valor_entregar
      ELSE v_cfg.valor_buscar_entregar
    END;
    v_criterio := 'Valor fixo da loja';
  END IF;

  IF v_cfg.modo_cobranca IN ('regiao', 'personalizado') THEN
    SELECT r.* INTO v_regiao
    FROM taxidog_regiao r
    WHERE r.id_lojista = p_id_lojista
      AND r.ativo
      AND fn_normalizar_texto(r.cidade) = fn_normalizar_texto(p_cidade)
      AND (r.uf IS NULL OR upper(r.uf) = upper(btrim(COALESCE(p_uf, ''))))
      AND (r.bairro IS NULL OR fn_normalizar_texto(r.bairro) = fn_normalizar_texto(p_bairro))
    ORDER BY (r.bairro IS NOT NULL) DESC
    LIMIT 1;

    IF FOUND THEN
      v_achou_regiao := TRUE;
      v_trecho := v_regiao.valor_trecho;
      v_ida_volta := v_regiao.valor_ida_volta;
      v_criterio := 'Região ' || CASE
        WHEN v_regiao.bairro IS NOT NULL THEN v_regiao.bairro || ' — ' || v_regiao.cidade
        ELSE v_regiao.cidade
      END;
    ELSIF v_cfg.modo_cobranca = 'regiao' THEN
      RETURN QUERY SELECT FALSE, NULL::NUMERIC, v_dist, NULL::TEXT,
        'A loja ainda não atende o seu bairro com o TaxiDog.'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_cfg.modo_cobranca = 'distancia' OR (v_cfg.modo_cobranca = 'personalizado' AND NOT v_achou_regiao) THEN
    IF v_dist IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT,
        'Não conseguimos calcular a distância até este endereço. Confira o endereço ou fale com a loja.'::TEXT;
      RETURN;
    END IF;

    IF v_cfg.distancia_max_km IS NOT NULL AND v_dist > v_cfg.distancia_max_km THEN
      RETURN QUERY SELECT FALSE, NULL::NUMERIC, v_dist, NULL::TEXT,
        format('Este endereço fica fora da área atendida pelo TaxiDog (até %s km da loja).', fn_formatar_km(v_cfg.distancia_max_km))::TEXT;
      RETURN;
    END IF;

    SELECT f.* INTO v_faixa
    FROM taxidog_faixa f
    WHERE f.id_lojista = p_id_lojista AND v_dist <= f.km_ate
    ORDER BY f.km_ate
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, NULL::NUMERIC, v_dist, NULL::TEXT,
        'Este endereço fica fora da área atendida pelo TaxiDog.'::TEXT;
      RETURN;
    END IF;

    v_trecho := v_faixa.valor_trecho;
    v_ida_volta := v_faixa.valor_ida_volta;
    v_criterio := format('Distância até %s km', fn_formatar_km(v_faixa.km_ate));
  END IF;

  IF v_valor IS NULL THEN
    v_valor := CASE
      WHEN p_modalidade = 'buscar_entregar' THEN COALESCE(v_ida_volta, v_trecho * 2)
      ELSE v_trecho
    END;
  END IF;

  IF v_cfg.valor_minimo IS NOT NULL AND v_valor < v_cfg.valor_minimo THEN
    v_valor := v_cfg.valor_minimo;
    v_criterio := v_criterio || ' (valor mínimo da loja)';
  END IF;

  RETURN QUERY SELECT TRUE, v_valor::NUMERIC, v_dist, v_criterio, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION fn_cotar_taxidog(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cotar_taxidog(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) TO anon, authenticated;

-- ============================================================
-- Prende a corrida ao agendamento: igual à 042 + TaxiDog escolhido
-- (p_id_funcionario) + p_interno (repassado à cotação)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_anexar_taxidog(
  p_id_agendamento UUID,
  p_modalidade     TEXT,
  p_cep            TEXT,
  p_logradouro     TEXT,
  p_numero         TEXT,
  p_complemento    TEXT,
  p_bairro         TEXT,
  p_cidade         TEXT,
  p_uf             TEXT,
  p_lat            DOUBLE PRECISION,
  p_lng            DOUBLE PRECISION,
  p_id_funcionario UUID DEFAULT NULL,
  p_interno        BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag         agendamento%ROWTYPE;
  v_cep        TEXT := regexp_replace(COALESCE(p_cep, ''), '\D', '', 'g');
  v_uf         TEXT := upper(btrim(COALESCE(p_uf, '')));
  v_disponivel BOOLEAN;
  v_valor      NUMERIC;
  v_dist       NUMERIC;
  v_criterio   TEXT;
  v_motivo     TEXT;
  v_nome_tx    TEXT;
  v_id         UUID;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TaxiDog: agendamento não encontrado.';
  END IF;

  IF v_cep !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'TaxiDog: informe um CEP válido.';
  END IF;
  IF char_length(btrim(COALESCE(p_logradouro, ''))) < 2 OR char_length(btrim(COALESCE(p_numero, ''))) < 1
     OR char_length(btrim(COALESCE(p_bairro, ''))) < 2 OR char_length(btrim(COALESCE(p_cidade, ''))) < 2 THEN
    RAISE EXCEPTION 'TaxiDog: preencha rua, número, bairro e cidade.';
  END IF;
  IF v_uf !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'TaxiDog: informe o estado (UF) com 2 letras.';
  END IF;

  IF p_id_funcionario IS NOT NULL THEN
    SELECT nome INTO v_nome_tx FROM funcionario
    WHERE id_funcionario = p_id_funcionario AND id_lojista = v_ag.id_lojista AND ativo = TRUE AND pode_taxidog = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TaxiDog: o TaxiDog escolhido não está disponível. Escolha outro ou deixe sem preferência.';
    END IF;
  END IF;

  SELECT q.disponivel, q.valor, q.distancia_km, q.criterio, q.motivo
  INTO v_disponivel, v_valor, v_dist, v_criterio, v_motivo
  FROM fn_cotar_taxidog(v_ag.id_lojista, p_modalidade, p_bairro, p_cidade, v_uf, p_lat, p_lng, p_interno) q;

  IF NOT COALESCE(v_disponivel, FALSE) THEN
    RAISE EXCEPTION 'TaxiDog: %', COALESCE(v_motivo, 'não disponível para este endereço.');
  END IF;

  INSERT INTO taxidog_corrida (
    id_agendamento, id_lojista, id_cliente, id_pet, modalidade, id_funcionario,
    cep, logradouro, numero, complemento, bairro, cidade, uf,
    lat, lng, distancia_km, valor, criterio
  ) VALUES (
    v_ag.id_agendamento, v_ag.id_lojista, v_ag.id_cliente, v_ag.id_pet, p_modalidade, p_id_funcionario,
    v_cep, btrim(p_logradouro), btrim(p_numero), NULLIF(btrim(COALESCE(p_complemento, '')), ''),
    btrim(p_bairro), btrim(p_cidade), v_uf,
    p_lat, p_lng, v_dist, v_valor, v_criterio
  )
  RETURNING id_corrida INTO v_id;

  UPDATE agendamento SET valor = valor + v_valor WHERE id_agendamento = v_ag.id_agendamento;

  PERFORM fn_registrar_evento_corrida(
    v_id, 'agendada',
    format('TaxiDog solicitado%s: %s — R$ %s',
      CASE WHEN p_interno THEN ' pela loja' ELSE '' END,
      fn_rotulo_modalidade_taxidog(p_modalidade),
      replace(to_char(v_valor, 'FM999990.00'), '.', ','))
  );

  IF p_id_funcionario IS NOT NULL THEN
    PERFORM fn_registrar_evento_corrida(
      v_id, 'agendada',
      CASE WHEN p_interno THEN 'Corrida atribuída a ' ELSE 'Cliente escolheu o TaxiDog ' END || v_nome_tx
    );
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_anexar_taxidog(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID, BOOLEAN) FROM PUBLIC;

-- ============================================================
-- Agendamento do cliente COM TaxiDog: + p_tx_id_funcionario
-- ============================================================
CREATE OR REPLACE FUNCTION fn_criar_agendamento_com_taxidog(
  p_id_pet             UUID,
  p_id_servico         UUID,
  p_id_cliente         UUID,
  p_id_lojista         UUID,
  p_data               DATE,
  p_hora               TIME,
  p_obs                TEXT,
  p_produtos           UUID[],
  p_quantidades        NUMERIC[],
  p_tx_modalidade      TEXT,
  p_tx_cep             TEXT,
  p_tx_logradouro      TEXT,
  p_tx_numero          TEXT,
  p_tx_complemento     TEXT,
  p_tx_bairro          TEXT,
  p_tx_cidade          TEXT,
  p_tx_uf              TEXT,
  p_tx_lat             DOUBLE PRECISION,
  p_tx_lng             DOUBLE PRECISION,
  p_tx_id_funcionario  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  v_id := fn_criar_agendamento(p_id_pet, p_id_servico, p_id_cliente, p_id_lojista, p_data, p_hora, p_obs, p_produtos, p_quantidades);
  PERFORM fn_anexar_taxidog(v_id, p_tx_modalidade, p_tx_cep, p_tx_logradouro, p_tx_numero, p_tx_complemento, p_tx_bairro, p_tx_cidade, p_tx_uf, p_tx_lat, p_tx_lng, p_tx_id_funcionario, FALSE);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_agendamento_com_taxidog(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_com_taxidog(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION fn_criar_agendamento_multiplo_com_taxidog(
  p_id_pet             UUID,
  p_id_cliente         UUID,
  p_id_lojista         UUID,
  p_data               DATE,
  p_hora_inicio        TIME,
  p_servicos           UUID[],
  p_id_funcionario     UUID,
  p_obs                TEXT,
  p_produtos           UUID[],
  p_quantidades        NUMERIC[],
  p_tx_modalidade      TEXT,
  p_tx_cep             TEXT,
  p_tx_logradouro      TEXT,
  p_tx_numero          TEXT,
  p_tx_complemento     TEXT,
  p_tx_bairro          TEXT,
  p_tx_cidade          TEXT,
  p_tx_uf              TEXT,
  p_tx_lat             DOUBLE PRECISION,
  p_tx_lng             DOUBLE PRECISION,
  p_tx_id_funcionario  UUID DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
BEGIN
  v_ids := fn_criar_agendamento_multiplo(p_id_pet, p_id_cliente, p_id_lojista, p_data, p_hora_inicio, p_servicos, p_id_funcionario, p_obs, p_produtos, p_quantidades);
  -- Mesma regra dos produtos (migration 039): a corrida fica presa ao
  -- PRIMEIRO agendamento do carrinho.
  PERFORM fn_anexar_taxidog(v_ids[1], p_tx_modalidade, p_tx_cep, p_tx_logradouro, p_tx_numero, p_tx_complemento, p_tx_bairro, p_tx_cidade, p_tx_uf, p_tx_lat, p_tx_lng, p_tx_id_funcionario, FALSE);
  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_agendamento_multiplo_com_taxidog(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_multiplo_com_taxidog(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) TO authenticated;

-- ============================================================
-- Agendamento da LOJA com TaxiDog
-- ============================================================
-- Chama fn_criar_agendamento_lojista (que já confere loja e permissão de
-- agenda) e prende a corrida em modo interno, na mesma transação.
CREATE OR REPLACE FUNCTION fn_criar_agendamento_lojista_com_taxidog(
  p_id_lojista         UUID,
  p_id_cliente         UUID,
  p_id_pet             UUID,
  p_id_servico         UUID,
  p_data               DATE,
  p_hora               TIME,
  p_obs                TEXT,
  p_tx_modalidade      TEXT,
  p_tx_cep             TEXT,
  p_tx_logradouro      TEXT,
  p_tx_numero          TEXT,
  p_tx_complemento     TEXT,
  p_tx_bairro          TEXT,
  p_tx_cidade          TEXT,
  p_tx_uf              TEXT,
  p_tx_lat             DOUBLE PRECISION,
  p_tx_lng             DOUBLE PRECISION,
  p_tx_id_funcionario  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  v_id := fn_criar_agendamento_lojista(p_id_lojista, p_id_cliente, p_id_pet, p_id_servico, p_data, p_hora, p_obs);
  PERFORM fn_anexar_taxidog(v_id, p_tx_modalidade, p_tx_cep, p_tx_logradouro, p_tx_numero, p_tx_complemento, p_tx_bairro, p_tx_cidade, p_tx_uf, p_tx_lat, p_tx_lng, p_tx_id_funcionario, TRUE);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_agendamento_lojista_com_taxidog(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_lojista_com_taxidog(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) TO authenticated;

-- ============================================================
-- Lista de TaxiDogs da loja (só id e nome) pra escolher no agendamento
-- ============================================================
-- Pública como a de profissionais (migration 022): o link de agendamento
-- é aberto antes do login. Só aparece com o TaxiDog ativado.
CREATE OR REPLACE FUNCTION fn_taxidogs_publicos(p_id_lojista UUID)
RETURNS TABLE (id_funcionario UUID, nome TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id_funcionario, f.nome
  FROM funcionario f
  JOIN taxidog_config c ON c.id_lojista = f.id_lojista AND c.ativo
  WHERE f.id_lojista = p_id_lojista AND f.ativo = TRUE AND f.pode_taxidog = TRUE
  ORDER BY f.nome
$$;

REVOKE ALL ON FUNCTION fn_taxidogs_publicos(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_taxidogs_publicos(UUID) TO anon, authenticated;
