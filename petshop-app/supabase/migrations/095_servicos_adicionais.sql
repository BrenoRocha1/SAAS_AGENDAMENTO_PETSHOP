-- ============================================================
-- PETSHOP SaaS - Migration 095: serviços adicionais (subserviços)
-- ============================================================
-- A loja cadastra cobranças extras ("Taxa por pelo embolado", "Taxa por
-- dificuldade de manejo", "Hidratação adicional"...) que entram em um
-- atendimento de dois jeitos:
--   • o cliente escolhe ao agendar online (se a loja deixar);
--   • a loja ou um funcionário com a permissão da agenda inclui durante o
--     atendimento.
--
-- Modelagem (no mesmo molde dos produtos do agendamento, migration 039):
--
-- • `servico_adicional` é o catálogo da loja: nome, descrição, preço,
--   ativo/inativo, se aparece no agendamento online e se pode ser incluído
--   no atendimento. Excluir um adicional que já foi cobrado só o arquiva
--   (`excluido_em`), como serviço (081) e produto (087).
--
-- • `servico_adicional_servico` diz para quais serviços principais o
--   adicional vale. SEM nenhuma linha = vale para todos os serviços da
--   loja; com linhas = só para aqueles.
--
-- • `agendamento_adicional` é o que foi cobrado em cada agendamento. Nome,
--   descrição e preço são uma FOTO do momento da inclusão: mudar o preço
--   no catálogo depois não mexe em atendimento nenhum. Guarda a origem
--   (cliente no agendamento online, funcionário ou responsável pela loja),
--   quem incluiu e quando. Remover não apaga a linha: ela fica 'removido',
--   com quem removeu, quando e o motivo. Um mesmo adicional não fica ativo
--   duas vezes no mesmo agendamento (índice único) — clique repetido ou
--   reenvio não duplica a cobrança.
--
-- • O valor do adicional entra em `agendamento.valor`, como já acontece
--   com produto e TaxiDog: relatórios, dashboard e pagamento somam `valor`
--   e passam a contar o adicional sem nenhuma consulta nova. Sempre por
--   diferença (valor = valor ± adicional).
--
-- • Duas funções que já existem separam "o serviço" do resto do valor
--   fazendo valor − produtos − TaxiDog: fn_usar_beneficio (o plano abate
--   só o serviço) e fn_editar_agendamento (recalcula o valor ao trocar
--   serviço/pet). Sem ajuste, o plano abateria também o adicional e a
--   troca de serviço o apagaria do valor. Em vez de copiar essas funções
--   para cá (o banco em uso nem sempre é igual aos arquivos do
--   repositório), o bloco 6 lê a definição que ESTÁ no banco e acrescenta
--   uma linha logo depois de cada soma da taxa do TaxiDog:
--       v_tx := v_tx + fn_total_adicionais_agendamento(<agendamento>);
--   Se o trecho esperado não existir, a migration para com erro e nada é
--   alterado (roda tudo numa transação só).
--
-- • Pagamento: se o pedido já está marcado como pago, incluir ou remover
--   um adicional é recusado — a menos que quem está fazendo confirme, e aí
--   o pagamento do pedido volta para "pendente" (nada muda calado). A
--   forma 'plano' (082) sai sozinha quando aparece algo a pagar: o gatilho
--   de lá já confere o pedido a cada mudança de valor.
--
-- • Quem pode: catálogo = responsável, administrador ou funcionário com
--   "gerenciar serviços"; incluir/remover no atendimento = responsável,
--   administrador ou funcionário com "gerenciar agenda" (a mesma regra de
--   pagamento, remarcar e editar — fn_agenda_da_loja). Tudo conferido aqui
--   no banco; nenhuma tabela nova aceita INSERT/UPDATE/DELETE direto.
--
-- Nenhum dado existente muda. Pode rodar mais de uma vez.
-- ============================================================

-- ============================================================
-- 1) Catálogo da loja
-- ============================================================
CREATE TABLE IF NOT EXISTS servico_adicional (
  id_adicional            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_lojista              UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  nome                    TEXT NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 100),
  descricao               TEXT CHECK (char_length(descricao) <= 500),
  preco                   NUMERIC(10,2) NOT NULL CHECK (preco > 0),
  status                  status_servico NOT NULL DEFAULT 'Ativo',
  disponivel_online       BOOLEAN NOT NULL DEFAULT TRUE,
  disponivel_atendimento  BOOLEAN NOT NULL DEFAULT TRUE,
  excluido_em             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_servico_adicional_lojista ON servico_adicional(id_lojista) WHERE excluido_em IS NULL;

