-- ============================================================
-- PETSHOP SaaS - Migration 075: o cliente usa o próprio plano ao agendar
-- ============================================================
-- Até aqui só a equipe da loja aplicava o benefício do plano num
-- agendamento (migration 060). O cliente que agendava pela conta dele via
-- o serviço cobrado cheio, mesmo tendo saldo no plano.
--
-- Agora o cliente também usa o saldo:
-- • fn_meus_beneficios: os planos ativos do pet DELE naquela loja e o
--   saldo de cada serviço no período que cobre a data (mesmo formato de
--   fn_beneficios_do_pet, que é só da loja).
-- • fn_usar_beneficio: passa a aceitar o dono do agendamento, só enquanto
--   ele está Pendente (mesma regra de alterar/remarcar — depois que a loja
--   aceita, só ela mexe). Limite de usos, período e estorno ao cancelar
--   continuam iguais.
-- • fn_meus_agendamentos_no_plano: quais agendamentos do cliente estão
--   usando o plano (para a lista "Meus Agendamentos" dizer isso em vez de
--   só mostrar R$ 0,00).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_meus_beneficios(p_id_lojista UUID, p_id_pet UUID, p_data DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente UUID := auth.uid();
  v_id      UUID;
  v_out     JSONB;
BEGIN
  IF v_cliente IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Renova o que falta até hoje, como as outras telas de plano.
  FOR v_id IN
    SELECT a.id_assinatura FROM assinatura a
    WHERE a.id_cliente = v_cliente AND a.id_pet = p_id_pet AND a.id_lojista = p_id_lojista AND a.status = 'ativa'
      AND NOT EXISTS (SELECT 1 FROM assinatura_periodo p WHERE p.id_assinatura = a.id_assinatura AND p.fim >= CURRENT_DATE)
  LOOP
    PERFORM fn_gerar_periodos_assinatura(v_id);
  END LOOP;

  SELECT COALESCE(jsonb_agg(x ORDER BY x ->> 'plano'), '[]'::jsonb) INTO v_out FROM (
    SELECT jsonb_build_object(
      'id_assinatura', a.id_assinatura,
      'plano', pl.nome,
      'id_periodo', per.id_periodo,
      'periodo_inicio', per.inicio,
      'periodo_fim', per.fim,
      'proxima_cobranca', (SELECT MAX(p2.fim) + 1 FROM assinatura_periodo p2 WHERE p2.id_assinatura = a.id_assinatura),
      'beneficios', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id_servico', aps.id_servico,
          'servico', s.nome,
          'quantidade', aps.quantidade,
          'usados', (SELECT COUNT(*) FROM assinatura_utilizacao u WHERE u.id_periodo = per.id_periodo AND u.id_servico = aps.id_servico AND u.estornada_em IS NULL)
        ) ORDER BY s.nome)
        FROM assinatura_periodo_servico aps JOIN servico s ON s.id_servico = aps.id_servico
        WHERE aps.id_periodo = per.id_periodo
      ), '[]'::jsonb)
    ) AS x
    FROM assinatura a
    JOIN plano pl ON pl.id_plano = a.id_plano
    LEFT JOIN assinatura_periodo per ON per.id_assinatura = a.id_assinatura AND COALESCE(p_data, CURRENT_DATE) BETWEEN per.inicio AND per.fim
    WHERE a.id_cliente = v_cliente AND a.id_pet = p_id_pet AND a.id_lojista = p_id_lojista AND a.status = 'ativa'
  ) t;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION fn_meus_beneficios(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_meus_beneficios(UUID, UUID, DATE) TO authenticated;

-- Agendamentos do cliente que estão usando o plano (uso não desfeito).
CREATE OR REPLACE FUNCTION fn_meus_agendamentos_no_plano()
RETURNS TABLE (id_agendamento UUID, plano TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id_agendamento, pl.nome
  FROM assinatura_utilizacao u
  JOIN assinatura a ON a.id_assinatura = u.id_assinatura
  JOIN plano pl ON pl.id_plano = a.id_plano
  WHERE a.id_cliente = auth.uid() AND u.estornada_em IS NULL AND u.id_agendamento IS NOT NULL
$$;
REVOKE ALL ON FUNCTION fn_meus_agendamentos_no_plano() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_meus_agendamentos_no_plano() TO authenticated;

-- Mesma função da migration 060, agora também para o dono do agendamento
-- (enquanto Pendente). Usa um benefício do plano: registra e tira o valor
-- do serviço do agendamento (produtos e TaxiDog continuam cobrados).
CREATE OR REPLACE FUNCTION fn_usar_beneficio(p_id_agendamento UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag       agendamento%ROWTYPE;
  v_a        assinatura%ROWTYPE;
  v_per      assinatura_periodo%ROWTYPE;
  v_qtd      INTEGER;
  v_usados   INTEGER;
  v_prod     NUMERIC;
  v_tx       NUMERIC;
  v_servico  NUMERIC;
  v_nome_srv TEXT;
  v_escolha  RECORD;
  v_loja     BOOLEAN;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;
  v_loja := fn_agenda_da_loja(v_ag.id_lojista);
  IF NOT v_loja AND NOT (auth.uid() IS NOT NULL AND v_ag.id_cliente = auth.uid()) THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;
  IF NOT v_loja AND v_ag.status <> 'Pendente' THEN
    RAISE EXCEPTION 'A loja já aceitou este agendamento — para usar o plano nele, fale com a loja';
  END IF;
  IF v_ag.status = 'Cancelado' THEN
    RAISE EXCEPTION 'Agendamento cancelado não usa benefício';
  END IF;
  IF EXISTS (SELECT 1 FROM assinatura_utilizacao WHERE id_agendamento = p_id_agendamento AND estornada_em IS NULL) THEN
    RAISE EXCEPTION 'Este agendamento já usa um benefício do plano';
  END IF;
  SELECT nome INTO v_nome_srv FROM servico WHERE id_servico = v_ag.id_servico;

  -- Assinatura ativa do pet cujo período cobre a data e inclui o serviço,
  -- com saldo — a com mais saldo primeiro.
  FOR v_escolha IN
    SELECT a.id_assinatura FROM assinatura a
    WHERE a.id_pet = v_ag.id_pet AND a.id_lojista = v_ag.id_lojista AND a.status = 'ativa'
  LOOP
    PERFORM fn_gerar_periodos_assinatura(v_escolha.id_assinatura);
  END LOOP;

  SELECT a.*, per.id_periodo AS per_id, aps.quantidade AS qtd,
         (SELECT COUNT(*) FROM assinatura_utilizacao u WHERE u.id_periodo = per.id_periodo AND u.id_servico = v_ag.id_servico AND u.estornada_em IS NULL) AS usados
  INTO v_escolha
  FROM assinatura a
  JOIN assinatura_periodo per ON per.id_assinatura = a.id_assinatura AND v_ag.dt_agendamento BETWEEN per.inicio AND per.fim
  JOIN assinatura_periodo_servico aps ON aps.id_periodo = per.id_periodo AND aps.id_servico = v_ag.id_servico
  WHERE a.id_pet = v_ag.id_pet AND a.id_lojista = v_ag.id_lojista AND a.status = 'ativa'
  ORDER BY (aps.quantidade - (SELECT COUNT(*) FROM assinatura_utilizacao u WHERE u.id_periodo = per.id_periodo AND u.id_servico = v_ag.id_servico AND u.estornada_em IS NULL)) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM assinatura WHERE id_pet = v_ag.id_pet AND id_lojista = v_ag.id_lojista AND status = 'ativa') THEN
      RAISE EXCEPTION 'Este pet não tem plano ativo';
    ELSIF NOT EXISTS (
      SELECT 1 FROM assinatura a JOIN assinatura_periodo per ON per.id_assinatura = a.id_assinatura AND v_ag.dt_agendamento BETWEEN per.inicio AND per.fim
      WHERE a.id_pet = v_ag.id_pet AND a.id_lojista = v_ag.id_lojista AND a.status = 'ativa'
    ) THEN
      RAISE EXCEPTION 'O plano ainda não tem período para a data deste agendamento (%)', to_char(v_ag.dt_agendamento, 'DD/MM/YYYY');
    ELSE
      RAISE EXCEPTION 'O plano do pet não inclui %', v_nome_srv;
    END IF;
  END IF;

  -- Trava o período (dois usos ao mesmo tempo não passam do limite).
  SELECT * INTO v_per FROM assinatura_periodo WHERE id_periodo = v_escolha.per_id FOR UPDATE;
  v_qtd := v_escolha.qtd;
  SELECT COUNT(*) INTO v_usados FROM assinatura_utilizacao
  WHERE id_periodo = v_per.id_periodo AND id_servico = v_ag.id_servico AND estornada_em IS NULL;
  IF v_usados >= v_qtd THEN
    RAISE EXCEPTION 'Os usos de % neste período acabaram (% de %)', v_nome_srv, v_usados, v_qtd;
  END IF;

  SELECT * INTO v_a FROM assinatura WHERE id_assinatura = v_escolha.id_assinatura;
  SELECT COALESCE(SUM(quantidade * preco_unitario), 0) INTO v_prod FROM agendamento_produto WHERE id_agendamento = p_id_agendamento;
  SELECT COALESCE(SUM(valor), 0) INTO v_tx FROM taxidog_corrida WHERE id_agendamento = p_id_agendamento AND status <> 'cancelada';
  v_servico := GREATEST(0, v_ag.valor - v_prod - v_tx);

  INSERT INTO assinatura_utilizacao (id_lojista, id_assinatura, id_periodo, id_servico, id_agendamento, id_funcionario, registrado_por, valor_abatido)
  VALUES (v_ag.id_lojista, v_a.id_assinatura, v_per.id_periodo, v_ag.id_servico, p_id_agendamento, v_ag.id_funcionario, auth.uid(), v_servico);

  UPDATE agendamento SET valor = valor - v_servico WHERE id_agendamento = p_id_agendamento;

  PERFORM fn_plano_registrar(v_ag.id_lojista, v_a.id_plano, v_a.id_assinatura, 'beneficio_utilizado',
    format('%s usado no agendamento de %s às %s (%s de %s no período %s) — R$ %s saíram do agendamento%s',
           v_nome_srv, to_char(v_ag.dt_agendamento, 'DD/MM/YYYY'), to_char(v_ag.hr_agendamento, 'HH24:MI'),
           v_usados + 1, v_qtd, v_per.numero, fn_fmt_valor(v_servico),
           CASE WHEN v_loja THEN '' ELSE ' (o cliente usou ao agendar pela conta dele)' END));

  RETURN jsonb_build_object('usados', v_usados + 1, 'quantidade', v_qtd, 'valor_abatido', v_servico, 'plano', (SELECT nome FROM plano WHERE id_plano = v_a.id_plano));
END;
$$;
REVOKE ALL ON FUNCTION fn_usar_beneficio(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_usar_beneficio(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
