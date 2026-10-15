-- ============================================================
-- PETSHOP SaaS - Migration 097: promoção do serviço, completa
-- ============================================================
-- Em cima da 096_promocoes.sql (desconto em % com datas), sem mudar o que
-- ela já gravou:
--   • preço promocional em R$ (o desconto em % e a economia saem dele);
--   • hora de início e de encerramento, além da data;
--   • liga/desliga a promoção sem perder a configuração;
--   • promoção só para os agendamentos feitos pela loja (não oferecida no
--     agendamento online);
--   • o agendamento guarda quanto de desconto a promoção deu (relatório).
-- O preço continua saindo de fn_calcular_preco_servico — o navegador e o
-- app nunca mandam preço.
--
-- Pode rodar antes de o código novo ir ao ar: promoção já criada pela 096
-- segue valendo igual. Pode rodar de novo sem problema.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'servico' AND column_name = 'promo_percentual'
  ) THEN
    RAISE EXCEPTION 'Rode antes a migration 096_promocoes.sql.';
  END IF;
END
$$;

ALTER TABLE servico ADD COLUMN IF NOT EXISTS promo_preco NUMERIC(10,2);
ALTER TABLE servico ADD COLUMN IF NOT EXISTS promo_hora_inicio TIME;
ALTER TABLE servico ADD COLUMN IF NOT EXISTS promo_hora_fim TIME;
ALTER TABLE servico ADD COLUMN IF NOT EXISTS promo_ativa BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE servico ADD COLUMN IF NOT EXISTS promo_exibir_online BOOLEAN NOT NULL DEFAULT TRUE;

-- Com preço promocional o desconto pode passar de 90% (a 096 parava aí).
ALTER TABLE servico DROP CONSTRAINT IF EXISTS servico_promo_valida;
ALTER TABLE servico ADD CONSTRAINT servico_promo_valida CHECK (
  (promo_percentual IS NULL OR promo_percentual BETWEEN 1 AND 99)
  AND (promo_preco IS NULL OR (promo_preco > 0 AND promo_percentual IS NOT NULL))
  AND (promo_hora_inicio IS NULL OR promo_inicio IS NOT NULL)
  AND (promo_hora_fim IS NULL OR promo_fim IS NOT NULL)
  AND (
    promo_inicio IS NULL OR promo_fim IS NULL
    OR promo_fim + COALESCE(promo_hora_fim, TIME '23:59:59') > promo_inicio + COALESCE(promo_hora_inicio, TIME '00:00')
  )
);

-- Regras do preço promocional, valendo para qualquer caminho que grave o
-- serviço (tela nova, tela da 096, edição do preço do serviço):
--   • maior que zero e menor que o preço do serviço;
--   • o percentual é sempre o calculado a partir dele;
--   • quem grava só o percentual (tela da 096) passa a valer pelo percentual;
--   • sem promoção, o resto da configuração é limpo.
CREATE OR REPLACE FUNCTION fn_servico_promocao_valida()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.promo_preco IS NOT DISTINCT FROM OLD.promo_preco
     AND NEW.promo_percentual IS DISTINCT FROM OLD.promo_percentual THEN
    NEW.promo_preco := NULL;
  END IF;

  IF NEW.promo_percentual IS NULL AND NEW.promo_preco IS NULL THEN
    NEW.promo_inicio := NULL;
    NEW.promo_fim := NULL;
    NEW.promo_hora_inicio := NULL;
    NEW.promo_hora_fim := NULL;
    NEW.promo_ativa := TRUE;
    NEW.promo_exibir_online := TRUE;
    RETURN NEW;
  END IF;

  IF NEW.promo_preco IS NOT NULL THEN
    IF NEW.promo_preco <= 0 THEN
      RAISE EXCEPTION 'O preço promocional precisa ser maior que zero.';
    END IF;
    IF NEW.preco IS NULL OR NEW.promo_preco >= NEW.preco THEN
      RAISE EXCEPTION 'O preço promocional (R$ %) precisa ser menor que o preço do serviço (R$ %). Ajuste ou desative a promoção.',
        replace(to_char(NEW.promo_preco, 'FM999999990.00'), '.', ','),
        replace(to_char(COALESCE(NEW.preco, 0), 'FM999999990.00'), '.', ',');
    END IF;
    NEW.promo_percentual := GREATEST(1, LEAST(99, ROUND((NEW.preco - NEW.promo_preco) * 100 / NEW.preco)))::SMALLINT;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_servico_promocao_valida ON servico;
