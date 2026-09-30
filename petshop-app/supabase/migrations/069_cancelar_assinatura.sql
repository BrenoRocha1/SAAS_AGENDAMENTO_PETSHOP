-- ============================================================
-- PETSHOP SaaS - Migration 069: cancelar assinatura resolvendo o que
-- ficou em aberto
-- ============================================================
-- Antes, cancelar só parava de gerar períodos: as cobranças em aberto
-- continuavam "pendente/vencida" (o cliente via "pague" de um plano
-- cancelado) e agendamentos já marcados seguiam cobertos pelo plano.
--
-- Agora quem cancela decide, na hora:
-- • p_cancelar_cobrancas: cancela junto as cobranças em aberto (o cliente
--   não deve mais nada) — ou mantém (ex.: já usou os serviços do período).
-- • p_devolver_agendamentos: agendamentos ainda por fazer (Pendente ou
--   Aceito) que usam o plano voltam ao preço normal; o uso fica registrado
--   como devolvido ("Plano cancelado"). Atendimentos já feitos não mudam.
-- Nada é apagado: cobrança cancelada e uso devolvido ficam no histórico.
--
-- fn_assinatura_json ganha o status do agendamento em cada uso, para a
-- tela saber quais ainda vão acontecer.
-- ============================================================

DROP FUNCTION IF EXISTS fn_cancelar_assinatura(UUID, TEXT);

CREATE OR REPLACE FUNCTION fn_cancelar_assinatura(
  p_id_assinatura         UUID,
  p_motivo                TEXT,
  p_cancelar_cobrancas    BOOLEAN DEFAULT FALSE,
  p_devolver_agendamentos BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a          assinatura%ROWTYPE;
  v_motivo     TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_cob_qtd    INTEGER := 0;
  v_cob_valor  NUMERIC := 0;
  v_dev_qtd    INTEGER := 0;
  v_u          RECORD;
BEGIN
  SELECT * INTO v_a FROM assinatura WHERE id_assinatura = p_id_assinatura FOR UPDATE;
  IF NOT FOUND OR NOT fn_gestor_da_loja(v_a.id_lojista) THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;
  IF v_a.status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta assinatura já está cancelada';
  END IF;

  UPDATE assinatura SET status = 'cancelada', cancelada_em = NOW(), motivo_cancelamento = v_motivo
  WHERE id_assinatura = p_id_assinatura;
  PERFORM fn_plano_registrar(v_a.id_lojista, v_a.id_plano, v_a.id_assinatura, 'assinatura_cancelada',
    'Assinatura cancelada' || COALESCE(' — ' || v_motivo, '') || '. Nenhuma cobrança nova será gerada.');

  IF COALESCE(p_cancelar_cobrancas, FALSE) THEN
    SELECT COUNT(*), COALESCE(SUM(valor), 0) INTO v_cob_qtd, v_cob_valor
    FROM assinatura_cobranca WHERE id_assinatura = p_id_assinatura AND status = 'pendente';
    UPDATE assinatura_cobranca SET status = 'cancelado', pago_em = NULL
    WHERE id_assinatura = p_id_assinatura AND status = 'pendente';
    IF v_cob_qtd > 0 THEN
      PERFORM fn_plano_registrar(v_a.id_lojista, v_a.id_plano, v_a.id_assinatura, 'cobranca_alterada',
        format('Cancelamento: %s cobrança(s) em aberto cancelada(s) junto (R$ %s)', v_cob_qtd, fn_fmt_valor(v_cob_valor)));
    END IF;
  END IF;

  IF COALESCE(p_devolver_agendamentos, FALSE) THEN
    FOR v_u IN
      SELECT u.id_utilizacao, u.valor_abatido, ag.id_agendamento, ag.dt_agendamento
      FROM assinatura_utilizacao u
      JOIN agendamento ag ON ag.id_agendamento = u.id_agendamento
      WHERE u.id_assinatura = p_id_assinatura AND u.estornada_em IS NULL
        AND ag.status IN ('Pendente', 'Confirmado')
      FOR UPDATE OF u
    LOOP
      UPDATE assinatura_utilizacao SET estornada_em = NOW(), motivo_estorno = 'Plano cancelado'
      WHERE id_utilizacao = v_u.id_utilizacao;
      UPDATE agendamento SET valor = valor + v_u.valor_abatido WHERE id_agendamento = v_u.id_agendamento;
      PERFORM fn_plano_registrar(v_a.id_lojista, v_a.id_plano, v_a.id_assinatura, 'beneficio_estornado',
        format('Plano cancelado — o agendamento de %s voltou ao preço normal (+R$ %s)',
               to_char(v_u.dt_agendamento, 'DD/MM/YYYY'), fn_fmt_valor(v_u.valor_abatido)));
      v_dev_qtd := v_dev_qtd + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'cobrancas_canceladas', v_cob_qtd,
    'valor_cancelado', v_cob_valor,
    'agendamentos_devolvidos', v_dev_qtd
  );
