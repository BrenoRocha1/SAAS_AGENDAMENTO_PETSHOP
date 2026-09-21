-- ============================================================
-- PETSHOP SaaS - Migration 035: checagem de loja/dono à prova de NULL
-- ============================================================
-- Problema: várias funções SECURITY DEFINER barram acesso a outra loja
-- com
--
--   IF auth_lojista_id() != p_id_lojista THEN RAISE EXCEPTION ...
--
-- auth_lojista_id() (migration 006) devolve NULL pra quem não é lojista
-- nem funcionário — ou seja, pra qualquer CLIENTE logado. Em SQL,
-- NULL != x não dá true, dá NULL; o IF só entra com true, então a
-- exceção não dispara e a função segue em frente. Como essas funções
-- têm GRANT pra `authenticated` e ficam expostas como RPC no PostgREST,
-- um cliente logado conseguia chamá-las direto com o id de QUALQUER
-- loja: listar clientes e pets (nome, telefone, e-mail, CPF),
-- cadastrar/editar cliente e pet, criar agendamento e até cadastrar
-- membro na equipe de outra loja.
--
-- Correção: IS DISTINCT FROM, que trata NULL como um valor comum —
-- NULL IS DISTINCT FROM x dá true, então a exceção dispara. Quando os
-- dois lados estão preenchidos (lojista, funcionário, cliente dono do
-- registro) o resultado é exatamente o mesmo de !=, então nada muda pra
-- quem usa o app normalmente. Mesmo padrão que a migration 034
-- (avaliações) já adotou.
--
-- O mesmo buraco existe onde a comparação é com auth.uid(), que é NULL
-- pra quem chama SEM login (role `anon`) — seções 2 e 3. Essas funções
-- também são executáveis por `anon`:
--   • fn_metricas_lojista, fn_agenda_dia e fn_criar_agendamento nunca
--     tiveram REVOKE, então ficaram com o EXECUTE padrão pra PUBLIC
--     (que inclui anon);
--   • nas demais, REVOKE ... FROM PUBLIC não tira o EXECUTE que o
--     Supabase concede DIRETAMENTE a anon/authenticated em toda função
--     nova do schema public (default privileges do projeto).
-- A chave anon é pública (vai no JS do navegador), então sem login dava
-- pra ler métricas, agenda e relatórios de qualquer loja e criar
-- agendamento em nome de qualquer cliente.
--
-- Como foi feito:
--   • O corpo de cada função é cópia IDÊNTICA da última migration que a
--     definiu (indicada acima de cada uma); só a linha da comparação
--     mudou.
--   • CREATE OR REPLACE, sem DROP: assinatura e colunas de retorno são
--     as mesmas da versão atual, então o Postgres aceita (sem erro
--     42P13) e os GRANTs que já existem são preservados.
--   • Os REVOKE/GRANT de cada função são repetidos de onde já existiam
--     (são idempotentes). Em fn_buscar_pets_lojista isso ainda repõe o
--     REVOKE/GRANT que a migration 029 não refez depois do DROP.
--   • Nenhuma chamada do app a essas funções usa o client admin
--     (service_role, em que auth.uid() também é NULL e a troca passaria
--     a barrar) — todas usam a sessão do próprio usuário. A única RPC
--     chamada com service_role, fn_registrar_lojista, já testa
--     auth.uid() IS NULL antes da comparação e não precisou mudar.
-- ============================================================

-- ============================================================
-- 1) auth_lojista_id() — telas do lojista/equipe. Um CLIENTE logado
--    (auth_lojista_id() = NULL) passava pela checagem.
-- ============================================================

