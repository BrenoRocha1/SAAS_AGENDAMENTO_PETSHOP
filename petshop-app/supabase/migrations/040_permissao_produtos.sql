-- ============================================================
-- PETSHOP SaaS - Migration 040: Permissão dedicada "Gerenciar Produtos"
-- + exclusão de produto não trava mais por ter estoque/movimentação
-- ============================================================
-- Duas mudanças pedidas depois de a tela de Produtos/Estoque virar uma
-- área com peso próprio (categorias, foto, estoque, venda no agendamento
-- online):
--
-- 1) Produtos deixa de reaproveitar pode_gerenciar_servicos (decisão da
--    migration 037 — "os dois são o catálogo que a loja vende") e ganha
--    permissão própria: pode_gerenciar_produtos. Nem todo funcionário que
--    mexe em Serviços deveria necessariamente também mexer no estoque, e
--    vice-versa.
--
-- 2) Excluir produto não trava mais só por ter movimentação de estoque
--    registrada. A trava fazia sentido quando o "histórico" era tudo que
--    se tinha pra decidir, mas na prática só atrapalhava (um produto
--    cadastrado errado, com um único ajuste de estoque, nunca mais podia
--    ser excluído — só "Inativo"). movimento_estoque já tem ON DELETE
--    CASCADE em produto (migration 037), então o histórico dele some
--    junto, de propósito. agendamento_produto (migration 039) continua
--    com ON DELETE RESTRICT — apagar um produto já vendido de verdade
--    pelo agendamento online ainda barra com erro, porque isso quebraria
--    o histórico de compras do cliente (ver excluirProdutoAction, catch
--    do código 23503).
-- ============================================================

ALTER TABLE funcionario ADD COLUMN IF NOT EXISTS pode_gerenciar_produtos BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 1) produto — insere/edita passam a checar pode_gerenciar_produtos;
--    exclusão perde a trava de "tem movimentação de estoque"
-- ============================================================
DROP POLICY IF EXISTS "produto: funcionario insere" ON produto;
CREATE POLICY "produto: funcionario insere"
  ON produto FOR INSERT
  WITH CHECK (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND (pode_gerenciar_produtos = TRUE OR acesso_total = TRUE) AND ativo = TRUE
    )
  );

DROP POLICY IF EXISTS "produto: funcionario edita" ON produto;
CREATE POLICY "produto: funcionario edita"
  ON produto FOR UPDATE
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND (pode_gerenciar_produtos = TRUE OR acesso_total = TRUE) AND ativo = TRUE
    )
  )
  WITH CHECK (id_lojista = auth_lojista_id());

-- Exclusão continua só lojista/administrador (mesma regra de sempre, ver
-- excluirProdutoAction) — só perde o "AND NOT EXISTS movimento_estoque".
DROP POLICY IF EXISTS "produto: lojista deleta proprio" ON produto;
CREATE POLICY "produto: lojista deleta proprio"
  ON produto FOR DELETE
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista');

-- ============================================================
-- 2) categoria_produto — mesma permissão nova (é gerenciado na mesma
--    tela de Produtos)
-- ============================================================
DROP POLICY IF EXISTS "categoria_produto: funcionario insere" ON categoria_produto;
CREATE POLICY "categoria_produto: funcionario insere"
  ON categoria_produto FOR INSERT
  WITH CHECK (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND (pode_gerenciar_produtos = TRUE OR acesso_total = TRUE) AND ativo = TRUE)
  );

DROP POLICY IF EXISTS "categoria_produto: funcionario edita" ON categoria_produto;
CREATE POLICY "categoria_produto: funcionario edita"
  ON categoria_produto FOR UPDATE
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND (pode_gerenciar_produtos = TRUE OR acesso_total = TRUE) AND ativo = TRUE)
  )
  WITH CHECK (id_lojista = auth_lojista_id());

DROP POLICY IF EXISTS "categoria_produto: funcionario deleta" ON categoria_produto;
CREATE POLICY "categoria_produto: funcionario deleta"
  ON categoria_produto FOR DELETE
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND (pode_gerenciar_produtos = TRUE OR acesso_total = TRUE) AND ativo = TRUE)
  );

-- ============================================================
-- 3) fn_movimentar_estoque — idem (mesma assinatura, só troca a checagem)
-- ============================================================
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
      AND (pode_gerenciar_produtos = TRUE OR acesso_total = TRUE)
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

-- ============================================================
-- 4) fn_registrar_funcionario — ganha o parâmetro p_pode_produtos
--    (assinatura muda: precisa DROP antes do CREATE OR REPLACE, ver
--    convenção já usada nas migrations 029/039)
-- ============================================================
DROP FUNCTION IF EXISTS fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION fn_registrar_funcionario(
  p_id_funcionario      UUID,
  p_id_lojista          UUID,
  p_nome                TEXT,
  p_email               TEXT,
  p_telefone            TEXT,
  p_cargo               TEXT DEFAULT NULL,
  p_pode_agenda         BOOLEAN DEFAULT TRUE,
  p_pode_servicos       BOOLEAN DEFAULT FALSE,
  p_pode_clientes_pets  BOOLEAN DEFAULT FALSE,
  p_acesso_total        BOOLEAN DEFAULT FALSE,
  p_pode_produtos       BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado: apenas o lojista ou um administrador pode cadastrar membros';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 2 THEN
    RAISE EXCEPTION 'Nome do membro inválido';
  END IF;

  IF p_email IS NULL OR p_email !~* '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  IF p_telefone IS NULL OR p_telefone !~ '^\d{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  IF EXISTS (SELECT 1 FROM funcionario WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como funcionário';
  END IF;

  IF EXISTS (SELECT 1 FROM lojista WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como lojista';
  END IF;

  IF EXISTS (SELECT 1 FROM cliente WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como cliente';
  END IF;

  -- acesso_total = TRUE além disso tudo: o trigger fn_bloquear_acesso_
  -- total_por_funcionario já recusa se quem está chamando não é o
  -- lojista de verdade, mesmo que este INSERT chegue aqui.
  INSERT INTO funcionario (
    id_funcionario,
    id_lojista,
    nome,
    email,
    telefone,
    cargo,
    pode_gerenciar_agenda,
    pode_gerenciar_servicos,
    pode_gerenciar_clientes_pets,
    acesso_total,
    pode_gerenciar_produtos
  ) VALUES (
    p_id_funcionario,
    p_id_lojista,
    trim(p_nome),
    lower(trim(p_email)),
    p_telefone,
    NULLIF(trim(p_cargo), ''),
    p_pode_agenda,
    p_pode_servicos,
    p_pode_clientes_pets,
    p_acesso_total,
    p_pode_produtos
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
