-- ============================================================
-- PETSHOP SaaS - Migration 058: administrador da equipe vê Dashboard e Relatórios
-- ============================================================
-- Um funcionário com "Acesso Total" (administrador, migration 029) tem o
-- mesmo acesso do dono em todas as telas — mas as funções do Dashboard e
-- do Relatório de Vendas só aceitavam o próprio dono (auth.uid() =
-- p_id_lojista), então para o administrador essas telas vinham vazias ou
-- com erro. Agora aceitam o dono OU um administrador ativo da mesma loja.
-- As funções abaixo são as mesmas de antes (035/057), só trocando essa
-- checagem.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_gestor_da_loja(p_id_lojista UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_id_lojista IS NOT NULL AND (
    auth.uid() = p_id_lojista
    OR EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid() AND id_lojista = p_id_lojista
        AND ativo = TRUE AND acesso_total = TRUE
    )
  )
$$;

REVOKE ALL ON FUNCTION fn_gestor_da_loja(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_gestor_da_loja(UUID) TO authenticated;

-- fn_metricas_lojista (antes: 035_corrige_checagem_null_lojista.sql)
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
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT json_build_object(
    'total_mes',        COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM dt_agendamento) = EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM dt_agendamento) = EXTRACT(YEAR FROM NOW())),
    -- Mês E ano (antes só o mês: setembro/2025 somava em setembro/2026).
    'receita_mes',      COALESCE(SUM(valor) FILTER (WHERE status = 'Concluído' AND EXTRACT(MONTH FROM dt_agendamento) = EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM dt_agendamento) = EXTRACT(YEAR FROM NOW())), 0),
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

-- fn_agenda_dia (antes: 035_corrige_checagem_null_lojista.sql)
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
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
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

