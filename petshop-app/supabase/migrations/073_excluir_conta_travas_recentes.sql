-- ============================================================
-- PETSHOP SaaS - Migration 073: "Excluir minha conta" — só trava o que
-- está acontecendo de verdade
-- ============================================================
-- Achado no teste da 072: agendamentos esquecidos em "Em andamento" (de
-- dias atrás, que a loja nunca finalizou) bloqueavam a exclusão para
-- sempre. A trava é para o pet que está na loja ou com o TaxiDog AGORA:
-- vale só para agendamento de hoje ou de ontem (atendimento que virou a
-- noite). Os antigos ficam no histórico da loja, sem o cliente.
-- Resto igual à 072.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_excluir_minha_conta()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_cancelados INTEGER;
  v_pets       INTEGER;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM cliente WHERE id_cliente = v_uid) THEN
    RAISE EXCEPTION 'Excluir: só uma conta de cliente pode ser excluída por aqui';
  END IF;
  -- Pet na loja ou no TaxiDog agora: espera terminar.
  IF EXISTS (
    SELECT 1 FROM agendamento
    WHERE id_cliente = v_uid AND status = 'Em andamento'
      AND dt_agendamento >= CURRENT_DATE - 1
  ) THEN
    RAISE EXCEPTION 'Excluir: um pet seu está em atendimento agora — tente de novo depois que terminar';
  END IF;
  IF EXISTS (
    SELECT 1 FROM taxidog_corrida c
    JOIN agendamento a ON a.id_agendamento = c.id_agendamento
    WHERE c.id_cliente = v_uid
      AND c.status IN ('a_caminho_cliente', 'no_endereco', 'pet_embarcado', 'entregue_loja',
                       'pronto_entrega', 'a_caminho_entrega', 'no_endereco_entrega')
      AND a.dt_agendamento >= CURRENT_DATE - 1
  ) THEN
    RAISE EXCEPTION 'Excluir: um pet seu está com o TaxiDog ou esperando a entrega — tente de novo depois que ele voltar para casa';
  END IF;

  SELECT COUNT(*) INTO v_cancelados FROM agendamento WHERE id_cliente = v_uid AND status IN ('Pendente', 'Confirmado');
  SELECT COUNT(*) INTO v_pets FROM pet WHERE id_cliente = v_uid;

  DELETE FROM cliente WHERE id_cliente = v_uid;

  RETURN jsonb_build_object('agendamentos_cancelados', v_cancelados, 'pets', v_pets);
END;
$$;
REVOKE ALL ON FUNCTION fn_excluir_minha_conta() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_excluir_minha_conta() TO authenticated;
