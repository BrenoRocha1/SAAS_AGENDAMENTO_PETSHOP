-- ============================================================
-- PETSHOP SaaS - Migration 051: cancelar serviço com várias corridas
--                               no mesmo dia
-- ============================================================
-- A 043 passou a mover a corrida de um serviço cancelado pro próximo
-- serviço ativo do mesmo pet no mesmo dia. Mas o cliente pode fazer
-- agendamentos SEPARADOS no mesmo dia, cada um com o seu TaxiDog — aí o
-- serviço escolhido já tinha corrida própria e o UPDATE batia no UNIQUE
-- (taxidog_corrida_id_agendamento_key): o cancelamento inteiro falhava
-- com "duplicate key value".
--
-- Agora a corrida só vai pra um serviço da visita que ainda NÃO tem
-- corrida. Se não houver nenhum, ela é cancelada — o pet já tem o
-- transporte da outra corrida daquele dia.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_trg_agendamento_taxidog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c     taxidog_corrida%ROWTYPE;
  v_outro UUID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'Cancelado' THEN
    FOR v_c IN
      SELECT * FROM taxidog_corrida
      WHERE id_agendamento = NEW.id_agendamento AND status NOT IN ('concluida', 'cancelada')
    LOOP
      -- Outro serviço da mesma visita, ainda de pé e SEM corrida própria.
      SELECT a.id_agendamento INTO v_outro
      FROM agendamento a
      WHERE a.id_pet = NEW.id_pet AND a.id_lojista = NEW.id_lojista AND a.dt_agendamento = NEW.dt_agendamento
        AND a.id_agendamento <> NEW.id_agendamento
        AND a.status <> 'Cancelado'
        AND NOT EXISTS (SELECT 1 FROM taxidog_corrida c2 WHERE c2.id_agendamento = a.id_agendamento)
      ORDER BY a.hr_agendamento
      LIMIT 1;

      IF v_outro IS NOT NULL THEN
        UPDATE taxidog_corrida SET id_agendamento = v_outro WHERE id_corrida = v_c.id_corrida;
        UPDATE agendamento SET valor = valor + v_c.valor WHERE id_agendamento = v_outro;
        UPDATE agendamento SET valor = GREATEST(0, valor - v_c.valor) WHERE id_agendamento = NEW.id_agendamento;
        PERFORM fn_registrar_evento_corrida(
          v_c.id_corrida, v_c.status,
          'Um dos serviços foi cancelado — a corrida continua com os demais serviços do dia'
        );
      ELSE
        UPDATE taxidog_corrida SET status = 'cancelada' WHERE id_corrida = v_c.id_corrida;
        PERFORM fn_registrar_evento_corrida(v_c.id_corrida, 'cancelada', 'Agendamento cancelado — corrida cancelada');
      END IF;
    END LOOP;
  END IF;

  IF NEW.status IN ('Concluído', 'Cancelado') THEN
    -- A corrida pode estar presa a OUTRO agendamento do mesmo carrinho.
    FOR v_c IN
      SELECT c.* FROM taxidog_corrida c
      JOIN agendamento a ON a.id_agendamento = c.id_agendamento
      WHERE a.id_pet = NEW.id_pet AND a.id_lojista = NEW.id_lojista AND a.dt_agendamento = NEW.dt_agendamento
        AND c.modalidade IN ('entregar', 'buscar_entregar')
        AND c.status IN ('agendada', 'entregue_loja')
    LOOP
      IF fn_visita_taxidog_concluida(v_c.id_agendamento) THEN
        UPDATE taxidog_corrida SET status = 'pronto_entrega' WHERE id_corrida = v_c.id_corrida;
        PERFORM fn_registrar_evento_corrida(v_c.id_corrida, 'pronto_entrega', 'Serviço finalizado — pet pronto para entrega');
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
