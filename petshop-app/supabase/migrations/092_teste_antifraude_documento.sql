-- ============================================================
-- PETSHOP SaaS - Migration 092: CPF/CNPJ da loja na trava do período de teste
-- ============================================================
-- Complementa a 091 (telefone): o documento (CPF ou CNPJ) da loja também
-- fica registrado para sempre, em hash, e vale a mesma regra — conta nova
-- ou troca de documento repetido nasce/fica sem o teste de 30 dias.
--
--   • lojista.documento: só dígitos, 11 (CPF) ou 14 (CNPJ), com dígitos
--     verificadores válidos (CHECK ... NOT VALID: vale para o que for
--     gravado daqui em diante; lojas antigas ficam sem documento até
--     preencherem).
--   • Telefone OU documento já usados por OUTRA conta bloqueiam o teste.
--   • O app grava o documento logo depois de criar a loja; o gatilho de
--     UPDATE cobre esse caso (a loja ainda está dentro dos 30 dias).
-- ============================================================

ALTER TABLE lojista ADD COLUMN IF NOT EXISTS documento TEXT;

-- CPF/CNPJ válido? (só dígitos; rejeita sequências repetidas)
CREATE OR REPLACE FUNCTION fn_documento_valido(p_doc TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  d   TEXT := regexp_replace(COALESCE(p_doc, ''), '\D', '', 'g');
  s   INTEGER;
  dv  INTEGER;
  i   INTEGER;
  p1  INTEGER[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  p2  INTEGER[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
BEGIN
  IF d ~ '^(\d)\1+$' THEN RETURN FALSE; END IF;

  IF length(d) = 11 THEN
    s := 0;
    FOR i IN 1..9 LOOP s := s + substr(d, i, 1)::INT * (11 - i); END LOOP;
    dv := (s * 10) % 11; IF dv >= 10 THEN dv := 0; END IF;
    IF dv <> substr(d, 10, 1)::INT THEN RETURN FALSE; END IF;
    s := 0;
    FOR i IN 1..10 LOOP s := s + substr(d, i, 1)::INT * (12 - i); END LOOP;
    dv := (s * 10) % 11; IF dv >= 10 THEN dv := 0; END IF;
    RETURN dv = substr(d, 11, 1)::INT;
  ELSIF length(d) = 14 THEN
    s := 0;
    FOR i IN 1..12 LOOP s := s + substr(d, i, 1)::INT * p1[i]; END LOOP;
    dv := s % 11; dv := CASE WHEN dv < 2 THEN 0 ELSE 11 - dv END;
    IF dv <> substr(d, 13, 1)::INT THEN RETURN FALSE; END IF;
    s := 0;
    FOR i IN 1..13 LOOP s := s + substr(d, i, 1)::INT * p2[i]; END LOOP;
    dv := s % 11; dv := CASE WHEN dv < 2 THEN 0 ELSE 11 - dv END;
    RETURN dv = substr(d, 14, 1)::INT;
  END IF;
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION fn_documento_hash(p_doc TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN length(regexp_replace(COALESCE(p_doc, ''), '\D', '', 'g')) IN (11, 14)
      THEN encode(digest('doc:' || regexp_replace(p_doc, '\D', '', 'g'), 'sha256'), 'hex')
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION fn_documento_valido(TEXT), fn_documento_hash(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_documento_valido(TEXT), fn_documento_hash(TEXT) TO authenticated, service_role;

ALTER TABLE lojista DROP CONSTRAINT IF EXISTS lojista_documento_valido;
ALTER TABLE lojista ADD CONSTRAINT lojista_documento_valido
  CHECK (documento IS NULL OR (documento ~ '^\d{11}$|^\d{14}$' AND fn_documento_valido(documento))) NOT VALID;

-- A tabela de identificadores passa a aceitar 'documento'.
ALTER TABLE teste_identificador DROP CONSTRAINT IF EXISTS teste_identificador_tipo_check;
ALTER TABLE teste_identificador ADD CONSTRAINT teste_identificador_tipo_check CHECK (tipo IN ('telefone', 'documento'));

CREATE OR REPLACE FUNCTION fn_teste_conflito(p_tipo TEXT, p_hash TEXT, p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT p_hash IS NOT NULL AND EXISTS (
    SELECT 1 FROM teste_identificador WHERE tipo = p_tipo AND chave_hash = p_hash AND id_lojista <> p_id
  );
$$;
REVOKE ALL ON FUNCTION fn_teste_conflito(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION fn_teste_registrar(p_tipo TEXT, p_hash TEXT, p_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  INSERT INTO teste_identificador (tipo, chave_hash, id_lojista)
  SELECT p_tipo, p_hash, p_id WHERE p_hash IS NOT NULL
  ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION fn_teste_registrar(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- Loja nova: confere telefone e documento.
CREATE OR REPLACE FUNCTION fn_teste_antifraude_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tel TEXT := fn_telefone_hash(NEW.telefone);
  v_doc TEXT := fn_documento_hash(NEW.documento);
BEGIN
  IF NOT COALESCE(NEW.acesso_livre, FALSE) THEN
    IF fn_teste_conflito('telefone', v_tel, NEW.id_lojista) THEN
      NEW.acesso_ate := NOW() - INTERVAL '1 minute';
      NEW.teste_bloqueado := TRUE;
      NEW.teste_bloqueado_motivo := 'Telefone da loja já usou o período de teste em outra conta.';
    ELSIF fn_teste_conflito('documento', v_doc, NEW.id_lojista) THEN
      NEW.acesso_ate := NOW() - INTERVAL '1 minute';
      NEW.teste_bloqueado := TRUE;
      NEW.teste_bloqueado_motivo := 'CPF/CNPJ já usou o período de teste em outra conta.';
    END IF;
  END IF;

  PERFORM fn_teste_registrar('telefone', v_tel, NEW.id_lojista);
  PERFORM fn_teste_registrar('documento', v_doc, NEW.id_lojista);
  RETURN NEW;
END;
$$;

-- Troca de telefone ou de documento: guarda o antigo e o novo; repetido de
-- outra conta + ainda no período de teste = teste encerrado.
CREATE OR REPLACE FUNCTION fn_teste_antifraude_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tel_novo  TEXT := fn_telefone_hash(NEW.telefone);
  v_tel_velho TEXT := fn_telefone_hash(OLD.telefone);
  v_doc_novo  TEXT := fn_documento_hash(NEW.documento);
  v_doc_velho TEXT := fn_documento_hash(OLD.documento);
BEGIN
  PERFORM fn_teste_registrar('telefone', v_tel_velho, OLD.id_lojista);
  PERFORM fn_teste_registrar('documento', v_doc_velho, OLD.id_lojista);

  IF NOT COALESCE(NEW.acesso_livre, FALSE)
     AND NEW.acesso_ate <= NEW.created_at + INTERVAL '31 days'
  THEN
    IF v_tel_novo IS DISTINCT FROM v_tel_velho AND fn_teste_conflito('telefone', v_tel_novo, NEW.id_lojista) THEN
      NEW.acesso_ate := LEAST(NEW.acesso_ate, NOW() - INTERVAL '1 minute');
      NEW.teste_bloqueado := TRUE;
      NEW.teste_bloqueado_motivo := 'Telefone que já usou o período de teste em outra conta.';
    ELSIF v_doc_novo IS DISTINCT FROM v_doc_velho AND fn_teste_conflito('documento', v_doc_novo, NEW.id_lojista) THEN
      NEW.acesso_ate := LEAST(NEW.acesso_ate, NOW() - INTERVAL '1 minute');
      NEW.teste_bloqueado := TRUE;
      NEW.teste_bloqueado_motivo := 'CPF/CNPJ que já usou o período de teste em outra conta.';
    END IF;
  END IF;

  PERFORM fn_teste_registrar('telefone', v_tel_novo, NEW.id_lojista);
  PERFORM fn_teste_registrar('documento', v_doc_novo, NEW.id_lojista);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION fn_teste_antifraude_insert(), fn_teste_antifraude_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_teste_antifraude_update ON lojista;
CREATE TRIGGER trg_teste_antifraude_update
  BEFORE UPDATE OF telefone, documento ON lojista
  FOR EACH ROW EXECUTE FUNCTION fn_teste_antifraude_update();
