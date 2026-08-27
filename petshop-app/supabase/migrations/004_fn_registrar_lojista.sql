-- ============================================================
-- PETSHOP SaaS - Migration 004: fn_registrar_lojista (v2)
-- ============================================================
-- Função RPC SECURITY DEFINER que insere o registro na tabela
-- lojista logo após o auth.signUp().
--
-- Por que SECURITY DEFINER aqui é seguro:
--   1. A função verifica que auth.uid() == p_id_lojista antes de
--      qualquer escrita — impossível inserir como outro usuário.
--   2. SET search_path = public impede schema injection.
--   3. Não aceita parâmetros livres que possam ser forjados para
--      alterar registros de outros lojistas.
--   4. Chamada apenas de Server Actions (contexto servidor Next.js),
--      nunca exposta diretamente ao browser.
--   5. Aceita chamadas via service_role (adminClient) como fallback
--      para evitar problemas de timing de sessão pós-signUp.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_registrar_lojista(
  p_id_lojista  UUID,
  p_nome_loja   TEXT,
  p_email       TEXT,
  p_telefone    TEXT,
  p_descricao   TEXT DEFAULT NULL,
  p_endereco    TEXT DEFAULT NULL,
  p_cidade      TEXT DEFAULT NULL,
  p_estado      CHAR(2) DEFAULT NULL,
  p_cep         TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role TEXT;
BEGIN
  -- Lê o role do JWT (forma correta no Supabase/PostgREST)
  -- current_setting('role') não retorna 'service_role' de forma confiável
  v_jwt_role := COALESCE(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    ''
  );

  -- Se não for service_role, valida que é o próprio usuário autenticado
  IF v_jwt_role != 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    IF auth.uid() != p_id_lojista THEN
      RAISE EXCEPTION 'Acesso não autorizado: uid divergente';
    END IF;
  END IF;

  -- Validações básicas (defense-in-depth além do Zod no servidor)
  IF p_nome_loja IS NULL OR char_length(trim(p_nome_loja)) < 2 THEN
    RAISE EXCEPTION 'Nome da loja inválido';
  END IF;

  IF p_email IS NULL OR p_email !~* '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  IF p_telefone IS NULL OR p_telefone !~ '^\d{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  -- CEP: valida apenas se fornecido
  IF p_cep IS NOT NULL AND p_cep !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'CEP inválido';
  END IF;

  -- Verificar duplicata de e-mail (constraint unique já protege,
  -- mas erro amigável antes do INSERT evita rollback desnecessário)
  IF EXISTS (SELECT 1 FROM lojista WHERE email = p_email) THEN
    RAISE EXCEPTION 'email_already_exists';
  END IF;

  INSERT INTO lojista (
    id_lojista,
    nome_loja,
    email,
    telefone,
    descricao,
    endereco,
    cidade,
    estado,
    cep
  ) VALUES (
    p_id_lojista,
    trim(p_nome_loja),
    lower(trim(p_email)),
    p_telefone,
    NULLIF(trim(p_descricao), ''),
    NULLIF(trim(p_endereco), ''),
    NULLIF(trim(p_cidade), ''),
    NULLIF(upper(trim(p_estado)), ''),
    NULLIF(p_cep, '')
  );
END;
$$;

-- Somente usuários autenticados e service_role podem chamar a função
REVOKE ALL ON FUNCTION fn_registrar_lojista(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, CHAR(2), TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_registrar_lojista(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, CHAR(2), TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_registrar_lojista(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, CHAR(2), TEXT) TO service_role;
