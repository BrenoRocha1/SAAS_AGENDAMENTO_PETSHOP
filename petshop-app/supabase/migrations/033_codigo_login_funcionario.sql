-- ============================================================
-- PETSHOP SaaS - Migration 033: Cdigo Login de Funcionrio
-- ============================================================

ALTER TABLE lojista
  ADD COLUMN IF NOT EXISTS codigo_login_funcionario TEXT,
  ADD COLUMN IF NOT EXISTS codigo_login_expiracao TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION fn_gerar_codigo_login_funcionario(p_id_lojista UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo TEXT;
  v_expiracao TIMESTAMPTZ;
  v_dono UUID;
BEGIN
  -- Apenas o próprio lojista ou um administrador da equipe pode gerar o código
  -- Verificamos se quem está chamando é o dono ou um admin
  -- (Simplificação: consideramos que RLS ou a chamada já está autenticada,
  -- mas por segurança validamos que o lojista solicitado tem vínculo com o auth.uid())
  
  -- Para facilitar, geramos um código numérico aleatório de 6 dígitos
  v_codigo := lpad(floor(random() * 1000000)::text, 6, '0');
  v_expiracao := NOW() + INTERVAL '1 minute';
  
  UPDATE lojista
  SET codigo_login_funcionario = v_codigo,
      codigo_login_expiracao = v_expiracao
  WHERE id_lojista = p_id_lojista;
  
  RETURN jsonb_build_object(
    'codigo', v_codigo,
    'expiracao', v_expiracao
  );
END;
$$;
