-- ============================================================
-- PETSHOP SaaS - Migration 078: funcionário só com o nome
-- ============================================================
-- O funcionário não tem mais e-mail nem senha: é cadastrado só com o nome
-- (telefone e cargo opcionais) e entra pelo código de acesso rápido
-- (migration 077). A conta de autenticação continua existindo — é ela que
-- dá o auth.uid() das policies —, mas com um endereço interno que ninguém
-- usa (ver lib/email-interno.ts no painel).
--
-- Quem já foi cadastrado com e-mail e telefone continua como está.

ALTER TABLE funcionario
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN telefone DROP NOT NULL;

-- Mesma assinatura da migration 042 (os GRANTs continuam valendo): e-mail
-- e telefone passam a ser opcionais, validados só quando informados.
CREATE OR REPLACE FUNCTION fn_registrar_funcionario(
  p_id_funcionario      UUID,
  p_id_lojista          UUID,
  p_nome                TEXT,
  p_email               TEXT,
  p_telefone            TEXT,
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
DECLARE
  v_email    TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  v_telefone TEXT := NULLIF(trim(COALESCE(p_telefone, '')), '');
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

  IF v_email IS NOT NULL THEN
    IF v_email !~* '^[^@]+@[^@]+\.[^@]+$' THEN
      RAISE EXCEPTION 'E-mail inválido';
    END IF;

    IF EXISTS (SELECT 1 FROM funcionario WHERE email = v_email) THEN
      RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como funcionário';
    END IF;

    IF EXISTS (SELECT 1 FROM lojista WHERE email = v_email) THEN
      RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como lojista';
    END IF;

    IF EXISTS (SELECT 1 FROM cliente WHERE email = v_email) THEN
      RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como cliente';
    END IF;
  END IF;

  IF v_telefone IS NOT NULL AND v_telefone !~ '^\d{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  INSERT INTO funcionario (
    id_funcionario, id_lojista, nome, email, telefone, cargo,
    pode_gerenciar_agenda, pode_gerenciar_servicos, pode_gerenciar_clientes_pets,
    acesso_total, pode_gerenciar_produtos, pode_taxidog
  ) VALUES (
    p_id_funcionario, p_id_lojista, trim(p_nome), v_email, v_telefone, NULLIF(trim(p_cargo), ''),
    p_pode_agenda, p_pode_servicos, p_pode_clientes_pets,
    p_acesso_total, p_pode_produtos, p_pode_taxidog
  );
END;
$$;
