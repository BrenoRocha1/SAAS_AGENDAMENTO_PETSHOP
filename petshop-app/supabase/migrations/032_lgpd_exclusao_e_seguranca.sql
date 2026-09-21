-- ============================================================
-- PETSHOP SaaS - Migration 032: Conformidade LGPD e Segurança
-- ============================================================
-- 1. LGPD: Direito ao Esquecimento
--    Permitir que clientes excluam suas contas (auth.users)
--    sem serem bloqueados pelos agendamentos existentes, 
--    mantendo o histórico financeiro do lojista intacto.
-- ============================================================

-- Remover constraints antigas (RESTRICT)
ALTER TABLE agendamento DROP CONSTRAINT IF EXISTS agendamento_id_cliente_fkey;
ALTER TABLE agendamento DROP CONSTRAINT IF EXISTS agendamento_id_pet_fkey;

-- Tornar as colunas anuláveis para preservar o registro caso o titular seja excluído
ALTER TABLE agendamento ALTER COLUMN id_cliente DROP NOT NULL;
ALTER TABLE agendamento ALTER COLUMN id_pet DROP NOT NULL;

-- Recriar as constraints com ON DELETE SET NULL
ALTER TABLE agendamento 
  ADD CONSTRAINT agendamento_id_cliente_fkey 
  FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE SET NULL;

ALTER TABLE agendamento 
  ADD CONSTRAINT agendamento_id_pet_fkey 
  FOREIGN KEY (id_pet) REFERENCES pet(id_pet) ON DELETE SET NULL;


-- ============================================================
-- 2. SEGURANÇA: Impedir Mass Assignment no RLS de Agendamento
--    Restringir clientes e lojistas de transferirem agendamentos
--    para outros IDs, corrompendo relatórios.
-- ============================================================

-- 2.1 O Cliente já utiliza a RPC fn_cancelar_agendamento (que roda em bypass de RLS via SECURITY DEFINER)
-- Portanto, podemos e DEVEMOS remover a permissão de UPDATE direta da tabela para o cliente,
-- fechando de vez qualquer vetor de ataque de Mass Assignment pelo app cliente.
DROP POLICY IF EXISTS "agendamento: cliente cancela proprio" ON agendamento;

-- 2.2 O Lojista/Funcionário precisa de UPDATE (para remarcar data, alterar status, etc).
-- Para proteger a integridade, criamos um trigger que bloqueia explicitamente a alteração de chaves estrangeiras cruciais.
-- Se um lojista precisa trocar o cliente ou serviço, ele deve cancelar o agendamento atual e criar um novo.

CREATE OR REPLACE FUNCTION fn_agendamento_no_mass_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Impede alteração de relacionamentos críticos de um agendamento já existente
  IF OLD.id_cliente IS DISTINCT FROM NEW.id_cliente OR
     OLD.id_pet IS DISTINCT FROM NEW.id_pet OR
     OLD.id_servico IS DISTINCT FROM NEW.id_servico OR
     OLD.id_lojista IS DISTINCT FROM NEW.id_lojista
  THEN
    RAISE EXCEPTION 'Acesso negado: Não é permitido alterar o Cliente, Pet, Serviço ou Lojista de um agendamento existente. Por favor, cancele este e crie um novo.';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_block_mass_assignment ON agendamento;
CREATE TRIGGER trg_agendamento_block_mass_assignment
  BEFORE UPDATE ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_agendamento_no_mass_assignment();

-- ============================================================
-- 3. SEGURANÇA: Corrigir IDOR na Edge Function do Lojista
-- ============================================================
-- Atualizar a RPC para garantir que o cliente informado realmente
-- tenha vínculo/exista na base de dados (para impedir que lojistas 
-- agendem clientes globais aleatórios).

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
  -- Somente o próprio lojista autenticado (ou funcionário autorizado)
  IF auth.uid() != p_id_lojista THEN
    -- Fallback para verificar se é um funcionário do lojista com permissão
    IF NOT EXISTS (
       SELECT 1 FROM funcionario 
       WHERE id_funcionario = auth.uid() 
         AND id_lojista = p_id_lojista 
         AND ativo = TRUE 
         AND pode_gerenciar_agenda = TRUE
    ) THEN
      RAISE EXCEPTION 'Acesso não autorizado';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  -- Buscar preço e duração do serviço
  SELECT preco, duracao
  INTO v_preco, v_duracao
  FROM servico
  WHERE id_servico = p_id_servico
    AND id_lojista = p_id_lojista
    AND status = 'Ativo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  -- Verificar conflito de horário
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
    RAISE EXCEPTION 'Horário não disponível. Há conflito com outro agendamento.';
  END IF;

  -- Verificar que a data não é passada (opcional para lojistas inserindo histórico, mas mantido por segurança padrão)
  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  -- Segurança LGPD/IDOR: Garantir que o pet pertence ao cliente
  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet
      AND id_cliente = p_id_cliente
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence a este cliente';
  END IF;

  -- Inserir o agendamento já Confirmado
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
