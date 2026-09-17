-- ============================================================
-- PETSHOP SaaS - Migration 025: janela de antecedência do agendamento online
-- ============================================================
-- Contexto: a loja passa a poder configurar duas travas pro agendamento
-- feito pelo próprio CLIENTE (online, seja pelo link novo /agendamento/
-- [id] ou pelo wizard antigo /cliente/novo-agendamento):
--
--   • Antecedência MÍNIMA: cliente não pode agendar em cima da hora
--     (ex.: mínimo 3 horas — não dá pra agendar pros próximos 3h).
--   • Antecedência MÁXIMA: cliente não pode agendar com meses de
--     antecedência (ex.: máximo 5 dias — só enxerga disponibilidade
--     dentro dos próximos 5 dias).
--
-- Cada uma tem seu próprio valor + unidade (horas ou dias) — pedido
-- explícito, pra loja poder configurar mínimo em dias também, não só
-- em horas.
--
-- Padrão (quem não configurar nada): mínimo 0 horas (pode agendar a
-- partir de agora) e máximo 30 dias (mesma janela que já existia,
-- fixa, no código) — ninguém que já usa o agendamento online hoje é
-- afetado até a loja mexer nisso.
--
-- NÃO afeta fn_criar_agendamento_lojista (walk-in/telefone criado pelo
-- PRÓPRIO lojista) — a trava é só pro agendamento que o cliente faz
-- sozinho, pedido explícito.
--
-- Todo cálculo de "agora" e de converter dt_agendamento+hr_agendamento
-- num instante comparável usa `AT TIME ZONE 'America/Sao_Paulo'`, não
-- CURRENT_DATE/NOW() puro — isso interpreta a data+hora armazenada
-- (que é sempre o horário local da loja, sem timezone) como horário de
-- Brasília e converte pra um instante real (timestamptz), comparável
-- com NOW() não importa o timezone da sessão do Postgres. Sem isso, a
-- checagem de "3 horas de antecedência" ficaria errada por causa do
-- offset UTC-3.
-- ============================================================

ALTER TABLE lojista
  ADD COLUMN IF NOT EXISTS agendamento_min_valor   INTEGER NOT NULL DEFAULT 0
    CHECK (agendamento_min_valor >= 0),
  ADD COLUMN IF NOT EXISTS agendamento_min_unidade TEXT NOT NULL DEFAULT 'horas'
    CHECK (agendamento_min_unidade IN ('horas', 'dias')),
  ADD COLUMN IF NOT EXISTS agendamento_max_valor   INTEGER NOT NULL DEFAULT 30
    CHECK (agendamento_max_valor > 0),
  ADD COLUMN IF NOT EXISTS agendamento_max_unidade TEXT NOT NULL DEFAULT 'dias'
    CHECK (agendamento_max_unidade IN ('horas', 'dias'));

-- ============================================================
-- FUNÇÃO INTERNA: instante mínimo e máximo permitido agora, pra uma loja
-- Não é pra ser chamada direto pelo cliente — só por outras funções
-- SECURITY DEFINER deste arquivo (por isso sem GRANT pra authenticated).
-- ============================================================
CREATE OR REPLACE FUNCTION fn_janela_agendamento(p_id_lojista UUID)
RETURNS TABLE (min_instante TIMESTAMPTZ, max_instante TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_valor    INTEGER;
  v_min_unidade  TEXT;
  v_max_valor    INTEGER;
  v_max_unidade  TEXT;
BEGIN
  SELECT agendamento_min_valor, agendamento_min_unidade, agendamento_max_valor, agendamento_max_unidade
  INTO v_min_valor, v_min_unidade, v_max_valor, v_max_unidade
  FROM lojista
  WHERE id_lojista = p_id_lojista;

  min_instante := NOW() + (v_min_valor || ' ' || CASE WHEN v_min_unidade = 'dias' THEN 'days' ELSE 'hours' END)::INTERVAL;
  max_instante := NOW() + (v_max_valor || ' ' || CASE WHEN v_max_unidade = 'dias' THEN 'days' ELSE 'hours' END)::INTERVAL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION fn_janela_agendamento(UUID) FROM PUBLIC;

-- ============================================================
-- fn_horarios_disponiveis: mesma lógica de sempre, só pulando (sem
-- RETURN NEXT) os slots fora da janela mínimo/máximo.
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

  IF v_hr_inicio IS NULL THEN
    RETURN;
  END IF;

  v_slot := v_hr_inicio;
  WHILE (v_slot + (p_duracao || ' minutes')::INTERVAL) <= v_hr_fim LOOP
    IF (p_data + v_slot) AT TIME ZONE 'America/Sao_Paulo' BETWEEN v_min_instante AND v_max_instante THEN
      hr_slot := v_slot;
      disponivel := NOT EXISTS (
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

-- ============================================================
-- fn_horarios_disponiveis_funcionario: mesma coisa, com o filtro por
-- profissional que já existia (migration 022).
-- ============================================================
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
  v_intervalo   INTERVAL := '30 minutes';
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

  IF v_hr_inicio IS NULL THEN
    RETURN;
  END IF;

  v_slot := v_hr_inicio;
  WHILE (v_slot + (p_duracao || ' minutes')::INTERVAL) <= v_hr_fim LOOP
    IF (p_data + v_slot) AT TIME ZONE 'America/Sao_Paulo' BETWEEN v_min_instante AND v_max_instante THEN
      hr_slot := v_slot;
      disponivel := NOT EXISTS (
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
    v_slot := v_slot + v_intervalo;
  END LOOP;
END;
$$;

-- ============================================================
-- fn_criar_agendamento: mesma função de sempre + checagem da janela.
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
  v_min_instante    TIMESTAMPTZ;
  v_max_instante    TIMESTAMPTZ;
  v_min_valor       INTEGER;
  v_min_unidade     TEXT;
  v_max_valor       INTEGER;
  v_max_unidade     TEXT;
BEGIN
  IF p_id_cliente != auth.uid() THEN
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

  RETURN v_id_agendamento;
END;
$$;

-- ============================================================
-- fn_criar_agendamento_multiplo: mesma função de sempre (migration 022)
-- + checagem da janela, feita uma vez em cima do horário de início do
-- carrinho inteiro (p_hora_inicio).
-- ============================================================
CREATE OR REPLACE FUNCTION fn_criar_agendamento_multiplo(
  p_id_pet          UUID,
  p_id_cliente      UUID,
  p_id_lojista      UUID,
  p_data            DATE,
  p_hora_inicio     TIME,
  p_servicos        UUID[],
  p_id_funcionario  UUID DEFAULT NULL,
  p_obs             TEXT DEFAULT NULL
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
BEGIN
  IF p_id_cliente != auth.uid() THEN
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

    SELECT EXISTS (
      SELECT 1 FROM agendamento a
      WHERE a.id_lojista = p_id_lojista
        AND a.dt_agendamento = p_data
        AND a.status NOT IN ('Cancelado')
        AND (p_id_funcionario IS NULL OR a.id_funcionario = p_id_funcionario)
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

  RETURN v_ids;
END;
$$;
