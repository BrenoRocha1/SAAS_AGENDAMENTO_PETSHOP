-- ============================================================
-- PETSHOP SaaS - Migration 031: Funcionário passa a enxergar os
-- dados básicos do próprio lojista (nome da loja e e-mail)
-- ============================================================
--
-- A tabela lojista só tinha 3 policies de SELECT: "select proprio" (o
-- próprio lojista), "clientes podem ver lojas ativas" (role cliente) e
-- "acesso publico as lojas ativas" (role anon, migration 023). Nenhuma
-- cobria um funcionário lendo os dados do lojista pro qual ele trabalha.
--
-- Na prática isso já quebrava algo existente: o layout do painel
-- (/lojista/layout.tsx) busca nome_loja pra mostrar na sidebar de
-- qualquer usuário logado ali (lojista OU funcionário) — pra um
-- funcionário, essa busca sempre vinha vazia e caía no fallback "Meu
-- Petshop" em vez do nome real da loja.
--
-- Esta policy também é o que permite a tela de Equipe mostrar o
-- responsável pela conta (nome da loja + e-mail de cadastro) como um
-- administrador fixo, quando um funcionário administrador acessa a tela.

CREATE POLICY "lojista: funcionario ve seu lojista"
  ON lojista FOR SELECT
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
  );
