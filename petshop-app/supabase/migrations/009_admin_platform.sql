-- ============================================================
-- PETSHOP SaaS - Migration 009: Admin da plataforma (fundação)
-- ============================================================
-- Objetivo: um painel interno (fora do fluxo cliente/lojista) para a
-- equipe da plataforma listar as empresas cadastradas. Não mexe em
-- nenhuma tabela, policy ou enum existente — é 100% aditivo.
--
-- Autorização por tabela (não por env var): quem está aqui dentro,
-- autenticado normalmente pelo /login como qualquer outro usuário, e
-- com `ativo = true`, é considerado admin da plataforma.
--
-- Propositalmente NÃO existe policy de INSERT/UPDATE/DELETE para o
-- role `authenticated` — promover alguém a admin é um ato deliberado,
-- feito direto no banco (SQL Editor / service_role), nunca pela
-- aplicação. Isso evita que a própria app vire uma superfície de
-- escalonamento de privilégio.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_usuario (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  nome        TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_admin_usuario_updated_at
  BEFORE UPDATE ON admin_usuario
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE admin_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_usuario FORCE ROW LEVEL SECURITY;

-- Um admin só consegue ler a própria linha (o suficiente para o app
-- checar "eu sou admin?" via auth.uid()). Ele não enxerga a lista de
-- outros admins por aqui.
CREATE POLICY "admin_usuario: select proprio"
  ON admin_usuario FOR SELECT
  USING (id = auth.uid());

-- ============================================================
-- Como promover alguém a admin da plataforma (manual, no SQL Editor):
--
--   insert into admin_usuario (id, email, nome)
--   values ('<uuid do usuário em auth.users>', 'pessoa@dominio.com', 'Nome');
--
-- O UUID precisa ser de um usuário que já existe em auth.users (ou
-- seja, a pessoa já deve ter uma conta criada normalmente pelo /login,
-- /cadastro ou /cadastro/lojista).
-- ============================================================
