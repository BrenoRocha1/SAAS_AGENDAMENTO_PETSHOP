-- ============================================================
-- PETSHOP SaaS - Migration 042: TaxiDog (busca e entrega do pet)
-- ============================================================
-- O TaxiDog é uma extensão do agendamento, não um sistema à parte: toda
-- corrida nasce presa a um agendamento, a taxa entra no valor dele e o
-- histórico da corrida fica vinculado a ele.
--
-- Decisões de modelagem:
--
-- • UMA corrida por visita (UNIQUE id_agendamento), com UM status linear
--   que cobre busca e entrega. A modalidade (buscar / entregar /
--   buscar_entregar) só decide quais etapas existem:
--
--     agendada → a_caminho_cliente → no_endereco → pet_embarcado
--       → entregue_loja → pronto_entrega → a_caminho_entrega
--       → no_endereco_entrega → concluida          (+ cancelada)
--
--   "buscar" termina ao entregar na loja; "entregar" começa em
--   pronto_entrega. "Pendente", "Aguardando TaxiDog" e "Corrida
--   atribuída" NÃO são status gravados — são rótulos derivados de
--   (status='agendada', agendamento ainda Pendente?, tem TaxiDog?). Isso
--   evita dois campos dizendo a mesma coisa e ficando fora de sincronia.
--
-- • "Serviço finalizado" também não é gravado à mão: um trigger em
--   agendamento, quando a VISITA inteira fica Concluída, move a corrida
--   para pronto_entrega (o TaxiDog então vê "Thor está pronto para
--   entrega"). Visita = mesmo pet, loja e dia — um carrinho com vários
--   serviços vira vários agendamentos (migration 022), e o pet só está
--   pronto quando o último deles terminar.
--
-- • A taxa entra em agendamento.valor do agendamento ao qual a corrida
--   está presa (o primeiro do carrinho) — mesma decisão já tomada para
--   produtos na migration 039: relatórios que somam `valor` passam a
--   contar o TaxiDog sem mudar nenhuma consulta. O valor fica também em
--   taxidog_corrida.valor, pra ser mostrado SEPARADO do serviço.
--
-- • O preço é SEMPRE calculado no banco (fn_cotar_taxidog), nunca aceito
--   do cliente. Por região não precisa de nenhuma API externa (compara
--   bairro/cidade normalizados). Por distância usa a coordenada do
--   endereço, que é geocodificado no servidor da aplicação (Server
--   Action) e passada pra cá — o SQL só faz a conta (linha reta,
--   haversine) e aplica as faixas.
--
-- • Regra mais específica vence (modo "personalizado"): região com
--   bairro > região só com cidade > faixa de distância. Região cadastrada
--   explicitamente vale mesmo além da distância máxima — se a loja
--   listou o bairro, é porque atende.
--
-- • Escrita só por funções SECURITY DEFINER (nenhuma policy de INSERT/
--   UPDATE/DELETE nas tabelas novas), igual agendamento_produto (039).
--   Leitura detalhada (pet + tutor + endereço) também por função
--   (fn_listar_corridas), pra um TaxiDog que NÃO tem permissão de agenda
--   ou de clientes enxergar só as corridas dele, sem abrir RLS de
--   agendamento/cliente/pet pra ele.
--
-- • TaxiDog é uma FUNÇÃO do funcionário (funcionario.pode_taxidog), não
--   uma permissão: não depende de acesso_total e não tira nenhuma outra
--   permissão que ele tenha.
--
-- • Junto (pedidos da mesma leva, pequenos): campos opcionais de
--   pelagem/comportamento do pet e a flag lojista.precos_estimados ("o
--   preço do agendamento online pode ser estimativa").
--
-- • Toda checagem de loja/dono usa IS DISTINCT FROM (ver migration 035).
-- ============================================================

-- ============================================================
-- 0) Helpers
-- ============================================================

-- Comparação de bairro/cidade sem depender de acento, caixa ou espaço
-- sobrando ("Jardim Zaíra" = "jardim  zaira"). Sem a extensão unaccent
-- (não habilitada neste projeto) — translate cobre o português.
CREATE OR REPLACE FUNCTION fn_normalizar_texto(p_texto TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      lower(translate(
        btrim(COALESCE(p_texto, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'
      )),
      '\s+', ' ', 'g'
    ),
    ''
  )
$$;

-- Distância em linha reta (haversine), em km com 2 casas. least(1, ...)
-- protege o asin de um arredondamento de ponto flutuante acima de 1.
CREATE OR REPLACE FUNCTION fn_distancia_km(
  p_lat1 DOUBLE PRECISION, p_lng1 DOUBLE PRECISION,
  p_lat2 DOUBLE PRECISION, p_lng2 DOUBLE PRECISION
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round((2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
    cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  ))))::numeric, 2)
$$;

