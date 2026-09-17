-- ============================================================
-- PETSHOP SaaS - Migration 029: Equipe com administradores
-- ============================================================
-- Contexto: "Funcionários" vira "Equipe" (só na URL/rótulo — a tabela
-- continua se chamando `funcionario`, não vale a pena renomear tabela +
-- todas as FKs/policies por causa de um nome de tela). Duas permissões
-- novas na tabela `funcionario`:
--
--   • pode_gerenciar_clientes_pets: só VISUALIZAR as telas de Clientes e
--     Pets (sem criar/editar/excluir) — RLS de SELECT pra essas duas
--     tabelas já é ampla o bastante pra qualquer funcionário (migrations
--     006/028, pensada pra alimentar o seletor de tutor/pet da Agenda),
--     então não precisa de policy nova aqui — o corte é só de ROTA
--     (middleware + página), igual já foi feito pra Agenda/Serviços.
--
--   • acesso_total: "administrador" — mesmo acesso do lojista em TODAS
--     as telas (Relatórios, Configurações, Perfil da Loja, Equipe
--     inclusive convidar/editar membros comuns), MENOS uma coisa: nunca
--     pode conceder acesso_total pra outra pessoa. Só quem é o
--     responsável pela conta (o próprio lojista) pode criar outro
--     administrador — daí o trigger no fim deste arquivo, que é a
--     garantia de verdade (funciona mesmo se algum código no app tiver
--     bug ou usar o client admin/service_role, que não passa por RLS).
--
-- As ações do app que hoje são "só lojista" (perfil da loja, logo,
-- horários, link/slug, janela de agendamento, ligar/desligar
-- kanban/agendamento online, excluir serviço, cadastrar/editar cliente e
-- pet, convidar/editar membro da equipe) passam a aceitar também um
-- funcionário com acesso_total — usando o client admin (service_role)
-- pra gravar depois de confirmado em código que quem chamou tem
-- acesso_total, já que nenhuma dessas tabelas tem policy de escrita pra
-- funcionário (só pra lojista). As RPCs SECURITY DEFINER abaixo,
-- diferente disso, têm a própria checagem interna — são atualizadas pra
-- usar auth_lojista_id() (já existe desde a migration 006) em vez de
-- auth.uid() = p_id_lojista, que nunca passava pra um funcionário.
-- ============================================================

-- ============================================================
-- 1) Novas colunas em `funcionario`
-- ============================================================
ALTER TABLE funcionario ADD COLUMN IF NOT EXISTS pode_gerenciar_clientes_pets BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE funcionario ADD COLUMN IF NOT EXISTS acesso_total BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 2) Trigger: só o lojista (auth_role() = 'lojista') pode gravar uma
--    linha de funcionario com acesso_total = TRUE — em INSERT ou UPDATE,
--    não importa qual client fez a chamada (até o service_role, que
--    ignora RLS, ainda dispara triggers).
-- ============================================================
CREATE OR REPLACE FUNCTION fn_bloquear_acesso_total_por_funcionario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.acesso_total = TRUE AND auth_role() != 'lojista' THEN
    RAISE EXCEPTION 'Apenas o responsável pela conta pode conceder acesso total (administrador)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_funcionario_bloqueia_acesso_total ON funcionario;
CREATE TRIGGER trg_funcionario_bloqueia_acesso_total
  BEFORE INSERT OR UPDATE ON funcionario
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_acesso_total_por_funcionario();

-- ============================================================
-- 3) fn_registrar_funcionario — nova assinatura (2 parâmetros a mais),
--    aceita lojista OU funcionário com acesso_total como quem convida.
-- ============================================================
DROP FUNCTION IF EXISTS fn_registrar_funcionario(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN);

CREATE FUNCTION fn_registrar_funcionario(
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

  IF auth_lojista_id() != p_id_lojista THEN
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

-- ============================================================
-- 4) fn_registrar_cliente_lojista / fn_editar_cliente_lojista /
--    fn_editar_pet_lojista — mesma troca de auth.uid() por
--    auth_lojista_id(), sem mudar assinatura (CREATE OR REPLACE basta).
--    Ficam disponíveis pro lojista e pra um funcionário com acesso_total
--    (nunca pra quem só tem "gerenciar clientes e pets", que é só
--    visualização).
-- ============================================================
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

  IF auth_lojista_id() != p_id_lojista THEN
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
  IF auth_lojista_id() != p_id_lojista THEN
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
  IF auth_lojista_id() != p_id_lojista THEN
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

-- ============================================================
-- 5) fn_criar_pet_lojista (migration 028) — amplia a permissão de quem
--    pode criar o pet embutido no fluxo de "Novo Agendamento": antes só
--    pode_gerenciar_agenda, agora também acesso_total.
-- ============================================================
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
  IF auth_lojista_id() != p_id_lojista THEN
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

-- ============================================================
-- 6) fn_buscar_clientes_lojista / fn_buscar_pets_lojista — telas de
--    Clientes e Pets (VISUALIZAÇÃO), liberadas agora pra um funcionário
--    com pode_gerenciar_clientes_pets (ou acesso_total). Mesma troca de
--    auth.uid() por auth_lojista_id(), assinatura idêntica às das
--    migrations 019/027 (CREATE OR REPLACE, sem precisar de DROP).
-- ============================================================
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
  IF auth_lojista_id() != p_id_lojista THEN
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
  IF auth_lojista_id() != p_id_lojista THEN
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
