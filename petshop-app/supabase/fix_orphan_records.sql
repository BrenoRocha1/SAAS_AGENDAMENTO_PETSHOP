-- ============================================================
-- LIMPEZA DE REGISTROS ORFAOS
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Verificar registros na tabela lojista sem usuario no Auth
SELECT 
  l.id_lojista,
  l.email,
  l.nome_loja,
  l.created_at,
  u.id AS auth_id
FROM lojista l
LEFT JOIN auth.users u ON u.id = l.id_lojista
WHERE u.id IS NULL;

-- 2. Se apareceu algum registro acima, deletar os orfaos:
DELETE FROM lojista
WHERE id_lojista NOT IN (SELECT id FROM auth.users);

-- 3. Confirmar que ficou limpo
SELECT COUNT(*) AS lojistas_sem_auth FROM lojista
WHERE id_lojista NOT IN (SELECT id FROM auth.users);
