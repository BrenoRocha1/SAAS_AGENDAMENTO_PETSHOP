-- ============================================================
-- PETSHOP SaaS - Migration 065: correção do remarcar (avisos)
-- ============================================================
-- Achado no teste da 064: ao remarcar para outro dia com o TaxiDog numa
-- rota (ou benefício de plano fora do período), juntar o aviso na lista
-- (TEXT[] || 'texto') era lido pelo Postgres como array || array e dava
-- "malformed array literal" — a remarcação inteira voltava atrás. Agora
-- usa array_append. Mesma função da 064 com só essa troca.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_remarcar_agendamento(p_id_agendamento UUID, p_data DATE, p_hora TIME, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag        agendamento%ROWTYPE;
  v_ids       UUID[];
  v_base      TIME;
  v_dia       dia_semana;
  v_hr_inicio TIME;
  v_hr_fim    TIME;
  v_item      RECORD;
  v_c         taxidog_corrida%ROWTYPE;
  v_u         RECORD;
  v_rota      UUID;
  v_pet       TEXT;
  v_avisos    TEXT[] := '{}';
  v_muda_dia  BOOLEAN;
  v_motivo    TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento FOR UPDATE;
  IF NOT FOUND OR NOT fn_agenda_da_loja(v_ag.id_lojista) THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;
  IF v_ag.status NOT IN ('Pendente', 'Confirmado') THEN
    RAISE EXCEPTION 'Só dá para remarcar agendamento pendente ou aceito';
  END IF;
  IF v_motivo IS NOT NULL AND char_length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'Motivo muito longo (até 300 letras)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM agendamento a
    WHERE a.id_lojista = v_ag.id_lojista AND a.id_pet IS NOT DISTINCT FROM v_ag.id_pet
      AND a.dt_agendamento = v_ag.dt_agendamento AND a.created_at = v_ag.created_at
      AND a.status = 'Em andamento'
  ) THEN
    RAISE EXCEPTION 'Parte deste pedido já está em atendimento — não dá para remarcar';
  END IF;

  -- Serializa remarcações/criações concorrentes no mesmo dia da loja.
  PERFORM pg_advisory_xact_lock(hashtext(v_ag.id_lojista::TEXT || p_data::TEXT));

  SELECT array_agg(a.id_agendamento ORDER BY a.hr_agendamento), MIN(a.hr_agendamento)
  INTO v_ids, v_base
  FROM agendamento a
  WHERE a.id_lojista = v_ag.id_lojista AND a.id_pet IS NOT DISTINCT FROM v_ag.id_pet
    AND a.dt_agendamento = v_ag.dt_agendamento AND a.created_at = v_ag.created_at
    AND a.status IN ('Pendente', 'Confirmado');

  IF p_data IS NULL OR p_hora IS NULL THEN
    RAISE EXCEPTION 'Escolha a nova data e o horário';
  END IF;
  IF p_data < CURRENT_DATE OR (p_data = CURRENT_DATE AND p_hora <= LOCALTIME) THEN
    RAISE EXCEPTION 'Escolha uma data e horário que ainda não passaram';
  END IF;
  IF p_data = v_ag.dt_agendamento AND p_hora = v_base THEN
    RAISE EXCEPTION 'Escolha uma data ou horário diferente do atual';
  END IF;
  v_muda_dia := p_data <> v_ag.dt_agendamento;

  v_dia := CASE EXTRACT(DOW FROM p_data)
    WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Segunda' WHEN 2 THEN 'Terça' WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta' WHEN 5 THEN 'Sexta' WHEN 6 THEN 'Sábado' END::dia_semana;
  SELECT h.hr_inicio, h.hr_fim INTO v_hr_inicio, v_hr_fim
  FROM horario h WHERE h.id_lojista = v_ag.id_lojista AND h.dia_semana = v_dia AND h.ativo = TRUE LIMIT 1;
  IF v_hr_inicio IS NULL THEN
    RAISE EXCEPTION 'A loja não abre nesse dia';
  END IF;

  -- Cada serviço do pedido no horário novo: dentro do expediente e sem
  -- sobrepor outro agendamento (fora os do próprio pedido).
  FOR v_item IN
    SELECT a.id_agendamento, p_hora + (a.hr_agendamento - v_base) AS novo_hr, s.duracao
    FROM agendamento a JOIN servico s ON s.id_servico = a.id_servico
    WHERE a.id_agendamento = ANY (v_ids)
  LOOP
    IF v_item.novo_hr < v_hr_inicio OR v_item.novo_hr + v_item.duracao * INTERVAL '1 minute' > v_hr_fim THEN
      RAISE EXCEPTION 'Fora do horário de funcionamento (% às %)', to_char(v_hr_inicio, 'HH24:MI'), to_char(v_hr_fim, 'HH24:MI');
    END IF;
    IF EXISTS (
      SELECT 1 FROM agendamento a
      WHERE a.id_lojista = v_ag.id_lojista
        AND a.dt_agendamento = p_data
        AND a.status <> 'Cancelado'
        AND NOT (a.id_agendamento = ANY (v_ids))
        AND v_item.novo_hr < (a.hr_agendamento + (SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico) * INTERVAL '1 minute')
        AND (v_item.novo_hr + v_item.duracao * INTERVAL '1 minute') > a.hr_agendamento
    ) THEN
      RAISE EXCEPTION 'Horário não disponível. Escolha outro horário.';
    END IF;
  END LOOP;

  -- TaxiDog: trocando de dia, a corrida precisa estar "parada".
  IF v_muda_dia THEN
    FOR v_c IN SELECT * FROM taxidog_corrida WHERE id_agendamento = ANY (v_ids) AND status NOT IN ('cancelada', 'concluida') LOOP
      IF v_c.status <> 'agendada' THEN
        RAISE EXCEPTION 'O TaxiDog já está em andamento para este pet — conclua ou cancele o transporte antes de remarcar para outro dia';
      END IF;
    END LOOP;
  END IF;

  -- Registra e move.
  INSERT INTO agendamento_remarcacao (id_lojista, id_agendamento, dt_anterior, hr_anterior, dt_nova, hr_nova, motivo, id_usuario)
  SELECT a.id_lojista, a.id_agendamento, a.dt_agendamento, a.hr_agendamento, p_data, p_hora + (a.hr_agendamento - v_base), v_motivo, auth.uid()
  FROM agendamento a WHERE a.id_agendamento = ANY (v_ids);

  UPDATE agendamento a
  SET dt_agendamento = p_data, hr_agendamento = p_hora + (a.hr_agendamento - v_base)
  WHERE a.id_agendamento = ANY (v_ids);

  SELECT nome INTO v_pet FROM pet WHERE id_pet = v_ag.id_pet;

  -- TaxiDog: a parada sai da rota do dia antigo.
  IF v_muda_dia THEN
    FOR v_c IN SELECT * FROM taxidog_corrida WHERE id_agendamento = ANY (v_ids) AND status = 'agendada' LOOP
      FOR v_rota IN
        SELECT DISTINCT i.id_rota FROM taxidog_parada_item i
        JOIN taxidog_rota r ON r.id_rota = i.id_rota
        WHERE i.id_corrida = v_c.id_corrida AND NOT i.feito AND r.status NOT IN ('concluida', 'cancelada')
      LOOP
        DELETE FROM taxidog_parada_item WHERE id_corrida = v_c.id_corrida AND id_rota = v_rota AND NOT feito;
        PERFORM fn_limpar_rota(v_rota);
        UPDATE taxidog_rota SET versao = versao + 1,
          ultima_alteracao = format('%s foi remarcado para %s — a parada saiu da rota', COALESCE(v_pet, 'O pet'), to_char(p_data, 'DD/MM'))
        WHERE id_rota = v_rota;
        PERFORM fn_rota_verificar_fim(v_rota);
        v_avisos := array_append(v_avisos, 'O TaxiDog saiu da rota do dia antigo — coloque numa rota do dia novo, se precisar.'::TEXT);
      END LOOP;
    END LOOP;
  END IF;

  -- Plano: benefício fora do período da data nova volta ao saldo.
  FOR v_u IN
    SELECT u.id_utilizacao, u.id_agendamento, u.valor_abatido, u.id_assinatura, per.inicio, per.fim
    FROM assinatura_utilizacao u JOIN assinatura_periodo per ON per.id_periodo = u.id_periodo
    WHERE u.id_agendamento = ANY (v_ids) AND u.estornada_em IS NULL
      AND NOT (p_data BETWEEN per.inicio AND per.fim)
  LOOP
    UPDATE assinatura_utilizacao SET estornada_em = NOW(), motivo_estorno = 'Remarcado para fora do período do plano'
    WHERE id_utilizacao = v_u.id_utilizacao;
    UPDATE agendamento SET valor = valor + v_u.valor_abatido WHERE id_agendamento = v_u.id_agendamento;
    INSERT INTO assinatura_historico (id_lojista, id_plano, id_assinatura, tipo, descricao, id_usuario)
    SELECT v_ag.id_lojista, a.id_plano, a.id_assinatura, 'beneficio_estornado',
           format('Agendamento remarcado para %s (fora do período) — o benefício voltou ao saldo', to_char(p_data, 'DD/MM/YYYY')), auth.uid()
    FROM assinatura a WHERE a.id_assinatura = v_u.id_assinatura;
    v_avisos := array_append(v_avisos, 'O benefício do plano voltou ao saldo (a nova data está fora do período) — use de novo pelo detalhe, se couber.'::TEXT);
  END LOOP;

  RETURN jsonb_build_object(
    'movidos', array_length(v_ids, 1),
    'avisos', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_avisos)))
  );
END;
$$;
