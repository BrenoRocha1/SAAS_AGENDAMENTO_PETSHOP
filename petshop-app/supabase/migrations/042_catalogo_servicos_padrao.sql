-- ============================================================
-- PETSHOP SaaS - Migration 042: Catálogo de Serviços Padrão
-- ============================================================
-- Contexto: o lojista precisava cadastrar cada serviço do zero.
-- Essa migration resolve isso em dois passos:
--
-- 1) Adiciona a coluna `categoria` em `servico` — agrupa os
--    serviços na vitrine pública e facilita busca/filtragem.
--    Nullable pra não quebrar serviços já cadastrados.
--
-- 2) Cria a tabela `catalogo_servico_padrao` — mantida pelo admin
--    SAIP, contém os serviços típicos de um petshop com duração
--    sugerida. O lojista importa os que quiser e define o preço.
-- ============================================================

-- 1) Coluna categoria em servico
ALTER TABLE servico
  ADD COLUMN IF NOT EXISTS categoria TEXT
  CHECK (categoria IS NULL OR categoria IN (
    'banho_tosa', 'estetica', 'veterinario', 'hotel', 'outros'
  ));

COMMENT ON COLUMN servico.categoria IS
  'Categoria do serviço para agrupamento na vitrine pública.
   Valores: banho_tosa | estetica | veterinario | hotel | outros.
   Nullable — serviços antigos sem categoria continuam funcionando.';

-- Índice para filtragem por categoria
CREATE INDEX IF NOT EXISTS idx_servico_categoria ON servico(id_lojista, categoria);

-- ============================================================
-- 2) Catálogo de serviços padrão da plataforma
-- ============================================================
CREATE TABLE IF NOT EXISTS catalogo_servico_padrao (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 100),
  descricao       TEXT CHECK (char_length(descricao) <= 500),
  duracao_sugerida INTEGER NOT NULL CHECK (duracao_sugerida > 0 AND duracao_sugerida <= 1440),
  categoria       TEXT NOT NULL CHECK (categoria IN (
    'banho_tosa', 'estetica', 'veterinario', 'hotel', 'outros'
  )),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE catalogo_servico_padrao IS
  'Serviços pré-cadastrados pela SAIP. O lojista importa os que quiser
   e define o preço. Gerenciado pelo admin da plataforma.';

-- ============================================================
-- RLS: apenas autenticados podem ler o catálogo;
-- apenas o service_role pode escrever (via painel admin).
-- ============================================================
ALTER TABLE catalogo_servico_padrao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalogo: qualquer autenticado pode ler" ON catalogo_servico_padrao;
CREATE POLICY "catalogo: qualquer autenticado pode ler"
  ON catalogo_servico_padrao FOR SELECT
  TO authenticated
  USING (ativo = TRUE);

-- ============================================================
-- 3) Dados iniciais — serviços típicos de petshop
-- ============================================================
INSERT INTO catalogo_servico_padrao (nome, descricao, duracao_sugerida, categoria) VALUES
  -- Banho & Tosa
  ('Banho',
   'Banho completo com shampoo e condicionador adequados ao pelo do pet.',
   60, 'banho_tosa'),
  ('Tosa Higiênica',
   'Tosa nas áreas íntimas, patas e focinho. Ideal para manter a higiene entre tosas completas.',
   30, 'banho_tosa'),
  ('Banho + Tosa Completa',
   'Banho completo seguido de tosa em toda a pelagem conforme raça ou pedido do tutor.',
   90, 'banho_tosa'),
  ('Banho + Tosa na Tesoura',
   'Banho completo e tosa artística na tesoura para acabamento premium.',
   120, 'banho_tosa'),
  ('Tosa na Máquina',
   'Tosa completa na máquina, padronizando o comprimento da pelagem.',
   60, 'banho_tosa'),
  ('Tosa do Focinho',
   'Acabamento no focinho para melhor aparência e conforto do pet.',
   20, 'banho_tosa'),

  -- Estética
  ('Hidratação da Pelagem',
   'Tratamento hidratante profundo para recuperar o brilho e a maciez do pelo.',
   60, 'estetica'),
  ('Escovação Dentária',
   'Escovação com pasta veterinária para prevenir tártaro e mau hálito.',
   20, 'estetica'),
  ('Limpeza de Ouvidos',
   'Limpeza delicada dos ouvidos com produto veterinário para prevenção de infecções.',
   15, 'estetica'),
  ('Corte de Unhas',
   'Corte e lixamento das unhas para evitar problemas na locomoção.',
   15, 'estetica'),
  ('Tingimento de Pelagem',
   'Coloração temporária e pet-friendly para looks especiais.',
   90, 'estetica'),

  -- Veterinário
  ('Consulta Veterinária',
   'Consulta clínica geral com médico veterinário.',
   45, 'veterinario'),
  ('Vacinação',
   'Aplicação de vacinas conforme calendário de imunização do pet.',
   15, 'veterinario'),
  ('Vermifugação',
   'Aplicação ou fornecimento de vermífugo preventivo.',
   10, 'veterinario'),
  ('Antipulgas e Carrapatos',
   'Aplicação de produto antiparasitário tópico ou oral.',
   15, 'veterinario'),
  ('Microchip',
   'Implante de microchip de identificação permanente.',
   20, 'veterinario'),

  -- Hotel & Creche
  ('Hotelzinho (diária)',
   'Hospedagem de um dia completo (24h) com alimentação, espaço de lazer e cuidados básicos.',
   1440, 'hotel'),
  ('Creche (meio período)',
   'Socialização e cuidados durante meio período (manhã ou tarde).',
   240, 'hotel'),
  ('Creche (dia inteiro)',
   'Socialização e cuidados durante o dia todo, com alimentação.',
   480, 'hotel'),

  -- Outros
  ('Adestramento (sessão)',
   'Sessão de treinamento comportamental com adestrador profissional.',
   60, 'outros'),
  ('Fisioterapia Veterinária',
   'Sessão de fisioterapia para recuperação ou bem-estar do pet.',
   45, 'outros')

ON CONFLICT DO NOTHING;
