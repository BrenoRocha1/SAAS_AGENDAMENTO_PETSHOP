-- ============================================================
-- PETSHOP SaaS - Migration 018: Tela de Pets (lojista)
-- ============================================================
-- Contexto: nova área "Pets" (/lojista/pets) — listar, buscar, cadastrar,
-- editar e ver detalhes/histórico dos pets da loja. O cadastro (migration
-- 015) já existia; faltavam duas coisas pra essa tela funcionar:
--
--   1) BUSCA EFICIENTE: a tela não pode carregar todos os pets pro
--      navegador pra filtrar em JS. fn_buscar_pets_lojista faz a busca
--      (nome do pet, nome do tutor, raça) e a paginação dentro do
--      Postgres, devolvendo só a página pedida + o total (via
--      COUNT(*) OVER(), sem uma segunda query de contagem).
--
--   2) EDIÇÃO: a policy "pet: update proprio" (migration 002) só deixa o
--      PRÓPRIO CLIENTE editar seu pet — não existe (nem existiu até
--      agora) nenhum jeito do LOJISTA editar um pet. fn_editar_pet_lojista
--      cobre isso, incluindo trocar o tutor (reatribuir o pet a outro
--      cliente), mas só entre clientes vinculados a este mesmo lojista
--      (cliente_lojista, migration 014) — nunca pra um cliente de fora.
--
-- Nenhuma tabela nova, nenhum campo novo — só funções em cima do que já
-- existe (pet, cliente, cliente_lojista).
-- ============================================================

-- ============================================================
-- FUNÇÃO: busca paginada de pets da loja
-- ============================================================
CREATE OR REPLACE FUNCTION fn_buscar_pets_lojista(
  p_id_lojista  UUID,
  p_busca       TEXT DEFAULT NULL,
  p_especie     especie_pet DEFAULT NULL,
  p_porte       porte_pet DEFAULT NULL,
  p_limit       INT DEFAULT 20,
  p_offset      INT DEFAULT 0
)
RETURNS TABLE (
  id_pet            UUID,
  nome              TEXT,
  especie           especie_pet,
  porte             porte_pet,
  raca              TEXT,
  sexo              sexo_pet,
  dt_nasc           DATE,
  peso              NUMERIC,
  obs               TEXT,
  id_cliente        UUID,
  nome_cliente      TEXT,
  telefone_cliente  TEXT,
  created_at        TIMESTAMPTZ,
  total_count       BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  -- Traz também sexo/dt_nasc/peso/obs (não usados na tabela, só no
  -- formulário de edição) pra abrir o modal de editar sem precisar de
  -- uma segunda consulta — a linha que já está na tela já tem tudo.
  RETURN QUERY
  SELECT
    p.id_pet, p.nome, p.especie, p.porte, p.raca, p.sexo, p.dt_nasc, p.peso, p.obs,
    c.id_cliente, c.nome, c.telefone,
    p.created_at,
    COUNT(*) OVER() AS total_count
  FROM pet p
  JOIN cliente c ON c.id_cliente = p.id_cliente
  JOIN cliente_lojista cl ON cl.id_cliente = p.id_cliente AND cl.id_lojista = p_id_lojista
  WHERE p.ativo = TRUE
    AND (p_especie IS NULL OR p.especie = p_especie)
    AND (p_porte IS NULL OR p.porte = p_porte)
    AND (
      p_busca IS NULL OR trim(p_busca) = '' OR
      p.nome ILIKE '%' || p_busca || '%' OR
      c.nome ILIKE '%' || p_busca || '%' OR
      p.raca ILIKE '%' || p_busca || '%'
    )
  ORDER BY p.nome
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION fn_buscar_pets_lojista(UUID, TEXT, especie_pet, porte_pet, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_buscar_pets_lojista(UUID, TEXT, especie_pet, porte_pet, INT, INT) TO authenticated;

-- ============================================================
-- FUNÇÃO: editar pet (lojista), incluindo trocar o tutor
-- ============================================================
CREATE OR REPLACE FUNCTION fn_editar_pet_lojista(
  p_id_lojista  UUID,
  p_id_pet      UUID,
  p_id_cliente  UUID, -- tutor (pode ser o mesmo ou um novo, mas sempre vinculado a este lojista)
  p_nome        TEXT,
  p_raca        TEXT,
  p_sexo        TEXT,
  p_especie     especie_pet DEFAULT NULL,
  p_porte       porte_pet DEFAULT NULL,
  p_dt_nasc     DATE DEFAULT NULL,
  p_peso        NUMERIC DEFAULT NULL,
  p_obs         TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  -- O pet só pode ser editado se o dono ATUAL já é um cliente vinculado
  -- a este lojista (mesma trava de "não é pet de fora" usada na criação).
  IF NOT EXISTS (
    SELECT 1 FROM pet p
    JOIN cliente_lojista cl ON cl.id_cliente = p.id_cliente AND cl.id_lojista = p_id_lojista
    WHERE p.id_pet = p_id_pet AND p.ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence a um cliente do seu petshop';
  END IF;

  -- Se o tutor está sendo trocado, o NOVO tutor também precisa ser um
  -- cliente vinculado a este lojista — nunca reatribuir pra cliente de fora.
  IF NOT EXISTS (
    SELECT 1 FROM cliente_lojista
    WHERE id_lojista = p_id_lojista AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'O tutor selecionado não está vinculado ao seu petshop';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 1 THEN
    RAISE EXCEPTION 'Nome do pet inválido';
  END IF;

  IF p_raca IS NULL OR char_length(trim(p_raca)) < 1 THEN
    RAISE EXCEPTION 'Raça do pet inválida';
  END IF;

  IF p_sexo NOT IN ('Macho', 'Fêmea') THEN
    RAISE EXCEPTION 'Sexo do pet inválido';
  END IF;

  IF p_dt_nasc IS NULL THEN
    RAISE EXCEPTION 'Data de nascimento é obrigatória';
  END IF;

  UPDATE pet SET
    id_cliente = p_id_cliente,
    nome       = trim(p_nome),
    raca       = trim(p_raca),
    sexo       = p_sexo::sexo_pet,
    especie    = p_especie,
    porte      = p_porte,
    dt_nasc    = p_dt_nasc,
    peso       = p_peso,
    obs        = NULLIF(trim(p_obs), '')
  WHERE id_pet = p_id_pet;
END;
$$;

REVOKE ALL ON FUNCTION fn_editar_pet_lojista(UUID, UUID, UUID, TEXT, TEXT, TEXT, especie_pet, porte_pet, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_editar_pet_lojista(UUID, UUID, UUID, TEXT, TEXT, TEXT, especie_pet, porte_pet, DATE, NUMERIC, TEXT) TO authenticated;
