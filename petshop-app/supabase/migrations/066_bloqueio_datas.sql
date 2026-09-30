-- ============================================================
-- PETSHOP SaaS - Migration 066: dias fechados (feriados e folgas)
-- ============================================================
-- • A loja marca períodos em que NÃO atende: um dia, vários dias seguidos
--   ou só um intervalo de horas (ex.: 24/12 das 13:00 às 18:00). Com
--   horário, ele vale em cada dia do período.
-- • O motivo aparece para o cliente ("Feriado de Natal").
-- • Horários livres (cliente, loja e remarcar) já não oferecem esses
--   horários, e um trigger no agendamento barra qualquer caminho de criação
--   ou remarcação que caia num bloqueio — inclusive os já existentes
--   (fn_criar_agendamento_*, remarcar). Cancelar, mudar status etc. não
--   mexem em data/hora e seguem normais.
-- • Agendamentos que já estavam marcados no período NÃO são cancelados:
--   a tela lista esses agendamentos para a loja remarcar ou cancelar.
-- • Isolamento: leitura pública só pela função fn_bloqueios_loja (dias
--   fechados são informação pública, como o horário de funcionamento);
--   tabela só a equipe da loja lê; escrita só pelas funções, pelo gestor.
-- ============================================================

CREATE TABLE IF NOT EXISTS loja_bloqueio (
  id_bloqueio  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista   UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  dt_inicio    DATE NOT NULL,
  dt_fim       DATE NOT NULL,
  -- NULL/NULL = dia inteiro.
  hr_inicio    TIME,
  hr_fim       TIME,
  motivo       TEXT NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 80),
  id_usuario   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loja_bloqueio_periodo CHECK (dt_fim >= dt_inicio),
  CONSTRAINT loja_bloqueio_horas CHECK (
    (hr_inicio IS NULL AND hr_fim IS NULL)
    OR (hr_inicio IS NOT NULL AND hr_fim IS NOT NULL AND hr_fim > hr_inicio)
  )
);
CREATE INDEX IF NOT EXISTS idx_loja_bloqueio_lojista ON loja_bloqueio(id_lojista, dt_fim);

ALTER TABLE loja_bloqueio ENABLE ROW LEVEL SECURITY;
ALTER TABLE loja_bloqueio FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loja_bloqueio: equipe ve" ON loja_bloqueio;
CREATE POLICY "loja_bloqueio: equipe ve" ON loja_bloqueio FOR SELECT
  USING (fn_agenda_da_loja(id_lojista));

-- ============================================================
-- 1) Consultas
-- ============================================================
-- O horário [p_ini, p_fim) cai num bloqueio (dia inteiro ou intervalo)?
CREATE OR REPLACE FUNCTION fn_horario_bloqueado(p_id_lojista UUID, p_data DATE, p_ini TIME, p_fim TIME)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM loja_bloqueio b
    WHERE b.id_lojista = p_id_lojista
      AND p_data BETWEEN b.dt_inicio AND b.dt_fim
      AND (b.hr_inicio IS NULL OR (p_ini < b.hr_fim AND p_fim > b.hr_inicio))
  )
$$;
REVOKE ALL ON FUNCTION fn_horario_bloqueado(UUID, DATE, TIME, TIME) FROM PUBLIC;

-- O dia inteiro está fechado?
CREATE OR REPLACE FUNCTION fn_dia_bloqueado(p_id_lojista UUID, p_data DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM loja_bloqueio b
    WHERE b.id_lojista = p_id_lojista
      AND p_data BETWEEN b.dt_inicio AND b.dt_fim
      AND b.hr_inicio IS NULL
  )
$$;
REVOKE ALL ON FUNCTION fn_dia_bloqueado(UUID, DATE) FROM PUBLIC;

