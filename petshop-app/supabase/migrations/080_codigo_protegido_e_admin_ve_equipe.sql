-- ============================================================
-- PETSHOP SaaS - Migration 080: código de acesso em tabela protegida
-- e administrador enxergando a equipe
-- ============================================================
-- Dois problemas ligados:
--
-- 1. Um administrador (funcionário com acesso_total) só enxergava a própria
--    linha de `funcionario`: a policy da migration 030 nunca chegou a valer
--    neste banco. Sem ver a equipe, ele não gerencia ninguém nem gera o
--    código de acesso dos funcionários comuns (liberado na migration 079).
--
-- 2. O código de acesso ficava em colunas de `funcionario`. Assim que o
--    administrador pudesse ler as linhas da equipe, leria também o código
--    ativo dos outros — inclusive de outro administrador, que ele não pode
--    gerar. O código passa para uma tabela própria que ninguém lê pela API:
--    só a função que gera (SECURITY DEFINER) e o servidor (service_role).
--
-- Está em duas partes de propósito. O banco é o mesmo do site no ar: a
-- PARTE 1 não remove nada e ainda grava o código no lugar antigo (o código
-- já publicado continua funcionando); a PARTE 2 só roda depois que o código
-- novo está publicado. Num banco novo, pode rodar o arquivo inteiro.

-- ============================================================
-- PARTE 1 — tabela nova, gravando nos dois lugares
-- ============================================================

CREATE TABLE IF NOT EXISTS funcionario_codigo_acesso (
  id_funcionario  UUID PRIMARY KEY REFERENCES funcionario(id_funcionario) ON DELETE CASCADE,
  -- O login procura só pelo código, então não pode haver dois iguais.
  codigo          TEXT NOT NULL UNIQUE CHECK (codigo ~ '^\d{6}$'),
  expira_em       TIMESTAMPTZ NOT NULL
);

-- Sem policy nenhuma: pela API, ninguém lê nem grava.
ALTER TABLE funcionario_codigo_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionario_codigo_acesso FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE funcionario_codigo_acesso FROM PUBLIC, anon, authenticated;

-- Mesma regra da migration 079 (titular gera pra qualquer um; administrador
-- só pra funcionário comum). Muda onde o código é guardado: na tabela nova
-- e, só nesta parte 1, também nas colunas antigas.
CREATE OR REPLACE FUNCTION fn_gerar_codigo_acesso_funcionario(p_id_funcionario UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo TEXT;
  v_expiracao TIMESTAMPTZ := NOW() + INTERVAL '1 minute';
  v_loja UUID;
  v_alvo_admin BOOLEAN;
BEGIN
  SELECT id_lojista, acesso_total INTO v_loja, v_alvo_admin
  FROM funcionario
  WHERE id_funcionario = p_id_funcionario AND ativo;

  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado ou inativo.' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_loja THEN
    IF NOT EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid()
        AND id_lojista = v_loja
        AND ativo
        AND acesso_total
    ) THEN
      RAISE EXCEPTION 'Funcionário não encontrado ou inativo.' USING ERRCODE = '42501';
    END IF;

    IF v_alvo_admin OR p_id_funcionario = auth.uid() THEN
      RAISE EXCEPTION 'Apenas o responsável pela conta pode gerar o código de um administrador.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Libera os códigos vencidos (de qualquer loja) pra não ocuparem números.
  DELETE FROM funcionario_codigo_acesso WHERE expira_em < NOW();
  UPDATE funcionario
  SET codigo_login = NULL, codigo_login_expiracao = NULL
  WHERE codigo_login IS NOT NULL
    AND codigo_login_expiracao < NOW();

  LOOP
    v_codigo := lpad(
      (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint % 1000000)::text,
      6, '0'
    );
    BEGIN
      INSERT INTO funcionario_codigo_acesso (id_funcionario, codigo, expira_em)
      VALUES (p_id_funcionario, v_codigo, v_expiracao)
      ON CONFLICT (id_funcionario)
      DO UPDATE SET codigo = EXCLUDED.codigo, expira_em = EXCLUDED.expira_em;

      UPDATE funcionario
      SET codigo_login = v_codigo, codigo_login_expiracao = v_expiracao
      WHERE id_funcionario = p_id_funcionario;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Número já em uso por outro funcionário: sorteia outro.
    END;
  END LOOP;

  RETURN jsonb_build_object('codigo', v_codigo, 'expiracao', v_expiracao);
