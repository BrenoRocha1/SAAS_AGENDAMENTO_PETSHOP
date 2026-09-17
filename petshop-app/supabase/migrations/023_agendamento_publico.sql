-- ============================================================
-- PETSHOP SaaS - Migration 023: link de agendamento público
-- ============================================================
-- Contexto: /agendamento/[id_lojista] agora é uma página pública — dá
-- pra ver a loja e os serviços sem login, só o agendamento em si exige
-- conta de cliente. Só faltava uma policy: hoje `lojista` só é visível
-- pro próprio dono ("lojista: select proprio") ou pra clientes JÁ
-- logados ("lojista: clientes podem ver lojas ativas", exige
-- auth_role() = 'cliente') — um visitante anônimo (role `anon`, sem
-- sessão nenhuma) não batia em nenhuma das duas e recebia 0 linhas.
--
-- `servico` e `horario` (migration 002) já não tinham essa trava — as
-- policies deles ("usuarios veem servicos/horarios ativos") não checam
-- role nenhuma, então já funcionavam pra anônimo. Só `lojista` precisava
-- dessa policy nova, restrita à role `anon` (não mexe nas policies que
-- já existem pra `authenticated`/lojista dono).
-- ============================================================

CREATE POLICY "lojista: acesso publico as lojas ativas"
  ON lojista FOR SELECT
  TO anon
  USING (ativo = TRUE);
