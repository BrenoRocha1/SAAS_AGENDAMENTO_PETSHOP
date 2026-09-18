-- ============================================================
-- PETSHOP SaaS - Migration 036: Som de novos agendamentos
-- ============================================================
-- Configuração da LOJA (não por pessoa): quando ativada, todo mundo que
-- estiver com o painel aberto — lojista e funcionários — ouve o som
-- escolhido assim que um agendamento é criado, não importa por onde ele
-- entrou (walk-in cadastrado pelo lojista, futuramente o agendamento
-- online). Mesmo padrão de toggle de loja que kanban_ativo (migration
-- 013) e aceita_agendamento_online (migration 020) já usam.
--
-- O disparo em si NÃO é feito por trigger/webhook — é Supabase Realtime
-- (Postgres Changes) direto no navegador de quem está logado, ouvindo
-- INSERT em `agendamento`. Por isso esta migration também garante que a
-- tabela está na publicação `supabase_realtime`; sem isso, nenhum evento
-- chega no cliente. RLS já filtra sozinho quem recebe o quê (a mesma
-- policy "agendamento: lojista/funcionario ve do petshop" que já existe
-- pra SELECT vale pra Realtime também), então o INSERT de uma loja nunca
-- vaza pra outra.

ALTER TABLE lojista
  ADD COLUMN IF NOT EXISTS som_novo_agendamento_ativo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS som_novo_agendamento_tipo TEXT NOT NULL DEFAULT 'sino';

-- Constraint separada (em vez de inline no ADD COLUMN) pra poder recriar
-- sem erro se a migration for colada de novo por engano.
ALTER TABLE lojista DROP CONSTRAINT IF EXISTS lojista_som_novo_agendamento_tipo_check;
ALTER TABLE lojista ADD CONSTRAINT lojista_som_novo_agendamento_tipo_check
  CHECK (som_novo_agendamento_tipo IN ('sino', 'notificacao', 'campainha', 'alerta_suave', 'alerta_duplo'));

-- Habilita Realtime pra agendamento, se ainda não estiver habilitado —
-- ALTER PUBLICATION ... ADD TABLE dá erro se a tabela já estiver nela
-- (diferente de CREATE, não existe "IF NOT EXISTS" pra isso), daí o DO
-- block conferindo antes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agendamento'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agendamento;
  END IF;
END $$;
