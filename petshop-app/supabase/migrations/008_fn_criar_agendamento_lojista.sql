-- ============================================================
-- PETSHOP SaaS - Migration 008: fn_criar_agendamento_lojista
-- ============================================================
-- Motivo desta migration:
--   fn_criar_agendamento (003) e a policy "agendamento: cliente insere"
--   (002) só permitem que o PRÓPRIO cliente autenticado crie o seu
--   agendamento (auth.uid() = p_id_cliente / id_cliente). Não existe
--   nenhum caminho para o LOJISTA criar um agendamento manual (walk-in,
--   telefone) em nome de um cliente já existente — nem na RPC, nem via
--   RLS de INSERT em `agendamento`.
--
--   Esta função replica fn_criar_agendamento, mas autoriza o LOJISTA
--   (auth.uid() = p_id_lojista) em vez do cliente, e exige que o pet
--   informado já pertença a um cliente que este lojista pode enxergar
--   (mesma regra da policy "pet: lojista ve pets atendidos": pet já
--   atendido nesse petshop). Isso evita que um lojista crie agendamento
--   para um pet/cliente de fora da sua base.
--
--   Agendamento criado pelo lojista nasce como 'Confirmado' (o dono da
--   loja está confirmando o horário na hora, diferente do fluxo do
--   cliente, que nasce 'Pendente' até o lojista aprovar).
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
  -- Somente o próprio lojista autenticado pode chamar esta função
  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  -- Buscar preço e duração do serviço (com lock) — precisa ser deste lojista
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

  -- O pet precisa pertencer ao cliente informado, estar ativo, e já ter
  -- sido atendido por este lojista (mesma base de "clientes do petshop"
  -- usada na tela de Clientes) — impede criar agendamento para gente de fora
  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet
      AND id_cliente = p_id_cliente
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente informado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM agendamento
    WHERE id_lojista = p_id_lojista
      AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'Este cliente ainda não possui histórico no seu petshop';
  END IF;

  -- Verificar disponibilidade com lock pessimista (mesma lógica de fn_criar_agendamento)
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

  -- Agendamento criado pelo próprio lojista já nasce Confirmado
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

REVOKE ALL ON FUNCTION fn_criar_agendamento_lojista(UUID, UUID, UUID, UUID, DATE, TIME, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_lojista(UUID, UUID, UUID, UUID, DATE, TIME, TEXT) TO authenticated;
