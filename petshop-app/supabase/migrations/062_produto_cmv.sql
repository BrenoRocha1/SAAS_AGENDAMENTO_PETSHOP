-- ============================================================
-- PETSHOP SaaS - Migration 062: custo dos produtos (CMV)
-- ============================================================
-- • A loja registra quanto paga por unidade de cada produto (custo).
-- • Cada venda de produto guarda o custo daquele momento — mudar o custo
--   depois não muda o CMV das vendas antigas.
-- • Relatório de Vendas: vendas de produtos com faturamento bruto, CMV e
--   faturamento líquido (bruto − CMV).
--
-- O custo NÃO fica numa coluna de `produto`: a tabela tem leitura pública
-- (link de agendamento, migration 039) e RLS é por linha, não por coluna
-- — o custo vazaria pela API. Por isso tabelas separadas, que só a equipe
-- que cuida de produtos (ou dono/administrador) lê. O mesmo para o custo
-- de cada venda (o cliente lê as próprias compras em agendamento_produto).
-- ============================================================

-- Dono, administrador ou quem tem "Gerenciar Produtos".
CREATE OR REPLACE FUNCTION fn_produtos_da_loja(p_id_lojista UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_id_lojista IS NOT NULL AND (
    auth.uid() = p_id_lojista
    OR EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND id_lojista = p_id_lojista
        AND ativo = TRUE AND (acesso_total OR pode_gerenciar_produtos)
    )
  )
