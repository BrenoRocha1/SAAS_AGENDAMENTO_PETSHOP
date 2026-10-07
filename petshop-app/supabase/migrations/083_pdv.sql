-- ============================================================
-- PETSHOP SaaS - Migration 083: PDV (frente de caixa) com checkout
-- ============================================================
-- Venda de balcão de PRODUTOS, sem agendamento. Depende das migrations
-- 037 (produto/estoque), 057 (formas de pagamento aceitas) e 062 (custo
-- do produto + fn_produtos_da_loja / fn_gestor_da_loja).
--
-- Decisões de modelagem:
--
-- • `venda` + `venda_item`, tabelas próprias (não reaproveitam
--   `agendamento`): é outro fluxo — sem pet, sem horário, sem status de
--   atendimento. Cada venda tem um número sequencial POR LOJA (#0001…),
--   que é o que o operador lê pro cliente e que aparece no recibo.
--
-- • Item guarda um SNAPSHOT (nome, unidade, preço e custo do momento):
--   mudar preço/custo/nome do produto depois não reescreve a venda
--   antiga. `id_produto` é ON DELETE SET NULL — apagar um produto do
--   catálogo não trava nem some com o histórico de vendas.
--
-- • Escrita SÓ pelas funções abaixo (sem policy de INSERT/UPDATE/DELETE),
--   mesma ideia de movimento_estoque (037): a venda, os itens, a baixa de
--   estoque e o movimento acontecem juntos ou nenhum acontece. Preço e
--   estoque são sempre lidos do banco — o que o navegador manda é só
--   "qual produto" e "quanto".
--
-- • Quem opera o caixa: o dono, um administrador ou quem tem "Gerenciar
--   Produtos" (fn_produtos_da_loja) — a venda mexe no estoque, então
--   segue a mesma permissão. Cancelar uma venda (devolve o estoque) é só
--   dono/administrador (fn_gestor_da_loja).
--
-- • Forma de pagamento: as mesmas 4 de sempre, respeitando as que a loja
--   aceita (fn_forma_pagamento_aceita). Venda de balcão é sempre paga na
--   hora, então não existe "pendente". Dinheiro guarda valor recebido e
--   troco.
--
-- • Mensagens de erro de regra começam com "PDV: " — a Server Action as
--   repassa já prontas pra tela.
-- ============================================================

-- ============================================================
-- 1) Tabelas
-- ============================================================
CREATE TABLE IF NOT EXISTS venda (
  id_venda         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista       UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  numero           BIGINT NOT NULL,
  -- Cliente é opcional (venda de balcão anônima). Guardamos o nome junto
  -- pro recibo/histórico não depender do cadastro continuar existindo.
  id_cliente       UUID REFERENCES cliente(id_cliente) ON DELETE SET NULL,
  cliente_nome     TEXT,
  subtotal         NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
  desconto         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  total            NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  forma_pagamento  TEXT NOT NULL CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito')),
  valor_recebido   NUMERIC(10,2) CHECK (valor_recebido >= 0),
  troco            NUMERIC(10,2) CHECK (troco >= 0),
  status           TEXT NOT NULL DEFAULT 'concluida' CHECK (status IN ('concluida', 'cancelada')),
  id_operador      UUID,
  operador_nome    TEXT,
  cancelada_em     TIMESTAMPTZ,
  cancelada_motivo TEXT CHECK (char_length(cancelada_motivo) <= 200),
  cancelada_por    UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venda_desconto_valido CHECK (desconto <= subtotal),
  UNIQUE (id_lojista, numero)
);

