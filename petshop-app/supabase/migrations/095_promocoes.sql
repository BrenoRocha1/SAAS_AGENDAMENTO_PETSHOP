-- ============================================================
-- PETSHOP SaaS - Migration 095: promoções de serviços e produtos
-- ============================================================
-- A loja marca um desconto em % num serviço ou produto, com início e fim
-- opcionais. Enquanto a promoção vale:
--   • o preço do serviço (fn_calcular_preco_servico — usado em TODO
--     agendamento: link online, loja, remarcação) já sai com o desconto,
--     inclusive nas variações por porte/raça;
--   • o preço do produto no agendamento e no Caixa (PDV) também;
--   • o link de agendamento mostra "De R$ X por R$ Y" e a seção "Em promoção".
-- O desconto é aplicado no banco — o navegador nunca manda preço.
-- ============================================================

ALTER TABLE servico ADD COLUMN IF NOT EXISTS promo_percentual SMALLINT;
ALTER TABLE servico ADD COLUMN IF NOT EXISTS promo_inicio DATE;
ALTER TABLE servico ADD COLUMN IF NOT EXISTS promo_fim DATE;
ALTER TABLE servico DROP CONSTRAINT IF EXISTS servico_promo_valida;
ALTER TABLE servico ADD CONSTRAINT servico_promo_valida CHECK (
  (promo_percentual IS NULL OR promo_percentual BETWEEN 1 AND 90)
  AND (promo_inicio IS NULL OR promo_fim IS NULL OR promo_fim >= promo_inicio)
);

ALTER TABLE produto ADD COLUMN IF NOT EXISTS promo_percentual SMALLINT;
ALTER TABLE produto ADD COLUMN IF NOT EXISTS promo_inicio DATE;
ALTER TABLE produto ADD COLUMN IF NOT EXISTS promo_fim DATE;
ALTER TABLE produto DROP CONSTRAINT IF EXISTS produto_promo_valida;
ALTER TABLE produto ADD CONSTRAINT produto_promo_valida CHECK (
  (promo_percentual IS NULL OR promo_percentual BETWEEN 1 AND 90)
  AND (promo_inicio IS NULL OR promo_fim IS NULL OR promo_fim >= promo_inicio)
);

