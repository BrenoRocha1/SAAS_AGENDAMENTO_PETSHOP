-- ============================================================
-- PETSHOP SaaS - Migration 085: foto da conta do cliente
-- ============================================================
-- O cliente passa a poder colocar uma foto na própria conta (no site, em
-- Meu Perfil, e no app). É só uma coluna nova, vazia para todo mundo:
-- nada muda para quem não escolher uma foto — continuam as iniciais.
--
-- O arquivo fica na pasta do próprio cliente no bucket 'fotos-pet'
-- (migration 026), com o nome fixo "perfil": as regras daquele bucket já
-- deixam cada cliente gravar e apagar só dentro da pasta dele, então não
-- precisa de bucket nem de regra nova. Excluir a conta já apaga a pasta
-- inteira (migration 072), a foto junto.
--
-- Quem grava a coluna é o próprio cliente, pela regra de sempre
-- ("cliente: update proprio", migration 002).
-- ============================================================

ALTER TABLE cliente ADD COLUMN IF NOT EXISTS foto_url TEXT;