DROP TRIGGER IF EXISTS trg_servico_adicional_updated_at ON servico_adicional;
CREATE TRIGGER trg_servico_adicional_updated_at
  BEFORE UPDATE ON servico_adicional
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Para quais serviços principais o adicional vale (nenhuma linha = todos).
CREATE TABLE IF NOT EXISTS servico_adicional_servico (
  id_adicional  UUID NOT NULL REFERENCES servico_adicional(id_adicional) ON DELETE CASCADE,
  id_servico    UUID NOT NULL REFERENCES servico(id_servico) ON DELETE CASCADE,
  id_lojista    UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  PRIMARY KEY (id_adicional, id_servico)
);
CREATE INDEX IF NOT EXISTS idx_servico_adicional_servico_servico ON servico_adicional_servico(id_servico);

-- ============================================================
-- 2) O que foi cobrado em cada agendamento
-- ============================================================
CREATE TABLE IF NOT EXISTS agendamento_adicional (
  id_agendamento_adicional UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_agendamento    UUID NOT NULL REFERENCES agendamento(id_agendamento) ON DELETE CASCADE,
  -- O cadastro de onde veio (some se o adicional for apagado de vez).
  id_adicional      UUID REFERENCES servico_adicional(id_adicional) ON DELETE SET NULL,
  -- Denormalizados, como em agendamento_produto: RLS direta, sem JOIN.
  id_lojista        UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  id_cliente        UUID REFERENCES cliente(id_cliente) ON DELETE SET NULL,
  -- Foto do momento da inclusão.
  nome              TEXT NOT NULL,
  descricao         TEXT,
  preco_unitario    NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
  quantidade        INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_total       NUMERIC(10,2) GENERATED ALWAYS AS (preco_unitario * quantidade) STORED,
  -- Motivo/justificativa de quem incluiu ("pelo com nós na barriga").
  observacao        TEXT CHECK (char_length(observacao) <= 500),
  origem            TEXT NOT NULL CHECK (origem IN ('cliente_online', 'funcionario', 'lojista')),
  id_usuario        UUID,
  -- Nome do funcionário que incluiu (vazio para cliente e responsável).
  nome_usuario      TEXT,
  status            TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'removido')),
  removido_em       TIMESTAMPTZ,
  removido_por      UUID,
  nome_removido_por TEXT,
  motivo_remocao    TEXT CHECK (char_length(motivo_remocao) <= 500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agendamento_adicional_agendamento ON agendamento_adicional(id_agendamento);
CREATE INDEX IF NOT EXISTS idx_agendamento_adicional_lojista ON agendamento_adicional(id_lojista, created_at DESC);
-- O mesmo adicional não fica ativo duas vezes no mesmo agendamento.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamento_adicional_unico
  ON agendamento_adicional(id_agendamento, id_adicional) WHERE status = 'ativo';

-- ============================================================
-- 3) RLS — leitura por papel; escrita só pelas funções abaixo
-- ============================================================
ALTER TABLE servico_adicional          ENABLE ROW LEVEL SECURITY;
ALTER TABLE servico_adicional          FORCE ROW LEVEL SECURITY;
ALTER TABLE servico_adicional_servico  ENABLE ROW LEVEL SECURITY;
ALTER TABLE servico_adicional_servico  FORCE ROW LEVEL SECURITY;
ALTER TABLE agendamento_adicional      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento_adicional      FORCE ROW LEVEL SECURITY;

