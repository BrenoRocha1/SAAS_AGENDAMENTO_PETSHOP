-- ============================================================
-- PETSHOP SaaS - Migration 043: ajustes do TaxiDog (QA da 042)
-- ============================================================
-- Três problemas achados testando a 042:
--
-- 1) Carrinho com vários serviços: a corrida fica presa ao PRIMEIRO
--    agendamento da visita. Cancelar só esse serviço cancelava o TaxiDog
--    inteiro — mesmo com o pet ainda vindo pros outros serviços do dia —
--    e a taxa sumia dos relatórios junto com o agendamento cancelado.
--    Agora a corrida (e a taxa) passa pro próximo serviço ainda ativo da
--    visita; só é cancelada quando não sobra nenhum.
--
-- 2) Cancelar o ÚLTIMO serviço que faltava terminar não liberava a
--    entrega: o trigger só olhava a visita quando algo virava Concluído.
--    Ex.: banho Concluído + tosa cancelada = pet pronto, mas a corrida
--    ficava parada em "Pet entregue na loja". Agora Cancelado também
--    confere se a visita terminou.
--
-- 3) Dava pra iniciar a busca ("A caminho do cliente") com o agendamento
--    ainda Pendente, ou seja, antes de a loja aceitar — o TaxiDog podia
--    sair pra buscar um pet cujo agendamento depois seria recusado.
-- ============================================================

-- ============================================================
-- 1 + 2) Trigger: status do agendamento conduz a corrida
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
      -- Outro serviço da mesma visita que continua de pé? (Trigger AFTER:
      -- se o carrinho inteiro foi cancelado num UPDATE só, aqui todos já
      -- aparecem como Cancelado e a corrida é cancelada, como antes.)
      SELECT a.id_agendamento INTO v_outro
      FROM agendamento a
      WHERE a.id_pet = NEW.id_pet AND a.id_lojista = NEW.id_lojista AND a.dt_agendamento = NEW.dt_agendamento
        AND a.id_agendamento <> NEW.id_agendamento
        AND a.status <> 'Cancelado'
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

-- O trigger em si (trg_agendamento_taxidog, AFTER UPDATE OF status) já
-- existe desde a 042 e aponta pra esta função — nada a recriar.

-- ============================================================
-- 3) Avançar etapa: busca só depois de a loja aceitar
-- ============================================================
-- Igual à 042, com uma checagem a mais (ver "Pendente" abaixo).
CREATE OR REPLACE FUNCTION fn_avancar_corrida(p_id_corrida UUID, p_novo_status TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c         taxidog_corrida%ROWTYPE;
  v_ag_status TEXT;
  v_gestor    BOOLEAN;
  v_ok        BOOLEAN;
  v_final     TEXT;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM v_c.id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  v_gestor := auth_role() = 'lojista' OR EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid() AND ativo = TRUE AND (pode_gerenciar_agenda OR acesso_total)
  );

  IF NOT v_gestor AND v_c.id_funcionario IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Esta corrida não está atribuída a você';
  END IF;

  IF v_c.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Esta corrida já foi encerrada';
  END IF;

  v_ok := CASE
    WHEN v_c.status = 'agendada'            AND p_novo_status = 'a_caminho_cliente'   AND v_c.modalidade IN ('buscar', 'buscar_entregar') THEN TRUE
    WHEN v_c.status = 'a_caminho_cliente'   AND p_novo_status = 'no_endereco'         THEN TRUE
    WHEN v_c.status = 'no_endereco'         AND p_novo_status = 'pet_embarcado'       THEN TRUE
    WHEN v_c.status = 'pet_embarcado'       AND p_novo_status = 'entregue_loja'       THEN TRUE
    WHEN v_c.status = 'pronto_entrega'      AND p_novo_status = 'a_caminho_entrega'   THEN TRUE
    WHEN v_c.status = 'a_caminho_entrega'   AND p_novo_status = 'no_endereco_entrega' THEN TRUE
    WHEN v_c.status = 'no_endereco_entrega' AND p_novo_status = 'concluida'           THEN TRUE
    ELSE FALSE
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Essa etapa não pode ser feita agora';
  END IF;

  IF p_novo_status IN ('a_caminho_cliente', 'a_caminho_entrega') AND v_c.id_funcionario IS NULL THEN
    RAISE EXCEPTION 'Atribua um TaxiDog antes de iniciar a corrida';
  END IF;

  SELECT status::TEXT INTO v_ag_status FROM agendamento WHERE id_agendamento = v_c.id_agendamento;
  IF v_ag_status = 'Cancelado' THEN
    RAISE EXCEPTION 'O agendamento desta corrida foi cancelado';
  END IF;

  IF p_novo_status = 'a_caminho_cliente' AND v_ag_status = 'Pendente' THEN
    RAISE EXCEPTION 'A loja ainda não aceitou este agendamento — aceite antes de iniciar a busca';
  END IF;

  v_final := p_novo_status;
  IF p_novo_status = 'entregue_loja' THEN
    IF v_c.modalidade = 'buscar' THEN
      v_final := 'concluida';
    ELSIF fn_visita_taxidog_concluida(v_c.id_agendamento) THEN
      -- Serviço já tinha terminado antes do TaxiDog registrar a chegada.
      v_final := 'pronto_entrega';
    END IF;
  END IF;

  UPDATE taxidog_corrida SET status = v_final WHERE id_corrida = p_id_corrida;

  PERFORM fn_registrar_evento_corrida(p_id_corrida, p_novo_status, CASE p_novo_status
    WHEN 'a_caminho_cliente'   THEN 'TaxiDog a caminho do cliente'
    WHEN 'no_endereco'         THEN 'TaxiDog chegou ao endereço'
    WHEN 'pet_embarcado'       THEN 'Pet embarcado'
    WHEN 'entregue_loja'       THEN 'Pet entregue na loja'
    WHEN 'a_caminho_entrega'   THEN 'TaxiDog a caminho para entrega'
    WHEN 'no_endereco_entrega' THEN 'TaxiDog chegou ao endereço de entrega'
    WHEN 'concluida'           THEN 'Pet entregue ao cliente'
  END);

  IF v_final = 'concluida' THEN
    PERFORM fn_registrar_evento_corrida(p_id_corrida, 'concluida', 'Corrida concluída');
  ELSIF v_final = 'pronto_entrega' THEN
    PERFORM fn_registrar_evento_corrida(p_id_corrida, 'pronto_entrega', 'Serviço finalizado — pet pronto para entrega');
  END IF;

  RETURN v_final;
END;
$$;

REVOKE ALL ON FUNCTION fn_avancar_corrida(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_avancar_corrida(UUID, TEXT) TO authenticated;