-- Desconto que vale HOJE (horário de Brasília); 0 = sem promoção.
CREATE OR REPLACE FUNCTION fn_promo_vigente(p_percentual SMALLINT, p_inicio DATE, p_fim DATE)
RETURNS SMALLINT
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN p_percentual IS NULL THEN 0::SMALLINT
    WHEN p_inicio IS NOT NULL AND (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE < p_inicio THEN 0::SMALLINT
    WHEN p_fim IS NOT NULL AND (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE > p_fim THEN 0::SMALLINT
    ELSE p_percentual
  END;
$$;

CREATE OR REPLACE FUNCTION fn_aplicar_desconto(p_preco NUMERIC, p_percentual SMALLINT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE WHEN COALESCE(p_percentual, 0) <= 0 THEN p_preco
              ELSE ROUND(p_preco * (100 - p_percentual) / 100.0, 2) END;
$$;

-- Preço do produto agora (com a promoção, se houver).
CREATE OR REPLACE FUNCTION fn_preco_produto_vigente(p_id_produto UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT fn_aplicar_desconto(preco_venda, fn_promo_vigente(promo_percentual, promo_inicio, promo_fim))
  FROM produto WHERE id_produto = p_id_produto;
$$;

GRANT EXECUTE ON FUNCTION fn_promo_vigente(SMALLINT, DATE, DATE), fn_aplicar_desconto(NUMERIC, SMALLINT), fn_preco_produto_vigente(UUID) TO anon, authenticated, service_role;

-- Preço do serviço para o pet: o mesmo cálculo de sempre (raça > porte >
-- base, migration 010) e, por cima, o desconto da promoção vigente.
CREATE OR REPLACE FUNCTION fn_calcular_preco_servico(
  p_id_servico  UUID,
  p_id_pet      UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_preco_base  NUMERIC(10,2);
  v_promo       SMALLINT;
  v_especie     especie_pet;
  v_porte       porte_pet;
  v_raca        TEXT;
  v_preco       NUMERIC(10,2);
BEGIN
  SELECT preco, fn_promo_vigente(promo_percentual, promo_inicio, promo_fim)
  INTO v_preco_base, v_promo
  FROM servico WHERE id_servico = p_id_servico;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado';
  END IF;

  SELECT especie, porte, raca INTO v_especie, v_porte, v_raca
  FROM pet WHERE id_pet = p_id_pet;

  IF v_especie IS NOT NULL THEN
    -- 1) raça específica
    IF v_raca IS NOT NULL THEN
      SELECT preco INTO v_preco
      FROM servico_variacao
      WHERE id_servico = p_id_servico AND tipo = 'raca' AND especie = v_especie AND lower(raca) = lower(v_raca)
      LIMIT 1;
      IF FOUND THEN RETURN fn_aplicar_desconto(v_preco, v_promo); END IF;
    END IF;
    -- 2) porte + espécie
    IF v_porte IS NOT NULL THEN
      SELECT preco INTO v_preco
      FROM servico_variacao
      WHERE id_servico = p_id_servico AND tipo = 'porte' AND especie = v_especie AND porte = v_porte
      LIMIT 1;
      IF FOUND THEN RETURN fn_aplicar_desconto(v_preco, v_promo); END IF;
    END IF;
  END IF;

  -- 3) preço base
  RETURN fn_aplicar_desconto(v_preco_base, v_promo);
END;
$$;

-- fn_criar_agendamento: igual à versão da 076_agendamentos_simultaneos.sql, só que o preço do produto agora é o vigente (com promoção).
CREATE OR REPLACE FUNCTION fn_criar_agendamento(
  p_id_pet        UUID,
  p_id_servico    UUID,
  p_id_cliente    UUID,
  p_id_lojista    UUID,
  p_data          DATE,
  p_hora          TIME,
  p_obs           TEXT DEFAULT NULL,
  p_produtos      UUID[] DEFAULT NULL,
  p_quantidades   NUMERIC[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_agendamento  UUID;
  v_preco           NUMERIC(10,2);
  v_duracao         INTEGER;
  v_conflict        BOOLEAN;
  v_min_instante    TIMESTAMPTZ;
  v_max_instante    TIMESTAMPTZ;
  v_min_valor       INTEGER;
  v_min_unidade     TEXT;
  v_max_valor       INTEGER;
  v_max_unidade     TEXT;
  v_produto         produto%ROWTYPE;
  v_valor_produtos  NUMERIC(10,2) := 0;
  i                 INTEGER;
BEGIN
  IF p_id_cliente IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE AND aceita_agendamento_online = TRUE
  ) THEN
    RAISE EXCEPTION 'Este petshop não está aceitando agendamentos online no momento.';
  END IF;

  SELECT j.min_instante, j.max_instante INTO v_min_instante, v_max_instante
  FROM fn_janela_agendamento(p_id_lojista) j;

  IF (p_data + p_hora) AT TIME ZONE 'America/Sao_Paulo' < v_min_instante THEN
    SELECT agendamento_min_valor, agendamento_min_unidade INTO v_min_valor, v_min_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Agende com pelo menos % % de antecedência.', v_min_valor, CASE WHEN v_min_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  IF (p_data + p_hora) AT TIME ZONE 'America/Sao_Paulo' > v_max_instante THEN
    SELECT agendamento_max_valor, agendamento_max_unidade INTO v_max_valor, v_max_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Não é possível agendar com mais de % % de antecedência.', v_max_valor, CASE WHEN v_max_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  SELECT duracao
  INTO v_duracao
  FROM servico
  WHERE id_servico = p_id_servico
    AND id_lojista = p_id_lojista
    AND status = 'Ativo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  -- Vaga: até o limite de agendamentos simultâneos da loja (migration 076).
  PERFORM fn_conferir_vaga(p_id_lojista, p_data, p_hora, (p_hora + v_duracao * INTERVAL '1 minute')::TIME, NULL, p_id_pet);

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet
      AND id_cliente = p_id_cliente
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente';
  END IF;

  v_preco := fn_calcular_preco_servico(p_id_servico, p_id_pet);

  INSERT INTO agendamento (
    id_pet, id_servico, id_cliente, id_lojista,
    dt_agendamento, hr_agendamento, valor, status, obs
  )
  VALUES (
    p_id_pet, p_id_servico, p_id_cliente, p_id_lojista,
    p_data, p_hora, v_preco, 'Pendente', p_obs
  )
  RETURNING id_agendamento INTO v_id_agendamento;

  -- Produtos opcionais — ver comentário no topo do arquivo.
  IF p_produtos IS NOT NULL AND array_length(p_produtos, 1) > 0 THEN
    IF p_quantidades IS NULL OR array_length(p_quantidades, 1) IS DISTINCT FROM array_length(p_produtos, 1) THEN
      RAISE EXCEPTION 'Lista de produtos inválida';
    END IF;

    FOR i IN 1..array_length(p_produtos, 1) LOOP
      SELECT * INTO v_produto FROM produto
      WHERE id_produto = p_produtos[i]
        AND id_lojista = p_id_lojista
        AND status = 'Ativo'
        AND disponivel_agendamento_online = TRUE
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um dos produtos escolhidos não está mais disponível';
      END IF;

      IF p_quantidades[i] IS NULL OR p_quantidades[i] <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida para %', v_produto.nome;
      END IF;

      IF v_produto.estoque_atual < p_quantidades[i] THEN
        RAISE EXCEPTION 'Estoque insuficiente de %', v_produto.nome;
      END IF;

      UPDATE produto SET estoque_atual = estoque_atual - p_quantidades[i] WHERE id_produto = v_produto.id_produto;

      INSERT INTO movimento_estoque (id_produto, id_lojista, tipo, quantidade, origem, id_referencia, created_by)
      VALUES (v_produto.id_produto, p_id_lojista, 'saida', p_quantidades[i], 'venda', v_id_agendamento, p_id_cliente);

      INSERT INTO agendamento_produto (id_agendamento, id_produto, id_lojista, id_cliente, quantidade, preco_unitario)
      VALUES (v_id_agendamento, v_produto.id_produto, p_id_lojista, p_id_cliente, p_quantidades[i], fn_preco_produto_vigente(v_produto.id_produto));

      v_valor_produtos := v_valor_produtos + (fn_preco_produto_vigente(v_produto.id_produto) * p_quantidades[i]);
    END LOOP;

    UPDATE agendamento SET valor = valor + v_valor_produtos WHERE id_agendamento = v_id_agendamento;
  END IF;

  RETURN v_id_agendamento;
END;
$$;

-- fn_criar_agendamento_multiplo: igual à versão da 076_agendamentos_simultaneos.sql, só que o preço do produto agora é o vigente (com promoção).
CREATE OR REPLACE FUNCTION fn_criar_agendamento_multiplo(
  p_id_pet          UUID,
  p_id_cliente      UUID,
  p_id_lojista      UUID,
  p_data            DATE,
  p_hora_inicio     TIME,
  p_servicos        UUID[],
  p_id_funcionario  UUID DEFAULT NULL,
  p_obs             TEXT DEFAULT NULL,
  p_produtos        UUID[] DEFAULT NULL,
  p_quantidades     NUMERIC[] DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids             UUID[] := '{}';
  v_id_agendamento  UUID;
  v_id_servico      UUID;
  v_preco           NUMERIC(10,2);
  v_duracao         INTEGER;
  v_duracao_total   INTEGER;
  v_cursor          TIME := p_hora_inicio;
  v_conflict        BOOLEAN;
  v_dia_semana      dia_semana;
  v_hr_inicio       TIME;
  v_hr_fim          TIME;
  v_min_instante    TIMESTAMPTZ;
  v_max_instante    TIMESTAMPTZ;
  v_min_valor       INTEGER;
  v_min_unidade     TEXT;
  v_max_valor       INTEGER;
  v_max_unidade     TEXT;
  v_produto         produto%ROWTYPE;
  v_valor_produtos  NUMERIC(10,2) := 0;
  v_id_alvo         UUID;
  i                 INTEGER;
BEGIN
  IF p_id_cliente IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF p_servicos IS NULL OR array_length(p_servicos, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos um serviço';
  END IF;

  IF array_length(p_servicos, 1) > 10 THEN
    RAISE EXCEPTION 'Selecione no máximo 10 serviços por agendamento';
  END IF;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE AND aceita_agendamento_online = TRUE
  ) THEN
    RAISE EXCEPTION 'Este petshop não está aceitando agendamentos online no momento.';
  END IF;

  SELECT j.min_instante, j.max_instante INTO v_min_instante, v_max_instante
  FROM fn_janela_agendamento(p_id_lojista) j;

  IF (p_data + p_hora_inicio) AT TIME ZONE 'America/Sao_Paulo' < v_min_instante THEN
    SELECT agendamento_min_valor, agendamento_min_unidade INTO v_min_valor, v_min_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Agende com pelo menos % % de antecedência.', v_min_valor, CASE WHEN v_min_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  IF (p_data + p_hora_inicio) AT TIME ZONE 'America/Sao_Paulo' > v_max_instante THEN
    SELECT agendamento_max_valor, agendamento_max_unidade INTO v_max_valor, v_max_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Não é possível agendar com mais de % % de antecedência.', v_max_valor, CASE WHEN v_max_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet AND id_cliente = p_id_cliente AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente';
  END IF;

  IF p_id_funcionario IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = p_id_funcionario AND id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Profissional não encontrado';
  END IF;

  SELECT COALESCE(SUM(duracao), 0) INTO v_duracao_total
  FROM servico
  WHERE id_servico = ANY(p_servicos) AND id_lojista = p_id_lojista AND status = 'Ativo';

  IF v_duracao_total = 0 THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  v_dia_semana := CASE EXTRACT(DOW FROM p_data)
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END::dia_semana;

  SELECT h.hr_inicio, h.hr_fim INTO v_hr_inicio, v_hr_fim
  FROM horario h
  WHERE h.id_lojista = p_id_lojista AND h.dia_semana = v_dia_semana AND h.ativo = TRUE
  LIMIT 1;

  IF v_hr_inicio IS NULL THEN
    RAISE EXCEPTION 'A loja não abre nesse dia';
  END IF;

  IF p_hora_inicio < v_hr_inicio OR (p_hora_inicio + (v_duracao_total || ' minutes')::INTERVAL) > v_hr_fim THEN
    RAISE EXCEPTION 'Horário fora do funcionamento da loja';
  END IF;

  FOREACH v_id_servico IN ARRAY p_servicos LOOP
    SELECT duracao
    INTO v_duracao
    FROM servico
    WHERE id_servico = v_id_servico AND id_lojista = p_id_lojista AND status = 'Ativo'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Serviço não encontrado ou inativo';
    END IF;

    v_preco := fn_calcular_preco_servico(v_id_servico, p_id_pet);

    IF p_id_funcionario IS NULL THEN
      -- Loja inteira: até o limite de agendamentos simultâneos (migration 076).
      PERFORM fn_conferir_vaga(p_id_lojista, p_data, v_cursor, (v_cursor + v_duracao * INTERVAL '1 minute')::TIME, NULL, p_id_pet);
    ELSE
      -- Profissional escolhido: ele não pode estar em outro atendimento
      -- (regra de antes, sem mudança).
      SELECT EXISTS (
        SELECT 1 FROM agendamento a
        WHERE a.id_lojista = p_id_lojista
          AND a.dt_agendamento = p_data
          AND a.status NOT IN ('Cancelado')
          AND a.id_funcionario = p_id_funcionario
          AND (
            v_cursor < (a.hr_agendamento + (
              SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
            ) * INTERVAL '1 minute')
            AND (v_cursor + v_duracao * INTERVAL '1 minute') > a.hr_agendamento
          )
        FOR UPDATE SKIP LOCKED
      ) INTO v_conflict;

      IF v_conflict THEN
        RAISE EXCEPTION 'Horário não disponível. Por favor, escolha outro horário.';
      END IF;
    END IF;

    INSERT INTO agendamento (
      id_pet, id_servico, id_cliente, id_lojista, id_funcionario,
      dt_agendamento, hr_agendamento, valor, status, obs
    )
    VALUES (
      p_id_pet, v_id_servico, p_id_cliente, p_id_lojista, p_id_funcionario,
      p_data, v_cursor, v_preco, 'Pendente', p_obs
    )
    RETURNING id_agendamento INTO v_id_agendamento;

    v_ids := array_append(v_ids, v_id_agendamento);
    v_cursor := v_cursor + (v_duracao || ' minutes')::INTERVAL;
  END LOOP;

  -- Produtos opcionais, todos anexados ao primeiro agendamento do
  -- carrinho — ver comentário no topo do arquivo.
  IF p_produtos IS NOT NULL AND array_length(p_produtos, 1) > 0 THEN
    IF p_quantidades IS NULL OR array_length(p_quantidades, 1) IS DISTINCT FROM array_length(p_produtos, 1) THEN
      RAISE EXCEPTION 'Lista de produtos inválida';
    END IF;

    v_id_alvo := v_ids[1];

    FOR i IN 1..array_length(p_produtos, 1) LOOP
      SELECT * INTO v_produto FROM produto
      WHERE id_produto = p_produtos[i]
        AND id_lojista = p_id_lojista
        AND status = 'Ativo'
        AND disponivel_agendamento_online = TRUE
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um dos produtos escolhidos não está mais disponível';
      END IF;

      IF p_quantidades[i] IS NULL OR p_quantidades[i] <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida para %', v_produto.nome;
      END IF;

      IF v_produto.estoque_atual < p_quantidades[i] THEN
        RAISE EXCEPTION 'Estoque insuficiente de %', v_produto.nome;
      END IF;

      UPDATE produto SET estoque_atual = estoque_atual - p_quantidades[i] WHERE id_produto = v_produto.id_produto;

      INSERT INTO movimento_estoque (id_produto, id_lojista, tipo, quantidade, origem, id_referencia, created_by)
      VALUES (v_produto.id_produto, p_id_lojista, 'saida', p_quantidades[i], 'venda', v_id_alvo, p_id_cliente);

      INSERT INTO agendamento_produto (id_agendamento, id_produto, id_lojista, id_cliente, quantidade, preco_unitario)
      VALUES (v_id_alvo, v_produto.id_produto, p_id_lojista, p_id_cliente, p_quantidades[i], fn_preco_produto_vigente(v_produto.id_produto));

      v_valor_produtos := v_valor_produtos + (fn_preco_produto_vigente(v_produto.id_produto) * p_quantidades[i]);
    END LOOP;

    UPDATE agendamento SET valor = valor + v_valor_produtos WHERE id_agendamento = v_id_alvo;
  END IF;

  RETURN v_ids;
END;
$$;

-- fn_registrar_venda_pdv: igual à versão da 083_pdv.sql, só que o preço do produto agora é o vigente (com promoção).
CREATE OR REPLACE FUNCTION fn_registrar_venda_pdv(
  p_itens          JSONB,
  p_desconto       NUMERIC DEFAULT 0,
  p_forma          TEXT DEFAULT NULL,
  p_valor_recebido NUMERIC DEFAULT NULL,
  p_id_cliente     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lojista       UUID := auth_lojista_id();
  v_linha         RECORD;
  v_produto       produto%ROWTYPE;
  v_custo         NUMERIC;
  v_subtotal      NUMERIC(10,2) := 0;
  v_desconto      NUMERIC(10,2) := ROUND(COALESCE(p_desconto, 0), 2);
  v_total         NUMERIC(10,2);
  v_recebido      NUMERIC(10,2);
  v_troco         NUMERIC(10,2);
  v_numero        BIGINT;
  v_id            UUID;
  v_cliente_nome  TEXT;
  v_operador      TEXT;
BEGIN
  IF v_lojista IS NULL OR NOT fn_produtos_da_loja(v_lojista) THEN
    RAISE EXCEPTION 'PDV: você não tem permissão para registrar vendas.';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'PDV: adicione pelo menos um produto à venda.';
  END IF;
  IF jsonb_array_length(p_itens) > 100 THEN
    RAISE EXCEPTION 'PDV: itens demais em uma única venda (máximo 100).';
  END IF;

  IF p_forma IS NULL OR NOT COALESCE(fn_forma_pagamento_aceita(v_lojista, p_forma), FALSE) THEN
    RAISE EXCEPTION 'PDV: escolha uma forma de pagamento aceita pela loja.';
  END IF;

  IF v_desconto < 0 THEN
    RAISE EXCEPTION 'PDV: o desconto não pode ser negativo.';
  END IF;

  IF p_id_cliente IS NOT NULL THEN
    SELECT c.nome INTO v_cliente_nome
    FROM cliente c
    JOIN cliente_lojista cl ON cl.id_cliente = c.id_cliente
    WHERE c.id_cliente = p_id_cliente AND cl.id_lojista = v_lojista;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PDV: cliente não encontrado.';
    END IF;
  END IF;

  -- 1ª passada: valida cada produto (travando a linha, em ordem fixa pra
  -- duas vendas simultâneas não se trancarem) e soma o subtotal com o
  -- preço do BANCO. O mesmo produto repetido na lista vira uma linha só.
  FOR v_linha IN
    SELECT (e ->> 'id_produto')::UUID AS id_produto,
           SUM((e ->> 'quantidade')::NUMERIC) AS quantidade
    FROM jsonb_array_elements(p_itens) e
    GROUP BY 1
    ORDER BY 1
  LOOP
    IF v_linha.quantidade IS NULL OR v_linha.quantidade <= 0 THEN
      RAISE EXCEPTION 'PDV: informe uma quantidade maior que zero.';
    END IF;

    SELECT * INTO v_produto
    FROM produto
    WHERE id_produto = v_linha.id_produto AND id_lojista = v_lojista
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PDV: produto não encontrado.';
    END IF;
    IF v_produto.status <> 'Ativo' THEN
      RAISE EXCEPTION 'PDV: "%" está inativo e não pode ser vendido.', v_produto.nome;
    END IF;
    IF v_produto.unidade_venda NOT IN ('kg', 'litro') AND v_linha.quantidade <> TRUNC(v_linha.quantidade) THEN
      RAISE EXCEPTION 'PDV: "%" é vendido por %: use quantidades inteiras.', v_produto.nome, v_produto.unidade_venda;
    END IF;
    IF v_produto.estoque_atual < v_linha.quantidade THEN
      RAISE EXCEPTION 'PDV: estoque insuficiente de "%": só há % em estoque.', v_produto.nome, v_produto.estoque_atual;
    END IF;

    v_subtotal := v_subtotal + ROUND(fn_preco_produto_vigente(v_produto.id_produto) * v_linha.quantidade, 2);
  END LOOP;

  IF v_desconto > v_subtotal THEN
    RAISE EXCEPTION 'PDV: o desconto não pode ser maior que o total da venda.';
  END IF;
  v_total := v_subtotal - v_desconto;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'PDV: o total da venda precisa ser maior que zero.';
  END IF;

  IF p_forma = 'dinheiro' THEN
    v_recebido := ROUND(COALESCE(p_valor_recebido, v_total), 2);
    IF v_recebido < v_total THEN
      RAISE EXCEPTION 'PDV: o valor recebido é menor que o total da venda.';
    END IF;
    v_troco := v_recebido - v_total;
  END IF;

  IF auth_role() = 'lojista' THEN
    v_operador := 'Responsável pela loja';
  ELSE
    SELECT nome INTO v_operador FROM funcionario WHERE id_funcionario = auth.uid();
  END IF;

  -- Número sequencial por loja (a trava evita dois caixas pegarem o mesmo).
  PERFORM pg_advisory_xact_lock(hashtext('pdv:' || v_lojista::TEXT));
  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero FROM venda WHERE id_lojista = v_lojista;

  INSERT INTO venda (
    id_lojista, numero, id_cliente, cliente_nome, subtotal, desconto, total,
    forma_pagamento, valor_recebido, troco, id_operador, operador_nome
  )
  VALUES (
    v_lojista, v_numero, p_id_cliente, v_cliente_nome, v_subtotal, v_desconto, v_total,
    p_forma, v_recebido, v_troco, auth.uid(), v_operador
  )
  RETURNING id_venda INTO v_id;

  -- 2ª passada: grava os itens (com snapshot) e dá a baixa no estoque.
  FOR v_linha IN
    SELECT (e ->> 'id_produto')::UUID AS id_produto,
           SUM((e ->> 'quantidade')::NUMERIC) AS quantidade
    FROM jsonb_array_elements(p_itens) e
    GROUP BY 1
    ORDER BY 1
  LOOP
    SELECT * INTO v_produto FROM produto WHERE id_produto = v_linha.id_produto;
    SELECT pc.custo_unitario INTO v_custo FROM produto_custo pc WHERE pc.id_produto = v_linha.id_produto;

    INSERT INTO venda_item (
      id_venda, id_lojista, id_produto, produto_nome, unidade_venda,
      quantidade, preco_unitario, custo_unitario, subtotal
    )
    VALUES (
      v_id, v_lojista, v_produto.id_produto, v_produto.nome, v_produto.unidade_venda,
      v_linha.quantidade, fn_preco_produto_vigente(v_produto.id_produto), v_custo,
      ROUND(fn_preco_produto_vigente(v_produto.id_produto) * v_linha.quantidade, 2)
    );

    UPDATE produto
    SET estoque_atual = estoque_atual - v_linha.quantidade
    WHERE id_produto = v_produto.id_produto;

    INSERT INTO movimento_estoque (id_produto, id_lojista, tipo, quantidade, motivo, origem, id_referencia, created_by)
    VALUES (
      v_produto.id_produto, v_lojista, 'saida', v_linha.quantidade,
      'Venda no balcão #' || v_numero, 'venda', v_id, auth.uid()
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id_venda', v_id,
    'numero', v_numero,
    'total', v_total,
    'troco', COALESCE(v_troco, 0)
  );
END;
$$;
