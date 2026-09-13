-- ============================================================
-- PETSHOP SaaS - Migration 015: Lojista cadastra pet de um cliente
-- ============================================================
-- Mesmo problema da migration 014, agora em `pet`: um cliente cadastrado
-- pelo lojista (walk-in) não tem nenhum pet ainda, e:
--   • a policy "pet: lojista ve pets atendidos" (migration 002) só
--     mostra pet que já tem agendamento — invisível pro lojista;
--   • a policy "pet: insert proprio" só deixa o dono (o próprio cliente
--     logado) cadastrar — o lojista não tem como criar o pet por ele.
--
-- Resultado prático: mesmo depois de cadastrar o cliente (migration 014),
-- o modal "Novo Agendamento" chegava até "selecionar pet" e travava
-- ("Este cliente não tem pets cadastrados"), sem nenhum jeito de seguir.
--
-- Solução: mesmo padrão da 014 — usa `cliente_lojista` (o vínculo
-- "lojista conhece este cliente") em vez de exigir agendamento prévio.
-- ============================================================

-- Lojista enxerga pets de qualquer cliente vinculado a ele (cadastrado
-- por ele ou que já tenha agendado), não só quem já tem agendamento.
-- Policies de SELECT são permissivas (somam com OR) — não tira nada da
-- policy antiga, só amplia.
CREATE POLICY "pet: lojista ve pets de clientes vinculados"
  ON pet FOR SELECT
  USING (
    auth_role() = 'lojista'
    AND EXISTS (
      SELECT 1 FROM cliente_lojista cl
      WHERE cl.id_cliente = pet.id_cliente AND cl.id_lojista = auth.uid()
    )
  );

-- ============================================================
-- FUNÇÃO: fn_criar_pet_lojista
-- ============================================================
-- SECURITY DEFINER pra poder inserir em `pet` com id_cliente != auth.uid()
-- (a policy "pet: insert proprio" nunca permitiria isso via API comum).
-- Só cadastra pet pra cliente que já está vinculado a este lojista
-- (cliente_lojista) — mesma trava de "não é cliente de fora" usada em
-- fn_criar_agendamento_lojista.
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
  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
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

REVOKE ALL ON FUNCTION fn_criar_pet_lojista(UUID, UUID, TEXT, TEXT, TEXT, especie_pet, porte_pet, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_pet_lojista(UUID, UUID, TEXT, TEXT, TEXT, especie_pet, porte_pet, DATE, NUMERIC, TEXT) TO authenticated;
