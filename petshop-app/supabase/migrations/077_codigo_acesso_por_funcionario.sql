-- ============================================================
-- PETSHOP SaaS - Migration 077: código de acesso rápido por funcionário
-- ============================================================
-- Antes (migration 033) o código era um só por loja, guardado em lojista,
-- e o login pedia e-mail + código. Agora cada funcionário tem o próprio
-- código, gerado pelo lojista na tela do funcionário, e o login pede só o
-- código — ele já identifica quem está entrando. Vale 1 minuto e é de uso
-- único (o login apaga o código ao usar).
--
-- A função antiga (fn_gerar_codigo_login_funcionario) não conferia quem
-- chamava: qualquer um com a chave pública gerava e lia o código de
-- qualquer loja. A nova só gera pra funcionário ativo da loja de quem está
-- logado (o titular), e só pra usuário autenticado.

ALTER TABLE funcionario
  ADD COLUMN IF NOT EXISTS codigo_login TEXT CHECK (codigo_login ~ '^\d{6}$'),
  ADD COLUMN IF NOT EXISTS codigo_login_expiracao TIMESTAMPTZ;

-- O login procura só pelo código, então não pode haver dois iguais.
CREATE UNIQUE INDEX IF NOT EXISTS idx_funcionario_codigo_login
  ON funcionario (codigo_login)
  WHERE codigo_login IS NOT NULL;

DROP FUNCTION IF EXISTS fn_gerar_codigo_login_funcionario(UUID);

ALTER TABLE lojista
  DROP COLUMN IF EXISTS codigo_login_funcionario,
  DROP COLUMN IF EXISTS codigo_login_expiracao;

CREATE OR REPLACE FUNCTION fn_gerar_codigo_acesso_funcionario(p_id_funcionario UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo TEXT;
  v_expiracao TIMESTAMPTZ := NOW() + INTERVAL '1 minute';
BEGIN
  -- Só o titular da loja gera, e só pra funcionário ativo dele.
  IF NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = p_id_funcionario
      AND id_lojista = auth.uid()
      AND ativo
  ) THEN
    RAISE EXCEPTION 'Funcionário não encontrado ou inativo.' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION fn_gerar_codigo_acesso_funcionario(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_gerar_codigo_acesso_funcionario(UUID) TO authenticated;
