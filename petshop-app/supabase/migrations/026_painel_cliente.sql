-- ============================================================
-- PETSHOP SaaS - Migration 026: Painel do Cliente (foto do pet +
-- filtro inteligente de petshops em "Novo Agendamento")
-- ============================================================
-- Contexto: duas necessidades novas do painel do cliente.
--
-- 1) Foto do pet: pet.foto_url (TEXT, nullable) guarda só a URL pública
--    do Storage — mesmo padrão de lojista.logo_url (migration 021).
--    Bucket novo 'fotos-pet', público pra leitura (a foto pode aparecer
--    futuramente em telas do lojista/agendamento online), escrita restrita
--    à própria pasta do cliente. Como um cliente pode ter vários pets, a
--    pasta é por CLIENTE (não por pet): cada arquivo dentro dela se chama
--    {id_pet}.{ext}, então (storage.foldername(name))[1] = auth.uid()
--    continua garantindo isolamento entre clientes.
--
-- 2) "Novo Agendamento" (/cliente/novo-agendamento) mostrava TODOS os
--    lojistas ativos com agendamento online habilitado — um marketplace
--    aberto, quando a intenção do produto é outra: o cliente descobre um
--    petshop pelo link público exclusivo dele (/agendamento/[slug],
--    construído nas migrations 022-025) e, depois de agendar lá uma vez,
--    esse petshop passa a aparecer no painel pra agendamentos futuros mais
--    rápidos. Isso já é exatamente o que `cliente_lojista` representa
--    (migration 014) — só faltava o CLIENTE conseguir ler os próprios
--    vínculos; a única policy de SELECT existente era só pro lojista.
-- ============================================================

-- ============================================================
-- 1) pet.foto_url
-- ============================================================
ALTER TABLE pet ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- ============================================================
-- 2) Bucket de Storage 'fotos-pet'
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fotos-pet',
  'fotos-pet',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "fotos-pet: leitura publica" ON storage.objects;
CREATE POLICY "fotos-pet: leitura publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fotos-pet');

DROP POLICY IF EXISTS "fotos-pet: cliente envia na propria pasta" ON storage.objects;
CREATE POLICY "fotos-pet: cliente envia na propria pasta"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'fotos-pet'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "fotos-pet: cliente atualiza a propria pasta" ON storage.objects;
CREATE POLICY "fotos-pet: cliente atualiza a propria pasta"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'fotos-pet'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "fotos-pet: cliente remove da propria pasta" ON storage.objects;
CREATE POLICY "fotos-pet: cliente remove da propria pasta"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'fotos-pet'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 3) cliente_lojista: cliente também enxerga os próprios vínculos
-- ============================================================
-- Policies de SELECT são permissivas (somam com OR) — isso só ADICIONA
-- visibilidade pro cliente sobre as próprias linhas, sem tirar nada da
-- policy do lojista (migration 014).
DROP POLICY IF EXISTS "cliente_lojista: cliente ve os seus" ON cliente_lojista;
CREATE POLICY "cliente_lojista: cliente ve os seus"
  ON cliente_lojista FOR SELECT
  USING (id_cliente = auth.uid() AND auth_role() = 'cliente');
