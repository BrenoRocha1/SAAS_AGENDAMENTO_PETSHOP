-- ============================================================
-- PETSHOP SaaS - Migration 003: Funções e Stored Procedures
-- ============================================================

-- ============================================================
-- FUNÇÃO: Verificar disponibilidade de horário
-- Usada pelo frontend para mostrar slots disponíveis
-- ============================================================
CREATE OR REPLACE FUNCTION fn_horarios_disponiveis(
  p_id_lojista  UUID,
  p_data        DATE,
  p_duracao     INTEGER  -- duração do serviço em minutos
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
  v_intervalo   INTERVAL := '30 minutes'; -- intervalos de 30 em 30
BEGIN
  -- Descobrir o dia da semana para a data
  v_dia_semana := CASE EXTRACT(DOW FROM p_data)
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END::dia_semana;

  -- Buscar horário de funcionamento do lojista para esse dia
  SELECT h.hr_inicio, h.hr_fim
  INTO v_hr_inicio, v_hr_fim
  FROM horario h
  WHERE h.id_lojista = p_id_lojista
    AND h.dia_semana = v_dia_semana
    AND h.ativo = TRUE
  LIMIT 1;

  -- Se não há horário cadastrado para esse dia, retorna vazio
  IF v_hr_inicio IS NULL THEN
    RETURN;
  END IF;

  -- Gerar slots de tempo disponíveis
  v_slot := v_hr_inicio;
  WHILE (v_slot + (p_duracao || ' minutes')::INTERVAL) <= v_hr_fim LOOP
    hr_slot := v_slot;
    -- Verificar se o slot está livre (sem agendamento ativo)
    disponivel := NOT EXISTS (
      SELECT 1 FROM agendamento a
      WHERE a.id_lojista = p_id_lojista
        AND a.dt_agendamento = p_data
        AND a.status NOT IN ('Cancelado')
        AND (
          -- Verifica sobreposição de slots considerando duração do serviço existente
          v_slot < (a.hr_agendamento + (
            SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
          ) * INTERVAL '1 minute')
          AND (v_slot + p_duracao * INTERVAL '1 minute') > a.hr_agendamento
        )
    );
    RETURN NEXT;
    v_slot := v_slot + v_intervalo;
  END LOOP;
END;
$$;

-- ============================================================
-- FUNÇÃO: Criar agendamento com verificação de conflito
-- Usa FOR UPDATE para evitar race condition (double-booking)
-- Chamada pela Edge Function — não diretamente pelo cliente
-- ============================================================
CREATE OR REPLACE FUNCTION fn_criar_agendamento(
  p_id_pet        UUID,
  p_id_servico    UUID,
  p_id_cliente    UUID,
  p_id_lojista    UUID,
  p_data          DATE,
  p_hora          TIME,
  p_obs           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_agendamento  UUID;
  v_preco           NUMERIC(10,2);
  v_duracao         INTEGER;
  v_conflict        BOOLEAN;
BEGIN
  -- Verificar que o cliente é quem está chamando
  IF p_id_cliente != auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  -- Buscar preço e duração do serviço (com lock)
  SELECT preco, duracao
  INTO v_preco, v_duracao
  FROM servico
  WHERE id_servico = p_id_servico
    AND id_lojista = p_id_lojista
    AND status = 'Ativo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  -- Verificar disponibilidade com lock pessimista
  SELECT EXISTS (
    SELECT 1 FROM agendamento a
    WHERE a.id_lojista = p_id_lojista
      AND a.dt_agendamento = p_data
      AND a.status NOT IN ('Cancelado')
      AND (
        p_hora < (a.hr_agendamento + (
          SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
        ) * INTERVAL '1 minute')
        AND (p_hora + v_duracao * INTERVAL '1 minute') > a.hr_agendamento
      )
    FOR UPDATE SKIP LOCKED
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'Horário não disponível. Por favor, escolha outro horário.';
  END IF;

  -- Verificar que a data não é passada
  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  -- Verificar que o pet pertence ao cliente
  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet
      AND id_cliente = p_id_cliente
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente';
  END IF;

  -- Criar agendamento
  INSERT INTO agendamento (
    id_pet, id_servico, id_cliente, id_lojista,
    dt_agendamento, hr_agendamento, valor, status, obs
  )
  VALUES (
    p_id_pet, p_id_servico, p_id_cliente, p_id_lojista,
    p_data, p_hora, v_preco, 'Pendente', p_obs
  )
  RETURNING id_agendamento INTO v_id_agendamento;

  RETURN v_id_agendamento;
END;
$$;

-- ============================================================
-- FUNÇÃO: Cancelar agendamento (cliente ou lojista)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_cancelar_agendamento(
  p_id_agendamento  UUID,
  p_motivo          TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_cliente    UUID;
  v_id_lojista    UUID;
  v_status        status_agendamento;
  v_cancelado_por TEXT;
BEGIN
  -- Buscar dados do agendamento
  SELECT id_cliente, id_lojista, status
  INTO v_id_cliente, v_id_lojista, v_status
  FROM agendamento
  WHERE id_agendamento = p_id_agendamento
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  -- Verificar permissão
  IF auth.uid() = v_id_cliente THEN
    v_cancelado_por := 'cliente';
  ELSIF auth.uid() = v_id_lojista THEN
    v_cancelado_por := 'lojista';
  ELSE
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  -- Verificar se pode cancelar
  IF v_status IN ('Cancelado', 'Concluído') THEN
    RAISE EXCEPTION 'Agendamento com status "%" não pode ser cancelado', v_status;
  END IF;

  -- Executar cancelamento
  UPDATE agendamento
  SET
    status = 'Cancelado',
    cancelado_por = v_cancelado_por,
    motivo_cancelamento = p_motivo
  WHERE id_agendamento = p_id_agendamento;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- FUNÇÃO: Dashboard do lojista — métricas do mês
-- ============================================================
CREATE OR REPLACE FUNCTION fn_metricas_lojista(p_id_lojista UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT json_build_object(
    'total_mes',        COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM dt_agendamento) = EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM dt_agendamento) = EXTRACT(YEAR FROM NOW())),
    'receita_mes',      COALESCE(SUM(valor) FILTER (WHERE status = 'Concluído' AND EXTRACT(MONTH FROM dt_agendamento) = EXTRACT(MONTH FROM NOW())), 0),
    'pendentes',        COUNT(*) FILTER (WHERE status = 'Pendente'),
    'confirmados',      COUNT(*) FILTER (WHERE status = 'Confirmado'),
    'hoje',             COUNT(*) FILTER (WHERE dt_agendamento = CURRENT_DATE AND status NOT IN ('Cancelado')),
    'clientes_unicos',  COUNT(DISTINCT id_cliente)
  )
  INTO v_result
  FROM agendamento
  WHERE id_lojista = p_id_lojista;

  RETURN v_result;
END;
$$;

-- ============================================================
-- FUNÇÃO: Slots da agenda do dia para lojista
-- ============================================================
CREATE OR REPLACE FUNCTION fn_agenda_dia(
  p_id_lojista  UUID,
  p_data        DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id_agendamento  UUID,
  hr_agendamento  TIME,
  nome_cliente    TEXT,
  nome_pet        TEXT,
  nome_servico    TEXT,
  duracao         INTEGER,
  status          status_agendamento,
  valor           NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    a.id_agendamento,
    a.hr_agendamento,
    c.nome AS nome_cliente,
    p.nome AS nome_pet,
    s.nome AS nome_servico,
    s.duracao,
    a.status,
    a.valor
  FROM agendamento a
  JOIN cliente c ON c.id_cliente = a.id_cliente
  JOIN pet     p ON p.id_pet = a.id_pet
  JOIN servico s ON s.id_servico = a.id_servico
  WHERE a.id_lojista = p_id_lojista
    AND a.dt_agendamento = p_data
    AND a.status != 'Cancelado'
  ORDER BY a.hr_agendamento;
END;
$$;
