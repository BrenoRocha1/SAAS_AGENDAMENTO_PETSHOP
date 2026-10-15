-- ============================================================
-- PETSHOP SaaS - Migration 099: search_path fixo (de novo)
-- ============================================================
-- Excluir um usuário pelo Supabase dava 500: "relation audit_log does not
-- exist". O Auth apaga o usuário com search_path = auth; ao apagar o
-- cliente, os triggers de auditoria (fn_audit_agendamento,
-- fn_audit_avaliacao) gravam em `audit_log` sem schema e não acham a tabela.
-- A parte 1 da 090 fixava o search_path de todas as funções do public, mas
-- não estava aplicada no banco. Mesmo trecho, idempotente; não mexe em dado.
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
