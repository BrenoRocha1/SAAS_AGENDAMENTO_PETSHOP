-- ============================================================
-- PETSHOP SaaS - Migration 076: agendamentos simultâneos
-- ============================================================
-- Até aqui a loja inteira era uma vaga só: um agendamento em qualquer
-- horário deixava aquele horário ocupado para todo mundo. Loja com mais de
-- um profissional (ou mais de uma mesa/banheira) perdia horário.
--
-- Agora a loja escolhe QUANTOS agendamentos aceita ao mesmo tempo
-- (lojista.agendamentos_simultaneos, de 1 a 20; padrão 1 = igual a antes).
-- Um horário só fica ocupado quando esse limite é atingido em algum
-- momento do intervalo do serviço.
--
-- Regras que acompanham:
-- • O MESMO pet nunca tem dois serviços no mesmo horário (com limite 1
--   isso era impossível; com mais, precisava ser dito).
-- • Com profissional escolhido (fn_horarios_disponiveis_funcionario /
--   fn_criar_agendamento_multiplo com p_id_funcionario), vale o de antes:
--   o que conta é a agenda daquele profissional.
-- • Quem confere vaga para gravar (criar, remarcar, trocar serviço) pega
--   uma trava da agenda daquela loja naquele dia, para duas pessoas ao
--   mesmo tempo não passarem do limite.
-- • Diminuir o limite não mexe nos agendamentos que já existem.
--
-- As 8 funções abaixo são as versões que estavam valendo (035, 039, 070,
-- 071 e 074), só com a conferência de horário trocada.
-- ============================================================

ALTER TABLE lojista
  ADD COLUMN IF NOT EXISTS agendamentos_simultaneos INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lojista DROP CONSTRAINT IF EXISTS lojista_agendamentos_simultaneos_check;
ALTER TABLE lojista ADD CONSTRAINT lojista_agendamentos_simultaneos_check
  CHECK (agendamentos_simultaneos BETWEEN 1 AND 20);

-- ============================================================
-- 1) Peças da conferência
-- ============================================================
CREATE OR REPLACE FUNCTION fn_capacidade_loja(p_id_lojista UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT l.agendamentos_simultaneos FROM lojista l WHERE l.id_lojista = p_id_lojista), 1)
$$;

