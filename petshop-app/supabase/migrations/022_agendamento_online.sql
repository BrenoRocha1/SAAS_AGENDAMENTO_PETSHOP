-- ============================================================
-- PETSHOP SaaS - Migration 022: Agendamento Online (link público)
-- ============================================================
-- Contexto: nova página pública /agendamento/[id_lojista] onde o cliente
-- (já logado) agenda direto pelo link da loja. Três coisas novas que o
-- fluxo atual (fn_criar_agendamento, um serviço por vez, sem profissional)
-- não cobre:
--
--   1. Carrinho com vários serviços num agendamento só — vira um
--      agendamento por serviço, encadeados (um começa onde o anterior
--      termina), tudo numa transação só (fn_criar_agendamento_multiplo).
--   2. Cliente escolhendo o profissional que atende — agendamento.
--      id_funcionario já existia (migration 012), mas só o lojista
--      preenchia depois manualmente. Agora, se o cliente escolhe um
--      profissional específico, a disponibilidade passa a ser calculada
--      SÓ contra os agendamentos daquele profissional (permite dois
--      profissionais atenderem ao mesmo tempo na loja). Se o cliente não
--      escolher ninguém ("sem preferência"), o comportamento continua
--      igual ao de hoje: verifica conflito contra a loja inteira.
--   3. O cliente precisa ver a lista de funcionários pra escolher — a
--      tabela `funcionario` não é visível pra cliente nenhum (RLS só
--      libera pro próprio funcionário e pro lojista dono), por isso
--      fn_funcionarios_publicos expõe só nome/cargo dos ativos.
-- ============================================================

-- ============================================================
-- FUNÇÃO: lista pública (só o necessário) de profissionais de uma loja
-- ============================================================
CREATE OR REPLACE FUNCTION fn_funcionarios_publicos(p_id_lojista UUID)
RETURNS TABLE (
  id_funcionario  UUID,
  nome            TEXT,
  cargo           TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id_funcionario, nome, cargo
  FROM funcionario
  WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ORDER BY nome;
$$;

REVOKE ALL ON FUNCTION fn_funcionarios_publicos(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_funcionarios_publicos(UUID) TO authenticated;

-- ============================================================
-- FUNÇÃO: horários disponíveis, opcionalmente filtrados por profissional
-- Igual fn_horarios_disponiveis (migration 003), só que quando
-- p_id_funcionario é informado, o conflito é checado só contra os
-- agendamentos DAQUELE profissional — não da loja inteira.
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
BEGIN
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
    v_slot := v_slot + v_intervalo;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fn_horarios_disponiveis_funcionario(UUID, DATE, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_horarios_disponiveis_funcionario(UUID, DATE, INTEGER, UUID) TO authenticated;

-- ============================================================
-- FUNÇÃO: criar vários agendamentos (um por serviço do carrinho) numa
-- transação só — ou agenda tudo, ou nada (ex.: se o 2º serviço não
-- couber mais no horário, os anteriores desse mesmo carrinho também são
-- desfeitos, já que é tudo uma função só).
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

  -- Duração combinada de todos os serviços do carrinho, pra conferir de
  -- uma vez só se cabe dentro do horário de funcionamento do dia.
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

    -- Mesma checagem de conflito de fn_criar_agendamento, só que
    -- restrita ao profissional escolhido quando houver um (senão,
    -- continua sendo a loja inteira — igual ao comportamento de hoje).
    -- Como cada iteração já fez INSERT antes da próxima rodar, o
    -- agendamento anterior deste mesmo carrinho também entra nessa
    -- checagem — não tem como dois serviços do mesmo carrinho colidirem.
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

REVOKE ALL ON FUNCTION fn_criar_agendamento_multiplo(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_multiplo(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT) TO authenticated;
