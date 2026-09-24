-- ============================================================
-- PETSHOP SaaS - Migration 053: Kanban de corridas + rotas, lado a lado
-- ============================================================
-- A 052 trocou a operação corrida a corrida pelas rotas. Na prática as
-- duas formas convivem: com pouca demanda o TaxiDog (ou a loja) pega um
-- pet só pelo Kanban; com mais pets, monta uma rota.
--
-- • Volta a execução corrida a corrida (fn_atribuir_corrida,
--   fn_assumir_corrida, fn_avancar_corrida) — mas uma corrida que está
--   numa rota só anda pela rota (senão as duas telas brigariam).
-- • O TaxiDog também monta rotas. Nas configurações do TaxiDog a loja
--   escolhe: ele monta e já pode sair (taxidog_cria_rotas = TRUE), ou a
--   rota fica "Aguardando aprovação" até alguém da gestão aprovar.
--   Ele só usa corridas sem TaxiDog ou que já são dele.
-- • Uma corrida sendo feita pelo Kanban (TaxiDog já a caminho, pet no
--   carro...) não entra em rota.
-- ============================================================

-- ============================================================
-- 1) Configuração e colunas novas
-- ============================================================
ALTER TABLE taxidog_config
  ADD COLUMN IF NOT EXISTS taxidog_cria_rotas BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE taxidog_rota DROP CONSTRAINT IF EXISTS taxidog_rota_status_check;
ALTER TABLE taxidog_rota ADD CONSTRAINT taxidog_rota_status_check
  CHECK (status IN ('planejamento', 'aguardando_aprovacao', 'aguardando_saida', 'em_andamento', 'concluida', 'cancelada'));

ALTER TABLE taxidog_rota ADD COLUMN IF NOT EXISTS criada_por  UUID;
ALTER TABLE taxidog_rota ADD COLUMN IF NOT EXISTS aprovada_por UUID;
ALTER TABLE taxidog_rota ADD COLUMN IF NOT EXISTS aprovada_em TIMESTAMPTZ;

-- Só dono ou administrador mudam essa regra (é configuração da loja).
CREATE OR REPLACE FUNCTION fn_salvar_taxidog_cria_rotas(p_valor BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lojista UUID := auth_lojista_id();
BEGIN
  IF v_lojista IS NULL OR NOT (
    auth_role() = 'lojista'
    OR EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND ativo = TRUE AND acesso_total = TRUE)
  ) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode mudar essa configuração';
  END IF;
  UPDATE taxidog_config SET taxidog_cria_rotas = COALESCE(p_valor, FALSE) WHERE id_lojista = v_lojista;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salve a configuração do TaxiDog antes';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION fn_salvar_taxidog_cria_rotas(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_salvar_taxidog_cria_rotas(BOOLEAN) TO authenticated;

-- ============================================================
-- 2) Auxiliares
-- ============================================================

-- Quem logou é TaxiDog (ativo) desta loja?
CREATE OR REPLACE FUNCTION fn_e_taxidog(p_id_lojista UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid() AND id_lojista = p_id_lojista AND ativo = TRUE AND pode_taxidog = TRUE
  )
$$;

