-- ============================================================
-- PETSHOP SaaS - Migration 071: cliente remarca enquanto Pendente
-- ============================================================
-- Mesma regra do "alterar serviço ou pet" (migration 070):
-- • Loja (agenda): remarca Pendente ou Aceito, como antes.
-- • Cliente: o próprio agendamento, só enquanto Pendente (o pedido
--   inteiro, se houver serviços marcados juntos). Depois que a loja aceita,
--   só a loja remarca.
-- • Cliente respeita a janela do agendamento online (antecedência mínima e
--   máxima da loja, migration 025) — horários fora dela nem aparecem.
-- Resto igual: dias fechados (trigger da 066), TaxiDog, plano e registro
-- em agendamento_remarcacao (quem remarcou fica em id_usuario).
-- Funções da 066 (fn_horarios_remarcar) e da 065 (fn_remarcar_agendamento)
-- com só essas mudanças.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_horarios_remarcar(p_id_agendamento UUID, p_data DATE)
RETURNS TABLE (hr_slot TIME, disponivel BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag        agendamento%ROWTYPE;
  v_ids       UUID[];
  v_base      TIME;
  v_duracao   INTEGER;
  v_dia       dia_semana;
  v_hr_inicio TIME;
  v_hr_fim    TIME;
  v_slot      TIME;
  v_min       TIMESTAMPTZ;
  v_max       TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF fn_agenda_da_loja(v_ag.id_lojista) THEN
    -- Loja: qualquer horário que ainda não passou.
    v_min := NOW();
    v_max := 'infinity';
  ELSIF auth.uid() IS NOT NULL AND v_ag.id_cliente = auth.uid() AND v_ag.status = 'Pendente' THEN
    -- Cliente: a janela do agendamento online.
    SELECT j.min_instante, j.max_instante INTO v_min, v_max FROM fn_janela_agendamento(v_ag.id_lojista) j;
  ELSE
    RETURN;
  END IF;

  -- O pedido: serviços do mesmo pet, dia e created_at ainda por fazer.
  SELECT array_agg(a.id_agendamento), MIN(a.hr_agendamento)
  INTO v_ids, v_base
  FROM agendamento a
  WHERE a.id_lojista = v_ag.id_lojista AND a.id_pet IS NOT DISTINCT FROM v_ag.id_pet
    AND a.dt_agendamento = v_ag.dt_agendamento AND a.created_at = v_ag.created_at
    AND a.status IN ('Pendente', 'Confirmado');
  IF v_ids IS NULL THEN
    RETURN;
  END IF;

  -- Duração total do bloco (do primeiro início ao último fim).
  SELECT CEIL(EXTRACT(EPOCH FROM MAX(a.hr_agendamento + s.duracao * INTERVAL '1 minute') - v_base) / 60)::INTEGER
  INTO v_duracao
  FROM agendamento a JOIN servico s ON s.id_servico = a.id_servico
  WHERE a.id_agendamento = ANY (v_ids);

  v_dia := CASE EXTRACT(DOW FROM p_data)
    WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Segunda' WHEN 2 THEN 'Terça' WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta' WHEN 5 THEN 'Sexta' WHEN 6 THEN 'Sábado' END::dia_semana;
  SELECT h.hr_inicio, h.hr_fim INTO v_hr_inicio, v_hr_fim
  FROM horario h WHERE h.id_lojista = v_ag.id_lojista AND h.dia_semana = v_dia AND h.ativo = TRUE LIMIT 1;
  IF v_hr_inicio IS NULL OR p_data < CURRENT_DATE OR fn_dia_bloqueado(v_ag.id_lojista, p_data) THEN
    RETURN;
  END IF;

  v_slot := v_hr_inicio;
  WHILE (v_slot + v_duracao * INTERVAL '1 minute') <= v_hr_fim LOOP
    IF (p_data + v_slot) AT TIME ZONE 'America/Sao_Paulo' BETWEEN v_min AND v_max THEN
      hr_slot := v_slot;
      disponivel := NOT (p_data = v_ag.dt_agendamento AND v_slot = v_base)
        AND NOT fn_horario_bloqueado(v_ag.id_lojista, p_data, v_slot, v_slot + v_duracao * INTERVAL '1 minute')
        AND NOT EXISTS (
          SELECT 1 FROM agendamento a
          WHERE a.id_lojista = v_ag.id_lojista
            AND a.dt_agendamento = p_data
            AND a.status <> 'Cancelado'
            AND NOT (a.id_agendamento = ANY (v_ids))
            AND v_slot < (a.hr_agendamento + (SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico) * INTERVAL '1 minute')
            AND (v_slot + v_duracao * INTERVAL '1 minute') > a.hr_agendamento
        );
      RETURN NEXT;
    END IF;
    v_slot := v_slot + INTERVAL '30 minutes';
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION fn_horarios_remarcar(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_horarios_remarcar(UUID, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION fn_remarcar_agendamento(p_id_agendamento UUID, p_data DATE, p_hora TIME, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag        agendamento%ROWTYPE;
  v_loja      BOOLEAN;
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
  v_min       TIMESTAMPTZ;
  v_max       TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;
  v_loja := fn_agenda_da_loja(v_ag.id_lojista);
  IF v_loja THEN
    IF v_ag.status NOT IN ('Pendente', 'Confirmado') THEN
      RAISE EXCEPTION 'Só dá para remarcar agendamento pendente ou aceito';
    END IF;
  ELSIF auth.uid() IS NOT NULL AND v_ag.id_cliente = auth.uid() THEN
    IF v_ag.status <> 'Pendente' OR EXISTS (
      SELECT 1 FROM agendamento a
      WHERE a.id_lojista = v_ag.id_lojista AND a.id_pet IS NOT DISTINCT FROM v_ag.id_pet
        AND a.dt_agendamento = v_ag.dt_agendamento AND a.created_at = v_ag.created_at
        AND a.status = 'Confirmado'
    ) THEN
      RAISE EXCEPTION 'A loja já aceitou este agendamento — para mudar a data ou o horário, fale com a loja';
    END IF;
  ELSE
    RAISE EXCEPTION 'Agendamento não encontrado';
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
  -- Cliente: dentro da janela do agendamento online.
  IF NOT v_loja THEN
    SELECT j.min_instante, j.max_instante INTO v_min, v_max FROM fn_janela_agendamento(v_ag.id_lojista) j;
    IF (p_data + p_hora) AT TIME ZONE 'America/Sao_Paulo' < v_min THEN
      RAISE EXCEPTION 'Esse horário está muito em cima — a loja pede mais antecedência. Escolha um horário mais para frente';
    END IF;
    IF (p_data + p_hora) AT TIME ZONE 'America/Sao_Paulo' > v_max THEN
      RAISE EXCEPTION 'A loja aceita agendamentos online até %. Escolha uma data mais próxima',
        to_char(v_max AT TIME ZONE 'America/Sao_Paulo', 'DD/MM');
    END IF;
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
REVOKE ALL ON FUNCTION fn_remarcar_agendamento(UUID, DATE, TIME, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_remarcar_agendamento(UUID, DATE, TIME, TEXT) TO authenticated;
