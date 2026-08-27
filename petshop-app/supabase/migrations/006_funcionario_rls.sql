-- ============================================================
-- PETSHOP SaaS - Migration 006: RLS para funcionário
-- Defense in Depth — Nível enterprise
-- ============================================================

-- Habilitar e forçar RLS
ALTER TABLE funcionario ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionario FORCE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER: obter id_lojista do funcionário logado
-- Performance: evita JOINs repetidos nas policies
-- ============================================================
CREATE OR REPLACE FUNCTION auth_lojista_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Se é lojista, o id dele é o id_lojista
    CASE WHEN (auth.jwt() -> 'user_metadata' ->> 'role') = 'lojista'
         THEN auth.uid()
    END,
    -- Se é funcionário, busca o id_lojista do registro
    (SELECT id_lojista FROM funcionario WHERE id_funcionario = auth.uid() AND ativo = TRUE)
  );
$$;

-- ============================================================
-- POLÍTICAS: funcionario
-- ============================================================

-- Funcionário vê apenas seu próprio registro
CREATE POLICY "funcionario: select proprio"
  ON funcionario FOR SELECT
  USING (id_funcionario = auth.uid());

-- Lojista vê todos os funcionários do seu petshop
CREATE POLICY "funcionario: lojista ve seus funcionarios"
  ON funcionario FOR SELECT
  USING (
    id_lojista = auth.uid()
    AND auth_role() = 'lojista'
  );

-- Apenas lojista pode inserir funcionário no seu petshop
CREATE POLICY "funcionario: lojista insere"
  ON funcionario FOR INSERT
  WITH CHECK (
    id_lojista = auth.uid()
    AND auth_role() = 'lojista'
  );

-- Apenas lojista dono pode editar funcionários do seu petshop
CREATE POLICY "funcionario: lojista edita"
  ON funcionario FOR UPDATE
  USING (
    id_lojista = auth.uid()
    AND auth_role() = 'lojista'
  )
  WITH CHECK (
    id_lojista = auth.uid()
    AND auth_role() = 'lojista'
  );

-- Nenhum usuário pode deletar registro de funcionário via API
-- (apenas soft delete via ativo = false)
CREATE POLICY "funcionario: no delete"
  ON funcionario FOR DELETE
  USING (FALSE);

-- ============================================================
-- POLÍTICAS ADICIONAIS: Funcionário acessa dados do petshop
-- ============================================================

-- Funcionário pode ver serviços do seu lojista
CREATE POLICY "servico: funcionario ve servicos do lojista"
  ON servico FOR SELECT
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
  );

-- Funcionário com permissão pode gerenciar serviços
CREATE POLICY "servico: funcionario gerencia servicos"
  ON servico FOR INSERT
  WITH CHECK (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid()
      AND pode_gerenciar_servicos = TRUE
      AND ativo = TRUE
    )
  );

CREATE POLICY "servico: funcionario edita servicos"
  ON servico FOR UPDATE
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid()
      AND pode_gerenciar_servicos = TRUE
      AND ativo = TRUE
    )
  )
  WITH CHECK (
    id_lojista = auth_lojista_id()
  );

-- Funcionário pode ver agendamentos do petshop
CREATE POLICY "agendamento: funcionario ve do petshop"
  ON agendamento FOR SELECT
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid()
      AND pode_gerenciar_agenda = TRUE
      AND ativo = TRUE
    )
  );

-- Funcionário com permissão pode atualizar status de agendamentos
CREATE POLICY "agendamento: funcionario gerencia"
  ON agendamento FOR UPDATE
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid()
      AND pode_gerenciar_agenda = TRUE
      AND ativo = TRUE
    )
  )
  WITH CHECK (
    id_lojista = auth_lojista_id()
  );

-- Funcionário pode ver clientes que agendaram no petshop
CREATE POLICY "cliente: funcionario ve clientes do petshop"
  ON cliente FOR SELECT
  USING (
    auth_role() = 'funcionario'
    AND id_cliente IN (
      SELECT DISTINCT id_cliente
      FROM agendamento
      WHERE id_lojista = auth_lojista_id()
    )
  );

-- Funcionário pode ver pets atendidos no petshop
CREATE POLICY "pet: funcionario ve pets do petshop"
  ON pet FOR SELECT
  USING (
    auth_role() = 'funcionario'
    AND id_pet IN (
      SELECT DISTINCT id_pet
      FROM agendamento
      WHERE id_lojista = auth_lojista_id()
    )
  );

-- Funcionário pode ver horários do petshop
CREATE POLICY "horario: funcionario ve horarios"
  ON horario FOR SELECT
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
  );
