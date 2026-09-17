-- ============================================================
-- PETSHOP SaaS - Migration 030: Administrador (funcionário com
-- acesso_total) passa a enxergar os outros membros da equipe
-- ============================================================
--
-- A tabela funcionario só tinha duas policies de SELECT (migration 006):
-- "select proprio" (cada funcionário só vê o próprio registro) e
-- "lojista ve seus funcionarios" (só o responsável pela conta vê todos).
-- Isso significa que um administrador (funcionário com acesso_total = TRUE,
-- migration 029) que acessa /lojista/equipe só enxergava a própria linha —
-- o RLS bloqueava silenciosamente as demais, mesmo com a UI liberada.
--
-- Esta policy dá ao administrador a mesma visão do lojista sobre a tabela
-- funcionario, sem afetar quem não tem acesso_total.

CREATE POLICY "funcionario: administrador ve equipe"
  ON funcionario FOR SELECT
  USING (
    auth_role() = 'funcionario'
    AND EXISTS (
      SELECT 1 FROM funcionario admin
      WHERE admin.id_funcionario = auth.uid()
        AND admin.ativo = TRUE
        AND admin.acesso_total = TRUE
        AND admin.id_lojista = funcionario.id_lojista
    )
  );