CREATE TRIGGER trg_servico_promocao_valida
  BEFORE INSERT OR UPDATE ON servico
  FOR EACH ROW EXECUTE FUNCTION fn_servico_promocao_valida();

-- A promoção está valendo AGORA (horário de Brasília)? Sem hora de início,
-- vale desde o começo do dia; sem hora de encerramento, até o fim do dia.
CREATE OR REPLACE FUNCTION fn_promo_servico_vigente(
  p_ativa        BOOLEAN,
  p_inicio       DATE,
  p_hora_inicio  TIME,
  p_fim          DATE,
  p_hora_fim     TIME
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COALESCE(p_ativa, TRUE)
    AND (p_inicio IS NULL OR t.agora >= p_inicio + COALESCE(p_hora_inicio, TIME '00:00'))
    AND (
      p_fim IS NULL
      OR CASE WHEN p_hora_fim IS NULL THEN t.agora::DATE <= p_fim ELSE t.agora < p_fim + p_hora_fim END
    )
  FROM (SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo') AS agora) t;
$$;

-- Preço do serviço para o pet SEM promoção: raça > porte > base (a mesma
-- cascata da migration 010, agora num lugar só).
CREATE OR REPLACE FUNCTION fn_preco_servico_cheio(
  p_id_servico  UUID,
  p_id_pet      UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_preco_base  NUMERIC(10,2);
  v_especie     especie_pet;
  v_porte       porte_pet;
  v_raca        TEXT;
  v_preco       NUMERIC(10,2);
BEGIN
  SELECT preco INTO v_preco_base FROM servico WHERE id_servico = p_id_servico;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado';
  END IF;

  SELECT especie, porte, raca INTO v_especie, v_porte, v_raca
  FROM pet WHERE id_pet = p_id_pet;

  IF v_especie IS NOT NULL THEN
    -- 1) raça específica
    IF v_raca IS NOT NULL THEN
      SELECT preco INTO v_preco
      FROM servico_variacao
      WHERE id_servico = p_id_servico AND tipo = 'raca' AND especie = v_especie AND lower(raca) = lower(v_raca)
      LIMIT 1;
      IF FOUND THEN RETURN v_preco; END IF;
    END IF;
    -- 2) porte + espécie
    IF v_porte IS NOT NULL THEN
      SELECT preco INTO v_preco
      FROM servico_variacao
      WHERE id_servico = p_id_servico AND tipo = 'porte' AND especie = v_especie AND porte = v_porte
      LIMIT 1;
      IF FOUND THEN RETURN v_preco; END IF;
    END IF;
  END IF;

  -- 3) preço base
  RETURN v_preco_base;
END;
$$;

