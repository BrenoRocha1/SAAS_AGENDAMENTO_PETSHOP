-- ============================================================
-- PETSHOP SaaS - Migration 079: funcionário sem e-mail e sem telefone
-- ============================================================
-- O funcionário entra só pelo código de acesso rápido (migrations 077 e
-- 078), então e-mail e telefone saem de vez do cadastro dele: das telas,
-- das funções e da tabela.
--
-- E, como o código virou o único jeito de entrar, um administrador da
-- equipe também passa a poder gerá-lo — só para funcionário comum — para
-- a loja não depender do titular estar presente.
--
-- Está em duas partes de propósito. O banco é o mesmo do site no ar: a
-- PARTE 1 não remove nada (o código antigo continua funcionando) e a
-- PARTE 2, que remove, só roda depois que o código novo está publicado.
-- Num banco novo, pode rodar o arquivo inteiro de uma vez.

-- ============================================================
-- PARTE 1 — funções que não dependem mais das colunas
-- ============================================================

-- Cadastro de funcionário sem e-mail e sem telefone. É uma assinatura
-- nova (10 argumentos); a antiga, de 12, sai na parte 2.
CREATE OR REPLACE FUNCTION fn_registrar_funcionario(
  p_id_funcionario      UUID,
  p_id_lojista          UUID,
  p_nome                TEXT,
  p_cargo               TEXT DEFAULT NULL,
  p_pode_agenda         BOOLEAN DEFAULT TRUE,
  p_pode_servicos       BOOLEAN DEFAULT FALSE,
  p_pode_clientes_pets  BOOLEAN DEFAULT FALSE,
  p_acesso_total        BOOLEAN DEFAULT FALSE,
  p_pode_produtos       BOOLEAN DEFAULT FALSE,
  p_pode_taxidog        BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado: apenas o lojista ou um administrador pode cadastrar membros';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 2 THEN
    RAISE EXCEPTION 'Nome do membro inválido';
  END IF;

  INSERT INTO funcionario (
    id_funcionario, id_lojista, nome, cargo,
    pode_gerenciar_agenda, pode_gerenciar_servicos, pode_gerenciar_clientes_pets,
    acesso_total, pode_gerenciar_produtos, pode_taxidog
  ) VALUES (
    p_id_funcionario, p_id_lojista, trim(p_nome), NULLIF(trim(p_cargo), ''),
    p_pode_agenda, p_pode_servicos, p_pode_clientes_pets,
    p_acesso_total, p_pode_produtos, p_pode_taxidog
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- Cadastro de cliente pela loja: o corpo é o da migration 035, sem a
-- checagem "este e-mail já é de um funcionário" (funcionário não tem mais
-- e-mail). Mesma assinatura, então os GRANTs continuam valendo.
CREATE OR REPLACE FUNCTION fn_registrar_cliente_lojista(
  p_id_cliente  UUID,
  p_id_lojista  UUID,
  p_nome        TEXT,
  p_cpf         TEXT,
  p_email       TEXT,
  p_telefone    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado: apenas o lojista ou um administrador pode cadastrar clientes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 2 THEN
    RAISE EXCEPTION 'Nome do cliente inválido';
  END IF;

  IF p_cpf IS NULL OR p_cpf !~ '^\d{11}$' THEN
    RAISE EXCEPTION 'CPF inválido';
  END IF;

  IF p_email IS NULL OR p_email !~* '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  IF p_telefone IS NULL OR p_telefone !~ '^\d{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  IF EXISTS (SELECT 1 FROM cliente WHERE cpf = p_cpf) THEN
    RAISE EXCEPTION 'cpf_already_exists: Este CPF já está cadastrado';
  END IF;

  IF EXISTS (SELECT 1 FROM cliente WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como cliente';
  END IF;

  IF EXISTS (SELECT 1 FROM lojista WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como lojista';
  END IF;

  INSERT INTO cliente (id_cliente, nome, cpf, email, telefone)
  VALUES (p_id_cliente, trim(p_nome), p_cpf, lower(trim(p_email)), p_telefone);

  INSERT INTO cliente_lojista (id_cliente, id_lojista)
  VALUES (p_id_cliente, p_id_lojista)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Código de acesso rápido: além do titular, um administrador ativo da
-- loja também gera — mas só para funcionário comum (nunca para outro
-- administrador nem para ele mesmo). O resto é o corpo da migration 077.
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
  -- administrador ativo desta mesma loja.
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
  UPDATE funcionario
  SET codigo_login = NULL, codigo_login_expiracao = NULL
  WHERE codigo_login IS NOT NULL
    AND codigo_login_expiracao < NOW();

  LOOP
    -- 6 dígitos a partir de gen_random_uuid() (aleatório forte), não de
    -- random(): o código sozinho é a credencial de entrada.
    v_codigo := lpad(
      (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint % 1000000)::text,
      6, '0'
    );
    BEGIN
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
-- PARTE 2 — remove a função antiga e as colunas
-- ============================================================

DROP FUNCTION IF EXISTS fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN);

-- O índice idx_funcionario_email e a restrição de e-mail único saem junto
-- com a coluna.
ALTER TABLE funcionario
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS telefone;
