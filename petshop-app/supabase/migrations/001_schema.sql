-- ============================================================
-- PETSHOP SaaS - Migration 001: Schema Completo
-- Autor: Sistema gerado
-- Segurança: Nível enterprise (Itaú-grade)
-- ============================================================

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Extensão para criptografia
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE sexo_pet AS ENUM ('Macho', 'Fêmea');

CREATE TYPE status_servico AS ENUM ('Ativo', 'Inativo');

CREATE TYPE status_agendamento AS ENUM (
  'Pendente',
  'Confirmado',
  'Cancelado',
  'Concluído'
);

CREATE TYPE dia_semana AS ENUM (
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo'
);

CREATE TYPE role_usuario AS ENUM ('cliente', 'lojista');

-- ============================================================
-- TABELA: perfil_usuario
-- Mapeada ao auth.users do Supabase
-- ============================================================
CREATE TABLE IF NOT EXISTS perfil_usuario (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          role_usuario NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS cliente (
  id_cliente    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
  cpf           TEXT NOT NULL UNIQUE CHECK (cpf ~ '^\d{11}$'),
  email         TEXT NOT NULL UNIQUE CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  telefone      TEXT NOT NULL CHECK (telefone ~ '^\d{10,11}$'),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: lojista
-- ============================================================
CREATE TABLE IF NOT EXISTS lojista (
  id_lojista    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_loja     TEXT NOT NULL CHECK (char_length(nome_loja) BETWEEN 2 AND 150),
  email         TEXT NOT NULL UNIQUE CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  telefone      TEXT NOT NULL CHECK (telefone ~ '^\d{10,11}$'),
  descricao     TEXT,
  endereco      TEXT,
  cidade        TEXT,
  estado        CHAR(2),
  cep           TEXT CHECK (cep ~ '^\d{8}$'),
  logo_url      TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: pet
-- ============================================================
CREATE TABLE IF NOT EXISTS pet (
  id_pet        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_cliente    UUID NOT NULL REFERENCES cliente(id_cliente) ON DELETE CASCADE,
  nome          TEXT NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 80),
  raca          TEXT NOT NULL CHECK (char_length(raca) BETWEEN 1 AND 80),
  sexo          sexo_pet NOT NULL,
  dt_nasc       DATE NOT NULL CHECK (dt_nasc <= CURRENT_DATE),
  peso          NUMERIC(5,2) CHECK (peso > 0 AND peso < 200),
  obs           TEXT CHECK (char_length(obs) <= 500),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: servico
-- ============================================================
CREATE TABLE IF NOT EXISTS servico (
  id_servico    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista    UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  nome          TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 100),
  descricao     TEXT CHECK (char_length(descricao) <= 500),
  preco         NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  duracao       INTEGER NOT NULL CHECK (duracao > 0 AND duracao <= 480), -- em minutos, máx 8h
  status        status_servico NOT NULL DEFAULT 'Ativo',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: horario
-- Horários de funcionamento por lojista e dia da semana
-- ============================================================
CREATE TABLE IF NOT EXISTS horario (
  id_horario    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_lojista    UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  dia_semana    dia_semana NOT NULL,
  hr_inicio     TIME NOT NULL,
  hr_fim        TIME NOT NULL,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Garantir que hr_fim > hr_inicio
  CONSTRAINT horario_valido CHECK (hr_fim > hr_inicio),
  -- Evitar duplicata de dia para o mesmo lojista
  UNIQUE (id_lojista, dia_semana)
);

-- ============================================================
-- TABELA: agendamento
-- ============================================================
CREATE TABLE IF NOT EXISTS agendamento (
  id_agendamento  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_pet          UUID NOT NULL REFERENCES pet(id_pet) ON DELETE RESTRICT,
  id_servico      UUID NOT NULL REFERENCES servico(id_servico) ON DELETE RESTRICT,
  id_cliente      UUID NOT NULL REFERENCES cliente(id_cliente) ON DELETE RESTRICT,
  id_lojista      UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE RESTRICT,
  dt_agendamento  DATE NOT NULL CHECK (dt_agendamento >= CURRENT_DATE),
  hr_agendamento  TIME NOT NULL,
  valor           NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  status          status_agendamento NOT NULL DEFAULT 'Pendente',
  obs             TEXT CHECK (char_length(obs) <= 500),
  cancelado_por   TEXT, -- 'cliente' ou 'lojista'
  motivo_cancelamento TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: audit_log
-- Imutável — registra todas as mudanças em agendamentos
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id_log          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tabela          TEXT NOT NULL,
  operacao        TEXT NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
  id_registro     UUID NOT NULL,
  id_usuario      UUID REFERENCES auth.users(id),
  dados_antes     JSONB,
  dados_depois    JSONB,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- audit_log não permite UPDATE ou DELETE (imutabilidade)
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- ============================================================
-- ÍNDICES — Performance crítica para RLS
-- ============================================================

-- cliente
CREATE INDEX IF NOT EXISTS idx_cliente_email ON cliente(email);
CREATE INDEX IF NOT EXISTS idx_cliente_cpf   ON cliente(cpf);

-- pet
CREATE INDEX IF NOT EXISTS idx_pet_cliente ON pet(id_cliente);

-- servico
CREATE INDEX IF NOT EXISTS idx_servico_lojista ON servico(id_lojista);
CREATE INDEX IF NOT EXISTS idx_servico_status   ON servico(id_lojista, status);

-- horario
CREATE INDEX IF NOT EXISTS idx_horario_lojista ON horario(id_lojista);

-- agendamento — queries mais frequentes
CREATE INDEX IF NOT EXISTS idx_agendamento_cliente  ON agendamento(id_cliente);
CREATE INDEX IF NOT EXISTS idx_agendamento_lojista  ON agendamento(id_lojista);
CREATE INDEX IF NOT EXISTS idx_agendamento_pet      ON agendamento(id_pet);
CREATE INDEX IF NOT EXISTS idx_agendamento_status   ON agendamento(id_lojista, status);
CREATE INDEX IF NOT EXISTS idx_agendamento_data     ON agendamento(id_lojista, dt_agendamento);
-- Índice único para prevenir double-booking (exceto agendamentos cancelados)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamento_unique_slot
  ON agendamento(id_lojista, dt_agendamento, hr_agendamento)
  WHERE status NOT IN ('Cancelado');

-- audit_log
CREATE INDEX IF NOT EXISTS idx_audit_registro  ON audit_log(id_registro);
CREATE INDEX IF NOT EXISTS idx_audit_usuario   ON audit_log(id_usuario);
CREATE INDEX IF NOT EXISTS idx_audit_tabela    ON audit_log(tabela, created_at DESC);

-- ============================================================
-- FUNÇÃO: atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers de updated_at
CREATE TRIGGER trg_cliente_updated_at
  BEFORE UPDATE ON cliente
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_lojista_updated_at
  BEFORE UPDATE ON lojista
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_pet_updated_at
  BEFORE UPDATE ON pet
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_servico_updated_at
  BEFORE UPDATE ON servico
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_horario_updated_at
  BEFORE UPDATE ON horario
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_agendamento_updated_at
  BEFORE UPDATE ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- FUNÇÃO: audit trigger para agendamento
-- ============================================================
CREATE OR REPLACE FUNCTION fn_audit_agendamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tabela, operacao, id_registro, id_usuario, dados_depois)
    VALUES ('agendamento', 'INSERT', NEW.id_agendamento, auth.uid(), to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (tabela, operacao, id_registro, id_usuario, dados_antes, dados_depois)
    VALUES ('agendamento', 'UPDATE', NEW.id_agendamento, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (tabela, operacao, id_registro, id_usuario, dados_antes)
    VALUES ('agendamento', 'DELETE', OLD.id_agendamento, auth.uid(), to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_agendamento
  AFTER INSERT OR UPDATE OR DELETE ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_audit_agendamento();

-- ============================================================
-- FUNÇÃO: criar perfil automaticamente ao registrar usuário
-- ============================================================
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO perfil_usuario (id, role)
  VALUES (
    NEW.id,
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::role_usuario,
      'cliente'
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();
