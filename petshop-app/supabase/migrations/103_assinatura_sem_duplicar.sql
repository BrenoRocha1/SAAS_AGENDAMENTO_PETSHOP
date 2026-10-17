-- ============================================================
-- PETSHOP SaaS - Migration 103: um pet não fica com o mesmo plano ativo
-- duas vezes
-- ============================================================
-- fn_assinar_plano (migration 060) já recusa "pet já tem este plano
-- ativo", mas confere com um EXISTS antes do INSERT: duas confirmações
-- quase juntas (clique duplo, duas telas) passavam as duas. O índice único
-- abaixo faz o banco recusar a segunda — a tela mostra "Este pet já tem
-- este plano ativo." (mensagemErroPlano). Assinatura cancelada não conta:
-- o pet pode assinar o mesmo plano de novo depois de cancelar.
--
-- Se já houver duplicadas, nada é criado e a mensagem diz quais revisar
-- (cancele a sobrando em Planos → Assinaturas e rode de novo).
-- ============================================================

DO $$
DECLARE
  v_dup TEXT;
BEGIN
  SELECT string_agg(format('pet %s / plano %s (%s ativas)', id_pet, id_plano, n), '; ')
  INTO v_dup
  FROM (
    SELECT id_pet, id_plano, count(*) AS n
    FROM assinatura
    WHERE status = 'ativa'
    GROUP BY id_pet, id_plano
    HAVING count(*) > 1
  ) d;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Há assinaturas ativas repetidas — cancele as que sobram antes de rodar esta migration: %', v_dup;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assinatura_ativa_pet_plano
  ON assinatura (id_pet, id_plano)
  WHERE status = 'ativa';
