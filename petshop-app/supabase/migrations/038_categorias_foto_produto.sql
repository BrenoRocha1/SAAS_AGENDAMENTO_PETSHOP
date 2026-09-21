-- ============================================================
-- PETSHOP SaaS - Migration 038: Categorias de produto e foto do produto
-- ============================================================
-- Ajustes pedidos depois de ver a migration 037 rodando: categoria deixa
-- de ser uma lista fixa (TEXT + CHECK) e vira algo que a própria loja
-- cria/renomeia/apaga, do mesmo jeito que já faz com Serviços e Equipe.
-- Produto ganha uma foto (mesmo padrão de Storage de logos-loja/fotos-pet).
--
-- Decisões de modelagem:
--
-- • `categoria_produto` é uma tabelinha por loja, com RLS e permissão
--   idênticas a `produto` (mesmo reaproveitamento de
--   pode_gerenciar_servicos — ver migration 037). UNIQUE(id_lojista,
--   nome) evita "Ração" e "ração" duplicada sem querer.
--
-- • `produto.categoria` (TEXT) vira `produto.id_categoria` (FK). A FK é
--   ON DELETE SET NULL de propósito: apagar uma categoria não pode
--   arrastar produtos junto nem travar a exclusão — o produto só fica
--   "sem categoria" (a tela mostra isso e deixa escolher outra).
--
-- • Toda loja (as que já existem E as que forem criadas depois, via
--   trigger em `lojista`) ganha as mesmas 5 categorias de largada
--   (Ração/Brinquedos/Higiene/Acessórios/Outros) — isso era a lista fixa
--   da migration 037, agora só como PONTO DE PARTIDA editável, não mais
--   como limite.
--
-- • Backfill de `produto.categoria` pra `id_categoria`: casa pelo nome
--   dentro da mesma loja. Só importa se a 037 já tinha rodado com
--   produtos cadastrados antes desta; como as 5 categorias padrão são
--   semeadas ANTES deste UPDATE, o casamento por nome sempre encontra
--   a linha certa pra quem só usou as categorias da lista antiga.
-- ============================================================

CREATE TABLE IF NOT EXISTS categoria_produto (
  id_categoria UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista   UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  nome         TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 50),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_lojista, nome)
);

CREATE INDEX IF NOT EXISTS idx_categoria_produto_lojista ON categoria_produto(id_lojista);

ALTER TABLE categoria_produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE categoria_produto FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categoria_produto: lojista ve" ON categoria_produto;
CREATE POLICY "categoria_produto: lojista ve"
  ON categoria_produto FOR SELECT
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista');

DROP POLICY IF EXISTS "categoria_produto: funcionario ve" ON categoria_produto;
CREATE POLICY "categoria_produto: funcionario ve"
  ON categoria_produto FOR SELECT
  USING (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id());

DROP POLICY IF EXISTS "categoria_produto: lojista insere" ON categoria_produto;
CREATE POLICY "categoria_produto: lojista insere"
  ON categoria_produto FOR INSERT
  WITH CHECK (id_lojista = auth.uid() AND auth_role() = 'lojista');

DROP POLICY IF EXISTS "categoria_produto: funcionario insere" ON categoria_produto;
CREATE POLICY "categoria_produto: funcionario insere"
  ON categoria_produto FOR INSERT
  WITH CHECK (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND pode_gerenciar_servicos = TRUE AND ativo = TRUE)
  );

DROP POLICY IF EXISTS "categoria_produto: lojista edita" ON categoria_produto;
CREATE POLICY "categoria_produto: lojista edita"
  ON categoria_produto FOR UPDATE
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista')
  WITH CHECK (id_lojista = auth.uid());

DROP POLICY IF EXISTS "categoria_produto: funcionario edita" ON categoria_produto;
CREATE POLICY "categoria_produto: funcionario edita"
  ON categoria_produto FOR UPDATE
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND pode_gerenciar_servicos = TRUE AND ativo = TRUE)
  )
  WITH CHECK (id_lojista = auth_lojista_id());

DROP POLICY IF EXISTS "categoria_produto: lojista deleta" ON categoria_produto;
CREATE POLICY "categoria_produto: lojista deleta"
  ON categoria_produto FOR DELETE
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista');

DROP POLICY IF EXISTS "categoria_produto: funcionario deleta" ON categoria_produto;
CREATE POLICY "categoria_produto: funcionario deleta"
  ON categoria_produto FOR DELETE
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND EXISTS (SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND pode_gerenciar_servicos = TRUE AND ativo = TRUE)
  );

-- Categorias padrão pra loja que já existe hoje.
INSERT INTO categoria_produto (id_lojista, nome)
SELECT l.id_lojista, c.nome
FROM lojista l
CROSS JOIN (VALUES ('Ração'), ('Brinquedos'), ('Higiene'), ('Acessórios'), ('Outros')) AS c(nome)
ON CONFLICT (id_lojista, nome) DO NOTHING;

-- Mesmas categorias padrão pra loja nova, automaticamente.
CREATE OR REPLACE FUNCTION fn_seed_categorias_produto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO categoria_produto (id_lojista, nome)
  VALUES
    (NEW.id_lojista, 'Ração'),
    (NEW.id_lojista, 'Brinquedos'),
    (NEW.id_lojista, 'Higiene'),
    (NEW.id_lojista, 'Acessórios'),
    (NEW.id_lojista, 'Outros')
  ON CONFLICT (id_lojista, nome) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lojista_seed_categorias_produto ON lojista;
CREATE TRIGGER trg_lojista_seed_categorias_produto
  AFTER INSERT ON lojista
  FOR EACH ROW EXECUTE FUNCTION fn_seed_categorias_produto();

-- ============================================================
-- produto.categoria (TEXT) -> produto.id_categoria (FK)
-- ============================================================
ALTER TABLE produto ADD COLUMN IF NOT EXISTS id_categoria UUID REFERENCES categoria_produto(id_categoria) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'produto' AND column_name = 'categoria') THEN
    UPDATE produto p
    SET id_categoria = cp.id_categoria
    FROM categoria_produto cp
    WHERE cp.id_lojista = p.id_lojista
      AND cp.nome = p.categoria
      AND p.id_categoria IS NULL;

    ALTER TABLE produto DROP COLUMN categoria;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_produto_id_categoria ON produto(id_lojista, id_categoria);

-- ============================================================
-- Foto do produto
-- ============================================================
ALTER TABLE produto ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- Bucket público (leitura sem autenticação, mesma ideia de logos-loja):
-- a foto pode aparecer futuramente numa venda ou num catálogo público.
-- Escrita fica restrita à pasta do próprio lojista — {id_lojista}/{id_produto}.{ext}.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos-produto', 'fotos-produto', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "fotos-produto: leitura publica" ON storage.objects;
CREATE POLICY "fotos-produto: leitura publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fotos-produto');

DROP POLICY IF EXISTS "fotos-produto: lojista envia na propria pasta" ON storage.objects;
CREATE POLICY "fotos-produto: lojista envia na propria pasta"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'fotos-produto' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "fotos-produto: lojista atualiza a propria pasta" ON storage.objects;
CREATE POLICY "fotos-produto: lojista atualiza a propria pasta"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'fotos-produto' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "fotos-produto: lojista remove da propria pasta" ON storage.objects;
CREATE POLICY "fotos-produto: lojista remove da propria pasta"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'fotos-produto' AND (storage.foldername(name))[1] = auth.uid()::text);
