-- ============================================================
-- PETSHOP SaaS - Migration 105: painel interno — converter conta
-- (cliente <-> loja)
-- ============================================================
-- A equipe do SAIP pode transformar uma conta de cliente em loja e uma de
-- loja em cliente (painel interno → Contas). Para isso, os dados do perfil
-- antigo são apagados; antes, o painel pode guardar um arquivo de backup
-- (Storage, bucket privado) para restaurar se a pessoa mudar de ideia.
--
-- Duas funções, chamadas só pelo servidor (service_role):
--
--   fn_interno_excluir_cliente(id) — a mesma exclusão do "Excluir minha
--     conta" (migration 072/073/086): cancela o que estava marcado, apaga
--     cadastro, pets, avaliações e vínculos com lojas e deixa sem ligação
--     com a pessoa o que fica com as lojas. Mesmas travas: pet em
--     atendimento ou com o TaxiDog agora.
--
--   fn_interno_excluir_loja(id) — a loja some inteira: agendamentos (e o que
--     depende deles: produtos do atendimento, adicionais, corridas do
--     TaxiDog, avaliações), vendas do PDV, planos e assinaturas, serviços,
--     produtos, equipe, horários e configurações. Os clientes continuam com
--     as contas deles, só sem esta loja. Devolve os ids da equipe para o
--     servidor apagar os logins (auth.users) depois.
--
-- A ordem importa: agendamento, avaliação, assinatura e plano têm chaves
-- RESTRICT (para a loja, para o serviço ou para o produto) que barrariam o
-- DELETE da loja se ainda existissem.
--
-- Pode rodar de novo sem problema.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_interno_excluir_cliente(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelados INTEGER;
  v_pets       INTEGER;
BEGIN
  IF p_id IS NULL OR NOT EXISTS (SELECT 1 FROM cliente WHERE id_cliente = p_id) THEN
    RAISE EXCEPTION 'Converter: esta conta não tem cadastro de cliente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM agendamento
    WHERE id_cliente = p_id AND status = 'Em andamento'
      AND dt_agendamento >= CURRENT_DATE - 1
  ) THEN
    RAISE EXCEPTION 'Converter: um pet desta conta está em atendimento agora — tente de novo depois que terminar';
  END IF;
  IF EXISTS (
    SELECT 1 FROM taxidog_corrida c
    JOIN agendamento a ON a.id_agendamento = c.id_agendamento
    WHERE c.id_cliente = p_id
      AND c.status IN ('a_caminho_cliente', 'no_endereco', 'pet_embarcado', 'entregue_loja',
                       'pronto_entrega', 'a_caminho_entrega', 'no_endereco_entrega')
      AND a.dt_agendamento >= CURRENT_DATE - 1
  ) THEN
    RAISE EXCEPTION 'Converter: um pet desta conta está com o TaxiDog agora — tente de novo depois que ele voltar para casa';
  END IF;

  SELECT COUNT(*) INTO v_cancelados FROM agendamento WHERE id_cliente = p_id AND status IN ('Pendente', 'Confirmado');
  SELECT COUNT(*) INTO v_pets FROM pet WHERE id_cliente = p_id;

  -- O resto é o trigger de exclusão do cliente (migrations 072 e 095).
  DELETE FROM cliente WHERE id_cliente = p_id;

  RETURN jsonb_build_object('agendamentos_cancelados', v_cancelados, 'pets', v_pets);
END;
$$;

REVOKE ALL ON FUNCTION fn_interno_excluir_cliente(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_interno_excluir_cliente(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_interno_excluir_cliente(UUID) TO service_role;

CREATE OR REPLACE FUNCTION fn_interno_excluir_loja(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_equipe       UUID[];
  v_agendamentos INTEGER;
  v_vendas       INTEGER;
  v_servicos     INTEGER;
  v_produtos     INTEGER;
  v_clientes     INTEGER;
  v_planos       INTEGER;
BEGIN
  IF p_id IS NULL OR NOT EXISTS (SELECT 1 FROM lojista WHERE id_lojista = p_id) THEN
    RAISE EXCEPTION 'Converter: esta conta não tem cadastro de loja';
  END IF;

  SELECT COALESCE(array_agg(id_funcionario), '{}') INTO v_equipe FROM funcionario WHERE id_lojista = p_id;
  SELECT COUNT(*) INTO v_agendamentos FROM agendamento WHERE id_lojista = p_id;
  SELECT COUNT(*) INTO v_vendas FROM venda WHERE id_lojista = p_id;
  SELECT COUNT(*) INTO v_servicos FROM servico WHERE id_lojista = p_id;
  SELECT COUNT(*) INTO v_produtos FROM produto WHERE id_lojista = p_id;
  SELECT COUNT(*) INTO v_clientes FROM cliente_lojista WHERE id_lojista = p_id;
  SELECT COUNT(*) INTO v_planos FROM plano WHERE id_lojista = p_id;

  -- Primeiro o que tem chave RESTRICT para a loja, o serviço ou o produto.
  DELETE FROM avaliacao WHERE id_lojista = p_id;
  -- Leva junto (CASCADE): produtos e adicionais do atendimento, alterações,
  -- remarcações e corridas do TaxiDog (com eventos e paradas).
  DELETE FROM agendamento WHERE id_lojista = p_id;
  -- Leva junto: períodos, serviços dos períodos, cobranças e utilizações.
  DELETE FROM assinatura WHERE id_lojista = p_id;
  DELETE FROM plano WHERE id_lojista = p_id;
  -- O resto sai em CASCADE com a loja: serviços, produtos, vendas, equipe,
  -- horários, bloqueios, formas de pagamento, TaxiDog, vínculos com clientes.
  DELETE FROM lojista WHERE id_lojista = p_id;

  RETURN jsonb_build_object(
    'equipe', to_jsonb(v_equipe),
    'agendamentos', v_agendamentos,
    'vendas', v_vendas,
    'servicos', v_servicos,
    'produtos', v_produtos,
    'clientes', v_clientes,
    'planos', v_planos
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_interno_excluir_loja(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_interno_excluir_loja(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_interno_excluir_loja(UUID) TO service_role;