-- "5.00" -> "5", "7.50" -> "7,5" — pra mensagens em português.
CREATE OR REPLACE FUNCTION fn_formatar_km(p_km NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(rtrim(rtrim(round(p_km, 1)::text, '0'), '.'), '.', ',')
$$;

-- ============================================================
-- 1) Funcionário pode trabalhar como TaxiDog
-- ============================================================
ALTER TABLE funcionario ADD COLUMN IF NOT EXISTS pode_taxidog BOOLEAN NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION fn_registrar_funcionario(
  p_id_funcionario      UUID,
  p_id_lojista          UUID,
  p_nome                TEXT,
  p_email               TEXT,
  p_telefone            TEXT,
  p_cargo               TEXT DEFAULT NULL,
  p_pode_agenda         BOOLEAN DEFAULT TRUE,
  p_pode_servicos       BOOLEAN DEFAULT FALSE,
  p_pode_clientes_pets  BOOLEAN DEFAULT FALSE,
  p_acesso_total        BOOLEAN DEFAULT FALSE,
  p_pode_produtos       BOOLEAN DEFAULT FALSE,
  p_pode_taxidog        BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado: apenas o lojista ou um administrador pode cadastrar membros';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 2 THEN
    RAISE EXCEPTION 'Nome do membro inválido';
  END IF;

  IF p_email IS NULL OR p_email !~* '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  IF p_telefone IS NULL OR p_telefone !~ '^\d{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  IF EXISTS (SELECT 1 FROM funcionario WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como funcionário';
  END IF;

  IF EXISTS (SELECT 1 FROM lojista WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como lojista';
  END IF;

  IF EXISTS (SELECT 1 FROM cliente WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como cliente';
  END IF;

  INSERT INTO funcionario (
    id_funcionario, id_lojista, nome, email, telefone, cargo,
    pode_gerenciar_agenda, pode_gerenciar_servicos, pode_gerenciar_clientes_pets,
    acesso_total, pode_gerenciar_produtos, pode_taxidog
  ) VALUES (
    p_id_funcionario, p_id_lojista, trim(p_nome), lower(trim(p_email)), p_telefone, NULLIF(trim(p_cargo), ''),
    p_pode_agenda, p_pode_servicos, p_pode_clientes_pets,
    p_acesso_total, p_pode_produtos, p_pode_taxidog
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- ============================================================
-- 2) Preço do agendamento online pode ser estimativa
-- ============================================================
ALTER TABLE lojista ADD COLUMN IF NOT EXISTS precos_estimados BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 3) Perfil opcional do pet (pelagem, características, comportamento)
-- ============================================================
-- Tudo opcional e fora do cadastro básico — o agendamento online continua
-- pedindo só o essencial. Comportamento é informação operacional da loja
-- (e do TaxiDog), por isso só lojista/equipe grava.
ALTER TABLE pet ADD COLUMN IF NOT EXISTS pelagem TEXT
  CHECK (pelagem IN ('Lisa', 'Ondulada', 'Crespa', 'Dupla'));
ALTER TABLE pet ADD COLUMN IF NOT EXISTS comprimento_pelo TEXT
  CHECK (comprimento_pelo IN ('Curto', 'Médio', 'Longo'));
ALTER TABLE pet ADD COLUMN IF NOT EXISTS caracteristicas TEXT
  CHECK (char_length(caracteristicas) <= 300);
ALTER TABLE pet ADD COLUMN IF NOT EXISTS comportamento TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE pet ADD COLUMN IF NOT EXISTS obs_comportamento TEXT
  CHECK (char_length(obs_comportamento) <= 500);

CREATE OR REPLACE FUNCTION fn_salvar_perfil_pet(
  p_id_pet             UUID,
  p_pelagem            TEXT,
  p_comprimento_pelo   TEXT,
  p_caracteristicas    TEXT,
  p_comportamento      TEXT[],
  p_obs_comportamento  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lojista UUID := auth_lojista_id();
  v_tags    TEXT[];
BEGIN
  IF v_lojista IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid() AND ativo = TRUE
      AND (pode_gerenciar_clientes_pets OR pode_gerenciar_agenda OR acesso_total)
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para editar pets';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet p
    JOIN cliente_lojista cl ON cl.id_cliente = p.id_cliente AND cl.id_lojista = v_lojista
    WHERE p.id_pet = p_id_pet
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT t), '{}')
  INTO v_tags
  FROM (SELECT btrim(x) AS t FROM unnest(COALESCE(p_comportamento, '{}')) AS x) s
  WHERE t <> '';

  IF array_length(v_tags, 1) > 12 THEN
    RAISE EXCEPTION 'Escolha no máximo 12 características de comportamento';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_tags) t WHERE char_length(t) > 40) THEN
    RAISE EXCEPTION 'Cada característica de comportamento pode ter no máximo 40 caracteres';
  END IF;

  UPDATE pet SET
    pelagem           = NULLIF(btrim(COALESCE(p_pelagem, '')), ''),
    comprimento_pelo  = NULLIF(btrim(COALESCE(p_comprimento_pelo, '')), ''),
    caracteristicas   = NULLIF(btrim(COALESCE(p_caracteristicas, '')), ''),
    comportamento     = v_tags,
    obs_comportamento = NULLIF(btrim(COALESCE(p_obs_comportamento, '')), '')
  WHERE id_pet = p_id_pet;
END;
$$;

REVOKE ALL ON FUNCTION fn_salvar_perfil_pet(UUID, TEXT, TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_salvar_perfil_pet(UUID, TEXT, TEXT, TEXT, TEXT[], TEXT) TO authenticated;

-- ============================================================
-- 4) Configuração do TaxiDog (por loja)
-- ============================================================
CREATE TABLE IF NOT EXISTS taxidog_config (
  id_lojista            UUID PRIMARY KEY REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  ativo                 BOOLEAN NOT NULL DEFAULT FALSE,
  disponivel_online     BOOLEAN NOT NULL DEFAULT TRUE,
  modo_cobranca         TEXT NOT NULL DEFAULT 'fixo'
                        CHECK (modo_cobranca IN ('fixo', 'distancia', 'regiao', 'personalizado')),
  -- Valor fixo (modo 'fixo'), um por modalidade.
  valor_buscar          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_buscar >= 0),
  valor_entregar        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_entregar >= 0),
  valor_buscar_entregar NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_buscar_entregar >= 0),
  distancia_max_km      NUMERIC(6,2) CHECK (distancia_max_km > 0),
  valor_minimo          NUMERIC(10,2) CHECK (valor_minimo >= 0),
  -- Coordenada da loja, geocodificada a partir do endereço cadastrado
  -- quando a cobrança usa distância. origem_endereco guarda o texto que
  -- foi geocodificado, pra mostrar na tela o que o sistema entendeu.
  origem_lat            DOUBLE PRECISION,
  origem_lng            DOUBLE PRECISION,
  origem_endereco       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_taxidog_config_updated_at ON taxidog_config;
CREATE TRIGGER trg_taxidog_config_updated_at
  BEFORE UPDATE ON taxidog_config
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Faixas de distância: cada faixa é "até X km" — o começo dela é o fim da
-- anterior (0–3, 3–5, 5–10...). Só um valor por trecho (buscar OU
-- entregar custam o mesmo, é a mesma viagem ao contrário) e um valor
-- opcional pra ida e volta; sem ele, ida e volta = 2 × trecho.
CREATE TABLE IF NOT EXISTS taxidog_faixa (
  id_faixa        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  km_ate          NUMERIC(6,2) NOT NULL CHECK (km_ate > 0),
  valor_trecho    NUMERIC(10,2) NOT NULL CHECK (valor_trecho >= 0),
  valor_ida_volta NUMERIC(10,2) CHECK (valor_ida_volta >= 0),
  UNIQUE (id_lojista, km_ate)
);

