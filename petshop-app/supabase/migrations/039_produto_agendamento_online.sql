-- ============================================================
-- PETSHOP SaaS - Migration 039: Produto à venda no Agendamento Online
-- ============================================================
-- Ativa a integração que a migration 037 já tinha deixado preparada
-- (movimento_estoque.origem/id_referencia): quando um produto está
-- marcado como "disponível para o Agendamento Online", o cliente pode
-- adicioná-lo junto do serviço — tanto pelo link público
-- (/agendamento/[id], fn_criar_agendamento_multiplo) quanto pela própria
-- conta dele (/cliente/novo-agendamento, fn_criar_agendamento).
--
-- Decisões de modelagem:
--
-- • `produto.disponivel_agendamento_online` (BOOLEAN, default FALSE): a
--   loja liga isso por produto, na tela de Produtos. Continua "Ativo"
--   controlando se o produto existe/é vendido no balcão; esta coluna só
--   soma mais um requisito pra aparecer no agendamento online.
--
-- • Nova policy de SELECT pública em `produto`, sem checagem de role —
--   mesmo formato de "servico: usuarios veem servicos ativos" (migration
--   002), que já é o que permite a página pública do agendamento (visitante
--   sem login, role `anon`) listar os serviços da loja. Sem uma policy
--   dessas, o cliente autenticado E o visitante anônimo não enxergariam
--   nenhum produto por RLS.
--
-- • `agendamento_produto` guarda o que foi comprado em cada agendamento —
--   id_lojista e id_cliente ficam denormalizados (mesma ideia de
--   `agendamento`/`avaliacao`) pra RLS direta sem JOIN. `preco_unitario`
--   é uma FOTO do preço no momento da compra (não um FK pro preço atual
--   do produto), porque o preço do catálogo pode mudar depois — o valor
--   pago naquele agendamento tem que continuar sendo o que foi cobrado.
--   Nenhuma policy de INSERT/UPDATE/DELETE: só as funções abaixo escrevem.
--
-- • A baixa de estoque usa o MESMO mecanismo de fn_movimentar_estoque
--   (origem='venda', id_referencia=id_agendamento) — só que inline nas
--   funções de criar agendamento, porque fn_movimentar_estoque assume
--   quem chama é lojista/funcionário (auth_lojista_id()), e aqui quem
--   chama é o CLIENTE. A autorização de quem está comprando já foi
--   conferida no topo de cada função (p_id_cliente = auth.uid()); o que
--   falta validar aqui é só o produto em si (mesma loja, ativo,
--   disponível online, estoque suficiente).
--
-- • Falta de estoque de QUALQUER produto do carrinho cancela o
--   agendamento inteiro (a função inteira dá RAISE EXCEPTION e a
--   transação desfaz tudo) — sem reserva parcial, sem "agenda o serviço
--   mas não os produtos". Simples e sem meio-termo confuso.
--
-- • `fn_criar_agendamento_multiplo` cria um agendamento POR SERVIÇO do
--   carrinho (ver migration 022) — não existe "um agendamento por
--   visita". Os produtos escolhidos (uma lista só, não por serviço) ficam
--   anexados ao PRIMEIRO agendamento criado no carrinho; o valor deles
--   entra na soma do valor desse mesmo agendamento. É uma simplificação
--   deliberada: manter isso "por visita" de verdade exigiria uma tabela
--   nova (algo como `visita`), fora do escopo pedido agora.
--
-- • `agendamento.valor` passa a incluir os produtos comprados junto —
--   de propósito: assim relatórios/dashboard que já somam `valor` como
--   faturamento passam a contar a venda de produto automaticamente, sem
--   precisar mexer em nenhuma consulta de relatório existente.
--
-- • Ambas as funções tinham uma assinatura fixa — adicionar parâmetros
--   novos no fim (com DEFAULT) exige DROP + CREATE, não só CREATE OR
--   REPLACE, porque a lista de tipos de argumento muda (mesmo raciocínio
--   já registrado na migration 029 pra fn_registrar_funcionario).
--   Aproveitando que fn_criar_agendamento está sendo recriada aqui: ela
--   nunca tinha tido um REVOKE/GRANT explícito (só fn_criar_agendamento_
--   multiplo tinha, desde a migration 022) — ficava com o EXECUTE padrão
--   pra PUBLIC, que inclui `anon`. Fechado junto nesta migration.
-- ============================================================

