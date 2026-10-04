-- ============================================================
-- PETSHOP SaaS - Migration 081: excluir serviço que já tem histórico
-- ============================================================
-- Antes só dava pra excluir serviço que nunca teve agendamento; com
-- histórico, a saída era deixá-lo "Inativo" — e ele continuava na lista de
-- serviços da loja para sempre.
--
-- A linha não pode ser apagada: agendamentos, planos e avaliações apontam
-- pra ela (ON DELETE RESTRICT), e é dela que o relatório de vendas tira o
-- nome do serviço. Então o serviço "excluído" continua no banco, marcado
-- aqui e com status 'Inativo': some da tela de Serviços, da escolha de
-- serviço dos planos e de qualquer agendamento novo (que já só oferece
-- serviço 'Ativo'), mas segue aparecendo no relatório e nos históricos.
--
-- Serviço sem nada ligado a ele continua sendo apagado de verdade.

ALTER TABLE servico ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ;
