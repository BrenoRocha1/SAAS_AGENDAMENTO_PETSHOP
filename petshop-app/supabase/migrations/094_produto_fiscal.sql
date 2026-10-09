-- ============================================================
-- PETSHOP SaaS - Migration 094: informações fiscais do produto
-- ============================================================
-- Base para a futura integração fiscal (NFC-e / NF-e): cada produto pode
-- guardar NCM, CEST, CFOP, origem da mercadoria, CST/CSOSN e o código de
-- barras (GTIN/EAN). Fica numa tabela à parte, como o custo (migration 062):
-- `produto` tem leitura pública (agendamento online) e isto é só da equipe.
-- O código de barras também é usado pelo Caixa (PDV) para achar o produto
-- com o leitor.
-- ============================================================

CREATE TABLE IF NOT EXISTS produto_fiscal (
  id_produto     UUID PRIMARY KEY REFERENCES produto(id_produto) ON DELETE CASCADE,
  id_lojista     UUID NOT NULL REFERENCES lojista(id_lojista) ON DELETE CASCADE,
  codigo_barras  TEXT CHECK (codigo_barras ~ '^(\d{8}|\d{12}|\d{13}|\d{14})$'),
  ncm            TEXT CHECK (ncm ~ '^\d{8}$'),
  cest           TEXT CHECK (cest ~ '^\d{7}$'),
  cfop           TEXT CHECK (cfop ~ '^\d{4}$'),
  -- 0 = nacional ... 8 (tabela de origem da mercadoria do ICMS).
  origem         SMALLINT CHECK (origem BETWEEN 0 AND 8),
  cst_csosn      TEXT CHECK (cst_csosn ~ '^\d{2,3}$'),
  atualizado_por UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produto_fiscal_lojista ON produto_fiscal(id_lojista);
-- O mesmo código de barras não pode estar em dois produtos da mesma loja.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_fiscal_codigo_barras
  ON produto_fiscal(id_lojista, codigo_barras) WHERE codigo_barras IS NOT NULL;

ALTER TABLE produto_fiscal ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_fiscal FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produto_fiscal: equipe de produtos ve" ON produto_fiscal;
CREATE POLICY "produto_fiscal: equipe de produtos ve" ON produto_fiscal
  FOR SELECT USING (fn_produtos_da_loja(id_lojista));

-- Grava (ou apaga, se tudo vier vazio) as informações fiscais de um produto.
-- p_dados: { codigo_barras, ncm, cest, cfop, origem, cst_csosn } — vazio/null
-- = sem a informação.
CREATE OR REPLACE FUNCTION fn_salvar_fiscal_produto(p_id_produto UUID, p_dados JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_loja    UUID;
  v_barras  TEXT := NULLIF(regexp_replace(COALESCE(p_dados ->> 'codigo_barras', ''), '\D', '', 'g'), '');
  v_ncm     TEXT := NULLIF(regexp_replace(COALESCE(p_dados ->> 'ncm', ''), '\D', '', 'g'), '');
  v_cest    TEXT := NULLIF(regexp_replace(COALESCE(p_dados ->> 'cest', ''), '\D', '', 'g'), '');
  v_cfop    TEXT := NULLIF(regexp_replace(COALESCE(p_dados ->> 'cfop', ''), '\D', '', 'g'), '');
  v_cst     TEXT := NULLIF(regexp_replace(COALESCE(p_dados ->> 'cst_csosn', ''), '\D', '', 'g'), '');
  v_origem  SMALLINT := NULLIF(p_dados ->> 'origem', '')::SMALLINT;
BEGIN
  SELECT id_lojista INTO v_loja FROM produto WHERE id_produto = p_id_produto;
  IF v_loja IS NULL OR NOT fn_produtos_da_loja(v_loja) THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  IF v_barras IS NOT NULL AND EXISTS (
    SELECT 1 FROM produto_fiscal f
    JOIN produto p ON p.id_produto = f.id_produto
    WHERE f.id_lojista = v_loja AND f.codigo_barras = v_barras AND f.id_produto <> p_id_produto
      AND p.excluido_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Este código de barras já está em outro produto da loja';
  END IF;

  IF v_barras IS NULL AND v_ncm IS NULL AND v_cest IS NULL AND v_cfop IS NULL AND v_origem IS NULL AND v_cst IS NULL THEN
    DELETE FROM produto_fiscal WHERE id_produto = p_id_produto;
    RETURN;
  END IF;

  -- Produto excluído que tinha o mesmo código: libera o código para o novo.
  IF v_barras IS NOT NULL THEN
    UPDATE produto_fiscal SET codigo_barras = NULL
    WHERE id_lojista = v_loja AND codigo_barras = v_barras AND id_produto <> p_id_produto;
  END IF;

  INSERT INTO produto_fiscal (id_produto, id_lojista, codigo_barras, ncm, cest, cfop, origem, cst_csosn, atualizado_por, updated_at)
  VALUES (p_id_produto, v_loja, v_barras, v_ncm, v_cest, v_cfop, v_origem, v_cst, auth.uid(), NOW())
  ON CONFLICT (id_produto) DO UPDATE SET
    codigo_barras = EXCLUDED.codigo_barras,
    ncm = EXCLUDED.ncm,
    cest = EXCLUDED.cest,
    cfop = EXCLUDED.cfop,
    origem = EXCLUDED.origem,
    cst_csosn = EXCLUDED.cst_csosn,
    atualizado_por = EXCLUDED.atualizado_por,
    updated_at = NOW();
END;
$$;
REVOKE ALL ON FUNCTION fn_salvar_fiscal_produto(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_salvar_fiscal_produto(UUID, JSONB) TO authenticated;
