-- ============================================================
-- PETSHOP SaaS - Migration 059: agendamento de dia anterior pode ser alterado
-- ============================================================
-- A tabela nasceu com CHECK (dt_agendamento >= CURRENT_DATE) (001). Um
-- CHECK vale em TODO UPDATE, não só na criação: a partir do dia seguinte,
-- qualquer alteração no agendamento (finalizar o atendimento de ontem,
-- registrar o pagamento, cancelar, aplicar benefício de plano) era recusada
-- pelo banco. A regra certa é só na criação — vira um trigger de INSERT.
-- ============================================================

ALTER TABLE agendamento DROP CONSTRAINT IF EXISTS agendamento_dt_agendamento_check;

CREATE OR REPLACE FUNCTION fn_trg_agendamento_data_nova()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.dt_agendamento < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para uma data que já passou';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_data_nova ON agendamento;
CREATE TRIGGER trg_agendamento_data_nova
  BEFORE INSERT ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_trg_agendamento_data_nova();
