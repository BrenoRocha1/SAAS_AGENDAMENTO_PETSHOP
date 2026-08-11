-- ============================================================
-- PETSHOP SaaS - Migration 002: Row Level Security (RLS)
-- Defense in Depth — Nível enterprise
-- ============================================================

-- ============================================================
-- HABILITAR RLS EM TODAS AS TABELAS
-- ============================================================
ALTER TABLE perfil_usuario   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lojista          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet              ENABLE ROW LEVEL SECURITY;
ALTER TABLE servico          ENABLE ROW LEVEL SECURITY;
ALTER TABLE horario          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;

-- Forçar RLS mesmo para table owner (extra segurança)
ALTER TABLE perfil_usuario   FORCE ROW LEVEL SECURITY;
ALTER TABLE cliente          FORCE ROW LEVEL SECURITY;
ALTER TABLE lojista          FORCE ROW LEVEL SECURITY;
ALTER TABLE pet              FORCE ROW LEVEL SECURITY;
ALTER TABLE servico          FORCE ROW LEVEL SECURITY;
ALTER TABLE horario          FORCE ROW LEVEL SECURITY;
ALTER TABLE agendamento      FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log        FORCE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER: função para obter o role do usuário logado
-- Usa JWT claims para performance (evita JOIN em toda request)
-- ============================================================
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    (SELECT role::TEXT FROM perfil_usuario WHERE id = auth.uid())
  );
$$;

-- ============================================================
-- POLÍTICAS: perfil_usuario
-- ============================================================

-- Usuário vê apenas seu próprio perfil
CREATE POLICY "perfil_usuario: select proprio"
  ON perfil_usuario FOR SELECT
  USING (id = auth.uid());

-- Sistema insere automaticamente via trigger (sem policy de INSERT para usuários)
-- Nenhum usuário pode alterar role diretamente
CREATE POLICY "perfil_usuario: update proprio (somente campos permitidos)"
  ON perfil_usuario FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM perfil_usuario WHERE id = auth.uid()));

-- ============================================================
-- POLÍTICAS: cliente
-- ============================================================

-- Cliente vê apenas seu próprio perfil
CREATE POLICY "cliente: select proprio"
  ON cliente FOR SELECT
  USING (id_cliente = auth.uid());

-- Lojista pode ver dados básicos de clientes que agendaram com ele
CREATE POLICY "cliente: lojista ve clientes do seu petshop"
  ON cliente FOR SELECT
  USING (
    auth_role() = 'lojista'
    AND id_cliente IN (
      SELECT DISTINCT id_cliente
      FROM agendamento
      WHERE id_lojista = auth.uid()
    )
  );

-- Apenas o próprio cliente pode se cadastrar (INSERT)
CREATE POLICY "cliente: insert proprio"
  ON cliente FOR INSERT
  WITH CHECK (id_cliente = auth.uid());

-- Apenas o próprio cliente pode editar seus dados
CREATE POLICY "cliente: update proprio"
  ON cliente FOR UPDATE
  USING (id_cliente = auth.uid())
  WITH CHECK (id_cliente = auth.uid());

-- Nenhum usuário pode deletar registro de cliente via API
-- (apenas via admin no painel Supabase)
CREATE POLICY "cliente: no delete"
  ON cliente FOR DELETE
  USING (FALSE);

-- ============================================================
-- POLÍTICAS: lojista
-- ============================================================

-- Lojista vê apenas seu próprio perfil
CREATE POLICY "lojista: select proprio"
  ON lojista FOR SELECT
  USING (id_lojista = auth.uid());

-- Clientes podem ver lojistas ativos (para descoberta)
CREATE POLICY "lojista: clientes podem ver lojas ativas"
  ON lojista FOR SELECT
  USING (ativo = TRUE AND auth_role() = 'cliente');

-- Lojista insere seu próprio perfil
CREATE POLICY "lojista: insert proprio"
  ON lojista FOR INSERT
  WITH CHECK (id_lojista = auth.uid());

-- Lojista edita apenas seu próprio perfil
CREATE POLICY "lojista: update proprio"
  ON lojista FOR UPDATE
  USING (id_lojista = auth.uid())
  WITH CHECK (id_lojista = auth.uid());

CREATE POLICY "lojista: no delete"
  ON lojista FOR DELETE
  USING (FALSE);

-- ============================================================
-- POLÍTICAS: pet
-- ============================================================

-- Cliente vê apenas seus próprios pets
CREATE POLICY "pet: cliente ve seus pets"
  ON pet FOR SELECT
  USING (id_cliente = auth.uid());

-- Lojista pode ver pets que já foram atendidos em seu petshop
CREATE POLICY "pet: lojista ve pets atendidos"
  ON pet FOR SELECT
  USING (
    auth_role() = 'lojista'
    AND id_pet IN (
      SELECT DISTINCT id_pet
      FROM agendamento
      WHERE id_lojista = auth.uid()
    )
  );

-- Apenas o dono pode cadastrar pet
CREATE POLICY "pet: insert proprio"
  ON pet FOR INSERT
  WITH CHECK (id_cliente = auth.uid());

-- Apenas o dono pode editar pet
CREATE POLICY "pet: update proprio"
  ON pet FOR UPDATE
  USING (id_cliente = auth.uid())
  WITH CHECK (id_cliente = auth.uid());

-- Soft delete apenas (ativo = false) — sem DELETE real
CREATE POLICY "pet: no delete"
  ON pet FOR DELETE
  USING (FALSE);

