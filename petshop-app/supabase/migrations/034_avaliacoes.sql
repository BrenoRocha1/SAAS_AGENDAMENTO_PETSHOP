-- ============================================================
-- PETSHOP SaaS - Migration 034: Avaliações de clientes
-- ============================================================
-- O cliente avalia um atendimento JÁ FINALIZADO (status 'Concluído' —
-- ver migration 032 pras 4 etapas) com nota de 1 a 5 e um comentário
-- opcional. Uma avaliação por atendimento, garantido por UNIQUE.
--
-- Decisões de modelagem (seguindo o que o resto do schema já faz):
--
-- • As chaves de loja/cliente/pet/serviço/profissional ficam guardadas
--   na própria linha, e não só via JOIN com agendamento. É a mesma
--   desnormalização que `agendamento` já usa (ele guarda id_lojista
--   mesmo dando pra chegar nele por pet → cliente → cliente_lojista):
--   deixa as policies de RLS diretas (id_lojista = auth_lojista_id())
--   e evita JOIN em toda agregação. Quem preenche esses campos é a
--   função fn_criar_avaliacao, copiando do agendamento — o cliente
--   nunca escolhe, então não tem como forjar loja/pet de outra pessoa.
--
-- • Nenhuma policy de INSERT/UPDATE/DELETE: toda escrita passa pelas
--   funções SECURITY DEFINER abaixo, que validam dono e status. Mesma
--   ideia de "audit_log: no insert direto" e "funcionario: no delete".
--
-- • Toda checagem de dono/loja usa IS DISTINCT FROM, não !=. Com !=,
--   um NULL (ex.: auth_lojista_id() de um CLIENTE logado, que não é
--   lojista nem funcionário) vira NULL em vez de true, o IF não entra
--   e a função seguiria em frente — um cliente conseguiria ler as
--   avaliações de qualquer loja. IS DISTINCT FROM trata NULL como
--   "diferente" e barra.
--
-- • Edição é permitida (o cliente pode corrigir a própria avaliação) e
--   fica registrada no audit_log, que já existe pra agendamento — não
--   foi preciso criar infraestrutura de histórico nova.
-- ============================================================

