-- ============================================================
-- PETSHOP SaaS - Migration 060: planos e cobranças recorrentes
-- ============================================================
-- • A loja cria PLANOS (valor + período + serviços já cadastrados, com a
--   quantidade de usos de cada um por período).
-- • Um plano é ASSINADO para um pet (e o cliente dele). A assinatura guarda
--   uma foto do valor e do período: mudar o plano depois não muda o preço
--   de quem já assinou.
-- • Cada PERÍODO da assinatura copia os benefícios do plano naquele
--   momento (histórico não muda) e gera uma COBRANÇA (vencimento = início
--   do período, cobrança antecipada).
-- • Um serviço feito para o pet pode USAR um benefício do período que
--   cobre a data do agendamento: o valor do serviço sai do agendamento (a
--   receita vem da cobrança do plano, sem contar duas vezes).
-- • Renovação: não há rotina agendada — as telas chamam
--   fn_atualizar_assinaturas, que cria os períodos que faltam até hoje
--   (idempotente). Assinatura cancelada não gera mais nada.
-- • "Vencido" não é gravado: é a cobrança pendente com vencimento passado.
-- • Forma de pagamento = as mesmas da loja (migration 057). Forma não é
--   status: escolher Pix não quer dizer pago.
-- • Nada financeiro é apagado: plano só desativa, assinatura só cancela,
--   benefício usado só "estorna" (fica registrado).
-- • Isolamento: tudo tem id_lojista; leitura só pela equipe da própria
--   loja (RLS) e escrita só pelas funções abaixo, que conferem permissão.
-- • Cobrança automática (gateway) no futuro: provedor_pagamento e
--   id_externo já existem na cobrança — nada é simulado aqui.
-- ============================================================

-- ============================================================
-- 0) Permissões
-- ============================================================
-- Dono ou administrador ativo (mesma função da migration 058 — repetida
-- aqui pra esta migration não depender da ordem).
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

-- Quem atende a agenda: dono, administrador ou "Gerenciar Agenda". Vê os
-- benefícios do pet e usa/estorna no agendamento.
CREATE OR REPLACE FUNCTION fn_agenda_da_loja(p_id_lojista UUID)
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
        AND ativo = TRUE AND (acesso_total OR pode_gerenciar_agenda)
    )
  )
$$;
REVOKE ALL ON FUNCTION fn_agenda_da_loja(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_agenda_da_loja(UUID) TO authenticated;

-- ============================================================
-- 1) Tabelas
-- ============================================================
CREATE TABLE IF NOT EXISTS plano (
  id_plano        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  nome            TEXT NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 100),
  descricao       TEXT CHECK (char_length(descricao) <= 500),
  valor           NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  periodicidade   TEXT NOT NULL CHECK (periodicidade IN ('mensal', 'quinzenal', 'trimestral', 'semestral', 'anual', 'personalizado')),
  -- Só no "personalizado": a cada quantos dias.
  intervalo_dias  INTEGER CHECK (intervalo_dias BETWEEN 1 AND 730),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plano_intervalo_personalizado CHECK ((periodicidade = 'personalizado') = (intervalo_dias IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_plano_lojista ON plano(id_lojista, ativo);

-- Serviços do plano = os serviços já cadastrados (sem lista paralela).
CREATE TABLE IF NOT EXISTS plano_servico (
  id_plano    UUID NOT NULL REFERENCES plano(id_plano) ON DELETE CASCADE,
  id_servico  UUID NOT NULL REFERENCES servico(id_servico) ON DELETE RESTRICT,
  quantidade  INTEGER NOT NULL CHECK (quantidade BETWEEN 1 AND 999),
  PRIMARY KEY (id_plano, id_servico)
);

-- Cliente/pet anuláveis com SET NULL (mesmo padrão LGPD do agendamento,
-- migration 032): excluir a conta não apaga o histórico financeiro.
CREATE TABLE IF NOT EXISTS assinatura (
  id_assinatura       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista          UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  id_plano            UUID NOT NULL REFERENCES plano(id_plano) ON DELETE RESTRICT,
  id_cliente          UUID REFERENCES cliente(id_cliente) ON DELETE SET NULL,
  id_pet              UUID REFERENCES pet(id_pet) ON DELETE SET NULL,
  valor               NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  periodicidade       TEXT NOT NULL CHECK (periodicidade IN ('mensal', 'quinzenal', 'trimestral', 'semestral', 'anual', 'personalizado')),
  intervalo_dias      INTEGER CHECK (intervalo_dias BETWEEN 1 AND 730),
  data_inicio         DATE NOT NULL,
  -- Forma preferida: vira a forma de cada cobrança nova (pode mudar na cobrança).
  forma_pagamento     TEXT CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito')),
  status              TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'cancelada')),
  cancelada_em        TIMESTAMPTZ,
  motivo_cancelamento TEXT CHECK (char_length(motivo_cancelamento) <= 300),
  criada_por          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assinatura_lojista ON assinatura(id_lojista, status);
CREATE INDEX IF NOT EXISTS idx_assinatura_pet ON assinatura(id_pet, status);
CREATE INDEX IF NOT EXISTS idx_assinatura_cliente ON assinatura(id_cliente);

CREATE TABLE IF NOT EXISTS assinatura_periodo (
  id_periodo     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista     UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  id_assinatura  UUID NOT NULL REFERENCES assinatura(id_assinatura) ON DELETE CASCADE,
  numero         INTEGER NOT NULL CHECK (numero >= 1),
  inicio         DATE NOT NULL,
  fim            DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_assinatura, numero),
  CHECK (fim >= inicio)
);
CREATE INDEX IF NOT EXISTS idx_assinatura_periodo_datas ON assinatura_periodo(id_assinatura, inicio, fim);

-- Benefícios do período (foto dos itens do plano quando o período nasceu).
CREATE TABLE IF NOT EXISTS assinatura_periodo_servico (
  id_periodo  UUID NOT NULL REFERENCES assinatura_periodo(id_periodo) ON DELETE CASCADE,
  id_servico  UUID NOT NULL REFERENCES servico(id_servico) ON DELETE RESTRICT,
  quantidade  INTEGER NOT NULL CHECK (quantidade >= 1),
  PRIMARY KEY (id_periodo, id_servico)
);

