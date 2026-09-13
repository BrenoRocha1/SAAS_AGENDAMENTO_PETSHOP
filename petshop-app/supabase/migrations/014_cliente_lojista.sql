-- ============================================================
-- PETSHOP SaaS - Migration 014: Lojista cadastra cliente direto
-- ============================================================
-- Contexto: até aqui, um cliente só existia se ELE MESMO se cadastrasse
-- pelo /cadastro (signUp) e agendasse pelo menos uma vez. Não existia
-- nenhum caminho pro LOJISTA cadastrar um cliente (ex.: walk-in, cliente
-- que liga por telefone e não usa o app) — nem RPC, nem policy de INSERT
-- em `cliente` pra ninguém além do próprio usuário (migration 002).
--
-- Esta migration resolve dois problemas de uma vez:
--
-- 1) fn_registrar_cliente_lojista: RPC SECURITY DEFINER que o lojista
--    chama depois de criar a conta Auth do cliente (mesmo padrão de
--    fn_registrar_funcionario, migration 007).
--
-- 2) cliente_lojista: como a tela /lojista/clientes e a policy de SELECT
--    em `cliente` (migration 002) enxergam clientes só através de quem
--    JÁ tem agendamento com o lojista, um cliente cadastrado agora do
--    zero (sem nenhum agendamento ainda) ficaria invisível pro lojista
--    que acabou de cadastrá-lo, e fn_criar_agendamento_lojista (migration
--    008/011) bloquearia o PRIMEIRO agendamento dele ("ainda não possui
--    histórico"). Esta tabela registra explicitamente "este cliente é
--    conhecido por este lojista" — populada automaticamente por um
--    trigger em todo INSERT de agendamento (cobre o fluxo antigo: cliente
--    se auto-cadastra e agenda) e diretamente por fn_registrar_cliente_lojista
--    (cobre o fluxo novo: lojista cadastra o cliente antes de qualquer
--    agendamento existir).
-- ============================================================

-- ============================================================
-- TABELA: cliente_lojista (vínculo "lojista conhece este cliente")
-- ============================================================
CREATE TABLE IF NOT EXISTS cliente_lojista (
  id_cliente  UUID NOT NULL REFERENCES cliente(id_cliente) ON DELETE CASCADE,
  id_lojista  UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id_cliente, id_lojista)
);

CREATE INDEX IF NOT EXISTS idx_cliente_lojista_lojista ON cliente_lojista(id_lojista);

ALTER TABLE cliente_lojista ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_lojista FORCE ROW LEVEL SECURITY;

-- Só o próprio lojista lê os vínculos dele. Sem policy de INSERT/UPDATE/
-- DELETE pra `authenticated` — só é escrito via SECURITY DEFINER (trigger
-- e a RPC abaixo), nunca direto pela API.
CREATE POLICY "cliente_lojista: lojista ve os seus"
  ON cliente_lojista FOR SELECT
  USING (id_lojista = auth.uid() AND auth_role() = 'lojista');

-- Backfill: todo par (cliente, lojista) que já tem agendamento vira um
-- vínculo retroativo, senão clientes antigos "desapareceriam" da regra
-- nova.
INSERT INTO cliente_lojista (id_cliente, id_lojista)
SELECT DISTINCT id_cliente, id_lojista FROM agendamento
ON CONFLICT DO NOTHING;

-- Todo agendamento novo (criado pelo cliente ou pelo lojista) também
-- gera/garante o vínculo — assim a regra fica sempre consistente sem
-- precisar tocar nas RPCs de agendamento existentes.
CREATE OR REPLACE FUNCTION fn_vincular_cliente_lojista()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO cliente_lojista (id_cliente, id_lojista)
  VALUES (NEW.id_cliente, NEW.id_lojista)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_vincula_cliente ON agendamento;
CREATE TRIGGER trg_agendamento_vincula_cliente
  AFTER INSERT ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_vincular_cliente_lojista();

-- Policy adicional de SELECT em `cliente`: além de "já tem agendamento"
-- (migration 002, continua valendo), o lojista também enxerga quem ele
-- cadastrou direto (via cliente_lojista) mesmo sem agendamento ainda.
-- Policies de SELECT no Postgres são permissivas por padrão (somam com
-- OR), então isso só ADICIONA visibilidade, não tira nada de ninguém.
CREATE POLICY "cliente: lojista ve vinculados"
  ON cliente FOR SELECT
  USING (
    auth_role() = 'lojista'
    AND EXISTS (
      SELECT 1 FROM cliente_lojista cl
      WHERE cl.id_cliente = cliente.id_cliente AND cl.id_lojista = auth.uid()
    )
  );

-- ============================================================
-- FUNÇÃO: fn_registrar_cliente_lojista
-- ============================================================
-- Mesmo padrão de segurança de fn_registrar_funcionario: só o próprio
-- lojista autenticado pode chamar, valida os dados de novo (defense in
-- depth além do Zod), confere duplicidade de e-mail/CPF nas 3 tabelas
-- de usuário, insere o cliente e já grava o vínculo em cliente_lojista
-- (pra aparecer na lista e permitir o primeiro agendamento manual).
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

  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado: apenas o lojista pode cadastrar clientes';
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

-- ============================================================
-- fn_criar_agendamento_lojista: relaxa o check de "histórico" pra usar
-- cliente_lojista em vez de agendamento — senão o PRIMEIRO agendamento
-- de um cliente recém-cadastrado pelo lojista continuaria bloqueado.
-- Mesma assinatura da migration 011, resto do corpo idêntico.
-- ============================================================
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
  IF auth.uid() != p_id_lojista THEN
    RAISE EXCEPTION 'Acesso não autorizado';
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

  -- Antes checava EXISTS em `agendamento` (impossível pro primeiro
  -- agendamento de um cliente novo). Agora checa cliente_lojista, que
  -- fn_registrar_cliente_lojista já preenche na hora do cadastro.
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
