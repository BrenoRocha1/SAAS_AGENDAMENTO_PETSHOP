-- ============================================================
-- PETSHOP SaaS - Migration 005: Tabela funcionário
-- ============================================================
-- Funcionários são registrados pelo lojista e possuem login
-- próprio com permissões granulares.
-- ============================================================

-- Adicionar novo valor ao enum role_usuario
-- (em Postgres, ADD VALUE não pode rodar dentro de transação,
--  portanto precisa de IF NOT EXISTS para idempotência)
ALTER TYPE role_usuario ADD VALUE IF NOT EXISTS 'funcionario';

-- ============================================================
-- TABELA: funcionario
-- ============================================================
CREATE TABLE IF NOT EXISTS funcionario (
  id_funcionario  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  nome            TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
  email           TEXT NOT NULL UNIQUE CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  telefone        TEXT NOT NULL CHECK (telefone ~ '^\d{10,11}$'),
  cargo           TEXT CHECK (char_length(cargo) <= 100),

  -- Permissões granulares
  pode_gerenciar_agenda   BOOLEAN NOT NULL DEFAULT TRUE,
  pode_gerenciar_servicos BOOLEAN NOT NULL DEFAULT FALSE,

  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_funcionario_lojista ON funcionario(id_lojista);
CREATE INDEX IF NOT EXISTS idx_funcionario_email   ON funcionario(email);
CREATE INDEX IF NOT EXISTS idx_funcionario_ativo   ON funcionario(id_lojista, ativo);

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================
CREATE TRIGGER trg_funcionario_updated_at
  BEFORE UPDATE ON funcionario
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