CREATE INDEX IF NOT EXISTS idx_venda_lojista_data ON venda(id_lojista, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venda_cliente ON venda(id_cliente) WHERE id_cliente IS NOT NULL;

CREATE TABLE IF NOT EXISTS venda_item (
  id_item         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_venda        UUID NOT NULL REFERENCES venda(id_venda) ON DELETE CASCADE,
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  id_produto      UUID REFERENCES produto(id_produto) ON DELETE SET NULL,
  produto_nome    TEXT NOT NULL,
  unidade_venda   TEXT NOT NULL,
  quantidade      NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
  preco_unitario  NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
  -- Custo (CMV, migration 062) do momento da venda; NULL = produto sem custo.
  custo_unitario  NUMERIC(10,2) CHECK (custo_unitario >= 0),
  subtotal        NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_venda_item_venda ON venda_item(id_venda);
CREATE INDEX IF NOT EXISTS idx_venda_item_produto ON venda_item(id_produto) WHERE id_produto IS NOT NULL;

-- ============================================================
-- 2) RLS — só leitura, pra equipe de produtos/gestão da própria loja
-- ============================================================
ALTER TABLE venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE venda FORCE ROW LEVEL SECURITY;
ALTER TABLE venda_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE venda_item FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venda: equipe de produtos ve" ON venda;
CREATE POLICY "venda: equipe de produtos ve"
  ON venda FOR SELECT
  USING (fn_produtos_da_loja(id_lojista));

DROP POLICY IF EXISTS "venda_item: equipe de produtos ve" ON venda_item;
CREATE POLICY "venda_item: equipe de produtos ve"
  ON venda_item FOR SELECT
  USING (fn_produtos_da_loja(id_lojista));

-- ============================================================
-- 3) Registrar a venda (checkout) — atômico
-- ============================================================
-- p_itens: [{"id_produto": "<uuid>", "quantidade": 2}, ...]
-- p_desconto: valor em R$ (a tela converte % em R$ antes de enviar).
-- Devolve {id_venda, numero, total, troco}.
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

    v_subtotal := v_subtotal + ROUND(v_produto.preco_venda * v_linha.quantidade, 2);
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
      v_linha.quantidade, v_produto.preco_venda, v_custo,
      ROUND(v_produto.preco_venda * v_linha.quantidade, 2)
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

REVOKE ALL ON FUNCTION fn_registrar_venda_pdv(JSONB, NUMERIC, TEXT, NUMERIC, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_registrar_venda_pdv(JSONB, NUMERIC, TEXT, NUMERIC, UUID) TO authenticated;

-- ============================================================
-- 4) Cancelar venda — devolve o estoque (só dono/administrador)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_cancelar_venda_pdv(p_id_venda UUID, p_motivo TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda venda%ROWTYPE;
  v_item  RECORD;
BEGIN
  SELECT * INTO v_venda FROM venda WHERE id_venda = p_id_venda FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDV: venda não encontrada.';
  END IF;
  IF NOT fn_gestor_da_loja(v_venda.id_lojista) THEN
    RAISE EXCEPTION 'PDV: só o responsável pela loja ou um administrador pode cancelar vendas.';
  END IF;
  IF v_venda.status = 'cancelada' THEN
    RAISE EXCEPTION 'PDV: esta venda já foi cancelada.';
  END IF;

  UPDATE venda
  SET status = 'cancelada',
      cancelada_em = NOW(),
      cancelada_motivo = NULLIF(btrim(COALESCE(p_motivo, '')), ''),
      cancelada_por = auth.uid()
  WHERE id_venda = p_id_venda;

  -- Devolve ao estoque (produto apagado do catálogo, id NULL, não volta).
  FOR v_item IN
    SELECT id_produto, quantidade
    FROM venda_item
    WHERE id_venda = p_id_venda AND id_produto IS NOT NULL
    ORDER BY id_produto
  LOOP
    UPDATE produto
    SET estoque_atual = estoque_atual + v_item.quantidade
    WHERE id_produto = v_item.id_produto;

    INSERT INTO movimento_estoque (id_produto, id_lojista, tipo, quantidade, motivo, origem, id_referencia, created_by)
    VALUES (
      v_item.id_produto, v_venda.id_lojista, 'entrada', v_item.quantidade,
      'Cancelamento da venda #' || v_venda.numero, 'venda', p_id_venda, auth.uid()
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fn_cancelar_venda_pdv(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cancelar_venda_pdv(UUID, TEXT) TO authenticated;

-- ============================================================
-- 5) Buscar cliente pelo caixa (nome ou telefone) — até 8 resultados
-- ============================================================
-- fn_buscar_clientes_lojista (019) só serve o dono; o caixa também é
-- operado por funcionário, por isso uma busca própria, enxuta.
CREATE OR REPLACE FUNCTION fn_pdv_buscar_clientes(p_busca TEXT DEFAULT NULL)
RETURNS TABLE (id_cliente UUID, nome TEXT, telefone TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id_cliente, c.nome, c.telefone
  FROM cliente_lojista cl
  JOIN cliente c ON c.id_cliente = cl.id_cliente
  WHERE cl.id_lojista = auth_lojista_id()
    AND fn_produtos_da_loja(cl.id_lojista)
    AND (
      btrim(COALESCE(p_busca, '')) = ''
      OR c.nome ILIKE '%' || btrim(p_busca) || '%'
      OR (
        regexp_replace(p_busca, '\D', '', 'g') <> ''
        AND c.telefone LIKE '%' || regexp_replace(p_busca, '\D', '', 'g') || '%'
      )
    )
  ORDER BY c.nome
  LIMIT 8
$$;

REVOKE ALL ON FUNCTION fn_pdv_buscar_clientes(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_pdv_buscar_clientes(TEXT) TO authenticated;