-- Quem agenda (com ou sem login) vê só o que a loja liberou para o
-- agendamento online — mesmo formato da policy de produto (039).
DROP POLICY IF EXISTS "servico_adicional: publico ve disponiveis online" ON servico_adicional;
CREATE POLICY "servico_adicional: publico ve disponiveis online"
  ON servico_adicional FOR SELECT
  USING (status = 'Ativo' AND excluido_em IS NULL AND disponivel_online = TRUE);

DROP POLICY IF EXISTS "servico_adicional: lojista ve os seus" ON servico_adicional;
CREATE POLICY "servico_adicional: lojista ve os seus"
  ON servico_adicional FOR SELECT
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista');

DROP POLICY IF EXISTS "servico_adicional: funcionario ve da loja" ON servico_adicional;
CREATE POLICY "servico_adicional: funcionario ve da loja"
  ON servico_adicional FOR SELECT
  USING (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id());

-- O vínculo aparece para quem enxerga o adicional (a subconsulta passa
-- pelas policies de servico_adicional de quem está lendo).
DROP POLICY IF EXISTS "servico_adicional_servico: quem ve o adicional" ON servico_adicional_servico;
CREATE POLICY "servico_adicional_servico: quem ve o adicional"
  ON servico_adicional_servico FOR SELECT
  USING (EXISTS (SELECT 1 FROM servico_adicional a WHERE a.id_adicional = servico_adicional_servico.id_adicional));

DROP POLICY IF EXISTS "agendamento_adicional: cliente ve proprios" ON agendamento_adicional;
CREATE POLICY "agendamento_adicional: cliente ve proprios"
  ON agendamento_adicional FOR SELECT
  USING (id_cliente = auth.uid());

DROP POLICY IF EXISTS "agendamento_adicional: lojista ve da loja" ON agendamento_adicional;
CREATE POLICY "agendamento_adicional: lojista ve da loja"
  ON agendamento_adicional FOR SELECT
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista');

DROP POLICY IF EXISTS "agendamento_adicional: funcionario ve da loja" ON agendamento_adicional;
CREATE POLICY "agendamento_adicional: funcionario ve da loja"
  ON agendamento_adicional FOR SELECT
  USING (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id());

-- Leitura para quem agenda e para a loja; escrita direta para ninguém (só
-- as funções desta migration escrevem, e o servidor com a chave de serviço).
REVOKE ALL ON servico_adicional, servico_adicional_servico, agendamento_adicional FROM PUBLIC, anon, authenticated;
GRANT SELECT ON servico_adicional, servico_adicional_servico TO anon, authenticated;
GRANT SELECT ON agendamento_adicional TO authenticated;
GRANT ALL ON servico_adicional, servico_adicional_servico, agendamento_adicional TO service_role;

-- Auditoria, no mesmo formato de agendamento e avaliação.
CREATE OR REPLACE FUNCTION fn_audit_agendamento_adicional()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tabela, operacao, id_registro, id_usuario, dados_depois)
    VALUES ('agendamento_adicional', 'INSERT', NEW.id_agendamento_adicional, auth.uid(), to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (tabela, operacao, id_registro, id_usuario, dados_antes, dados_depois)
    VALUES ('agendamento_adicional', 'UPDATE', NEW.id_agendamento_adicional, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (tabela, operacao, id_registro, id_usuario, dados_antes)
    VALUES ('agendamento_adicional', 'DELETE', OLD.id_agendamento_adicional, auth.uid(), to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_agendamento_adicional ON agendamento_adicional;
CREATE TRIGGER trg_audit_agendamento_adicional
  AFTER INSERT OR UPDATE OR DELETE ON agendamento_adicional
  FOR EACH ROW EXECUTE FUNCTION fn_audit_agendamento_adicional();

-- LGPD: quando o cliente exclui a conta, o agendamento fica com a loja sem
-- o cliente (072/086); a justificativa em texto livre some junto.
CREATE OR REPLACE FUNCTION fn_trg_cliente_excluido_adicionais()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agendamento_adicional SET observacao = NULL
  WHERE id_cliente = OLD.id_cliente AND observacao IS NOT NULL;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cliente_excluido_adicionais ON cliente;
CREATE TRIGGER trg_cliente_excluido_adicionais
  BEFORE DELETE ON cliente
  FOR EACH ROW EXECUTE FUNCTION fn_trg_cliente_excluido_adicionais();

-- ============================================================
-- 4) Apoio
-- ============================================================
-- Quem cuida do catálogo de serviços da loja.
CREATE OR REPLACE FUNCTION fn_servicos_da_loja(p_id_lojista UUID)
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
        AND ativo = TRUE AND (acesso_total OR pode_gerenciar_servicos)
    )
  )
