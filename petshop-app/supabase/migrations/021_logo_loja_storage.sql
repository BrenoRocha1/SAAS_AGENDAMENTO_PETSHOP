-- ============================================================
-- PETSHOP SaaS - Migration 021: Storage pra logo/imagem da loja
-- ============================================================
-- Contexto: upload de imagem no Perfil da Loja. Levantamento antes de
-- implementar:
--   • lojista.logo_url (TEXT, nullable) JÁ EXISTE desde a migration 001
--     — nunca foi usado até agora. Reaproveitado como está, sem coluna
--     nova: só guarda a URL pública do arquivo, nunca o binário.
--   • Não existia NENHUM bucket de Supabase Storage configurado no
--     projeto ainda — esta é a primeira vez que o projeto usa Storage.
--
-- Bucket público (leitura sem autenticação) porque essa é justamente a
-- intenção: a imagem vai aparecer futuramente no Agendamento Online,
-- uma tela pública. Escrita (INSERT/UPDATE/DELETE) continua exigindo
-- autenticação e é restrita à própria pasta do lojista — "público" aqui
-- é só sobre o GET final da imagem, igual qualquer avatar/logo na web.
--
-- Estratégia de nome de arquivo: {id_lojista}/logo.{ext} — uma pasta por
-- lojista (igual ao padrão de multi-tenant por pasta que o próprio
-- Supabase Storage recomenda). Antes de cada novo upload, o código APAGA
-- todo o conteúdo da pasta do lojista antes de subir o novo arquivo —
-- evita arquivo órfão mesmo quando o formato muda (ex.: era .png, virou
-- .webp), sem precisar fixar uma extensão só.
--
-- Limite de tamanho (5 MB) e tipos aceitos (jpeg/png/webp) configurados
-- no próprio bucket — o Storage do Supabase já recusa no nível de API
-- qualquer upload fora disso, antes mesmo do arquivo chegar a ser salvo.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos-loja',
  'logos-loja',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- POLÍTICAS: storage.objects, escopadas ao bucket 'logos-loja'
-- ============================================================
-- (storage.foldername(name))[1] é o primeiro segmento do caminho — no
-- padrão {id_lojista}/logo.ext, é exatamente o id_lojista. Comparado
-- contra auth.uid() garante que um lojista só grava/apaga dentro da
-- própria pasta, nunca na de outro.

DROP POLICY IF EXISTS "logos-loja: leitura publica" ON storage.objects;
CREATE POLICY "logos-loja: leitura publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos-loja');

DROP POLICY IF EXISTS "logos-loja: lojista envia na propria pasta" ON storage.objects;
CREATE POLICY "logos-loja: lojista envia na propria pasta"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'logos-loja'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "logos-loja: lojista atualiza a propria pasta" ON storage.objects;
CREATE POLICY "logos-loja: lojista atualiza a propria pasta"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'logos-loja'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "logos-loja: lojista remove da propria pasta" ON storage.objects;
CREATE POLICY "logos-loja: lojista remove da propria pasta"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'logos-loja'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
