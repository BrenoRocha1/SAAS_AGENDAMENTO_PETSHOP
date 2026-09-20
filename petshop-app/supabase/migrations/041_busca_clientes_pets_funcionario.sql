-- ============================================================
-- PETSHOP SaaS - Migration 041: busca de clientes/pets também funciona
-- para funcionário (não só para o dono da conta)
-- ============================================================
-- fn_buscar_clientes_lojista (019) e fn_buscar_pets_lojista (018) são
-- anteriores à migration 028 ("funcionário usa o MESMO painel do
-- lojista") e ficaram com a checagem antiga:
--
--   IF auth.uid() != p_id_lojista THEN ... 'Acesso não autorizado'
--
-- Para um funcionário isso NUNCA passa: o auth.uid() dele é o id dele,
-- nunca o id do lojista que o contratou. Resultado: um funcionário com
-- pode_gerenciar_clientes_pets abre Clientes/Pets e recebe "Acesso não
-- autorizado", tanto no dashboard web quanto no app mobile novo.
--
-- Correção (mesmo padrão já usado em fn_criar_agendamento_lojista e
-- fn_criar_pet_lojista, migration 028):
--
--   1) auth_lojista_id() no lugar de auth.uid() — o helper resolve o
--      id_lojista tanto para o lojista quanto para o funcionário dele;
--   2) IS DISTINCT FROM no lugar de != — com NULL (helper não resolveu
--      nada), != devolve NULL e a exceção nunca dispara, deixando passar
--      quem não deveria (ver migration 035);
--   3) funcionário ainda precisa de pode_gerenciar_clientes_pets (ou
--      acesso_total) — a mesma permissão que o app/dashboard já exige
--      antes de abrir a tela.
--
-- Só AMPLIA acesso para quem já deveria ter; o caminho do lojista
-- continua exatamente igual. Corpo das funções inalterado fora a
-- checagem inicial, e a assinatura é a mesma (CREATE OR REPLACE basta,
-- sem DROP).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_buscar_clientes_lojista(
  p_id_lojista  UUID,
  p_busca       TEXT DEFAULT NULL,
  p_limit       INT DEFAULT 20,
  p_offset      INT DEFAULT 0
)
RETURNS TABLE (
  id_cliente        UUID,
  nome              TEXT,
  telefone          TEXT,
  email             TEXT,
  cpf               TEXT,
  vinculado_desde   TIMESTAMPTZ,
  qtd_pets          BIGINT,
  pets_resumo       TEXT[],
  qtd_agendamentos  BIGINT,
  total_count       BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid()
      AND (pode_gerenciar_clientes_pets = TRUE OR acesso_total = TRUE)
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para ver clientes';
  END IF;

  RETURN QUERY
  SELECT
    c.id_cliente, c.nome, c.telefone, c.email, c.cpf,
    cl.created_at,
    COUNT(DISTINCT p.id_pet) FILTER (WHERE p.ativo = TRUE),
    ARRAY_AGG(DISTINCT (p.nome || ' (' || p.raca || ')')) FILTER (WHERE p.ativo = TRUE),
    COUNT(DISTINCT a.id_agendamento) FILTER (WHERE a.status != 'Cancelado'),
    COUNT(*) OVER()
  FROM cliente_lojista cl
  JOIN cliente c ON c.id_cliente = cl.id_cliente
  LEFT JOIN pet p ON p.id_cliente = c.id_cliente
  LEFT JOIN agendamento a ON a.id_cliente = c.id_cliente AND a.id_lojista = p_id_lojista
  WHERE cl.id_lojista = p_id_lojista
    AND (
      p_busca IS NULL OR trim(p_busca) = '' OR
      c.nome ILIKE '%' || p_busca || '%' OR
      c.telefone ILIKE '%' || p_busca || '%' OR
      c.email ILIKE '%' || p_busca || '%'
    )
  GROUP BY c.id_cliente, c.nome, c.telefone, c.email, c.cpf, cl.created_at
  ORDER BY c.nome
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION fn_buscar_clientes_lojista(UUID, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_buscar_clientes_lojista(UUID, TEXT, INT, INT) TO authenticated;

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
  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid()
      AND (pode_gerenciar_clientes_pets = TRUE OR acesso_total = TRUE)
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para ver pets';
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
