-- ============================================================
-- PETSHOP SaaS - Migration 091: período de teste não pode ser repetido
-- ============================================================
-- Quem já usou o teste de 30 dias não ganha outro criando uma conta nova
-- com o mesmo telefone da loja — nem se, antes, trocou o telefone da conta
-- antiga (o telefone anterior continua guardado).
--
-- Como funciona:
--   • teste_identificador guarda, para sempre, um HASH (SHA-256) do telefone
--     normalizado de cada loja — o de hoje e todos os que ela já teve. É hash
--     de propósito: não guarda o número em claro, e não some se a conta for
--     excluída (LGPD, migration 072), então excluir e recriar não burla.
--   • O telefone é normalizado pelos ÚLTIMOS 8 DÍGITOS (sem DDD, sem o 9
--     extra, sem +55): "11 93201-9100", "(11) 3201-9100" e "932019100"
--     viram a mesma chave.
--   • Loja nova (INSERT) cujo telefone já pertenceu a OUTRA conta nasce com o
--     teste já encerrado e marcada em teste_bloqueado. O bloqueio é do banco:
--     vale pelo cadastro normal, pelo Google ou por qualquer outro caminho.
--   • Loja que TROCA o telefone (UPDATE): o número antigo e o novo ficam
--     registrados; se o novo já era de outra conta e a loja ainda está dentro
--     do período de teste, o teste também é encerrado.
--   • Quem é da equipe pode liberar manualmente pelo painel interno
--     (+dias / definir data / isentar).
-- ============================================================

ALTER TABLE lojista ADD COLUMN IF NOT EXISTS teste_bloqueado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lojista ADD COLUMN IF NOT EXISTS teste_bloqueado_motivo TEXT;

CREATE TABLE IF NOT EXISTS teste_identificador (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo        TEXT NOT NULL DEFAULT 'telefone' CHECK (tipo IN ('telefone')),
  chave_hash  TEXT NOT NULL,
  -- Sem FOREIGN KEY de propósito: o registro sobrevive à exclusão da conta.
  id_lojista  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tipo, chave_hash, id_lojista)
);
CREATE INDEX IF NOT EXISTS idx_teste_identificador_chave ON teste_identificador(tipo, chave_hash);

ALTER TABLE teste_identificador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teste_identificador: ninguem acessa pela API" ON teste_identificador;
CREATE POLICY "teste_identificador: ninguem acessa pela API"
  ON teste_identificador FOR ALL USING (false) WITH CHECK (false);

-- Últimos 8 dígitos do telefone (NULL se tiver menos que isso).
CREATE OR REPLACE FUNCTION fn_telefone_chave(p_telefone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN length(regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g')) >= 8
      THEN right(regexp_replace(p_telefone, '\D', '', 'g'), 8)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION fn_telefone_hash(p_telefone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN fn_telefone_chave(p_telefone) IS NULL THEN NULL
    ELSE encode(digest('tel:' || fn_telefone_chave(p_telefone), 'sha256'), 'hex')
  END;
$$;

REVOKE ALL ON FUNCTION fn_telefone_chave(TEXT), fn_telefone_hash(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_telefone_chave(TEXT), fn_telefone_hash(TEXT) TO authenticated, service_role;

-- Loja nova: confere e registra o telefone.
CREATE OR REPLACE FUNCTION fn_teste_antifraude_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash TEXT := fn_telefone_hash(NEW.telefone);
BEGIN
  IF v_hash IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(NEW.acesso_livre, FALSE) AND EXISTS (
    SELECT 1 FROM teste_identificador
    WHERE tipo = 'telefone' AND chave_hash = v_hash AND id_lojista <> NEW.id_lojista
  ) THEN
    NEW.acesso_ate := NOW() - INTERVAL '1 minute';
    NEW.teste_bloqueado := TRUE;
    NEW.teste_bloqueado_motivo := 'Telefone da loja já usou o período de teste em outra conta.';
  END IF;

  INSERT INTO teste_identificador (tipo, chave_hash, id_lojista)
  VALUES ('telefone', v_hash, NEW.id_lojista)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Troca de telefone: guarda o antigo e o novo; se o novo já era de outra
-- conta e a loja ainda está no período de teste, encerra o teste.
CREATE OR REPLACE FUNCTION fn_teste_antifraude_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_novo  TEXT := fn_telefone_hash(NEW.telefone);
  v_velho TEXT := fn_telefone_hash(OLD.telefone);
BEGIN
  IF v_velho IS NOT NULL THEN
    INSERT INTO teste_identificador (tipo, chave_hash, id_lojista)
    VALUES ('telefone', v_velho, OLD.id_lojista)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_novo IS NULL OR v_novo IS NOT DISTINCT FROM v_velho THEN
    RETURN NEW;
  END IF;

  -- "Ainda no teste" = o acesso não passou do que o cadastro deu (30 dias,
  -- com folga). Quem já pagou/foi estendido não é derrubado por trocar o número.
  IF NOT COALESCE(NEW.acesso_livre, FALSE)
     AND NEW.acesso_ate <= NEW.created_at + INTERVAL '31 days'
     AND EXISTS (
       SELECT 1 FROM teste_identificador
       WHERE tipo = 'telefone' AND chave_hash = v_novo AND id_lojista <> NEW.id_lojista
     )
  THEN
    NEW.acesso_ate := LEAST(NEW.acesso_ate, NOW() - INTERVAL '1 minute');
    NEW.teste_bloqueado := TRUE;
    NEW.teste_bloqueado_motivo := 'Trocou para um telefone que já usou o período de teste em outra conta.';
  END IF;

  INSERT INTO teste_identificador (tipo, chave_hash, id_lojista)
  VALUES ('telefone', v_novo, NEW.id_lojista)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION fn_teste_antifraude_insert(), fn_teste_antifraude_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_teste_antifraude_insert ON lojista;
CREATE TRIGGER trg_teste_antifraude_insert
  BEFORE INSERT ON lojista
  FOR EACH ROW EXECUTE FUNCTION fn_teste_antifraude_insert();

DROP TRIGGER IF EXISTS trg_teste_antifraude_update ON lojista;
CREATE TRIGGER trg_teste_antifraude_update
  BEFORE UPDATE OF telefone ON lojista
  FOR EACH ROW EXECUTE FUNCTION fn_teste_antifraude_update();

-- Lojas que já existem: registra o telefone atual de cada uma, para que
-- quem já está na plataforma também não consiga repetir o teste.
INSERT INTO teste_identificador (tipo, chave_hash, id_lojista)
SELECT 'telefone', fn_telefone_hash(telefone), id_lojista
FROM lojista
WHERE fn_telefone_hash(telefone) IS NOT NULL
ON CONFLICT DO NOTHING;