-- Preço que vale agora: o cheio e, por cima, a promoção vigente.
--   • com preço promocional: o preço base vira exatamente ele, e os preços
--     por porte/raça levam o mesmo desconto proporcional;
--   • só com percentual (promoção feita pela 096): o percentual;
--   • promoção que a loja não oferece no agendamento online não vale para
--     quem agenda como cliente — só para a loja.
CREATE OR REPLACE FUNCTION fn_calcular_preco_servico(
  p_id_servico  UUID,
  p_id_pet      UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cheio  NUMERIC(10,2);
  v_s      RECORD;
BEGIN
  v_cheio := fn_preco_servico_cheio(p_id_servico, p_id_pet);

  SELECT preco, promo_percentual, promo_preco, promo_ativa, promo_exibir_online,
         promo_inicio, promo_hora_inicio, promo_fim, promo_hora_fim
  INTO v_s
  FROM servico WHERE id_servico = p_id_servico;

  IF v_s.promo_percentual IS NULL THEN
    RETURN v_cheio;
  END IF;
  IF NOT fn_promo_servico_vigente(v_s.promo_ativa, v_s.promo_inicio, v_s.promo_hora_inicio, v_s.promo_fim, v_s.promo_hora_fim) THEN
    RETURN v_cheio;
  END IF;
  IF NOT v_s.promo_exibir_online AND auth_role() = 'cliente' THEN
    RETURN v_cheio;
  END IF;

  IF v_s.promo_preco IS NOT NULL AND v_s.preco > 0 THEN
    IF v_cheio = v_s.preco THEN
      RETURN v_s.promo_preco;
    END IF;
    RETURN ROUND(v_cheio * v_s.promo_preco / v_s.preco, 2);
  END IF;

  RETURN fn_aplicar_desconto(v_cheio, v_s.promo_percentual);
END;
$$;

REVOKE ALL ON FUNCTION fn_preco_servico_cheio(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_preco_servico_cheio(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_promo_servico_vigente(BOOLEAN, DATE, TIME, DATE, TIME) TO anon, authenticated, service_role;

-- ============================================================
-- Quanto a promoção descontou em cada agendamento
-- ============================================================
-- `valor` continua sendo o que foi cobrado (é ele que os relatórios somam).
-- Aqui fica só o registro do desconto, tirado na hora em que o agendamento
-- é criado — e de novo se trocarem o pet ou o serviço, que é quando o preço
-- é recalculado. Promoção alterada ou encerrada depois não mexe em nada.
ALTER TABLE agendamento ADD COLUMN IF NOT EXISTS promo_desconto NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION fn_agendamento_promo_desconto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cheio  NUMERIC(10,2);
  v_atual  NUMERIC(10,2);
BEGIN
  -- Conta excluída ou serviço apagado (viram NULL): o registro fica como está.
  IF NEW.id_servico IS NULL OR NEW.id_pet IS NULL THEN
    RETURN NEW;
  END IF;

  -- O registro do desconto nunca pode impedir um agendamento.
  BEGIN
    v_cheio := fn_preco_servico_cheio(NEW.id_servico, NEW.id_pet);
    v_atual := fn_calcular_preco_servico(NEW.id_servico, NEW.id_pet);
    IF TG_OP = 'INSERT' AND NEW.valor IS DISTINCT FROM v_atual THEN
      -- Entrou com outro valor que não o da promoção: não houve desconto dela.
      NEW.promo_desconto := 0;
    ELSE
      NEW.promo_desconto := GREATEST(0, v_cheio - v_atual);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.promo_desconto := 0;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_promo_desconto ON agendamento;
CREATE TRIGGER trg_agendamento_promo_desconto
  BEFORE INSERT OR UPDATE OF id_servico, id_pet ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_agendamento_promo_desconto();

-- Relatório: atendimentos do período feitos com promoção e quanto de
-- desconto ela deu. Fica de fora o cancelado e o que o plano cobriu (o
-- serviço não foi cobrado, então não houve desconto de promoção).
CREATE OR REPLACE FUNCTION fn_relatorio_promocoes(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT json_build_object(
    'atendimentos', COUNT(*),
    'desconto',     COALESCE(SUM(a.promo_desconto), 0),
    'cobrado',      COALESCE(SUM(a.valor), 0)
  )
  INTO v_result
  FROM agendamento a
  WHERE a.id_lojista = p_id_lojista
    AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
    AND a.status <> 'Cancelado'
    AND a.promo_desconto > 0
    AND NOT EXISTS (
      SELECT 1 FROM assinatura_utilizacao u
      WHERE u.id_agendamento = a.id_agendamento AND u.estornada_em IS NULL
    );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION fn_relatorio_promocoes(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_relatorio_promocoes(UUID, DATE, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
