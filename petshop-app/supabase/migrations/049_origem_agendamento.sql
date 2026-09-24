-- ============================================================
-- PETSHOP SaaS - Migration 049: de onde veio o agendamento
-- ============================================================
-- A agenda da loja mostra um ícone dizendo se o agendamento foi lançado
-- pela própria loja (dono/funcionário — balcão, telefone) ou feito pelo
-- cliente online (link de agendamento ou conta do cliente).
--
-- Em vez de mexer nas várias funções que criam agendamento
-- (fn_criar_agendamento, _multiplo, _lojista e os envoltórios do
-- TaxiDog), um trigger BEFORE INSERT preenche a origem pelo papel de
-- quem está logado — auth_role() continua sendo o de quem chamou mesmo
-- dentro das funções SECURITY DEFINER. Quem já informar a origem
-- explicitamente é respeitado.
--
-- Agendamentos antigos ficam com origem NULL: o banco nunca guardou quem
-- os criou, e chutar pelo status atual daria informação errada. A tela
-- simplesmente não mostra ícone de origem neles.
-- ============================================================

ALTER TABLE agendamento ADD COLUMN IF NOT EXISTS origem TEXT
  CHECK (origem IN ('loja', 'online'));

CREATE OR REPLACE FUNCTION fn_trg_agendamento_origem()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.origem IS NULL THEN
    NEW.origem := CASE auth_role()
      WHEN 'cliente' THEN 'online'
      WHEN 'lojista' THEN 'loja'
      WHEN 'funcionario' THEN 'loja'
      ELSE NULL
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_origem ON agendamento;
CREATE TRIGGER trg_agendamento_origem
  BEFORE INSERT ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_trg_agendamento_origem();
