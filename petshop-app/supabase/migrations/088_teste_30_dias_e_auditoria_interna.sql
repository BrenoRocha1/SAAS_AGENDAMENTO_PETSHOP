-- ============================================================
-- PETSHOP SaaS - Migration 088: período de teste de 30 dias + auditoria
-- do painel interno
-- ============================================================
-- Cada petshop (lojista) novo ganha 30 dias de teste: `acesso_ate` nasce
-- com NOW() + 30 dias. Passando disso, o painel da loja e a página pública
-- de agendamento ficam bloqueados (a checagem é feita pelo app — ver
-- lib/acesso-loja.ts). Quando a cobrança começar, é só empurrar
-- `acesso_ate` a cada pagamento. `acesso_livre` = nunca bloqueia (parceiros,
-- contas internas, quem a gente isentar).
--
-- As lojas que já existem hoje também ganham 30 dias a partir de agora
-- (o DEFAULT é calculado uma vez no ALTER), então ninguém é bloqueado de
-- surpresa.
-- ============================================================

ALTER TABLE lojista ADD COLUMN IF NOT EXISTS acesso_ate TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days');
ALTER TABLE lojista ADD COLUMN IF NOT EXISTS acesso_livre BOOLEAN NOT NULL DEFAULT FALSE;

-- Quem fez o quê dentro do painel interno (estender teste, entrar na conta
-- de alguém, ativar/desativar...). Só o service_role escreve e lê: RLS
-- ligada e FORÇADA, sem nenhuma policy.
CREATE TABLE IF NOT EXISTS admin_auditoria (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_admin    UUID NOT NULL,
  email_admin TEXT NOT NULL,
  acao        TEXT NOT NULL,
  alvo_tipo   TEXT,
  alvo_id     UUID,
  detalhes    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_auditoria FORCE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_admin_auditoria_data ON admin_auditoria(created_at DESC);