CREATE TABLE IF NOT EXISTS avaliacao (
  id_avaliacao   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- UNIQUE: é isto que garante "uma avaliação por atendimento".
  id_agendamento UUID NOT NULL UNIQUE REFERENCES agendamento(id_agendamento) ON DELETE CASCADE,
  id_lojista     UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE RESTRICT,
  id_cliente     UUID NOT NULL REFERENCES cliente(id_cliente) ON DELETE RESTRICT,
  id_pet         UUID NOT NULL REFERENCES pet(id_pet) ON DELETE RESTRICT,
  id_servico     UUID NOT NULL REFERENCES servico(id_servico) ON DELETE RESTRICT,
  -- Profissional é opcional no agendamento, então também é aqui. Se o
  -- funcionário for excluído depois, a avaliação continua existindo.
  id_funcionario UUID REFERENCES funcionario(id_funcionario) ON DELETE SET NULL,
  -- Só inteiro de 1 a 5: SMALLINT já barra 3.5, o CHECK barra 0 e 6.
  nota           SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  -- Mesmo limite de texto livre que agendamento.obs usa.
  comentario     TEXT CHECK (char_length(comentario) <= 500),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_avaliacao_lojista     ON avaliacao(id_lojista, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avaliacao_cliente     ON avaliacao(id_cliente, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avaliacao_servico     ON avaliacao(id_lojista, id_servico);
CREATE INDEX IF NOT EXISTS idx_avaliacao_funcionario ON avaliacao(id_lojista, id_funcionario);

DROP TRIGGER IF EXISTS trg_avaliacao_updated_at ON avaliacao;
CREATE TRIGGER trg_avaliacao_updated_at
  BEFORE UPDATE ON avaliacao
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Auditoria — mesma estrutura de fn_audit_agendamento (migration 001).
CREATE OR REPLACE FUNCTION fn_audit_avaliacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tabela, operacao, id_registro, id_usuario, dados_depois)
    VALUES ('avaliacao', 'INSERT', NEW.id_avaliacao, auth.uid(), to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (tabela, operacao, id_registro, id_usuario, dados_antes, dados_depois)
    VALUES ('avaliacao', 'UPDATE', NEW.id_avaliacao, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (tabela, operacao, id_registro, id_usuario, dados_antes)
    VALUES ('avaliacao', 'DELETE', OLD.id_avaliacao, auth.uid(), to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_avaliacao ON avaliacao;
CREATE TRIGGER trg_audit_avaliacao
  AFTER INSERT OR UPDATE OR DELETE ON avaliacao
  FOR EACH ROW EXECUTE FUNCTION fn_audit_avaliacao();

-- ============================================================
-- RLS — só leitura; escrita é exclusivamente pelas funções abaixo
-- ============================================================
ALTER TABLE avaliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacao FORCE ROW LEVEL SECURITY;

-- Cliente vê (e só vê) as avaliações que ele mesmo escreveu.
DROP POLICY IF EXISTS "avaliacao: cliente ve proprias" ON avaliacao;
CREATE POLICY "avaliacao: cliente ve proprias"
  ON avaliacao FOR SELECT
  USING (id_cliente = auth.uid());

-- Lojista vê as avaliações recebidas pela loja dele.
DROP POLICY IF EXISTS "avaliacao: lojista ve da loja" ON avaliacao;
CREATE POLICY "avaliacao: lojista ve da loja"
  ON avaliacao FOR SELECT
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista');

-- Funcionário vê as da loja onde trabalha (isolamento por auth_lojista_id).
DROP POLICY IF EXISTS "avaliacao: funcionario ve da loja" ON avaliacao;
CREATE POLICY "avaliacao: funcionario ve da loja"
  ON avaliacao FOR SELECT
  USING (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id());

-- Sem policy de INSERT/UPDATE/DELETE de propósito: a tela pública lê por
-- RPC curada (fn_avaliacoes_publicas), e toda escrita passa por
-- fn_criar_avaliacao / fn_editar_avaliacao.

-- ============================================================
-- FUNÇÃO: criar avaliação (cliente)
-- ============================================================
-- O cliente manda SÓ id_agendamento + nota + comentário. Loja, pet,
-- serviço e profissional são copiados do próprio agendamento, então não
-- existe como avaliar em nome de outra loja/pet nem forjar vínculo.
CREATE OR REPLACE FUNCTION fn_criar_avaliacao(
  p_id_agendamento UUID,
  p_nota           SMALLINT,
  p_comentario     TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag          agendamento%ROWTYPE;
  v_id_avaliacao UUID;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  -- Dono do atendimento: ninguém avalia atendimento de outra pessoa.
  IF v_ag.id_cliente IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  -- Só atendimento finalizado — pendente/aceito/em andamento/cancelado não.
  IF v_ag.status != 'Concluído' THEN
    RAISE EXCEPTION 'Só é possível avaliar um atendimento finalizado';
  END IF;

  IF p_nota IS NULL OR p_nota < 1 OR p_nota > 5 THEN
    RAISE EXCEPTION 'A nota precisa ser de 1 a 5';
  END IF;

  INSERT INTO avaliacao (
    id_agendamento, id_lojista, id_cliente, id_pet, id_servico, id_funcionario, nota, comentario
  )
  VALUES (
    v_ag.id_agendamento, v_ag.id_lojista, v_ag.id_cliente, v_ag.id_pet, v_ag.id_servico,
    v_ag.id_funcionario, p_nota, NULLIF(btrim(COALESCE(p_comentario, '')), '')
  )
  RETURNING id_avaliacao INTO v_id_avaliacao;

  RETURN v_id_avaliacao;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_avaliacao(UUID, SMALLINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_avaliacao(UUID, SMALLINT, TEXT) TO authenticated;

-- ============================================================
-- FUNÇÃO: editar a própria avaliação (cliente)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_editar_avaliacao(
  p_id_avaliacao UUID,
  p_nota         SMALLINT,
  p_comentario   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_cliente UUID;
BEGIN
  SELECT id_cliente INTO v_id_cliente FROM avaliacao WHERE id_avaliacao = p_id_avaliacao;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada';
  END IF;

  IF v_id_cliente IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF p_nota IS NULL OR p_nota < 1 OR p_nota > 5 THEN
    RAISE EXCEPTION 'A nota precisa ser de 1 a 5';
  END IF;

  UPDATE avaliacao
  SET nota = p_nota,
      comentario = NULLIF(btrim(COALESCE(p_comentario, '')), '')
  WHERE id_avaliacao = p_id_avaliacao;
END;
$$;

REVOKE ALL ON FUNCTION fn_editar_avaliacao(UUID, SMALLINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_editar_avaliacao(UUID, SMALLINT, TEXT) TO authenticated;

-- Período: p_data_ini/p_data_fim são dias do calendário da loja; o
-- limite é convertido com AT TIME ZONE 'America/Sao_Paulo' (mesmo
-- cuidado da migration 025) em vez de depender do fuso da sessão, e
-- created_at fica sozinho do lado esquerdo pra continuar usando índice.
-- ============================================================
-- FUNÇÃO: resumo das avaliações da loja (painel do lojista)
-- ============================================================
-- Devolve DOIS blocos separados de propósito:
--   "geral"   = média e total de TODAS as avaliações da loja
--   "periodo" = média, total e distribuição JÁ COM OS FILTROS aplicados
-- Assim a tela mostra "média geral" e "média no período" sem misturar.
-- Média volta NULL (não 0) quando não há avaliação — quem chama decide
-- mostrar "ainda não há avaliações" em vez de uma nota falsa.
CREATE OR REPLACE FUNCTION fn_avaliacoes_resumo_lojista(
  p_id_lojista     UUID,
  p_data_ini       DATE DEFAULT NULL,
  p_data_fim       DATE DEFAULT NULL,
  p_nota           SMALLINT DEFAULT NULL,
  p_id_servico     UUID DEFAULT NULL,
  p_id_funcionario UUID DEFAULT NULL
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
  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT json_build_object(
    'geral', (
      SELECT json_build_object(
        'media', ROUND(AVG(nota)::NUMERIC, 2),
        'total', COUNT(*)
      )
      FROM avaliacao WHERE id_lojista = p_id_lojista
    ),
    'periodo', json_build_object(
      'media',  ROUND(AVG(nota)::NUMERIC, 2),
      'total',  COUNT(*),
      'nota_5', COUNT(*) FILTER (WHERE nota = 5),
      'nota_4', COUNT(*) FILTER (WHERE nota = 4),
      'nota_3', COUNT(*) FILTER (WHERE nota = 3),
      'nota_2', COUNT(*) FILTER (WHERE nota = 2),
      'nota_1', COUNT(*) FILTER (WHERE nota = 1)
    )
  )
  INTO v_result
  FROM avaliacao a
  WHERE a.id_lojista = p_id_lojista
    AND (p_data_ini IS NULL OR a.created_at >= (p_data_ini::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'))
    AND (p_data_fim IS NULL OR a.created_at < ((p_data_fim + 1)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'))
    AND (p_nota IS NULL OR a.nota = p_nota)
    AND (p_id_servico IS NULL OR a.id_servico = p_id_servico)
    AND (p_id_funcionario IS NULL OR a.id_funcionario = p_id_funcionario);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION fn_avaliacoes_resumo_lojista(UUID, DATE, DATE, SMALLINT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_avaliacoes_resumo_lojista(UUID, DATE, DATE, SMALLINT, UUID, UUID) TO authenticated;

-- ============================================================
-- FUNÇÃO: lista paginada das avaliações da loja (painel do lojista)
-- ============================================================
-- total_count via COUNT(*) OVER() — mesmo padrão de fn_buscar_pets_lojista,
-- pra paginar sem uma segunda consulta de contagem.
CREATE OR REPLACE FUNCTION fn_avaliacoes_lojista(
  p_id_lojista     UUID,
  p_data_ini       DATE DEFAULT NULL,
  p_data_fim       DATE DEFAULT NULL,
  p_nota           SMALLINT DEFAULT NULL,
  p_id_servico     UUID DEFAULT NULL,
  p_id_funcionario UUID DEFAULT NULL,
  p_limit          INT DEFAULT 20,
  p_offset         INT DEFAULT 0
)
RETURNS TABLE (
  id_avaliacao    UUID,
  nota            SMALLINT,
  comentario      TEXT,
  created_at      TIMESTAMPTZ,
  id_agendamento  UUID,
  dt_agendamento  DATE,
  hr_agendamento  TIME,
  nome_cliente    TEXT,
  id_cliente      UUID,
  nome_pet        TEXT,
  nome_servico    TEXT,
  nome_funcionario TEXT,
  total_count     BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    a.id_avaliacao, a.nota, a.comentario, a.created_at,
    a.id_agendamento, ag.dt_agendamento, ag.hr_agendamento,
    c.nome, c.id_cliente, p.nome, s.nome, f.nome,
    COUNT(*) OVER() AS total_count
  FROM avaliacao a
  JOIN agendamento ag ON ag.id_agendamento = a.id_agendamento
  JOIN cliente c      ON c.id_cliente = a.id_cliente
  JOIN pet p          ON p.id_pet = a.id_pet
  JOIN servico s      ON s.id_servico = a.id_servico
  LEFT JOIN funcionario f ON f.id_funcionario = a.id_funcionario
  WHERE a.id_lojista = p_id_lojista
    AND (p_data_ini IS NULL OR a.created_at >= (p_data_ini::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'))
    AND (p_data_fim IS NULL OR a.created_at < ((p_data_fim + 1)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'))
    AND (p_nota IS NULL OR a.nota = p_nota)
    AND (p_id_servico IS NULL OR a.id_servico = p_id_servico)
    AND (p_id_funcionario IS NULL OR a.id_funcionario = p_id_funcionario)
  ORDER BY a.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION fn_avaliacoes_lojista(UUID, DATE, DATE, SMALLINT, UUID, UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_avaliacoes_lojista(UUID, DATE, DATE, SMALLINT, UUID, UUID, INT, INT) TO authenticated;

-- ============================================================
-- FUNÇÕES PÚBLICAS — usadas no link público da loja (/agendamento/[id])
-- ============================================================
-- A tabela não tem policy de leitura pra anon de propósito: o que é
-- público passa só por estas duas funções, que devolvem um recorte
-- seguro. Nada de telefone, e-mail, CPF, endereço ou id de cliente —
-- só o PRIMEIRO NOME de quem avaliou (split_part), a nota, o comentário
-- e a data. Mesma ideia do fn_funcionarios_publicos (migration 022).
CREATE OR REPLACE FUNCTION fn_avaliacoes_publicas(
  p_id_lojista UUID,
  p_limit      INT DEFAULT 5
)
RETURNS TABLE (
  nota           SMALLINT,
  comentario     TEXT,
  primeiro_nome  TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.nota, a.comentario, split_part(c.nome, ' ', 1), a.created_at
  FROM avaliacao a
  JOIN cliente c ON c.id_cliente = a.id_cliente
  WHERE a.id_lojista = p_id_lojista
    AND a.comentario IS NOT NULL
  ORDER BY a.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 20);
$$;

REVOKE ALL ON FUNCTION fn_avaliacoes_publicas(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_avaliacoes_publicas(UUID, INT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION fn_avaliacoes_resumo_publico(p_id_lojista UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'media', ROUND(AVG(nota)::NUMERIC, 2),
    'total', COUNT(*)
  )
  FROM avaliacao
  WHERE id_lojista = p_id_lojista;
$$;

REVOKE ALL ON FUNCTION fn_avaliacoes_resumo_publico(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_avaliacoes_resumo_publico(UUID) TO anon, authenticated;