-- Dias fechados da loja num intervalo — público (calendário do cliente,
-- página da loja, agenda). Até ~1 ano por consulta.
CREATE OR REPLACE FUNCTION fn_bloqueios_loja(p_id_lojista UUID, p_de DATE, p_ate DATE)
RETURNS TABLE (id_bloqueio UUID, dt_inicio DATE, dt_fim DATE, hr_inicio TIME, hr_fim TIME, motivo TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id_bloqueio, b.dt_inicio, b.dt_fim, b.hr_inicio, b.hr_fim, b.motivo
  FROM loja_bloqueio b
  WHERE b.id_lojista = p_id_lojista
    AND b.dt_fim >= p_de
    AND b.dt_inicio <= LEAST(p_ate, p_de + 400)
  ORDER BY b.dt_inicio, b.hr_inicio NULLS FIRST
$$;
REVOKE ALL ON FUNCTION fn_bloqueios_loja(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_bloqueios_loja(UUID, DATE, DATE) TO anon, authenticated;

-- Tela de Horários: bloqueios de hoje em diante + agendamentos ainda
-- marcados dentro de cada um (para a loja remarcar ou cancelar).
CREATE OR REPLACE FUNCTION fn_bloqueios_da_loja(p_id_lojista UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id_bloqueio', b.id_bloqueio,
    'dt_inicio', b.dt_inicio,
    'dt_fim', b.dt_fim,
    'hr_inicio', to_char(b.hr_inicio, 'HH24:MI'),
    'hr_fim', to_char(b.hr_fim, 'HH24:MI'),
    'motivo', b.motivo,
    'agendamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id_agendamento', a.id_agendamento,
        'dt', a.dt_agendamento,
        'hr', to_char(a.hr_agendamento, 'HH24:MI'),
        'status', a.status,
        'pet', p.nome,
        'cliente', c.nome,
        'servico', s.nome
      ) ORDER BY a.dt_agendamento, a.hr_agendamento)
      FROM agendamento a
      JOIN servico s ON s.id_servico = a.id_servico
      LEFT JOIN pet p ON p.id_pet = a.id_pet
      LEFT JOIN cliente c ON c.id_cliente = a.id_cliente
      WHERE a.id_lojista = b.id_lojista
        AND a.status IN ('Pendente', 'Confirmado')
        AND a.dt_agendamento BETWEEN GREATEST(b.dt_inicio, CURRENT_DATE) AND b.dt_fim
        AND (b.hr_inicio IS NULL OR (
          a.hr_agendamento < b.hr_fim
          AND a.hr_agendamento + s.duracao * INTERVAL '1 minute' > b.hr_inicio
        ))
    ), '[]'::jsonb)
  ) ORDER BY b.dt_inicio, b.hr_inicio NULLS FIRST), '[]'::jsonb)
  FROM loja_bloqueio b
  WHERE b.id_lojista = p_id_lojista
    AND b.dt_fim >= CURRENT_DATE
    AND fn_gestor_da_loja(p_id_lojista)
