-- ============================================================
-- PETSHOP SaaS - Migration 074: horários com a loja fechando perto da
-- meia-noite
-- ============================================================
-- Bug: com o fechamento em 23:59 (ou qualquer hora em que "último horário
-- + duração do serviço" passe da meia-noite), as funções que listam os
-- horários livres não terminavam nunca. Elas andavam de 30 em 30 minutos
-- somando num valor TIME, e TIME dá a volta no relógio: 23:30 + 36 min vira
-- 00:06, que é "menor que 23:59" — o laço continuava para sempre, o banco
-- cancelava a consulta por tempo e a tela mostrava "Sem horário de
-- funcionamento cadastrado para este dia".
--
-- Agora o laço anda em MINUTOS desde a meia-noite (número inteiro, não dá
-- a volta): só entra o horário cujo serviço termina até o fechamento.
-- Vale para as três funções que listam horários:
--   fn_horarios_disponiveis              (era a da 067)
--   fn_horarios_disponiveis_funcionario  (era a da 066)
--   fn_horarios_remarcar                 (era a da 071)
-- Nada mais muda nelas.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_horarios_disponiveis(
  p_id_lojista  UUID,
  p_data        DATE,
  p_duracao     INTEGER
)
RETURNS TABLE (
  hr_slot       TIME,
  disponivel    BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia_semana  dia_semana;
  v_hr_inicio   TIME;
  v_hr_fim      TIME;
  v_slot        TIME;
  v_min         INTEGER;  -- minutos desde 00:00
  v_fim_min     INTEGER;
  v_min_instante TIMESTAMPTZ;
  v_max_instante TIMESTAMPTZ;
BEGIN
  IF fn_agenda_da_loja(p_id_lojista) THEN
    v_min_instante := NOW();
    v_max_instante := 'infinity';
  ELSE
    SELECT j.min_instante, j.max_instante INTO v_min_instante, v_max_instante
    FROM fn_janela_agendamento(p_id_lojista) j;
  END IF;

  v_dia_semana := CASE EXTRACT(DOW FROM p_data)
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END::dia_semana;

  SELECT h.hr_inicio, h.hr_fim
  INTO v_hr_inicio, v_hr_fim
  FROM horario h
  WHERE h.id_lojista = p_id_lojista
    AND h.dia_semana = v_dia_semana
    AND h.ativo = TRUE
  LIMIT 1;

  IF v_hr_inicio IS NULL OR p_duracao IS NULL OR p_duracao <= 0 OR fn_dia_bloqueado(p_id_lojista, p_data) THEN
    RETURN;
  END IF;

  v_min := FLOOR(EXTRACT(EPOCH FROM v_hr_inicio) / 60)::INTEGER;
  -- 23:59 no máximo: um serviço que termina à meia-noite em ponto também
  -- daria a volta nas comparações de TIME abaixo.
  v_fim_min := LEAST(FLOOR(EXTRACT(EPOCH FROM v_hr_fim) / 60)::INTEGER, 1439);

  WHILE v_min + p_duracao <= v_fim_min LOOP
    v_slot := make_time(v_min / 60, v_min % 60, 0);
    IF (p_data + v_slot) AT TIME ZONE 'America/Sao_Paulo' BETWEEN v_min_instante AND v_max_instante THEN
      hr_slot := v_slot;
      disponivel := NOT fn_horario_bloqueado(p_id_lojista, p_data, v_slot, v_slot + p_duracao * INTERVAL '1 minute')
        AND NOT EXISTS (
        SELECT 1 FROM agendamento a
        WHERE a.id_lojista = p_id_lojista
          AND a.dt_agendamento = p_data
          AND a.status NOT IN ('Cancelado')
          AND (
            v_slot < (a.hr_agendamento + (
              SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
            ) * INTERVAL '1 minute')
            AND (v_slot + p_duracao * INTERVAL '1 minute') > a.hr_agendamento
          )
      );
      RETURN NEXT;
    END IF;
    v_min := v_min + 30;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_horarios_disponiveis_funcionario(
  p_id_lojista      UUID,
  p_data            DATE,
  p_duracao         INTEGER,
  p_id_funcionario  UUID DEFAULT NULL
)
RETURNS TABLE (
  hr_slot     TIME,
  disponivel  BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia_semana  dia_semana;
  v_hr_inicio   TIME;
  v_hr_fim      TIME;
  v_slot        TIME;
  v_min         INTEGER;  -- minutos desde 00:00
  v_fim_min     INTEGER;
  v_min_instante TIMESTAMPTZ;
  v_max_instante TIMESTAMPTZ;
BEGIN
  SELECT j.min_instante, j.max_instante INTO v_min_instante, v_max_instante
  FROM fn_janela_agendamento(p_id_lojista) j;

  v_dia_semana := CASE EXTRACT(DOW FROM p_data)
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END::dia_semana;

  SELECT h.hr_inicio, h.hr_fim
  INTO v_hr_inicio, v_hr_fim
  FROM horario h
  WHERE h.id_lojista = p_id_lojista
    AND h.dia_semana = v_dia_semana
    AND h.ativo = TRUE
  LIMIT 1;

  IF v_hr_inicio IS NULL OR p_duracao IS NULL OR p_duracao <= 0 OR fn_dia_bloqueado(p_id_lojista, p_data) THEN
    RETURN;
  END IF;

  v_min := FLOOR(EXTRACT(EPOCH FROM v_hr_inicio) / 60)::INTEGER;
  v_fim_min := LEAST(FLOOR(EXTRACT(EPOCH FROM v_hr_fim) / 60)::INTEGER, 1439);

  WHILE v_min + p_duracao <= v_fim_min LOOP
    v_slot := make_time(v_min / 60, v_min % 60, 0);
    IF (p_data + v_slot) AT TIME ZONE 'America/Sao_Paulo' BETWEEN v_min_instante AND v_max_instante THEN
      hr_slot := v_slot;
      disponivel := NOT fn_horario_bloqueado(p_id_lojista, p_data, v_slot, v_slot + p_duracao * INTERVAL '1 minute')
        AND NOT EXISTS (
        SELECT 1 FROM agendamento a
        WHERE a.id_lojista = p_id_lojista
          AND a.dt_agendamento = p_data
          AND a.status NOT IN ('Cancelado')
          AND (p_id_funcionario IS NULL OR a.id_funcionario = p_id_funcionario)
          AND (
            v_slot < (a.hr_agendamento + (
              SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
            ) * INTERVAL '1 minute')
            AND (v_slot + p_duracao * INTERVAL '1 minute') > a.hr_agendamento
          )
      );
      RETURN NEXT;
    END IF;
    v_min := v_min + 30;
  END LOOP;
END;
$$;

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
  v_minuto    INTEGER;  -- minutos desde 00:00
  v_fim_min   INTEGER;
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
  IF v_hr_inicio IS NULL OR v_duracao IS NULL OR v_duracao <= 0
     OR p_data < CURRENT_DATE OR fn_dia_bloqueado(v_ag.id_lojista, p_data) THEN
    RETURN;
  END IF;

  v_minuto := FLOOR(EXTRACT(EPOCH FROM v_hr_inicio) / 60)::INTEGER;
  v_fim_min := LEAST(FLOOR(EXTRACT(EPOCH FROM v_hr_fim) / 60)::INTEGER, 1439);

  WHILE v_minuto + v_duracao <= v_fim_min LOOP
    v_slot := make_time(v_minuto / 60, v_minuto % 60, 0);
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
    v_minuto := v_minuto + 30;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
