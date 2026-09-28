-- ============================================================
-- PETSHOP SaaS - Migration 063: cliente cancela só antes do atendimento
-- ============================================================
-- Achado no teste: o cliente conseguia cancelar um agendamento em
-- andamento ou de um dia que já passou (ex.: atendimento feito que a
-- loja ainda não finalizou — cancelar some com a receita). Agora o
-- cliente cancela só Pendente/Aceito com o horário ainda por vir; loja e
-- funcionário com agenda continuam podendo cancelar. Mesma função da
-- migration 028 com só essa regra a mais.
-- ============================================================

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
