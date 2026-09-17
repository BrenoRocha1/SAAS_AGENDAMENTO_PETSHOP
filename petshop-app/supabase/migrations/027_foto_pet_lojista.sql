-- ============================================================
-- PETSHOP SaaS - Migration 027: Lojista também define a foto do pet
-- ============================================================
-- Contexto: o cliente já pode anexar foto ao pet (migration 026,
-- pet.foto_url + bucket 'fotos-pet'). Pedido agora: o LOJISTA também
-- deve poder fazer isso (ex.: tirou uma foto do pet durante o banho e
-- tosa e quer deixar salva no cadastro).
--
-- Não precisa de nenhuma policy nova de Storage nem de RLS em `pet`: a
-- autorização é feita em código (atualizarFotoPetAction/removerFotoPetAction
-- em src/lib/actions.ts) reaproveitando a policy de SELECT já existente
-- ("pet: lojista ve pets de clientes vinculados", migration 015) — se o
-- SELECT devolve o pet, o lojista tem esse cliente vinculado, e a ação
-- então usa o client admin (service_role) só pra fazer a gravação em si
-- (Storage + UPDATE em pet), do mesmo jeito que outras ações do lojista
-- já fazem (ex.: cadastrarClienteLojistaAction).
--
-- A única coisa que falta no banco: fn_buscar_pets_lojista (migration
-- 018) não devolve foto_url, então o modal de editar aberto a partir da
-- LISTA de pets (em vez do link "Editar" na tela de detalhe) mostrava a
-- prévia da foto sempre em branco mesmo quando o pet já tinha uma. Como
-- é uma função com RETURNS TABLE, precisa DROP + CREATE (não dá pra só
-- adicionar coluna com CREATE OR REPLACE).
-- ============================================================

DROP FUNCTION IF EXISTS fn_buscar_pets_lojista(UUID, TEXT, especie_pet, porte_pet, INT, INT);

CREATE FUNCTION fn_buscar_pets_lojista(
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
  foto_url          TEXT,
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

  RETURN QUERY
  SELECT
    p.id_pet, p.nome, p.especie, p.porte, p.raca, p.sexo, p.dt_nasc, p.peso, p.obs, p.foto_url,
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
