-- ============================================================
-- PETSHOP SaaS - Migration 101: galeria de fotos de referência do serviço
-- ============================================================
-- Cada serviço pode ter fotos de referência (ex.: Tosa → "Tosa bebê",
-- "Tosa na tesoura"), com nome, descrição opcional e ordem. É só
-- ilustração: não cria serviço, preço nem agendamento. Serviço sem foto
-- segue igual.
--
-- Arquivos no Storage, no mesmo padrão de fotos-produto/logos-loja
-- (bucket público para leitura, escrita só na pasta da própria loja):
--   fotos-servico/{id_lojista}/{id_servico}/{id_foto}.{ext}       (grande)
--   fotos-servico/{id_lojista}/{id_servico}/{id_foto}-mini.{ext}  (miniatura)
-- No banco ficam só os metadados e os caminhos/URLs.
-- ============================================================

CREATE TABLE IF NOT EXISTS servico_foto (
  id_foto       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_servico    UUID NOT NULL REFERENCES servico(id_servico) ON DELETE CASCADE,
  id_lojista    UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  nome          TEXT NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 60),
  descricao     TEXT CHECK (descricao IS NULL OR char_length(descricao) <= 300),
  caminho       TEXT NOT NULL,
  caminho_mini  TEXT NOT NULL,
  url           TEXT NOT NULL,
  url_mini      TEXT NOT NULL,
  ordem         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_servico_foto_servico ON servico_foto(id_servico, ordem);
CREATE INDEX IF NOT EXISTS idx_servico_foto_lojista ON servico_foto(id_lojista);

-- A foto é sempre da loja dona do serviço, e cada serviço tem no máximo
-- 12 — conferido no banco, não só na tela.
CREATE OR REPLACE FUNCTION fn_servico_foto_valida()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM servico WHERE id_servico = NEW.id_servico AND id_lojista = NEW.id_lojista) THEN
    RAISE EXCEPTION 'Galeria: o serviço não é desta loja';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id_servico IS DISTINCT FROM OLD.id_servico OR NEW.id_lojista IS DISTINCT FROM OLD.id_lojista) THEN
    RAISE EXCEPTION 'Galeria: a foto não pode mudar de serviço nem de loja';
  END IF;
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM servico_foto WHERE id_servico = NEW.id_servico) >= 12 THEN
    RAISE EXCEPTION 'Galeria: cada serviço pode ter no máximo 12 fotos';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_servico_foto_valida ON servico_foto;
CREATE TRIGGER trg_servico_foto_valida
  BEFORE INSERT OR UPDATE ON servico_foto
  FOR EACH ROW EXECUTE FUNCTION fn_servico_foto_valida();

-- ------------------------------------------------------------
-- RLS — mesmas regras de servico / servico_variacao
-- ------------------------------------------------------------
ALTER TABLE servico_foto ENABLE ROW LEVEL SECURITY;

-- Todos (inclusive visitante sem login, na página pública e no link de
-- agendamento) veem as fotos de serviço ativo e não excluído.
DROP POLICY IF EXISTS "servico_foto: todos veem de servico ativo" ON servico_foto;
CREATE POLICY "servico_foto: todos veem de servico ativo"
  ON servico_foto FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM servico s
    WHERE s.id_servico = servico_foto.id_servico AND s.status = 'Ativo' AND s.excluido_em IS NULL
  ));

DROP POLICY IF EXISTS "servico_foto: lojista ve as suas" ON servico_foto;
CREATE POLICY "servico_foto: lojista ve as suas"
  ON servico_foto FOR SELECT
  USING (id_lojista = auth.uid());

DROP POLICY IF EXISTS "servico_foto: funcionario ve da loja" ON servico_foto;
CREATE POLICY "servico_foto: funcionario ve da loja"
  ON servico_foto FOR SELECT
  USING (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id());

DROP POLICY IF EXISTS "servico_foto: lojista gerencia as suas" ON servico_foto;
CREATE POLICY "servico_foto: lojista gerencia as suas"
  ON servico_foto FOR ALL
  USING (id_lojista = auth.uid())
  WITH CHECK (id_lojista = auth.uid());

DROP POLICY IF EXISTS "servico_foto: funcionario gerencia da loja" ON servico_foto;
CREATE POLICY "servico_foto: funcionario gerencia da loja"
  ON servico_foto FOR ALL
  USING (
    auth_role() = 'funcionario' AND id_lojista = auth_lojista_id()
    AND EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND pode_gerenciar_servicos = TRUE AND ativo = TRUE)
  )
  WITH CHECK (
    auth_role() = 'funcionario' AND id_lojista = auth_lojista_id()
    AND EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND pode_gerenciar_servicos = TRUE AND ativo = TRUE)
  );

GRANT SELECT ON servico_foto TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON servico_foto TO authenticated;

-- ------------------------------------------------------------
-- Storage
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos-servico', 'fotos-servico', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "fotos-servico: leitura publica" ON storage.objects;
CREATE POLICY "fotos-servico: leitura publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fotos-servico');

DROP POLICY IF EXISTS "fotos-servico: lojista envia na propria pasta" ON storage.objects;
CREATE POLICY "fotos-servico: lojista envia na propria pasta"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'fotos-servico' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "fotos-servico: lojista atualiza a propria pasta" ON storage.objects;
CREATE POLICY "fotos-servico: lojista atualiza a propria pasta"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'fotos-servico' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "fotos-servico: lojista remove da propria pasta" ON storage.objects;
CREATE POLICY "fotos-servico: lojista remove da propria pasta"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'fotos-servico' AND (storage.foldername(name))[1] = auth.uid()::text);
