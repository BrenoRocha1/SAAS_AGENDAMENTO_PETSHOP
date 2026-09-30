-- ============================================================
-- PETSHOP SaaS - Migration 070: trocar serviço ou pet de um agendamento
-- ============================================================
-- Antes, errou o serviço/pet (ou o cliente mudou de ideia) = cancelar e
-- criar de novo. Agora fn_editar_agendamento troca:
-- • Serviço (só deste agendamento): preço recalculado para o pet; a nova
--   duração precisa caber (horário da loja, dias fechados e sem bater em
--   outro agendamento — senão, remarcar antes).
-- • Pet (outro pet do MESMO cliente): vale para o pedido inteiro (os
--   serviços marcados juntos), com o preço de cada um recalculado. Com
--   TaxiDog no pedido, não troca (tirar o TaxiDog antes).
-- • Valor = serviço novo + produtos + taxa do TaxiDog (o que já estava).
-- • Plano: benefício usado volta ao saldo; a loja pode usar de novo no
--   serviço novo (p_usar_beneficio).
-- Quem pode:
-- • Loja (agenda): agendamento Pendente ou Aceito.
-- • Cliente: o próprio agendamento, só enquanto Pendente (depois que a
--   loja aceita, só a loja altera). Cliente não usa plano.
-- Trocar o CLIENTE continua proibido (cancelar e criar de novo).
-- Tudo fica em agendamento_alteracao.
-- ============================================================

CREATE TABLE IF NOT EXISTS agendamento_alteracao (
  id_alteracao    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  id_agendamento  UUID NOT NULL REFERENCES agendamento(id_agendamento) ON DELETE CASCADE,
  campo           TEXT NOT NULL CHECK (campo IN ('servico', 'pet')),
  anterior        TEXT,
  novo            TEXT,
  valor_anterior  NUMERIC(10,2),
  valor_novo      NUMERIC(10,2),
  -- 'loja' ou 'cliente'
  feito_por       TEXT NOT NULL CHECK (feito_por IN ('loja', 'cliente')),
  id_usuario      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_agendamento_alteracao ON agendamento_alteracao(id_agendamento, created_at);

ALTER TABLE agendamento_alteracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento_alteracao FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agendamento_alteracao: equipe ve" ON agendamento_alteracao;
CREATE POLICY "agendamento_alteracao: equipe ve" ON agendamento_alteracao FOR SELECT
  USING (fn_agenda_da_loja(id_lojista));
DROP POLICY IF EXISTS "agendamento_alteracao: cliente ve proprias" ON agendamento_alteracao;
CREATE POLICY "agendamento_alteracao: cliente ve proprias" ON agendamento_alteracao FOR SELECT
  USING (EXISTS (SELECT 1 FROM agendamento a WHERE a.id_agendamento = agendamento_alteracao.id_agendamento AND a.id_cliente = auth.uid()));

-- ============================================================
-- 1) A trava da migration 032 (não mudar cliente/pet/serviço/loja num
--    UPDATE) continua para todo mundo — só fn_editar_agendamento, com a
--    marca desta transação, troca pet e serviço. Cliente e loja nunca.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_agendamento_no_mass_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('saip.editar_agendamento', TRUE) = 'on'
     AND OLD.id_cliente IS NOT DISTINCT FROM NEW.id_cliente
     AND OLD.id_lojista IS NOT DISTINCT FROM NEW.id_lojista THEN
    RETURN NEW;
  END IF;
  IF OLD.id_cliente IS DISTINCT FROM NEW.id_cliente OR
     OLD.id_pet IS DISTINCT FROM NEW.id_pet OR
     OLD.id_servico IS DISTINCT FROM NEW.id_servico OR
     OLD.id_lojista IS DISTINCT FROM NEW.id_lojista
  THEN
    RAISE EXCEPTION 'Acesso negado: Não é permitido alterar o Cliente, Pet, Serviço ou Lojista de um agendamento existente. Por favor, cancele este e crie um novo.';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2) Editar
-- ============================================================
-- p_id_servico / p_id_pet: NULL = não muda. Mensagens com "Editar:"
-- chegam prontas na tela.
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
    SELECT a.hr_agendamento AS hr, s.nome AS servico INTO v_outro
    FROM agendamento a JOIN servico s ON s.id_servico = a.id_servico
    WHERE a.id_lojista = v_ag.id_lojista AND a.dt_agendamento = v_ag.dt_agendamento
      AND a.status <> 'Cancelado' AND a.id_agendamento <> v_ag.id_agendamento
      AND v_ag.hr_agendamento < a.hr_agendamento + s.duracao * INTERVAL '1 minute'
      AND v_fim > a.hr_agendamento
    ORDER BY a.hr_agendamento
    LIMIT 1;
    IF FOUND THEN
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
REVOKE ALL ON FUNCTION fn_editar_agendamento(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_editar_agendamento(UUID, UUID, UUID, BOOLEAN) TO authenticated;