CREATE INDEX IF NOT EXISTS idx_taxidog_faixa_lojista ON taxidog_faixa(id_lojista, km_ate);

-- Região = um bairro de uma cidade, ou uma cidade inteira (bairro NULL).
CREATE TABLE IF NOT EXISTS taxidog_regiao (
  id_regiao       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  bairro          TEXT CHECK (char_length(bairro) <= 80),
  cidade          TEXT NOT NULL CHECK (char_length(cidade) BETWEEN 2 AND 80),
  uf              CHAR(2),
  valor_trecho    NUMERIC(10,2) NOT NULL CHECK (valor_trecho >= 0),
  valor_ida_volta NUMERIC(10,2) CHECK (valor_ida_volta >= 0),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_taxidog_regiao_unica
  ON taxidog_regiao (id_lojista, COALESCE(fn_normalizar_texto(bairro), ''), fn_normalizar_texto(cidade));

ALTER TABLE taxidog_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxidog_config FORCE ROW LEVEL SECURITY;
ALTER TABLE taxidog_faixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxidog_faixa FORCE ROW LEVEL SECURITY;
ALTER TABLE taxidog_regiao ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxidog_regiao FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taxidog_config: loja ve a sua" ON taxidog_config;
CREATE POLICY "taxidog_config: loja ve a sua"
  ON taxidog_config FOR SELECT
  USING (
    (auth_role() = 'lojista' AND id_lojista = auth.uid())
    OR (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id())
  );

DROP POLICY IF EXISTS "taxidog_faixa: loja ve as suas" ON taxidog_faixa;
CREATE POLICY "taxidog_faixa: loja ve as suas"
  ON taxidog_faixa FOR SELECT
  USING (
    (auth_role() = 'lojista' AND id_lojista = auth.uid())
    OR (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id())
  );

DROP POLICY IF EXISTS "taxidog_regiao: loja ve as suas" ON taxidog_regiao;
CREATE POLICY "taxidog_regiao: loja ve as suas"
  ON taxidog_regiao FOR SELECT
  USING (
    (auth_role() = 'lojista' AND id_lojista = auth.uid())
    OR (auth_role() = 'funcionario' AND id_lojista = auth_lojista_id())
  );

-- Grava configuração + faixas + regiões numa transação só: o formulário
-- edita tudo junto, então faixas/regiões são substituídas pela lista
-- enviada (apagar a linha na tela = apagar a faixa).
CREATE OR REPLACE FUNCTION fn_salvar_taxidog_config(
  p_id_lojista            UUID,
  p_ativo                 BOOLEAN,
  p_disponivel_online     BOOLEAN,
  p_modo_cobranca         TEXT,
  p_valor_buscar          NUMERIC,
  p_valor_entregar        NUMERIC,
  p_valor_buscar_entregar NUMERIC,
  p_distancia_max_km      NUMERIC,
  p_valor_minimo          NUMERIC,
  p_origem_lat            DOUBLE PRECISION,
  p_origem_lng            DOUBLE PRECISION,
  p_origem_endereco       TEXT,
  p_faixas                JSONB,
  p_regioes               JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND ativo = TRUE AND acesso_total = TRUE
  ) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode configurar o TaxiDog';
  END IF;

  IF jsonb_array_length(COALESCE(p_faixas, '[]'::jsonb)) > 30 THEN
    RAISE EXCEPTION 'Cadastre no máximo 30 faixas de distância';
  END IF;

  IF jsonb_array_length(COALESCE(p_regioes, '[]'::jsonb)) > 200 THEN
    RAISE EXCEPTION 'Cadastre no máximo 200 regiões';
  END IF;

  INSERT INTO taxidog_config (
    id_lojista, ativo, disponivel_online, modo_cobranca,
    valor_buscar, valor_entregar, valor_buscar_entregar,
    distancia_max_km, valor_minimo, origem_lat, origem_lng, origem_endereco
  ) VALUES (
    p_id_lojista, p_ativo, p_disponivel_online, p_modo_cobranca,
    COALESCE(p_valor_buscar, 0), COALESCE(p_valor_entregar, 0), COALESCE(p_valor_buscar_entregar, 0),
    p_distancia_max_km, p_valor_minimo, p_origem_lat, p_origem_lng, p_origem_endereco
  )
  ON CONFLICT (id_lojista) DO UPDATE SET
    ativo                 = EXCLUDED.ativo,
    disponivel_online     = EXCLUDED.disponivel_online,
    modo_cobranca         = EXCLUDED.modo_cobranca,
    valor_buscar          = EXCLUDED.valor_buscar,
    valor_entregar        = EXCLUDED.valor_entregar,
    valor_buscar_entregar = EXCLUDED.valor_buscar_entregar,
    distancia_max_km      = EXCLUDED.distancia_max_km,
    valor_minimo          = EXCLUDED.valor_minimo,
    origem_lat            = EXCLUDED.origem_lat,
    origem_lng            = EXCLUDED.origem_lng,
    origem_endereco       = EXCLUDED.origem_endereco;

  DELETE FROM taxidog_faixa WHERE id_lojista = p_id_lojista;
  INSERT INTO taxidog_faixa (id_lojista, km_ate, valor_trecho, valor_ida_volta)
  SELECT p_id_lojista, f.km_ate, f.valor_trecho, f.valor_ida_volta
  FROM jsonb_to_recordset(COALESCE(p_faixas, '[]'::jsonb))
    AS f(km_ate NUMERIC, valor_trecho NUMERIC, valor_ida_volta NUMERIC);

  DELETE FROM taxidog_regiao WHERE id_lojista = p_id_lojista;
  INSERT INTO taxidog_regiao (id_lojista, bairro, cidade, uf, valor_trecho, valor_ida_volta, ativo)
  SELECT p_id_lojista,
         NULLIF(btrim(COALESCE(r.bairro, '')), ''),
         btrim(r.cidade),
         NULLIF(upper(btrim(COALESCE(r.uf, ''))), ''),
         r.valor_trecho, r.valor_ida_volta, COALESCE(r.ativo, TRUE)
  FROM jsonb_to_recordset(COALESCE(p_regioes, '[]'::jsonb))
    AS r(bairro TEXT, cidade TEXT, uf TEXT, valor_trecho NUMERIC, valor_ida_volta NUMERIC, ativo BOOLEAN);
END;
$$;

REVOKE ALL ON FUNCTION fn_salvar_taxidog_config(UUID, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_salvar_taxidog_config(UUID, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, JSONB, JSONB) TO authenticated;

-- O que a página pública de agendamento precisa saber pra decidir se
-- mostra a etapa "Como seu pet irá até a loja?" — e só isso (nenhum
-- preço/região vaza por aqui; a cotação é por fn_cotar_taxidog).
CREATE OR REPLACE FUNCTION fn_taxidog_publico(p_id_lojista UUID)
RETURNS TABLE (disponivel BOOLEAN, modo_cobranca TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(c.ativo AND c.disponivel_online AND l.ativo AND l.aceita_agendamento_online, FALSE),
    COALESCE(c.modo_cobranca, 'fixo')
  FROM lojista l
  LEFT JOIN taxidog_config c ON c.id_lojista = l.id_lojista
  WHERE l.id_lojista = p_id_lojista
$$;

REVOKE ALL ON FUNCTION fn_taxidog_publico(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_taxidog_publico(UUID) TO anon, authenticated;

-- ============================================================
-- 5) Cotação — a única fonte do preço do TaxiDog
-- ============================================================
CREATE OR REPLACE FUNCTION fn_cotar_taxidog(
  p_id_lojista UUID,
  p_modalidade TEXT,
  p_bairro     TEXT,
  p_cidade     TEXT,
  p_uf         TEXT,
  p_lat        DOUBLE PRECISION DEFAULT NULL,
  p_lng        DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (disponivel BOOLEAN, valor NUMERIC, distancia_km NUMERIC, criterio TEXT, motivo TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_cfg          taxidog_config%ROWTYPE;
  v_regiao       taxidog_regiao%ROWTYPE;
  v_faixa        taxidog_faixa%ROWTYPE;
  v_dist         NUMERIC;
  v_trecho       NUMERIC(10,2);
  v_ida_volta    NUMERIC(10,2);
  v_valor        NUMERIC(10,2);
  v_criterio     TEXT;
  v_achou_regiao BOOLEAN := FALSE;
BEGIN
  IF p_modalidade IS NULL OR p_modalidade NOT IN ('buscar', 'entregar', 'buscar_entregar') THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT, 'Tipo de transporte inválido.'::TEXT;
    RETURN;
  END IF;

  SELECT c.* INTO v_cfg
  FROM taxidog_config c
  JOIN lojista l ON l.id_lojista = c.id_lojista
  WHERE c.id_lojista = p_id_lojista
    AND c.ativo AND c.disponivel_online
    AND l.ativo AND l.aceita_agendamento_online;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT, 'O TaxiDog não está disponível nesta loja no momento.'::TEXT;
    RETURN;
  END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL AND v_cfg.origem_lat IS NOT NULL AND v_cfg.origem_lng IS NOT NULL THEN
    v_dist := fn_distancia_km(v_cfg.origem_lat, v_cfg.origem_lng, p_lat, p_lng);
  END IF;

  IF v_cfg.modo_cobranca = 'fixo' THEN
    v_valor := CASE p_modalidade
      WHEN 'buscar' THEN v_cfg.valor_buscar
      WHEN 'entregar' THEN v_cfg.valor_entregar
      ELSE v_cfg.valor_buscar_entregar
    END;
    v_criterio := 'Valor fixo da loja';
  END IF;

  IF v_cfg.modo_cobranca IN ('regiao', 'personalizado') THEN
    SELECT r.* INTO v_regiao
    FROM taxidog_regiao r
    WHERE r.id_lojista = p_id_lojista
      AND r.ativo
      AND fn_normalizar_texto(r.cidade) = fn_normalizar_texto(p_cidade)
      AND (r.uf IS NULL OR upper(r.uf) = upper(btrim(COALESCE(p_uf, ''))))
      AND (r.bairro IS NULL OR fn_normalizar_texto(r.bairro) = fn_normalizar_texto(p_bairro))
    ORDER BY (r.bairro IS NOT NULL) DESC
    LIMIT 1;

    IF FOUND THEN
      v_achou_regiao := TRUE;
      v_trecho := v_regiao.valor_trecho;
      v_ida_volta := v_regiao.valor_ida_volta;
      v_criterio := 'Região ' || CASE
        WHEN v_regiao.bairro IS NOT NULL THEN v_regiao.bairro || ' — ' || v_regiao.cidade
        ELSE v_regiao.cidade
      END;
    ELSIF v_cfg.modo_cobranca = 'regiao' THEN
      RETURN QUERY SELECT FALSE, NULL::NUMERIC, v_dist, NULL::TEXT,
        'A loja ainda não atende o seu bairro com o TaxiDog.'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_cfg.modo_cobranca = 'distancia' OR (v_cfg.modo_cobranca = 'personalizado' AND NOT v_achou_regiao) THEN
    IF v_dist IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT,
        'Não conseguimos calcular a distância até este endereço. Confira o endereço ou fale com a loja.'::TEXT;
      RETURN;
    END IF;

    IF v_cfg.distancia_max_km IS NOT NULL AND v_dist > v_cfg.distancia_max_km THEN
      RETURN QUERY SELECT FALSE, NULL::NUMERIC, v_dist, NULL::TEXT,
        format('Este endereço fica fora da área atendida pelo TaxiDog (até %s km da loja).', fn_formatar_km(v_cfg.distancia_max_km))::TEXT;
      RETURN;
    END IF;

    SELECT f.* INTO v_faixa
    FROM taxidog_faixa f
    WHERE f.id_lojista = p_id_lojista AND v_dist <= f.km_ate
    ORDER BY f.km_ate
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, NULL::NUMERIC, v_dist, NULL::TEXT,
        'Este endereço fica fora da área atendida pelo TaxiDog.'::TEXT;
      RETURN;
    END IF;

    v_trecho := v_faixa.valor_trecho;
    v_ida_volta := v_faixa.valor_ida_volta;
    v_criterio := format('Distância até %s km', fn_formatar_km(v_faixa.km_ate));
  END IF;

  IF v_valor IS NULL THEN
    v_valor := CASE
      WHEN p_modalidade = 'buscar_entregar' THEN COALESCE(v_ida_volta, v_trecho * 2)
      ELSE v_trecho
    END;
  END IF;

  IF v_cfg.valor_minimo IS NOT NULL AND v_valor < v_cfg.valor_minimo THEN
    v_valor := v_cfg.valor_minimo;
    v_criterio := v_criterio || ' (valor mínimo da loja)';
  END IF;

  RETURN QUERY SELECT TRUE, v_valor::NUMERIC, v_dist, v_criterio, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION fn_cotar_taxidog(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cotar_taxidog(UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;

-- ============================================================
-- 6) Corridas e histórico
-- ============================================================
CREATE TABLE IF NOT EXISTS taxidog_corrida (
  id_corrida      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_agendamento  UUID NOT NULL UNIQUE REFERENCES agendamento(id_agendamento) ON DELETE CASCADE,
  -- Denormalizados (mesma ideia de agendamento_produto): RLS direta e
  -- filtro do Realtime por loja/TaxiDog sem JOIN.
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  id_cliente      UUID NOT NULL REFERENCES cliente(id_cliente) ON DELETE RESTRICT,
  id_pet          UUID NOT NULL REFERENCES pet(id_pet) ON DELETE RESTRICT,
  modalidade      TEXT NOT NULL CHECK (modalidade IN ('buscar', 'entregar', 'buscar_entregar')),
  status          TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN (
                    'agendada', 'a_caminho_cliente', 'no_endereco', 'pet_embarcado', 'entregue_loja',
                    'pronto_entrega', 'a_caminho_entrega', 'no_endereco_entrega', 'concluida', 'cancelada'
                  )),
  id_funcionario  UUID REFERENCES funcionario(id_funcionario) ON DELETE SET NULL,
  -- Endereço é uma FOTO do que o cliente informou no agendamento.
  cep             TEXT NOT NULL CHECK (cep ~ '^\d{8}$'),
  logradouro      TEXT NOT NULL CHECK (char_length(logradouro) BETWEEN 2 AND 150),
  numero          TEXT NOT NULL CHECK (char_length(numero) BETWEEN 1 AND 20),
  complemento     TEXT CHECK (char_length(complemento) <= 80),
  bairro          TEXT NOT NULL CHECK (char_length(bairro) BETWEEN 2 AND 80),
  cidade          TEXT NOT NULL CHECK (char_length(cidade) BETWEEN 2 AND 80),
  uf              TEXT NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  distancia_km    NUMERIC(6,2),
  valor           NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  criterio        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taxidog_corrida_lojista ON taxidog_corrida(id_lojista, status);
CREATE INDEX IF NOT EXISTS idx_taxidog_corrida_funcionario ON taxidog_corrida(id_funcionario, status);
CREATE INDEX IF NOT EXISTS idx_taxidog_corrida_cliente ON taxidog_corrida(id_cliente, created_at DESC);

DROP TRIGGER IF EXISTS trg_taxidog_corrida_updated_at ON taxidog_corrida;
CREATE TRIGGER trg_taxidog_corrida_updated_at
  BEFORE UPDATE ON taxidog_corrida
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE IF NOT EXISTS taxidog_evento (
  id_evento   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_corrida  UUID NOT NULL REFERENCES taxidog_corrida(id_corrida) ON DELETE CASCADE,
  id_lojista  UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  descricao   TEXT NOT NULL,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taxidog_evento_corrida ON taxidog_evento(id_corrida, created_at);

ALTER TABLE taxidog_corrida ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxidog_corrida FORCE ROW LEVEL SECURITY;
ALTER TABLE taxidog_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxidog_evento FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taxidog_corrida: cliente ve proprias" ON taxidog_corrida;
CREATE POLICY "taxidog_corrida: cliente ve proprias"
  ON taxidog_corrida FOR SELECT
  USING (id_cliente = auth.uid());

DROP POLICY IF EXISTS "taxidog_corrida: lojista ve da loja" ON taxidog_corrida;
CREATE POLICY "taxidog_corrida: lojista ve da loja"
  ON taxidog_corrida FOR SELECT
  USING (auth_role() = 'lojista' AND id_lojista = auth.uid());

-- Funcionário: quem gerencia a agenda vê todas as corridas da loja; o
-- TaxiDog vê só as atribuídas a ele (é isso que o Realtime dele usa).
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
          AND (f.pode_gerenciar_agenda OR f.acesso_total)
      )
    )
  );

DROP POLICY IF EXISTS "taxidog_evento: loja ve" ON taxidog_evento;
CREATE POLICY "taxidog_evento: loja ve"
  ON taxidog_evento FOR SELECT
  USING (
    (auth_role() = 'lojista' AND id_lojista = auth.uid())
    OR (
      auth_role() = 'funcionario' AND id_lojista = auth_lojista_id()
      AND (
        EXISTS (SELECT 1 FROM taxidog_corrida c WHERE c.id_corrida = taxidog_evento.id_corrida AND c.id_funcionario = auth.uid())
        OR EXISTS (
          SELECT 1 FROM funcionario f
          WHERE f.id_funcionario = auth.uid() AND f.ativo = TRUE
            AND (f.pode_gerenciar_agenda OR f.acesso_total)
        )
      )
    )
  );

-- Realtime: o app do TaxiDog escuta mudanças nas corridas dele (nova
-- atribuição, "pronto para entrega") — mesmo mecanismo do som de novo
-- agendamento do painel (migration 036).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'taxidog_corrida'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE taxidog_corrida;
  END IF;
END $$;

-- ============================================================
-- 7) Funções internas (sem GRANT — só chamadas de outras funções)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_registrar_evento_corrida(p_id_corrida UUID, p_status TEXT, p_descricao TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO taxidog_evento (id_corrida, id_lojista, status, descricao, created_by)
  SELECT c.id_corrida, c.id_lojista, p_status, p_descricao, auth.uid()
  FROM taxidog_corrida c
  WHERE c.id_corrida = p_id_corrida
$$;

REVOKE ALL ON FUNCTION fn_registrar_evento_corrida(UUID, TEXT, TEXT) FROM PUBLIC;

-- A visita (mesmo pet, loja e dia) terminou? = pelo menos um serviço
-- Concluído e nenhum ainda pendente/aceito/em andamento.
CREATE OR REPLACE FUNCTION fn_visita_taxidog_concluida(p_id_agendamento UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM agendamento a2
      JOIN agendamento a ON a.id_pet = a2.id_pet AND a.id_lojista = a2.id_lojista AND a.dt_agendamento = a2.dt_agendamento
      WHERE a.id_agendamento = p_id_agendamento AND a2.status = 'Concluído'
    )
    AND NOT EXISTS (
      SELECT 1 FROM agendamento a2
      JOIN agendamento a ON a.id_pet = a2.id_pet AND a.id_lojista = a2.id_lojista AND a.dt_agendamento = a2.dt_agendamento
      WHERE a.id_agendamento = p_id_agendamento AND a2.status IN ('Pendente', 'Confirmado', 'Em andamento')
    )
$$;

REVOKE ALL ON FUNCTION fn_visita_taxidog_concluida(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fn_rotulo_modalidade_taxidog(p_modalidade TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_modalidade
    WHEN 'buscar' THEN 'Somente buscar'
    WHEN 'entregar' THEN 'Somente entregar'
    WHEN 'buscar_entregar' THEN 'Buscar e entregar'
    ELSE p_modalidade
  END
$$;

-- Prende uma corrida a um agendamento recém-criado: cota de novo (preço
-- nunca vem de fora), grava o endereço, soma a taxa no valor do
-- agendamento e abre o histórico. Qualquer problema aborta a transação
-- inteira — o agendamento não fica criado "sem o TaxiDog que o cliente
-- pediu". Mensagens começam com "TaxiDog:" pra aplicação repassar.
CREATE OR REPLACE FUNCTION fn_anexar_taxidog(
  p_id_agendamento UUID,
  p_modalidade     TEXT,
  p_cep            TEXT,
  p_logradouro     TEXT,
  p_numero         TEXT,
  p_complemento    TEXT,
  p_bairro         TEXT,
  p_cidade         TEXT,
  p_uf             TEXT,
  p_lat            DOUBLE PRECISION,
  p_lng            DOUBLE PRECISION
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ag         agendamento%ROWTYPE;
  v_cep        TEXT := regexp_replace(COALESCE(p_cep, ''), '\D', '', 'g');
  v_uf         TEXT := upper(btrim(COALESCE(p_uf, '')));
  v_disponivel BOOLEAN;
  v_valor      NUMERIC;
  v_dist       NUMERIC;
  v_criterio   TEXT;
  v_motivo     TEXT;
  v_id         UUID;
BEGIN
  SELECT * INTO v_ag FROM agendamento WHERE id_agendamento = p_id_agendamento FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TaxiDog: agendamento não encontrado.';
  END IF;

  IF v_cep !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'TaxiDog: informe um CEP válido.';
  END IF;
  IF char_length(btrim(COALESCE(p_logradouro, ''))) < 2 OR char_length(btrim(COALESCE(p_numero, ''))) < 1
     OR char_length(btrim(COALESCE(p_bairro, ''))) < 2 OR char_length(btrim(COALESCE(p_cidade, ''))) < 2 THEN
    RAISE EXCEPTION 'TaxiDog: preencha rua, número, bairro e cidade.';
  END IF;
  IF v_uf !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'TaxiDog: informe o estado (UF) com 2 letras.';
  END IF;

  SELECT q.disponivel, q.valor, q.distancia_km, q.criterio, q.motivo
  INTO v_disponivel, v_valor, v_dist, v_criterio, v_motivo
  FROM fn_cotar_taxidog(v_ag.id_lojista, p_modalidade, p_bairro, p_cidade, v_uf, p_lat, p_lng) q;

  IF NOT COALESCE(v_disponivel, FALSE) THEN
    RAISE EXCEPTION 'TaxiDog: %', COALESCE(v_motivo, 'não disponível para este endereço.');
  END IF;

  INSERT INTO taxidog_corrida (
    id_agendamento, id_lojista, id_cliente, id_pet, modalidade,
    cep, logradouro, numero, complemento, bairro, cidade, uf,
    lat, lng, distancia_km, valor, criterio
  ) VALUES (
    v_ag.id_agendamento, v_ag.id_lojista, v_ag.id_cliente, v_ag.id_pet, p_modalidade,
    v_cep, btrim(p_logradouro), btrim(p_numero), NULLIF(btrim(COALESCE(p_complemento, '')), ''),
    btrim(p_bairro), btrim(p_cidade), v_uf,
    p_lat, p_lng, v_dist, v_valor, v_criterio
  )
  RETURNING id_corrida INTO v_id;

  UPDATE agendamento SET valor = valor + v_valor WHERE id_agendamento = v_ag.id_agendamento;

  PERFORM fn_registrar_evento_corrida(
    v_id, 'agendada',
    format('TaxiDog solicitado: %s — R$ %s', fn_rotulo_modalidade_taxidog(p_modalidade), replace(to_char(v_valor, 'FM999990.00'), '.', ','))
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_anexar_taxidog(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;

-- ============================================================
-- 8) Agendar COM TaxiDog — envoltórios das duas funções de agendamento
-- ============================================================
-- Em vez de reescrever fn_criar_agendamento/fn_criar_agendamento_multiplo
-- de novo (duas funções de ~200 linhas), as versões com TaxiDog chamam a
-- original e prendem a corrida na mesma transação. O caminho SEM TaxiDog
-- continua exatamente o de antes. A checagem "quem agenda é o próprio
-- cliente logado" é feita dentro da função original (auth.uid() continua
-- sendo o do cliente mesmo numa chamada aninhada).
CREATE OR REPLACE FUNCTION fn_criar_agendamento_com_taxidog(
  p_id_pet         UUID,
  p_id_servico     UUID,
  p_id_cliente     UUID,
  p_id_lojista     UUID,
  p_data           DATE,
  p_hora           TIME,
  p_obs            TEXT,
  p_produtos       UUID[],
  p_quantidades    NUMERIC[],
  p_tx_modalidade  TEXT,
  p_tx_cep         TEXT,
  p_tx_logradouro  TEXT,
  p_tx_numero      TEXT,
  p_tx_complemento TEXT,
  p_tx_bairro      TEXT,
  p_tx_cidade      TEXT,
  p_tx_uf          TEXT,
  p_tx_lat         DOUBLE PRECISION,
  p_tx_lng         DOUBLE PRECISION
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  v_id := fn_criar_agendamento(p_id_pet, p_id_servico, p_id_cliente, p_id_lojista, p_data, p_hora, p_obs, p_produtos, p_quantidades);
  PERFORM fn_anexar_taxidog(v_id, p_tx_modalidade, p_tx_cep, p_tx_logradouro, p_tx_numero, p_tx_complemento, p_tx_bairro, p_tx_cidade, p_tx_uf, p_tx_lat, p_tx_lng);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_agendamento_com_taxidog(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_com_taxidog(UUID, UUID, UUID, UUID, DATE, TIME, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

CREATE OR REPLACE FUNCTION fn_criar_agendamento_multiplo_com_taxidog(
  p_id_pet         UUID,
  p_id_cliente     UUID,
  p_id_lojista     UUID,
  p_data           DATE,
  p_hora_inicio    TIME,
  p_servicos       UUID[],
  p_id_funcionario UUID,
  p_obs            TEXT,
  p_produtos       UUID[],
  p_quantidades    NUMERIC[],
  p_tx_modalidade  TEXT,
  p_tx_cep         TEXT,
  p_tx_logradouro  TEXT,
  p_tx_numero      TEXT,
  p_tx_complemento TEXT,
  p_tx_bairro      TEXT,
  p_tx_cidade      TEXT,
  p_tx_uf          TEXT,
  p_tx_lat         DOUBLE PRECISION,
  p_tx_lng         DOUBLE PRECISION
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
BEGIN
  v_ids := fn_criar_agendamento_multiplo(p_id_pet, p_id_cliente, p_id_lojista, p_data, p_hora_inicio, p_servicos, p_id_funcionario, p_obs, p_produtos, p_quantidades);
  -- Mesma regra dos produtos (migration 039): a corrida fica presa ao
  -- PRIMEIRO agendamento do carrinho.
  PERFORM fn_anexar_taxidog(v_ids[1], p_tx_modalidade, p_tx_cep, p_tx_logradouro, p_tx_numero, p_tx_complemento, p_tx_bairro, p_tx_cidade, p_tx_uf, p_tx_lat, p_tx_lng);
  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_agendamento_multiplo_com_taxidog(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_multiplo_com_taxidog(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT, UUID[], NUMERIC[], TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- ============================================================
-- 9) Operação: atribuir, avançar etapa, cancelar
-- ============================================================

-- Quem atribui é o responsável pela loja ou um administrador (mesma regra
-- de "atribuir profissional" no Kanban). NULL = deixar sem TaxiDog.
CREATE OR REPLACE FUNCTION fn_atribuir_corrida(p_id_corrida UUID, p_id_funcionario UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c    taxidog_corrida%ROWTYPE;
  v_nome TEXT;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM v_c.id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND ativo = TRUE AND acesso_total = TRUE
  ) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode atribuir corridas';
  END IF;

  IF v_c.status NOT IN ('agendada', 'entregue_loja', 'pronto_entrega') THEN
    RAISE EXCEPTION 'Não é possível trocar o TaxiDog com a corrida em andamento ou encerrada';
  END IF;

  IF p_id_funcionario IS NOT NULL THEN
    SELECT nome INTO v_nome FROM funcionario
    WHERE id_funcionario = p_id_funcionario AND id_lojista = v_c.id_lojista AND ativo = TRUE AND pode_taxidog = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Este funcionário não está habilitado como TaxiDog';
    END IF;
  END IF;

  IF p_id_funcionario IS NOT DISTINCT FROM v_c.id_funcionario THEN
    RETURN;
  END IF;

  UPDATE taxidog_corrida SET id_funcionario = p_id_funcionario WHERE id_corrida = p_id_corrida;

  PERFORM fn_registrar_evento_corrida(
    p_id_corrida, v_c.status,
    CASE WHEN p_id_funcionario IS NULL THEN 'TaxiDog removido da corrida' ELSE 'Corrida atribuída a ' || v_nome END
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_atribuir_corrida(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_atribuir_corrida(UUID, UUID) TO authenticated;

-- Avança UMA etapa. Só a transição seguinte da linha do tempo é aceita
-- (nada de pular ou voltar). Pode ser feito pelo TaxiDog da corrida ou
-- por quem gerencia a agenda (ex.: TaxiDog esqueceu de apertar).
CREATE OR REPLACE FUNCTION fn_avancar_corrida(p_id_corrida UUID, p_novo_status TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c         taxidog_corrida%ROWTYPE;
  v_ag_status TEXT;
  v_gestor    BOOLEAN;
  v_ok        BOOLEAN;
  v_final     TEXT;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM v_c.id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  v_gestor := auth_role() = 'lojista' OR EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid() AND ativo = TRUE AND (pode_gerenciar_agenda OR acesso_total)
  );

  IF NOT v_gestor AND v_c.id_funcionario IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Esta corrida não está atribuída a você';
  END IF;

  IF v_c.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Esta corrida já foi encerrada';
  END IF;

  v_ok := CASE
    WHEN v_c.status = 'agendada'            AND p_novo_status = 'a_caminho_cliente'   AND v_c.modalidade IN ('buscar', 'buscar_entregar') THEN TRUE
    WHEN v_c.status = 'a_caminho_cliente'   AND p_novo_status = 'no_endereco'         THEN TRUE
    WHEN v_c.status = 'no_endereco'         AND p_novo_status = 'pet_embarcado'       THEN TRUE
    WHEN v_c.status = 'pet_embarcado'       AND p_novo_status = 'entregue_loja'       THEN TRUE
    WHEN v_c.status = 'pronto_entrega'      AND p_novo_status = 'a_caminho_entrega'   THEN TRUE
    WHEN v_c.status = 'a_caminho_entrega'   AND p_novo_status = 'no_endereco_entrega' THEN TRUE
    WHEN v_c.status = 'no_endereco_entrega' AND p_novo_status = 'concluida'           THEN TRUE
    ELSE FALSE
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Essa etapa não pode ser feita agora';
  END IF;

  IF p_novo_status IN ('a_caminho_cliente', 'a_caminho_entrega') AND v_c.id_funcionario IS NULL THEN
    RAISE EXCEPTION 'Atribua um TaxiDog antes de iniciar a corrida';
  END IF;

  SELECT status::TEXT INTO v_ag_status FROM agendamento WHERE id_agendamento = v_c.id_agendamento;
  IF v_ag_status = 'Cancelado' THEN
    RAISE EXCEPTION 'O agendamento desta corrida foi cancelado';
  END IF;

  v_final := p_novo_status;
  IF p_novo_status = 'entregue_loja' THEN
    IF v_c.modalidade = 'buscar' THEN
      v_final := 'concluida';
    ELSIF fn_visita_taxidog_concluida(v_c.id_agendamento) THEN
      -- Serviço já tinha terminado antes do TaxiDog registrar a chegada.
      v_final := 'pronto_entrega';
    END IF;
  END IF;

  UPDATE taxidog_corrida SET status = v_final WHERE id_corrida = p_id_corrida;

  PERFORM fn_registrar_evento_corrida(p_id_corrida, p_novo_status, CASE p_novo_status
    WHEN 'a_caminho_cliente'   THEN 'TaxiDog a caminho do cliente'
    WHEN 'no_endereco'         THEN 'TaxiDog chegou ao endereço'
    WHEN 'pet_embarcado'       THEN 'Pet embarcado'
    WHEN 'entregue_loja'       THEN 'Pet entregue na loja'
    WHEN 'a_caminho_entrega'   THEN 'TaxiDog a caminho para entrega'
    WHEN 'no_endereco_entrega' THEN 'TaxiDog chegou ao endereço de entrega'
    WHEN 'concluida'           THEN 'Pet entregue ao cliente'
  END);

  IF v_final = 'concluida' THEN
    PERFORM fn_registrar_evento_corrida(p_id_corrida, 'concluida', 'Corrida concluída');
  ELSIF v_final = 'pronto_entrega' THEN
    PERFORM fn_registrar_evento_corrida(p_id_corrida, 'pronto_entrega', 'Serviço finalizado — pet pronto para entrega');
  END IF;

  RETURN v_final;
END;
$$;

REVOKE ALL ON FUNCTION fn_avancar_corrida(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_avancar_corrida(UUID, TEXT) TO authenticated;

-- Cancela só o TaxiDog (o cliente decidiu levar o pet, por exemplo) sem
-- cancelar o agendamento — a taxa sai do valor do agendamento.
CREATE OR REPLACE FUNCTION fn_cancelar_corrida(p_id_corrida UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c taxidog_corrida%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM taxidog_corrida WHERE id_corrida = p_id_corrida FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  IF auth_lojista_id() IS DISTINCT FROM v_c.id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario WHERE id_funcionario = auth.uid() AND ativo = TRUE AND acesso_total = TRUE
  ) THEN
    RAISE EXCEPTION 'Apenas o responsável pela loja ou um administrador pode cancelar o TaxiDog';
  END IF;

  IF v_c.status IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Esta corrida já foi encerrada';
  END IF;

  UPDATE taxidog_corrida SET status = 'cancelada' WHERE id_corrida = p_id_corrida;
  UPDATE agendamento SET valor = GREATEST(0, valor - v_c.valor) WHERE id_agendamento = v_c.id_agendamento;

  PERFORM fn_registrar_evento_corrida(p_id_corrida, 'cancelada', 'TaxiDog cancelado pela loja — taxa removida do agendamento');
END;
$$;

REVOKE ALL ON FUNCTION fn_cancelar_corrida(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cancelar_corrida(UUID) TO authenticated;

-- ============================================================
-- 10) Trigger: status do agendamento conduz a corrida
-- ============================================================
CREATE OR REPLACE FUNCTION fn_trg_agendamento_taxidog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c taxidog_corrida%ROWTYPE;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'Cancelado' THEN
    FOR v_c IN
      SELECT * FROM taxidog_corrida
      WHERE id_agendamento = NEW.id_agendamento AND status NOT IN ('concluida', 'cancelada')
    LOOP
      UPDATE taxidog_corrida SET status = 'cancelada' WHERE id_corrida = v_c.id_corrida;
      PERFORM fn_registrar_evento_corrida(v_c.id_corrida, 'cancelada', 'Agendamento cancelado — corrida cancelada');
    END LOOP;

  ELSIF NEW.status = 'Concluído' THEN
    -- A corrida pode estar presa a OUTRO agendamento do mesmo carrinho.
    FOR v_c IN
      SELECT c.* FROM taxidog_corrida c
      JOIN agendamento a ON a.id_agendamento = c.id_agendamento
      WHERE a.id_pet = NEW.id_pet AND a.id_lojista = NEW.id_lojista AND a.dt_agendamento = NEW.dt_agendamento
        AND c.modalidade IN ('entregar', 'buscar_entregar')
        AND c.status IN ('agendada', 'entregue_loja')
    LOOP
      IF fn_visita_taxidog_concluida(v_c.id_agendamento) THEN
        UPDATE taxidog_corrida SET status = 'pronto_entrega' WHERE id_corrida = v_c.id_corrida;
        PERFORM fn_registrar_evento_corrida(v_c.id_corrida, 'pronto_entrega', 'Serviço finalizado — pet pronto para entrega');
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_taxidog ON agendamento;
CREATE TRIGGER trg_agendamento_taxidog
  AFTER UPDATE OF status ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_trg_agendamento_taxidog();

-- ============================================================
-- 11) Leitura: lista detalhada de corridas
-- ============================================================
-- Uma forma só pro painel web (quem gerencia a agenda vê todas as
-- corridas da loja) e pro app do TaxiDog (vê só as dele). Dados do pet,
-- tutor e endereço vêm daqui, sem precisar abrir RLS dessas tabelas pro
-- TaxiDog. p_id_corrida busca uma corrida específica, ignorando datas.
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
    l.nome_loja, concat_ws(', ', l.endereco, l.cidade, l.estado), cfg.origem_lat, cfg.origem_lng,
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
