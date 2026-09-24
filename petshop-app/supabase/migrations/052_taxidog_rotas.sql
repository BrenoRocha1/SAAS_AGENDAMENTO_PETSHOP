-- ============================================================
-- PETSHOP SaaS - Migration 052: TaxiDog com ROTAS
-- ============================================================
-- Até aqui cada corrida era executada sozinha. Agora:
--
-- • taxidog_corrida continua sendo a SOLICITAÇÃO de transporte de um
--   agendamento (endereço, tipo, taxa). Ela tem até dois TRECHOS:
--     busca   = embarcar no cliente → deixar na loja
--     entrega = pegar na loja → entregar no cliente
--
-- • taxidog_rota agrupa trechos de vários pets numa ordem de paradas,
--   com um TaxiDog. taxidog_parada é um lugar (cliente ou loja) e
--   taxidog_parada_item é o que se faz com cada pet ali:
--     cliente: 'embarcar' | 'entregar'      loja: 'deixar_loja' | 'pegar_loja'
--   Uma parada na loja pode ter vários pets ("Pet Shop — deixar Mel +
--   Luna"), confirmados juntos.
--
-- • A montagem/reordenação das paradas é feita na aplicação (que sabe
--   encaixar as idas à loja); aqui fn_salvar_paradas VALIDA tudo (cada
--   pet passa pela loja depois de embarcar, pega na loja antes de
--   entregar, trecho em uma rota só...) e grava numa transação.
--
-- • Distância/tempo vêm do Google Maps (Routes API), calculados no
--   servidor da aplicação e guardados na rota (fn_salvar_calculo_rota),
--   valendo pra versão da rota em que foram calculados.
--
-- • `versao` sobe a cada mudança de estrutura, com `ultima_alteracao`
--   descrevendo o que mudou — é isso que o app do TaxiDog usa pra avisar
--   "Rota atualizada — a parada da Luna foi removida".
-- ============================================================

-- ============================================================
-- 0) Uma corrida EM ABERTO por agendamento
-- ============================================================
-- Canceladas e concluídas podem ficar: é o que permite trocar o tipo de
-- transporte (cancela uma, abre outra) e pedir a entrega depois de uma
-- busca já feita.
ALTER TABLE taxidog_corrida DROP CONSTRAINT IF EXISTS taxidog_corrida_id_agendamento_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxidog_corrida_agendamento_aberta
  ON taxidog_corrida(id_agendamento) WHERE status NOT IN ('cancelada', 'concluida');
CREATE INDEX IF NOT EXISTS idx_taxidog_corrida_agendamento ON taxidog_corrida(id_agendamento);

-- ============================================================
-- 1) Tabelas
-- ============================================================
CREATE TABLE IF NOT EXISTS taxidog_rota (
  id_rota          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista       UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  numero           INTEGER NOT NULL,
  data             DATE NOT NULL,
  id_funcionario   UUID REFERENCES funcionario(id_funcionario) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'planejamento'
                   CHECK (status IN ('planejamento', 'aguardando_saida', 'em_andamento', 'concluida', 'cancelada')),
  distancia_m      INTEGER,
  duracao_s        INTEGER,
  calculo_versao   INTEGER,
  versao           INTEGER NOT NULL DEFAULT 1,
  ultima_alteracao TEXT,
  iniciada_em      TIMESTAMPTZ,
  concluida_em     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_lojista, numero)
);

CREATE INDEX IF NOT EXISTS idx_taxidog_rota_loja_data ON taxidog_rota(id_lojista, data);
CREATE INDEX IF NOT EXISTS idx_taxidog_rota_funcionario ON taxidog_rota(id_funcionario, data);

DROP TRIGGER IF EXISTS trg_taxidog_rota_updated_at ON taxidog_rota;
CREATE TRIGGER trg_taxidog_rota_updated_at
  BEFORE UPDATE ON taxidog_rota
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE IF NOT EXISTS taxidog_parada (
  id_parada    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_rota      UUID NOT NULL REFERENCES taxidog_rota(id_rota) ON DELETE CASCADE,
  ordem        INTEGER NOT NULL,
  local        TEXT NOT NULL CHECK (local IN ('cliente', 'loja')),
  status       TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'chegou', 'concluida')),
  chegou_em    TIMESTAMPTZ,
  concluida_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_taxidog_parada_rota ON taxidog_parada(id_rota, ordem);

CREATE TABLE IF NOT EXISTS taxidog_parada_item (
  id_item    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_parada  UUID NOT NULL REFERENCES taxidog_parada(id_parada) ON DELETE CASCADE,
  id_rota    UUID NOT NULL REFERENCES taxidog_rota(id_rota) ON DELETE CASCADE,
  id_corrida UUID NOT NULL REFERENCES taxidog_corrida(id_corrida) ON DELETE CASCADE,
  acao       TEXT NOT NULL CHECK (acao IN ('embarcar', 'deixar_loja', 'pegar_loja', 'entregar')),
  feito      BOOLEAN NOT NULL DEFAULT FALSE,
  feito_em   TIMESTAMPTZ,
  -- Cada passo de cada solicitação em no máximo uma rota.
  UNIQUE (id_corrida, acao)
);

CREATE INDEX IF NOT EXISTS idx_taxidog_parada_item_parada ON taxidog_parada_item(id_parada);
CREATE INDEX IF NOT EXISTS idx_taxidog_parada_item_rota ON taxidog_parada_item(id_rota);

-- ============================================================
-- 2) RLS (escrita só pelas funções abaixo)
-- ============================================================
ALTER TABLE taxidog_rota ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxidog_rota FORCE ROW LEVEL SECURITY;
ALTER TABLE taxidog_parada ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxidog_parada FORCE ROW LEVEL SECURITY;
ALTER TABLE taxidog_parada_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxidog_parada_item FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taxidog_rota: loja ve" ON taxidog_rota;
CREATE POLICY "taxidog_rota: loja ve"
  ON taxidog_rota FOR SELECT
  USING (
    (auth_role() = 'lojista' AND id_lojista = auth.uid())
    OR (
      auth_role() = 'funcionario' AND id_lojista = auth_lojista_id()
      AND (
        id_funcionario = auth.uid()
        OR EXISTS (
          SELECT 1 FROM funcionario f
          WHERE f.id_funcionario = auth.uid() AND f.ativo = TRUE
            AND (f.pode_gerenciar_agenda OR f.acesso_total)
        )
      )
    )
  );

