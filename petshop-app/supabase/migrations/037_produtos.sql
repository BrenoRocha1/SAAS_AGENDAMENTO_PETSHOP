-- ============================================================
-- PETSHOP SaaS - Migration 037: Produtos vendidos pela loja
-- ============================================================
-- Catálogo simples de produtos (ração, brinquedos, higiene, acessórios,
-- ...) com preço, unidade de venda e um controle de estoque BÁSICO —
-- de propósito, nada de custo médio, lote, fornecedor ou NF. A loja só
-- precisa saber quanto tem, quanto vale e quando está acabando.
--
-- Decisões de modelagem (mesmo raciocínio da migration 034/036):
--
-- • `produto` reaproveita o enum status_servico ('Ativo'/'Inativo') que
--   já existe pra serviço — é o mesmo conceito (item do catálogo que
--   pode ficar temporariamente indisponível sem apagar o cadastro), não
--   faz sentido criar um segundo enum com os mesmos dois valores.
--
-- • Estoque é NUMERIC(10,3), não INTEGER: produtos vendidos por kg/litro
--   ficam com quantidade fracionária (12,5 kg), e um produto por
--   unidade continua funcionando normal (8 vira 8.000).
--
-- • Criar/editar/ativar-desativar um produto é escrita DIRETA na tabela
--   (igual `servico`) — RLS de INSERT/UPDATE já garante dono + permissão,
--   sem precisar de função SECURITY DEFINER pra isso.
--
-- • JÁ movimentar estoque (+ entrada / - saída) precisa ser atômico:
--   atualizar produto.estoque_atual E registrar a movimentação no mesmo
--   instante, sem deixar brecha pra um crash no meio deixar um dos dois
--   sem acontecer. Por isso `movimento_estoque` não tem NENHUMA policy
--   de INSERT/UPDATE/DELETE — a única porta de entrada é a função
--   fn_movimentar_estoque abaixo (mesma ideia de "audit_log: no insert
--   direto"). É também o único lugar preparado pra, no futuro, uma venda
--   dar baixa automática no estoque: basta chamar a mesma função com
--   origem='venda' e id_referencia apontando pro item vendido.
--
-- • Permissão reaproveitada: quem já pode gerenciar Serviços
--   (pode_gerenciar_servicos) também gerencia Produtos. Não criamos uma
--   nova permissão de equipe pra isso — os dois são "o catálogo que a
--   loja vende", e a tela de Equipe já está no limite do que faz sentido
--   sem virar uma matriz de permissões complicada demais pra um petshop
--   pequeno. Exclusão continua sendo só lojista/administrador (mesma
--   regra de excluirServicoAction).
--
-- • Toda checagem de dono/loja usa IS DISTINCT FROM, não != (ver
--   migration 035 pra o motivo: != com NULL nunca dispara a exceção).
-- ============================================================

CREATE TABLE IF NOT EXISTS produto (
  id_produto      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  nome            TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 100),
  categoria       TEXT NOT NULL CHECK (categoria IN ('Ração', 'Brinquedos', 'Higiene', 'Acessórios', 'Outros')),
  unidade_venda   TEXT NOT NULL CHECK (unidade_venda IN ('unidade', 'kg', 'litro', 'caixa', 'pacote')),
  preco_venda     NUMERIC(10,2) NOT NULL CHECK (preco_venda >= 0),
  estoque_atual   NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (estoque_atual >= 0),
  estoque_minimo  NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  status          status_servico NOT NULL DEFAULT 'Ativo',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produto_lojista   ON produto(id_lojista);
CREATE INDEX IF NOT EXISTS idx_produto_status    ON produto(id_lojista, status);
CREATE INDEX IF NOT EXISTS idx_produto_categoria ON produto(id_lojista, categoria);

DROP TRIGGER IF EXISTS trg_produto_updated_at ON produto;
CREATE TRIGGER trg_produto_updated_at
  BEFORE UPDATE ON produto
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Histórico de entradas/saídas de estoque — livro-razão, nunca editado
-- nem apagado (só inserido, e só pela função fn_movimentar_estoque).
CREATE TABLE IF NOT EXISTS movimento_estoque (
  id_movimento  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_produto    UUID NOT NULL REFERENCES produto(id_produto) ON DELETE CASCADE,
  -- Denormalizado (mesma ideia de agendamento.id_lojista): RLS direta,
  -- sem JOIN em produto pra cada leitura do histórico.
  id_lojista    UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  quantidade    NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
  motivo        TEXT CHECK (char_length(motivo) <= 200),
  -- 'manual' = ajuste feito na tela de Produtos. 'venda' é o ponto de
  -- integração futura: quando existir uma venda/item vendido de verdade,
  -- a baixa de estoque grava aqui com origem='venda' — nenhuma coluna
  -- nova vai ser necessária nesta tabela pra isso.
  origem        TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'venda')),
  -- Sem FK de propósito: a tabela de venda ainda não existe. Quando
  -- existir, passa a apontar pra ela; até lá é só um id solto pra rastreio.
  id_referencia UUID,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimento_estoque_produto ON movimento_estoque(id_produto, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movimento_estoque_lojista ON movimento_estoque(id_lojista, created_at DESC);

-- ============================================================
-- RLS — produto
-- ============================================================
ALTER TABLE produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produto: lojista ve todos seus produtos" ON produto;
CREATE POLICY "produto: lojista ve todos seus produtos"
  ON produto FOR SELECT
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista');

DROP POLICY IF EXISTS "produto: funcionario ve produtos do lojista" ON produto;
CREATE POLICY "produto: funcionario ve produtos do lojista"
  ON produto FOR SELECT
  USING (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id());

DROP POLICY IF EXISTS "produto: lojista insere" ON produto;
CREATE POLICY "produto: lojista insere"
  ON produto FOR INSERT
  WITH CHECK (id_lojista = auth.uid() AND auth_role() = 'lojista');

DROP POLICY IF EXISTS "produto: funcionario insere" ON produto;
CREATE POLICY "produto: funcionario insere"
  ON produto FOR INSERT
  WITH CHECK (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND pode_gerenciar_servicos = TRUE AND ativo = TRUE
    )
  );