REVOKE ALL ON FUNCTION fn_e_taxidog(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_e_taxidog(UUID) TO authenticated;

-- Número da rota ativa em que a corrida ainda tem algo por fazer (NULL =
-- fora de rota, pode andar pelo Kanban).
CREATE OR REPLACE FUNCTION fn_rota_da_corrida(p_id_corrida UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.numero
  FROM taxidog_parada_item i
  JOIN taxidog_rota r ON r.id_rota = i.id_rota
  WHERE i.id_corrida = p_id_corrida AND NOT i.feito AND r.status NOT IN ('concluida', 'cancelada')
  ORDER BY r.created_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION fn_rota_da_corrida(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_rota_da_corrida(UUID) TO authenticated;

-- Quem pode mexer nas paradas de uma rota: a gestão sempre (até a rota
-- encerrar); o TaxiDog, a rota dele, antes de sair.
CREATE OR REPLACE FUNCTION fn_pode_editar_rota(p_r taxidog_rota)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fn_gestor_taxidog(p_r.id_lojista)
      OR (
        p_r.id_funcionario IS NOT DISTINCT FROM auth.uid()
        AND p_r.id_funcionario IS NOT NULL
        AND p_r.status IN ('aguardando_aprovacao', 'aguardando_saida')
        AND fn_e_taxidog(p_r.id_lojista)
      )
$$;

REVOKE ALL ON FUNCTION fn_pode_editar_rota(taxidog_rota) FROM PUBLIC;

-- Rota montada/mudada pelo próprio TaxiDog: sai direto ou espera aprovação.
CREATE OR REPLACE FUNCTION fn_taxidog_precisa_aprovacao(p_id_lojista UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT COALESCE((SELECT taxidog_cria_rotas FROM taxidog_config WHERE id_lojista = p_id_lojista), FALSE)
$$;

REVOKE ALL ON FUNCTION fn_taxidog_precisa_aprovacao(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_taxidog_precisa_aprovacao(UUID) TO authenticated;

-- Rota que ainda não saiu e ficou sem paradas é cancelada (agora também
-- a que esperava aprovação).
CREATE OR REPLACE FUNCTION fn_rota_verificar_fim(p_id_rota UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r taxidog_rota%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM taxidog_rota WHERE id_rota = p_id_rota;
  IF NOT FOUND OR v_r.status IN ('concluida', 'cancelada') THEN
    RETURN;
  END IF;

  IF v_r.status = 'em_andamento'
     AND NOT EXISTS (SELECT 1 FROM taxidog_parada WHERE id_rota = p_id_rota AND status <> 'concluida') THEN
    UPDATE taxidog_rota SET status = 'concluida', concluida_em = NOW() WHERE id_rota = p_id_rota;
  ELSIF v_r.status IN ('planejamento', 'aguardando_aprovacao', 'aguardando_saida')
     AND NOT EXISTS (SELECT 1 FROM taxidog_parada WHERE id_rota = p_id_rota) THEN
    UPDATE taxidog_rota
    SET status = 'cancelada', versao = versao + 1, ultima_alteracao = 'A rota ficou sem paradas e foi cancelada'
    WHERE id_rota = p_id_rota;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION fn_rota_verificar_fim(UUID) FROM PUBLIC;

-- ============================================================
-- 3) Montagem das rotas (gestão ou o próprio TaxiDog)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_salvar_paradas(p_id_rota UUID, p_paradas JSONB, p_mensagem TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r         taxidog_rota%ROWTYPE;
  v_gestor    BOOLEAN;
  v_base      INTEGER;
  v_idx       INTEGER := 0;
  v_parada    JSONB;
  v_item      JSONB;
  v_local     TEXT;
  v_acao      TEXT;
  v_id_parada UUID;
  v_c         taxidog_corrida%ROWTYPE;
  v_pet       TEXT;
  v_dt        DATE;
  v_antes     UUID[];
  v_versao    INTEGER;
BEGIN
  SELECT * INTO v_r FROM taxidog_rota WHERE id_rota = p_id_rota FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;
  IF v_r.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Esta rota já foi encerrada';
  END IF;
  IF NOT fn_pode_editar_rota(v_r) THEN
    RAISE EXCEPTION 'Você não pode mudar esta rota';
  END IF;
  v_gestor := fn_gestor_taxidog(v_r.id_lojista);
  IF jsonb_typeof(COALESCE(p_paradas, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_paradas, '[]'::jsonb)) > 60 THEN
    RAISE EXCEPTION 'Lista de paradas inválida';
  END IF;

  v_antes := ARRAY(SELECT DISTINCT id_corrida FROM taxidog_parada_item WHERE id_rota = p_id_rota);

  DELETE FROM taxidog_parada WHERE id_rota = p_id_rota AND status = 'pendente';
  SELECT COALESCE(max(ordem), 0) INTO v_base FROM taxidog_parada WHERE id_rota = p_id_rota;

  FOR v_parada IN SELECT value FROM jsonb_array_elements(COALESCE(p_paradas, '[]'::jsonb)) LOOP
    v_idx := v_idx + 1;
    v_local := v_parada->>'local';
    IF v_local IS NULL OR v_local NOT IN ('cliente', 'loja') THEN
      RAISE EXCEPTION 'Parada inválida';
    END IF;

    INSERT INTO taxidog_parada (id_rota, ordem, local)
    VALUES (p_id_rota, v_base + v_idx, v_local)
    RETURNING id_parada INTO v_id_parada;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_parada->'itens', '[]'::jsonb)) LOOP
      v_acao := v_item->>'acao';
      IF v_acao IS NULL
         OR (v_local = 'cliente' AND v_acao NOT IN ('embarcar', 'entregar'))
         OR (v_local = 'loja' AND v_acao NOT IN ('deixar_loja', 'pegar_loja')) THEN
        RAISE EXCEPTION 'Parada inválida';
      END IF;

      SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = (v_item->>'id_corrida')::UUID;
      IF NOT FOUND OR v_c.id_lojista IS DISTINCT FROM v_r.id_lojista THEN
        RAISE EXCEPTION 'Solicitação de TaxiDog não encontrada';
      END IF;
      SELECT nome INTO v_pet FROM pet WHERE id_pet = v_c.id_pet;

      IF v_c.status IN ('concluida', 'cancelada') THEN
        RAISE EXCEPTION 'O TaxiDog de % já foi encerrado', v_pet;
      END IF;
      IF (v_acao IN ('embarcar', 'deixar_loja') AND v_c.modalidade = 'entregar')
         OR (v_acao IN ('pegar_loja', 'entregar') AND v_c.modalidade = 'buscar') THEN
        RAISE EXCEPTION 'O transporte de % não inclui essa parada', v_pet;
      END IF;

      -- Corrida nova na rota: não pode estar sendo feita pelo Kanban, e o
      -- TaxiDog só usa as sem TaxiDog ou as dele.
      IF NOT (v_c.id_corrida = ANY(v_antes)) THEN
        IF v_acao IN ('embarcar', 'deixar_loja') AND v_c.status <> 'agendada' THEN
          RAISE EXCEPTION 'A busca de % já está sendo feita fora da rota', v_pet;
        END IF;
        IF v_acao IN ('pegar_loja', 'entregar') AND v_c.status IN ('a_caminho_entrega', 'no_endereco_entrega') THEN
          RAISE EXCEPTION 'A entrega de % já está sendo feita fora da rota', v_pet;
        END IF;
        IF NOT v_gestor AND v_c.id_funcionario IS NOT NULL AND v_c.id_funcionario <> auth.uid() THEN
          RAISE EXCEPTION 'O TaxiDog de % é de outro TaxiDog', v_pet;
        END IF;
      END IF;

      SELECT dt_agendamento INTO v_dt FROM agendamento WHERE id_agendamento = v_c.id_agendamento;
      IF v_dt IS DISTINCT FROM v_r.data THEN
        RAISE EXCEPTION 'O agendamento de % é em outro dia', v_pet;
      END IF;

      BEGIN
        INSERT INTO taxidog_parada_item (id_parada, id_rota, id_corrida, acao)
        VALUES (v_id_parada, p_id_rota, v_c.id_corrida, v_acao);
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION '% já está em outra rota', v_pet;
      END;
    END LOOP;
  END LOOP;

  PERFORM fn_validar_rota(p_id_rota);
  PERFORM fn_limpar_rota(p_id_rota);

  PERFORM fn_sincronizar_taxidog_corridas(
    v_antes || ARRAY(SELECT DISTINCT id_corrida FROM taxidog_parada_item WHERE id_rota = p_id_rota)
  );

  UPDATE taxidog_rota
  SET versao = versao + 1,
      ultima_alteracao = p_mensagem,
      -- Mudada pelo próprio TaxiDog numa loja que exige aprovação: volta
      -- a esperar a gestão.
      status = CASE
        WHEN NOT v_gestor AND status = 'aguardando_saida' AND fn_taxidog_precisa_aprovacao(id_lojista) THEN 'aguardando_aprovacao'
        ELSE status
      END
  WHERE id_rota = p_id_rota
  RETURNING versao INTO v_versao;

  PERFORM fn_rota_verificar_fim(p_id_rota);
  RETURN v_versao;
END;
$$;

REVOKE ALL ON FUNCTION fn_salvar_paradas(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_salvar_paradas(UUID, JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION fn_criar_rota(p_data DATE, p_id_funcionario UUID, p_paradas JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lojista   UUID := auth_lojista_id();
  v_gestor    BOOLEAN;
  v_taxidog   UUID := p_id_funcionario;
  v_status    TEXT;
  v_numero    INTEGER;
  v_id        UUID;
BEGIN
  IF v_lojista IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  v_gestor := fn_gestor_taxidog(v_lojista);
  IF NOT v_gestor AND NOT fn_e_taxidog(v_lojista) THEN
    RAISE EXCEPTION 'Você não tem permissão para montar rotas';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Informe o dia da rota';
  END IF;
  IF jsonb_array_length(COALESCE(p_paradas, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Escolha ao menos uma corrida para a rota';
  END IF;

  IF v_gestor THEN
    IF v_taxidog IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = v_taxidog AND id_lojista = v_lojista AND ativo = TRUE AND pode_taxidog = TRUE
    ) THEN
      RAISE EXCEPTION 'Este funcionário não está habilitado como TaxiDog';
    END IF;
    v_status := CASE WHEN v_taxidog IS NULL THEN 'planejamento' ELSE 'aguardando_saida' END;
  ELSE
    -- O TaxiDog monta a rota dele mesmo.
    v_taxidog := auth.uid();
    v_status := CASE WHEN fn_taxidog_precisa_aprovacao(v_lojista) THEN 'aguardando_aprovacao' ELSE 'aguardando_saida' END;
  END IF;

  -- Numeração por loja sem corrida entre duas rotas criadas juntas.
  PERFORM pg_advisory_xact_lock(hashtext('taxidog_rota:' || v_lojista::TEXT));
  SELECT COALESCE(max(numero), 100) + 1 INTO v_numero FROM taxidog_rota WHERE id_lojista = v_lojista;

  INSERT INTO taxidog_rota (id_lojista, numero, data, id_funcionario, status, criada_por)
  VALUES (v_lojista, v_numero, p_data, v_taxidog, v_status, auth.uid())
  RETURNING id_rota INTO v_id;

  PERFORM fn_salvar_paradas(v_id, p_paradas, NULL);
  UPDATE taxidog_rota SET versao = 1, ultima_alteracao = NULL WHERE id_rota = v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_rota(DATE, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_rota(DATE, UUID, JSONB) TO authenticated;

-- Gestão aprova a rota montada pelo TaxiDog.
CREATE OR REPLACE FUNCTION fn_aprovar_rota(p_id_rota UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r taxidog_rota%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM taxidog_rota WHERE id_rota = p_id_rota FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;
  IF NOT fn_gestor_taxidog(v_r.id_lojista) THEN
    RAISE EXCEPTION 'Só a gestão de agendamentos pode aprovar rotas';
  END IF;
  IF v_r.status <> 'aguardando_aprovacao' THEN
    RAISE EXCEPTION 'Esta rota não está aguardando aprovação';
  END IF;

  UPDATE taxidog_rota
  SET status = 'aguardando_saida', aprovada_por = auth.uid(), aprovada_em = NOW(),
      versao = versao + 1, ultima_alteracao = 'Rota aprovada — já pode sair'
  WHERE id_rota = p_id_rota;
END;
$$;

REVOKE ALL ON FUNCTION fn_aprovar_rota(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_aprovar_rota(UUID) TO authenticated;

-- Cancelar (ou recusar) antes de sair: gestão, ou o TaxiDog na rota dele.
CREATE OR REPLACE FUNCTION fn_cancelar_rota(p_id_rota UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r        taxidog_rota%ROWTYPE;
  v_corridas UUID[];
  v_msg      TEXT;
BEGIN
  SELECT * INTO v_r FROM taxidog_rota WHERE id_rota = p_id_rota FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;
  IF v_r.status = 'em_andamento' THEN
    RAISE EXCEPTION 'A rota já saiu — remova as paradas que não vão acontecer em vez de cancelar';
  END IF;
  IF v_r.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Esta rota já foi encerrada';
  END IF;
  IF NOT fn_pode_editar_rota(v_r) THEN
    RAISE EXCEPTION 'Você não pode cancelar esta rota';
  END IF;

  v_msg := CASE
    WHEN v_r.id_funcionario IS NOT DISTINCT FROM auth.uid() THEN 'Rota cancelada pelo TaxiDog'
    WHEN v_r.status = 'aguardando_aprovacao' THEN 'Rota recusada pela loja'
    ELSE 'Rota cancelada pela loja'
  END;

  v_corridas := ARRAY(SELECT DISTINCT id_corrida FROM taxidog_parada_item WHERE id_rota = p_id_rota);
  DELETE FROM taxidog_parada WHERE id_rota = p_id_rota;

  UPDATE taxidog_rota
  SET status = 'cancelada', versao = versao + 1, ultima_alteracao = v_msg
  WHERE id_rota = p_id_rota;

  PERFORM fn_sincronizar_taxidog_corridas(v_corridas);
END;
$$;

REVOKE ALL ON FUNCTION fn_cancelar_rota(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cancelar_rota(UUID) TO authenticated;

-- Iniciar: agora bloqueia a rota que ainda espera aprovação.
CREATE OR REPLACE FUNCTION fn_iniciar_rota(p_id_rota UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r   taxidog_rota%ROWTYPE;
  v_pet TEXT;
  v_c   RECORD;
BEGIN
  SELECT * INTO v_r FROM taxidog_rota WHERE id_rota = p_id_rota FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;
  IF NOT fn_pode_executar_rota(v_r) THEN
    RAISE EXCEPTION 'Esta rota não está atribuída a você';
  END IF;
  IF v_r.status = 'planejamento' THEN
    RAISE EXCEPTION 'Escolha o TaxiDog da rota antes de iniciar';
  END IF;
  IF v_r.status = 'aguardando_aprovacao' THEN
    RAISE EXCEPTION 'Esta rota ainda precisa ser aprovada pela loja';
  END IF;
  IF v_r.status <> 'aguardando_saida' THEN
    RAISE EXCEPTION 'Esta rota não pode ser iniciada agora';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM taxidog_parada WHERE id_rota = p_id_rota AND status <> 'concluida') THEN
    RAISE EXCEPTION 'A rota não tem paradas';
  END IF;

  -- Busca só depois de a loja aceitar o agendamento (mesma regra da 043).
  SELECT pe.nome INTO v_pet
  FROM taxidog_parada_item i
  JOIN taxidog_corrida c ON c.id_corrida = i.id_corrida
  JOIN agendamento a ON a.id_agendamento = c.id_agendamento
  JOIN pet pe ON pe.id_pet = c.id_pet
  WHERE i.id_rota = p_id_rota AND i.acao = 'embarcar' AND NOT i.feito AND a.status = 'Pendente'
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'A loja ainda não aceitou o agendamento de % — aceite antes de sair', v_pet;
  END IF;

  UPDATE taxidog_rota SET status = 'em_andamento', iniciada_em = NOW() WHERE id_rota = p_id_rota;

  FOR v_c IN
    SELECT DISTINCT c.id_corrida
    FROM taxidog_parada_item i JOIN taxidog_corrida c ON c.id_corrida = i.id_corrida
    WHERE i.id_rota = p_id_rota AND i.acao = 'embarcar' AND NOT i.feito AND c.status = 'agendada'
  LOOP
    UPDATE taxidog_corrida SET status = 'a_caminho_cliente' WHERE id_corrida = v_c.id_corrida;
    PERFORM fn_registrar_evento_corrida(v_c.id_corrida, 'a_caminho_cliente', format('Rota #%s iniciada — TaxiDog a caminho', v_r.numero));
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fn_iniciar_rota(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_iniciar_rota(UUID) TO authenticated;

-- Corridas que ainda podem entrar numa rota. A gestão vê todas; o TaxiDog,
-- as sem TaxiDog e as dele. Busca só enquanto ninguém saiu pra buscar.
DROP FUNCTION IF EXISTS fn_trechos_pendentes(DATE);
CREATE FUNCTION fn_trechos_pendentes(p_data DATE)
RETURNS TABLE (
  id_corrida         UUID,
  trecho             TEXT,
  modalidade         TEXT,
  status_corrida     TEXT,
  valor              NUMERIC,
  cep                TEXT,
  logradouro         TEXT,
  numero             TEXT,
  complemento        TEXT,
  bairro             TEXT,
  cidade             TEXT,
  uf                 TEXT,
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  dt_agendamento     DATE,
  hr_agendamento     TIME,
  hr_fim_visita      TIME,
  status_agendamento TEXT,
  obs_agendamento    TEXT,
  servicos           TEXT,
  pet_nome           TEXT,
  pet_foto_url       TEXT,
  cliente_nome       TEXT,
  cliente_telefone   TEXT,
  id_funcionario     UUID,
  funcionario_nome   TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_lojista UUID := auth_lojista_id();
  v_gestor  BOOLEAN;
BEGIN
  IF v_lojista IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  v_gestor := fn_gestor_taxidog(v_lojista);
  IF NOT v_gestor AND NOT fn_e_taxidog(v_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    c.id_corrida, t.trecho, c.modalidade, c.status, c.valor::NUMERIC,
    c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf, c.lat, c.lng,
    a.dt_agendamento, a.hr_agendamento,
    (
      SELECT max(a2.hr_agendamento + make_interval(mins => s.duracao))
      FROM agendamento a2 JOIN servico s ON s.id_servico = a2.id_servico
      WHERE a2.id_pet = a.id_pet AND a2.id_lojista = a.id_lojista
        AND a2.dt_agendamento = a.dt_agendamento AND a2.status <> 'Cancelado'
    ),
    a.status::TEXT, a.obs,
    (
      SELECT string_agg(s.nome, ' + ' ORDER BY a2.hr_agendamento)
      FROM agendamento a2 JOIN servico s ON s.id_servico = a2.id_servico
      WHERE a2.id_pet = a.id_pet AND a2.id_lojista = a.id_lojista
        AND a2.dt_agendamento = a.dt_agendamento AND a2.status <> 'Cancelado'
    ),
    pe.nome, pe.foto_url, cl.nome, cl.telefone,
    c.id_funcionario, fu.nome
  FROM taxidog_corrida c
  JOIN agendamento a ON a.id_agendamento = c.id_agendamento
  JOIN pet pe ON pe.id_pet = c.id_pet
  JOIN cliente cl ON cl.id_cliente = c.id_cliente
  LEFT JOIN funcionario fu ON fu.id_funcionario = c.id_funcionario
  CROSS JOIN LATERAL (VALUES ('busca'), ('entrega')) AS t(trecho)
  WHERE c.id_lojista = v_lojista
    AND a.dt_agendamento = p_data
    AND a.status <> 'Cancelado'
    AND c.status <> 'cancelada'
    AND (v_gestor OR c.id_funcionario IS NULL OR c.id_funcionario = auth.uid())
    AND (
      (t.trecho = 'busca'
        AND c.modalidade IN ('buscar', 'buscar_entregar')
        AND c.status = 'agendada'
        AND NOT EXISTS (SELECT 1 FROM taxidog_parada_item i WHERE i.id_corrida = c.id_corrida AND i.acao = 'embarcar'))
      OR
      (t.trecho = 'entrega'
        AND c.modalidade IN ('entregar', 'buscar_entregar')
        AND c.status NOT IN ('concluida', 'a_caminho_entrega', 'no_endereco_entrega')
        AND NOT EXISTS (SELECT 1 FROM taxidog_parada_item i WHERE i.id_corrida = c.id_corrida AND i.acao = 'pegar_loja'))
    )
  ORDER BY a.hr_agendamento, pe.nome;
END;
$$;

REVOKE ALL ON FUNCTION fn_trechos_pendentes(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_trechos_pendentes(DATE) TO authenticated;

-- ============================================================
-- 4) Kanban de corridas de volta (fora de rota)
-- ============================================================

-- Gestão escolhe o TaxiDog de uma corrida avulsa.
CREATE OR REPLACE FUNCTION fn_atribuir_corrida(p_id_corrida UUID, p_id_funcionario UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c    taxidog_corrida%ROWTYPE;
  v_nome TEXT;
  v_rota INTEGER;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;
  IF NOT fn_gestor_taxidog(v_c.id_lojista) THEN
    RAISE EXCEPTION 'Você não tem permissão para atribuir corridas';
  END IF;

  v_rota := fn_rota_da_corrida(p_id_corrida);
  IF v_rota IS NOT NULL THEN
    RAISE EXCEPTION 'Esta corrida está na Rota #% — troque o TaxiDog pela rota', v_rota;
  END IF;

  IF v_c.status NOT IN ('agendada', 'entregue_loja', 'pronto_entrega') THEN
    RAISE EXCEPTION 'Não é possível trocar o TaxiDog com a corrida em andamento ou encerrada';
  END IF;

  IF p_id_funcionario IS NOT NULL THEN
    SELECT nome INTO v_nome FROM funcionario
    WHERE id_funcionario = p_id_funcionario AND id_lojista = v_c.id_lojista AND ativo = TRUE AND pode_taxidog = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Este funcionário não está habilitado como TaxiDog';
    END IF;
  END IF;

  IF p_id_funcionario IS NOT DISTINCT FROM v_c.id_funcionario THEN
    RETURN;
  END IF;

  UPDATE taxidog_corrida SET id_funcionario = p_id_funcionario WHERE id_corrida = p_id_corrida;

  PERFORM fn_registrar_evento_corrida(
    p_id_corrida, v_c.status,
    CASE WHEN p_id_funcionario IS NULL THEN 'TaxiDog removido da corrida' ELSE 'Corrida atribuída a ' || v_nome END
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_atribuir_corrida(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_atribuir_corrida(UUID, UUID) TO authenticated;

-- O próprio TaxiDog pega uma corrida sem TaxiDog.
CREATE OR REPLACE FUNCTION fn_assumir_corrida(p_id_corrida UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c         taxidog_corrida%ROWTYPE;
  v_nome      TEXT;
  v_ag_status TEXT;
  v_rota      INTEGER;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM v_c.id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT nome INTO v_nome FROM funcionario
  WHERE id_funcionario = auth.uid() AND id_lojista = v_c.id_lojista AND ativo = TRUE AND pode_taxidog = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só quem tem a função TaxiDog pode assumir corridas';
  END IF;

  v_rota := fn_rota_da_corrida(p_id_corrida);
  IF v_rota IS NOT NULL THEN
    RAISE EXCEPTION 'Esta corrida já está na Rota #%', v_rota;
  END IF;

  IF v_c.id_funcionario IS NOT NULL THEN
    IF v_c.id_funcionario = auth.uid() THEN
      RETURN; -- já é dele (dois cliques)
    END IF;
    RAISE EXCEPTION 'Esta corrida já foi atribuída a outro TaxiDog';
  END IF;

  IF v_c.status NOT IN ('agendada', 'entregue_loja', 'pronto_entrega') THEN
    RAISE EXCEPTION 'Esta corrida não está mais disponível';
  END IF;

  SELECT status::TEXT INTO v_ag_status FROM agendamento WHERE id_agendamento = v_c.id_agendamento;
  IF v_ag_status = 'Cancelado' THEN
    RAISE EXCEPTION 'O agendamento desta corrida foi cancelado';
  END IF;
  IF v_ag_status = 'Pendente' THEN
    RAISE EXCEPTION 'A loja ainda não aceitou este agendamento — aguarde o aceite para assumir a corrida';
  END IF;

  UPDATE taxidog_corrida SET id_funcionario = auth.uid() WHERE id_corrida = p_id_corrida;

  PERFORM fn_registrar_evento_corrida(p_id_corrida, v_c.status, v_nome || ' assumiu a corrida');
END;
$$;

REVOKE ALL ON FUNCTION fn_assumir_corrida(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_assumir_corrida(UUID) TO authenticated;

-- Próxima etapa de uma corrida avulsa (a de rota anda pela rota).
CREATE OR REPLACE FUNCTION fn_avancar_corrida(p_id_corrida UUID, p_novo_status TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c         taxidog_corrida%ROWTYPE;
  v_ag_status TEXT;
  v_gestor    BOOLEAN;
  v_ok        BOOLEAN;
  v_final     TEXT;
  v_rota      INTEGER;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM v_c.id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  v_gestor := fn_gestor_taxidog(v_c.id_lojista);

  IF NOT v_gestor AND v_c.id_funcionario IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Esta corrida não está atribuída a você';
  END IF;

  IF v_c.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Esta corrida já foi encerrada';
  END IF;

  v_rota := fn_rota_da_corrida(p_id_corrida);
  IF v_rota IS NOT NULL THEN
    RAISE EXCEPTION 'Esta corrida está na Rota #% — siga pela tela da rota', v_rota;
  END IF;

  v_ok := CASE
    WHEN v_c.status = 'agendada'            AND p_novo_status = 'a_caminho_cliente'   AND v_c.modalidade IN ('buscar', 'buscar_entregar') THEN TRUE
    WHEN v_c.status = 'a_caminho_cliente'   AND p_novo_status = 'no_endereco'         THEN TRUE
    WHEN v_c.status = 'no_endereco'         AND p_novo_status = 'pet_embarcado'       THEN TRUE
    WHEN v_c.status = 'pet_embarcado'       AND p_novo_status = 'entregue_loja'       THEN TRUE
    WHEN v_c.status = 'pronto_entrega'      AND p_novo_status = 'a_caminho_entrega'   THEN TRUE
    WHEN v_c.status = 'a_caminho_entrega'   AND p_novo_status = 'no_endereco_entrega' THEN TRUE
    WHEN v_c.status = 'no_endereco_entrega' AND p_novo_status = 'concluida'           THEN TRUE
    ELSE FALSE
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Essa etapa não pode ser feita agora';
  END IF;

  IF p_novo_status IN ('a_caminho_cliente', 'a_caminho_entrega') AND v_c.id_funcionario IS NULL THEN
    RAISE EXCEPTION 'Atribua um TaxiDog antes de iniciar a corrida';
  END IF;

  SELECT status::TEXT INTO v_ag_status FROM agendamento WHERE id_agendamento = v_c.id_agendamento;
  IF v_ag_status = 'Cancelado' THEN
    RAISE EXCEPTION 'O agendamento desta corrida foi cancelado';
  END IF;

  IF p_novo_status = 'a_caminho_cliente' AND v_ag_status = 'Pendente' THEN
    RAISE EXCEPTION 'A loja ainda não aceitou este agendamento — aceite antes de iniciar a busca';
  END IF;

  v_final := p_novo_status;
  IF p_novo_status = 'entregue_loja' THEN
    IF v_c.modalidade = 'buscar' THEN
      v_final := 'concluida';
    ELSIF fn_visita_taxidog_concluida(v_c.id_agendamento) THEN
      -- Serviço já tinha terminado antes do TaxiDog registrar a chegada.
      v_final := 'pronto_entrega';
    END IF;
  END IF;

  UPDATE taxidog_corrida SET status = v_final WHERE id_corrida = p_id_corrida;

  PERFORM fn_registrar_evento_corrida(p_id_corrida, p_novo_status, CASE p_novo_status
    WHEN 'a_caminho_cliente'   THEN 'TaxiDog a caminho do cliente'
    WHEN 'no_endereco'         THEN 'TaxiDog chegou ao endereço'
    WHEN 'pet_embarcado'       THEN 'Pet embarcado'
    WHEN 'entregue_loja'       THEN 'Pet entregue na loja'
    WHEN 'a_caminho_entrega'   THEN 'TaxiDog a caminho para entrega'
    WHEN 'no_endereco_entrega' THEN 'TaxiDog chegou ao endereço de entrega'
    WHEN 'concluida'           THEN 'Pet entregue ao cliente'
  END);

  IF v_final = 'concluida' THEN
    PERFORM fn_registrar_evento_corrida(p_id_corrida, 'concluida', 'Corrida concluída');
  ELSIF v_final = 'pronto_entrega' THEN
    PERFORM fn_registrar_evento_corrida(p_id_corrida, 'pronto_entrega', 'Serviço finalizado — pet pronto para entrega');
  END IF;

  RETURN v_final;
END;
$$;

REVOKE ALL ON FUNCTION fn_avancar_corrida(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_avancar_corrida(UUID, TEXT) TO authenticated;
