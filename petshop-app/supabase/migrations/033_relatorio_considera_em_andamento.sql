-- ============================================================
-- PETSHOP SaaS - Migration 033: relatório de vendas passa a contar
-- "Em andamento" como valor a receber
-- ============================================================
--
-- Migration 032 acrescentou a etapa 'Em andamento' entre 'Confirmado' e
-- 'Concluído'. fn_relatorio_vendas_resumo (migration 016) calcula
-- "pendente" (valor a receber, ainda não faturado) somando só
-- status IN ('Pendente', 'Confirmado') — um agendamento em 'Em
-- andamento' cairia fora dessa soma E fora de "faturamento" (que exige
-- 'Concluído'), sumindo dos dois totais até ser finalizado. Esta
-- migration inclui 'Em andamento' na mesma soma de "pendente".
--
-- RETURNS JSON (não TABLE), então CREATE OR REPLACE é seguro sem DROP
-- — só o corpo muda, o tipo de retorno continua o mesmo.

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
