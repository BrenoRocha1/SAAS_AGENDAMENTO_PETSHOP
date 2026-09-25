-- ============================================================
-- PETSHOP SaaS - Migration 057: formas de pagamento
-- ============================================================
-- • A loja escolhe as formas que aceita (Pix, Dinheiro, Cartão de
--   crédito, Cartão de débito) em Configurações → Loja → "Formas de
--   pagamentos aceitas". Pix pede chave e nome de identificação, que o
--   cliente vê ao escolher Pix. Loja que ainda não configurou: Dinheiro e
--   cartões ligados, Pix desligado.
-- • Todo agendamento NOVO tem forma de pagamento e status do pagamento
--   (pendente / pago / cancelado), de qualquer origem. A forma vale pro
--   pedido inteiro (serviços + produtos + TaxiDog, que já estão somados
--   no `valor` de cada agendamento). Um pedido com vários serviços vira
--   vários agendamentos criados juntos — todos com a mesma forma.
-- • Escolher a forma não é pagar: nasce "pendente" (a loja pode lançar
--   já "pago" no balcão) e a loja atualiza depois.
-- • Agendamentos antigos ficam sem forma ("Não informada").
--
-- Como toda criação passa pelas funções de agendamento, cada uma ganhou
-- uma versão "_com_pagamento", que guarda a forma na transação
-- (set_config) e chama a original. Um trigger preenche a forma em cada
-- agendamento inserido — e recusa o insert sem forma ou com forma que a
-- loja não aceita.
-- ============================================================

-- ============================================================
-- 1) Configuração da loja
-- ============================================================
CREATE TABLE IF NOT EXISTS loja_pagamento (
  id_lojista      UUID PRIMARY KEY REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  pix_ativo       BOOLEAN NOT NULL DEFAULT FALSE,
  pix_chave       TEXT CHECK (char_length(pix_chave) <= 140),
  pix_nome        TEXT CHECK (char_length(pix_nome) <= 100),
  dinheiro_ativo  BOOLEAN NOT NULL DEFAULT TRUE,
  credito_ativo   BOOLEAN NOT NULL DEFAULT TRUE,
  debito_ativo    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loja_pagamento_pix_completo CHECK (
    NOT pix_ativo OR (char_length(btrim(COALESCE(pix_chave, ''))) > 0 AND char_length(btrim(COALESCE(pix_nome, ''))) > 0)
  ),
  CONSTRAINT loja_pagamento_ao_menos_uma CHECK (pix_ativo OR dinheiro_ativo OR credito_ativo OR debito_ativo)
);

-- Leitura pública: as formas aceitas e a chave Pix aparecem pro cliente
-- no link de agendamento (a chave Pix é feita pra ser mostrada). Escrita
-- só pela função abaixo.
ALTER TABLE loja_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_pagamento FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loja_pagamento: leitura publica" ON loja_pagamento;
CREATE POLICY "loja_pagamento: leitura publica"
  ON loja_pagamento FOR SELECT
  USING (TRUE);

-- Formas da loja, com o padrão de quem ainda não configurou.
CREATE OR REPLACE FUNCTION fn_formas_pagamento_loja(p_id_lojista UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'pix', lp.pix_ativo, 'pix_chave', lp.pix_chave, 'pix_nome', lp.pix_nome,
       'dinheiro', lp.dinheiro_ativo, 'cartao_credito', lp.credito_ativo, 'cartao_debito', lp.debito_ativo,
       'configurado', TRUE)
     FROM loja_pagamento lp WHERE lp.id_lojista = p_id_lojista),
    jsonb_build_object(
      'pix', FALSE, 'pix_chave', NULL, 'pix_nome', NULL,
      'dinheiro', TRUE, 'cartao_credito', TRUE, 'cartao_debito', TRUE,
      'configurado', FALSE)
  )
$$;

