-- ============================================================
-- PETSHOP SaaS - Migration 072: LGPD — cliente exclui a própria conta
-- ============================================================
-- A 032 preparou o agendamento para perder o cliente/pet (ON DELETE SET
-- NULL), mas na mesma migration criou a trava "não mude cliente/pet de um
-- agendamento" — que também barrava o SET NULL do próprio apagamento. E
-- ainda travavam a exclusão: avaliação, produto comprado e corrida do
-- TaxiDog (RESTRICT) e o audit_log (FK para o usuário, e o log é imutável).
--
-- Agora, ao excluir o cliente (pela tela "Excluir minha conta" ou pelo
-- painel do Supabase):
-- • Apagados: cadastro (nome, CPF, e-mail, telefone), pets, avaliações que
--   ele escreveu, vínculos com lojas; observações dos agendamentos e o
--   endereço das corridas do TaxiDog ficam em branco.
-- • Agendamentos ainda marcados (Pendente/Aceito) são cancelados.
-- • Mantido para a loja, sem ligação com a pessoa: agendamentos feitos,
--   valores, pagamentos, produtos vendidos, cobranças de plano, corridas
--   (sem endereço) — obrigação fiscal/contábil da loja.
-- • O audit_log continua imutável; só deixa de apontar para o usuário.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Trava da 032: deixa o SET NULL do apagamento passar (o cliente/pet
--    de origem já não existe). A marca da 070 (editar serviço/pet) segue.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2) Chaves que barravam a exclusão
-- ------------------------------------------------------------
-- Remove as FKs atuais (nomes padrão, mas procura pelo catálogo para não
-- depender deles).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT c.conname, c.conrelid::regclass AS tabela
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND (
        (c.conrelid = 'public.audit_log'::regclass AND a.attname = 'id_usuario')
        OR (c.conrelid = 'public.avaliacao'::regclass AND a.attname IN ('id_cliente', 'id_pet'))
        OR (c.conrelid = 'public.agendamento_produto'::regclass AND a.attname = 'id_cliente')
        OR (c.conrelid = 'public.taxidog_corrida'::regclass AND a.attname IN ('id_cliente', 'id_pet'))
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabela, r.conname);
  END LOOP;
END $$;

-- audit_log: guarda o id como valor solto (o log é imutável e não pode
-- ser atualizado pelo SET NULL). Sem FK, excluir o usuário não o bloqueia.

-- Avaliação: é conteúdo do cliente — sai junto com ele (e com o pet).
ALTER TABLE avaliacao
  ADD CONSTRAINT avaliacao_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE CASCADE,
  ADD CONSTRAINT avaliacao_id_pet_fkey FOREIGN KEY (id_pet) REFERENCES pet(id_pet) ON DELETE CASCADE;

-- Produto vendido: fica para a loja (CMV, relatório), sem o cliente.
ALTER TABLE agendamento_produto ALTER COLUMN id_cliente DROP NOT NULL;
ALTER TABLE agendamento_produto
  ADD CONSTRAINT agendamento_produto_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE SET NULL;

-- Corrida do TaxiDog: fica para a loja (taxa, relatório), sem cliente/pet
-- (e sem endereço — ver o trigger abaixo).
ALTER TABLE taxidog_corrida ALTER COLUMN id_cliente DROP NOT NULL;
ALTER TABLE taxidog_corrida ALTER COLUMN id_pet DROP NOT NULL;
ALTER TABLE taxidog_corrida
  ADD CONSTRAINT taxidog_corrida_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE SET NULL,
  ADD CONSTRAINT taxidog_corrida_id_pet_fkey FOREIGN KEY (id_pet) REFERENCES pet(id_pet) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 3) Antes de apagar o cliente: cancela o que estava marcado e limpa o