$$;
REVOKE ALL ON FUNCTION fn_produtos_da_loja(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_produtos_da_loja(UUID) TO authenticated;

-- Mesma função da 058/060 (repetida pra esta migration não depender da ordem).
CREATE OR REPLACE FUNCTION fn_gestor_da_loja(p_id_lojista UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_id_lojista IS NOT NULL AND (
    auth.uid() = p_id_lojista
    OR EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND id_lojista = p_id_lojista
        AND ativo = TRUE AND acesso_total = TRUE
    )
  )
$$;
REVOKE ALL ON FUNCTION fn_gestor_da_loja(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_gestor_da_loja(UUID) TO authenticated;

-- ============================================================
-- 1) Tabelas
-- ============================================================
CREATE TABLE IF NOT EXISTS produto_custo (
  id_produto      UUID PRIMARY KEY REFERENCES produto(id_produto) ON DELETE CASCADE,
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  custo_unitario  NUMERIC(10,2) NOT NULL CHECK (custo_unitario >= 0),
  atualizado_por  UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registro de cada mudança de custo (quem, quando, de quanto pra quanto).
CREATE TABLE IF NOT EXISTS produto_custo_historico (
  id_historico    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_produto      UUID NOT NULL REFERENCES produto(id_produto) ON DELETE CASCADE,
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  custo_anterior  NUMERIC(10,2),
  custo_novo      NUMERIC(10,2),
  id_usuario      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_produto_custo_historico ON produto_custo_historico(id_produto, created_at DESC);

-- Custo de cada item vendido, no momento da venda.
CREATE TABLE IF NOT EXISTS agendamento_produto_custo (
  id_agendamento_produto  UUID PRIMARY KEY REFERENCES agendamento_produto(id_agendamento_produto) ON DELETE CASCADE,
  id_lojista              UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  custo_unitario          NUMERIC(10,2) NOT NULL CHECK (custo_unitario >= 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agendamento_produto_custo_lojista ON agendamento_produto_custo(id_lojista);

ALTER TABLE produto_custo ENABLE ROW LEVEL SECURITY;              ALTER TABLE produto_custo FORCE ROW LEVEL SECURITY;
ALTER TABLE produto_custo_historico ENABLE ROW LEVEL SECURITY;    ALTER TABLE produto_custo_historico FORCE ROW LEVEL SECURITY;
ALTER TABLE agendamento_produto_custo ENABLE ROW LEVEL SECURITY;  ALTER TABLE agendamento_produto_custo FORCE ROW LEVEL SECURITY;

-- Só leitura, e só pra equipe de produtos/gestão da própria loja. Escrita
-- só pela função e pelo trigger abaixo.
DROP POLICY IF EXISTS "produto_custo: equipe de produtos ve" ON produto_custo;
CREATE POLICY "produto_custo: equipe de produtos ve" ON produto_custo FOR SELECT USING (fn_produtos_da_loja(id_lojista));
DROP POLICY IF EXISTS "produto_custo_historico: equipe de produtos ve" ON produto_custo_historico;
CREATE POLICY "produto_custo_historico: equipe de produtos ve" ON produto_custo_historico FOR SELECT USING (fn_produtos_da_loja(id_lojista));
DROP POLICY IF EXISTS "agendamento_produto_custo: gestao ve" ON agendamento_produto_custo;
CREATE POLICY "agendamento_produto_custo: gestao ve" ON agendamento_produto_custo FOR SELECT
  USING (fn_gestor_da_loja(id_lojista) OR fn_produtos_da_loja(id_lojista));

-- ============================================================
-- 2) Registrar o custo
-- ============================================================
-- p_custo NULL = tirar o custo (vendas novas ficam sem CMV).
CREATE OR REPLACE FUNCTION fn_salvar_custo_produto(p_id_produto UUID, p_custo NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja     UUID;
  v_anterior NUMERIC;
BEGIN
  SELECT id_lojista INTO v_loja FROM produto WHERE id_produto = p_id_produto;
  IF v_loja IS NULL OR NOT fn_produtos_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
  IF p_custo IS NOT NULL AND (p_custo < 0 OR p_custo > 99999999) THEN
    RAISE EXCEPTION 'Custo inválido';
  END IF;

  SELECT custo_unitario INTO v_anterior FROM produto_custo WHERE id_produto = p_id_produto;
  IF v_anterior IS NOT DISTINCT FROM ROUND(p_custo, 2) THEN
    RETURN;
  END IF;

  IF p_custo IS NULL THEN
    DELETE FROM produto_custo WHERE id_produto = p_id_produto;
  ELSE
    INSERT INTO produto_custo (id_produto, id_lojista, custo_unitario, atualizado_por, updated_at)
    VALUES (p_id_produto, v_loja, ROUND(p_custo, 2), auth.uid(), NOW())
    ON CONFLICT (id_produto) DO UPDATE SET
      custo_unitario = EXCLUDED.custo_unitario,
      atualizado_por = EXCLUDED.atualizado_por,
      updated_at = NOW();
  END IF;

  INSERT INTO produto_custo_historico (id_produto, id_lojista, custo_anterior, custo_novo, id_usuario)
  VALUES (p_id_produto, v_loja, v_anterior, ROUND(p_custo, 2), auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION fn_salvar_custo_produto(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_salvar_custo_produto(UUID, NUMERIC) TO authenticated;

-- Cada item vendido guarda o custo do momento (se o produto tiver custo).
CREATE OR REPLACE FUNCTION fn_trg_agendamento_produto_custo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO agendamento_produto_custo (id_agendamento_produto, id_lojista, custo_unitario)
  SELECT NEW.id_agendamento_produto, NEW.id_lojista, pc.custo_unitario
  FROM produto_custo pc WHERE pc.id_produto = NEW.id_produto
  ON CONFLICT (id_agendamento_produto) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_produto_custo ON agendamento_produto;
CREATE TRIGGER trg_agendamento_produto_custo
  AFTER INSERT ON agendamento_produto
  FOR EACH ROW EXECUTE FUNCTION fn_trg_agendamento_produto_custo();

-- ============================================================
-- 3) Relatório de Vendas: vendas de produtos
-- ============================================================
-- Mesma regra do faturamento: itens de atendimentos Concluídos com data
-- no período. Bruto = quantidade × preço; CMV = quantidade × custo da
-- venda; líquido = bruto − CMV. Venda sem custo registrado (de antes do
-- custo existir) entra no bruto e aparece separada — não inventa CMV.
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_produtos(p_id_lojista UUID, p_data_ini DATE, p_data_fim DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN (
    WITH itens AS (
      SELECT ap.id_produto, p.nome, p.unidade_venda, ap.id_agendamento,
             ap.quantidade, ap.preco_unitario, apc.custo_unitario,
             ap.quantidade * ap.preco_unitario AS bruto,
             ap.quantidade * apc.custo_unitario AS cmv
      FROM agendamento_produto ap
      JOIN agendamento a ON a.id_agendamento = ap.id_agendamento
      JOIN produto p ON p.id_produto = ap.id_produto
      LEFT JOIN agendamento_produto_custo apc ON apc.id_agendamento_produto = ap.id_agendamento_produto
      WHERE ap.id_lojista = p_id_lojista
        AND a.status = 'Concluído'
        AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
    )
    SELECT jsonb_build_object(
      'bruto',             COALESCE(ROUND(SUM(bruto), 2), 0),
      'cmv',               COALESCE(ROUND(SUM(cmv), 2), 0),
      'liquido',           COALESCE(ROUND(SUM(bruto) - COALESCE(SUM(cmv), 0), 2), 0),
      'bruto_com_custo',   COALESCE(ROUND(SUM(bruto) FILTER (WHERE custo_unitario IS NOT NULL), 2), 0),
      'bruto_sem_custo',   COALESCE(ROUND(SUM(bruto) FILTER (WHERE custo_unitario IS NULL), 2), 0),
      'itens_sem_custo',   COUNT(*) FILTER (WHERE custo_unitario IS NULL),
      'pedidos',           COUNT(DISTINCT id_agendamento),
      'produtos', COALESCE((
        SELECT jsonb_agg(x ORDER BY (x ->> 'bruto')::NUMERIC DESC) FROM (
          SELECT jsonb_build_object(
            'id_produto', id_produto,
            'produto', nome,
            'unidade_venda', unidade_venda,
            'quantidade', ROUND(SUM(quantidade), 3),
            'bruto', ROUND(SUM(bruto), 2),
            'cmv', ROUND(COALESCE(SUM(cmv), 0), 2),
            'liquido', ROUND(SUM(bruto) - COALESCE(SUM(cmv), 0), 2),
            'bruto_com_custo', ROUND(COALESCE(SUM(bruto) FILTER (WHERE custo_unitario IS NOT NULL), 0), 2),
            'sem_custo', COUNT(*) FILTER (WHERE custo_unitario IS NULL)
          ) AS x
          FROM itens GROUP BY id_produto, nome, unidade_venda
        ) t
      ), '[]'::jsonb)
    )
    FROM itens
  );
END;
$$;
REVOKE ALL ON FUNCTION fn_relatorio_vendas_produtos(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_produtos(UUID, DATE, DATE) TO authenticated;
