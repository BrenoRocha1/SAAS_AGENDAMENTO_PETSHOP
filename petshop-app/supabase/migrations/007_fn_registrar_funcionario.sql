-- ============================================================
-- PETSHOP SaaS - Migration 007: fn_registrar_funcionario
-- ============================================================
-- RPC SECURITY DEFINER chamada pelo lojista para registrar
-- um novo funcionário no seu petshop.
--
-- Segurança:
--   1. Valida que auth.uid() == p_id_lojista (só o dono)
--   2. Valida que p_id_lojista existe na tabela lojista
--   3. Defense-in-depth: validações de dados além do Zod
--   4. SET search_path = public (anti schema injection)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_registrar_funcionario(
  p_id_funcionario  UUID,
  p_id_lojista      UUID,
  p_nome            TEXT,
  p_email           TEXT,
  p_telefone        TEXT,
  p_cargo           TEXT DEFAULT NULL,
  p_pode_agenda     BOOLEAN DEFAULT TRUE,
  p_pode_servicos   BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Garantia de segurança: somente o lojista autenticado pode cadastrar
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado: apenas o dono do petshop pode cadastrar funcionários';
  END IF;

  -- Verificar que o lojista existe e está ativo
  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  -- Validações de dados (defense-in-depth)
  IF p_nome IS NULL OR char_length(trim(p_nome)) < 2 THEN
    RAISE EXCEPTION 'Nome do funcionário inválido';
  END IF;

  IF p_email IS NULL OR p_email !~* '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  IF p_telefone IS NULL OR p_telefone !~ '^\d{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  -- Verificar duplicata de e-mail
  IF EXISTS (SELECT 1 FROM funcionario WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como funcionário';
  END IF;

  -- Verificar se o e-mail já é de um lojista ou cliente
  IF EXISTS (SELECT 1 FROM lojista WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como lojista';
  END IF;

  IF EXISTS (SELECT 1 FROM cliente WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como cliente';
  END IF;

  INSERT INTO funcionario (
    id_funcionario,
    id_lojista,
    nome,
    email,
    telefone,
    cargo,
    pode_gerenciar_agenda,
    pode_gerenciar_servicos
  ) VALUES (
    p_id_funcionario,
    p_id_lojista,
    trim(p_nome),
    lower(trim(p_email)),
    p_telefone,
    NULLIF(trim(p_cargo), ''),
    p_pode_agenda,
    p_pode_servicos
  );
END;
$$;

-- Garantir que somente usuários autenticados possam chamar
REVOKE ALL ON FUNCTION fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
