-- ============================================================
-- PETSHOP SaaS - Migration 067: "Criar agendamento" da loja sem a janela
-- do agendamento online
-- ============================================================
-- A janela de antecedência (migration 025: mínimo/máximo, ex.: de 3 horas
-- a 5 dias) é só para o agendamento que o CLIENTE faz sozinho — a própria
-- 025 diz isso, e fn_criar_agendamento_lojista nunca teve a trava. Mas
-- fn_horarios_disponiveis, que também alimenta o modal "Criar agendamento"
-- da loja e o "Horários livres hoje" do Dashboard, aplicava a janela para
-- todo mundo: a loja não via horário nas próximas 3 horas (encaixe) nem
-- depois de 5 dias.
--
-- Agora: se quem pergunta é a equipe da loja (fn_agenda_da_loja), vale só
-- "não pode ser no passado". Cliente e visitante continuam com a janela.
-- Resto igual à migration 066 (dias fechados).
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
  v_intervalo   INTERVAL := '30 minutes';
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

  IF v_hr_inicio IS NULL OR fn_dia_bloqueado(p_id_lojista, p_data) THEN
    RETURN;
  END IF;

  v_slot := v_hr_inicio;
  WHILE (v_slot + (p_duracao || ' minutes')::INTERVAL) <= v_hr_fim LOOP
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
    v_slot := v_slot + v_intervalo;
  END LOOP;
END;
$$;
