-- ============================================================
-- PETSHOP SaaS - Migration 016: Relatórios de Vendas
-- ============================================================
-- Contexto: nova área "Relatórios de Vendas" (/lojista/relatorios).
-- Nenhuma tabela nova — só funções de agregação sobre dados que já
-- existem (agendamento, servico, funcionario, cliente, cliente_lojista).
-- As agregações rodam no Postgres (SUM/COUNT/GROUP BY) em vez de trazer
-- todos os agendamentos pro navegador pra somar em JS — importante pra
-- não pesar em computador de recepção antigo.
--
-- Definições usadas (reaproveitando o que já existe, sem inventar
-- conceito novo — ver fn_metricas_lojista, migration 003):
--   • "venda" / "atendimento concluído" = agendamento com status
--     'Concluído'. É a MESMA regra que fn_metricas_lojista já usa pra
--     calcular receita_mes (SUM(valor) FILTER WHERE status='Concluído').
--   • "faturamento" = SUM(valor) dos agendamentos Concluído no período.
--   • "pendente" = SUM(valor) dos agendamentos Pendente + Confirmado no
--     período (ainda não veio a valer, mas já está agendado/confirmado).
--   • O sistema NÃO tem hoje nenhum registro de "forma de pagamento" nem
--     de "valor efetivamente recebido" separado do valor do agendamento
--     — não existe tabela de pagamento nem coluna correspondente em
--     nenhuma migration anterior. Por isso "faturamento" e "recebido"
--     são o MESMO número aqui (não dá pra inventar uma distinção que o
--     banco não sustenta) — documentado também em
--     docs/RELATORIOS_VENDAS.md.
-- ============================================================

-- ============================================================
-- FUNÇÃO: resumo do período (cards principais)
-- ============================================================
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
  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT json_build_object(
    'faturamento',              COALESCE(SUM(valor) FILTER (WHERE status = 'Concluído'), 0),
    'vendas',                   COUNT(*) FILTER (WHERE status = 'Concluído'),
    'pendente',                 COALESCE(SUM(valor) FILTER (WHERE status IN ('Pendente', 'Confirmado')), 0),
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

REVOKE ALL ON FUNCTION fn_relatorio_vendas_resumo(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_resumo(UUID, DATE, DATE) TO authenticated;

-- ============================================================
-- FUNÇÃO: faturamento por dia (gráfico de evolução)
-- generate_series preenche os dias sem venda com zero, pra a linha do
-- gráfico não "pular" dias — sem isso um dia parado ficaria ausente em
-- vez de aparecer como zero.
-- ============================================================
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
  IF auth.uid() != p_id_lojista THEN
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

REVOKE ALL ON FUNCTION fn_relatorio_vendas_por_dia(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_por_dia(UUID, DATE, DATE) TO authenticated;

-- ============================================================
-- FUNÇÃO: vendas por serviço
-- ============================================================
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
  IF auth.uid() != p_id_lojista THEN
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

REVOKE ALL ON FUNCTION fn_relatorio_vendas_por_servico(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_por_servico(UUID, DATE, DATE) TO authenticated;

-- ============================================================
-- FUNÇÃO: vendas por profissional
-- id_funcionario é NULL quando o agendamento nunca foi atribuído
-- (migration 012) — em vez de esconder, aparece como "Sem profissional
-- atribuído" pra não maquiar dado real.
-- ============================================================
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
  IF auth.uid() != p_id_lojista THEN
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

REVOKE ALL ON FUNCTION fn_relatorio_vendas_por_profissional(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_por_profissional(UUID, DATE, DATE) TO authenticated;

-- ============================================================
-- FUNÇÃO: top clientes por valor gasto no período
-- ============================================================
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
  IF auth.uid() != p_id_lojista THEN
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

REVOKE ALL ON FUNCTION fn_relatorio_vendas_por_cliente(UUID, DATE, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_por_cliente(UUID, DATE, DATE, INT) TO authenticated;

-- ============================================================
-- FUNÇÃO: clientes novos vs recorrentes no período
-- "novo" = a data em que o lojista passou a conhecer esse cliente
-- (cliente_lojista.created_at, migration 014 — preenchida tanto no
-- primeiro agendamento quanto no cadastro manual) cai dentro do período.
-- "recorrente" = tem mais de 1 atendimento Concluído neste petshop
-- (histórico completo, não só no período) e atendeu pelo menos uma vez
-- dentro do período selecionado.
-- ============================================================
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
  IF auth.uid() != p_id_lojista THEN
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

REVOKE ALL ON FUNCTION fn_relatorio_clientes_resumo(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_clientes_resumo(UUID, DATE, DATE) TO authenticated;
