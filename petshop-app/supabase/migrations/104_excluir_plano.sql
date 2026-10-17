-- ============================================================
-- PETSHOP SaaS - Migration 104: excluir plano + histórico mais claro
-- ============================================================
-- Excluir um plano (Planos → Editar → Excluir plano):
-- • Com assinatura ativa: não exclui — cancele as assinaturas antes.
-- • Nunca assinado: some de vez (DELETE; os serviços dele vão junto).
-- • Só com assinaturas canceladas: sai da lista e não pode mais ser
--   atribuído (excluido_em), mas as assinaturas antigas, as cobranças e o
--   histórico continuam apontando para ele (assinatura.id_plano é
--   RESTRICT justamente para isso).
--
-- O histórico (fn_historico_planos) passa a devolver também o nome do
-- plano de cada evento, para a tela dizer de qual plano se trata.
-- ============================================================

ALTER TABLE plano ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ;

-- 1) Excluir
CREATE OR REPLACE FUNCTION fn_excluir_plano(p_id_plano UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja   UUID := auth_lojista_id();
  v_nome   TEXT;
  v_ativas INTEGER;
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode gerenciar planos';
  END IF;
  SELECT nome INTO v_nome FROM plano
  WHERE id_plano = p_id_plano AND id_lojista = v_loja AND excluido_em IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano não encontrado';
  END IF;

  SELECT COUNT(*) INTO v_ativas FROM assinatura WHERE id_plano = p_id_plano AND status = 'ativa';
  IF v_ativas > 0 THEN
    RAISE EXCEPTION 'Este plano tem % % — cancele em Assinaturas antes de excluir (ou só desative o plano)',
      v_ativas, CASE WHEN v_ativas = 1 THEN 'assinatura ativa' ELSE 'assinaturas ativas' END;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM assinatura WHERE id_plano = p_id_plano) THEN
    DELETE FROM plano WHERE id_plano = p_id_plano;
    PERFORM fn_plano_registrar(v_loja, NULL, NULL, 'plano_excluido', format('Plano "%s" excluído', v_nome));
    RETURN 'apagado';
  END IF;

  UPDATE plano SET excluido_em = NOW(), ativo = FALSE WHERE id_plano = p_id_plano;
  PERFORM fn_plano_registrar(v_loja, p_id_plano, NULL, 'plano_excluido',
    format('Plano "%s" excluído — as assinaturas antigas e as cobranças dele continuam no histórico', v_nome));
  RETURN 'arquivado';
END;
$$;
REVOKE ALL ON FUNCTION fn_excluir_plano(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_excluir_plano(UUID) TO authenticated;

-- 2) A lista de planos não mostra os excluídos (a mesma da migration 060,
--    só com o filtro a mais).
CREATE OR REPLACE FUNCTION fn_planos_da_loja()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id_plano', pl.id_plano, 'nome', pl.nome, 'descricao', pl.descricao, 'valor', pl.valor,
      'periodicidade', pl.periodicidade, 'intervalo_dias', pl.intervalo_dias, 'ativo', pl.ativo,
      'servicos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id_servico', ps.id_servico, 'servico', s.nome, 'quantidade', ps.quantidade) ORDER BY s.nome)
                            FROM plano_servico ps JOIN servico s ON s.id_servico = ps.id_servico WHERE ps.id_plano = pl.id_plano), '[]'::jsonb),
      'assinaturas_ativas', (SELECT COUNT(*) FROM assinatura a WHERE a.id_plano = pl.id_plano AND a.status = 'ativa')
    ) ORDER BY pl.ativo DESC, pl.nome)
    FROM plano pl WHERE pl.id_lojista = v_loja AND pl.excluido_em IS NULL
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION fn_planos_da_loja() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_planos_da_loja() TO authenticated;

-- 3) Plano excluído não volta a ser ativado.
CREATE OR REPLACE FUNCTION fn_alterar_status_plano(p_id_plano UUID, p_ativo BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
  v_nome TEXT;
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode gerenciar planos';
  END IF;
  UPDATE plano SET ativo = COALESCE(p_ativo, FALSE)
  WHERE id_plano = p_id_plano AND id_lojista = v_loja AND excluido_em IS NULL
  RETURNING nome INTO v_nome;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano não encontrado';
  END IF;
  PERFORM fn_plano_registrar(v_loja, p_id_plano, NULL, CASE WHEN p_ativo THEN 'plano_ativado' ELSE 'plano_desativado' END,
    format('Plano "%s" %s', v_nome, CASE WHEN p_ativo THEN 'ativado' ELSE 'desativado (quem já assinou continua)' END));
END;
$$;
REVOKE ALL ON FUNCTION fn_alterar_status_plano(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_alterar_status_plano(UUID, BOOLEAN) TO authenticated;

-- 4) Histórico com o nome do plano (pelo evento ou pela assinatura).
CREATE OR REPLACE FUNCTION fn_historico_planos(p_limite INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY (x ->> 'em') DESC) FROM (
      SELECT jsonb_build_object('tipo', h.tipo, 'descricao', h.descricao, 'em', h.created_at,
        'cliente', c.nome, 'pet', p.nome, 'id_cliente', a.id_cliente,
        'plano', COALESCE(pl.nome, pla.nome)) AS x
      FROM assinatura_historico h
      LEFT JOIN assinatura a ON a.id_assinatura = h.id_assinatura
      LEFT JOIN cliente c ON c.id_cliente = a.id_cliente
      LEFT JOIN pet p ON p.id_pet = a.id_pet
      LEFT JOIN plano pl ON pl.id_plano = h.id_plano
      LEFT JOIN plano pla ON pla.id_plano = a.id_plano
      WHERE h.id_lojista = v_loja
      ORDER BY h.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 1), 200)
    ) t
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION fn_historico_planos(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_historico_planos(INTEGER) TO authenticated;
