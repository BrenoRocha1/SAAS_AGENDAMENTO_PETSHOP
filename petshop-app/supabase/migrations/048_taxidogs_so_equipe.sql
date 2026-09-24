-- ============================================================
-- PETSHOP SaaS - Migration 048: lista de TaxiDogs só pra equipe da loja
-- ============================================================
-- Na 047 fn_taxidogs_publicos era pública (anon) porque o cliente
-- escolhia quem faria a corrida no link de agendamento. Essa escolha saiu
-- do lado do cliente — ficou só no agendamento feito pela loja —, então a
-- lista de nomes da equipe não precisa mais ficar aberta: só quem é da
-- própria loja recebe as linhas.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_taxidogs_publicos(p_id_lojista UUID)
RETURNS TABLE (id_funcionario UUID, nome TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id_funcionario, f.nome
  FROM funcionario f
  JOIN taxidog_config c ON c.id_lojista = f.id_lojista AND c.ativo
  WHERE f.id_lojista = p_id_lojista
    AND auth_lojista_id() IS NOT DISTINCT FROM p_id_lojista
    AND f.ativo = TRUE AND f.pode_taxidog = TRUE
  ORDER BY f.nome
$$;

REVOKE ALL ON FUNCTION fn_taxidogs_publicos(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_taxidogs_publicos(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION fn_taxidogs_publicos(UUID) TO authenticated;
