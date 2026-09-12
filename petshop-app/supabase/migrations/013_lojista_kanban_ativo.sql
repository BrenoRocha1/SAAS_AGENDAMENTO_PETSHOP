-- ============================================================
-- PETSHOP SaaS - Migration 013: Ativar/desativar o Kanban de agendamentos
-- ============================================================
-- Motivo: o Kanban (tela /lojista/kanban) precisa de uma configuração
-- por lojista, persistida — "ativar/desativar essa funcionalidade" —
-- e não existia nenhuma coluna de configuração de recursos na tabela
-- `lojista` (só dados de identificação/endereço + `ativo`, que é o
-- status da CONTA inteira, não de um recurso específico). Por isso
-- essa coluna nova, em vez de reaproveitar algo que já existia.
--
-- Fica em `lojista` (não numa tabela de "configurações" separada)
-- porque é exatamente o mesmo padrão já usado pelo projeto: `lojista`
-- já é onde moram as flags da conta (ex.: `ativo`).
-- ============================================================

ALTER TABLE lojista
  ADD COLUMN IF NOT EXISTS kanban_ativo BOOLEAN NOT NULL DEFAULT true;

-- Sem policy de RLS nova: a policy "lojista: update proprio" (migration
-- 002) já permite ao lojista atualizar qualquer coluna da sua própria
-- linha, incluindo esta.