--    que é dado pessoal nos registros que ficam com a loja. Vale para a
--    tela e para exclusão feita pelo painel do Supabase.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_trg_cliente_excluido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Marcados e ainda não feitos: cancelados (TaxiDog, plano e pagamento
  -- se ajustam pelos triggers do agendamento).
  UPDATE agendamento SET status = 'Cancelado', cancelado_por = 'cliente'
  WHERE id_cliente = OLD.id_cliente AND status IN ('Pendente', 'Confirmado');

  -- Plano ativo não gera mais período nem cobrança (as cobranças que já
  -- existem ficam para a loja decidir).
  INSERT INTO assinatura_historico (id_lojista, id_plano, id_assinatura, tipo, descricao, id_usuario)
  SELECT a.id_lojista, a.id_plano, a.id_assinatura, 'assinatura_cancelada',
         'Assinatura cancelada — o cliente excluiu a conta. Nenhuma cobrança nova será gerada.', auth.uid()
  FROM assinatura a WHERE a.id_cliente = OLD.id_cliente AND a.status = 'ativa';
  UPDATE assinatura SET status = 'cancelada', cancelada_em = NOW(), motivo_cancelamento = 'Conta do cliente excluída'
  WHERE id_cliente = OLD.id_cliente AND status = 'ativa';

  -- Texto livre pode ter dado pessoal.
  UPDATE agendamento SET obs = NULL
  WHERE id_cliente = OLD.id_cliente AND obs IS NOT NULL;

  -- Endereço de busca/entrega: some (fica só cidade/UF para relatório).
  UPDATE taxidog_corrida
  SET cep = '00000000', logradouro = 'Endereço removido', numero = '0', complemento = NULL,
      bairro = 'Removido', lat = NULL, lng = NULL
  WHERE id_cliente = OLD.id_cliente;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cliente_excluido ON cliente;
CREATE TRIGGER trg_cliente_excluido
  BEFORE DELETE ON cliente
  FOR EACH ROW EXECUTE FUNCTION fn_trg_cliente_excluido();

-- ------------------------------------------------------------
-- 4) "Excluir minha conta" (o próprio cliente). O login (auth.users) é
--    apagado depois pelo servidor, com a chave de serviço.
--    Mensagens com "Excluir:" chegam prontas na tela.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_excluir_minha_conta()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_cancelados INTEGER;
  v_pets       INTEGER;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM cliente WHERE id_cliente = v_uid) THEN
    RAISE EXCEPTION 'Excluir: só uma conta de cliente pode ser excluída por aqui';
  END IF;
  -- Pet na loja ou no TaxiDog agora: espera terminar.
  IF EXISTS (SELECT 1 FROM agendamento WHERE id_cliente = v_uid AND status = 'Em andamento') THEN
    RAISE EXCEPTION 'Excluir: um pet seu está em atendimento agora — tente de novo depois que terminar';
  END IF;
  IF EXISTS (
    SELECT 1 FROM taxidog_corrida
    WHERE id_cliente = v_uid
      AND status IN ('a_caminho_cliente', 'no_endereco', 'pet_embarcado', 'entregue_loja',
                     'pronto_entrega', 'a_caminho_entrega', 'no_endereco_entrega')
  ) THEN
    RAISE EXCEPTION 'Excluir: um pet seu está com o TaxiDog ou esperando a entrega — tente de novo depois que ele voltar para casa';
  END IF;

  SELECT COUNT(*) INTO v_cancelados FROM agendamento WHERE id_cliente = v_uid AND status IN ('Pendente', 'Confirmado');
  SELECT COUNT(*) INTO v_pets FROM pet WHERE id_cliente = v_uid;

  DELETE FROM cliente WHERE id_cliente = v_uid;

  RETURN jsonb_build_object('agendamentos_cancelados', v_cancelados, 'pets', v_pets);
END;
$$;
REVOKE ALL ON FUNCTION fn_excluir_minha_conta() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_excluir_minha_conta() TO authenticated;

-- ------------------------------------------------------------
-- 5) Agenda do dia (Dashboard): atendimento de cliente excluído continua
--    aparecendo (e somando no faturamento), sem nome. Mesma função da 058
--    com LEFT JOIN no cliente e no pet.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_agenda_dia(
  p_id_lojista  UUID,
  p_data        DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id_agendamento  UUID,
  hr_agendamento  TIME,
  nome_cliente    TEXT,
  nome_pet        TEXT,
  nome_servico    TEXT,
  duracao         INTEGER,
  status          status_agendamento,
  valor           NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    a.id_agendamento,
    a.hr_agendamento,
    COALESCE(c.nome, 'Cliente excluído') AS nome_cliente,
    COALESCE(p.nome, 'Pet excluído') AS nome_pet,
    s.nome AS nome_servico,
    s.duracao,
    a.status,
    a.valor
  FROM agendamento a
  LEFT JOIN cliente c ON c.id_cliente = a.id_cliente
  LEFT JOIN pet     p ON p.id_pet = a.id_pet
  JOIN servico s ON s.id_servico = a.id_servico
  WHERE a.id_lojista = p_id_lojista
    AND a.dt_agendamento = p_data
    AND a.status != 'Cancelado'
  ORDER BY a.hr_agendamento;
END;
$$;
