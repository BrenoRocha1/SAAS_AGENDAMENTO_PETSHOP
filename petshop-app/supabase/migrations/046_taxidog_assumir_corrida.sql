-- ============================================================
-- PETSHOP SaaS - Migration 046: o TaxiDog assume a corrida
-- ============================================================
-- Até aqui só o dono/administrador atribuía as corridas, e o TaxiDog só
-- enxergava as que já eram dele. Agora:
--
-- • Quem tem a função TaxiDog também vê as corridas da loja que ainda
--   estão SEM TaxiDog (a coluna "Pendentes" dele), com cliente e endereço
--   — pra decidir se pega. Corrida de outro TaxiDog continua invisível.
--
-- • fn_assumir_corrida: o próprio TaxiDog se atribui. Só depois de a
--   loja aceitar o agendamento (enquanto está Pendente a tela mostra
--   "Aguardando aceite da loja") e só se ninguém pegou antes — a linha é
--   travada (FOR UPDATE), então dois TaxiDogs apertando juntos não ficam
--   os dois com a mesma corrida.
--
-- O dono/administrador continua podendo atribuir e trocar pelo painel.
-- ============================================================

-- ============================================================
-- 1) RLS: TaxiDog vê as corridas sem TaxiDog da loja (Realtime usa isto)
-- ============================================================
DROP POLICY IF EXISTS "taxidog_corrida: funcionario ve" ON taxidog_corrida;
CREATE POLICY "taxidog_corrida: funcionario ve"
  ON taxidog_corrida FOR SELECT
  USING (
    auth_role() = 'funcionario'
    AND id_lojista = auth_lojista_id()
    AND (
      id_funcionario = auth.uid()
      OR EXISTS (
        SELECT 1 FROM funcionario f
        WHERE f.id_funcionario = auth.uid() AND f.ativo = TRUE
          AND (
            f.pode_gerenciar_agenda OR f.acesso_total
            OR (f.pode_taxidog AND taxidog_corrida.id_funcionario IS NULL
                AND taxidog_corrida.status NOT IN ('concluida', 'cancelada'))
          )
      )
    )
  );