END;
$$;

-- ============================================================
-- PARTE 2 — só a tabela nova; administrador enxerga a equipe
-- ============================================================

CREATE OR REPLACE FUNCTION fn_gerar_codigo_acesso_funcionario(p_id_funcionario UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo TEXT;
  v_expiracao TIMESTAMPTZ := NOW() + INTERVAL '1 minute';
  v_loja UUID;
  v_alvo_admin BOOLEAN;
BEGIN
  SELECT id_lojista, acesso_total INTO v_loja, v_alvo_admin
  FROM funcionario
  WHERE id_funcionario = p_id_funcionario AND ativo;

  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado ou inativo.' USING ERRCODE = '42501';
  END IF;

  -- O titular é o próprio id da loja. Quem não é titular precisa ser um
  -- administrador ativo desta mesma loja, e só gera pra funcionário comum
  -- (nunca pra outro administrador nem pra ele mesmo).
  IF auth.uid() IS DISTINCT FROM v_loja THEN
    IF NOT EXISTS (
      SELECT 1 FROM funcionario
      WHERE id_funcionario = auth.uid()
        AND id_lojista = v_loja
        AND ativo
        AND acesso_total
    ) THEN
      RAISE EXCEPTION 'Funcionário não encontrado ou inativo.' USING ERRCODE = '42501';
    END IF;

    IF v_alvo_admin OR p_id_funcionario = auth.uid() THEN
      RAISE EXCEPTION 'Apenas o responsável pela conta pode gerar o código de um administrador.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Libera os códigos vencidos (de qualquer loja) pra não ocuparem números.
  DELETE FROM funcionario_codigo_acesso WHERE expira_em < NOW();

  LOOP
    -- 6 dígitos a partir de gen_random_uuid() (aleatório forte), não de
    -- random(): o código sozinho é a credencial de entrada.
    v_codigo := lpad(
      (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint % 1000000)::text,
      6, '0'
    );
    BEGIN
      INSERT INTO funcionario_codigo_acesso (id_funcionario, codigo, expira_em)
      VALUES (p_id_funcionario, v_codigo, v_expiracao)
      ON CONFLICT (id_funcionario)
      DO UPDATE SET codigo = EXCLUDED.codigo, expira_em = EXCLUDED.expira_em;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Número já em uso por outro funcionário: sorteia outro.
    END;
  END LOOP;

  RETURN jsonb_build_object('codigo', v_codigo, 'expiracao', v_expiracao);
END;
$$;

-- O índice idx_funcionario_codigo_login sai junto com a coluna.
ALTER TABLE funcionario
  DROP COLUMN IF EXISTS codigo_login,
  DROP COLUMN IF EXISTS codigo_login_expiracao;

-- Loja do administrador que está chamando (NULL pra quem não é
-- administrador ativo). SECURITY DEFINER: lê `funcionario` sem passar pelo
-- RLS — é o que permite usá-la numa policy da própria tabela sem a policy
-- chamar a si mesma (a forma da migration 030, com subconsulta, entraria
-- em recursão).
CREATE OR REPLACE FUNCTION auth_admin_lojista_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id_lojista FROM funcionario
  WHERE id_funcionario = auth.uid() AND ativo = TRUE AND acesso_total = TRUE;
$$;

REVOKE ALL ON FUNCTION auth_admin_lojista_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION auth_admin_lojista_id() TO authenticated;

-- O administrador passa a ter a mesma visão do titular sobre a equipe da
-- própria loja (só leitura; gravar continua pelas actions do painel).
DROP POLICY IF EXISTS "funcionario: administrador ve equipe" ON funcionario;
CREATE POLICY "funcionario: administrador ve equipe"
  ON funcionario FOR SELECT
  USING (id_lojista = auth_admin_lojista_id());