REVOKE ALL ON FUNCTION fn_formas_pagamento_loja(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_formas_pagamento_loja(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION fn_forma_pagamento_aceita(p_id_lojista UUID, p_forma TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_forma IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito')
     AND COALESCE((fn_formas_pagamento_loja(p_id_lojista) ->> p_forma)::BOOLEAN, FALSE)
$$;

REVOKE ALL ON FUNCTION fn_forma_pagamento_aceita(UUID, TEXT) FROM PUBLIC;

-- Só dono ou administrador mudam (é configuração da loja).
CREATE OR REPLACE FUNCTION fn_salvar_formas_pagamento(
  p_pix_ativo BOOLEAN,
  p_pix_chave TEXT,
  p_pix_nome  TEXT,
  p_dinheiro  BOOLEAN,
  p_credito   BOOLEAN,
  p_debito    BOOLEAN
)
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
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode mudar as formas de pagamento';
  END IF;
  IF NOT (COALESCE(p_pix_ativo, FALSE) OR COALESCE(p_dinheiro, FALSE) OR COALESCE(p_credito, FALSE) OR COALESCE(p_debito, FALSE)) THEN
    RAISE EXCEPTION 'Deixe pelo menos uma forma de pagamento ativada';
  END IF;
  IF COALESCE(p_pix_ativo, FALSE) AND (char_length(btrim(COALESCE(p_pix_chave, ''))) = 0 OR char_length(btrim(COALESCE(p_pix_nome, ''))) = 0) THEN
    RAISE EXCEPTION 'Para ativar o Pix, preencha a chave e o nome de identificação';
  END IF;

  INSERT INTO loja_pagamento (id_lojista, pix_ativo, pix_chave, pix_nome, dinheiro_ativo, credito_ativo, debito_ativo, updated_at)
  VALUES (v_lojista, COALESCE(p_pix_ativo, FALSE), NULLIF(btrim(COALESCE(p_pix_chave, '')), ''), NULLIF(btrim(COALESCE(p_pix_nome, '')), ''),
          COALESCE(p_dinheiro, FALSE), COALESCE(p_credito, FALSE), COALESCE(p_debito, FALSE), NOW())
  ON CONFLICT (id_lojista) DO UPDATE SET
    pix_ativo = EXCLUDED.pix_ativo,
    pix_chave = EXCLUDED.pix_chave,
    pix_nome = EXCLUDED.pix_nome,
    dinheiro_ativo = EXCLUDED.dinheiro_ativo,
    credito_ativo = EXCLUDED.credito_ativo,
    debito_ativo = EXCLUDED.debito_ativo,
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION fn_salvar_formas_pagamento(BOOLEAN, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_salvar_formas_pagamento(BOOLEAN, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- ============================================================
-- 2) Pagamento no agendamento
-- ============================================================
-- Colunas sem default ao criar: os agendamentos antigos ficam NULL
-- ("Não informada"); o default 'pendente' vale só pros novos.
ALTER TABLE agendamento ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
ALTER TABLE agendamento ADD COLUMN IF NOT EXISTS status_pagamento TEXT;
ALTER TABLE agendamento ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ;
ALTER TABLE agendamento ALTER COLUMN status_pagamento SET DEFAULT 'pendente';

ALTER TABLE agendamento DROP CONSTRAINT IF EXISTS agendamento_forma_pagamento_check;
ALTER TABLE agendamento ADD CONSTRAINT agendamento_forma_pagamento_check
  CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito'));
ALTER TABLE agendamento DROP CONSTRAINT IF EXISTS agendamento_status_pagamento_check;
ALTER TABLE agendamento ADD CONSTRAINT agendamento_status_pagamento_check
  CHECK (status_pagamento IN ('pendente', 'pago', 'cancelado'));

CREATE INDEX IF NOT EXISTS idx_agendamento_pagamento ON agendamento(id_lojista, dt_agendamento, forma_pagamento);

-- Todo agendamento novo nasce com forma de pagamento (a da transação,
-- guardada pela função "_com_pagamento") — e aceita pela loja.
CREATE OR REPLACE FUNCTION fn_trg_agendamento_pagamento_novo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.forma_pagamento IS NULL THEN
    NEW.forma_pagamento := NULLIF(current_setting('petsaas.forma_pagamento', TRUE), '');
  END IF;
  IF NEW.forma_pagamento IS NULL THEN
    RAISE EXCEPTION 'Pagamento: escolha a forma de pagamento.';
  END IF;
  IF NOT fn_forma_pagamento_aceita(NEW.id_lojista, NEW.forma_pagamento) THEN
    RAISE EXCEPTION 'Pagamento: esta loja não aceita essa forma de pagamento.';
  END IF;

  NEW.status_pagamento := COALESCE(NULLIF(current_setting('petsaas.status_pagamento', TRUE), ''), NEW.status_pagamento, 'pendente');
  IF NEW.status_pagamento = 'pago' THEN
    NEW.pago_em := COALESCE(NEW.pago_em, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_pagamento_novo ON agendamento;
CREATE TRIGGER trg_agendamento_pagamento_novo
  BEFORE INSERT ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_trg_agendamento_pagamento_novo();

-- Serviço cancelado com pagamento ainda pendente: o pagamento dele também.
CREATE OR REPLACE FUNCTION fn_trg_agendamento_pagamento_cancelado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'Cancelado' AND OLD.status IS DISTINCT FROM 'Cancelado' AND NEW.status_pagamento = 'pendente' THEN
    NEW.status_pagamento := 'cancelado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_pagamento_cancelado ON agendamento;
CREATE TRIGGER trg_agendamento_pagamento_cancelado
  BEFORE UPDATE OF status ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_trg_agendamento_pagamento_cancelado();

-- Guarda a forma (e o status) pra transação atual.
CREATE OR REPLACE FUNCTION fn_definir_pagamento_transacao(p_forma TEXT, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_forma IS NULL OR p_forma NOT IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito') THEN
    RAISE EXCEPTION 'Pagamento: escolha a forma de pagamento.';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pendente', 'pago') THEN
    RAISE EXCEPTION 'Pagamento: status inválido.';
  END IF;
  PERFORM set_config('petsaas.forma_pagamento', p_forma, TRUE);
  PERFORM set_config('petsaas.status_pagamento', p_status, TRUE);
END;
$$;

REVOKE ALL ON FUNCTION fn_definir_pagamento_transacao(TEXT, TEXT) FROM PUBLIC;

-- ============================================================
-- 3) Criação com pagamento (uma por função de criação)
-- ============================================================
-- Cliente: sempre "pendente". Loja: pendente ou pago.

CREATE OR REPLACE FUNCTION fn_criar_agendamento_com_pagamento(
  p_forma_pagamento TEXT,
  p_id_pet          UUID,
  p_id_servico      UUID,
  p_id_cliente      UUID,
  p_id_lojista      UUID,
  p_data            DATE,
  p_hora            TIME,
  p_obs             TEXT DEFAULT NULL,
  p_produtos        UUID[] DEFAULT NULL,
  p_quantidades     NUMERIC[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM fn_definir_pagamento_transacao(p_forma_pagamento, 'pendente');
  RETURN fn_criar_agendamento(p_id_pet, p_id_servico, p_id_cliente, p_id_lojista, p_data, p_hora, p_obs, p_produtos, p_quantidades);
END;
$$;

CREATE OR REPLACE FUNCTION fn_criar_agendamento_multiplo_com_pagamento(
  p_forma_pagamento TEXT,
  p_id_pet          UUID,
  p_id_cliente      UUID,
  p_id_lojista      UUID,
  p_data            DATE,
  p_hora_inicio     TIME,
  p_servicos        UUID[],
  p_id_funcionario  UUID DEFAULT NULL,
  p_obs             TEXT DEFAULT NULL,
  p_produtos        UUID[] DEFAULT NULL,
  p_quantidades     NUMERIC[] DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM fn_definir_pagamento_transacao(p_forma_pagamento, 'pendente');
  RETURN fn_criar_agendamento_multiplo(p_id_pet, p_id_cliente, p_id_lojista, p_data, p_hora_inicio, p_servicos, p_id_funcionario, p_obs, p_produtos, p_quantidades);
END;
$$;

CREATE OR REPLACE FUNCTION fn_criar_agendamento_lojista_com_pagamento(
  p_forma_pagamento  TEXT,
  p_status_pagamento TEXT,
  p_id_lojista       UUID,
  p_id_cliente       UUID,
  p_id_pet           UUID,
  p_id_servico       UUID,
  p_data             DATE,
  p_hora             TIME,
  p_obs              TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM fn_definir_pagamento_transacao(p_forma_pagamento, COALESCE(p_status_pagamento, 'pendente'));
  RETURN fn_criar_agendamento_lojista(p_id_lojista, p_id_cliente, p_id_pet, p_id_servico, p_data, p_hora, p_obs);
END;
$$;

CREATE OR REPLACE FUNCTION fn_criar_agendamento_com_taxidog_com_pagamento(
  p_forma_pagamento    TEXT,
  p_id_pet             UUID,
  p_id_servico         UUID,
  p_id_cliente         UUID,
  p_id_lojista         UUID,
  p_data               DATE,
  p_hora               TIME,
  p_obs                TEXT,
  p_produtos           UUID[],
  p_quantidades        NUMERIC[],
  p_tx_modalidade      TEXT,
  p_tx_cep             TEXT,
  p_tx_logradouro      TEXT,
  p_tx_numero          TEXT,
  p_tx_complemento     TEXT,
  p_tx_bairro          TEXT,
  p_tx_cidade          TEXT,
  p_tx_uf              TEXT,
  p_tx_lat             DOUBLE PRECISION,
  p_tx_lng             DOUBLE PRECISION,
  p_tx_id_funcionario  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM fn_definir_pagamento_transacao(p_forma_pagamento, 'pendente');
  RETURN fn_criar_agendamento_com_taxidog(
    p_id_pet, p_id_servico, p_id_cliente, p_id_lojista, p_data, p_hora, p_obs, p_produtos, p_quantidades,
    p_tx_modalidade, p_tx_cep, p_tx_logradouro, p_tx_numero, p_tx_complemento, p_tx_bairro, p_tx_cidade, p_tx_uf,
    p_tx_lat, p_tx_lng, p_tx_id_funcionario
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_criar_agendamento_multiplo_com_taxidog_com_pagamento(
  p_forma_pagamento    TEXT,
  p_id_pet             UUID,
  p_id_cliente         UUID,
  p_id_lojista         UUID,
  p_data               DATE,
  p_hora_inicio        TIME,
  p_servicos           UUID[],
  p_id_funcionario     UUID,
  p_obs                TEXT,
  p_produtos           UUID[],
  p_quantidades        NUMERIC[],
  p_tx_modalidade      TEXT,
  p_tx_cep             TEXT,
  p_tx_logradouro      TEXT,
  p_tx_numero          TEXT,
  p_tx_complemento     TEXT,
  p_tx_bairro          TEXT,
  p_tx_cidade          TEXT,
  p_tx_uf              TEXT,
  p_tx_lat             DOUBLE PRECISION,
  p_tx_lng             DOUBLE PRECISION,
  p_tx_id_funcionario  UUID DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM fn_definir_pagamento_transacao(p_forma_pagamento, 'pendente');
  RETURN fn_criar_agendamento_multiplo_com_taxidog(
    p_id_pet, p_id_cliente, p_id_lojista, p_data, p_hora_inicio, p_servicos, p_id_funcionario, p_obs, p_produtos, p_quantidades,
    p_tx_modalidade, p_tx_cep, p_tx_logradouro, p_tx_numero, p_tx_complemento, p_tx_bairro, p_tx_cidade, p_tx_uf,
    p_tx_lat, p_tx_lng, p_tx_id_funcionario
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_criar_agendamento_lojista_com_taxidog_com_pagamento(
  p_forma_pagamento    TEXT,
  p_status_pagamento   TEXT,
  p_id_lojista         UUID,
  p_id_cliente         UUID,
  p_id_pet             UUID,
  p_id_servico         UUID,
  p_data               DATE,
  p_hora               TIME,
  p_obs                TEXT,
  p_tx_modalidade      TEXT,
  p_tx_cep             TEXT,
  p_tx_logradouro      TEXT,
  p_tx_numero          TEXT,
  p_tx_complemento     TEXT,
  p_tx_bairro          TEXT,
  p_tx_cidade          TEXT,
  p_tx_uf              TEXT,
  p_tx_lat             DOUBLE PRECISION,
  p_tx_lng             DOUBLE PRECISION,
  p_tx_id_funcionario  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM fn_definir_pagamento_transacao(p_forma_pagamento, COALESCE(p_status_pagamento, 'pendente'));
  RETURN fn_criar_agendamento_lojista_com_taxidog(
    p_id_lojista, p_id_cliente, p_id_pet, p_id_servico, p_data, p_hora, p_obs,
    p_tx_modalidade, p_tx_cep, p_tx_logradouro, p_tx_numero, p_tx_complemento, p_tx_bairro, p_tx_cidade, p_tx_uf,
    p_tx_lat, p_tx_lng, p_tx_id_funcionario
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_agendamento_com_pagamento(TEXT, UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_criar_agendamento_multiplo_com_pagamento(TEXT, UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_criar_agendamento_lojista_com_pagamento(TEXT, TEXT, UUID, UUID, UUID, UUID, DATE, TIME, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_criar_agendamento_com_taxidog_com_pagamento(TEXT, UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_criar_agendamento_multiplo_com_taxidog_com_pagamento(TEXT, UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_criar_agendamento_lojista_com_taxidog_com_pagamento(TEXT, TEXT, UUID, UUID, UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION fn_criar_agendamento_com_pagamento(TEXT, UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[]) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_multiplo_com_pagamento(TEXT, UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[]) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_lojista_com_pagamento(TEXT, TEXT, UUID, UUID, UUID, UUID, DATE, TIME, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_com_taxidog_com_pagamento(TEXT, UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_multiplo_com_taxidog_com_pagamento(TEXT, UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_lojista_com_taxidog_com_pagamento(TEXT, TEXT, UUID, UUID, UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID) TO authenticated;

-- fn_definir_pagamento_transacao é chamada pelas funções acima com o
-- papel de quem chama.
GRANT EXECUTE ON FUNCTION fn_definir_pagamento_transacao(TEXT, TEXT) TO authenticated;

-- ============================================================
-- 4) Atualizar o pagamento de um pedido (loja)
-- ============================================================
-- Vale pro pedido inteiro: os agendamentos criados juntos (mesmo pet,
-- loja, dia e created_at). Serviço cancelado fica de fora.
CREATE OR REPLACE FUNCTION fn_atualizar_pagamento(p_id_agendamento UUID, p_forma TEXT, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a agendamento%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM agendamento WHERE id_agendamento = p_id_agendamento;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;
  IF auth_lojista_id() IS DISTINCT FROM v_a.id_lojista OR NOT (
    auth_role() = 'lojista'
    OR EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND ativo = TRUE AND (pode_gerenciar_agenda OR acesso_total))
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar o pagamento';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pendente', 'pago', 'cancelado') THEN
    RAISE EXCEPTION 'Status de pagamento inválido';
  END IF;
  IF p_forma IS NOT NULL AND p_forma IS DISTINCT FROM v_a.forma_pagamento AND NOT fn_forma_pagamento_aceita(v_a.id_lojista, p_forma) THEN
    RAISE EXCEPTION 'Esta loja não aceita essa forma de pagamento';
  END IF;

  UPDATE agendamento a
  SET forma_pagamento = COALESCE(p_forma, a.forma_pagamento),
      status_pagamento = COALESCE(p_status, a.status_pagamento, 'pendente'),
      pago_em = CASE
        WHEN COALESCE(p_status, a.status_pagamento) = 'pago' THEN COALESCE(a.pago_em, NOW())
        ELSE NULL
      END
  WHERE a.id_lojista = v_a.id_lojista AND a.id_pet = v_a.id_pet
    AND a.dt_agendamento = v_a.dt_agendamento AND a.created_at = v_a.created_at
    AND a.status <> 'Cancelado';
END;
$$;

REVOKE ALL ON FUNCTION fn_atualizar_pagamento(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_atualizar_pagamento(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 5) Relatório de Vendas: por forma de pagamento
-- ============================================================
-- Pedidos no período (data do agendamento), sem os cancelados. "total" =
-- registrado; "recebido" = pago; "pendente" = a receber.
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_por_pagamento(
  p_id_lojista UUID,
  p_data_ini   DATE,
  p_data_fim   DATE
)
RETURNS TABLE (
  forma     TEXT,
  pedidos   BIGINT,
  total     NUMERIC,
  recebido  NUMERIC,
  pendente  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(a.forma_pagamento, 'nao_informada')::TEXT,
    COUNT(DISTINCT a.id_pet::TEXT || '|' || a.dt_agendamento::TEXT || '|' || a.created_at::TEXT),
    COALESCE(SUM(a.valor), 0)::NUMERIC,
    COALESCE(SUM(a.valor) FILTER (WHERE a.status_pagamento = 'pago'), 0)::NUMERIC,
    COALESCE(SUM(a.valor) FILTER (WHERE a.status_pagamento = 'pendente'), 0)::NUMERIC
  FROM agendamento a
  WHERE a.id_lojista = p_id_lojista
    AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
    AND a.status <> 'Cancelado'
    AND a.status_pagamento IS DISTINCT FROM 'cancelado'
  GROUP BY 1
  ORDER BY 3 DESC;
END;
$$;

REVOKE ALL ON FUNCTION fn_relatorio_vendas_por_pagamento(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_por_pagamento(UUID, DATE, DATE) TO authenticated;

-- ============================================================
-- 6) Página pública "Acompanhar agendamento": + pagamento (e Pix)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_acompanhar_agendamento(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a     agendamento%ROWTYPE;
  v_forma JSONB;
BEGIN
  SELECT * INTO v_a FROM agendamento WHERE id_agendamento = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_forma := fn_formas_pagamento_loja(v_a.id_lojista);

  RETURN jsonb_build_object(
    'data', v_a.dt_agendamento,
    'loja', (
      SELECT jsonb_build_object(
        'nome', l.nome_loja,
        'logo_url', l.logo_url,
        'telefone', l.telefone,
        'endereco', l.endereco,
        'numero', l.numero,
        'complemento', l.complemento,
        'bairro', l.bairro,
        'cidade', l.cidade,
        'estado', l.estado
      )
      FROM lojista l WHERE l.id_lojista = v_a.id_lojista
    ),
    'pet', (
      SELECT jsonb_build_object('nome', p.nome, 'foto_url', p.foto_url)
      FROM pet p WHERE p.id_pet = v_a.id_pet
    ),
    'servicos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'nome', s.nome,
        'hora', a.hr_agendamento,
        'duracao', s.duracao,
        'status', a.status,
        'valor', a.valor
      ) ORDER BY a.hr_agendamento), '[]'::jsonb)
      FROM agendamento a
      JOIN servico s ON s.id_servico = a.id_servico
      WHERE a.id_lojista = v_a.id_lojista AND a.id_pet = v_a.id_pet
        AND a.dt_agendamento = v_a.dt_agendamento AND a.created_at = v_a.created_at
    ),
    'taxidog', (
      SELECT jsonb_build_object(
        'modalidade', c.modalidade,
        'status', c.status,
        'valor', c.valor,
        'tem_taxidog', c.id_funcionario IS NOT NULL
      )
      FROM taxidog_corrida c
      JOIN agendamento a ON a.id_agendamento = c.id_agendamento
      WHERE a.id_lojista = v_a.id_lojista AND a.id_pet = v_a.id_pet
        AND a.dt_agendamento = v_a.dt_agendamento AND a.created_at = v_a.created_at
        AND c.status <> 'cancelada'
      ORDER BY (c.status <> 'concluida') DESC, c.created_at DESC
      LIMIT 1
    ),
    'pagamento', jsonb_build_object(
      'forma', v_a.forma_pagamento,
      'status', v_a.status_pagamento,
      -- Chave Pix só enquanto o pagamento está pendente.
      'pix_chave', CASE WHEN v_a.forma_pagamento = 'pix' AND v_a.status_pagamento = 'pendente' THEN v_forma ->> 'pix_chave' END,
      'pix_nome', CASE WHEN v_a.forma_pagamento = 'pix' AND v_a.status_pagamento = 'pendente' THEN v_forma ->> 'pix_nome' END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_acompanhar_agendamento(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_acompanhar_agendamento(UUID) TO anon, authenticated;
