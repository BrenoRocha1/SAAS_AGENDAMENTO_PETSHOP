-- ============================================================
-- PETSHOP SaaS - Migration 093: tempo limite de espera na retirada (TaxiDog)
-- ============================================================
-- O lojista define quantos minutos o TaxiDog espera no endereço do cliente
-- ("Chegou ao endereço" / aguardando retirada). Passou disso sem o pet ser
-- entregue, aparece para o TaxiDog o botão "Cancelar retirada", que:
--   • cancela o agendamento do pet (e os outros serviços da mesma visita:
--     mesmo pet, mesmo dia, mesma loja), com o motivo do tempo de espera;
--   • com isso a corrida é cancelada e sai das rotas (gatilhos já existentes);
--   • devolve os dados para o app abrir o WhatsApp com o aviso ao cliente.
-- O tempo é conferido NO BANCO: não dá para cancelar antes do limite.
-- ============================================================

-- NULL = sem limite (o botão nunca aparece).
ALTER TABLE taxidog_config ADD COLUMN IF NOT EXISTS tempo_espera_retirada_min INTEGER
  CHECK (tempo_espera_retirada_min IS NULL OR tempo_espera_retirada_min BETWEEN 1 AND 180);

-- Quando o TaxiDog chegou ao endereço do cliente (início da espera).
ALTER TABLE taxidog_corrida ADD COLUMN IF NOT EXISTS chegou_endereco_em TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION fn_trg_corrida_chegou_endereco()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.status = 'no_endereco' AND OLD.status IS DISTINCT FROM 'no_endereco' THEN
    NEW.chegou_endereco_em := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_corrida_chegou_endereco ON taxidog_corrida;
CREATE TRIGGER trg_corrida_chegou_endereco
  BEFORE UPDATE OF status ON taxidog_corrida
  FOR EACH ROW EXECUTE FUNCTION fn_trg_corrida_chegou_endereco();

-- Corridas que já estão esperando agora começam a contar a partir daqui.
UPDATE taxidog_corrida SET chegou_endereco_em = NOW()
WHERE status = 'no_endereco' AND chegou_endereco_em IS NULL;

-- Configuração (dono ou administrador). NULL desliga.
CREATE OR REPLACE FUNCTION fn_salvar_tempo_espera_retirada(p_minutos INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_lojista UUID := auth_lojista_id();
BEGIN
  IF v_lojista IS NULL OR NOT (
    auth_role() = 'lojista'
    OR EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND ativo = TRUE AND acesso_total = TRUE)
  ) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode mudar essa configuração';
  END IF;
  IF p_minutos IS NOT NULL AND (p_minutos < 1 OR p_minutos > 180) THEN
    RAISE EXCEPTION 'O tempo de espera deve ficar entre 1 e 180 minutos';
  END IF;
  UPDATE taxidog_config SET tempo_espera_retirada_min = p_minutos WHERE id_lojista = v_lojista;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salve a configuração do TaxiDog antes';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION fn_salvar_tempo_espera_retirada(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_salvar_tempo_espera_retirada(INTEGER) TO authenticated;

