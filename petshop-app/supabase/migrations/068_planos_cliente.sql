-- ============================================================
-- PETSHOP SaaS - Migration 068: o cliente vê os próprios planos
-- ============================================================
-- As tabelas de planos (migration 060) só a equipe da loja lê. O cliente
-- vê as assinaturas DELE por esta função: plano, pet, período atual com
-- os benefícios usados/restantes, cobranças e usos — sem campos internos
-- da loja (motivo do cancelamento, quem registrou, histórico interno).
-- Também renova (cria o período/cobrança que faltam até hoje), igual às
-- telas da loja, para o cliente não ver um período já vencido.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_meus_planos()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente UUID := auth.uid();
  v_id      UUID;
BEGIN
  IF v_cliente IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_id IN
    SELECT a.id_assinatura FROM assinatura a
    WHERE a.id_cliente = v_cliente AND a.status = 'ativa'
      AND NOT EXISTS (SELECT 1 FROM assinatura_periodo p WHERE p.id_assinatura = a.id_assinatura AND p.fim >= CURRENT_DATE)
  LOOP
    PERFORM fn_gerar_periodos_assinatura(v_id);
  END LOOP;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id_assinatura', a.id_assinatura,
      'plano', pl.nome,
      'descricao', pl.descricao,
      'id_lojista', a.id_lojista,
      'loja', l.nome_loja,
      'loja_telefone', l.telefone,
      'id_pet', a.id_pet,
      'pet', p.nome,
      'valor', a.valor,
      'periodicidade', a.periodicidade,
      'intervalo_dias', a.intervalo_dias,
      'data_inicio', a.data_inicio,
      'forma_pagamento', a.forma_pagamento,
      'status', a.status,
      'cancelada_em', a.cancelada_em,
      'periodo_atual', (
        SELECT jsonb_build_object('numero', per.numero, 'inicio', per.inicio, 'fim', per.fim,
          'beneficios', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('servico', s.nome, 'quantidade', aps.quantidade,
              'usados', (SELECT COUNT(*) FROM assinatura_utilizacao u
                         WHERE u.id_periodo = per.id_periodo AND u.id_servico = aps.id_servico AND u.estornada_em IS NULL)
            ) ORDER BY s.nome)
            FROM assinatura_periodo_servico aps JOIN servico s ON s.id_servico = aps.id_servico
            WHERE aps.id_periodo = per.id_periodo), '[]'::jsonb))
        FROM assinatura_periodo per
        WHERE per.id_assinatura = a.id_assinatura AND CURRENT_DATE BETWEEN per.inicio AND per.fim
        LIMIT 1
      ),
      'proxima_cobranca', CASE WHEN a.status = 'ativa'
        THEN (SELECT MAX(per.fim) + 1 FROM assinatura_periodo per WHERE per.id_assinatura = a.id_assinatura) END,
      -- Últimas 12 cobranças (mais recente primeiro).
      'cobrancas', COALESCE((
        SELECT jsonb_agg(x ORDER BY (x->>'numero')::INTEGER DESC)
        FROM (
          SELECT jsonb_build_object('id_cobranca', cb.id_cobranca, 'numero', per.numero, 'valor', cb.valor,
            'vencimento', cb.vencimento, 'forma_pagamento', cb.forma_pagamento, 'status', cb.status,
            'pago_em', cb.pago_em, 'periodo_inicio', per.inicio, 'periodo_fim', per.fim) AS x
          FROM assinatura_cobranca cb JOIN assinatura_periodo per ON per.id_periodo = cb.id_periodo
          WHERE cb.id_assinatura = a.id_assinatura
          ORDER BY per.numero DESC
          LIMIT 12
        ) ultimas), '[]'::jsonb),
      -- Últimos 20 usos.
      'utilizacoes', COALESCE((
        SELECT jsonb_agg(x ORDER BY x->>'registrado_em' DESC)
        FROM (
          SELECT jsonb_build_object('servico', s.nome, 'data', ag.dt_agendamento, 'hora', ag.hr_agendamento,
            'periodo', per.numero, 'estornada_em', u.estornada_em, 'motivo_estorno', u.motivo_estorno,
            'registrado_em', u.created_at) AS x
          FROM assinatura_utilizacao u
          JOIN servico s ON s.id_servico = u.id_servico
          JOIN assinatura_periodo per ON per.id_periodo = u.id_periodo
          LEFT JOIN agendamento ag ON ag.id_agendamento = u.id_agendamento
          WHERE u.id_assinatura = a.id_assinatura
          ORDER BY u.created_at DESC
          LIMIT 20
        ) ultimos), '[]'::jsonb),
      -- Pix da loja, para pagar cobrança em aberto (mesmo dado do agendamento online).
      'formas_loja', fn_formas_pagamento_loja(a.id_lojista)
    ) ORDER BY (a.status = 'ativa') DESC, a.created_at DESC)
    FROM assinatura a
    JOIN plano pl ON pl.id_plano = a.id_plano
    JOIN lojista l ON l.id_lojista = a.id_lojista
    LEFT JOIN pet p ON p.id_pet = a.id_pet
    WHERE a.id_cliente = v_cliente
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION fn_meus_planos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_meus_planos() TO authenticated;
