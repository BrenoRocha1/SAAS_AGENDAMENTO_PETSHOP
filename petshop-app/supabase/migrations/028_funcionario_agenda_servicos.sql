-- ============================================================
-- PETSHOP SaaS - Migration 028: Funcionário usa o mesmo painel do
-- lojista (Agenda + Serviços), limitado pelas permissões dele
-- ============================================================
-- Contexto: até aqui existia um /funcionario/dashboard separado, bem
-- mais simples que o painel do lojista (só um resumo do dia, sem
-- nenhuma ação de verdade). Pedido: o funcionário passa a usar as
-- MESMAS telas que o lojista usa (/lojista/agendamentos, /lojista/kanban,
-- /lojista/servicos), só que limitado às permissões que ele já tem
-- (pode_gerenciar_agenda / pode_gerenciar_servicos).
--
-- A migration 006 (RLS funcionário) já cobria BOA PARTE disso — SELECT
-- em servico/agendamento/cliente/pet/horario e UPDATE em servico/
-- agendamento, tudo gated por permissão, e o helper auth_lojista_id()
-- (retorna o id do lojista tanto se quem chama É o lojista quanto se é
-- um funcionário dele). Faltavam só as pontas que dependiam de RPCs
-- SECURITY DEFINER com "IF auth.uid() != p_id_lojista" — essas nunca
-- passavam pra um funcionário (o uid dele nunca é igual ao do lojista),
-- e duas tabelas sem nenhuma policy de funcionário ainda.
--
-- Como aplicativo (src/lib/actions.ts) resolve o id_lojista antes de
-- chamar essas funções, sempre é esse "id_lojista de verdade" que chega
-- aqui como p_id_lojista — nunca o auth.uid() do funcionário.
-- ============================================================

-- ============================================================
-- 1) fn_criar_agendamento_lojista — aceita funcionário com
--    pode_gerenciar_agenda, além do próprio lojista
-- ============================================================
CREATE OR REPLACE FUNCTION fn_criar_agendamento_lojista(
  p_id_lojista    UUID,
  p_id_cliente    UUID,
  p_id_pet        UUID,
  p_id_servico    UUID,
  p_data          DATE,
  p_hora          TIME,
  p_obs           TEXT DEFAULT NULL
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
BEGIN
  IF auth_lojista_id() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid() AND pode_gerenciar_agenda = TRUE AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar a agenda';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
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

  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet
      AND id_cliente = p_id_cliente
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente informado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cliente_lojista
    WHERE id_lojista = p_id_lojista
      AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'Este cliente ainda não possui histórico no seu petshop';
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

  v_preco := fn_calcular_preco_servico(p_id_servico, p_id_pet);

  INSERT INTO agendamento (
    id_pet, id_servico, id_cliente, id_lojista,
    dt_agendamento, hr_agendamento, valor, status, obs
  )
  VALUES (
    p_id_pet, p_id_servico, p_id_cliente, p_id_lojista,
    p_data, p_hora, v_preco, 'Confirmado', p_obs
  )
  RETURNING id_agendamento INTO v_id_agendamento;

  RETURN v_id_agendamento;
END;
$$;

-- ============================================================
-- 2) fn_cancelar_agendamento — aceita funcionário com
--    pode_gerenciar_agenda, além de cliente e lojista
-- ============================================================
CREATE OR REPLACE FUNCTION fn_cancelar_agendamento(
  p_id_agendamento  UUID,
  p_motivo          TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_cliente    UUID;
  v_id_lojista    UUID;
  v_status        status_agendamento;
  v_cancelado_por TEXT;
BEGIN
  SELECT id_cliente, id_lojista, status
  INTO v_id_cliente, v_id_lojista, v_status
  FROM agendamento
  WHERE id_agendamento = p_id_agendamento
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF auth.uid() = v_id_cliente THEN
    v_cancelado_por := 'cliente';
  ELSIF auth.uid() = v_id_lojista THEN
    v_cancelado_por := 'lojista';
  ELSIF auth_role() = 'funcionario' AND auth_lojista_id() = v_id_lojista AND EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid() AND pode_gerenciar_agenda = TRUE AND ativo = TRUE
  ) THEN
    v_cancelado_por := 'funcionario';
  ELSE
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF v_status IN ('Cancelado', 'Concluído') THEN
    RAISE EXCEPTION 'Agendamento com status "%" não pode ser cancelado', v_status;
  END IF;

  UPDATE agendamento
  SET
    status = 'Cancelado',
    cancelado_por = v_cancelado_por,
    motivo_cancelamento = p_motivo
  WHERE id_agendamento = p_id_agendamento;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 3) fn_criar_pet_lojista — aceita funcionário com
