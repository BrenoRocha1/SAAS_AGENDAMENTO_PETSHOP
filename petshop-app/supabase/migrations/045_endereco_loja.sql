-- ============================================================
-- PETSHOP SaaS - Migration 045: endereço da loja em campos separados
-- ============================================================
-- Até aqui o endereço da loja era um texto livre ("Rua, número,
-- bairro") + cidade/estado/CEP. No QA do TaxiDog o mapa não achou a loja
-- porque o número vinha colado na rua (e a rua com erro de digitação) —
-- e a cobrança por distância passou a medir do centro da cidade. Quem
-- preenche não tem como saber o formato que o mapa entende.
--
-- Agora: `endereco` continua sendo a RUA (mesmo nome de coluna, pra não
-- mexer no cadastro nem em quem já lê), e ganham campos próprios o
-- número, o complemento e o bairro. A tela "Dados da loja" preenche rua,
-- bairro, cidade e UF pelo CEP.
--
-- Lojas antigas continuam funcionando: com `numero` vazio, o endereço é
-- tratado como antes (texto livre).
-- ============================================================

ALTER TABLE lojista ADD COLUMN IF NOT EXISTS numero TEXT
  CHECK (char_length(numero) <= 20);
ALTER TABLE lojista ADD COLUMN IF NOT EXISTS complemento TEXT
  CHECK (char_length(complemento) <= 80);
ALTER TABLE lojista ADD COLUMN IF NOT EXISTS bairro TEXT
  CHECK (char_length(bairro) <= 80);

-- ============================================================
-- fn_listar_corridas: loja_endereco com número e bairro
-- ============================================================
-- Igual à 042, só muda loja_endereco (usado pelo app do TaxiDog em
-- "Abrir rota até a loja"): agora inclui número e bairro, e vem NULL em
-- vez de '' quando a loja não tem endereço nenhum.
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
BEGIN
  IF v_lojista IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  v_gestor := auth_role() = 'lojista' OR EXISTS (
    SELECT 1 FROM funcionario f
    WHERE f.id_funcionario = auth.uid() AND f.ativo = TRUE AND (f.pode_gerenciar_agenda OR f.acesso_total)
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
    AND (v_gestor OR c.id_funcionario = auth.uid())
    AND (
      (p_id_corrida IS NOT NULL AND c.id_corrida = p_id_corrida)
      OR (p_id_corrida IS NULL AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim)
    )
  ORDER BY a.dt_agendamento, a.hr_agendamento;
END;
$$;

REVOKE ALL ON FUNCTION fn_listar_corridas(DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_listar_corridas(DATE, DATE, UUID) TO authenticated;
