-- ============================================================
-- PETSHOP SaaS - Migration 020: Configurações (Agendamento Online)
-- ============================================================
-- Contexto: nova área "Configurações" (/lojista/configuracoes), um hub
-- que organiza e LINKA pra configurações que já existem (Perfil da Loja,
-- Horários, Funcionários) — nenhuma tabela/tela duplicada pra essas.
--
-- A única coisa genuinamente nova é o toggle "Agendamento Online":
--   • "Gestor de Agendamentos" (Kanban) já tinha sua própria coluna
--     (lojista.kanban_ativo, migration 013) — só REAPROVEITADA aqui,
--     sem migration nova.
--   • "Exigir CPF do cliente" NÃO virou uma configuração nova: o cadastro
--     de cliente (cadastroClienteSchema) já exige CPF, sempre, pra
--     QUALQUER loja — não existe (nem faria sentido criar) um `require_
--     cpf` por lojista, porque a conta do cliente é única na plataforma,
--     não por loja. Documentado na própria tela em vez de fingir uma
--     configuração que não existe.
--   • "Permitir novos agendamentos online" não tinha nenhum campo
--     equivalente — daí a coluna nova abaixo.
-- ============================================================

ALTER TABLE lojista
  ADD COLUMN IF NOT EXISTS aceita_agendamento_online BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- fn_criar_agendamento: mesma função da migration 011 (mesma
-- assinatura, mesmas regras de conflito/preço), só com UMA verificação
-- nova logo no início — bloqueia agendamento PÚBLICO (criado pelo
-- próprio cliente) se a loja desativou "Agendamento Online".
--
-- fn_criar_agendamento_lojista (walk-in/telefone, criado pelo lojista)
-- NÃO é alterada — agendamento interno continua funcionando normalmente
-- mesmo com o agendamento online desativado, exatamente como pedido.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_criar_agendamento(
  p_id_pet        UUID,
  p_id_servico    UUID,
  p_id_cliente    UUID,
  p_id_lojista    UUID,
  p_data          DATE,
  p_hora          TIME,
  p_obs           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_agendamento  UUID;
  v_preco           NUMERIC(10,2);
  v_duracao         INTEGER;
  v_conflict        BOOLEAN;
BEGIN
  IF p_id_cliente != auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE AND aceita_agendamento_online = TRUE
  ) THEN
    RAISE EXCEPTION 'Este petshop não está aceitando agendamentos online no momento.';
  END IF;

  SELECT duracao
  INTO v_duracao
  FROM servico
  WHERE id_servico = p_id_servico
    AND id_lojista = p_id_lojista
    AND status = 'Ativo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM agendamento a
    WHERE a.id_lojista = p_id_lojista
      AND a.dt_agendamento = p_data
      AND a.status NOT IN ('Cancelado')
      AND (
        p_hora < (a.hr_agendamento + (
          SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
        ) * INTERVAL '1 minute')
        AND (p_hora + v_duracao * INTERVAL '1 minute') > a.hr_agendamento
      )
    FOR UPDATE SKIP LOCKED
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'Horário não disponível. Por favor, escolha outro horário.';
  END IF;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet
      AND id_cliente = p_id_cliente
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente';
  END IF;

  v_preco := fn_calcular_preco_servico(p_id_servico, p_id_pet);

  INSERT INTO agendamento (
    id_pet, id_servico, id_cliente, id_lojista,
    dt_agendamento, hr_agendamento, valor, status, obs
  )
  VALUES (
    p_id_pet, p_id_servico, p_id_cliente, p_id_lojista,
    p_data, p_hora, v_preco, 'Pendente', p_obs
  )
  RETURNING id_agendamento INTO v_id_agendamento;

  RETURN v_id_agendamento;
END;
$$;