--    pode_gerenciar_agenda (cadastro de pet embutido no fluxo de "Novo
--    Agendamento", pra um cliente que ainda não tem pet cadastrado)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_criar_pet_lojista(
  p_id_lojista  UUID,
  p_id_cliente  UUID,
  p_nome        TEXT,
  p_raca        TEXT,
  p_sexo        TEXT,
  p_especie     especie_pet DEFAULT NULL,
  p_porte       porte_pet DEFAULT NULL,
  p_dt_nasc     DATE DEFAULT NULL,
  p_peso        NUMERIC DEFAULT NULL,
  p_obs         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_pet UUID;
BEGIN
  IF auth_lojista_id() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid() AND pode_gerenciar_agenda = TRUE AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar a agenda';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cliente_lojista
    WHERE id_lojista = p_id_lojista AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'Este cliente não está vinculado ao seu petshop';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 1 THEN
    RAISE EXCEPTION 'Nome do pet inválido';
  END IF;

  IF p_sexo NOT IN ('Macho', 'Fêmea') THEN
    RAISE EXCEPTION 'Sexo do pet inválido';
  END IF;

  INSERT INTO pet (id_cliente, nome, raca, sexo, especie, porte, dt_nasc, peso, obs)
  VALUES (p_id_cliente, trim(p_nome), trim(p_raca), p_sexo::sexo_pet, p_especie, p_porte, p_dt_nasc, p_peso, NULLIF(trim(p_obs), ''))
  RETURNING id_pet INTO v_id_pet;

  RETURN v_id_pet;
END;
$$;

-- ============================================================
-- 4) cliente_lojista: funcionário também enxerga os vínculos do seu
--    lojista (precisa pra listar tutores no "Novo Agendamento")
-- ============================================================
DROP POLICY IF EXISTS "cliente_lojista: funcionario ve" ON cliente_lojista;
CREATE POLICY "cliente_lojista: funcionario ve"
  ON cliente_lojista FOR SELECT
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
  );

-- ============================================================
-- 5) servico_variacao: funcionário com pode_gerenciar_servicos também
--    gerencia (mesma regra de permissão já usada em `servico`)
-- ============================================================
DROP POLICY IF EXISTS "servico_variacao: funcionario insere" ON servico_variacao;
CREATE POLICY "servico_variacao: funcionario insere"
  ON servico_variacao FOR INSERT
  WITH CHECK (
    auth_role() = 'funcionario'
    AND EXISTS (
      SELECT 1 FROM servico s
      WHERE s.id_servico = servico_variacao.id_servico
        AND s.id_lojista = auth_lojista_id()
    )
    AND EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND pode_gerenciar_servicos = TRUE AND ativo = TRUE
    )
  );

DROP POLICY IF EXISTS "servico_variacao: funcionario deleta" ON servico_variacao;
CREATE POLICY "servico_variacao: funcionario deleta"
  ON servico_variacao FOR DELETE
  USING (
    auth_role() = 'funcionario'
    AND EXISTS (
      SELECT 1 FROM servico s
      WHERE s.id_servico = servico_variacao.id_servico
        AND s.id_lojista = auth_lojista_id()
    )
    AND EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND pode_gerenciar_servicos = TRUE AND ativo = TRUE
    )
  );
