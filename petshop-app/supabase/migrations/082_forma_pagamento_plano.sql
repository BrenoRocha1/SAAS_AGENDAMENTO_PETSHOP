-- ============================================================
-- PETSHOP SaaS - Migration 082: forma de pagamento "Plano de assinatura"
-- ============================================================
-- Quando o plano do pet cobre o pedido inteiro (só os serviços do plano,
-- sem produto nem TaxiDog), não há o que pagar — e as telas de agendamento
-- nem perguntam a forma de pagamento. Mas todo agendamento nasce com uma
-- forma (migration 057), então ele era criado com a primeira que a loja
-- aceita e aparecia como "Pix · Pendente", com R$ 0,00.
--
-- Agora o pedido nessa situação fica com a forma 'plano' ("Plano de
-- assinatura"). Ninguém escolhe essa forma: é o banco que a grava, na hora
-- em que o benefício zera o pedido, e a tira quando volta a existir algo a
-- pagar — benefício desfeito, remarcação para fora do período, plano
-- cancelado, produto ou TaxiDog acrescentado. Aí a forma fica vazia ("Não
-- informada") até a loja escolher.
--
-- Vale para o pedido inteiro (os agendamentos criados juntos: mesma loja,
-- pet, dia e created_at — o critério de fn_atualizar_pagamento): só vira
-- 'plano' quando a soma do pedido é zero e algum serviço dele usa o plano.
-- Pedido com parte paga continua com a forma que a pessoa escolheu.
--
-- Agendamentos que já existem não mudam.

ALTER TABLE agendamento DROP CONSTRAINT IF EXISTS agendamento_forma_pagamento_check;
ALTER TABLE agendamento ADD CONSTRAINT agendamento_forma_pagamento_check
  CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'plano'));

-- Todo caminho que usa ou desfaz o benefício mexe no valor do agendamento
-- (fn_usar_beneficio, fn_estornar_beneficio, remarcar, editar, cancelar o
-- plano), e acrescentar produto ou TaxiDog também — então é na mudança do
-- valor que o pedido é conferido de novo.
CREATE OR REPLACE FUNCTION fn_trg_agendamento_forma_plano()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_so_plano BOOLEAN;
BEGIN
  SELECT COALESCE(SUM(a.valor), 0) <= 0
         AND COALESCE(BOOL_OR(EXISTS (
           SELECT 1 FROM assinatura_utilizacao u
           WHERE u.id_agendamento = a.id_agendamento AND u.estornada_em IS NULL
         )), FALSE)
  INTO v_so_plano
  FROM agendamento a
  WHERE a.id_lojista = NEW.id_lojista AND a.id_pet = NEW.id_pet
    AND a.dt_agendamento = NEW.dt_agendamento AND a.created_at = NEW.created_at
    AND a.status <> 'Cancelado';

  IF v_so_plano THEN
    UPDATE agendamento a SET forma_pagamento = 'plano'
    WHERE a.id_lojista = NEW.id_lojista AND a.id_pet = NEW.id_pet
      AND a.dt_agendamento = NEW.dt_agendamento AND a.created_at = NEW.created_at
      AND a.status <> 'Cancelado'
      AND a.forma_pagamento IS DISTINCT FROM 'plano';
  ELSE
    UPDATE agendamento a SET forma_pagamento = NULL
    WHERE a.id_lojista = NEW.id_lojista AND a.id_pet = NEW.id_pet
      AND a.dt_agendamento = NEW.dt_agendamento AND a.created_at = NEW.created_at
      AND a.status <> 'Cancelado'
      AND a.forma_pagamento = 'plano';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_forma_plano ON agendamento;
CREATE TRIGGER trg_agendamento_forma_plano
  AFTER UPDATE OF valor ON agendamento
  FOR EACH ROW
  WHEN (OLD.valor IS DISTINCT FROM NEW.valor)
  EXECUTE FUNCTION fn_trg_agendamento_forma_plano();
