-- ============================================================
-- Teste da migration 100 (bloquear cancelamento depois de aceito)
-- ============================================================
-- Rode inteiro no SQL Editor do Supabase. Nada fica gravado: cada
-- cenário roda num bloco que termina sempre num erro proposital (RAISE),
-- e o erro desfaz tudo o que o bloco mudou — só o resultado é anotado
-- numa tabela temporária, que some quando a conexão fecha.
--
-- Usa um agendamento real ainda por vir (Pendente ou Aceito) e, em cada
-- cenário, entra como o cliente, a loja ou outra conta (o mesmo auth.uid()
-- que o site e o app mandam) e chama o que eles chamam. Cada cenário
-- começa do zero. O resultado sai numa tabela: confira "esperado" x
-- "obtido".
-- ============================================================

DROP TABLE IF EXISTS pg_temp.resultado;
CREATE TEMP TABLE resultado (n INT, cenario TEXT, esperado TEXT, obtido TEXT);

DO $$
DECLARE
  v_ag          UUID;
  v_cli         UUID;
  v_loja        UUID;
  v_outro_cli   UUID;
  v_outra_loja  UUID;
  v_st          TEXT;
  n             INT;
BEGIN
  SELECT id_agendamento, id_cliente, id_lojista INTO v_ag, v_cli, v_loja
  FROM agendamento
  WHERE id_cliente IS NOT NULL AND status IN ('Pendente', 'Confirmado')
    AND (dt_agendamento + hr_agendamento) > (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 hour'
  ORDER BY dt_agendamento
  LIMIT 1;
  IF v_ag IS NULL THEN RAISE EXCEPTION 'Nenhum agendamento futuro (Pendente/Aceito) para testar'; END IF;
  SELECT id_cliente INTO v_outro_cli FROM cliente WHERE id_cliente <> v_cli LIMIT 1;
  SELECT id_lojista INTO v_outra_loja FROM lojista WHERE id_lojista <> v_loja LIMIT 1;

  -- 1) Desligada + aceito: cliente cancela (comportamento de antes)
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = FALSE WHERE id_lojista = v_loja;
    UPDATE agendamento SET status = 'Confirmado' WHERE id_agendamento = v_ag;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM fn_cancelar_agendamento(v_ag, 'teste');
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT status INTO v_st FROM agendamento WHERE id_agendamento = v_ag;
    RAISE EXCEPTION 'status final: %', v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (1, 'Desligada + aceito: cliente cancela', 'status final: Cancelado', SQLERRM);
  END;

  -- 2) Ligada + pendente: cliente cancela
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = TRUE WHERE id_lojista = v_loja;
    UPDATE agendamento SET status = 'Pendente' WHERE id_agendamento = v_ag;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM fn_cancelar_agendamento(v_ag, 'teste');
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT status INTO v_st FROM agendamento WHERE id_agendamento = v_ag;
    RAISE EXCEPTION 'status final: %', v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (2, 'Ligada + pendente: cliente cancela', 'status final: Cancelado', SQLERRM);
  END;

  -- 3) Ligada + aceito: cliente não cancela
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = TRUE WHERE id_lojista = v_loja;
    UPDATE agendamento SET status = 'Confirmado' WHERE id_agendamento = v_ag;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM fn_cancelar_agendamento(v_ag, 'teste');
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT status INTO v_st FROM agendamento WHERE id_agendamento = v_ag;
    RAISE EXCEPTION 'status final: %', v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (3, 'Ligada + aceito: cliente tenta cancelar', 'erro: já foi confirmado pela loja', SQLERRM);
  END;

  -- 4) Ligada + aceito: cliente tenta mudar o status direto pela API
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = TRUE WHERE id_lojista = v_loja;
    UPDATE agendamento SET status = 'Confirmado' WHERE id_agendamento = v_ag;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    UPDATE agendamento SET status = 'Cancelado', cancelado_por = 'cliente' WHERE id_agendamento = v_ag;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT status INTO v_st FROM agendamento WHERE id_agendamento = v_ag;
    RAISE EXCEPTION 'linhas: %, status final: %', n, v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (4, 'Ligada + aceito: cliente faz UPDATE direto pela API', 'linhas: 0, status final: Confirmado', SQLERRM);
  END;

  -- 5) Ligada + aceito: a loja cancela normalmente
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = TRUE WHERE id_lojista = v_loja;
    UPDATE agendamento SET status = 'Confirmado' WHERE id_agendamento = v_ag;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_loja, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM fn_cancelar_agendamento(v_ag, 'teste');
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT status INTO v_st FROM agendamento WHERE id_agendamento = v_ag;
    RAISE EXCEPTION 'status final: %', v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (5, 'Ligada + aceito: loja cancela', 'status final: Cancelado', SQLERRM);
  END;

  -- 6) Outro cliente não cancela agendamento que não é dele
  BEGIN
    UPDATE agendamento SET status = 'Pendente' WHERE id_agendamento = v_ag;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outro_cli, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM fn_cancelar_agendamento(v_ag, 'teste');
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT status INTO v_st FROM agendamento WHERE id_agendamento = v_ag;
    RAISE EXCEPTION 'status final: %', v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (6, 'Outro cliente tenta cancelar', 'erro: Acesso não autorizado', SQLERRM);
  END;

  -- 7) Cliente não muda a configuração da loja
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = FALSE WHERE id_lojista = v_loja;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    UPDATE lojista SET bloquear_cancelamento_aceito = TRUE WHERE id_lojista = v_loja;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT bloquear_cancelamento_aceito::text INTO v_st FROM lojista WHERE id_lojista = v_loja;
    RAISE EXCEPTION 'linhas: %, valor final: %', n, v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (7, 'Cliente tenta mudar a configuração da loja', 'linhas: 0, valor final: false', SQLERRM);
  END;

  -- 8) Outra loja não muda a configuração desta
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = FALSE WHERE id_lojista = v_loja;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outra_loja, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    UPDATE lojista SET bloquear_cancelamento_aceito = TRUE WHERE id_lojista = v_loja;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT bloquear_cancelamento_aceito::text INTO v_st FROM lojista WHERE id_lojista = v_loja;
    RAISE EXCEPTION 'linhas: %, valor final: %', n, v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (8, 'Outra loja tenta mudar a configuração', 'linhas: 0, valor final: false', SQLERRM);
  END;

  -- 9) O dono liga e o valor fica gravado
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = FALSE WHERE id_lojista = v_loja;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_loja, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    UPDATE lojista SET bloquear_cancelamento_aceito = TRUE WHERE id_lojista = v_loja;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT bloquear_cancelamento_aceito::text INTO v_st FROM lojista WHERE id_lojista = v_loja;
    RAISE EXCEPTION 'linhas: %, valor final: %', n, v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (9, 'Dono liga a configuração', 'linhas: 1, valor final: true', SQLERRM);
  END;

  -- 10) Liga e desliga de novo: o cliente volta a cancelar o aceito
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = TRUE WHERE id_lojista = v_loja;
    UPDATE agendamento SET status = 'Confirmado' WHERE id_agendamento = v_ag;
    UPDATE lojista SET bloquear_cancelamento_aceito = FALSE WHERE id_lojista = v_loja;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM fn_cancelar_agendamento(v_ag, 'teste');
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT status INTO v_st FROM agendamento WHERE id_agendamento = v_ag;
    RAISE EXCEPTION 'status final: %', v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (10, 'Desligada de novo + aceito: cliente cancela', 'status final: Cancelado', SQLERRM);
  END;

  -- 11) Ligada: a loja segue o fluxo normal (inicia o atendimento)
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = TRUE WHERE id_lojista = v_loja;
    UPDATE agendamento SET status = 'Confirmado' WHERE id_agendamento = v_ag;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_loja, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    UPDATE agendamento SET status = 'Em andamento' WHERE id_agendamento = v_ag;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT status INTO v_st FROM agendamento WHERE id_agendamento = v_ag;
    RAISE EXCEPTION 'linhas: %, status final: %', n, v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (11, 'Ligada: loja inicia o atendimento', 'linhas: 1, status final: Em andamento', SQLERRM);
  END;

  -- 12) A regra antiga segue valendo: horário passado, cliente não cancela
  BEGIN
    UPDATE lojista SET bloquear_cancelamento_aceito = FALSE WHERE id_lojista = v_loja;
    UPDATE agendamento SET status = 'Pendente', dt_agendamento = CURRENT_DATE - 1 WHERE id_agendamento = v_ag;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM fn_cancelar_agendamento(v_ag, 'teste');
    PERFORM set_config('role', 'postgres', TRUE);
    SELECT status INTO v_st FROM agendamento WHERE id_agendamento = v_ag;
    RAISE EXCEPTION 'status final: %', v_st;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resultado VALUES (12, 'Desligada + horário passado: cliente', 'erro: o horário já passou', SQLERRM);
  END;
END $$;

SELECT n, cenario, esperado, obtido FROM resultado ORDER BY n;
