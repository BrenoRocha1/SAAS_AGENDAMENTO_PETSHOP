-- ============================================================
-- PETSHOP SaaS - Migration 012: atribuição de profissional
-- ============================================================
-- Permite marcar qual funcionário atende cada agendamento, pra dar
-- suporte ao filtro "ver agendamentos de cada profissional" na tela
-- de agenda do lojista.
--
-- Fica NULL por padrão pra todo agendamento novo (inclusive os que o
-- cliente cria sozinho pelo app dele) — o lojista atribui manualmente
-- depois, pela tela de agendamentos. Não quebra nada existente: toda
-- leitura/escrita de agendamento que já existia continua funcionando
-- sem informar essa coluna.
-- ============================================================

ALTER TABLE agendamento
  ADD COLUMN IF NOT EXISTS id_funcionario UUID REFERENCES funcionario(id_funcionario) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamento_funcionario ON agendamento(id_funcionario);

-- A policy "agendamento: lojista gerencia" (migration 002) já permite
-- UPDATE de qualquer coluna em agendamentos do próprio petshop
-- (USING/WITH CHECK id_lojista = auth.uid(), sem restringir colunas),
-- então atribuir funcionário é um .update() comum — não precisa de
-- policy nem RPC novos.
