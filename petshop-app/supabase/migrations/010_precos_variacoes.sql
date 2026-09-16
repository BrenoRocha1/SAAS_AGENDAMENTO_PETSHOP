-- ============================================================
-- PETSHOP SaaS - Migration 010: Preços e Variações por porte/raça
-- ============================================================
-- Contexto: o lojista quer poder cobrar diferente pelo mesmo serviço
-- dependendo do porte e/ou raça do pet (ex.: Banho custa mais caro
-- pra um cão de porte Grande do que pra um Pequeno; um Poodle pode ter
-- preço próprio). Hoje `pet` só tem `raca` (texto livre) e `sexo` — não
-- dá pra casar automaticamente com faixas de porte/espécie.
--
-- Esta migration:
--   1. Adiciona `especie` e `porte` ao cadastro de pet (opcionais —
--      pets já cadastrados ficam sem essa informação até o dono
--      editar).
--   2. Cria `servico_variacao`: faixas de preço por espécie+porte ou
--      por espécie+raça específica, amarradas a um serviço.
--   3. Cria fn_calcular_preco_servico(id_servico, id_pet), usada pela
--      migration 011 para substituir o uso direto de servico.preco nas
--      RPCs de criar agendamento — prioridade: raça específica > porte
--      + espécie > preço base do serviço.
-- ============================================================

CREATE TYPE especie_pet AS ENUM ('Cão', 'Gato');
CREATE TYPE porte_pet AS ENUM ('Pequeno', 'Médio', 'Grande');

ALTER TABLE pet ADD COLUMN IF NOT EXISTS especie especie_pet;
ALTER TABLE pet ADD COLUMN IF NOT EXISTS porte   porte_pet;

-- ============================================================
-- TABELA: servico_variacao
-- ============================================================
CREATE TABLE IF NOT EXISTS servico_variacao (
  id_variacao   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_servico    UUID NOT NULL REFERENCES servico(id_servico) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('raca', 'porte')),
  especie       especie_pet NOT NULL,
  porte         porte_pet,             -- obrigatório quando tipo = 'porte'
  raca          TEXT CHECK (raca IS NULL OR char_length(raca) BETWEEN 1 AND 80), -- obrigatório quando tipo = 'raca'
  preco         NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT servico_variacao_tipo_coerente CHECK (
    (tipo = 'raca'  AND raca IS NOT NULL AND porte IS NULL) OR
    (tipo = 'porte' AND porte IS NOT NULL AND raca IS NULL)
  )
);

-- Evita duas faixas de "porte" iguais (mesmo serviço+espécie+porte)
CREATE UNIQUE INDEX IF NOT EXISTS idx_variacao_unica_porte
  ON servico_variacao (id_servico, especie, porte)
  WHERE tipo = 'porte';

-- Evita duas faixas de "raça" iguais (mesmo serviço+espécie+raça,
-- case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_variacao_unica_raca
  ON servico_variacao (id_servico, especie, lower(raca))
  WHERE tipo = 'raca';

CREATE INDEX IF NOT EXISTS idx_variacao_servico ON servico_variacao(id_servico);

CREATE TRIGGER trg_servico_variacao_updated_at
  BEFORE UPDATE ON servico_variacao
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE servico_variacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE servico_variacao FORCE ROW LEVEL SECURITY;

-- Mesma regra de visibilidade do serviço-pai: todo mundo vê variação
-- de serviço ativo; o lojista dono vê e gerencia todas as suas.
CREATE POLICY "servico_variacao: usuarios veem de servico ativo"
  ON servico_variacao FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM servico s WHERE s.id_servico = servico_variacao.id_servico AND s.status = 'Ativo')
  );

CREATE POLICY "servico_variacao: lojista ve todas do seu servico"
  ON servico_variacao FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM servico s WHERE s.id_servico = servico_variacao.id_servico AND s.id_lojista = auth.uid())
  );

CREATE POLICY "servico_variacao: lojista insere na sua"
  ON servico_variacao FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM servico s WHERE s.id_servico = servico_variacao.id_servico AND s.id_lojista = auth.uid())
  );

CREATE POLICY "servico_variacao: lojista deleta da sua"
  ON servico_variacao FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM servico s WHERE s.id_servico = servico_variacao.id_servico AND s.id_lojista = auth.uid())
  );

-- ============================================================
-- FUNÇÃO: calcular o preço de um serviço para um pet específico
-- Prioridade: raça específica > porte + espécie > preço base do serviço
-- ============================================================
CREATE OR REPLACE FUNCTION fn_calcular_preco_servico(
  p_id_servico  UUID,
  p_id_pet      UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

  -- Sem espécie cadastrada no pet: não dá pra casar variação nenhuma
  IF v_especie IS NULL THEN
    RETURN v_preco_base;
  END IF;

  -- 1) raça específica
  IF v_raca IS NOT NULL THEN
    SELECT preco INTO v_preco
    FROM servico_variacao
    WHERE id_servico = p_id_servico
      AND tipo = 'raca'
      AND especie = v_especie
      AND lower(raca) = lower(v_raca)
    LIMIT 1;

    IF FOUND THEN
      RETURN v_preco;
    END IF;
  END IF;

  -- 2) porte + espécie
  IF v_porte IS NOT NULL THEN
    SELECT preco INTO v_preco
    FROM servico_variacao
    WHERE id_servico = p_id_servico
      AND tipo = 'porte'
      AND especie = v_especie
      AND porte = v_porte
    LIMIT 1;

    IF FOUND THEN
      RETURN v_preco;
    END IF;
  END IF;

  -- 3) preço base
  RETURN v_preco_base;
END;
$$;

REVOKE ALL ON FUNCTION fn_calcular_preco_servico(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_calcular_preco_servico(UUID, UUID) TO authenticated;