-- fn_relatorio_vendas_resumo (antes: 035_corrige_checagem_null_lojista.sql)
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_resumo(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT json_build_object(
    'faturamento',              COALESCE(SUM(valor) FILTER (WHERE status = 'Concluído'), 0),
    'vendas',                   COUNT(*) FILTER (WHERE status = 'Concluído'),
    'pendente',                 COALESCE(SUM(valor) FILTER (WHERE status IN ('Pendente', 'Confirmado', 'Em andamento')), 0),
    'atendimentos_total',       COUNT(*) FILTER (WHERE status != 'Cancelado'),
    'valor_atendimentos_total', COALESCE(SUM(valor) FILTER (WHERE status != 'Cancelado'), 0),
    'cancelados',                COUNT(*) FILTER (WHERE status = 'Cancelado')
  )
  INTO v_result
  FROM agendamento
  WHERE id_lojista = p_id_lojista
    AND dt_agendamento BETWEEN p_data_ini AND p_data_fim;

  RETURN v_result;
END;
$$;

-- fn_relatorio_vendas_por_dia (antes: 035_corrige_checagem_null_lojista.sql)
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_por_dia(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  dia          DATE,
  vendas       BIGINT,
  faturamento  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    d.dia::date,
    COUNT(a.id_agendamento) AS vendas,
    COALESCE(SUM(a.valor), 0) AS faturamento
  FROM generate_series(p_data_ini, p_data_fim, '1 day'::interval) AS d(dia)
  LEFT JOIN agendamento a
    ON a.dt_agendamento = d.dia::date
    AND a.id_lojista = p_id_lojista
    AND a.status = 'Concluído'
  GROUP BY d.dia
  ORDER BY d.dia;
END;
$$;

-- fn_relatorio_vendas_por_servico (antes: 035_corrige_checagem_null_lojista.sql)
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_por_servico(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  id_servico   UUID,
  nome_servico TEXT,
  qtd_vendas   BIGINT,
  faturamento  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT s.id_servico, s.nome, COUNT(*), SUM(a.valor)
  FROM agendamento a
  JOIN servico s ON s.id_servico = a.id_servico
  WHERE a.id_lojista = p_id_lojista
    AND a.status = 'Concluído'
    AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
  GROUP BY s.id_servico, s.nome
  ORDER BY SUM(a.valor) DESC;
END;
$$;

-- fn_relatorio_vendas_por_profissional (antes: 035_corrige_checagem_null_lojista.sql)
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_por_profissional(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  id_funcionario    UUID,
  nome_funcionario  TEXT,
  qtd_atendimentos  BIGINT,
  faturamento       NUMERIC,
  ticket_medio      NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    f.id_funcionario,
    COALESCE(f.nome, 'Sem profissional atribuído'),
    COUNT(*),
    SUM(a.valor),
    ROUND(SUM(a.valor) / COUNT(*), 2)
  FROM agendamento a
  LEFT JOIN funcionario f ON f.id_funcionario = a.id_funcionario
  WHERE a.id_lojista = p_id_lojista
    AND a.status = 'Concluído'
    AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
  GROUP BY f.id_funcionario, f.nome
  ORDER BY SUM(a.valor) DESC;
END;
$$;

-- fn_relatorio_vendas_por_cliente (antes: 035_corrige_checagem_null_lojista.sql)
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_por_cliente(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE,
  p_limite      INT DEFAULT 10
)
RETURNS TABLE (
  id_cliente        UUID,
  nome_cliente      TEXT,
  qtd_atendimentos  BIGINT,
  valor_total       NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT c.id_cliente, c.nome, COUNT(*), SUM(a.valor)
  FROM agendamento a
  JOIN cliente c ON c.id_cliente = a.id_cliente
  WHERE a.id_lojista = p_id_lojista
    AND a.status = 'Concluído'
    AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
  GROUP BY c.id_cliente, c.nome
  ORDER BY SUM(a.valor) DESC
  LIMIT p_limite;
END;
$$;

-- fn_relatorio_clientes_resumo (antes: 035_corrige_checagem_null_lojista.sql)
CREATE OR REPLACE FUNCTION fn_relatorio_clientes_resumo(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT json_build_object(
    'clientes_atendidos', (
      SELECT COUNT(DISTINCT id_cliente) FROM agendamento
      WHERE id_lojista = p_id_lojista AND status = 'Concluído'
        AND dt_agendamento BETWEEN p_data_ini AND p_data_fim
    ),
    'clientes_novos', (
      SELECT COUNT(*) FROM cliente_lojista
      WHERE id_lojista = p_id_lojista
        AND created_at::date BETWEEN p_data_ini AND p_data_fim
    ),
    'clientes_recorrentes', (
      SELECT COUNT(DISTINCT a.id_cliente) FROM agendamento a
      WHERE a.id_lojista = p_id_lojista AND a.status = 'Concluído'
        AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
        AND (
          SELECT COUNT(*) FROM agendamento a2
          WHERE a2.id_cliente = a.id_cliente
            AND a2.id_lojista = p_id_lojista
            AND a2.status = 'Concluído'
        ) > 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- fn_relatorio_vendas_por_pagamento (antes: 057_formas_pagamento.sql)
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_por_pagamento(
  p_id_lojista UUID,
  p_data_ini   DATE,
  p_data_fim   DATE
)
RETURNS TABLE (
  forma     TEXT,
  pedidos   BIGINT,
  total     NUMERIC,
  recebido  NUMERIC,
  pendente  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(a.forma_pagamento, 'nao_informada')::TEXT,
    COUNT(DISTINCT a.id_pet::TEXT || '|' || a.dt_agendamento::TEXT || '|' || a.created_at::TEXT),
    COALESCE(SUM(a.valor), 0)::NUMERIC,
    COALESCE(SUM(a.valor) FILTER (WHERE a.status_pagamento = 'pago'), 0)::NUMERIC,
    COALESCE(SUM(a.valor) FILTER (WHERE a.status_pagamento = 'pendente'), 0)::NUMERIC
  FROM agendamento a
  WHERE a.id_lojista = p_id_lojista
    AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
    AND a.status <> 'Cancelado'
    AND a.status_pagamento IS DISTINCT FROM 'cancelado'
  GROUP BY 1
  ORDER BY 3 DESC;
END;
$$;