$$;
REVOKE ALL ON FUNCTION fn_bloqueios_da_loja(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_bloqueios_da_loja(UUID) TO authenticated;

-- ============================================================
-- 2) Criar e excluir (dono ou administrador)
-- ============================================================
-- Mensagens com "Bloqueio:" chegam prontas na tela.
CREATE OR REPLACE FUNCTION fn_salvar_bloqueio(
  p_id_lojista UUID,
  p_dt_inicio  DATE,
  p_dt_fim     DATE,
  p_hr_inicio  TIME,
  p_hr_fim     TIME,
  p_motivo     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fim    DATE := COALESCE(p_dt_fim, p_dt_inicio);
  v_motivo TEXT := btrim(COALESCE(p_motivo, ''));
  v_id     UUID;
BEGIN
  IF NOT fn_gestor_da_loja(p_id_lojista) THEN
    RAISE EXCEPTION 'Bloqueio: só o responsável pela loja ou um administrador pode fechar dias';
  END IF;
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'Bloqueio: informe o motivo (ex.: Feriado de Natal)';
  END IF;
  IF char_length(v_motivo) > 80 THEN
    RAISE EXCEPTION 'Bloqueio: motivo muito longo (até 80 letras)';
  END IF;
  IF p_dt_inicio IS NULL THEN
    RAISE EXCEPTION 'Bloqueio: escolha a data';
  END IF;
  IF p_dt_inicio < CURRENT_DATE THEN
    RAISE EXCEPTION 'Bloqueio: escolha uma data de hoje em diante';
  END IF;
  IF v_fim < p_dt_inicio THEN
    RAISE EXCEPTION 'Bloqueio: a data final vem antes da inicial';
  END IF;
  IF v_fim - p_dt_inicio > 365 THEN
    RAISE EXCEPTION 'Bloqueio: o período pode ter no máximo 1 ano';
  END IF;
  IF (p_hr_inicio IS NULL) <> (p_hr_fim IS NULL) THEN
    RAISE EXCEPTION 'Bloqueio: informe o horário de início e de fim';
  END IF;
  IF p_hr_inicio IS NOT NULL AND p_hr_fim <= p_hr_inicio THEN
    RAISE EXCEPTION 'Bloqueio: o horário final precisa ser depois do inicial';
  END IF;
  IF EXISTS (
    SELECT 1 FROM loja_bloqueio b
    WHERE b.id_lojista = p_id_lojista AND b.dt_inicio = p_dt_inicio AND b.dt_fim = v_fim
      AND b.hr_inicio IS NOT DISTINCT FROM p_hr_inicio AND b.hr_fim IS NOT DISTINCT FROM p_hr_fim
  ) THEN
    RAISE EXCEPTION 'Bloqueio: esse período já está fechado';
  END IF;

  INSERT INTO loja_bloqueio (id_lojista, dt_inicio, dt_fim, hr_inicio, hr_fim, motivo, id_usuario)
  VALUES (p_id_lojista, p_dt_inicio, v_fim, p_hr_inicio, p_hr_fim, v_motivo, auth.uid())
  RETURNING id_bloqueio INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION fn_salvar_bloqueio(UUID, DATE, DATE, TIME, TIME, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_salvar_bloqueio(UUID, DATE, DATE, TIME, TIME, TEXT) TO authenticated;

-- Reabrir: apaga o bloqueio (é configuração, não dado financeiro).
CREATE OR REPLACE FUNCTION fn_excluir_bloqueio(p_id_bloqueio UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_lojista UUID;
BEGIN
  SELECT id_lojista INTO v_id_lojista FROM loja_bloqueio WHERE id_bloqueio = p_id_bloqueio;
  IF NOT FOUND OR NOT fn_gestor_da_loja(v_id_lojista) THEN
    RAISE EXCEPTION 'Bloqueio: não encontrado';
  END IF;
  DELETE FROM loja_bloqueio WHERE id_bloqueio = p_id_bloqueio;
END;
$$;
REVOKE ALL ON FUNCTION fn_excluir_bloqueio(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_excluir_bloqueio(UUID) TO authenticated;

-- ============================================================
-- 3) Trava no agendamento (criar ou mudar data/hora)
-- ============================================================
-- Mensagem com "Loja fechada:" chega pronta na tela.
CREATE OR REPLACE FUNCTION fn_trg_agendamento_bloqueio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duracao INTEGER;
  v_b       loja_bloqueio%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.dt_agendamento = OLD.dt_agendamento
     AND NEW.hr_agendamento = OLD.hr_agendamento THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'Cancelado' THEN
    RETURN NEW;
  END IF;

  SELECT s.duracao INTO v_duracao FROM servico s WHERE s.id_servico = NEW.id_servico;

  SELECT * INTO v_b FROM loja_bloqueio b
  WHERE b.id_lojista = NEW.id_lojista
    AND NEW.dt_agendamento BETWEEN b.dt_inicio AND b.dt_fim
    AND (b.hr_inicio IS NULL OR (
      NEW.hr_agendamento < b.hr_fim
      AND NEW.hr_agendamento + COALESCE(v_duracao, 30) * INTERVAL '1 minute' > b.hr_inicio
    ))
  ORDER BY b.hr_inicio NULLS FIRST
  LIMIT 1;

  IF FOUND THEN
    IF v_b.hr_inicio IS NULL THEN
      RAISE EXCEPTION 'Loja fechada: a loja não abre em % (%). Escolha outro dia.',
        to_char(NEW.dt_agendamento, 'DD/MM/YYYY'), v_b.motivo;
    ELSE
      RAISE EXCEPTION 'Loja fechada: a loja não atende das % às % em % (%). Escolha outro horário.',
        to_char(v_b.hr_inicio, 'HH24:MI'), to_char(v_b.hr_fim, 'HH24:MI'),
        to_char(NEW.dt_agendamento, 'DD/MM/YYYY'), v_b.motivo;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_bloqueio ON agendamento;
CREATE TRIGGER trg_agendamento_bloqueio
  BEFORE INSERT OR UPDATE OF dt_agendamento, hr_agendamento ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_trg_agendamento_bloqueio();

-- ============================================================
-- 4) Horários livres sem os horários fechados
-- ============================================================
-- Mesmas funções da migration 025 (janela de agendamento), com o
-- bloqueio: dia inteiro fechado não devolve horário nenhum; intervalo
-- fechado devolve o horário como indisponível.
CREATE OR REPLACE FUNCTION fn_horarios_disponiveis(
  p_id_lojista  UUID,
  p_data        DATE,
  p_duracao     INTEGER
)
RETURNS TABLE (
  hr_slot       TIME,
  disponivel    BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia_semana  dia_semana;
  v_hr_inicio   TIME;
  v_hr_fim      TIME;
  v_slot        TIME;
  v_intervalo   INTERVAL := '30 minutes';
  v_min_instante TIMESTAMPTZ;
  v_max_instante TIMESTAMPTZ;
BEGIN
  SELECT j.min_instante, j.max_instante INTO v_min_instante, v_max_instante
  FROM fn_janela_agendamento(p_id_lojista) j;

  v_dia_semana := CASE EXTRACT(DOW FROM p_data)
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END::dia_semana;

  SELECT h.hr_inicio, h.hr_fim
  INTO v_hr_inicio, v_hr_fim
  FROM horario h
  WHERE h.id_lojista = p_id_lojista
    AND h.dia_semana = v_dia_semana
    AND h.ativo = TRUE
  LIMIT 1;

  IF v_hr_inicio IS NULL OR fn_dia_bloqueado(p_id_lojista, p_data) THEN
    RETURN;
  END IF;

  v_slot := v_hr_inicio;
  WHILE (v_slot + (p_duracao || ' minutes')::INTERVAL) <= v_hr_fim LOOP
    IF (p_data + v_slot) AT TIME ZONE 'America/Sao_Paulo' BETWEEN v_min_instante AND v_max_instante THEN
      hr_slot := v_slot;
      disponivel := NOT fn_horario_bloqueado(p_id_lojista, p_data, v_slot, v_slot + p_duracao * INTERVAL '1 minute')
        AND NOT EXISTS (
        SELECT 1 FROM agendamento a
        WHERE a.id_lojista = p_id_lojista
          AND a.dt_agendamento = p_data
          AND a.status NOT IN ('Cancelado')
          AND (
            v_slot < (a.hr_agendamento + (
              SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
            ) * INTERVAL '1 minute')
            AND (v_slot + p_duracao * INTERVAL '1 minute') > a.hr_agendamento
          )
      );
      RETURN NEXT;
    END IF;
    v_slot := v_slot + v_intervalo;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_horarios_disponiveis_funcionario(
  p_id_lojista      UUID,
  p_data            DATE,
  p_duracao         INTEGER,
  p_id_funcionario  UUID DEFAULT NULL
)
RETURNS TABLE (
  hr_slot     TIME,
  disponivel  BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia_semana  dia_semana;
  v_hr_inicio   TIME;
  v_hr_fim      TIME;
  v_slot        TIME;
  v_intervalo   INTERVAL := '30 minutes';
  v_min_instante TIMESTAMPTZ;
  v_max_instante TIMESTAMPTZ;
BEGIN
  SELECT j.min_instante, j.max_instante INTO v_min_instante, v_max_instante
  FROM fn_janela_agendamento(p_id_lojista) j;

  v_dia_semana := CASE EXTRACT(DOW FROM p_data)
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END::dia_semana;

  SELECT h.hr_inicio, h.hr_fim
  INTO v_hr_inicio, v_hr_fim
  FROM horario h
  WHERE h.id_lojista = p_id_lojista
    AND h.dia_semana = v_dia_semana
    AND h.ativo = TRUE
  LIMIT 1;

  IF v_hr_inicio IS NULL OR fn_dia_bloqueado(p_id_lojista, p_data) THEN
    RETURN;
  END IF;

  v_slot := v_hr_inicio;
  WHILE (v_slot + (p_duracao || ' minutes')::INTERVAL) <= v_hr_fim LOOP
    IF (p_data + v_slot) AT TIME ZONE 'America/Sao_Paulo' BETWEEN v_min_instante AND v_max_instante THEN
      hr_slot := v_slot;
      disponivel := NOT fn_horario_bloqueado(p_id_lojista, p_data, v_slot, v_slot + p_duracao * INTERVAL '1 minute')
        AND NOT EXISTS (
        SELECT 1 FROM agendamento a
        WHERE a.id_lojista = p_id_lojista
          AND a.dt_agendamento = p_data
          AND a.status NOT IN ('Cancelado')
          AND (p_id_funcionario IS NULL OR a.id_funcionario = p_id_funcionario)
          AND (
            v_slot < (a.hr_agendamento + (
              SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
            ) * INTERVAL '1 minute')
            AND (v_slot + p_duracao * INTERVAL '1 minute') > a.hr_agendamento
          )
      );
      RETURN NEXT;
    END IF;
    v_slot := v_slot + v_intervalo;
  END LOOP;
END;
$$;

-- Mesma função da migration 064, com o bloqueio.
CREATE OR REPLACE FUNCTION fn_horarios_remarcar(p_id_agendamento UUID, p_data DATE)
RETURNS TABLE (hr_slot TIME, disponivel BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag        agendamento%ROWTYPE;
  v_ids       UUID[];
  v_base      TIME;
  v_duracao   INTEGER;
  v_dia       dia_semana;
  v_hr_inicio TIME;
  v_hr_fim    TIME;
  v_slot      TIME;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento;
  IF NOT FOUND OR NOT fn_agenda_da_loja(v_ag.id_lojista) THEN
    RETURN;
  END IF;

  -- O pedido: serviços do mesmo pet, dia e created_at ainda por fazer.
  SELECT array_agg(a.id_agendamento), MIN(a.hr_agendamento)
  INTO v_ids, v_base
  FROM agendamento a
  WHERE a.id_lojista = v_ag.id_lojista AND a.id_pet IS NOT DISTINCT FROM v_ag.id_pet
    AND a.dt_agendamento = v_ag.dt_agendamento AND a.created_at = v_ag.created_at
    AND a.status IN ('Pendente', 'Confirmado');
  IF v_ids IS NULL THEN
    RETURN;
  END IF;

  -- Duração total do bloco (do primeiro início ao último fim).
  SELECT CEIL(EXTRACT(EPOCH FROM MAX(a.hr_agendamento + s.duracao * INTERVAL '1 minute') - v_base) / 60)::INTEGER
  INTO v_duracao
  FROM agendamento a JOIN servico s ON s.id_servico = a.id_servico
  WHERE a.id_agendamento = ANY (v_ids);

  v_dia := CASE EXTRACT(DOW FROM p_data)
    WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Segunda' WHEN 2 THEN 'Terça' WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta' WHEN 5 THEN 'Sexta' WHEN 6 THEN 'Sábado' END::dia_semana;
  SELECT h.hr_inicio, h.hr_fim INTO v_hr_inicio, v_hr_fim
  FROM horario h WHERE h.id_lojista = v_ag.id_lojista AND h.dia_semana = v_dia AND h.ativo = TRUE LIMIT 1;
  IF v_hr_inicio IS NULL OR p_data < CURRENT_DATE OR fn_dia_bloqueado(v_ag.id_lojista, p_data) THEN
    RETURN;
  END IF;

  v_slot := v_hr_inicio;
  WHILE (v_slot + v_duracao * INTERVAL '1 minute') <= v_hr_fim LOOP
    IF p_data > CURRENT_DATE OR v_slot > LOCALTIME THEN
      hr_slot := v_slot;
      disponivel := NOT (p_data = v_ag.dt_agendamento AND v_slot = v_base)
        AND NOT fn_horario_bloqueado(v_ag.id_lojista, p_data, v_slot, v_slot + v_duracao * INTERVAL '1 minute')
        AND NOT EXISTS (
          SELECT 1 FROM agendamento a
          WHERE a.id_lojista = v_ag.id_lojista
            AND a.dt_agendamento = p_data
            AND a.status <> 'Cancelado'
            AND NOT (a.id_agendamento = ANY (v_ids))
            AND v_slot < (a.hr_agendamento + (SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico) * INTERVAL '1 minute')
            AND (v_slot + v_duracao * INTERVAL '1 minute') > a.hr_agendamento
        );
      RETURN NEXT;
    END IF;
    v_slot := v_slot + INTERVAL '30 minutes';
  END LOOP;
END;
$$;