-- Maior número de agendamentos acontecendo AO MESMO TEMPO dentro de
-- [p_ini, p_fim). Dois agendamentos em sequência (10:00–10:30 e
-- 10:30–11:00) contam 1, não 2: o pico é medido no começo de cada um.
CREATE OR REPLACE FUNCTION fn_pico_simultaneos(
  p_id_lojista UUID,
  p_data       DATE,
  p_ini        TIME,
  p_fim        TIME,
  p_ignorar    UUID[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ocupados AS (
    SELECT a.hr_agendamento AS ini, a.hr_agendamento + s.duracao * INTERVAL '1 minute' AS fim
    FROM agendamento a
    JOIN servico s ON s.id_servico = a.id_servico
    WHERE a.id_lojista = p_id_lojista
      AND a.dt_agendamento = p_data
      AND a.status <> 'Cancelado'
      AND (p_ignorar IS NULL OR NOT (a.id_agendamento = ANY (p_ignorar)))
      AND p_ini < a.hr_agendamento + s.duracao * INTERVAL '1 minute'
      AND p_fim > a.hr_agendamento
  )
  SELECT COALESCE(MAX(n), 0)::INTEGER
  FROM (
    SELECT (SELECT COUNT(*) FROM ocupados o2 WHERE o2.ini <= ponto.t AND o2.fim > ponto.t) AS n
    FROM (SELECT GREATEST(o.ini, p_ini) AS t FROM ocupados o) ponto
  ) picos
$$;

CREATE OR REPLACE FUNCTION fn_horario_lotado(
  p_id_lojista UUID,
  p_data       DATE,
  p_ini        TIME,
  p_fim        TIME,
  p_ignorar    UUID[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fn_pico_simultaneos(p_id_lojista, p_data, p_ini, p_fim, p_ignorar) >= fn_capacidade_loja(p_id_lojista)
$$;

-- O pet já tem outro serviço (não cancelado) nesse intervalo?
CREATE OR REPLACE FUNCTION fn_pet_ocupado(
  p_id_lojista UUID,
  p_id_pet     UUID,
  p_data       DATE,
  p_ini        TIME,
  p_fim        TIME,
  p_ignorar    UUID[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_id_pet IS NOT NULL AND EXISTS (
    SELECT 1
    FROM agendamento a
    JOIN servico s ON s.id_servico = a.id_servico
    WHERE a.id_lojista = p_id_lojista
      AND a.id_pet = p_id_pet
      AND a.dt_agendamento = p_data
      AND a.status <> 'Cancelado'
      AND (p_ignorar IS NULL OR NOT (a.id_agendamento = ANY (p_ignorar)))
      AND p_ini < a.hr_agendamento + s.duracao * INTERVAL '1 minute'
      AND p_fim > a.hr_agendamento
  )
$$;

-- Trava a agenda de uma loja num dia até o fim da transação: quem confere
-- vaga para gravar espera a vez (sem isso, dois pedidos ao mesmo tempo
-- contariam a mesma vaga).
CREATE OR REPLACE FUNCTION fn_travar_agenda(p_id_lojista UUID, p_data DATE)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(p_id_lojista::TEXT || '|' || p_data::TEXT, 0))
$$;

-- Confere a vaga para gravar: trava, vê o pet e o limite da loja.
CREATE OR REPLACE FUNCTION fn_conferir_vaga(
  p_id_lojista UUID,
  p_data       DATE,
  p_ini        TIME,
  p_fim        TIME,
  p_ignorar    UUID[] DEFAULT NULL,
  p_id_pet     UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_travar_agenda(p_id_lojista, p_data);
  IF fn_pet_ocupado(p_id_lojista, p_id_pet, p_data, p_ini, p_fim, p_ignorar) THEN
    RAISE EXCEPTION 'Horário não disponível. Este pet já tem um serviço nesse horário.';
  END IF;
  IF fn_horario_lotado(p_id_lojista, p_data, p_ini, p_fim, p_ignorar) THEN
    RAISE EXCEPTION 'Horário não disponível. Por favor, escolha outro horário.';
  END IF;
END;
$$;

-- Peças internas: só as funções do banco chamam.
REVOKE ALL ON FUNCTION fn_capacidade_loja(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_pico_simultaneos(UUID, DATE, TIME, TIME, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_horario_lotado(UUID, DATE, TIME, TIME, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_pet_ocupado(UUID, UUID, DATE, TIME, TIME, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_travar_agenda(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_conferir_vaga(UUID, DATE, TIME, TIME, UUID[], UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 2) A loja escolhe o limite (dono ou administrador)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_definir_agendamentos_simultaneos(p_quantidade INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
BEGIN
  IF v_loja IS NULL OR NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 20 THEN
    RAISE EXCEPTION 'Simultâneos: escolha um número de 1 a 20';
  END IF;
  UPDATE lojista SET agendamentos_simultaneos = p_quantidade WHERE id_lojista = v_loja;
  RETURN p_quantidade;
END;
$$;
REVOKE ALL ON FUNCTION fn_definir_agendamentos_simultaneos(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_definir_agendamentos_simultaneos(INTEGER) TO authenticated;

-- ============================================================
-- 3) Horários livres
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
  v_cap         INTEGER;  -- agendamentos simultâneos da loja
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

  v_cap := fn_capacidade_loja(p_id_lojista);
  v_min := FLOOR(EXTRACT(EPOCH FROM v_hr_inicio) / 60)::INTEGER;
  -- 23:59 no máximo: um serviço que termina à meia-noite em ponto também
  -- daria a volta nas comparações de TIME abaixo.
  v_fim_min := LEAST(FLOOR(EXTRACT(EPOCH FROM v_hr_fim) / 60)::INTEGER, 1439);

  WHILE v_min + p_duracao <= v_fim_min LOOP
    v_slot := make_time(v_min / 60, v_min % 60, 0);
    IF (p_data + v_slot) AT TIME ZONE 'America/Sao_Paulo' BETWEEN v_min_instante AND v_max_instante THEN
      hr_slot := v_slot;
      disponivel := NOT fn_horario_bloqueado(p_id_lojista, p_data, v_slot, v_slot + p_duracao * INTERVAL '1 minute')
        AND fn_pico_simultaneos(p_id_lojista, p_data, v_slot, (v_slot + p_duracao * INTERVAL '1 minute')::TIME) < v_cap;
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
  v_cap         INTEGER;  -- agendamentos simultâneos da loja
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

  v_cap := fn_capacidade_loja(p_id_lojista);
  v_min := FLOOR(EXTRACT(EPOCH FROM v_hr_inicio) / 60)::INTEGER;
  v_fim_min := LEAST(FLOOR(EXTRACT(EPOCH FROM v_hr_fim) / 60)::INTEGER, 1439);

  WHILE v_min + p_duracao <= v_fim_min LOOP
    v_slot := make_time(v_min / 60, v_min % 60, 0);
    IF (p_data + v_slot) AT TIME ZONE 'America/Sao_Paulo' BETWEEN v_min_instante AND v_max_instante THEN
      hr_slot := v_slot;
      disponivel := NOT fn_horario_bloqueado(p_id_lojista, p_data, v_slot, v_slot + p_duracao * INTERVAL '1 minute')
        AND CASE WHEN p_id_funcionario IS NULL
          -- Loja inteira: até o limite de agendamentos simultâneos.
          THEN fn_pico_simultaneos(p_id_lojista, p_data, v_slot, (v_slot + p_duracao * INTERVAL '1 minute')::TIME) < v_cap
          -- Profissional escolhido: ele não pode estar em outro atendimento.
          ELSE NOT EXISTS (
            SELECT 1 FROM agendamento a
            WHERE a.id_lojista = p_id_lojista
              AND a.dt_agendamento = p_data
              AND a.status NOT IN ('Cancelado')
              AND a.id_funcionario = p_id_funcionario
              AND (
                v_slot < (a.hr_agendamento + (
                  SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
                ) * INTERVAL '1 minute')
                AND (v_slot + p_duracao * INTERVAL '1 minute') > a.hr_agendamento
              )
          )
        END;
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
  v_cap       INTEGER;  -- agendamentos simultâneos da loja
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

  v_cap := fn_capacidade_loja(v_ag.id_lojista);
  v_minuto := FLOOR(EXTRACT(EPOCH FROM v_hr_inicio) / 60)::INTEGER;
  v_fim_min := LEAST(FLOOR(EXTRACT(EPOCH FROM v_hr_fim) / 60)::INTEGER, 1439);

  WHILE v_minuto + v_duracao <= v_fim_min LOOP
    v_slot := make_time(v_minuto / 60, v_minuto % 60, 0);
    IF (p_data + v_slot) AT TIME ZONE 'America/Sao_Paulo' BETWEEN v_min AND v_max THEN
      hr_slot := v_slot;
      disponivel := NOT (p_data = v_ag.dt_agendamento AND v_slot = v_base)
        AND NOT fn_horario_bloqueado(v_ag.id_lojista, p_data, v_slot, v_slot + v_duracao * INTERVAL '1 minute')
        AND fn_pico_simultaneos(v_ag.id_lojista, p_data, v_slot, (v_slot + v_duracao * INTERVAL '1 minute')::TIME, v_ids) < v_cap
        AND NOT fn_pet_ocupado(v_ag.id_lojista, v_ag.id_pet, p_data, v_slot, (v_slot + v_duracao * INTERVAL '1 minute')::TIME, v_ids);
      RETURN NEXT;
    END IF;
    v_minuto := v_minuto + 30;
  END LOOP;
END;
$$;

-- ============================================================
-- 4) Criar, remarcar e trocar o serviço
-- ============================================================
CREATE OR REPLACE FUNCTION fn_criar_agendamento_lojista(
  p_id_lojista    UUID,
  p_id_cliente    UUID,
  p_id_pet        UUID,
  p_id_servico    UUID,
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
  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid() AND pode_gerenciar_agenda = TRUE AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar a agenda';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  SELECT duracao
  INTO v_duracao
  FROM servico
  WHERE id_servico = p_id_servico
    AND id_lojista = p_id_lojista
    AND status = 'Ativo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet
      AND id_cliente = p_id_cliente
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente informado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cliente_lojista
    WHERE id_lojista = p_id_lojista
      AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'Este cliente ainda não possui histórico no seu petshop';
  END IF;

  -- Vaga: até o limite de agendamentos simultâneos da loja (migration 076).
  PERFORM fn_conferir_vaga(p_id_lojista, p_data, p_hora, (p_hora + v_duracao * INTERVAL '1 minute')::TIME, NULL, p_id_pet);

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  v_preco := fn_calcular_preco_servico(p_id_servico, p_id_pet);

  INSERT INTO agendamento (
    id_pet, id_servico, id_cliente, id_lojista,
    dt_agendamento, hr_agendamento, valor, status, obs
  )
  VALUES (
    p_id_pet, p_id_servico, p_id_cliente, p_id_lojista,
    p_data, p_hora, v_preco, 'Confirmado', p_obs
  )
  RETURNING id_agendamento INTO v_id_agendamento;

  RETURN v_id_agendamento;
END;
$$;

CREATE OR REPLACE FUNCTION fn_criar_agendamento(
  p_id_pet        UUID,
  p_id_servico    UUID,
  p_id_cliente    UUID,
  p_id_lojista    UUID,
  p_data          DATE,
  p_hora          TIME,
  p_obs           TEXT DEFAULT NULL,
  p_produtos      UUID[] DEFAULT NULL,
  p_quantidades   NUMERIC[] DEFAULT NULL
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
  v_min_instante    TIMESTAMPTZ;
  v_max_instante    TIMESTAMPTZ;
  v_min_valor       INTEGER;
  v_min_unidade     TEXT;
  v_max_valor       INTEGER;
  v_max_unidade     TEXT;
  v_produto         produto%ROWTYPE;
  v_valor_produtos  NUMERIC(10,2) := 0;
  i                 INTEGER;
BEGIN
  IF p_id_cliente IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE AND aceita_agendamento_online = TRUE
  ) THEN
    RAISE EXCEPTION 'Este petshop não está aceitando agendamentos online no momento.';
  END IF;

  SELECT j.min_instante, j.max_instante INTO v_min_instante, v_max_instante
  FROM fn_janela_agendamento(p_id_lojista) j;

  IF (p_data + p_hora) AT TIME ZONE 'America/Sao_Paulo' < v_min_instante THEN
    SELECT agendamento_min_valor, agendamento_min_unidade INTO v_min_valor, v_min_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Agende com pelo menos % % de antecedência.', v_min_valor, CASE WHEN v_min_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  IF (p_data + p_hora) AT TIME ZONE 'America/Sao_Paulo' > v_max_instante THEN
    SELECT agendamento_max_valor, agendamento_max_unidade INTO v_max_valor, v_max_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Não é possível agendar com mais de % % de antecedência.', v_max_valor, CASE WHEN v_max_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  SELECT duracao
  INTO v_duracao
  FROM servico
  WHERE id_servico = p_id_servico
    AND id_lojista = p_id_lojista
    AND status = 'Ativo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  -- Vaga: até o limite de agendamentos simultâneos da loja (migration 076).
  PERFORM fn_conferir_vaga(p_id_lojista, p_data, p_hora, (p_hora + v_duracao * INTERVAL '1 minute')::TIME, NULL, p_id_pet);

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet
      AND id_cliente = p_id_cliente
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente';
  END IF;

  v_preco := fn_calcular_preco_servico(p_id_servico, p_id_pet);

  INSERT INTO agendamento (
    id_pet, id_servico, id_cliente, id_lojista,
    dt_agendamento, hr_agendamento, valor, status, obs
  )
  VALUES (
    p_id_pet, p_id_servico, p_id_cliente, p_id_lojista,
    p_data, p_hora, v_preco, 'Pendente', p_obs
  )
  RETURNING id_agendamento INTO v_id_agendamento;

  -- Produtos opcionais — ver comentário no topo do arquivo.
  IF p_produtos IS NOT NULL AND array_length(p_produtos, 1) > 0 THEN
    IF p_quantidades IS NULL OR array_length(p_quantidades, 1) IS DISTINCT FROM array_length(p_produtos, 1) THEN
      RAISE EXCEPTION 'Lista de produtos inválida';
    END IF;

    FOR i IN 1..array_length(p_produtos, 1) LOOP
      SELECT * INTO v_produto FROM produto
      WHERE id_produto = p_produtos[i]
        AND id_lojista = p_id_lojista
        AND status = 'Ativo'
        AND disponivel_agendamento_online = TRUE
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um dos produtos escolhidos não está mais disponível';
      END IF;

      IF p_quantidades[i] IS NULL OR p_quantidades[i] <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida para %', v_produto.nome;
      END IF;

      IF v_produto.estoque_atual < p_quantidades[i] THEN
        RAISE EXCEPTION 'Estoque insuficiente de %', v_produto.nome;
      END IF;

      UPDATE produto SET estoque_atual = estoque_atual - p_quantidades[i] WHERE id_produto = v_produto.id_produto;

      INSERT INTO movimento_estoque (id_produto, id_lojista, tipo, quantidade, origem, id_referencia, created_by)
      VALUES (v_produto.id_produto, p_id_lojista, 'saida', p_quantidades[i], 'venda', v_id_agendamento, p_id_cliente);

      INSERT INTO agendamento_produto (id_agendamento, id_produto, id_lojista, id_cliente, quantidade, preco_unitario)
      VALUES (v_id_agendamento, v_produto.id_produto, p_id_lojista, p_id_cliente, p_quantidades[i], v_produto.preco_venda);

      v_valor_produtos := v_valor_produtos + (v_produto.preco_venda * p_quantidades[i]);
    END LOOP;

    UPDATE agendamento SET valor = valor + v_valor_produtos WHERE id_agendamento = v_id_agendamento;
  END IF;

  RETURN v_id_agendamento;
END;
$$;

CREATE OR REPLACE FUNCTION fn_criar_agendamento_multiplo(
  p_id_pet          UUID,
  p_id_cliente      UUID,
  p_id_lojista      UUID,
  p_data            DATE,
  p_hora_inicio     TIME,
  p_servicos        UUID[],
  p_id_funcionario  UUID DEFAULT NULL,
  p_obs             TEXT DEFAULT NULL,
  p_produtos        UUID[] DEFAULT NULL,
  p_quantidades     NUMERIC[] DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids             UUID[] := '{}';
  v_id_agendamento  UUID;
  v_id_servico      UUID;
  v_preco           NUMERIC(10,2);
  v_duracao         INTEGER;
  v_duracao_total   INTEGER;
  v_cursor          TIME := p_hora_inicio;
  v_conflict        BOOLEAN;
  v_dia_semana      dia_semana;
  v_hr_inicio       TIME;
  v_hr_fim          TIME;
  v_min_instante    TIMESTAMPTZ;
  v_max_instante    TIMESTAMPTZ;
  v_min_valor       INTEGER;
  v_min_unidade     TEXT;
  v_max_valor       INTEGER;
  v_max_unidade     TEXT;
  v_produto         produto%ROWTYPE;
  v_valor_produtos  NUMERIC(10,2) := 0;
  v_id_alvo         UUID;
  i                 INTEGER;
BEGIN
  IF p_id_cliente IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF p_servicos IS NULL OR array_length(p_servicos, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos um serviço';
  END IF;

  IF array_length(p_servicos, 1) > 10 THEN
    RAISE EXCEPTION 'Selecione no máximo 10 serviços por agendamento';
  END IF;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE AND aceita_agendamento_online = TRUE
  ) THEN
    RAISE EXCEPTION 'Este petshop não está aceitando agendamentos online no momento.';
  END IF;

  SELECT j.min_instante, j.max_instante INTO v_min_instante, v_max_instante
  FROM fn_janela_agendamento(p_id_lojista) j;

  IF (p_data + p_hora_inicio) AT TIME ZONE 'America/Sao_Paulo' < v_min_instante THEN
    SELECT agendamento_min_valor, agendamento_min_unidade INTO v_min_valor, v_min_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Agende com pelo menos % % de antecedência.', v_min_valor, CASE WHEN v_min_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  IF (p_data + p_hora_inicio) AT TIME ZONE 'America/Sao_Paulo' > v_max_instante THEN
    SELECT agendamento_max_valor, agendamento_max_unidade INTO v_max_valor, v_max_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Não é possível agendar com mais de % % de antecedência.', v_max_valor, CASE WHEN v_max_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet AND id_cliente = p_id_cliente AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente';
  END IF;

  IF p_id_funcionario IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = p_id_funcionario AND id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Profissional não encontrado';
  END IF;

  SELECT COALESCE(SUM(duracao), 0) INTO v_duracao_total
  FROM servico
  WHERE id_servico = ANY(p_servicos) AND id_lojista = p_id_lojista AND status = 'Ativo';

  IF v_duracao_total = 0 THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
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

  SELECT h.hr_inicio, h.hr_fim INTO v_hr_inicio, v_hr_fim
  FROM horario h
  WHERE h.id_lojista = p_id_lojista AND h.dia_semana = v_dia_semana AND h.ativo = TRUE
  LIMIT 1;

  IF v_hr_inicio IS NULL THEN
    RAISE EXCEPTION 'A loja não abre nesse dia';
  END IF;

  IF p_hora_inicio < v_hr_inicio OR (p_hora_inicio + (v_duracao_total || ' minutes')::INTERVAL) > v_hr_fim THEN
    RAISE EXCEPTION 'Horário fora do funcionamento da loja';
  END IF;

  FOREACH v_id_servico IN ARRAY p_servicos LOOP
    SELECT duracao
    INTO v_duracao
    FROM servico
    WHERE id_servico = v_id_servico AND id_lojista = p_id_lojista AND status = 'Ativo'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Serviço não encontrado ou inativo';
    END IF;

    v_preco := fn_calcular_preco_servico(v_id_servico, p_id_pet);

    IF p_id_funcionario IS NULL THEN
      -- Loja inteira: até o limite de agendamentos simultâneos (migration 076).
      PERFORM fn_conferir_vaga(p_id_lojista, p_data, v_cursor, (v_cursor + v_duracao * INTERVAL '1 minute')::TIME, NULL, p_id_pet);
    ELSE
      -- Profissional escolhido: ele não pode estar em outro atendimento
      -- (regra de antes, sem mudança).
      SELECT EXISTS (
        SELECT 1 FROM agendamento a
        WHERE a.id_lojista = p_id_lojista
          AND a.dt_agendamento = p_data
          AND a.status NOT IN ('Cancelado')
          AND a.id_funcionario = p_id_funcionario
          AND (
            v_cursor < (a.hr_agendamento + (
              SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
            ) * INTERVAL '1 minute')
            AND (v_cursor + v_duracao * INTERVAL '1 minute') > a.hr_agendamento
          )
        FOR UPDATE SKIP LOCKED
      ) INTO v_conflict;

      IF v_conflict THEN
        RAISE EXCEPTION 'Horário não disponível. Por favor, escolha outro horário.';
      END IF;
    END IF;

    INSERT INTO agendamento (
      id_pet, id_servico, id_cliente, id_lojista, id_funcionario,
      dt_agendamento, hr_agendamento, valor, status, obs
    )
    VALUES (
      p_id_pet, v_id_servico, p_id_cliente, p_id_lojista, p_id_funcionario,
      p_data, v_cursor, v_preco, 'Pendente', p_obs
    )
    RETURNING id_agendamento INTO v_id_agendamento;

    v_ids := array_append(v_ids, v_id_agendamento);
    v_cursor := v_cursor + (v_duracao || ' minutes')::INTERVAL;
  END LOOP;

  -- Produtos opcionais, todos anexados ao primeiro agendamento do
  -- carrinho — ver comentário no topo do arquivo.
  IF p_produtos IS NOT NULL AND array_length(p_produtos, 1) > 0 THEN
    IF p_quantidades IS NULL OR array_length(p_quantidades, 1) IS DISTINCT FROM array_length(p_produtos, 1) THEN
      RAISE EXCEPTION 'Lista de produtos inválida';
    END IF;

    v_id_alvo := v_ids[1];

    FOR i IN 1..array_length(p_produtos, 1) LOOP
      SELECT * INTO v_produto FROM produto
      WHERE id_produto = p_produtos[i]
        AND id_lojista = p_id_lojista
        AND status = 'Ativo'
        AND disponivel_agendamento_online = TRUE
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um dos produtos escolhidos não está mais disponível';
      END IF;

      IF p_quantidades[i] IS NULL OR p_quantidades[i] <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida para %', v_produto.nome;
      END IF;

      IF v_produto.estoque_atual < p_quantidades[i] THEN
        RAISE EXCEPTION 'Estoque insuficiente de %', v_produto.nome;
      END IF;

      UPDATE produto SET estoque_atual = estoque_atual - p_quantidades[i] WHERE id_produto = v_produto.id_produto;

      INSERT INTO movimento_estoque (id_produto, id_lojista, tipo, quantidade, origem, id_referencia, created_by)
      VALUES (v_produto.id_produto, p_id_lojista, 'saida', p_quantidades[i], 'venda', v_id_alvo, p_id_cliente);

      INSERT INTO agendamento_produto (id_agendamento, id_produto, id_lojista, id_cliente, quantidade, preco_unitario)
      VALUES (v_id_alvo, v_produto.id_produto, p_id_lojista, p_id_cliente, p_quantidades[i], v_produto.preco_venda);

      v_valor_produtos := v_valor_produtos + (v_produto.preco_venda * p_quantidades[i]);
    END LOOP;

    UPDATE agendamento SET valor = valor + v_valor_produtos WHERE id_agendamento = v_id_alvo;
  END IF;

  RETURN v_ids;
END;
$$;

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
    -- Vaga: até o limite de agendamentos simultâneos da loja (migration 076).
    PERFORM fn_conferir_vaga(v_ag.id_lojista, p_data, v_item.novo_hr::TIME,
      (v_item.novo_hr + v_item.duracao * INTERVAL '1 minute')::TIME, v_ids, v_ag.id_pet);
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

CREATE OR REPLACE FUNCTION fn_editar_agendamento(
  p_id_agendamento UUID,
  p_id_servico     UUID,
  p_id_pet         UUID,
  p_usar_beneficio BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag          agendamento%ROWTYPE;
  v_loja        BOOLEAN;
  v_quem        TEXT;
  v_srv         servico%ROWTYPE;
  v_pet         pet%ROWTYPE;
  v_muda_srv    BOOLEAN;
  v_muda_pet    BOOLEAN;
  v_ids         UUID[];
  v_alvos       UUID[];
  v_fim         TIME;
  v_hr_fim      TIME;
  v_dia         dia_semana;
  v_outro       RECORD;
  v_u           RECORD;
  v_m           RECORD;
  v_prod        NUMERIC;
  v_tx          NUMERIC;
  v_preco       NUMERIC;
  v_novo_valor  NUMERIC;
  v_nome_ant    TEXT;
  v_pet_ant     TEXT;
  v_avisos      TEXT[] := '{}';
  v_devolveu    BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Editar: agendamento não encontrado';
  END IF;

  v_loja := fn_agenda_da_loja(v_ag.id_lojista);
  IF v_loja THEN
    v_quem := 'loja';
    IF v_ag.status NOT IN ('Pendente', 'Confirmado') THEN
      RAISE EXCEPTION 'Editar: só dá para alterar agendamento pendente ou aceito';
    END IF;
  ELSIF auth.uid() IS NOT NULL AND v_ag.id_cliente = auth.uid() THEN
    v_quem := 'cliente';
    IF v_ag.status <> 'Pendente' THEN
      RAISE EXCEPTION 'Editar: a loja já aceitou este agendamento — para mudar, fale com a loja';
    END IF;
  ELSE
    RAISE EXCEPTION 'Editar: agendamento não encontrado';
  END IF;

  v_muda_srv := p_id_servico IS NOT NULL AND p_id_servico <> v_ag.id_servico;
  v_muda_pet := p_id_pet IS NOT NULL AND p_id_pet IS DISTINCT FROM v_ag.id_pet;
  IF NOT v_muda_srv AND NOT v_muda_pet THEN
    RAISE EXCEPTION 'Editar: nada mudou — escolha outro serviço ou outro pet';
  END IF;

  -- O pedido (serviços do mesmo pet, dia e created_at).
  SELECT array_agg(a.id_agendamento) INTO v_ids
  FROM agendamento a
  WHERE a.id_lojista = v_ag.id_lojista AND a.id_pet IS NOT DISTINCT FROM v_ag.id_pet
    AND a.dt_agendamento = v_ag.dt_agendamento AND a.created_at = v_ag.created_at
    AND a.status IN ('Pendente', 'Confirmado');

  -- ── Serviço novo: existe, está ativo e cabe no horário ──
  IF v_muda_srv THEN
    SELECT * INTO v_srv FROM servico WHERE id_servico = p_id_servico AND id_lojista = v_ag.id_lojista;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Editar: serviço não encontrado';
    END IF;
    IF v_srv.status <> 'Ativo' THEN
      RAISE EXCEPTION 'Editar: o serviço % está desativado', v_srv.nome;
    END IF;
    v_fim := v_ag.hr_agendamento + v_srv.duracao * INTERVAL '1 minute';

    v_dia := CASE EXTRACT(DOW FROM v_ag.dt_agendamento)
      WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Segunda' WHEN 2 THEN 'Terça' WHEN 3 THEN 'Quarta'
      WHEN 4 THEN 'Quinta' WHEN 5 THEN 'Sexta' WHEN 6 THEN 'Sábado' END::dia_semana;
    SELECT h.hr_fim INTO v_hr_fim FROM horario h
    WHERE h.id_lojista = v_ag.id_lojista AND h.dia_semana = v_dia AND h.ativo = TRUE LIMIT 1;
    IF v_hr_fim IS NOT NULL AND (v_fim > v_hr_fim OR v_fim < v_ag.hr_agendamento) THEN
      RAISE EXCEPTION 'Editar: % termina às % e a loja fecha às % — remarque para mais cedo ou escolha outro serviço',
        v_srv.nome, to_char(v_fim, 'HH24:MI'), to_char(v_hr_fim, 'HH24:MI');
    END IF;
    IF fn_horario_bloqueado(v_ag.id_lojista, v_ag.dt_agendamento, v_ag.hr_agendamento, v_fim) THEN
      RAISE EXCEPTION 'Editar: % termina às % e entra num horário em que a loja está fechada — remarque antes',
        v_srv.nome, to_char(v_fim, 'HH24:MI');
    END IF;
    PERFORM fn_travar_agenda(v_ag.id_lojista, v_ag.dt_agendamento);
    -- Outro serviço do MESMO pet nesse intervalo (ex.: o próximo do pedido)
    -- nunca pode sobrepor, com qualquer limite de simultâneos.
    SELECT a.hr_agendamento AS hr, s.nome AS servico INTO v_outro
    FROM agendamento a JOIN servico s ON s.id_servico = a.id_servico
    WHERE a.id_lojista = v_ag.id_lojista AND a.dt_agendamento = v_ag.dt_agendamento
      AND a.status <> 'Cancelado' AND a.id_agendamento <> v_ag.id_agendamento
      AND a.id_pet IS NOT DISTINCT FROM v_ag.id_pet
      AND v_ag.hr_agendamento < a.hr_agendamento + s.duracao * INTERVAL '1 minute'
      AND v_fim > a.hr_agendamento
    ORDER BY a.hr_agendamento
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Editar: % leva % min (até %) e bate com outro serviço do mesmo pet às % — remarque antes ou escolha outro serviço',
        v_srv.nome, v_srv.duracao, to_char(v_fim, 'HH24:MI'), to_char(v_outro.hr, 'HH24:MI');
    END IF;
    -- Loja: até o limite de agendamentos simultâneos (migration 076).
    IF fn_horario_lotado(v_ag.id_lojista, v_ag.dt_agendamento, v_ag.hr_agendamento, v_fim, ARRAY[v_ag.id_agendamento]) THEN
      SELECT a.hr_agendamento AS hr, s.nome AS servico INTO v_outro
      FROM agendamento a JOIN servico s ON s.id_servico = a.id_servico
      WHERE a.id_lojista = v_ag.id_lojista AND a.dt_agendamento = v_ag.dt_agendamento
        AND a.status <> 'Cancelado' AND a.id_agendamento <> v_ag.id_agendamento
        AND v_ag.hr_agendamento < a.hr_agendamento + s.duracao * INTERVAL '1 minute'
        AND v_fim > a.hr_agendamento
      ORDER BY a.hr_agendamento
      LIMIT 1;
      RAISE EXCEPTION 'Editar: % leva % min (até %) e bate com outro agendamento às % — remarque antes ou escolha outro serviço',
        v_srv.nome, v_srv.duracao, to_char(v_fim, 'HH24:MI'), to_char(v_outro.hr, 'HH24:MI');
    END IF;
  END IF;

  -- ── Pet novo: do mesmo cliente, ativo, e o pedido sem TaxiDog ──
  IF v_muda_pet THEN
    SELECT * INTO v_pet FROM pet WHERE id_pet = p_id_pet;
    IF NOT FOUND OR v_pet.id_cliente IS DISTINCT FROM v_ag.id_cliente THEN
      RAISE EXCEPTION 'Editar: escolha um pet do mesmo cliente';
    END IF;
    IF NOT COALESCE(v_pet.ativo, TRUE) THEN
      RAISE EXCEPTION 'Editar: o pet % está desativado', v_pet.nome;
    END IF;
    IF EXISTS (
      SELECT 1 FROM agendamento a
      WHERE a.id_lojista = v_ag.id_lojista AND a.id_pet IS NOT DISTINCT FROM v_ag.id_pet
        AND a.dt_agendamento = v_ag.dt_agendamento AND a.created_at = v_ag.created_at
        AND a.status = 'Em andamento'
    ) THEN
      RAISE EXCEPTION 'Editar: parte deste pedido já está em atendimento — não dá para trocar o pet';
    END IF;
    IF EXISTS (SELECT 1 FROM taxidog_corrida c WHERE c.id_agendamento = ANY (v_ids) AND c.status <> 'cancelada') THEN
      RAISE EXCEPTION 'Editar: este agendamento tem TaxiDog — retire o TaxiDog (em Transporte) antes de trocar o pet';
    END IF;
  END IF;

  -- A partir daqui a trava da 032 deixa trocar pet/serviço (só nesta transação).
  PERFORM set_config('saip.editar_agendamento', 'on', TRUE);

  -- Plano: benefício usado nos agendamentos afetados volta ao saldo.
  v_alvos := CASE WHEN v_muda_pet THEN v_ids ELSE ARRAY[v_ag.id_agendamento] END;
  FOR v_u IN
    SELECT u.id_utilizacao, u.valor_abatido, u.id_assinatura, u.id_agendamento
    FROM assinatura_utilizacao u
    WHERE u.id_agendamento = ANY (v_alvos) AND u.estornada_em IS NULL
    FOR UPDATE
  LOOP
    UPDATE assinatura_utilizacao
    SET estornada_em = NOW(),
        motivo_estorno = CASE WHEN v_muda_pet THEN 'Pet trocado no agendamento' ELSE 'Serviço trocado no agendamento' END
    WHERE id_utilizacao = v_u.id_utilizacao;
    UPDATE agendamento SET valor = valor + v_u.valor_abatido WHERE id_agendamento = v_u.id_agendamento;
    PERFORM fn_plano_registrar(v_ag.id_lojista, (SELECT id_plano FROM assinatura WHERE id_assinatura = v_u.id_assinatura), v_u.id_assinatura,
      'beneficio_estornado',
      format('%s trocado no agendamento de %s — o benefício voltou ao saldo',
             CASE WHEN v_muda_pet THEN 'Pet' ELSE 'Serviço' END, to_char(v_ag.dt_agendamento, 'DD/MM/YYYY')));
    v_devolveu := TRUE;
  END LOOP;
  IF v_devolveu THEN
    v_avisos := array_append(v_avisos, 'O benefício do plano que estava em uso voltou ao saldo.'::TEXT);
  END IF;

  -- Pet: o pedido inteiro, preço de cada serviço para o pet novo.
  IF v_muda_pet THEN
    SELECT nome INTO v_pet_ant FROM pet WHERE id_pet = v_ag.id_pet;
    FOR v_m IN SELECT a.id_agendamento, a.id_servico, a.valor FROM agendamento a WHERE a.id_agendamento = ANY (v_ids) LOOP
      SELECT COALESCE(SUM(quantidade * preco_unitario), 0) INTO v_prod FROM agendamento_produto WHERE id_agendamento = v_m.id_agendamento;
      SELECT COALESCE(SUM(valor), 0) INTO v_tx FROM taxidog_corrida WHERE id_agendamento = v_m.id_agendamento AND status <> 'cancelada';
      v_preco := fn_calcular_preco_servico(v_m.id_servico, p_id_pet);
      v_novo_valor := v_prod + v_tx + v_preco;
      UPDATE agendamento SET id_pet = p_id_pet, valor = v_novo_valor WHERE id_agendamento = v_m.id_agendamento;
      INSERT INTO agendamento_alteracao (id_lojista, id_agendamento, campo, anterior, novo, valor_anterior, valor_novo, feito_por, id_usuario)
      VALUES (v_ag.id_lojista, v_m.id_agendamento, 'pet', v_pet_ant, v_pet.nome, v_m.valor, v_novo_valor, v_quem, auth.uid());
    END LOOP;
    IF array_length(v_ids, 1) > 1 THEN
      v_avisos := array_append(v_avisos, format('Os %s serviços marcados juntos passaram para %s.', array_length(v_ids, 1), v_pet.nome));
    END IF;
  END IF;

  -- Serviço: só este agendamento, preço para o pet (já o novo, se trocou).
  IF v_muda_srv THEN
    SELECT nome INTO v_nome_ant FROM servico WHERE id_servico = v_ag.id_servico;
    SELECT COALESCE(SUM(quantidade * preco_unitario), 0) INTO v_prod FROM agendamento_produto WHERE id_agendamento = v_ag.id_agendamento;
    SELECT COALESCE(SUM(valor), 0) INTO v_tx FROM taxidog_corrida WHERE id_agendamento = v_ag.id_agendamento AND status <> 'cancelada';
    v_preco := fn_calcular_preco_servico(p_id_servico, COALESCE(p_id_pet, v_ag.id_pet));
    v_novo_valor := v_prod + v_tx + v_preco;
    UPDATE agendamento SET id_servico = p_id_servico, valor = v_novo_valor WHERE id_agendamento = v_ag.id_agendamento;
    INSERT INTO agendamento_alteracao (id_lojista, id_agendamento, campo, anterior, novo, valor_anterior, valor_novo, feito_por, id_usuario)
    VALUES (v_ag.id_lojista, v_ag.id_agendamento, 'servico', v_nome_ant, v_srv.nome, v_ag.valor, v_novo_valor, v_quem, auth.uid());
  END IF;

  PERFORM set_config('saip.editar_agendamento', 'off', TRUE);

  -- Plano no serviço novo (só a loja; se não der, avisa e segue).
  IF v_loja AND COALESCE(p_usar_beneficio, FALSE) THEN
    BEGIN
      PERFORM fn_usar_beneficio(v_ag.id_agendamento);
      v_avisos := array_append(v_avisos, 'Benefício do plano usado — o serviço não é cobrado neste agendamento.'::TEXT);
    EXCEPTION WHEN OTHERS THEN
      v_avisos := array_append(v_avisos, ('Não deu para usar o plano: ' || SQLERRM)::TEXT);
    END;
  END IF;

  SELECT valor INTO v_novo_valor FROM agendamento WHERE id_agendamento = v_ag.id_agendamento;
  RETURN jsonb_build_object(
    'valor_anterior', v_ag.valor,
    'valor_novo', v_novo_valor,
    'avisos', to_jsonb(v_avisos)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
