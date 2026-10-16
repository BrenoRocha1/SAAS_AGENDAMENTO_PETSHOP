-- ============================================================
-- PETSHOP SaaS - Migration 100: loja pode bloquear o cancelamento pelo
-- cliente depois de aceitar o agendamento
-- ============================================================
-- Configuração por loja (Configurações → Agendamentos): ligada, o cliente
-- não cancela mais pelo sistema um agendamento que a loja já aceitou
-- (status 'Confirmado', que a tela chama de "Aceito"). Pendente segue
-- como hoje. Desligada (o padrão), nada muda. A loja e a equipe com
-- agenda continuam cancelando como antes.
--
-- A regra vale na hora do pedido de cancelamento, com a configuração
-- daquele momento: desligar volta ao comportamento antigo sem mexer em
-- nenhum agendamento.
--
-- Também fecha um caminho que contornava a função de cancelar: a policy
-- "agendamento: cliente cancela proprio" (migration 002) deixava o cliente
-- pôr status = 'Cancelado' com um UPDATE direto pela API, sem nenhuma das
-- regras de fn_cancelar_agendamento (nem a da 063). A migration 032 já a
-- removia, mas no banco ela continuava lá. O site e o app cancelam só
-- pela função (cancelarAgendamentoAction / rpc fn_cancelar_agendamento).
-- ============================================================

-- 1) A configuração
ALTER TABLE lojista
  ADD COLUMN IF NOT EXISTS bloquear_cancelamento_aceito BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Cliente cancela só pela função
DROP POLICY IF EXISTS "agendamento: cliente cancela proprio" ON agendamento;

-- 3) A função de cancelar: a mesma que está no banco (migration 063), só
--    com a regra nova para o cliente. O FOR UPDATE já trava a linha: se a
--    loja aceitar ao mesmo tempo, o cancelamento espera e lê o status novo.
CREATE OR REPLACE FUNCTION fn_cancelar_agendamento(
  p_id_agendamento  UUID,
  p_motivo          TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_cliente    UUID;
  v_id_lojista    UUID;
  v_status        status_agendamento;
  v_dt            DATE;
  v_hr            TIME;
  v_cancelado_por TEXT;
BEGIN
  SELECT id_cliente, id_lojista, status, dt_agendamento, hr_agendamento
  INTO v_id_cliente, v_id_lojista, v_status, v_dt, v_hr
  FROM agendamento
  WHERE id_agendamento = p_id_agendamento
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF auth.uid() = v_id_cliente THEN
    v_cancelado_por := 'cliente';
  ELSIF auth.uid() = v_id_lojista THEN
    v_cancelado_por := 'lojista';
  ELSIF auth_role() = 'funcionario' AND auth_lojista_id() = v_id_lojista AND EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid() AND pode_gerenciar_agenda = TRUE AND ativo = TRUE
  ) THEN
    v_cancelado_por := 'funcionario';
  ELSE
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF v_status IN ('Cancelado', 'Concluído') THEN
    RAISE EXCEPTION 'Agendamento com status "%" não pode ser cancelado', v_status;
  END IF;

  -- O cliente só cancela antes do atendimento: depois que começou (ou
  -- depois do horário), quem resolve é a loja.
  IF v_cancelado_por = 'cliente' THEN
    IF v_status = 'Em andamento' THEN
      RAISE EXCEPTION 'O atendimento já começou — para cancelar, fale com a loja';
    END IF;
    IF (v_dt + v_hr) <= (NOW() AT TIME ZONE 'America/Sao_Paulo') THEN
      RAISE EXCEPTION 'O horário deste agendamento já passou — para cancelar, fale com a loja';
    END IF;
    -- Migration 100: a loja escolheu não aceitar cancelamento depois de aceitar.
    IF v_status = 'Confirmado' AND EXISTS (
      SELECT 1 FROM lojista WHERE id_lojista = v_id_lojista AND bloquear_cancelamento_aceito
    ) THEN
      RAISE EXCEPTION 'Este agendamento já foi confirmado pela loja e não pode mais ser cancelado por aqui — para cancelar, fale com a loja';
    END IF;
  END IF;

  UPDATE agendamento
  SET
    status = 'Cancelado',
    cancelado_por = v_cancelado_por,
    motivo_cancelamento = p_motivo
  WHERE id_agendamento = p_id_agendamento;

  RETURN TRUE;
END;
$$;
