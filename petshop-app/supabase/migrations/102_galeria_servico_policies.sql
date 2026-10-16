-- ============================================================
-- PETSHOP SaaS - Migration 102: galeria do serviço visível sem login
-- ============================================================
-- Achado no teste da 101: visitante sem login (página da loja, link de
-- agendamento) recebia "permission denied for function
-- auth_admin_lojista_id" ao ler servico_foto. As policies da loja e da
-- equipe chamam auth_lojista_id(), que o papel anon não pode executar
-- (migration 090); com o índice por id_lojista, o Postgres avalia a
-- função antes do resto da condição e a consulta inteira falhava.
--
-- As policies de loja e equipe passam a valer só para quem está logado
-- (TO authenticated). A de leitura pública segue para todos.
-- ============================================================

ALTER POLICY "servico_foto: lojista ve as suas" ON servico_foto TO authenticated;
ALTER POLICY "servico_foto: funcionario ve da loja" ON servico_foto TO authenticated;
ALTER POLICY "servico_foto: lojista gerencia as suas" ON servico_foto TO authenticated;
ALTER POLICY "servico_foto: funcionario gerencia da loja" ON servico_foto TO authenticated;