END;
$$;
REVOKE ALL ON FUNCTION fn_cancelar_assinatura(UUID, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cancelar_assinatura(UUID, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

-- Mesma função da migration 060, com 'status_agendamento' em cada uso.
CREATE OR REPLACE FUNCTION fn_assinatura_json(p_id_assinatura UUID, p_detalhes BOOLEAN)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id_assinatura', a.id_assinatura,
    'id_plano', a.id_plano,
    'plano', pl.nome,
    'id_cliente', a.id_cliente,
    'cliente', c.nome,
    'id_pet', a.id_pet,
    'pet', p.nome,
    'valor', a.valor,
    'periodicidade', a.periodicidade,
    'intervalo_dias', a.intervalo_dias,
    'data_inicio', a.data_inicio,
    'forma_pagamento', a.forma_pagamento,
    'status', a.status,
    'cancelada_em', a.cancelada_em,
    'motivo_cancelamento', a.motivo_cancelamento,
    'periodo_atual', (
      SELECT jsonb_build_object('numero', per.numero, 'inicio', per.inicio, 'fim', per.fim,
        'beneficios', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('servico', s.nome, 'quantidade', aps.quantidade,
            'usados', (SELECT COUNT(*) FROM assinatura_utilizacao u WHERE u.id_periodo = per.id_periodo AND u.id_servico = aps.id_servico AND u.estornada_em IS NULL)
          ) ORDER BY s.nome)
          FROM assinatura_periodo_servico aps JOIN servico s ON s.id_servico = aps.id_servico
          WHERE aps.id_periodo = per.id_periodo), '[]'::jsonb))
      FROM assinatura_periodo per
      WHERE per.id_assinatura = a.id_assinatura AND CURRENT_DATE BETWEEN per.inicio AND per.fim
      LIMIT 1
    ),
    'proxima_cobranca', CASE WHEN a.status = 'ativa'
      THEN (SELECT MAX(per.fim) + 1 FROM assinatura_periodo per WHERE per.id_assinatura = a.id_assinatura) END,
    'cobrancas_em_aberto', (SELECT COUNT(*) FROM assinatura_cobranca cb WHERE cb.id_assinatura = a.id_assinatura AND cb.status = 'pendente'),
    'cobrancas_vencidas', (SELECT COUNT(*) FROM assinatura_cobranca cb WHERE cb.id_assinatura = a.id_assinatura AND cb.status = 'pendente' AND cb.vencimento < CURRENT_DATE),
    'cobrancas', CASE WHEN p_detalhes THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id_cobranca', cb.id_cobranca, 'numero', per.numero, 'valor', cb.valor,
        'vencimento', cb.vencimento, 'forma_pagamento', cb.forma_pagamento, 'status', cb.status, 'pago_em', cb.pago_em,
        'periodo_inicio', per.inicio, 'periodo_fim', per.fim) ORDER BY per.numero DESC)
      FROM assinatura_cobranca cb JOIN assinatura_periodo per ON per.id_periodo = cb.id_periodo
      WHERE cb.id_assinatura = a.id_assinatura), '[]'::jsonb) END,
    'utilizacoes', CASE WHEN p_detalhes THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('servico', s.nome, 'data', ag.dt_agendamento, 'hora', ag.hr_agendamento,
        'periodo', per.numero, 'funcionario', f.nome, 'estornada_em', u.estornada_em, 'motivo_estorno', u.motivo_estorno,
        'registrado_em', u.created_at, 'status_agendamento', ag.status) ORDER BY u.created_at DESC)
      FROM assinatura_utilizacao u
      JOIN servico s ON s.id_servico = u.id_servico
      JOIN assinatura_periodo per ON per.id_periodo = u.id_periodo
      LEFT JOIN agendamento ag ON ag.id_agendamento = u.id_agendamento
      LEFT JOIN funcionario f ON f.id_funcionario = u.id_funcionario
      WHERE u.id_assinatura = a.id_assinatura), '[]'::jsonb) END,
    'historico', CASE WHEN p_detalhes THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tipo', h.tipo, 'descricao', h.descricao, 'em', h.created_at) ORDER BY h.created_at DESC)
      FROM assinatura_historico h WHERE h.id_assinatura = a.id_assinatura), '[]'::jsonb) END
  )
  FROM assinatura a
  JOIN plano pl ON pl.id_plano = a.id_plano
  LEFT JOIN cliente c ON c.id_cliente = a.id_cliente
  LEFT JOIN pet p ON p.id_pet = a.id_pet
  WHERE a.id_assinatura = p_id_assinatura
$$;
REVOKE ALL ON FUNCTION fn_assinatura_json(UUID, BOOLEAN) FROM PUBLIC;