-- ============================================================
-- POLÍTICAS: servico
-- ============================================================

-- Qualquer usuário autenticado pode ver serviços ativos
CREATE POLICY "servico: usuarios veem servicos ativos"
  ON servico FOR SELECT
  USING (status = 'Ativo');

-- Lojista vê todos os seus serviços (incluindo inativos)
CREATE POLICY "servico: lojista ve todos seus servicos"
  ON servico FOR SELECT
  USING (id_lojista = auth.uid());

-- Apenas lojista pode cadastrar serviço
CREATE POLICY "servico: lojista insere"
  ON servico FOR INSERT
  WITH CHECK (id_lojista = auth.uid() AND auth_role() = 'lojista');

-- Apenas lojista dono pode editar
CREATE POLICY "servico: lojista edita proprio"
  ON servico FOR UPDATE
  USING (id_lojista = auth.uid())
  WITH CHECK (id_lojista = auth.uid());

-- Apenas lojista dono pode deletar (apenas se não houver agendamentos)
CREATE POLICY "servico: lojista deleta proprio"
  ON servico FOR DELETE
  USING (
    id_lojista = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM agendamento
      WHERE id_servico = servico.id_servico
      AND status NOT IN ('Cancelado')
    )
  );

-- ============================================================
-- POLÍTICAS: horario
-- ============================================================

-- Qualquer usuário autenticado pode ver horários ativos
CREATE POLICY "horario: usuarios veem horarios ativos"
  ON horario FOR SELECT
  USING (ativo = TRUE);

-- Lojista vê todos os seus horários
CREATE POLICY "horario: lojista ve todos"
  ON horario FOR SELECT
  USING (id_lojista = auth.uid());

-- Apenas lojista pode gerenciar horários
CREATE POLICY "horario: lojista insere"
  ON horario FOR INSERT
  WITH CHECK (id_lojista = auth.uid() AND auth_role() = 'lojista');

CREATE POLICY "horario: lojista edita proprio"
  ON horario FOR UPDATE
  USING (id_lojista = auth.uid())
  WITH CHECK (id_lojista = auth.uid());

CREATE POLICY "horario: lojista deleta proprio"
  ON horario FOR DELETE
  USING (id_lojista = auth.uid());

-- ============================================================
-- POLÍTICAS: agendamento
-- ============================================================

-- Cliente vê apenas seus próprios agendamentos
CREATE POLICY "agendamento: cliente ve proprio"
  ON agendamento FOR SELECT
  USING (id_cliente = auth.uid());

-- Lojista vê agendamentos do seu petshop
CREATE POLICY "agendamento: lojista ve do petshop"
  ON agendamento FOR SELECT
  USING (id_lojista = auth.uid());

-- Cliente pode criar agendamento
CREATE POLICY "agendamento: cliente insere"
  ON agendamento FOR INSERT
  WITH CHECK (
    id_cliente = auth.uid()
    AND auth_role() = 'cliente'
    -- Garante que o pet pertence ao cliente
    AND EXISTS (
      SELECT 1 FROM pet
      WHERE id_pet = agendamento.id_pet
      AND id_cliente = auth.uid()
      AND ativo = TRUE
    )
    -- Garante que o serviço está ativo
    AND EXISTS (
      SELECT 1 FROM servico
      WHERE id_servico = agendamento.id_servico
      AND id_lojista = agendamento.id_lojista
      AND status = 'Ativo'
    )
  );

-- Cliente pode cancelar apenas seus próprios agendamentos pendentes/confirmados
CREATE POLICY "agendamento: cliente cancela proprio"
  ON agendamento FOR UPDATE
  USING (
    id_cliente = auth.uid()
    AND status IN ('Pendente', 'Confirmado')
  )
  WITH CHECK (
    id_cliente = auth.uid()
    AND status = 'Cancelado'
    AND cancelado_por = 'cliente'
  );

-- Lojista pode atualizar status de agendamentos do seu petshop
CREATE POLICY "agendamento: lojista gerencia"
  ON agendamento FOR UPDATE
  USING (id_lojista = auth.uid())
  WITH CHECK (id_lojista = auth.uid());

-- Nenhum usuário pode deletar agendamentos (apenas cancelar via status)
CREATE POLICY "agendamento: no delete"
  ON agendamento FOR DELETE
  USING (FALSE);

-- ============================================================
-- POLÍTICAS: audit_log
-- ============================================================

-- Lojista pode ver logs de agendamentos do seu petshop
CREATE POLICY "audit_log: lojista ve logs do petshop"
  ON audit_log FOR SELECT
  USING (
    auth_role() = 'lojista'
    AND id_registro IN (
      SELECT id_agendamento FROM agendamento
      WHERE id_lojista = auth.uid()
    )
  );

-- Cliente pode ver logs dos seus agendamentos
CREATE POLICY "audit_log: cliente ve seus logs"
  ON audit_log FOR SELECT
  USING (
    auth_role() = 'cliente'
    AND id_registro IN (
      SELECT id_agendamento FROM agendamento
      WHERE id_cliente = auth.uid()
    )
  );

-- Nenhum usuário pode inserir/editar/deletar diretamente o audit_log
-- (somente via triggers SECURITY DEFINER)
CREATE POLICY "audit_log: no insert direto"
  ON audit_log FOR INSERT
  WITH CHECK (FALSE);