CREATE TABLE IF NOT EXISTS assinatura_cobranca (
  id_cobranca        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista         UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  id_assinatura      UUID NOT NULL REFERENCES assinatura(id_assinatura) ON DELETE CASCADE,
  id_periodo         UUID NOT NULL UNIQUE REFERENCES assinatura_periodo(id_periodo) ON DELETE CASCADE,
  valor              NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  vencimento         DATE NOT NULL,
  forma_pagamento    TEXT CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito')),
  status             TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  pago_em            TIMESTAMPTZ,
  -- Para um gateway no futuro (Pix/cartão automático). Ninguém usa ainda.
  provedor_pagamento TEXT,
  id_externo         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assinatura_cobranca_lojista ON assinatura_cobranca(id_lojista, status, vencimento);
CREATE INDEX IF NOT EXISTS idx_assinatura_cobranca_assinatura ON assinatura_cobranca(id_assinatura);

CREATE TABLE IF NOT EXISTS assinatura_utilizacao (
  id_utilizacao   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  id_assinatura   UUID NOT NULL REFERENCES assinatura(id_assinatura) ON DELETE CASCADE,
  id_periodo      UUID NOT NULL REFERENCES assinatura_periodo(id_periodo) ON DELETE CASCADE,
  id_servico      UUID NOT NULL REFERENCES servico(id_servico) ON DELETE RESTRICT,
  id_agendamento  UUID REFERENCES agendamento(id_agendamento) ON DELETE SET NULL,
  -- Profissional do atendimento (acompanha o agendamento) e quem registrou.
  id_funcionario  UUID REFERENCES funcionario(id_funcionario) ON DELETE SET NULL,
  registrado_por  UUID,
  -- Quanto do serviço saiu do agendamento (volta se estornar).
  valor_abatido   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_abatido >= 0),
  estornada_em    TIMESTAMPTZ,
  motivo_estorno  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assinatura_utilizacao_periodo ON assinatura_utilizacao(id_periodo, id_servico) WHERE estornada_em IS NULL;
-- Um agendamento usa no máximo um benefício ativo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_assinatura_utilizacao_agendamento ON assinatura_utilizacao(id_agendamento) WHERE estornada_em IS NULL;

CREATE TABLE IF NOT EXISTS assinatura_historico (
  id_historico   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista     UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  id_plano       UUID REFERENCES plano(id_plano) ON DELETE SET NULL,
  id_assinatura  UUID REFERENCES assinatura(id_assinatura) ON DELETE SET NULL,
  tipo           TEXT NOT NULL,
  descricao      TEXT NOT NULL,
  id_usuario     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assinatura_historico ON assinatura_historico(id_lojista, id_assinatura, created_at DESC);

DROP TRIGGER IF EXISTS trg_plano_updated_at ON plano;
CREATE TRIGGER trg_plano_updated_at BEFORE UPDATE ON plano FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_assinatura_updated_at ON assinatura;
CREATE TRIGGER trg_assinatura_updated_at BEFORE UPDATE ON assinatura FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_assinatura_cobranca_updated_at ON assinatura_cobranca;
CREATE TRIGGER trg_assinatura_cobranca_updated_at BEFORE UPDATE ON assinatura_cobranca FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- 2) RLS: leitura pela equipe da loja; escrita só pelas funções
-- ============================================================
ALTER TABLE plano ENABLE ROW LEVEL SECURITY;                      ALTER TABLE plano FORCE ROW LEVEL SECURITY;
ALTER TABLE plano_servico ENABLE ROW LEVEL SECURITY;              ALTER TABLE plano_servico FORCE ROW LEVEL SECURITY;
ALTER TABLE assinatura ENABLE ROW LEVEL SECURITY;                 ALTER TABLE assinatura FORCE ROW LEVEL SECURITY;
ALTER TABLE assinatura_periodo ENABLE ROW LEVEL SECURITY;         ALTER TABLE assinatura_periodo FORCE ROW LEVEL SECURITY;
ALTER TABLE assinatura_periodo_servico ENABLE ROW LEVEL SECURITY; ALTER TABLE assinatura_periodo_servico FORCE ROW LEVEL SECURITY;
ALTER TABLE assinatura_cobranca ENABLE ROW LEVEL SECURITY;        ALTER TABLE assinatura_cobranca FORCE ROW LEVEL SECURITY;
ALTER TABLE assinatura_utilizacao ENABLE ROW LEVEL SECURITY;      ALTER TABLE assinatura_utilizacao FORCE ROW LEVEL SECURITY;
ALTER TABLE assinatura_historico ENABLE ROW LEVEL SECURITY;       ALTER TABLE assinatura_historico FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plano: equipe ve" ON plano;
CREATE POLICY "plano: equipe ve" ON plano FOR SELECT USING (fn_agenda_da_loja(id_lojista));
DROP POLICY IF EXISTS "plano_servico: equipe ve" ON plano_servico;
CREATE POLICY "plano_servico: equipe ve" ON plano_servico FOR SELECT
  USING (EXISTS (SELECT 1 FROM plano p WHERE p.id_plano = plano_servico.id_plano AND fn_agenda_da_loja(p.id_lojista)));
DROP POLICY IF EXISTS "assinatura: equipe ve" ON assinatura;
CREATE POLICY "assinatura: equipe ve" ON assinatura FOR SELECT USING (fn_agenda_da_loja(id_lojista));
DROP POLICY IF EXISTS "assinatura_periodo: equipe ve" ON assinatura_periodo;
CREATE POLICY "assinatura_periodo: equipe ve" ON assinatura_periodo FOR SELECT USING (fn_agenda_da_loja(id_lojista));
DROP POLICY IF EXISTS "assinatura_periodo_servico: equipe ve" ON assinatura_periodo_servico;
CREATE POLICY "assinatura_periodo_servico: equipe ve" ON assinatura_periodo_servico FOR SELECT
  USING (EXISTS (SELECT 1 FROM assinatura_periodo p WHERE p.id_periodo = assinatura_periodo_servico.id_periodo AND fn_agenda_da_loja(p.id_lojista)));
-- Cobranças e histórico são financeiros: só dono/administrador.
DROP POLICY IF EXISTS "assinatura_cobranca: gestor ve" ON assinatura_cobranca;
CREATE POLICY "assinatura_cobranca: gestor ve" ON assinatura_cobranca FOR SELECT USING (fn_gestor_da_loja(id_lojista));
DROP POLICY IF EXISTS "assinatura_utilizacao: equipe ve" ON assinatura_utilizacao;
CREATE POLICY "assinatura_utilizacao: equipe ve" ON assinatura_utilizacao FOR SELECT USING (fn_agenda_da_loja(id_lojista));
DROP POLICY IF EXISTS "assinatura_historico: gestor ve" ON assinatura_historico;
CREATE POLICY "assinatura_historico: gestor ve" ON assinatura_historico FOR SELECT USING (fn_gestor_da_loja(id_lojista));

-- ============================================================
-- 3) Auxiliares
-- ============================================================
-- Início do período n (0 = primeiro) — sempre a partir da data de início
-- (31/01 mensal → 28/02, 31/03…, sem "escorregar").
CREATE OR REPLACE FUNCTION fn_plano_inicio_periodo(p_inicio DATE, p_periodicidade TEXT, p_intervalo_dias INTEGER, p_n INTEGER)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_periodicidade
    WHEN 'mensal'     THEN (p_inicio + make_interval(months => p_n))::DATE
    WHEN 'trimestral' THEN (p_inicio + make_interval(months => 3 * p_n))::DATE
    WHEN 'semestral'  THEN (p_inicio + make_interval(months => 6 * p_n))::DATE
    WHEN 'anual'      THEN (p_inicio + make_interval(years => p_n))::DATE
    WHEN 'quinzenal'  THEN p_inicio + 15 * p_n
    ELSE p_inicio + COALESCE(p_intervalo_dias, 30) * p_n
  END
