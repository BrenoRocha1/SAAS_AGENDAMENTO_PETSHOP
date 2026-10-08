-- ============================================================
-- PETSHOP SaaS - Migration 089: código de acesso do painel interno
-- ============================================================
-- Cada administrador da plataforma pode ter um código longo (gerado no
-- próprio painel) para entrar em /central-…/entrar sem passar pelo Google.
-- Guarda só o hash (SHA-256); quem escreve é o service_role (RLS de
-- admin_usuario já não tem policy de escrita — migration 009).
-- ============================================================

ALTER TABLE admin_usuario ADD COLUMN IF NOT EXISTS codigo_hash TEXT UNIQUE;
ALTER TABLE admin_usuario ADD COLUMN IF NOT EXISTS codigo_gerado_em TIMESTAMPTZ;
