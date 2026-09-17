-- ============================================================
-- PETSHOP SaaS - Migration 024: link de agendamento personalizado
-- ============================================================
-- Contexto: /agendamento/[id] hoje só aceita o UUID do lojista no link.
-- O lojista pode opcionalmente escolher um "slug" (nome curto e único,
-- ex.: petshopbacanadopedro) pra usar no lugar do UUID:
--   https://.../agendamento/petshopbacanadopedro
-- em vez de
--   https://.../agendamento/74440be9-4841-44ca-91de-78b4bd40fa18
--
-- Nullable e opcional — quem não escolher um continua funcionando
-- normalmente com o link por UUID (a página aceita os dois, ver
-- src/app/agendamento/[id]/page.tsx).
-- ============================================================

ALTER TABLE lojista
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE
  CHECK (
    slug IS NULL
    OR (char_length(slug) BETWEEN 3 AND 60 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  );

COMMENT ON COLUMN lojista.slug IS 'Nome curto e único escolhido pelo lojista pra usar em /agendamento/[slug] no lugar do UUID.';