DROP POLICY IF EXISTS "taxidog_parada: quem ve a rota" ON taxidog_parada;
CREATE POLICY "taxidog_parada: quem ve a rota"
  ON taxidog_parada FOR SELECT
  USING (EXISTS (SELECT 1 FROM taxidog_rota r WHERE r.id_rota = taxidog_parada.id_rota));

DROP POLICY IF EXISTS "taxidog_parada_item: quem ve a rota" ON taxidog_parada_item;
CREATE POLICY "taxidog_parada_item: quem ve a rota"
  ON taxidog_parada_item FOR SELECT
  USING (EXISTS (SELECT 1 FROM taxidog_rota r WHERE r.id_rota = taxidog_parada_item.id_rota));

-- Realtime: painel e app atualizam quando a rota muda (toda mudança de
-- parada também "toca" a linha da rota).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'taxidog_rota'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE taxidog_rota;
  END IF;
END $$;

-- ============================================================
-- 3) Auxiliares internas
-- ============================================================

-- Quem organiza as rotas: dono ou equipe com agenda/administrador.
CREATE OR REPLACE FUNCTION fn_gestor_taxidog(p_id_lojista UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth_lojista_id() IS NOT DISTINCT FROM p_id_lojista
    AND p_id_lojista IS NOT NULL
    AND (
      auth_role() = 'lojista'
      OR EXISTS (
        SELECT 1 FROM funcionario
        WHERE id_funcionario = auth.uid() AND ativo = TRUE AND (pode_gerenciar_agenda OR acesso_total)
      )
    )
$$;

REVOKE ALL ON FUNCTION fn_gestor_taxidog(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_gestor_taxidog(UUID) TO authenticated;

-- corrida.id_funcionario acompanha o TaxiDog da rota em que ela está
-- (relatórios e a RLS antiga continuam valendo).
CREATE OR REPLACE FUNCTION fn_sincronizar_taxidog_corridas(p_ids UUID[])
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE taxidog_corrida c
  SET id_funcionario = (
    SELECT r.id_funcionario
    FROM taxidog_parada_item i
    JOIN taxidog_rota r ON r.id_rota = i.id_rota
    WHERE i.id_corrida = c.id_corrida AND r.status <> 'cancelada'
    ORDER BY r.created_at DESC
    LIMIT 1
  )
  WHERE c.id_corrida = ANY(COALESCE(p_ids, '{}'))
$$;

REVOKE ALL ON FUNCTION fn_sincronizar_taxidog_corridas(UUID[]) FROM PUBLIC;

-- Tira paradas vazias que ainda não foram concluídas (inclusive a atual,
-- se todos os pets dela saíram da rota), junta idas à loja seguidas e
-- renumera.
CREATE OR REPLACE FUNCTION fn_limpar_rota(p_id_rota UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p            RECORD;
  v_ant_id       UUID;
  v_ant_local    TEXT;
  v_ant_status   TEXT;
BEGIN
  DELETE FROM taxidog_parada p
  WHERE p.id_rota = p_id_rota AND p.status <> 'concluida'
    AND NOT EXISTS (SELECT 1 FROM taxidog_parada_item i WHERE i.id_parada = p.id_parada);

  FOR v_p IN SELECT * FROM taxidog_parada WHERE id_rota = p_id_rota ORDER BY ordem LOOP
    IF v_ant_id IS NOT NULL AND v_ant_local = 'loja' AND v_p.local = 'loja'
       AND v_ant_status = 'pendente' AND v_p.status = 'pendente' THEN
      UPDATE taxidog_parada_item SET id_parada = v_ant_id WHERE id_parada = v_p.id_parada;
      DELETE FROM taxidog_parada WHERE id_parada = v_p.id_parada;
    ELSE
      v_ant_id := v_p.id_parada;
      v_ant_local := v_p.local;
      v_ant_status := v_p.status;
    END IF;
  END LOOP;

  WITH ord AS (
    SELECT id_parada, row_number() OVER (ORDER BY ordem) AS n
    FROM taxidog_parada WHERE id_rota = p_id_rota
  )
  UPDATE taxidog_parada p SET ordem = ord.n FROM ord WHERE ord.id_parada = p.id_parada;
END;
$$;

REVOKE ALL ON FUNCTION fn_limpar_rota(UUID) FROM PUBLIC;

-- Regras de ordem: embarcar antes de deixar na loja; pegar na loja antes
-- de entregar; um trecho sempre inteiro dentro da mesma rota.
CREATE OR REPLACE FUNCTION fn_validar_rota(p_id_rota UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v   RECORD;
  v_pet TEXT;
BEGIN
  FOR v IN
    SELECT i.id_corrida,
           max(p.ordem) FILTER (WHERE i.acao = 'embarcar')    AS o_emb,
           max(p.ordem) FILTER (WHERE i.acao = 'deixar_loja') AS o_dei,
           max(p.ordem) FILTER (WHERE i.acao = 'pegar_loja')  AS o_peg,
           max(p.ordem) FILTER (WHERE i.acao = 'entregar')    AS o_ent
    FROM taxidog_parada_item i
    JOIN taxidog_parada p ON p.id_parada = i.id_parada
    WHERE i.id_rota = p_id_rota
    GROUP BY i.id_corrida
  LOOP
    SELECT pe.nome INTO v_pet FROM taxidog_corrida c JOIN pet pe ON pe.id_pet = c.id_pet WHERE c.id_corrida = v.id_corrida;
    IF (v.o_emb IS NULL) <> (v.o_dei IS NULL) OR COALESCE(v.o_emb >= v.o_dei, FALSE) THEN
      RAISE EXCEPTION 'A busca de % precisa passar pela loja depois de buscar o pet', v_pet;
    END IF;
    IF (v.o_peg IS NULL) <> (v.o_ent IS NULL) OR COALESCE(v.o_peg >= v.o_ent, FALSE) THEN
      RAISE EXCEPTION 'A entrega de % precisa pegar o pet na loja antes', v_pet;
    END IF;
    IF COALESCE(v.o_dei >= v.o_peg, FALSE) THEN
      RAISE EXCEPTION '% precisa ser deixado na loja antes de sair para a entrega', v_pet;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fn_validar_rota(UUID) FROM PUBLIC;

-- Rota em andamento sem nada por fazer = concluída; rota que ainda não
-- saiu e ficou sem paradas = cancelada (não serve pra nada).
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
  ELSIF v_r.status IN ('planejamento', 'aguardando_saida')
     AND NOT EXISTS (SELECT 1 FROM taxidog_parada WHERE id_rota = p_id_rota) THEN
    UPDATE taxidog_rota
    SET status = 'cancelada', versao = versao + 1, ultima_alteracao = 'A rota ficou sem paradas e foi cancelada'
    WHERE id_rota = p_id_rota;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION fn_rota_verificar_fim(UUID) FROM PUBLIC;

-- ============================================================
-- 4) Organização da rota (dono / equipe com agenda)
-- ============================================================

-- Substitui as paradas AINDA NÃO INICIADAS da rota pela lista enviada:
-- [{ "local": "cliente"|"loja", "itens": [{ "id_corrida": uuid, "acao": ... }] }]
-- As já feitas (e a atual, "chegou") ficam como estão, no começo.
CREATE OR REPLACE FUNCTION fn_salvar_paradas(p_id_rota UUID, p_paradas JSONB, p_mensagem TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r         taxidog_rota%ROWTYPE;
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
  IF NOT fn_gestor_taxidog(v_r.id_lojista) THEN
    RAISE EXCEPTION 'Você não tem permissão para organizar as rotas';
  END IF;
  IF v_r.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Esta rota já foi encerrada';
  END IF;
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
  SET versao = versao + 1, ultima_alteracao = p_mensagem
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
  v_lojista UUID := auth_lojista_id();
  v_numero  INTEGER;
  v_id      UUID;
BEGIN
  IF v_lojista IS NULL OR NOT fn_gestor_taxidog(v_lojista) THEN
    RAISE EXCEPTION 'Você não tem permissão para organizar as rotas';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Informe o dia da rota';
  END IF;
  IF jsonb_array_length(COALESCE(p_paradas, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Escolha ao menos uma solicitação para a rota';
  END IF;
  IF p_id_funcionario IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = p_id_funcionario AND id_lojista = v_lojista AND ativo = TRUE AND pode_taxidog = TRUE
  ) THEN
    RAISE EXCEPTION 'Este funcionário não está habilitado como TaxiDog';
  END IF;

  -- Numeração por loja sem corrida entre duas rotas criadas juntas.
  PERFORM pg_advisory_xact_lock(hashtext('taxidog_rota:' || v_lojista::TEXT));
  SELECT COALESCE(max(numero), 100) + 1 INTO v_numero FROM taxidog_rota WHERE id_lojista = v_lojista;

  INSERT INTO taxidog_rota (id_lojista, numero, data, id_funcionario, status)
  VALUES (v_lojista, v_numero, p_data, p_id_funcionario,
          CASE WHEN p_id_funcionario IS NULL THEN 'planejamento' ELSE 'aguardando_saida' END)
  RETURNING id_rota INTO v_id;

  PERFORM fn_salvar_paradas(v_id, p_paradas, NULL);
  UPDATE taxidog_rota SET versao = 1, ultima_alteracao = NULL WHERE id_rota = v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_rota(DATE, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_rota(DATE, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION fn_atribuir_rota(p_id_rota UUID, p_id_funcionario UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r    taxidog_rota%ROWTYPE;
  v_nome TEXT;
BEGIN
  SELECT * INTO v_r FROM taxidog_rota WHERE id_rota = p_id_rota FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;
  IF NOT fn_gestor_taxidog(v_r.id_lojista) THEN
    RAISE EXCEPTION 'Você não tem permissão para organizar as rotas';
  END IF;
  IF v_r.status = 'em_andamento' THEN
    RAISE EXCEPTION 'A rota já saiu — não dá para trocar o TaxiDog agora';
  END IF;
  IF v_r.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Esta rota já foi encerrada';
  END IF;

  IF p_id_funcionario IS NOT NULL THEN
    SELECT nome INTO v_nome FROM funcionario
    WHERE id_funcionario = p_id_funcionario AND id_lojista = v_r.id_lojista AND ativo = TRUE AND pode_taxidog = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Este funcionário não está habilitado como TaxiDog';
    END IF;
  END IF;

  IF p_id_funcionario IS NOT DISTINCT FROM v_r.id_funcionario THEN
    RETURN;
  END IF;

  UPDATE taxidog_rota
  SET id_funcionario = p_id_funcionario,
      status = CASE WHEN p_id_funcionario IS NULL THEN 'planejamento' ELSE 'aguardando_saida' END,
      versao = versao + 1,
      ultima_alteracao = CASE WHEN p_id_funcionario IS NULL THEN 'TaxiDog removido da rota' ELSE 'Rota atribuída a ' || v_nome END
  WHERE id_rota = p_id_rota;

  PERFORM fn_sincronizar_taxidog_corridas(ARRAY(SELECT DISTINCT id_corrida FROM taxidog_parada_item WHERE id_rota = p_id_rota));
END;
$$;

REVOKE ALL ON FUNCTION fn_atribuir_rota(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_atribuir_rota(UUID, UUID) TO authenticated;

-- Cancela uma rota que ainda não saiu: as solicitações voltam a ficar
-- pendentes pra entrar em outra rota.
CREATE OR REPLACE FUNCTION fn_cancelar_rota(p_id_rota UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r        taxidog_rota%ROWTYPE;
  v_corridas UUID[];
BEGIN
  SELECT * INTO v_r FROM taxidog_rota WHERE id_rota = p_id_rota FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;
  IF NOT fn_gestor_taxidog(v_r.id_lojista) THEN
    RAISE EXCEPTION 'Você não tem permissão para organizar as rotas';
  END IF;
  IF v_r.status = 'em_andamento' THEN
    RAISE EXCEPTION 'A rota já saiu — remova as paradas que não vão acontecer em vez de cancelar';
  END IF;
  IF v_r.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Esta rota já foi encerrada';
  END IF;

  v_corridas := ARRAY(SELECT DISTINCT id_corrida FROM taxidog_parada_item WHERE id_rota = p_id_rota);
  DELETE FROM taxidog_parada WHERE id_rota = p_id_rota;

  UPDATE taxidog_rota
  SET status = 'cancelada', versao = versao + 1, ultima_alteracao = 'Rota cancelada pela loja'
  WHERE id_rota = p_id_rota;

  PERFORM fn_sincronizar_taxidog_corridas(v_corridas);
END;
$$;

REVOKE ALL ON FUNCTION fn_cancelar_rota(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cancelar_rota(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION fn_salvar_calculo_rota(p_id_rota UUID, p_versao INTEGER, p_distancia_m INTEGER, p_duracao_s INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r taxidog_rota%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM taxidog_rota WHERE id_rota = p_id_rota;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT fn_gestor_taxidog(v_r.id_lojista) AND v_r.id_funcionario IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  -- Só grava se a rota não mudou desde que o cálculo começou.
  UPDATE taxidog_rota
  SET distancia_m = p_distancia_m, duracao_s = p_duracao_s, calculo_versao = p_versao
  WHERE id_rota = p_id_rota AND versao = p_versao;
END;
$$;

REVOKE ALL ON FUNCTION fn_salvar_calculo_rota(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_salvar_calculo_rota(UUID, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- 5) Execução (TaxiDog da rota — ou a loja, se ele esquecer)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_pode_executar_rota(p_r taxidog_rota)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_r.id_funcionario IS NOT DISTINCT FROM auth.uid() AND p_r.id_funcionario IS NOT NULL
      OR fn_gestor_taxidog(p_r.id_lojista)
$$;

REVOKE ALL ON FUNCTION fn_pode_executar_rota(taxidog_rota) FROM PUBLIC;

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

CREATE OR REPLACE FUNCTION fn_chegar_parada(p_id_parada UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p       taxidog_parada%ROWTYPE;
  v_r       taxidog_rota%ROWTYPE;
  v_proxima UUID;
  v_i       RECORD;
BEGIN
  SELECT * INTO v_p FROM taxidog_parada WHERE id_parada = p_id_parada FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parada não encontrada';
  END IF;
  SELECT * INTO v_r FROM taxidog_rota WHERE id_rota = v_p.id_rota FOR UPDATE;
  IF NOT fn_pode_executar_rota(v_r) THEN
    RAISE EXCEPTION 'Esta rota não está atribuída a você';
  END IF;
  IF v_r.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'Inicie a rota primeiro';
  END IF;

  SELECT id_parada INTO v_proxima FROM taxidog_parada
  WHERE id_rota = v_r.id_rota AND status <> 'concluida' ORDER BY ordem LIMIT 1;
  IF v_proxima IS DISTINCT FROM p_id_parada OR v_p.status <> 'pendente' THEN
    RAISE EXCEPTION 'Esta não é a próxima parada da rota';
  END IF;

  UPDATE taxidog_parada SET status = 'chegou', chegou_em = NOW() WHERE id_parada = p_id_parada;

  FOR v_i IN SELECT i.*, c.status AS status_corrida FROM taxidog_parada_item i JOIN taxidog_corrida c ON c.id_corrida = i.id_corrida WHERE i.id_parada = p_id_parada LOOP
    IF v_i.acao = 'embarcar' AND v_i.status_corrida IN ('agendada', 'a_caminho_cliente') THEN
      UPDATE taxidog_corrida SET status = 'no_endereco' WHERE id_corrida = v_i.id_corrida;
      PERFORM fn_registrar_evento_corrida(v_i.id_corrida, 'no_endereco', 'TaxiDog chegou ao endereço');
    ELSIF v_i.acao = 'entregar' AND v_i.status_corrida = 'a_caminho_entrega' THEN
      UPDATE taxidog_corrida SET status = 'no_endereco_entrega' WHERE id_corrida = v_i.id_corrida;
      PERFORM fn_registrar_evento_corrida(v_i.id_corrida, 'no_endereco_entrega', 'TaxiDog chegou ao endereço de entrega');
    END IF;
  END LOOP;

  UPDATE taxidog_rota SET updated_at = NOW() WHERE id_rota = v_r.id_rota;
END;
$$;

REVOKE ALL ON FUNCTION fn_chegar_parada(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_chegar_parada(UUID) TO authenticated;

-- Conclui a parada atual. p_itens = itens confirmados (NULL = todos).
-- Pet que não embarcou (cliente não estava) ou que não estava pronto na
-- loja sai da rota e volta a ficar pendente; deixar na loja e entregar
-- ao cliente têm de ser confirmados (o pet está no carro).
CREATE OR REPLACE FUNCTION fn_concluir_parada(p_id_parada UUID, p_itens UUID[] DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p      taxidog_parada%ROWTYPE;
  v_r      taxidog_rota%ROWTYPE;
  v_i      RECORD;
  v_ok     BOOLEAN;
  v_final  TEXT;
  v_avisos TEXT[] := '{}';
  v_saidas UUID[] := '{}';
  v_status TEXT;
BEGIN
  SELECT * INTO v_p FROM taxidog_parada WHERE id_parada = p_id_parada FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parada não encontrada';
  END IF;
  SELECT * INTO v_r FROM taxidog_rota WHERE id_rota = v_p.id_rota FOR UPDATE;
  IF NOT fn_pode_executar_rota(v_r) THEN
    RAISE EXCEPTION 'Esta rota não está atribuída a você';
  END IF;
  IF v_r.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'Inicie a rota primeiro';
  END IF;
  IF v_p.status <> 'chegou' THEN
    RAISE EXCEPTION 'Marque "Cheguei" antes de confirmar';
  END IF;

  FOR v_i IN
    SELECT i.id_item, i.id_corrida, i.acao, c.status AS status_corrida, c.modalidade, c.id_agendamento, pe.nome AS pet
    FROM taxidog_parada_item i
    JOIN taxidog_corrida c ON c.id_corrida = i.id_corrida
    JOIN pet pe ON pe.id_pet = c.id_pet
    WHERE i.id_parada = p_id_parada AND NOT i.feito
  LOOP
    v_ok := p_itens IS NULL OR v_i.id_item = ANY(p_itens);

    IF v_ok THEN
      IF v_i.acao = 'embarcar' THEN
        UPDATE taxidog_corrida SET status = 'pet_embarcado' WHERE id_corrida = v_i.id_corrida;
        PERFORM fn_registrar_evento_corrida(v_i.id_corrida, 'pet_embarcado', 'Pet embarcado');
      ELSIF v_i.acao = 'deixar_loja' THEN
        v_final := CASE
          WHEN v_i.modalidade = 'buscar' THEN 'concluida'
          WHEN fn_visita_taxidog_concluida(v_i.id_agendamento) THEN 'pronto_entrega'
          ELSE 'entregue_loja'
        END;
        UPDATE taxidog_corrida SET status = v_final WHERE id_corrida = v_i.id_corrida;
        PERFORM fn_registrar_evento_corrida(v_i.id_corrida, 'entregue_loja', 'Pet entregue na loja');
        IF v_final = 'concluida' THEN
          PERFORM fn_registrar_evento_corrida(v_i.id_corrida, 'concluida', 'Corrida concluída');
        ELSIF v_final = 'pronto_entrega' THEN
          PERFORM fn_registrar_evento_corrida(v_i.id_corrida, 'pronto_entrega', 'Serviço finalizado — pet pronto para entrega');
        END IF;
      ELSIF v_i.acao = 'pegar_loja' THEN
        IF v_i.status_corrida <> 'pronto_entrega' THEN
          RAISE EXCEPTION '% ainda não está pronto — desmarque para tirar da rota', v_i.pet;
        END IF;
        UPDATE taxidog_corrida SET status = 'a_caminho_entrega' WHERE id_corrida = v_i.id_corrida;
        PERFORM fn_registrar_evento_corrida(v_i.id_corrida, 'a_caminho_entrega', 'TaxiDog saiu para entregar');
      ELSE -- entregar
        UPDATE taxidog_corrida SET status = 'concluida' WHERE id_corrida = v_i.id_corrida;
        PERFORM fn_registrar_evento_corrida(v_i.id_corrida, 'concluida', 'Pet entregue ao cliente');
        PERFORM fn_registrar_evento_corrida(v_i.id_corrida, 'concluida', 'Corrida concluída');
      END IF;
      UPDATE taxidog_parada_item SET feito = TRUE, feito_em = NOW() WHERE id_item = v_i.id_item;
    ELSE
      IF v_i.acao = 'embarcar' THEN
        DELETE FROM taxidog_parada_item
        WHERE id_rota = v_r.id_rota AND id_corrida = v_i.id_corrida AND acao IN ('embarcar', 'deixar_loja') AND NOT feito;
        UPDATE taxidog_corrida SET status = 'agendada' WHERE id_corrida = v_i.id_corrida;
        PERFORM fn_registrar_evento_corrida(v_i.id_corrida, 'agendada', 'Pet não foi embarcado — a busca voltou para as solicitações pendentes');
        v_avisos := v_avisos || (v_i.pet || ' não foi embarcado e saiu da rota');
        v_saidas := v_saidas || v_i.id_corrida;
      ELSIF v_i.acao = 'pegar_loja' THEN
        DELETE FROM taxidog_parada_item
        WHERE id_rota = v_r.id_rota AND id_corrida = v_i.id_corrida AND acao IN ('pegar_loja', 'entregar') AND NOT feito;
        PERFORM fn_registrar_evento_corrida(v_i.id_corrida, v_i.status_corrida, 'Pet não saiu para entrega nesta rota — voltou para as solicitações pendentes');
        v_avisos := v_avisos || (v_i.pet || ' não estava pronto e saiu da rota');
        v_saidas := v_saidas || v_i.id_corrida;
      ELSE
        RAISE EXCEPTION 'Confirme todos os pets desta parada';
      END IF;
    END IF;
  END LOOP;

  UPDATE taxidog_parada SET status = 'concluida', concluida_em = NOW() WHERE id_parada = p_id_parada;
  -- Parada que ficou sem nenhum pet (todos saíram da rota) não conta.
  DELETE FROM taxidog_parada p WHERE p.id_parada = p_id_parada
    AND NOT EXISTS (SELECT 1 FROM taxidog_parada_item i WHERE i.id_parada = p.id_parada);

  PERFORM fn_limpar_rota(v_r.id_rota);

  IF array_length(v_avisos, 1) > 0 THEN
    UPDATE taxidog_rota
    SET versao = versao + 1, ultima_alteracao = array_to_string(v_avisos, '; ')
    WHERE id_rota = v_r.id_rota;
    PERFORM fn_sincronizar_taxidog_corridas(v_saidas);
  ELSE
    UPDATE taxidog_rota SET updated_at = NOW() WHERE id_rota = v_r.id_rota;
  END IF;

  PERFORM fn_rota_verificar_fim(v_r.id_rota);
  SELECT status INTO v_status FROM taxidog_rota WHERE id_rota = v_r.id_rota;
  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION fn_concluir_parada(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_concluir_parada(UUID, UUID[]) TO authenticated;

-- ============================================================
-- 6) Solicitação cancelada (ou que perdeu um trecho) sai das rotas sozinha
-- ============================================================
-- Cancelada: saem todas as paradas ainda não feitas. Tipo trocado pra
-- "só busca" / "só entrega": sai o trecho que deixou de existir.
CREATE OR REPLACE FUNCTION fn_trg_corrida_rota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rota  UUID;
  v_pet   TEXT;
  v_acoes TEXT[];
  v_msg   TEXT;
BEGIN
  SELECT nome INTO v_pet FROM pet WHERE id_pet = NEW.id_pet;

  IF NEW.status = 'cancelada' AND OLD.status IS DISTINCT FROM 'cancelada' THEN
    v_acoes := ARRAY['embarcar', 'deixar_loja', 'pegar_loja', 'entregar'];
    v_msg := 'A parada de ' || v_pet || ' foi removida (TaxiDog cancelado)';
  ELSIF NEW.modalidade IS DISTINCT FROM OLD.modalidade AND NEW.modalidade = 'buscar' THEN
    v_acoes := ARRAY['pegar_loja', 'entregar'];
    v_msg := 'A entrega de ' || v_pet || ' foi removida';
  ELSIF NEW.modalidade IS DISTINCT FROM OLD.modalidade AND NEW.modalidade = 'entregar' THEN
    v_acoes := ARRAY['embarcar', 'deixar_loja'];
    v_msg := 'A busca de ' || v_pet || ' foi removida';
  ELSE
    RETURN NEW;
  END IF;

  FOR v_rota IN
    SELECT DISTINCT i.id_rota FROM taxidog_parada_item i
    JOIN taxidog_rota r ON r.id_rota = i.id_rota
    WHERE i.id_corrida = NEW.id_corrida AND NOT i.feito AND i.acao = ANY(v_acoes)
      AND r.status NOT IN ('concluida', 'cancelada')
  LOOP
    DELETE FROM taxidog_parada_item
    WHERE id_corrida = NEW.id_corrida AND id_rota = v_rota AND NOT feito AND acao = ANY(v_acoes);
    PERFORM fn_limpar_rota(v_rota);
    UPDATE taxidog_rota SET versao = versao + 1, ultima_alteracao = v_msg WHERE id_rota = v_rota;
    PERFORM fn_rota_verificar_fim(v_rota);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_corrida_rota ON taxidog_corrida;
CREATE TRIGGER trg_corrida_rota
  AFTER UPDATE OF status, modalidade ON taxidog_corrida
  FOR EACH ROW EXECUTE FUNCTION fn_trg_corrida_rota();

-- ============================================================
-- 7) Trocar o transporte de um agendamento já feito
-- ============================================================
-- Dono / equipe com agenda: sem TaxiDog (p_modalidade NULL) ↔ só busca
-- ↔ só entrega ↔ busca e entrega. Vale pra visita (mesmo pet, mesmo
-- dia). A taxa entra e sai do valor do agendamento; se a solicitação
-- estava numa rota, o trigger acima tira as paradas e a rota avisa o
-- TaxiDog.
-- Com o pet já na loja (TaxiDog buscou, ou o serviço já começou) só a
-- entrega ainda pode mudar: "busca e entrega" vira "só entrega" e "só
-- busca" vira "sem TaxiDog daqui pra frente". Uma busca já feita
-- continua cobrada.
CREATE OR REPLACE FUNCTION fn_alterar_transporte_agendamento(
  p_id_agendamento UUID,
  p_modalidade     TEXT,
  p_cep            TEXT DEFAULT NULL,
  p_logradouro     TEXT DEFAULT NULL,
  p_numero         TEXT DEFAULT NULL,
  p_complemento    TEXT DEFAULT NULL,
  p_bairro         TEXT DEFAULT NULL,
  p_cidade         TEXT DEFAULT NULL,
  p_uf             TEXT DEFAULT NULL,
  p_lat            DOUBLE PRECISION DEFAULT NULL,
  p_lng            DOUBLE PRECISION DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a       agendamento%ROWTYPE;
  v_c       taxidog_corrida%ROWTYPE;
  v_tem     BOOLEAN;
  v_pet     TEXT;
  v_desejo  TEXT := NULLIF(btrim(COALESCE(p_modalidade, '')), '');
  v_na_loja BOOLEAN;
  v_ok      BOOLEAN;
  v_valor   NUMERIC;
  v_alvo    UUID;
  v_id      UUID;
BEGIN
  IF v_desejo IS NOT NULL AND v_desejo NOT IN ('buscar', 'entregar', 'buscar_entregar') THEN
    RAISE EXCEPTION 'TaxiDog: tipo de transporte inválido.';
  END IF;

  SELECT * INTO v_a FROM agendamento WHERE id_agendamento = p_id_agendamento;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TaxiDog: agendamento não encontrado.';
  END IF;
  IF NOT fn_gestor_taxidog(v_a.id_lojista) THEN
    RAISE EXCEPTION 'TaxiDog: você não tem permissão para alterar este agendamento.';
  END IF;
  IF v_a.status = 'Cancelado' THEN
    RAISE EXCEPTION 'TaxiDog: este agendamento foi cancelado.';
  END IF;
  SELECT nome INTO v_pet FROM pet WHERE id_pet = v_a.id_pet;

  -- TaxiDog em aberto da visita — o deste agendamento primeiro.
  SELECT c.* INTO v_c
  FROM taxidog_corrida c
  JOIN agendamento a ON a.id_agendamento = c.id_agendamento
  WHERE a.id_pet = v_a.id_pet AND a.id_lojista = v_a.id_lojista AND a.dt_agendamento = v_a.dt_agendamento
    AND c.status NOT IN ('cancelada', 'concluida')
  ORDER BY (c.id_agendamento = p_id_agendamento) DESC, a.hr_agendamento
  LIMIT 1
  FOR UPDATE OF c;
  v_tem := FOUND;

  IF v_tem AND v_c.status IN ('pet_embarcado', 'a_caminho_entrega', 'no_endereco_entrega') THEN
    RAISE EXCEPTION 'TaxiDog: % está com o TaxiDog agora — altere depois que ele chegar.', v_pet;
  END IF;

  v_na_loja := v_a.status IN ('Em andamento', 'Concluído')
    OR (v_tem AND v_c.status IN ('entregue_loja', 'pronto_entrega'))
    OR EXISTS (
      SELECT 1 FROM taxidog_corrida c
      JOIN agendamento a ON a.id_agendamento = c.id_agendamento
      WHERE a.id_pet = v_a.id_pet AND a.id_lojista = v_a.id_lojista AND a.dt_agendamento = v_a.dt_agendamento
        AND c.status = 'concluida' AND c.modalidade = 'buscar'
    );
  IF v_na_loja AND v_desejo IN ('buscar', 'buscar_entregar') THEN
    v_desejo := CASE WHEN v_desejo = 'buscar_entregar' THEN 'entregar' END;
  END IF;

  -- Busca já feita: a corrida e a taxa da busca ficam; só a entrega muda.
  IF v_tem AND v_c.modalidade = 'buscar_entregar' AND v_c.status IN ('entregue_loja', 'pronto_entrega') THEN
    IF v_desejo = 'entregar' THEN
      RETURN 'Nada mudou — a entrega já está pedida.';
    END IF;
    SELECT q.disponivel, q.valor INTO v_ok, v_valor
    FROM fn_cotar_taxidog(v_c.id_lojista, 'buscar', v_c.bairro, v_c.cidade, v_c.uf, v_c.lat, v_c.lng, TRUE) q;
    v_valor := CASE WHEN COALESCE(v_ok, FALSE) THEN LEAST(v_valor, v_c.valor) ELSE v_c.valor END;
    UPDATE taxidog_corrida SET modalidade = 'buscar', status = 'concluida', valor = v_valor WHERE id_corrida = v_c.id_corrida;
    UPDATE agendamento SET valor = GREATEST(0, valor - (v_c.valor - v_valor)) WHERE id_agendamento = v_c.id_agendamento;
    PERFORM fn_registrar_evento_corrida(v_c.id_corrida, 'concluida', 'Entrega retirada pela loja — fica só a busca (já feita)');
    RETURN 'Entrega removida.';
  END IF;

  -- Nada feito ainda: troca inteira (cancela a atual e abre a nova).
  IF v_tem THEN
    IF v_desejo = v_c.modalidade
       AND regexp_replace(COALESCE(p_cep, ''), '\D', '', 'g') = v_c.cep
       AND btrim(COALESCE(p_numero, '')) = v_c.numero
       AND btrim(COALESCE(p_logradouro, '')) = v_c.logradouro THEN
      RETURN 'Nada mudou.';
    END IF;
    UPDATE taxidog_corrida SET status = 'cancelada' WHERE id_corrida = v_c.id_corrida;
    UPDATE agendamento SET valor = GREATEST(0, valor - v_c.valor) WHERE id_agendamento = v_c.id_agendamento;
    PERFORM fn_registrar_evento_corrida(
      v_c.id_corrida, 'cancelada',
      CASE WHEN v_desejo IS NULL THEN 'TaxiDog removido pela loja — taxa retirada do agendamento'
           ELSE 'Transporte alterado pela loja — substituído por um novo pedido' END
    );
  END IF;

  IF v_desejo IS NULL THEN
    RETURN CASE WHEN v_tem THEN 'TaxiDog removido.' ELSE 'Nada mudou.' END;
  END IF;

  v_alvo := CASE WHEN v_tem THEN v_c.id_agendamento ELSE p_id_agendamento END;
  v_id := fn_anexar_taxidog(v_alvo, v_desejo, p_cep, p_logradouro, p_numero, p_complemento, p_bairro, p_cidade, p_uf, p_lat, p_lng, NULL, TRUE);

  -- Entrega pedida com o serviço já terminado: já sai pronta pra rota.
  IF v_desejo = 'entregar' AND fn_visita_taxidog_concluida(v_alvo) THEN
    UPDATE taxidog_corrida SET status = 'pronto_entrega' WHERE id_corrida = v_id;
    PERFORM fn_registrar_evento_corrida(v_id, 'pronto_entrega', 'Serviço finalizado — pet pronto para entrega');
  END IF;

  RETURN CASE WHEN v_tem THEN 'Transporte alterado.' ELSE 'TaxiDog adicionado.' END;
END;
$$;

REVOKE ALL ON FUNCTION fn_alterar_transporte_agendamento(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_alterar_transporte_agendamento(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- Cancelar um TaxiDog direto (as telas usam
-- fn_alterar_transporte_agendamento): agora também pela equipe com
-- agenda, e nunca com o pet dentro do carro. A saída das rotas é feita
-- pelo trigger acima.
CREATE OR REPLACE FUNCTION fn_cancelar_corrida(p_id_corrida UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c taxidog_corrida%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;
  IF NOT fn_gestor_taxidog(v_c.id_lojista) THEN
    RAISE EXCEPTION 'Você não tem permissão para remover o TaxiDog';
  END IF;
  IF v_c.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Este TaxiDog já foi encerrado';
  END IF;
  IF v_c.status IN ('pet_embarcado', 'a_caminho_entrega', 'no_endereco_entrega') THEN
    RAISE EXCEPTION 'O pet está com o TaxiDog agora — conclua a parada antes de remover';
  END IF;

  UPDATE taxidog_corrida SET status = 'cancelada' WHERE id_corrida = p_id_corrida;
  UPDATE agendamento SET valor = GREATEST(0, valor - v_c.valor) WHERE id_agendamento = v_c.id_agendamento;

  PERFORM fn_registrar_evento_corrida(p_id_corrida, 'cancelada', 'TaxiDog removido pela loja — taxa retirada do agendamento');
END;
$$;

REVOKE ALL ON FUNCTION fn_cancelar_corrida(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cancelar_corrida(UUID) TO authenticated;

-- A 051 escolhia outro serviço "sem corrida"; agora corrida cancelada
-- não conta (pode existir uma antiga cancelada no mesmo agendamento).
CREATE OR REPLACE FUNCTION fn_trg_agendamento_taxidog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c     taxidog_corrida%ROWTYPE;
  v_outro UUID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'Cancelado' THEN
    FOR v_c IN
      SELECT * FROM taxidog_corrida
      WHERE id_agendamento = NEW.id_agendamento AND status NOT IN ('concluida', 'cancelada')
    LOOP
      SELECT a.id_agendamento INTO v_outro
      FROM agendamento a
      WHERE a.id_pet = NEW.id_pet AND a.id_lojista = NEW.id_lojista AND a.dt_agendamento = NEW.dt_agendamento
        AND a.id_agendamento <> NEW.id_agendamento
        AND a.status <> 'Cancelado'
        AND NOT EXISTS (SELECT 1 FROM taxidog_corrida c2 WHERE c2.id_agendamento = a.id_agendamento AND c2.status <> 'cancelada')
      ORDER BY a.hr_agendamento
      LIMIT 1;

      IF v_outro IS NOT NULL THEN
        UPDATE taxidog_corrida SET id_agendamento = v_outro WHERE id_corrida = v_c.id_corrida;
        UPDATE agendamento SET valor = valor + v_c.valor WHERE id_agendamento = v_outro;
        UPDATE agendamento SET valor = GREATEST(0, valor - v_c.valor) WHERE id_agendamento = NEW.id_agendamento;
        PERFORM fn_registrar_evento_corrida(
          v_c.id_corrida, v_c.status,
          'Um dos serviços foi cancelado — a corrida continua com os demais serviços do dia'
        );
      ELSE
        UPDATE taxidog_corrida SET status = 'cancelada' WHERE id_corrida = v_c.id_corrida;
        PERFORM fn_registrar_evento_corrida(v_c.id_corrida, 'cancelada', 'Agendamento cancelado — corrida cancelada');
      END IF;
    END LOOP;
  END IF;

  IF NEW.status IN ('Concluído', 'Cancelado') THEN
    FOR v_c IN
      SELECT c.* FROM taxidog_corrida c
      JOIN agendamento a ON a.id_agendamento = c.id_agendamento
      WHERE a.id_pet = NEW.id_pet AND a.id_lojista = NEW.id_lojista AND a.dt_agendamento = NEW.dt_agendamento
        AND c.modalidade IN ('entregar', 'buscar_entregar')
        AND c.status IN ('agendada', 'entregue_loja')
    LOOP
      IF fn_visita_taxidog_concluida(v_c.id_agendamento) THEN
        UPDATE taxidog_corrida SET status = 'pronto_entrega' WHERE id_corrida = v_c.id_corrida;
        PERFORM fn_registrar_evento_corrida(v_c.id_corrida, 'pronto_entrega', 'Serviço finalizado — pet pronto para entrega');
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 8) Leitura
-- ============================================================

-- Rotas com as paradas (e cada pet) num JSON só — o painel e o app
-- montam tudo a partir disto. Dono/equipe com agenda veem todas as rotas
-- da loja; o TaxiDog, só as dele.
CREATE OR REPLACE FUNCTION fn_listar_rotas(p_data_ini DATE, p_data_fim DATE, p_id_rota UUID DEFAULT NULL)
RETURNS TABLE (
  id_rota          UUID,
  numero           INTEGER,
  data             DATE,
  status           TEXT,
  id_funcionario   UUID,
  funcionario_nome TEXT,
  distancia_m      INTEGER,
  duracao_s        INTEGER,
  calculo_versao   INTEGER,
  versao           INTEGER,
  ultima_alteracao TEXT,
  iniciada_em      TIMESTAMPTZ,
  concluida_em     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ,
  paradas          JSONB
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

  RETURN QUERY
  SELECT
    r.id_rota, r.numero, r.data, r.status, r.id_funcionario, fu.nome,
    r.distancia_m, r.duracao_s, r.calculo_versao, r.versao, r.ultima_alteracao,
    r.iniciada_em, r.concluida_em, r.created_at,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id_parada', p.id_parada,
        'ordem', p.ordem,
        'local', p.local,
        'status', p.status,
        'chegou_em', p.chegou_em,
        'concluida_em', p.concluida_em,
        'itens', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id_item', i.id_item,
            'id_corrida', i.id_corrida,
            'acao', i.acao,
            'feito', i.feito,
            'pet_nome', pe.nome,
            'pet_raca', pe.raca,
            'pet_foto_url', pe.foto_url,
            'pet_obs', pe.obs,
            'pet_comportamento', pe.comportamento,
            'pet_obs_comportamento', pe.obs_comportamento,
            'cliente_nome', cl.nome,
            'cliente_telefone', cl.telefone,
            'cep', c.cep, 'logradouro', c.logradouro, 'numero', c.numero, 'complemento', c.complemento,
            'bairro', c.bairro, 'cidade', c.cidade, 'uf', c.uf, 'lat', c.lat, 'lng', c.lng,
            'modalidade', c.modalidade,
            'status_corrida', c.status,
            'valor', c.valor,
            'hr_agendamento', a.hr_agendamento,
            'status_agendamento', a.status,
            'obs_agendamento', a.obs
          ) ORDER BY pe.nome), '[]'::jsonb)
          FROM taxidog_parada_item i
          JOIN taxidog_corrida c ON c.id_corrida = i.id_corrida
          JOIN agendamento a ON a.id_agendamento = c.id_agendamento
          JOIN pet pe ON pe.id_pet = c.id_pet
          JOIN cliente cl ON cl.id_cliente = c.id_cliente
          WHERE i.id_parada = p.id_parada
        )
      ) ORDER BY p.ordem), '[]'::jsonb)
      FROM taxidog_parada p
      WHERE p.id_rota = r.id_rota
    )
  FROM taxidog_rota r
  LEFT JOIN funcionario fu ON fu.id_funcionario = r.id_funcionario
  WHERE r.id_lojista = v_lojista
    AND (v_gestor OR r.id_funcionario = auth.uid())
    AND (
      (p_id_rota IS NOT NULL AND r.id_rota = p_id_rota)
      OR (p_id_rota IS NULL AND r.data BETWEEN p_data_ini AND p_data_fim)
    )
  ORDER BY r.data, r.numero;
END;
$$;

REVOKE ALL ON FUNCTION fn_listar_rotas(DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_listar_rotas(DATE, DATE, UUID) TO authenticated;

-- Trechos ainda fora de rota ("Solicitações pendentes") de um dia.
-- hr_fim_visita = quando o último serviço daquele pet no dia termina —
-- referência de horário pra entrega.
CREATE OR REPLACE FUNCTION fn_trechos_pendentes(p_data DATE)
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
  cliente_telefone   TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_lojista UUID := auth_lojista_id();
BEGIN
  IF v_lojista IS NULL OR NOT fn_gestor_taxidog(v_lojista) THEN
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
    pe.nome, pe.foto_url, cl.nome, cl.telefone
  FROM taxidog_corrida c
  JOIN agendamento a ON a.id_agendamento = c.id_agendamento
  JOIN pet pe ON pe.id_pet = c.id_pet
  JOIN cliente cl ON cl.id_cliente = c.id_cliente
  CROSS JOIN LATERAL (VALUES ('busca'), ('entrega')) AS t(trecho)
  WHERE c.id_lojista = v_lojista
    AND a.dt_agendamento = p_data
    AND a.status <> 'Cancelado'
    AND c.status <> 'cancelada'
    AND (
      (t.trecho = 'busca'
        AND c.modalidade IN ('buscar', 'buscar_entregar')
        AND c.status IN ('agendada', 'a_caminho_cliente')
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
-- 10) Fim da execução corrida a corrida
-- ============================================================
-- Com rotas, quem anda a corrida são as paradas (fn_iniciar_rota,
-- fn_chegar_parada, fn_concluir_parada) e quem escolhe o TaxiDog é a rota
-- (fn_atribuir_rota). As funções antigas deixariam uma corrida andar por
-- fora da rota (e o TaxiDog se atribuir sozinho), então saem do alcance
-- dos usuários. As funções continuam existindo pra histórico.
REVOKE EXECUTE ON FUNCTION fn_avancar_corrida(UUID, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_assumir_corrida(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_atribuir_corrida(UUID, UUID) FROM anon, authenticated;
