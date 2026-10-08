-- ============================================================
-- PETSHOP SaaS - Migration 086: excluir conta com agendamento
-- ============================================================
-- "Excluir minha conta" (migration 072) falhava para todo cliente que
-- tivesse qualquer agendamento, mesmo cancelado:
--
--   update or delete on table "cliente" violates foreign key constraint
--   "agendamento_id_cliente_fkey" on table "agendamento"
--
-- Ou seja: no banco em uso, a ligação do agendamento com o cliente ainda
-- BLOQUEIA apagar o cliente — como na migration 001. A 032 trocava isso
-- por "o agendamento fica, sem o cliente" (ON DELETE SET NULL), mas essa
-- parte não está valendo no banco. A exclusão é uma transação só: quando
-- falha, nada é apagado (não fica conta pela metade).
--
-- Aqui a regra é reafirmada, de um jeito que dá certo qualquer que seja o
-- estado atual: as ligações de agendamento com cliente e com pet são
-- procuradas pelo catálogo (com o nome que tiverem), removidas e recriadas
-- como SET NULL, e as duas colunas passam a aceitar vazio. Nenhuma linha
-- existente muda. O que muda é só o que acontece quando um cliente (ou um
-- pet) é apagado: o agendamento continua no histórico da loja, sem o nome.
--
-- A função do gatilho que protege o agendamento também é regravada na
-- versão da 072 (a que deixa o banco esvaziar cliente/pet de quem já foi
-- apagado) — se estivesse uma versão anterior, a exclusão pararia nela. O
-- gatilho em si não é criado nem mexido aqui: nenhuma trava nova entra.
--
-- No fim, a consulta mostra, para cada ligação com cliente ou pet, como
-- estava ANTES e como ficou DEPOIS.
-- ============================================================

DROP TABLE IF EXISTS pg_temp._fk_antes;
CREATE TEMP TABLE _fk_antes AS
SELECT c.conrelid::regclass::text AS tabela, a.attname::text AS coluna,
       c.confdeltype::text AS regra, a.attnotnull AS obrigatoria
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
WHERE c.contype = 'f'
  AND c.confrelid IN ('public.cliente'::regclass, 'public.pet'::regclass);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.agendamento'::regclass
      AND c.confrelid IN ('public.cliente'::regclass, 'public.pet'::regclass)
      AND a.attname IN ('id_cliente', 'id_pet')
  LOOP
    EXECUTE format('ALTER TABLE agendamento DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE agendamento ALTER COLUMN id_cliente DROP NOT NULL;
ALTER TABLE agendamento ALTER COLUMN id_pet DROP NOT NULL;

ALTER TABLE agendamento
  ADD CONSTRAINT agendamento_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE SET NULL,
  ADD CONSTRAINT agendamento_id_pet_fkey FOREIGN KEY (id_pet) REFERENCES pet(id_pet) ON DELETE SET NULL;

-- A mesma função da migration 072, sem mudança.
CREATE OR REPLACE FUNCTION fn_agendamento_no_mass_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edita BOOLEAN := current_setting('saip.editar_agendamento', TRUE) = 'on';
BEGIN
  IF OLD.id_lojista IS DISTINCT FROM NEW.id_lojista
     OR (OLD.id_cliente IS DISTINCT FROM NEW.id_cliente
         AND NOT (NEW.id_cliente IS NULL AND NOT EXISTS (SELECT 1 FROM cliente c WHERE c.id_cliente = OLD.id_cliente)))
     OR (OLD.id_pet IS DISTINCT FROM NEW.id_pet
         AND NOT (NEW.id_pet IS NULL AND NOT EXISTS (SELECT 1 FROM pet p WHERE p.id_pet = OLD.id_pet))
         AND NOT (v_edita AND NEW.id_pet IS NOT NULL))
     OR (OLD.id_servico IS DISTINCT FROM NEW.id_servico AND NOT v_edita)
  THEN
    RAISE EXCEPTION 'Acesso negado: Não é permitido alterar o Cliente, Pet, Serviço ou Lojista de um agendamento existente. Por favor, cancele este e crie um novo.';
  END IF;
  RETURN NEW;
END;
$$;

-- Antes e depois. "bloqueia" = não deixa apagar; "esvazia" = o registro
-- fica, sem a ligação; "apaga junto" = o registro vai embora com o dono.
SELECT d.tabela, d.coluna,
       CASE a.regra WHEN 'n' THEN 'esvazia' WHEN 'c' THEN 'apaga junto' WHEN 'a' THEN 'bloqueia' WHEN 'r' THEN 'bloqueia' ELSE COALESCE(a.regra, '(não existia)') END AS antes,
       CASE d.regra WHEN 'n' THEN 'esvazia' WHEN 'c' THEN 'apaga junto' WHEN 'a' THEN 'bloqueia' WHEN 'r' THEN 'bloqueia' ELSE d.regra END AS depois,
       COALESCE(a.obrigatoria::text, '—') AS era_obrigatoria,
       d.obrigatoria AS e_obrigatoria
FROM (
  SELECT c.conrelid::regclass::text AS tabela, at.attname::text AS coluna,
         c.confdeltype::text AS regra, at.attnotnull AS obrigatoria
  FROM pg_constraint c
  JOIN pg_attribute at ON at.attrelid = c.conrelid AND at.attnum = ANY (c.conkey)
  WHERE c.contype = 'f'
    AND c.confrelid IN ('public.cliente'::regclass, 'public.pet'::regclass)
) d
LEFT JOIN pg_temp._fk_antes a ON a.tabela = d.tabela AND a.coluna = d.coluna
ORDER BY d.tabela, d.coluna;
