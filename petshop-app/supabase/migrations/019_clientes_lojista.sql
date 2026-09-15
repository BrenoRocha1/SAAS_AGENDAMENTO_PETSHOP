-- ============================================================
-- PETSHOP SaaS - Migration 019: Perfil do Cliente (lojista)
-- ============================================================
-- Contexto: evolução da tela /lojista/clientes — a listagem já existia
-- (agrupando cliente_lojista + agendamento em JS, sem busca nem
-- paginação) e ganha agora: busca eficiente no banco, e edição (que não
-- existia — só o próprio cliente podia editar seus dados, nunca o
-- lojista). O perfil detalhado (/lojista/clientes/[id]) NÃO precisou de
-- nenhuma função nova: todo o resumo financeiro, histórico, ranking de
-- serviços etc. são calculados a partir de UMA única consulta nos
-- agendamentos daquele cliente (já um conjunto pequeno e limitado — bem
-- diferente de "carregar a loja inteira pra agregar em JS").
--
-- Nenhuma tabela nova, nenhum campo novo — só duas funções em cima do
-- que já existe (cliente, cliente_lojista, pet, agendamento).
-- ============================================================

-- ============================================================
-- FUNÇÃO: busca paginada de clientes da loja, com contadores
-- ============================================================
-- Substitui a agregação em JS de duas queries (agendamento + cliente_
-- lojista) da página atual por uma única consulta com busca (nome,
-- telefone, e-mail) e paginação — mesma ideia de fn_buscar_pets_lojista
-- (migration 018), pra não carregar a base de clientes inteira pro
-- navegador só pra filtrar.
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
  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
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

-- ============================================================
-- FUNÇÃO: editar cliente (lojista)
-- ============================================================
-- A policy "cliente: update proprio" (migration 002) só deixa o PRÓPRIO
-- cliente editar seus dados — o lojista não tinha nenhum caminho pra
-- corrigir/atualizar o cadastro de um cliente da sua base.
--
-- Deliberadamente NÃO altera e-mail (é o login do cliente — trocar isso
-- por aqui exigiria mexer em auth.users via Admin API, fora do escopo
-- desta tela) nem CPF (documento de identidade, não é algo que muda). O
-- lojista edita o que realmente muda no dia a dia: nome e telefone.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_editar_cliente_lojista(
  p_id_lojista  UUID,
  p_id_cliente  UUID,
  p_nome        TEXT,
  p_telefone    TEXT
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
    SELECT 1 FROM cliente_lojista
    WHERE id_lojista = p_id_lojista AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado ou não vinculado ao seu petshop';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 2 THEN
    RAISE EXCEPTION 'Nome do cliente inválido';
  END IF;

  IF p_telefone IS NULL OR p_telefone !~ '^\d{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  UPDATE cliente SET
    nome     = trim(p_nome),
    telefone = p_telefone
  WHERE id_cliente = p_id_cliente;
END;
$$;

REVOKE ALL ON FUNCTION fn_editar_cliente_lojista(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_editar_cliente_lojista(UUID, UUID, TEXT, TEXT) TO authenticated;