-- ============================================================
-- 2) TaxiDog assume uma corrida sem TaxiDog
-- ============================================================
CREATE OR REPLACE FUNCTION fn_assumir_corrida(p_id_corrida UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c         taxidog_corrida%ROWTYPE;
  v_nome      TEXT;
  v_ag_status TEXT;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM v_c.id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT nome INTO v_nome FROM funcionario
  WHERE id_funcionario = auth.uid() AND id_lojista = v_c.id_lojista AND ativo = TRUE AND pode_taxidog = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só quem tem a função TaxiDog pode assumir corridas';
  END IF;

  IF v_c.id_funcionario IS NOT NULL THEN
    IF v_c.id_funcionario = auth.uid() THEN
      RETURN; -- já é dele (dois cliques)
    END IF;
    RAISE EXCEPTION 'Esta corrida já foi atribuída a outro TaxiDog';
  END IF;

  IF v_c.status NOT IN ('agendada', 'entregue_loja', 'pronto_entrega') THEN
    RAISE EXCEPTION 'Esta corrida não está mais disponível';
  END IF;

  SELECT status::TEXT INTO v_ag_status FROM agendamento WHERE id_agendamento = v_c.id_agendamento;
  IF v_ag_status = 'Cancelado' THEN
    RAISE EXCEPTION 'O agendamento desta corrida foi cancelado';
  END IF;
  IF v_ag_status = 'Pendente' THEN
    RAISE EXCEPTION 'A loja ainda não aceitou este agendamento — aguarde o aceite para assumir a corrida';
  END IF;

  UPDATE taxidog_corrida SET id_funcionario = auth.uid() WHERE id_corrida = p_id_corrida;

  PERFORM fn_registrar_evento_corrida(p_id_corrida, v_c.status, v_nome || ' assumiu a corrida');
END;
$$;

REVOKE ALL ON FUNCTION fn_assumir_corrida(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_assumir_corrida(UUID) TO authenticated;

-- ============================================================
-- 3) fn_listar_corridas: TaxiDog recebe também as corridas sem TaxiDog
-- ============================================================
-- Igual à 045; só muda o filtro de quem não gerencia a agenda.
CREATE OR REPLACE FUNCTION fn_listar_corridas(
  p_data_ini   DATE,
  p_data_fim   DATE,
  p_id_corrida UUID DEFAULT NULL
)
RETURNS TABLE (
  id_corrida            UUID,
  id_agendamento        UUID,
  status                TEXT,
  modalidade            TEXT,
  valor                 NUMERIC,
  distancia_km          NUMERIC,
  criterio              TEXT,
  cep                   TEXT,
  logradouro            TEXT,
  numero                TEXT,
  complemento           TEXT,
  bairro                TEXT,
  cidade                TEXT,
  uf                    TEXT,
  lat                   DOUBLE PRECISION,
  lng                   DOUBLE PRECISION,
  dt_agendamento        DATE,
  hr_agendamento        TIME,
  status_agendamento    TEXT,
  obs_agendamento       TEXT,
  servicos              TEXT,
  id_pet                UUID,
  pet_nome              TEXT,
  pet_raca              TEXT,
  pet_especie           TEXT,
  pet_porte             TEXT,
  pet_foto_url          TEXT,
  pet_obs               TEXT,
  pet_comportamento     TEXT[],
  pet_obs_comportamento TEXT,
  id_cliente            UUID,
  cliente_nome          TEXT,
  cliente_telefone      TEXT,
  id_funcionario        UUID,
  funcionario_nome      TEXT,
  loja_nome             TEXT,
  loja_endereco         TEXT,
  loja_lat              DOUBLE PRECISION,
  loja_lng              DOUBLE PRECISION,
  eventos               JSONB,
  created_at            TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_lojista UUID := auth_lojista_id();
  v_gestor  BOOLEAN;
  v_taxidog BOOLEAN;
BEGIN
  IF v_lojista IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  v_gestor := auth_role() = 'lojista' OR EXISTS (
    SELECT 1 FROM funcionario f
    WHERE f.id_funcionario = auth.uid() AND f.ativo = TRUE AND (f.pode_gerenciar_agenda OR f.acesso_total)
  );

  v_taxidog := EXISTS (
    SELECT 1 FROM funcionario f
    WHERE f.id_funcionario = auth.uid() AND f.ativo = TRUE AND f.pode_taxidog = TRUE
  );

  RETURN QUERY
  SELECT
    c.id_corrida, c.id_agendamento, c.status, c.modalidade, c.valor::NUMERIC, c.distancia_km::NUMERIC, c.criterio,
    c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf, c.lat, c.lng,
    a.dt_agendamento, a.hr_agendamento, a.status::TEXT, a.obs,
    (
      SELECT string_agg(s.nome, ' + ' ORDER BY a2.hr_agendamento)
      FROM agendamento a2
      JOIN servico s ON s.id_servico = a2.id_servico
      WHERE a2.id_pet = a.id_pet AND a2.id_lojista = a.id_lojista
        AND a2.dt_agendamento = a.dt_agendamento AND a2.status <> 'Cancelado'
    ),
    p.id_pet, p.nome, p.raca, p.especie::TEXT, p.porte::TEXT, p.foto_url, p.obs, p.comportamento, p.obs_comportamento,
    cl.id_cliente, cl.nome, cl.telefone,
    c.id_funcionario, fu.nome,
    l.nome_loja,
    NULLIF(concat_ws(', ',
      NULLIF(btrim(COALESCE(l.endereco, '')), ''),
      NULLIF(btrim(COALESCE(l.numero, '')), ''),
      NULLIF(btrim(COALESCE(l.bairro, '')), ''),
      NULLIF(btrim(COALESCE(l.cidade, '')), ''),
      NULLIF(btrim(COALESCE(l.estado, '')), '')
    ), ''),
    cfg.origem_lat, cfg.origem_lng,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'status', e.status, 'descricao', e.descricao, 'created_at', e.created_at
      ) ORDER BY e.created_at), '[]'::jsonb)
      FROM taxidog_evento e
      WHERE e.id_corrida = c.id_corrida
    ),
    c.created_at
  FROM taxidog_corrida c
  JOIN agendamento a ON a.id_agendamento = c.id_agendamento
  JOIN pet p ON p.id_pet = c.id_pet
  JOIN cliente cl ON cl.id_cliente = c.id_cliente
  JOIN lojista l ON l.id_lojista = c.id_lojista
  LEFT JOIN taxidog_config cfg ON cfg.id_lojista = c.id_lojista
  LEFT JOIN funcionario fu ON fu.id_funcionario = c.id_funcionario
  WHERE c.id_lojista = v_lojista
    AND (
      v_gestor
      OR c.id_funcionario = auth.uid()
      -- Disponíveis pra ele assumir: sem TaxiDog e ainda em aberto.
      OR (v_taxidog AND c.id_funcionario IS NULL AND c.status NOT IN ('concluida', 'cancelada'))
    )
    AND (
      (p_id_corrida IS NOT NULL AND c.id_corrida = p_id_corrida)
      OR (p_id_corrida IS NULL AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim)
    )
  ORDER BY a.dt_agendamento, a.hr_agendamento;
END;
$$;

REVOKE ALL ON FUNCTION fn_listar_corridas(DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_listar_corridas(DATE, DATE, UUID) TO authenticated;