$$;

-- Soma do que está ativo no agendamento (o que entra em agendamento.valor).
CREATE OR REPLACE FUNCTION fn_total_adicionais_agendamento(p_id_agendamento UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(valor_total), 0)
  FROM agendamento_adicional
  WHERE id_agendamento = p_id_agendamento AND status = 'ativo'
$$;

-- Sem vínculo nenhum o adicional vale para todo serviço; com vínculo, só
-- para os serviços marcados.
CREATE OR REPLACE FUNCTION fn_adicional_compativel(p_id_adicional UUID, p_id_servico UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM servico_adicional_servico WHERE id_adicional = p_id_adicional)
      OR EXISTS (SELECT 1 FROM servico_adicional_servico WHERE id_adicional = p_id_adicional AND id_servico = p_id_servico)
$$;

-- As duas últimas só são chamadas de dentro das funções desta migration (e
-- das duas ajustadas no bloco 6), que rodam como dono.
REVOKE ALL ON FUNCTION fn_servicos_da_loja(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_total_adicionais_agendamento(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_adicional_compativel(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_servicos_da_loja(UUID) TO authenticated;

-- ============================================================
-- 5) Catálogo: criar/editar, ativar/desativar, excluir
-- ============================================================
-- p_id_adicional NULL = criar. p_servicos vazio ou NULL = vale para todos.
CREATE OR REPLACE FUNCTION fn_salvar_servico_adicional(
  p_id_adicional           UUID,
  p_nome                   TEXT,
  p_descricao              TEXT,
  p_preco                  NUMERIC,
  p_disponivel_online      BOOLEAN,
  p_disponivel_atendimento BOOLEAN,
  p_servicos               UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lojista  UUID := auth_lojista_id();
  v_id       UUID;
  v_nome     TEXT := btrim(COALESCE(p_nome, ''));
  v_desc     TEXT := NULLIF(btrim(COALESCE(p_descricao, '')), '');
  v_servicos UUID[];
BEGIN
  IF v_lojista IS NULL OR NOT fn_servicos_da_loja(v_lojista) THEN
    RAISE EXCEPTION 'Adicional: você não tem permissão para gerenciar serviços';
  END IF;
  IF char_length(v_nome) < 2 OR char_length(v_nome) > 100 THEN
    RAISE EXCEPTION 'Adicional: o nome precisa ter entre 2 e 100 caracteres';
  END IF;
  IF v_desc IS NOT NULL AND char_length(v_desc) > 500 THEN
    RAISE EXCEPTION 'Adicional: a descrição passa de 500 caracteres';
  END IF;
  IF p_preco IS NULL OR p_preco <= 0 OR p_preco > 99999.99 THEN
    RAISE EXCEPTION 'Adicional: informe um preço maior que zero';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_servicos FROM unnest(COALESCE(p_servicos, '{}')) AS x WHERE x IS NOT NULL;
  IF EXISTS (
    SELECT 1 FROM unnest(v_servicos) AS x
    WHERE NOT EXISTS (SELECT 1 FROM servico s WHERE s.id_servico = x AND s.id_lojista = v_lojista AND s.excluido_em IS NULL)
  ) THEN
    RAISE EXCEPTION 'Adicional: um dos serviços escolhidos não é desta loja';
  END IF;

  IF p_id_adicional IS NULL THEN
    INSERT INTO servico_adicional (id_lojista, nome, descricao, preco, disponivel_online, disponivel_atendimento)
    VALUES (v_lojista, v_nome, v_desc, round(p_preco, 2), COALESCE(p_disponivel_online, TRUE), COALESCE(p_disponivel_atendimento, TRUE))
    RETURNING id_adicional INTO v_id;
  ELSE
    UPDATE servico_adicional
    SET nome = v_nome, descricao = v_desc, preco = round(p_preco, 2),
        disponivel_online = COALESCE(p_disponivel_online, disponivel_online),
        disponivel_atendimento = COALESCE(p_disponivel_atendimento, disponivel_atendimento)
    WHERE id_adicional = p_id_adicional AND id_lojista = v_lojista AND excluido_em IS NULL
    RETURNING id_adicional INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Adicional: serviço adicional não encontrado';
    END IF;
  END IF;

  DELETE FROM servico_adicional_servico WHERE id_adicional = v_id AND NOT (id_servico = ANY (v_servicos));
  INSERT INTO servico_adicional_servico (id_adicional, id_servico, id_lojista)
  SELECT v_id, x, v_lojista FROM unnest(v_servicos) AS x
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_status_servico_adicional(p_id_adicional UUID, p_ativo BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lojista UUID := auth_lojista_id();
BEGIN
  IF v_lojista IS NULL OR NOT fn_servicos_da_loja(v_lojista) THEN
    RAISE EXCEPTION 'Adicional: você não tem permissão para gerenciar serviços';
  END IF;
  UPDATE servico_adicional
  SET status = CASE WHEN COALESCE(p_ativo, FALSE) THEN 'Ativo' ELSE 'Inativo' END::status_servico
  WHERE id_adicional = p_id_adicional AND id_lojista = v_lojista AND excluido_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adicional: serviço adicional não encontrado';
  END IF;
END;
$$;

-- Excluir é do responsável ou de um administrador (como serviço). Sem
-- nenhuma cobrança ligada, apaga de vez; com histórico, só arquiva.
CREATE OR REPLACE FUNCTION fn_excluir_servico_adicional(p_id_adicional UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lojista UUID := auth_lojista_id();
BEGIN
  IF v_lojista IS NULL OR NOT (
    auth.uid() = v_lojista
    OR EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND id_lojista = v_lojista AND ativo = TRUE AND acesso_total)
  ) THEN
    RAISE EXCEPTION 'Adicional: só o responsável pela loja ou um administrador pode excluir';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM servico_adicional WHERE id_adicional = p_id_adicional AND id_lojista = v_lojista AND excluido_em IS NULL) THEN
    RAISE EXCEPTION 'Adicional: serviço adicional não encontrado';
  END IF;

  IF EXISTS (SELECT 1 FROM agendamento_adicional WHERE id_adicional = p_id_adicional) THEN
    UPDATE servico_adicional SET status = 'Inativo', excluido_em = NOW()
    WHERE id_adicional = p_id_adicional AND id_lojista = v_lojista;
    RETURN 'arquivado';
  END IF;
  DELETE FROM servico_adicional WHERE id_adicional = p_id_adicional AND id_lojista = v_lojista;
  RETURN 'apagado';
END;
$$;

REVOKE ALL ON FUNCTION fn_salvar_servico_adicional(UUID, TEXT, TEXT, NUMERIC, BOOLEAN, BOOLEAN, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_status_servico_adicional(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_excluir_servico_adicional(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_salvar_servico_adicional(UUID, TEXT, TEXT, NUMERIC, BOOLEAN, BOOLEAN, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_status_servico_adicional(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_excluir_servico_adicional(UUID) TO authenticated;

-- ============================================================
-- 6) fn_usar_beneficio e fn_editar_agendamento passam a conhecer o
--    adicional (ver o cabeçalho). Altera a definição que está no banco.
-- ============================================================
DO $$
DECLARE
  r      RECORD;
  v_def  TEXT;
  v_novo TEXT;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN ('fn_usar_beneficio', 'fn_editar_agendamento')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    CONTINUE WHEN position('fn_total_adicionais_agendamento' IN v_def) > 0;  -- já ajustada
    v_novo := regexp_replace(
      v_def,
      '(INTO\s+v_tx\s+FROM\s+taxidog_corrida\s+WHERE\s+id_agendamento\s*=\s*([A-Za-z_\.]+)\s+AND\s+status\s*<>\s*''cancelada''\s*;)',
      E'\\1\n  v_tx := v_tx + fn_total_adicionais_agendamento(\\2);',
      'g'
    );
    IF v_novo = v_def THEN
      RAISE EXCEPTION 'Migration 095: não encontrei em % o trecho que soma a taxa do TaxiDog (v_tx). Nada foi alterado — o banco está diferente do esperado, avise antes de seguir.', r.proname;
    END IF;
    EXECUTE v_novo;
  END LOOP;
END $$;

-- ============================================================
-- 7) No atendimento: a loja inclui e remove
-- ============================================================
CREATE OR REPLACE FUNCTION fn_adicionar_adicional_agendamento(
  p_id_agendamento    UUID,
  p_id_adicional      UUID,
  p_observacao        TEXT DEFAULT NULL,
  p_reabrir_pagamento BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag      agendamento%ROWTYPE;
  v_ad      servico_adicional%ROWTYPE;
  v_obs     TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_origem  TEXT;
  v_nome    TEXT;
  v_id      UUID;
  v_reabriu BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento FOR UPDATE;
  IF NOT FOUND OR NOT fn_agenda_da_loja(v_ag.id_lojista) THEN
    RAISE EXCEPTION 'Adicional: você não tem permissão para incluir cobranças neste agendamento';
  END IF;
  IF v_ag.status NOT IN ('Pendente', 'Confirmado', 'Em andamento') THEN
    RAISE EXCEPTION 'Adicional: este atendimento já foi finalizado ou cancelado — não dá para incluir cobrança';
  END IF;
  IF v_obs IS NOT NULL AND char_length(v_obs) > 500 THEN
    RAISE EXCEPTION 'Adicional: a observação passa de 500 caracteres';
  END IF;

  SELECT * INTO v_ad FROM servico_adicional
  WHERE id_adicional = p_id_adicional AND id_lojista = v_ag.id_lojista AND excluido_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adicional: serviço adicional não encontrado';
  END IF;
  IF v_ad.status <> 'Ativo' OR NOT v_ad.disponivel_atendimento THEN
    RAISE EXCEPTION 'Adicional: % não está disponível para inclusão no atendimento', v_ad.nome;
  END IF;
  IF NOT fn_adicional_compativel(v_ad.id_adicional, v_ag.id_servico) THEN
    RAISE EXCEPTION 'Adicional: % não vale para o serviço deste agendamento', v_ad.nome;
  END IF;
  IF EXISTS (
    SELECT 1 FROM agendamento_adicional
    WHERE id_agendamento = v_ag.id_agendamento AND id_adicional = v_ad.id_adicional AND status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'Adicional: % já está neste atendimento', v_ad.nome;
  END IF;

  -- Pedido já pago: só segue com a confirmação de quem está incluindo, e o
  -- pagamento do pedido volta para pendente (o critério de pedido é o de
  -- fn_atualizar_pagamento).
  IF v_ag.status_pagamento = 'pago' THEN
    IF NOT COALESCE(p_reabrir_pagamento, FALSE) THEN
      RAISE EXCEPTION 'Adicional: este atendimento já está marcado como pago — confirme para voltar o pagamento para pendente e incluir a cobrança';
    END IF;
    UPDATE agendamento a SET status_pagamento = 'pendente', pago_em = NULL
    WHERE a.id_lojista = v_ag.id_lojista AND a.id_pet IS NOT DISTINCT FROM v_ag.id_pet
      AND a.dt_agendamento = v_ag.dt_agendamento AND a.created_at = v_ag.created_at
      AND a.status <> 'Cancelado' AND a.status_pagamento = 'pago';
    v_reabriu := TRUE;
  END IF;

  IF auth.uid() = v_ag.id_lojista THEN
    v_origem := 'lojista';
  ELSE
    v_origem := 'funcionario';
    SELECT nome INTO v_nome FROM funcionario WHERE id_funcionario = auth.uid();
  END IF;

  INSERT INTO agendamento_adicional (id_agendamento, id_adicional, id_lojista, id_cliente, nome, descricao, preco_unitario, observacao, origem, id_usuario, nome_usuario)
  VALUES (v_ag.id_agendamento, v_ad.id_adicional, v_ag.id_lojista, v_ag.id_cliente, v_ad.nome, v_ad.descricao, v_ad.preco, v_obs, v_origem, auth.uid(), v_nome)
  RETURNING id_agendamento_adicional INTO v_id;

  UPDATE agendamento SET valor = valor + v_ad.preco WHERE id_agendamento = v_ag.id_agendamento;

  RETURN jsonb_build_object(
    'id', v_id,
    'nome', v_ad.nome,
    'preco', v_ad.preco,
    'valor_anterior', v_ag.valor,
    'valor_novo', v_ag.valor + v_ad.preco,
    'pagamento_reaberto', v_reabriu
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_remover_adicional_agendamento(
  p_id_agendamento_adicional UUID,
  p_motivo                   TEXT DEFAULT NULL,
  p_reabrir_pagamento        BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item    agendamento_adicional%ROWTYPE;
  v_ag      agendamento%ROWTYPE;
  v_motivo  TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_nome    TEXT;
  v_novo    NUMERIC;
  v_reabriu BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_item FROM agendamento_adicional WHERE id_agendamento_adicional = p_id_agendamento_adicional;
  IF NOT FOUND OR NOT fn_agenda_da_loja(v_item.id_lojista) THEN
    RAISE EXCEPTION 'Adicional: você não tem permissão para remover esta cobrança';
  END IF;
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = v_item.id_agendamento FOR UPDATE;
  -- Relê depois da trava (dois cliques ao mesmo tempo).
  SELECT * INTO v_item FROM agendamento_adicional WHERE id_agendamento_adicional = p_id_agendamento_adicional FOR UPDATE;
  IF v_item.status <> 'ativo' THEN
    RAISE EXCEPTION 'Adicional: esta cobrança já foi removida';
  END IF;
  IF v_ag.status NOT IN ('Pendente', 'Confirmado', 'Em andamento') THEN
    RAISE EXCEPTION 'Adicional: este atendimento já foi finalizado ou cancelado — não dá para remover a cobrança';
  END IF;
  IF v_motivo IS NOT NULL AND char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'Adicional: o motivo passa de 500 caracteres';
  END IF;

  IF v_ag.status_pagamento = 'pago' THEN
    IF NOT COALESCE(p_reabrir_pagamento, FALSE) THEN
      RAISE EXCEPTION 'Adicional: este atendimento já está marcado como pago — confirme para voltar o pagamento para pendente e remover a cobrança';
    END IF;
    UPDATE agendamento a SET status_pagamento = 'pendente', pago_em = NULL
    WHERE a.id_lojista = v_ag.id_lojista AND a.id_pet IS NOT DISTINCT FROM v_ag.id_pet
      AND a.dt_agendamento = v_ag.dt_agendamento AND a.created_at = v_ag.created_at
      AND a.status <> 'Cancelado' AND a.status_pagamento = 'pago';
    v_reabriu := TRUE;
  END IF;

  IF auth.uid() <> v_ag.id_lojista THEN
    SELECT nome INTO v_nome FROM funcionario WHERE id_funcionario = auth.uid();
  END IF;

  UPDATE agendamento_adicional
  SET status = 'removido', removido_em = NOW(), removido_por = auth.uid(), nome_removido_por = v_nome, motivo_remocao = v_motivo
  WHERE id_agendamento_adicional = v_item.id_agendamento_adicional;

  v_novo := GREATEST(0, v_ag.valor - v_item.valor_total);
  UPDATE agendamento SET valor = v_novo WHERE id_agendamento = v_ag.id_agendamento;

  RETURN jsonb_build_object(
    'nome', v_item.nome,
    'valor_anterior', v_ag.valor,
    'valor_novo', v_novo,
    'pagamento_reaberto', v_reabriu
  );
END;
$$;

-- ============================================================
-- 8) No agendamento online: o cliente escolhe
-- ============================================================
-- Chamada logo depois de criar o pedido (como o uso do plano, 075), com os
-- agendamentos que acabaram de nascer e os pares serviço/adicional
-- escolhidos: [{"id_servico": "...", "id_adicional": "..."}]. Vale só para
-- agendamento do próprio cliente e ainda pendente; o preço é o do cadastro
-- nesta hora (o que veio da tela não é usado).
CREATE OR REPLACE FUNCTION fn_adicionais_do_cliente_no_pedido(p_ids_agendamento UUID[], p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_item   RECORD;
  v_ag     agendamento%ROWTYPE;
  v_ad     servico_adicional%ROWTYPE;
  v_total  NUMERIC := 0;
  v_qtd    INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Adicional: entre na sua conta para agendar';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('total', 0, 'itens', 0);
  END IF;
  IF jsonb_array_length(p_itens) > 40 THEN
    RAISE EXCEPTION 'Adicional: adicionais demais num pedido só';
  END IF;

  FOR v_item IN
    SELECT DISTINCT (x ->> 'id_servico')::UUID AS id_servico, (x ->> 'id_adicional')::UUID AS id_adicional
    FROM jsonb_array_elements(p_itens) AS x
  LOOP
    SELECT * INTO v_ag FROM agendamento
    WHERE id_agendamento = ANY (p_ids_agendamento) AND id_servico = v_item.id_servico AND id_cliente = v_uid
    ORDER BY hr_agendamento
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Adicional: agendamento não encontrado';
    END IF;
    IF v_ag.status <> 'Pendente' THEN
      RAISE EXCEPTION 'Adicional: a loja já aceitou este agendamento — para incluir um adicional, fale com a loja';
    END IF;

    SELECT * INTO v_ad FROM servico_adicional
    WHERE id_adicional = v_item.id_adicional AND id_lojista = v_ag.id_lojista
      AND status = 'Ativo' AND excluido_em IS NULL AND disponivel_online = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Adicional: um dos adicionais escolhidos não está mais disponível';
    END IF;
    IF NOT fn_adicional_compativel(v_ad.id_adicional, v_ag.id_servico) THEN
      RAISE EXCEPTION 'Adicional: % não vale para o serviço escolhido', v_ad.nome;
    END IF;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM agendamento_adicional
      WHERE id_agendamento = v_ag.id_agendamento AND id_adicional = v_ad.id_adicional AND status = 'ativo'
    );

    INSERT INTO agendamento_adicional (id_agendamento, id_adicional, id_lojista, id_cliente, nome, descricao, preco_unitario, origem, id_usuario)
    VALUES (v_ag.id_agendamento, v_ad.id_adicional, v_ag.id_lojista, v_uid, v_ad.nome, v_ad.descricao, v_ad.preco, 'cliente_online', v_uid);
    UPDATE agendamento SET valor = valor + v_ad.preco WHERE id_agendamento = v_ag.id_agendamento;

    v_total := v_total + v_ad.preco;
    v_qtd := v_qtd + 1;
  END LOOP;

  RETURN jsonb_build_object('total', v_total, 'itens', v_qtd);
END;
$$;

REVOKE ALL ON FUNCTION fn_adicionar_adicional_agendamento(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_remover_adicional_agendamento(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_adicionais_do_cliente_no_pedido(UUID[], JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_adicionar_adicional_agendamento(UUID, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_remover_adicional_agendamento(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_adicionais_do_cliente_no_pedido(UUID[], JSONB) TO authenticated;

-- Avisa a API (PostgREST) das tabelas e funções novas.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Conferência: o que ficou no banco.
-- ============================================================
SELECT 'tabela ' || c.relname AS item,
       CASE WHEN c.relrowsecurity THEN 'criada, com RLS' ELSE 'criada, SEM RLS' END AS situacao
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('servico_adicional', 'servico_adicional_servico', 'agendamento_adicional')
UNION ALL
SELECT 'função ' || p.proname,
       CASE WHEN position('fn_total_adicionais_agendamento' IN pg_get_functiondef(p.oid)) > 0
            THEN 'já desconta os adicionais' ELSE 'NÃO ajustada' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('fn_usar_beneficio', 'fn_editar_agendamento')
ORDER BY 1;