-- Situação da espera de uma corrida, para a tela do TaxiDog: desde quando
-- ele espera, qual o limite e se já pode cancelar.
CREATE OR REPLACE FUNCTION fn_espera_retirada(p_id_corrida UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_c      taxidog_corrida%ROWTYPE;
  v_limite INTEGER;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida;
  IF NOT FOUND OR auth_lojista_id() IS DISTINCT FROM v_c.id_lojista THEN
    RETURN NULL;
  END IF;
  SELECT tempo_espera_retirada_min INTO v_limite FROM taxidog_config WHERE id_lojista = v_c.id_lojista;
  RETURN json_build_object(
    'status', v_c.status,
    'chegou_em', v_c.chegou_endereco_em,
    'limite_min', v_limite,
    'agora', NOW(),
    'pode_cancelar', v_c.status = 'no_endereco' AND v_limite IS NOT NULL AND v_c.chegou_endereco_em IS NOT NULL
                     AND NOW() >= v_c.chegou_endereco_em + make_interval(mins => v_limite)
  );
END;
$$;
REVOKE ALL ON FUNCTION fn_espera_retirada(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_espera_retirada(UUID) TO authenticated;

-- Cancela a retirada por tempo de espera. Quem pode: o TaxiDog da corrida,
-- o dono, um administrador ou quem gerencia a agenda da loja.
CREATE OR REPLACE FUNCTION fn_cancelar_retirada_por_espera(p_id_corrida UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_c        taxidog_corrida%ROWTYPE;
  v_a        agendamento%ROWTYPE;
  v_limite   INTEGER;
  v_motivo   TEXT;
  v_cliente  RECORD;
  v_pet      TEXT;
  v_loja     TEXT;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;
  IF auth_lojista_id() IS DISTINCT FROM v_c.id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  IF NOT (
    auth_role() = 'lojista'
    OR v_c.id_funcionario = auth.uid()
    OR EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND ativo = TRUE AND (acesso_total = TRUE OR pode_gerenciar_agenda = TRUE)
    )
  ) THEN
    RAISE EXCEPTION 'Só o TaxiDog desta corrida ou a gestão da loja pode cancelar a retirada';
  END IF;

  IF v_c.status <> 'no_endereco' THEN
    RAISE EXCEPTION 'A retirada só pode ser cancelada enquanto o TaxiDog espera no endereço';
  END IF;

  SELECT tempo_espera_retirada_min INTO v_limite FROM taxidog_config WHERE id_lojista = v_c.id_lojista;
  IF v_limite IS NULL THEN
    RAISE EXCEPTION 'A loja não definiu um tempo limite de espera';
  END IF;
  IF v_c.chegou_endereco_em IS NULL OR NOW() < v_c.chegou_endereco_em + make_interval(mins => v_limite) THEN
    RAISE EXCEPTION 'Ainda dentro do tempo de espera (% min)', v_limite;
  END IF;

  SELECT * INTO v_a FROM agendamento WHERE id_agendamento = v_c.id_agendamento;
  v_motivo := format('Cliente não entregou o pet no tempo de espera do TaxiDog (%s min).', v_limite);

  PERFORM fn_registrar_evento_corrida(
    p_id_corrida, 'cancelada',
    format('Retirada cancelada: o pet não foi entregue em %s min de espera', v_limite)
  );

  -- Cancela o agendamento e os demais serviços da mesma visita. O gatilho
  -- de agendamento cancela as corridas, e o de corrida tira das rotas.
  UPDATE agendamento
  SET status = 'Cancelado', cancelado_por = 'lojista', motivo_cancelamento = v_motivo
  WHERE id_lojista = v_c.id_lojista
    AND id_pet = v_a.id_pet
    AND dt_agendamento = v_a.dt_agendamento
    AND status IN ('Pendente', 'Confirmado');

  -- Garantia: se o agendamento já não estava ativo, a corrida cai mesmo assim.
  UPDATE taxidog_corrida SET status = 'cancelada'
  WHERE id_corrida = p_id_corrida AND status <> 'cancelada';

  SELECT nome, telefone INTO v_cliente FROM cliente WHERE id_cliente = v_c.id_cliente;
  SELECT nome INTO v_pet FROM pet WHERE id_pet = v_c.id_pet;
  SELECT nome_loja INTO v_loja FROM lojista WHERE id_lojista = v_c.id_lojista;

  RETURN json_build_object(
    'cliente_nome', v_cliente.nome,
    'cliente_telefone', v_cliente.telefone,
    'pet', v_pet,
    'loja', v_loja,
    'minutos', v_limite
  );
END;
$$;
REVOKE ALL ON FUNCTION fn_cancelar_retirada_por_espera(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_cancelar_retirada_por_espera(UUID) TO authenticated;