-- fn_criar_agendamento_lojista — corpo da migration 028; REVOKE/GRANT da migration 008
CREATE OR REPLACE FUNCTION fn_criar_agendamento_lojista(
  p_id_lojista    UUID,
  p_id_cliente    UUID,
  p_id_pet        UUID,
  p_id_servico    UUID,
  p_data          DATE,
  p_hora          TIME,
  p_obs           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_agendamento  UUID;
  v_preco           NUMERIC(10,2);
  v_duracao         INTEGER;
  v_conflict        BOOLEAN;
BEGIN
  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid() AND pode_gerenciar_agenda = TRUE AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar a agenda';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  SELECT duracao
  INTO v_duracao
  FROM servico
  WHERE id_servico = p_id_servico
    AND id_lojista = p_id_lojista
    AND status = 'Ativo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet
      AND id_cliente = p_id_cliente
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente informado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cliente_lojista
    WHERE id_lojista = p_id_lojista
      AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'Este cliente ainda não possui histórico no seu petshop';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM agendamento a
    WHERE a.id_lojista = p_id_lojista
      AND a.dt_agendamento = p_data
      AND a.status NOT IN ('Cancelado')
      AND (
        p_hora < (a.hr_agendamento + (
          SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
        ) * INTERVAL '1 minute')
        AND (p_hora + v_duracao * INTERVAL '1 minute') > a.hr_agendamento
      )
    FOR UPDATE SKIP LOCKED
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'Horário não disponível. Por favor, escolha outro horário.';
  END IF;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  v_preco := fn_calcular_preco_servico(p_id_servico, p_id_pet);

  INSERT INTO agendamento (
    id_pet, id_servico, id_cliente, id_lojista,
    dt_agendamento, hr_agendamento, valor, status, obs
  )
  VALUES (
    p_id_pet, p_id_servico, p_id_cliente, p_id_lojista,
    p_data, p_hora, v_preco, 'Confirmado', p_obs
  )
  RETURNING id_agendamento INTO v_id_agendamento;

  RETURN v_id_agendamento;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_agendamento_lojista(UUID, UUID, UUID, UUID, DATE, TIME, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_lojista(UUID, UUID, UUID, UUID, DATE, TIME, TEXT) TO authenticated;

-- fn_registrar_funcionario — corpo da migration 029
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
  p_acesso_total        BOOLEAN DEFAULT FALSE
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

  -- acesso_total = TRUE além disso tudo: o trigger fn_bloquear_acesso_
  -- total_por_funcionario já recusa se quem está chamando não é o
  -- lojista de verdade, mesmo que este INSERT chegue aqui.
  INSERT INTO funcionario (
    id_funcionario,
    id_lojista,
    nome,
    email,
    telefone,
    cargo,
    pode_gerenciar_agenda,
    pode_gerenciar_servicos,
    pode_gerenciar_clientes_pets,
    acesso_total
  ) VALUES (
    p_id_funcionario,
    p_id_lojista,
    trim(p_nome),
    lower(trim(p_email)),
    p_telefone,
    NULLIF(trim(p_cargo), ''),
    p_pode_agenda,
    p_pode_servicos,
    p_pode_clientes_pets,
    p_acesso_total
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- fn_registrar_cliente_lojista — corpo da migration 029; REVOKE/GRANT da migration 014
CREATE OR REPLACE FUNCTION fn_registrar_cliente_lojista(
  p_id_cliente  UUID,
  p_id_lojista  UUID,
  p_nome        TEXT,
  p_cpf         TEXT,
  p_email       TEXT,
  p_telefone    TEXT
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
    RAISE EXCEPTION 'Acesso não autorizado: apenas o lojista ou um administrador pode cadastrar clientes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 2 THEN
    RAISE EXCEPTION 'Nome do cliente inválido';
  END IF;

  IF p_cpf IS NULL OR p_cpf !~ '^\d{11}$' THEN
    RAISE EXCEPTION 'CPF inválido';
  END IF;

  IF p_email IS NULL OR p_email !~* '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  IF p_telefone IS NULL OR p_telefone !~ '^\d{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  IF EXISTS (SELECT 1 FROM cliente WHERE cpf = p_cpf) THEN
    RAISE EXCEPTION 'cpf_already_exists: Este CPF já está cadastrado';
  END IF;

  IF EXISTS (SELECT 1 FROM cliente WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como cliente';
  END IF;

  IF EXISTS (SELECT 1 FROM lojista WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como lojista';
  END IF;

  IF EXISTS (SELECT 1 FROM funcionario WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_already_exists: Este e-mail já está cadastrado como funcionário';
  END IF;

  INSERT INTO cliente (id_cliente, nome, cpf, email, telefone)
  VALUES (p_id_cliente, trim(p_nome), p_cpf, lower(trim(p_email)), p_telefone);

  INSERT INTO cliente_lojista (id_cliente, id_lojista)
  VALUES (p_id_cliente, p_id_lojista)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION fn_registrar_cliente_lojista(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_registrar_cliente_lojista(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- fn_editar_cliente_lojista — corpo da migration 029; REVOKE/GRANT da migration 019
CREATE OR REPLACE FUNCTION fn_editar_cliente_lojista(
  p_id_lojista  UUID,
  p_id_cliente  UUID,
  p_nome        TEXT,
  p_telefone    TEXT
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

  IF NOT EXISTS (
    SELECT 1 FROM cliente_lojista
    WHERE id_lojista = p_id_lojista AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado ou não vinculado ao seu petshop';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 2 THEN
    RAISE EXCEPTION 'Nome do cliente inválido';
  END IF;

  IF p_telefone IS NULL OR p_telefone !~ '^\d{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  UPDATE cliente SET
    nome     = trim(p_nome),
    telefone = p_telefone
  WHERE id_cliente = p_id_cliente;
END;
$$;

REVOKE ALL ON FUNCTION fn_editar_cliente_lojista(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_editar_cliente_lojista(UUID, UUID, TEXT, TEXT) TO authenticated;

-- fn_editar_pet_lojista — corpo da migration 029; REVOKE/GRANT da migration 018
CREATE OR REPLACE FUNCTION fn_editar_pet_lojista(
  p_id_lojista  UUID,
  p_id_pet      UUID,
  p_id_cliente  UUID,
  p_nome        TEXT,
  p_raca        TEXT,
  p_sexo        TEXT,
  p_especie     especie_pet DEFAULT NULL,
  p_porte       porte_pet DEFAULT NULL,
  p_dt_nasc     DATE DEFAULT NULL,
  p_peso        NUMERIC DEFAULT NULL,
  p_obs         TEXT DEFAULT NULL
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

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet p
    JOIN cliente_lojista cl ON cl.id_cliente = p.id_cliente AND cl.id_lojista = p_id_lojista
    WHERE p.id_pet = p_id_pet AND p.ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence a um cliente do seu petshop';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cliente_lojista
    WHERE id_lojista = p_id_lojista AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'O tutor selecionado não está vinculado ao seu petshop';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 1 THEN
    RAISE EXCEPTION 'Nome do pet inválido';
  END IF;

  IF p_raca IS NULL OR char_length(trim(p_raca)) < 1 THEN
    RAISE EXCEPTION 'Raça do pet inválida';
  END IF;

  IF p_sexo NOT IN ('Macho', 'Fêmea') THEN
    RAISE EXCEPTION 'Sexo do pet inválido';
  END IF;

  IF p_dt_nasc IS NULL THEN
    RAISE EXCEPTION 'Data de nascimento é obrigatória';
  END IF;

  UPDATE pet SET
    id_cliente = p_id_cliente,
    nome       = trim(p_nome),
    raca       = trim(p_raca),
    sexo       = p_sexo::sexo_pet,
    especie    = p_especie,
    porte      = p_porte,
    dt_nasc    = p_dt_nasc,
    peso       = p_peso,
    obs        = NULLIF(trim(p_obs), '')
  WHERE id_pet = p_id_pet;
END;
$$;

REVOKE ALL ON FUNCTION fn_editar_pet_lojista(UUID, UUID, UUID, TEXT, TEXT, TEXT, especie_pet, porte_pet, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_editar_pet_lojista(UUID, UUID, UUID, TEXT, TEXT, TEXT, especie_pet, porte_pet, DATE, NUMERIC, TEXT) TO authenticated;

-- fn_criar_pet_lojista — corpo da migration 029; REVOKE/GRANT da migration 015
CREATE OR REPLACE FUNCTION fn_criar_pet_lojista(
  p_id_lojista  UUID,
  p_id_cliente  UUID,
  p_nome        TEXT,
  p_raca        TEXT,
  p_sexo        TEXT,
  p_especie     especie_pet DEFAULT NULL,
  p_porte       porte_pet DEFAULT NULL,
  p_dt_nasc     DATE DEFAULT NULL,
  p_peso        NUMERIC DEFAULT NULL,
  p_obs         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_pet UUID;
BEGIN
  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF auth_role() = 'funcionario' AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = auth.uid()
      AND (pode_gerenciar_agenda = TRUE OR acesso_total = TRUE)
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar a agenda';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista WHERE id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Lojista não encontrado ou inativo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cliente_lojista
    WHERE id_lojista = p_id_lojista AND id_cliente = p_id_cliente
  ) THEN
    RAISE EXCEPTION 'Este cliente não está vinculado ao seu petshop';
  END IF;

  IF p_nome IS NULL OR char_length(trim(p_nome)) < 1 THEN
    RAISE EXCEPTION 'Nome do pet inválido';
  END IF;

  IF p_sexo NOT IN ('Macho', 'Fêmea') THEN
    RAISE EXCEPTION 'Sexo do pet inválido';
  END IF;

  INSERT INTO pet (id_cliente, nome, raca, sexo, especie, porte, dt_nasc, peso, obs)
  VALUES (p_id_cliente, trim(p_nome), trim(p_raca), p_sexo::sexo_pet, p_especie, p_porte, p_dt_nasc, p_peso, NULLIF(trim(p_obs), ''))
  RETURNING id_pet INTO v_id_pet;

  RETURN v_id_pet;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_pet_lojista(UUID, UUID, TEXT, TEXT, TEXT, especie_pet, porte_pet, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_pet_lojista(UUID, UUID, TEXT, TEXT, TEXT, especie_pet, porte_pet, DATE, NUMERIC, TEXT) TO authenticated;

-- fn_buscar_clientes_lojista — corpo da migration 029; REVOKE/GRANT da migration 019
CREATE OR REPLACE FUNCTION fn_buscar_clientes_lojista(
  p_id_lojista  UUID,
  p_busca       TEXT DEFAULT NULL,
  p_limit       INT DEFAULT 20,
  p_offset      INT DEFAULT 0
)
RETURNS TABLE (
  id_cliente        UUID,
  nome              TEXT,
  telefone          TEXT,
  email             TEXT,
  cpf               TEXT,
  vinculado_desde   TIMESTAMPTZ,
  qtd_pets          BIGINT,
  pets_resumo       TEXT[],
  qtd_agendamentos  BIGINT,
  total_count       BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    c.id_cliente, c.nome, c.telefone, c.email, c.cpf,
    cl.created_at,
    COUNT(DISTINCT p.id_pet) FILTER (WHERE p.ativo = TRUE),
    ARRAY_AGG(DISTINCT (p.nome || ' (' || p.raca || ')')) FILTER (WHERE p.ativo = TRUE),
    COUNT(DISTINCT a.id_agendamento) FILTER (WHERE a.status != 'Cancelado'),
    COUNT(*) OVER()
  FROM cliente_lojista cl
  JOIN cliente c ON c.id_cliente = cl.id_cliente
  LEFT JOIN pet p ON p.id_cliente = c.id_cliente
  LEFT JOIN agendamento a ON a.id_cliente = c.id_cliente AND a.id_lojista = p_id_lojista
  WHERE cl.id_lojista = p_id_lojista
    AND (
      p_busca IS NULL OR trim(p_busca) = '' OR
      c.nome ILIKE '%' || p_busca || '%' OR
      c.telefone ILIKE '%' || p_busca || '%' OR
      c.email ILIKE '%' || p_busca || '%'
    )
  GROUP BY c.id_cliente, c.nome, c.telefone, c.email, c.cpf, cl.created_at
  ORDER BY c.nome
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION fn_buscar_clientes_lojista(UUID, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_buscar_clientes_lojista(UUID, TEXT, INT, INT) TO authenticated;

-- fn_buscar_pets_lojista — corpo da migration 029; REVOKE/GRANT da migration 027
CREATE OR REPLACE FUNCTION fn_buscar_pets_lojista(
  p_id_lojista  UUID,
  p_busca       TEXT DEFAULT NULL,
  p_especie     especie_pet DEFAULT NULL,
  p_porte       porte_pet DEFAULT NULL,
  p_limit       INT DEFAULT 20,
  p_offset      INT DEFAULT 0
)
RETURNS TABLE (
  id_pet            UUID,
  nome              TEXT,
  especie           especie_pet,
  porte             porte_pet,
  raca              TEXT,
  sexo              sexo_pet,
  dt_nasc           DATE,
  peso              NUMERIC,
  obs               TEXT,
  foto_url          TEXT,
  id_cliente        UUID,
  nome_cliente      TEXT,
  telefone_cliente  TEXT,
  created_at        TIMESTAMPTZ,
  total_count       BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_lojista_id() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    p.id_pet, p.nome, p.especie, p.porte, p.raca, p.sexo, p.dt_nasc, p.peso, p.obs, p.foto_url,
    c.id_cliente, c.nome, c.telefone,
    p.created_at,
    COUNT(*) OVER() AS total_count
  FROM pet p
  JOIN cliente c ON c.id_cliente = p.id_cliente
  JOIN cliente_lojista cl ON cl.id_cliente = p.id_cliente AND cl.id_lojista = p_id_lojista
  WHERE p.ativo = TRUE
    AND (p_especie IS NULL OR p.especie = p_especie)
    AND (p_porte IS NULL OR p.porte = p_porte)
    AND (
      p_busca IS NULL OR trim(p_busca) = '' OR
      p.nome ILIKE '%' || p_busca || '%' OR
      c.nome ILIKE '%' || p_busca || '%' OR
      p.raca ILIKE '%' || p_busca || '%'
    )
  ORDER BY p.nome
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION fn_buscar_pets_lojista(UUID, TEXT, especie_pet, porte_pet, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_buscar_pets_lojista(UUID, TEXT, especie_pet, porte_pet, INT, INT) TO authenticated;

-- ============================================================
-- 2) auth.uid() = p_id_lojista — dashboard e relatórios. Um visitante
--    SEM login (auth.uid() = NULL) passava pela checagem.
-- ============================================================

-- fn_metricas_lojista — corpo da migration 003
CREATE OR REPLACE FUNCTION fn_metricas_lojista(p_id_lojista UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT json_build_object(
    'total_mes',        COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM dt_agendamento) = EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM dt_agendamento) = EXTRACT(YEAR FROM NOW())),
    'receita_mes',      COALESCE(SUM(valor) FILTER (WHERE status = 'Concluído' AND EXTRACT(MONTH FROM dt_agendamento) = EXTRACT(MONTH FROM NOW())), 0),
    'pendentes',        COUNT(*) FILTER (WHERE status = 'Pendente'),
    'confirmados',      COUNT(*) FILTER (WHERE status = 'Confirmado'),
    'hoje',             COUNT(*) FILTER (WHERE dt_agendamento = CURRENT_DATE AND status NOT IN ('Cancelado')),
    'clientes_unicos',  COUNT(DISTINCT id_cliente)
  )
  INTO v_result
  FROM agendamento
  WHERE id_lojista = p_id_lojista;

  RETURN v_result;
END;
$$;

-- fn_agenda_dia — corpo da migration 003
CREATE OR REPLACE FUNCTION fn_agenda_dia(
  p_id_lojista  UUID,
  p_data        DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id_agendamento  UUID,
  hr_agendamento  TIME,
  nome_cliente    TEXT,
  nome_pet        TEXT,
  nome_servico    TEXT,
  duracao         INTEGER,
  status          status_agendamento,
  valor           NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    a.id_agendamento,
    a.hr_agendamento,
    c.nome AS nome_cliente,
    p.nome AS nome_pet,
    s.nome AS nome_servico,
    s.duracao,
    a.status,
    a.valor
  FROM agendamento a
  JOIN cliente c ON c.id_cliente = a.id_cliente
  JOIN pet     p ON p.id_pet = a.id_pet
  JOIN servico s ON s.id_servico = a.id_servico
  WHERE a.id_lojista = p_id_lojista
    AND a.dt_agendamento = p_data
    AND a.status != 'Cancelado'
  ORDER BY a.hr_agendamento;
END;
$$;

-- fn_relatorio_vendas_resumo — corpo da migration 033; REVOKE/GRANT da migration 016
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_resumo(
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
  IF auth.uid() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT json_build_object(
    'faturamento',              COALESCE(SUM(valor) FILTER (WHERE status = 'Concluído'), 0),
    'vendas',                   COUNT(*) FILTER (WHERE status = 'Concluído'),
    'pendente',                 COALESCE(SUM(valor) FILTER (WHERE status IN ('Pendente', 'Confirmado', 'Em andamento')), 0),
    'atendimentos_total',       COUNT(*) FILTER (WHERE status != 'Cancelado'),
    'valor_atendimentos_total', COALESCE(SUM(valor) FILTER (WHERE status != 'Cancelado'), 0),
    'cancelados',                COUNT(*) FILTER (WHERE status = 'Cancelado')
  )
  INTO v_result
  FROM agendamento
  WHERE id_lojista = p_id_lojista
    AND dt_agendamento BETWEEN p_data_ini AND p_data_fim;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION fn_relatorio_vendas_resumo(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_resumo(UUID, DATE, DATE) TO authenticated;

-- fn_relatorio_vendas_por_dia — corpo da migration 016
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_por_dia(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  dia          DATE,
  vendas       BIGINT,
  faturamento  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    d.dia::date,
    COUNT(a.id_agendamento) AS vendas,
    COALESCE(SUM(a.valor), 0) AS faturamento
  FROM generate_series(p_data_ini, p_data_fim, '1 day'::interval) AS d(dia)
  LEFT JOIN agendamento a
    ON a.dt_agendamento = d.dia::date
    AND a.id_lojista = p_id_lojista
    AND a.status = 'Concluído'
  GROUP BY d.dia
  ORDER BY d.dia;
END;
$$;

REVOKE ALL ON FUNCTION fn_relatorio_vendas_por_dia(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_por_dia(UUID, DATE, DATE) TO authenticated;

-- fn_relatorio_vendas_por_servico — corpo da migration 016
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_por_servico(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  id_servico   UUID,
  nome_servico TEXT,
  qtd_vendas   BIGINT,
  faturamento  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT s.id_servico, s.nome, COUNT(*), SUM(a.valor)
  FROM agendamento a
  JOIN servico s ON s.id_servico = a.id_servico
  WHERE a.id_lojista = p_id_lojista
    AND a.status = 'Concluído'
    AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
  GROUP BY s.id_servico, s.nome
  ORDER BY SUM(a.valor) DESC;
END;
$$;

REVOKE ALL ON FUNCTION fn_relatorio_vendas_por_servico(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_por_servico(UUID, DATE, DATE) TO authenticated;

-- fn_relatorio_vendas_por_profissional — corpo da migration 016
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_por_profissional(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  id_funcionario    UUID,
  nome_funcionario  TEXT,
  qtd_atendimentos  BIGINT,
  faturamento       NUMERIC,
  ticket_medio      NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT
    f.id_funcionario,
    COALESCE(f.nome, 'Sem profissional atribuído'),
    COUNT(*),
    SUM(a.valor),
    ROUND(SUM(a.valor) / COUNT(*), 2)
  FROM agendamento a
  LEFT JOIN funcionario f ON f.id_funcionario = a.id_funcionario
  WHERE a.id_lojista = p_id_lojista
    AND a.status = 'Concluído'
    AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
  GROUP BY f.id_funcionario, f.nome
  ORDER BY SUM(a.valor) DESC;
END;
$$;

REVOKE ALL ON FUNCTION fn_relatorio_vendas_por_profissional(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_por_profissional(UUID, DATE, DATE) TO authenticated;

-- fn_relatorio_vendas_por_cliente — corpo da migration 016
CREATE OR REPLACE FUNCTION fn_relatorio_vendas_por_cliente(
  p_id_lojista  UUID,
  p_data_ini    DATE,
  p_data_fim    DATE,
  p_limite      INT DEFAULT 10
)
RETURNS TABLE (
  id_cliente        UUID,
  nome_cliente      TEXT,
  qtd_atendimentos  BIGINT,
  valor_total       NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT c.id_cliente, c.nome, COUNT(*), SUM(a.valor)
  FROM agendamento a
  JOIN cliente c ON c.id_cliente = a.id_cliente
  WHERE a.id_lojista = p_id_lojista
    AND a.status = 'Concluído'
    AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
  GROUP BY c.id_cliente, c.nome
  ORDER BY SUM(a.valor) DESC
  LIMIT p_limite;
END;
$$;

REVOKE ALL ON FUNCTION fn_relatorio_vendas_por_cliente(UUID, DATE, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_vendas_por_cliente(UUID, DATE, DATE, INT) TO authenticated;

-- fn_relatorio_clientes_resumo — corpo da migration 016
CREATE OR REPLACE FUNCTION fn_relatorio_clientes_resumo(
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
  IF auth.uid() IS DISTINCT FROM p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT json_build_object(
    'clientes_atendidos', (
      SELECT COUNT(DISTINCT id_cliente) FROM agendamento
      WHERE id_lojista = p_id_lojista AND status = 'Concluído'
        AND dt_agendamento BETWEEN p_data_ini AND p_data_fim
    ),
    'clientes_novos', (
      SELECT COUNT(*) FROM cliente_lojista
      WHERE id_lojista = p_id_lojista
        AND created_at::date BETWEEN p_data_ini AND p_data_fim
    ),
    'clientes_recorrentes', (
      SELECT COUNT(DISTINCT a.id_cliente) FROM agendamento a
      WHERE a.id_lojista = p_id_lojista AND a.status = 'Concluído'
        AND a.dt_agendamento BETWEEN p_data_ini AND p_data_fim
        AND (
          SELECT COUNT(*) FROM agendamento a2
          WHERE a2.id_cliente = a.id_cliente
            AND a2.id_lojista = p_id_lojista
            AND a2.status = 'Concluído'
        ) > 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION fn_relatorio_clientes_resumo(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_relatorio_clientes_resumo(UUID, DATE, DATE) TO authenticated;

-- ============================================================
-- 3) p_id_cliente = auth.uid() — agendamento feito pelo cliente. Um
--    visitante SEM login (auth.uid() = NULL) agendava em nome de
--    qualquer cliente.
-- ============================================================

-- fn_criar_agendamento — corpo da migration 025
CREATE OR REPLACE FUNCTION fn_criar_agendamento(
  p_id_pet        UUID,
  p_id_servico    UUID,
  p_id_cliente    UUID,
  p_id_lojista    UUID,
  p_data          DATE,
  p_hora          TIME,
  p_obs           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_agendamento  UUID;
  v_preco           NUMERIC(10,2);
  v_duracao         INTEGER;
  v_conflict        BOOLEAN;
  v_min_instante    TIMESTAMPTZ;
  v_max_instante    TIMESTAMPTZ;
  v_min_valor       INTEGER;
  v_min_unidade     TEXT;
  v_max_valor       INTEGER;
  v_max_unidade     TEXT;
BEGIN
  IF p_id_cliente IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE AND aceita_agendamento_online = TRUE
  ) THEN
    RAISE EXCEPTION 'Este petshop não está aceitando agendamentos online no momento.';
  END IF;

  SELECT j.min_instante, j.max_instante INTO v_min_instante, v_max_instante
  FROM fn_janela_agendamento(p_id_lojista) j;

  IF (p_data + p_hora) AT TIME ZONE 'America/Sao_Paulo' < v_min_instante THEN
    SELECT agendamento_min_valor, agendamento_min_unidade INTO v_min_valor, v_min_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Agende com pelo menos % % de antecedência.', v_min_valor, CASE WHEN v_min_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  IF (p_data + p_hora) AT TIME ZONE 'America/Sao_Paulo' > v_max_instante THEN
    SELECT agendamento_max_valor, agendamento_max_unidade INTO v_max_valor, v_max_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Não é possível agendar com mais de % % de antecedência.', v_max_valor, CASE WHEN v_max_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  SELECT duracao
  INTO v_duracao
  FROM servico
  WHERE id_servico = p_id_servico
    AND id_lojista = p_id_lojista
    AND status = 'Ativo'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM agendamento a
    WHERE a.id_lojista = p_id_lojista
      AND a.dt_agendamento = p_data
      AND a.status NOT IN ('Cancelado')
      AND (
        p_hora < (a.hr_agendamento + (
          SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
        ) * INTERVAL '1 minute')
        AND (p_hora + v_duracao * INTERVAL '1 minute') > a.hr_agendamento
      )
    FOR UPDATE SKIP LOCKED
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'Horário não disponível. Por favor, escolha outro horário.';
  END IF;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet
      AND id_cliente = p_id_cliente
      AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente';
  END IF;

  v_preco := fn_calcular_preco_servico(p_id_servico, p_id_pet);

  INSERT INTO agendamento (
    id_pet, id_servico, id_cliente, id_lojista,
    dt_agendamento, hr_agendamento, valor, status, obs
  )
  VALUES (
    p_id_pet, p_id_servico, p_id_cliente, p_id_lojista,
    p_data, p_hora, v_preco, 'Pendente', p_obs
  )
  RETURNING id_agendamento INTO v_id_agendamento;

  RETURN v_id_agendamento;
END;
$$;

-- fn_criar_agendamento_multiplo — corpo da migration 025; REVOKE/GRANT da migration 022
CREATE OR REPLACE FUNCTION fn_criar_agendamento_multiplo(
  p_id_pet          UUID,
  p_id_cliente      UUID,
  p_id_lojista      UUID,
  p_data            DATE,
  p_hora_inicio     TIME,
  p_servicos        UUID[],
  p_id_funcionario  UUID DEFAULT NULL,
  p_obs             TEXT DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids             UUID[] := '{}';
  v_id_agendamento  UUID;
  v_id_servico      UUID;
  v_preco           NUMERIC(10,2);
  v_duracao         INTEGER;
  v_duracao_total   INTEGER;
  v_cursor          TIME := p_hora_inicio;
  v_conflict        BOOLEAN;
  v_dia_semana      dia_semana;
  v_hr_inicio       TIME;
  v_hr_fim          TIME;
  v_min_instante    TIMESTAMPTZ;
  v_max_instante    TIMESTAMPTZ;
  v_min_valor       INTEGER;
  v_min_unidade     TEXT;
  v_max_valor       INTEGER;
  v_max_unidade     TEXT;
BEGIN
  IF p_id_cliente IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF p_servicos IS NULL OR array_length(p_servicos, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos um serviço';
  END IF;

  IF array_length(p_servicos, 1) > 10 THEN
    RAISE EXCEPTION 'Selecione no máximo 10 serviços por agendamento';
  END IF;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'Não é possível agendar para datas passadas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lojista
    WHERE id_lojista = p_id_lojista AND ativo = TRUE AND aceita_agendamento_online = TRUE
  ) THEN
    RAISE EXCEPTION 'Este petshop não está aceitando agendamentos online no momento.';
  END IF;

  SELECT j.min_instante, j.max_instante INTO v_min_instante, v_max_instante
  FROM fn_janela_agendamento(p_id_lojista) j;

  IF (p_data + p_hora_inicio) AT TIME ZONE 'America/Sao_Paulo' < v_min_instante THEN
    SELECT agendamento_min_valor, agendamento_min_unidade INTO v_min_valor, v_min_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Agende com pelo menos % % de antecedência.', v_min_valor, CASE WHEN v_min_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  IF (p_data + p_hora_inicio) AT TIME ZONE 'America/Sao_Paulo' > v_max_instante THEN
    SELECT agendamento_max_valor, agendamento_max_unidade INTO v_max_valor, v_max_unidade FROM lojista WHERE id_lojista = p_id_lojista;
    RAISE EXCEPTION 'Não é possível agendar com mais de % % de antecedência.', v_max_valor, CASE WHEN v_max_unidade = 'dias' THEN 'dia(s)' ELSE 'hora(s)' END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pet
    WHERE id_pet = p_id_pet AND id_cliente = p_id_cliente AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Pet não encontrado ou não pertence ao cliente';
  END IF;

  IF p_id_funcionario IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM funcionario
    WHERE id_funcionario = p_id_funcionario AND id_lojista = p_id_lojista AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'Profissional não encontrado';
  END IF;

  SELECT COALESCE(SUM(duracao), 0) INTO v_duracao_total
  FROM servico
  WHERE id_servico = ANY(p_servicos) AND id_lojista = p_id_lojista AND status = 'Ativo';

  IF v_duracao_total = 0 THEN
    RAISE EXCEPTION 'Serviço não encontrado ou inativo';
  END IF;

  v_dia_semana := CASE EXTRACT(DOW FROM p_data)
    WHEN 0 THEN 'Domingo'
    WHEN 1 THEN 'Segunda'
    WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'
    WHEN 4 THEN 'Quinta'
    WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END::dia_semana;

  SELECT h.hr_inicio, h.hr_fim INTO v_hr_inicio, v_hr_fim
  FROM horario h
  WHERE h.id_lojista = p_id_lojista AND h.dia_semana = v_dia_semana AND h.ativo = TRUE
  LIMIT 1;

  IF v_hr_inicio IS NULL THEN
    RAISE EXCEPTION 'A loja não abre nesse dia';
  END IF;

  IF p_hora_inicio < v_hr_inicio OR (p_hora_inicio + (v_duracao_total || ' minutes')::INTERVAL) > v_hr_fim THEN
    RAISE EXCEPTION 'Horário fora do funcionamento da loja';
  END IF;

  FOREACH v_id_servico IN ARRAY p_servicos LOOP
    SELECT duracao
    INTO v_duracao
    FROM servico
    WHERE id_servico = v_id_servico AND id_lojista = p_id_lojista AND status = 'Ativo'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Serviço não encontrado ou inativo';
    END IF;

    v_preco := fn_calcular_preco_servico(v_id_servico, p_id_pet);

    SELECT EXISTS (
      SELECT 1 FROM agendamento a
      WHERE a.id_lojista = p_id_lojista
        AND a.dt_agendamento = p_data
        AND a.status NOT IN ('Cancelado')
        AND (p_id_funcionario IS NULL OR a.id_funcionario = p_id_funcionario)
        AND (
          v_cursor < (a.hr_agendamento + (
            SELECT s.duracao FROM servico s WHERE s.id_servico = a.id_servico
          ) * INTERVAL '1 minute')
          AND (v_cursor + v_duracao * INTERVAL '1 minute') > a.hr_agendamento
        )
      FOR UPDATE SKIP LOCKED
    ) INTO v_conflict;

    IF v_conflict THEN
      RAISE EXCEPTION 'Horário não disponível. Por favor, escolha outro horário.';
    END IF;

    INSERT INTO agendamento (
      id_pet, id_servico, id_cliente, id_lojista, id_funcionario,
      dt_agendamento, hr_agendamento, valor, status, obs
    )
    VALUES (
      p_id_pet, v_id_servico, p_id_cliente, p_id_lojista, p_id_funcionario,
      p_data, v_cursor, v_preco, 'Pendente', p_obs
    )
    RETURNING id_agendamento INTO v_id_agendamento;

    v_ids := array_append(v_ids, v_id_agendamento);
    v_cursor := v_cursor + (v_duracao || ' minutes')::INTERVAL;
  END LOOP;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION fn_criar_agendamento_multiplo(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_criar_agendamento_multiplo(UUID, UUID, UUID, DATE, TIME, UUID[], UUID, TEXT) TO authenticated;
