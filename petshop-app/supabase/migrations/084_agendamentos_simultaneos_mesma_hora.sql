-- ============================================================
-- PETSHOP SaaS - Migration 084: agendamentos simultâneos na mesma hora
-- ============================================================
-- A migration 076 deixou a loja aceitar mais de um agendamento ao mesmo
-- tempo (lojista.agendamentos_simultaneos), mas o índice único da 001
-- continuou no banco:
--
--   idx_agendamento_unique_slot (id_lojista, dt_agendamento, hr_agendamento)
--
-- Ele só deixa UM agendamento não cancelado por loja, dia e hora de início.
-- Com limite 2 (ou mais), o horário aparecia livre, a conferência de vaga
-- passava e o INSERT batia no índice — "Erro ao criar agendamento" para
-- quem escolhia exatamente a hora de início de outro agendamento. Horários
-- diferentes que só se sobrepõem (15:00 e 15:15) passavam, por isso não
-- apareceu antes. O mesmo valia para remarcar para uma hora já usada.
--
-- Quem protege contra agendamento em dobro desde a 076 é fn_conferir_vaga
-- (trava a agenda da loja naquele dia, confere se o pet já tem serviço no
-- horário e se a loja chegou ao limite). O índice único só fazia sentido
-- quando a loja inteira era uma vaga só.
--
-- No lugar fica um índice comum, com as mesmas colunas, para as consultas
-- por loja/dia/hora continuarem rápidas.
--
-- Para conferir antes de rodar (deve devolver uma linha) e depois (nenhuma):
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'agendamento' AND indexname = 'idx_agendamento_unique_slot';
-- ============================================================

DROP INDEX IF EXISTS idx_agendamento_unique_slot;

CREATE INDEX IF NOT EXISTS idx_agendamento_slot
  ON agendamento (id_lojista, dt_agendamento, hr_agendamento)
  WHERE status <> 'Cancelado';