DROP POLICY IF EXISTS "produto: lojista edita proprio" ON produto;
CREATE POLICY "produto: lojista edita proprio"
  ON produto FOR UPDATE
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista')
  WITH CHECK (id_lojista = auth.uid());

DROP POLICY IF EXISTS "produto: funcionario edita" ON produto;
CREATE POLICY "produto: funcionario edita"
  ON produto FOR UPDATE
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND pode_gerenciar_servicos = TRUE AND ativo = TRUE
    )
  )
  WITH CHECK (id_lojista = auth_lojista_id());

-- Só lojista exclui (mesma regra de "servico: lojista deleta proprio") —
-- um administrador exclui pelo client admin/service_role, checado em
-- código (ver excluirProdutoAction), porque nenhuma dessas ações
-- sensíveis tem policy própria pra funcionário. E só se não houver
-- movimentação registrada: havendo histórico, o caminho é "Inativo".
DROP POLICY IF EXISTS "produto: lojista deleta proprio" ON produto;
CREATE POLICY "produto: lojista deleta proprio"
  ON produto FOR DELETE
  USING (
    id_lojista = auth.uid()
    AND auth_role() = 'lojista'
    AND NOT EXISTS (SELECT 1 FROM movimento_estoque m WHERE m.id_produto = produto.id_produto)
  );

-- ============================================================
-- RLS — movimento_estoque (só leitura; escrita é só fn_movimentar_estoque)
-- ============================================================
ALTER TABLE movimento_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimento_estoque FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimento_estoque: lojista ve da loja" ON movimento_estoque;
CREATE POLICY "movimento_estoque: lojista ve da loja"
  ON movimento_estoque FOR SELECT
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista');

DROP POLICY IF EXISTS "movimento_estoque: funcionario ve da loja" ON movimento_estoque;
CREATE POLICY "movimento_estoque: funcionario ve da loja"
  ON movimento_estoque FOR SELECT
  USING (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id());

-- ============================================================
-- FUNÇÃO: movimentar estoque (adicionar ou remover), de forma atômica
-- ============================================================
-- Único caminho de escrita em movimento_estoque, e também quem atualiza
-- produto.estoque_atual — as duas coisas acontecem juntas ou nenhuma
-- acontece. Serve tanto pro botão "+/- estoque" da tela de Produtos
-- (origem='manual') quanto, no futuro, pra baixa automática de uma venda
-- (origem='venda', id_referencia = id do item vendido).
CREATE OR REPLACE FUNCTION fn_movimentar_estoque(
  p_id_produto    UUID,
  p_tipo          TEXT,
  p_quantidade    NUMERIC,
  p_motivo        TEXT DEFAULT NULL,
  p_origem        TEXT DEFAULT 'manual',
  p_id_referencia UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto      produto%ROWTYPE;
  v_novo_estoque NUMERIC(10,3);
BEGIN
  IF p_tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido';
  END IF;

  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade maior que zero';
  END IF;

  SELECT * INTO v_produto FROM produto WHERE id_produto = p_id_produto FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM v_produto.id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid()
      AND (pode_gerenciar_servicos = TRUE OR acesso_total = TRUE)
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar produtos';
  END IF;

  v_novo_estoque := v_produto.estoque_atual + CASE WHEN p_tipo = 'entrada' THEN p_quantidade ELSE -p_quantidade END;
  IF v_novo_estoque < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente: só há % % em estoque', v_produto.estoque_atual, v_produto.unidade_venda;
  END IF;

  UPDATE produto SET estoque_atual = v_novo_estoque WHERE id_produto = p_id_produto;

  INSERT INTO movimento_estoque (id_produto, id_lojista, tipo, quantidade, motivo, origem, id_referencia, created_by)
  VALUES (
    p_id_produto, v_produto.id_lojista, p_tipo, p_quantidade,
    NULLIF(btrim(COALESCE(p_motivo, '')), ''), COALESCE(NULLIF(btrim(p_origem), ''), 'manual'),
    p_id_referencia, auth.uid()
  );

  RETURN v_novo_estoque;
END;
$$;

REVOKE ALL ON FUNCTION fn_movimentar_estoque(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_movimentar_estoque(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID) TO authenticated;
