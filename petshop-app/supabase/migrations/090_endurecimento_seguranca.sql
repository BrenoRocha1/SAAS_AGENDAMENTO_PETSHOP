-- ============================================================
-- PETSHOP SaaS - Migration 090: endurecimento de seguranca (avisos do
-- Security Advisor do Supabase)
-- ============================================================
-- 1) function_search_path_mutable: toda funcao do schema public sem
--    search_path fixo passa a ter `public, extensions, pg_temp`. Impede que
--    alguem sequestre a funcao criando objetos com o mesmo nome em outro
--    schema. Nao muda o comportamento (as funcoes ja usam objetos do public).
--
-- 2) *_security_definer_function_executable: funcoes SECURITY DEFINER que
--    ja recusam quem nao esta logado (checam auth.uid()/auth_lojista_id()/
--    auth_role() logo no inicio) deixam de ser chamaveis pelo papel `anon`
--    (visitante sem login) pela API. Para quem usa o sistema nada muda:
--    `authenticated` e `service_role` continuam podendo chamar. As funcoes
--    publicas (agendamento online, acompanhamento, avaliacoes, TaxiDog
--    publico...) e as usadas dentro de policies RLS ficam como estao.
--
-- 3) rls_enabled_no_policy: admin_auditoria so e lida/escrita pelo
--    service_role (que ignora RLS); a policy abaixo deixa explicito que
--    ninguem mais acessa.
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proconfig IS NULL
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.f);
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY (ARRAY[
    'fn_agenda_dia',
    'fn_alterar_status_plano',
    'fn_aprovar_rota',
    'fn_assinar_plano',
    'fn_assinaturas_da_loja',
    'fn_assumir_corrida',
    'fn_atualizar_assinaturas',
    'fn_atualizar_cobranca_plano',
    'fn_atualizar_pagamento',
    'fn_avaliacoes_lojista',
    'fn_avaliacoes_resumo_lojista',
    'fn_avancar_corrida',
    'fn_beneficios_do_pet',
    'fn_bloqueios_da_loja',
    'fn_buscar_clientes_lojista',
    'fn_buscar_pets_lojista',
    'fn_cancelar_agendamento',
    'fn_cancelar_assinatura',
    'fn_cancelar_venda_pdv',
    'fn_cobrancas_planos',
    'fn_criar_agendamento_lojista',
    'fn_criar_pet_lojista',
    'fn_criar_rota',
    'fn_definir_agendamentos_simultaneos',
    'fn_e_taxidog',
    'fn_editar_agendamento',
    'fn_editar_cliente_lojista',
    'fn_editar_pet_lojista',
    'fn_excluir_bloqueio',
    'fn_excluir_minha_conta',
    'fn_gerar_codigo_acesso_funcionario',
    'fn_gestor_taxidog',
    'fn_historico_planos',
    'fn_horarios_remarcar',
    'fn_listar_corridas',
    'fn_listar_rotas',
    'fn_metricas_lojista',
    'fn_meus_agendamentos_no_plano',
    'fn_meus_beneficios',
    'fn_meus_planos',
    'fn_movimentar_estoque',
    'fn_pdv_buscar_clientes',
    'fn_planos_da_loja',
    'fn_registrar_cliente_lojista',
    'fn_registrar_funcionario',
    'fn_registrar_lojista',
    'fn_registrar_venda_pdv',
    'fn_relatorio_clientes_resumo',
    'fn_relatorio_planos',
    'fn_relatorio_vendas_por_cliente',
    'fn_relatorio_vendas_por_dia',
    'fn_relatorio_vendas_por_pagamento',
    'fn_relatorio_vendas_por_profissional',
    'fn_relatorio_vendas_por_servico',
    'fn_relatorio_vendas_produtos',
    'fn_relatorio_vendas_resumo',
    'fn_remarcar_agendamento',
    'fn_reservar_chamadas_google',
    'fn_resumo_planos',
    'fn_salvar_bloqueio',
    'fn_salvar_formas_pagamento',
    'fn_salvar_perfil_pet',
    'fn_salvar_plano',
    'fn_salvar_taxidog_config',
    'fn_salvar_taxidog_cria_rotas',
    'fn_trechos_pendentes',
    'fn_usar_beneficio'
  ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.f);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "admin_auditoria: ninguem acessa pela API" ON admin_auditoria;
CREATE POLICY "admin_auditoria: ninguem acessa pela API"
  ON admin_auditoria FOR ALL
  USING (false) WITH CHECK (false);