ALTER TABLE produto ADD COLUMN IF NOT EXISTS disponivel_agendamento_online BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "produto: publico ve disponiveis para agendamento online" ON produto;
CREATE POLICY "produto: publico ve disponiveis para agendamento online"
  ON produto FOR SELECT
  USING (status = 'Ativo' AND disponivel_agendamento_online = TRUE);

-- ============================================================
-- agendamento_produto — produtos comprados junto de um agendamento
-- ============================================================
CREATE TABLE IF NOT EXISTS agendamento_produto (
  id_agendamento_produto UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_agendamento UUID NOT NULL REFERENCES agendamento(id_agendamento) ON DELETE CASCADE,
  id_produto     UUID NOT NULL REFERENCES produto(id_produto) ON DELETE RESTRICT,
  id_lojista     UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  id_cliente     UUID NOT NULL REFERENCES cliente(id_cliente) ON DELETE RESTRICT,
  quantidade     NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_produto_agendamento ON agendamento_produto(id_agendamento);
CREATE INDEX IF NOT EXISTS idx_agendamento_produto_lojista     ON agendamento_produto(id_lojista, created_at DESC);

ALTER TABLE agendamento_produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento_produto FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agendamento_produto: cliente ve proprios" ON agendamento_produto;
CREATE POLICY "agendamento_produto: cliente ve proprios"
  ON agendamento_produto FOR SELECT
  USING (id_cliente = auth.uid());

DROP POLICY IF EXISTS "agendamento_produto: lojista ve da loja" ON agendamento_produto;
CREATE POLICY "agendamento_produto: lojista ve da loja"
  ON agendamento_produto FOR SELECT
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista');

DROP POLICY IF EXISTS "agendamento_produto: funcionario ve da loja" ON agendamento_produto;
CREATE POLICY "agendamento_produto: funcionario ve da loja"
  ON agendamento_produto FOR SELECT
  USING (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id());

-- Sem policy de INSERT/UPDATE/DELETE de propósito: só fn_criar_agendamento
-- e fn_criar_agendamento_multiplo (abaixo) escrevem aqui.

-- ============================================================
-- fn_criar_agendamento — agora aceita produtos opcionais
-- ============================================================
DROP FUNCTION IF EXISTS fn_criar_agendamento(UUID, UUID, UUID, UUID, DATE, TIME, TEXT);

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

  SELECT EXISTS (
    SELECT 1 FROM agendamento a
    WHERE a.id_lojista = p_id_lojista
      AND a.dt_agendamento = p_data
      AND a.status NOT IN ('Cancelado')
      AND (
        p_hora < (a.hr_agendamento + (
          SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
        ) * INTERVAL '1 minute')
        AND (p_hora + v_duracao * INTERVAL '1 minute') > a.hr_agendamento
      )
    FOR UPDATE SKIP LOCKED
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'Horário não disponível. Por favor, escolha outro horário.';
  END IF;

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
      VALUES (v_id_agendamento, v_produto.id_produto, p_id_lojista, p_id_cliente, p_quantidades[i], v_produto.preco_venda);

      v_valor_produtos := v_valor_produtos + (v_produto.preco_venda * p_quantidades[i]);
    END LOOP;

    UPDATE agendamento SET valor = valor + v_valor_produtos WHERE id_agendamento = v_id_agendamento;
  END IF;

  RETURN v_id_agendamento;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_agendamento(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[]) TO authenticated;

-- ============================================================
-- fn_criar_agendamento_multiplo — idem, produtos anexados ao PRIMEIRO
-- agendamento do carrinho (ver comentário no topo do arquivo).
-- ============================================================
DROP FUNCTION IF EXISTS fn_criar_agendamento_multiplo(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT);

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

    SELECT EXISTS (
      SELECT 1 FROM agendamento a
      WHERE a.id_lojista = p_id_lojista
        AND a.dt_agendamento = p_data
        AND a.status NOT IN ('Cancelado')
        AND (p_id_funcionario IS NULL OR a.id_funcionario = p_id_funcionario)
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
      VALUES (v_id_alvo, v_produto.id_produto, p_id_lojista, p_id_cliente, p_quantidades[i], v_produto.preco_venda);

      v_valor_produtos := v_valor_produtos + (v_produto.preco_venda * p_quantidades[i]);
    END LOOP;

    UPDATE agendamento SET valor = valor + v_valor_produtos WHERE id_agendamento = v_id_alvo;
  END IF;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_agendamento_multiplo(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_multiplo(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[]) TO authenticated;