$$;

-- Quanto o período vale por mês (receita recorrente mensal).
CREATE OR REPLACE FUNCTION fn_plano_fator_mensal(p_periodicidade TEXT, p_intervalo_dias INTEGER)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_periodicidade
    WHEN 'mensal'     THEN 1
    WHEN 'quinzenal'  THEN 2
    WHEN 'trimestral' THEN 1.0 / 3
    WHEN 'semestral'  THEN 1.0 / 6
    WHEN 'anual'      THEN 1.0 / 12
    ELSE 30.0 / GREATEST(COALESCE(p_intervalo_dias, 30), 1)
  END
$$;

CREATE OR REPLACE FUNCTION fn_plano_registrar(p_id_lojista UUID, p_id_plano UUID, p_id_assinatura UUID, p_tipo TEXT, p_descricao TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO assinatura_historico (id_lojista, id_plano, id_assinatura, tipo, descricao, id_usuario)
  VALUES (p_id_lojista, p_id_plano, p_id_assinatura, p_tipo, p_descricao, auth.uid())
$$;
REVOKE ALL ON FUNCTION fn_plano_registrar(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;

-- 149.9 → "149,90" (to_char com G/D depende do locale do servidor).
CREATE OR REPLACE FUNCTION fn_fmt_valor(p_valor NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(to_char(COALESCE(p_valor, 0), 'FM9999999990.00'), '.', ',')
$$;

CREATE OR REPLACE FUNCTION fn_rotulo_forma_pagamento(p_forma TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_forma
    WHEN 'pix' THEN 'Pix'
    WHEN 'dinheiro' THEN 'Dinheiro'
    WHEN 'cartao_credito' THEN 'Cartão de crédito'
    WHEN 'cartao_debito' THEN 'Cartão de débito'
    ELSE 'não informada'
  END
$$;

-- Cria os períodos (e cobranças) que faltam até hoje. Só para assinatura
-- ativa; nunca cria duas vezes o mesmo período.
CREATE OR REPLACE FUNCTION fn_gerar_periodos_assinatura(p_id_assinatura UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a       assinatura%ROWTYPE;
  v_ultimo  assinatura_periodo%ROWTYPE;
  v_n       INTEGER;
  v_ini     DATE;
  v_fim     DATE;
  v_id      UUID;
  v_criados INTEGER := 0;
BEGIN
  SELECT * INTO v_a FROM assinatura WHERE id_assinatura = p_id_assinatura FOR UPDATE;
  IF NOT FOUND OR v_a.status <> 'ativa' THEN
    RETURN 0;
  END IF;

  LOOP
    SELECT * INTO v_ultimo FROM assinatura_periodo WHERE id_assinatura = p_id_assinatura ORDER BY numero DESC LIMIT 1;
    IF FOUND THEN
      EXIT WHEN v_ultimo.fim >= CURRENT_DATE;
      v_n := v_ultimo.numero;
    ELSE
      v_n := 0;
    END IF;
    EXIT WHEN v_criados >= 240;

    v_ini := fn_plano_inicio_periodo(v_a.data_inicio, v_a.periodicidade, v_a.intervalo_dias, v_n);
    v_fim := fn_plano_inicio_periodo(v_a.data_inicio, v_a.periodicidade, v_a.intervalo_dias, v_n + 1) - 1;

    INSERT INTO assinatura_periodo (id_lojista, id_assinatura, numero, inicio, fim)
    VALUES (v_a.id_lojista, v_a.id_assinatura, v_n + 1, v_ini, v_fim)
    RETURNING id_periodo INTO v_id;

    INSERT INTO assinatura_periodo_servico (id_periodo, id_servico, quantidade)
    SELECT v_id, ps.id_servico, ps.quantidade FROM plano_servico ps WHERE ps.id_plano = v_a.id_plano;

    INSERT INTO assinatura_cobranca (id_lojista, id_assinatura, id_periodo, valor, vencimento, forma_pagamento, status)
    VALUES (v_a.id_lojista, v_a.id_assinatura, v_id, v_a.valor, v_ini, v_a.forma_pagamento, 'pendente');

    INSERT INTO assinatura_historico (id_lojista, id_plano, id_assinatura, tipo, descricao, id_usuario)
    VALUES (
      v_a.id_lojista, v_a.id_plano, v_a.id_assinatura,
      CASE WHEN v_n = 0 THEN 'periodo_iniciado' ELSE 'renovada' END,
      format('Período %s (%s a %s) — benefícios renovados e cobrança de R$ %s gerada, vencimento %s',
             v_n + 1, to_char(v_ini, 'DD/MM/YYYY'), to_char(v_fim, 'DD/MM/YYYY'),
             fn_fmt_valor(v_a.valor), to_char(v_ini, 'DD/MM/YYYY')),
      auth.uid()
    );
    v_criados := v_criados + 1;
  END LOOP;
  RETURN v_criados;
END;
$$;
REVOKE ALL ON FUNCTION fn_gerar_periodos_assinatura(UUID) FROM PUBLIC;

-- Chamado pelas telas: renova tudo o que venceu na loja.
CREATE OR REPLACE FUNCTION fn_atualizar_assinaturas(p_id_lojista UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    UUID;
  v_total INTEGER := 0;
BEGIN
  IF NOT fn_agenda_da_loja(p_id_lojista) AND NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  FOR v_id IN
    SELECT a.id_assinatura FROM assinatura a
    WHERE a.id_lojista = p_id_lojista AND a.status = 'ativa'
      AND NOT EXISTS (SELECT 1 FROM assinatura_periodo p WHERE p.id_assinatura = a.id_assinatura AND p.fim >= CURRENT_DATE)
  LOOP
    v_total := v_total + fn_gerar_periodos_assinatura(v_id);
  END LOOP;
  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION fn_atualizar_assinaturas(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_atualizar_assinaturas(UUID) TO authenticated;

-- ============================================================
-- 4) Planos
-- ============================================================
-- p_servicos: [{"id_servico": "...", "quantidade": 4}, ...]
CREATE OR REPLACE FUNCTION fn_salvar_plano(
  p_id_plano        UUID,
  p_nome            TEXT,
  p_descricao       TEXT,
  p_valor           NUMERIC,
  p_periodicidade   TEXT,
  p_intervalo_dias  INTEGER,
  p_servicos        JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja   UUID := auth_lojista_id();
  v_id     UUID := p_id_plano;
  v_item   JSONB;
  v_qtd    INTEGER;
  v_ids    UUID[] := '{}';
  v_resumo TEXT;
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode gerenciar planos';
  END IF;
  IF char_length(btrim(COALESCE(p_nome, ''))) < 2 THEN
    RAISE EXCEPTION 'Dê um nome ao plano';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'Informe o valor do plano';
  END IF;
  IF p_periodicidade NOT IN ('mensal', 'quinzenal', 'trimestral', 'semestral', 'anual', 'personalizado') THEN
    RAISE EXCEPTION 'Período de cobrança inválido';
  END IF;
  IF p_periodicidade = 'personalizado' AND (p_intervalo_dias IS NULL OR p_intervalo_dias NOT BETWEEN 1 AND 730) THEN
    RAISE EXCEPTION 'No período personalizado, informe a cada quantos dias (1 a 730)';
  END IF;
  IF p_servicos IS NULL OR jsonb_typeof(p_servicos) <> 'array' OR jsonb_array_length(p_servicos) = 0 THEN
    RAISE EXCEPTION 'Inclua pelo menos um serviço no plano';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_servicos) LOOP
    v_qtd := (v_item ->> 'quantidade')::INTEGER;
    IF v_qtd IS NULL OR v_qtd NOT BETWEEN 1 AND 999 THEN
      RAISE EXCEPTION 'A quantidade de cada serviço deve ser de 1 a 999';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM servico WHERE id_servico = (v_item ->> 'id_servico')::UUID AND id_lojista = v_loja) THEN
      RAISE EXCEPTION 'Serviço não encontrado nesta loja';
    END IF;
    IF (v_item ->> 'id_servico')::UUID = ANY (v_ids) THEN
      RAISE EXCEPTION 'O mesmo serviço foi incluído duas vezes';
    END IF;
    v_ids := v_ids || (v_item ->> 'id_servico')::UUID;
  END LOOP;

  IF v_id IS NULL THEN
    INSERT INTO plano (id_lojista, nome, descricao, valor, periodicidade, intervalo_dias)
    VALUES (v_loja, btrim(p_nome), NULLIF(btrim(COALESCE(p_descricao, '')), ''), p_valor, p_periodicidade,
            CASE WHEN p_periodicidade = 'personalizado' THEN p_intervalo_dias END)
    RETURNING id_plano INTO v_id;
  ELSE
    UPDATE plano SET
      nome = btrim(p_nome),
      descricao = NULLIF(btrim(COALESCE(p_descricao, '')), ''),
      valor = p_valor,
      periodicidade = p_periodicidade,
      intervalo_dias = CASE WHEN p_periodicidade = 'personalizado' THEN p_intervalo_dias END
    WHERE id_plano = v_id AND id_lojista = v_loja;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plano não encontrado';
    END IF;
    DELETE FROM plano_servico WHERE id_plano = v_id;
  END IF;

  INSERT INTO plano_servico (id_plano, id_servico, quantidade)
  SELECT v_id, (e.item ->> 'id_servico')::UUID, (e.item ->> 'quantidade')::INTEGER
  FROM jsonb_array_elements(p_servicos) AS e(item);

  SELECT string_agg(s.nome || ' ×' || ps.quantidade, ', ' ORDER BY s.nome) INTO v_resumo
  FROM plano_servico ps JOIN servico s ON s.id_servico = ps.id_servico WHERE ps.id_plano = v_id;

  PERFORM fn_plano_registrar(v_loja, v_id, NULL,
    CASE WHEN p_id_plano IS NULL THEN 'plano_criado' ELSE 'plano_alterado' END,
    format('Plano "%s": R$ %s, %s — %s', btrim(p_nome), fn_fmt_valor(p_valor),
           CASE WHEN p_periodicidade = 'personalizado' THEN 'a cada ' || p_intervalo_dias || ' dias' ELSE p_periodicidade END,
           v_resumo));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION fn_salvar_plano(UUID, TEXT, TEXT, NUMERIC, TEXT, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_salvar_plano(UUID, TEXT, TEXT, NUMERIC, TEXT, INTEGER, JSONB) TO authenticated;

-- Desativar = não aparece para novas assinaturas; quem já assinou segue.
CREATE OR REPLACE FUNCTION fn_alterar_status_plano(p_id_plano UUID, p_ativo BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
  v_nome TEXT;
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode gerenciar planos';
  END IF;
  UPDATE plano SET ativo = COALESCE(p_ativo, FALSE) WHERE id_plano = p_id_plano AND id_lojista = v_loja RETURNING nome INTO v_nome;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano não encontrado';
  END IF;
  PERFORM fn_plano_registrar(v_loja, p_id_plano, NULL, CASE WHEN p_ativo THEN 'plano_ativado' ELSE 'plano_desativado' END,
    format('Plano "%s" %s', v_nome, CASE WHEN p_ativo THEN 'ativado' ELSE 'desativado (quem já assinou continua)' END));
END;
$$;
REVOKE ALL ON FUNCTION fn_alterar_status_plano(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_alterar_status_plano(UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- 5) Assinaturas
-- ============================================================
CREATE OR REPLACE FUNCTION fn_assinar_plano(p_id_plano UUID, p_id_pet UUID, p_data_inicio DATE, p_forma_pagamento TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja    UUID := auth_lojista_id();
  v_plano   plano%ROWTYPE;
  v_cliente UUID;
  v_pet     TEXT;
  v_id      UUID;
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode vincular planos';
  END IF;
  SELECT * INTO v_plano FROM plano WHERE id_plano = p_id_plano AND id_lojista = v_loja;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano não encontrado';
  END IF;
  IF NOT v_plano.ativo THEN
    RAISE EXCEPTION 'Este plano está desativado';
  END IF;
  SELECT p.id_cliente, p.nome INTO v_cliente, v_pet FROM pet p
  WHERE p.id_pet = p_id_pet AND p.ativo = TRUE
    AND EXISTS (SELECT 1 FROM cliente_lojista cl WHERE cl.id_cliente = p.id_cliente AND cl.id_lojista = v_loja);
  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'Pet não encontrado entre os clientes da loja';
  END IF;
  IF p_data_inicio IS NULL OR p_data_inicio < CURRENT_DATE - 366 OR p_data_inicio > CURRENT_DATE + 366 THEN
    RAISE EXCEPTION 'Escolha uma data de início até 1 ano antes ou depois de hoje';
  END IF;
  IF p_forma_pagamento IS NOT NULL AND NOT fn_forma_pagamento_aceita(v_loja, p_forma_pagamento) THEN
    RAISE EXCEPTION 'Esta loja não aceita essa forma de pagamento';
  END IF;
  IF EXISTS (SELECT 1 FROM assinatura WHERE id_pet = p_id_pet AND id_plano = p_id_plano AND status = 'ativa') THEN
    RAISE EXCEPTION '% já tem este plano ativo', v_pet;
  END IF;

  INSERT INTO assinatura (id_lojista, id_plano, id_cliente, id_pet, valor, periodicidade, intervalo_dias, data_inicio, forma_pagamento, criada_por)
  VALUES (v_loja, p_id_plano, v_cliente, p_id_pet, v_plano.valor, v_plano.periodicidade, v_plano.intervalo_dias, p_data_inicio, p_forma_pagamento, auth.uid())
  RETURNING id_assinatura INTO v_id;

  PERFORM fn_plano_registrar(v_loja, p_id_plano, v_id, 'assinatura_criada',
    format('Plano "%s" assinado para %s — R$ %s, início %s', v_plano.nome, v_pet,
           fn_fmt_valor(v_plano.valor), to_char(p_data_inicio, 'DD/MM/YYYY')));
  PERFORM fn_gerar_periodos_assinatura(v_id);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION fn_assinar_plano(UUID, UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_assinar_plano(UUID, UUID, DATE, TEXT) TO authenticated;

-- Cancelar: não gera mais períodos nem cobranças; tudo o que já existe fica.
CREATE OR REPLACE FUNCTION fn_cancelar_assinatura(p_id_assinatura UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a assinatura%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM assinatura WHERE id_assinatura = p_id_assinatura FOR UPDATE;
  IF NOT FOUND OR NOT fn_gestor_da_loja(v_a.id_lojista) THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;
  IF v_a.status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta assinatura já está cancelada';
  END IF;
  UPDATE assinatura SET status = 'cancelada', cancelada_em = NOW(),
    motivo_cancelamento = NULLIF(btrim(COALESCE(p_motivo, '')), '')
  WHERE id_assinatura = p_id_assinatura;
  PERFORM fn_plano_registrar(v_a.id_lojista, v_a.id_plano, v_a.id_assinatura, 'assinatura_cancelada',
    'Assinatura cancelada' || COALESCE(' — ' || NULLIF(btrim(COALESCE(p_motivo, '')), ''), '') || '. Nenhuma cobrança nova será gerada.');
END;
$$;
REVOKE ALL ON FUNCTION fn_cancelar_assinatura(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cancelar_assinatura(UUID, TEXT) TO authenticated;

-- ============================================================
-- 6) Cobranças
-- ============================================================
CREATE OR REPLACE FUNCTION fn_atualizar_cobranca_plano(p_id_cobranca UUID, p_forma TEXT, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c assinatura_cobranca%ROWTYPE;
  v_a assinatura%ROWTYPE;
  v_forma TEXT;
BEGIN
  SELECT * INTO v_c FROM assinatura_cobranca WHERE id_cobranca = p_id_cobranca FOR UPDATE;
  IF NOT FOUND OR NOT fn_gestor_da_loja(v_c.id_lojista) THEN
    RAISE EXCEPTION 'Cobrança não encontrada';
  END IF;
  IF p_status NOT IN ('pendente', 'pago', 'cancelado') THEN
    RAISE EXCEPTION 'Status de pagamento inválido';
  END IF;
  v_forma := COALESCE(p_forma, v_c.forma_pagamento);
  IF v_forma IS DISTINCT FROM v_c.forma_pagamento AND NOT fn_forma_pagamento_aceita(v_c.id_lojista, v_forma) THEN
    RAISE EXCEPTION 'Esta loja não aceita essa forma de pagamento';
  END IF;
  IF p_status = 'pago' AND v_forma IS NULL THEN
    RAISE EXCEPTION 'Informe a forma de pagamento para registrar o pagamento';
  END IF;

  UPDATE assinatura_cobranca SET
    forma_pagamento = v_forma,
    status = p_status,
    pago_em = CASE WHEN p_status = 'pago' THEN COALESCE(pago_em, NOW()) ELSE NULL END
  WHERE id_cobranca = p_id_cobranca;

  SELECT * INTO v_a FROM assinatura WHERE id_assinatura = v_c.id_assinatura;
  PERFORM fn_plano_registrar(v_c.id_lojista, v_a.id_plano, v_c.id_assinatura,
    CASE WHEN p_status = 'pago' AND v_c.status <> 'pago' THEN 'pagamento_registrado' ELSE 'cobranca_alterada' END,
    format('Cobrança de R$ %s (vencimento %s): %s → %s, forma %s',
           fn_fmt_valor(v_c.valor), to_char(v_c.vencimento, 'DD/MM/YYYY'),
           v_c.status, p_status, fn_rotulo_forma_pagamento(v_forma)));
END;
$$;
REVOKE ALL ON FUNCTION fn_atualizar_cobranca_plano(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_atualizar_cobranca_plano(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 7) Benefícios
-- ============================================================
-- Planos ativos do pet e os benefícios do período que cobre p_data.
CREATE OR REPLACE FUNCTION fn_beneficios_do_pet(p_id_pet UUID, p_data DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
  v_id   UUID;
  v_out  JSONB;
BEGIN
  IF NOT fn_agenda_da_loja(v_loja) AND NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  FOR v_id IN SELECT id_assinatura FROM assinatura WHERE id_pet = p_id_pet AND id_lojista = v_loja AND status = 'ativa' LOOP
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
    WHERE a.id_pet = p_id_pet AND a.id_lojista = v_loja AND a.status = 'ativa'
  ) t;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION fn_beneficios_do_pet(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_beneficios_do_pet(UUID, DATE) TO authenticated;

-- Situação do benefício num agendamento: já usou? dá pra usar?
CREATE OR REPLACE FUNCTION fn_beneficio_do_agendamento(p_id_agendamento UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag  agendamento%ROWTYPE;
  v_uso JSONB;
  v_ben JSONB;
  v_disp JSONB;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento;
  IF NOT FOUND OR NOT fn_agenda_da_loja(v_ag.id_lojista) THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object('id_utilizacao', u.id_utilizacao, 'plano', pl.nome, 'valor_abatido', u.valor_abatido, 'em', u.created_at)
  INTO v_uso
  FROM assinatura_utilizacao u JOIN assinatura a ON a.id_assinatura = u.id_assinatura JOIN plano pl ON pl.id_plano = a.id_plano
  WHERE u.id_agendamento = p_id_agendamento AND u.estornada_em IS NULL;

  IF v_uso IS NULL AND v_ag.status <> 'Cancelado' AND v_ag.id_pet IS NOT NULL THEN
    v_ben := fn_beneficios_do_pet(v_ag.id_pet, v_ag.dt_agendamento);
    SELECT jsonb_build_object('id_assinatura', b.item ->> 'id_assinatura', 'plano', b.item ->> 'plano',
             'quantidade', (i.item ->> 'quantidade')::INTEGER, 'usados', (i.item ->> 'usados')::INTEGER)
    INTO v_disp
    FROM jsonb_array_elements(v_ben) AS b(item), jsonb_array_elements(b.item -> 'beneficios') AS i(item)
    WHERE (i.item ->> 'id_servico')::UUID = v_ag.id_servico
    ORDER BY ((i.item ->> 'quantidade')::INTEGER - (i.item ->> 'usados')::INTEGER) DESC
    LIMIT 1;
  END IF;
  RETURN jsonb_build_object('usado', v_uso, 'disponivel', v_disp);
END;
$$;
REVOKE ALL ON FUNCTION fn_beneficio_do_agendamento(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_beneficio_do_agendamento(UUID) TO authenticated;

-- Usa um benefício do plano no agendamento: registra e tira o valor do
-- serviço do agendamento (produtos e TaxiDog continuam cobrados).
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
  v_motivo   TEXT := NULL;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento FOR UPDATE;
  IF NOT FOUND OR NOT fn_agenda_da_loja(v_ag.id_lojista) THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
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
    format('%s usado no agendamento de %s às %s (%s de %s no período %s) — R$ %s saíram do agendamento',
           v_nome_srv, to_char(v_ag.dt_agendamento, 'DD/MM/YYYY'), to_char(v_ag.hr_agendamento, 'HH24:MI'),
           v_usados + 1, v_qtd, v_per.numero, fn_fmt_valor(v_servico)));

  RETURN jsonb_build_object('usados', v_usados + 1, 'quantidade', v_qtd, 'valor_abatido', v_servico);
END;
$$;
REVOKE ALL ON FUNCTION fn_usar_beneficio(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_usar_beneficio(UUID) TO authenticated;

-- Desfaz o uso (o benefício volta ao saldo e o valor volta ao agendamento).
CREATE OR REPLACE FUNCTION fn_estornar_beneficio(p_id_agendamento UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag agendamento%ROWTYPE;
  v_u  assinatura_utilizacao%ROWTYPE;
  v_a  assinatura%ROWTYPE;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento FOR UPDATE;
  IF NOT FOUND OR NOT fn_agenda_da_loja(v_ag.id_lojista) THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;
  SELECT * INTO v_u FROM assinatura_utilizacao WHERE id_agendamento = p_id_agendamento AND estornada_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este agendamento não usa benefício do plano';
  END IF;
  UPDATE assinatura_utilizacao SET estornada_em = NOW(), motivo_estorno = COALESCE(NULLIF(btrim(COALESCE(p_motivo, '')), ''), 'Desfeito pela loja')
  WHERE id_utilizacao = v_u.id_utilizacao;
  IF v_ag.status <> 'Cancelado' THEN
    UPDATE agendamento SET valor = valor + v_u.valor_abatido WHERE id_agendamento = p_id_agendamento;
  END IF;
  SELECT * INTO v_a FROM assinatura WHERE id_assinatura = v_u.id_assinatura;
  PERFORM fn_plano_registrar(v_ag.id_lojista, v_a.id_plano, v_a.id_assinatura, 'beneficio_estornado',
    format('Uso desfeito no agendamento de %s — o benefício voltou ao saldo e R$ %s voltaram ao agendamento',
           to_char(v_ag.dt_agendamento, 'DD/MM/YYYY'), fn_fmt_valor(v_u.valor_abatido)));
END;
$$;
REVOKE ALL ON FUNCTION fn_estornar_beneficio(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_estornar_beneficio(UUID, TEXT) TO authenticated;

-- Agendamento cancelado devolve o benefício; profissional acompanha o agendamento.
CREATE OR REPLACE FUNCTION fn_trg_agendamento_beneficio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_u assinatura_utilizacao%ROWTYPE;
  v_a assinatura%ROWTYPE;
BEGIN
  IF NEW.status = 'Cancelado' AND OLD.status IS DISTINCT FROM 'Cancelado' THEN
    FOR v_u IN SELECT * FROM assinatura_utilizacao WHERE id_agendamento = NEW.id_agendamento AND estornada_em IS NULL LOOP
      UPDATE assinatura_utilizacao SET estornada_em = NOW(), motivo_estorno = 'Agendamento cancelado' WHERE id_utilizacao = v_u.id_utilizacao;
      SELECT * INTO v_a FROM assinatura WHERE id_assinatura = v_u.id_assinatura;
      INSERT INTO assinatura_historico (id_lojista, id_plano, id_assinatura, tipo, descricao, id_usuario)
      VALUES (NEW.id_lojista, v_a.id_plano, v_a.id_assinatura, 'beneficio_estornado',
              format('Agendamento de %s cancelado — o benefício voltou ao saldo', to_char(NEW.dt_agendamento, 'DD/MM/YYYY')), auth.uid());
    END LOOP;
  END IF;
  IF NEW.id_funcionario IS DISTINCT FROM OLD.id_funcionario THEN
    UPDATE assinatura_utilizacao SET id_funcionario = NEW.id_funcionario
    WHERE id_agendamento = NEW.id_agendamento AND estornada_em IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_beneficio ON agendamento;
CREATE TRIGGER trg_agendamento_beneficio
  AFTER UPDATE OF status, id_funcionario ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_trg_agendamento_beneficio();

-- ============================================================
-- 8) Leitura para as telas
-- ============================================================
-- Resumo de uma assinatura (usado nas listas e no cliente).
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
        'registrado_em', u.created_at) ORDER BY u.created_at DESC)
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

CREATE OR REPLACE FUNCTION fn_planos_da_loja()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id_plano', pl.id_plano, 'nome', pl.nome, 'descricao', pl.descricao, 'valor', pl.valor,
      'periodicidade', pl.periodicidade, 'intervalo_dias', pl.intervalo_dias, 'ativo', pl.ativo,
      'servicos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id_servico', ps.id_servico, 'servico', s.nome, 'quantidade', ps.quantidade) ORDER BY s.nome)
                            FROM plano_servico ps JOIN servico s ON s.id_servico = ps.id_servico WHERE ps.id_plano = pl.id_plano), '[]'::jsonb),
      'assinaturas_ativas', (SELECT COUNT(*) FROM assinatura a WHERE a.id_plano = pl.id_plano AND a.status = 'ativa')
    ) ORDER BY pl.ativo DESC, pl.nome)
    FROM plano pl WHERE pl.id_lojista = v_loja
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION fn_planos_da_loja() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_planos_da_loja() TO authenticated;

-- p_id_cliente NULL = todas da loja.
CREATE OR REPLACE FUNCTION fn_assinaturas_da_loja(p_id_cliente UUID, p_detalhes BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  PERFORM fn_atualizar_assinaturas(v_loja);
  RETURN COALESCE((
    SELECT jsonb_agg(fn_assinatura_json(a.id_assinatura, COALESCE(p_detalhes, FALSE)) ORDER BY (a.status = 'ativa') DESC, a.created_at DESC)
    FROM assinatura a
    WHERE a.id_lojista = v_loja AND (p_id_cliente IS NULL OR a.id_cliente = p_id_cliente)
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION fn_assinaturas_da_loja(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_assinaturas_da_loja(UUID, BOOLEAN) TO authenticated;

-- Cobranças da loja: p_filtro = 'todas' | 'pendentes' | 'vencidas' | 'pagas' | 'canceladas'.
CREATE OR REPLACE FUNCTION fn_cobrancas_planos(p_filtro TEXT, p_data_ini DATE, p_data_fim DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  PERFORM fn_atualizar_assinaturas(v_loja);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id_cobranca', cb.id_cobranca, 'id_assinatura', cb.id_assinatura, 'plano', pl.nome,
      'id_cliente', a.id_cliente, 'cliente', c.nome, 'pet', p.nome, 'numero', per.numero,
      'periodo_inicio', per.inicio, 'periodo_fim', per.fim,
      'valor', cb.valor, 'vencimento', cb.vencimento, 'forma_pagamento', cb.forma_pagamento,
      'status', cb.status, 'pago_em', cb.pago_em, 'assinatura_status', a.status
    ) ORDER BY cb.vencimento DESC, c.nome)
    FROM assinatura_cobranca cb
    JOIN assinatura a ON a.id_assinatura = cb.id_assinatura
    JOIN assinatura_periodo per ON per.id_periodo = cb.id_periodo
    JOIN plano pl ON pl.id_plano = a.id_plano
    LEFT JOIN cliente c ON c.id_cliente = a.id_cliente
    LEFT JOIN pet p ON p.id_pet = a.id_pet
    WHERE cb.id_lojista = v_loja
      AND (p_data_ini IS NULL OR cb.vencimento >= p_data_ini)
      AND (p_data_fim IS NULL OR cb.vencimento <= p_data_fim)
      AND CASE COALESCE(p_filtro, 'todas')
            WHEN 'pendentes'  THEN cb.status = 'pendente' AND cb.vencimento >= CURRENT_DATE
            WHEN 'vencidas'   THEN cb.status = 'pendente' AND cb.vencimento < CURRENT_DATE
            WHEN 'pagas'      THEN cb.status = 'pago'
            WHEN 'canceladas' THEN cb.status = 'cancelado'
            ELSE TRUE
          END
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION fn_cobrancas_planos(TEXT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cobrancas_planos(TEXT, DATE, DATE) TO authenticated;

-- Histórico dos planos (criação/alteração/ativação) — mudanças da loja.
CREATE OR REPLACE FUNCTION fn_historico_planos(p_limite INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loja UUID := auth_lojista_id();
BEGIN
  IF NOT fn_gestor_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY (x ->> 'em') DESC) FROM (
      SELECT jsonb_build_object('tipo', h.tipo, 'descricao', h.descricao, 'em', h.created_at,
        'cliente', c.nome, 'pet', p.nome, 'id_cliente', a.id_cliente) AS x
      FROM assinatura_historico h
      LEFT JOIN assinatura a ON a.id_assinatura = h.id_assinatura
      LEFT JOIN cliente c ON c.id_cliente = a.id_cliente
      LEFT JOIN pet p ON p.id_pet = a.id_pet
      WHERE h.id_lojista = v_loja
      ORDER BY h.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 1), 200)
    ) t
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION fn_historico_planos(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_historico_planos(INTEGER) TO authenticated;

-- ============================================================
-- 9) Dashboard e Relatório de Vendas
-- ============================================================
CREATE OR REPLACE FUNCTION fn_resumo_planos(p_id_lojista UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  PERFORM fn_atualizar_assinaturas(p_id_lojista);
  RETURN jsonb_build_object(
    'tem_planos', EXISTS (SELECT 1 FROM plano WHERE id_lojista = p_id_lojista),
    'ativas', (SELECT COUNT(*) FROM assinatura WHERE id_lojista = p_id_lojista AND status = 'ativa'),
    'receita_mensal', (SELECT COALESCE(ROUND(SUM(valor * fn_plano_fator_mensal(periodicidade, intervalo_dias)), 2), 0)
                       FROM assinatura WHERE id_lojista = p_id_lojista AND status = 'ativa'),
    'pendentes_qtd', (SELECT COUNT(*) FROM assinatura_cobranca WHERE id_lojista = p_id_lojista AND status = 'pendente' AND vencimento >= CURRENT_DATE),
    'pendentes_valor', (SELECT COALESCE(SUM(valor), 0) FROM assinatura_cobranca WHERE id_lojista = p_id_lojista AND status = 'pendente' AND vencimento >= CURRENT_DATE),
    'vencidas_qtd', (SELECT COUNT(*) FROM assinatura_cobranca WHERE id_lojista = p_id_lojista AND status = 'pendente' AND vencimento < CURRENT_DATE),
    'vencidas_valor', (SELECT COALESCE(SUM(valor), 0) FROM assinatura_cobranca WHERE id_lojista = p_id_lojista AND status = 'pendente' AND vencimento < CURRENT_DATE),
    'utilizacoes_mes', (SELECT COUNT(*) FROM assinatura_utilizacao u JOIN agendamento ag ON ag.id_agendamento = u.id_agendamento
                        WHERE u.id_lojista = p_id_lojista AND u.estornada_em IS NULL
                          AND date_trunc('month', ag.dt_agendamento) = date_trunc('month', CURRENT_DATE)),
    -- Próximas renovações (próximos 7 dias): a cobrança nasce no dia.
    'proximas', COALESCE((
      SELECT jsonb_agg(x ORDER BY x ->> 'data') FROM (
        SELECT jsonb_build_object('data', MAX(per.fim) + 1, 'cliente', c.nome, 'id_cliente', a.id_cliente, 'pet', p.nome, 'plano', pl.nome, 'valor', a.valor) AS x
        FROM assinatura a
        JOIN assinatura_periodo per ON per.id_assinatura = a.id_assinatura
        JOIN plano pl ON pl.id_plano = a.id_plano
        LEFT JOIN cliente c ON c.id_cliente = a.id_cliente
        LEFT JOIN pet p ON p.id_pet = a.id_pet
        WHERE a.id_lojista = p_id_lojista AND a.status = 'ativa'
        GROUP BY a.id_assinatura, c.nome, a.id_cliente, p.nome, pl.nome, a.valor
        HAVING MAX(per.fim) + 1 BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
        ORDER BY MAX(per.fim)
        LIMIT 5
      ) t
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION fn_resumo_planos(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_resumo_planos(UUID) TO authenticated;

-- Relatório no período. Status das cobranças: pelo VENCIMENTO no período.
-- Receita de planos: cobranças PAGAS com pagamento no período.
CREATE OR REPLACE FUNCTION fn_relatorio_planos(p_id_lojista UUID, p_data_ini DATE, p_data_fim DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;
  PERFORM fn_atualizar_assinaturas(p_id_lojista);
  RETURN jsonb_build_object(
    'tem_planos', EXISTS (SELECT 1 FROM plano WHERE id_lojista = p_id_lojista),
    'ativas', (SELECT COUNT(*) FROM assinatura WHERE id_lojista = p_id_lojista AND status = 'ativa'),
    'receita_mensal', (SELECT COALESCE(ROUND(SUM(valor * fn_plano_fator_mensal(periodicidade, intervalo_dias)), 2), 0)
                       FROM assinatura WHERE id_lojista = p_id_lojista AND status = 'ativa'),
    'receita_periodo', (SELECT COALESCE(SUM(valor), 0) FROM assinatura_cobranca
                        WHERE id_lojista = p_id_lojista AND status = 'pago' AND (pago_em AT TIME ZONE 'America/Sao_Paulo')::DATE BETWEEN p_data_ini AND p_data_fim),
    'pagas_qtd', (SELECT COUNT(*) FROM assinatura_cobranca WHERE id_lojista = p_id_lojista AND vencimento BETWEEN p_data_ini AND p_data_fim AND status = 'pago'),
    'pagas_valor', (SELECT COALESCE(SUM(valor), 0) FROM assinatura_cobranca WHERE id_lojista = p_id_lojista AND vencimento BETWEEN p_data_ini AND p_data_fim AND status = 'pago'),
    'pendentes_qtd', (SELECT COUNT(*) FROM assinatura_cobranca WHERE id_lojista = p_id_lojista AND vencimento BETWEEN p_data_ini AND p_data_fim AND status = 'pendente' AND vencimento >= CURRENT_DATE),
    'pendentes_valor', (SELECT COALESCE(SUM(valor), 0) FROM assinatura_cobranca WHERE id_lojista = p_id_lojista AND vencimento BETWEEN p_data_ini AND p_data_fim AND status = 'pendente' AND vencimento >= CURRENT_DATE),
    'vencidas_qtd', (SELECT COUNT(*) FROM assinatura_cobranca WHERE id_lojista = p_id_lojista AND vencimento BETWEEN p_data_ini AND p_data_fim AND status = 'pendente' AND vencimento < CURRENT_DATE),
    'vencidas_valor', (SELECT COALESCE(SUM(valor), 0) FROM assinatura_cobranca WHERE id_lojista = p_id_lojista AND vencimento BETWEEN p_data_ini AND p_data_fim AND status = 'pendente' AND vencimento < CURRENT_DATE),
    'planos', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x ->> 'ativas')::INTEGER DESC, x ->> 'plano') FROM (
        SELECT jsonb_build_object(
          'plano', pl.nome,
          'ativas', (SELECT COUNT(*) FROM assinatura a WHERE a.id_plano = pl.id_plano AND a.status = 'ativa'),
          'novas', (SELECT COUNT(*) FROM assinatura a WHERE a.id_plano = pl.id_plano AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE BETWEEN p_data_ini AND p_data_fim),
          'receita', (SELECT COALESCE(SUM(cb.valor), 0) FROM assinatura_cobranca cb JOIN assinatura a ON a.id_assinatura = cb.id_assinatura
                      WHERE a.id_plano = pl.id_plano AND cb.status = 'pago' AND (cb.pago_em AT TIME ZONE 'America/Sao_Paulo')::DATE BETWEEN p_data_ini AND p_data_fim)
        ) AS x
        FROM plano pl WHERE pl.id_lojista = p_id_lojista
      ) t
    ), '[]'::jsonb),
    'servicos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('servico', nome, 'usos', usos) ORDER BY usos DESC, nome) FROM (
        SELECT s.nome, COUNT(*) AS usos
        FROM assinatura_utilizacao u
        JOIN servico s ON s.id_servico = u.id_servico
        JOIN agendamento ag ON ag.id_agendamento = u.id_agendamento
        WHERE u.id_lojista = p_id_lojista AND u.estornada_em IS NULL AND ag.dt_agendamento BETWEEN p_data_ini AND p_data_fim
        GROUP BY s.nome
      ) t
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION fn_relatorio_planos(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_planos(UUID, DATE, DATE) TO authenticated;
