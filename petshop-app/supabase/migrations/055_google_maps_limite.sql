-- ============================================================
-- PETSHOP SaaS - Migration 055: limite mensal de chamadas ao Google Maps
-- ============================================================
-- A distância/tempo das rotas vem da Routes API do Google, que dá 10 mil
-- chamadas grátis por mês ("Compute Routes Essentials") e cobra depois.
-- O console do Google só deixa limitar por minuto — não por mês —, então
-- o próprio sistema conta: antes de chamar o Google, o servidor reserva
-- as chamadas aqui; passou do limite do mês, não chama (a tela mostra
-- "distância indisponível" e o resto das rotas segue normal).
-- A chave do Google é uma só pro SaaS inteiro, então a conta é global.
-- O mês é o do faturamento do Google (horário do Pacífico).
-- ============================================================

CREATE TABLE IF NOT EXISTS google_maps_uso (
  mes      DATE PRIMARY KEY,
  chamadas INTEGER NOT NULL DEFAULT 0
);

-- Ninguém lê nem escreve direto: só a função abaixo.
ALTER TABLE google_maps_uso ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_maps_uso FORCE ROW LEVEL SECURITY;

-- TRUE = pode chamar (as chamadas já ficam contadas); FALSE = limite do
-- mês atingido. p_limite vem do servidor e nunca passa de 10 mil.
CREATE OR REPLACE FUNCTION fn_reservar_chamadas_google(p_quantidade INTEGER, p_limite INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes    DATE := date_trunc('month', NOW() AT TIME ZONE 'America/Los_Angeles')::DATE;
  v_limite INTEGER := LEAST(COALESCE(p_limite, 9000), 10000);
BEGIN
  IF auth_lojista_id() IS NULL THEN
    RETURN FALSE;
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 50 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO google_maps_uso (mes, chamadas) VALUES (v_mes, 0) ON CONFLICT (mes) DO NOTHING;
  UPDATE google_maps_uso
  SET chamadas = chamadas + p_quantidade
  WHERE mes = v_mes AND chamadas + p_quantidade <= v_limite;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION fn_reservar_chamadas_google(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_reservar_chamadas_google(INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION fn_reservar_chamadas_google(INTEGER, INTEGER) TO authenticated;
