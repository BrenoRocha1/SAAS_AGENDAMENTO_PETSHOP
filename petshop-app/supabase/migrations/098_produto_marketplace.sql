-- ============================================================
-- PETSHOP SaaS - Migration 098: produtos no marketplace
-- ============================================================
-- Na tela Petshops da conta do cliente entra a busca de produtos: o
-- cliente procura um produto e vê em quais petshops ele está à venda.
-- Cada produto só aparece ali quando a loja liga "Ativo para vendas no
-- marketplace" no cadastro do produto — desligado por padrão, então nada
-- do que já existe aparece sem a loja escolher.
--
-- Leitura: só cliente logado (a tela fica dentro da conta), só produto
-- ativo, não excluído e de loja ativa. Mesma ideia da policy de produtos
-- do agendamento online (migration 039). Custo do produto continua em
-- produto_custo, que essa policy não abre.
--
-- Pode rodar de novo sem problema.
-- ============================================================

ALTER TABLE produto ADD COLUMN IF NOT EXISTS disponivel_marketplace BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "produto: clientes veem os do marketplace" ON produto;
CREATE POLICY "produto: clientes veem os do marketplace"
  ON produto FOR SELECT
  TO authenticated
  USING (
    status = 'Ativo'
    AND disponivel_marketplace = TRUE
    AND excluido_em IS NULL
    AND EXISTS (SELECT 1 FROM lojista l WHERE l.id_lojista = produto.id_lojista AND l.ativo = TRUE)
  );

CREATE INDEX IF NOT EXISTS idx_produto_marketplace
  ON produto (id_lojista, nome)
  WHERE disponivel_marketplace = TRUE AND status = 'Ativo' AND excluido_em IS NULL;
